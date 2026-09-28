// Metrónomo usando Web Audio API

export class Metronome {
  private context: AudioContext | null = null;
  private isPlaying = false;
  private bpm = 120;
  private timeSignature = { numerator: 4, denominator: 4 };
  private nextNoteTime = 0;
  private currentBeat = 0;
  private timerID: number | null = null;
  private lookahead = 25.0; // ms
  private scheduleAheadTime = 0.1; // seconds
  
  async init(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
    }
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  setBPM(bpm: number): void {
    this.bpm = Math.max(20, Math.min(300, bpm));
  }

  setTimeSignature(numerator: number, denominator: number): void {
    this.timeSignature = { numerator, denominator };
  }

  async start(): Promise<void> {
    await this.init();
    if (this.isPlaying) return;
    
    this.isPlaying = true;
    this.currentBeat = 0;
    this.nextNoteTime = this.context!.currentTime + 0.05;
    this.scheduler();
  }

  stop(): void {
    this.isPlaying = false;
    if (this.timerID !== null) {
      clearTimeout(this.timerID);
      this.timerID = null;
    }
  }

  private scheduler(): void {
    if (!this.isPlaying || !this.context) return;
    
    while (this.nextNoteTime < this.context.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.currentBeat, this.nextNoteTime);
      this.advance();
    }
    
    this.timerID = window.setTimeout(() => this.scheduler(), this.lookahead);
  }

  private scheduleNote(beatNumber: number, time: number): void {
    if (!this.context) return;
    
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    
    if (beatNumber === 0) {
      // Downbeat - higher pitch
      osc.frequency.value = 1000;
      gain.gain.value = 0.3;
    } else {
      osc.frequency.value = 800;
      gain.gain.value = 0.15;
    }
    
    osc.connect(gain);
    gain.connect(this.context.destination);
    
    osc.start(time);
    osc.stop(time + 0.03);
    
    gain.gain.setValueAtTime(gain.gain.value, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
  }

  private advance(): void {
    const secondsPerBeat = 60.0 / this.bpm;
    this.nextNoteTime += secondsPerBeat;
    this.currentBeat++;
    if (this.currentBeat === this.timeSignature.numerator) {
      this.currentBeat = 0;
    }
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  destroy(): void {
    this.stop();
    if (this.context) {
      this.context.close();
      this.context = null;
    }
  }
}

export const metronome = new Metronome();
