/**
 * Score Model — Tipos fundamentales
 *
 * Capa lógica entre MMC y renderizado/exportación.
 * Deriva de la MMC validada. No modifica eventos musicales.
 */

import { MMCEvent, MMCProject, InstrumentLayer } from '../mmc/types';

// ============================================================
// METADATOS DE PARTITURA
// ============================================================

export interface ScoreMetadata {
  title: string | null;
  subtitle: string | null;
  composer: string | null;
  arranger: string | null;
  lyricist: string | null;
  copyright: string | null;
  movementNumber: string | null;
  movementTitle: string | null;
  workNumber: string | null;
  opus: string | null;
  source: string | null;
  encoding_date: string | null;
  encoder: string | null;
  description: string | null;
}

// ============================================================
// MARCAS ESTRUCTURALES
// ============================================================

export interface RehearsalMark {
  measure: number;
  label: string; // "A", "B", "1", etc.
}

export interface RehearsalStructure {
  segno_measure: number | null;
  coda_measure: number | null;
  fine_measure: number | null;
  dacapo: boolean;
  dalsegno: boolean;
  tocoda: number | null; // measure where "To Coda" appears
  repeat_starts: number[];
  repeat_ends: number[];
  endings: { measure: number; number: number }[];
}

export interface TempoMarking {
  measure: number;
  tick: number;
  bpm: number;
  text: string | null; // "Allegro", "Andante", etc.
}

export interface KeySignatureMarking {
  measure: number;
  tick: number;
  key: string;
  mode: 'major' | 'minor';
}

export interface TimeSignatureMarking {
  measure: number;
  tick: number;
  numerator: number;
  denominator: number;
}

// ============================================================
// ELEMENTOS DE NOTACIÓN
// ============================================================

export type ArticulationMark =
  | 'staccato'
  | 'accent'
  | 'tenuto'
  | 'marcato'
  | 'strong-accent'
  | 'detached-legato'
  | 'staccatissimo'
  | 'spiccato'
  | 'bow-up'
  | 'bow-down'
  | 'open-string'
  | 'snap-pizzicato'
  | 'fermata'
  | 'breath-mark';

export type DynamicMark =
  | 'pppp' | 'ppp' | 'pp' | 'p' | 'mp'
  | 'mf' | 'f' | 'ff' | 'fff' | 'ffff'
  | 'fp' | 'sf' | 'sfz' | 'sfp' | 'fz';

export interface SlurMark {
  start_event_id: string;
  end_event_id: string;
  placement: 'above' | 'below';
}

export interface TieMark {
  start_event_id: string;
  end_event_id: string;
}

export interface TextDirection {
  measure: number;
  tick: number;
  text: string;
  placement: 'above' | 'below';
}

// ============================================================
// INSTRUMENTO EN PARTITURA
// ============================================================

export interface ScoreInstrument {
  id: string;
  name: string;
  abbreviation: string;
  midi_program: number | null;
  midi_channel: number;
  mmc_track_id: number;
  mmc_instrument_id: number | null;
  mmc_instrument_family: string | null;
  is_transposing: boolean;
  written_to_concert: number; // semitonos
  concert_pitch_min: number;
  concert_pitch_max: number;
  clef: 'treble' | 'bass' | 'alto' | 'tenor' | 'percussion';
  layer: InstrumentLayer;
  group: string; // "Woodwinds", "Brass", "Percussion", "Strings", etc.
  review_required: boolean;
  review_reason: string | null;
}

// ============================================================
// EVENTO DE PARTITURA
// ============================================================

export interface ScoreEvent {
  id: string;
  mmc_event_id: string;
  source_midi_note_id: string | null;
  type: 'note' | 'rest' | 'multi-measure-rest';

  // Posición musical
  measure: number;
  beat: number;
  voice: number;
  tick: number;

  // Altura (en concert pitch, canónica)
  pitch_midi: number | null; // null para rests
  pitch_written: number | null; // transpuesta si instrumento transpositor
  pitch_class: number | null;
  octave: number | null;

  // Duración
  duration_ticks: number;
  duration_notation: string; // "quarter", "eighth", "half", etc.
  dots: number;

  // Dinámica y articulación
  velocity: number;
  dynamic: DynamicMark | null;
  articulations: ArticulationMark[];

  // Trazabilidad
  is_derived: boolean; // true para rests generados, false para notas reales
  derivation_reason: string | null;
  mmc_validation_status: string;
  transformation_count: number;

  // Flags
  is_grace_note: boolean;
  is_cue: boolean;
  staff_line: number | null; // línea del pentagrama (para renderizado)
}

// ============================================================
// VOZ EN COMPÁS
// ============================================================

export interface ScoreVoice {
  voice_id: number;
  events: ScoreEvent[];
}

// ============================================================
// COMPÁS EN PARTITURA
// ============================================================

export interface ScoreMeasure {
  number: number;
  time_signature: { numerator: number; denominator: number } | null;
  key_signature: { key: string; mode: 'major' | 'minor' } | null;
  tempo: TempoMarking | null;
  rehearsal_mark: string | null;
  is_ending: number | null;
  repeat_start: boolean;
  repeat_end: boolean;
  voices: ScoreVoice[];
  // Para multi-measure rests
  multi_measure_rest_count: number | null; // null = no es MMR
  is_hidden: boolean; // para "hide empty staves"
}

// ============================================================
// PENTAGRAMA (STAFF)
// ============================================================

export interface ScoreStaff {
  instrument_id: string;
  instrument_name: string;
  clef: 'treble' | 'bass' | 'alto' | 'tenor' | 'percussion';
  transposition: number; // semitonos (0 = concert pitch)
  measures: ScoreMeasure[];
  is_visible: boolean;
}

// ============================================================
// GRUPO DE INSTRUMENTOS
// ============================================================

export interface ScoreGroup {
  name: string; // "Woodwinds", "Brass", etc.
  bracket_type: 'brace' | 'bracket' | 'none' | 'sub-bracket';
  staves: ScoreStaff[];
}

// ============================================================
// PARTITURA COMPLETA
// ============================================================

export interface Score {
  id: string;
  version: string;
  source_mmc_id: string;
  source_project_id: string;
  created_at: number;

  metadata: ScoreMetadata;
  structure: RehearsalStructure;

  groups: ScoreGroup[];
  all_staves: ScoreStaff[];
  all_instruments: ScoreInstrument[];

  // Marcas globales
  tempo_markings: TempoMarking[];
  key_signature_markings: KeySignatureMarking[];
  time_signature_markings: TimeSignatureMarking[];
  rehearsal_marks: RehearsalMark[];
  text_directions: TextDirection[];

  // Notación
  slurs: SlurMark[];
  ties: TieMark[];

  // Sincronización
  total_measures: number;
  total_ticks: number;

  // Trazabilidad
  event_count: number;
  derived_event_count: number;
  mmc_event_count: number;
}

// ============================================================
// PARTICELLA (INDIVIDUAL PART)
// ============================================================

export interface IndividualPart {
  id: string;
  version: string;
  source_score_id: string;
  source_mmc_id: string;
  instrument_id: string;
  instrument_name: string;
  created_at: number;

  metadata: ScoreMetadata;
  structure: RehearsalStructure;

  staff: ScoreStaff;
  instrument: ScoreInstrument;

  // Marcas globales (heredadas del score)
  tempo_markings: TempoMarking[];
  key_signature_markings: KeySignatureMarking[];
  time_signature_markings: TimeSignatureMarking[];
  rehearsal_marks: RehearsalMark[];
  text_directions: TextDirection[];

  // Sincronización absoluta
  total_measures: number;
  total_ticks: number;

  // Estadísticas
  note_count: number;
  rest_count: number;
  multi_measure_rest_count: number;
  derived_event_count: number;
}

// ============================================================
// CONFIGURACIÓN DE PLANTILLA ORQUESTAL
// ============================================================

export type EnsembleTemplate =
  | 'symphonic_orchestra'
  | 'wind_orchestra'
  | 'big_band'
  | 'chamber_ensemble'
  | 'band'
  | 'custom';

export interface OrchestralOrderConfig {
  template: EnsembleTemplate;
  groups: {
    name: string;
    bracket_type: 'brace' | 'bracket' | 'none' | 'sub-bracket';
    families: string[];
    order: number;
  }[];
}

// ============================================================
// OPCIONES DE EXPORTACIÓN
// ============================================================

export interface ScoreExportOptions {
  format: 'musicxml' | 'midi' | 'pdf' | 'svg';
  concert_pitch: boolean; // true = concert pitch, false = transposed
  hide_empty_staves: boolean;
  include_multimeasure_rests: boolean;
  include_metadata: boolean;
  part_id?: string; // null = full score, string = individual part
}

// ============================================================
// RESULTADO DE EXTRACCIÓN
// ============================================================

export interface ExtractionResult {
  score: Score | null;
  parts: IndividualPart[];
  warnings: string[];
  errors: string[];
  stats: {
    total_instruments: number;
    total_measures: number;
    total_events: number;
    derived_events: number;
    instruments_review_required: number;
  };
}
