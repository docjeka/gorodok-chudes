// Единая геометрия: позиции слотов, рук, сидений. Чистые функции без DOM.
import { FURNITURE } from '../content/furniture';
import { ITEMS } from '../content/items';
import type { Character, FurnitureInst, ItemInst, Pet, Pt, RoomId, World, HandSlot } from './types';
import { FLOOR_BOTTOM, FLOOR_TOP, ROOM_W } from './types';

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function clampFloor(x: number, y: number): Pt {
  return { x: Math.round(clamp(x, 50, ROOM_W - 50)), y: Math.round(clamp(y, FLOOR_TOP + 30, FLOOR_BOTTOM)) };
}

export function slotPos(f: FurnitureInst, pt: Pt): Pt {
  return { x: f.x + (f.flipped ? -pt.x : pt.x), y: f.y + pt.y };
}

/** Живое место (седло карусели): где оно сейчас, во сколько раз там уменьшен седок и смотрит ли он влево. */
export interface LiveSeat { x: number; y: number; s: number; flip: boolean }
let liveSeats: ((furnitureId: string, slot: number) => LiveSeat | null) | null = null;
/** Сцена сообщает, где сейчас движущиеся места. Без неё места стоят там, где записаны в мебели. */
export function setLiveSeats(fn: typeof liveSeats) { liveSeats = fn; }
export function liveSeat(c: Character): LiveSeat | null {
  return c.seat && liveSeats ? liveSeats(c.seat.furnitureId, c.seat.slot) : null;
}
/** Точка сиденья: у карусели — там, где сейчас лошадка. */
export function seatPos(f: FurnitureInst, slot: number): Pt & { s: number } {
  const live = liveSeats?.(f.id, slot);
  if (live) return { x: live.x, y: live.y, s: live.s };
  return { ...slotPos(f, FURNITURE[f.definitionId].seats![slot]), s: 1 };
}

/** Положение героя в комнате с учётом сиденья. */
export function charPos(w: World, c: Character): Pt {
  if (c.seat) {
    const f = w.furniture[c.seat.furnitureId];
    const seat = f && FURNITURE[f.definitionId]?.seats?.[c.seat.slot];
    if (f && seat) { const p = seatPos(f, c.seat.slot); return { x: p.x, y: p.y }; }
  }
  return { x: c.x, y: c.y };
}

export function petPos(w: World, p: Pet): Pt {
  if (p.seat) {
    const f = w.furniture[p.seat.furnitureId];
    const seat = f && FURNITURE[f.definitionId]?.petSeats?.[p.seat.slot];
    if (f && seat) return slotPos(f, seat);
  }
  return { x: p.x, y: p.y };
}

/** Смещение кисти относительно опорной точки героя (без учёта зеркала). */
export function handOffset(c: Character, slot: HandSlot | 'both' | 'head'): Pt {
  if (slot === 'head') return { x: 0, y: c.pose === 'sitting' ? -190 : -235 };
  const sit = c.pose === 'sitting';
  if (slot === 'both') return sit ? { x: 0, y: -36 } : { x: 0, y: -84 };
  const sx = slot === 'left' ? -1 : 1;
  return sit ? { x: sx * 47, y: -28 } : { x: sx * 47, y: -74 };
}

export function handPos(w: World, c: Character, slot: HandSlot | 'both' | 'head'): Pt {
  const p = charPos(w, c);
  const o = handOffset(c, slot);
  if (c.pose === 'sleeping') return { x: p.x - 90, y: p.y - 30 };
  const live = liveSeat(c);
  if (live) return { x: p.x + (live.flip ? -o.x : o.x) * live.s, y: p.y + o.y * live.s };
  return { x: p.x + (c.flipped ? -o.x : o.x), y: p.y + o.y };
}

/** Прямоугольник героя для попадания при броске предмета. */
export function charBox(w: World, c: Character) {
  const p = charPos(w, c);
  if (c.pose === 'sleeping') return { x0: p.x - 290, x1: p.x + 10, y0: p.y - 90, y1: p.y + 30, headX: p.x - 190, headLine: null as number | null };
  const k = liveSeat(c)?.s ?? 1;
  if (c.pose === 'sitting') return { x0: p.x - 66 * k, x1: p.x + 66 * k, y0: p.y - 210 * k, y1: p.y + 40 * k, headX: p.x, headLine: p.y - 86 * k };
  if (c.pose === 'bathing') return { x0: p.x - 66, x1: p.x + 66, y0: p.y - 255, y1: p.y - 120, headX: p.x, headLine: p.y - 125 };
  return { x0: p.x - 66, x1: p.x + 66, y0: p.y - 255, y1: p.y + 6, headX: p.x, headLine: p.y - 132 };
}

export interface ItemPlace { roomId: RoomId | null; x: number; y: number; visible: boolean; held?: string }

/** Где предмет находится на сцене. visible=false — спрятан (закрытый ящик, сумка, корзина). */
export function itemPlace(w: World, it: ItemInst, depth = 0): ItemPlace {
  const o = it.owner;
  const none: ItemPlace = { roomId: null, x: 0, y: 0, visible: false };
  if (depth > 8) return none;
  switch (o.kind) {
    case 'room': return { roomId: o.roomId, x: o.x, y: o.y, visible: true };
    case 'surface': {
      const f = w.furniture[o.furnitureId];
      const s = f && FURNITURE[f.definitionId]?.surfaces?.[o.slot];
      if (!f || !s || !f.roomId) return none;
      return { roomId: f.roomId, ...slotPos(f, s), visible: true };
    }
    case 'furniture': {
      const f = w.furniture[o.furnitureId];
      const s = f && FURNITURE[f.definitionId]?.container?.slots[o.slot];
      if (!f || !s || !f.roomId) return none;
      return { roomId: f.roomId, ...slotPos(f, s), visible: f.open };
    }
    case 'hand': {
      const c = w.characters[o.characterId];
      if (!c || !c.roomId) return none;
      const g = ITEMS[it.definitionId]?.grip;
      const h = handPos(w, c, o.slot);
      return { roomId: c.roomId, x: h.x - (g?.x ?? 0), y: h.y + (g ? -g.y : ITEMS[it.definitionId].h * 0.3), visible: true, held: c.id };
    }
    case 'item': {
      const parent = w.items[o.itemId];
      if (!parent) return none;
      const pp = itemPlace(w, parent, depth + 1);
      return { ...pp, visible: false };
    }
    default: return none;
  }
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
