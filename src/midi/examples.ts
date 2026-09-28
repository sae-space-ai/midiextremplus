// Biblioteca de ejemplos MIDI generados programáticamente
// Cada ejemplo incluye descripción, objetivo y parámetros sugeridos

import { MidiProject, TrackInfo, MidiNote, TempoEvent, TimeSignatureEvent } from './model';

export interface MidiExample {
  id: string;
  name: string;
  description: string;
  objective: string;
  suggestedParams: {
    gridDivision: number;
    mode: 'strict' | 'interpretive' | 'assisted';
    strength: number;
  };
  expectedResult: string;
  category: 'didactic' | 'validation';
  generate: () => MidiProject;
}

let noteIdCounter = 10000;
function nextId(): string {
  return `ex_note_${++noteIdCounter}`;
}

function createNote(trackIndex: number, channel: number, pitch: number, velocity: number, startTick: number, endTick: number): MidiNote {
  return {
    id: nextId(),
    trackIndex,
    channel,
    pitch,
    velocity,
    startTick,
    endTick,
    correctedStartTick: startTick,
    correctedEndTick: endTick,
    originalStartTick: startTick,
    originalEndTick: endTick,
    isModified: false,
    isProtected: false,
    isFlagged: false,
    reviewStatus: 'pending'
  };
}

function createBaseProject(name: string, ticksPerBeat: number = 480): MidiProject {
  return {
    id: `example_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    format: 1,
    ticksPerBeat,
    tempoMap: [],
    timeSignatures: [],
    keySignatures: [],
    tracks: [],
    controlChanges: [],
    pitchBends: [],
    totalTicks: 0,
    totalDuration: 0,
    issues: [],
    missingInfo: {
      hasTempo: true,
      hasTimeSignature: true,
      hasKeySignature: false,
      assumedTempo: 120,
      assumedTimeSignature: '4/4'
    },
    quantizeConfig: {
      mode: 'strict',
      gridDivision: 16,
      useTriplets: false,
      strength: 100,
      maxDisplacement: 480,
      quantizeAttacksOnly: true,
      normalizeDuration: false,
      swingAmount: 0,
      preserveSelected: true,
      collisionPolicy: 'flag',
      trackIndices: []
    },
    versions: [],
    currentVersionId: ''
  };
}

// 1. Melodía monofónica en 4/4
function generateMonophonicMelody44(): MidiProject {
  const project = createBaseProject('Melodía monofónica 4/4');
  project.tempoMap = [{ tick: 0, bpm: 120, microsecondsPerBeat: 500000 }];
  project.timeSignatures = [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  const notes: MidiNote[] = [];
  
  // Melodía simple: Do-Re-Mi-Fa-Sol-Fa-Mi-Re-Do
  const pitches = [60, 62, 64, 65, 67, 65, 64, 62, 60];
  pitches.forEach((pitch, i) => {
    notes.push(createNote(0, 0, pitch, 80, i * tpb, (i + 1) * tpb));
  });
  
  const track: TrackInfo = {
    index: 0,
    name: 'Melodía',
    channel: 0,
    program: 0, // Piano
    isPercussion: false,
    role: 'melody',
    polyphony: 'mono',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = pitches.length * tpb;
  project.totalDuration = (project.totalTicks / tpb) * 0.5; // 120 BPM = 0.5s per beat
  project.quantizeConfig.trackIndices = [0];
  
  return project;
}

// 2. Melodía en 3/4
function generateMelody34(): MidiProject {
  const project = createBaseProject('Melodía en 3/4');
  project.tempoMap = [{ tick: 0, bpm: 100, microsecondsPerBeat: 600000 }];
  project.timeSignatures = [{ tick: 0, numerator: 3, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  const notes: MidiNote[] = [];
  
  // Vals: 3 tiempos por compás, 4 compases
  const pitches = [60, 64, 67, 65, 69, 67, 64, 62, 60, 64, 67, 72];
  pitches.forEach((pitch, i) => {
    notes.push(createNote(0, 0, pitch, 85, i * tpb, (i + 1) * tpb));
  });
  
  const track: TrackInfo = {
    index: 0,
    name: 'Vals',
    channel: 0,
    program: 0,
    isPercussion: false,
    role: 'melody',
    polyphony: 'mono',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = pitches.length * tpb;
  project.totalDuration = (project.totalTicks / tpb) * 0.6;
  project.quantizeConfig.trackIndices = [0];
  
  return project;
}

// 3. Pasaje compuesto en 6/8
function generateCompound68(): MidiProject {
  const project = createBaseProject('Pasaje compuesto 6/8');
  project.tempoMap = [{ tick: 0, bpm: 80, microsecondsPerBeat: 750000 }];
  project.timeSignatures = [{ tick: 0, numerator: 6, denominator: 8, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  const notes: MidiNote[] = [];
  
  // 6/8: 6 corcheas por compás, 2 compases
  const eighthNote = tpb / 2;
  const pitches = [60, 64, 67, 65, 69, 67, 64, 62, 60, 64, 67, 65];
  pitches.forEach((pitch, i) => {
    notes.push(createNote(0, 0, pitch, 75, i * eighthNote, (i + 1) * eighthNote));
  });
  
  const track: TrackInfo = {
    index: 0,
    name: 'Barcarola',
    channel: 0,
    program: 0,
    isPercussion: false,
    role: 'melody',
    polyphony: 'mono',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = pitches.length * eighthNote;
  project.totalDuration = (project.totalTicks / tpb) * 0.75;
  project.quantizeConfig.trackIndices = [0];
  
  return project;
}

// 4. Semicorcheas regulares
function generateSixteenthNotes(): MidiProject {
  const project = createBaseProject('Semicorcheas regulares');
  project.tempoMap = [{ tick: 0, bpm: 100, microsecondsPerBeat: 600000 }];
  project.timeSignatures = [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  const sixteenth = tpb / 4;
  const notes: MidiNote[] = [];
  
  // 16 semicorcheas en escala
  for (let i = 0; i < 16; i++) {
    const pitch = 60 + (i % 8);
    notes.push(createNote(0, 0, pitch, 70, i * sixteenth, (i + 1) * sixteenth));
  }
  
  const track: TrackInfo = {
    index: 0,
    name: 'Semicorcheas',
    channel: 0,
    program: 0,
    isPercussion: false,
    role: 'melody',
    polyphony: 'mono',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = 16 * sixteenth;
  project.totalDuration = (project.totalTicks / tpb) * 0.6;
  project.quantizeConfig.trackIndices = [0];
  
  return project;
}

// 5. Tresillos
function generateTriplets(): MidiProject {
  const project = createBaseProject('Tresillos');
  project.tempoMap = [{ tick: 0, bpm: 120, microsecondsPerBeat: 500000 }];
  project.timeSignatures = [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  const triplet = (tpb * 2) / 3; // 3 notas en 2 tiempos
  const notes: MidiNote[] = [];
  
  // 2 compases con tresillos
  for (let i = 0; i < 6; i++) {
    const pitch = 60 + (i % 5);
    notes.push(createNote(0, 0, pitch, 80, i * triplet, (i + 1) * triplet));
  }
  
  const track: TrackInfo = {
    index: 0,
    name: 'Tresillos',
    channel: 0,
    program: 0,
    isPercussion: false,
    role: 'melody',
    polyphony: 'mono',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = 6 * triplet;
  project.totalDuration = (project.totalTicks / tpb) * 0.5;
  project.quantizeConfig.trackIndices = [0];
  project.quantizeConfig.useTriplets = true;
  
  return project;
}

// 6. Síncopas y contratiempos
function generateSyncopation(): MidiProject {
  const project = createBaseProject('Síncopas y contratiempos');
  project.tempoMap = [{ tick: 0, bpm: 120, microsecondsPerBeat: 500000 }];
  project.timeSignatures = [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  const notes: MidiNote[] = [];
  
  // Síncopas: notas que empiezan en tiempos débiles
  notes.push(createNote(0, 0, 60, 80, 0, tpb / 2)); // Primera normal
  notes.push(createNote(0, 0, 64, 85, tpb / 2, tpb + tpb / 2)); // Síncope
  notes.push(createNote(0, 0, 67, 80, tpb + tpb / 2, 2 * tpb)); // Resolución
  notes.push(createNote(0, 0, 65, 85, 2 * tpb + tpb / 2, 3 * tpb + tpb / 2)); // Otra síncope
  notes.push(createNote(0, 0, 62, 80, 3 * tpb + tpb / 2, 4 * tpb)); // Resolución
  
  const track: TrackInfo = {
    index: 0,
    name: 'Síncopas',
    channel: 0,
    program: 0,
    isPercussion: false,
    role: 'melody',
    polyphony: 'mono',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = 4 * tpb;
  project.totalDuration = (project.totalTicks / tpb) * 0.5;
  project.quantizeConfig.trackIndices = [0];
  
  return project;
}

// 7. Anacrusa
function generateAnacrusis(): MidiProject {
  const project = createBaseProject('Anacrusa');
  project.tempoMap = [{ tick: 0, bpm: 120, microsecondsPerBeat: 500000 }];
  project.timeSignatures = [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  const notes: MidiNote[] = [];
  
  // Anacrusa: 2 corcheas antes del primer compás
  const anacrusis = tpb; // 1 tiempo de anacrusa
  notes.push(createNote(0, 0, 67, 75, 0, tpb / 2));
  notes.push(createNote(0, 0, 69, 75, tpb / 2, tpb));
  
  // Primer compás completo
  notes.push(createNote(0, 0, 72, 80, tpb, 2 * tpb));
  notes.push(createNote(0, 0, 71, 80, 2 * tpb, 3 * tpb));
  notes.push(createNote(0, 0, 69, 80, 3 * tpb, 4 * tpb));
  notes.push(createNote(0, 0, 67, 80, 4 * tpb, 5 * tpb));
  
  const track: TrackInfo = {
    index: 0,
    name: 'Anacrusa',
    channel: 0,
    program: 0,
    isPercussion: false,
    role: 'melody',
    polyphony: 'mono',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = 5 * tpb;
  project.totalDuration = (project.totalTicks / tpb) * 0.5;
  project.quantizeConfig.trackIndices = [0];
  
  return project;
}

// 8. Notas largas y silencios
function generateLongNotesAndRests(): MidiProject {
  const project = createBaseProject('Notas largas y silencios');
  project.tempoMap = [{ tick: 0, bpm: 80, microsecondsPerBeat: 750000 }];
  project.timeSignatures = [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  const notes: MidiNote[] = [];
  
  // Nota larga (blanca), silencio, nota larga
  notes.push(createNote(0, 0, 60, 70, 0, 2 * tpb)); // Blanca
  // Silencio de 2 tiempos
  notes.push(createNote(0, 0, 64, 75, 4 * tpb, 6 * tpb)); // Otra blanca
  // Silencio de 1 tiempo
  notes.push(createNote(0, 0, 67, 80, 7 * tpb, 8 * tpb)); // Negra
  
  const track: TrackInfo = {
    index: 0,
    name: 'Adagio',
    channel: 0,
    program: 0,
    isPercussion: false,
    role: 'melody',
    polyphony: 'mono',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = 8 * tpb;
  project.totalDuration = (project.totalTicks / tpb) * 0.75;
  project.quantizeConfig.trackIndices = [0];
  
  return project;
}

// 9. Acordes simultáneos
function generateChords(): MidiProject {
  const project = createBaseProject('Acordes simultáneos');
  project.tempoMap = [{ tick: 0, bpm: 100, microsecondsPerBeat: 600000 }];
  project.timeSignatures = [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  const notes: MidiNote[] = [];
  
  // Acorde de Do mayor (4 tiempos)
  notes.push(createNote(0, 0, 60, 80, 0, 4 * tpb)); // Do
  notes.push(createNote(0, 0, 64, 75, 0, 4 * tpb)); // Mi
  notes.push(createNote(0, 0, 67, 75, 0, 4 * tpb)); // Sol
  
  // Acorde de Fa mayor (4 tiempos)
  notes.push(createNote(0, 0, 65, 80, 4 * tpb, 8 * tpb)); // Fa
  notes.push(createNote(0, 0, 69, 75, 4 * tpb, 8 * tpb)); // La
  notes.push(createNote(0, 0, 72, 75, 4 * tpb, 8 * tpb)); // Do
  
  const track: TrackInfo = {
    index: 0,
    name: 'Acordes',
    channel: 0,
    program: 0,
    isPercussion: false,
    role: 'harmony',
    polyphony: 'poly',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = 8 * tpb;
  project.totalDuration = (project.totalTicks / tpb) * 0.6;
  project.quantizeConfig.trackIndices = [0];
  
  return project;
}

// 10. Arpegios
function generateArpeggios(): MidiProject {
  const project = createBaseProject('Arpegios');
  project.tempoMap = [{ tick: 0, bpm: 120, microsecondsPerBeat: 500000 }];
  project.timeSignatures = [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  const eighth = tpb / 2;
  const notes: MidiNote[] = [];
  
  // Arpegio de Do mayor ascendente y descendente
  const pitches = [60, 64, 67, 72, 67, 64, 60];
  pitches.forEach((pitch, i) => {
    notes.push(createNote(0, 0, pitch, 75, i * eighth, (i + 1) * eighth));
  });
  
  const track: TrackInfo = {
    index: 0,
    name: 'Arpegio',
    channel: 0,
    program: 0,
    isPercussion: false,
    role: 'melody',
    polyphony: 'mono',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = pitches.length * eighth;
  project.totalDuration = (project.totalTicks / tpb) * 0.5;
  project.quantizeConfig.trackIndices = [0];
  
  return project;
}

// 11. Dos voces en una misma pista
function generateTwoVoices(): MidiProject {
  const project = createBaseProject('Dos voces');
  project.tempoMap = [{ tick: 0, bpm: 120, microsecondsPerBeat: 500000 }];
  project.timeSignatures = [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  const notes: MidiNote[] = [];
  
  // Voz superior: melodía
  notes.push(createNote(0, 0, 72, 80, 0, tpb));
  notes.push(createNote(0, 0, 74, 80, tpb, 2 * tpb));
  notes.push(createNote(0, 0, 76, 80, 2 * tpb, 3 * tpb));
  notes.push(createNote(0, 0, 74, 80, 3 * tpb, 4 * tpb));
  
  // Voz inferior: bajo
  notes.push(createNote(0, 0, 48, 70, 0, 2 * tpb));
  notes.push(createNote(0, 0, 50, 70, 2 * tpb, 4 * tpb));
  
  const track: TrackInfo = {
    index: 0,
    name: 'Dos voces',
    channel: 0,
    program: 0,
    isPercussion: false,
    role: 'melody',
    polyphony: 'poly',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = 4 * tpb;
  project.totalDuration = (project.totalTicks / tpb) * 0.5;
  project.quantizeConfig.trackIndices = [0];
  
  return project;
}

// 12. Bajo y acompañamiento
function generateBassAndAccompaniment(): MidiProject {
  const project = createBaseProject('Bajo y acompañamiento');
  project.tempoMap = [{ tick: 0, bpm: 120, microsecondsPerBeat: 500000 }];
  project.timeSignatures = [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  
  // Pista 1: Bajo
  const bassNotes: MidiNote[] = [];
  bassNotes.push(createNote(0, 0, 48, 90, 0, tpb));
  bassNotes.push(createNote(0, 0, 48, 85, tpb, 2 * tpb));
  bassNotes.push(createNote(0, 0, 50, 90, 2 * tpb, 3 * tpb));
  bassNotes.push(createNote(0, 0, 50, 85, 3 * tpb, 4 * tpb));
  
  const bassTrack: TrackInfo = {
    index: 0,
    name: 'Bajo',
    channel: 0,
    program: 33, // Bajo eléctrico
    isPercussion: false,
    role: 'bass',
    polyphony: 'mono',
    noteCount: bassNotes.length,
    notes: bassNotes
  };
  
  // Pista 2: Acompañamiento
  const accompNotes: MidiNote[] = [];
  // Acordes de corchea
  for (let i = 0; i < 8; i++) {
    const tick = i * (tpb / 2);
    accompNotes.push(createNote(1, 1, 60, 70, tick, tick + tpb / 2));
    accompNotes.push(createNote(1, 1, 64, 65, tick, tick + tpb / 2));
    accompNotes.push(createNote(1, 1, 67, 65, tick, tick + tpb / 2));
  }
  
  const accompTrack: TrackInfo = {
    index: 1,
    name: 'Acompañamiento',
    channel: 1,
    program: 0,
    isPercussion: false,
    role: 'harmony',
    polyphony: 'poly',
    noteCount: accompNotes.length,
    notes: accompNotes
  };
  
  project.tracks = [bassTrack, accompTrack];
  project.totalTicks = 4 * tpb;
  project.totalDuration = (project.totalTicks / tpb) * 0.5;
  project.quantizeConfig.trackIndices = [0, 1];
  
  return project;
}

// 13. Percusión
function generatePercussion(): MidiProject {
  const project = createBaseProject('Percusión');
  project.tempoMap = [{ tick: 0, bpm: 120, microsecondsPerBeat: 500000 }];
  project.timeSignatures = [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  const notes: MidiNote[] = [];
  
  // Bombo en tiempos 1 y 3
  notes.push(createNote(0, 9, 36, 100, 0, tpb / 4));
  notes.push(createNote(0, 9, 36, 100, 2 * tpb, 2 * tpb + tpb / 4));
  
  // Caja en tiempos 2 y 4
  notes.push(createNote(0, 9, 38, 90, tpb, tpb + tpb / 4));
  notes.push(createNote(0, 9, 38, 90, 3 * tpb, 3 * tpb + tpb / 4));
  
  // Hi-hat en corcheas
  for (let i = 0; i < 8; i++) {
    notes.push(createNote(0, 9, 42, 70, i * (tpb / 2), i * (tpb / 2) + tpb / 8));
  }
  
  const track: TrackInfo = {
    index: 0,
    name: 'Batería',
    channel: 9,
    isPercussion: true,
    role: 'percussion',
    polyphony: 'percussion',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = 4 * tpb;
  project.totalDuration = (project.totalTicks / tpb) * 0.5;
  project.quantizeConfig.trackIndices = [0];
  
  return project;
}

// 14. Cambios de tempo
function generateTempoChanges(): MidiProject {
  const project = createBaseProject('Cambios de tempo');
  project.tempoMap = [
    { tick: 0, bpm: 120, microsecondsPerBeat: 500000 },
    { tick: 4 * 480, bpm: 140, microsecondsPerBeat: 428571 },
    { tick: 8 * 480, bpm: 100, microsecondsPerBeat: 600000 }
  ];
  project.timeSignatures = [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  const notes: MidiNote[] = [];
  
  // 12 compases con cambios de tempo
  for (let i = 0; i < 12; i++) {
    notes.push(createNote(0, 0, 60 + (i % 8), 80, i * tpb, (i + 1) * tpb));
  }
  
  const track: TrackInfo = {
    index: 0,
    name: 'Con cambios de tempo',
    channel: 0,
    program: 0,
    isPercussion: false,
    role: 'melody',
    polyphony: 'mono',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = 12 * tpb;
  project.totalDuration = (4 * tpb / tpb) * 0.5 + (4 * tpb / tpb) * (60 / 140) + (4 * tpb / tpb) * 0.6;
  project.quantizeConfig.trackIndices = [0];
  
  return project;
}

// 15. Cambios de compás
function generateTimeSignatureChanges(): MidiProject {
  const project = createBaseProject('Cambios de compás');
  project.tempoMap = [{ tick: 0, bpm: 120, microsecondsPerBeat: 500000 }];
  project.timeSignatures = [
    { tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 },
    { tick: 4 * 480, numerator: 3, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 },
    { tick: 7 * 480, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }
  ];
  
  const tpb = project.ticksPerBeat;
  const notes: MidiNote[] = [];
  
  // 4/4 (4 tiempos), 3/4 (3 tiempos), 4/4 (4 tiempos)
  for (let i = 0; i < 11; i++) {
    notes.push(createNote(0, 0, 60 + (i % 8), 80, i * tpb, (i + 1) * tpb));
  }
  
  const track: TrackInfo = {
    index: 0,
    name: 'Con cambios de compás',
    channel: 0,
    program: 0,
    isPercussion: false,
    role: 'melody',
    polyphony: 'mono',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = 11 * tpb;
  project.totalDuration = (project.totalTicks / tpb) * 0.5;
  project.quantizeConfig.trackIndices = [0];
  
  return project;
}

// 16. Articulación legato y staccato
function generateArticulation(): MidiProject {
  const project = createBaseProject('Legato y staccato');
  project.tempoMap = [{ tick: 0, bpm: 120, microsecondsPerBeat: 500000 }];
  project.timeSignatures = [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  const notes: MidiNote[] = [];
  
  // Legato: notas conectadas
  notes.push(createNote(0, 0, 60, 80, 0, tpb));
  notes.push(createNote(0, 0, 62, 80, tpb, 2 * tpb));
  notes.push(createNote(0, 0, 64, 80, 2 * tpb, 3 * tpb));
  
  // Staccato: notas cortas
  notes.push(createNote(0, 0, 65, 90, 3 * tpb, 3 * tpb + tpb / 4));
  notes.push(createNote(0, 0, 67, 90, 3 * tpb + tpb / 2, 3 * tpb + 3 * tpb / 4));
  notes.push(createNote(0, 0, 69, 90, 4 * tpb - tpb / 2, 4 * tpb - tpb / 4));
  
  const track: TrackInfo = {
    index: 0,
    name: 'Articulación',
    channel: 0,
    program: 0,
    isPercussion: false,
    role: 'melody',
    polyphony: 'mono',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = 4 * tpb;
  project.totalDuration = (project.totalTicks / tpb) * 0.5;
  project.quantizeConfig.trackIndices = [0];
  
  return project;
}

// 17. Sustain
function generateSustain(): MidiProject {
  const project = createBaseProject('Sustain');
  project.tempoMap = [{ tick: 0, bpm: 100, microsecondsPerBeat: 600000 }];
  project.timeSignatures = [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  const notes: MidiNote[] = [];
  
  // Notas con sustain (pedal)
  notes.push(createNote(0, 0, 60, 80, 0, tpb / 2)); // Nota corta
  notes.push(createNote(0, 0, 64, 80, tpb, tpb + tpb / 2)); // Nota corta
  notes.push(createNote(0, 0, 67, 85, 2 * tpb, 4 * tpb)); // Nota larga con sustain
  
  const track: TrackInfo = {
    index: 0,
    name: 'Con sustain',
    channel: 0,
    program: 0,
    isPercussion: false,
    role: 'melody',
    polyphony: 'mono',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = 4 * tpb;
  project.totalDuration = (project.totalTicks / tpb) * 0.6;
  project.quantizeConfig.trackIndices = [0];
  
  return project;
}

// 18. Ejemplo con desviaciones temporales conocidas
function generateWithTimingDeviations(): MidiProject {
  const project = createBaseProject('Con desviaciones temporales');
  project.tempoMap = [{ tick: 0, bpm: 120, microsecondsPerBeat: 500000 }];
  project.timeSignatures = [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  const notes: MidiNote[] = [];
  
  // Notas con desviaciones conocidas para cuantización
  notes.push(createNote(0, 0, 60, 80, 10, tpb - 10)); // Desviación +10 ticks
  notes.push(createNote(0, 0, 62, 80, tpb + 50, 2 * tpb - 30)); // Desviación +50 ticks
  notes.push(createNote(0, 0, 64, 80, 2 * tpb - 20, 3 * tpb + 40)); // Desviación -20 ticks
  notes.push(createNote(0, 0, 65, 80, 3 * tpb + 80, 4 * tpb - 60)); // Desviación +80 ticks
  
  // Marcar como desviadas
  notes.forEach(n => {
    n.isFlagged = true;
    n.flagReason = 'Desviación temporal conocida para práctica de cuantización';
  });
  
  const track: TrackInfo = {
    index: 0,
    name: 'Desviaciones conocidas',
    channel: 0,
    program: 0,
    isPercussion: false,
    role: 'melody',
    polyphony: 'mono',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = 4 * tpb;
  project.totalDuration = (project.totalTicks / tpb) * 0.5;
  project.quantizeConfig.trackIndices = [0];
  
  return project;
}

// 19. Ejemplo con clusters ambiguos
function generateAmbiguousClusters(): MidiProject {
  const project = createBaseProject('Clusters ambiguos');
  project.tempoMap = [{ tick: 0, bpm: 120, microsecondsPerBeat: 500000 }];
  project.timeSignatures = [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }];
  
  const tpb = project.ticksPerBeat;
  const notes: MidiNote[] = [];
  
  // Cluster ambiguo: 4 notas muy cercanas que podrían ser semicorcheas
  const baseTick = 0;
  notes.push(createNote(0, 0, 60, 80, baseTick, baseTick + tpb / 4));
  notes.push(createNote(0, 0, 62, 80, baseTick + 5, baseTick + tpb / 4 + 5));
  notes.push(createNote(0, 0, 64, 80, baseTick + 10, baseTick + tpb / 4 + 10));
  notes.push(createNote(0, 0, 65, 80, baseTick + 15, baseTick + tpb / 4 + 15));
  
  // Marcar como cluster ambiguo
  notes.forEach(n => {
    n.isFlagged = true;
    n.flagReason = 'Cluster ambiguo: ¿acorde o semicorcheas sucesivas?';
  });
  
  const track: TrackInfo = {
    index: 0,
    name: 'Cluster ambiguo',
    channel: 0,
    program: 0,
    isPercussion: false,
    role: 'melody',
    polyphony: 'poly',
    noteCount: notes.length,
    notes
  };
  
  project.tracks = [track];
  project.totalTicks = 4 * tpb;
  project.totalDuration = (project.totalTicks / tpb) * 0.5;
  project.quantizeConfig.trackIndices = [0];
  
  return project;
}

// Biblioteca completa
export const EXAMPLES: MidiExample[] = [
  {
    id: 'monophonic_44',
    name: 'Melodía monofónica en 4/4',
    description: 'Melodía simple en compás de 4/4 con notas de negra.',
    objective: 'Practicar cuantización básica en melodía monofónica.',
    suggestedParams: { gridDivision: 4, mode: 'strict', strength: 100 },
    expectedResult: 'Notas alineadas a la rejilla de negras sin alterar la melodía.',
    category: 'didactic',
    generate: generateMonophonicMelody44
  },
  {
    id: 'melody_34',
    name: 'Melodía en 3/4',
    description: 'Vals en compás de 3/4.',
    objective: 'Trabajar con compases ternarios.',
    suggestedParams: { gridDivision: 4, mode: 'strict', strength: 100 },
    expectedResult: 'Estructura de 3 tiempos por compás respetada.',
    category: 'didactic',
    generate: generateMelody34
  },
  {
    id: 'compound_68',
    name: 'Pasaje compuesto en 6/8',
    description: 'Barcarola en compás compuesto de 6/8.',
    objective: 'Cuantizar en compás compuesto manteniendo la subdivisión ternaria.',
    suggestedParams: { gridDivision: 8, mode: 'strict', strength: 100 },
    expectedResult: 'Corcheas alineadas manteniendo el pulso de 6/8.',
    category: 'didactic',
    generate: generateCompound68
  },
  {
    id: 'sixteenth_notes',
    name: 'Semicorcheas regulares',
    description: 'Pasaje de semicorcheas en escala.',
    objective: 'Cuantización a rejilla fina de semicorcheas.',
    suggestedParams: { gridDivision: 16, mode: 'strict', strength: 100 },
    expectedResult: '16 semicorcheas perfectamente alineadas.',
    category: 'validation',
    generate: generateSixteenthNotes
  },
  {
    id: 'triplets',
    name: 'Tresillos',
    description: 'Tresillos de corchea.',
    objective: 'Cuantizar tresillos activando la opción de tresillos.',
    suggestedParams: { gridDivision: 8, mode: 'strict', strength: 100 },
    expectedResult: 'Tresillos preservados con rejilla ternaria.',
    category: 'didactic',
    generate: generateTriplets
  },
  {
    id: 'syncopation',
    name: 'Síncopas y contratiempos',
    description: 'Notas en tiempos débiles.',
    objective: 'Conservar síncopas sin forzarlas a tiempos fuertes.',
    suggestedParams: { gridDivision: 8, mode: 'interpretive', strength: 50 },
    expectedResult: 'Síncopas conservadas en su posición rítmica.',
    category: 'validation',
    generate: generateSyncopation
  },
  {
    id: 'anacrusis',
    name: 'Anacrusa',
    description: 'Melodía con anacrusa inicial.',
    objective: 'Identificar y respetar la anacrusa.',
    suggestedParams: { gridDivision: 8, mode: 'strict', strength: 100 },
    expectedResult: 'Anacrusa conservada sin desplazar al compás 1.',
    category: 'didactic',
    generate: generateAnacrusis
  },
  {
    id: 'long_notes',
    name: 'Notas largas y silencios',
    description: 'Adagio con notas de blanca y silencios.',
    objective: 'Conservar duraciones largas y silencios.',
    suggestedParams: { gridDivision: 4, mode: 'strict', strength: 100 },
    expectedResult: 'Silencios y notas largas preservados.',
    category: 'validation',
    generate: generateLongNotesAndRests
  },
  {
    id: 'chords',
    name: 'Acordes simultáneos',
    description: 'Acordes de 3 notas.',
    objective: 'Cuantizar acordes manteniendo la simultaneidad.',
    suggestedParams: { gridDivision: 4, mode: 'strict', strength: 100 },
    expectedResult: 'Notas del acorde perfectamente simultáneas.',
    category: 'validation',
    generate: generateChords
  },
  {
    id: 'arpeggios',
    name: 'Arpegios',
    description: 'Arpegio ascendente y descendente.',
    objective: 'Cuantizar arpegios manteniendo la sucesión.',
    suggestedParams: { gridDivision: 8, mode: 'strict', strength: 100 },
    expectedResult: 'Arpegio fluido con notas bien separadas.',
    category: 'didactic',
    generate: generateArpeggios
  },
  {
    id: 'two_voices',
    name: 'Dos voces',
    description: 'Melodía y bajo en la misma pista.',
    objective: 'Trabajar con polifonía en una sola pista.',
    suggestedParams: { gridDivision: 4, mode: 'strict', strength: 100 },
    expectedResult: 'Ambas voces cuantizadas independientemente.',
    category: 'didactic',
    generate: generateTwoVoices
  },
  {
    id: 'bass_accompaniment',
    name: 'Bajo y acompañamiento',
    description: 'Bajo monofónico y acordes de acompañamiento.',
    objective: 'Procesar múltiples pistas con diferentes funciones.',
    suggestedParams: { gridDivision: 8, mode: 'strict', strength: 100 },
    expectedResult: 'Bajo y acompañamiento sincronizados.',
    category: 'didactic',
    generate: generateBassAndAccompaniment
  },
  {
    id: 'percussion',
    name: 'Percusión',
    description: 'Patrón de batería básico.',
    objective: 'Cuantizar percusión en canal 10.',
    suggestedParams: { gridDivision: 8, mode: 'strict', strength: 100 },
    expectedResult: 'Patrón rítmico preciso.',
    category: 'didactic',
    generate: generatePercussion
  },
  {
    id: 'tempo_changes',
    name: 'Cambios de tempo',
    description: 'Pieza con acelerando y ritardando.',
    objective: 'Respetar el mapa de tempo durante la cuantización.',
    suggestedParams: { gridDivision: 4, mode: 'strict', strength: 100 },
    expectedResult: 'Cambios de tempo preservados.',
    category: 'validation',
    generate: generateTempoChanges
  },
  {
    id: 'time_sig_changes',
    name: 'Cambios de compás',
    description: 'Pieza con cambios de 4/4 a 3/4 y vuelta.',
    objective: 'Adaptar la rejilla a los cambios de compás.',
    suggestedParams: { gridDivision: 4, mode: 'strict', strength: 100 },
    expectedResult: 'Compás adaptado en cada sección.',
    category: 'validation',
    generate: generateTimeSignatureChanges
  },
  {
    id: 'articulation',
    name: 'Legato y staccato',
    description: 'Mezcla de articulaciones.',
    objective: 'Conservar las diferencias de duración entre legato y staccato.',
    suggestedParams: { gridDivision: 4, mode: 'interpretive', strength: 70 },
    expectedResult: 'Articulaciones preservadas.',
    category: 'validation',
    generate: generateArticulation
  },
  {
    id: 'sustain',
    name: 'Sustain',
    description: 'Notas con pedal de sustain.',
    objective: 'Distinguir duración de tecla de duración sonora.',
    suggestedParams: { gridDivision: 4, mode: 'strict', strength: 100 },
    expectedResult: 'Sustain conservado en la reproducción.',
    category: 'didactic',
    generate: generateSustain
  },
  {
    id: 'timing_deviations',
    name: 'Desviaciones temporales conocidas',
    description: 'Notas con desviaciones intencionadas para practicar.',
    objective: 'Corregir desviaciones conocidas con cuantización estricta.',
    suggestedParams: { gridDivision: 4, mode: 'strict', strength: 100 },
    expectedResult: 'Todas las notas alineadas a la rejilla.',
    category: 'validation',
    generate: generateWithTimingDeviations
  },
  {
    id: 'ambiguous_clusters',
    name: 'Clusters ambiguos',
    description: 'Notas muy cercanas que podrían ser acorde o semicorcheas.',
    objective: 'Practicar la revisión manual de clusters.',
    suggestedParams: { gridDivision: 16, mode: 'assisted', strength: 100 },
    expectedResult: 'Cluster señalado para revisión manual.',
    category: 'validation',
    generate: generateAmbiguousClusters
  }
];

export function getExampleById(id: string): MidiExample | undefined {
  return EXAMPLES.find(ex => ex.id === id);
}

export function getExamplesByCategory(category: 'didactic' | 'validation'): MidiExample[] {
  return EXAMPLES.filter(ex => ex.category === category);
}
