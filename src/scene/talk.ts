// Реплики героев: кто говорит, какую фразу, когда можно повторить. Одновременно звучит только один голос.
// Звук — заранее подготовленные локальные файлы (assets/voice), без микрофона и сетевых сервисов.
import type { GameAudio } from '../audio/audio';
import { LINES, type Line, type LineEvent } from '../content/lines';
import durations from '../content/voiceDurations.json';
import { charPos } from '../game/geometry';
import type { Game } from '../game/game';
import { getLang } from '../i18n';
import type { Scene } from './scene';

const BASE = import.meta.env.BASE_URL;
const DUR = durations as Record<string, number>;
/** У каждого героя свой тон голоса: одна запись проигрывается с разной скоростью. */
const RATE: Record<string, number> = { hero_mila: 1.2, hero_timur: 1.06, hero_asya: 1.15, hero_lev: 1.1, hero_nora: 1.18, hero_yuki: 1.13 };
/** Чей голос у героя: папки assets/voice/girl и assets/voice/boy. Свой тон героя — небольшое изменение скорости. */
export const VOICE_OF: Record<string, 'girl' | 'boy'> = { hero_mila: 'girl', hero_asya: 'girl', hero_nora: 'girl', hero_yuki: 'girl', hero_timur: 'boy', hero_lev: 'boy' };
declare const __VOICE_SETS__: string[] | undefined;
const VOICE_SETS: string[] = typeof __VOICE_SETS__ === 'undefined' ? [] : __VOICE_SETS__;
const OWN_RATE: Record<string, number> = { hero_mila: 1.03, hero_asya: 0.97, hero_nora: 1.06, hero_yuki: 1, hero_timur: 1, hero_lev: 1.05 };
const EVENT_COOLDOWN = 3500; // пауза перед повтором той же реакции у того же героя
const PAIR_COOLDOWN = 8000; // пауза перед новым разговором той же пары
const GAP = 280; // тишина между репликами

export interface TalkUi { showBubble(heroId: string, text: string): void; hideBubble(): void }
export interface SpokenLine { heroId: string; lineId: string; event: LineEvent; start: number; end: number; audio: boolean }

export class Talk {
  /** журнал сказанного — для проверки, что реплики не накладываются и не повторяются сами */
  log: SpokenLine[] = [];
  private buffers = new Map<string, AudioBuffer>();
  private loading = false;
  private current: { heroId: string; until: number; source: AudioBufferSourceNode | null; timer: number } | null = null;
  private queue: { heroId: string; event: LineEvent }[] = [];
  private lastByEvent = new Map<LineEvent, string>();
  private cooldown = new Map<string, number>();
  private pending: number[] = [];
  private pairKey: string | null = null;

  constructor(private game: Game, private scene: Scene, private audio: GameAudio, private ui: TalkUi) {
    audio.onUnlock = () => void this.preload();
  }

  get speaking(): string | null { return this.current?.heroId ?? null; }
  get loaded(): number { return this.buffers.size; }

  /** Все реплики загружаются и декодируются заранее; после установки файлы берутся из кэша сервис-воркера. */
  async preload() {
    const ctx = this.audio.context;
    if (!ctx || this.loading) return;
    this.loading = true;
    const load = async (key: string, path: string) => {
      try {
        const res = await fetch(`${BASE}assets/voice/${path}.mp3`);
        if (!res.ok || !(res.headers.get('content-type') ?? 'audio').includes('audio')) return;
        this.buffers.set(key, await ctx.decodeAudioData(await res.arrayBuffer()));
      } catch { /* без файла реплика покажется только текстом */ }
    };
    // общий набор и отдельные папки для девочек и мальчиков (если их нет — звучит общий)
    await Promise.all(LINES.filter((l) => !l.text).flatMap((l) => [load(l.id, l.id), ...VOICE_SETS.map((g) => load(`${g}/${l.id}`, `${g}/${l.id}`))]));
  }

  private pick(event: LineEvent): Line {
    const all = LINES.filter((l) => l.event === event);
    const last = this.lastByEvent.get(event);
    const pool = all.length > 1 ? all.filter((l) => l.id !== last) : all; // не та же фраза два раза подряд
    const line = pool[Math.floor(Math.random() * pool.length)];
    this.lastByEvent.set(event, line.id);
    return line;
  }

  /**
   * Герой говорит реплику. Возвращает false, если сейчас кто-то говорит или ещё не прошла пауза.
   * delay — задержка, чтобы голос не совпал со звуком самого действия.
   */
  say(heroId: string, event: LineEvent, delay = 0): boolean {
    const now = performance.now();
    const key = `${heroId}:${event}`;
    if (this.current || this.queue.length || this.pending.length) return false;
    if ((this.cooldown.get(key) ?? 0) > now) return false;
    this.cooldown.set(key, now + delay + EVENT_COOLDOWN);
    if (delay > 0) { const id = window.setTimeout(() => { this.pending = this.pending.filter((x) => x !== id); if (!this.current) this.start(heroId, event); }, delay); this.pending.push(id); }
    else this.start(heroId, event);
    return true;
  }

  /** Два героя по очереди говорят по одной фразе. Запускается только действием игрока (отпустил героя рядом). */
  dialogue(a: string, b: string): boolean {
    const now = performance.now();
    const pair = 'pair:' + [a, b].sort().join('+');
    if (this.current || this.queue.length || this.pending.length) return false;
    if ((this.cooldown.get(pair) ?? 0) > now) return false;
    this.cooldown.set(pair, now + 60_000); // точная пауза отсчитывается от конца разговора
    this.pairKey = pair;
    this.queue.push({ heroId: b, event: 'reply' });
    this.start(a, 'hello');
    return true;
  }

  private start(heroId: string, event: LineEvent) {
    const w = this.game.world;
    const c = w.characters[heroId];
    if (!c || c.roomId !== w.currentRoomId || c.pose === 'sleeping') { this.next(); return; }
    const line = this.pick(event);
    const own = this.buffers.get(`${VOICE_OF[heroId]}/${line.id}`); // запись из папки девочек или мальчиков
    const rate = own ? OWN_RATE[heroId] ?? 1 : RATE[heroId] ?? 1.14;
    const lang = getLang();
    const buf = own ?? this.buffers.get(line.id);
    const ctx = this.audio.context;
    // голос звучит, только если голоса включены, звук не выключен и язык русский (английской озвучки пока нет)
    const withAudio = !!buf && !!ctx && this.audio.running && w.settings.voices !== false && lang === 'ru';
    let source: AudioBufferSourceNode | null = null;
    const seconds = withAudio ? buf.duration / rate : Math.max(1.3, (DUR[line.id] ?? 1.6) / rate);
    if (withAudio && this.audio.voiceGain) {
      source = ctx.createBufferSource();
      source.buffer = buf;
      source.playbackRate.value = rate;
      source.connect(this.audio.voiceGain);
      source.start();
      this.audio.duck(true);
    }
    const now = performance.now();
    const ms = seconds * 1000 + 150;
    this.log.push({ heroId, lineId: line.id, event, start: now, end: now + ms, audio: withAudio });
    if (this.log.length > 60) this.log.shift();
    this.ui.showBubble(heroId, lang === 'en' ? line.en : line.ru);
    this.scene.setTalking(heroId, true);
    const timer = window.setTimeout(() => this.finish(), ms);
    this.current = { heroId, until: now + ms, source, timer };
  }

  private finish() {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    this.scene.setTalking(cur.heroId, false);
    this.ui.hideBubble();
    this.audio.duck(false);
    // паузы перед повтором отсчитываются от конца реплики, а не от её начала
    const said = this.log[this.log.length - 1];
    if (said) this.cooldown.set(`${said.heroId}:${said.event}`, performance.now() + EVENT_COOLDOWN);
    this.next();
  }
  private next() {
    const q = this.queue.shift();
    if (!q) { if (this.pairKey) { this.cooldown.set(this.pairKey, performance.now() + PAIR_COOLDOWN); this.pairKey = null; } return; }
    const id = window.setTimeout(() => { this.pending = this.pending.filter((x) => x !== id); this.start(q.heroId, q.event); }, GAP);
    this.pending.push(id);
  }

  /** Немедленно замолчать: переход в другую комнату, выключение голосов, сворачивание приложения. */
  stop() {
    for (const id of this.pending) clearTimeout(id);
    this.pending = [];
    this.queue = [];
    if (this.pairKey) { this.cooldown.set(this.pairKey, performance.now() + PAIR_COOLDOWN); this.pairKey = null; }
    const cur = this.current;
    if (!cur) return;
    clearTimeout(cur.timer);
    try { cur.source?.stop(); } catch { /* уже остановлен */ }
    const entry = this.log[this.log.length - 1];
    if (entry) entry.end = Math.min(entry.end, performance.now());
    this.current = null;
    this.scene.setTalking(cur.heroId, false);
    this.ui.hideBubble();
    this.audio.duck(false);
  }

  /** Есть ли рядом другой бодрствующий герой — для разговора после отпускания. */
  neighbour(heroId: string): string | null {
    const w = this.game.world;
    const me = w.characters[heroId];
    if (!me || !me.roomId) return null;
    const p = charPos(w, me);
    let best: { id: string; d: number } | null = null;
    for (const c of Object.values(w.characters)) {
      if (c.id === heroId || c.roomId !== me.roomId || c.pose === 'sleeping') continue;
      const q = charPos(w, c);
      const dx = Math.abs(q.x - p.x), dy = Math.abs(q.y - p.y);
      if (dx < 200 && dy < 150 && (!best || dx + dy < best.d)) best = { id: c.id, d: dx + dy };
    }
    return best?.id ?? null;
  }
}
