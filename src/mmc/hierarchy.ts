/**
 * MMC v1.0 — Hierarchy Pipeline
 *
 * Sección 10 del spec.
 *
 * Orden operativo:
 * 1. L0 GRID MASTER
 * 2. L1 BASE RÍTMICA
 * 3. L2 BASE ARMÓNICA Y BAJOS
 * 4. L3 CUERDA Y MADERA
 * 5. L4 TROMPETAS Y METALES
 * 6. L5 CAPAS ADICIONALES
 * 7. L6 RECONCILIACIÓN GLOBAL
 */

import { MMCProject, InstrumentLayer, MMCOperationResult } from './types';
import { runAntiClusterAnalysis } from './anti-cluster';
import { runContinuityAnalysis } from './continuity';
import { runAcousticAnalysis } from './acoustic';
import { runValidation } from './validation';
import { createLogEntry } from './history';

const MODULE = 'mmc.hierarchy';
const MODULE_VERSION = '1.0.0';

const LAYER_ORDER: InstrumentLayer[] = [
  'L0_GRID_MASTER',
  'L1_RHYTHMIC_BASE',
  'L2_HARMONIC_BASS',
  'L3_STRINGS_WOODWINDS',
  'L4_BRASS',
  'L5_AUXILIARY',
];

/**
 * Ejecuta el pipeline completo de análisis jerárquico.
 */
export function runHierarchicalPipeline(project: MMCProject): {
  project: MMCProject;
  results: MMCOperationResult[];
} {
  const log: ReturnType<typeof createLogEntry>[] = [];
  const results: MMCOperationResult[] = [];
  let currentProject = project;

  log.push(createLogEntry('INFO', MODULE, 'Iniciando pipeline jerárquico L0→L6'));

  // Paso 1: Análisis acústico básico (todas las capas)
  const acousticResult = runAcousticAnalysis(currentProject);
  currentProject = acousticResult.project;
  results.push({
    success: true,
    events_modified: acousticResult.eventsUpdated,
    events_created: 0,
    events_removed: 0,
    warnings: [],
    errors: [],
    log: acousticResult.log,
  });

  // Paso 2: Análisis anti-cluster (especialmente L3, L4)
  const clusterResult = runAntiClusterAnalysis(currentProject);
  currentProject = clusterResult.project;
  results.push({
    success: true,
    events_modified: clusterResult.suspectCount + clusterResult.validChordCount,
    events_created: 0,
    events_removed: 0,
    warnings: clusterResult.suspectCount > 0
      ? [`${clusterResult.suspectCount} clusters sospechosos detectados`]
      : [],
    errors: [],
    log: clusterResult.log,
  });

  // Paso 3: Análisis de continuidad (todas las capas melódicas)
  const continuityResult = runContinuityAnalysis(currentProject);
  currentProject = continuityResult.project;
  results.push({
    success: true,
    events_modified: continuityResult.microGapsDetected,
    events_created: 0,
    events_removed: 0,
    warnings: [],
    errors: [],
    log: continuityResult.log,
  });

  // Paso 4: Validación R,T,M,H,I,A
  const validationResult = runValidation(currentProject);
  currentProject = validationResult.project;
  results.push({
    success: true,
    events_modified: 0,
    events_created: 0,
    events_removed: 0,
    warnings: validationResult.reviewRequiredMeasures > 0
      ? [`${validationResult.reviewRequiredMeasures} compases requieren revisión`]
      : [],
    errors: [],
    log: validationResult.log,
  });

  // Paso 5: Reconciliación global (L6)
  const reconciliationLog = runGlobalReconciliation(currentProject);
  results.push({
    success: true,
    events_modified: 0,
    events_created: 0,
    events_removed: 0,
    warnings: [],
    errors: [],
    log: reconciliationLog,
  });

  log.push(createLogEntry('INFO', MODULE, 'Pipeline jerárquico completado'));

  return {
    project: { ...currentProject, log: [...currentProject.log, ...log] },
    results,
  };
}

/**
 * Reconciliación global (L6).
 * Verifica coherencia entre capas.
 */
function runGlobalReconciliation(project: MMCProject): ReturnType<typeof createLogEntry>[] {
  const log: ReturnType<typeof createLogEntry>[] = [];

  log.push(createLogEntry('INFO', `${MODULE}.L6`, 'Ejecutando reconciliación global'));

  // Verificar que el grid maestro es consistente
  const trackLayers = project.tracks.map(t => t.layer);
  const hasRhythmicBase = trackLayers.includes('L1_RHYTHMIC_BASE');
  const hasHarmonic = trackLayers.some(l => l === 'L2_HARMONIC_BASS');

  if (!hasRhythmicBase) {
    log.push(
      createLogEntry(
        'WARN', `${MODULE}.L6`,
        'No se encontró base rítmica (L1). La validación del grid puede ser incompleta.'
      )
    );
  }

  if (!hasHarmonic) {
    log.push(
      createLogEntry(
        'INFO', `${MODULE}.L6`,
        'No se encontró base armónica (L2). La validación armónica se omitirá.'
      )
    );
  }

  // Verificar que no hay eventos sin clasificar
  let unclassified = 0;
  for (const event of project.events.values()) {
    if (event.validation_status === 'MMC_PENDING') {
      unclassified++;
    }
  }

  if (unclassified > 0) {
    log.push(
      createLogEntry(
        'WARN', `${MODULE}.L6`,
        `${unclassified} eventos permanecen sin validar`
      )
    );
  }

  log.push(createLogEntry('INFO', `${MODULE}.L6`, 'Reconciliación global completada'));
  return log;
}

/**
 * Obtiene las pistas de una capa específica.
 */
export function getTracksByLayer(project: MMCProject, layer: InstrumentLayer) {
  return project.tracks.filter(t => t.layer === layer);
}

/**
 * Obtiene el orden de procesamiento de capas.
 */
export function getLayerOrder(): InstrumentLayer[] {
  return [...LAYER_ORDER];
}
