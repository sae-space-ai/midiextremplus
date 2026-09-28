/**
 * MMC v1.0 — Melodic Continuity Engine (MCE)
 *
 * Sección 7 y 8 del spec.
 *
 * Impide que errores de detección o cuantización destruyan
 * líneas melódicas continuas.
 *
 * Detecta micro-gaps y los clasifica antes de consolidar
 * como silencio musical.
 */

import {
  MMCProject,
  MMCEvent,
  MicroGapStatus,
  MelodicDirection,
  InstrumentCapability,
} from './types';
import { applyTransformationIfAllowed, createLogEntry } from './history';

const MODULE = 'mmc.continuity';
const MODULE_VERSION = '1.0.0';

// Umbral para considerar micro-gap (en ticks)
const MICRO_GAP_THRESHOLD = 30;
// Umbral para considerar silencio musical real
const MUSICAL_REST_THRESHOLD = 120;

/**
 * Ejecuta el análisis de continuidad melódica.
 */
export function runContinuityAnalysis(project: MMCProject): {
  project: MMCProject;
  microGapsDetected: number;
  musicalRestsConfirmed: number;
  log: ReturnType<typeof createLogEntry>[];
} {
  if (!project.features.MELODIC_CONTINUITY_ENABLED) {
    return { project, microGapsDetected: 0, musicalRestsConfirmed: 0, log: [] };
  }

  const log: ReturnType<typeof createLogEntry>[] = [];
  const newEvents = new Map(project.events);
  let microGapsDetected = 0;
  let musicalRestsConfirmed = 0;

  log.push(createLogEntry('INFO', MODULE, 'Iniciando análisis de continuidad melódica'));

  // Para cada pista
  for (const track of project.tracks) {
    // Ordenar eventos por tick
    const sortedEvents = track.event_ids
      .map(id => newEvents.get(id))
      .filter((e): e is MMCEvent => e !== undefined)
      .sort((a, b) => a.raw_onset - b.raw_onset);

    // Analizar continuidad entre eventos consecutivos
    for (let i = 0; i < sortedEvents.length; i++) {
      const current = sortedEvents[i];
      const next = i < sortedEvents.length - 1 ? sortedEvents[i + 1] : null;
      const prev = i > 0 ? sortedEvents[i - 1] : null;

      // Actualizar dirección melódica
      if (prev || next) {
        const direction = computeMelodicDirection(current, prev, next);
        const result = applyTransformationIfAllowed(
          current, MODULE, MODULE_VERSION, 'melodic_direction_update',
          'melodic_direction', direction,
          `Dirección melódica calculada`,
          0.8
        );
        if (result.applied) {
          newEvents.set(current.event_id, {
            ...result.event,
            melodic_direction: direction,
            previous_pitch: prev?.pitch_midi ?? null,
            next_pitch: next?.pitch_midi ?? null,
            interval_previous: prev ? current.pitch_midi - prev.pitch_midi : null,
            interval_next: next ? next.pitch_midi - current.pitch_midi : null,
          });
        }
      }

      // Detectar micro-gaps
      if (next) {
        const gap = next.raw_onset - current.raw_onset - current.raw_duration;

        if (gap > 0 && gap <= MICRO_GAP_THRESHOLD) {
          // Micro-gap detectado
          microGapsDetected++;
          const classification = classifyMicroGap(
            gap,
            current,
            next,
            track.instrument_capability
          );

          const result = applyTransformationIfAllowed(
            current, MODULE, MODULE_VERSION, 'micro_gap_classification',
            'micro_gap_status', classification,
            `Micro-gap de ${gap} ticks clasificado como ${classification}`,
            classification === 'MUSICAL_REST' ? 0.9 : 0.5
          );

          if (result.applied) {
            newEvents.set(current.event_id, {
              ...result.event,
              micro_gap_status: classification,
              micro_gap_ticks: gap,
            });
          }

          if (classification === 'MUSICAL_REST') {
            musicalRestsConfirmed++;
          }

          log.push(
            createLogEntry(
              'DEBUG',
              MODULE,
              `Micro-gap: pista ${track.track_id}, ${gap} ticks, clasificado como ${classification}`,
              current.event_id
            )
          );
        }
      }

      // Calcular continuity_score
      const score = computeContinuityScore(current, prev, next);
      const scoreResult = applyTransformationIfAllowed(
        current, MODULE, MODULE_VERSION, 'continuity_score_update',
        'continuity_score', score,
        `Score de continuidad calculado`,
        score
      );
      if (scoreResult.applied) {
        newEvents.set(current.event_id, { ...scoreResult.event, continuity_score: score });
      }
    }
  }

  log.push(
    createLogEntry(
      'INFO', MODULE,
      `Análisis de continuidad completado: ${microGapsDetected} micro-gaps, ${musicalRestsConfirmed} silencios musicales`
    )
  );

  return {
    project: { ...project, events: newEvents, log: [...project.log, ...log] },
    microGapsDetected,
    musicalRestsConfirmed,
    log,
  };
}

/**
 * Calcula la dirección melódica.
 */
function computeMelodicDirection(
  current: MMCEvent,
  prev: MMCEvent | null,
  next: MMCEvent | null
): MelodicDirection {
  if (prev && next) {
    if (current.pitch_midi > prev.pitch_midi && current.pitch_midi < next.pitch_midi) return 'UP';
    if (current.pitch_midi < prev.pitch_midi && current.pitch_midi > next.pitch_midi) return 'DOWN';
    if (current.pitch_midi === prev.pitch_midi && current.pitch_midi === next.pitch_midi) return 'SAME';
  } else if (prev) {
    if (current.pitch_midi > prev.pitch_midi) return 'UP';
    if (current.pitch_midi < prev.pitch_midi) return 'DOWN';
    return 'SAME';
  } else if (next) {
    if (current.pitch_midi < next.pitch_midi) return 'UP';
    if (current.pitch_midi > next.pitch_midi) return 'DOWN';
    return 'SAME';
  }
  return 'UNKNOWN';
}

/**
 * Clasifica un micro-gap.
 */
function classifyMicroGap(
  gap: number,
  current: MMCEvent,
  next: MMCEvent,
  capability: InstrumentCapability
): MicroGapStatus {
  // Si el gap es muy pequeño y las notas son cercanas en altura
  const pitchDiff = Math.abs(next.pitch_midi - current.pitch_midi);

  if (gap < 5) {
    // Gap casi inexistente: probablemente error de detección
    return 'DETECTION_ERROR';
  }

  if (gap < 15 && pitchDiff <= 2) {
    // Gap muy pequeño con notas cercanas: posible legato con reataque
    if (capability === 'MONOPHONIC') {
      return 'ARTICULATION';
    }
    return 'NATURAL_RELEASE';
  }

  if (gap < MICRO_GAP_THRESHOLD && pitchDiff <= 3) {
    // Gap pequeño: podría ser respiración o articulación
    if (capability === 'MONOPHONIC') {
      // Instrumentos de viento: posible respiración
      if (current.instrument_family === 'Madera' || current.instrument_family === 'Metal') {
        return 'BREATH';
      }
      return 'ARTICULATION';
    }
    return 'NATURAL_RELEASE';
  }

  if (gap >= MUSICAL_REST_THRESHOLD) {
    return 'MUSICAL_REST';
  }

  // Gap intermedio: clasificar como micro-gap genérico
  return 'MICRO_GAP_DETECTED';
}

/**
 * Calcula un score de continuidad (0-1).
 * 1 = máxima continuidad, 0 = mínima.
 */
function computeContinuityScore(
  current: MMCEvent,
  prev: MMCEvent | null,
  next: MMCEvent | null
): number {
  let score = 0.5; // base

  // Factor 1: Proximidad temporal con evento anterior
  if (prev) {
    const timeGap = current.raw_onset - (prev.raw_onset + prev.raw_duration);
    if (timeGap < 0) score += 0.15; // overlap = legato
    else if (timeGap < 10) score += 0.1;
    else if (timeGap < 30) score += 0.05;
    else score -= 0.1;
  }

  // Factor 2: Proximidad de altura con evento anterior
  if (prev) {
    const pitchDiff = Math.abs(current.pitch_midi - prev.pitch_midi);
    if (pitchDiff <= 2) score += 0.15;
    else if (pitchDiff <= 5) score += 0.1;
    else if (pitchDiff <= 12) score += 0.05;
    else score -= 0.1;
  }

  // Factor 3: Consistencia direccional
  if (prev && next) {
    const dir1 = current.pitch_midi - prev.pitch_midi;
    const dir2 = next.pitch_midi - current.pitch_midi;
    if ((dir1 > 0 && dir2 > 0) || (dir1 < 0 && dir2 < 0)) {
      score += 0.1; // misma dirección
    }
  }

  // Factor 4: Duración consistente
  if (prev) {
    const durationRatio = current.raw_duration / Math.max(prev.raw_duration, 1);
    if (durationRatio > 0.5 && durationRatio < 2) {
      score += 0.1;
    }
  }

  return Math.max(0, Math.min(1, score));
}
