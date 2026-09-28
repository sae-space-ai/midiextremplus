/**
 * SAE - Issue Detector
 * Detecta incidencias en contexto completo
 */

import { MMCProject, MMCEvent } from '../mmc/types';
import { IssueType, EventContext } from './types';
import { buildEventContext, analyzeMelodicContinuity, detectSwingPattern } from './context-analyzer';

export interface DetectedIssue {
  eventId: string;
  issueType: IssueType;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  context: EventContext;
  evidence: string[];
}

/**
 * Detecta todas las incidencias en el proyecto
 */
export function detectAllIssues(project: MMCProject): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  
  for (const track of project.tracks) {
    for (const eventId of track.event_ids) {
      const event = project.events.get(eventId);
      if (!event) continue;
      
      const context = buildEventContext(event, project);
      const eventIssues = detectEventIssues(event, context, project);
      issues.push(...eventIssues);
    }
  }
  
  return issues;
}

/**
 * Detecta incidencias para un evento específico
 */
function detectEventIssues(
  event: MMCEvent,
  context: EventContext,
  project: MMCProject
): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  
  // 1. Off-grid
  const offGrid = detectOffGrid(event, context, project);
  if (offGrid) issues.push(offGrid);
  
  // 2. Clusters sospechosos
  const cluster = detectClusterIssue(event, context, project);
  if (cluster) issues.push(cluster);
  
  // 3. Micro-gaps
  const microGap = detectMicroGap(event, context);
  if (microGap) issues.push(microGap);
  
  // 4. Duraciones anormales
  const duration = detectDurationIssue(event, context);
  if (duration) issues.push(duration);
  
  // 5. Duplicados
  const duplicate = detectDuplicate(event, context);
  if (duplicate) issues.push(duplicate);
  
  // 6. Voice collision
  const voiceCollision = detectVoiceCollision(event, context);
  if (voiceCollision) issues.push(voiceCollision);
  
  // 7. Fuera de rango
  const outOfRange = detectOutOfRange(event, context, project);
  if (outOfRange) issues.push(outOfRange);
  
  // 8. Swing pattern
  const swing = detectSwingIssue(event, context);
  if (swing) issues.push(swing);
  
  return issues;
}

/**
 * Detecta eventos off-grid
 */
function detectOffGrid(
  event: MMCEvent,
  context: EventContext,
  project: MMCProject
): DetectedIssue | null {
  const ticksPerBeat = project.ticks_per_beat;
  const subdivision = 16; // semicorcheas
  const ticksPerSubdivision = ticksPerBeat / (subdivision / 4);
  
  const nearestGrid = Math.round(event.absolute_tick / ticksPerSubdivision) * ticksPerSubdivision;
  const delta = Math.abs(event.absolute_tick - nearestGrid);
  
  // Umbral: más de 10% de la subdivisión
  const threshold = ticksPerSubdivision * 0.1;
  
  if (delta > threshold) {
    const deltaRatio = delta / ticksPerSubdivision;
    
    return {
      eventId: event.event_id,
      issueType: 'OFF_GRID',
      severity: deltaRatio > 0.5 ? 'HIGH' : 'MEDIUM',
      description: `Evento desviado ${delta} ticks (${(deltaRatio * 100).toFixed(1)}%) de la rejilla`,
      context,
      evidence: [
        `Tick actual: ${event.absolute_tick}`,
        `Grid más cercano: ${nearestGrid}`,
        `Delta: ${delta} ticks`,
        `Delta ratio: ${(deltaRatio * 100).toFixed(1)}%`,
      ],
    };
  }
  
  return null;
}

/**
 * Detecta clusters sospechosos
 */
function detectClusterIssue(
  event: MMCEvent,
  context: EventContext,
  project: MMCProject
): DetectedIssue | null {
  const track = project.tracks.find(t => t.track_id === event.track_id);
  if (!track) return null;
  
  // Solo para instrumentos monofónicos
  if (track.instrument_capability !== 'MONOPHONIC') return null;
  
  // Buscar eventos simultáneos (dentro de 20 ticks)
  const simultaneous = context.measureEvents.filter(e => 
    e.event_id !== event.event_id &&
    Math.abs(e.absolute_tick - event.absolute_tick) < 20
  );
  
  if (simultaneous.length >= 2) {
    const allPitches = [event, ...simultaneous].map(e => e.pitch_midi);
    const uniquePitches = new Set(allPitches);
    
    if (uniquePitches.size >= 3) {
      return {
        eventId: event.event_id,
        issueType: 'CLUSTER_SUSPECT',
        severity: 'HIGH',
        description: `Cluster sospechoso: ${uniquePitches.size} alturas simultáneas en instrumento monofónico`,
        context,
        evidence: [
          `Pitches: [${allPitches.join(', ')}]`,
          `Únicos: ${uniquePitches.size}`,
          `Instrumento: ${track.instrument_capability}`,
        ],
      };
    }
  }
  
  return null;
}

/**
 * Detecta micro-gaps
 */
function detectMicroGap(
  event: MMCEvent,
  context: EventContext
): DetectedIssue | null {
  const { nextEvent } = context;
  if (!nextEvent) return null;
  
  const gap = nextEvent.absolute_tick - (event.absolute_tick + event.raw_duration);
  
  // Micro-gap: entre 5 y 30 ticks
  if (gap > 5 && gap < 30) {
    return {
      eventId: event.event_id,
      issueType: 'MICRO_GAP',
      severity: 'MEDIUM',
      description: `Micro-gap de ${gap} ticks entre eventos`,
      context,
      evidence: [
        `Fin evento actual: ${event.absolute_tick + event.raw_duration}`,
        `Inicio siguiente evento: ${nextEvent.absolute_tick}`,
        `Gap: ${gap} ticks`,
      ],
    };
  }
  
  return null;
}

/**
 * Detecta duraciones anormales
 */
function detectDurationIssue(
  event: MMCEvent,
  context: EventContext
): DetectedIssue | null {
  const duration = event.raw_duration;
  
  // Duración cero o negativa
  if (duration <= 0) {
    return {
      eventId: event.event_id,
      issueType: 'ZERO_DURATION',
      severity: 'CRITICAL',
      description: `Duración cero o negativa: ${duration} ticks`,
      context,
      evidence: [`Duración: ${duration} ticks`],
    };
  }
  
  // Duración extremadamente corta (< 10 ticks)
  if (duration < 10) {
    return {
      eventId: event.event_id,
      issueType: 'ABNORMAL_DURATION',
      severity: 'HIGH',
      description: `Duración extremadamente corta: ${duration} ticks`,
      context,
      evidence: [`Duración: ${duration} ticks`],
    };
  }
  
  // Duración extremadamente larga (> 10000 ticks)
  if (duration > 10000) {
    return {
      eventId: event.event_id,
      issueType: 'ABNORMAL_DURATION',
      severity: 'MEDIUM',
      description: `Duración extremadamente larga: ${duration} ticks`,
      context,
      evidence: [`Duración: ${duration} ticks`],
    };
  }
  
  return null;
}

/**
 * Detecta notas duplicadas
 */
function detectDuplicate(
  event: MMCEvent,
  context: EventContext
): DetectedIssue | null {
  const { nextEvent } = context;
  if (!nextEvent) return null;
  
  // Mismo pitch, muy cercanos en tiempo
  if (
    event.pitch_midi === nextEvent.pitch_midi &&
    Math.abs(nextEvent.absolute_tick - event.absolute_tick) < 10
  ) {
    return {
      eventId: event.event_id,
      issueType: 'DUPLICATE_NOTE',
      severity: 'HIGH',
      description: `Posible nota duplicada: mismo pitch en ${nextEvent.absolute_tick - event.absolute_tick} ticks`,
      context,
      evidence: [
        `Pitch: ${event.pitch_midi}`,
        `Tick actual: ${event.absolute_tick}`,
        `Tick siguiente: ${nextEvent.absolute_tick}`,
        `Delta: ${nextEvent.absolute_tick - event.absolute_tick} ticks`,
      ],
    };
  }
  
  return null;
}

/**
 * Detecta colisiones de voz
 */
function detectVoiceCollision(
  event: MMCEvent,
  context: EventContext
): DetectedIssue | null {
  const track = context.instrumentEvents.length > 0 ? 
    { instrument_capability: 'MONOPHONIC' } : null; // Simplificado
  
  if (!track || track.instrument_capability !== 'MONOPHONIC') return null;
  
  // Buscar overlaps en la misma voz
  const voiceEvents = context.voiceEvents.sort((a, b) => a.absolute_tick - b.absolute_tick);
  const idx = voiceEvents.findIndex(e => e.event_id === event.event_id);
  
  if (idx < voiceEvents.length - 1) {
    const next = voiceEvents[idx + 1];
    const eventEnd = event.absolute_tick + event.raw_duration;
    
    if (eventEnd > next.absolute_tick) {
      return {
        eventId: event.event_id,
        issueType: 'VOICE_COLLISION',
        severity: 'HIGH',
        description: `Colisión de voz: overlap de ${eventEnd - next.absolute_tick} ticks`,
        context,
        evidence: [
          `Fin evento actual: ${eventEnd}`,
          `Inicio siguiente: ${next.absolute_tick}`,
          `Overlap: ${eventEnd - next.absolute_tick} ticks`,
        ],
      };
    }
  }
  
  return null;
}

/**
 * Detecta notas fuera de rango
 */
function detectOutOfRange(
  event: MMCEvent,
  context: EventContext,
  project: MMCProject
): DetectedIssue | null {
  const track = project.tracks.find(t => t.track_id === event.track_id);
  if (!track) return null;
  
  // Rangos típicos por familia
  const ranges: Record<string, { min: number; max: number }> = {
    'Madera': { min: 58, max: 91 },
    'Metal': { min: 52, max: 79 },
    'Cuerda frotada': { min: 36, max: 103 },
    'Percusión': { min: 35, max: 81 },
  };
  
  const range = ranges[track.instrument_family || ''];
  if (!range) return null;
  
  if (event.pitch_midi < range.min || event.pitch_midi > range.max) {
    return {
      eventId: event.event_id,
      issueType: 'OUT_OF_RANGE',
      severity: 'MEDIUM',
      description: `Nota fuera del rango típico del instrumento`,
      context,
      evidence: [
        `Pitch: ${event.pitch_midi}`,
        `Rango esperado: ${range.min}-${range.max}`,
        `Familia: ${track.instrument_family}`,
      ],
    };
  }
  
  return null;
}

/**
 * Detecta patrones de swing
 */
function detectSwingIssue(
  event: MMCEvent,
  context: EventContext
): DetectedIssue | null {
  const swing = detectSwingPattern(context);
  
  if (swing.isSwing && swing.confidence > 0.7) {
    return {
      eventId: event.event_id,
      issueType: 'SWING_PATTERN',
      severity: 'LOW',
      description: `Patrón de swing detectado (confianza: ${(swing.confidence * 100).toFixed(0)}%)`,
      context,
      evidence: [
        `Patrón: ${swing.pattern}`,
        `Confianza: ${(swing.confidence * 100).toFixed(0)}%`,
      ],
    };
  }
  
  return null;
}
