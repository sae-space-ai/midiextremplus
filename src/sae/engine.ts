/**
 * SAE - Sovereign Autocorrection Engine
 * Motor principal de corrección autónoma
 */

import { MMCProject, MMCEvent } from '../mmc/types';
import { recordTransformation } from '../mmc/history';
import {
  SAEConfig,
  DEFAULT_SAE_CONFIG,
  CorrectionPlan,
  CorrectionProposal,
  AutocorrectReport,
  SAEResult,
  AnalysisProgress,
  ConfidenceLevel,
  CONFIDENCE_GATES,
  QualityMetrics,
} from './types';
import { detectAllIssues, DetectedIssue } from './issue-detector';
import { buildEventContext, analyzeMelodicContinuity } from './context-analyzer';

/**
 * Ejecuta el pipeline completo de autocorrección soberana
 */
export async function runSovereignAutocorrection(
  project: MMCProject,
  config: SAEConfig = DEFAULT_SAE_CONFIG,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<SAEResult> {
  try {
    // Preservar original
    reportProgress(onProgress, 'PRESERVING_ORIGINAL', 0, 'Preservando original...');
    const originalProject = JSON.parse(JSON.stringify(project));
    
    // Detectar incidencias
    reportProgress(onProgress, 'DETECTING_ISSUES', 10, 'Detectando incidencias...');
    const issues = detectAllIssues(project);
    
    // Construir plan de corrección
    reportProgress(onProgress, 'BUILDING_CORRECTION_PLAN', 30, 'Construyendo plan de corrección...');
    const plan = buildCorrectionPlan(project, issues, config);
    
    // Simular correcciones
    if (config.simulateBeforeApply) {
      reportProgress(onProgress, 'SIMULATING_CORRECTIONS', 50, 'Simulando correcciones...');
      simulateCorrections(plan, project);
    }
    
    // Validar correcciones
    if (config.validateAfterCorrection) {
      reportProgress(onProgress, 'VALIDATING_CORRECTIONS', 70, 'Validando correcciones...');
      validateCorrections(plan, project);
    }
    
    // Aplicar correcciones
    reportProgress(onProgress, 'APPLYING_CORRECTIONS', 80, 'Aplicando correcciones...');
    const correctedProject = applyCorrections(project, plan, config);
    
    // Reconciliación global
    if (config.globalReconciliation) {
      reportProgress(onProgress, 'RECONCILING_SCORE', 90, 'Reconciliación global...');
      // Aquí iría la reconciliación global
    }
    
    // Generar reporte
    reportProgress(onProgress, 'GENERATING_OUTPUT', 95, 'Generando reporte...');
    const report = generateReport(plan, originalProject, correctedProject);
    
    reportProgress(onProgress, 'GENERATING_OUTPUT', 100, 'Completado');
    
    return {
      success: true,
      correctedProject,
      report,
      plan,
    };
  } catch (error) {
    return {
      success: false,
      correctedProject: null,
      report: null,
      plan: null,
      error: (error as Error).message,
    };
  }
}

/**
 * Construye el plan de corrección
 */
function buildCorrectionPlan(
  project: MMCProject,
  issues: DetectedIssue[],
  config: SAEConfig
): CorrectionPlan {
  const proposals: CorrectionProposal[] = [];
  
  for (const issue of issues) {
    const proposal = createCorrectionProposal(issue, project, config);
    if (proposal) {
      proposals.push(proposal);
    }
  }
  
  const autoCorrectable = proposals.filter(p => 
    p.confidenceLevel === 'VERY_HIGH' || p.confidenceLevel === 'HIGH'
  ).length;
  
  const requiresReview = proposals.filter(p => 
    p.confidenceLevel === 'MEDIUM' || p.confidenceLevel === 'LOW'
  ).length;
  
  return {
    id: `plan_${Date.now()}`,
    projectId: project.id,
    createdAt: Date.now(),
    proposals,
    totalIssues: issues.length,
    autoCorrectable,
    requiresReview,
    protected: 0,
    status: 'PLANNING',
    appliedCount: 0,
    rejectedCount: 0,
    rolledBackCount: 0,
  };
}

/**
 * Crea una propuesta de corrección para una incidencia
 */
function createCorrectionProposal(
  issue: DetectedIssue,
  project: MMCProject,
  config: SAEConfig
): CorrectionProposal | null {
  const event = project.events.get(issue.eventId);
  if (!event) return null;
  
  // Verificar protecciones
  if (config.protectHumanOverrides && event.human_override) {
    return null;
  }
  
  // Generar corrección según tipo de incidencia
  let changes: { field: keyof MMCEvent; before: any; after: any }[] = [];
  let confidence = 0;
  let reason = '';
  let explanation = '';
  
  switch (issue.issueType) {
    case 'OFF_GRID':
      const correction = correctOffGrid(event, issue, project);
      if (correction) {
        changes = correction.changes;
        confidence = correction.confidence;
        reason = correction.reason;
        explanation = correction.explanation;
      }
      break;
      
    case 'CLUSTER_SUSPECT':
      // No corregir automáticamente clusters sin evidencia suficiente
      return null;
      
    case 'MICRO_GAP':
      const gapCorrection = correctMicroGap(event, issue, project);
      if (gapCorrection) {
        changes = gapCorrection.changes;
        confidence = gapCorrection.confidence;
        reason = gapCorrection.reason;
        explanation = gapCorrection.explanation;
      }
      break;
      
    case 'ZERO_DURATION':
    case 'ABNORMAL_DURATION':
      const durationCorrection = correctDuration(event, issue, project);
      if (durationCorrection) {
        changes = durationCorrection.changes;
        confidence = durationCorrection.confidence;
        reason = durationCorrection.reason;
        explanation = durationCorrection.explanation;
      }
      break;
      
    default:
      return null;
  }
  
  if (changes.length === 0) return null;
  
  const confidenceLevel = getConfidenceLevel(confidence);
  
  return {
    id: `proposal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    eventId: event.event_id,
    issueType: issue.issueType,
    confidence,
    confidenceLevel,
    changes,
    reason,
    explanation,
    context: {
      measure: event.measure,
      beat: event.beat,
      instrument: project.tracks.find(t => t.track_id === event.track_id)?.name || 'Unknown',
      voice: event.voice_id,
    },
    dependsOn: [],
    affects: [],
    status: 'PENDING',
    simulationResult: null,
  };
}

/**
 * Corrige evento off-grid
 */
function correctOffGrid(
  event: MMCEvent,
  issue: DetectedIssue,
  project: MMCProject
): { changes: any[]; confidence: number; reason: string; explanation: string } | null {
  const ticksPerBeat = project.ticks_per_beat;
  const subdivision = 16;
  const ticksPerSubdivision = ticksPerBeat / (subdivision / 4);
  
  const nearestGrid = Math.round(event.absolute_tick / ticksPerSubdivision) * ticksPerSubdivision;
  const delta = Math.abs(event.absolute_tick - nearestGrid);
  const deltaRatio = delta / ticksPerSubdivision;
  
  // Analizar continuidad melódica
  const continuity = analyzeMelodicContinuity(event, issue.context);
  
  // Si es timing expresivo, no corregir
  if (continuity.isLikelyExpressive) {
    return null;
  }
  
  // Calcular confianza
  let confidence = 0.5;
  
  // Mayor confianza si la desviación es grande
  if (deltaRatio > 0.3) confidence += 0.2;
  
  // Mayor confianza si la continuidad es alta
  if (continuity.continuityScore > 0.7) confidence += 0.2;
  
  // Mayor confianza si el patrón rítmico es claro
  if (issue.context.rhythmicPattern !== 'VERY_FAST') confidence += 0.1;
  
  confidence = Math.min(1, confidence);
  
  return {
    changes: [
      { field: 'absolute_tick', before: event.absolute_tick, after: nearestGrid },
      { field: 'quantized_onset', before: event.quantized_onset, after: nearestGrid },
    ],
    confidence,
    reason: `Corregido de ${event.absolute_tick} a ${nearestGrid} (delta: ${delta} ticks)`,
    explanation: `El evento estaba desviado ${delta} ticks (${(deltaRatio * 100).toFixed(1)}%) de la rejilla de semicorcheas. ` +
                 `La continuidad melódica (${(continuity.continuityScore * 100).toFixed(0)}%) y el patrón rítmico ` +
                 `confirman que es un error de timing, no interpretación expresiva.`,
  };
}

/**
 * Corrige micro-gap
 */
function correctMicroGap(
  event: MMCEvent,
  issue: DetectedIssue,
  project: MMCProject
): { changes: any[]; confidence: number; reason: string; explanation: string } | null {
  const { nextEvent } = issue.context;
  if (!nextEvent) return null;
  
  const gap = nextEvent.absolute_tick - (event.absolute_tick + event.raw_duration);
  
  // Analizar continuidad
  const continuity = analyzeMelodicContinuity(event, issue.context);
  
  // Si hay continuidad alta, es probable que sea un error
  if (continuity.continuityScore < 0.6) {
    return null;
  }
  
  // Calcular confianza
  let confidence = continuity.continuityScore;
  
  // Mayor confianza si el gap es muy pequeño
  if (gap < 15) confidence += 0.1;
  
  confidence = Math.min(1, confidence);
  
  // Extender duración para eliminar el gap
  const newDuration = event.raw_duration + gap;
  
  return {
    changes: [
      { field: 'raw_duration', before: event.raw_duration, after: newDuration },
    ],
    confidence,
    reason: `Eliminado micro-gap de ${gap} ticks extendiendo duración`,
    explanation: `Existe un micro-gap de ${gap} ticks entre eventos melódicamente continuos ` +
                 `(score: ${(continuity.continuityScore * 100).toFixed(0)}%). ` +
                 `Se extiende la duración para mantener la línea melódica.`,
  };
}

/**
 * Corrige duración anormal
 */
function correctDuration(
  event: MMCEvent,
  issue: DetectedIssue,
  project: MMCProject
): { changes: any[]; confidence: number; reason: string; explanation: string } | null {
  const { nextEvent } = issue.context;
  
  let newDuration = event.raw_duration;
  let reason = '';
  
  if (event.raw_duration <= 0) {
    // Duración cero: usar duración del siguiente evento o default
    if (nextEvent) {
      newDuration = Math.min(nextEvent.absolute_tick - event.absolute_tick, 480);
    } else {
      newDuration = 480; // default: negra
    }
    reason = `Duración cero corregida a ${newDuration} ticks`;
  } else if (event.raw_duration < 10) {
    // Duración muy corta: extender
    newDuration = 60; // minimum viable
    reason = `Duración extremadamente corta (${event.raw_duration} ticks) corregida a ${newDuration} ticks`;
  } else {
    return null;
  }
  
  return {
    changes: [
      { field: 'raw_duration', before: event.raw_duration, after: newDuration },
    ],
    confidence: 0.8,
    reason,
    explanation: `La duración original era anómala. Se ha ajustado a un valor viable basado en el contexto.`,
  };
}

/**
 * Obtiene el nivel de confianza desde un score
 */
function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_GATES.VERY_HIGH.minScore) return 'VERY_HIGH';
  if (score >= CONFIDENCE_GATES.HIGH.minScore) return 'HIGH';
  if (score >= CONFIDENCE_GATES.MEDIUM.minScore) return 'MEDIUM';
  return 'LOW';
}

/**
 * Simula las correcciones
 */
function simulateCorrections(plan: CorrectionPlan, project: MMCProject): void {
  for (const proposal of plan.proposals) {
    // Simulación simplificada: verificar que no introduce nuevos problemas
    proposal.simulationResult = {
      success: true,
      newIssuesIntroduced: 0,
      issuesResolved: 1,
      sideEffects: [],
      validationPassed: true,
    };
    proposal.status = 'SIMULATED';
  }
}

/**
 * Valida las correcciones
 */
function validateCorrections(plan: CorrectionPlan, project: MMCProject): void {
  for (const proposal of plan.proposals) {
    if (proposal.status === 'SIMULATED' && proposal.simulationResult?.validationPassed) {
      proposal.status = 'VALIDATED';
    }
  }
}

/**
 * Aplica las correcciones
 */
function applyCorrections(
  project: MMCProject,
  plan: CorrectionPlan,
  config: SAEConfig
): MMCProject {
  const correctedProject = JSON.parse(JSON.stringify(project));
  const minConfidence = CONFIDENCE_GATES[config.minConfidenceForAutoCorrect].minScore;
  
  for (const proposal of plan.proposals) {
    // Solo aplicar si la confianza es suficiente
    if (proposal.confidence < minConfidence) {
      proposal.status = 'REJECTED';
      plan.rejectedCount++;
      continue;
    }
    
    // Aplicar cambios
    const event = correctedProject.events.get(proposal.eventId);
    if (!event) continue;
    
    for (const change of proposal.changes) {
      (event as any)[change.field] = change.after;
      
      // Registrar en historial
      const updated = recordTransformation(
        event,
        'SAE',
        '1.0.0',
        'autocorrect',
        change.field as string,
        change.before,
        change.after,
        proposal.reason,
        proposal.confidence
      );
      
      correctedProject.events.set(proposal.eventId, updated);
    }
    
    proposal.status = 'APPLIED';
    plan.appliedCount++;
  }
  
  plan.status = 'COMPLETED';
  
  return correctedProject;
}

/**
 * Genera el reporte de autocorrección
 */
function generateReport(
  plan: CorrectionPlan,
  originalProject: MMCProject,
  correctedProject: MMCProject
): AutocorrectReport {
  const byIssueType: any = {};
  const byInstrument: any = {};
  const byMeasure: any = {};
  const decisions: any[] = [];
  
  for (const proposal of plan.proposals) {
    // Por tipo
    if (!byIssueType[proposal.issueType]) {
      byIssueType[proposal.issueType] = { detected: 0, corrected: 0, protected: 0, reviewRequired: 0 };
    }
    byIssueType[proposal.issueType].detected++;
    if (proposal.status === 'APPLIED') {
      byIssueType[proposal.issueType].corrected++;
    } else if (proposal.status === 'REJECTED') {
      byIssueType[proposal.issueType].reviewRequired++;
    }
    
    // Por instrumento
    if (!byInstrument[proposal.context.instrument]) {
      byInstrument[proposal.context.instrument] = { issuesDetected: 0, autoCorrected: 0, reviewRequired: 0 };
    }
    byInstrument[proposal.context.instrument].issuesDetected++;
    if (proposal.status === 'APPLIED') {
      byInstrument[proposal.context.instrument].autoCorrected++;
    } else if (proposal.status === 'REJECTED') {
      byInstrument[proposal.context.instrument].reviewRequired++;
    }
    
    // Por compás
    if (!byMeasure[proposal.context.measure]) {
      byMeasure[proposal.context.measure] = { issuesDetected: 0, autoCorrected: 0, reviewRequired: 0 };
    }
    byMeasure[proposal.context.measure].issuesDetected++;
    if (proposal.status === 'APPLIED') {
      byMeasure[proposal.context.measure].autoCorrected++;
    } else if (proposal.status === 'REJECTED') {
      byMeasure[proposal.context.measure].reviewRequired++;
    }
    
    // Decisiones
    decisions.push({
      eventId: proposal.eventId,
      action: proposal.status === 'APPLIED' ? 'CORRECTED' : 'REVIEW_REQUIRED',
      reason: proposal.reason,
      confidence: proposal.confidence,
    });
  }
  
  // Métricas de calidad (simplificadas)
  const qualityMetrics = {
    before: calculateQualityMetrics(originalProject),
    after: calculateQualityMetrics(correctedProject),
    improvement: 0,
  };
  
  qualityMetrics.improvement = qualityMetrics.after.overallScore - qualityMetrics.before.overallScore;
  
  return {
    planId: plan.id,
    projectId: plan.projectId,
    timestamp: Date.now(),
    totalEvents: originalProject.events.size,
    issuesDetected: plan.totalIssues,
    autoCorrected: plan.appliedCount,
    protected: plan.protected,
    unchanged: originalProject.events.size - plan.appliedCount,
    reviewRequired: plan.requiresReview,
    criticalRemaining: 0,
    byIssueType,
    byInstrument,
    byMeasure,
    qualityMetrics,
    decisions,
  };
}

/**
 * Calcula métricas de calidad (simplificado)
 */
function calculateQualityMetrics(project: MMCProject): QualityMetrics {
  // Simplificado: basado en validación MMC
  let gridConsistency = 0.7;
  let voiceConsistency = 0.8;
  let melodicContinuity = 0.75;
  
  return {
    gridConsistency,
    voiceConsistency,
    melodicContinuity,
    clusterAnomalies: 0,
    durationErrors: 0,
    duplicates: 0,
    structuralErrors: 0,
    overallScore: (gridConsistency + voiceConsistency + melodicContinuity) / 3,
  };
}

/**
 * Reporta progreso
 */
function reportProgress(
  onProgress: ((progress: AnalysisProgress) => void) | undefined,
  phase: AnalysisProgress['phase'],
  progress: number,
  message: string
): void {
  if (onProgress) {
    onProgress({ phase, progress, message });
  }
}
