/**
 * Score Assembler
 *
 * Ensambla el Full Conductor Score desde la MMC validada.
 * Agrupa instrumentos, ordena orquestalmente, sincroniza compases.
 */

import { MMCProject } from '../mmc/types';
import {
  Score,
  ScoreMetadata,
  RehearsalStructure,
  ScoreGroup,
  ScoreStaff,
  ScoreInstrument,
  OrchestralOrderConfig,
  EnsembleTemplate,
  TempoMarking,
  KeySignatureMarking,
  TimeSignatureMarking,
  RehearsalMark,
  TextDirection,
  IndividualPart,
} from './types';
import { extractIndividualPart } from './part-extractor';
import {
  getOrchestralOrderConfig,
  sortInstrumentsByOrchestralOrder,
  groupInstruments,
  detectEnsembleTemplate,
  getGroupBracketType,
} from './orchestral-order';

// ============================================================
// ENSAMBLAJE DEL SCORE COMPLETO
// ============================================================

/**
 * Ensambla el Full Conductor Score desde MMC.
 */
export function assembleFullScore(
  mmc: MMCProject,
  metadata: ScoreMetadata,
  structure: RehearsalStructure,
  template?: EnsembleTemplate
): Score {
  // Detectar plantilla si no se especifica
  const detectedTemplate = template || detectEnsembleTemplateFromMMC(mmc);
  const config = getOrchestralOrderConfig(detectedTemplate);

  // Extraer todos los instrumentos
  const instruments: ScoreInstrument[] = [];
  const staves: ScoreStaff[] = [];

  for (const track of mmc.tracks) {
    const part = extractIndividualPart(
      mmc,
      track.track_id.toString(),
      metadata,
      structure
    );
    instruments.push(part.instrument);
    staves.push(part.staff);
  }

  // Ordenar instrumentos
  const sortedInstruments = sortInstrumentsByOrchestralOrder(instruments, config);

  // Reordenar staves según orden de instrumentos
  const sortedStaves = sortedInstruments.map(inst => {
    const staff = staves.find(s => s.instrument_id === inst.id);
    return staff!;
  });

  // Agrupar instrumentos
  const groups = buildGroups(sortedInstruments, sortedStaves, config);

  // Extraer marcas globales
  const tempoMarkings = extractTempoMarkings(mmc);
  const keySignatureMarkings = extractKeySignatureMarkings(mmc);
  const timeSignatureMarkings = extractTimeSignatureMarkings(mmc);
  const rehearsalMarks = extractRehearsalMarks(mmc);
  const textDirections = extractTextDirections(mmc);

  // Calcular estadísticas
  const eventCount = sortedStaves.reduce(
    (sum, staff) => sum + staff.measures.reduce(
      (ms, m) => ms + m.voices.reduce((vs, v) => vs + v.events.length, 0),
      0
    ),
    0
  );

  const derivedCount = sortedStaves.reduce(
    (sum, staff) => sum + staff.measures.reduce(
      (ms, m) => ms + m.voices.reduce((vs, v) => vs + v.events.filter(e => e.is_derived).length, 0),
      0
    ),
    0
  );

  return {
    id: `score_${mmc.id}_${Date.now()}`,
    version: '1.0.0',
    source_mmc_id: mmc.id,
    source_project_id: mmc.source_project_id,
    created_at: Date.now(),

    metadata,
    structure,

    groups: Array.from(groups.values()),
    all_staves: sortedStaves,
    all_instruments: sortedInstruments,

    tempo_markings: tempoMarkings,
    key_signature_markings: keySignatureMarkings,
    time_signature_markings: timeSignatureMarkings,
    rehearsal_marks: rehearsalMarks,
    text_directions: textDirections,

    slurs: [],
    ties: [],

    total_measures: mmc.total_measures,
    total_ticks: mmc.total_ticks,

    event_count: eventCount,
    derived_event_count: derivedCount,
    mmc_event_count: mmc.events.size,
  };
}

/**
 * Detecta plantilla orquestal desde MMC.
 */
function detectEnsembleTemplateFromMMC(mmc: MMCProject): EnsembleTemplate {
  const families = new Set(
    mmc.tracks
      .map(t => t.instrument_family)
      .filter((f): f is string => f !== null)
  );

  if (families.has('Cuerda frotada') || families.has('Strings')) {
    return 'symphonic_orchestra';
  }

  if (families.has('Saxofón')) {
    return 'big_band';
  }

  if (families.has('Madera') && families.has('Metal')) {
    return 'wind_orchestra';
  }

  if (mmc.tracks.length <= 8) {
    return 'chamber_ensemble';
  }

  return 'symphonic_orchestra';
}

/**
 * Construye grupos de instrumentos.
 */
function buildGroups(
  instruments: ScoreInstrument[],
  staves: ScoreStaff[],
  config: OrchestralOrderConfig
): Map<string, ScoreGroup> {
  const groups = new Map<string, ScoreGroup>();

  for (const groupConfig of config.groups) {
    const groupInstruments = instruments.filter(inst =>
      groupConfig.families.includes(inst.mmc_instrument_family || '')
    );

    if (groupInstruments.length === 0) continue;

    const groupStaves = groupInstruments.map(inst => {
      const staff = staves.find(s => s.instrument_id === inst.id);
      return staff!;
    });

    groups.set(groupConfig.name, {
      name: groupConfig.name,
      bracket_type: groupConfig.bracket_type,
      staves: groupStaves,
    });
  }

  // Instrumentos sin grupo
  const groupedIds = new Set(
    Array.from(groups.values()).flatMap(g => g.staves.map(s => s.instrument_id))
  );
  const ungrouped = instruments.filter(inst => !groupedIds.has(inst.id));

  if (ungrouped.length > 0) {
    const ungroupedStaves = ungrouped.map(inst => {
      const staff = staves.find(s => s.instrument_id === inst.id);
      return staff!;
    });

    groups.set('Other', {
      name: 'Other',
      bracket_type: 'bracket',
      staves: ungroupedStaves,
    });
  }

  return groups;
}

/**
 * Extrae marcas de tempo desde MMC.
 */
function extractTempoMarkings(mmc: MMCProject): TempoMarking[] {
  return mmc.tempo_map.map(t => ({
    measure: 1,
    tick: t.tick,
    bpm: t.bpm,
    text: null,
  }));
}

/**
 * Extrae marcas de tonalidad desde MMC.
 */
function extractKeySignatureMarkings(mmc: MMCProject): KeySignatureMarking[] {
  return [];
}

/**
 * Extrae marcas de compás desde MMC.
 */
function extractTimeSignatureMarkings(mmc: MMCProject): TimeSignatureMarking[] {
  return mmc.time_signatures.map(ts => ({
    measure: 1,
    tick: ts.tick,
    numerator: ts.numerator,
    denominator: ts.denominator,
  }));
}

/**
 * Extrae marcas de ensayo desde MMC.
 */
function extractRehearsalMarks(mmc: MMCProject): RehearsalMark[] {
  return [];
}

/**
 * Extrae direcciones de texto desde MMC.
 */
function extractTextDirections(mmc: MMCProject): TextDirection[] {
  return [];
}

/**
 * Extrae todas las particellas individuales.
 */
export function extractAllParts(
  mmc: MMCProject,
  metadata: ScoreMetadata,
  structure: RehearsalStructure
): IndividualPart[] {
  const parts: IndividualPart[] = [];

  for (const track of mmc.tracks) {
    const part = extractIndividualPart(
      mmc,
      track.track_id.toString(),
      metadata,
      structure
    );
    parts.push(part);
  }

  return parts;
}

// Re-exportar extractIndividualPart para conveniencia
export { extractIndividualPart } from './part-extractor';
