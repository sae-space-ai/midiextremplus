/**
 * MMC v1.0 — Grid Engine
 *
 * Abstracción de la matriz temporal. Para 4/4 con semicorcheas
 * produce 16 celdas. Para otros compases adapta el número de
 * celdas manteniendo la misma semántica.
 *
 * Sección 17 del spec: NO codificar solo para 4/4.
 */

import { MMCCell, CellState } from './types';

// ============================================================
// GRID ABSTRACTO
// ============================================================

export interface GridDefinition {
  numerator: number;
  denominator: number;
  subdivision: number; // ejemplo: 4 = semicorcheas en 4/4
  cells_per_beat: number;
  cells_per_measure: number;
  beat_groups: { start: number; end: number }[]; // agrupación por pulso
}

/**
 * Calcula la definición de grid para un compás dado.
 */
export function computeGridDefinition(
  numerator: number,
  denominator: number,
  subdivision: number = 4
): GridDefinition {
  // subdivision = divisiones de negra (4 = semicorcheas)
  const cells_per_beat = subdivision;
  const cells_per_measure = numerator * cells_per_beat;

  // Para compases simples (4/4, 3/4, 2/4): agrupar por negra
  // Para compases compuestos (6/8, 9/8, 12/8): agrupar por puntillo
  const isCompound = denominator === 8 && numerator % 3 === 0;

  const beat_groups: { start: number; end: number }[] = [];

  if (isCompound) {
    // 6/8 → 2 grupos de 3 corcheas
    // 9/8 → 3 grupos de 3 corcheas
    // 12/8 → 4 grupos de 3 corcheas
    const cells_per_dotted = (subdivision / 2) * 3; // 3 corcheas
    const groups = numerator / 3;
    for (let g = 0; g < groups; g++) {
      beat_groups.push({
        start: g * cells_per_dotted + 1,
        end: (g + 1) * cells_per_dotted,
      });
    }
  } else {
    // Simple: un grupo por negra
    for (let b = 0; b < numerator; b++) {
      beat_groups.push({
        start: b * cells_per_beat + 1,
        end: (b + 1) * cells_per_beat,
      });
    }
  }

  return {
    numerator,
    denominator,
    subdivision,
    cells_per_beat,
    cells_per_measure,
    beat_groups,
  };
}

/**
 * Crea las celdas vacías para un compás según la definición de grid.
 */
export function createEmptyCells(grid: GridDefinition): MMCCell[] {
  const cells: MMCCell[] = [];
  for (let i = 1; i <= grid.cells_per_measure; i++) {
    cells.push({
      cell_index: i,
      state: 'REST',
      events: [],
      is_attack_position: false,
      is_sustain_position: false,
      is_release_position: false,
      is_rest: true,
    });
  }
  return cells;
}

/**
 * Convierte un tick absoluto a posición de celda dentro de un compás.
 *
 * Devuelve el índice de celda (1-based) o null si está fuera del compás.
 */
export function tickToCellIndex(
  tick: number,
  measureStartTick: number,
  ticksPerMeasure: number,
  grid: GridDefinition
): number | null {
  if (tick < measureStartTick || tick >= measureStartTick + ticksPerMeasure) {
    return null;
  }
  const offsetInMeasure = tick - measureStartTick;
  const ticksPerCell = ticksPerMeasure / grid.cells_per_measure;
  const cellIndex = Math.floor(offsetInMeasure / ticksPerCell) + 1;
  return Math.min(cellIndex, grid.cells_per_measure);
}

/**
 * Convierte índice de celda a tick (inicio de la celda).
 */
export function cellIndexToTick(
  cellIndex: number,
  measureStartTick: number,
  ticksPerMeasure: number,
  grid: GridDefinition
): number {
  const ticksPerCell = ticksPerMeasure / grid.cells_per_measure;
  return measureStartTick + (cellIndex - 1) * ticksPerCell;
}

/**
 * Determina el estado de celda para un evento dado.
 *
 * Regla fundamental (Sección 5):
 * - Si es el inicio de la nota → ATTACK
 * - Si es el final de la nota → RELEASE
 * - Si está entre inicio y fin → SUSTAIN
 * - Si viene de un tie → TIE_IN
 * - Si continúa en un tie → TIE_OUT
 */
export function determineCellState(
  cellIndex: number,
  eventStartCell: number,
  eventEndCell: number,
  tieState: 'NONE' | 'TIE_IN' | 'TIE_OUT' | 'TIE_THROUGH'
): CellState {
  if (cellIndex < eventStartCell || cellIndex > eventEndCell) {
    return 'REST';
  }

  // TIE handling
  if (tieState === 'TIE_IN' && cellIndex === eventStartCell) {
    return 'TIE_IN';
  }
  if (tieState === 'TIE_OUT' && cellIndex === eventEndCell) {
    return 'TIE_OUT';
  }
  if (tieState === 'TIE_THROUGH') {
    if (cellIndex === eventStartCell) return 'TIE_IN';
    if (cellIndex === eventEndCell) return 'TIE_OUT';
    return 'SUSTAIN';
  }

  // Normal note
  if (cellIndex === eventStartCell && cellIndex === eventEndCell) {
    // Nota de una sola celda: ATTACK + RELEASE simultáneo
    // Representamos como ATTACK (la celda contiene el ataque)
    return 'ATTACK';
  }
  if (cellIndex === eventStartCell) {
    return 'ATTACK';
  }
  if (cellIndex === eventEndCell) {
    return 'RELEASE';
  }
  return 'SUSTAIN';
}

/**
 * Calcula ticks por compás según time signature y ticksPerBeat.
 */
export function computeTicksPerMeasure(
  numerator: number,
  _denominator: number,
  ticksPerBeat: number
): number {
  // ticksPerBeat es PPQN (pulses per quarter note)
  // Un compás tiene `numerator` negras (si denominator=4)
  // Para otros denominadores se ajusta
  return numerator * ticksPerBeat;
}

/**
 * Calcula el tick de inicio de un compás.
 */
export function computeMeasureStartTick(
  measureNumber: number,
  timeSignatures: { tick: number; numerator: number; denominator: number }[],
  ticksPerBeat: number
): number {
  if (timeSignatures.length === 0) {
    return (measureNumber - 1) * 4 * ticksPerBeat;
  }

  let currentTick = 0;
  let currentMeasure = 1;
  let currentNum = 4;

  for (let i = 0; i < timeSignatures.length; i++) {
    const ts = timeSignatures[i];
    const nextTsTick = i + 1 < timeSignatures.length ? timeSignatures[i + 1].tick : Infinity;

    const ticksPerMeasure = currentNum * ticksPerBeat;

    if (ts.tick >= currentTick) {
      currentTick = ts.tick;
      currentNum = ts.numerator;

      const measuresInSegment = Math.floor((measureNumber - currentMeasure));
      const targetTick = currentTick + measuresInSegment * (currentNum * ticksPerBeat);

      if (targetTick < nextTsTick || i === timeSignatures.length - 1) {
        return currentTick + (measureNumber - currentMeasure) * (currentNum * ticksPerBeat);
      }

      const segmentMeasures = Math.floor((nextTsTick - currentTick) / (currentNum * ticksPerBeat));
      currentMeasure += segmentMeasures;
      currentTick += segmentMeasures * (currentNum * ticksPerBeat);
      currentNum = ts.numerator;
    }
  }

  return currentTick + (measureNumber - currentMeasure) * (currentNum * ticksPerBeat);
}

/**
 * Determina el número de compás para un tick dado.
 */
export function tickToMeasure(
  tick: number,
  timeSignatures: { tick: number; numerator: number; denominator: number }[],
  ticksPerBeat: number
): number {
  if (timeSignatures.length === 0) {
    return Math.floor(tick / (4 * ticksPerBeat)) + 1;
  }

  let currentTick = 0;
  let currentMeasure = 1;
  let currentNum = 4;

  for (let i = 0; i < timeSignatures.length; i++) {
    const ts = timeSignatures[i];
    const nextTsTick = i + 1 < timeSignatures.length ? timeSignatures[i + 1].tick : Infinity;

    if (ts.tick > tick) break;

    const ticksPerMeasure = currentNum * ticksPerBeat;

    if (ts.tick >= currentTick) {
      currentTick = ts.tick;
      currentNum = ts.numerator;
    }

    const segmentEnd = Math.min(nextTsTick, tick + 1);
    const measuresInSegment = Math.floor((segmentEnd - currentTick) / ticksPerMeasure);

    if (tick < currentTick + (measuresInSegment + 1) * ticksPerMeasure) {
      const offset = tick - currentTick;
      const measureOffset = Math.floor(offset / ticksPerMeasure);
      return currentMeasure + measureOffset;
    }

    currentMeasure += measuresInSegment;
    currentTick += measuresInSegment * ticksPerMeasure;
  }

  const ticksPerMeasure = currentNum * ticksPerBeat;
  const offset = tick - currentTick;
  return currentMeasure + Math.floor(offset / ticksPerMeasure);
}
