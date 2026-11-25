// Выбор цели при отпускании предмета, героя или питомца. Чистая логика: принимает мир и точку в координатах комнаты.
// Приоритет: рука/рот героя → питомец → контейнер-предмет → поверхность/контейнер мебели → пол.
import { HATCH, POUCH, FURNITURE, GRAIN_EATERS, HAY_EATERS } from '../content/furniture';
import { ITEMS, DOCTOR_TOOLS } from '../content/items';
import { charBox, charPos, clampFloor, dist, itemPlace, petPos, seatPos, slotPos } from './geometry';
import { FILLABLE, HEADWEAR, PET_BRUSHES, cushionFree, isWaterSource, POURS, handItems, isInside, seatTaken } from './rules';
import type { HandSlot, Pt, RoomId, World } from './types';

export type ItemDrop =
  | { type: 'feed'; characterId: string }
  | { type: 'care'; characterId: string }
  | { type: 'wear'; characterId: string; setId: string }
  | { type: 'hand'; characterId: string; slot: HandSlot | 'head' }
  | { type: 'pet'; petId: string; action: 'feed' | 'play' | 'brush' }
  | { type: 'into'; itemId: string }
  | { type: 'pour'; itemId: string }
  | { type: 'bowl'; itemId: string; half: 'water' | 'kibble' }
  | { type: 'feeder'; furnitureId: string }
  | { type: 'farmfeed'; petId: string }
  | { type: 'bed'; furnitureId: string }
  | { type: 'water'; itemId: string }
  | { type: 'surface'; furnitureId: string; slot: number }
  | { type: 'furniture'; furnitureId: string; slot: number }
  | { type: 'floor'; x: number; y: number }
  | { type: 'reject' };

const SURFACE_R = 78;
const CUSHION_R = 62;

export function resolveItemDrop(w: World, itemId: string, pt: Pt, roomId: RoomId): ItemDrop {
  const it = w.items[itemId];
  const def = it && ITEMS[it.definitionId];
  if (!it || !def) return { type: 'reject' };
  const has = (t: string) => def.tags.includes(t as never);

  // 0ф. ферма: сено — в кормушку или прямо зверю, зерно — на землю или птице, лейка — на грядку
  const farmFood = it.definitionId === 'farm_hay' ? 'trough' : it.definitionId === 'farm_grain' ? 'grain' : null;
  if (farmFood) {
    // точно в кормушку — в кормушку, даже если рядом стоит зверь
    for (const f of Object.values(w.furniture)) if (f.roomId === roomId && FURNITURE[f.definitionId].farm === farmFood && Math.abs(pt.x - f.x) < FURNITURE[f.definitionId].w / 2 && Math.abs(pt.y - (f.y - 20)) < 55) return { type: 'feeder', furnitureId: f.id };
    for (const p of Object.values(w.pets).filter((x) => x.roomId === roomId && !x.carriedBy)) {
      const pp = petPos(w, p);
      if (Math.abs(pt.x - pp.x) < 80 && pt.y > pp.y - 150 && pt.y < pp.y + 20 && (farmFood === 'trough' ? HAY_EATERS : GRAIN_EATERS).has(p.kind)) return { type: 'farmfeed', petId: p.id };
    }
    for (const f of Object.values(w.furniture)) if (f.roomId === roomId && FURNITURE[f.definitionId].farm === farmFood && Math.abs(pt.x - f.x) < FURNITURE[f.definitionId].w / 2 + 30 && Math.abs(pt.y - f.y) < 130) return { type: 'feeder', furnitureId: f.id };
  }
  if (it.definitionId === 'farm_can' || it.definitionId === 'wateringcan') {
    for (const f of Object.values(w.furniture)) if (f.roomId === roomId && FURNITURE[f.definitionId].farm === 'bed' && Math.abs(pt.x - f.x) < 130 && Math.abs(pt.y - f.y) < 140) return { type: 'bed', furnitureId: f.id };
  }

  // 0а. двойная миска: мешок корма — в правую половину, вода — в левую
  if (it.definitionId === 'pet_food_bag' || isWaterSource(it)) {
    for (const bowl of Object.values(w.items)) {
      if (bowl.definitionId !== 'pet_double_bowl' || bowl.instanceId === itemId) continue;
      const pl = itemPlace(w, bowl);
      if (pl.roomId === roomId && pl.visible && Math.abs(pt.x - pl.x) < 80 && pt.y > pl.y - 120 && pt.y < pl.y + 30) return { type: 'bowl', itemId: bowl.instanceId, half: it.definitionId === 'pet_food_bag' ? 'kibble' : 'water' };
    }
  }

  // 0. налить: пакет молока или чайник над чашкой или стаканом (даже если чашку держит герой)
  if (POURS[it.definitionId]) {
    for (const cup of Object.values(w.items)) {
      if (!FILLABLE.has(cup.definitionId) || cup.instanceId === itemId) continue;
      const pl = itemPlace(w, cup);
      if (pl.roomId === roomId && pl.visible && dist(pt, { x: pl.x, y: pl.y - 20 }) < 58) return { type: 'pour', itemId: cup.instanceId };
    }
  }

  // 0б. полить: лейка над цветочным горшком
  if (it.definitionId === 'wateringcan' || it.definitionId === 'farm_can') {
    for (const pot of Object.values(w.items)) {
      if (pot.definitionId !== 'flowerpot') continue;
      const pl = itemPlace(w, pot);
      if (pl.roomId === roomId && pl.visible && dist(pt, { x: pl.x, y: pl.y - 30 }) < 62) return { type: 'water', itemId: pot.instanceId };
    }
  }

  // 1. герои: сверху вниз по глубине (ближний к зрителю — первым)
  const chars = Object.values(w.characters).filter((c) => c.roomId === roomId).sort((a, b) => charPos(w, b).y - charPos(w, a).y);
  for (const c of chars) {
    const b = charBox(w, c);
    if (pt.x < b.x0 || pt.x > b.x1 || pt.y < b.y0 || pt.y > b.y1) continue;
    const edible = has('food') || !!it.state.contents; // еда или чашка, в которую что-то налито
    if (it.owner.kind === 'hand' && it.owner.characterId === c.id && !(edible && isHead(b, pt))) continue; // уронили на самого себя — ищем дальше
    if (def.wearSet) return { type: 'wear', characterId: c.id, setId: def.wearSet };
    const head = isHead(b, pt);
    // инструмент доктора: пациента лечат, куда бы ни поднесли; доктор в халате берёт инструмент в руку (а лечат его, поднеся к голове)
    if (DOCTOR_TOOLS[it.definitionId] && c.pose !== 'sleeping' && (head || c.costume !== 'doctor')) return { type: 'care', characterId: c.id };
    if (head && edible && c.pose !== 'sleeping') return { type: 'feed', characterId: c.id };
    if (head && has('care') && !['petbrush', 'pet_grooming_brush'].includes(it.definitionId) && c.pose !== 'sleeping') return { type: 'care', characterId: c.id };
    if (c.pose === 'sleeping' || c.pose === 'bathing') continue;
    if (HEADWEAR.has(it.definitionId) && pt.y < (b.y0 + b.y1) / 2) return { type: 'hand', characterId: c.id, slot: 'head' }; // убор — на голову
    const p = charPos(w, c);
    const leftSide = (pt.x < p.x) !== c.flipped;
    return { type: 'hand', characterId: c.id, slot: leftSide ? 'left' : 'right' };
  }

  // 2. питомцы
  for (const p of Object.values(w.pets).filter((x) => x.roomId === roomId && !x.carriedBy)) {
    const pp = petPos(w, p);
    if (Math.abs(pt.x - pp.x) > 70 || pt.y < pp.y - 110 || pt.y > pp.y + 20) continue;
    if (has('petfood')) return { type: 'pet', petId: p.id, action: 'feed' };
    if (PET_BRUSHES.has(it.definitionId)) return { type: 'pet', petId: p.id, action: 'brush' };
    if (has('pettoy')) return { type: 'pet', petId: p.id, action: 'play' };
  }

  // 3. предметы-контейнеры (корзина, открытая подарочная коробка)
  if (!has('giftbox')) {
    let best: { id: string; d: number } | null = null;
    for (const box of Object.values(w.items)) {
      const bd = ITEMS[box.definitionId];
      if (!bd?.capacity || box.instanceId === itemId || box.state.packed) continue;
      if (isInside(w, box.instanceId, itemId)) continue;
      const pl = itemPlace(w, box);
      if (pl.roomId !== roomId || !pl.visible) continue;
      const d = dist(pt, { x: pl.x, y: pl.y - bd.h / 2 });
      if (d < 62 && (!best || d < best.d)) best = { id: box.instanceId, d };
    }
    if (best) return { type: 'into', itemId: best.id };
  }

  // 4. мебель: ближайший слот поверхности или открытого контейнера
  let bestF: { drop: ItemDrop; d: number } | null = null;
  for (const f of Object.values(w.furniture)) {
    if (f.roomId !== roomId) continue;
    const fd = FURNITURE[f.definitionId];
    fd.surfaces?.forEach((s, slot) => {
      const sp = slotPos(f, s);
      const d = dist(pt, { x: sp.x, y: sp.y - def.h / 2 });
      // подушка сиденья: небольшая зона, только для игрушек и только если на этом месте никто не сидит и ничего не лежит
      if (fd.hatch && it.definitionId !== HATCH.egg) return; // в гнездо кладётся только особое яйцо
      if (fd.cushions && (!has('toy') || d >= CUSHION_R || !cushionFree(w, f.id, slot, itemId))) return;
      if (d < SURFACE_R && (!bestF || d < bestF.d)) bestF = { drop: { type: 'surface', furnitureId: f.id, slot }, d };
    });
    if (fd.container) {
      // закрытый ящик сам откроется при броске — точка должна попасть в корпус мебели
      const inBody = Math.abs(pt.x - f.x) < fd.w / 2 && pt.y > f.y - fd.h && pt.y < f.y + 10;
      fd.container.slots.forEach((s, slot) => {
        const sp = slotPos(f, s);
        const d = f.open ? dist(pt, { x: sp.x, y: sp.y - def.h / 2 }) : inBody ? 60 + slot : Infinity;
        if (d < SURFACE_R && (!bestF || d < bestF.d)) bestF = { drop: { type: 'furniture', furnitureId: f.id, slot }, d };
      });
    }
  }
  if (bestF) return (bestF as { drop: ItemDrop }).drop;

  // 5. пол: любая точка комнаты приводится к допустимой
  const p = clampFloor(pt.x, pt.y + def.h / 2);
  return { type: 'floor', x: p.x, y: p.y };
}

function isHead(b: ReturnType<typeof charBox>, pt: Pt): boolean {
  if (b.headLine === null) return Math.abs(pt.x - b.headX) < 70;
  return pt.y < b.headLine;
}

export type CharDrop = { type: 'seat'; furnitureId: string; slot: number } | { type: 'floor'; x: number; y: number };

export function resolveCharDrop(w: World, characterId: string, pt: Pt, roomId: RoomId): CharDrop {
  let best: { furnitureId: string; slot: number; d: number } | null = null;
  for (const f of Object.values(w.furniture)) {
    if (f.roomId !== roomId) continue;
    FURNITURE[f.definitionId].seats?.forEach((s, slot) => {
      if (seatTaken(w, f.id, slot, characterId)) return;
      const sp = seatPos(f, slot);
      // pt — середина тела героя; у каждого вида места своя «середина» и радиус притяжения
      const target = s.pose === 'sleeping' ? { x: sp.x - 150, y: sp.y - 20 } : s.pose === 'bathing' ? { x: sp.x, y: sp.y - 150 } : s.pose === 'standing' ? { x: sp.x, y: sp.y - 120 } : { x: sp.x, y: sp.y - 70 * sp.s };
      const d = dist(pt, target);
      const r = s.pose === 'sleeping' ? 190 : 120;
      if (d < r && (!best || d < best.d)) best = { furnitureId: f.id, slot, d };
    });
  }
  if (best) return { type: 'seat', furnitureId: (best as any).furnitureId, slot: (best as any).slot };
  const p = clampFloor(pt.x, pt.y + 110); // ступни ниже середины тела
  return { type: 'floor', x: p.x, y: p.y };
}

export type PetDrop = { type: 'pouch'; adultId: string } | { type: 'seat'; furnitureId: string; slot: number } | { type: 'intoItem'; itemId: string; x: number; y: number } | { type: 'floor'; x: number; y: number };

export function resolvePetDrop(w: World, petId: string, pt: Pt, roomId: RoomId): PetDrop {
  const pet = w.pets[petId];
  // детёныша кенгуру отпустили над взрослым — в карман (если он свободен); других зверей и вещи карман не принимает
  if (pet?.kind === 'joey') {
    for (const a of Object.values(w.pets)) {
      if (a.kind !== 'kangaroo' || a.roomId !== roomId || a.sleeping) continue;
      if (Object.values(w.pets).some((o) => o.id !== petId && o.carriedBy === a.id)) continue;
      const ap = petPos(w, a);
      if (Math.abs(pt.x - ap.x) < POUCH.over.dx && pt.y > ap.y - POUCH.over.up && pt.y < ap.y + POUCH.over.down) return { type: 'pouch', adultId: a.id };
    }
  }
  for (const f of Object.values(w.furniture)) {
    if (f.roomId !== roomId) continue;
    const seats = FURNITURE[f.definitionId].petSeats ?? [];
    for (let slot = 0; slot < seats.length; slot++) {
      if (Object.values(w.pets).some((o) => o.id !== petId && o.seat?.furnitureId === f.id && o.seat.slot === slot)) continue;
      if (dist(pt, slotPos(f, seats[slot])) < 110) return { type: 'seat', furnitureId: f.id, slot };
    }
  }
  // кот любит пустые корзины и коробки
  if (pet?.kind === 'cat') {
    for (const box of Object.values(w.items)) {
      if (box.owner.kind !== 'room' || box.owner.roomId !== roomId || !ITEMS[box.definitionId]?.capacity || box.state.packed) continue;
      if (Object.values(w.items).some((i) => i.owner.kind === 'item' && i.owner.itemId === box.instanceId)) continue;
      if (dist(pt, { x: box.owner.x, y: box.owner.y - 30 }) < 90) return { type: 'intoItem', itemId: box.instanceId, x: box.owner.x, y: box.owner.y };
    }
  }
  const p = clampFloor(pt.x, pt.y);
  return { type: 'floor', x: p.x, y: p.y };
}

/** Свободная точка на полу возле (x, y) — чтобы новые вещи не складывались в одну кучу. */
export function freeFloorSpot(w: World, roomId: RoomId, near: Pt): Pt {
  const taken = Object.values(w.items).filter((i) => i.owner.kind === 'room' && i.owner.roomId === roomId).map((i) => i.owner as unknown as Pt);
  for (let i = 0; i < 40; i++) {
    const p = clampFloor(near.x + ((i % 8) - 3.5) * 80 * (i < 8 ? 1 : 1.1), near.y + Math.floor(i / 8) * 36);
    if (!taken.some((t) => dist(t, p) < 60)) return p;
  }
  return clampFloor(near.x, near.y);
}

export { handItems };
