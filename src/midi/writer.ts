// Escritor MIDI - Genera Standard MIDI File tipo 0 o 1
// Reconstruye delta-times y verifica integridad

import { MidiProject, MidiNote, TempoEvent, TimeSignatureEvent } from './model';

class MidiWriter {
  private buffer: number[] = [];

  writeUint8(val: number): void {
    this.buffer.push(val & 0xFF);
  }

  writeUint16(val: number): void {
    this.buffer.push((val >> 8) & 0xFF);
    this.buffer.push(val & 0xFF);
  }

  writeUint32(val: number): void {
    this.buffer.push((val >> 24) & 0xFF);
    this.buffer.push((val >> 16) & 0xFF);
    this.buffer.push((val >> 8) & 0xFF);
    this.buffer.push(val & 0xFF);
  }

  writeVarLen(val: number): void {
    if (val < 0) val = 0;
    
    const bytes: number[] = [];
    bytes.push(val & 0x7F);
    val >>= 7;
    
    while (val > 0) {
      bytes.push((val & 0x7F) | 0x80);
      val >>= 7;
    }
    
    bytes.reverse();
    for (const b of bytes) {
      this.buffer.push(b);
    }
  }

  writeString(str: string): void {
    for (let i = 0; i < str.length; i++) {
      this.buffer.push(str.charCodeAt(i) & 0xFF);
    }
  }

  writeBytes(bytes: number[]): void {
    for (const b of bytes) {
      this.buffer.push(b & 0xFF);
    }
  }

  getData(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  getLength(): number {
    return this.buffer.length;
  }
}

interface MidiEvent {
  tick: number;
  data: number[];
  sortPriority: number; // lower = earlier at same tick
}

function noteToEvents(note: MidiNote, useCorrected: boolean): MidiEvent[] {
  const startTick = useCorrected ? note.correctedStartTick : note.startTick;
  const endTick = useCorrected ? note.correctedEndTick : note.endTick;
  
  const statusOn = 0x90 | (note.channel & 0x0F);
  const statusOff = 0x80 | (note.channel & 0x0F);
  
  return [
    {
      tick: Math.max(0, startTick),
      data: [statusOn, note.pitch & 0x7F, note.velocity & 0x7F],
      sortPriority: 0
    },
    {
      tick: Math.max(0, endTick),
      data: [statusOff, note.pitch & 0x7F, 0],
      sortPriority: 2
    }
  ];
}

function tempoToEvent(tempo: TempoEvent): MidiEvent {
  const mpb = tempo.microsecondsPerBeat;
  return {
    tick: tempo.tick,
    data: [0xFF, 0x51, 0x03, (mpb >> 16) & 0xFF, (mpb >> 8) & 0xFF, mpb & 0xFF],
    sortPriority: -2 // Tempo before notes
  };
}

function timeSigToEvent(ts: TimeSignatureEvent): MidiEvent {
  const denLog = Math.log2(ts.denominator);
  return {
    tick: ts.tick,
    data: [0xFF, 0x58, 0x04, ts.numerator, denLog, ts.clocksPerClick, ts.thirtySecondNotesPerBeat],
    sortPriority: -3 // Time sig before tempo
  };
}

export function writeMidiFile(project: MidiProject, useCorrected: boolean = true): Uint8Array {
  const writer = new MidiWriter();
  
  // Determine format: use type 1 if multiple tracks
  const format = project.tracks.length > 1 ? 1 : 0;
  const numTracks = format === 1 ? project.tracks.length + 1 : project.tracks.length; // +1 for tempo track in format 1
  
  // Write header
  writer.writeString('MThd');
  writer.writeUint32(6); // header length
  writer.writeUint16(format);
  writer.writeUint16(numTracks);
  writer.writeUint16(project.ticksPerBeat);
  
  // For format 1, write tempo/conductor track first
  if (format === 1) {
    const trackWriter = new MidiWriter();
    const events: MidiEvent[] = [];
    
    // Add tempo events
    for (const tempo of project.tempoMap) {
      events.push(tempoToEvent(tempo));
    }
    
    // Add time signature events
    for (const ts of project.timeSignatures) {
      events.push(timeSigToEvent(ts));
    }
    
    // Add key signature events
    for (const ks of project.keySignatures) {
      const sfMap: Record<string, number> = {
        'Cb': -7, 'Gb': -6, 'Db': -5, 'Ab': -4, 'Eb': -3, 'Bb': -2, 'F': -1,
        'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7
      };
      const sf = sfMap[ks.key] || 0;
      const mi = ks.scale === 'minor' ? 1 : 0;
      events.push({
        tick: ks.tick,
        data: [0xFF, 0x59, 0x02, (sf + 256) & 0xFF, mi],
        sortPriority: -3
      });
    }
    
    // End of track
    events.push({
      tick: project.totalTicks,
      data: [0xFF, 0x2F, 0x00],
      sortPriority: 100
    });
    
    // Sort events
    events.sort((a, b) => {
      if (a.tick !== b.tick) return a.tick - b.tick;
      return a.sortPriority - b.sortPriority;
    });
    
    // Write events with delta times
    let lastTick = 0;
    for (const event of events) {
      const delta = Math.max(0, event.tick - lastTick);
      trackWriter.writeVarLen(delta);
      trackWriter.writeBytes(event.data);
      lastTick = event.tick;
    }
    
    // Write track chunk
    writer.writeString('MTrk');
    writer.writeUint32(trackWriter.getLength());
    writer.writeBytes(Array.from(trackWriter.getData()));
  }
  
  // Write note tracks
  for (const track of project.tracks) {
    const trackWriter = new MidiWriter();
    const events: MidiEvent[] = [];
    
    // Track name
    if (track.name) {
      const nameBytes = Array.from(track.name).map(c => c.charCodeAt(0));
      events.push({
        tick: 0,
        data: [0xFF, 0x03, nameBytes.length, ...nameBytes],
        sortPriority: -10
      });
    }
    
    // Program change
    if (track.program !== undefined) {
      events.push({
        tick: 0,
        data: [0xC0 | (track.channel & 0x0F), track.program & 0x7F],
        sortPriority: -5
      });
    }
    
    // Add note events
    for (const note of track.notes) {
      const noteEvents = noteToEvents(note, useCorrected);
      events.push(...noteEvents);
    }
    
    // Add control changes for this track
    for (const cc of project.controlChanges) {
      if (cc.trackIndex === track.index) {
        events.push({
          tick: cc.tick,
          data: [0xB0 | (cc.channel & 0x0F), cc.controller & 0x7F, cc.value & 0x7F],
          sortPriority: 1
        });
      }
    }
    
    // Add pitch bends for this track
    for (const pb of project.pitchBends) {
      if (pb.trackIndex === track.index) {
        const val = pb.value + 8192;
        events.push({
          tick: pb.tick,
          data: [0xE0 | (pb.channel & 0x0F), val & 0x7F, (val >> 7) & 0x7F],
          sortPriority: 1
        });
      }
    }
    
    // End of track
    events.push({
      tick: project.totalTicks,
      data: [0xFF, 0x2F, 0x00],
      sortPriority: 100
    });
    
    // Sort events by tick, then by priority
    events.sort((a, b) => {
      if (a.tick !== b.tick) return a.tick - b.tick;
      return a.sortPriority - b.sortPriority;
    });
    
    // Write with delta times
    let lastTick = 0;
    for (const event of events) {
      const delta = Math.max(0, event.tick - lastTick);
      trackWriter.writeVarLen(delta);
      trackWriter.writeBytes(event.data);
      lastTick = event.tick;
    }
    
    // Write track chunk
    writer.writeString('MTrk');
    writer.writeUint32(trackWriter.getLength());
    writer.writeBytes(Array.from(trackWriter.getData()));
  }
  
  return writer.getData();
}

/**
 * Verifica la integridad de un MIDI exportado re-parseándolo
 */
export function verifyMidiExport(data: Uint8Array, originalNoteCount: number): { valid: boolean; errors: string[]; noteCount: number } {
  const errors: string[] = [];
  
  try {
    // Basic structure check
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    
    // Check header
    const header = String.fromCharCode(data[0], data[1], data[2], data[3]);
    if (header !== 'MThd') {
      errors.push('Cabecera MThd no encontrada');
      return { valid: false, errors, noteCount: 0 };
    }
    
    const headerLen = view.getUint32(4);
    if (headerLen < 6) {
      errors.push('Longitud de cabecera inválida');
      return { valid: false, errors, noteCount: 0 };
    }
    
    const format = view.getUint16(8);
    const numTracks = view.getUint16(10);
    const division = view.getUint16(12);
    
    if (format > 2) {
      errors.push(`Formato MIDI inválido: ${format}`);
    }
    
    if (numTracks === 0) {
      errors.push('No hay pistas en el archivo');
    }
    
    if (division === 0) {
      errors.push('División temporal es cero');
    }
    
    // Count note-ons by scanning (simplified verification)
    let noteOnCount = 0;
    let pos = 8 + headerLen;
    
    while (pos < data.length - 8) {
      const chunkId = String.fromCharCode(data[pos], data[pos + 1], data[pos + 2], data[pos + 3]);
      if (chunkId !== 'MTrk') break;
      
      const chunkLen = view.getUint32(pos + 4);
      const chunkEnd = pos + 8 + chunkLen;
      
      if (chunkEnd > data.length) {
        errors.push(`Pista excede el tamaño del archivo en posición ${pos}`);
        break;
      }
      
      pos += 8;
      
      // Scan track for note events
      while (pos < chunkEnd) {
        // Skip delta time
        while (pos < chunkEnd && data[pos] & 0x80) pos++;
        pos++; // last byte of var len
        
        if (pos >= chunkEnd) break;
        
        const status = data[pos];
        
        if (status === 0xFF) {
          // Meta event
          pos++;
          // Skip meta type and length
          while (pos < chunkEnd && data[pos] & 0x80) pos++;
          pos++; // meta type
          let metaLen = 0;
          while (pos < chunkEnd && data[pos] & 0x80) {
            metaLen = (metaLen << 7) | (data[pos] & 0x7F);
            pos++;
          }
          if (pos < chunkEnd) {
            metaLen = (metaLen << 7) | (data[pos] & 0x7F);
            pos++;
          }
          pos += metaLen;
        } else if (status >= 0x80) {
          pos++;
          const type = status & 0xF0;
          
          if (type === 0x90) {
            // Note On
            const vel = pos + 1 < chunkEnd ? data[pos + 1] : 0;
            if (vel > 0) noteOnCount++;
            pos += 2;
          } else if (type === 0x80 || type === 0xA0 || type === 0xB0 || type === 0xE0) {
            pos += 2;
          } else if (type === 0xC0 || type === 0xD0) {
            pos += 1;
          } else {
            pos += 2;
          }
        } else {
          pos++;
        }
      }
      
      pos = chunkEnd;
    }
    
    if (noteOnCount !== originalNoteCount) {
      errors.push(`Conteo de notas diferente: original ${originalNoteCount}, exportado ${noteOnCount}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      noteCount: noteOnCount
    };
  } catch (e) {
    errors.push(`Error de verificación: ${(e as Error).message}`);
    return { valid: false, errors, noteCount: 0 };
  }
}

/**
 * Genera informe de modificaciones en texto legible
 */
export function generateReport(project: MidiProject): string {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════');
  lines.push('  INFORME DE PROCESAMIENTO MIDI');
  lines.push('═══════════════════════════════════════════════');
  lines.push('');
  lines.push(`Proyecto: ${project.name}`);
  lines.push(`Fecha: ${new Date(project.updatedAt).toLocaleString('es-ES')}`);
  lines.push(`Formato: MIDI tipo ${project.format}`);
  lines.push(`Resolución: ${project.ticksPerBeat} ticks/negra`);
  lines.push(`Duración: ${project.totalDuration.toFixed(2)} segundos`);
  lines.push(`Total de notas: ${project.tracks.reduce((s, t) => s + t.noteCount, 0)}`);
  lines.push('');
  
  lines.push('── COMPÁS Y TEMPO ──');
  lines.push(`Compás inicial: ${project.timeSignatures[0]?.numerator}/${project.timeSignatures[0]?.denominator || '4/4'}`);
  lines.push(`Tempo inicial: ${project.tempoMap[0]?.bpm || 120} BPM`);
  if (project.tempoMap.length > 1) {
    lines.push(`Cambios de tempo: ${project.tempoMap.length}`);
  }
  if (project.timeSignatures.length > 1) {
    lines.push(`Cambios de compás: ${project.timeSignatures.length}`);
  }
  lines.push('');
  
  lines.push('── PISTAS ──');
  for (const track of project.tracks) {
    lines.push(`  Pista ${track.index + 1}: ${track.name}`);
    lines.push(`    Canal: ${track.channel + 1}${track.isPercussion ? ' (percusión)' : ''}`);
    if (track.program !== undefined) {
      lines.push(`    Programa: ${track.program}`);
    }
    lines.push(`    Notas: ${track.noteCount}`);
    lines.push(`    Función: ${track.role}`);
    lines.push(`    Polifonía: ${track.polyphony}`);
    lines.push('');
  }
  
  lines.push('── INCIDENCIAS ──');
  if (project.issues.length === 0) {
    lines.push('  Sin incidencias.');
  } else {
    for (const issue of project.issues) {
      const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : issue.severity === 'critical' ? '✗✗' : 'ℹ';
      lines.push(`  ${icon} [${issue.severity.toUpperCase()}] ${issue.message}`);
      if (issue.trackIndex !== undefined) lines.push(`    Pista: ${issue.trackIndex + 1}`);
      if (issue.tick !== undefined) lines.push(`    Tick: ${issue.tick}`);
    }
  }
  lines.push('');
  
  // Modified notes
  const modifiedNotes = project.tracks.flatMap(t => t.notes.filter(n => n.isModified));
  lines.push('── MODIFICACIONES ──');
  if (modifiedNotes.length === 0) {
    lines.push('  Sin modificaciones.');
  } else {
    lines.push(`  Total de notas modificadas: ${modifiedNotes.length}`);
    lines.push('');
    for (const note of modifiedNotes.slice(0, 50)) {
      const displacement = note.correctedStartTick - note.originalStartTick;
      lines.push(`  • Pitch ${note.pitch}, Pista ${note.trackIndex + 1}: ${displacement > 0 ? '+' : ''}${displacement} ticks`);
      if (note.modificationReason) lines.push(`    ${note.modificationReason}`);
    }
    if (modifiedNotes.length > 50) {
      lines.push(`  ... y ${modifiedNotes.length - 50} más`);
    }
  }
  lines.push('');
  
  lines.push('── INFORMACIÓN FALTANTE ──');
  if (!project.missingInfo.hasTempo) {
    lines.push(`  ⚠ Tempo no indicado. Asumido: ${project.missingInfo.assumedTempo} BPM`);
  }
  if (!project.missingInfo.hasTimeSignature) {
    lines.push(`  ⚠ Compás no indicado. Asumido: ${project.missingInfo.assumedTimeSignature}`);
  }
  if (!project.missingInfo.hasKeySignature) {
    lines.push('  ⚠ Tonalidad no indicada.');
  }
  lines.push('');
  
  lines.push('── CONFIGURACIÓN DE CUANTIZACIÓN ──');
  const qc = project.quantizeConfig;
  lines.push(`  Modo: ${qc.mode === 'strict' ? 'ESTRICTO' : qc.mode === 'interpretive' ? 'INTERPRETATIVO' : 'ASISTIDO'}`);
  lines.push(`  Rejilla: 1/${qc.gridDivision}${qc.useTriplets ? ' (tresillos)' : ''}`);
  lines.push(`  Intensidad: ${qc.strength}%`);
  lines.push(`  Desplazamiento máximo: ${qc.maxDisplacement} ticks`);
  lines.push(`  Swing: ${qc.swingAmount}%`);
  lines.push(`  Solo ataques: ${qc.quantizeAttacksOnly ? 'Sí' : 'No'}`);
  lines.push('');
  
  lines.push('═══════════════════════════════════════════════');
  lines.push('  Fin del informe');
  lines.push('═══════════════════════════════════════════════');
  
  return lines.join('\n');
}

/**
 * Genera informe estructurado JSON
 */
export function generateJsonReport(project: MidiProject): object {
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    project: {
      name: project.name,
      format: project.format,
      ticksPerBeat: project.ticksPerBeat,
      totalTicks: project.totalTicks,
      totalDuration: project.totalDuration,
      tempoMap: project.tempoMap,
      timeSignatures: project.timeSignatures
    },
    tracks: project.tracks.map(t => ({
      index: t.index,
      name: t.name,
      channel: t.channel,
      program: t.program,
      role: t.role,
      noteCount: t.noteCount,
      modifiedNotes: t.notes.filter(n => n.isModified).length
    })),
    issues: project.issues,
    quantizeConfig: project.quantizeConfig,
    statistics: {
      totalNotes: project.tracks.reduce((s, t) => s + t.noteCount, 0),
      modifiedNotes: project.tracks.reduce((s, t) => s + t.notes.filter(n => n.isModified).length, 0),
      flaggedNotes: project.tracks.reduce((s, t) => s + t.notes.filter(n => n.isFlagged).length, 0),
      issueCount: project.issues.length
    }
  };
}
