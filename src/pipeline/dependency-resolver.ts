/**
 * Pipeline Dependency Resolver
 * Automatiza la resolución de dependencias entre módulos
 */

import { MidiProject } from '../midi/model';
import { MMCProject } from '../mmc/types';
import { buildMMCFromProject } from '../mmc/builder';
import { runHierarchicalPipeline } from '../mmc/hierarchy';
import { autoAssignTracks, applyAssignments, TrackAssignment } from '../atae';
import { runSovereignAutocorrection, SAEResult } from '../sae';
import { extractScoreAndParts, ExtractionResult } from '../score';
import { ScoreMetadata, RehearsalStructure } from '../score/types';

export type PipelineStage =
  | 'CHECK_SOURCE'
  | 'AUTO_ASSIGN_TRACKS'
  | 'BUILD_MMC'
  | 'VALIDATE_MMC'
  | 'AUTOCORRECTION'
  | 'BUILD_SCORE_MODEL'
  | 'EXTRACT_PARTS'
  | 'BUILD_FULL_SCORE'
  | 'COMPLETE';

export interface PipelineProgress {
  stage: PipelineStage;
  message: string;
  percent: number;
}

export interface PipelineResult {
  success: boolean;
  project: MidiProject;
  assignments: TrackAssignment[];
  mmc: MMCProject;
  saeResult: SAEResult | null;
  extractionResult: ExtractionResult;
  error?: string;
}

export class DependencyResolver {
  private project: MidiProject;
  private assignments: TrackAssignment[] | null = null;
  private mmc: MMCProject | null = null;
  private saeResult: SAEResult | null = null;
  private extractionResult: ExtractionResult | null = null;
  private onProgress: ((progress: PipelineProgress) => void) | null = null;

  constructor(project: MidiProject) {
    this.project = project;
  }

  setProgressCallback(callback: (progress: PipelineProgress) => void): void {
    this.onProgress = callback;
  }

  private reportProgress(stage: PipelineStage, message: string, percent: number): void {
    if (this.onProgress) {
      this.onProgress({ stage, message, percent });
    }
  }

  async execute(): Promise<PipelineResult> {
    try {
      // Stage 1: Check source MIDI
      this.reportProgress('CHECK_SOURCE', 'Verificando archivo MIDI...', 5);
      if (!this.project || this.project.tracks.length === 0) {
        throw new Error('No hay pistas en el proyecto');
      }

      // Stage 2: Auto assign tracks
      this.reportProgress('AUTO_ASSIGN_TRACKS', 'Asignando instrumentos automáticamente...', 15);
      this.assignments = autoAssignTracks(this.project);
      this.project = applyAssignments(this.project, this.assignments);

      // Stage 3: Build MMC
      this.reportProgress('BUILD_MMC', 'Construyendo Matriz Maestra de Conversión...', 30);
      this.mmc = buildMMCFromProject(this.project);

      // Stage 4: Validate MMC
      this.reportProgress('VALIDATE_MMC', 'Validando MMC y ejecutando pipeline jerárquico...', 45);
      const pipelineResult = runHierarchicalPipeline(this.mmc);
      this.mmc = pipelineResult.project;

      // Stage 5: Sovereign Autocorrection
      this.reportProgress('AUTOCORRECTION', 'Ejecutando autocorrección soberana...', 60);
      this.saeResult = await runSovereignAutocorrection(this.mmc, undefined, (progress) => {
        // Map SAE progress to pipeline progress (60-75%)
        const mappedPercent = 60 + (progress.progress * 0.15);
        this.reportProgress('AUTOCORRECTION', progress.message, mappedPercent);
      });
      
      if (this.saeResult.correctedProject) {
        this.mmc = this.saeResult.correctedProject;
      }

      // Stage 6: Build Score Model
      this.reportProgress('BUILD_SCORE_MODEL', 'Construyendo modelo de partitura...', 80);
      const metadata: ScoreMetadata = {
        title: this.project.name,
        subtitle: null,
        composer: null,
        arranger: null,
        lyricist: null,
        copyright: null,
        movementNumber: null,
        movementTitle: null,
        workNumber: null,
        opus: null,
        source: null,
        encoding_date: new Date().toISOString(),
        encoder: 'MIDIExtremPlus Pipeline',
        description: null,
      };

      const structure: RehearsalStructure = {
        segno_measure: null,
        coda_measure: null,
        fine_measure: null,
        dacapo: false,
        dalsegno: false,
        tocoda: null,
        repeat_starts: [],
        repeat_ends: [],
        endings: [],
      };

      // Stage 7: Extract Parts
      this.reportProgress('EXTRACT_PARTS', 'Extrayendo particellas individuales...', 90);
      this.extractionResult = extractScoreAndParts(this.mmc, metadata, structure);

      // Stage 8: Build Full Score (included in extractionResult)
      this.reportProgress('BUILD_FULL_SCORE', 'Generando Full Conductor Score...', 95);

      // Complete
      this.reportProgress('COMPLETE', 'Pipeline completado exitosamente', 100);

      return {
        success: true,
        project: this.project,
        assignments: this.assignments,
        mmc: this.mmc,
        saeResult: this.saeResult,
        extractionResult: this.extractionResult,
      };
    } catch (error) {
      return {
        success: false,
        project: this.project,
        assignments: this.assignments || [],
        mmc: this.mmc!,
        saeResult: this.saeResult,
        extractionResult: this.extractionResult!,
        error: (error as Error).message,
      };
    }
  }
}
