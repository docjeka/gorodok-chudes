// Сохранения: IndexedDB за интерфейсом KV (чтобы логику восстановления можно было тестировать без браузера).
import { parseWorld } from '../game/world';
import type { World } from '../game/types';

export interface KV {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  /** Атомарная запись нескольких ключей одной транзакцией. */
  setMany(entries: Record<string, string>): Promise<void>;
}

export class MemoryKV implements KV {
  data = new Map<string, string>();
  failWrites = false;
  async get(k: string) { return this.data.get(k); }
  async set(k: string, v: string) { if (this.failWrites) throw new DOMException('quota', 'QuotaExceededError'); this.data.set(k, v); }
  async setMany(e: Record<string, string>) { if (this.failWrites) throw new DOMException('quota', 'QuotaExceededError'); for (const [k, v] of Object.entries(e)) this.data.set(k, v); }
}

export class IdbKV implements KV {
  private db: Promise<IDBDatabase>;
  constructor(private name = 'gorodok-chudes') { this.db = this.connect(); }
  private connect(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('kv'); };
      req.onsuccess = () => {
        const db = req.result;
        // планшет мог закрыть соединение, пока игра была свёрнута: в следующий раз откроем заново
        db.onclose = () => { this.db = this.connect(); };
        db.onversionchange = () => { db.close(); this.db = this.connect(); };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
  }
  /** Одна попытка, при сбое — новое соединение и вторая попытка (на iPad соединение теряется после сворачивания). */
  private async run<T>(job: (db: IDBDatabase) => Promise<T>): Promise<T> {
    try { return await job(await this.db); }
    catch {
      try { (await this.db).close(); } catch { /* уже закрыто */ }
      this.db = this.connect();
      return job(await this.db);
    }
  }
  get(key: string): Promise<string | undefined> {
    return this.run((db) => new Promise((resolve, reject) => {
      const r = db.transaction('kv', 'readonly').objectStore('kv').get(key);
      r.onsuccess = () => resolve(r.result as string | undefined);
      r.onerror = () => reject(r.error);
    }));
  }
  set(key: string, value: string) { return this.setMany({ [key]: value }); }
  setMany(entries: Record<string, string>): Promise<void> {
    return this.run((db) => new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      const os = tx.objectStore('kv');
      for (const [k, v] of Object.entries(entries)) os.put(v, k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('abort'));
    }));
  }
}

const revisionOf = (text: string | undefined): number => { if (!text) return -1; try { return Number((JSON.parse(text) as { revision?: number }).revision) || 0; } catch { return -1; } };

/**
 * Запасное хранилище: если основное (IndexedDB) не записало, мир пишется во второе (localStorage).
 * При чтении берётся более свежая запись — по номеру revision.
 */
export class FallbackKV implements KV {
  /** последняя ошибка основного хранилища — для экрана родителей и отчётов */
  lastPrimaryError: unknown = null;
  constructor(private primary: KV, private spare: KV) {}
  async get(key: string): Promise<string | undefined> {
    let a: string | undefined, b: string | undefined;
    try { a = await this.primary.get(key); } catch (e) { this.lastPrimaryError = e; }
    try { b = await this.spare.get(key); } catch { /* запасного может не быть */ }
    if (a === undefined || b === undefined) return a ?? b;
    return revisionOf(b) > revisionOf(a) ? b : a;
  }
  set(key: string, value: string) { return this.setMany({ [key]: value }); }
  async setMany(entries: Record<string, string>): Promise<void> {
    try { await this.primary.setMany(entries); this.lastPrimaryError = null; }
    catch (e) { this.lastPrimaryError = e; await this.spare.setMany(entries); }
  }
}

/** localStorage как простое хранилище строк. */
export class LocalKV implements KV {
  constructor(private prefix = 'gorodok-chudes:') {}
  async get(key: string) { return localStorage.getItem(this.prefix + key) ?? undefined; }
  async set(key: string, value: string) { localStorage.setItem(this.prefix + key, value); }
  async setMany(entries: Record<string, string>) { for (const [k, v] of Object.entries(entries)) localStorage.setItem(this.prefix + k, v); }
}

export const K_WORLD = 'world';
export const K_BACKUP = 'backup';
export const K_QUARANTINE = 'quarantine';

export type LoadResult =
  | { status: 'ok'; world: World }
  | { status: 'empty' }
  /** основное сохранение повреждено; backup — исправная копия, если она есть */
  | { status: 'corrupt'; reason: string; backup: World | null };

/** Загрузка с проверкой. Исправный мир сразу становится резервной копией. Ничего не удаляется автоматически. */
export async function loadWorld(kv: KV): Promise<LoadResult> {
  const text = await kv.get(K_WORLD);
  if (text === undefined) {
    const b = await kv.get(K_BACKUP);
    const pb = b !== undefined ? parseWorld(b) : null;
    return pb?.ok ? { status: 'corrupt', reason: 'missing', backup: pb.world } : { status: 'empty' };
  }
  const parsed = parseWorld(text);
  if (parsed.ok) {
    try { await kv.set(K_BACKUP, JSON.stringify(parsed.world)); } catch { /* копия не обязательна для запуска */ }
    return { status: 'ok', world: parsed.world };
  }
  const b = await kv.get(K_BACKUP);
  const pb = b !== undefined ? parseWorld(b) : null;
  return { status: 'corrupt', reason: parsed.reason, backup: pb?.ok ? pb.world : null };
}

/** Старое повреждённое сохранение переносится в карантин, а не стирается. */
export async function quarantine(kv: KV): Promise<void> {
  const text = await kv.get(K_WORLD);
  if (text !== undefined) await kv.set(K_QUARANTINE, text);
}

export type SaveState = 'saved' | 'saving' | 'error';

/**
 * Очередь сохранений: debounce для серии действий, немедленная запись для критических.
 * Статус «сохранено» выставляется только после успешной транзакции.
 */
export class Saver {
  state: SaveState = 'saved';
  lastError: unknown = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: World | null = null;
  private writing: Promise<void> = Promise.resolve();
  private sinceBackup = 0;
  constructor(private kv: KV, private onState: (s: SaveState) => void, private delay = 400) {}

  schedule(world: World, critical = false) {
    this.pending = world;
    this.setState('saving');
    if (this.timer) clearTimeout(this.timer);
    if (critical) { void this.flush(); return; }
    this.timer = setTimeout(() => void this.flush(), this.delay);
  }

  flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.writing = this.writing.then(async () => {
      const w = this.pending;
      if (!w) return;
      this.pending = null;
      const text = JSON.stringify(w);
      try {
        this.sinceBackup++;
        if (this.sinceBackup >= 25) { await this.kv.setMany({ [K_WORLD]: text, [K_BACKUP]: text }); this.sinceBackup = 0; }
        else await this.kv.set(K_WORLD, text);
        this.lastError = null;
        if (!this.pending) this.setState('saved');
      } catch (e) {
        // вторая попытка чуть позже: чаще всего это разовый сбой после сворачивания игры
        try { await new Promise((r) => setTimeout(r, 250)); await this.kv.set(K_WORLD, text); this.lastError = null; if (!this.pending) this.setState('saved'); return; } catch { /* сообщим ниже */ }
        this.lastError = e;
        this.pending = this.pending ?? w; // мир остаётся в памяти, попробуем при следующем действии
        this.setState('error');
      }
    });
    return this.writing;
  }

  private setState(s: SaveState) { if (s !== this.state) { this.state = s; this.onState(s); } }
}

export function exportFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `gorodok-chudes-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}
