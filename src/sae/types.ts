/**
 * SAE - Sovereign Autocorrection Engine
 * Tipos fundamentales
 */

import { MMCEvent, MMCProject } from '../mmc/types';

// ============================================================
// NIVELES DE CONFIANZA
// ============================================================

export type ConfidenceLevel = 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ConfidenceGate {
  level: ConfidenceLevel;
  minScore: number;
  description: string;
}

export const CONFIDENCE_GATES: Record<ConfidenceLevel, ConfidenceGate> = {
  VERY_HIGH: { level: 'VERY_HIGH', minScore: 0.9, description: 'Corrección casi segura' },
  HIGH: { level: 'HIGH', minScore: 0.75, description: 'Corrección muy probable' },
  MEDIUM: { level: 'MEDIUM', minScore: 0.6, description: 'Requiere validación contextual' },
  LOW: { level: 'LOW', minScore: 0, description: 'No corregir automáticamente' },
};

// ============================================================
// TIPOS DE INCIDENCIAS
// ============================================================

export type IssueType =
  | 'OFF_GRID'
  | 'CLUSTER_SUSPECT'
  | 'MICRO_GAP'
  | 'ZERO_DURATION'
  | 'ABNORMAL_DURATION'
  | 'DUPLICATE_NOTE'
  | 'VOICE_COLLISION'
  | 'OUT_OF_RANGE'
  | 'IMPOSSIBLE_POLYPHONY'
  | 'MISSING_NOTE_OFF'
  | 'OVERLAP_ERROR'
  | 'SWING_PATTERN'
  | 'EXPRESSIVE_TIMING'
  | 'RUBATO';

// ============================================================
// CONTEXTO DE ANÁLISIS
// ============================================================

export interface EventContext {
  event: MMCEvent;
  previousEvent: MMCEvent | null;
  nextEvent: MMCEvent | null;
  measureEvents: MMCEvent[];
  voiceEvents: MMCEvent[];
  phraseEvents: MMCEvent[];
  instrumentEvents: MMCEvent[];
  localGrid: number[];
  rhythmicPattern: string;
  harmonicContext: string | null;
}

export interface CorrectionContext {
  project: MMCProject;
  eventContext: EventContext;
  issueType: IssueType;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
}

// ============================================================
// PROPUESTA DE CORRECCIÓN
// ============================================================

export interface CorrectionProposal {
  id: string;
  eventId: string;
  issueType: IssueType;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  
  // Cambios propuestos
  changes: {
    field: keyof MMCEvent;
    before: any;
    after: any;
  }[];
  
  // Justificación
  reason: string;
  explanation: string;
  
  // Contexto
  context: {
    measure: number;
    beat: number;
    instrument: string;
    voice: number;
  };
  
  // Dependencias
  dependsOn: string[]; // IDs de otras propuestas
  affects: string[]; // IDs de eventos afectados
  
  // Estado
  status: 'PENDING' | 'SIMULATED' | 'VALIDATED' | 'APPLIED' | 'REJECTED' | 'ROLLED_BACK';
  simulationResult: SimulationResult | null;
}

// ============================================================
// SIMULACIÓN
// ============================================================

export interface SimulationResult {
  success: boolean;
  newIssuesIntroduced: number;
  issuesResolved: number;
  sideEffects: string[];
  validationPassed: boolean;
}

// ============================================================
// PLAN DE CORRECCIÓN
// ============================================================

export interface CorrectionPlan {
  id: string;
  projectId: string;
  createdAt: number;
  
  proposals: CorrectionProposal[];
  
  // Estadísticas
  totalIssues: number;
  autoCorrectable: number;
  requiresReview: number;
  protected: number;
  
  // Estado
  status: 'PLANNING' | 'SIMULATING' | 'VALIDATING' | 'APPLYING' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';
  
  // Resultados
  appliedCount: number;
  rejectedCount: number;
  rolledBackCount: number;
}

// ============================================================
// REPORTE DE AUTOCORRECCIÓN
// ============================================================

export interface AutocorrectReport {
  planId: string;
  projectId: string;
  timestamp: number;
  
  // Resumen
  totalEvents: number;
  issuesDetected: number;
  autoCorrected: number;
  protected: number;
  unchanged: number;
  reviewRequired: number;
  criticalRemaining: number;
  
  // Desglose por tipo
  byIssueType: Record<IssueType, {
    detected: number;
    corrected: number;
    protected: number;
    reviewRequired: number;
  }>;
  
  // Desglose por instrumento
  byInstrument: Record<string, {
    issuesDetected: number;
    autoCorrected: number;
    reviewRequired: number;
  }>;
  
  // Desglose por compás
  byMeasure: Record<number, {
    issuesDetected: number;
    autoCorrected: number;
    reviewRequired: number;
  }>;
  
  // Métricas de calidad
  qualityMetrics: {
    before: QualityMetrics;
    after: QualityMetrics;
    improvement: number;
  };
  
  // Log de decisiones
  decisions: {
    eventId: string;
    action: 'CORRECTED' | 'PROTECTED' | 'REVIEW_REQUIRED' | 'UNCHANGED';
    reason: string;
    confidence: number;
  }[];
}

// ============================================================
// MÉTRICAS DE CALIDAD
// ============================================================

export interface QualityMetrics {
  gridConsistency: number; // 0-1
  voiceConsistency: number; // 0-1
  melodicContinuity: number; // 0-1
  clusterAnomalies: number; // count
  durationErrors: number; // count
  duplicates: number; // count
  structuralErrors: number; // count
  overallScore: number; // 0-1
}

// ============================================================
// CONFIGURACIÓN DEL SAE
// ============================================================

export interface SAEConfig {
  // Umbrales de confianza
  minConfidenceForAutoCorrect: ConfidenceLevel;
  
  // Protección
  protectHumanOverrides: boolean;
  protectExplicitLocks: boolean;
  protectSwingPatterns: boolean;
  protectExpressiveTiming: boolean;
  
  // Corrección
  enableOffGridCorrection: boolean;
  enableClusterResolution: boolean;
  enableMicroGapCorrection: boolean;
  enableDurationCorrection: boolean;
  enableDuplicateRemoval: boolean;
  
  // Simulación
  simulateBeforeApply: boolean;
  rollbackOnFailure: boolean;
  
  // Validación
  validateAfterCorrection: boolean;
  globalReconciliation: boolean;
}

export const DEFAULT_SAE_CONFIG: SAEConfig = {
  minConfidenceForAutoCorrect: 'HIGH',
  protectHumanOverrides: true,
  protectExplicitLocks: true,
  protectSwingPatterns: true,
  protectExpressiveTiming: true,
  enableOffGridCorrection: true,
  enableClusterResolution: true,
  enableMicroGapCorrection: true,
  enableDurationCorrection: true,
  enableDuplicateRemoval: true,
  simulateBeforeApply: true,
  rollbackOnFailure: true,
  validateAfterCorrection: true,
  globalReconciliation: true,
};

// ============================================================
// PROGRESO DEL ANÁLISIS
// ============================================================

export type AnalysisPhase =
  | 'PRESERVING_ORIGINAL'
  | 'ANALYZING_STRUCTURE'
  | 'ANALYZING_RHYTHM'
  | 'ANALYZING_HARMONY'
  | 'ANALYZING_INSTRUMENTS'
  | 'ANALYZING_VOICES'
  | 'DETECTING_ISSUES'
  | 'BUILDING_CORRECTION_PLAN'
  | 'SIMULATING_CORRECTIONS'
  | 'VALIDATING_CORRECTIONS'
  | 'APPLYING_CORRECTIONS'
  | 'RECONCILING_SCORE'
  | 'GENERATING_OUTPUT';

export interface AnalysisProgress {
  phase: AnalysisPhase;
  progress: number; // 0-100
  message: string;
  currentEvent?: number;
  totalEvents?: number;
}

// ============================================================
// RESULTADO DEL SAE
// ============================================================

export interface SAEResult {
  success: boolean;
  correctedProject: MMCProject | null;
  report: AutocorrectReport | null;
  plan: CorrectionPlan | null;
  error?: string;
}
