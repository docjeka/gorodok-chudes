// Управление пальцем, мышью и стилусом через Pointer Events. Один активный перенос; второй палец ничего не крадёт.
import type { Pt } from '../game/types';
import type { Play, Target } from './play';
import type { Scene } from './scene';

const DRAG_THRESHOLD = 9; // CSS px: нажатие не должно случайно двигать вещи

interface Press { pointerId: number; target: Target | null; startX: number; startY: number; lastX: number; grab: Pt; dragging: boolean; panning: boolean }

export class Input {
  private press: Press | null = null;
  /** Вызывается, когда предмет отпущен над элементом интерфейса с data-drop (например, сумка). Возвращает true, если принял. */
  onDropUi: (el: HTMLElement, t: Target) => boolean = () => false;

  constructor(private scene: Scene, private play: Play) {
    const cv = scene.app.canvas;
    cv.addEventListener('pointerdown', (e) => this.down(e));
    cv.addEventListener('pointermove', (e) => this.move(e));
    cv.addEventListener('pointerup', (e) => this.up(e));
    cv.addEventListener('pointercancel', (e) => { if (this.press?.pointerId === e.pointerId) this.cancel(); });
    cv.addEventListener('lostpointercapture', (e) => { if (this.press?.pointerId === e.pointerId && this.press.dragging) this.cancel(); });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('dragstart', (e) => e.preventDefault());
    // сворачивание приложения, смена ориентации, потеря фокуса — перенос завершается безопасно
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancel(); });
    window.addEventListener('blur', () => this.cancel());
    window.addEventListener('orientationchange', () => this.cancel());
    window.addEventListener('resize', () => this.cancel());
  }

  get busy() { return !!this.press?.dragging; }

  private down(e: PointerEvent) {
    if (this.press) return; // второй палец игнорируется
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const pt = this.scene.toRoom(e.clientX, e.clientY);
    const hit = this.scene.pick(pt);
    const target: Target | null = hit ? { kind: hit.kind === 'front' ? 'furn' : hit.kind, ref: hit.ref } : null;
    const pos = target ? this.scene.nodePos(target.ref) : null;
    this.press = { pointerId: e.pointerId, target, startX: e.clientX, startY: e.clientY, lastX: e.clientX, grab: pos ? { x: pos.x - pt.x, y: pos.y - pt.y } : { x: 0, y: 0 }, dragging: false, panning: false };
    try { this.scene.app.canvas.setPointerCapture(e.pointerId); } catch { /* не критично */ }
    e.preventDefault();
  }

  private move(e: PointerEvent) {
    const p = this.press;
    if (!p || p.pointerId !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
    if (!p.dragging && !p.panning && moved > DRAG_THRESHOLD) {
      if (p.target && this.play.canDrag(p.target)) { p.dragging = true; this.scene.dragStart(p.target.ref); }
      else p.panning = true;
    }
    if (p.dragging && p.target) {
      const pt = this.scene.toRoom(e.clientX, e.clientY);
      const at = { x: pt.x + p.grab.x, y: pt.y + p.grab.y - 14 }; // чуть приподнят над пальцем
      this.scene.dragMove(p.target.ref, at);
      this.play.preview(p.target, this.dropPoint(p.target, at));
    } else if (p.panning) {
      this.scene.panBy(e.clientX - p.lastX);
    }
    p.lastX = e.clientX;
  }

  /** Цель выбирается по видимому положению объекта, а не по кончику пальца. */
  private dropPoint(t: Target, at: Pt): Pt {
    if (t.kind === 'item') return { x: at.x, y: at.y - 22 };
    if (t.kind === 'char') return { x: at.x, y: at.y - 110 }; // середина тела героя
    return at;
  }

  private up(e: PointerEvent) {
    const p = this.press;
    if (!p || p.pointerId !== e.pointerId) return;
    this.press = null;
    try { this.scene.app.canvas.releasePointerCapture(e.pointerId); } catch { /* уже отпущен */ }
    const pt = this.scene.toRoom(e.clientX, e.clientY);
    if (p.dragging && p.target) {
      const at = { x: pt.x + p.grab.x, y: pt.y + p.grab.y - 14 };
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-drop]');
      this.scene.dragging = null;
      this.scene.setHighlight(null);
      if (!(el && this.onDropUi(el, p.target))) this.play.drop(p.target, this.dropPoint(p.target, at));
      this.scene.dragEnd();
    } else if (!p.panning) {
      this.play.tap(p.target, pt);
    }
  }

  /** Отмена: объект возвращается в последнее сохранённое место, ничего не теряется и не дублируется. */
  cancel() {
    const p = this.press;
    if (!p) return;
    this.press = null;
    try { this.scene.app.canvas.releasePointerCapture(p.pointerId); } catch { /* уже отпущен */ }
    if (p.dragging) this.scene.dragEnd();
  }
}
