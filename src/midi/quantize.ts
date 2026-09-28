// Motor de cuantización MIDI
// Implementa modos ESTRICTO, INTERPRETATIVO y ASISTIDO

import { MidiProject, MidiNote, QuantizeConfig, DiagnosticIssue, rational } from './model';

let diagId = 1000;
function nextDiagId(): string {
  return `diag_${++diagId}`;
}

interface QuantizeResult {
  project: MidiProject;
  newIssues: DiagnosticIssue[];
  stats: QuantizeStats;
}

export interface QuantizeStats {
  totalNotes: number;
  quantizedNotes: number;
  protectedNotes: number;
  flaggedNotes: number;
  maxDisplacementApplied: number;
  avgDisplacement: number;
  notesBeyondLimit: number;
}

/**
 * Calcula la posición de rejilla más cercana a un tick dado
 */
function findNearestGridPosition(
  tick: number,
  ticksPerBeat: number,
  gridDivision: number,
  useTriplets: boolean,
  swingAmount: number
): number {
  // Grid size in ticks
  let gridTicks: number;
  
  if (useTriplets) {
    // Triplet subdivision: 3 notes per beat division
    gridTicks = (ticksPerBeat * 4) / (gridDivision * 3 / 2);
  } else {
    gridTicks = (ticksPerBeat * 4) / gridDivision;
  }
  
  // Find nearest grid position
  const beat = Math.floor(tick / ticksPerBeat);
  const posInBeat = tick - beat * ticksPerBeat;
  
  let gridPos = Math.round(posInBeat / gridTicks) * gridTicks;
  
  // Apply swing to off-beat positions
  if (swingAmount > 0) {
    const beatPosition = Math.round(posInBeat / gridTicks);
    const isOffBeat = beatPosition % 2 !== 0;
    if (isOffBeat) {
      const swingOffset = (gridTicks * swingAmount) / 200; // swing 0-100 -> offset
      gridPos += swingOffset;
    }
  }
  
  return beat * ticksPerBeat + gridPos;
}

/**
 * Calcula la rejilla con subdivisiones mixtas (tresillos donde corresponda)
 */
function findAllGridPositions(
  ticksPerBeat: number,
  totalTicks: number,
  gridDivision: number,
  useTriplets: boolean
): number[] {
  const positions: Set<number> = new Set();
  
  // Regular grid
  const gridTicks = (ticksPerBeat * 4) / gridDivision;
  for (let tick = 0; tick <= totalTicks; tick += gridTicks) {
    positions.add(Math.round(tick));
  }
  
  // If triplets, also add triplet positions
  if (useTriplets) {
    const tripletTicks = (ticksPerBeat * 4) / (gridDivision * 3 / 2);
    for (let tick = 0; tick <= totalTicks; tick += tripletTicks) {
      positions.add(Math.round(tick));
    }
  }
  
  return Array.from(positions).sort((a, b) => a - b);
}

/**
 * Encuentra la posición de rejilla más cercana desde un conjunto de posiciones
 */
function findNearestFromGrid(tick: number, gridPositions: number[]): number {
  let nearest = gridPositions[0];
  let minDist = Math.abs(tick - nearest);
  
  for (const pos of gridPositions) {
    const dist = Math.abs(tick - pos);
    if (dist < minDist) {
      minDist = dist;
      nearest = pos;
    }
  }
  
  return nearest;
}

/**
 * Cuantización ESTRICTA: ajusta ataques exactamente a la rejilla
 */
function quantizeStrict(
  notes: MidiNote[],
  config: QuantizeConfig,
  ticksPerBeat: number,
  totalTicks: number
): { notes: MidiNote[]; issues: DiagnosticIssue[]; stats: Partial<QuantizeStats> } {
  const newNotes = notes.map(n => ({ ...n }));
  const issues: DiagnosticIssue[] = [];
  let quantizedCount = 0;
  let protectedCount = 0;
  let flaggedCount = 0;
  let maxDisp = 0;
  let totalDisp = 0;
  let beyondLimit = 0;
  
  const gridPositions = findAllGridPositions(ticksPerBeat, totalTicks, config.gridDivision, config.useTriplets);
  
  for (const note of newNotes) {
    // Skip protected notes
    if (config.preserveSelected && note.isProtected) {
      protectedCount++;
      continue;
    }
    
    // Check range
    if (config.rangeStartBar !== undefined || config.rangeEndBar !== undefined) {
      // Simplified range check - would need bar calculation
    }
    
    const nearestGrid = findNearestFromGrid(note.startTick, gridPositions);
    const displacement = nearestGrid - note.startTick;
    const absDisplacement = Math.abs(displacement);
    
    // Check if already on grid
    if (absDisplacement === 0) {
      continue;
    }
    
    // Check max displacement limit
    if (absDisplacement > config.maxDisplacement) {
      note.isFlagged = true;
      note.flagReason = `Desplazamiento ${absDisplacement} ticks supera límite ${config.maxDisplacement} ticks. No modificada.`;
      flaggedCount++;
      beyondLimit++;
      issues.push({
        id: nextDiagId(),
        severity: 'warning',
        category: 'timing',
        message: `Nota pitch ${note.pitch} en pista ${note.trackIndex}: desplazamiento ${absDisplacement} ticks supera límite. Sin modificar.`,
        trackIndex: note.trackIndex,
        tick: note.startTick,
        noteId: note.id
      });
      continue;
    }
    
    // Apply quantization with strength
    const effectiveDisplacement = Math.round(displacement * (config.strength / 100));
    
    note.correctedStartTick = note.startTick + effectiveDisplacement;
    note.isModified = true;
    note.modificationReason = `Cuantización estricta: ${displacement > 0 ? '+' : ''}${effectiveDisplacement} ticks`;
    quantizedCount++;
    
    if (absDisplacement > maxDisp) maxDisp = absDisplacement;
    totalDisp += absDisplacement;
    
    // Handle duration if not quantizing attacks only
    if (!config.quantizeAttacksOnly) {
      const endNearestGrid = findNearestFromGrid(note.endTick, gridPositions);
      const endDisplacement = endNearestGrid - note.endTick;
      if (Math.abs(endDisplacement) <= config.maxDisplacement) {
        note.correctedEndTick = note.endTick + Math.round(endDisplacement * (config.strength / 100));
      }
    }
    
    // Ensure valid duration
    if (note.correctedEndTick <= note.correctedStartTick) {
      note.correctedEndTick = note.correctedStartTick + 1;
    }
  }
  
  return {
    notes: newNotes,
    issues,
    stats: {
      quantizedNotes: quantizedCount,
      protectedNotes: protectedCount,
      flaggedNotes: flaggedCount,
      maxDisplacementApplied: maxDisp,
      avgDisplacement: quantizedCount > 0 ? totalDisp / quantizedCount : 0,
      notesBeyondLimit: beyondLimit
    }
  };
}

/**
 * Cuantización INTERPRETATIVA: reduce desviaciones manteniendo expresión
 */
function quantizeInterpretive(
  notes: MidiNote[],
  config: QuantizeConfig,
  ticksPerBeat: number,
  totalTicks: number
): { notes: MidiNote[]; issues: DiagnosticIssue[]; stats: Partial<QuantizeStats> } {
  const newNotes = notes.map(n => ({ ...n }));
  const issues: DiagnosticIssue[] = [];
  let quantizedCount = 0;
  let protectedCount = 0;
  let flaggedCount = 0;
  let maxDisp = 0;
  let totalDisp = 0;
  let beyondLimit = 0;
  
  const gridPositions = findAllGridPositions(ticksPerBeat, totalTicks, config.gridDivision, config.useTriplets);
  
  // Strength acts as how much to pull toward grid
  // Low strength = more human feel preserved
  // High strength = closer to strict
  const pullFactor = config.strength / 100;
  
  for (const note of newNotes) {
    if (config.preserveSelected && note.isProtected) {
      protectedCount++;
      continue;
    }
    
    const nearestGrid = findNearestFromGrid(note.startTick, gridPositions);
    const displacement = nearestGrid - note.startTick;
    const absDisplacement = Math.abs(displacement);
    
    if (absDisplacement === 0) continue;
    
    if (absDisplacement > config.maxDisplacement) {
      note.isFlagged = true;
      note.flagReason = `Desplazamiento ${absDisplacement} ticks supera límite en modo interpretativo.`;
      flaggedCount++;
      beyondLimit++;
      issues.push({
        id: nextDiagId(),
        severity: 'info',
        category: 'timing',
        message: `Nota pitch ${note.pitch}: desviación grande (${absDisplacement} ticks). Revisar manualmente.`,
        trackIndex: note.trackIndex,
        tick: note.startTick,
        noteId: note.id
      });
      continue;
    }
    
    // In interpretive mode, apply partial correction based on strength
    // Notes closer to grid get more correction, notes further get less
    const proximityFactor = 1 - (absDisplacement / config.maxDisplacement);
    const effectivePull = pullFactor * (0.5 + 0.5 * proximityFactor);
    
    const effectiveDisplacement = Math.round(displacement * effectivePull);
    
    if (effectiveDisplacement !== 0) {
      note.correctedStartTick = note.startTick + effectiveDisplacement;
      note.isModified = true;
      note.modificationReason = `Cuantización interpretativa: ${effectiveDisplacement > 0 ? '+' : ''}${effectiveDisplacement} ticks (fuerza ${Math.round(effectivePull * 100)}%)`;
      quantizedCount++;
    }
    
    if (absDisplacement > maxDisp) maxDisp = absDisplacement;
    totalDisp += absDisplacement;
  }
  
  return {
    notes: newNotes,
    issues,
    stats: {
      quantizedNotes: quantizedCount,
      protectedNotes: protectedCount,
      flaggedNotes: flaggedCount,
      maxDisplacementApplied: maxDisp,
      avgDisplacement: quantizedCount > 0 ? totalDisp / quantizedCount : 0,
      notesBeyondLimit: beyondLimit
    }
  };
}

/**
 * Cuantización ASISTIDA: propone correcciones para revisión
 */
function quantizeAssisted(
  notes: MidiNote[],
  config: QuantizeConfig,
  ticksPerBeat: number,
  totalTicks: number
): { notes: MidiNote[]; issues: DiagnosticIssue[]; stats: Partial<QuantizeStats> } {
  const newNotes = notes.map(n => ({ ...n }));
  const issues: DiagnosticIssue[] = [];
  let quantizedCount = 0;
  let protectedCount = 0;
  let flaggedCount = 0;
  let maxDisp = 0;
  let totalDisp = 0;
  let beyondLimit = 0;
  
  const gridPositions = findAllGridPositions(ticksPerBeat, totalTicks, config.gridDivision, config.useTriplets);
  
  // In assisted mode, only auto-correct notes very close to grid
  // Flag ambiguous notes for manual review
  const autoThreshold = ticksPerBeat / config.gridDivision / 4; // 1/4 of grid unit
  
  for (const note of newNotes) {
    if (config.preserveSelected && note.isProtected) {
      protectedCount++;
      continue;
    }
    
    const nearestGrid = findNearestFromGrid(note.startTick, gridPositions);
    const displacement = nearestGrid - note.startTick;
    const absDisplacement = Math.abs(displacement);
    
    if (absDisplacement === 0) continue;
    
    if (absDisplacement <= autoThreshold) {
      // Very close to grid - auto correct
      note.correctedStartTick = nearestGrid;
      note.isModified = true;
      note.modificationReason = `Corrección asistida automática: ${displacement > 0 ? '+' : ''}${displacement} ticks (dentro de umbral)`;
      quantizedCount++;
    } else if (absDisplacement <= config.maxDisplacement) {
      // Ambiguous - flag for review
      note.isFlagged = true;
      note.flagReason = `Modo asistido: desplazamiento ${absDisplacement} ticks requiere revisión. Opciones: rejilla en ${nearestGrid} (±${displacement})`;
      flaggedCount++;
      issues.push({
        id: nextDiagId(),
        severity: 'info',
        category: 'timing',
        message: `Nota pitch ${note.pitch}: requiere decisión manual. Desplazamiento: ${displacement} ticks hacia rejilla en ${nearestGrid}.`,
        trackIndex: note.trackIndex,
        tick: note.startTick,
        noteId: note.id
      });
    } else {
      // Beyond limit
      note.isFlagged = true;
      note.flagReason = `Desplazamiento ${absDisplacement} ticks supera límite.`;
      flaggedCount++;
      beyondLimit++;
    }
    
    if (absDisplacement > maxDisp) maxDisp = absDisplacement;
    totalDisp += absDisplacement;
  }
  
  return {
    notes: newNotes,
    issues,
    stats: {
      quantizedNotes: quantizedCount,
      protectedNotes: protectedCount,
      flaggedNotes: flaggedCount,
      maxDisplacementApplied: maxDisp,
      avgDisplacement: quantizedCount > 0 ? totalDisp / quantizedCount : 0,
      notesBeyondLimit: beyondLimit
    }
  };
}

/**
 * Función principal de cuantización
 */
export function quantizeProject(project: MidiProject, config: QuantizeConfig): QuantizeResult {
  const newProject = JSON.parse(JSON.stringify(project)) as MidiProject;
  const allNewIssues: DiagnosticIssue[] = [];
  let totalStats: QuantizeStats = {
    totalNotes: 0,
    quantizedNotes: 0,
    protectedNotes: 0,
    flaggedNotes: 0,
    maxDisplacementApplied: 0,
    avgDisplacement: 0,
    notesBeyondLimit: 0
  };
  
  for (const trackIdx of config.trackIndices) {
    const track = newProject.tracks[trackIdx];
    if (!track) continue;
    
    totalStats.totalNotes += track.notes.length;
    
    let result;
    switch (config.mode) {
      case 'strict':
        result = quantizeStrict(track.notes, config, newProject.ticksPerBeat, newProject.totalTicks);
        break;
      case 'interpretive':
        result = quantizeInterpretive(track.notes, config, newProject.ticksPerBeat, newProject.totalTicks);
        break;
      case 'assisted':
        result = quantizeAssisted(track.notes, config, newProject.ticksPerBeat, newProject.totalTicks);
        break;
      default:
        result = quantizeStrict(track.notes, config, newProject.ticksPerBeat, newProject.totalTicks);
    }
    
    track.notes = result.notes;
    allNewIssues.push(...result.issues);
    
    const stats = result.stats;
    totalStats.quantizedNotes += stats.quantizedNotes || 0;
    totalStats.protectedNotes += stats.protectedNotes || 0;
    totalStats.flaggedNotes += stats.flaggedNotes || 0;
    totalStats.notesBeyondLimit += stats.notesBeyondLimit || 0;
    if ((stats.maxDisplacementApplied || 0) > totalStats.maxDisplacementApplied) {
      totalStats.maxDisplacementApplied = stats.maxDisplacementApplied || 0;
    }
  }
  
  // Calculate average
  if (totalStats.quantizedNotes > 0) {
    let totalDisp = 0;
    for (const trackIdx of config.trackIndices) {
      const track = newProject.tracks[trackIdx];
      if (!track) continue;
      for (const note of track.notes) {
        if (note.isModified) {
          totalDisp += Math.abs(note.correctedStartTick - note.originalStartTick);
        }
      }
    }
    totalStats.avgDisplacement = totalDisp / totalStats.quantizedNotes;
  }
  
  newProject.issues = [...project.issues, ...allNewIssues];
  newProject.updatedAt = Date.now();
  
  return {
    project: newProject,
    newIssues: allNewIssues,
    stats: totalStats
  };
}

/**
 * Deshacer cuantización - restaura valores originales
 */
export function undoQuantize(project: MidiProject): MidiProject {
  const newProject = JSON.parse(JSON.stringify(project)) as MidiProject;
  
  for (const track of newProject.tracks) {
    for (const note of track.notes) {
      note.correctedStartTick = note.originalStartTick;
      note.correctedEndTick = note.originalEndTick;
      note.isModified = false;
      note.modificationReason = undefined;
    }
  }
  
  newProject.updatedAt = Date.now();
  return newProject;
}

/**
 * Aplica solo las correcciones marcadas como aprobadas
 */
export function applyApprovedChanges(project: MidiProject): MidiProject {
  const newProject = JSON.parse(JSON.stringify(project)) as MidiProject;
  
  for (const track of newProject.tracks) {
    for (const note of track.notes) {
      if (note.reviewStatus === 'approved' && note.isModified) {
        note.startTick = note.correctedStartTick;
        note.endTick = note.correctedEndTick;
      } else if (note.reviewStatus === 'rejected') {
        note.correctedStartTick = note.startTick;
        note.correctedEndTick = note.endTick;
        note.isModified = false;
      }
    }
  }
  
  return newProject;
}
