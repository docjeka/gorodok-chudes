// Экран «Автошкола»: дорога с видом из-за машины, нарисованная на одном холсте полосками в перспективе.
// Машина, конусы, шины, знаки и флажок — готовые картинки; небо, холмы, дорога, деревья, звёзды и передние колёса машины рисует код.
// В сохранение пишет только одно: сколько звёзд собрал герой за все заезды — по ним вручаются права.
import type { GameAudio } from '../audio/audio';
import { CAR, CAR_COLORS, COLORS, KART, LICENSE, PROPS, ROAD, type CarColor } from '../content/drive';
import type { Character } from '../game/types';
import { t, type Key } from '../i18n';
import { heroThumb } from '../ui/panels';
import { buildTrack, camera, licenseTier, newDrive, segmentAt, stepDrive, type DriveInput, type DriveState, type Prop, type Segment } from './road';

const BASE = import.meta.env.BASE_URL;
const img = (name: string) => `${BASE}assets/drive/${name}`;
const ICON: Record<string, string> = {
  gas: 'M20 8l11 14H9z M14 24h12v8H14z', back: 'M20 32L9 18h22z M14 8h12v8H14z', left: 'M8 20l14-11v22z M24 14h8v12h-8z', right: 'M32 20L18 9v22z M8 14h8v12H8z',
  brake: 'M10 10h20v20H10z', horn: 'M8 16h6l10-7v22l-10-7H8z M28 14q4 6 0 12', home: 'M24 8L12 20l12 12',
};
const svg = (d: string, fill = true) => `<svg viewBox="0 0 40 40" width="44" height="44" ${fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true"><path d="${d}"/></svg>`;
/** Ширина холста в точках: высота подбирается под экран. Больше — красивее, но тяжелее для планшета. */
const VIEW_W = 960;
const SPRITES = ['cone', 'tyres', 'sign_stop', 'sign_park', 'flag'] as const;
/** Ширина придорожных предметов в единицах мира (у дорожных она задана в PROPS). */
const SIDE_W: Record<string, number> = { tree: 1700, bush: 900, flowers: 620, sign_stop: 520, sign_park: 520, flag: 900 };

export interface DriveHost {
  heroes(): Character[]; audio: GameAudio; onClose(): void;
  /** сколько звёзд герой собрал за все заезды */
  stars(heroId: string): number;
  /** записать герою ещё n звёзд */
  earn(heroId: string, n: number): void;
}
const medal = (tier: number) => `<i class="medal t${tier}"></i>`;
const BRAKING: DriveInput = { gas: false, back: false, left: false, right: false, brake: true };
interface Fly { kind: 'cone' | 'tyres' | 'star' | 'party'; x: number; y: number; vx: number; vy: number; size: number; spin: number; born: number }
interface Shown { x: number; y: number; w: number; scale: number; clip: number }
/** Раскладка кадра: u — точек холста на точку рисунка машины, top и rear — верх рисунка и строка задних колёс, hz — горизонт, sv — масштаб высот. */
interface View { u: number; top: number; rear: number; hz: number; sv: number }

export class DriveSchool {
  readonly el = document.createElement('div');
  isOpen = false;
  readonly track = buildTrack();
  state: DriveState = newDrive();
  input: DriveInput = { gas: false, back: false, left: false, right: false, brake: false };
  driver: string | null = null;
  color: CarColor = 'coral';
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private pics: Record<string, HTMLImageElement> = {};
  private starsEl = document.createElement('div');
  private lapEl = document.createElement('div');
  private who = document.createElement('div');
  private picker = document.createElement('div');
  private controls = document.createElement('div');
  private award = document.createElement('div');
  /** звёзды этого заезда, ещё не записанные герою */
  private pending = 0;
  /** вручаются права: машина сама тормозит, кнопки ждут */
  private awarding = false;
  private fly: Fly[] = [];
  private raf = 0;
  private last = 0;
  private lean = 0;
  private vroomAt = 0;
  private keys = (e: KeyboardEvent) => this.key(e);

  constructor(root: HTMLElement, private host: DriveHost) {
    this.el.className = 'drive hidden';
    this.canvas.className = 'drive-view';
    for (const n of [...SPRITES, 'kart_shadow', ...CAR_COLORS.map((c) => `kart_${c}_body`)]) { const im = new Image(); im.decoding = 'async'; im.src = img(`${n}.png`); this.pics[n] = im; }
    this.starsEl.className = 'drive-stars';
    this.lapEl.className = 'drive-lap';
    this.who.className = 'drive-who';
    this.controls.className = 'drive-controls';
    this.picker.className = 'drive-picker';
    this.award.className = 'drive-award hidden';
    const top = document.createElement('div'); top.className = 'drive-top'; top.append(this.starsEl, this.lapEl);
    const back = this.button('home', 'drive.exit', false); back.classList.add('drive-exit'); back.onclick = () => this.close();
    const horn = this.button('horn', 'drive.horn', false); horn.classList.add('drive-horn'); horn.onclick = () => this.host.audio.play('beep');
    this.who.onclick = () => this.showPicker();
    this.el.append(this.canvas, top, back, this.who, horn, this.controls, this.picker, this.award);
    for (const [name, key, group] of [['left', 'drive.left', 'steer'], ['right', 'drive.right', 'steer'], ['back', 'drive.back', 'pedals'], ['brake', 'drive.brake', 'pedals'], ['gas', 'drive.gas', 'pedals']] as const) {
      let box = this.controls.querySelector<HTMLElement>('.' + group);
      if (!box) { box = document.createElement('div'); box.className = group; this.controls.append(box); }
      const b = this.button(name, key, true); b.classList.add('drive-btn', name);
      const set = (on: boolean) => { if (on && this.awarding) return; this.input[name] = on; b.classList.toggle('held', on); if (on && (name === 'gas' || name === 'back')) this.vroom(); };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); set(true); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) b.addEventListener(ev, () => set(false));
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      box.append(b);
    }
    root.append(this.el);
    if ('ResizeObserver' in window) new ResizeObserver(() => { if (this.isOpen) this.layout(); }).observe(this.el);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.release(); this.bank(); } });
  }

  private button(icon: string, key: Key, filled: boolean) {
    const b = document.createElement('button');
    b.className = 'round'; b.dataset.label = key; b.innerHTML = svg(ICON[icon], filled || icon === 'horn');
    return b;
  }
  /** Подписи кнопок на текущем языке. */
  texts() {
    for (const b of this.el.querySelectorAll<HTMLElement>('[data-label]')) { const s = t(b.dataset.label as Key); b.setAttribute('aria-label', s); b.title = s; }
    this.who.setAttribute('aria-label', t('drive.change')); this.who.title = t('drive.change'); this.who.setAttribute('role', 'button');
  }

  open() {
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.texts(); this.layout();
    this.state = newDrive(); this.fly = []; this.pending = 0; this.awarding = false; this.award.classList.add('hidden');
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
    this.release(); this.bank(); this.awarding = false; this.award.classList.add('hidden');
    window.removeEventListener('keydown', this.keys); window.removeEventListener('keyup', this.keys);
    this.el.classList.add('hidden');
    this.host.onClose();
  }
  private release() { for (const k of Object.keys(this.input) as (keyof DriveInput)[]) this.input[k] = false; for (const b of this.el.querySelectorAll('.held')) b.classList.remove('held'); }
  private get picking() { return !this.picker.classList.contains('hidden'); }

  /** Кто за рулём и какая машина. Заезд начинается заново со старта. */
  private showPicker() {
    this.release(); this.bank();
    const heroes = this.host.heroes();
    if (!this.driver || !heroes.some((h) => h.id === this.driver)) this.driver = heroes[0]?.id ?? null;
    const p = this.picker;
    p.classList.remove('hidden');
    p.innerHTML = `<div class="card"><h2>${t('drive.who')}</h2><div class="drive-heroes"></div><button class="drive-progress"></button><div class="drive-cars"></div><button class="pill wide drive-go">${t('drive.go')}</button></div>`;
    const hs = p.querySelector('.drive-heroes')!, cs = p.querySelector('.drive-cars')!, pr = p.querySelector<HTMLButtonElement>('.drive-progress')!;
    // под героями — его звёзды и полоска до следующих прав; если права уже есть, по нажатию их можно посмотреть
    const sync = () => {
      const hero = heroes.find((h) => h.id === this.driver), total = hero ? this.host.stars(hero.id) : 0, tier = licenseTier(total);
      pr.innerHTML = (tier && tier < LICENSE.stars.length ? medal(tier) : '') + this.progress(total); pr.disabled = !tier; pr.setAttribute('aria-label', t('drive.show'));
      pr.onclick = () => { if (hero && tier) { this.host.audio.play('click'); this.showLicense(hero, tier, total, false); } };
    };
    for (const h of heroes) {
      const b = document.createElement('button'), name = document.createElement('span'), tier = licenseTier(this.host.stars(h.id));
      b.className = 'herochip' + (h.id === this.driver ? ' current' : ''); b.innerHTML = heroThumb(h, 64) + (tier ? medal(tier) : ''); name.textContent = h.name; b.append(name);
      b.onclick = () => { this.driver = h.id; this.host.audio.play('click'); for (const x of hs.children) x.classList.toggle('current', x === b); sync(); };
      hs.append(b);
    }
    sync();
    for (const c of CAR_COLORS) {
      const b = document.createElement('button'); b.className = 'herochip drive-carchip' + (c === this.color ? ' current' : ''); b.dataset.car = c; b.innerHTML = `<img src="${img(`kart_${c}.png`)}" alt="" height="84" draggable="false">`;
      b.setAttribute('aria-label', t(`drive.car.${c}` as Key));
      b.onclick = () => { this.color = c; this.host.audio.play('click'); for (const x of cs.children) x.classList.toggle('current', x === b); };
      cs.append(b);
    }
    p.querySelector<HTMLButtonElement>('.drive-go')!.onclick = () => this.start();
  }
  /** Новый заезд: машина на старте, круг первый. Звёзды героя копятся дальше. */
  start() {
    this.bank();
    this.state = newDrive(); this.fly = []; this.lean = 0; this.turn = 0;
    this.picker.classList.add('hidden');
    const hero = this.host.heroes().find((h) => h.id === this.driver);
    this.who.innerHTML = hero ? heroThumb({ ...hero, emotion: 'joy' }, 60) : '';
    this.host.audio.play('vroom'); this.vroomAt = performance.now();
    this.hud();
  }

  private key(e: KeyboardEvent) {
    const map: Record<string, keyof DriveInput> = { ArrowUp: 'gas', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'brake' };
    const k = map[e.key];
    if (!k || this.picking || this.awarding) return;
    e.preventDefault();
    this.input[k] = e.type === 'keydown';
    if (e.type === 'keydown' && !e.repeat && (k === 'gas' || k === 'back')) this.vroom();
  }
  /** Мотор урчит, когда трогаемся, но не чаще раза в полторы секунды. */
  private vroom() {
    const now = performance.now();
    if (now - this.vroomAt < 1500 || Math.abs(this.state.speed) > CAR.maxSpeed * 0.2) return;
    this.vroomAt = now; this.host.audio.play('vroom');
  }

  private layout() {
    const r = this.el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const w = Math.min(VIEW_W, Math.round(r.width)), h = Math.max(240, Math.round((w * r.height) / r.width));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  /** Все звёзды героя: записанные раньше и собранные в этом заезде. */
  private get total() { return (this.driver ? this.host.stars(this.driver) : 0) + this.pending; }
  /** Записать герою звёзды этого заезда. */
  private bank() { if (this.pending && this.driver) this.host.earn(this.driver, this.pending); this.pending = 0; }
  /** Счётчик звёзд и полоска до следующих прав (после золотых — просто счётчик с золотой медалью). */
  private progress(total: number) {
    const tier = licenseTier(total), need = LICENSE.stars[tier], from = tier ? LICENSE.stars[tier - 1] : 0;
    return `<span>⭐ ${total}</span>` + (need ? `<i class="drive-bar"><b style="width:${Math.round(((total - from) / (need - from)) * 100)}%"></b></i>${medal(tier + 1)}` : medal(tier));
  }

  private hud() {
    const s = this.state, total = this.total, lap = `${t('drive.lap')} ${s.lap}`;
    if (this.starsEl.dataset.n !== String(total)) { this.starsEl.dataset.n = String(total); this.starsEl.innerHTML = this.progress(total); this.starsEl.classList.remove('pop'); void this.starsEl.offsetWidth; this.starsEl.classList.add('pop'); }
    if (this.lapEl.textContent !== lap) this.lapEl.textContent = lap;
  }

  /** Вручение прав: машина тормозит сама, летит конфетти, появляется карточка. Звёзды сразу записываются герою. */
  private grant(tier: number, now: number) {
    const hero = this.host.heroes().find((h) => h.id === this.driver), total = this.total;
    this.awarding = true; this.release(); this.bank();
    this.host.audio.play('gift'); this.party(now);
    window.setTimeout(() => { if (this.isOpen && this.awarding && hero) { this.host.audio.play('sparkle'); this.showLicense(hero, tier, total, true); } else this.awarding = false; }, 900);
  }
  /** Карточка прав: портрет героя, имя, машина, звёздочки по ступени и печать. fresh — только что вручили. */
  private showLicense(hero: Character, tier: number, total: number, fresh: boolean) {
    const a = this.award;
    a.className = 'drive-award' + (fresh ? ' fresh' : '');
    a.innerHTML = `<div class="license t${tier}"><div class="license-head"><b>${t('drive.license')}</b><span>${'★'.repeat(tier)}<s>${'★'.repeat(3 - tier)}</s></span></div>`
      + `<div class="license-body"><div class="license-photo">${heroThumb({ ...hero, emotion: 'joy' }, 150)}</div>`
      + `<div class="license-info"><div class="license-name"></div><div class="license-tier">${t(`drive.tier.${tier}` as Key)}</div><img class="license-car" src="${img(`kart_${this.color}.png`)}" alt="" draggable="false"></div>`
      + `<div class="license-seal">${medal(tier)}<b>⭐ ${total}</b></div></div></div><button class="pill drive-great">${t('drive.great')}</button>`;
    a.querySelector('.license-name')!.textContent = hero.name;
    a.querySelector<HTMLButtonElement>('.drive-great')!.onclick = () => { a.classList.add('hidden'); this.awarding = false; this.host.audio.play('click'); };
  }
  private party(now: number) {
    const W = this.canvas.width, H = this.canvas.height;
    for (let i = 0; i < 26; i++) this.fly.push({ kind: 'party', x: W * (0.1 + Math.random() * 0.8), y: H * 0.3, vx: (Math.random() - 0.5) * W * 0.4, vy: -H * (0.3 + Math.random() * 0.6), size: W * 0.03, spin: Math.random() * 6, born: now + i * 20 });
  }

  private frame(now: number) {
    if (!this.isOpen) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const shown = new Map<number, Shown>();
    this.draw(now, shown);
    if (!this.picking) {
      const a = this.host.audio, W = this.canvas.width, H = this.canvas.height;
      for (const e of stepDrive(this.track, this.state, this.awarding ? BRAKING : this.input, dt)) {
        if (e.type === 'lap') {
          a.play('gift'); this.party(now);
          continue;
        }
        // предмет улетает оттуда, где он только что был нарисован (у самой машины)
        const at = shown.get(e.id) ?? { x: W / 2 + (e.offset - this.state.x) * W * 0.3, y: H * 0.6, w: W * 0.08, scale: 0, clip: H };
        if (e.type === 'star') { const before = licenseTier(this.total); this.pending += 1; if (licenseTier(this.total) > before) this.grant(before + 1, now); else if (this.pending >= 10) this.bank(); a.play('sparkle'); const y0 = Math.min(H * 0.7, at.y - at.w * 0.5); this.fly.push({ kind: 'star', x: at.x, y: y0, vx: (W / 2 - at.x) / 0.6, vy: (H * 0.05 - y0) / 0.6, size: W * 0.09, spin: 0, born: now }); } // звезда летит к счётчику
        else { a.play(e.type === 'cone' ? 'boing' : 'put'); this.fly.push({ kind: e.type, x: at.x, y: at.y, vx: (e.offset >= this.state.x ? 1 : -1) * W * (0.5 + Math.random() * 0.3), vy: -H * 0.9, size: Math.max(W * 0.1, at.w), spin: (Math.random() < 0.5 ? -1 : 1) * 7, born: now }); }
      }
      this.hud();
    }
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  // ---------- рисование ----------

  /** Где на экране машина и горизонт. Камера смотрит на дорогу сверху под тем же углом, под каким нарисована машина, поэтому горизонт выше середины. */
  private view(W: number, H: number): View {
    const u = Math.min(W * KART.size, H * 0.52 * (KART.w / KART.h)) / KART.w, top = H * KART.bottom - KART.h * u * KART.squash, rear = top + KART.rear * u * KART.squash;
    const hz = Math.max(H * ROAD.sky, rear - ROAD.look * W);
    return { u, top, rear, hz, sv: (rear - hz) / (2 * ROAD.look) };
  }

  private draw(now: number, shown: Map<number, Shown>) {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height, s = this.state, T = this.track, segs = T.segments, N = segs.length;
    const v = this.view(W, H), cam = camera();
    const base = segmentAt(T, s.position), pct = (((s.position % ROAD.segment) + ROAD.segment) % ROAD.segment) / ROAD.segment;
    const player = segmentAt(T, s.position + cam.rearZ), ppct = ((((s.position + cam.rearZ) % ROAD.segment) + ROAD.segment) % ROAD.segment) / ROAD.segment;
    const playerY = player.y1 + (player.y2 - player.y1) * ppct;
    this.backdrop(c, W, H, v.hz, s, base);
    const camY = playerY + ROAD.cameraHeight;
    const project = (wx: number, wy: number, wz: number) => { const k = cam.depth / wz; return { x: Math.round(W / 2 + k * wx * (W / 2)), y: Math.round(v.hz - k * (wy - camY) * v.sv), w: Math.round(k * ROAD.width * (W / 2)), scale: k }; };
    let maxy = H, x = 0, dx = -(base.curve * pct);
    const lines: { seg: Segment; p: ReturnType<typeof project>; clip: number }[] = [];
    for (let n = 0; n < ROAD.draw; n++) {
      const seg = segs[(base.index + n) % N];
      const z1 = (n - pct) * ROAD.segment, z2 = z1 + ROAD.segment;
      const camX = s.x * ROAD.width;
      const xa = x, xb = x + dx; x += dx; dx += seg.curve;
      if (z1 <= cam.depth * 60) { continue; }
      const p1 = project(xa * 1 - camX, seg.y1, z1), p2 = project(xb * 1 - camX, seg.y2, z2);
      lines.push({ seg, p: p1, clip: maxy });
      if (p2.y >= p1.y || p2.y >= maxy) continue;       // отрезок за бугром или обращён от нас
      this.strip(c, W, seg, p1, p2);
      maxy = p2.y;
    }
    // предметы — от дальних к ближним
    for (let i = lines.length - 1; i >= 0; i--) {
      const { seg, p, clip } = lines[i];
      for (const pr of seg.props) {
        if (s.gone.has(pr.id)) continue;
        const sx = p.x + p.scale * pr.offset * ROAD.width * (W / 2);
        const wWorld = pr.kind === 'cone' || pr.kind === 'tyres' || pr.kind === 'star' ? PROPS[pr.kind].w : SIDE_W[pr.kind];
        const w = p.scale * wWorld * (W / 2);
        if (w < 2 || sx < -w || sx > W + w) continue;
        const lift = pr.kind === 'star' ? p.scale * PROPS.star.lift * v.sv + Math.sin(now / 260 + pr.id) * w * 0.12 : 0;
        shown.set(pr.id, { x: sx, y: p.y - lift, w, scale: p.scale, clip });
        this.prop(c, pr, sx, p.y - lift, w, clip, now);
      }
    }
    this.kart(c, W, v, now);
    this.flying(c, W, H, now);
  }

  /** Небо, облака и дальние холмы: они сдвигаются в повороте. */
  private backdrop(c: CanvasRenderingContext2D, W: number, H: number, hz: number, s: DriveState, base: Segment) {
    const g = c.createLinearGradient(0, 0, 0, hz * 1.2), m = Math.min(H, W * 0.75);
    g.addColorStop(0, COLORS.sky[0]); g.addColorStop(0.7, COLORS.sky[1]); g.addColorStop(1, COLORS.sky[2]);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    this.pan = (this.pan ?? 0) + base.curve * (s.speed / CAR.maxSpeed) * 0.0009;
    const shift = (k: number) => (((-this.pan * k * W) % W) + W) % W;
    c.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 0.37 * W + shift(0.5)) % (W * 1.4)) - W * 0.2, cy = hz * (0.2 + (i % 3) * 0.15), r = W * (0.035 + (i % 2) * 0.012);
      c.beginPath(); c.arc(cx, cy, r, 0, 7); c.arc(cx + r * 1.1, cy + r * 0.15, r * 0.8, 0, 7); c.arc(cx - r * 1.1, cy + r * 0.2, r * 0.7, 0, 7); c.fill();
    }
    COLORS.hills.forEach((col, layer) => {
      c.fillStyle = col; c.beginPath(); c.moveTo(0, H);
      const off = shift(1 + layer), top = hz - layer * m * 0.035;
      for (let px = 0; px <= W; px += 16) { const a = ((px + off) / W) * Math.PI * 2; c.lineTo(px, top - Math.sin(a * (2 + layer)) * m * 0.05 - Math.sin(a * 5 + layer * 2) * m * 0.018); }
      c.lineTo(W, H); c.closePath(); c.fill();
    });
  }
  private pan = 0;

  /** Один отрезок: трава, обочина-«леденец», дорога и разметка. */
  private strip(c: CanvasRenderingContext2D, W: number, seg: Segment, p1: { x: number; y: number; w: number }, p2: { x: number; y: number; w: number }) {
    const band = Math.floor(seg.index / ROAD.rumble) % 2;
    c.fillStyle = COLORS.grass[band]; c.fillRect(0, p2.y, W, p1.y - p2.y);
    const quad = (x1: number, w1: number, x2: number, w2: number, col: string) => { c.fillStyle = col; c.beginPath(); c.moveTo(x1 - w1, p1.y); c.lineTo(x2 - w2, p2.y); c.lineTo(x2 + w2, p2.y); c.lineTo(x1 + w1, p1.y); c.closePath(); c.fill(); };
    quad(p1.x, p1.w * 1.14, p2.x, p2.w * 1.14, COLORS.rumble[band]);
    quad(p1.x, p1.w, p2.x, p2.w, seg.finish ? COLORS.finish[0] : COLORS.road[band]);
    if (seg.finish) { // шашечки на линии старта
      const n = 8;
      for (let i = 0; i < n; i++) if ((i + seg.index) % 2) { const a1 = p1.x - p1.w + (p1.w * 2 * i) / n, a2 = p2.x - p2.w + (p2.w * 2 * i) / n; c.fillStyle = COLORS.finish[1]; c.beginPath(); c.moveTo(a1, p1.y); c.lineTo(a2, p2.y); c.lineTo(a2 + (p2.w * 2) / n, p2.y); c.lineTo(a1 + (p1.w * 2) / n, p1.y); c.closePath(); c.fill(); }
    } else if (band) {
      for (let l = 1; l < ROAD.lanes; l++) { const k = (l / ROAD.lanes) * 2 - 1; quad(p1.x + p1.w * k, p1.w * 0.025, p2.x + p2.w * k, p2.w * 0.025, COLORS.lane); }
    }
  }

  private prop(c: CanvasRenderingContext2D, pr: Prop, x: number, y: number, w: number, clip: number, now: number) {
    if (y - w * 0.2 > clip + w * 3) return;
    c.save();
    c.beginPath(); c.rect(0, 0, this.canvas.width, clip); c.clip(); // то, что за бугром, не торчит из-под земли
    const pic = this.pics[pr.kind];
    if (pic && pic.complete && pic.naturalWidth) { const h = (w * pic.naturalHeight) / pic.naturalWidth; c.drawImage(pic, x - w / 2, y - h, w, h); }
    else if (pr.kind === 'star') this.star(c, x, y - w / 2, w / 2, now / 500 + pr.id);
    else if (pr.kind === 'tree') this.tree(c, x, y, w, pr.id);
    else if (pr.kind === 'bush') this.blob(c, x, y - w * 0.28, w * 0.5, w * 0.3, ['#6fb85a', '#86cc6c', '#a2dc86']);
    else if (pr.kind === 'flowers') this.flowers(c, x, y, w, pr.id);
    c.restore();
  }
  private blob(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, cols: string[]) {
    c.fillStyle = cols[0]; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill();
    c.fillStyle = cols[1]; c.beginPath(); c.ellipse(x - rx * 0.12, y - ry * 0.16, rx * 0.8, ry * 0.76, 0, 0, 7); c.fill();
    c.fillStyle = cols[2]; c.beginPath(); c.ellipse(x - rx * 0.3, y - ry * 0.38, rx * 0.36, ry * 0.3, 0, 0, 7); c.fill();
  }
  private tree(c: CanvasRenderingContext2D, x: number, y: number, w: number, id: number) {
    const h = w * 1.25;
    c.fillStyle = '#b98454'; c.beginPath(); c.roundRect(x - w * 0.07, y - h * 0.42, w * 0.14, h * 0.42, w * 0.04); c.fill();
    const cols = id % 3 === 0 ? ['#5fae5a', '#77c26a', '#95d683'] : ['#6fb85a', '#86cc6c', '#a2dc86'];
    this.blob(c, x - w * 0.2, y - h * 0.55, w * 0.3, w * 0.27, cols); this.blob(c, x + w * 0.2, y - h * 0.57, w * 0.3, w * 0.27, cols); this.blob(c, x, y - h * 0.76, w * 0.36, w * 0.31, cols);
  }
  private flowers(c: CanvasRenderingContext2D, x: number, y: number, w: number, id: number) {
    const cols = ['#ffffff', '#ffc2d1', '#ffe28a'];
    for (let i = 0; i < 4; i++) {
      const fx = x + (i - 1.5) * w * 0.24, fy = y - w * (0.12 + ((i * 7 + id) % 3) * 0.07), r = w * 0.07;
      c.fillStyle = '#6fb85a'; c.fillRect(fx - r * 0.15, fy, r * 0.3, y - fy);
      c.fillStyle = cols[(i + id) % 3];
      for (let k = 0; k < 5; k++) { const a = (k * Math.PI * 2) / 5; c.beginPath(); c.arc(fx + Math.cos(a) * r, fy + Math.sin(a) * r, r * 0.72, 0, 7); c.fill(); }
      c.fillStyle = '#ffc446'; c.beginPath(); c.arc(fx, fy, r * 0.6, 0, 7); c.fill();
    }
  }
  private star(c: CanvasRenderingContext2D, x: number, y: number, r: number, turn: number) {
    const k = Math.cos(turn); // звезда медленно поворачивается вокруг своей оси
    c.save(); c.translate(x, y); c.scale(Math.abs(k) * 0.75 + 0.25, 1);
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.48 : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.closePath(); c.fillStyle = '#ffd166'; c.fill(); c.lineWidth = Math.max(1, r * 0.12); c.strokeStyle = '#f0a93a'; c.lineJoin = 'round'; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(-r * 0.2, -r * 0.25, r * 0.18, r * 0.1, -0.6, 0, 7); c.fill();
    c.restore();
  }

  /**
   * Машина игрока: стоит на дороге внизу по центру. Под ней тень во весь след, кузов чуть кренится в повороте и подрагивает на ходу,
   * а передние колёса нарисованы кодом как настоящие цилиндры и поворачиваются вокруг вертикальной оси вслед за рулём.
   */
  private kart(c: CanvasRenderingContext2D, W: number, v: View, now: number) {
    const body = this.pics[`kart_${this.color}_body`], shadow = this.pics.kart_shadow, s = this.state;
    if (!body.complete || !body.naturalWidth) return;
    const steer = this.picking ? 0 : (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0), k = Math.min(1, Math.abs(s.speed) / CAR.maxSpeed);
    this.turn += (steer - this.turn) * 0.25;                               // колёса слушаются руля сразу, даже на месте
    this.lean += (steer * Math.min(1, k * 3) - this.lean) * 0.18;          // кузов кренится только на ходу
    const u = v.u, q = KART.squash, mid = W / 2 + this.lean * W * 0.02, left = mid - (KART.w / 2) * u;
    const bump = (Math.abs(s.x) > 1 ? 3.2 : 1) * k * Math.sin(now / 38) * KART.h * u * 0.01;
    const ph = (KART.pitch * Math.PI) / 180, sp = Math.sin(ph) * q, cp = Math.sqrt(1 - sp * sp), yaw = (this.turn * KART.turn * Math.PI) / 180;
    if (shadow.complete && shadow.naturalWidth) c.drawImage(shadow, left - KART.shadowPad * u, v.top - KART.shadowPad * u * q, shadow.naturalWidth * u, shadow.naturalHeight * u * q);
    const F = KART.front, B = KART.back;
    for (const side of [-1, 1]) {
      this.contact(c, mid + side * B.x * u, v.rear, B.r * u, B.tyre * u, 0, sp);
      this.wheel(c, mid + side * F.x * u, v.top + F.y * u * q, u, yaw, side, sp, cp);
    }
    c.save(); c.translate(mid, v.rear); c.rotate(this.lean * KART.lean);
    c.drawImage(body, (-KART.w / 2) * u, -KART.rear * u * q + bump, KART.w * u, KART.h * u * q);
    c.restore();
  }
  private turn = 0;

  /** Пятно тени под колесом: эллипс на дороге, вытянутый вдоль колеса. */
  private contact(c: CanvasRenderingContext2D, x: number, y: number, r: number, tyre: number, yaw: number, sp: number) {
    const sd = Math.sin(yaw), cd = Math.cos(yaw);
    c.save(); c.transform(cd * tyre * 0.62, sd * sp * tyre * 0.62, sd * r * 0.7, -cd * sp * r * 0.7, x, y);
    c.beginPath(); c.arc(0, 0, 1, 0, 7); c.restore();
    c.fillStyle = 'rgba(48,36,52,0.2)'; c.fill();
  }

  /**
   * Переднее колесо: цилиндр, повёрнутый на yaw вокруг вертикальной оси и увиденный камерой сверху-сзади (sp и cp — синус и косинус её наклона).
   * На экране ось колеса — a, направление «вперёд» — f, «вверх» — (0, −cp); шина — выпуклая оболочка двух эллипсов-торцов.
   */
  private wheel(c: CanvasRenderingContext2D, x: number, y: number, u: number, yaw: number, side: number, sp: number, cp: number) {
    const F = KART.front, R = F.r * u, T = F.tyre * u, sd = Math.sin(yaw), cd = Math.cos(yaw);
    const ax = cd, ay = sd * sp, fx = sd, fy = -cd * sp, orient = -sd * cp >= 0 ? 1 : -1;
    /** Круг радиуса r в плоскости колеса, протянутый вдоль оси от t0 до t1. */
    const puck = (r: number, t0: number, t1: number) => {
      c.beginPath();
      for (let i = 0; i < 28; i++) {
        const th = (i / 28) * Math.PI * 2, co = Math.cos(th), si = Math.sin(th);
        const ex = r * co * fx, ey = r * (co * fy - si * cp), dx = -si * fx, dy = -si * fy - co * cp;   // точка торца и касательная в ней
        const t = (dy * ax - dx * ay) * orient * (t1 - t0) > 0 ? t1 : t0;
        c.lineTo(x + ex + t * ax, y + ey + t * ay);
      }
      c.closePath();
    };
    const disc = (r: number, t: number) => { c.beginPath(); for (let i = 0; i < 28; i++) { const th = (i / 28) * Math.PI * 2; c.lineTo(x + t * ax + r * Math.cos(th) * fx, y + t * ay + r * (Math.cos(th) * fy - Math.sin(th) * cp)); } c.closePath(); };
    const round = T * 0.44, edge = T / 2 - round, facing = Math.abs(sd) < 0.03 ? 0 : Math.sign(sd);   // какой торец виден камере: правый (+1) или левый (−1)
    const cap = () => {                                                                             // колпак на наружном торце
      const rc = F.cap * u * 0.8;                                                                    // скруглённый край: колпак выпуклый
      puck(F.hub * u - rc, side * edge, side * (T / 2 + F.cap * u - rc)); c.fillStyle = c.strokeStyle = KART.hubcap[0]; c.lineJoin = 'round'; c.lineWidth = rc * 2; c.fill(); c.stroke();
      if (facing === side) { disc(F.hub * u * 0.6, side * (T / 2 + F.cap * u)); c.fillStyle = KART.hubcap[1]; c.fill(); }
    };
    this.contact(c, x, y + R * cp, R, T, yaw, sp);
    if (facing !== side) cap();                                                                     // колпак с той стороны выглядывает из-за шины
    const g = c.createLinearGradient(x - (T / 2) * ax, y - (T / 2) * ay, x + (T / 2) * ax, y + (T / 2) * ay);
    g.addColorStop(0, KART.tyre[0]); g.addColorStop(0.45, KART.tyre[1]); g.addColorStop(1, KART.tyre[2]);
    puck(R - round, -edge, edge); c.fillStyle = c.strokeStyle = g; c.lineJoin = 'round'; c.lineWidth = round * 2; c.fill(); c.stroke();
    if (facing) { disc(R - round * 0.4, facing * (T / 2 - round * 0.5)); c.fillStyle = facing === side ? KART.side : KART.inner; c.fill(); }
    if (facing === side) cap();
  }

  /** Отлетающие конусы и шины, пойманные звёзды, конфетти на финише. */
  private flying(c: CanvasRenderingContext2D, W: number, H: number, now: number) {
    this.fly = this.fly.filter((f) => now - f.born < 1100);
    for (const f of this.fly) {
      const tm = (now - f.born) / 1000;
      if (tm < 0) continue;
      const x = f.x + f.vx * tm, y = f.y + f.vy * tm + (f.kind === 'star' ? 0 : H * 1.6 * tm * tm);
      c.save(); c.globalAlpha = Math.max(0, 1 - tm / 1.1); c.translate(x, y); c.rotate(f.spin * tm);
      if (f.kind === 'star') { if (tm > 0.6) { c.restore(); continue; } c.globalAlpha = 1; this.star(c, 0, 0, f.size * (0.5 - tm * 0.45), 0); }
      else if (f.kind === 'party') { c.fillStyle = ['#ff8a73', '#ffd166', '#7fd1b9', '#b79df0', '#8fc3f2'][Math.floor(f.spin * 10) % 5]; c.fillRect(-f.size / 2, -f.size / 4, f.size, f.size / 2); }
      else { const pic = this.pics[f.kind]; if (pic.complete && pic.naturalWidth) { const h = (f.size * pic.naturalHeight) / pic.naturalWidth; c.drawImage(pic, -f.size / 2, -h / 2, f.size, h); } }
      c.restore();
    }
  }
}
