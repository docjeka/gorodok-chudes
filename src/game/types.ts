// Типы данных мира. Модель — единственный источник правды; сцена строится из неё.

export const SCHEMA_VERSION = 2;
export const ROOM_W = 1600;
export const ROOM_H = 900;
export const FLOOR_TOP = 600;
export const FLOOR_BOTTOM = 870;
export const MAX_ITEMS = 260;
export const MAX_CUSTOM_HEROES = 12;
export const BAG_CAPACITY = 8;
export const GIFT_CAPACITY = 5;

export type RoomId = 'living' | 'kitchen' | 'bedroom' | 'bathroom';
export type HandSlot = 'left' | 'right';

/** Владелец предмета. У каждого экземпляра он ровно один. */
export type Owner =
  | { kind: 'room'; roomId: RoomId; x: number; y: number }
  | { kind: 'surface'; furnitureId: string; slot: number }
  | { kind: 'hand'; characterId: string; slot: HandSlot | 'both' | 'head' }
  | { kind: 'furniture'; furnitureId: string; slot: number } // внутри мебели-контейнера
  | { kind: 'item'; itemId: string; slot: number } // внутри предмета-контейнера (корзина, коробка)
  | { kind: 'bag'; slot: number } // сумка, путешествует с игроком
  | { kind: 'lost' }; // корзина найденных вещей

export type Liquid = 'water' | 'milk' | 'tea';

export interface ItemInst {
  instanceId: string;
  definitionId: string;
  owner: Owner;
  /** стартовое место — для кнопки «Прибрать комнату» */
  home?: Owner;
  state: {
    servings?: number;
    dirty?: boolean;
    /** что налито в чашку или стакан */
    contents?: Liquid;
    /** для подарочной коробки */
    packed?: boolean;
    giftSetId?: string;
    paper?: number;
    bow?: number;
    card?: string;
    /** чудо-блюдо: из чего собрано */
    mix?: string[];
  };
}

export type Emotion = 'joy' | 'surprise' | 'sleepy' | 'calm' | 'silly' | 'sad' | 'delight' | 'thinking';
export type Pose = 'standing' | 'sitting' | 'sleeping' | 'bathing';

export interface Look {
  skin: number; // 0..5
  face: number; // 0..2
  eyes: number; // 0..5
  brows: number; // 0..2
  hair: number; // 0..7
  hairColor: number; // 0..7
  freckles: boolean;
  glasses: number; // 0 = нет
  hearingAid: boolean;
}

export type GarmentSlot = 'top' | 'bottom' | 'dress' | 'shoes' | 'hat' | 'bag' | 'jewelry' | 'extra';
export interface Worn { id: string; color: number }
export type Outfit = Partial<Record<GarmentSlot, Worn>>;

export interface Character {
  id: string;
  name: string;
  preset: boolean;
  look: Look;
  outfit: Outfit;
  /** null — герой отдыхает на полке героев и не стоит ни в одной комнате */
  roomId: RoomId | null;
  x: number;
  y: number;
  pose: Pose;
  seat: { furnitureId: string; slot: number } | null;
  emotion: Emotion;
  flipped: boolean;
  /** о чём приснится сон: последняя вещь, которую герой ел или держал */
  dream?: string;
  /** комплект, надетый целиком: по нему выбирается готовый спрайт фигурки */
  costume?: string;
}

export type PetKind = 'cat' | 'dog' | 'rabbit';
export interface Pet {
  id: string;
  kind: PetKind;
  roomId: RoomId;
  x: number;
  y: number;
  sleeping: boolean;
  seat: { furnitureId: string; slot: number } | null;
  collar: number;
  flipped: boolean;
  /** кот забрался в корзину или коробку */
  inItem?: string;
}

export interface FurnitureInst {
  id: string;
  definitionId: string;
  /** null — мебель убрана на склад */
  roomId: RoomId | null;
  x: number;
  y: number;
  flipped: boolean;
  open: boolean;
  on: number; // 0 — выключено; для телевизора номер сценки
  color: number;
  homeX: number;
  homeY: number;
}

export interface RoomState { wallpaper: number; floor: number; lightOn: boolean }

export interface SavedOutfit { id: string; name: string; outfit: Outfit }

export interface Settings {
  lang: 'ru' | 'en';
  music: number; // 0..1
  sfx: number;
  mute: boolean;
  reducedMotion: boolean;
  tutorialDone: boolean;
  /** голоса героев; в старых сохранениях поля нет — считается включённым */
  voices?: boolean;
  /** масштаб комнаты: 1 — по высоте экрана, меньше — отдалить, больше — приблизить */
  zoom?: number;
}

export interface World {
  schemaVersion: number;
  revision: number;
  nextId: number;
  currentRoomId: RoomId;
  lastScreen: 'title' | 'room';
  items: Record<string, ItemInst>;
  characters: Record<string, Character>;
  pets: Record<string, Pet>;
  furniture: Record<string, FurnitureInst>;
  rooms: Record<RoomId, RoomState>;
  openedGiftIds: string[];
  savedOutfits: SavedOutfit[];
  settings: Settings;
}

// ---------- Определения контента ----------

export type ItemTag =
  | 'food' | 'ingredient' | 'dish' | 'drink' | 'toy' | 'tableware' | 'care' | 'petfood' | 'pettoy'
  | 'decor' | 'container' | 'giftbox' | 'costume' | 'book' | 'big';

export interface ItemDef {
  id: string;
  tags: ItemTag[];
  /** габарит для зоны касания и раскладки */
  w: number;
  h: number;
  servings?: number;
  /** после последней порции превращается в этот предмет (тарелка, стакан) */
  leaves?: string;
  capacity?: number;
  /** комплект одежды, который надевается при переносе на героя */
  wearSet?: string;
  /** можно создавать копии из каталога */
  catalog?: 'food' | 'toys' | 'table' | 'care' | 'pets' | 'party';
  /** точка хвата относительно низа-центра */
  grip?: { x: number; y: number };
}

export type Workspace = 'board' | 'stove' | 'blender';
export type FurnitureCategory = 'seats' | 'tables' | 'beds' | 'storage' | 'lighting' | 'decor' | 'kitchen' | 'plants' | 'toys' | 'bath';

export interface Pt { x: number; y: number }

export interface FurnitureDef {
  id: string;
  category: FurnitureCategory;
  w: number;
  h: number;
  /** wall — висит на стене и не сортируется по глубине; floor — стоит на полу */
  layer: 'wall' | 'floor' | 'rug';
  seats?: (Pt & { pose: Pose })[];
  petSeats?: Pt[];
  surfaces?: Pt[];
  container?: { capacity: number; slots: Pt[] };
  workspace?: Workspace;
  tap?: 'toggleOpen' | 'toggleOn' | 'tv' | 'light' | 'water' | 'wardrobe' | 'stove';
  colors?: number;
  /** часть спрайта, которая рисуется поверх героя (одеяло, борт ванны), в единицах от опорной точки */
  front?: { x0: number; y0: number; x1: number; y1: number };
  frontOn?: { x0: number; y0: number; x1: number; y1: number };
  fixed?: boolean; // нельзя убрать на склад (например, окно)
}

export interface Recipe {
  id: string;
  workspace: Workspace;
  ingredients: string[];
  result: string;
}

export interface GarmentDef {
  id: string;
  slot: GarmentSlot;
  colors: string[][]; // палитра: варианты [основной, дополнительный]
  /** шапка закрывает макушку — волосы обрезаются маской */
  coversHair?: boolean;
}

export interface OutfitSetDef { id: string; outfit: Outfit }

export interface GiftSetDef { id: string; items: string[]; paper: number; bow: number }

export type Result<T = World> = { ok: true; world: T; info?: Record<string, unknown> } | { ok: false; reason: string };
