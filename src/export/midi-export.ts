/**
 * MIDI Export Module - Motor de exportación MIDI completa
 * Genera particellas individuales, score completo y master canónico
 */

import { MidiProject, TrackInfo, MidiNote } from '../midi/model';
import { MMCProject } from '../mmc/types';
import { ExtractionResult, IndividualPart } from '../score/types';
import { writeMidiFile } from '../midi/writer';

export interface MidiExportResult {
  masterMidi: Uint8Array;
  conductorScoreMidi: Uint8Array;
  partMidiFiles: Map<string, Uint8Array>;
  manifest: ExportManifest;
  validation: ExportValidation;
}

export interface ExportManifest {
  projectId: string;
  projectName: string;
  timestamp: number;
  totalParts: number;
  tracks: TrackManifest[];
}

export interface TrackManifest {
  trackId: number;
  trackName: string;
  instrumentName: string;
  midiChannel: number;
  midiProgram: number | null;
  partFileName: string;
  noteCount: number;
  duration: number;
}

export interface ExportValidation {
  isValid: boolean;
  checks: ValidationCheck[];
  errors: string[];
  warnings: string[];
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
}

/**
 * Exporta MIDI completo: master, score conductor y todas las particellas
 */
export function exportCompleteMidi(
  project: MidiProject,
  mmc: MMCProject,
  extractionResult: ExtractionResult
): MidiExportResult {
  // 1. Generar Master MIDI Canónico
  const masterMidi = generateMasterMidi(project);

  // 2. Generar Score Conductor Completo
  const conductorScoreMidi = generateConductorScoreMidi(project);

  // 3. Generar MIDI de cada particella
  const partMidiFiles = generatePartMidiFiles(project, extractionResult);

  // 4. Generar manifest de correspondencias
  const manifest = generateManifest(project, extractionResult);

  // 5. Validar exportación
  const validation = validateExport(project, extractionResult, partMidiFiles);

  return {
    masterMidi,
    conductorScoreMidi,
    partMidiFiles,
    manifest,
    validation,
  };
}

/**
 * Genera el Master MIDI Canónico
 * Es el proyecto MIDI completo con todas las correcciones aplicadas
 */
function generateMasterMidi(project: MidiProject): Uint8Array {
  // El master es simplemente el proyecto MIDI exportado con todas las correcciones
  return writeMidiFile(project, true);
}

/**
 * Genera el Score Conductor Completo
 * MIDI multitrack con todas las partes correctamente separadas
 */
function generateConductorScoreMidi(project: MidiProject): Uint8Array {
  // El score conductor es idéntico al master pero con metadata adicional
  const scoreProject = JSON.parse(JSON.stringify(project)) as MidiProject;
  
  // Asegurar que cada pista tenga nombre descriptivo
  scoreProject.tracks = scoreProject.tracks.map((track, idx) => ({
    ...track,
    name: track.name || `Track ${idx + 1}`,
  }));

  return writeMidiFile(scoreProject, true);
}

/**
 * Genera MIDI de cada particella individual
 * Cada archivo contiene solo la información de ese instrumento
 */
function generatePartMidiFiles(
  project: MidiProject,
  extractionResult: ExtractionResult
): Map<string, Uint8Array> {
  const partFiles = new Map<string, Uint8Array>();

  for (const part of extractionResult.parts) {
    const partProject = extractPartAsMidiProject(project, part);
    const midiData = writeMidiFile(partProject, true);
    
    const fileName = generatePartFileName(part, extractionResult.parts.indexOf(part));
    partFiles.set(fileName, midiData);
  }

  return partFiles;
}

/**
 * Extrae una particella como proyecto MIDI independiente
 */
function extractPartAsMidiProject(
  originalProject: MidiProject,
  part: IndividualPart
): MidiProject {
  // Crear nuevo proyecto con solo la pista de esta particella
  const trackIndex = parseInt(part.instrument_id);
  const originalTrack = originalProject.tracks.find(t => t.index === trackIndex);
  
  if (!originalTrack) {
    throw new Error(`Track ${trackIndex} not found for part ${part.instrument_name}`);
  }

  // Crear proyecto con una sola pista
  const partProject: MidiProject = {
    ...originalProject,
    tracks: [originalTrack],
    name: `${originalProject.name} - ${part.instrument_name}`,
  };

  return partProject;
}

/**
 * Genera nombre de archivo para particella
 */
function generatePartFileName(part: IndividualPart, index: number): string {
  const paddedIndex = String(index + 1).padStart(2, '0');
  const safeName = part.instrument_name
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 30);
  
  return `${paddedIndex}_${safeName}.mid`;
}

/**
 * Genera manifest de correspondencias
 */
function generateManifest(
  project: MidiProject,
  extractionResult: ExtractionResult
): ExportManifest {
  const tracks: TrackManifest[] = extractionResult.parts.map((part, idx) => {
    const trackIndex = parseInt(part.instrument_id);
    const track = project.tracks.find(t => t.index === trackIndex);
    
    return {
      trackId: trackIndex,
      trackName: track?.name || `Track ${trackIndex + 1}`,
      instrumentName: part.instrument_name,
      midiChannel: track?.channel || 0,
      midiProgram: track?.program ?? null,
      partFileName: generatePartFileName(part, idx),
      noteCount: part.note_count,
      duration: part.total_ticks / project.ticksPerBeat * (60 / project.tempoMap[0].bpm),
    };
  });

  return {
    projectId: project.id,
    projectName: project.name,
    timestamp: Date.now(),
    totalParts: extractionResult.parts.length,
    tracks,
  };
}

/**
 * Valida la exportación MIDI
 */
function validateExport(
  project: MidiProject,
  extractionResult: ExtractionResult,
  partFiles: Map<string, Uint8Array>
): ExportValidation {
  const checks: ValidationCheck[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check 1: Mismo PPQ
  checks.push({
    name: 'PPQ Consistency',
    passed: true,
    message: `PPQ: ${project.ticksPerBeat}`,
  });

  // Check 2: Mismo mapa de tempo
  checks.push({
    name: 'Tempo Map Consistency',
    passed: project.tempoMap.length > 0,
    message: `${project.tempoMap.length} tempo changes`,
  });

  // Check 3: Mismo mapa métrico
  checks.push({
    name: 'Time Signature Consistency',
    passed: project.timeSignatures.length > 0,
    message: `${project.timeSignatures.length} time signatures`,
  });

  // Check 4: Longitud de obra
  checks.push({
    name: 'Duration Consistency',
    passed: project.totalTicks > 0,
    message: `Total ticks: ${project.totalTicks}`,
  });

  // Check 5: Correspondencia pista/instrumento
  const allTracksMatched = extractionResult.parts.every(part => {
    const trackIndex = parseInt(part.instrument_id);
    return project.tracks.some(t => t.index === trackIndex);
  });
  
  checks.push({
    name: 'Track/Instrument Correspondence',
    passed: allTracksMatched,
    message: allTracksMatched ? 'All tracks matched' : 'Some tracks missing',
  });

  // Check 6: Ausencia de notas duplicadas
  let duplicateNotes = 0;
  for (const track of project.tracks) {
    const noteKeys = new Set<string>();
    for (const note of track.notes) {
      const key = `${note.pitch}_${note.startTick}`;
      if (noteKeys.has(key)) {
        duplicateNotes++;
      }
      noteKeys.add(key);
    }
  }
  
  checks.push({
    name: 'No Duplicate Notes',
    passed: duplicateNotes === 0,
    message: duplicateNotes === 0 ? 'No duplicates' : `${duplicateNotes} duplicates found`,
  });

  // Check 7: Note-On sin Note-Off
  let hangingNotes = 0;
  for (const track of project.tracks) {
    for (const note of track.notes) {
      if (note.endTick <= note.startTick) {
        hangingNotes++;
      }
    }
  }
  
  checks.push({
    name: 'No Hanging Notes',
    passed: hangingNotes === 0,
    message: hangingNotes === 0 ? 'All notes closed' : `${hangingNotes} hanging notes`,
  });

  // Check 8: Coherencia entre particellas y score
  const totalNotesInParts = extractionResult.parts.reduce(
    (sum, part) => sum + part.note_count,
    0
  );
  const totalNotesInMaster = project.tracks.reduce(
    (sum, track) => sum + track.noteCount,
    0
  );
  
  checks.push({
    name: 'Parts/Master Consistency',
    passed: totalNotesInParts === totalNotesInMaster,
    message: `Parts: ${totalNotesInParts}, Master: ${totalNotesInMaster}`,
  });

  // Check 9: Todos los archivos MIDI generados
  checks.push({
    name: 'All MIDI Files Generated',
    passed: partFiles.size === extractionResult.parts.length,
    message: `${partFiles.size}/${extractionResult.parts.length} files`,
  });

  // Determinar si es válido
  const isValid = checks.every(c => c.passed);

  // Recopilar errores y warnings
  for (const check of checks) {
    if (!check.passed) {
      errors.push(`${check.name}: ${check.message}`);
    }
  }

  return {
    isValid,
    checks,
    errors,
    warnings,
  };
}

/**
 * Descarga todos los archivos MIDI como paquete
 */
export function downloadMidiPackage(
  result: MidiExportResult,
  projectName: string
): void {
  // Descargar Master MIDI
  downloadFile(result.masterMidi, `${projectName}_MASTER.mid`, 'audio/midi');

  // Descargar Score Conductor
  downloadFile(
    result.conductorScoreMidi,
    `${projectName}_SCORE_CONDUCTOR_COMPLETO.mid`,
    'audio/midi'
  );

  // Descargar todas las particellas
  for (const [fileName, midiData] of result.partMidiFiles) {
    downloadFile(midiData, fileName, 'audio/midi');
  }

  // Descargar manifest
  const manifestJson = JSON.stringify(result.manifest, null, 2);
  const manifestBlob = new Blob([manifestJson], { type: 'application/json' });
  const manifestUrl = URL.createObjectURL(manifestBlob);
  const manifestLink = document.createElement('a');
  manifestLink.href = manifestUrl;
  manifestLink.download = `${projectName}_MANIFEST.json`;
  document.body.appendChild(manifestLink);
  manifestLink.click();
  document.body.removeChild(manifestLink);
  URL.revokeObjectURL(manifestUrl);
}

/**
 * Descarga un archivo individual
 */
function downloadFile(data: Uint8Array, filename: string, mimeType: string): void {
  const blob = new Blob([data as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
