// Экран «Мой город»: две готовые картинки планеты — лицевая сторона с городом и обратная со свободными полянами.
// Свайп или стрелка плавно переключают стороны. Сохранения не трогает: это только навигация.
import { PLACES, type Place, type PlaceSide } from '../content/places';
import { t, type Key } from '../i18n';

const BASE = import.meta.env.BASE_URL;
const ASPECT = 1672 / 941; // рисунки не растягиваются и не зеркалятся
/** Где на рисунке сама планета с подписями (доли ширины и высоты). */
const BOX = { x0: 0.19, x1: 0.81, y0: 0.13, y1: 1 };
const TAP_SLOP = 10; // CSS px: дальше — это уже свайп, а не тап
const SIDES: PlaceSide[] = ['front', 'back'];

export interface MapHost { enter(place: Place): void; toast(key: Key): void; sound(name: 'click' | 'pop' | 'nope'): void; reducedMotion(): boolean }

export class WorldMap {
  readonly el = document.createElement('div');
  readonly mode = 'image';
  isOpen = false;
  side: PlaceSide = 'front';
  /** идёт плавная смена стороны — в это время места не нажимаются */
  turning = false;
  private frame = document.createElement('div');
  private imgs: Record<PlaceSide, HTMLImageElement> = { front: new Image(), back: new Image() };
  private zones = document.createElement('div');
  private marks: { place: Place; zone: HTMLButtonElement; label: HTMLButtonElement }[] = [];
  private titleEl = document.createElement('h1');
  private leftBtn = document.createElement('button');
  private rightBtn = document.createElement('button');
  private press: { id: number; x0: number; moved: boolean; place: string | null } | null = null;

  constructor(root: HTMLElement, private host: MapHost) {
    this.el.className = 'map hidden';
    this.frame.className = 'map-frame';
    this.zones.className = 'map-zones';
    this.titleEl.className = 'map-title';
    for (const s of SIDES) {
      const im = this.imgs[s];
      im.className = 'map-img ' + s;
      im.alt = '';
      im.draggable = false;
      im.decoding = 'async';
      im.src = `${BASE}assets/map/town-${s}.webp`;
      this.frame.append(im);
    }
    this.frame.append(this.zones);
    for (const place of PLACES) {
      const zone = document.createElement('button');
      zone.className = 'map-zone';
      zone.dataset.place = place.id;
      zone.style.cssText = `left:${place.x * 100}%;top:${place.y * 100}%;width:${place.r * 200}%;`;
      zone.tabIndex = -1;
      const label = document.createElement('button');
      label.className = 'map-label ' + place.status;
      label.dataset.place = place.id;
      label.style.cssText = `left:${place.lx * 100}%;top:${place.ly * 100}%;`;
      // с клавиатуры (Enter/пробел) место открывается так же, как тапом
      label.addEventListener('click', (e) => { if (e.detail === 0) this.activate(place.id); });
      this.zones.append(zone, label);
      this.marks.push({ place, zone, label });
    }
    const arrow = (d: string) => `<svg viewBox="0 0 40 40" width="34" height="34" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
    this.leftBtn.className = 'round map-turn left'; this.leftBtn.innerHTML = arrow('M24 8L12 20l12 12');
    this.rightBtn.className = 'round map-turn right'; this.rightBtn.innerHTML = arrow('M16 8l12 12-12 12');
    this.leftBtn.onclick = () => this.turn(1);
    this.rightBtn.onclick = () => this.turn(-1);
    this.el.append(this.titleEl, this.frame, this.leftBtn, this.rightBtn);
    root.append(this.el);
    this.frame.addEventListener('pointerdown', (e) => this.down(e));
    this.el.addEventListener('pointermove', (e) => this.move(e));
    this.el.addEventListener('pointerup', (e) => this.up(e));
    this.el.addEventListener('pointercancel', () => this.release());
    window.addEventListener('resize', () => this.layout());
    this.texts();
    this.apply();
  }

  /** Подписи и заголовок на текущем языке. */
  texts() {
    this.titleEl.textContent = t('map.title');
    this.leftBtn.setAttribute('aria-label', t('map.left'));
    this.rightBtn.setAttribute('aria-label', t('map.right'));
    for (const m of this.marks) {
      m.label.innerHTML = `<span>${t(m.place.nameKey as Key)}</span>${m.place.status === 'soon' ? `<em>${t('map.soon')}</em>` : ''}`;
      m.zone.setAttribute('aria-label', t(m.place.nameKey as Key));
    }
  }

  open() {
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.texts();
    this.layout();
  }
  close() {
    this.isOpen = false;
    this.release();
    this.el.classList.add('hidden');
  }

  /** Планета видна целиком на любом экране: рисунок вписывается под заголовком, остальное — цвет неба. */
  private layout() {
    const top = this.titleEl.offsetHeight + 22;
    const w = this.el.clientWidth, h = Math.max(100, this.el.clientHeight - top);
    // вписываем саму планету с подписями (её рамка на рисунке), а не всё небо вокруг: по краям обрезаются только облака
    const fw = Math.min(w / (BOX.x1 - BOX.x0), (h / (BOX.y1 - BOX.y0)) * ASPECT, Math.max(w, h * ASPECT) * 1.6);
    const fh = fw / ASPECT;
    this.frame.style.width = `${fw}px`;
    this.frame.style.height = `${fh}px`;
    this.frame.style.left = `${w / 2 - ((BOX.x0 + BOX.x1) / 2) * fw}px`;
    this.frame.style.top = `${top + h / 2 - ((BOX.y0 + BOX.y1) / 2) * fh}px`;
    this.frame.style.setProperty('--u', `${fw / 100}px`);
  }

  /** Места нажимаются только на той стороне, которая сейчас показана. */
  private apply() {
    for (const s of SIDES) this.imgs[s].classList.toggle('shown', s === this.side);
    this.el.dataset.side = this.side;
    for (const m of this.marks) {
      const on = m.place.side === this.side && !this.turning;
      m.zone.disabled = !on; m.label.disabled = !on;
      m.zone.classList.toggle('off', !on); m.label.classList.toggle('far', m.place.side !== this.side);
    }
  }

  /** Поворот планеты: dir = 1 — рисунок уезжает вправо, -1 — влево. Сторон две, поэтому любой поворот показывает другую. */
  turn(dir: number, sound = true) {
    if (this.turning) return;
    const from = this.imgs[this.side];
    this.side = this.side === 'front' ? 'back' : 'front';
    const to = this.imgs[this.side];
    if (sound) this.host.sound('click');
    if (this.host.reducedMotion()) { from.style.transform = ''; this.apply(); return; }
    this.turning = true;
    this.apply();
    // новая сторона въезжает навстречу, старая уезжает и гаснет — без переворота и растяжения
    to.style.transition = 'none';
    to.style.transform = `translateX(${-dir * 18}%)`;
    void to.offsetWidth;
    to.style.transition = '';
    to.style.transform = '';
    from.style.transform = `translateX(${dir * 18}%)`;
    window.setTimeout(() => { from.style.transition = 'none'; from.style.transform = ''; void from.offsetWidth; from.style.transition = ''; this.turning = false; this.apply(); }, 460);
  }

  // ---------- палец: тап открывает место, свайп поворачивает планету ----------
  private down(e: PointerEvent) {
    if (this.press || this.turning) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const place = (e.target as HTMLElement).closest<HTMLElement>('[data-place]')?.dataset.place ?? null;
    this.press = { id: e.pointerId, x0: e.clientX, moved: false, place };
    try { this.el.setPointerCapture(e.pointerId); } catch { /* не критично */ }
    e.preventDefault();
  }
  private move(e: PointerEvent) {
    const p = this.press;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x0;
    if (!p.moved && Math.abs(dx) > TAP_SLOP) p.moved = true;
    if (p.moved && !this.host.reducedMotion()) { const im = this.imgs[this.side]; im.style.transition = 'none'; im.style.transform = `translateX(${dx * 0.45}px)`; }
  }
  private up(e: PointerEvent) {
    const p = this.press;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x0;
    this.release();
    if (p.moved) { if (Math.abs(dx) > 46) this.turn(dx > 0 ? 1 : -1, false); return; } // свайп ничего не открывает
    if (p.place) this.activate(p.place);
  }
  private release() {
    const p = this.press;
    this.press = null;
    if (p) { try { this.el.releasePointerCapture(p.id); } catch { /* уже отпущен */ } }
    const im = this.imgs[this.side];
    im.style.transition = '';
    im.style.transform = '';
  }

  /** Тап по месту: открытое — входим, «Скоро» — мягко подсказываем. Место на другой стороне не срабатывает. */
  activate(id: string) {
    const m = this.marks.find((x) => x.place.id === id);
    if (!m || m.place.side !== this.side || this.turning) return;
    if (m.place.status !== 'open') {
      this.host.toast('map.soonToast');
      this.host.sound('nope');
      m.label.classList.remove('nudge'); void m.label.offsetWidth; m.label.classList.add('nudge');
      return;
    }
    this.enter(id);
  }
  /** Переход в место без проверки стороны (тесты). */
  enter(id: string) {
    const place = PLACES.find((p) => p.id === id);
    if (!place || place.status !== 'open') return;
    this.host.sound('pop');
    this.host.enter(place);
  }

  // ---------- для автоматических проверок ----------
  /** Места, которые сейчас можно нажать. */
  frontPlaces(): string[] { return this.marks.filter((m) => !m.zone.disabled).map((m) => m.place.id); }
  /** Экранная точка места (центр зоны нажатия). */
  screenOf(id: string): { x: number; y: number } | null {
    const m = this.marks.find((x) => x.place.id === id);
    if (!m) return null;
    const r = this.frame.getBoundingClientRect();
    return { x: r.left + m.place.x * r.width, y: r.top + m.place.y * r.height };
  }
}
