// Экран «Автошкола»: площадка сверху, машина с героем, кнопки руля и педалей. Сохранения не трогает.
// Всё собрано из обычных элементов страницы (без отдельного холста): десяток картинок, которые двигает transform.
import type { GameAudio } from '../audio/audio';
import { CAR, CAR_COLORS, CONE, PARKING, SIGNS, TYRE, TYRES, type CarColor } from '../content/drive';
import type { Character } from '../game/types';
import { t, type Key } from '../i18n';
import { heroThumb } from '../ui/panels';
import { newDrive, stepDrive, type DriveInput, type DriveState } from './physics';

const BASE = import.meta.env.BASE_URL;
const W = 1600, H = 900;
const img = (name: string) => `${BASE}assets/drive/${name}`;
const ICON: Record<string, string> = {
  gas: 'M20 8l11 14H9z M14 24h12v8H14z', back: 'M20 32L9 18h22z M14 8h12v8H14z', left: 'M8 20l14-11v22z M24 14h8v12h-8z', right: 'M32 20L18 9v22z M8 14h8v12H8z',
  brake: 'M10 10h20v20H10z', horn: 'M8 16h6l10-7v22l-10-7H8z M28 14q4 6 0 12', home: 'M24 8L12 20l12 12',
};
const svg = (d: string, fill = true) => `<svg viewBox="0 0 40 40" width="44" height="44" ${fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true"><path d="${d}"/></svg>`;

export interface DriveHost { heroes(): Character[]; audio: GameAudio; onClose(): void }

export class DriveSchool {
  readonly el = document.createElement('div');
  isOpen = false;
  state: DriveState = newDrive();
  input: DriveInput = { gas: false, back: false, left: false, right: false, brake: false };
  driver: string | null = null;
  color: CarColor = 'coral';
  private field = document.createElement('div');
  private car = document.createElement('div');
  private carImg = new Image();
  private head = document.createElement('div');
  private cones: HTMLImageElement[] = [];
  private starsEl = document.createElement('div');
  private picker = document.createElement('div');
  private controls = document.createElement('div');
  private raf = 0;
  private last = 0;
  private scale = 1;
  private vroomAt = 0;
  private keys = (e: KeyboardEvent) => this.key(e);

  constructor(root: HTMLElement, private host: DriveHost) {
    this.el.className = 'drive hidden';
    this.field.className = 'drive-field';
    this.field.style.backgroundImage = `url(${img('yard.webp')})`;
    const place = (el: HTMLElement, x: number, y: number, w: number, h: number, z = Math.round(y)) => { el.style.cssText += `position:absolute;left:${x - w / 2}px;top:${y - h}px;width:${w}px;height:${h}px;z-index:${z};`; el.draggable = false; };
    for (const s of SIGNS) { const im = new Image(); im.src = img(`${s.sprite}.png`); im.alt = ''; im.style.objectFit = 'contain'; place(im, s.x, s.y + s.h / 2, s.h, s.h); this.field.append(im); }
    for (const p of TYRES) { const im = new Image(); im.src = img('tyres.png'); im.alt = ''; im.style.objectFit = 'contain'; place(im, p.x, p.y + TYRE.size * 0.45, TYRE.size, TYRE.size * 0.86); this.field.append(im); }
    for (const _ of this.state.cones) { const im = new Image(); im.alt = ''; im.className = 'drive-cone'; im.draggable = false; this.cones.push(im); this.field.append(im); }
    this.car.className = 'drive-car';
    this.car.style.width = `${CAR.w}px`; this.car.style.height = `${CAR.h}px`;
    this.carImg.alt = ''; this.carImg.draggable = false;
    this.head.className = 'drive-head';
    this.head.style.cssText = `left:${CAR.seats[0].x * CAR.w - CAR.head / 2}px;top:${CAR.seats[0].y * CAR.h - CAR.head / 2}px;width:${CAR.head}px;height:${CAR.head}px;`;
    this.car.append(this.carImg, this.head);
    this.field.append(this.car);
    this.starsEl.className = 'drive-stars';
    this.controls.className = 'drive-controls';
    this.picker.className = 'drive-picker';
    const back = this.button('home', 'drive.exit', false); back.classList.add('drive-exit'); back.onclick = () => this.close();
    const horn = this.button('horn', 'drive.horn', false); horn.classList.add('drive-horn'); horn.onclick = () => this.host.audio.play('beep');
    const again = document.createElement('button'); again.className = 'pill small drive-again'; again.onclick = () => this.showPicker();
    this.el.append(this.field, this.starsEl, back, horn, again, this.controls, this.picker);
    for (const [name, key, group] of [['left', 'drive.left', 'steer'], ['right', 'drive.right', 'steer'], ['back', 'drive.back', 'pedals'], ['brake', 'drive.brake', 'pedals'], ['gas', 'drive.gas', 'pedals']] as const) {
      let box = this.controls.querySelector<HTMLElement>('.' + group);
      if (!box) { box = document.createElement('div'); box.className = group; this.controls.append(box); }
      const b = this.button(name, key, true); b.classList.add('drive-btn', name);
      const set = (on: boolean) => { this.input[name] = on; b.classList.toggle('held', on); if (on && (name === 'gas' || name === 'back')) this.vroom(); };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); set(true); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) b.addEventListener(ev, () => set(false));
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      box.append(b);
    }
    root.append(this.el);
    if ('ResizeObserver' in window) new ResizeObserver(() => { if (this.isOpen) this.layout(); }).observe(this.el);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.release(); });
  }

  private button(icon: string, key: Key, filled: boolean) {
    const b = document.createElement('button');
    b.className = 'round'; b.dataset.label = key; b.innerHTML = svg(ICON[icon], filled || icon === 'horn');
    return b;
  }
  /** Подписи кнопок на текущем языке. */
  texts() {
    for (const b of this.el.querySelectorAll<HTMLElement>('[data-label]')) { const s = t(b.dataset.label as Key); b.setAttribute('aria-label', s); b.title = s; }
    this.el.querySelector('.drive-again')!.textContent = t('drive.change');
  }

  open() {
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.texts(); this.layout();
    this.state = newDrive(); this.carImg.src = img(`car_${this.color}.png`); this.head.innerHTML = ''; this.render(); // под окошком выбора — машина на старте
    window.addEventListener('keydown', this.keys); window.addEventListener('keyup', this.keys);
    this.showPicker();
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    cancelAnimationFrame(this.raf);
    this.release();
    window.removeEventListener('keydown', this.keys); window.removeEventListener('keyup', this.keys);
    this.el.classList.add('hidden');
    this.host.onClose();
  }
  private release() { for (const k of Object.keys(this.input) as (keyof DriveInput)[]) this.input[k] = false; for (const b of this.el.querySelectorAll('.held')) b.classList.remove('held'); }

  /** Кто за рулём и какая машина. Заезд начинается заново со старта. */
  private showPicker() {
    this.release();
    const heroes = this.host.heroes();
    if (!this.driver || !heroes.some((h) => h.id === this.driver)) this.driver = heroes[0]?.id ?? null;
    const p = this.picker;
    p.classList.remove('hidden');
    p.innerHTML = `<div class="card"><h2>${t('drive.who')}</h2><div class="drive-heroes"></div><div class="drive-cars"></div><button class="pill wide drive-go">${t('drive.go')}</button></div>`;
    const hs = p.querySelector('.drive-heroes')!, cs = p.querySelector('.drive-cars')!;
    for (const h of heroes) {
      const b = document.createElement('button'); b.className = 'herochip' + (h.id === this.driver ? ' current' : ''); b.innerHTML = heroThumb(h, 64) + `<span>${h.name}</span>`;
      b.onclick = () => { this.driver = h.id; this.host.audio.play('click'); for (const x of hs.children) x.classList.toggle('current', x === b); };
      hs.append(b);
    }
    for (const c of CAR_COLORS) {
      const b = document.createElement('button'); b.className = 'herochip drive-carchip' + (c === this.color ? ' current' : ''); b.dataset.car = c; b.innerHTML = `<img src="${img(`car_${c}.png`)}" alt="" height="84" draggable="false">`;
      b.setAttribute('aria-label', t(`drive.car.${c}` as Key));
      b.onclick = () => { this.color = c; this.host.audio.play('click'); for (const x of cs.children) x.classList.toggle('current', x === b); };
      cs.append(b);
    }
    p.querySelector<HTMLButtonElement>('.drive-go')!.onclick = () => this.start();
  }
  /** Новый заезд: машина на старте, конусы на местах, звёзды с нуля. */
  start() {
    this.state = newDrive();
    this.picker.classList.add('hidden');
    this.carImg.src = img(`car_${this.color}.png`);
    const hero = this.host.heroes().find((h) => h.id === this.driver);
    this.head.innerHTML = hero ? heroThumb({ ...hero, emotion: 'joy' }, CAR.head) : '';
    this.host.audio.play('vroom'); this.vroomAt = performance.now();
    this.render();
  }

  private key(e: KeyboardEvent) {
    const map: Record<string, keyof DriveInput> = { ArrowUp: 'gas', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'brake' };
    const k = map[e.key];
    if (!k || !this.picker.classList.contains('hidden')) return;
    e.preventDefault();
    this.input[k] = e.type === 'keydown';
    if (e.type === 'keydown' && !e.repeat && (k === 'gas' || k === 'back')) this.vroom();
  }
  /** Мотор урчит, когда трогаемся, но не чаще раза в полторы секунды. */
  private vroom() {
    const now = performance.now();
    if (now - this.vroomAt < 1500 || Math.abs(this.state.speed) > 60) return;
    this.vroomAt = now; this.host.audio.play('vroom');
  }

  private layout() {
    const r = this.el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    this.scale = Math.min(r.width / W, r.height / H);
    this.field.style.transform = `translate(${(r.width - W * this.scale) / 2}px, ${(r.height - H * this.scale) / 2}px) scale(${this.scale})`;
  }

  private frame(now: number) {
    if (!this.isOpen) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (this.picker.classList.contains('hidden')) {
      for (const e of stepDrive(this.state, this.input, dt)) {
        const a = this.host.audio;
        if (e.type === 'cone') { a.play('boing'); this.puff('💨', this.state.cones[e.index]); }
        else if (e.type === 'bump') a.play('put');
        else if (e.type === 'pass') { a.play('sparkle'); this.puff('⭐', this.state.cones[e.index]); }
        else { a.play('gift'); const p = PARKING[e.index]; for (let i = 0; i < 6; i++) window.setTimeout(() => this.puff(i % 2 ? '⭐' : '🎉', { x: p.x0 + Math.random() * (p.x1 - p.x0), y: p.y0 + Math.random() * (p.y1 - p.y0) }), i * 90); }
      }
      this.render();
    }
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  private render() {
    const s = this.state;
    this.car.style.transform = `translate(${s.x - CAR.w / 2}px, ${s.y - CAR.h / 2}px) rotate(${s.angle}rad)`;
    this.car.style.zIndex = String(Math.round(s.y));
    this.head.style.transform = `rotate(${-s.angle}rad)`; // голова героя всегда смотрит на нас
    s.cones.forEach((k, i) => {
      const im = this.cones[i], want = k.down ? 'cone_down.png' : 'cone.png';
      if (im.dataset.sprite !== want) { im.dataset.sprite = want; im.src = img(want); }
      const w = k.down ? CONE.size * 1.15 : CONE.size * 0.82, h = CONE.size;
      im.style.cssText = `left:${k.x - w / 2}px;top:${k.y - h * 0.72}px;width:${w}px;height:${h}px;z-index:${Math.round(k.y)};`;
    });
    const text = `⭐ ${s.stars}`;
    if (this.starsEl.textContent !== text) { this.starsEl.textContent = text; this.starsEl.classList.remove('pop'); void this.starsEl.offsetWidth; this.starsEl.classList.add('pop'); }
  }
  /** Значок, который всплывает над местом события и тает. */
  private puff(sign: string, at: { x: number; y: number }) {
    const e = document.createElement('div');
    e.className = 'drive-puff'; e.textContent = sign; e.style.left = `${at.x}px`; e.style.top = `${at.y}px`;
    this.field.append(e);
    window.setTimeout(() => e.remove(), 900);
  }
}
