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
  constructor(name = 'gorodok-chudes') {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('kv'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
  }
  async get(key: string): Promise<string | undefined> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const r = db.transaction('kv', 'readonly').objectStore('kv').get(key);
      r.onsuccess = () => resolve(r.result as string | undefined);
      r.onerror = () => reject(r.error);
    });
  }
  set(key: string, value: string) { return this.setMany({ [key]: value }); }
  async setMany(entries: Record<string, string>): Promise<void> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      const os = tx.objectStore('kv');
      for (const [k, v] of Object.entries(entries)) os.put(v, k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('abort'));
    });
  }
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
