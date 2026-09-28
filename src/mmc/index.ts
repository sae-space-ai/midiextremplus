/**
 * MMC v1.0 — Índice principal
 *
 * Punto de entrada público para la Matriz Maestra de Conversión.
 *
 * Orquesta: análisis, cuantización, corrección, reconstrucción
 * y trazabilidad musical.
 */

// Tipos
export * from './types';

// Grid
export {
  computeGridDefinition,
  createEmptyCells,
  tickToCellIndex,
  cellIndexToTick,
  determineCellState,
  computeTicksPerMeasure,
  computeMeasureStartTick,
  tickToMeasure,
} from './grid';

// History
export {
  recordTransformation,
  getOriginalValue,
  getCurrentValue,
  hasHumanOverride,
  fieldHasHumanOverride,
  getLastModifier,
  getTransformationChain,
  countTransformationsByModule,
  createLogEntry,
  applyTransformationIfAllowed,
} from './history';

// Builder
export { buildMMCFromProject } from './builder';

// Anti-Cluster
export { runAntiClusterAnalysis } from './anti-cluster';

// Continuity
export { runContinuityAnalysis } from './continuity';

// Acoustic
export { runAcousticAnalysis, midiToFrequency, frequencyToMidi, isHarmonicOf, couldBeHarmonic } from './acoustic';

// Validation
export { runValidation } from './validation';

// Hierarchy
export { runHierarchicalPipeline, getTracksByLayer, getLayerOrder } from './hierarchy';

// Export
export { mmcToMidiProject, verifyBeforeExport, generateExportSummary } from './export-adapter';

// Tests
export { runAllTests } from './tests';

import { MidiProject } from '../midi/model';
import { MMCProject } from './types';
import { buildMMCFromProject } from './builder';
import { runHierarchicalPipeline } from './hierarchy';
import { mmcToMidiProject, verifyBeforeExport, generateExportSummary } from './export-adapter';
import { createLogEntry } from './history';

/**
 * Pipeline completo: MidiProject → MMC → análisis → validación → MidiProject exportable.
 *
 * Este es el punto de entrada principal para el procesamiento MMC.
 */
export function processWithMMC(originalProject: MidiProject): {
  mmc: MMCProject;
  exportedProject: MidiProject;
  summary: ReturnType<typeof generateExportSummary>;
  verification: ReturnType<typeof verifyBeforeExport>;
} {
  // Paso 1: Construir MMC desde proyecto original
  let mmc = buildMMCFromProject(originalProject);

  // Paso 2: Ejecutar pipeline jerárquico
  const pipelineResult = runHierarchicalPipeline(mmc);
  mmc = pipelineResult.project;

  // Paso 3: Verificar antes de exportar
  const verification = verifyBeforeExport(mmc);

  // Paso 4: Exportar a MidiProject
  const exportedProject = mmcToMidiProject(mmc, originalProject);

  // Paso 5: Generar resumen
  const summary = generateExportSummary(mmc);

  // Log final
  mmc.log.push(
    createLogEntry(
      'INFO', 'mmc.pipeline',
      `Pipeline completo: ${summary.totalEvents} eventos, ` +
      `${summary.validatedEvents} validados, ` +
      `${summary.reviewRequiredEvents} requieren revisión, ` +
      `${summary.suspectClusters} clusters sospechosos`
    )
  );

  return {
    mmc,
    exportedProject,
    summary,
    verification,
  };
}

/**
 * Versión de la MMC.
 */
export const MMC_VERSION = '1.0.0';
