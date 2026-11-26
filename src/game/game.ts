// Состояние игры в памяти: единственный мир, история для «отменить», подписчики и постановка в очередь сохранения.
import type { Saver } from '../storage/store';
import type { Result, World } from './types';

export class Game {
  private subs = new Set<(w: World) => void>();
  private undoStack: World[] = [];
  lastFail = '';
  constructor(public world: World, private saver: Saver) {}

  subscribe(fn: (w: World) => void) { this.subs.add(fn); return () => this.subs.delete(fn); }

  /** Принять результат правила. critical — сохранить немедленно (переход, переодевание, подарок). */
  commit(r: Result, critical = false): boolean {
    if (!r.ok) { this.lastFail = r.reason; return false; }
    this.undoStack.push(this.world);
    if (this.undoStack.length > 12) this.undoStack.shift();
    this.set(r.world, critical);
    return true;
  }
  /** Изменить мир функцией над копией (для составных действий — одна запись, одно сохранение). */
  update(fn: (w: World) => void, critical = false) {
    const w: World = JSON.parse(JSON.stringify(this.world));
    fn(w);
    this.commit({ ok: true, world: w }, critical);
  }
  /** Тихое изменение: в историю «отменить» не попадает (счётчик звёзд автошколы). */
  quiet(fn: (w: World) => void, critical = false) {
    const w: World = JSON.parse(JSON.stringify(this.world));
    fn(w);
    this.set(w, critical);
  }
  canUndo() { return this.undoStack.length > 0; }
  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.set({ ...prev, settings: this.world.settings, driving: this.world.driving }, true); // настройки и звёзды автошколы «отменить» не трогает
    return true;
  }
  replace(world: World) { this.undoStack = []; this.set(world, true); }
  private set(world: World, critical: boolean) {
    this.world = { ...world, revision: Math.max(world.revision, this.world.revision) + 1 };
    this.saver.schedule(this.world, critical);
    for (const fn of this.subs) fn(this.world);
  }
  flush() { return this.saver.flush(); }
}
