/**
 * MMC v1.0 — Anti-Cluster Engine
 *
 * Sección 6 del spec.
 *
 * La coincidencia temporal aproximada de varias alturas NO demuestra
 * por sí misma la existencia de un acorde.
 *
 * Para instrumentos monofónicos, clusters verticales se clasifican
 * inicialmente como SUSPECT_CLUSTER.
 *
 * El motor investiga si el cluster procede de ataques consecutivos
 * mal alineados temporalmente.
 *
 * Regla: NO transformar automáticamente clusters en arpegios.
 */

import {
  MMCProject,
  MMCEvent,
  ClusterStatus,
  InstrumentCapability,
} from './types';
import { applyTransformationIfAllowed, createLogEntry } from './history';

const MODULE = 'mmc.anti_cluster';
const MODULE_VERSION = '1.0.0';

// Umbral en ticks para considerar eventos "simultáneos"
const SIMULTANEITY_THRESHOLD_TICKS = 20;

/**
 * Ejecuta el análisis anti-cluster sobre todo el proyecto.
 */
export function runAntiClusterAnalysis(project: MMCProject): {
  project: MMCProject;
  suspectCount: number;
  validChordCount: number;
  log: ReturnType<typeof createLogEntry>[];
} {
  if (!project.features.ANTI_CLUSTER_ENABLED) {
    return { project, suspectCount: 0, validChordCount: 0, log: [] };
  }

  const log: ReturnType<typeof createLogEntry>[] = [];
  const newEvents = new Map(project.events);
  let suspectCount = 0;
  let validChordCount = 0;

  log.push(createLogEntry('INFO', MODULE, 'Iniciando análisis anti-cluster'));

  // Para cada pista
  for (const track of project.tracks) {
    const capability = track.instrument_capability;

    // Para cada compás
    for (const measure of track.measures) {
      // Agrupar eventos por celda
      const eventsByCell = new Map<number, MMCEvent[]>();

      for (const eventId of measure.event_ids) {
        const event = newEvents.get(eventId);
        if (!event) continue;
        const cell = event.cell_16;
        if (!eventsByCell.has(cell)) {
          eventsByCell.set(cell, []);
        }
        eventsByCell.get(cell)!.push(event);
      }

      // También detectar eventos cercanos en celdas adyacentes
      for (const [cell, events] of eventsByCell) {
        if (events.length < 2) continue;

        // Múltiples eventos en la misma celda
        const pitches = events.map(e => e.pitch_midi);
        const uniquePitches = new Set(pitches);

        if (uniquePitches.size < 2) {
          // Mismo pitch repetido: posible duplicado, no cluster
          continue;
        }

        // Analizar según capacidad instrumental
        const clusterStatus = evaluateCluster(
          events,
          capability,
          track.measures,
          measure.measure_number,
          newEvents
        );

        if (clusterStatus === 'SUSPECT_CLUSTER') {
          suspectCount++;
          log.push(
            createLogEntry(
              'WARN',
              MODULE,
              `Cluster sospechoso: pista ${track.track_id}, compás ${measure.measure_number}, celda ${cell}, ${events.length} alturas [${pitches.join(', ')}], instrumento ${capability}`,
              events[0].event_id
            )
          );
        } else if (clusterStatus === 'VALID_CHORD') {
          validChordCount++;
        }

        // Actualizar eventos
        for (const event of events) {
          const result = applyTransformationIfAllowed(
            event,
            MODULE,
            MODULE_VERSION,
            'cluster_classification',
            'cluster_status',
            clusterStatus,
            `Cluster de ${events.length} notas en celda ${cell}, instrumento ${capability}`,
            clusterStatus === 'VALID_CHORD' ? 0.9 : 0.4
          );

          if (result.applied) {
            const updated: MMCEvent = {
              ...result.event,
              cluster_candidate: true,
              cluster_status: clusterStatus,
            };
            newEvents.set(event.event_id, updated);
          }
        }
      }

      // Detectar clusters en celdas adyacentes (ataques consecutivos mal alineados)
      const cellNumbers = Array.from(eventsByCell.keys()).sort((a, b) => a - b);
      for (let i = 0; i < cellNumbers.length - 1; i++) {
        const cell1 = cellNumbers[i];
        const cell2 = cellNumbers[i + 1];
        if (cell2 - cell1 > 1) continue; // No adyacentes

        const events1 = eventsByCell.get(cell1)!;
        const events2 = eventsByCell.get(cell2)!;

        // Verificar si los ataques están muy cerca temporalmente
        for (const e1 of events1) {
          for (const e2 of events2) {
            const timeDiff = Math.abs(e2.raw_onset - e1.raw_onset);
            if (timeDiff <= SIMULTANEITY_THRESHOLD_TICKS && e1.pitch_midi !== e2.pitch_midi) {
              // Posible ataque consecutivo mal alineado
              if (capability === 'MONOPHONIC') {
                const result1 = applyTransformationIfAllowed(
                  e1, MODULE, MODULE_VERSION, 'adjacent_attack_detected',
                  'cluster_candidate', true,
                  `Ataque adyacente mal alineado con evento ${e2.event_id} (diff: ${timeDiff} ticks)`,
                  0.5
                );
                if (result1.applied) {
                  newEvents.set(e1.event_id, { ...result1.event, cluster_candidate: true });
                }

                const result2 = applyTransformationIfAllowed(
                  e2, MODULE, MODULE_VERSION, 'adjacent_attack_detected',
                  'cluster_candidate', true,
                  `Ataque adyacente mal alineado con evento ${e1.event_id} (diff: ${timeDiff} ticks)`,
                  0.5
                );
                if (result2.applied) {
                  newEvents.set(e2.event_id, { ...result2.event, cluster_candidate: true });
                }
              }
            }
          }
        }
      }
    }
  }

  log.push(
    createLogEntry(
      'INFO',
      MODULE,
      `Análisis anti-cluster completado: ${suspectCount} clusters sospechosos, ${validChordCount} acordes válidos`
    )
  );

  return {
    project: { ...project, events: newEvents, log: [...project.log, ...log] },
    suspectCount,
    validChordCount,
    log,
  };
}

/**
 * Evalúa si un conjunto de eventos simultáneos constituye un cluster sospechoso
 * o un acorde legítimo.
 */
function evaluateCluster(
  events: MMCEvent[],
  capability: InstrumentCapability,
  allMeasures: { measure_number: number; event_ids: string[] }[],
  measureNumber: number,
  allEvents: Map<string, MMCEvent>
): ClusterStatus {
  // Regla 1: Instrumento monofónico → siempre SUSPECT_CLUSTER
  if (capability === 'MONOPHONIC') {
    return 'SUSPECT_CLUSTER';
  }

  // Regla 2: Percusión → evaluar contexto
  if (capability === 'PERCUSSION') {
    // En percusión, múltiples golpes simultáneos pueden ser legítimos
    // (ej: bombo + caja + hi-hat)
    return 'VALID_CHORD';
  }

  // Regla 3: Instrumento polifónico → evaluar evidencia
  const pitches = events.map(e => e.pitch_midi).sort((a, b) => a - b);

  // Verificar si es un acorde plausible
  if (isPlausibleChord(pitches)) {
    return 'VALID_CHORD';
  }

  // Verificar contexto melódico: si los compases adyacentes tienen líneas melódicas
  // simples, es más probable que sea un arpegio mal alineado
  const contextIsMelodic = checkMelodicContext(
    events,
    allMeasures,
    measureNumber,
    allEvents
  );

  if (contextIsMelodic) {
    return 'SUSPECT_CLUSTER';
  }

  // Por defecto: si no hay evidencia suficiente, marcar como sospechoso
  return 'SUSPECT_CLUSTER';
}

/**
 * Verifica si un conjunto de pitches constituye un acorde plausible.
 */
function isPlausibleChord(pitches: number[]): boolean {
  if (pitches.length < 2) return false;
  if (pitches.length > 8) return false; // Demasiadas notas para un acorde típico

  // Calcular intervalos
  const intervals: number[] = [];
  for (let i = 1; i < pitches.length; i++) {
    intervals.push(pitches[i] - pitches[i - 1]);
  }

  // Acordes típicos: tríadas, tétradas, con intervalos de 3ª, 4ª, 5ª
  const hasThirds = intervals.some(i => i === 3 || i === 4);
  const hasFifths = intervals.some(i => i === 7);
  const hasFourths = intervals.some(i => i === 5);

  // Si tiene al menos una tercera y está dentro de una octava
  const range = pitches[pitches.length - 1] - pitches[0];
  if (range <= 12 && (hasThirds || hasFifths || hasFourths)) {
    return true;
  }

  return false;
}

/**
 * Verifica si el contexto sugiere línea melódica en lugar de acorde.
 */
function checkMelodicContext(
  events: MMCEvent[],
  allMeasures: { measure_number: number; event_ids: string[] }[],
  measureNumber: number,
  allEvents: Map<string, MMCEvent>
): boolean {
  // Buscar eventos en compases adyacentes
  const prevMeasure = allMeasures.find(m => m.measure_number === measureNumber - 1);
  const nextMeasure = allMeasures.find(m => m.measure_number === measureNumber + 1);

  if (!prevMeasure && !nextMeasure) return false;

  // Contar eventos de una sola nota en compases adyacentes
  let singleNoteMeasures = 0;
  let totalAdjacentMeasures = 0;

  if (prevMeasure) {
    totalAdjacentMeasures++;
    if (prevMeasure.event_ids.length <= 4) singleNoteMeasures++;
  }
  if (nextMeasure) {
    totalAdjacentMeasures++;
    if (nextMeasure.event_ids.length <= 4) singleNoteMeasures++;
  }

  // Si los compases adyacentes son mayoritariamente monofónicos,
  // es más probable que el cluster actual sea un arpegio mal alineado
  return singleNoteMeasures === totalAdjacentMeasures && totalAdjacentMeasures > 0;
}
