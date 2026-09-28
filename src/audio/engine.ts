// Motor de audio para reproducción MIDI usando Web Audio API
// Síntesis básica con osciladores y envolventes

import { MidiProject, MidiNote, tickToSeconds, TempoEvent } from '../midi/model';

// General MIDI instrument names (subset)
export const GM_INSTRUMENTS = [
  'Piano', 'Piano brillante', 'Piano eléctrico', 'Piano honky-tonk',
  'Piano eléctrico 1', 'Piano eléctrico 2', 'Clavecín', 'Clavicordio',
  'Celesta', 'Glockenspiel', 'Caja de música', 'Vibráfono',
  'Xilófono', 'Campanas', 'Dulcimer', 'Órgano',
  'Órgano percusivo', 'Órgano rock', 'Órgano iglesia', 'Armónico',
  'Armónica', 'Acordeón', 'Armónica', 'Guitarra acústica',
  'Guitarra eléctrica limpia', 'Guitarra eléctrica mordida', 'Guitarra eléctrica muted',
  'Overdrive', 'Distorsión', 'Armónicos guitarra', 'Bajo acústico',
  'Baso eléctrico dedo', 'Bajo eléctrico púa', 'Bajo sin trastes', 'Baso slap 1',
  'Basso slap 2', 'Bajo sintetizado', 'Violín', 'Violín',
  'Viola', 'Violonchelo', 'Contrabajo', 'Tremolo strings',
  'Pizzicato strings', 'Arpa', 'Timpani', 'Cuerdas 1',
  'Cuerdas 2', 'Sintetizador strings', 'Coro', 'Voces',
  'Voz oh', 'Voz solo', 'Trompeta', 'Trombón',
  'Tuba', 'Trompeta con sordina', 'Trompa', 'Sección de metales',
  'Sintetizador metales', 'Saxofón soprano', 'Saxofón alto', 'Saxofón tenor',
  'Saxofón barítono', 'Oboe', 'Corno inglés', 'Fagot',
  'Clarinete', 'Flautín', 'Flauta', 'Flauta de pico',
  'Flauta de pan', 'Botella soplando', 'Shakuhachi', 'Whistle',
  'Ocarina', 'Lead 1', 'Lead 2', 'Lead 3',
  'Lead 4', 'Lead 5', 'Lead 6', 'Lead 7',
  'Lead 8', 'Pad 1', 'Pad 2', 'Pad 3',
  'Pad 4', 'Pad 5', 'Pad 6', 'Pad 7',
  'Pad 8', 'FX 1', 'FX 2', 'FX 3',
  'FX 4', 'FX 5', 'FX 6', 'FX 7',
  'FX 8', 'Sitar', 'Banjo', 'Shamisen',
  'Koto', 'Kalimba', 'Gaita', 'Fiddle',
  'Shannai', 'Carillón', 'Agogô', 'Tambor de acero',
  'Woodblock', 'Taiko', 'Tom melódico', 'Redoblante sintetizado',
  'Platillo', 'Castañuelas', 'Surdo', 'Tom agudo'
];

interface ActiveVoice {
  oscillator: OscillatorNode;
  gainNode: GainNode;
  noteId: string;
  endTime: number;
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeVoices: Map<string, ActiveVoice> = new Map();
  private isPlaying = false;
  private startTime = 0;
  private pauseTime = 0;
  private project: MidiProject | null = null;
  private scheduledTimeouts: number[] = [];
  private onPositionChange?: (tick: number, seconds: number) => void;
  private positionInterval: number | null = null;
  private useCorrected = true;
  private loopStart: number | null = null;
  private loopEnd: number | null = null;

  async init(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  setProject(project: MidiProject): void {
    this.project = project;
  }

  setUseCorrected(useCorrected: boolean): void {
    this.useCorrected = useCorrected;
  }

  setLoop(startTick: number | null, endTick: number | null): void {
    this.loopStart = startTick;
    this.loopEnd = endTick;
  }

  setOnPositionChange(callback: (tick: number, seconds: number) => void): void {
    this.onPositionChange = callback;
  }

  setVolume(vol: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, vol));
    }
  }

  private getWaveformForProgram(program: number, isPercussion: boolean): OscillatorType {
    if (isPercussion) return 'triangle';
    if (program < 8) return 'triangle'; // Piano
    if (program < 16) return 'sine'; // Chromatic percussion
    if (program < 24) return 'sine'; // Organ
    if (program < 32) return 'triangle'; // Guitar
    if (program < 40) return 'sawtooth'; // Bass
    if (program < 48) return 'sawtooth'; // Strings
    if (program < 56) return 'sine'; // Ensemble
    if (program < 64) return 'square'; // Brass
    if (program < 72) return 'sawtooth'; // Reed
    if (program < 80) return 'sine'; // Pipe
    if (program < 88) return 'square'; // Synth lead
    if (program < 96) return 'sine'; // Synth pad
    return 'triangle';
  }

  private getFrequencyForPitch(pitch: number): number {
    return 440 * Math.pow(2, (pitch - 69) / 12);
  }

  private getFrequencyForPercussion(pitch: number): number {
    // Approximate frequencies for GM percussion
    const percFreqs: Record<number, number> = {
      35: 60, 36: 80, 37: 200, 38: 180, 39: 300, 40: 250,
      41: 100, 42: 800, 43: 120, 44: 900, 45: 150, 46: 1000,
      47: 170, 48: 200, 49: 500, 50: 250, 51: 400, 52: 600,
      53: 550, 54: 300, 55: 450, 56: 350, 57: 700, 58: 500,
      59: 600, 60: 250, 61: 350, 62: 200, 63: 300, 64: 400,
      65: 250, 66: 300, 67: 350, 68: 400, 69: 500, 70: 300,
      71: 350, 72: 400, 73: 200, 74: 250, 75: 300, 76: 350,
      77: 200, 78: 250, 79: 300, 80: 350, 81: 400
    };
    return percFreqs[pitch] || 200;
  }

  private playNote(note: MidiNote, startSec: number, durationSec: number): void {
    if (!this.context || !this.masterGain) return;
    
    const track = this.project?.tracks[note.trackIndex];
    if (!track) return;
    
    const now = this.context.currentTime;
    const audioStart = now + startSec;
    
    if (audioStart < now - 0.1) return; // Skip past notes
    
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    
    if (track.isPercussion) {
      osc.type = 'triangle';
      osc.frequency.value = this.getFrequencyForPercussion(note.pitch);
    } else {
      osc.type = this.getWaveformForProgram(track.program || 0, false);
      osc.frequency.value = this.getFrequencyForPitch(note.pitch);
    }
    
    // ADSR envelope
    const velocity = note.velocity / 127;
    const attackTime = track.isPercussion ? 0.001 : 0.01;
    const decayTime = track.isPercussion ? 0.05 : 0.1;
    const sustainLevel = track.isPercussion ? 0 : velocity * 0.6;
    const releaseTime = track.isPercussion ? 0.1 : 0.05;
    
    gain.gain.setValueAtTime(0, audioStart);
    gain.gain.linearRampToValueAtTime(velocity * 0.3, audioStart + attackTime);
    gain.gain.linearRampToValueAtTime(sustainLevel * 0.3, audioStart + attackTime + decayTime);
    gain.gain.setValueAtTime(sustainLevel * 0.3, audioStart + durationSec - releaseTime);
    gain.gain.linearRampToValueAtTime(0, audioStart + durationSec);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(audioStart);
    osc.stop(audioStart + durationSec + 0.01);
    
    const voiceId = `${note.id}_${startSec}`;
    this.activeVoices.set(voiceId, {
      oscillator: osc,
      gainNode: gain,
      noteId: note.id,
      endTime: audioStart + durationSec
    });
    
    // Cleanup
    const cleanupDelay = (durationSec + 0.1) * 1000;
    const timeout = window.setTimeout(() => {
      this.activeVoices.delete(voiceId);
    }, cleanupDelay);
    this.scheduledTimeouts.push(timeout);
  }

  async play(startTick: number = 0): Promise<void> {
    if (!this.project) return;
    await this.init();
    
    this.stop();
    this.isPlaying = true;
    
    const project = this.project;
    const startSeconds = tickToSeconds(startTick, project.tempoMap, project.ticksPerBeat);
    
    this.startTime = this.context!.currentTime - startSeconds;
    this.pauseTime = startSeconds;
    
    // Schedule all notes
    for (const track of project.tracks) {
      for (const note of track.notes) {
        const noteStartTick = this.useCorrected ? note.correctedStartTick : note.startTick;
        const noteEndTick = this.useCorrected ? note.correctedEndTick : note.endTick;
        
        if (noteStartTick < startTick) continue;
        
        // Check loop bounds
        if (this.loopEnd !== null && noteStartTick > this.loopEnd) continue;
        if (this.loopStart !== null && noteStartTick < this.loopStart && noteEndTick < this.loopStart) continue;
        
        const startSec = tickToSeconds(noteStartTick, project.tempoMap, project.ticksPerBeat) - startSeconds;
        const endSec = tickToSeconds(noteEndTick, project.tempoMap, project.ticksPerBeat) - startSeconds;
        const durationSec = Math.max(0.01, endSec - startSec);
        
        // Limit scheduling to reasonable range (30 seconds ahead)
        if (startSec > 30) continue;
        
        this.playNote(note, startSec, durationSec);
      }
    }
    
    // Position tracking
    this.positionInterval = window.setInterval(() => {
      if (!this.isPlaying || !this.context) return;
      const currentSec = this.context.currentTime - this.startTime;
      const currentTick = this.secondsToTickApprox(currentSec + startSeconds);
      
      // Check loop
      if (this.loopEnd !== null && currentTick >= this.loopEnd) {
        if (this.loopStart !== null) {
          this.play(this.loopStart);
          return;
        }
      }
      
      // Check end
      if (currentTick >= project.totalTicks) {
        this.stop();
        return;
      }
      
      if (this.onPositionChange) {
        this.onPositionChange(currentTick, currentSec);
      }
    }, 50);
  }

  private secondsToTickApprox(seconds: number): number {
    if (!this.project) return 0;
    const tempoMap = this.project.tempoMap;
    const tpb = this.project.ticksPerBeat;
    
    let accumulatedSeconds = 0;
    let lastTick = 0;
    let currentBpm = tempoMap[0]?.bpm || 120;
    
    for (const tempo of tempoMap) {
      const ticksElapsed = tempo.tick - lastTick;
      const secondsForSegment = (ticksElapsed / tpb) * (60 / currentBpm);
      
      if (accumulatedSeconds + secondsForSegment > seconds) {
        const remainingSeconds = seconds - accumulatedSeconds;
        return lastTick + Math.round((remainingSeconds / (60 / currentBpm)) * tpb);
      }
      
      accumulatedSeconds += secondsForSegment;
      lastTick = tempo.tick;
      currentBpm = tempo.bpm;
    }
    
    const remainingSeconds = seconds - accumulatedSeconds;
    return lastTick + Math.round((remainingSeconds / (60 / currentBpm)) * tpb);
  }

  stop(): void {
    this.isPlaying = false;
    
    // Stop all active voices
    if (this.context) {
      for (const voice of this.activeVoices.values()) {
        try {
          voice.gainNode.gain.cancelScheduledValues(this.context.currentTime);
          voice.gainNode.gain.setValueAtTime(0, this.context.currentTime);
          voice.oscillator.stop(this.context.currentTime + 0.01);
        } catch (e) {
          // Ignore
        }
      }
    }
    this.activeVoices.clear();
    
    // Clear timeouts
    for (const t of this.scheduledTimeouts) {
      clearTimeout(t);
    }
    this.scheduledTimeouts = [];
    
    // Clear position interval
    if (this.positionInterval !== null) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }
  }

  pause(): void {
    if (this.isPlaying) {
      if (this.context) {
        this.pauseTime = this.context.currentTime - this.startTime;
      }
      this.stop();
    }
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  getCurrentPosition(): number {
    if (!this.context || !this.isPlaying) return this.pauseTime;
    return this.context.currentTime - this.startTime;
  }

  destroy(): void {
    this.stop();
    if (this.context) {
      this.context.close();
      this.context = null;
    }
  }
}

// Singleton
export const audioEngine = new AudioEngine();
