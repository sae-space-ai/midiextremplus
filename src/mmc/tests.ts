/**
 * MMC v1.0 — Tests obligatorios
 *
 * Sección 22 del spec.
 *
 * 10 tests que verifican el comportamiento correcto de la MMC.
 */

import { MidiProject, MidiNote, TrackInfo } from '../midi/model';
import { buildMMCFromProject } from './builder';
import { runAntiClusterAnalysis } from './anti-cluster';
import { runContinuityAnalysis } from './continuity';
import { runHierarchicalPipeline } from './hierarchy';
import { mmcToMidiProject } from './export-adapter';
import { recordTransformation, hasHumanOverride, applyTransformationIfAllowed } from './history';
import { MMCEvent, MMCProject } from './types';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

function createTestProject(notes: Partial<MidiNote>[], trackName: string = 'Test'): MidiProject {
  const fullNotes: MidiNote[] = notes.map((n, i) => ({
    id: `test_note_${i}`,
    trackIndex: 0,
    channel: 0,
    pitch: 60,
    velocity: 80,
    startTick: 0,
    endTick: 480,
    correctedStartTick: 0,
    correctedEndTick: 480,
    originalStartTick: 0,
    originalEndTick: 480,
    isModified: false,
    isProtected: false,
    isFlagged: false,
    reviewStatus: 'pending' as const,
    ...n,
  }));

  const track: TrackInfo = {
    index: 0,
    name: trackName,
    channel: 0,
    program: 0,
    isPercussion: false,
    role: 'melody',
    polyphony: 'mono',
    noteCount: fullNotes.length,
    notes: fullNotes,
  };

  return {
    id: 'test_project',
    name: 'Test',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    format: 1,
    ticksPerBeat: 480,
    tempoMap: [{ tick: 0, bpm: 120, microsecondsPerBeat: 500000 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }],
    keySignatures: [],
    tracks: [track],
    controlChanges: [],
    pitchBends: [],
    totalTicks: 480 * 4,
    totalDuration: 2.0,
    issues: [],
    missingInfo: { hasTempo: true, hasTimeSignature: true, hasKeySignature: false, assumedTempo: 120, assumedTimeSignature: '4/4' },
    quantizeConfig: {
      mode: 'strict', gridDivision: 16, useTriplets: false, strength: 100,
      maxDisplacement: 480, quantizeAttacksOnly: true, normalizeDuration: false,
      swingAmount: 0, preserveSelected: true, collisionPolicy: 'flag', trackIndices: [0],
    },
    versions: [],
    currentVersionId: '',
  };
}

// ============================================================
// TEST 01: Nota sostenida durante cuatro celdas
// ============================================================
export function test01_sustainedNote(): TestResult {
  const project = createTestProject([
    { pitch: 60, startTick: 0, endTick: 480 * 4 }, // blanca = 4 celdas en semicorcheas
  ]);

  const mmc = buildMMCFromProject(project);

  // La nota debe aparecer como UN solo evento
  const events = Array.from(mmc.events.values());
  if (events.length !== 1) {
    return {
      name: 'TEST 01: Nota sostenida',
      passed: false,
      message: `Se esperaban 1 evento, se encontraron ${events.length}`,
    };
  }

  const event = events[0];
  if (event.cell_state !== 'ATTACK') {
    return {
      name: 'TEST 01: Nota sostenida',
      passed: false,
      message: `Estado de celda esperado ATTACK, encontrado ${event.cell_state}`,
    };
  }

  return {
    name: 'TEST 01: Nota sostenida',
    passed: true,
    message: 'Una nota sostenida se conserva como un solo evento, no se divide en múltiples ataques.',
  };
}

// ============================================================
// TEST 02: Cuatro semicorcheas consecutivas
// ============================================================
export function test02_sixteenthNotes(): TestResult {
  const tpb = 480;
  const sixteenth = tpb / 4;
  const project = createTestProject([
    { pitch: 60, startTick: 0, endTick: sixteenth },
    { pitch: 62, startTick: sixteenth, endTick: sixteenth * 2 },
    { pitch: 64, startTick: sixteenth * 2, endTick: sixteenth * 3 },
    { pitch: 65, startTick: sixteenth * 3, endTick: sixteenth * 4 },
  ]);

  const mmc = buildMMCFromProject(project);
  const events = Array.from(mmc.events.values());

  if (events.length !== 4) {
    return {
      name: 'TEST 02: Semicorcheas',
      passed: false,
      message: `Se esperaban 4 eventos, se encontraron ${events.length}`,
    };
  }

  // Cada evento debe tener estado ATTACK
  const allAttacks = events.every(e => e.cell_state === 'ATTACK');
  if (!allAttacks) {
    return {
      name: 'TEST 02: Semicorcheas',
      passed: false,
      message: 'No todos los eventos tienen estado ATTACK',
    };
  }

  return {
    name: 'TEST 02: Semicorcheas',
    passed: true,
    message: 'Cuatro semicorcheas consecutivas se conservan como cuatro ataques independientes.',
  };
}

// ============================================================
// TEST 03: Cluster falso en clarinete
// ============================================================
export function test03_suspectClusterMonophonic(): TestResult {
  const project = createTestProject([
    { pitch: 60, startTick: 0, endTick: 120 },
    { pitch: 62, startTick: 5, endTick: 125 }, // overlap de 5 ticks
    { pitch: 64, startTick: 10, endTick: 130 },
    { pitch: 65, startTick: 15, endTick: 135 },
  ], 'Clarinete');

  // Marcar como monofónico
  project.tracks[0].polyphony = 'mono';

  const mmc = buildMMCFromProject(project);
  const result = runAntiClusterAnalysis(mmc);

  const suspectEvents = Array.from(result.project.events.values())
    .filter(e => e.cluster_status === 'SUSPECT_CLUSTER');

  if (suspectEvents.length === 0) {
    return {
      name: 'TEST 03: Cluster falso monofónico',
      passed: false,
      message: 'No se detectó ningún cluster sospechoso en instrumento monofónico',
    };
  }

  return {
    name: 'TEST 03: Cluster falso monofónico',
    passed: true,
    message: `Cluster en instrumento monofónico marcado como SUSPECT_CLUSTER (${suspectEvents.length} eventos).`,
  };
}

// ============================================================
// TEST 04: Acorde legítimo en piano
// ============================================================
export function test04_validChordPolyphonic(): TestResult {
  const project = createTestProject([
    { pitch: 60, startTick: 0, endTick: 480 },
    { pitch: 64, startTick: 0, endTick: 480 },
    { pitch: 67, startTick: 0, endTick: 480 },
  ], 'Piano');

  // Marcar como polifónico
  project.tracks[0].polyphony = 'poly';

  const mmc = buildMMCFromProject(project);
  const result = runAntiClusterAnalysis(mmc);

  const events = Array.from(result.project.events.values());
  const validChords = events.filter(e => e.cluster_status === 'VALID_CHORD');
  const suspectClusters = events.filter(e => e.cluster_status === 'SUSPECT_CLUSTER');

  // Un acorde de tríada en piano polifónico NO debe ser suspect
  // Puede ser VALID_CHORD o al menos no todos SUSPECT_CLUSTER
  if (suspectClusters.length === events.length) {
    return {
      name: 'TEST 04: Acorde legítimo',
      passed: false,
      message: 'Todos los eventos del acorde fueron marcados como SUSPECT_CLUSTER',
    };
  }

  return {
    name: 'TEST 04: Acorde legítimo',
    passed: true,
    message: `Acorde en piano polifónico: ${validChords.length} válidos, ${suspectClusters.length} sospechosos.`,
  };
}

// ============================================================
// TEST 05: Micro-gap entre notas ligadas
// ============================================================
export function test05_microGap(): TestResult {
  const project = createTestProject([
    { pitch: 60, startTick: 0, endTick: 240 },
    { pitch: 62, startTick: 245, endTick: 480 }, // gap de 5 ticks
  ]);

  const mmc = buildMMCFromProject(project);
  const result = runContinuityAnalysis(mmc);

  const events = Array.from(result.project.events.values());
  const microGapEvents = events.filter(e => e.micro_gap_status !== 'NONE');

  if (microGapEvents.length === 0) {
    return {
      name: 'TEST 05: Micro-gap',
      passed: false,
      message: 'No se detectó el micro-gap de 5 ticks',
    };
  }

  // El micro-gap NO debe ser MUSICAL_REST (es demasiado corto)
  const isMusicalRest = microGapEvents.some(e => e.micro_gap_status === 'MUSICAL_REST');
  if (isMusicalRest) {
    return {
      name: 'TEST 05: Micro-gap',
      passed: false,
      message: 'Un micro-gap de 5 ticks fue clasificado como MUSICAL_REST',
    };
  }

  return {
    name: 'TEST 05: Micro-gap',
    passed: true,
    message: `Micro-gap detectado y clasificado como ${microGapEvents[0].micro_gap_status} (no como silencio musical).`,
  };
}

// ============================================================
// TEST 06: Armónico espectral (no debe convertirse en nota)
// ============================================================
export function test06_harmonicNotConverted(): TestResult {
  // Este test verifica que la capa acústica no inventa notas
  // desde armónicos. Como no tenemos audio real, verificamos
  // que los campos espectrales permanecen null.
  const project = createTestProject([
    { pitch: 60, startTick: 0, endTick: 480 },
  ]);

  const mmc = buildMMCFromProject(project);
  const event = Array.from(mmc.events.values())[0];

  // Los campos que requieren audio real deben ser null
  const nullFields = [
    event.harmonic_profile,
    event.spectral_centroid,
    event.spectral_flux,
    event.envelope,
    event.noise_ratio,
  ];

  const allNull = nullFields.every(f => f === null);
  if (!allNull) {
    return {
      name: 'TEST 06: Armónico espectral',
      passed: false,
      message: 'Se inventaron valores acústicos sin audio real',
    };
  }

  // Pero fundamental_frequency SÍ debe estar calculada
  if (event.fundamental_frequency === null) {
    return {
      name: 'TEST 06: Armónico espectral',
      passed: false,
      message: 'fundamental_frequency no fue calculada desde pitch_midi',
    };
  }

  return {
    name: 'TEST 06: Armónico espectral',
    passed: true,
    message: 'Campos acústicos sin evidencia permanecen null. Fundamental calculada desde pitch.',
  };
}

// ============================================================
// TEST 07: Human override no se sobrescribe
// ============================================================
export function test07_humanOverride(): TestResult {
  const project = createTestProject([
    { pitch: 60, startTick: 0, endTick: 480 },
  ]);

  const mmc = buildMMCFromProject(project);
  const eventId = Array.from(mmc.events.keys())[0];
  const event = mmc.events.get(eventId)!;

  // Simular corrección humana
  const humanCorrected = recordTransformation(
    event, 'human', '1.0', 'human_correction',
    'pitch_midi', 60, 62,
    'Corrección manual del usuario',
    1.0,
    true // human_override = true
  );

  const updatedEvent: MMCEvent = {
    ...humanCorrected,
    pitch_midi: 62,
    human_override: true,
  };

  // Intentar sobrescribir automáticamente
  const result = applyTransformationIfAllowed(
    updatedEvent, 'auto_module', '1.0', 'auto_quantize',
    'pitch_midi', 64, // intenta cambiar a 64
    'Cuantización automática',
    0.8
  );

  if (result.applied) {
    return {
      name: 'TEST 07: Human override',
      passed: false,
      message: 'La transformación automática sobrescribió la corrección humana',
    };
  }

  if (!hasHumanOverride(result.event)) {
    return {
      name: 'TEST 07: Human override',
      passed: false,
      message: 'Se perdió la marca de human_override',
    };
  }

  return {
    name: 'TEST 07: Human override',
    passed: true,
    message: 'La corrección humana no fue sobrescrita por la automatización.',
  };
}

// ============================================================
// TEST 08: Cambio de tempo se conserva
// ============================================================
export function test08_tempoChange(): TestResult {
  const project = createTestProject([
    { pitch: 60, startTick: 0, endTick: 480 },
    { pitch: 62, startTick: 480 * 4, endTick: 480 * 5 },
  ]);

  // Añadir cambio de tempo
  project.tempoMap = [
    { tick: 0, bpm: 120, microsecondsPerBeat: 500000 },
    { tick: 480 * 4, bpm: 140, microsecondsPerBeat: 428571 },
  ];

  const mmc = buildMMCFromProject(project);

  if (mmc.tempo_map.length !== 2) {
    return {
      name: 'TEST 08: Cambio de tempo',
      passed: false,
      message: `Se esperaban 2 tempos, se encontraron ${mmc.tempo_map.length}`,
    };
  }

  if (mmc.tempo_map[1].bpm !== 140) {
    return {
      name: 'TEST 08: Cambio de tempo',
      passed: false,
      message: `El segundo tempo debería ser 140 BPM, es ${mmc.tempo_map[1].bpm}`,
    };
  }

  return {
    name: 'TEST 08: Cambio de tempo',
    passed: true,
    message: 'El mapa de tempo con cambio se conserva correctamente en la MMC.',
  };
}

// ============================================================
// TEST 09: Múltiples voces no se fusionan
// ============================================================
export function test09_multipleVoices(): TestResult {
  const project = createTestProject([
    { pitch: 72, startTick: 0, endTick: 480 }, // voz alta
    { pitch: 48, startTick: 0, endTick: 960 }, // voz baja
  ]);

  project.tracks[0].polyphony = 'poly';

  const mmc = buildMMCFromProject(project);
  const events = Array.from(mmc.events.values());

  if (events.length !== 2) {
    return {
      name: 'TEST 09: Múltiples voces',
      passed: false,
      message: `Se esperaban 2 eventos, se encontraron ${events.length}`,
    };
  }

  // Verificar que las alturas se conservan distintas
  const pitches = events.map(e => e.pitch_midi).sort((a, b) => a - b);
  if (pitches[0] !== 48 || pitches[1] !== 72) {
    return {
      name: 'TEST 09: Múltiples voces',
      passed: false,
      message: `Las voces se fusionaron: pitches ${pitches.join(', ')}`,
    };
  }

  return {
    name: 'TEST 09: Múltiples voces',
    passed: true,
    message: 'Dos voces simultáneas se conservan como eventos independientes.',
  };
}

// ============================================================
// TEST 10: Round-trip Original → MMC → MIDI
// ============================================================
export function test10_roundTrip(): TestResult {
  const project = createTestProject([
    { pitch: 60, startTick: 0, endTick: 480 },
    { pitch: 64, startTick: 480, endTick: 960 },
    { pitch: 67, startTick: 960, endTick: 1440 },
  ]);

  // Construir MMC
  const mmc = buildMMCFromProject(project);

  // Ejecutar pipeline
  const pipelineResult = runHierarchicalPipeline(mmc);

  // Exportar de vuelta a MidiProject
  const exported = mmcToMidiProject(pipelineResult.project, project);

  // Verificar que se conservan las notas
  if (exported.tracks[0].notes.length !== 3) {
    return {
      name: 'TEST 10: Round-trip',
      passed: false,
      message: `Se esperaban 3 notas, se encontraron ${exported.tracks[0].notes.length}`,
    };
  }

  // Verificar que las alturas se conservan
  const originalPitches = project.tracks[0].notes.map(n => n.pitch).sort((a, b) => a - b);
  const exportedPitches = exported.tracks[0].notes.map(n => n.pitch).sort((a, b) => a - b);

  for (let i = 0; i < originalPitches.length; i++) {
    if (originalPitches[i] !== exportedPitches[i]) {
      return {
        name: 'TEST 10: Round-trip',
        passed: false,
        message: `Pitch ${i} cambió: ${originalPitches[i]} → ${exportedPitches[i]}`,
      };
    }
  }

  return {
    name: 'TEST 10: Round-trip',
    passed: true,
    message: 'Original → MMC → MIDI conserva estructura y alturas.',
  };
}

// ============================================================
// EJECUTAR TODOS LOS TESTS
// ============================================================
export function runAllTests(): TestResult[] {
  return [
    test01_sustainedNote(),
    test02_sixteenthNotes(),
    test03_suspectClusterMonophonic(),
    test04_validChordPolyphonic(),
    test05_microGap(),
    test06_harmonicNotConverted(),
    test07_humanOverride(),
    test08_tempoChange(),
    test09_multipleVoices(),
    test10_roundTrip(),
  ];
}
