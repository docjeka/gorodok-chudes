// Сцена PixiJS. Она ничего не хранит сама: каждый раз строится из модели мира (sync).
import { Application, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { heart, star, ci, type Art, shade } from '../art/base';
import { characterArt } from '../art/character';
import { browArt, eyeArt, eyeStateFor, faceInk, mouthArt } from '../art/face';
import { tvSceneArt } from '../art/furniture';
import { itemArt, itemArtKey } from '../art/items';
import charSprites from '../content/charSprites.json';
import furnSprites from '../content/furnSprites.json';
import itemSprites from '../content/itemSprites.json';
import petSprites from '../content/petSprites.json';
import { CAROUSEL, DISCO_BALL, FURNITURE, HOUSE_ROOMS, TV_SCREEN } from '../content/furniture';
import { ITEMS } from '../content/items';
import { HAIR_COLORS } from '../content/wardrobe';
import { charPos, itemPlace, liveSeat, petPos, setLiveSeats, type LiveSeat } from '../game/geometry';
import type { Character, FurnitureInst, ItemInst, Pet, Pt, RoomId, World } from '../game/types';
import { ROOM_H, ROOM_W } from '../game/types';
import { artTex, getTex, hitTex, imageTex, textureCount, type Tex } from './textures';

const BASE = import.meta.env.BASE_URL;
type Kind = 'item' | 'char' | 'pet' | 'furn' | 'front';
type CharSprite = { file: string; unit: number; origin: Pt; eyeL: Pt; eyeR: Pt; browL: Pt; browR: Pt; mouth: Pt; handL: Pt; handR: Pt; faceScale: number };
type SpriteMeta = { upp: number; ox: number; oy: number; w: number; h: number; top?: boolean };
const CHAR_SPRITES = charSprites as unknown as Record<string, CharSprite>;
const FURN_SPRITES = furnSprites as unknown as Record<string, SpriteMeta>;
const ITEM_SPRITES = itemSprites as unknown as Record<string, { w: number; h: number }>;
const PET_SPRITES = petSprites as unknown as Record<string, SpriteMeta>;

interface FaceWant { eyes: number; brows: number; emotion: Character['emotion']; color: string; sp: CharSprite; closed: boolean; ink: string }
interface Want {
  id: string; kind: Kind; ref: string; x: number; y: number; z: number; flip: boolean; rot: number;
  key: string; load: () => Promise<Tex>; face?: FaceWant; overlay?: { key: string; load: () => Promise<Tex> };
  /** налитое в чашку: цвет и место «зеркала» жидкости */
  liquid?: { color: number; x: number; y: number; rx: number };
  /** двойная миска: вода слева и гранулы справа — отдельными слоями */
  bowl?: { water: boolean; kibble: boolean };
}
interface Node {
  id: string; kind: Kind; ref: string; c: Container; body: Sprite; key: string; tex?: Tex;
  parts?: Record<'eyeL' | 'eyeR' | 'browL' | 'browR' | 'mouth', Sprite>; face?: FaceWant; blinkAt: number; blinkUntil: number;
  overlay?: Sprite; overlayKey?: string; pulse: number; liquid?: Graphics; liquidKey?: string; bowlG?: Graphics; bowlKey?: string;
  /** место из модели мира: танец качает фигурку вокруг него и ничего не сохраняет */
  by: number;
  /** шест лошадки карусели */
  pole?: Graphics;
}
interface Tween { t: number; dur: number; step: (k: number) => void; done?: () => void }
interface Particle { s: Sprite | Graphics; vx: number; vy: number; g: number; life: number; max: number; spin: number }

export type PetMood = 'idle' | 'happy' | 'sleep' | 'eat' | 'play';

export class Scene {
  app = new Application();
  root = new Container();
  private bg = new Sprite();
  /** продолжение фона вверх (небо или стена), когда экран выше комнаты */
  private bgTop = new Sprite();
  private layer = new Container();
  private night = new Graphics();
  private glow = new Container();
  private fx = new Container();
  /** эффекты клуба за героями: блики на стенах и полу, плитки диско-шара */
  private club = new Container();
  private clubGlints = new Graphics();
  private clubBall = new Graphics();
  private clubState = { ball: false, lightId: null as string | null, speakerId: null as string | null, ballAmp: 0, starAt: 0, noteAt: 0 };
  private beatOn = false;
  private hl = new Graphics();
  private debugG = new Graphics();
  private nodes = new Map<string, Node>();
  private tweens: Tween[] = [];
  private particles: Particle[] = [];
  private petMoods = new Map<string, { mood: PetMood; until: number }>();
  private tvFrame = 0;
  private world: World | null = null;
  private roomId: RoomId | null = null;
  private bgKey = '';
  scale = 1;
  zoom = 1;
  camX = 0;
  camY = 0;
  viewW = ROOM_W;
  viewH = ROOM_H;
  dragging: string | null = null;
  reducedMotion = false;
  debug = new URLSearchParams(location.search).get('debug') === 'anchors';
  private nightAlpha = 0;
  private hlTarget: { x: number; y: number; r: number } | null = null;
  private selId: string | null = null;
  private talking = new Set<string>();
  private animating = new Set<string>();
  /** карусели: угол поворота и скорость; живут в сцене и в сохранение не попадают */
  private rides = new Map<string, { a: number; v: number }>();
  private talkFrame = 0;

  async init(host: HTMLElement) {
    // размер холста задаёт fit(): по фактической видимой области, а не по устаревшим размерам окна (после поворота iPad они запаздывают)
    await this.app.init({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight), background: 0xf3e6d3, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl' });
    host.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';
    this.layer.sortableChildren = true;
    this.night.rect(0, 0, ROOM_W, ROOM_H).fill({ color: 0x1b2250 });
    this.night.alpha = 0;
    this.clubGlints.blendMode = 'add';
    const ballMask = new Graphics().circle(DISCO_BALL.x, DISCO_BALL.y, DISCO_BALL.r).fill({ color: 0xffffff });
    this.clubBall.mask = ballMask; // контур и крепление шара остаются с фона: анимация только внутри круга
    this.club.addChild(this.clubGlints, ballMask, this.clubBall);
    this.root.addChild(this.bgTop, this.bg, this.club, this.layer, this.night, this.glow, this.fx, this.hl, this.debugG);
    this.app.stage.addChild(this.root);
    this.app.renderer.on('resize', () => this.layout());
    this.layout();
    setLiveSeats((furnitureId, slot) => this.rideSeat(furnitureId, slot));
    this.app.ticker.add((tk) => this.tick(tk.deltaMS));
  }

  // ---------- камера и координаты ----------
  /** Наименьший масштаб: вся комната целиком помещается на экране. */
  get minZoom() { return Math.min(1, (this.app.screen.width / ROOM_W) / (this.app.screen.height / ROOM_H)); }
  readonly maxZoom = 1.8;
  /** Холст ровно по видимой области; фон, герои, вещи и зоны нажатия считаются от одного и того же масштаба и смещения. */
  fit(w: number, h: number) {
    if (w < 1 || h < 1) return;
    if (Math.abs(this.app.screen.width - w) < 0.5 && Math.abs(this.app.screen.height - h) < 0.5) return;
    this.app.renderer.resize(w, h); // вызовет layout()
  }
  layout() {
    const W = this.app.screen.width, H = this.app.screen.height;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
    this.scale = (H / ROOM_H) * this.zoom;
    this.viewW = W / this.scale;
    this.viewH = H / this.scale;
    this.root.scale.set(this.scale);
    this.panBy(0, 0);
  }
  /** Прокрутка комнаты, когда она не помещается на экране целиком. Если помещается — стоит по центру. */
  panBy(dxScreen: number, dyScreen = 0) {
    const W = this.app.screen.width, H = this.app.screen.height;
    if (this.viewW >= ROOM_W) { this.camX = 0; this.root.x = (W - ROOM_W * this.scale) / 2; }
    else { this.camX = Math.max(0, Math.min(ROOM_W - this.viewW, this.camX - dxScreen / this.scale)); this.root.x = -this.camX * this.scale; }
    // комната ниже экрана (отдалили на 4:3): пол прижат к нижнему краю, сверху продолжается небо или стена
    if (this.viewH >= ROOM_H) { this.camY = 0; this.root.y = H - ROOM_H * this.scale; }
    else { this.camY = Math.max(0, Math.min(ROOM_H - this.viewH, this.camY - dyScreen / this.scale)); this.root.y = -this.camY * this.scale; }
  }
  /** Отдалить или приблизить. focal — точка экрана, которая остаётся под пальцами. */
  setZoom(z: number, focal?: { x: number; y: number }) {
    const r = this.app.canvas.getBoundingClientRect();
    const f = focal ?? { x: r.left + r.width / 2, y: r.top + r.height * 0.7 };
    const before = this.toRoom(f.x, f.y);
    this.zoom = z;
    this.layout();
    const after = this.toRoom(f.x, f.y);
    this.camX += before.x - after.x;
    this.camY += before.y - after.y;
    this.panBy(0, 0);
  }
  centerOn(x: number) { if (this.viewW < ROOM_W) { this.camX = x - this.viewW / 2; this.panBy(0); } }
  /** Единственная функция перевода экран → комната. */
  toRoom(clientX: number, clientY: number): Pt {
    const r = this.app.canvas.getBoundingClientRect();
    return { x: (clientX - r.left - this.root.x) / this.scale, y: (clientY - r.top - this.root.y) / this.scale };
  }
  toScreen(p: Pt): Pt {
    const r = this.app.canvas.getBoundingClientRect();
    return { x: r.left + this.root.x + p.x * this.scale, y: r.top + this.root.y + p.y * this.scale };
  }

  // ---------- построение из модели ----------
  sync(world: World) {
    this.world = world;
    const roomId = world.currentRoomId;
    const room = world.rooms[roomId];
    if (roomId !== this.roomId) { this.roomId = roomId; this.camX = Math.max(0, (ROOM_W - this.viewW) / 2); this.camY = Math.max(0, ROOM_H - this.viewH); this.panBy(0, 0); this.clearFx(); }
    const house = HOUSE_ROOMS.has(roomId); // у локаций города свой постоянный фон
    const bgKey = house ? `room${room.wallpaper % 4}` : roomId;
    if (bgKey !== this.bgKey) {
      this.bgKey = bgKey;
      void imageTex(bgKey, `${BASE}assets/rooms/${bgKey}.${house ? 'jpg' : 'webp'}`, { upp: 1, ox: 0, oy: 0 }).then((t) => { if (this.bgKey === bgKey) { this.bg.texture = t.texture; this.bg.width = ROOM_W; this.bg.height = ROOM_H; this.bgTop.texture = new Texture({ source: t.texture.source, frame: new Rectangle(0, 1, t.texture.source.width, 2) }); this.bgTop.width = ROOM_W; this.bgTop.height = ROOM_H; this.bgTop.y = -ROOM_H + 1; } });
    }
    this.nightAlpha = room.lightOn ? 0 : 0.5;
    // эффекты клуба работают только пока игрок в клубе
    const inClub = roomId === 'club';
    const lamp = inClub ? Object.values(world.furniture).find((f) => f.roomId === 'club' && f.definitionId === 'club_light' && f.on > 0) : undefined;
    const speaker = inClub ? Object.values(world.furniture).find((f) => f.roomId === 'club' && f.definitionId === 'club_speaker') : undefined;
    this.clubState.ball = inClub && !!room.ball;
    this.clubState.lightId = lamp?.id ?? null;
    this.clubState.speakerId = speaker?.id ?? null;
    const wants = this.collect(world, roomId);
    const seen = new Set<string>();
    for (const w of wants) {
      seen.add(w.id);
      let n = this.nodes.get(w.id);
      if (!n) {
        n = { id: w.id, kind: w.kind, ref: w.ref, c: new Container(), body: new Sprite(), key: '', blinkAt: performance.now() + 1500 + Math.random() * 3000, blinkUntil: 0, pulse: 0, by: w.y };
        n.c.addChild(n.body);
        this.layer.addChild(n.c);
        this.nodes.set(w.id, n);
      }
      if ((this.dragging !== w.ref && !this.animating.has(w.ref)) || w.kind === 'front') {
        n.c.position.set(w.x, w.y);
        n.by = w.y;
        n.c.zIndex = w.z;
        n.c.scale.set(w.flip ? -1 : 1, 1);
        n.c.rotation = w.rot;
      }
      if (n.key !== w.key) {
        n.key = w.key;
        const cached = getTex(w.key);
        if (cached) this.applyTex(n, cached);
        else { const node = n; void w.load().then((t) => { if (node.key === w.key) this.applyTex(node, t); }).catch(() => undefined); }
      } else if (n.tex) n.tex.used = performance.now();
      this.syncFace(n, w.face);
      this.syncOverlay(n, w.overlay);
      this.syncLiquid(n, w.liquid);
      this.syncBowl(n, w.bowl);
    }
    for (const [id, n] of this.nodes) if (!seen.has(id)) { n.c.destroy({ children: true }); this.nodes.delete(id); }
    this.syncGlow(world, roomId);
    this.rideTick(0); // лошадки и седоки сразу на своих местах
    if (this.debug) this.drawDebug(world, roomId);
  }

  private applyTex(n: Node, t: Tex) {
    n.tex = t;
    n.body.texture = t.texture;
    n.body.anchor.set(t.ox / t.w, t.oy / t.h);
    n.body.scale.set(t.upp);
  }

  private collect(w: World, roomId: RoomId): Want[] {
    const out: Want[] = [];
    const night = !w.rooms[roomId].lightOn;
    let wallIdx = 0;
    for (const f of Object.values(w.furniture)) {
      if (f.roomId !== roomId) continue;
      const def = FURNITURE[f.definitionId];
      if (def.invisible) {
        // места фермы: сено в кормушке, зерно на земле, яйцо в гнезде, росток или цветок на грядке — отдельными слоями поверх фона
        const art = def.farm ? farmArt(def.farm, f.on) : null;
        if (art) { const key = `farm:${def.farm}:${f.on}`; out.push({ id: 'fa:' + f.id, kind: 'front', ref: f.id, x: f.x, y: f.y, z: 20 + f.y * 0.001, flip: false, rot: 0, key, load: () => artTex(key, () => art) }); }
        continue;
      }
      const occupied = Object.values(w.characters).some((c) => c.seat?.furnitureId === f.id);
      const name = this.furnFile(f, night, occupied);
      const meta = FURN_SPRITES[name] ?? FURN_SPRITES[f.definitionId];
      const z = def.layer === 'wall' ? 10 + wallIdx++ * 0.01 : def.layer === 'rug' ? 100 + f.y * 0.001 : 200 + f.y;
      const oy = meta.top ? def.h / meta.upp : meta.oy;
      const y = meta.top ? f.y - def.h : f.y;
      const url = `${BASE}assets/furn/${name}.png`;
      const want: Want = { id: 'f:' + f.id, kind: 'furn', ref: f.id, x: f.x, y: meta.top ? f.y - def.h : f.y, z, flip: f.flipped, rot: 0, key: 'F:' + name, load: () => imageTex('F:' + name, url, { upp: meta.upp, ox: meta.ox, oy: meta.top ? 0 : meta.oy }) };
      void oy; void y;
      if (f.definitionId === 'tv' && f.on > 0) {
        const k = `tv:${f.on}:${this.tvFrame % 2}`;
        const on = f.on, frame = this.tvFrame % 2;
        want.overlay = { key: k, load: () => artTex(k, () => tvSceneArt(on, frame)) };
      }
      out.push(want);
      const fr = (name.endsWith('_on') ? def.frontOn : undefined) ?? def.front;
      (fr ? [fr] : def.fronts ?? []).forEach((r, i) => {
        const crop = { x: meta.ox + r.x0 / meta.upp, y: meta.oy + r.y0 / meta.upp, w: (r.x1 - r.x0) / meta.upp, h: (r.y1 - r.y0) / meta.upp };
        const key = `FF:${name}:${i}`;
        // слой рисуется на своём месте внутри мебели, поэтому у него свой сдвиг от опорной точки
        out.push({ id: `ff:${f.id}:${i}`, kind: 'front', ref: f.id, x: f.x, y: f.y, z: z + 0.5, flip: f.flipped, rot: 0, key, load: () => imageTex(key, url, { upp: meta.upp, ox: meta.ox, oy: meta.oy, crop }) });
      });
    }
    for (const f of Object.values(w.furniture)) {
      if (f.roomId !== roomId || f.definitionId !== CAROUSEL.furn) continue;
      CAROUSEL.horses.forEach((h, i) => {
        const meta = FURN_SPRITES[h.sprite], key = 'F:' + h.sprite, at = this.horseAt(f, i);
        out.push({ id: `rh:${f.id}:${i}`, kind: 'front', ref: f.id, x: at.x, y: at.y, z: 200 + f.y + at.z, flip: false, rot: 0, key, load: () => imageTex(key, `${BASE}assets/furn/${h.sprite}.png`, { upp: meta.upp, ox: meta.ox, oy: meta.oy }) });
      });
    }
    const zOfFurn = (id: string) => 200 + (w.furniture[id]?.y ?? 0);
    const charZ = new Map<string, number>();
    for (const c of Object.values(w.characters)) {
      if (c.roomId !== roomId) continue;
      const p = charPos(w, c);
      const z = c.seat ? zOfFurn(c.seat.furnitureId) + 0.2 : 200 + p.y;
      charZ.set(c.id, z);
      out.push(this.charWant(c, p, z));
    }
    for (const p of Object.values(w.pets)) {
      if (p.roomId !== roomId) continue;
      const pos = petPos(w, p);
      const box = p.inItem ? w.items[p.inItem] : undefined;
      const inBox = box && box.owner.kind === 'room' && box.owner.roomId === roomId;
      const mood: PetMood = p.sleeping ? 'sleep' : this.moodOf(p.id);
      // у жителей фермы две позы: обычная и радостная
      const name = PET_SPRITES[`${p.kind}_${mood}`] ? `${p.kind}_${mood}` : `${p.kind}_${mood === 'idle' || mood === 'sleep' ? 'idle' : 'happy'}`;
      const meta = PET_SPRITES[name];
      const key = 'P:' + name;
      out.push({ id: 'p:' + p.id, kind: 'pet', ref: p.id, x: pos.x, y: inBox ? pos.y - 20 : pos.y, z: p.seat ? zOfFurn(p.seat.furnitureId) + 0.3 : 200 + pos.y + (inBox ? -0.5 : 0), flip: p.flipped, rot: 0, key, load: () => imageTex(key, `${BASE}assets/pets/${name}.png`, meta) });
    }
    for (const it of Object.values(w.items)) {
      const pl = this.heldPlace(w, it);
      if (!pl || pl.roomId !== roomId || !pl.visible) continue;
      const o = it.owner;
      const z = o.kind === 'hand' ? (charZ.get(o.characterId) ?? 200) + 0.05 : o.kind === 'surface' ? zOfFurn(o.furnitureId) + 0.6 + o.slot * 0.001 : o.kind === 'furniture' ? zOfFurn(o.furnitureId) + 0.3 + o.slot * 0.001 : 200 + pl.y;
      const LIQ: Record<string, number> = { water: 0x8fd0f5, milk: 0xffffff, tea: 0xc98c4f };
      const liquid = it.state.contents ? (it.definitionId === 'glass' ? { color: LIQ[it.state.contents], x: 0, y: -45, rx: 10 } : { color: LIQ[it.state.contents], x: -5, y: -40, rx: 13 }) : undefined;
      out.push({ id: 'i:' + it.instanceId, kind: 'item', ref: it.instanceId, x: pl.x, y: pl.y, z, flip: false, rot: 0, liquid, bowl: it.definitionId === 'pet_double_bowl' ? { water: !!it.state.water, kibble: !!it.state.kibble } : undefined, ...this.itemTex(it) });
    }
    return out;
  }

  /** Где нарисовать вещь; вещь в руке или на голове ложится по точкам рисунка героя. */
  private heldPlace(w: World, it: ItemInst) {
    const pl = itemPlace(w, it);
    const o = it.owner;
    if (o.kind === 'hand') {
      // кисть берётся из точек спрайта героя, чтобы вещь лежала точно в руке у любой фигурки
      const c = w.characters[o.characterId];
      const sp = c?.costume && c.pose !== 'sleeping' ? CHAR_SPRITES[`${c.id}:${c.costume}:${this.poseOf(w, c)}`] : undefined;
      if (c && sp) {
        const p = charPos(w, c);
        const live = liveSeat(c);
        const k = (live ? live.flip : c.flipped) ? -1 : 1;
        const u = sp.unit / (live?.s ?? 1); // на карусели фигурка меньше — и вещь в руке ближе к ней
        if (o.slot === 'head') {
          // убор сидит на голове: маска — на глазах, корона и колпак — на макушке
          const mask = it.definitionId === 'mask';
          pl.x = p.x + (k * ((sp.eyeL.x + sp.eyeR.x) / 2 - sp.origin.x)) / u;
          pl.y = p.y + ((mask ? (sp.eyeL.y + sp.eyeR.y) / 2 : sp.browL.y) - sp.origin.y) / u + (mask ? ITEMS[it.definitionId].h * 0.5 : -34) * (live?.s ?? 1);
        } else {
        const hand = o.slot === 'both' ? { x: (sp.handL.x + sp.handR.x) / 2, y: (sp.handL.y + sp.handR.y) / 2 } : o.slot === 'left' ? sp.handL : sp.handR;
        pl.x = p.x + (k * (hand.x - sp.origin.x)) / u;
        pl.y = p.y + (hand.y - sp.origin.y) / u + ITEMS[it.definitionId].h * 0.4 * (live?.s ?? 1);
        }
      }
    }
    return pl;
  }

  private furnFile(f: FurnitureInst, night: boolean, occupied: boolean): string {
    const id = f.definitionId;
    const has = (n: string) => !!FURN_SPRITES[n];
    if (f.open && has(id + '_open')) return id + '_open';
    if (id === 'window') return night ? 'window_night' : 'window';
    if ((id === 'floorlamp' || id === 'ceilinglamp') && !night) return id + '_on';
    if ((f.on > 0 || (id === 'bathtub' && occupied)) && has(id + '_on')) return id + '_on';
    return id;
  }

  itemTex(it: Pick<ItemInst, 'definitionId' | 'state'>): { key: string; load: () => Promise<Tex> } {
    const def = ITEMS[it.definitionId];
    let name = it.definitionId;
    if (name === 'plate' && it.state.dirty) name = 'plate_dirty';
    if (name === 'giftbox' && !it.state.packed) name = 'giftbox_open';
    if (name === 'cake' && (it.state.servings ?? 6) <= 2) name = 'cake_slice';
    const sp = ITEM_SPRITES[name];
    if (sp && !(it.definitionId === 'wonderdish' && it.state.mix)) {
      const upp = Math.min((def.w + 10) / sp.w, (def.h + 10) / sp.h);
      const key = 'I:' + name;
      return { key, load: () => imageTex(key, `${BASE}assets/items/${name}.png`, { upp, ox: sp.w / 2, oy: sp.h }) };
    }
    const key = itemArtKey(it as ItemInst);
    const state = it.state, id = it.definitionId;
    return { key, load: () => artTex(key, () => itemArt(id, state)) };
  }

  private charWant(c: Character, p: Pt, z: number): Want {
    const sp = c.costume && this.world ? CHAR_SPRITES[`${c.id}:${c.costume}:${this.poseOf(this.world, c)}`] : undefined;
    const rot = c.pose === 'sleeping' ? -Math.PI / 2 : 0;
    const base = { id: 'c:' + c.id, kind: 'char' as Kind, ref: c.id, x: p.x, y: p.y, z, flip: c.flipped && c.pose !== 'sleeping', rot };
    if (sp) {
      const key = 'C:' + sp.file;
      return { ...base, key, load: () => imageTex(key, `${BASE}assets/chars/${sp.file}`, { upp: 1 / sp.unit, ox: sp.origin.x, oy: sp.origin.y }),
        face: { eyes: c.look.eyes, brows: c.look.brows, emotion: c.emotion, color: shade(HAIR_COLORS[c.look.hairColor] ?? '#3b2a26', -0.25), sp, closed: c.pose === 'sleeping', ink: faceInk(c.look.skin) } };
    }
    const key = `CV:${JSON.stringify([c.look, c.outfit, c.pose === 'sitting', c.emotion, c.pose === 'sleeping'])}`;
    const r = { look: c.look, outfit: c.outfit, pose: c.pose, emotion: c.emotion };
    return { ...base, key, load: () => artTex(key, () => characterArt(r)) };
  }

  /** Какой рисунок героя нужен: стоя, сидя или верхом — если для этого наряда есть поза верхом на карусели. */
  private poseOf(w: World, c: Character): 'stand' | 'sit' | 'ride' {
    if (c.pose !== 'sitting') return 'stand';
    const f = c.seat && w.furniture[c.seat.furnitureId];
    return f && f.definitionId === CAROUSEL.furn && CHAR_SPRITES[`${c.id}:${c.costume}:ride`] ? 'ride' : 'sit';
  }

  // ---------- карусель ----------
  /** Где сейчас лошадка: точка седла, глубина (1 — ближе всех, −1 — дальше всех), размер и разворот по ходу. */
  private horseAt(f: FurnitureInst, i: number) {
    let st = this.rides.get(f.id);
    if (!st) { st = { a: CAROUSEL.start, v: 0 }; this.rides.set(f.id, st); }
    const C = CAROUSEL, o = C.orbit, ang = st.a + i * Math.PI;
    const depth = Math.cos(ang);
    const bob = C.bob * Math.sin(st.a * C.bobs + i * Math.PI);
    const size = 1 - (1 - C.far) * (1 - depth) / 2;
    // у края круга лошадка разворачивается: ближняя идёт вправо, дальняя — влево, обе головой вперёд
    const turn = Math.max(-1, Math.min(1, depth / C.turn));
    const face = Math.sign(turn || 1) * Math.max(0.12, Math.abs(turn));
    return {
      x: f.x + o.a * Math.sin(ang) * C.unit, y: f.y + (o.y + o.b * depth + bob - C.foot.y) * C.unit,
      depth, size, face, z: depth > 0 ? 0.7 : 0.3,
      floor: f.y + (C.pole.floor + o.b * depth - C.foot.y) * C.unit, top: f.y + (C.pole.top - C.foot.y) * C.unit,
    };
  }
  /** Седло как живое место для правил игры: туда садятся, оттуда берут героя, там же его руки и голова. */
  private rideSeat(furnitureId: string, slot: number): LiveSeat | null {
    const f = this.world?.furniture[furnitureId];
    if (!f || f.definitionId !== CAROUSEL.furn || f.roomId !== this.roomId || !CAROUSEL.horses[slot]) return null;
    const at = this.horseAt(f, slot);
    return { x: at.x, y: at.y, s: CAROUSEL.rider * at.size, flip: at.face < 0 };
  }
  private rideTick(dt: number) {
    const w = this.world;
    if (!w) return;
    const C = CAROUSEL;
    for (const f of Object.values(w.furniture)) {
      if (f.definitionId !== C.furn || f.roomId !== this.roomId) continue;
      const base = this.nodes.get('f:' + f.id);
      if (!base) continue;
      const st = this.rides.get(f.id) ?? { a: C.start, v: 0 };
      this.rides.set(f.id, st);
      const top = (Math.PI * 2) / C.period;
      // ребром к зрителю не останавливаемся: доезжаем до места, где лошадок хорошо видно
      const edge = Math.abs(Math.cos(st.a)) < C.turn * 1.6;
      const want = f.on ? top : edge && st.v > 0 ? top * 0.3 : 0;
      const step = (top / C.ramp) * dt;
      st.v += Math.max(-step, Math.min(step, want - st.v));
      st.a = (st.a + st.v * dt) % (Math.PI * 2);
      C.horses.forEach((h, i) => {
        const at = this.horseAt(f, i);
        const z = base.c.zIndex + at.z;
        const n = this.nodes.get(`rh:${f.id}:${i}`);
        if (n) {
          n.c.position.set(at.x, at.y);
          n.c.scale.set(at.face * at.size, at.size);
          n.c.zIndex = z;
          // шест: тонкая золотая линия от крыши до платформы, внутри группы лошадки и позади неё
          if (!n.pole) { n.pole = new Graphics(); n.c.addChildAt(n.pole, 0); }
          const px = h.pole * C.unit, y0 = (at.top - at.y) / at.size, y1 = (at.floor - at.y) / at.size, pw = C.pole.w * C.unit;
          n.pole.clear().rect(px - pw / 2, y0, pw, y1 - y0).fill(C.pole.color).rect(px - pw / 2, y0, pw * 0.35, y1 - y0).fill({ color: 0xffffff, alpha: 0.35 });
        }
        for (const c of Object.values(w.characters)) {
          if (c.seat?.furnitureId !== f.id || c.seat.slot !== i || c.roomId !== this.roomId) continue;
          const cn = this.nodes.get('c:' + c.id);
          if (!cn || this.dragging === c.id || this.animating.has(c.id)) continue;
          const k = C.rider * at.size;
          cn.c.position.set(at.x, at.y);
          cn.by = at.y;
          cn.c.scale.set(at.face * k, k);
          cn.c.zIndex = z + 0.05;
          for (const it of Object.values(w.items)) {
            if (it.owner.kind !== 'hand' || it.owner.characterId !== c.id) continue;
            const inn = this.nodes.get('i:' + it.instanceId);
            if (!inn || this.dragging === it.instanceId || this.animating.has(it.instanceId)) continue;
            const pl = this.heldPlace(w, it);
            if (!pl) continue;
            inn.c.position.set(pl.x, pl.y);
            inn.c.scale.set(k, k);
            inn.c.zIndex = z + 0.1;
          }
        }
      });
    }
  }

  /** Лицо — отдельный слой: пять деталей в точках, заданных для каждого спрайта. */
  private syncFace(n: Node, f: FaceWant | undefined) {
    n.face = f;
    if (!f) { if (n.parts) { for (const s of Object.values(n.parts)) s.destroy(); n.parts = undefined; } return; }
    if (!n.parts) {
      n.parts = { eyeL: new Sprite(), eyeR: new Sprite(), browL: new Sprite(), browR: new Sprite(), mouth: new Sprite() };
      for (const s of Object.values(n.parts)) n.c.addChild(s);
    }
    this.paintFace(n);
  }
  private paintFace(n: Node) {
    const f = n.face, parts = n.parts;
    if (!f || !parts) return;
    const blink = f.closed || performance.now() < n.blinkUntil;
    const sp = f.sp;
    const put = (s: Sprite, at: Pt, key: string, make: () => Art, visible = true) => {
      s.visible = visible;
      s.position.set((at.x - sp.origin.x) / sp.unit, (at.y - sp.origin.y) / sp.unit);
      if ((s as Sprite & { _k?: string })._k === key) return;
      (s as Sprite & { _k?: string })._k = key;
      const apply = (t: Tex) => { if ((s as Sprite & { _k?: string })._k !== key) return; s.texture = t.texture; s.anchor.set(t.ox / t.w, t.oy / t.h); s.scale.set(t.upp * sp.faceScale); };
      const c = getTex(key);
      if (c) apply(c); else void artTex(key, make).then(apply);
    };
    for (const side of [-1, 1] as const) {
      const st = eyeStateFor(f.emotion, side, blink);
      put(side < 0 ? parts.eyeL : parts.eyeR, side < 0 ? sp.eyeL : sp.eyeR, `eye:${f.eyes}:${st}:${side}:${f.ink}`, () => eyeArt(f.eyes, st, side, f.ink));
      put(side < 0 ? parts.browL : parts.browR, side < 0 ? sp.browL : sp.browR, `brow:${f.brows}:${f.emotion}:${side}:${f.color}`, () => browArt(f.brows, f.emotion, side, f.color), !blink || !f.closed);
    }
    // пока герой говорит, рот слегка шевелится: открытый и обычный кадры чередуются
    const mouthEmotion = f.closed ? 'sleepy' : this.talking.has(n.ref) && this.talkFrame % 2 === 0 ? 'talk' : f.emotion;
    put(parts.mouth, sp.mouth, `mouth:${mouthEmotion}${f.ink === faceInk(0) ? '' : ':' + f.ink}`, () => mouthArt(mouthEmotion, f.ink));
  }

  private syncOverlay(n: Node, o: Want['overlay']) {
    if (!o) { if (n.overlay) { n.overlay.destroy(); n.overlay = undefined; n.overlayKey = undefined; } return; }
    if (!n.overlay) { n.overlay = new Sprite(); n.c.addChild(n.overlay); }
    if (n.overlayKey === o.key) return;
    n.overlayKey = o.key;
    const s = n.overlay;
    void o.load().then((t) => { if (n.overlayKey !== o.key || s.destroyed) return; s.texture = t.texture; s.position.set(TV_SCREEN.x0, TV_SCREEN.y0); s.width = TV_SCREEN.x1 - TV_SCREEN.x0; s.height = TV_SCREEN.y1 - TV_SCREEN.y0; });
  }

  private syncLiquid(n: Node, l: Want['liquid']) {
    const key = l ? `${l.color}:${l.x}:${l.y}:${l.rx}` : '';
    if (n.liquidKey === key) return;
    n.liquidKey = key;
    n.liquid?.destroy();
    n.liquid = undefined;
    if (!l) return;
    const g = new Graphics();
    g.ellipse(l.x, l.y, l.rx, l.rx * 0.34).fill({ color: l.color }).stroke({ color: 0x5a4a5c, width: 1.5, alpha: 0.5 });
    g.ellipse(l.x - l.rx * 0.3, l.y - 0.6, l.rx * 0.3, l.rx * 0.1).fill({ color: 0xffffff, alpha: 0.7 });
    n.c.addChild(g);
    n.liquid = g;
  }

  private syncBowl(n: Node, b: Want['bowl']) {
    const key = b ? `${b.water}:${b.kibble}` : '';
    if (n.bowlKey === key) return;
    n.bowlKey = key;
    n.bowlG?.destroy();
    n.bowlG = undefined;
    if (!b || (!b.water && !b.kibble)) return;
    const g = new Graphics();
    if (b.water) {
      g.ellipse(-23.5, -35, 15, 7).fill({ color: 0x8fd0f5 }).stroke({ color: 0x6bb3de, width: 1.2 });
      g.ellipse(-28, -36.5, 5, 1.8).fill({ color: 0xffffff, alpha: 0.75 });
    }
    if (b.kibble) {
      g.ellipse(24, -34.5, 15, 7).fill({ color: 0xb9783f });
      for (const [x, y] of [[15, -36], [22, -39], [30, -37], [19, -33], [27, -33], [24, -36.5], [33, -34]]) g.ellipse(x, y, 4.2, 3.2).fill({ color: 0xcf8f4f }).stroke({ color: 0x9a6230, width: 0.8 });
    }
    n.c.addChild(g);
    n.bowlG = g;
  }

  /** Волшебная ночь: в темноте светятся ночники, а спящим снятся сны. */
  private syncGlow(w: World, roomId: RoomId) {
    for (const ch of this.glow.removeChildren()) ch.destroy();
    if (w.rooms[roomId].lightOn) return;
    for (const it of Object.values(w.items)) {
      if (it.definitionId !== 'starlamp') continue;
      const pl = itemPlace(w, it);
      if (pl.roomId !== roomId || !pl.visible) continue;
      const g = new Graphics();
      for (let i = 5; i >= 1; i--) g.circle(pl.x, pl.y - 30, i * 34).fill({ color: 0xffe9a8, alpha: 0.085 });
      const tx = this.itemTex(it);
      const s = new Sprite();
      void tx.load().then((t) => { if (s.destroyed) return; s.texture = t.texture; s.anchor.set(t.ox / t.w, t.oy / t.h); s.scale.set(t.upp); });
      s.position.set(pl.x, pl.y);
      this.glow.addChild(g, s);
    }
    for (const c of Object.values(w.characters)) {
      if (c.roomId !== roomId || c.pose !== 'sleeping' || !c.dream || !ITEMS[c.dream]) continue;
      const p = charPos(w, c);
      const bx = p.x - 150, by = p.y - 190;
      const g = new Graphics();
      g.circle(bx - 44, by + 70, 7).fill({ color: 0xffffff, alpha: 0.9 }).circle(bx - 30, by + 50, 11).fill({ color: 0xffffff, alpha: 0.9 });
      for (const [dx, dy, r] of [[0, 0, 46], [-34, 8, 30], [34, 8, 30], [-16, -22, 30], [18, -22, 30]]) g.circle(bx + dx, by + dy, r).fill({ color: 0xffffff, alpha: 0.95 });
      const tx = this.itemTex({ definitionId: c.dream, state: {} });
      const s = new Sprite();
      void tx.load().then((t) => { if (s.destroyed) return; s.texture = t.texture; s.anchor.set(t.ox / t.w, 0.5); s.scale.set(Math.min(t.upp, 60 / (t.h * t.upp) * t.upp)); });
      s.position.set(bx, by);
      (g as Graphics & { _bob?: number })._bob = by;
      this.glow.addChild(g, s);
    }
  }

  // ---------- касания ----------
  /** Верхний реально видимый объект под точкой; маленьким предметам помогает расширенная зона. */
  pick(pt: Pt, opts: { furniture?: boolean; except?: string } = {}): { kind: Kind; ref: string } | null {
    const list = [...this.nodes.values()].sort((a, b) => b.c.zIndex - a.c.zIndex);
    let exact: Node | null = null;
    for (const n of list) {
      if (!n.tex || n.ref === opts.except || this.animating.has(n.ref)) continue;
      if (this.hitNode(n, pt)) { exact = n; break; }
    }
    // седок за колонной или за ближней лошадкой: мебель не мешает взять того, кто на ней сидит
    if (exact && this.rides.has(exact.ref) && (exact.kind === 'front' || exact.kind === 'furn')) {
      const seatOn = exact.ref;
      const rider = list.find((n) => n.kind === 'char' && n.tex && n.ref !== opts.except && !this.animating.has(n.ref) && this.world?.characters[n.ref]?.seat?.furnitureId === seatOn && this.hitNode(n, pt));
      if (rider) exact = rider;
    }
    if (exact && (exact.kind === 'item' || exact.kind === 'pet' || exact.kind === 'char')) return { kind: exact.kind, ref: exact.ref };
    // рядом с маленьким предметом — выбираем его, если точное попадание пришлось на мебель или пустое место
    let near: { n: Node; d: number } | null = null;
    for (const n of list) {
      if (n.kind !== 'item' || !n.tex || n.ref === opts.except || this.animating.has(n.ref)) continue;
      const def = this.world && ITEMS[this.world.items[n.ref]?.definitionId];
      if (!def) continue;
      const d = Math.hypot(pt.x - n.c.x, pt.y - (n.c.y - def.h / 2));
      if (d < Math.max(30, 24 / this.scale + def.w * 0.25) && (!near || d < near.d)) near = { n, d };
    }
    if (near) return { kind: 'item', ref: near.n.ref };
    if (exact) return { kind: exact.kind === 'front' ? 'furn' : exact.kind, ref: exact.ref };
    return null;
  }
  private hitNode(n: Node, pt: Pt): boolean {
    let dx = pt.x - n.c.x, dy = pt.y - n.c.y;
    if (n.c.rotation) { const r = -n.c.rotation, cs = Math.cos(r), sn = Math.sin(r); [dx, dy] = [dx * cs - dy * sn, dx * sn + dy * cs]; }
    dx /= n.c.scale.x; dy /= n.c.scale.y;
    return hitTex(n.tex!, dx, dy);
  }
  nodePos(ref: string): Pt | null {
    for (const n of this.nodes.values()) if (n.ref === ref && n.kind !== 'front') return { x: n.c.x, y: n.c.y };
    return null;
  }
  /** Для проверок: какой рисунок сейчас у героя и как повёрнута карусель. */
  spriteOf(ref: string): string { return this.nodeOf(ref)?.key ?? ''; }
  rideOf(furnitureId: string) { const st = this.rides.get(furnitureId); return st ? { angle: st.a, speed: st.v } : null; }
  private nodeOf(ref: string): Node | undefined {
    for (const n of this.nodes.values()) if (n.ref === ref && n.kind !== 'front') return n;
    return undefined;
  }

  // ---------- перетаскивание ----------
  dragStart(ref: string) {
    const n = this.nodeOf(ref);
    if (!n) return;
    this.dragging = ref;
    n.c.zIndex = 1e6;
    n.c.rotation = 0;
    const sx = Math.sign(n.c.scale.x) || 1;
    this.tween(120, (k) => n.c.scale.set(sx * (1 + 0.1 * k), 1 + 0.1 * k));
  }
  dragMove(ref: string, p: Pt) { const n = this.nodeOf(ref); if (n) n.c.position.set(p.x, p.y); }
  dragEnd() { this.dragging = null; this.hlTarget = null; if (this.world) this.sync(this.world); }
  setHighlight(t: { x: number; y: number; r: number } | null) { this.hlTarget = t; }
  setSelected(ref: string | null) { this.selId = ref; }

  /** Короткая пробежка: объект плавно едет в точку, по дороге слегка подпрыгивая. Мир меняется в done. */
  glide(ref: string, to: Pt, ms: number, done: () => void) {
    const n = this.nodeOf(ref);
    if (!n || this.reducedMotion) { done(); return; }
    this.animating.add(ref);
    const x0 = n.c.x, y0 = n.c.y;
    this.tween(ms, (k) => { const e = k * k * (3 - 2 * k); n.c.position.set(x0 + (to.x - x0) * e, y0 + (to.y - y0) * e - Math.abs(Math.sin(k * Math.PI * 4)) * 10); }, () => { this.animating.delete(ref); done(); });
  }

  // ---------- живые вещи клуба ----------
  /** Играет ли сейчас клубный трек: по этому же ритму танцуют герои и пульсирует колонка. */
  setBeat(on: boolean, beatMs = 500) {
    if (on && !this.beatOn) this.danceT0 = performance.now();
    this.beatOn = on;
    this.danceBeat = beatMs;
  }
  /** Что сейчас работает в клубе — для проверок. */
  clubFx() { return { ball: this.clubState.ballAmp > 0.02, ballOn: this.clubState.ball, stars: this.clubState.lightId !== null, pulse: this.beatOn && this.clubState.speakerId !== null, speakerScale: (() => { const n = this.clubState.speakerId ? this.nodeOf(this.clubState.speakerId) : undefined; return n?.tex ? n.body.scale.y / n.tex.upp : 1; })(), stars_n: this.particles.length }; }
  private clubTick(dt: number, now: number) {
    const st = this.clubState;
    // --- диско-шар: плитки медленно едут по круглой поверхности, по стенам и полу плывут мягкие блики
    st.ballAmp = Math.max(0, Math.min(1, st.ballAmp + (st.ball && !this.reducedMotion ? dt : -dt) / 700));
    this.clubBall.clear(); this.clubGlints.clear();
    if (st.ballAmp > 0) {
      const { x: cx, y: cy, r } = DISCO_BALL;
      const turn = now / 9000; // один оборот за 9 секунд — без мелькания
      const tint = [0xd9c8ff, 0xffc4e4, 0xbfe6ff, 0xa9efe2, 0xfff1c9, 0xe6d6ff];
      const rows = 9, cols = 14;
      for (let j = 0; j < rows; j++) {
        const lat0 = -Math.PI / 2 + (j * Math.PI) / rows, lat1 = lat0 + Math.PI / rows;
        const y0 = cy + r * Math.sin(lat0), y1 = cy + r * Math.sin(lat1), mid = (lat0 + lat1) / 2;
        for (let i = 0; i < cols; i++) {
          const a0 = ((i / cols + turn) % 1) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / cols;
          if (Math.cos((a0 + a1) / 2) <= 0.05) continue; // дальняя сторона шара не видна
          const xa = cx + r * Math.cos(mid) * Math.sin(a0), xb = cx + r * Math.cos(mid) * Math.sin(a1);
          const shine = 0.35 + 0.5 * Math.cos((a0 + a1) / 2) * (0.6 + 0.4 * Math.sin((i * 7 + j * 5) * 1.3));
          this.clubBall.rect(Math.min(xa, xb) + 1, y0 + 1, Math.abs(xb - xa) - 2, y1 - y0 - 2).fill({ color: tint[(i + j * 2) % tint.length], alpha: 0.78 * st.ballAmp * shine + 0.12 * st.ballAmp });
        }
      }
      const glow = [0xff8fd0, 0x8fe8ff, 0xffd98a, 0xc9a6ff, 0x8ff0c8, 0xff9fb0, 0x9fc0ff];
      for (let i = 0; i < 9; i++) {
        const ph = now / (11000 + i * 900) + i * 0.71;
        const gx = 800 + Math.sin(ph * Math.PI * 2) * (260 + i * 62), gy = (i % 3 === 0 ? 720 : 330) + Math.cos(ph * Math.PI * 2 + i) * (i % 3 === 0 ? 90 : 150);
        const rad = 46 + (i % 4) * 12;
        for (let q = 0; q < 8; q++) { const k = 1 - q / 8; this.clubGlints.ellipse(gx, gy, rad * k * 1.5, rad * k).fill({ color: glow[i % glow.length], alpha: 0.022 * st.ballAmp }); } // много тонких слоёв — мягкий край без колец
      }
    }
    // --- прожектор: звёздочки летят из линзы на танцпол (из того места, где лампа стоит сейчас)
    const lamp = st.lightId ? this.nodeOf(st.lightId) : undefined;
    if (lamp && now > st.starAt && this.dragging !== st.lightId) {
      st.starAt = now + (this.reducedMotion ? 600 : 170);
      const dir = lamp.c.scale.x < 0 ? 1 : -1; // линза на картинке смотрит влево
      const g = new Graphics();
      g.star(0, 0, 5, 10 + Math.random() * 5, 4.6).fill({ color: [0xff9ccf, 0xffd76a, 0x7fe3d4][Math.floor(Math.random() * 3)] });
      g.position.set(lamp.c.x + dir * 34, lamp.c.y - 138);
      this.fx.addChild(g);
      this.particles.push({ s: g, vx: dir * (0.06 + Math.random() * 0.11), vy: 0.03 + Math.random() * 0.06, g: 0.00004, life: 0, max: 2300 + Math.random() * 700, spin: (Math.random() - 0.5) * 0.004 });
    }
    // --- колонка: динамики слегка пульсируют в такт, иногда вылетают нотки
    const sp = st.speakerId ? this.nodeOf(st.speakerId) : undefined;
    if (sp && sp.tex) {
      const base = sp.tex.upp;
      if (this.beatOn && !this.reducedMotion && this.dragging !== st.speakerId) {
        const k = ((now - this.danceT0) / this.danceBeat) % 1;
        const pulse = Math.exp(-k * 5) * 0.035; // короткий мягкий толчок на каждый удар
        sp.body.scale.set(base * (1 + pulse * 0.5), base * (1 + pulse));
        if (now > st.noteAt) {
          st.noteAt = now + this.danceBeat * 8 + Math.random() * 600;
          for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
            const g = new Graphics();
            const col = [0xffc8ea, 0xffe08a, 0x9fe8dc][i % 3];
            g.ellipse(0, 0, 6, 4.5).fill({ color: col }).rect(4.5, -17, 2.2, 17).fill({ color: col }).ellipse(8, -15, 5, 2.6).fill({ color: col });
            g.position.set(sp.c.x - 20 + i * 22, sp.c.y - 210);
            this.fx.addChild(g);
            this.particles.push({ s: g, vx: (Math.random() - 0.5) * 0.03, vy: -0.05 - Math.random() * 0.02, g: 0, life: -i * 180, max: 1700, spin: 0 });
          }
        }
      } else if (sp.body.scale.x !== base || sp.body.scale.y !== base) sp.body.scale.set(base, base);
    }
  }

  // ---------- танец ----------
  private dance = new Map<string, { on: boolean; amp: number }>();
  private danceT0 = 0;
  private danceBeat = 500;
  /**
   * Кто сейчас танцует (герои на танцполе, пока играет клубный трек). Цикл на четыре удара:
   * качнулся влево → вправо → маленький подскок → мягко приземлился. Фигурка целиком (с лицом) качается вокруг точки у ступней.
   */
  setDancers(ids: string[], beatMs = 500) {
    if (!this.beatOn && !this.dance.size && ids.length) this.danceT0 = performance.now();
    this.danceBeat = beatMs;
    const want = new Set(ids);
    for (const [id, d] of this.dance) d.on = want.has(id);
    for (const id of ids) if (!this.dance.has(id)) this.dance.set(id, { on: true, amp: 0 });
  }
  get dancing(): string[] { return [...this.dance].filter(([, d]) => d.on).map(([id]) => id); }
  private danceTick(dt: number, now: number) {
    if (!this.dance.size) return;
    const phase = ((now - this.danceT0) / this.danceBeat) % 4;
    for (const [id, d] of this.dance) {
      const n = this.nodeOf(id);
      const held = this.dragging === id || this.animating.has(id);
      // унесли с танцпола — сразу обычная поза; музыка стихла — движение мягко заканчивается
      if (!n || held || this.reducedMotion) { if (n && !held) { n.c.rotation = 0; n.c.y = n.by; } else if (n) n.c.rotation = 0; this.dance.delete(id); continue; }
      d.amp = Math.max(0, Math.min(1, d.amp + (d.on ? dt : -dt) / 240));
      if (!d.on && d.amp <= 0) { n.c.rotation = 0; n.c.y = n.by; this.dance.delete(id); continue; }
      // у каждого свой характер: кто-то больше качается, кто-то чаще подпрыгивает — но ритм общий
      let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
      const sway = 0.045 + (h % 5) * 0.012, hop = 7 + (h % 4) * 3, extraHop = h % 3 === 0;
      const beat = Math.floor(phase), k = phase - beat, bump = Math.sin(k * Math.PI);
      let rot = 0, up = 0;
      if (beat === 0) { rot = -sway * bump; if (extraHop) up = hop * 0.45 * bump; }
      else if (beat === 1) rot = sway * bump;
      else if (beat === 2) up = hop * Math.sin(k * Math.PI * 0.5); // подскок
      else up = hop * (1 - k) * (1 - k); // мягкое приземление
      n.c.rotation = rot * d.amp;
      n.c.y = n.by - up * d.amp;
    }
  }

  // ---------- вещь «оживает» по нажатию ----------
  trick(ref: string, kind: 'bounce' | 'roll' | 'fly' | 'wiggle' | 'spin' | 'squash') {
    const n = this.nodeOf(ref);
    if (!n || this.animating.has(ref) || this.dragging === ref) return;
    if (this.reducedMotion) { this.pop(ref, 0.12); return; }
    this.animating.add(ref);
    const x0 = n.c.x, y0 = n.c.y, sx = n.c.scale.x, sy = n.c.scale.y;
    const dur = kind === 'fly' ? 1300 : kind === 'roll' ? 1100 : 800;
    this.tween(dur, (k) => {
      const s = Math.sin(k * Math.PI);
      if (kind === 'bounce') n.c.y = y0 - Math.abs(Math.sin(k * Math.PI * 3)) * 70 * (1 - k * 0.6);
      else if (kind === 'roll') { n.c.x = x0 + Math.sin(k * Math.PI * 2) * 110; n.c.rotation = Math.sin(k * Math.PI * 4) * 0.06; }
      else if (kind === 'fly') { n.c.y = y0 - s * 230; n.c.x = x0 + Math.sin(k * Math.PI * 4) * 14; }
      else if (kind === 'wiggle') n.c.rotation = Math.sin(k * Math.PI * 6) * 0.22 * (1 - k);
      else if (kind === 'spin') n.c.rotation = k * Math.PI * 2;
      else n.c.scale.set(sx * (1 + 0.22 * Math.sin(k * Math.PI * 4) * (1 - k)), sy * (1 - 0.22 * Math.sin(k * Math.PI * 4) * (1 - k)));
    }, () => { n.c.rotation = 0; n.c.scale.set(sx, sy); n.c.position.set(x0, y0); this.animating.delete(ref); if (this.world) this.sync(this.world); });
  }

  // ---------- еда и питьё ----------
  /** Где у героя рот (в координатах комнаты). */
  mouthPos(ref: string): Pt | null {
    const c = this.world?.characters[ref];
    const n = this.nodeOf(ref);
    if (!c || !n) return null;
    const sp = c.costume ? CHAR_SPRITES[`${c.id}:${c.costume}:${c.pose === 'sitting' ? 'sit' : 'stand'}`] : undefined;
    if (sp) return { x: n.c.x + ((c.flipped ? -1 : 1) * (sp.mouth.x - sp.origin.x)) / sp.unit, y: n.c.y + (sp.mouth.y - sp.origin.y) / sp.unit };
    return { x: n.c.x, y: n.c.y - (c.pose === 'sitting' ? 115 : 162) };
  }
  get busy() { return this.animating.size > 0; }
  /**
   * Вещь подлетает ко рту: еду герой откусывает, из чашки пьёт (чашка наклоняется).
   * Пока идёт анимация, вещь нельзя схватить; состояние мира меняется в done.
   */
  consume(ref: string, mouth: Pt, kind: 'eat' | 'drink' | 'scrub' | 'stroke' | 'rub' | 'tilt', done: () => void) {
    const n = this.nodeOf(ref);
    if (!n || !n.tex) { done(); return; }
    this.animating.add(ref);
    const h = n.tex.oy * n.tex.upp;
    const x0 = n.c.x, y0 = n.c.y;
    const off: Record<typeof kind, [number, number]> = { eat: [0, h * 0.55], drink: [16, h * 0.75], scrub: [h * 0.88, 8], stroke: [0, h * 0.5], rub: [0, h * 0.5], tilt: [-34, -8] };
    const tx = mouth.x + off[kind][0], ty = mouth.y + off[kind][1];
    const dur = kind === 'eat' || kind === 'drink' ? 560 : 1000;
    n.c.zIndex = 1e6 - 1;
    n.c.scale.set(1);
    this.tween(240, (k) => { const e = 1 - (1 - k) * (1 - k); n.c.position.set(x0 + (tx - x0) * e, y0 + (ty - y0) * e); }, () => {
      this.tween(dur, (k) => {
        const sw = Math.sin(k * Math.PI * 6);
        if (kind === 'drink') n.c.rotation = -Math.sin(k * Math.PI) * 0.55; // наклон чашки ко рту
        else if (kind === 'eat') n.c.scale.set(1 - 0.2 * Math.abs(Math.sin(k * Math.PI * 2)) - 0.12 * k);
        else if (kind === 'scrub') { n.c.rotation = -1.25; n.c.position.set(tx + sw * 9, ty); } // щётка лежит боком и ходит туда-сюда
        else if (kind === 'stroke') n.c.position.set(tx + Math.sin(k * Math.PI * 3) * 26, ty + Math.abs(Math.sin(k * Math.PI * 3)) * 16); // расчёска по волосам
        else if (kind === 'rub') n.c.position.set(tx + Math.cos(k * Math.PI * 6) * 14, ty + sw * 12); // круги по лицу
        else n.c.rotation = -Math.sin(k * Math.PI) * 0.7; // лейка наклоняется
      }, () => { n.c.rotation = 0; n.c.scale.set(1); this.animating.delete(ref); done(); });
    });
  }

  // ---------- речь ----------
  setTalking(ref: string, on: boolean) {
    if (on) this.talking.add(ref); else this.talking.delete(ref);
    const n = this.nodeOf(ref);
    if (n) this.paintFace(n);
  }
  /** Точка над головой героя (в координатах комнаты) — для пузырька с репликой. Работает для обеих поз. */
  headTop(ref: string): Pt | null {
    const c = this.world?.characters[ref];
    const n = this.nodeOf(ref);
    if (!c || !n) return null;
    const sp = c.costume ? CHAR_SPRITES[`${c.id}:${c.costume}:${c.pose === 'sitting' ? 'sit' : 'stand'}`] : undefined;
    const up = sp ? (sp.origin.y - sp.browL.y) / sp.unit + 78 : c.pose === 'sitting' ? 215 : 262;
    return c.pose === 'sleeping' ? { x: n.c.x - 190, y: n.c.y - 80 } : { x: n.c.x, y: n.c.y - up };
  }

  // ---------- реакции ----------
  tween(dur: number, step: (k: number) => void, done?: () => void) { this.tweens.push({ t: 0, dur: this.reducedMotion ? 1 : dur, step, done }); }
  pop(ref: string, amount = 0.14) {
    const n = this.nodeOf(ref);
    if (!n) return;
    const sx = Math.sign(n.c.scale.x) || 1;
    this.tween(280, (k) => { const s = 1 + Math.sin(k * Math.PI) * amount; n.c.scale.set(sx * (2 - s), s); }, () => n.c.scale.set(sx, 1));
  }
  hop(ref: string, h = 26) {
    const n = this.nodeOf(ref);
    if (!n || this.reducedMotion) return;
    const y0 = n.c.y;
    this.tween(340, (k) => { n.c.y = y0 - Math.sin(k * Math.PI) * h; }, () => { n.c.y = y0; });
  }
  setPetMood(id: string, mood: PetMood, ms = 1500) {
    this.petMoods.set(id, { mood, until: performance.now() + ms });
    if (this.world) this.sync(this.world);
    setTimeout(() => { if (this.world) this.sync(this.world); }, ms + 30);
  }
  private moodOf(id: string): PetMood { const m = this.petMoods.get(id); return m && m.until > performance.now() ? m.mood : 'idle'; }

  burst(kind: 'heart' | 'star' | 'bubble' | 'confetti' | 'steam' | 'crumb' | 'zzz', at: Pt, n = 8) {
    if (this.reducedMotion && kind === 'confetti') return;
    const count = this.reducedMotion ? Math.min(n, 3) : n;
    const colors = [0xff8a73, 0xffd166, 0x7fd1b9, 0x8fc3f2, 0xb79df0];
    for (let i = 0; i < count; i++) {
      let s: Sprite | Graphics;
      if (kind === 'heart' || kind === 'star') {
        const sp = new Sprite(); s = sp;
        const key = 'fx:' + kind;
        void artTex(key, () => ({ svg: kind === 'heart' ? heart(0, 0, 9, '#ff7f8f') : star(0, 0, 11, '#ffd94d'), x: -16, y: -16, w: 32, h: 32 })).then((t) => { if (!sp.destroyed) { sp.texture = t.texture; sp.anchor.set(0.5); sp.scale.set(t.upp); } });
      } else {
        const g = new Graphics(); s = g;
        if (kind === 'confetti') g.rect(-5, -3, 10, 6).fill({ color: colors[i % colors.length] });
        else if (kind === 'bubble') g.circle(0, 0, 5 + Math.random() * 6).fill({ color: 0xe8f6ff, alpha: 0.9 }).stroke({ color: 0x8fc3f2, width: 1.5 });
        else if (kind === 'steam') g.circle(0, 0, 9).fill({ color: 0xffffff, alpha: 0.7 });
        else if (kind === 'zzz') g.circle(0, 0, 4).fill({ color: 0x8f7be0, alpha: 0.8 });
        else g.circle(0, 0, 3).fill({ color: 0xe9b872 });
      }
      const up = kind === 'steam' || kind === 'bubble' || kind === 'heart' || kind === 'zzz';
      s.position.set(at.x + (Math.random() - 0.5) * 50, at.y + (Math.random() - 0.5) * 20);
      this.fx.addChild(s);
      this.particles.push({ s, vx: (Math.random() - 0.5) * (kind === 'confetti' ? 0.5 : 0.12), vy: up ? -0.06 - Math.random() * 0.08 : -0.25 - Math.random() * 0.2, g: up ? 0 : 0.0009, life: 0, max: 700 + Math.random() * 500, spin: kind === 'confetti' ? (Math.random() - 0.5) * 0.02 : 0 });
    }
  }
  private clearFx() { for (const p of this.particles) p.s.destroy(); this.particles = []; }

  // ---------- кадр ----------
  private tick(dt: number) {
    const now = performance.now();
    this.night.alpha += (this.nightAlpha - this.night.alpha) * Math.min(1, dt / 180);
    this.danceTick(dt, now);
    this.clubTick(dt, now);
    this.rideTick(dt);
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const t = this.tweens[i];
      t.t += dt;
      const k = Math.min(1, t.t / t.dur);
      // вещь могли убрать посреди анимации (подарок открыли, еду съели): такая анимация просто снимается и не останавливает остальные
      let alive = true;
      try { t.step(k); } catch { alive = false; }
      if (k >= 1 || !alive) { const at = this.tweens.indexOf(t); if (at >= 0) this.tweens.splice(at, 1); try { t.done?.(); } catch { /* объект уже удалён */ } }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt; p.vy += p.g * dt;
      p.s.x += p.vx * dt; p.s.y += p.vy * dt; p.s.rotation += p.spin * dt;
      p.s.alpha = Math.max(0, 1 - p.life / p.max);
      if (p.life >= p.max) { p.s.destroy(); this.particles.splice(i, 1); }
    }
    for (const n of this.nodes.values()) {
      if (!n.face || n.face.closed) continue;
      if (now > n.blinkAt) { n.blinkUntil = now + 130; n.blinkAt = now + 2200 + Math.random() * 3200; this.paintFace(n); n.pulse = 1; }
      else if (n.pulse && now > n.blinkUntil) { n.pulse = 0; this.paintFace(n); }
    }
    const tf = Math.floor(now / 150);
    if (tf !== this.talkFrame) { this.talkFrame = tf; for (const id of this.talking) { const n = this.nodeOf(id); if (n) this.paintFace(n); } }
    // телевизор: смена кадра сценки
    const frame = Math.floor(now / 600);
    if (frame !== this.tvFrame) { this.tvFrame = frame; if (this.world && Object.values(this.world.furniture).some((f) => f.definitionId === 'tv' && f.on > 0 && f.roomId === this.roomId)) this.sync(this.world); }
    this.hl.clear();
    const pulse = 0.55 + Math.sin(now / 160) * 0.25;
    if (this.hlTarget) this.hl.circle(this.hlTarget.x, this.hlTarget.y, this.hlTarget.r).fill({ color: 0xffffff, alpha: 0.22 * pulse + 0.1 }).stroke({ color: 0xffd166, width: 6, alpha: pulse });
    if (this.selId) {
      const n = this.nodeOf(this.selId);
      if (n && n.tex) { const h = (n.tex.oy * n.tex.upp); this.hl.ellipse(n.c.x, n.c.y - 2, Math.max(34, n.tex.w * n.tex.upp * 0.42), 14).stroke({ color: 0x7fd1b9, width: 6, alpha: pulse + 0.2 }); void h; }
    }
  }

  private drawDebug(w: World, roomId: RoomId) {
    const g = this.debugG;
    g.clear();
    const cross = (x: number, y: number, color: number, r = 7) => { g.moveTo(x - r, y).lineTo(x + r, y).moveTo(x, y - r).lineTo(x, y + r).stroke({ color, width: 2.5 }); };
    for (const c of Object.values(w.characters)) {
      if (c.roomId !== roomId) continue;
      const p = charPos(w, c);
      cross(p.x, p.y, 0xff0000, 14);
      g.circle(p.x, p.y, 5).fill({ color: 0xff0000 });
      const sp = c.costume ? CHAR_SPRITES[`${c.id}:${c.costume}:${c.pose === 'sitting' ? 'sit' : 'stand'}`] : undefined;
      if (!sp || c.pose === 'sleeping') continue;
      const k = c.flipped ? -1 : 1;
      for (const [pt, col] of [[sp.eyeL, 0x0066ff], [sp.eyeR, 0x0066ff], [sp.browL, 0x9933ff], [sp.browR, 0x9933ff], [sp.mouth, 0x00aa44], [sp.handL, 0xff8800], [sp.handR, 0xff8800]] as [Pt, number][])
        cross(p.x + (k * (pt.x - sp.origin.x)) / sp.unit, p.y + (pt.y - sp.origin.y) / sp.unit, col);
    }
  }

  stats() { return { nodes: this.nodes.size, textures: textureCount(), particles: this.particles.length, tweens: this.tweens.length }; }
}

void ci; void Texture;

/** Простые рисунки состояний фермы (в единицах комнаты, опорная точка — низ по центру). */
function farmArt(kind: 'trough' | 'grain' | 'nest' | 'bed', on: number): Art | null {
  const wrap = (w: number, h: number, body: string): Art => ({ svg: body, x: -w / 2, y: -h, w, h });
  if (kind === 'trough' && on) {
    let straws = '';
    for (let i = 0; i < 26; i++) { const x = -150 + i * 12, h = 26 + ((i * 37) % 22); straws += `<path d="M${x} 0 q${((i * 13) % 14) - 7} ${-h / 2} ${((i * 7) % 18) - 9} ${-h}" stroke="${i % 3 ? '#e9b949' : '#f6d877'}" stroke-width="7" stroke-linecap="round" fill="none"/>`; }
    return wrap(340, 60, `<ellipse cx="0" cy="-10" rx="160" ry="16" fill="#e2a93c"/>${straws}`);
  }
  if (kind === 'grain' && on) {
    let dots = '';
    for (let i = 0; i < 22; i++) dots += `<ellipse cx="${-52 + ((i * 29) % 104)}" cy="${-6 - ((i * 11) % 18)}" rx="6" ry="4.4" fill="${i % 2 ? '#e8b64c' : '#f2cf73'}" stroke="#b9862c" stroke-width="1"/>`;
    return wrap(140, 36, `<ellipse cx="0" cy="-8" rx="62" ry="12" fill="#d9a441" opacity="0.55"/>${dots}`);
  }
  if (kind === 'nest' && !on) return wrap(60, 46, `<ellipse cx="0" cy="-20" rx="17" ry="21" fill="#fbeedb" stroke="#d9c3a3" stroke-width="2.5"/><ellipse cx="-6" cy="-28" rx="5" ry="7" fill="#ffffff" opacity="0.8"/>`);
  if (kind === 'bed' && on === 1) return wrap(80, 70, `<path d="M0 0 V-40" stroke="#4f9e3f" stroke-width="7" stroke-linecap="round"/><path d="M0 -30 q-26 -14 -30 -34 q26 0 30 34z M0 -36 q26 -12 30 -30 q-26 -2 -30 30z" fill="#6cc653" stroke="#4f9e3f" stroke-width="2.5"/>`);
  if (kind === 'bed' && on >= 2) {
    let petals = '';
    for (let i = 0; i < 6; i++) petals += `<ellipse cx="${Math.cos((i * Math.PI) / 3) * 17}" cy="${-82 + Math.sin((i * Math.PI) / 3) * 17}" rx="12" ry="12" fill="#ff9ec4" stroke="#e77aa6" stroke-width="2"/>`;
    return wrap(90, 112, `<path d="M0 0 V-74" stroke="#4f9e3f" stroke-width="7" stroke-linecap="round"/><path d="M0 -34 q-26 -10 -32 -28 q26 -2 32 28z M0 -44 q26 -10 32 -26 q-26 -4 -32 26z" fill="#6cc653" stroke="#4f9e3f" stroke-width="2.5"/>${petals}<circle cx="0" cy="-82" r="10" fill="#ffd94d" stroke="#e0a92c" stroke-width="2"/>`);
  }
  return null;
}
