// Эффекты синтезируются в браузере (Web Audio); музыка — два локальных файла (фон города и трек DJ-пульта).
// Запускается только после действия пользователя и возобновляется при возвращении в приложение.
export type Sfx = 'boing' | 'squeak' | 'beep' | 'vroom' | 'whoosh' | 'clink' | 'scrub' | 'gulp' | 'pour' | 'pop' | 'put' | 'munch' | 'sparkle' | 'door' | 'water' | 'sleep' | 'nope' | 'gift' | 'click' | 'pet' | 'cook' | 'light';

const NOTES = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];

/**
 * Зацикленный трек из локального файла. Следующий круг запускается точно по часам аудиоконтекста и внахлёст:
 * хвост прошлого круга дозвучивает под началом нового, поэтому на стыке нет ни щелчка, ни паузы.
 */
class LoopTrack {
  private buffer: AudioBuffer | null = null;
  private loading: Promise<void> | null = null;
  private live: { src: AudioBufferSourceNode; at: number }[] = [];
  private gain: GainNode;
  private nextAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** позиция в круге, с которой продолжить после паузы (секунды) */
  private resumeAt = 0;
  private want = false;
  private token = 0;
  playing = false;
  /** сколько раз трек запускался — для проверок «только одна копия» */
  starts = 0;
  constructor(private ctx: AudioContext, out: AudioNode, private url: string, private offset: number, private period: number, private level: number) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(out);
  }
  get loaded() { return !!this.buffer; }
  get sources() { return this.live.length; }
  load(): Promise<void> {
    this.loading ??= fetch(this.url).then((r) => { if (!r.ok) throw new Error('no music'); return r.arrayBuffer(); }).then((b) => this.ctx.decodeAudioData(b)).then((buf) => { this.buffer = buf; }).catch(() => { this.loading = null; });
    return this.loading;
  }
  /** Запуск (или продолжение с места паузы, если fromStart = false). Повторный вызов ничего не дублирует. */
  play(fromStart: boolean, fadeIn = 0.6) {
    this.want = true;
    const token = ++this.token;
    if (fromStart) this.resumeAt = 0;
    void this.load().then(() => {
      if (!this.buffer || token !== this.token || !this.want || this.playing) return;
      this.playing = true;
      this.starts++;
      const now = this.ctx.currentTime + 0.05;
      const pos = this.resumeAt % this.period;
      this.spawn(now, this.offset + pos);
      this.nextAt = now + (this.period - pos);
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setValueAtTime(0, now);
      this.gain.gain.linearRampToValueAtTime(this.level, now + fadeIn);
      this.timer = setInterval(() => { if (this.ctx.currentTime > this.nextAt - 1.2) { this.spawn(this.nextAt, this.offset); this.nextAt += this.period; } }, 300);
    });
  }
  private spawn(at: number, from: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gain);
    src.start(at, from);
    const rec = { src, at: at - (from - this.offset) };
    this.live.push(rec);
    src.onended = () => { this.live = this.live.filter((x) => x !== rec); };
  }
  /** Плавная остановка; позиция запоминается, чтобы фон продолжился с того же места. */
  pause(fade = 0.8) {
    this.want = false;
    this.token++;
    if (!this.playing) return;
    this.playing = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    const now = this.ctx.currentTime;
    const cur = this.live[this.live.length - 1];
    if (cur) this.resumeAt = Math.max(0, now - cur.at) % this.period;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(0, now + fade);
    for (const x of this.live) { try { x.src.stop(now + fade + 0.05); } catch { /* уже остановлен */ } }
  }
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  voiceGain: GainNode | null = null;
  private ducked = false;
  /** вызывается один раз, когда звук разблокирован действием пользователя */
  onUnlock: (() => void) | null = null;
  private town: LoopTrack | null = null;
  private clubTrack: LoopTrack | null = null;
  private clubOn = false;
  private townWanted = false;
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
      const base = import.meta.env.BASE_URL;
      // фон: 20 тактов по 2,68 с; клубный трек: 32 такта по 2 с — круг ровно по тактам
      this.town = new LoopTrack(this.ctx, this.musicGain, `${base}assets/music/town.mp3`, 0.04, 53.57, 1);
      this.clubTrack = new LoopTrack(this.ctx, this.musicGain, `${base}assets/music/club.mp3`, 0.03, 64, 1.15);
      document.addEventListener('visibilitychange', () => { if (!this.ctx) return; if (document.hidden) void this.ctx.suspend(); else void this.ctx.resume(); });
      this.onUnlock?.();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
  configure(s: { music: number; sfx: number; mute: boolean }) { this.music = s.music; this.sfx = s.sfx; this.mute = s.mute; this.apply(); }
  private apply() {
    if (!this.ctx || !this.musicGain || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(this.mute ? 0 : this.music * (this.ducked ? 0.12 : 0.34), t, 0.18); // во время реплик музыка тише
    if (this.mute && this.clubOn) this.setClub(false);
    this.voiceGain?.gain.setTargetAtTime(this.mute ? 0 : Math.max(this.sfx, 0.4) * 0.9, t, 0.02);
    this.sfxGain.gain.setTargetAtTime(this.mute ? 0 : this.sfx * 0.3, t, 0.02);
  }

  get context() { return this.ctx; }
  get running() { return !!this.ctx && this.ctx.state === 'running' && !this.mute; }
  /** Пока герой говорит, музыка звучит тише. */
  duck(on: boolean) { this.ducked = on; this.apply(); }

  /** Фоновая музыка города: тихо после «Играть», по кругу; повторный вызов не перезапускает её с начала. */
  startTown() {
    this.townWanted = true;
    if (!this.clubOn) this.town?.play(false, 1.5);
  }
  /** Трек DJ-пульта: фон плавно уходит в тишину и потом продолжается с места паузы. Одновременно звучит одна копия. */
  setClub(on: boolean) {
    if (on === this.clubOn || !this.clubTrack) return;
    if (on && (this.mute || !this.ctx)) return;
    this.clubOn = on;
    if (on) { this.town?.pause(0.7); this.clubTrack.play(true, 0.4); }
    else { this.clubTrack.pause(0.9); if (this.townWanted) this.town?.play(false, 1.2); }
  }
  /** Заранее загрузить клубный трек (при входе в клуб), чтобы он включался сразу. */
  preloadClub() { void this.clubTrack?.load(); }
  /** Состояние музыки — для автоматических проверок. */
  musicState() {
    return { town: !!this.town?.playing, club: !!this.clubTrack?.playing, clubOn: this.clubOn, townSources: this.town?.sources ?? 0, clubSources: this.clubTrack?.sources ?? 0, clubStarts: this.clubTrack?.starts ?? 0, townStarts: this.town?.starts ?? 0, loaded: [!!this.town?.loaded, !!this.clubTrack?.loaded] };
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
      case 'boing': [0, 0.26, 0.5].forEach((d, i) => this.tone(300 - i * 40, t + d, 0.16, 'sine', out, 0.9 - i * 0.2, 160)); break;
      case 'squeak': this.tone(900, t, 0.1, 'square', out, 0.25, 1500); this.tone(1400, t + 0.14, 0.14, 'square', out, 0.25, 800); break;
      case 'beep': [660, 880, 660, 990].forEach((f, i) => this.tone(f, t + i * 0.12, 0.09, 'square', out, 0.22)); break;
      case 'vroom': this.tone(110, t, 0.9, 'sawtooth', out, 0.3, 240); this.noise(t, 0.9, 500, 0.15); break;
      case 'whoosh': this.noise(t, 0.9, 1400, 0.3); this.tone(300, t, 0.9, 'sine', out, 0.3, 1200); break;
      case 'clink': this.tone(1900, t, 0.12, 'triangle', out, 0.5); this.tone(2500, t + 0.03, 0.2, 'sine', out, 0.3); break;
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
