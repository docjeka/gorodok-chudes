// Чистые правила мира. Каждая функция получает мир и возвращает новый мир либо причину отказа.
// Ничего не знает про DOM, Canvas и хранилище — поэтому тестируется напрямую.
import { FURNITURE, GRAIN_EATERS, HATCH, HAY_EATERS, charAllowedIn, petAllowedIn } from '../content/furniture';
import { GIFTS, ITEMS, RECIPES } from '../content/items';
import { GARMENTS, OUTFITS, costumeFits, presetCharacter } from '../content/wardrobe';
import { charPos, clampFloor, itemPlace, petPos } from './geometry';
import type {
  Character, HandSlot, ItemInst, Pet, Liquid, Look, Outfit, Owner, Pt, Recipe, Result, RoomId, World, GarmentSlot, Emotion,
} from './types';
import { BAG_CAPACITY, GIFT_CAPACITY, MAX_CUSTOM_HEROES, MAX_ITEMS } from './types';

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const ok = (world: World, info?: Record<string, unknown>): Result => ({ ok: true, world, info });
const fail = (reason: string): Result => ({ ok: false, reason });

export function newId(w: World, prefix: string): string {
  w.nextId += 1;
  return `${prefix}_${w.nextId.toString(36)}`;
}

export const itemsWhere = (w: World, pred: (o: Owner, it: ItemInst) => boolean): ItemInst[] =>
  Object.values(w.items).filter((it) => pred(it.owner, it));

/** Что надевается на голову: корона, колпак, маска. */
export const HEADWEAR = new Set(['crown', 'partyhat', 'mask', 'club_headphones']);
/** Чем можно причесать питомца. */
export const PET_BRUSHES = new Set(['petbrush', 'comb', 'pet_grooming_brush']);

export function handItems(w: World, characterId: string): Partial<Record<HandSlot | 'both' | 'head', ItemInst>> {
  const out: Partial<Record<HandSlot | 'both' | 'head', ItemInst>> = {};
  for (const it of Object.values(w.items)) if (it.owner.kind === 'hand' && it.owner.characterId === characterId) out[it.owner.slot] = it;
  return out;
}

const sameContainer = (a: Owner, b: Owner): boolean => {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'surface' && b.kind === 'surface') return a.furnitureId === b.furnitureId;
  if (a.kind === 'furniture' && b.kind === 'furniture') return a.furnitureId === b.furnitureId;
  if (a.kind === 'item' && b.kind === 'item') return a.itemId === b.itemId;
  return a.kind === 'bag';
};

/** Свободна ли подушка сиденья: на ней никто не сидит и не лежит другая вещь. */
export function cushionFree(w: World, furnitureId: string, slot: number, exceptItem?: string): boolean {
  if (Object.values(w.characters).some((c) => c.seat?.furnitureId === furnitureId && c.seat.slot === slot)) return false;
  return !Object.values(w.items).some((i) => i.instanceId !== exceptItem && i.owner.kind === 'surface' && i.owner.furnitureId === furnitureId && i.owner.slot === slot);
}

function usedSlots(w: World, target: Owner, exceptId: string): Set<number> {
  const used = new Set<number>();
  for (const it of Object.values(w.items)) {
    if (it.instanceId === exceptId) continue;
    if (sameContainer(it.owner, target) && 'slot' in it.owner && typeof it.owner.slot === 'number') used.add(it.owner.slot);
  }
  return used;
}

function freeSlot(used: Set<number>, capacity: number, preferred?: number): number | null {
  if (preferred !== undefined && preferred >= 0 && preferred < capacity && !used.has(preferred)) return preferred;
  for (let i = 0; i < capacity; i++) if (!used.has(i)) return i;
  return null;
}

/** true, если candidate лежит внутри предмета ancestorId (на любой глубине) или это он сам. */
export function isInside(w: World, candidateId: string, ancestorId: string): boolean {
  let cur: ItemInst | undefined = w.items[candidateId];
  for (let i = 0; cur && i < 32; i++) {
    if (cur.instanceId === ancestorId) return true;
    cur = cur.owner.kind === 'item' ? w.items[cur.owner.itemId] : undefined;
  }
  return false;
}

/**
 * Перенос владения. Единственное место, где меняется owner предмета.
 * Для слотов: если запрошенный занят — берётся ближайший свободный; если мест нет — отказ, предмет остаётся где был.
 */
export function moveItem(world: World, itemId: string, target: Owner): Result {
  const w = clone(world);
  const it = w.items[itemId];
  if (!it) return fail('no_item');
  const def = ITEMS[it.definitionId];
  if (!def) return fail('no_def');
  switch (target.kind) {
    case 'room': {
      const p = clampFloor(target.x, target.y);
      it.owner = { kind: 'room', roomId: target.roomId, x: p.x, y: p.y };
      return ok(w);
    }
    case 'lost':
      it.owner = { kind: 'lost' };
      return ok(w);
    case 'bag': {
      const slot = freeSlot(usedSlots(w, target, itemId), BAG_CAPACITY, target.slot);
      if (slot === null) return fail('bag_full');
      if (def.tags.includes('big')) return fail('too_big');
      it.owner = { kind: 'bag', slot };
      return ok(w);
    }
    case 'hand': {
      const c = w.characters[target.characterId];
      if (!c || !c.roomId) return fail('no_character');
      const hands = handItems(w, c.id);
      const busy = (s: HandSlot | 'both' | 'head') => !!hands[s] && hands[s]!.instanceId !== itemId;
      if (target.slot === 'head') {
        if (!HEADWEAR.has(it.definitionId)) return fail('not_headwear');
        // прежний убор снимается и ложится на пол рядом
        if (busy('head')) { const p = clampFloor(c.x + 70, Math.max(c.y, 700) + 10); hands.head!.owner = { kind: 'room', roomId: c.roomId, x: p.x, y: p.y }; }
        it.owner = { kind: 'hand', characterId: c.id, slot: 'head' };
        return ok(w);
      }
      if (def.tags.includes('big')) {
        if (busy('left') || busy('right') || busy('both')) return fail('hands_full');
        it.owner = { kind: 'hand', characterId: c.id, slot: 'both' };
        return ok(w);
      }
      if (busy('both')) return fail('hands_full');
      const want: HandSlot = target.slot === 'right' ? 'right' : 'left';
      const other: HandSlot = want === 'left' ? 'right' : 'left';
      const slot = !busy(want) ? want : !busy(other) ? other : null;
      if (!slot) return fail('hands_full');
      it.owner = { kind: 'hand', characterId: c.id, slot };
      return ok(w);
    }
    case 'surface': {
      const f = w.furniture[target.furnitureId];
      const fd = f && FURNITURE[f.definitionId];
      if (!f || !fd?.surfaces || !f.roomId) return fail('no_surface');
      let slot = freeSlot(usedSlots(w, target, itemId), fd.surfaces.length, target.slot);
      if (fd.hatch && it.definitionId !== HATCH.egg) return fail('not_egg');
      if (fd.cushions) {
        // на подушку сиденья — только игрушку и только на свободное место: под героя она не прячется
        if (!ITEMS[it.definitionId].tags.includes('toy')) return fail('not_toy');
        const free = [target.slot, ...fd.surfaces.map((_, i) => i)].find((i) => i >= 0 && i < fd.surfaces!.length && cushionFree(w, f.id, i, itemId));
        slot = free ?? null;
      }
      if (slot === null) return fail('surface_full');
      it.owner = { kind: 'surface', furnitureId: f.id, slot };
      if (fd.tap === 'water' && it.state.dirty) it.state.dirty = false;
      if (fd.tap === 'water' && FILLABLE.has(it.definitionId) && !it.state.contents) it.state.contents = 'water'; // под краном чашка наполняется
      return ok(w);
    }
    case 'furniture': {
      const f = w.furniture[target.furnitureId];
      const fd = f && FURNITURE[f.definitionId];
      if (!f || !fd?.container || !f.roomId) return fail('no_container');
      const slot = freeSlot(usedSlots(w, target, itemId), fd.container.capacity, target.slot);
      if (slot === null) return fail('container_full');
      it.owner = { kind: 'furniture', furnitureId: f.id, slot };
      return ok(w);
    }
    case 'item': {
      const box = w.items[target.itemId];
      const bd = box && ITEMS[box.definitionId];
      if (!box || !bd?.capacity) return fail('no_container');
      if (isInside(w, box.instanceId, itemId)) return fail('cycle'); // контейнер не может содержать себя или предка
      if (box.state.packed) return fail('packed');
      if (def.tags.includes('giftbox')) return fail('too_big');
      const slot = freeSlot(usedSlots(w, target, itemId), bd.capacity, target.slot);
      if (slot === null) return fail('container_full');
      it.owner = { kind: 'item', itemId: box.instanceId, slot };
      return ok(w);
    }
  }
}

export function spawnItem(world: World, definitionId: string, owner: Owner, state: ItemInst['state'] = {}): Result {
  const def = ITEMS[definitionId];
  if (!def) return fail('no_def');
  if (Object.keys(world.items).length >= MAX_ITEMS) return fail('too_many');
  const w = clone(world);
  const instanceId = newId(w, definitionId);
  w.items[instanceId] = { instanceId, definitionId, owner: { kind: 'lost' }, state: { ...(def.servings ? { servings: def.servings } : {}), ...state } };
  const moved = moveItem(w, instanceId, owner);
  if (!moved.ok) return moved;
  return ok(moved.world, { instanceId });
}

/** Удаляет предмет; всё, что лежало внутри, уходит в корзину найденных вещей — ничего не теряется. */
export function removeItem(world: World, itemId: string): Result {
  const w = clone(world);
  if (!w.items[itemId]) return fail('no_item');
  for (const it of Object.values(w.items)) if (it.owner.kind === 'item' && it.owner.itemId === itemId) it.owner = { kind: 'lost' };
  delete w.items[itemId];
  return ok(w);
}

// ---------- Герои ----------

export function seatTaken(w: World, furnitureId: string, slot: number, exceptId?: string): boolean {
  return Object.values(w.characters).some((c) => c.id !== exceptId && c.seat?.furnitureId === furnitureId && c.seat.slot === slot);
}

export function placeCharacter(world: World, id: string, to: { x: number; y: number } | { furnitureId: string; slot: number }, roomId?: RoomId): Result {
  const w = clone(world);
  const c = w.characters[id];
  if (!c) return fail('no_character');
  if ('furnitureId' in to) {
    const f = w.furniture[to.furnitureId];
    const seat = f && FURNITURE[f.definitionId]?.seats?.[to.slot];
    if (!f || !seat || !f.roomId) return fail('no_seat');
    if (seatTaken(w, f.id, to.slot, id)) return fail('seat_taken');
    c.seat = { furnitureId: f.id, slot: to.slot };
    c.pose = seat.pose;
    c.roomId = f.roomId;
    if (seat.pose === 'sleeping') c.emotion = 'sleepy';
    const fd = FURNITURE[f.definitionId];
    if (fd.cushions) {
      // герой сел на подушку с игрушкой: игрушка не остаётся под ним — переезжает на свободную подушку рядом или на пол перед мебелью
      for (const toy of Object.values(w.items)) {
        if (toy.owner.kind !== 'surface' || toy.owner.furnitureId !== f.id || toy.owner.slot !== to.slot) continue;
        const free = fd.surfaces!.findIndex((_, i) => i !== to.slot && cushionFree(w, f.id, i, toy.instanceId));
        if (free >= 0) toy.owner = { kind: 'surface', furnitureId: f.id, slot: free };
        else { const p = clampFloor(f.x + (f.flipped ? -seat.x : seat.x), f.y + 24); toy.owner = { kind: 'room', roomId: f.roomId, x: p.x, y: p.y }; }
      }
    }
    return ok(w);
  }
  const wasAsleep = c.pose === 'sleeping';
  const p = clampFloor(to.x, to.y);
  c.x = p.x; c.y = p.y; c.seat = null; c.pose = 'standing';
  if (roomId) c.roomId = roomId;
  if (wasAsleep && c.emotion === 'sleepy') c.emotion = 'joy';
  return ok(w);
}

/** Разбудить: герой остаётся на кровати, но садится. */
export function wake(world: World, id: string): Result {
  const c0 = world.characters[id];
  if (!c0 || c0.pose !== 'sleeping') return fail('not_sleeping');
  const p = charPos(world, c0);
  const bed = c0.seat ? world.furniture[c0.seat.furnitureId] : undefined;
  // встаёт перед кроватью, а не за ней
  const r = placeCharacter(world, id, { x: p.x - 60, y: (bed?.y ?? p.y) + 60 });
  if (r.ok) r.world.characters[id].emotion = 'joy';
  return r;
}

export function setEmotion(world: World, id: string, emotion: Emotion): Result {
  const w = clone(world);
  if (!w.characters[id]) return fail('no_character');
  w.characters[id].emotion = emotion;
  return ok(w);
}

export function flipCharacter(world: World, id: string): Result {
  const w = clone(world);
  if (!w.characters[id]) return fail('no_character');
  w.characters[id].flipped = !w.characters[id].flipped;
  return ok(w);
}

/** Переход в другую комнату. С собой — до четырёх героев; вещи в руках остаются в руках, сумка едет сама. */
export function travel(world: World, roomId: RoomId, characterIds: string[], petIds: string[] = []): Result {
  if (!world.rooms[roomId]) return fail('no_room');
  const ids = [...new Set(characterIds)];
  if (ids.length > 4) return fail('too_many_travelers');
  const w = clone(world);
  const stayed: string[] = [];
  ids.forEach((id, i) => {
    const c = w.characters[id];
    if (!c) return;
    if (!charAllowedIn(id, roomId)) { stayed.push(id); return; } // фермер остаётся на ферме
    const p = clampFloor(520 + i * 170, 780 + (i % 2) * 40);
    c.roomId = roomId; c.x = p.x; c.y = p.y; c.seat = null; c.pose = 'standing';
    if (c.emotion === 'sleepy') c.emotion = 'joy';
  });
  // питомцев можно взять с собой: они идут рядом и никогда не раздваиваются
  const refused: string[] = [];
  [...new Set(petIds)].forEach((id, i) => {
    const p = w.pets[id];
    if (!p) return;
    // жители фермы ходят только по ферме: это правило игры, а не только кнопок
    if (!petAllowedIn(p.kind, roomId)) { refused.push(id); return; }
    const at = clampFloor(980 + i * 130, 830 - (i % 2) * 50);
    p.roomId = roomId; p.x = at.x; p.y = at.y; p.seat = null; p.sleeping = false; delete p.inItem;
  });
  w.currentRoomId = roomId;
  return ok(w, refused.length || stayed.length ? { refused: [...stayed, ...refused] } : undefined);
}

/** Позвать героя в комнату (или убрать на полку, roomId=null). Герой всегда ровно в одном месте. */
export function summonCharacter(world: World, id: string, roomId: RoomId | null): Result {
  const w = clone(world);
  const c = w.characters[id];
  if (!c) return fail('no_character');
  if (!charAllowedIn(id, roomId)) return fail('lives_on_farm'); // его нельзя ни позвать в другое место, ни убрать на полку
  if (roomId === null) {
    const p = charPos(w, c);
    let i = 0;
    for (const it of Object.values(w.items)) {
      if (it.owner.kind === 'hand' && it.owner.characterId === id) {
        it.owner = c.roomId ? { kind: 'room', roomId: c.roomId, ...clampFloor(p.x + (i++ ? 50 : -50), p.y + 20) } : { kind: 'lost' };
      }
    }
    c.roomId = null; c.seat = null; c.pose = 'standing';
    return ok(w);
  }
  const n = Object.values(w.characters).filter((x) => x.roomId === roomId && x.id !== id).length;
  const p = clampFloor(360 + ((n * 190) % 1000), 770 + (n % 2) * 50);
  c.roomId = roomId; c.x = p.x; c.y = p.y; c.seat = null; c.pose = 'standing';
  return ok(w);
}

export function addCustomCharacter(world: World, name: string, look: Look, outfit: Outfit): Result {
  if (Object.values(world.characters).filter((c) => !c.preset).length >= MAX_CUSTOM_HEROES) return fail('too_many_heroes');
  const w = clone(world);
  const id = newId(w, 'custom');
  w.characters[id] = { id, name: name.slice(0, 16), preset: false, look: clone(look), outfit: clone(outfit), roomId: null, x: 800, y: 780, pose: 'standing', seat: null, emotion: 'joy', flipped: false };
  return ok(w, { id });
}

/** Удаление пользовательского героя: вещи из рук — в корзину найденных вещей. Готовых героев удалить нельзя. */
export function deleteCharacter(world: World, id: string): Result {
  const c = world.characters[id];
  if (!c) return fail('no_character');
  if (c.preset) return fail('preset');
  const w = clone(world);
  for (const it of Object.values(w.items)) if (it.owner.kind === 'hand' && it.owner.characterId === id) it.owner = { kind: 'lost' };
  delete w.characters[id];
  return ok(w);
}

export function resetPreset(world: World, id: string): Result {
  const fresh = presetCharacter(id);
  if (!fresh || !world.characters[id]) return fail('no_character');
  const w = clone(world);
  w.characters[id].look = fresh.look;
  w.characters[id].outfit = fresh.outfit;
  w.characters[id].name = fresh.name;
  return ok(w);
}

export function updateCharacter(world: World, id: string, patch: { name?: string; look?: Look }): Result {
  const w = clone(world);
  const c = w.characters[id];
  if (!c) return fail('no_character');
  if (patch.name !== undefined) c.name = patch.name.slice(0, 16);
  if (patch.look) c.look = clone(patch.look);
  return ok(w);
}

// ---------- Одежда ----------

/** Чистое правило совместимости: цельный наряд заменяет верх и низ, и наоборот; герой не остаётся раздетым. */
export function applyGarment(outfit: Outfit, garmentId: string, color = 0): Outfit | null {
  const gd = GARMENTS[garmentId];
  if (!gd) return null;
  const out: Outfit = clone(outfit);
  const worn = { id: garmentId, color: Math.max(0, Math.min(gd.colors.length - 1, color | 0)) };
  if (gd.slot === 'dress') { delete out.top; delete out.bottom; out.dress = worn; return out; }
  if (gd.slot === 'top' || gd.slot === 'bottom') {
    delete out.dress;
    out[gd.slot] = worn;
    if (!out.top) out.top = { id: 'tee', color: 0 };
    if (!out.bottom) out.bottom = { id: 'shorts', color: 0 };
    return out;
  }
  out[gd.slot] = worn;
  return out;
}

/** Снять вещь. Основу (верх/низ/цельный наряд) снять нельзя — только заменить. */
export function removeGarment(outfit: Outfit, slot: GarmentSlot): Outfit | null {
  if (slot === 'top' || slot === 'bottom' || slot === 'dress') return null;
  const out = clone(outfit);
  delete out[slot];
  return out;
}

export function isValidOutfit(o: Outfit): boolean {
  for (const [slot, worn] of Object.entries(o)) {
    const gd = worn && GARMENTS[worn.id];
    if (!gd || gd.slot !== slot || worn.color < 0 || worn.color >= gd.colors.length) return false;
  }
  if (o.dress) return !o.top && !o.bottom;
  return !!o.top && !!o.bottom;
}

export function setOutfit(world: World, id: string, outfit: Outfit): Result {
  if (!isValidOutfit(outfit)) return fail('bad_outfit');
  const w = clone(world);
  if (!w.characters[id]) return fail('no_character');
  w.characters[id].outfit = clone(outfit);
  delete w.characters[id].costume; // наряд собран по частям — готового спрайта для него нет
  return ok(w);
}

export function wearSet(world: World, id: string, setId: string): Result {
  const s = OUTFITS[setId];
  if (!s) return fail('no_set');
  if (!costumeFits(id, setId)) return fail('no_costume_for_hero'); // у пластилинового героя нет такой фигурки — остаётся в прежнем
  const r = setOutfit(world, id, s.outfit);
  if (r.ok) r.world.characters[id].costume = setId;
  return r;
}

// ---------- Напитки ----------

/** Во что можно налить. */
export const FILLABLE = new Set(['cup', 'glass']);
/** Из чего можно налить и что получится. Сам источник не расходуется. */
export const POURS: Record<string, Liquid> = { milk: 'milk', teapot: 'tea' };

export function fill(world: World, itemId: string, liquid: Liquid): Result {
  const w = clone(world);
  const it = w.items[itemId];
  if (!it || !FILLABLE.has(it.definitionId)) return fail('not_fillable');
  it.state.contents = liquid;
  delete it.state.dirty;
  return ok(w);
}

/** Выпить налитое: чашка остаётся, но пустая. */
export function drink(world: World, itemId: string): Result {
  const w = clone(world);
  const it = w.items[itemId];
  if (!it?.state.contents) return fail('empty');
  const liquid = it.state.contents;
  delete it.state.contents;
  return ok(w, { liquid });
}

// ---------- Еда и рецепты ----------

export function feed(world: World, itemId: string): Result {
  const w = clone(world);
  const it = w.items[itemId];
  const def = it && ITEMS[it.definitionId];
  if (!it || !def) return fail('no_item');
  if (!def.tags.includes('food') && !def.tags.includes('petfood')) return fail('not_food'); // несъедобное нельзя съесть
  const left = (it.state.servings ?? def.servings ?? 1) - 1;
  if (left > 0) { it.state.servings = left; return ok(w, { finished: false, left }); }
  if (def.leaves) {
    it.definitionId = def.leaves;
    it.state = { dirty: true };
    return ok(w, { finished: true, left: 0, leaves: def.leaves });
  }
  delete w.items[itemId];
  return ok(w, { finished: true, left: 0 });
}

export function matchRecipe(workspace: string, ingredientIds: string[]): Recipe | null {
  const key = [...ingredientIds].sort().join('+');
  return RECIPES.find((r) => r.workspace === workspace && [...r.ingredients].sort().join('+') === key) ?? null;
}

/** Лучший рецепт, все ингредиенты которого лежат на рабочем месте. Лишние продукты не мешают и не расходуются. */
export function recipeAt(w: World, furnitureId: string): { recipe: Recipe; items: ItemInst[] } | null {
  const f = w.furniture[furnitureId];
  const fd = f && FURNITURE[f.definitionId];
  if (!fd?.workspace) return null;
  const present = itemsWhere(w, (o) => o.kind === 'surface' && o.furnitureId === furnitureId);
  let best: { recipe: Recipe; items: ItemInst[] } | null = null;
  for (const recipe of RECIPES) {
    if (recipe.workspace !== fd.workspace) continue;
    const pool = [...present];
    const used: ItemInst[] = [];
    for (const ing of recipe.ingredients) {
      const i = pool.findIndex((p) => p.definitionId === ing);
      if (i < 0) break;
      used.push(pool.splice(i, 1)[0]);
    }
    if (used.length === recipe.ingredients.length && (!best || used.length > best.items.length)) best = { recipe, items: used };
  }
  return best;
}

/** Готовка: ингредиенты расходуются, блюдо появляется на том же месте — одной операцией. */
export function cook(world: World, furnitureId: string): Result {
  const found = recipeAt(world, furnitureId);
  if (!found) return wonderDish(world, furnitureId);
  const w = clone(world);
  const slot = Math.min(...found.items.map((i) => (i.owner as { slot: number }).slot));
  for (const i of found.items) delete w.items[i.instanceId];
  return spawnItem(w, found.recipe.result, { kind: 'surface', furnitureId, slot });
}

/** Ингредиенты на рабочем месте, из которых можно что-то приготовить (хотя бы два). */
export function cookables(w: World, furnitureId: string): ItemInst[] {
  const fd = w.furniture[furnitureId] && FURNITURE[w.furniture[furnitureId].definitionId];
  if (!fd?.workspace) return [];
  return itemsWhere(w, (o, it) => o.kind === 'surface' && o.furnitureId === furnitureId && !!ITEMS[it.definitionId]?.tags.includes('ingredient'));
}

/** Чудо-блюдо: неподходящее сочетание не пугает, а складывается в смешную башню из своих продуктов. */
function wonderDish(world: World, furnitureId: string): Result {
  const parts = cookables(world, furnitureId).sort((a, b) => (a.owner as { slot: number }).slot - (b.owner as { slot: number }).slot);
  if (parts.length < 2) return fail('no_recipe');
  const w = clone(world);
  const slot = Math.min(...parts.map((i) => (i.owner as { slot: number }).slot));
  const mix = parts.map((i) => i.definitionId).slice(0, 4);
  for (const i of parts) delete w.items[i.instanceId];
  return spawnItem(w, 'wonderdish', { kind: 'surface', furnitureId, slot }, { mix });
}

// ---------- Подарки ----------

export function takeGiftSet(world: World, setId: string, roomId: RoomId, at: Pt): Result {
  const set = GIFTS[setId];
  if (!set) return fail('no_set');
  if (Object.keys(world.items).length + set.items.length + 1 > MAX_ITEMS) return fail('too_many');
  const r = spawnItem(world, 'giftbox', { kind: 'room', roomId, x: at.x, y: at.y }, { packed: false, giftSetId: setId, paper: set.paper, bow: set.bow });
  if (!r.ok) return r;
  let w = r.world;
  const boxId = r.info!.instanceId as string;
  for (const [i, defId] of set.items.entries()) {
    const s = spawnItem(w, defId, { kind: 'item', itemId: boxId, slot: i });
    if (!s.ok) return s;
    w = s.world;
  }
  w.items[boxId].state.packed = true;
  return ok(w, { instanceId: boxId });
}

export function newEmptyGift(world: World, roomId: RoomId, at: Pt, paper: number, bow: number, card: string): Result {
  return spawnItem(world, 'giftbox', { kind: 'room', roomId, x: at.x, y: at.y }, { packed: false, paper, bow, card: card.slice(0, 60) });
}

export function wrapGift(world: World, boxId: string): Result {
  const w = clone(world);
  const box = w.items[boxId];
  if (!box || box.definitionId !== 'giftbox') return fail('no_gift');
  if (box.state.packed) return fail('packed');
  const n = itemsWhere(w, (o) => o.kind === 'item' && o.itemId === boxId).length;
  if (n === 0) return fail('empty_gift');
  if (n > GIFT_CAPACITY) return fail('container_full');
  box.state.packed = true;
  return ok(w);
}

/**
 * Открытие подарка — атомарно: коробка исчезает, вещи появляются рядом, статус набора записывается.
 * Повторный вызов для той же коробки невозможен (её уже нет), поэтому дубликаты не возникают.
 */
export function openGift(world: World, boxId: string): Result {
  const box0 = world.items[boxId];
  if (!box0 || box0.definitionId !== 'giftbox') return fail('no_gift');
  if (!box0.state.packed) return fail('not_packed');
  const place = itemPlace(world, box0);
  if (!place.roomId) return fail('not_in_room');
  const w = clone(world);
  const inside = itemsWhere(w, (o) => o.kind === 'item' && o.itemId === boxId).sort((a, b) => (a.owner as { slot: number }).slot - (b.owner as { slot: number }).slot);
  const n = inside.length;
  inside.forEach((it, i) => {
    const p = clampFloor(place.x + (i - (n - 1) / 2) * 84, Math.max(place.y, 700) + (i % 2) * 34);
    it.owner = { kind: 'room', roomId: place.roomId!, x: p.x, y: p.y };
  });
  delete w.items[boxId];
  if (box0.state.giftSetId && !w.openedGiftIds.includes(box0.state.giftSetId)) w.openedGiftIds.push(box0.state.giftSetId);
  return ok(w, { opened: inside.map((i) => i.instanceId), card: box0.state.card ?? '' });
}

// ---------- Мебель и комната ----------

export function toggleOpen(world: World, furnitureId: string, open?: boolean): Result {
  const w = clone(world);
  const f = w.furniture[furnitureId];
  if (!f || !FURNITURE[f.definitionId]?.container) return fail('no_container');
  f.open = open ?? !f.open;
  return ok(w);
}

export function setFurnitureOn(world: World, furnitureId: string, on: number): Result {
  const w = clone(world);
  if (!w.furniture[furnitureId]) return fail('no_furniture');
  w.furniture[furnitureId].on = on;
  return ok(w);
}

export function furnitureBounds(defId: string) {
  const d = FURNITURE[defId];
  const half = Math.min(d.w / 2, 200);
  if (d.layer === 'wall') return { x0: half, x1: 1600 - half, y0: Math.min(d.h + 20, 520), y1: 540 };
  if (d.layer === 'rug') return { x0: half, x1: 1600 - half, y0: 700, y1: 880 };
  return { x0: half, x1: 1600 - half, y0: 620, y1: 870 };
}

/** Мебель нельзя унести за край комнаты. Вещи на ней едут вместе с ней, потому что их позиция вычисляется от мебели. */
export function moveFurniture(world: World, id: string, x: number, y: number): Result {
  const w = clone(world);
  const f = w.furniture[id];
  if (!f || !f.roomId) return fail('no_furniture');
  const b = furnitureBounds(f.definitionId);
  f.x = Math.round(Math.max(b.x0, Math.min(b.x1, x)));
  f.y = Math.round(Math.max(b.y0, Math.min(b.y1, y)));
  return ok(w);
}

export function patchFurniture(world: World, id: string, patch: { flipped?: boolean; color?: number }): Result {
  const w = clone(world);
  const f = w.furniture[id];
  if (!f) return fail('no_furniture');
  if (patch.flipped !== undefined) f.flipped = patch.flipped;
  if (patch.color !== undefined) f.color = patch.color % 4;
  return ok(w);
}

/** Убрать мебель на склад: вещи с неё аккуратно ставятся на пол, сидевшие герои встают. */
export function storeFurniture(world: World, id: string): Result {
  const w = clone(world);
  const f = w.furniture[id];
  if (!f || !f.roomId) return fail('no_furniture');
  if (FURNITURE[f.definitionId].fixed) return fail('fixed');
  let i = 0;
  for (const it of Object.values(w.items)) {
    if ((it.owner.kind === 'surface' || it.owner.kind === 'furniture') && it.owner.furnitureId === id) {
      const p = clampFloor(f.x - 80 + (i++ % 5) * 44, f.y + 30 + Math.floor(i / 5) * 30);
      it.owner = { kind: 'room', roomId: f.roomId, x: p.x, y: p.y };
    }
  }
  for (const c of Object.values(w.characters)) if (c.seat?.furnitureId === id) { const p = clampFloor(f.x, f.y + 40); c.seat = null; c.pose = 'standing'; c.x = p.x; c.y = p.y; }
  for (const p of Object.values(w.pets)) if (p.seat?.furnitureId === id) { p.seat = null; p.sleeping = false; p.x = f.x; p.y = Math.max(f.y, 700); }
  f.roomId = null; f.open = false; f.on = 0;
  return ok(w);
}

export function unstoreFurniture(world: World, id: string, roomId: RoomId): Result {
  const w = clone(world);
  const f = w.furniture[id];
  if (!f || f.roomId) return fail('no_furniture');
  f.roomId = roomId;
  const b = furnitureBounds(f.definitionId);
  f.x = 800; f.y = Math.round((b.y0 + b.y1) / 2);
  return ok(w);
}

export function setRoomStyle(world: World, roomId: RoomId, patch: Partial<{ wallpaper: number; floor: number; lightOn: boolean }>): Result {
  const w = clone(world);
  Object.assign(w.rooms[roomId], patch);
  return ok(w);
}

/** «Прибрать комнату»: вещи возвращаются на стартовые места, остальное ровно выстраивается на полу. Другие комнаты не трогаются. */
export function tidyRoom(world: World, roomId: RoomId): Result {
  let w = clone(world);
  for (const f of Object.values(w.furniture)) if (f.roomId === roomId) { f.x = f.homeX; f.y = f.homeY; f.flipped = false; }
  const here = Object.values(w.items).filter((it) => it.owner.kind !== 'hand' && it.owner.kind !== 'item' && itemPlace(w, it).roomId === roomId);
  let loose = 0;
  for (const it of here) {
    const home = it.home;
    const homeRoom = home && (home.kind === 'surface' || home.kind === 'furniture') ? w.furniture[home.furnitureId]?.roomId : home?.kind === 'room' ? home.roomId : null;
    if (home && homeRoom === roomId) {
      const r = moveItem(w, it.instanceId, home);
      if (r.ok) { w = r.world; continue; }
    }
    if (it.owner.kind === 'room') {
      const p = clampFloor(140 + (loose % 16) * 86, 860 - Math.floor(loose / 16) * 40);
      w.items[it.instanceId].owner = { kind: 'room', roomId, x: p.x, y: p.y };
      loose++;
    }
  }
  return ok(w);
}

// ---------- Питомцы ----------

export function placePet(world: World, id: string, to: { x: number; y: number } | { furnitureId: string; slot: number }): Result {
  const w = clone(world);
  const p = w.pets[id];
  if (!p) return fail('no_pet');
  if ('furnitureId' in to) {
    const f = w.furniture[to.furnitureId];
    if (!f || !FURNITURE[f.definitionId]?.petSeats?.[to.slot] || f.roomId !== p.roomId) return fail('no_seat');
    if (Object.values(w.pets).some((o) => o.id !== id && o.seat?.furnitureId === f.id && o.seat.slot === to.slot)) return fail('seat_taken');
    p.seat = { furnitureId: f.id, slot: to.slot }; p.sleeping = true; delete p.carriedBy;
    return ok(w);
  }
  const c = clampFloor(to.x, to.y); // питомец не выходит за пределы комнаты
  p.x = c.x; p.y = c.y; p.seat = null; p.sleeping = false; delete p.carriedBy;
  return ok(w);
}

export function patchPet(world: World, id: string, patch: { collar?: number; sleeping?: boolean; flipped?: boolean }): Result {
  const w = clone(world);
  const p = w.pets[id];
  if (!p) return fail('no_pet');
  if (patch.sleeping === false && p.seat) { const pos = petPos(w, p); p.seat = null; p.x = pos.x; p.y = Math.max(pos.y + 30, 700); }
  Object.assign(p, patch);
  return ok(w);
}

/** Детёныша кенгуру сажают в карман взрослого. Только он, только к взрослому в том же загоне и только в пустой карман. */
export function pouchJoey(world: World, joeyId: string, adultId: string): Result {
  const w = clone(world);
  const j = w.pets[joeyId], a = w.pets[adultId];
  if (!j || !a || j.kind !== 'joey' || a.kind !== 'kangaroo' || j.roomId !== a.roomId) return fail('no_pouch');
  if (Object.values(w.pets).some((p) => p.id !== joeyId && p.carriedBy === adultId)) return fail('pouch_taken');
  j.carriedBy = adultId; j.seat = null; j.sleeping = false; delete j.inItem;
  j.x = a.x; j.y = a.y;
  return ok(w);
}
/** Кто сидит в кармане этого кенгуру. */
export const inPouch = (w: World, adultId: string): Pet | undefined => Object.values(w.pets).find((p) => p.carriedBy === adultId && p.roomId === w.pets[adultId]?.roomId);

export const charactersIn = (w: World, roomId: RoomId): Character[] => Object.values(w.characters).filter((c) => c.roomId === roomId);

// ---------- двойная миска: вода слева, корм справа ----------
export type BowlHalf = 'water' | 'kibble';
/** Наполнить половину миски. В уже полную половину повторно насыпать или налить нельзя. */
export function fillBowl(world: World, bowlId: string, half: BowlHalf): Result {
  const w = clone(world);
  const b = w.items[bowlId];
  if (!b || b.definitionId !== 'pet_double_bowl') return fail('not_bowl');
  if (b.state[half]) return fail('bowl_full');
  b.state[half] = true;
  return ok(w);
}
/** Питомец доел корм или допил воду: пустеет только эта половина, миска остаётся. */
export function emptyBowl(world: World, bowlId: string, half: BowlHalf): Result {
  const w = clone(world);
  const b = w.items[bowlId];
  if (!b || b.definitionId !== 'pet_double_bowl') return fail('not_bowl');
  if (!b.state[half]) return fail('bowl_empty');
  delete b.state[half];
  return ok(w, { half });
}
/** Чем можно налить воду в миску: кувшин-чайник или чашка/стакан, в которых что-то налито. */
export const isWaterSource = (it: ItemInst): boolean => it.definitionId === 'teapot' || (FILLABLE.has(it.definitionId) && !!it.state.contents);

// ---------- «Подготовить игру» в карточках идей ----------
export interface PreparedItem { def: string; status: 'created' | 'found' | 'eaten'; roomId: RoomId | null; holder?: string; inBag?: boolean; instanceId?: string }
/** Где сейчас вещь: комната, у какого героя в руках, в сумке. */
export function whereIs(w: World, it: ItemInst): { roomId: RoomId | null; holder?: string; inBag?: boolean } {
  let cur = it;
  for (let i = 0; i < 6 && cur.owner.kind === 'item'; i++) { const p = w.items[cur.owner.itemId]; if (!p) break; cur = p; }
  if (cur.owner.kind === 'bag') return { roomId: null, inBag: true };
  if (cur.owner.kind === 'hand') return { roomId: w.characters[cur.owner.characterId]?.roomId ?? null, holder: cur.owner.characterId };
  return { roomId: itemPlace(w, cur).roomId };
}
/**
 * Готовит вещи для идеи. Уже существующую вещь не копирует и не двигает — только сообщает, где она.
 * Недостающее появляется в своём месте. Съеденное угощение выдаётся заново только при again = true.
 * Героев, питомцев и стоящую мебель не трогает; мебель возвращает, только если её убрали на склад.
 */
export function prepareIdea(world: World, ideaId: string, kit: { items: { def: string; room: RoomId; surface?: [string, number]; alt?: [string, number]; floor?: [number, number]; treat?: boolean }[]; furniture?: { id: string; room: RoomId }[] }, again = false): Result {
  let w = clone(world);
  const before = (w.preparedIdeas ?? []).includes(ideaId);
  const report: PreparedItem[] = [];
  for (const k of kit.items) {
    const have = Object.values(w.items).find((i) => i.definitionId === k.def && i.owner.kind !== 'lost');
    if (have) { report.push({ def: k.def, status: 'found', instanceId: have.instanceId, ...whereIs(w, have) }); continue; }
    if (k.treat && before && !again) { report.push({ def: k.def, status: 'eaten', roomId: k.room }); continue; }
    const state = k.def === 'giftbox' ? { packed: false, paper: 2, bow: 1 } : {};
    let r: Result = fail('no_surface');
    // сначала указанное место, потом любой свободный слот той же полки или стола, потом запасная поверхность
    for (const [fid, pref] of [k.surface, k.alt].filter((x): x is [string, number] => !!x)) {
      const n = FURNITURE[w.furniture[fid]?.definitionId]?.surfaces?.length ?? 0;
      for (const slot of [pref, ...Array.from({ length: n }, (_, i) => i)]) { r = spawnItem(w, k.def, { kind: 'surface', furnitureId: fid, slot }, state); if (r.ok) break; }
      if (r.ok) break;
    }
    if (!r.ok) { const at = k.floor ?? [800, 820]; const taken = Object.values(w.items).filter((i) => i.owner.kind === 'room' && i.owner.roomId === k.room); const p = clampFloor(at[0] + taken.filter((i) => Math.abs((i.owner as { x: number }).x - at[0]) < 40).length * 60, at[1]); r = spawnItem(w, k.def, { kind: 'room', roomId: k.room, x: p.x, y: p.y }, state); }
    if (!r.ok) continue; // вещей слишком много — эту пропускаем, мир игрока важнее
    w = r.world;
    report.push({ def: k.def, status: 'created', roomId: k.room, instanceId: r.info!.instanceId as string });
  }
  for (const f of kit.furniture ?? []) { const inst = w.furniture[f.id]; if (inst && inst.roomId === null) { inst.roomId = f.room; inst.x = inst.homeX; inst.y = inst.homeY; } }
  w.preparedIdeas = [...new Set([...(w.preparedIdeas ?? []), ideaId])];
  return ok(w, { report });
}

// ---------- ферма ----------
export const EGG_LIMIT = 3;
/** Наполнить кормушку сеном или насыпать зерно: одна порция, повторно в полную нельзя. */
export function fillFeeder(world: World, furnitureId: string): Result {
  const w = clone(world);
  const f = w.furniture[furnitureId];
  const kind = f && FURNITURE[f.definitionId]?.farm;
  if (!f || (kind !== 'trough' && kind !== 'grain')) return fail('not_feeder');
  if (f.on) return fail('feeder_full');
  f.on = 1;
  return ok(w);
}
/** Зверь съел порцию: кормушка пустеет. Курица после зерна снова несёт яйцо (пока яиц в мире меньше трёх). */
export function eatFromFeeder(world: World, furnitureId: string, petId: string): Result {
  const w = clone(world);
  const f = w.furniture[furnitureId], p = w.pets[petId];
  const kind = f && FURNITURE[f.definitionId]?.farm;
  if (!f || !p || (kind !== 'trough' && kind !== 'grain')) return fail('not_feeder');
  if (!f.on) return fail('feeder_empty');
  if (!(kind === 'trough' ? HAY_EATERS : GRAIN_EATERS).has(p.kind)) return fail('wrong_food');
  f.on = 0;
  if (p.kind === 'hen') layEgg(w);
  return ok(w);
}
function layEgg(w: World) {
  const eggs = Object.values(w.items).filter((i) => i.definitionId === 'farm_eggs').length;
  for (const f of Object.values(w.furniture)) if (FURNITURE[f.definitionId]?.farm === 'nest' && eggs < EGG_LIMIT) f.on = 0;
}
/** Курицу покормили зерном прямо из ведёрка — она тоже несёт яйцо. */
export function henFed(world: World): Result { const w = clone(world); layEgg(w); return ok(w); }
/**
 * Собрать яйцо из гнезда: одно яйцо, пока гнездо не наполнится снова. В поле on гнезда: 0 — яйцо лежит, 1 — уже собрано.
 * Яйцо кладётся в корзинку, если она рядом, иначе — на землю у курятника. Повторные нажатия и входы яиц не добавляют.
 */
export function collectEgg(world: World, nestId: string): Result {
  const nest = world.furniture[nestId];
  if (!nest || FURNITURE[nest.definitionId]?.farm !== 'nest' || !nest.roomId) return fail('not_nest');
  if (nest.on) return fail('nest_empty');
  if (Object.values(world.items).filter((i) => i.definitionId === 'farm_eggs').length >= EGG_LIMIT) return fail('nest_empty');
  const basket = Object.values(world.items).find((i) => i.definitionId === 'farm_basket' && itemPlace(world, i).roomId === nest.roomId && itemPlace(world, i).visible);
  let r: Result = basket ? spawnItem(world, 'farm_eggs', { kind: 'item', itemId: basket.instanceId, slot: 0 }) : fail('no_basket');
  if (!r.ok) { const p = clampFloor(nest.x + 110, 700); r = spawnItem(world, 'farm_eggs', { kind: 'room', roomId: nest.roomId, x: p.x, y: p.y }); }
  if (!r.ok) return r;
  r.world.furniture[nestId].on = 1;
  return ok(r.world, { instanceId: r.info!.instanceId, inBasket: !!basket && r.world.items[r.info!.instanceId as string].owner.kind === 'item' });
}
/** Особое яйцо, которое сейчас лежит в тёплом гнезде этой комнаты (если малыш ещё не вылупился). */
export function eggInNest(w: World, roomId: RoomId): ItemInst | undefined {
  if (w.pets[HATCH.chick]) return undefined;
  return Object.values(w.items).find((i) => {
    if (i.definitionId !== HATCH.egg || i.owner.kind !== 'surface') return false;
    const f = w.furniture[i.owner.furnitureId];
    return !!f && f.roomId === roomId && !!FURNITURE[f.definitionId]?.hatch;
  });
}
/**
 * Шаг вылупления: яйцо в гнезде сначала дрожит, потом покрывается трещинками, потом из него выходит цыплёнок.
 * Состояние хранится в самом яйце, поэтому выход из комнаты и перезагрузка ничего не сбрасывают. Забрали яйцо —
 * оно остаётся у игрока как было. Цыплёнок получает постоянный ID и появляется один раз: яйцо при этом исчезает.
 */
export function hatchStep(world: World, eggId: string): Result {
  const egg0 = world.items[eggId];
  if (!egg0 || egg0.definitionId !== HATCH.egg || egg0.owner.kind !== 'surface') return fail('not_in_nest');
  const nest = world.furniture[egg0.owner.furnitureId];
  if (!nest || !nest.roomId || !FURNITURE[nest.definitionId]?.hatch) return fail('not_in_nest');
  if (world.pets[HATCH.chick]) return fail('already_hatched');
  const w = clone(world);
  const egg = w.items[eggId];
  const warm = egg.state.warm ?? 0;
  if (warm < HATCH.steps) { egg.state.warm = warm + 1; return ok(w, { stage: warm + 1 }); }
  delete w.items[eggId];
  const at = clampFloor(nest.x + 120, 720);
  w.pets[HATCH.chick] = { id: HATCH.chick, kind: 'chick', roomId: nest.roomId, x: at.x, y: at.y, sleeping: false, seat: null, collar: 0, flipped: false };
  return ok(w, { stage: HATCH.steps + 1, petId: HATCH.chick });
}
/** Полить грядку: 0 — земля, 1 — росток, 2 — цветок. Таймеров нет: растёт только от полива. */
export function waterBed(world: World, bedId: string): Result {
  const w = clone(world);
  const f = w.furniture[bedId];
  if (!f || FURNITURE[f.definitionId]?.farm !== 'bed') return fail('not_bed');
  f.on = Math.min(2, f.on + 1);
  return ok(w, { level: f.on });
}
