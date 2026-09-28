/**
 * MMC v1.0 — Validation Engine
 *
 * Sección 16 del spec.
 *
 * Un compás solo puede considerarse validado cuando exista
 * coherencia suficiente en:
 *   R = GRID RÍTMICO
 *   T = ATAQUES Y DURACIONES
 *   M = CONTINUIDAD MELÓDICA
 *   H = COHERENCIA ARMÓNICA
 *   I = PLAUSIBILIDAD INSTRUMENTAL
 *   A = COHERENCIA ACÚSTICA
 */

import {
  MMCProject,
  MMCEvent,
  ValidationStatus,
  MMCMeasure,
} from './types';
import { createLogEntry } from './history';

const MODULE = 'mmc.validation';
const VALIDATION_THRESHOLD = 0.6;

/**
 * Ejecuta la validación completa del proyecto.
 */
export function runValidation(project: MMCProject): {
  project: MMCProject;
  validatedMeasures: number;
  reviewRequiredMeasures: number;
  log: ReturnType<typeof createLogEntry>[];
} {
  const log: ReturnType<typeof createLogEntry>[] = [];
  const newEvents = new Map(project.events);
  let validatedMeasures = 0;
  let reviewRequiredMeasures = 0;

  log.push(createLogEntry('INFO', MODULE, 'Iniciando validación R,T,M,H,I,A'));

  // Validar cada pista/compás
  for (const track of project.tracks) {
    for (const measure of track.measures) {
      const events = measure.event_ids
        .map(id => newEvents.get(id))
        .filter((e): e is MMCEvent => e !== undefined);

      const components = computeValidationComponents(events, measure, track);

      // Determinar estado
      const allAboveThreshold = Object.values(components).every(
        v => v === null || v >= VALIDATION_THRESHOLD
      );
      const anyBelowThreshold = Object.values(components).some(
        v => v !== null && v < VALIDATION_THRESHOLD
      );

      let status: ValidationStatus;
      if (allAboveThreshold) {
        status = 'MMC_VALIDATED';
        validatedMeasures++;
      } else if (anyBelowThreshold) {
        status = 'MMC_REVIEW_REQUIRED';
        reviewRequiredMeasures++;
      } else {
        status = 'MMC_PENDING';
      }

      // Actualizar eventos con componentes de validación
      for (const event of events) {
        newEvents.set(event.event_id, {
          ...event,
          validation_status: status,
          validation_components: components,
        });
      }

      if (status === 'MMC_REVIEW_REQUIRED') {
        const lowComponents = Object.entries(components)
          .filter(([_, v]) => v !== null && v < VALIDATION_THRESHOLD)
          .map(([k, v]) => `${k}=${(v as number).toFixed(2)}`);

        log.push(
          createLogEntry(
            'WARN', MODULE,
            `Compás ${measure.measure_number}, pista ${track.track_id}: revisión requerida (${lowComponents.join(', ')})`
          )
        );
      }
    }
  }

  // Validación global
  let globalStatus: ValidationStatus = 'MMC_VALIDATED';
  if (reviewRequiredMeasures > 0) {
    globalStatus = 'MMC_REVIEW_REQUIRED';
  }

  log.push(
    createLogEntry(
      'INFO', MODULE,
      `Validación completada: ${validatedMeasures} compases validados, ${reviewRequiredMeasures} requieren revisión`
    )
  );

  return {
    project: {
      ...project,
      events: newEvents,
      validation_status: globalStatus,
      log: [...project.log, ...log],
    },
    validatedMeasures,
    reviewRequiredMeasures,
    log,
  };
}

/**
 * Calcula los componentes de validación R,T,M,H,I,A.
 */
function computeValidationComponents(
  events: MMCEvent[],
  _measure: MMCMeasure,
  track: { track_id: number; instrument_capability: string }
): {
  R: number | null;
  T: number | null;
  M: number | null;
  H: number | null;
  I: number | null;
  A: number | null;
} {
  // R: Grid rítmico — basado en cuántos eventos están cuantizados correctamente
  const quantizedEvents = events.filter(e => e.quantized_onset !== null);
  const R = events.length > 0 ? quantizedEvents.length / events.length : null;

  // T: Ataques y duraciones — basado en duraciones válidas
  const validDurations = events.filter(e => e.raw_duration > 0);
  const T = events.length > 0 ? validDurations.length / events.length : null;

  // M: Continuidad melódica — promedio de continuity_score
  const scores = events.map(e => e.continuity_score).filter((s): s is number => s !== null);
  const M = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  // H: Coherencia armónica — basado en consonance_score si disponible
  const consonances = events.map(e => e.consonance_score).filter((s): s is number => s !== null);
  const H = consonances.length > 0 ? consonances.reduce((a, b) => a + b, 0) / consonances.length : null;

  // I: Plausibilidad instrumental — basado en cluster_status
  const noSuspectClusters = events.filter(e => e.cluster_status !== 'SUSPECT_CLUSTER');
  const I = events.length > 0 ? noSuspectClusters.length / events.length : null;

  // A: Coherencia acústica — basado en confidence_acoustic
  const acoustics = events.map(e => e.confidence_acoustic).filter((s): s is number => s !== null);
  const A = acoustics.length > 0 ? acoustics.reduce((a, b) => a + b, 0) / acoustics.length : null;

  return { R, T, M, H, I, A };
}
