/**
 * MusicXML Exporter
 *
 * Genera archivos MusicXML desde Score o IndividualPart.
 * MusicXML es el formato estándar para intercambio de partituras.
 */

import {
  Score,
  IndividualPart,
  ScoreStaff,
  ScoreMeasure,
  ScoreEvent,
  ScoreInstrument,
} from './types';

// ============================================================
// EXPORTACIÓN MUSICXML
// ============================================================

/**
 * Genera MusicXML desde un Score completo.
 */
export function exportScoreToMusicXML(score: Score): string {
  const parts = score.groups.flatMap(g => g.staves);
  return buildMusicXML(score.metadata, parts, score.tempo_markings, score.total_measures);
}

/**
 * Genera MusicXML desde una particella individual.
 */
export function exportPartToMusicXML(part: IndividualPart): string {
  return buildMusicXML(
    part.metadata,
    [part.staff],
    part.tempo_markings,
    part.total_measures
  );
}

/**
 * Construye el documento MusicXML completo.
 */
function buildMusicXML(
  metadata: { title: string | null; composer: string | null; copyright: string | null },
  staves: ScoreStaff[],
  tempoMarkings: { measure: number; bpm: number }[],
  totalMeasures: number
): string {
  const lines: string[] = [];

  // XML header
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
  lines.push('<score-partwise version="4.0">');

  // Work title
  if (metadata.title) {
    lines.push('  <work>');
    lines.push(`    <work-title>${escapeXml(metadata.title)}</work-title>`);
    lines.push('  </work>');
  }

  // Identification
  lines.push('  <identification>');
  if (metadata.composer) {
    lines.push('  <creator type="composer">' + escapeXml(metadata.composer) + '</creator>');
  }
  if (metadata.copyright) {
    lines.push('  <rights>' + escapeXml(metadata.copyright) + '</rights>');
  }
  lines.push('  <encoding>');
  lines.push('    <software>MIDIExtremPlus MMC v1.0</software>');
  lines.push(`    <encoding-date>${new Date().toISOString().split('T')[0]}</encoding-date>`);
  lines.push('  </encoding>');
  lines.push('  </identification>');

  // Defaults
  lines.push('  <defaults>');
  lines.push('    <scaling>');
  lines.push('      <millimeters>7</millimeters>');
  lines.push('      <tenths>40</tenths>');
  lines.push('    </scaling>');
  lines.push('  </defaults>');

  // Part list
  lines.push('  <part-list>');
  for (let i = 0; i < staves.length; i++) {
    const staff = staves[i];
    lines.push(`    <score-part id="P${i + 1}">`);
    lines.push(`      <part-name>${escapeXml(staff.instrument_name)}</part-name>`);
    lines.push(`      <part-abbreviation>${escapeXml(staff.instrument_name.substring(0, 4))}</part-abbreviation>`);
    lines.push('    </score-part>');
  }
  lines.push('  </part-list>');

  // Parts
  for (let i = 0; i < staves.length; i++) {
    const staff = staves[i];
    lines.push(`  <part id="P${i + 1}">`);

    for (const measure of staff.measures) {
      if (measure.is_hidden) continue; // Skip hidden measures (multi-measure rests)

      lines.push(`    <measure number="${measure.number}">`);

      // Attributes (first measure or when changed)
      if (measure.number === 1 || measure.time_signature || measure.key_signature) {
        lines.push('      <attributes>');
        lines.push('        <divisions>480</divisions>'); // 480 ticks per quarter

        if (measure.key_signature) {
          lines.push('        <key>');
          lines.push(`          <fifths>${keyToFifths(measure.key_signature.key)}</fifths>`);
          lines.push(`          <mode>${measure.key_signature.mode}</mode>`);
          lines.push('        </key>');
        }

        if (measure.time_signature) {
          lines.push('        <time>');
          lines.push(`          <beats>${measure.time_signature.numerator}</beats>`);
          lines.push(`          <beat-type>${measure.time_signature.denominator}</beat-type>`);
          lines.push('        </time>');
        }

        // Clef
        lines.push('        <clef>');
        lines.push(`          <sign>${clefToSign(staff.clef)}</sign>`);
        if (staff.clef === 'percussion') {
          lines.push('          <line>0</line>');
        }
        lines.push('        </clef>');

        lines.push('      </attributes>');

        // Tempo (first measure)
        if (measure.number === 1) {
          const tempo = tempoMarkings.find(t => t.measure === 1);
          if (tempo) {
            lines.push('      <direction placement="above">');
            lines.push('        <direction-type>');
            lines.push(`          <metronome><beat-unit>quarter</beat-unit><per-minute>${tempo.bpm}</per-minute></metronome>`);
            lines.push('        </direction-type>');
            lines.push('        <sound tempo="' + tempo.bpm + '"/>');
            lines.push('      </direction>');
          }
        }
      }

      // Multi-measure rest
      if (measure.multi_measure_rest_count !== null) {
        lines.push('      <attributes>');
        lines.push('        <measure-style>');
        lines.push(`          <multiple-rest>${measure.multi_measure_rest_count}</multiple-rest>`);
        lines.push('        </measure-style>');
        lines.push('      </attributes>');
        lines.push('      <note>');
        lines.push('        <rest measure="yes"/>');
        lines.push('        <duration>1920</duration>'); // Whole note
        lines.push('      </note>');
      } else {
        // Notes and rests
        for (const voice of measure.voices) {
          for (const event of voice.events) {
            lines.push(...eventToMusicXML(event, voice.voice_id));
          }
        }
      }

      lines.push('    </measure>');
    }

    lines.push('  </part>');
  }

  lines.push('</score-partwise>');

  return lines.join('\n');
}

/**
 * Convierte un evento a MusicXML.
 */
function eventToMusicXML(event: ScoreEvent, voice: number): string[] {
  const lines: string[] = [];

  lines.push('      <note>');

  // Grace note
  if (event.is_grace_note) {
    lines.push('        <grace/>');
  }

  if (event.type === 'rest') {
    lines.push('        <rest/>');
  } else if (event.pitch_midi !== null) {
    lines.push('        <pitch>');
    lines.push(`          <step>${pitchToStep(event.pitch_midi)}</step>`);
    const alter = pitchToAlter(event.pitch_midi);
    if (alter !== 0) {
      lines.push(`          <alter>${alter}</alter>`);
    }
    lines.push(`          <octave>${Math.floor(event.pitch_midi / 12) - 1}</octave>`);
    lines.push('        </pitch>');
  }

  // Duration
  const duration = event.duration_ticks;
  lines.push(`        <duration>${duration}</duration>`);

  // Voice
  lines.push(`        <voice>${voice}</voice>`);

  // Type (note type)
  lines.push(`        <type>${event.duration_notation}</type>`);

  // Dots
  for (let i = 0; i < event.dots; i++) {
    lines.push('        <dot/>');
  }

  // Articulations
  if (event.articulations.length > 0) {
    lines.push('        <notations>');
    lines.push('          <articulations>');
    for (const art of event.articulations) {
      lines.push(`            <${art}/>`);
    }
    lines.push('          </articulations>');
    lines.push('        </notations>');
  }

  // Dynamics
  if (event.dynamic) {
    lines.push('        <notations>');
    lines.push('          <dynamics>');
    lines.push(`            <${event.dynamic}/>`);
    lines.push('          </dynamics>');
    lines.push('        </notations>');
  }

  lines.push('      </note>');

  return lines;
}

/**
 * Convierte pitch MIDI a nombre de nota (step).
 */
function pitchToStep(pitch: number): string {
  const steps = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  return steps[pitch % 12];
}

/**
 * Convierte pitch MIDI a alteración.
 */
function pitchToAlter(pitch: number): number {
  const alters = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  return alters[pitch % 12];
}

/**
 * Convierte nombre de tonalidad a número de alteraciones.
 */
function keyToFifths(key: string): number {
  const fifths: Record<string, number> = {
    'Cb': -7, 'Gb': -6, 'Db': -5, 'Ab': -4, 'Eb': -3, 'Bb': -2, 'F': -1,
    'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
  };
  return fifths[key] || 0;
}

/**
 * Convierte nombre de clave a signo MusicXML.
 */
function clefToSign(clef: string): string {
  const signs: Record<string, string> = {
    'treble': 'G',
    'bass': 'F',
    'alto': 'C',
    'tenor': 'C',
    'percussion': 'percussion',
  };
  return signs[clef] || 'G';
}

/**
 * Escapa caracteres especiales para XML.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Descarga un archivo MusicXML.
 */
export function downloadMusicXML(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/vnd.recordare.musicxml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.musicxml') ? filename : `${filename}.musicxml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
