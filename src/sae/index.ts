/**
 * SAE - Sovereign Autocorrection Engine
 * API pública
 */

// Tipos
export * from './types';

// Motor principal
export { runSovereignAutocorrection } from './engine';

// Análisis contextual
export { buildEventContext, analyzeMelodicContinuity, detectSwingPattern } from './context-analyzer';

// Detector de incidencias
export { detectAllIssues } from './issue-detector';

// Versión
export const SAE_VERSION = '1.0.0';
