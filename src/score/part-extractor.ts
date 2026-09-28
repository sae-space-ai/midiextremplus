/**
 * Part Extractor
 *
 * Extrae particellas individuales desde la MMC validada.
 * Conserva estructura global, silencios y marcas.
 */

import { MMCProject, MMCEvent } from '../mmc/types';
import {
  IndividualPart,
  ScoreInstrument,
  ScoreStaff,
  ScoreMeasure,
  ScoreVoice,
  ScoreEvent,
  ScoreMetadata,
  RehearsalStructure,
  TempoMarking,
  KeySignatureMarking,
  TimeSignatureMarking,
  RehearsalMark,
  TextDirection,
  DynamicMark,
  ArticulationMark,
} from './types';
import { getInstrumentByProgram } from '../midi/instruments';

// ============================================================
// EXTRACCIÓN DE PARTICELLA
// ============================================================

/**
 * Extrae una particella individual para un instrumento específico.
 */
export function extractIndividualPart(
  mmc: MMCProject,
  instrumentId: string,
  metadata: ScoreMetadata,
  structure: RehearsalStructure
): IndividualPart {
  const track = mmc.tracks.find(t => t.track_id.toString() === instrumentId);
  if (!track) {
    throw new Error(`Instrumento ${instrumentId} no encontrado en MMC`);
  }

  // Construir ScoreInstrument
  const instrument = buildScoreInstrument(track, mmc);

  // Construir staff con todos los compases
  const staff = buildStaffFromTrack(track, mmc, instrument);

  // Extraer marcas globales
  const tempoMarkings = extractTempoMarkings(mmc);
  const keySignatureMarkings = extractKeySignatureMarkings(mmc);
  const timeSignatureMarkings = extractTimeSignatureMarkings(mmc);
  const rehearsalMarks = extractRehearsalMarks(mmc);
  const textDirections = extractTextDirections(mmc);

  // Calcular estadísticas
  const noteCount = staff.measures.reduce(
    (sum, m) => sum + m.voices.reduce((vs, v) => vs + v.events.filter(e => e.type === 'note').length, 0),
    0
  );
  const restCount = staff.measures.reduce(
    (sum, m) => sum + m.voices.reduce((vs, v) => vs + v.events.filter(e => e.type === 'rest').length, 0),
    0
  );
  const mmrCount = staff.measures.filter(m => m.multi_measure_rest_count !== null).length;
  const derivedCount = staff.measures.reduce(
    (sum, m) => sum + m.voices.reduce((vs, v) => vs + v.events.filter(e => e.is_derived).length, 0),
    0
  );

  return {
    id: `part_${instrumentId}_${Date.now()}`,
    version: '1.0.0',
    source_score_id: '',
    source_mmc_id: mmc.id,
    instrument_id: instrumentId,
    instrument_name: instrument.name,
    created_at: Date.now(),

    metadata,
    structure,

    staff,
    instrument,

    tempo_markings: tempoMarkings,
    key_signature_markings: keySignatureMarkings,
    time_signature_markings: timeSignatureMarkings,
    rehearsal_marks: rehearsalMarks,
    text_directions: textDirections,

    total_measures: staff.measures.length,
    total_ticks: mmc.total_ticks,

    note_count: noteCount,
    rest_count: restCount,
    multi_measure_rest_count: mmrCount,
    derived_event_count: derivedCount,
  };
}

/**
 * Construye ScoreInstrument desde MMC track.
 */
function buildScoreInstrument(
  track: { track_id: number; name: string; instrument_id: number | null; instrument_family: string | null; channel: number; instrument_capability: string },
  mmc: MMCProject
): ScoreInstrument {
  const instrumentInfo = track.instrument_id !== null
    ? getInstrumentByProgram(track.instrument_id)
    : null;

  // Determinar si requiere revisión
  let reviewRequired = false;
  let reviewReason: string | null = null;

  if (!instrumentInfo && track.instrument_id !== null) {
    reviewRequired = true;
    reviewReason = 'Programa MIDI no reconocido en catálogo';
  }

  if (!track.instrument_family) {
    reviewRequired = true;
    reviewReason = reviewReason || 'Familia instrumental no identificada';
  }

  // Determinar clef
  let clef: 'treble' | 'bass' | 'alto' | 'tenor' | 'percussion' = 'treble';
  if (track.instrument_capability === 'PERCUSSION') {
    clef = 'percussion';
  } else if (track.instrument_family === 'Cuerda frotada') {
    if (track.name.includes('Contrabajo') || track.name.includes('Double Bass')) {
      clef = 'bass';
    } else if (track.name.includes('Violonchelo') || track.name.includes('Cello')) {
      clef = 'bass'; // Puede cambiar a tenor/alto según registro
    } else if (track.name.includes('Viola')) {
      clef = 'alto';
    }
  } else if (track.instrument_family === 'Metal' && track.name.includes('Trombón')) {
    clef = 'bass';
  } else if (track.instrument_family === 'Cuerda pulsada' && track.name.includes('Bajo')) {
    clef = 'bass';
  }

  return {
    id: track.track_id.toString(),
    name: track.name,
    abbreviation: generateAbbreviation(track.name),
    midi_program: track.instrument_id,
    midi_channel: track.channel,
    mmc_track_id: track.track_id,
    mmc_instrument_id: track.instrument_id,
    mmc_instrument_family: track.instrument_family,
    is_transposing: instrumentInfo?.isTransposing || false,
    written_to_concert: instrumentInfo?.writtenToConcert || 0,
    concert_pitch_min: instrumentInfo?.minPitch || 0,
    concert_pitch_max: instrumentInfo?.maxPitch || 127,
    clef,
    layer: track.track_id === 9 ? 'L1_RHYTHMIC_BASE' : 'L3_STRINGS_WOODWINDS', // Simplificado
    group: instrumentInfo?.family || 'Other',
    review_required: reviewRequired,
    review_reason: reviewReason,
  };
}

/**
 * Genera abreviatura para nombre de instrumento.
 */
function generateAbbreviation(name: string): string {
  const abbreviations: Record<string, string> = {
    'Flauta': 'Fl.',
    'Oboe': 'Ob.',
    'Clarinete': 'Cl.',
    'Fagot': 'Fg.',
    'Trompa': 'Hn.',
    'Trompeta': 'Tpt.',
    'Trombón': 'Tbn.',
    'Tuba': 'Tba.',
    'Violín': 'Vln.',
    'Viola': 'Vla.',
    'Violonchelo': 'Vc.',
    'Contrabajo': 'Cb.',
    'Piano': 'Pf.',
  };

  for (const [full, abbr] of Object.entries(abbreviations)) {
    if (name.includes(full)) {
      return abbr;
    }
  }

  // Si no está en la lista, tomar primeras letras
  return name.split(' ').map(w => w[0]).join('').substring(0, 3) + '.';
}

/**
 * Construye staff desde track MMC.
 */
function buildStaffFromTrack(
  track: { track_id: number; measures: { measure_number: number; event_ids: string[]; time_signature_numerator: number; time_signature_denominator: number }[] },
  mmc: MMCProject,
  instrument: ScoreInstrument
): ScoreStaff {
  const measures: ScoreMeasure[] = [];

  // Crear un compás por cada compás en MMC (incluso si está vacío)
  for (let i = 1; i <= mmc.total_measures; i++) {
    const mmcMeasure = track.measures.find(m => m.measure_number === i);

    if (mmcMeasure && mmcMeasure.event_ids.length > 0) {
      // Compás con eventos
      const events = mmcMeasure.event_ids
        .map(id => mmc.events.get(id))
        .filter((e): e is MMCEvent => e !== undefined);

      const scoreEvents = events.map(e => mmcEventToScoreEvent(e, instrument));

      measures.push({
        number: i,
        time_signature: {
          numerator: mmcMeasure.time_signature_numerator,
          denominator: mmcMeasure.time_signature_denominator,
        },
        key_signature: null,
        tempo: null,
        rehearsal_mark: null,
        is_ending: null,
        repeat_start: false,
        repeat_end: false,
        voices: [
          {
            voice_id: 1,
            events: scoreEvents,
          },
        ],
        multi_measure_rest_count: null,
        is_hidden: false,
      });
    } else {
      // Compás vacío → silencio
      measures.push({
        number: i,
        time_signature: {
          numerator: mmc.time_signatures[0]?.numerator || 4,
          denominator: mmc.time_signatures[0]?.denominator || 4,
        },
        key_signature: null,
        tempo: null,
        rehearsal_mark: null,
        is_ending: null,
        repeat_start: false,
        repeat_end: false,
        voices: [
          {
            voice_id: 1,
            events: [
              createRestEvent(i, 1, mmc.ticks_per_beat * (mmc.time_signatures[0]?.numerator || 4)),
            ],
          },
        ],
        multi_measure_rest_count: null,
        is_hidden: false,
      });
    }
  }

  // Consolidar multi-measure rests
  consolidateMultiMeasureRests(measures);

  return {
    instrument_id: instrument.id,
    instrument_name: instrument.name,
    clef: instrument.clef,
    transposition: instrument.written_to_concert,
    measures,
    is_visible: true,
  };
}

/**
 * Convierte MMCEvent a ScoreEvent.
 */
function mmcEventToScoreEvent(event: MMCEvent, instrument: ScoreInstrument): ScoreEvent {
  // Aplicar transposición si es instrumento transpositor
  const pitchWritten = instrument.is_transposing
    ? event.pitch_midi - instrument.written_to_concert
    : event.pitch_midi;

  return {
    id: `score_${event.event_id}`,
    mmc_event_id: event.event_id,
    source_midi_note_id: event.source_event_id,
    type: 'note',
    measure: event.measure,
    beat: event.beat,
    voice: event.voice_id,
    tick: event.absolute_tick,
    pitch_midi: event.pitch_midi,
    pitch_written: pitchWritten,
    pitch_class: event.pitch_class,
    octave: event.octave,
    duration_ticks: event.raw_duration,
    duration_notation: ticksToNotation(event.raw_duration),
    dots: 0,
    velocity: event.velocity,
    dynamic: velocityToDynamic(event.velocity),
    articulations: inferArticulations(event),
    is_derived: false,
    derivation_reason: null,
    mmc_validation_status: event.validation_status,
    transformation_count: event.transformation_history.length,
    is_grace_note: false,
    is_cue: false,
    staff_line: null,
  };
}

/**
 * Crea evento de silencio.
 */
function createRestEvent(measure: number, voice: number, durationTicks: number): ScoreEvent {
  return {
    id: `rest_${measure}_${voice}_${Date.now()}`,
    mmc_event_id: '',
    source_midi_note_id: null,
    type: 'rest',
    measure,
    beat: 1,
    voice,
    tick: 0,
    pitch_midi: null,
    pitch_written: null,
    pitch_class: null,
    octave: null,
    duration_ticks: durationTicks,
    duration_notation: ticksToNotation(durationTicks),
    dots: 0,
    velocity: 0,
    dynamic: null,
    articulations: [],
    is_derived: true,
    derivation_reason: 'Silencio generado para compás vacío',
    mmc_validation_status: 'MMC_VALIDATED',
    transformation_count: 0,
    is_grace_note: false,
    is_cue: false,
    staff_line: null,
  };
}

/**
 * Consolida silencios consecutivos en multi-measure rests.
 */
function consolidateMultiMeasureRests(measures: ScoreMeasure[]): void {
  let restStart = -1;
  let restCount = 0;

  for (let i = 0; i < measures.length; i++) {
    const measure = measures[i];
    const isRest = measure.voices[0]?.events.length === 1 &&
                   measure.voices[0].events[0].type === 'rest';

    if (isRest) {
      if (restStart === -1) {
        restStart = i;
      }
      restCount++;
    } else {
      if (restCount >= 2) {
        // Consolidar
        measures[restStart].multi_measure_rest_count = restCount;
        for (let j = restStart + 1; j < restStart + restCount; j++) {
          measures[j].is_hidden = true;
        }
      }
      restStart = -1;
      restCount = 0;
    }
  }

  // Verificar último grupo
  if (restCount >= 2 && restStart !== -1) {
    measures[restStart].multi_measure_rest_count = restCount;
    for (let j = restStart + 1; j < restStart + restCount; j++) {
      measures[j].is_hidden = true;
    }
  }
}

/**
 * Convierte ticks a notación de duración.
 */
function ticksToNotation(ticks: number): string {
  // Asumiendo 480 ticks por negra
  const ratio = ticks / 480;

  if (ratio >= 4) return 'whole';
  if (ratio >= 2) return 'half';
  if (ratio >= 1) return 'quarter';
  if (ratio >= 0.5) return 'eighth';
  if (ratio >= 0.25) return '16th';
  if (ratio >= 0.125) return '32nd';
  return '64th';
}

/**
 * Convierte velocity a dinámica.
 */
function velocityToDynamic(velocity: number): DynamicMark | null {
  if (velocity < 20) return 'ppp';
  if (velocity < 40) return 'pp';
  if (velocity < 60) return 'p';
  if (velocity < 80) return 'mp';
  if (velocity < 100) return 'mf';
  if (velocity < 115) return 'f';
  if (velocity < 127) return 'ff';
  return 'fff';
}

/**
 * Infiere articulaciones desde MMCEvent.
 */
function inferArticulations(event: MMCEvent): ArticulationMark[] {
  const articulations: ArticulationMark[] = [];

  if (event.articulation === 'STACCATO') {
    articulations.push('staccato');
  } else if (event.articulation === 'LEGATO') {
    articulations.push('tenuto');
  }

  return articulations;
}

/**
 * Extrae marcas de tempo desde MMC.
 */
function extractTempoMarkings(mmc: MMCProject): TempoMarking[] {
  return mmc.tempo_map.map(t => ({
    measure: 1, // Simplificado: debería calcularse
    tick: t.tick,
    bpm: t.bpm,
    text: null,
  }));
}

/**
 * Extrae marcas de tonalidad desde MMC.
 */
function extractKeySignatureMarkings(mmc: MMCProject): KeySignatureMarking[] {
  // MMC no tiene key signatures explícitas, retornar vacío
  return [];
}

/**
 * Extrae marcas de compás desde MMC.
 */
function extractTimeSignatureMarkings(mmc: MMCProject): TimeSignatureMarking[] {
  return mmc.time_signatures.map(ts => ({
    measure: 1, // Simplificado
    tick: ts.tick,
    numerator: ts.numerator,
    denominator: ts.denominator,
  }));
}

/**
 * Extrae marcas de ensayo desde MMC.
 */
function extractRehearsalMarks(mmc: MMCProject): RehearsalMark[] {
  // MMC no tiene rehearsal marks explícitas, retornar vacío
  return [];
}

/**
 * Extrae direcciones de texto desde MMC.
 */
function extractTextDirections(mmc: MMCProject): TextDirection[] {
  // MMC no tiene text directions explícitas, retornar vacío
  return [];
}
