// Управление пальцем, мышью и стилусом через Pointer Events. Один активный перенос; второй палец ничего не крадёт.
import type { Pt } from '../game/types';
import type { Play, Target } from './play';
import type { Scene } from './scene';

const HOLD_MS = 420; // долгое нажатие на мебель поднимает её
const DRAG_THRESHOLD = 9; // CSS px: нажатие не должно случайно двигать вещи

interface Press { pointerId: number; target: Target | null; startX: number; startY: number; lastX: number; lastY: number; grab: Pt; dragging: boolean; panning: boolean }
interface Pinch { a: number; b: number; pa: Pt; pb: Pt; d0: number; z0: number; mid: Pt }

export class Input {
  private press: Press | null = null;
  private pinch: Pinch | null = null;
  private hold = 0;
  /** Жест масштаба закончился — можно запомнить новый масштаб. */
  onZoomEnd: (zoom: number) => void = () => undefined;
  /** Вызывается, когда предмет отпущен над элементом интерфейса с data-drop (например, сумка). Возвращает true, если принял. */
  onDropUi: (el: HTMLElement, t: Target) => boolean = () => false;

  constructor(private scene: Scene, private play: Play) {
    const cv = scene.app.canvas;
    cv.addEventListener('pointerdown', (e) => this.down(e));
    cv.addEventListener('pointermove', (e) => this.move(e));
    cv.addEventListener('pointerup', (e) => this.up(e));
    cv.addEventListener('pointercancel', (e) => { if (this.pinch || this.press?.pointerId === e.pointerId) this.cancel(); });
    cv.addEventListener('lostpointercapture', (e) => { if (this.press?.pointerId === e.pointerId && this.press.dragging) this.cancel(); });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.scene.setZoom(this.scene.zoom * (e.deltaY > 0 ? 0.9 : 1.1), { x: e.clientX, y: e.clientY }); this.onZoomEnd(this.scene.zoom); }, { passive: false });
    cv.addEventListener('dragstart', (e) => e.preventDefault());
    // сама страница не увеличивается щипком или двойным тапом (иначе панели уезжают за край экрана)
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    window.addEventListener('scroll', () => { if (window.scrollX || window.scrollY) window.scrollTo(0, 0); });
    // сворачивание приложения, смена ориентации, потеря фокуса — перенос завершается безопасно
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancel(); });
    window.addEventListener('blur', () => this.cancel());
    window.addEventListener('orientationchange', () => this.cancel());
    window.addEventListener('resize', () => this.cancel());
  }

  get busy() { return !!this.press?.dragging; }

  private down(e: PointerEvent) {
    if (this.pinch) return;
    if (this.press) {
      // второй палец: если сейчас ничего не тащат — это жест масштаба; во время переноса вещи он игнорируется
      if (!this.press.dragging && e.pointerType !== 'mouse') {
        const pa = { x: this.press.lastX, y: this.press.lastY }, pb = { x: e.clientX, y: e.clientY };
        this.pinch = { a: this.press.pointerId, b: e.pointerId, pa, pb, d0: Math.max(30, Math.hypot(pa.x - pb.x, pa.y - pb.y)), z0: this.scene.zoom, mid: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 } };
        this.press.panning = true; // нажатие больше не считается тапом
        try { this.scene.app.canvas.setPointerCapture(e.pointerId); } catch { /* не критично */ }
      }
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const pt = this.scene.toRoom(e.clientX, e.clientY);
    const hit = this.scene.pick(pt);
    const target: Target | null = hit ? { kind: hit.kind === 'front' ? 'furn' : hit.kind, ref: hit.ref } : null;
    const pos = target ? this.scene.nodePos(target.ref) : null;
    this.press = { pointerId: e.pointerId, target, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, grab: pos ? { x: pos.x - pt.x, y: pos.y - pt.y } : { x: 0, y: 0 }, dragging: false, panning: false };
    try { this.scene.app.canvas.setPointerCapture(e.pointerId); } catch { /* не критично */ }
    window.clearTimeout(this.hold);
    if (target && !this.play.canDrag(target) && this.play.canLift(target)) {
      const p = this.press;
      this.hold = window.setTimeout(() => {
        if (this.press !== p || p.dragging || p.panning || this.pinch) return;
        p.dragging = true;
        this.play.lifted(target);
        this.scene.dragStart(target.ref);
      }, HOLD_MS);
    }
    e.preventDefault();
  }

  private move(e: PointerEvent) {
    const z = this.pinch;
    if (z && (e.pointerId === z.a || e.pointerId === z.b)) {
      if (e.pointerId === z.a) z.pa = { x: e.clientX, y: e.clientY }; else z.pb = { x: e.clientX, y: e.clientY };
      const mid = { x: (z.pa.x + z.pb.x) / 2, y: (z.pa.y + z.pb.y) / 2 };
      this.scene.setZoom(z.z0 * (Math.hypot(z.pa.x - z.pb.x, z.pa.y - z.pb.y) / z.d0), mid);
      this.scene.panBy(mid.x - z.mid.x, mid.y - z.mid.y);
      z.mid = mid;
      return;
    }
    const p = this.press;
    if (!p || p.pointerId !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
    if (!p.dragging && !p.panning && moved > DRAG_THRESHOLD) {
      if (p.target && this.play.canDrag(p.target)) { p.dragging = true; this.scene.dragStart(p.target.ref); }
      else { p.panning = true; window.clearTimeout(this.hold); }
    }
    if (p.dragging && p.target) {
      const pt = this.scene.toRoom(e.clientX, e.clientY);
      const at = { x: pt.x + p.grab.x, y: pt.y + p.grab.y - 14 }; // чуть приподнят над пальцем
      this.scene.dragMove(p.target.ref, at);
      this.play.preview(p.target, this.dropPoint(p.target, at));
    } else if (p.panning) {
      this.scene.panBy(e.clientX - p.lastX, e.clientY - p.lastY);
    }
    p.lastX = e.clientX; p.lastY = e.clientY;
  }

  /** Цель выбирается по видимому положению объекта, а не по кончику пальца. */
  private dropPoint(t: Target, at: Pt): Pt {
    if (t.kind === 'item') return { x: at.x, y: at.y - 22 };
    if (t.kind === 'char') return { x: at.x, y: at.y - 110 }; // середина тела героя
    return at;
  }

  private endPinch() {
    if (!this.pinch) return;
    for (const id of [this.pinch.a, this.pinch.b]) { try { this.scene.app.canvas.releasePointerCapture(id); } catch { /* уже отпущен */ } }
    this.pinch = null;
    this.press = null;
    this.onZoomEnd(this.scene.zoom);
  }

  private up(e: PointerEvent) {
    if (this.pinch) { if (e.pointerId === this.pinch.a || e.pointerId === this.pinch.b) this.endPinch(); return; }
    const p = this.press;
    if (!p || p.pointerId !== e.pointerId) return;
    this.press = null;
    window.clearTimeout(this.hold);
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
    window.clearTimeout(this.hold);
    if (this.pinch) { this.endPinch(); return; }
    const p = this.press;
    if (!p) return;
    this.press = null;
    try { this.scene.app.canvas.releasePointerCapture(p.pointerId); } catch { /* уже отпущен */ }
    if (p.dragging) this.scene.dragEnd();
  }
}
