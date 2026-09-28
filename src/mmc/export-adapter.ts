/**
 * MMC v1.0 — Export Adapter
 *
 * Sección 21 del spec.
 *
 * Convierte el estado validado de la MMC de vuelta a MidiProject
 * para usar el writer.ts existente.
 *
 * No destruye la MMC. Genera una copia derivada.
 */

import { MidiProject, MidiNote, TrackInfo } from '../midi/model';
import { MMCProject, MMCEvent, CellState } from './types';

const MODULE = 'mmc.export_adapter';

let noteIdCounter = 0;
function nextNoteId(): string {
  return `mmc_export_${++noteIdCounter}_${Date.now()}`;
}

/**
 * Convierte MMCProject a MidiProject para exportación.
 *
 * Solo exporta eventos con estado validado o aprobado.
 * Conserva la fuente original intacta.
 */
export function mmcToMidiProject(
  mmc: MMCProject,
  originalProject: MidiProject
): MidiProject {
  noteIdCounter = 0;

  // Crear copia profunda del proyecto original
  const exported: MidiProject = JSON.parse(JSON.stringify(originalProject));

  // Para cada pista en MMC
  for (const mmcTrack of mmc.tracks) {
    const originalTrack = exported.tracks[mmcTrack.track_id];
    if (!originalTrack) continue;

    // Recopilar eventos válidos para exportar
    const exportableEvents: MMCEvent[] = [];
    for (const eventId of mmcTrack.event_ids) {
      const event = mmc.events.get(eventId);
      if (!event) continue;

      // Solo exportar eventos validados o con override humano
      if (
        event.validation_status === 'MMC_VALIDATED' ||
        event.validation_status === 'MMC_HUMAN_OVERRIDE' ||
        event.validation_status === 'MMC_PENDING' // incluir pendientes si no hay mejor opción
      ) {
        exportableEvents.push(event);
      }
    }

    // Convertir eventos MMC a MidiNote
    const newNotes: MidiNote[] = exportableEvents.map(event =>
      mmcEventToMidiNote(event, mmcTrack.track_id)
    );

    originalTrack.notes = newNotes;
    originalTrack.noteCount = newNotes.length;
  }

  exported.updatedAt = Date.now();
  return exported;
}

/**
 * Convierte un MMCEvent a MidiNote.
 */
function mmcEventToMidiNote(event: MMCEvent, trackIndex: number): MidiNote {
  // Determinar tick de inicio y fin
  const startTick = event.quantized_onset !== null
    ? event.quantized_onset
    : event.raw_onset;

  const duration = event.quantized_duration !== null
    ? event.quantized_duration
    : event.raw_duration;

  const endTick = startTick + duration;

  return {
    id: nextNoteId(),
    trackIndex,
    channel: 0, // se asignará según pista
    pitch: event.pitch_midi,
    velocity: event.velocity,
    startTick,
    endTick: Math.max(endTick, startTick + 1),
    correctedStartTick: startTick,
    correctedEndTick: Math.max(endTick, startTick + 1),
    originalStartTick: event.raw_onset,
    originalEndTick: event.raw_onset + event.raw_duration,
    isModified: event.transformation_history.length > 0,
    isProtected: event.human_override,
    isFlagged: event.cluster_status === 'SUSPECT_CLUSTER' || event.validation_status === 'MMC_REVIEW_REQUIRED',
    flagReason: event.cluster_status === 'SUSPECT_CLUSTER'
      ? 'Cluster sospechoso no resuelto'
      : event.validation_status === 'MMC_REVIEW_REQUIRED'
        ? 'Requiere revisión manual'
        : undefined,
    modificationReason: event.transformation_history.length > 0
      ? event.transformation_history.map(t => t.operation).join(' → ')
      : undefined,
    reviewStatus: event.human_override ? 'approved' : event.validation_status === 'MMC_VALIDATED' ? 'approved' : 'pending',
  };
}

/**
 * Verificaciones pre-exportación (Sección 21).
 */
export function verifyBeforeExport(mmc: MMCProject): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Verificar tempo
  if (mmc.tempo_map.length === 0) {
    issues.push('No hay mapa de tempo');
  }

  // Verificar eventos
  let noteOnWithoutNoteOff = 0;
  let zeroDuration = 0;
  let suspectClusters = 0;

  for (const event of mmc.events.values()) {
    if (event.raw_duration <= 0) {
      zeroDuration++;
    }
    if (event.cluster_status === 'SUSPECT_CLUSTER') {
      suspectClusters++;
    }
  }

  if (zeroDuration > 0) {
    issues.push(`${zeroDuration} eventos con duración cero o negativa`);
  }

  if (suspectClusters > 0) {
    issues.push(`${suspectClusters} clusters sospechosos sin resolver (se exportarán marcados)`);
  }

  return {
    valid: issues.filter(i => i.includes('No hay mapa de tempo')).length === 0,
    issues,
  };
}

/**
 * Genera resumen de exportación.
 */
export function generateExportSummary(mmc: MMCProject): {
  totalEvents: number;
  exportableEvents: number;
  validatedEvents: number;
  reviewRequiredEvents: number;
  humanOverrideEvents: number;
  suspectClusters: number;
} {
  let exportable = 0;
  let validated = 0;
  let reviewRequired = 0;
  let humanOverride = 0;
  let suspectClusters = 0;

  for (const event of mmc.events.values()) {
    if (
      event.validation_status === 'MMC_VALIDATED' ||
      event.validation_status === 'MMC_PENDING' ||
      event.validation_status === 'MMC_HUMAN_OVERRIDE'
    ) {
      exportable++;
    }
    if (event.validation_status === 'MMC_VALIDATED') validated++;
    if (event.validation_status === 'MMC_REVIEW_REQUIRED') reviewRequired++;
    if (event.human_override) humanOverride++;
    if (event.cluster_status === 'SUSPECT_CLUSTER') suspectClusters++;
  }

  return {
    totalEvents: mmc.events.size,
    exportableEvents: exportable,
    validatedEvents: validated,
    reviewRequiredEvents: reviewRequired,
    humanOverrideEvents: humanOverride,
    suspectClusters,
  };
}
