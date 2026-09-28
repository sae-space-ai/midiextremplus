/**
 * MMC v1.0 — Builder
 *
 * Convierte un MidiProject existente en MMCProject.
 * No destruye el original. Solo mapea eventos existentes.
 *
 * Sección 4, 13, 25 del spec.
 */

import { MidiProject, MidiNote } from '../midi/model';
import { getInstrumentByProgram } from '../midi/instruments';
import {
  MMCProject,
  MMCTrack,
  MMCMeasure,
  MMCEvent,
  MMCCell,
  MMCVoice,
  InstrumentLayer,
  InstrumentCapability,
  CellState,
  ValidationStatus,
} from './types';
import {
  computeGridDefinition,
  createEmptyCells,
  tickToCellIndex,
  determineCellState,
  computeTicksPerMeasure,
  tickToMeasure,
} from './grid';
import { createLogEntry } from './history';

const MMC_VERSION = '1.0.0';
const BUILDER_MODULE = 'mmc.builder';

let eventIdCounter = 0;
function nextEventId(): string {
  return `mmc_${++eventIdCounter}_${Date.now()}`;
}

/**
 * Determina la capa jerárquica de una pista según su rol.
 * Sección 10 del spec.
 */
function determineLayer(role: string, isPercussion: boolean): InstrumentLayer {
  if (isPercussion) return 'L1_RHYTHMIC_BASE';
  switch (role) {
    case 'percussion':
      return 'L1_RHYTHMIC_BASE';
    case 'bass':
      return 'L2_HARMONIC_BASS';
    case 'harmony':
      return 'L2_HARMONIC_BASS';
    case 'strings':
    case 'woodwinds':
    case 'melody':
      return 'L3_STRINGS_WOODWINDS';
    case 'brass':
      return 'L4_BRASS';
    default:
      return 'L5_AUXILIARY';
  }
}

/**
 * Determina la capacidad instrumental.
 */
function determineCapability(
  polyphony: string,
  isPercussion: boolean
): InstrumentCapability {
  if (isPercussion) return 'PERCUSSION';
  switch (polyphony) {
    case 'mono':
      return 'MONOPHONIC';
    case 'poly':
      return 'POLYPHONIC';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Calcula pitch_hz a partir de pitch_midi.
 * Sección 9 del spec: f = 440 * 2^((m-69)/12)
 */
function pitchToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Construye un MMCEvent desde un MidiNote.
 */
function buildEventFromNote(
  note: MidiNote,
  trackId: number,
  measure: number,
  beat: number,
  cell16: number,
  endCell: number | null,
  layer: InstrumentLayer,
  instrumentFamily: string | null,
  voiceId: number
): MMCEvent {
  const eventId = nextEventId();
  const pitchHz = pitchToHz(note.pitch);
  const pitchClass = note.pitch % 12;
  const octave = Math.floor(note.pitch / 12) - 1;
  const duration = note.endTick - note.startTick;

  return {
    event_id: eventId,
    track_id: trackId,
    instrument_id: null,
    instrument_family: instrumentFamily,
    voice_id: voiceId,
    source_event_id: note.id,

    measure,
    beat,
    cell_16: cell16,
    subdivision: 4, // semicorchea por defecto
    absolute_tick: note.startTick,

    pitch_midi: note.pitch,
    pitch_hz: pitchHz,
    pitch_class: pitchClass,
    octave,

    raw_onset: note.startTick,
    quantized_onset: note.correctedStartTick !== note.startTick ? note.correctedStartTick : null,
    onset_error: note.correctedStartTick !== note.startTick
      ? note.correctedStartTick - note.startTick
      : null,
    raw_duration: duration,
    quantized_duration: null,
    end_cell: endCell,
    tie_state: 'NONE',

    velocity: note.velocity,
    dynamic_level: velocityToDynamic(note.velocity),
    articulation: inferArticulation(duration, note.velocity),

    // Evidencia acústica: solo lo calculable desde MIDI
    fundamental_frequency: pitchHz,
    harmonic_profile: null, // requiere audio real
    spectral_centroid: null,
    spectral_flux: null,
    rms_energy: note.velocity / 127, // proxy
    attack_transient: null,
    envelope: null,
    periodicity: null,
    noise_ratio: null,
    confidence_acoustic: null,

    // Continuidad melódica: se calculará después
    melodic_direction: 'UNKNOWN',
    previous_pitch: null,
    next_pitch: null,
    interval_previous: null,
    interval_next: null,
    continuity_score: null,

    // Contexto armónico: se calculará después
    harmonic_role: 'UNKNOWN',
    chord_context: null,
    bass_relation: null,
    consonance_score: null,

    // Clasificación estructural: se calculará después
    cluster_candidate: false,
    cluster_status: 'NONE',
    duplicate_candidate: false,
    overlap_state: 'NONE',
    voice_collision: false,

    // Micro-gap: se calculará después
    micro_gap_status: 'NONE',
    micro_gap_ticks: null,

    // Estado de celda
    cell_state: 'ATTACK',

    // Trazabilidad
    transformation_history: [],
    confidence_total: null,

    // Intervención humana
    human_override: false,
    human_override_note: null,

    // Capa
    layer,

    // Validación
    validation_status: 'MMC_PENDING',
    validation_components: {
      R: null,
      T: null,
      M: null,
      H: null,
      I: null,
      A: null,
    },
  };
}

function velocityToDynamic(velocity: number): string {
  if (velocity < 20) return 'ppp';
  if (velocity < 40) return 'pp';
  if (velocity < 60) return 'p';
  if (velocity < 80) return 'mp';
  if (velocity < 100) return 'mf';
  if (velocity < 115) return 'f';
  if (velocity < 127) return 'ff';
  return 'fff';
}

function inferArticulation(duration: number, _velocity: number): 'NORMAL' | 'STACCATO' | 'LEGATO' | 'UNKNOWN' {
  // Heurística simple basada en duración relativa
  // No es análisis acústico real, solo indicativo
  if (duration < 60) return 'STACCATO';
  if (duration > 960) return 'LEGATO';
  return 'NORMAL';
}

/**
 * Construye el MMCProject completo desde un MidiProject.
 *
 * Este es el punto de entrada principal.
 */
export function buildMMCFromProject(project: MidiProject): MMCProject {
  eventIdCounter = 0;
  const log: ReturnType<typeof createLogEntry>[] = [];
  const events = new Map<string, MMCEvent>();
  const mmcTracks: MMCTrack[] = [];

  log.push(
    createLogEntry(
      'INFO',
      BUILDER_MODULE,
      `Construyendo MMC desde proyecto "${project.name}" con ${project.tracks.length} pistas`
    )
  );

  // Para cada pista
  for (const track of project.tracks) {
    const instrumentInfo = track.program !== undefined
      ? getInstrumentByProgram(track.program)
      : null;
    const layer = determineLayer(track.role, track.isPercussion);
    const capability = determineCapability(track.polyphony, track.isPercussion);

    log.push(
      createLogEntry(
        'INFO',
        BUILDER_MODULE,
        `Pista ${track.index}: "${track.name}" → capa ${layer}, capacidad ${capability}`
      )
    );

    // Construir eventos para esta pista
    const trackEventIds: string[] = [];
    const trackEvents: MMCEvent[] = [];

    // Agrupar notas por compás
    const notesByMeasure = new Map<number, MidiNote[]>();
    for (const note of track.notes) {
      const measure = tickToMeasure(
        note.startTick,
        project.timeSignatures.map(ts => ({
          tick: ts.tick,
          numerator: ts.numerator,
          denominator: ts.denominator,
        })),
        project.ticksPerBeat
      );
      if (!notesByMeasure.has(measure)) {
        notesByMeasure.set(measure, []);
      }
      notesByMeasure.get(measure)!.push(note);
    }

    // Construir compases
    const measures: MMCMeasure[] = [];
    const measureNumbers = Array.from(notesByMeasure.keys()).sort((a, b) => a - b);

    for (const measureNum of measureNumbers) {
      const notesInMeasure = notesByMeasure.get(measureNum)!;
      const ts = getCurrentTimeSignature(measureNum, project);
      const grid = computeGridDefinition(ts.numerator, ts.denominator, 4);
      const ticksPerMeasure = computeTicksPerMeasure(ts.numerator, ts.denominator, project.ticksPerBeat);
      const measureStartTick = computeMeasureStartTick(
        measureNum,
        project.timeSignatures.map(t => ({ tick: t.tick, numerator: t.numerator, denominator: t.denominator })),
        project.ticksPerBeat
      );

      const cells = createEmptyCells(grid);
      const measureEventIds: string[] = [];

      // Para cada nota en el compás
      for (const note of notesInMeasure) {
        const startCell = tickToCellIndex(note.startTick, measureStartTick, ticksPerMeasure, grid);
        const endCell = tickToCellIndex(note.endTick - 1, measureStartTick, ticksPerMeasure, grid);

        if (startCell === null) continue;

        const beat = Math.floor((startCell - 1) / grid.cells_per_beat) + 1;

        const event = buildEventFromNote(
          note,
          track.index,
          measureNum,
          beat,
          startCell,
          endCell,
          layer,
          instrumentInfo?.family || null,
          1 // voice_id por defecto
        );

        events.set(event.event_id, event);
        trackEventIds.push(event.event_id);
        measureEventIds.push(event.event_id);
        trackEvents.push(event);

        // Actualizar celdas
        for (let c = startCell; c <= (endCell || startCell); c++) {
          if (c >= 1 && c <= cells.length) {
            const state = determineCellState(c, startCell, endCell || startCell, 'NONE');
            cells[c - 1].state = state;
            cells[c - 1].events.push(event.event_id);
            cells[c - 1].is_rest = false;
            cells[c - 1].is_attack_position = cells[c - 1].is_attack_position || state === 'ATTACK';
            cells[c - 1].is_sustain_position = cells[c - 1].is_sustain_position || state === 'SUSTAIN';
            cells[c - 1].is_release_position = cells[c - 1].is_release_position || state === 'RELEASE';
          }
        }
      }

      measures.push({
        measure_number: measureNum,
        time_signature_numerator: ts.numerator,
        time_signature_denominator: ts.denominator,
        cell_count: grid.cells_per_measure,
        cells,
        voices: [{ voice_id: 1, instrument_id: track.program ?? null, instrument_capability: capability, event_ids: measureEventIds }],
        event_ids: measureEventIds,
        validation_status: 'MMC_PENDING',
      });
    }

    mmcTracks.push({
      track_id: track.index,
      instrument_id: track.program ?? null,
      instrument_family: instrumentInfo?.family || null,
      instrument_capability: capability,
      layer,
      channel: track.channel,
      name: track.name,
      measures,
      event_ids: trackEventIds,
      voices: [{ voice_id: 1, instrument_id: track.program ?? null, instrument_capability: capability, event_ids: trackEventIds }],
    });
  }

  const totalMeasures = measureCount(project);

  const mmcProject: MMCProject = {
    id: `mmc_${project.id}_${Date.now()}`,
    version: MMC_VERSION,
    source_project_id: project.id,
    created_at: Date.now(),
    updated_at: Date.now(),

    ticks_per_beat: project.ticksPerBeat,
    tempo_map: project.tempoMap.map(t => ({
      tick: t.tick,
      bpm: t.bpm,
      microseconds_per_beat: t.microsecondsPerBeat,
    })),
    time_signatures: project.timeSignatures.map(ts => ({
      tick: ts.tick,
      numerator: ts.numerator,
      denominator: ts.denominator,
    })),
    total_ticks: project.totalTicks,
    total_measures: totalMeasures,

    tracks: mmcTracks,
    events,

    features: {
      MMC_ENABLED: true,
      ANTI_CLUSTER_ENABLED: true,
      MELODIC_CONTINUITY_ENABLED: true,
      ACOUSTIC_VALIDATION_ENABLED: false, // requiere audio real
    },

    validation_status: 'MMC_PENDING',
    log,
  };

  log.push(
    createLogEntry(
      'INFO',
      BUILDER_MODULE,
      `MMC construida: ${events.size} eventos, ${mmcTracks.length} pistas, ${totalMeasures} compases`
    )
  );

  return mmcProject;
}

function getCurrentTimeSignature(
  measureNum: number,
  project: MidiProject
): { numerator: number; denominator: number } {
  if (project.timeSignatures.length === 0) {
    return { numerator: 4, denominator: 4 };
  }
  // Simplificación: usar el time signature más reciente antes del compás
  // Para implementación completa se necesitaría calcular el tick del compás
  let current = { numerator: 4, denominator: 4 };
  for (const ts of project.timeSignatures) {
    const tsMeasure = tickToMeasure(
      ts.tick,
      project.timeSignatures.map(t => ({ tick: t.tick, numerator: t.numerator, denominator: t.denominator })),
      project.ticksPerBeat
    );
    if (tsMeasure <= measureNum) {
      current = { numerator: ts.numerator, denominator: ts.denominator };
    }
  }
  return current;
}

function computeMeasureStartTick(
  measureNum: number,
  timeSignatures: { tick: number; numerator: number; denominator: number }[],
  ticksPerBeat: number
): number {
  if (timeSignatures.length === 0) {
    return (measureNum - 1) * 4 * ticksPerBeat;
  }
  let currentTick = 0;
  let currentMeasure = 1;
  let currentNum = timeSignatures[0].numerator;

  for (let i = 0; i < timeSignatures.length; i++) {
    const ts = timeSignatures[i];
    const ticksPerMeasure = currentNum * ticksPerBeat;

    if (ts.tick >= currentTick) {
      currentTick = ts.tick;
      currentNum = ts.numerator;
    }

    if (i + 1 < timeSignatures.length) {
      const nextTs = timeSignatures[i + 1];
      const measuresInSegment = Math.floor((nextTs.tick - currentTick) / ticksPerMeasure);
      if (currentMeasure + measuresInSegment >= measureNum) {
        return currentTick + (measureNum - currentMeasure) * ticksPerMeasure;
      }
      currentMeasure += measuresInSegment;
      currentTick += measuresInSegment * ticksPerMeasure;
    } else {
      return currentTick + (measureNum - currentMeasure) * ticksPerMeasure;
    }
  }
  return currentTick;
}

function measureCount(project: MidiProject): number {
  if (project.timeSignatures.length === 0) {
    return Math.ceil(project.totalTicks / (4 * project.ticksPerBeat));
  }
  let count = 0;
  let currentTick = 0;
  for (let i = 0; i < project.timeSignatures.length; i++) {
    const ts = project.timeSignatures[i];
    const nextTick = i + 1 < project.timeSignatures.length
      ? project.timeSignatures[i + 1].tick
      : project.totalTicks;
    const ticksPerMeasure = ts.numerator * project.ticksPerBeat;
    count += Math.ceil((nextTick - currentTick) / ticksPerMeasure);
    currentTick = nextTick;
  }
  return count;
}
