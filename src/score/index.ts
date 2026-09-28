/**
 * Score Module — Índice principal
 *
 * API pública para Individual Parts y Full Conductor Score.
 */

// Tipos
export * from './types';

// Orchestral Order
export {
  getOrchestralOrderConfig,
  sortInstrumentsByOrchestralOrder,
  groupInstruments,
  detectEnsembleTemplate,
  getInstrumentGroup,
  getGroupBracketType,
} from './orchestral-order';

// Part Extractor
export { extractIndividualPart } from './part-extractor';

// Score Assembler
export { assembleFullScore, extractAllParts } from './score-assembler';

// MusicXML
export { exportScoreToMusicXML, exportPartToMusicXML, downloadMusicXML } from './musicxml';

// Tests
export { runAllScoreTests } from './tests';

// ============================================================
// PIPELINE COMPLETO
// ============================================================

import { MMCProject } from '../mmc/types';
import { assembleFullScore, extractAllParts } from './score-assembler';
import { exportScoreToMusicXML, exportPartToMusicXML } from './musicxml';
import {
  Score,
  IndividualPart,
  ScoreMetadata,
  RehearsalStructure,
  ExtractionResult,
  EnsembleTemplate,
} from './types';

/**
 * Pipeline completo: MMC → Score + Parts
 */
export function extractScoreAndParts(
  mmc: MMCProject,
  metadata: ScoreMetadata,
  structure: RehearsalStructure,
  template?: EnsembleTemplate
): ExtractionResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Ensamblar Full Score
  let score: Score | null = null;
  try {
    score = assembleFullScore(mmc, metadata, structure, template);
  } catch (e) {
    errors.push(`Error al ensamblar Full Score: ${(e as Error).message}`);
  }

  // Extraer todas las particellas
  let parts: IndividualPart[] = [];
  try {
    parts = extractAllParts(mmc, metadata, structure);
  } catch (e) {
    errors.push(`Error al extraer particellas: ${(e as Error).message}`);
  }

  // Verificar instrumentos que requieren revisión
  const instrumentsReviewRequired = parts.filter(p => p.instrument.review_required).length;
  if (instrumentsReviewRequired > 0) {
    warnings.push(`${instrumentsReviewRequired} instrumentos requieren revisión manual`);
  }

  // Calcular estadísticas
  const totalEvents = parts.reduce((sum, p) => {
    return sum + p.staff.measures.reduce((ms, m) => {
      return ms + m.voices.reduce((vs, v) => vs + v.events.length, 0);
    }, 0);
  }, 0);

  const derivedEvents = parts.reduce((sum, p) => {
    return sum + p.staff.measures.reduce((ms, m) => {
      return ms + m.voices.reduce((vs, v) => vs + v.events.filter(e => e.is_derived).length, 0);
    }, 0);
  }, 0);

  return {
    score,
    parts,
    warnings,
    errors,
    stats: {
      total_instruments: parts.length,
      total_measures: score?.total_measures || 0,
      total_events: totalEvents,
      derived_events: derivedEvents,
      instruments_review_required: instrumentsReviewRequired,
    },
  };
}

/**
 * Exporta Full Score a MusicXML.
 */
export function exportFullScoreToMusicXML(score: Score): string {
  return exportScoreToMusicXML(score);
}

/**
 * Exporta particella individual a MusicXML.
 */
export function exportPartToMusicXMLString(part: IndividualPart): string {
  return exportPartToMusicXML(part);
}
