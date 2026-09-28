// Modelo de datos interno para representación MIDI
// Usa tiempos en ticks (enteros) para evitar errores de coma flotante

export interface Rational {
  num: number;
  den: number;
}

export function rational(num: number, den: number): Rational {
  const g = gcd(Math.abs(num), Math.abs(den));
  return { num: num / g, den: den / g };
}

export function gcd(a: number, b: number): number {
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

export function rationalAdd(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function rationalToFloat(r: Rational): number {
  return r.num / r.den;
}

export interface TempoEvent {
  tick: number;
  bpm: number;
  microsecondsPerBeat: number;
}

export interface TimeSignatureEvent {
  tick: number;
  numerator: number;
  denominator: number;
  clocksPerClick: number;
  thirtySecondNotesPerBeat: number;
}

export interface KeySignatureEvent {
  tick: number;
  key: string;
  scale: 'major' | 'minor';
}

export interface MidiNote {
  id: string;
  trackIndex: number;
  channel: number;
  pitch: number;
  velocity: number;
  startTick: number;
  endTick: number;
  // Corregidos (después de cuantización)
  correctedStartTick: number;
  correctedEndTick: number;
  // Posición musical
  barNumber?: number;
  positionInBar?: Rational;
  // Estado
  isModified: boolean;
  isProtected: boolean;
  isFlagged: boolean;
  flagReason?: string;
  modificationReason?: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  // Original values for comparison
  originalStartTick: number;
  originalEndTick: number;
}

export interface ControlChange {
  tick: number;
  channel: number;
  controller: number;
  value: number;
  trackIndex: number;
}

export interface PitchBend {
  tick: number;
  channel: number;
  value: number;
  trackIndex: number;
}

export interface TrackInfo {
  index: number;
  name: string;
  channel: number;
  program?: number;
  bank?: number;
  isPercussion: boolean;
  role: 'unassigned' | 'percussion' | 'bass' | 'harmony' | 'melody' | 'strings' | 'woodwinds' | 'brass' | 'other';
  polyphony: 'mono' | 'poly' | 'percussion' | 'auto';
  noteCount: number;
  notes: MidiNote[];
}

export interface MidiProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  format: number; // 0 or 1
  ticksPerBeat: number;
  tempoMap: TempoEvent[];
  timeSignatures: TimeSignatureEvent[];
  keySignatures: KeySignatureEvent[];
  tracks: TrackInfo[];
  controlChanges: ControlChange[];
  pitchBends: PitchBend[];
  totalTicks: number;
  totalDuration: number; // seconds
  // Diagnóstico
  issues: DiagnosticIssue[];
  missingInfo: MissingInfo;
  // Configuración de cuantización
  quantizeConfig: QuantizeConfig;
  // Versiones
  versions: ProjectVersion[];
  currentVersionId: string;
}

export interface MissingInfo {
  hasTempo: boolean;
  hasTimeSignature: boolean;
  hasKeySignature: boolean;
  assumedTempo: number;
  assumedTimeSignature: string;
}

export interface DiagnosticIssue {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: 'structure' | 'timing' | 'overlap' | 'orphan' | 'tempo' | 'timesig' | 'notes';
  message: string;
  trackIndex?: number;
  tick?: number;
  noteId?: string;
  barNumber?: number;
}

export interface QuantizeConfig {
  mode: 'strict' | 'interpretive' | 'assisted';
  gridDivision: number; // 4=negras, 8=corcheas, 16=semicorcheas, 32=fusas
  useTriplets: boolean;
  strength: number; // 0-100
  maxDisplacement: number; // en ticks
  quantizeAttacksOnly: boolean;
  normalizeDuration: boolean;
  swingAmount: number; // 0-100
  preserveSelected: boolean;
  collisionPolicy: 'keep_first' | 'keep_closest' | 'flag';
  rangeStartBar?: number;
  rangeEndBar?: number;
  trackIndices: number[];
}

export interface ProjectVersion {
  id: string;
  name: string;
  createdAt: number;
  notes: MidiNote[][];
  isApproved: boolean;
}

// Utilidades de tiempo
export function tickToSeconds(tick: number, tempoMap: TempoEvent[], ticksPerBeat: number): number {
  let seconds = 0;
  let lastTick = 0;
  let currentBpm = tempoMap[0]?.bpm || 120;
  
  for (const tempo of tempoMap) {
    if (tempo.tick > tick) break;
    const ticksElapsed = tempo.tick - lastTick;
    seconds += (ticksElapsed / ticksPerBeat) * (60 / currentBpm);
    lastTick = tempo.tick;
    currentBpm = tempo.bpm;
  }
  
  const remainingTicks = tick - lastTick;
  seconds += (remainingTicks / ticksPerBeat) * (60 / currentBpm);
  return seconds;
}

export function secondsToTick(seconds: number, tempoMap: TempoEvent[], ticksPerBeat: number): number {
  let accumulatedSeconds = 0;
  let lastTick = 0;
  let currentBpm = tempoMap[0]?.bpm || 120;
  
  for (const tempo of tempoMap) {
    const ticksElapsed = tempo.tick - lastTick;
    const secondsForSegment = (ticksElapsed / ticksPerBeat) * (60 / currentBpm);
    
    if (accumulatedSeconds + secondsForSegment > seconds) {
      const remainingSeconds = seconds - accumulatedSeconds;
      return lastTick + Math.round((remainingSeconds / (60 / currentBpm)) * ticksPerBeat);
    }
    
    accumulatedSeconds += secondsForSegment;
    lastTick = tempo.tick;
    currentBpm = tempo.bpm;
  }
  
  const remainingSeconds = seconds - accumulatedSeconds;
  return lastTick + Math.round((remainingSeconds / (60 / currentBpm)) * ticksPerBeat);
}

export function getBarForTick(tick: number, timeSignatures: TimeSignatureEvent[], ticksPerBeat: number): { bar: number; positionInBar: Rational } {
  let currentTick = 0;
  let bar = 1;
  let currentNum = 4;
  let currentDen = 4;
  
  const sortedSigs = [...timeSignatures].sort((a, b) => a.tick - b.tick);
  
  for (let i = 0; i < sortedSigs.length; i++) {
    const sig = sortedSigs[i];
    const nextSigTick = i + 1 < sortedSigs.length ? sortedSigs[i + 1].tick : Infinity;
    
    const beatsPerBar = currentNum;
    const ticksPerBar = beatsPerBar * ticksPerBeat;
    
    if (tick < sig.tick) break;
    
    if (sig.tick >= currentTick) {
      const ticksInSegment = Math.min(tick, nextSigTick) - sig.tick;
      const barsInSegment = Math.floor(ticksInSegment / ticksPerBar);
      
      if (tick < nextSigTick) {
        const posInBar = tick - (sig.tick + barsInSegment * ticksPerBar);
        return { bar: bar + barsInSegment, positionInBar: rational(posInBar, ticksPerBeat) };
      }
      
      bar += barsInSegment;
      currentTick = sig.tick;
    }
    
    currentNum = sig.numerator;
    currentDen = sig.denominator;
  }
  
  // Default calculation
  const beatsPerBar = currentNum;
  const ticksPerBar = beatsPerBar * ticksPerBeat;
  const adjustedTick = tick - currentTick;
  const barsFromCurrent = Math.floor(adjustedTick / ticksPerBar);
  const posInBar = adjustedTick - barsFromCurrent * ticksPerBar;
  
  return { bar: bar + barsFromCurrent, positionInBar: rational(posInBar, ticksPerBeat) };
}

export function getGridPositions(_bar: number, timeSignatures: TimeSignatureEvent[], ticksPerBeat: number, gridDivision: number): number[] {
  // Find time signature for this bar
  let num = 4;
  let ticksPerBar = 4 * ticksPerBeat;
  
  for (const sig of timeSignatures) {
    num = sig.numerator;
    ticksPerBar = num * ticksPerBeat;
  }
  
  const positions: number[] = [];
  const gridTicks = (ticksPerBeat * 4) / gridDivision; // gridTicks per grid unit
  
  for (let i = 0; i < num * (gridDivision / 4); i++) {
    positions.push(i * gridTicks);
  }
  
  return positions;
}
