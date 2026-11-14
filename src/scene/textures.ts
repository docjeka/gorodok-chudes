// Кэш текстур: картинки-спрайты и растеризованные SVG. У каждой текстуры — опорная точка, масштаб и альфа-маска для касаний.
import { Texture } from 'pixi.js';
import { toSvg, type Art } from '../art/base';

export interface Tex {
  key: string;
  texture: Texture;
  /** единиц комнаты на пиксель */
  upp: number;
  /** опорная точка в пикселях текстуры */
  ox: number;
  oy: number;
  w: number;
  h: number;
  mask: Uint8Array;
  mw: number;
  mh: number;
  used: number;
}

const ready = new Map<string, Tex>();
const pending = new Map<string, Promise<Tex>>();
const MAX_TEXTURES = 220;
const ART_SCALE = 2;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image ' + src.slice(0, 60)));
    img.src = src;
  });
}

function finish(key: string, canvas: HTMLCanvasElement, upp: number, ox: number, oy: number): Tex {
  const k = Math.min(1, 96 / Math.max(canvas.width, canvas.height));
  const mw = Math.max(1, Math.round(canvas.width * k)), mh = Math.max(1, Math.round(canvas.height * k));
  const small = document.createElement('canvas');
  small.width = mw; small.height = mh;
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(canvas, 0, 0, mw, mh);
  const data = sctx.getImageData(0, 0, mw, mh).data;
  const mask = new Uint8Array(mw * mh);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3];
  small.width = 0; small.height = 0;
  const texture = Texture.from(canvas);
  const tex: Tex = { key, texture, upp, ox, oy, w: canvas.width, h: canvas.height, mask, mw, mh, used: performance.now() };
  ready.set(key, tex);
  evict();
  return tex;
}

export interface ImageMeta { upp: number; ox: number; oy: number; crop?: { x: number; y: number; w: number; h: number } }

export function imageTex(key: string, url: string, meta: ImageMeta): Promise<Tex> {
  const hit = pending.get(key);
  if (hit) return hit;
  const p = loadImage(url).then((img) => {
    const c = meta.crop ?? { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(c.w)); canvas.height = Math.max(1, Math.round(c.h));
    canvas.getContext('2d')!.drawImage(img, -c.x, -c.y);
    return finish(key, canvas, meta.upp, meta.ox - c.x, meta.oy - c.y);
  });
  pending.set(key, p);
  p.catch(() => pending.delete(key));
  return p;
}

export function artTex(key: string, make: () => Art): Promise<Tex> {
  const hit = pending.get(key);
  if (hit) return hit;
  const a = make();
  const p = loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(toSvg(a, ART_SCALE))).then((img) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(a.w * ART_SCALE); canvas.height = Math.ceil(a.h * ART_SCALE);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return finish(key, canvas, 1 / ART_SCALE, -a.x * ART_SCALE, -a.y * ART_SCALE);
  });
  pending.set(key, p);
  p.catch(() => pending.delete(key));
  return p;
}

export const getTex = (key: string): Tex | undefined => {
  const t = ready.get(key);
  if (t) t.used = performance.now();
  return t;
};

/** Попадание в непрозрачную часть: lx, ly — в единицах комнаты от опорной точки. */
export function hitTex(t: Tex, lx: number, ly: number, threshold = 40): boolean {
  const px = t.ox + lx / t.upp, py = t.oy + ly / t.upp;
  if (px < 0 || py < 0 || px >= t.w || py >= t.h) return false;
  const mx = Math.min(t.mw - 1, Math.floor((px / t.w) * t.mw)), my = Math.min(t.mh - 1, Math.floor((py / t.h) * t.mh));
  return t.mask[my * t.mw + mx] > threshold;
}

/** Старые неиспользуемые текстуры уничтожаются, чтобы переходы между комнатами не копили память. */
function evict() {
  if (ready.size <= MAX_TEXTURES) return;
  const now = performance.now();
  const old = [...ready.values()].filter((t) => now - t.used > 20_000).sort((a, b) => a.used - b.used);
  for (const t of old.slice(0, ready.size - MAX_TEXTURES + 20)) {
    ready.delete(t.key); pending.delete(t.key);
    t.texture.destroy(true);
  }
}

export const textureCount = () => ready.size;
