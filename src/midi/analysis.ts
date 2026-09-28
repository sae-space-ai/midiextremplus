// Análisis musical - habilidades de análisis sobre el proyecto MIDI
// Distribución de alturas, densidad, desviaciones, patrones, etc.

import { MidiProject, MidiNote, TrackInfo } from './model';

export interface PitchDistribution {
  min: number;
  max: number;
  mean: number;
  median: number;
  mode: number;
  range: number;
  histogram: Map<number, number>;
}

export interface RhythmAnalysis {
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  durationHistogram: Map<number, number>;
  densityPerBar: number[];
  avgDisplacement: number;
  maxDisplacement: number;
}

export interface PatternMatch {
  startBar: number;
  endBar: number;
  pitches: number[];
  intervals: number[];
  similarity: number; // 0-1, qualitative
}

export interface KeyEstimation {
  key: string;
  scale: 'major' | 'minor';
  evidence: string;
  confidence: 'alta' | 'media' | 'baja';
  pitchClassDistribution: number[];
}

export interface VoiceSeparation {
  voice1: MidiNote[];
  voice2: MidiNote[];
  method: string;
  confidence: 'alta' | 'media' | 'baja';
}

export interface AnalysisResult {
  pitchDistribution: PitchDistribution;
  rhythmAnalysis: RhythmAnalysis;
  keyEstimation: KeyEstimation | null;
  patterns: PatternMatch[];
  barComparison: { bar1: number; bar2: number; similarity: number }[];
}

/**
 * Calcula la distribución de alturas de una pista
 */
export function analyzePitchDistribution(track: TrackInfo): PitchDistribution {
  const pitches = track.notes.map(n => n.pitch);
  if (pitches.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, mode: 0, range: 0, histogram: new Map() };
  }
  
  const sorted = [...pitches].sort((a, b) => a - b);
  const histogram = new Map<number, number>();
  
  for (const p of pitches) {
    histogram.set(p, (histogram.get(p) || 0) + 1);
  }
  
  const sum = pitches.reduce((a, b) => a + b, 0);
  const mean = sum / pitches.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  
  // Mode
  let mode = sorted[0];
  let maxCount = 0;
  for (const [pitch, count] of histogram) {
    if (count > maxCount) {
      maxCount = count;
      mode = pitch;
    }
  }
  
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median,
    mode,
    range: sorted[sorted.length - 1] - sorted[0],
    histogram
  };
}

/**
 * Analiza el ritmo de una pista
 */
export function analyzeRhythm(track: TrackInfo, project: MidiProject): RhythmAnalysis {
  if (track.notes.length === 0) {
    return { avgDuration: 0, minDuration: 0, maxDuration: 0, durationHistogram: new Map(), densityPerBar: [], avgDisplacement: 0, maxDisplacement: 0 };
  }
  
  const durations = track.notes.map(n => n.endTick - n.startTick);
  const sorted = [...durations].sort((a, b) => a - b);
  
  const durationHistogram = new Map<number, number>();
  for (const d of durations) {
    durationHistogram.set(d, (durationHistogram.get(d) || 0) + 1);
  }
  
  // Density per bar
  const tpb = project.ticksPerBeat;
  const num = project.timeSignatures[0]?.numerator || 4;
  const ticksPerBar = num * tpb;
  const totalBars = Math.ceil(project.totalTicks / ticksPerBar);
  const densityPerBar: number[] = new Array(totalBars).fill(0);
  
  for (const note of track.notes) {
    const bar = Math.floor(note.startTick / ticksPerBar);
    if (bar < totalBars) {
      densityPerBar[bar]++;
    }
  }
  
  // Displacement analysis
  const displacements = track.notes.map(n => Math.abs(n.correctedStartTick - n.originalStartTick));
  const avgDisplacement = displacements.reduce((a, b) => a + b, 0) / displacements.length;
  const maxDisplacement = Math.max(...displacements);
  
  return {
    avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
    minDuration: sorted[0],
    maxDuration: sorted[sorted.length - 1],
    durationHistogram,
    densityPerBar,
    avgDisplacement,
    maxDisplacement
  };
}

/**
 * Estima la tonalidad basándose en la distribución de clases de altura
 */
export function estimateKey(track: TrackInfo): KeyEstimation | null {
  if (track.notes.length < 8) return null;
  
  // Count pitch classes
  const pitchClasses = new Array(12).fill(0);
  for (const note of track.notes) {
    pitchClasses[note.pitch % 12]++;
  }
  
  const total = track.notes.length;
  const normalized = pitchClasses.map(c => c / total);
  
  // Krumhansl-Schmuckler key profiles
  const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  
  const keyNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  
  let bestKey = 0;
  let bestScale: 'major' | 'minor' = 'major';
  let bestCorrelation = -Infinity;
  
  for (let key = 0; key < 12; key++) {
    // Rotate profiles
    const rotatedMajor = majorProfile.map((_, i) => majorProfile[(i + key) % 12]);
    const rotatedMinor = minorProfile.map((_, i) => minorProfile[(i + key) % 12]);
    
    const corrMajor = pearsonCorrelation(normalized, rotatedMajor);
    const corrMinor = pearsonCorrelation(normalized, rotatedMinor);
    
    if (corrMajor > bestCorrelation) {
      bestCorrelation = corrMajor;
      bestKey = key;
      bestScale = 'major';
    }
    if (corrMinor > bestCorrelation) {
      bestCorrelation = corrMinor;
      bestKey = key;
      bestScale = 'minor';
    }
  }
  
  const confidence = bestCorrelation > 0.8 ? 'alta' : bestCorrelation > 0.5 ? 'media' : 'baja';
  
  return {
    key: keyNames[bestKey],
    scale: bestScale,
    evidence: `Correlación de ${bestCorrelation.toFixed(3)} con el perfil de ${bestScale === 'major' ? 'mayor' : 'menor'} de ${keyNames[bestKey]}`,
    confidence,
    pitchClassDistribution: pitchClasses
  };
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
  const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);
  
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  return den === 0 ? 0 : num / den;
}

/**
 * Detecta patrones rítmicos repetidos
 */
export function detectPatterns(track: TrackInfo, project: MidiProject): PatternMatch[] {
  const patterns: PatternMatch[] = [];
  const tpb = project.ticksPerBeat;
  const num = project.timeSignatures[0]?.numerator || 4;
  const ticksPerBar = num * tpb;
  const totalBars = Math.floor(project.totalTicks / ticksPerBar);
  
  if (totalBars < 4) return patterns;
  
  // Group notes by bar
  const notesByBar: MidiNote[][] = new Array(totalBars).fill(null).map(() => []);
  for (const note of track.notes) {
    const bar = Math.floor(note.startTick / ticksPerBar);
    if (bar < totalBars) {
      notesByBar[bar].push(note);
    }
  }
  
  // Compare pairs of bars
  for (let i = 0; i < totalBars - 1; i++) {
    for (let j = i + 1; j < totalBars; j++) {
      const similarity = compareBarsSimple(notesByBar[i], notesByBar[j], ticksPerBar);
      if (similarity > 0.7) {
        patterns.push({
          startBar: i + 1,
          endBar: i + 1,
          pitches: notesByBar[i].map(n => n.pitch),
          intervals: computeIntervals(notesByBar[i]),
          similarity
        });
      }
    }
  }
  
  return patterns.slice(0, 10); // Limit results
}

function compareBarsSimple(notes1: MidiNote[], notes2: MidiNote[], _ticksPerBar: number): number {
  if (notes1.length === 0 && notes2.length === 0) return 1;
  if (notes1.length === 0 || notes2.length === 0) return 0;
  if (notes1.length !== notes2.length) return 0.3;
  
  // Compare intervals
  const intervals1 = computeIntervals(notes1);
  const intervals2 = computeIntervals(notes2);
  
  if (intervals1.length !== intervals2.length) return 0.3;
  
  let matches = 0;
  for (let i = 0; i < intervals1.length; i++) {
    if (intervals1[i] === intervals2[i]) matches++;
  }
  
  return matches / intervals1.length;
}

function computeIntervals(notes: MidiNote[]): number[] {
  const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(sorted[i].pitch - sorted[i - 1].pitch);
  }
  return intervals;
}

/**
 * Compara dos compases de una pista
 */
export function compareTwoBars(project: MidiProject, trackIndex: number, bar1: number, bar2: number): number {
  const track = project.tracks[trackIndex];
  if (!track) return 0;
  
  const tpb = project.ticksPerBeat;
  const num = project.timeSignatures[0]?.numerator || 4;
  const ticksPerBar = num * tpb;
  
  const notes1 = track.notes.filter(n => {
    const bar = Math.floor(n.startTick / ticksPerBar);
    return bar === bar1 - 1;
  });
  
  const notes2 = track.notes.filter(n => {
    const bar = Math.floor(n.startTick / ticksPerBar);
    return bar === bar2 - 1;
  });
  
  return compareBarsDetailed(notes1, notes2, ticksPerBar);
}

function compareBarsDetailed(notes1: MidiNote[], notes2: MidiNote[], ticksPerBar: number): number {
  if (notes1.length === 0 && notes2.length === 0) return 1;
  if (notes1.length === 0 || notes2.length === 0) return 0;
  
  // Compare rhythm (positions)
  const pos1 = notes1.map(n => n.startTick % ticksPerBar).sort((a, b) => a - b);
  const pos2 = notes2.map(n => n.startTick % ticksPerBar).sort((a, b) => a - b);
  
  let rhythmMatch = 0;
  const tolerance = ticksPerBar / 16;
  for (const p1 of pos1) {
    if (pos2.some(p2 => Math.abs(p1 - p2) < tolerance)) {
      rhythmMatch++;
    }
  }
  const rhythmScore = rhythmMatch / Math.max(pos1.length, pos2.length);
  
  // Compare pitches
  const pitches1 = notes1.map(n => n.pitch).sort((a, b) => a - b);
  const pitches2 = notes2.map(n => n.pitch).sort((a, b) => a - b);
  
  let pitchMatch = 0;
  for (const p1 of pitches1) {
    if (pitches2.includes(p1)) pitchMatch++;
  }
  const pitchScore = pitchMatch / Math.max(pitches1.length, pitches2.length);
  
  return (rhythmScore + pitchScore) / 2;
}

/**
 * Propone separación de voces basada en altura
 */
export function proposeVoiceSeparation(track: TrackInfo): VoiceSeparation | null {
  if (track.notes.length < 4) return null;
  
  const sorted = [...track.notes].sort((a, b) => a.startTick - b.startTick);
  
  // Find median pitch
  const pitches = sorted.map(n => n.pitch).sort((a, b) => a - b);
  const medianPitch = pitches[Math.floor(pitches.length / 2)];
  
  // Separate by pitch relative to median
  const voice1 = sorted.filter(n => n.pitch >= medianPitch);
  const voice2 = sorted.filter(n => n.pitch < medianPitch);
  
  if (voice1.length < 2 || voice2.length < 2) return null;
  
  return {
    voice1,
    voice2,
    method: 'Separación por altura media',
    confidence: 'media'
  };
}

/**
 * Análisis completo de una pista
 */
export function fullTrackAnalysis(track: TrackInfo, project: MidiProject): AnalysisResult {
  return {
    pitchDistribution: analyzePitchDistribution(track),
    rhythmAnalysis: analyzeRhythm(track, project),
    keyEstimation: estimateKey(track),
    patterns: detectPatterns(track, project),
    barComparison: []
  };
}

/**
 * Utilidad para nombre de nota
 */
export function getNoteName(pitch: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(pitch / 12) - 1;
  return `${names[pitch % 12]}${octave}`;
}
