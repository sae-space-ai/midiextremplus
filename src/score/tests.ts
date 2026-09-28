/**
 * Tests para Individual Parts y Full Conductor Score
 *
 * Verifica las 10 pruebas obligatorias de la ampliación.
 */

import { MidiProject, MidiNote, TrackInfo } from '../midi/model';
import { buildMMCFromProject } from '../mmc/builder';
import { runHierarchicalPipeline } from '../mmc/hierarchy';
import { assembleFullScore, extractAllParts } from './score-assembler';
import { extractIndividualPart } from './part-extractor';
import { exportScoreToMusicXML, exportPartToMusicXML } from './musicxml';
import { ScoreMetadata, RehearsalStructure } from './types';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
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
    program: 73, // Flauta
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

const defaultMetadata: ScoreMetadata = {
  title: 'Test Score',
  subtitle: null,
  composer: 'Test Composer',
  arranger: null,
  lyricist: null,
  copyright: null,
  movementNumber: null,
  movementTitle: null,
  workNumber: null,
  opus: null,
  source: null,
  encoding_date: null,
  encoder: null,
  description: null,
};

const defaultStructure: RehearsalStructure = {
  segno_measure: null,
  coda_measure: null,
  fine_measure: null,
  dacapo: false,
  dalsegno: false,
  tocoda: null,
  repeat_starts: [],
  repeat_ends: [],
  endings: [],
};

// ============================================================
// TEST 01: Extraer Clarinet 1 - sólo aparecen sus notas
// ============================================================
export function test01_extractSinglePart(): TestResult {
  const project = createTestProject([
    { pitch: 60, startTick: 0, endTick: 480 },
    { pitch: 62, startTick: 480, endTick: 960 },
  ], 'Clarinete 1');

  const mmc = buildMMCFromProject(project);
  const pipeline = runHierarchicalPipeline(mmc);

  const part = extractIndividualPart(
    pipeline.project,
    '0',
    defaultMetadata,
    defaultStructure
  );

  // Verificar que solo tiene notas del clarinete
  const noteCount = part.staff.measures.reduce(
    (sum, m) => sum + m.voices.reduce((vs, v) => vs + v.events.filter(e => e.type === 'note').length, 0),
    0
  );

  if (noteCount !== 2) {
    return {
      name: 'TEST 01: Extraer particella individual',
      passed: false,
      message: `Se esperaban 2 notas, se encontraron ${noteCount}`,
    };
  }

  return {
    name: 'TEST 01: Extraer particella individual',
    passed: true,
    message: 'Particella extraída correctamente con solo las notas del instrumento.',
  };
}

// ============================================================
// TEST 02: Silencios mantienen posición de compases
// ============================================================
export function test02_restsPreservePosition(): TestResult {
  const project = createTestProject([
    { pitch: 60, startTick: 0, endTick: 480 }, // Compás 1
    // Compás 2 vacío
    { pitch: 62, startTick: 480 * 2, endTick: 480 * 3 }, // Compás 3
  ], 'Flauta');

  const mmc = buildMMCFromProject(project);
  const pipeline = runHierarchicalPipeline(mmc);

  const part = extractIndividualPart(
    pipeline.project,
    '0',
    defaultMetadata,
    defaultStructure
  );

  // Verificar que hay 3 compases
  if (part.staff.measures.length !== 3) {
    return {
      name: 'TEST 02: Silencios mantienen posición',
      passed: false,
      message: `Se esperaban 3 compases, se encontraron ${part.staff.measures.length}`,
    };
  }

  // Verificar que el compás 2 tiene un silencio
  const measure2 = part.staff.measures[1];
  const hasRest = measure2.voices[0].events.some(e => e.type === 'rest');

  if (!hasRest) {
    return {
      name: 'TEST 02: Silencios mantienen posición',
      passed: false,
      message: 'El compás 2 no contiene un silencio',
    };
  }

  return {
    name: 'TEST 02: Silencios mantienen posición',
    passed: true,
    message: 'Los silencios mantienen la posición temporal de los compases.',
  };
}

// ============================================================
// TEST 03: Compás N de particella = Compás N del Full Score
// ============================================================
export function test03_measureSynchronization(): TestResult {
  const project = createTestProject([
    { pitch: 60, startTick: 0, endTick: 480 },
    { pitch: 62, startTick: 480, endTick: 960 },
  ], 'Trompeta');

  const mmc = buildMMCFromProject(project);
  const pipeline = runHierarchicalPipeline(mmc);

  const score = assembleFullScore(
    pipeline.project,
    defaultMetadata,
    defaultStructure
  );

  const part = extractIndividualPart(
    pipeline.project,
    '0',
    defaultMetadata,
    defaultStructure
  );

  // Verificar que ambos tienen el mismo número de compases
  if (score.total_measures !== part.total_measures) {
    return {
      name: 'TEST 03: Sincronización de compases',
      passed: false,
      message: `Score: ${score.total_measures} compases, Part: ${part.total_measures} compases`,
    };
  }

  // Verificar que el compás 1 tiene las mismas notas
  const scoreMeasure1 = score.all_staves[0].measures[0];
  const partMeasure1 = part.staff.measures[0];

  const scoreNotes = scoreMeasure1.voices[0].events.filter(e => e.type === 'note');
  const partNotes = partMeasure1.voices[0].events.filter(e => e.type === 'note');

  if (scoreNotes.length !== partNotes.length) {
    return {
      name: 'TEST 03: Sincronización de compases',
      passed: false,
      message: `Diferente número de notas en compás 1`,
    };
  }

  return {
    name: 'TEST 03: Sincronización de compases',
    passed: true,
    message: 'Compás N de particella coincide temporalmente con compás N del Full Score.',
  };
}

// ============================================================
// TEST 04: Instrumento transpositor - concert vs written pitch
// ============================================================
export function test04_transposingInstrument(): TestResult {
  const project = createTestProject([
    { pitch: 60, startTick: 0, endTick: 480 }, // Concert pitch C4
  ], 'Clarinet');

  // Marcar como clarinete en Sib (transpone -2 semitonos)
  project.tracks[0].program = 71; // Clarinet

  const mmc = buildMMCFromProject(project);
  const pipeline = runHierarchicalPipeline(mmc);

  const part = extractIndividualPart(
    pipeline.project,
    '0',
    defaultMetadata,
    defaultStructure
  );

  // Verificar que el instrumento es transpositor
  if (!part.instrument.is_transposing) {
    return {
      name: 'TEST 04: Instrumento transpositor',
      passed: false,
      message: 'El clarinete no fue identificado como transpositor',
    };
  }

  // Verificar que pitch_midi es concert pitch (60)
  const note = part.staff.measures[0].voices[0].events.find(e => e.type === 'note');
  if (!note || note.pitch_midi !== 60) {
    return {
      name: 'TEST 04: Instrumento transpositor',
      passed: false,
      message: `Concert pitch incorrecto: ${note?.pitch_midi}`,
    };
  }

  // Verificar que pitch_written está transpuesto (62 para Sib)
  if (note.pitch_written !== 62) {
    return {
      name: 'TEST 04: Instrumento transpositor',
      passed: false,
      message: `Written pitch incorrecto: ${note.pitch_written} (esperado 62)`,
    };
  }

  return {
    name: 'TEST 04: Instrumento transpositor',
    passed: true,
    message: 'Instrumento transpositor conserva concert pitch en MMC y written pitch correcto.',
  };
}

// ============================================================
// TEST 05: Full Score contiene todos los instrumentos
// ============================================================
export function test05_fullScoreContainsAll(): TestResult {
  // Crear proyecto con múltiples instrumentos
  const project: MidiProject = {
    id: 'multi_test',
    name: 'Multi',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    format: 1,
    ticksPerBeat: 480,
    tempoMap: [{ tick: 0, bpm: 120, microsecondsPerBeat: 500000 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }],
    keySignatures: [],
    tracks: [
      {
        index: 0, name: 'Flute', channel: 0, program: 73, isPercussion: false,
        role: 'melody', polyphony: 'mono', noteCount: 1,
        notes: [{ id: 'n1', trackIndex: 0, channel: 0, pitch: 60, velocity: 80, startTick: 0, endTick: 480, correctedStartTick: 0, correctedEndTick: 480, originalStartTick: 0, originalEndTick: 480, isModified: false, isProtected: false, isFlagged: false, reviewStatus: 'pending' }],
      },
      {
        index: 1, name: 'Clarinet', channel: 1, program: 71, isPercussion: false,
        role: 'melody', polyphony: 'mono', noteCount: 1,
        notes: [{ id: 'n2', trackIndex: 1, channel: 1, pitch: 62, velocity: 80, startTick: 0, endTick: 480, correctedStartTick: 0, correctedEndTick: 480, originalStartTick: 0, originalEndTick: 480, isModified: false, isProtected: false, isFlagged: false, reviewStatus: 'pending' }],
      },
      {
        index: 2, name: 'Trumpet', channel: 2, program: 56, isPercussion: false,
        role: 'melody', polyphony: 'mono', noteCount: 1,
        notes: [{ id: 'n3', trackIndex: 2, channel: 2, pitch: 64, velocity: 80, startTick: 0, endTick: 480, correctedStartTick: 0, correctedEndTick: 480, originalStartTick: 0, originalEndTick: 480, isModified: false, isProtected: false, isFlagged: false, reviewStatus: 'pending' }],
      },
    ],
    controlChanges: [],
    pitchBends: [],
    totalTicks: 480 * 4,
    totalDuration: 2.0,
    issues: [],
    missingInfo: { hasTempo: true, hasTimeSignature: true, hasKeySignature: false, assumedTempo: 120, assumedTimeSignature: '4/4' },
    quantizeConfig: {
      mode: 'strict', gridDivision: 16, useTriplets: false, strength: 100,
      maxDisplacement: 480, quantizeAttacksOnly: true, normalizeDuration: false,
      swingAmount: 0, preserveSelected: true, collisionPolicy: 'flag', trackIndices: [0, 1, 2],
    },
    versions: [],
    currentVersionId: '',
  };

  const mmc = buildMMCFromProject(project);
  const pipeline = runHierarchicalPipeline(mmc);

  const score = assembleFullScore(
    pipeline.project,
    defaultMetadata,
    defaultStructure
  );

  if (score.all_instruments.length !== 3) {
    return {
      name: 'TEST 05: Full Score contiene todos',
      passed: false,
      message: `Se esperaban 3 instrumentos, se encontraron ${score.all_instruments.length}`,
    };
  }

  return {
    name: 'TEST 05: Full Score contiene todos',
    passed: true,
    message: 'Full Score contiene todos los instrumentos esperados.',
  };
}

// ============================================================
// TEST 06: Orden orquestal correcto
// ============================================================
export function test06_orchestralOrder(): TestResult {
  // Similar al test 05 pero verificando orden
  const project: MidiProject = {
    id: 'order_test',
    name: 'Order',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    format: 1,
    ticksPerBeat: 480,
    tempoMap: [{ tick: 0, bpm: 120, microsecondsPerBeat: 500000 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4, clocksPerClick: 24, thirtySecondNotesPerBeat: 8 }],
    keySignatures: [],
    tracks: [
      {
        index: 0, name: 'Trumpet', channel: 0, program: 56, isPercussion: false,
        role: 'melody', polyphony: 'mono', noteCount: 0, notes: [],
      },
      {
        index: 1, name: 'Flute', channel: 1, program: 73, isPercussion: false,
        role: 'melody', polyphony: 'mono', noteCount: 0, notes: [],
      },
      {
        index: 2, name: 'Violin', channel: 2, program: 40, isPercussion: false,
        role: 'melody', polyphony: 'poly', noteCount: 0, notes: [],
      },
    ],
    controlChanges: [],
    pitchBends: [],
    totalTicks: 480 * 4,
    totalDuration: 2.0,
    issues: [],
    missingInfo: { hasTempo: true, hasTimeSignature: true, hasKeySignature: false, assumedTempo: 120, assumedTimeSignature: '4/4' },
    quantizeConfig: {
      mode: 'strict', gridDivision: 16, useTriplets: false, strength: 100,
      maxDisplacement: 480, quantizeAttacksOnly: true, normalizeDuration: false,
      swingAmount: 0, preserveSelected: true, collisionPolicy: 'flag', trackIndices: [0, 1, 2],
    },
    versions: [],
    currentVersionId: '',
  };

  const mmc = buildMMCFromProject(project);
  const pipeline = runHierarchicalPipeline(mmc);

  const score = assembleFullScore(
    pipeline.project,
    defaultMetadata,
    defaultStructure,
    'symphonic_orchestra'
  );

  // Verificar orden: Woodwinds (Flute) → Brass (Trumpet) → Strings (Violin)
  const names = score.all_instruments.map(i => i.name);
  const fluteIdx = names.indexOf('Flute');
  const trumpetIdx = names.indexOf('Trumpet');
  const violinIdx = names.indexOf('Violin');

  if (fluteIdx > trumpetIdx || trumpetIdx > violinIdx) {
    return {
      name: 'TEST 06: Orden orquestal',
      passed: false,
      message: `Orden incorrecto: ${names.join(', ')}`,
    };
  }

  return {
    name: 'TEST 06: Orden orquestal',
    passed: true,
    message: 'Orden orquestal correcto: Woodwinds → Brass → Strings.',
  };
}

// ============================================================
// TEST 07: No aparecen notas nuevas durante extracción
// ============================================================
export function test07_noNewNotes(): TestResult {
  const project = createTestProject([
    { pitch: 60, startTick: 0, endTick: 480 },
    { pitch: 62, startTick: 480, endTick: 960 },
  ], 'Oboe');

  const mmc = buildMMCFromProject(project);
  const pipeline = runHierarchicalPipeline(mmc);

  const originalNoteCount = pipeline.project.events.size;

  const part = extractIndividualPart(
    pipeline.project,
    '0',
    defaultMetadata,
    defaultStructure
  );

  const partNoteCount = part.staff.measures.reduce(
    (sum, m) => sum + m.voices.reduce((vs, v) => vs + v.events.filter(e => e.type === 'note').length, 0),
    0
  );

  if (partNoteCount > originalNoteCount) {
    return {
      name: 'TEST 07: No aparecen notas nuevas',
      passed: false,
      message: `Aparecieron notas nuevas: original ${originalNoteCount}, part ${partNoteCount}`,
    };
  }

  return {
    name: 'TEST 07: No aparecen notas nuevas',
    passed: true,
    message: 'No aparecieron notas nuevas durante la extracción.',
  };
}

// ============================================================
// TEST 08: No desaparecen notas válidas
// ============================================================
export function test08_noLostNotes(): TestResult {
  const project = createTestProject([
    { pitch: 60, startTick: 0, endTick: 480 },
    { pitch: 62, startTick: 480, endTick: 960 },
    { pitch: 64, startTick: 960, endTick: 1440 },
  ], 'Bassoon');

  const mmc = buildMMCFromProject(project);
  const pipeline = runHierarchicalPipeline(mmc);

  const originalNoteCount = pipeline.project.events.size;

  const part = extractIndividualPart(
    pipeline.project,
    '0',
    defaultMetadata,
    defaultStructure
  );

  const partNoteCount = part.staff.measures.reduce(
    (sum, m) => sum + m.voices.reduce((vs, v) => vs + v.events.filter(e => e.type === 'note').length, 0),
    0
  );

  if (partNoteCount < originalNoteCount) {
    return {
      name: 'TEST 08: No desaparecen notas válidas',
      passed: false,
      message: `Desaparecieron notas: original ${originalNoteCount}, part ${partNoteCount}`,
    };
  }

  return {
    name: 'TEST 08: No desaparecen notas válidas',
    passed: true,
    message: 'No desaparecieron notas válidas durante la extracción.',
  };
}

// ============================================================
// TEST 09: Clusters sospechosos no se exportan como acordes
// ============================================================
export function test09_suspectClustersNotExported(): TestResult {
  const project = createTestProject([
    { pitch: 60, startTick: 0, endTick: 120 },
    { pitch: 62, startTick: 5, endTick: 125 }, // Cluster sospechoso
  ], 'Clarinet');

  project.tracks[0].polyphony = 'mono';

  const mmc = buildMMCFromProject(project);
  const pipeline = runHierarchicalPipeline(mmc);

  const part = extractIndividualPart(
    pipeline.project,
    '0',
    defaultMetadata,
    defaultStructure
  );

  // Verificar que los eventos tienen flag de cluster sospechoso
  const suspectEvents = part.staff.measures.flatMap(m =>
    m.voices.flatMap(v =>
      v.events.filter(e => e.mmc_validation_status === 'MMC_REVIEW_REQUIRED')
    )
  );

  // Al menos un evento debe estar marcado como sospechoso
  if (suspectEvents.length === 0) {
    return {
      name: 'TEST 09: Clusters sospechosos',
      passed: false,
      message: 'No se marcaron clusters sospechosos',
    };
  }

  return {
    name: 'TEST 09: Clusters sospechosos',
    passed: true,
    message: 'Clusters sospechosos marcados correctamente para revisión.',
  };
}

// ============================================================
// TEST 10: MusicXML generado es válido
// ============================================================
export function test10_musicxmlValid(): TestResult {
  const project = createTestProject([
    { pitch: 60, startTick: 0, endTick: 480 },
  ], 'Flute');

  const mmc = buildMMCFromProject(project);
  const pipeline = runHierarchicalPipeline(mmc);

  const score = assembleFullScore(
    pipeline.project,
    defaultMetadata,
    defaultStructure
  );

  const musicxml = exportScoreToMusicXML(score);

  // Verificar estructura básica de MusicXML
  if (!musicxml.includes('<?xml version="1.0"')) {
    return {
      name: 'TEST 10: MusicXML válido',
      passed: false,
      message: 'Falta declaración XML',
    };
  }

  if (!musicxml.includes('<score-partwise')) {
    return {
      name: 'TEST 10: MusicXML válido',
      passed: false,
      message: 'Falta elemento score-partwise',
    };
  }

  if (!musicxml.includes('<part-list>')) {
    return {
      name: 'TEST 10: MusicXML válido',
      passed: false,
      message: 'Falta part-list',
    };
  }

  if (!musicxml.includes('<measure number="1">')) {
    return {
      name: 'TEST 10: MusicXML válido',
      passed: false,
      message: 'Falta primer compás',
    };
  }

  return {
    name: 'TEST 10: MusicXML válido',
    passed: true,
    message: 'MusicXML generado con estructura válida.',
  };
}

// ============================================================
// EJECUTAR TODOS LOS TESTS
// ============================================================
export function runAllScoreTests(): TestResult[] {
  return [
    test01_extractSinglePart(),
    test02_restsPreservePosition(),
    test03_measureSynchronization(),
    test04_transposingInstrument(),
    test05_fullScoreContainsAll(),
    test06_orchestralOrder(),
    test07_noNewNotes(),
    test08_noLostNotes(),
    test09_suspectClustersNotExported(),
    test10_musicxmlValid(),
  ];
}
