// Создание нового мира, проверка целостности, миграции и разбор импорта.
import { FURNITURE, charAllowedIn, initialFurniture, petAllowedIn, ROOM_IDS } from '../content/furniture';
import { ITEMS } from '../content/items';
import { GARMENTS, PRESET_HEROES, presetCharacter } from '../content/wardrobe';
import { isInside, isValidOutfit, moveItem, spawnItem } from './rules';
import type { ItemInst, Owner, RoomId, World } from './types';
import { BAG_CAPACITY, MAX_ITEMS, SCHEMA_VERSION } from './types';

type Seed = [def: string, owner: Owner];
const surf = (furnitureId: string, slot: number): Owner => ({ kind: 'surface', furnitureId, slot });
const inside = (furnitureId: string, slot: number): Owner => ({ kind: 'furniture', furnitureId, slot });
const floor = (roomId: RoomId, x: number, y: number): Owner => ({ kind: 'room', roomId, x, y });

const SEEDS: Seed[] = [
  // гостиная
  ['cup', surf('lv_table', 0)], ['book', surf('lv_table', 2)], ['teapot', surf('lv_table', 3)],
  ['starlamp', surf('lv_shelf', 0)], ['robot', surf('lv_shelf', 2)], ['snowglobe', surf('lv_shelf', 4)], 
  ['teddy', inside('lv_toybox', 0)], ['blocks', inside('lv_toybox', 1)], ['car', inside('lv_toybox', 2)], ['doll', inside('lv_toybox', 3)],
  ['ball', floor('living', 1010, 840)], ['basket', floor('living', 1420, 840)], ['pillow', floor('living', 250, 850)],
  // кухня
  ...['bread', 'cheese', 'tomato', 'lettuce', 'cucumber', 'apple', 'banana', 'strawberry', 'milk', 'egg', 'dough', 'chocolate'].map((d, i): Seed => [d, inside('kt_fridge', i)]),
  ['plate', inside('kt_cupboard', 0)], ['plate', inside('kt_cupboard', 1)], ['cup', inside('kt_cupboard', 2)], ['cup', inside('kt_cupboard', 3)],
  ['glass', inside('kt_cupboard', 4)], ['glass', inside('kt_cupboard', 5)], ['bowl', inside('kt_cupboard', 6)],
  ['plate', surf('kt_table', 1)], ['plate', surf('kt_table', 3)], ['kibble', floor('kitchen', 1400, 850)], ['carrot', surf('kt_table', 4)],
  // спальня
  ['bunnytoy', surf('bd_bed', 0)], ['starlamp', surf('bd_night', 0)], ['book', surf('bd_night', 1)],
  ['rocket', surf('bd_shelf', 0)], ['planet', surf('bd_shelf', 1)], ['crown', surf('bd_shelf', 2)], ['teddy', surf('bd_shelf', 3)], ['duck', floor('bedroom', 1380, 850)],
  ['blocks', floor('bedroom', 760, 850)], ['car', floor('bedroom', 620, 860)], ['wand', floor('bedroom', 860, 840)],
  ['mittens', inside('bd_night', 0)], ['bone', floor('bedroom', 1120, 850)],
  // ванная
  ['toothbrush', surf('bt_sink', 0)], ['soap', surf('bt_sink', 1)], ['duck', surf('bt_tub', 0)],
  ['comb', surf('bt_shelf', 0)], ['towel', surf('bt_shelf', 2)], ['petbrush', surf('bt_shelf', 4)], ['towel', inside('bt_laundry', 0)],
];

/** Стартовая раскладка локаций города (добавляется и в старые сохранения при переходе на версию 3). */
const LOCATION_SEEDS: [string, Owner][] = [
  ['teddy', surf('ty_left', 0)], ['robot', surf('ty_left', 2)], ['doll', surf('ty_left', 6)], ['car', surf('ty_left', 12)], ['blocks', surf('ty_right', 1)], ['rocket', surf('ty_right', 7)], ['bunnytoy', surf('ty_right', 13)],
  ['wand', surf('tw_bench', 1)], ['crown', surf('tw_bench', 3)], ['partyhat', surf('tw_bench', 5)], ['planet', surf('tw_cubby', 1)], ['snowglobe', surf('tw_cubby', 4)],
  ['cupcake', surf('cf_sill', 1)], ['cookies', surf('cf_sill', 3)], ['cup', surf('cf_case', 0)], ['glass', surf('cf_case', 1)], ['cake', surf('cf_case', 5)],
  ['dough', surf('cb_table', 1)], ['egg', surf('cb_table', 2)], ['milk', surf('cb_table', 4)], ['strawberry', surf('cb_table', 5)], ['chocolate', surf('cb_table', 6)], ['plate', surf('cb_shelves', 6)], ['cup', surf('cb_shelves', 8)], ['teapot', surf('cb_shelves', 12)],
  ['ball', surf('pg_left', 1)], ['duck', surf('pg_left', 3)], ['mask', surf('pg_right', 1)], ['balloon', floor('park_games', 800, 820)],
  ['ball', floor('beach', 600, 800)], ['duck', surf('bc_pier', 1)], ['towel', floor('beach', 1000, 830)], ['wateringcan', floor('beach', 300, 820)],
  ['pillow', surf('bb_bench', 1)], ['towel', surf('bb_rack', 4)], ['sled', surf('bb_rack', 7)], ['book', surf('bb_bench', 3)],
];
/** Реквизит из набора «36 предметов»: несколько вещей расставлены для игры, остальные берутся из каталога. */
const PROP_SEEDS: [string, Owner][] = [
  ['beach_bucket', floor('beach', 780, 830)], ['beach_float', floor('beach', 1120, 800)], ['beach_sandcastle', floor('beach', 930, 720)],
  ['club_microphone', floor('club', 620, 840)], ['club_headphones', floor('club', 1240, 850)], ['club_drum', floor('club', 1400, 800)],
  ['toy_octopus', surf('ty_left', 4)], ['toy_train', surf('ty_left', 8)], ['toy_dinosaur', surf('ty_right', 3)], ['toy_music_box', surf('ty_right', 11)],
  ['toy_jack_box', surf('tw_bench', 6)], ['toy_ribbon_station', surf('tw_bench', 7)],
  ['cafe_croissant', surf('cf_sill', 0)], ['cafe_donut', surf('cf_sill', 2)], ['cafe_berry_tart', surf('cf_case', 2)],
  ['cafe_mixer', surf('cb_table', 7)], ['cafe_rolling_pin', surf('cb_table', 0)], ['cafe_mixing_bowl', surf('cb_table', 3)],
  ['pet_double_bowl', floor('animals', 700, 850)], ['pet_rope_ball', floor('animals', 560, 800)], ['pet_grooming_brush', floor('animals', 860, 860)], ['pet_picnic_box', floor('animals', 1500, 720)], ['kibble', floor('animals', 760, 800)],
  ['fair_rings', surf('pg_rings', 1)], ['fair_popcorn', surf('pg_left', 0)], ['fair_cotton_candy', surf('pg_left', 4)], ['fair_plush_prize', surf('pg_right', 0)],
];
/** Новые жители Парка животных. Старые питомцы остаются там, где были. */
const PARK_PETS: World['pets'] = {
  pet_capybara: { id: 'pet_capybara', kind: 'capybara', roomId: 'animals', x: 620, y: 700, sleeping: false, seat: null, collar: 0, flipped: false },
  pet_frenchie: { id: 'pet_frenchie', kind: 'frenchie', roomId: 'animals', x: 880, y: 780, sleeping: false, seat: null, collar: 1, flipped: false },
  pet_wolf: { id: 'pet_wolf', kind: 'wolf', roomId: 'animals', x: 1180, y: 720, sleeping: false, seat: null, collar: 2, flipped: true },
};
/** История «Устрой вечеринку»: пустая коробка для подарка ждёт в мастерской (те же вещи, что и раньше, новых картинок нет). */
const PARTY_SEEDS: [string, Owner][] = [['giftbox', floor('toys_workshop', 820, 830)], ['cupcake', surf('cb_shelves', 2)]];
/** Мешок корма для двойной миски — один, в Парке животных (ещё можно взять в каталоге). */
const FEED_SEEDS: [string, Owner][] = [['pet_food_bag', floor('animals', 620, 860)]];
/** Ферма: у животных постоянные ID, с фермы они не уходят. */
const FARM_PETS: World['pets'] = Object.fromEntries(([
  ['pet_hen', 'hen', 'farm_yard', 480, 700], ['pet_chick', 'chick', 'farm_yard', 610, 750], ['pet_pony', 'pony', 'farm_yard', 1050, 730],
  ['pet_cow', 'cow', 'farm_barn', 330, 760], ['pet_sheep', 'sheep', 'farm_barn', 600, 800], ['pet_pig', 'pig', 'farm_barn', 860, 770], ['pet_goat', 'goat', 'farm_barn', 1120, 800],
] as const).map(([id, kind, roomId, x, y]) => [id, { id, kind, roomId, x, y, sleeping: false, seat: null, collar: 0, flipped: false }]));
/** Кенгуру: постоянные ID, живут только в загоне. */
const PEN_PETS: World['pets'] = {
  farm_kangaroo_adult: { id: 'farm_kangaroo_adult', kind: 'kangaroo', roomId: 'farm_pen', x: 700, y: 760, sleeping: false, seat: null, collar: 0, flipped: false },
  farm_kangaroo_joey: { id: 'farm_kangaroo_joey', kind: 'joey', roomId: 'farm_pen', x: 1000, y: 800, sleeping: false, seat: null, collar: 0, flipped: false },
};
/** Где фермер стоит при входе на ферму: сбоку от дорожки во дворе. */
export const FARMER_SPOT = { roomId: 'farm_yard' as RoomId, x: 860, y: 700 };
function farmer(): World['characters'][string] { return { ...presetCharacter('farm_worker_lev')!, roomId: FARMER_SPOT.roomId, x: FARMER_SPOT.x, y: FARMER_SPOT.y }; }
const FARM_HOME: Record<string, RoomId> = Object.fromEntries([...Object.values(FARM_PETS), ...Object.values(PEN_PETS)].map((p) => [p.id, p.roomId]));
const FARM_SEEDS: [string, Owner][] = [
  ['farm_grain', floor('farm_yard', 300, 830)], ['farm_basket', floor('farm_yard', 760, 840)], ['farm_can', floor('farm_yard', 1300, 800)],
  ['farm_hay', floor('farm_barn', 840, 860)], ['farm_milkcan', floor('farm_barn', 1480, 760)],
];
const LOCATION_ROOMS: RoomId[] = ['farm_yard', 'farm_barn', 'farm_pen', 'animals', 'park', 'park_games', 'cafe', 'cafe_bakery', 'toys', 'toys_workshop', 'beach', 'beach_boats', 'club'];
function seedLocations(world: World, seeds: [string, Owner][] = [...LOCATION_SEEDS, ...PROP_SEEDS, ...PARTY_SEEDS, ...FEED_SEEDS, ...FARM_SEEDS]): World {
  let w = world;
  for (const [def, owner] of seeds) {
    const r = spawnItem(w, def, owner, def === 'giftbox' ? { packed: false, paper: 2, bow: 1 } : {});
    if (!r.ok) continue; // место занято или вещей слишком много — мир игрока важнее раскладки
    w = r.world;
    w.items[r.info!.instanceId as string].home = owner;
  }
  return w;
}

export function createWorld(lang: 'ru' | 'en' = 'ru'): World {
  let w: World = {
    schemaVersion: SCHEMA_VERSION, revision: 0, nextId: 0, currentRoomId: 'living', lastScreen: 'title',
    items: {}, characters: {}, pets: {}, furniture: initialFurniture(),
    rooms: {
      living: { wallpaper: 0, floor: 0, lightOn: true }, kitchen: { wallpaper: 1, floor: 1, lightOn: true },
      bedroom: { wallpaper: 2, floor: 2, lightOn: true }, bathroom: { wallpaper: 3, floor: 3, lightOn: true },
      ...Object.fromEntries(LOCATION_ROOMS.map((r) => [r, { wallpaper: 0, floor: 0, lightOn: true }])),
    } as World['rooms'],
    openedGiftIds: [], savedOutfits: [],
    settings: { lang, music: 0.5, sfx: 0.8, mute: false, reducedMotion: false, tutorialDone: false, voices: true },
  };
  for (const [id] of PRESET_HEROES) w.characters[id] = presetCharacter(id)!;
  Object.assign(w.characters.hero_mila, { roomId: 'living', x: 760, y: 800 });
  Object.assign(w.characters.hero_timur, { roomId: 'living', x: 300, y: 820 });
  w.pets = {
    pet_cat: { id: 'pet_cat', kind: 'cat', roomId: 'living', x: 1340, y: 800, sleeping: false, seat: null, collar: 0, flipped: false },
    pet_dog: { id: 'pet_dog', kind: 'dog', roomId: 'bedroom', x: 900, y: 830, sleeping: false, seat: null, collar: 1, flipped: false },
    pet_rabbit: { id: 'pet_rabbit', kind: 'rabbit', roomId: 'kitchen', x: 1250, y: 840, sleeping: false, seat: null, collar: 2, flipped: true },
    ...structuredClone(PARK_PETS),
    ...structuredClone(FARM_PETS),
    ...structuredClone(PEN_PETS),
  };
  w.characters.farm_worker_lev = farmer();
  for (const [def, owner] of SEEDS) {
    // контейнеры временно открыты, чтобы разложить вещи
    const r = spawnItem(w, def, owner);
    if (!r.ok) throw new Error(`seed ${def}: ${r.reason}`);
    w = r.world;
    w.items[r.info!.instanceId as string].home = owner;
  }
  return seedLocations(w);
}

// ---------- Проверка целостности ----------

const ID_RE = /^[a-z0-9_]{1,48}$/i;

/** Возвращает список нарушений инвариантов. Пустой список — мир цел. */
export function validateWorld(w: World): string[] {
  const errs: string[] = [];
  const slotKeys = new Set<string>();
  const take = (key: string, what: string) => { if (slotKeys.has(key)) errs.push(`double:${what}`); slotKeys.add(key); };
  if (Object.keys(w.items).length > MAX_ITEMS + 40) errs.push('too_many_items');
  for (const [id, it] of Object.entries(w.items)) {
    if (it.instanceId !== id || !ID_RE.test(id)) errs.push(`bad_id:${id}`);
    const def = ITEMS[it.definitionId];
    if (!def) { errs.push(`no_def:${id}`); continue; }
    const o = it.owner;
    switch (o?.kind) {
      case 'room': if (!w.rooms[o.roomId] || !isFinite(o.x) || !isFinite(o.y)) errs.push(`bad_room:${id}`); break;
      case 'surface': {
        const f = w.furniture[o.furnitureId];
        if (!f || !FURNITURE[f.definitionId]?.surfaces?.[o.slot]) errs.push(`orphan:${id}`);
        take(`s:${o.furnitureId}:${o.slot}`, id); break;
      }
      case 'furniture': {
        const f = w.furniture[o.furnitureId];
        const c = f && FURNITURE[f.definitionId]?.container;
        if (!c || !(o.slot >= 0 && o.slot < c.capacity)) errs.push(`orphan:${id}`);
        take(`f:${o.furnitureId}:${o.slot}`, id); break;
      }
      case 'hand': {
        if (!w.characters[o.characterId]) errs.push(`orphan:${id}`);
        if (def.tags.includes('big') !== (o.slot === 'both')) errs.push(`bad_hand:${id}`);
        take(`h:${o.characterId}:${o.slot}`, id);
        if (o.slot === 'both') { take(`h:${o.characterId}:left`, id); take(`h:${o.characterId}:right`, id); }
        break;
      }
      case 'item': {
        const p = w.items[o.itemId];
        const cap = p && ITEMS[p.definitionId]?.capacity;
        if (!p || !cap || !(o.slot >= 0 && o.slot < cap)) errs.push(`orphan:${id}`);
        else if (o.itemId === id || isInside(w, o.itemId, id)) errs.push(`cycle:${id}`);
        take(`i:${o.itemId}:${o.slot}`, id); break;
      }
      case 'bag': if (!(o.slot >= 0 && o.slot < BAG_CAPACITY)) errs.push(`orphan:${id}`); take(`b:${o.slot}`, id); break;
      case 'lost': break;
      default: errs.push(`bad_owner:${id}`);
    }
  }
  const seats = new Set<string>();
  for (const [id, c] of Object.entries(w.characters)) {
    if (c.id !== id || !ID_RE.test(id)) errs.push(`bad_id:${id}`);
    if (c.roomId !== null && !w.rooms[c.roomId]) errs.push(`bad_room:${id}`);
    if (!isValidOutfit(c.outfit)) errs.push(`bad_outfit:${id}`);
    if (c.seat) {
      const f = w.furniture[c.seat.furnitureId];
      if (!f || !FURNITURE[f.definitionId]?.seats?.[c.seat.slot] || f.roomId !== c.roomId) errs.push(`bad_seat:${id}`);
      const k = `${c.seat.furnitureId}:${c.seat.slot}`;
      if (seats.has(k)) errs.push(`double_seat:${id}`);
      seats.add(k);
    }
  }
  for (const [id, f] of Object.entries(w.furniture)) {
    if (f.id !== id || !FURNITURE[f.definitionId]) errs.push(`bad_furniture:${id}`);
    if (f.roomId !== null && !w.rooms[f.roomId]) errs.push(`bad_room:${id}`);
  }
  for (const [id, p] of Object.entries(w.pets)) if (p.id !== id || !w.rooms[p.roomId]) errs.push(`bad_pet:${id}`);
  for (const p of Object.values(w.pets)) if (!petAllowedIn(p.kind, p.roomId)) errs.push(`farm_pet:${p.id}`);
  for (const c of Object.values(w.characters)) if (!charAllowedIn(c.id, c.roomId)) errs.push(`farm_char:${c.id}`);
  if (!w.rooms[w.currentRoomId]) errs.push('bad_current_room');
  return errs;
}

/** Мягкая починка: осиротевшие вещи отправляются в корзину найденных вещей, а не удаляются. */
export function repairWorld(world: World): World {
  let w: World = JSON.parse(JSON.stringify(world));
  for (let pass = 0; pass < 3; pass++) {
    const errs = validateWorld(w);
    if (!errs.length) break;
    for (const e of errs) {
      const [kind, id] = e.split(':');
      if (['orphan', 'cycle', 'double', 'bad_owner', 'bad_hand', 'bad_room'].includes(kind) && w.items[id]) w.items[id].owner = { kind: 'lost' };
      if (kind === 'farm_pet' && w.pets[id]) { const p = w.pets[id]; p.roomId = FARM_HOME[id] ?? 'farm_yard'; p.x = 800; p.y = 780; p.seat = null; p.sleeping = false; } // житель фермы возвращается домой
      if (kind === 'farm_char' && w.characters[id]) Object.assign(w.characters[id], { roomId: FARMER_SPOT.roomId, x: FARMER_SPOT.x, y: FARMER_SPOT.y, seat: null, pose: 'standing' });
      if (kind === 'no_def') delete w.items[id];
      if ((kind === 'bad_seat' || kind === 'double_seat') && w.characters[id]) { w.characters[id].seat = null; w.characters[id].pose = 'standing'; }
      if (kind === 'bad_outfit' && w.characters[id]) w.characters[id].outfit = { top: { id: 'tee', color: 0 }, bottom: { id: 'shorts', color: 0 } };
    }
  }
  return w;
}

// ---------- Миграции ----------

type Migration = (raw: any) => any;
/** Ключ — версия, С которой переводим. */
export const MIGRATIONS: Record<number, Migration> = {
  // v1 (этап A): не было питомцев, сохранённых комплектов и стартовых мест мебели.
  1: (raw) => {
    const fresh = createWorld(raw.settings?.lang === 'en' ? 'en' : 'ru');
    raw.pets = raw.pets ?? fresh.pets;
    raw.savedOutfits = raw.savedOutfits ?? [];
    for (const [id, f] of Object.entries<any>(raw.furniture ?? {})) {
      f.homeX = f.homeX ?? fresh.furniture[id]?.homeX ?? f.x;
      f.homeY = f.homeY ?? fresh.furniture[id]?.homeY ?? f.y;
      f.color = f.color ?? 0; f.on = typeof f.on === 'number' ? f.on : f.on ? 1 : 0;
    }
    for (const [id, f] of Object.entries(fresh.furniture)) if (!raw.furniture[id]) raw.furniture[id] = f;
    for (const r of ROOM_IDS) raw.rooms[r] = raw.rooms[r] ?? fresh.rooms[r];
    raw.settings = { ...fresh.settings, ...(raw.settings ?? {}) };
    raw.schemaVersion = 2;
    return raw;
  },
  // v2: были только домики. Появились локации города — их комнаты, мебель и стартовые вещи; всё прежнее остаётся как было.
  2: (raw) => {
    const fresh = createWorld(raw.settings?.lang === 'en' ? 'en' : 'ru');
    for (const r of LOCATION_ROOMS) raw.rooms[r] = raw.rooms[r] ?? fresh.rooms[r];
    for (const [id, f] of Object.entries(fresh.furniture)) if (!raw.furniture[id]) raw.furniture[id] = f;
    raw.schemaVersion = 3;
    return seedLocations(raw as World, LOCATION_SEEDS);
  },
  // v3: появились Парк животных, три новых питомца и реквизит локаций. Старые питомцы и вещи не дублируются и не переезжают.
  3: (raw) => {
    const fresh = createWorld(raw.settings?.lang === 'en' ? 'en' : 'ru');
    for (const r of LOCATION_ROOMS) raw.rooms[r] = raw.rooms[r] ?? fresh.rooms[r];
    for (const [id, f] of Object.entries(fresh.furniture)) if (!raw.furniture[id]) raw.furniture[id] = f;
    for (const [id, p] of Object.entries(PARK_PETS)) if (!raw.pets[id]) raw.pets[id] = structuredClone(p);
    raw.schemaVersion = 4;
    return seedLocations(raw as World, PROP_SEEDS);
  },
  // v4: для истории «Устрой вечеринку» в клубе появился столик, в мастерской — пустая коробка для подарка. Больше ничего не меняется.
  4: (raw) => {
    const fresh = createWorld(raw.settings?.lang === 'en' ? 'en' : 'ru');
    if (!raw.furniture.cl_table) raw.furniture.cl_table = fresh.furniture.cl_table;
    raw.schemaVersion = 5;
    return seedLocations(raw as World, PARTY_SEEDS);
  },
  // v5: появился мешок корма. Старые миски остаются как были (пустые половины), ничего не удаляется.
  5: (raw) => { raw.schemaVersion = 6; return seedLocations(raw as World, FEED_SEEDS); },
  // v6: появилась ферма — два экрана, семь её жителей и реквизит. Добавляется один раз, остальное не меняется.
  6: (raw) => {
    const fresh = createWorld(raw.settings?.lang === 'en' ? 'en' : 'ru');
    for (const r of LOCATION_ROOMS) raw.rooms[r] = raw.rooms[r] ?? fresh.rooms[r];
    for (const [id, f] of Object.entries(fresh.furniture)) if (!raw.furniture[id]) raw.furniture[id] = f;
    for (const [id, p] of Object.entries(FARM_PETS)) if (!raw.pets[id]) raw.pets[id] = structuredClone(p);
    raw.schemaVersion = 7;
    return seedLocations(raw as World, FARM_SEEDS);
  },
  // v7: на ферме появились фермер Лев и загон с двумя кенгуру. Добавляются один раз.
  7: (raw) => {
    const fresh = createWorld(raw.settings?.lang === 'en' ? 'en' : 'ru');
    for (const r of LOCATION_ROOMS) raw.rooms[r] = raw.rooms[r] ?? fresh.rooms[r];
    for (const [id, p] of Object.entries(PEN_PETS)) if (!raw.pets[id]) raw.pets[id] = structuredClone(p);
    if (!raw.characters.farm_worker_lev) raw.characters.farm_worker_lev = farmer();
    raw.schemaVersion = 8;
    return raw;
  },
};

export function migrate(raw: any): any {
  let cur = raw;
  for (let guard = 0; cur.schemaVersion < SCHEMA_VERSION && guard < 20; guard++) {
    const m = MIGRATIONS[cur.schemaVersion];
    if (!m) throw new Error('no_migration');
    cur = m(cur);
  }
  return cur;
}

// ---------- Импорт ----------

export const MAX_IMPORT_BYTES = 2_000_000;
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown) => typeof v === 'number' && isFinite(v);

/** Проверка формы данных: только известные поля и типы. Ничего не исполняется, URL ассетов в сохранении нет вовсе. */
function checkShape(w: any): string | null {
  if (!isObj(w)) return 'not_object';
  if (!num(w.schemaVersion) || !num(w.revision) || !num(w.nextId)) return 'bad_header';
  for (const k of ['items', 'characters', 'pets', 'furniture', 'rooms', 'settings']) if (!isObj(w[k])) return `bad_${k}`;
  if (w.preparedIdeas !== undefined && !(Array.isArray(w.preparedIdeas) && w.preparedIdeas.length <= 40 && w.preparedIdeas.every((x: unknown) => typeof x === 'string' && ID_RE.test(x)))) return 'bad_ideas';
  if (!Array.isArray(w.openedGiftIds) || !w.openedGiftIds.every((x: unknown) => typeof x === 'string' && ID_RE.test(x))) return 'bad_gifts';
  if (!Array.isArray(w.savedOutfits) || w.savedOutfits.length > 40) return 'bad_outfits';
  for (const it of Object.values<any>(w.items)) {
    if (!isObj(it) || typeof it.instanceId !== 'string' || typeof it.definitionId !== 'string' || !isObj(it.owner) || !isObj(it.state)) return 'bad_item';
    if (it.state.contents !== undefined && !['water', 'milk', 'tea'].includes(it.state.contents)) return 'bad_item';
    if ((it.state.water !== undefined && typeof it.state.water !== 'boolean') || (it.state.kibble !== undefined && typeof it.state.kibble !== 'boolean')) return 'bad_item';
    if (it.state.card !== undefined && (typeof it.state.card !== 'string' || it.state.card.length > 60)) return 'bad_item';
    if (it.state.mix !== undefined && !(Array.isArray(it.state.mix) && it.state.mix.length <= 4 && it.state.mix.every((m: unknown) => typeof m === 'string' && !!ITEMS[m as string]))) return 'bad_item';
  }
  for (const c of Object.values<any>(w.characters)) {
    if (!isObj(c) || typeof c.id !== 'string' || typeof c.name !== 'string' || c.name.length > 16 || !isObj(c.look) || !isObj(c.outfit) || !num(c.x) || !num(c.y)) return 'bad_character';
    for (const k of ['skin', 'face', 'eyes', 'brows', 'hair', 'hairColor', 'glasses']) if (!num(c.look[k]) || c.look[k] < 0 || c.look[k] > 8) return 'bad_look';
    for (const worn of Object.values<any>(c.outfit)) if (!isObj(worn) || !GARMENTS[worn.id]) return 'bad_outfit';
    if (c.dream !== undefined && !ITEMS[c.dream]) return 'bad_character';
  }
  for (const f of Object.values<any>(w.furniture)) if (!isObj(f) || !FURNITURE[f.definitionId] || !num(f.x) || !num(f.y)) return 'bad_furniture';
  for (const p of Object.values<any>(w.pets)) if (!isObj(p) || !['cat', 'dog', 'rabbit', 'capybara', 'frenchie', 'wolf', 'cow', 'sheep', 'pig', 'goat', 'hen', 'chick', 'pony', 'kangaroo', 'joey'].includes(p.kind) || !num(p.x) || !num(p.y)) return 'bad_pet';
  for (const s of w.savedOutfits) if (!isObj(s) || typeof s.name !== 'string' || s.name.length > 24 || !isObj(s.outfit) || !isValidOutfit(s.outfit)) return 'bad_outfits';
  const st = w.settings;
  if (!['ru', 'en'].includes(st.lang) || !num(st.music) || !num(st.sfx)) return 'bad_settings';
  return null;
}

export type ParseResult = { ok: true; world: World } | { ok: false; reason: string };

/** Разбор сохранения или импортируемого файла: размер → JSON → версия → миграции → форма → инварианты. */
export function parseWorld(text: string): ParseResult {
  if (typeof text !== 'string' || text.length > MAX_IMPORT_BYTES) return { ok: false, reason: 'too_big' };
  let raw: any;
  try { raw = JSON.parse(text); } catch { return { ok: false, reason: 'not_json' }; }
  if (!isObj(raw) || !num(raw.schemaVersion)) return { ok: false, reason: 'not_world' };
  if (raw.schemaVersion > SCHEMA_VERSION) return { ok: false, reason: 'newer_version' };
  if (raw.schemaVersion < 1) return { ok: false, reason: 'bad_version' };
  try { raw = migrate(raw); } catch { return { ok: false, reason: 'migration_failed' }; }
  const shape = checkShape(raw);
  if (shape) return { ok: false, reason: shape };
  const errs = validateWorld(raw as World);
  if (errs.length) return { ok: false, reason: `invalid:${errs[0]}` };
  return { ok: true, world: raw as World };
}

export { moveItem };
