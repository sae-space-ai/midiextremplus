/**
 * Auto Track Assignment Engine (ATAE) - Main Engine
 * Motor principal de asignación automática de pistas
 */

import { MidiProject, TrackInfo } from '../midi/model';
import {
  TrackAssignment,
  InstrumentFamily,
  MusicalRole,
  MMCLayer,
  AssignmentSource,
  AssignmentConfidence,
  ATAEConfig,
  DEFAULT_ATAE_CONFIG,
} from './types';
import { findInstrumentByName, findInstrumentsByProgram } from './dictionary';

/**
 * Asigna automáticamente todas las pistas de un proyecto MIDI
 */
export function autoAssignTracks(
  project: MidiProject,
  config: ATAEConfig = DEFAULT_ATAE_CONFIG
): TrackAssignment[] {
  const assignments: TrackAssignment[] = [];

  for (const track of project.tracks) {
    const assignment = analyzeTrack(track, project, config);
    assignments.push(assignment);
  }

  return assignments;
}

/**
 * Analiza una pista individual y determina su asignación
 */
function analyzeTrack(
  track: TrackInfo,
  project: MidiProject,
  config: ATAEConfig
): TrackAssignment {
  const evidence = {
    nameMatch: false,
    programMatch: false,
    channelMatch: false,
    registerMatch: false,
    behaviorMatch: false,
  };

  let detectedInstrument: string | undefined;
  let instrumentFamily: InstrumentFamily | undefined;
  let musicalRole: MusicalRole | undefined;
  let mmcLayer: MMCLayer | undefined;
  let orchestralGroup: string | undefined;
  let confidence: AssignmentConfidence = 'REVIEW';
  let source: AssignmentSource = 'UNKNOWN';

  // 1. Análisis por nombre de pista
  if (track.name) {
    const instrument = findInstrumentByName(track.name);
    if (instrument) {
      detectedInstrument = instrument.name;
      instrumentFamily = instrument.family;
      orchestralGroup = instrument.orchestralGroup;
      evidence.nameMatch = true;
      source = 'TRACK_NAME';
      confidence = 'HIGH';
    }
  }

  // 2. Análisis por programa MIDI
  if (track.program !== undefined && !evidence.nameMatch) {
    const instruments = findInstrumentsByProgram(track.program);
    if (instruments.length === 1) {
      const instrument = instruments[0];
      detectedInstrument = instrument.name;
      instrumentFamily = instrument.family;
      orchestralGroup = instrument.orchestralGroup;
      evidence.programMatch = true;
      source = 'PROGRAM_CHANGE';
      confidence = 'MEDIUM';
    } else if (instruments.length > 1) {
      // Múltiples instrumentos con el mismo programa
      // Usar el primero como candidato
      const instrument = instruments[0];
      detectedInstrument = instrument.name;
      instrumentFamily = instrument.family;
      orchestralGroup = instrument.orchestralGroup;
      evidence.programMatch = true;
      source = 'PROGRAM_CHANGE';
      confidence = 'LOW';
    }
  }

  // 3. Análisis por canal (percusión en canal 10)
  if (track.channel === 9 && !instrumentFamily) {
    // Canal 10 (0-indexed = 9) es percusión en GM
    detectedInstrument = 'Drums';
    instrumentFamily = 'PERCUSSION';
    orchestralGroup = 'Percussion';
    evidence.channelMatch = true;
    source = 'CHANNEL';
    confidence = 'HIGH';
  }

  // 4. Análisis de registro (si está habilitado)
  if (config.enableRegisterAnalysis && track.notes.length > 0) {
    const register = analyzeRegister(track);
    
    if (register && !instrumentFamily) {
      // Inferir familia por registro
      if (register.min < 40 && register.max < 70) {
        // Registro muy bajo: probablemente bajo
        instrumentFamily = 'STRINGS';
        musicalRole = 'BASS';
        evidence.registerMatch = true;
        confidence = 'LOW';
      } else if (register.min > 70) {
        // Registro muy alto: probablemente madera aguda
        instrumentFamily = 'WOODWIND';
        musicalRole = 'MELODY';
        evidence.registerMatch = true;
        confidence = 'LOW';
      }
    }

    // Validar registro contra instrumento detectado
    if (detectedInstrument && register) {
      const instrument = findInstrumentByName(detectedInstrument);
      if (instrument && instrument.typicalRegister) {
        const { min, max } = instrument.typicalRegister;
        const overlap = 
          Math.max(register.min, min) <= Math.min(register.max, max);
        
        if (overlap) {
          evidence.registerMatch = true;
          // Aumentar confianza si el registro coincide
          if (confidence === 'MEDIUM') confidence = 'HIGH';
        }
      }
    }
  }

  // 5. Análisis de comportamiento (si está habilitado)
  if (config.enableBehaviorAnalysis && track.notes.length > 0) {
    const behavior = analyzeBehavior(track);
    
    if (behavior) {
      // Detectar percusión por patrón rítmico
      if (behavior.isPercussive && !instrumentFamily) {
        detectedInstrument = 'Drums';
        instrumentFamily = 'PERCUSSION';
        orchestralGroup = 'Percussion';
        evidence.behaviorMatch = true;
        confidence = 'MEDIUM';
      }

      // Detectar bajo por patrón
      if (behavior.isBassLike && !musicalRole) {
        musicalRole = 'BASS';
        evidence.behaviorMatch = true;
      }

      // Detectar monofonía
      if (behavior.isMonophonic && detectedInstrument) {
        const instrument = findInstrumentByName(detectedInstrument);
        if (instrument && instrument.primarilyMonophonic) {
          evidence.behaviorMatch = true;
        }
      }
    }
  }

  // 6. Determinar función musical si no está asignada
  if (!musicalRole && instrumentFamily) {
    musicalRole = inferMusicalRole(instrumentFamily, track);
  }

  // 7. Determinar capa MMC
  if (instrumentFamily) {
    mmcLayer = determineMMCLayer(instrumentFamily, musicalRole);
  }

  // 8. Ajustar confianza final
  const evidenceCount = Object.values(evidence).filter(v => v).length;
  if (evidenceCount >= 3 && confidence !== 'HIGH') {
    confidence = 'HIGH';
  } else if (evidenceCount >= 2 && confidence === 'LOW') {
    confidence = 'MEDIUM';
  }

  return {
    trackId: track.index,
    trackName: track.name,
    midiChannel: track.channel,
    midiProgram: track.program,
    detectedInstrument,
    instrumentFamily,
    musicalRole,
    mmcLayer,
    orchestralGroup,
    assignmentConfidence: confidence,
    assignmentSource: source,
    humanOverride: false,
    evidence,
  };
}

/**
 * Analiza el registro de una pista
 */
function analyzeRegister(track: TrackInfo): { min: number; max: number; avg: number } | null {
  if (track.notes.length === 0) return null;

  const pitches = track.notes.map(n => n.pitch);
  const min = Math.min(...pitches);
  const max = Math.max(...pitches);
  const avg = pitches.reduce((a, b) => a + b, 0) / pitches.length;

  return { min, max, avg };
}

/**
 * Analiza el comportamiento musical de una pista
 */
function analyzeBehavior(track: TrackInfo): {
  isPercussive: boolean;
  isBassLike: boolean;
  isMonophonic: boolean;
  avgDuration: number;
  noteDensity: number;
} | null {
  if (track.notes.length === 0) return null;

  // Calcular duración promedio
  const durations = track.notes.map(n => n.endTick - n.startTick);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

  // Detectar percusión por duración corta
  const isPercussive = avgDuration < 120; // menos de 1/4 de negra

  // Detectar bajo por registro
  const pitches = track.notes.map(n => n.pitch);
  const avgPitch = pitches.reduce((a, b) => a + b, 0) / pitches.length;
  const isBassLike = avgPitch < 50; // por debajo de B2

  // Detectar monofonía
  const isMonophonic = track.notes.length > 0 && 
    !track.notes.some((n, i, arr) => 
      arr.some((m, j) => i !== j && 
        Math.abs(n.startTick - m.startTick) < 10 && 
        n.pitch !== m.pitch
      )
    );

  // Densidad de notas
  const timeSpan = track.notes.length > 0 
    ? Math.max(...track.notes.map(n => n.endTick)) - Math.min(...track.notes.map(n => n.startTick))
    : 1;
  const noteDensity = track.notes.length / (timeSpan / 480); // notas por negra

  return {
    isPercussive,
    isBassLike,
    isMonophonic,
    avgDuration,
    noteDensity,
  };
}

/**
 * Infiere la función musical basada en la familia
 */
function inferMusicalRole(family: InstrumentFamily, track: TrackInfo): MusicalRole {
  // Análisis simple basado en familia y registro
  const register = analyzeRegister(track);
  
  if (family === 'PERCUSSION') {
    return 'PERCUSSION';
  }

  if (register) {
    if (register.avg < 50) {
      return 'BASS';
    } else if (register.avg > 75) {
      return 'MELODY';
    }
  }

  // Por defecto, basado en familia
  switch (family) {
    case 'WOODWIND':
    case 'BRASS':
      return 'MELODY';
    case 'STRINGS':
      return 'HARMONY';
    case 'KEYBOARD':
      return 'HARMONY';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Determina la capa MMC basada en familia y función
 */
function determineMMCLayer(family: InstrumentFamily, role?: MusicalRole): MMCLayer {
  // Percusión siempre va a L1
  if (family === 'PERCUSSION') {
    return 'L1_RHYTHMIC_BASE';
  }

  // Bajo va a L2 independientemente de la familia
  if (role === 'BASS') {
    return 'L2_HARMONIC_BASS';
  }

  // Familias instrumentales
  switch (family) {
    case 'WOODWIND':
    case 'STRINGS':
      return 'L3_STRINGS_WOODWINDS';
    case 'BRASS':
      return 'L4_BRASS';
    case 'KEYBOARD':
    case 'SYNTH':
      return 'L5_AUXILIARY';
    default:
      return 'L5_AUXILIARY';
  }
}

/**
 * Aplica las asignaciones al proyecto
 */
export function applyAssignments(
  project: MidiProject,
  assignments: TrackAssignment[]
): MidiProject {
  const updatedProject = { ...project };

  for (const assignment of assignments) {
    const track = updatedProject.tracks.find(t => t.index === assignment.trackId);
    if (!track) continue;

    // Actualizar rol musical
    if (assignment.musicalRole) {
      const roleMap: Record<MusicalRole, 'melody' | 'harmony' | 'bass' | 'percussion' | 'other' | 'unassigned'> = {
        'MELODY': 'melody',
        'HARMONY': 'harmony',
        'BASS': 'bass',
        'PERCUSSION': 'percussion',
        'COUNTERPOINT': 'melody',
        'PAD': 'harmony',
        'FX': 'other',
        'UNKNOWN': 'unassigned',
      };
      track.role = roleMap[assignment.musicalRole] || 'unassigned';
    }

    // Actualizar polifonía basada en instrumento
    if (assignment.detectedInstrument) {
      const instrument = findInstrumentByName(assignment.detectedInstrument);
      if (instrument) {
        if (instrument.family === 'PERCUSSION') {
          track.polyphony = 'percussion';
        } else if (instrument.primarilyMonophonic) {
          track.polyphony = 'mono';
        } else {
          track.polyphony = 'poly';
        }
      }
    }
  }

  return updatedProject;
}

/**
 * Reanaliza las asignaciones de un proyecto
 */
export function reanalyzeAssignments(
  project: MidiProject,
  existingAssignments: TrackAssignment[],
  config: ATAEConfig = DEFAULT_ATAE_CONFIG
): TrackAssignment[] {
  const newAssignments: TrackAssignment[] = [];

  for (const track of project.tracks) {
    const existing = existingAssignments.find(a => a.trackId === track.index);
    
    // Si hay override humano, preservarlo
    if (existing?.humanOverride) {
      newAssignments.push(existing);
      continue;
    }

    // Reanalizar
    const assignment = analyzeTrack(track, project, config);
    newAssignments.push(assignment);
  }

  return newAssignments;
}

/**
 * Marca una asignación como override humano
 */
export function markHumanOverride(
  assignments: TrackAssignment[],
  trackId: number,
  newFamily: InstrumentFamily,
  newRole: MusicalRole
): TrackAssignment[] {
  return assignments.map(a => {
    if (a.trackId === trackId) {
      return {
        ...a,
        instrumentFamily: newFamily,
        musicalRole: newRole,
        assignmentSource: 'MANUAL' as AssignmentSource,
        assignmentConfidence: 'HIGH' as AssignmentConfidence,
        humanOverride: true,
      };
    }
    return a;
  });
}
