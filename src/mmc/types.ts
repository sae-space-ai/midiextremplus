/**
 * MMC v1.0 — Matriz Maestra de Conversión
 * Tipos fundamentales
 *
 * Single Source of Truth musical para análisis, cuantización,
 * corrección, reconstrucción y trazabilidad.
 *
 * CONVENCIONES:
 * - Los campos sin evidencia se representan con null | undefined.
 * - Nunca se inventan valores.
 * - Todo evento conserva referencia al evento fuente (source_event).
 * - Toda modificación se registra en transformation_history.
 */

// ============================================================
// ESTADOS DE CELDA (Sección 3 del spec)
// ============================================================

export type CellState =
  | 'ATTACK'
  | 'SUSTAIN'
  | 'RELEASE'
  | 'REST'
  | 'TIE_IN'
  | 'TIE_OUT'
  | 'UNCERTAIN';

// ============================================================
// ESTADOS DE VALIDACIÓN (Sección 16 del spec)
// ============================================================

export type ValidationStatus =
  | 'MMC_VALIDATED'
  | 'MMC_REVIEW_REQUIRED'
  | 'MMC_PENDING'
  | 'MMC_HUMAN_OVERRIDE';

// ============================================================
// ESTADOS DE CLUSTER (Sección 6 del spec)
// ============================================================

export type ClusterStatus =
  | 'NONE'
  | 'SUSPECT_CLUSTER'
  | 'VALID_CHORD'
  | 'VOICE_COLLISION'
  | 'HUMAN_RESOLVED';

// ============================================================
// ESTADOS DE MICRO-GAP (Sección 8 del spec)
// ============================================================

export type MicroGapStatus =
  | 'NONE'
  | 'MICRO_GAP_DETECTED'
  | 'DETECTION_ERROR'
  | 'SEGMENTATION_ERROR'
  | 'NATURAL_RELEASE'
  | 'BREATH'
  | 'ARTICULATION'
  | 'MUSICAL_REST';

// ============================================================
// CLASIFICACIÓN INSTRUMENTAL (Sección 10 del spec)
// ============================================================

export type InstrumentLayer =
  | 'L0_GRID_MASTER'
  | 'L1_RHYTHMIC_BASE'
  | 'L2_HARMONIC_BASS'
  | 'L3_STRINGS_WOODWINDS'
  | 'L4_BRASS'
  | 'L5_AUXILIARY'
  | 'L6_RECONCILIATION';

// ============================================================
// CAPACIDAD INSTRUMENTAL
// ============================================================

export type InstrumentCapability =
  | 'MONOPHONIC'
  | 'POLYPHONIC'
  | 'PERCUSSION'
  | 'UNKNOWN';

// ============================================================
// ARTICULACIÓN
// ============================================================

export type Articulation =
  | 'NORMAL'
  | 'STACCATO'
  | 'LEGATO'
  | 'TENUTO'
  | 'MARCATO'
  | 'ACCENT'
  | 'UNKNOWN';

// ============================================================
// DIRECCIÓN MELÓDICA
// ============================================================

export type MelodicDirection = 'UP' | 'DOWN' | 'SAME' | 'UNKNOWN';

// ============================================================
// ROL ARMÓNICO
// ============================================================

export type HarmonicRole =
  | 'ROOT'
  | 'THIRD'
  | 'FIFTH'
  | 'SEVENTH'
  | 'EXTENSION'
  | 'BASS'
  | 'PASSING_TONE'
  | 'NEIGHBOR_TONE'
  | 'SUSPENSION'
  | 'NON_HARMONIC'
  | 'UNKNOWN';

// ============================================================
// TRANSFORMACIÓN (Sección 13 del spec)
// ============================================================

export interface TransformationRecord {
  id: string;
  timestamp: number;
  module: string;
  module_version: string;
  operation: string;
  field_changed: string;
  value_before: unknown;
  value_after: unknown;
  reason: string;
  confidence: number | null;
  human_override: boolean;
}

// ============================================================
// EVENTO MMC (Sección 4 del spec)
// ============================================================

export interface MMCEvent {
  // Identidad
  event_id: string;
  track_id: number;
  instrument_id: number | null;
  instrument_family: string | null;
  voice_id: number;
  source_event_id: string | null; // referencia al MidiNote.id original

  // Posición temporal
  measure: number;
  beat: number;
  cell_16: number; // 1-16 para 4/4
  subdivision: number;
  absolute_tick: number;

  // Altura
  pitch_midi: number;
  pitch_hz: number | null;
  pitch_class: number;
  octave: number;

  // Timing
  raw_onset: number;
  quantized_onset: number | null;
  onset_error: number | null;
  raw_duration: number;
  quantized_duration: number | null;
  end_cell: number | null;
  tie_state: 'NONE' | 'TIE_IN' | 'TIE_OUT' | 'TIE_THROUGH' | null;

  // Dinámica y articulación
  velocity: number;
  dynamic_level: string | null;
  articulation: Articulation;

  // Evidencia acústica (Sección 9) — null si no hay evidencia
  fundamental_frequency: number | null;
  harmonic_profile: number[] | null;
  spectral_centroid: number | null;
  spectral_flux: number | null;
  rms_energy: number | null;
  attack_transient: number | null;
  envelope: number[] | null;
  periodicity: number | null;
  noise_ratio: number | null;
  confidence_acoustic: number | null;

  // Continuidad melódica (Sección 7)
  melodic_direction: MelodicDirection;
  previous_pitch: number | null;
  next_pitch: number | null;
  interval_previous: number | null;
  interval_next: number | null;
  continuity_score: number | null;

  // Contexto armónico
  harmonic_role: HarmonicRole;
  chord_context: string | null;
  bass_relation: number | null;
  consonance_score: number | null;

  // Clasificación estructural
  cluster_candidate: boolean;
  cluster_status: ClusterStatus;
  duplicate_candidate: boolean;
  overlap_state: 'NONE' | 'OVERLAP_SAME_PITCH' | 'OVERLAP_DIFF_PITCH' | 'RESOLVED';
  voice_collision: boolean;

  // Micro-gap (Sección 8)
  micro_gap_status: MicroGapStatus;
  micro_gap_ticks: number | null;

  // Estado de celda
  cell_state: CellState;

  // Trazabilidad (Sección 13)
  transformation_history: TransformationRecord[];
  confidence_total: number | null;

  // Intervención humana (Sección 14)
  human_override: boolean;
  human_override_note: string | null;

  // Capa jerárquica (Sección 10)
  layer: InstrumentLayer;

  // Validación (Sección 16)
  validation_status: ValidationStatus;
  validation_components: {
    R: number | null; // grid rítmico
    T: number | null; // ataques y duraciones
    M: number | null; // continuidad melódica
    H: number | null; // coherencia armónica
    I: number | null; // plausibilidad instrumental
    A: number | null; // coherencia acústica
  };
}

// ============================================================
// CELDA MMC (Sección 2 del spec)
// ============================================================

export interface MMCCell {
  cell_index: number; // 1-16 en 4/4
  state: CellState;
  events: string[]; // event_ids presentes en esta celda
  is_attack_position: boolean;
  is_sustain_position: boolean;
  is_release_position: boolean;
  is_rest: boolean;
}

// ============================================================
// VOZ MMC (Sección 19 del spec)
// ============================================================

export interface MMCVoice {
  voice_id: number;
  instrument_id: number | null;
  instrument_capability: InstrumentCapability;
  event_ids: string[];
}

// ============================================================
// COMPÁS MMC (Sección 11 del spec)
// ============================================================

export interface MMCMeasure {
  measure_number: number;
  time_signature_numerator: number;
  time_signature_denominator: number;
  cell_count: number; // 16 en 4/4, 12 en 3/4, etc.
  cells: MMCCell[];
  voices: MMCVoice[];
  event_ids: string[];
  validation_status: ValidationStatus;
}

// ============================================================
// PISTA MMC
// ============================================================

export interface MMCTrack {
  track_id: number;
  instrument_id: number | null;
  instrument_family: string | null;
  instrument_capability: InstrumentCapability;
  layer: InstrumentLayer;
  channel: number;
  name: string;
  measures: MMCMeasure[];
  event_ids: string[];
  voices: MMCVoice[];
}

// ============================================================
// PROYECTO MMC (Sección 1 del spec)
// ============================================================

export interface MMCProject {
  id: string;
  version: string;
  source_project_id: string; // referencia al MidiProject original
  created_at: number;
  updated_at: number;

  // Grid maestro (L0)
  ticks_per_beat: number;
  tempo_map: { tick: number; bpm: number; microseconds_per_beat: number }[];
  time_signatures: { tick: number; numerator: number; denominator: number }[];
  total_ticks: number;
  total_measures: number;

  // Capas (Sección 10)
  tracks: MMCTrack[];

  // Índice global de eventos
  events: Map<string, MMCEvent>;

  // Feature flags (Sección 27)
  features: {
    MMC_ENABLED: boolean;
    ANTI_CLUSTER_ENABLED: boolean;
    MELODIC_CONTINUITY_ENABLED: boolean;
    ACOUSTIC_VALIDATION_ENABLED: boolean;
  };

  // Estado global
  validation_status: ValidationStatus;

  // Logging (Sección 23)
  log: MMCLogEntry[];
}

// ============================================================
// LOGGING (Sección 23)
// ============================================================

export interface MMCLogEntry {
  timestamp: number;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  module: string;
  message: string;
  event_id?: string;
  data?: unknown;
}

// ============================================================
// RESULTADO DE OPERACIÓN MMC
// ============================================================

export interface MMCOperationResult {
  success: boolean;
  events_modified: number;
  events_created: number;
  events_removed: number;
  warnings: string[];
  errors: string[];
  log: MMCLogEntry[];
}

// ============================================================
// UTILIDADES DE TIPO
// ============================================================

export function isMonophonicInstrument(capability: InstrumentCapability): boolean {
  return capability === 'MONOPHONIC';
}

export function isPolyphonicInstrument(capability: InstrumentCapability): boolean {
  return capability === 'POLYPHONIC';
}

export function isPercussionInstrument(capability: InstrumentCapability): boolean {
  return capability === 'PERCUSSION';
}
