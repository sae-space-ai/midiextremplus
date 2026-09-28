/**
 * Auto Track Assignment Engine (ATAE) - Types
 * Motor de asignación automática de pistas
 */

export type InstrumentFamily = 
  | 'WOODWIND'
  | 'BRASS'
  | 'STRINGS'
  | 'PERCUSSION'
  | 'KEYBOARD'
  | 'SYNTH'
  | 'VOX'
  | 'UNKNOWN';

export type MusicalRole =
  | 'MELODY'
  | 'HARMONY'
  | 'BASS'
  | 'PERCUSSION'
  | 'COUNTERPOINT'
  | 'PAD'
  | 'FX'
  | 'UNKNOWN';

export type MMCLayer =
  | 'L0_GRID_MASTER'
  | 'L1_RHYTHMIC_BASE'
  | 'L2_HARMONIC_BASS'
  | 'L3_STRINGS_WOODWINDS'
  | 'L4_BRASS'
  | 'L5_AUXILIARY'
  | 'L6_RECONCILIATION';

export type AssignmentSource =
  | 'TRACK_NAME'
  | 'PROGRAM_CHANGE'
  | 'CHANNEL'
  | 'REGISTER_ANALYSIS'
  | 'BEHAVIOR_ANALYSIS'
  | 'MANUAL'
  | 'UNKNOWN';

export type AssignmentConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'REVIEW';

export interface InstrumentDefinition {
  id: string;
  name: string;
  family: InstrumentFamily;
  aliases: string[];
  gmPrograms?: number[];
  typicalRegister?: { min: number; max: number };
  primarilyMonophonic?: boolean;
  orchestralGroup?: string;
}

export interface TrackAssignment {
  trackId: number;
  trackName: string;
  midiChannel: number;
  midiProgram?: number;
  
  detectedInstrument?: string;
  instrumentFamily?: InstrumentFamily;
  musicalRole?: MusicalRole;
  mmcLayer?: MMCLayer;
  orchestralGroup?: string;
  
  assignmentConfidence: AssignmentConfidence;
  assignmentSource: AssignmentSource;
  humanOverride: boolean;
  
  evidence: {
    nameMatch?: boolean;
    programMatch?: boolean;
    channelMatch?: boolean;
    registerMatch?: boolean;
    behaviorMatch?: boolean;
  };
}

export interface ATAEConfig {
  autoAssignOnImport: boolean;
  confidenceThreshold: number;
  enableRegisterAnalysis: boolean;
  enableBehaviorAnalysis: boolean;
  multilingualRecognition: boolean;
}

export const DEFAULT_ATAE_CONFIG: ATAEConfig = {
  autoAssignOnImport: true,
  confidenceThreshold: 0.7,
  enableRegisterAnalysis: true,
  enableBehaviorAnalysis: true,
  multilingualRecognition: true,
};
