// Parser MIDI - Standard MIDI File tipo 0 y 1
// Lee archivos binarios y construye el modelo interno

import {
  MidiProject, TrackInfo, MidiNote, TempoEvent, TimeSignatureEvent,
  KeySignatureEvent, ControlChange, PitchBend, DiagnosticIssue, MissingInfo
} from './model';

let noteIdCounter = 0;
function nextNoteId(): string {
  return `note_${++noteIdCounter}`;
}

let issueIdCounter = 0;
function nextIssueId(): string {
  return `issue_${++issueIdCounter}`;
}

class MidiReader {
  private data: DataView;
  private pos: number;

  constructor(buffer: ArrayBuffer) {
    this.data = new DataView(buffer);
    this.pos = 0;
  }

  readUint8(): number {
    const val = this.data.getUint8(this.pos);
    this.pos += 1;
    return val;
  }

  readUint16(): number {
    const val = this.data.getUint16(this.pos);
    this.pos += 2;
    return val;
  }

  readUint32(): number {
    const val = this.data.getUint32(this.pos);
    this.pos += 4;
    return val;
  }

  readVarLen(): number {
    let result = 0;
    let byte: number;
    let count = 0;
    do {
      byte = this.readUint8();
      result = (result << 7) | (byte & 0x7F);
      count++;
      if (count > 4) throw new Error('Variable length value too long');
    } while (byte & 0x80);
    return result;
  }

  readBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(this.data.buffer, this.pos, length);
    this.pos += length;
    return bytes;
  }

  readString(length: number): string {
    const bytes = this.readBytes(length);
    return Array.from(bytes).map(b => String.fromCharCode(b)).join('');
  }

  getPosition(): number {
    return this.pos;
  }

  setPosition(pos: number): void {
    this.pos = pos;
  }

  hasMore(): boolean {
    return this.pos < this.data.byteLength;
  }
}

interface RawEvent {
  tick: number;
  type: string;
  channel?: number;
  data: Record<string, any>;
  trackIndex: number;
}

export function parseMidiFile(buffer: ArrayBuffer): MidiProject {
  noteIdCounter = 0;
  issueIdCounter = 0;
  
  const reader = new MidiReader(buffer);
  const issues: DiagnosticIssue[] = [];

  // Read header chunk
  const headerId = reader.readString(4);
  if (headerId !== 'MThd') {
    throw new Error('No es un archivo MIDI válido: falta la cabecera MThd');
  }

  const headerLength = reader.readUint32();
  const format = reader.readUint16();
  const numTracks = reader.readUint16();
  const division = reader.readUint16();

  // Validate format
  if (format === 2) {
    throw new Error('MIDI tipo 2 (múltiples canciones) no está soportado. Este formato contiene secuencias independientes que no pueden procesarse como una sola obra.');
  }

  if (format !== 0 && format !== 1) {
    throw new Error(`Formato MIDI desconocido: ${format}. Solo se admiten tipo 0 y tipo 1.`);
  }

  // Check for SMPTE time division
  const isSMPTE = (division & 0x8000) !== 0;
  if (isSMPTE) {
    const framesPerSecond = -(((division >> 8) << 24) >> 24); // signed byte
    const ticksPerFrame = division & 0xFF;
    throw new Error(`División temporal SMPTE detectada (${framesPerSecond} fps, ${ticksPerFrame} ticks/frame). Solo se admite división basada en pulses por negra (PPQN).`);
  }

  const ticksPerBeat = division;

  if (headerLength > 6) {
    reader.setPosition(reader.getPosition() + (headerLength - 6));
  }

  // Parse tracks
  const allEvents: RawEvent[][] = [];
  const tempoMap: TempoEvent[] = [];
  const timeSignatures: TimeSignatureEvent[] = [];
  const keySignatures: KeySignatureEvent[] = [];
  const controlChanges: ControlChange[] = [];
  const pitchBends: PitchBend[] = [];

  for (let trackIdx = 0; trackIdx < numTracks; trackIdx++) {
    const trackId = reader.readString(4);
    if (trackId !== 'MTrk') {
      throw new Error(`Cabecera de pista ${trackIdx} inválida: se esperaba MTrk, se encontró ${trackId}`);
    }

    const trackLength = reader.readUint32();
    const trackEnd = reader.getPosition() + trackLength;
    const trackEvents: RawEvent[] = [];
    let tick = 0;
    let lastStatus = 0;

    while (reader.getPosition() < trackEnd) {
      const delta = reader.readVarLen();
      tick += delta;

      let statusByte = reader.readUint8();

      // Running status
      if (statusByte < 0x80) {
        reader.setPosition(reader.getPosition() - 1);
        statusByte = lastStatus;
      } else {
        lastStatus = statusByte;
      }

      const eventType = statusByte & 0xF0;
      const channel = statusByte & 0x0F;

      if (statusByte === 0xFF) {
        // Meta event
        const metaType = reader.readUint8();
        const metaLength = reader.readVarLen();

        switch (metaType) {
          case 0x51: { // Tempo
            if (metaLength >= 3) {
              const b1 = reader.readUint8();
              const b2 = reader.readUint8();
              const b3 = reader.readUint8();
              const microsecondsPerBeat = (b1 << 16) | (b2 << 8) | b3;
              const bpm = 60000000 / microsecondsPerBeat;
              tempoMap.push({ tick, bpm, microsecondsPerBeat });
              trackEvents.push({ tick, type: 'tempo', data: { bpm, microsecondsPerBeat }, trackIndex: trackIdx });
            } else {
              reader.readBytes(metaLength);
            }
            break;
          }
          case 0x58: { // Time signature
            if (metaLength >= 4) {
              const numerator = reader.readUint8();
              const denominator = Math.pow(2, reader.readUint8());
              const clocksPerClick = reader.readUint8();
              const thirtySecondNotesPerBeat = reader.readUint8();
              timeSignatures.push({ tick, numerator, denominator, clocksPerClick, thirtySecondNotesPerBeat });
              trackEvents.push({ tick, type: 'timeSignature', data: { numerator, denominator }, trackIndex: trackIdx });
            } else {
              reader.readBytes(metaLength);
            }
            break;
          }
          case 0x59: { // Key signature
            if (metaLength >= 2) {
              const sf = reader.readUint8();
              const mi = reader.readUint8();
              const keyNames = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
              const key = keyNames[sf + 7] || 'C';
              const scale = mi === 0 ? 'major' as const : 'minor' as const;
              keySignatures.push({ tick, key, scale });
              trackEvents.push({ tick, type: 'keySignature', data: { key, scale }, trackIndex: trackIdx });
            } else {
              reader.readBytes(metaLength);
            }
            break;
          }
          case 0x03: { // Track name
            const nameBytes = reader.readBytes(metaLength);
            const name = Array.from(nameBytes).map(b => String.fromCharCode(b)).join('');
            trackEvents.push({ tick, type: 'trackName', data: { name }, trackIndex: trackIdx });
            break;
          }
          case 0x21: { // MIDI port
            reader.readBytes(metaLength);
            break;
          }
          case 0x2F: { // End of track
            reader.readBytes(metaLength);
            break;
          }
          default: {
            reader.readBytes(metaLength);
            break;
          }
        }
      } else if (statusByte === 0xF0 || statusByte === 0xF7) {
        // SysEx
        const sysexLength = reader.readVarLen();
        reader.readBytes(sysexLength);
      } else if (eventType === 0x80) {
        // Note Off
        const pitch = reader.readUint8();
        const velocity = reader.readUint8();
        trackEvents.push({ tick, type: 'noteOff', channel, data: { pitch, velocity }, trackIndex: trackIdx });
      } else if (eventType === 0x90) {
        // Note On (velocity 0 = Note Off)
        const pitch = reader.readUint8();
        const velocity = reader.readUint8();
        if (velocity === 0) {
          trackEvents.push({ tick, type: 'noteOff', channel, data: { pitch, velocity: 0 }, trackIndex: trackIdx });
        } else {
          trackEvents.push({ tick, type: 'noteOn', channel, data: { pitch, velocity }, trackIndex: trackIdx });
        }
      } else if (eventType === 0xA0) {
        // Aftertouch
        reader.readUint8(); // pitch
        reader.readUint8(); // pressure
      } else if (eventType === 0xB0) {
        // Control Change
        const controller = reader.readUint8();
        const value = reader.readUint8();
        controlChanges.push({ tick, channel, controller, value, trackIndex: trackIdx });
        trackEvents.push({ tick, type: 'controlChange', channel, data: { controller, value }, trackIndex: trackIdx });
      } else if (eventType === 0xC0) {
        // Program Change
        const program = reader.readUint8();
        trackEvents.push({ tick, type: 'programChange', channel, data: { program }, trackIndex: trackIdx });
      } else if (eventType === 0xD0) {
        // Channel Pressure
        reader.readUint8();
      } else if (eventType === 0xE0) {
        // Pitch Bend
        const lsb = reader.readUint8();
        const msb = reader.readUint8();
        const value = ((msb << 7) | lsb) - 8192;
        pitchBends.push({ tick, channel, value, trackIndex: trackIdx });
        trackEvents.push({ tick, type: 'pitchBend', channel, data: { value }, trackIndex: trackIdx });
      } else {
        // Unknown - try to skip
        issues.push({
          id: nextIssueId(),
          severity: 'warning',
          category: 'structure',
          message: `Evento desconocido 0x${statusByte.toString(16)} en pista ${trackIdx}, tick ${tick}`,
          trackIndex: trackIdx,
          tick
        });
      }
    }

    // Ensure we're at track end
    if (reader.getPosition() !== trackEnd) {
      reader.setPosition(trackEnd);
    }

    allEvents.push(trackEvents);
  }

  // Build tracks with notes
  const tracks: TrackInfo[] = [];
  const totalTicks = Math.max(...allEvents.flatMap(evs => evs.map(e => e.tick)), 0);

  for (let trackIdx = 0; trackIdx < numTracks; trackIdx++) {
    const events = allEvents[trackIdx];
    const trackNameEvent = events.find(e => e.type === 'trackName');
    const programEvent = events.find(e => e.type === 'programChange');
    
    const trackName = trackNameEvent?.data.name || `Pista ${trackIdx + 1}`;
    const program: number | undefined = programEvent?.data.program;

    // Determine channel (use most common channel)
    const channelCounts: Record<number, number> = {};
    for (const e of events) {
      if (e.channel !== undefined) {
        channelCounts[e.channel] = (channelCounts[e.channel] || 0) + 1;
      }
    }
    const channel = parseInt(Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '0');
    const isPercussion = channel === 9;

    // Pair note on/off events
    const notes: MidiNote[] = [];
    const openNotes: Map<string, { tick: number; velocity: number; pitch: number }> = new Map();

    const noteEvents = events.filter(e => e.type === 'noteOn' || e.type === 'noteOff');
    noteEvents.sort((a, b) => a.tick - b.tick);

    for (const event of noteEvents) {
      const key = `${event.channel}_${event.data.pitch}`;
      
      if (event.type === 'noteOn') {
        // Check for overlapping notes of same pitch
        if (openNotes.has(key)) {
          const existing = openNotes.get(key)!;
          // Close the existing note
          const note: MidiNote = {
            id: nextNoteId(),
            trackIndex: trackIdx,
            channel: event.channel ?? 0,
            pitch: event.data.pitch,
            velocity: existing.velocity,
            startTick: existing.tick,
            endTick: event.tick,
            correctedStartTick: existing.tick,
            correctedEndTick: event.tick,
            originalStartTick: existing.tick,
            originalEndTick: event.tick,
            isModified: false,
            isProtected: false,
            isFlagged: true,
            flagReason: 'Nota solapada de igual altura cerrada por nuevo ataque',
            reviewStatus: 'pending'
          };
          if (note.endTick <= note.startTick) {
            note.endTick = note.startTick + 1;
            note.correctedEndTick = note.endTick;
            note.originalEndTick = note.endTick;
          }
          notes.push(note);
          issues.push({
            id: nextIssueId(),
            severity: 'warning',
            category: 'overlap',
            message: `Nota solapada: pitch ${event.data.pitch} en canal ${event.channel}, tick ${event.tick}`,
            trackIndex: trackIdx,
            tick: event.tick
          });
        }
        openNotes.set(key, { tick: event.tick, velocity: event.data.velocity, pitch: event.data.pitch });
      } else {
        // Note Off
        if (openNotes.has(key)) {
          const start = openNotes.get(key)!;
          const note: MidiNote = {
            id: nextNoteId(),
            trackIndex: trackIdx,
            channel: event.channel ?? 0,
            pitch: event.data.pitch,
            velocity: start.velocity,
            startTick: start.tick,
            endTick: event.tick,
            correctedStartTick: start.tick,
            correctedEndTick: event.tick,
            originalStartTick: start.tick,
            originalEndTick: event.tick,
            isModified: false,
            isProtected: false,
            isFlagged: false,
            reviewStatus: 'pending'
          };
          if (note.endTick <= note.startTick) {
            note.endTick = note.startTick + 1;
            note.correctedEndTick = note.endTick;
            note.originalEndTick = note.endTick;
            note.isFlagged = true;
            note.flagReason = 'Duración cero o negativa corregida';
          }
          notes.push(note);
          openNotes.delete(key);
        } else {
          // Orphan note off
          issues.push({
            id: nextIssueId(),
            severity: 'warning',
            category: 'orphan',
            message: `Note Off sin Note On previo: pitch ${event.data.pitch}, canal ${event.channel}, tick ${event.tick}`,
            trackIndex: trackIdx,
            tick: event.tick
          });
        }
      }
    }

    // Check for unclosed notes
    for (const [key, start] of openNotes) {
      const note: MidiNote = {
        id: nextNoteId(),
        trackIndex: trackIdx,
        channel: parseInt(key.split('_')[0]),
        pitch: start.pitch,
        velocity: start.velocity,
        startTick: start.tick,
        endTick: totalTicks,
        correctedStartTick: start.tick,
        correctedEndTick: totalTicks,
        originalStartTick: start.tick,
        originalEndTick: totalTicks,
        isModified: false,
        isProtected: false,
        isFlagged: true,
        flagReason: 'Nota sin cierre - truncada al final del archivo',
        reviewStatus: 'pending'
      };
      notes.push(note);
      issues.push({
        id: nextIssueId(),
        severity: 'warning',
        category: 'orphan',
        message: `Nota sin cierre: pitch ${start.pitch}, canal ${key.split('_')[0]}, inicio tick ${start.tick}`,
        trackIndex: trackIdx,
        tick: start.tick
      });
    }

    tracks.push({
      index: trackIdx,
      name: trackName,
      channel,
      program,
      isPercussion,
      role: isPercussion ? 'percussion' : 'unassigned',
      polyphony: isPercussion ? 'percussion' : 'auto',
      noteCount: notes.length,
      notes
    });
  }

  // Sort tempo map
  tempoMap.sort((a, b) => a.tick - b.tick);
  if (tempoMap.length === 0) {
    tempoMap.push({ tick: 0, bpm: 120, microsecondsPerBeat: 500000 });
  }

  // Sort time signatures
  timeSignatures.sort((a, b) => a.tick - b.tick);
  if (timeSignatures.length === 0) {
    timeSignatures.push({ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 });
    issues.push({
      id: nextIssueId(),
      severity: 'info',
      category: 'timesig',
      message: 'No se encontró indicación de compás. Se asume 4/4.'
    });
  }

  // Calculate duration
  const lastTempo = tempoMap[tempoMap.length - 1];
  const remainingTicks = totalTicks - lastTempo.tick;
  const totalDuration = (totalTicks / ticksPerBeat) * (60 / tempoMap[0].bpm);

  const missingInfo: MissingInfo = {
    hasTempo: tempoMap.length > 0 && tempoMap[0].tick === 0,
    hasTimeSignature: timeSignatures.length > 0 && timeSignatures[0].tick === 0,
    hasKeySignature: keySignatures.length > 0,
    assumedTempo: tempoMap[0].bpm,
    assumedTimeSignature: `${timeSignatures[0].numerator}/${timeSignatures[0].denominator}`
  };

  // Validate
  if (tracks.length === 0) {
    throw new Error('El archivo MIDI no contiene pistas.');
  }

  const totalNotes = tracks.reduce((sum, t) => sum + t.noteCount, 0);
  if (totalNotes === 0) {
    issues.push({
      id: nextIssueId(),
      severity: 'error',
      category: 'notes',
      message: 'No se encontraron notas en el archivo.'
    });
  }

  if (totalNotes > 100000) {
    issues.push({
      id: nextIssueId(),
      severity: 'warning',
      category: 'structure',
      message: `Archivo con ${totalNotes} notas. El procesamiento puede ser lento.`
    });
  }

  const project: MidiProject = {
    id: crypto.randomUUID ? crypto.randomUUID() : `proj_${Date.now()}`,
    name: 'Proyecto MIDI',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    format,
    ticksPerBeat,
    tempoMap,
    timeSignatures,
    keySignatures,
    tracks,
    controlChanges,
    pitchBends,
    totalTicks,
    totalDuration,
    issues,
    missingInfo,
    quantizeConfig: {
      mode: 'strict',
      gridDivision: 16,
      useTriplets: false,
      strength: 100,
      maxDisplacement: ticksPerBeat, // 1 beat max
      quantizeAttacksOnly: true,
      normalizeDuration: false,
      swingAmount: 0,
      preserveSelected: true,
      collisionPolicy: 'flag',
      trackIndices: tracks.map(t => t.index)
    },
    versions: [],
    currentVersionId: ''
  };

  return project;
}
