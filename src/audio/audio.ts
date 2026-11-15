// Звук целиком синтезируется в браузере (Web Audio): файлов и сторонних лицензий нет.
// Запускается только после действия пользователя и возобновляется при возвращении в приложение.
export type Sfx = 'scrub' | 'gulp' | 'pour' | 'pop' | 'put' | 'munch' | 'sparkle' | 'door' | 'water' | 'sleep' | 'nope' | 'gift' | 'click' | 'pet' | 'cook' | 'light';

const NOTES = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
// спокойная зацикленная мелодия: индексы нот, -1 — пауза
const TUNE = [0, 2, 4, 2, 3, 4, 5, -1, 4, 2, 3, 1, 2, 0, 1, -1, 0, 2, 4, 5, 6, 5, 4, -1, 3, 4, 2, 1, 0, 1, 0, -1];

export class GameAudio {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  voiceGain: GainNode | null = null;
  private ducked = false;
  /** вызывается один раз, когда звук разблокирован действием пользователя */
  onUnlock: (() => void) | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  music = 0.5;
  sfx = 0.8;
  mute = false;

  /** Вызывать из обработчика нажатия. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.ctx.destination);
      this.sfxGain.connect(this.ctx.destination);
      this.voiceGain = this.ctx.createGain();
      this.voiceGain.connect(this.ctx.destination);
      this.apply();
      this.nextTime = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 200);
      document.addEventListener('visibilitychange', () => { if (!this.ctx) return; if (document.hidden) void this.ctx.suspend(); else void this.ctx.resume(); });
      this.onUnlock?.();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
  configure(s: { music: number; sfx: number; mute: boolean }) { this.music = s.music; this.sfx = s.sfx; this.mute = s.mute; this.apply(); }
  private apply() {
    if (!this.ctx || !this.musicGain || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(this.mute ? 0 : this.music * (this.ducked ? 0.035 : 0.09), t, 0.08);
    this.voiceGain?.gain.setTargetAtTime(this.mute ? 0 : Math.max(this.sfx, 0.4) * 0.9, t, 0.02);
    this.sfxGain.gain.setTargetAtTime(this.mute ? 0 : this.sfx * 0.3, t, 0.02);
  }

  get context() { return this.ctx; }
  get running() { return !!this.ctx && this.ctx.state === 'running' && !this.mute; }
  /** Пока герой говорит, музыка звучит тише. */
  duck(on: boolean) { this.ducked = on; this.apply(); }

  /** Музыка планируется вперёд по часам аудиоконтекста — петля без щелчка на стыке. */
  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || ctx.state !== 'running') return;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.6) {
      const n = TUNE[this.step % TUNE.length];
      if (n >= 0) {
        this.tone(NOTES[n], this.nextTime, 0.5, 'sine', this.musicGain, 0.9);
        if (this.step % 4 === 0) this.tone(NOTES[n] / 2, this.nextTime, 0.9, 'triangle', this.musicGain, 0.5);
      }
      this.step++;
      this.nextTime += 0.42;
    }
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, out: AudioNode, vol = 1, slideTo?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(out);
    o.start(at); o.stop(at + dur + 0.05);
  }
  private noise(at: number, dur: number, freq: number, vol = 0.6) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.sfxGain!);
    src.start(at);
  }

  play(name: Sfx) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain || this.mute || ctx.state !== 'running') return;
    const t = ctx.currentTime, out = this.sfxGain;
    switch (name) {
      case 'pop': this.tone(520, t, 0.12, 'sine', out, 1, 780); break;
      case 'put': this.tone(300, t, 0.1, 'sine', out, 0.9, 200); break;
      case 'click': this.tone(660, t, 0.06, 'triangle', out, 0.6); break;
      case 'munch': this.noise(t, 0.09, 900); this.noise(t + 0.13, 0.09, 700); break;
      case 'scrub': [0, 0.16, 0.32, 0.48, 0.64, 0.8].forEach((d, i) => this.noise(t + d, 0.1, i % 2 ? 3200 : 2600, 0.35)); break;
      case 'gulp': [0, 0.22, 0.44].forEach((d) => this.tone(210, t + d, 0.13, 'sine', out, 0.9, 150)); break;
      case 'pour': this.noise(t, 0.55, 2400, 0.3); this.tone(520, t + 0.1, 0.4, 'sine', out, 0.25, 760); break;
      case 'sparkle': [0, 1, 2].forEach((i) => this.tone(880 + i * 220, t + i * 0.07, 0.18, 'sine', out, 0.6)); break;
      case 'door': this.tone(180, t, 0.16, 'triangle', out, 0.8, 240); break;
      case 'water': this.noise(t, 0.9, 1800, 0.35); break;
      case 'sleep': this.tone(392, t, 0.35, 'sine', out, 0.5, 262); break;
      case 'nope': this.tone(280, t, 0.14, 'sine', out, 0.5, 240); break;
      case 'gift': [0, 2, 4, 5].forEach((n, i) => this.tone(NOTES[n] * 2, t + i * 0.09, 0.22, 'triangle', out, 0.6)); break;
      case 'pet': this.tone(600, t, 0.1, 'sine', out, 0.6, 800); this.tone(800, t + 0.1, 0.12, 'sine', out, 0.5, 700); break;
      case 'cook': this.noise(t, 0.5, 2600, 0.3); this.tone(660, t + 0.45, 0.25, 'triangle', out, 0.6); break;
      case 'light': this.tone(900, t, 0.05, 'square', out, 0.25); break;
    }
  }
}
