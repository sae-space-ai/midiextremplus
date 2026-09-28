/**
 * SAE - Context Analyzer
 * Analiza eventos en su contexto completo (no aisladamente)
 */

import { MMCProject, MMCEvent } from '../mmc/types';
import { EventContext } from './types';

/**
 * Construye el contexto completo para un evento
 */
export function buildEventContext(
  event: MMCEvent,
  project: MMCProject
): EventContext {
  const track = project.tracks.find(t => t.track_id === event.track_id);
  if (!track) {
    throw new Error(`Track ${event.track_id} not found`);
  }

  // Obtener todos los eventos de la pista ordenados por tick
  const allTrackEvents = track.event_ids
    .map(id => project.events.get(id))
    .filter((e): e is MMCEvent => e !== undefined)
    .sort((a, b) => a.absolute_tick - b.absolute_tick);

  // Encontrar posición del evento actual
  const currentIndex = allTrackEvents.findIndex(e => e.event_id === event.event_id);
  
  // Eventos anterior y siguiente
  const previousEvent = currentIndex > 0 ? allTrackEvents[currentIndex - 1] : null;
  const nextEvent = currentIndex < allTrackEvents.length - 1 ? allTrackEvents[currentIndex + 1] : null;

  // Eventos del mismo compás
  const measureEvents = allTrackEvents.filter(e => e.measure === event.measure);

  // Eventos de la misma voz
  const voiceEvents = allTrackEvents.filter(e => e.voice_id === event.voice_id);

  // Eventos de la frase (ventana de ±2 compases)
  const phraseEvents = allTrackEvents.filter(e => 
    Math.abs(e.measure - event.measure) <= 2
  );

  // Todos los eventos del instrumento
  const instrumentEvents = allTrackEvents;

  // Grid local (posiciones de rejilla cercanas)
  const localGrid = computeLocalGrid(event, project);

  // Patrón rítmico
  const rhythmicPattern = detectRhythmicPattern(event, measureEvents);

  // Contexto armónico (simplificado)
  const harmonicContext = detectHarmonicContext(event, measureEvents);

  return {
    event,
    previousEvent,
    nextEvent,
    measureEvents,
    voiceEvents,
    phraseEvents,
    instrumentEvents,
    localGrid,
    rhythmicPattern,
    harmonicContext,
  };
}

/**
 * Calcula el grid local alrededor de un evento
 */
function computeLocalGrid(event: MMCEvent, project: MMCProject): number[] {
  const ticksPerBeat = project.ticks_per_beat;
  const subdivision = 16; // semicorcheas
  const ticksPerSubdivision = ticksPerBeat / (subdivision / 4);
  
  // Grid desde 2 subdivisiones antes hasta 2 después
  const center = event.absolute_tick;
  const grid: number[] = [];
  
  for (let i = -2; i <= 2; i++) {
    const gridTick = Math.round(center / ticksPerSubdivision) * ticksPerSubdivision + i * ticksPerSubdivision;
    if (gridTick >= 0) {
      grid.push(gridTick);
    }
  }
  
  return grid;
}

/**
 * Detecta el patrón rítmico en el compás
 */
function detectRhythmicPattern(event: MMCEvent, measureEvents: MMCEvent[]): string {
  if (measureEvents.length === 0) return 'EMPTY';
  
  // Ordenar eventos por tick
  const sorted = [...measureEvents].sort((a, b) => a.absolute_tick - b.absolute_tick);
  
  // Calcular intervalos
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(sorted[i].absolute_tick - sorted[i - 1].absolute_tick);
  }
  
  // Clasificar patrón
  if (intervals.length === 0) return 'SINGLE_NOTE';
  
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const ticksPerBeat = 480; // Asumiendo PPQ estándar
  
  if (avgInterval > ticksPerBeat * 2) return 'LONG_NOTES';
  if (avgInterval > ticksPerBeat) return 'HALF_NOTES';
  if (avgInterval > ticksPerBeat / 2) return 'QUARTER_NOTES';
  if (avgInterval > ticksPerBeat / 4) return 'EIGHTH_NOTES';
  if (avgInterval > ticksPerBeat / 8) return 'SIXTEENTH_NOTES';
  return 'VERY_FAST';
}

/**
 * Detecta contexto armónico simplificado
 */
function detectHarmonicContext(event: MMCEvent, measureEvents: MMCEvent[]): string | null {
  // Si hay múltiples notas simultáneas, es probable acorde
  const simultaneous = measureEvents.filter(e => 
    Math.abs(e.absolute_tick - event.absolute_tick) < 10
  );
  
  if (simultaneous.length >= 3) {
    return 'CHORD';
  }
  
  // Si hay notas en movimiento stepwise, es probable escala/pasaje
  if (event.previous_pitch !== null && event.next_pitch !== null) {
    const interval1 = Math.abs(event.pitch_midi - event.previous_pitch);
    const interval2 = Math.abs(event.next_pitch - event.pitch_midi);
    
    if (interval1 <= 2 && interval2 <= 2) {
      return 'STEPWISE_MOTION';
    }
  }
  
  return null;
}

/**
 * Analiza la continuidad melódica en ventana extendida
 */
export function analyzeMelodicContinuity(
  event: MMCEvent,
  context: EventContext
): {
  isContinuous: boolean;
  direction: 'UP' | 'DOWN' | 'SAME' | 'UNKNOWN';
  continuityScore: number;
  isLikelyExpressive: boolean;
} {
  const { previousEvent, nextEvent, phraseEvents } = context;
  
  if (!previousEvent && !nextEvent) {
    return {
      isContinuous: false,
      direction: 'UNKNOWN',
      continuityScore: 0,
      isLikelyExpressive: false,
    };
  }
  
  // Calcular dirección
  let direction: 'UP' | 'DOWN' | 'SAME' | 'UNKNOWN' = 'UNKNOWN';
  
  if (previousEvent && nextEvent) {
    if (event.pitch_midi > previousEvent.pitch_midi && event.pitch_midi < nextEvent.pitch_midi) {
      direction = 'UP';
    } else if (event.pitch_midi < previousEvent.pitch_midi && event.pitch_midi > nextEvent.pitch_midi) {
      direction = 'DOWN';
    } else if (event.pitch_midi === previousEvent.pitch_midi && event.pitch_midi === nextEvent.pitch_midi) {
      direction = 'SAME';
    }
  } else if (previousEvent) {
    direction = event.pitch_midi > previousEvent.pitch_midi ? 'UP' : 
                event.pitch_midi < previousEvent.pitch_midi ? 'DOWN' : 'SAME';
  } else if (nextEvent) {
    direction = event.pitch_midi < nextEvent.pitch_midi ? 'UP' : 
                event.pitch_midi > nextEvent.pitch_midi ? 'DOWN' : 'SAME';
  }
  
  // Calcular score de continuidad
  let continuityScore = 0.5; // base
  
  // Factor 1: Proximidad temporal
  if (previousEvent) {
    const gap = event.absolute_tick - (previousEvent.absolute_tick + previousEvent.raw_duration);
    if (gap < 0) continuityScore += 0.2; // overlap = legato
    else if (gap < 20) continuityScore += 0.15;
    else if (gap < 50) continuityScore += 0.1;
    else continuityScore -= 0.1;
  }
  
  // Factor 2: Proximidad de altura
  if (previousEvent) {
    const pitchDiff = Math.abs(event.pitch_midi - previousEvent.pitch_midi);
    if (pitchDiff <= 2) continuityScore += 0.2;
    else if (pitchDiff <= 5) continuityScore += 0.1;
    else if (pitchDiff <= 12) continuityScore += 0.05;
  }
  
  // Factor 3: Consistencia direccional en frase
  if (phraseEvents.length >= 3) {
    const sorted = [...phraseEvents].sort((a, b) => a.absolute_tick - b.absolute_tick);
    const idx = sorted.findIndex(e => e.event_id === event.event_id);
    
    if (idx > 0 && idx < sorted.length - 1) {
      const prev = sorted[idx - 1];
      const next = sorted[idx + 1];
      
      const dir1 = event.pitch_midi - prev.pitch_midi;
      const dir2 = next.pitch_midi - event.pitch_midi;
      
      if ((dir1 > 0 && dir2 > 0) || (dir1 < 0 && dir2 < 0)) {
        continuityScore += 0.15; // misma dirección
      }
    }
  }
  
  continuityScore = Math.max(0, Math.min(1, continuityScore));
  
  // Detectar si es timing expresivo
  const isLikelyExpressive = detectExpressiveTiming(context);
  
  return {
    isContinuous: continuityScore > 0.6,
    direction,
    continuityScore,
    isLikelyExpressive,
  };
}

/**
 * Detecta si hay un patrón de timing expresivo
 */
function detectExpressiveTiming(context: EventContext): boolean {
  const { phraseEvents } = context;
  
  if (phraseEvents.length < 4) return false;
  
  // Ordenar por tick
  const sorted = [...phraseEvents].sort((a, b) => a.absolute_tick - b.absolute_tick);
  
  // Calcular desviaciones del grid
  const deviations: number[] = [];
  const ticksPerSubdivision = 480 / 4; // semicorcheas
  
  for (const event of sorted) {
    const nearestGrid = Math.round(event.absolute_tick / ticksPerSubdivision) * ticksPerSubdivision;
    const deviation = event.absolute_tick - nearestGrid;
    deviations.push(deviation);
  }
  
  // Si todas las desviaciones tienen el mismo signo y magnitud similar, es expresivo
  const allPositive = deviations.every(d => d > 0);
  const allNegative = deviations.every(d => d < 0);
  
  if (allPositive || allNegative) {
    const avgDeviation = deviations.reduce((a, b) => a + Math.abs(b), 0) / deviations.length;
    const maxDeviation = Math.max(...deviations.map(d => Math.abs(d)));
    
    // Si la variación es pequeña, es expresivo
    if (maxDeviation < avgDeviation * 2) {
      return true;
    }
  }
  
  return false;
}

/**
 * Detecta patrones de swing
 */
export function detectSwingPattern(context: EventContext): {
  isSwing: boolean;
  confidence: number;
  pattern: string | null;
} {
  const { phraseEvents } = context;
  
  if (phraseEvents.length < 6) {
    return { isSwing: false, confidence: 0, pattern: null };
  }
  
  // Ordenar por tick
  const sorted = [...phraseEvents].sort((a, b) => a.absolute_tick - b.absolute_tick);
  
  // Calcular intervalos
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(sorted[i].absolute_tick - sorted[i - 1].absolute_tick);
  }
  
  if (intervals.length < 4) {
    return { isSwing: false, confidence: 0, pattern: null };
  }
  
  // Buscar patrón largo-corto repetido
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const longThreshold = avgInterval * 1.3;
  const shortThreshold = avgInterval * 0.7;
  
  let longShortCount = 0;
  for (let i = 0; i < intervals.length - 1; i++) {
    if (intervals[i] > longThreshold && intervals[i + 1] < shortThreshold) {
      longShortCount++;
    }
  }
  
  const ratio = longShortCount / (intervals.length - 1);
  
  if (ratio > 0.6) {
    return {
      isSwing: true,
      confidence: ratio,
      pattern: 'LONG_SHORT',
    };
  }
  
  return { isSwing: false, confidence: 0, pattern: null };
}
