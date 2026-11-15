import type { ItemDef, Recipe, GiftSetDef } from '../game/types';

const d = (id: string, tags: ItemDef['tags'], w: number, h: number, extra: Partial<ItemDef> = {}): ItemDef => ({ id, tags, w, h, ...extra });

export const ITEM_LIST: ItemDef[] = [
  // посуда
  d('cup', ['tableware'], 40, 36, { catalog: 'table' }),
  d('plate', ['tableware'], 60, 16, { catalog: 'table' }),
  d('glass', ['tableware'], 30, 44, { catalog: 'table' }),
  d('teapot', ['tableware'], 64, 50, { catalog: 'table' }),
  d('bowl', ['tableware'], 52, 24, { catalog: 'pets' }),
  // продукты
  d('bread', ['food', 'ingredient'], 54, 34, { servings: 1, catalog: 'food' }),
  d('cheese', ['food', 'ingredient'], 46, 32, { servings: 1, catalog: 'food' }),
  d('tomato', ['food', 'ingredient'], 38, 36, { servings: 1, catalog: 'food' }),
  d('lettuce', ['food', 'ingredient'], 48, 38, { servings: 1, catalog: 'food' }),
  d('cucumber', ['food', 'ingredient'], 56, 22, { servings: 1, catalog: 'food' }),
  d('apple', ['food', 'ingredient'], 38, 40, { servings: 1, catalog: 'food' }),
  d('banana', ['food', 'ingredient'], 54, 30, { servings: 1, catalog: 'food' }),
  d('strawberry', ['food', 'ingredient'], 32, 36, { servings: 1, catalog: 'food' }),
  d('milk', ['food', 'drink', 'ingredient'], 34, 56, { servings: 1, catalog: 'food' }),
  d('egg', ['food', 'ingredient'], 28, 34, { servings: 1, catalog: 'food' }),
  d('dough', ['ingredient'], 52, 30, { catalog: 'food' }),
  d('chocolate', ['food', 'ingredient'], 46, 30, { servings: 1, catalog: 'food' }),
  d('carrot', ['food', 'ingredient', 'petfood'], 52, 24, { servings: 1, catalog: 'food' }),
  // блюда
  d('sandwich', ['food', 'dish'], 64, 42, { servings: 2, leaves: 'plate' }),
  d('fruitplate', ['food', 'dish'], 66, 40, { servings: 3, leaves: 'plate' }),
  d('salad', ['food', 'dish'], 64, 42, { servings: 3, leaves: 'plate' }),
  d('pizza', ['food', 'dish'], 78, 26, { servings: 4, leaves: 'plate' }),
  d('cupcake', ['food', 'dish'], 40, 46, { servings: 1 }),
  d('smoothie', ['food', 'drink', 'dish'], 34, 58, { servings: 2, leaves: 'glass' }),
  d('cookies', ['food', 'dish'], 66, 32, { servings: 4, leaves: 'plate' }),
  d('cake', ['food', 'dish'], 80, 72, { servings: 6, leaves: 'plate' }),
  d('wonderdish', ['food', 'dish'], 66, 70, { servings: 1, leaves: 'plate' }),
  d('cocoa', ['food', 'drink', 'dish'], 42, 44, { servings: 1, leaves: 'cup' }),
  // игрушки
  d('ball', ['toy', 'pettoy'], 44, 44, { catalog: 'toys' }),
  d('teddy', ['toy'], 52, 62, { catalog: 'toys' }),
  d('bunnytoy', ['toy'], 44, 66, { catalog: 'toys' }),
  d('blocks', ['toy'], 62, 56, { catalog: 'toys' }),
  d('car', ['toy'], 64, 36, { catalog: 'toys' }),
  d('doll', ['toy'], 36, 64, { catalog: 'toys' }),
  d('duck', ['toy'], 44, 40, { catalog: 'toys' }),
  d('robot', ['toy'], 44, 62, { catalog: 'toys' }),
  d('rocket', ['toy'], 40, 72, { catalog: 'toys' }),
  d('planet', ['toy', 'pettoy'], 56, 46, { catalog: 'toys' }),
  d('snowglobe', ['toy', 'decor'], 46, 54, { catalog: 'toys' }),
  d('sled', ['toy'], 70, 34, { catalog: 'toys' }),
  d('mittens', ['toy'], 52, 36, { catalog: 'toys' }),
  d('wateringcan', ['toy'], 62, 46, { catalog: 'toys' }),
  d('flowerpot', ['decor'], 44, 62, { catalog: 'toys' }),
  d('pillow', ['decor'], 62, 38, { catalog: 'toys' }),
  d('starlamp', ['decor'], 44, 56, { catalog: 'toys' }),
  d('book', ['book', 'toy'], 48, 38, { catalog: 'toys' }),
  // праздник
  d('wand', ['toy'], 24, 70, { catalog: 'party' }),
  d('crown', ['toy'], 50, 34, { catalog: 'party' }),
  d('mask', ['toy'], 56, 30, { catalog: 'party' }),
  d('balloon', ['toy'], 42, 96, { catalog: 'party', grip: { x: 0, y: 0 } }),
  d('partyhat', ['toy'], 36, 50, { catalog: 'party' }),
  // уход
  d('toothbrush', ['care'], 16, 56, { catalog: 'care' }),
  d('comb', ['care'], 50, 24, { catalog: 'care' }),
  d('towel', ['care'], 54, 44, { catalog: 'care' }),
  d('soap', ['care'], 40, 24, { catalog: 'care' }),
  // питомцы
  d('petbrush', ['care'], 50, 30, { catalog: 'pets' }),
  d('kibble', ['petfood'], 52, 30, { servings: 3, leaves: 'bowl', catalog: 'pets' }),
  d('bone', ['pettoy', 'toy'], 52, 24, { catalog: 'pets' }),
  // ---------- реквизит локаций города (готовые PNG, подписи — ключи prop.<id>) ----------
  d('beach_bucket', ['toy'], 50, 66, { catalog: 'toys' }),
  d('beach_float', ['toy'], 80, 68, { catalog: 'toys' }),
  d('beach_sandcastle', ['toy', 'decor'], 112, 108, { catalog: 'toys' }),
  d('club_microphone', ['toy'], 30, 72, { catalog: 'party' }),
  d('club_headphones', ['toy'], 72, 64, { catalog: 'party' }),
  d('club_drum', ['toy'], 82, 79, { catalog: 'party' }),
  d('toy_octopus', ['toy'], 62, 65, { catalog: 'toys' }),
  d('toy_train', ['toy'], 80, 68, { catalog: 'toys' }),
  d('toy_dinosaur', ['toy'], 82, 66, { catalog: 'toys' }),
  d('toy_music_box', ['toy'], 72, 63, { catalog: 'toys' }),
  d('toy_jack_box', ['toy'], 62, 73, { catalog: 'toys' }),
  d('toy_ribbon_station', ['decor'], 84, 61, { catalog: 'party' }),
  d('cafe_croissant', ['food'], 54, 41, { servings: 1, catalog: 'food' }),
  d('cafe_donut', ['food'], 48, 46, { servings: 1, catalog: 'food' }),
  d('cafe_berry_tart', ['food'], 52, 48, { servings: 1, catalog: 'food' }),
  d('cafe_mixer', ['tableware'], 72, 81, { catalog: 'table' }),
  d('cafe_rolling_pin', ['tableware'], 80, 21, { catalog: 'table' }),
  d('cafe_mixing_bowl', ['tableware'], 66, 70, { catalog: 'table' }),
  d('pet_double_bowl', ['tableware'], 88, 41, { catalog: 'pets' }),
  d('pet_grooming_brush', ['care'], 58, 46, { catalog: 'pets' }),
  d('pet_rope_ball', ['toy', 'pettoy'], 50, 49, { catalog: 'pets' }),
  d('pet_picnic_box', ['container'], 72, 76, { capacity: 6, catalog: 'pets' }),
  d('fair_rings', ['toy'], 62, 55, { catalog: 'toys' }),
  d('fair_popcorn', ['food'], 48, 60, { servings: 3, catalog: 'food' }),
  d('fair_cotton_candy', ['food'], 52, 67, { servings: 1, catalog: 'food' }),
  d('fair_plush_prize', ['toy'], 60, 71, { catalog: 'toys' }),
  // контейнеры
  d('basket', ['container'], 76, 54, { capacity: 8, catalog: 'table' }),
  d('giftbox', ['container', 'giftbox', 'big'], 84, 86, { capacity: 5 }),
  // костюмы в подарках
  d('costume_astronaut', ['costume'], 56, 60, { wearSet: 'astronaut' }),
  d('costume_fairy', ['costume'], 56, 60, { wearSet: 'fairy' }),
  d('costume_princess', ['costume'], 56, 60, { wearSet: 'princess' }),
  d('costume_winter', ['costume'], 56, 60, { wearSet: 'winter' }),
  d('costume_cat', ['costume'], 56, 60, { wearSet: 'cat' }),
  d('costume_pajama', ['costume'], 56, 60, { wearSet: 'pajama' }),
  d('costume_gardener', ['costume'], 56, 60, { wearSet: 'gardener' }),
  d('costume_chef', ['costume'], 56, 60, { wearSet: 'chef' }),
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(ITEM_LIST.map((i) => [i.id, i]));

export const RECIPES: Recipe[] = [
  { id: 'sandwich', workspace: 'board', ingredients: ['bread', 'cheese', 'tomato'], result: 'sandwich' },
  { id: 'fruitplate', workspace: 'board', ingredients: ['apple', 'banana', 'strawberry'], result: 'fruitplate' },
  { id: 'salad', workspace: 'board', ingredients: ['lettuce', 'tomato', 'cucumber'], result: 'salad' },
  { id: 'pizza', workspace: 'stove', ingredients: ['dough', 'cheese', 'tomato'], result: 'pizza' },
  { id: 'cupcake', workspace: 'stove', ingredients: ['dough', 'egg', 'strawberry'], result: 'cupcake' },
  { id: 'cookies', workspace: 'stove', ingredients: ['dough', 'chocolate'], result: 'cookies' },
  { id: 'cake', workspace: 'stove', ingredients: ['dough', 'egg', 'milk', 'chocolate'], result: 'cake' },
  { id: 'smoothie', workspace: 'blender', ingredients: ['banana', 'strawberry', 'milk'], result: 'smoothie' },
  { id: 'cocoa', workspace: 'stove', ingredients: ['milk', 'chocolate'], result: 'cocoa' },
];

/** Чем пополняется холодильник по кнопке. */
export const FRIDGE_STOCK = ['bread', 'cheese', 'tomato', 'lettuce', 'cucumber', 'apple', 'banana', 'strawberry', 'milk', 'egg', 'dough', 'chocolate'];

export const GIFT_SETS: GiftSetDef[] = [
  { id: 'cozy', items: ['pillow', 'starlamp', 'teddy', 'book', 'costume_pajama'], paper: 0, bow: 0 },
  { id: 'tea', items: ['teapot', 'cup', 'cup', 'cookies', 'costume_chef'], paper: 1, bow: 1 },
  { id: 'space', items: ['rocket', 'planet', 'robot', 'starlamp', 'costume_astronaut'], paper: 2, bow: 2 },
  { id: 'winter', items: ['snowglobe', 'mittens', 'sled', 'cocoa', 'costume_winter'], paper: 3, bow: 0 },
  { id: 'garden', items: ['wateringcan', 'flowerpot', 'carrot', 'basket', 'costume_gardener'], paper: 4, bow: 1 },
  { id: 'animals', items: ['petbrush', 'ball', 'bone', 'kibble', 'costume_cat'], paper: 5, bow: 2 },
  { id: 'carnival', items: ['wand', 'crown', 'mask', 'balloon', 'costume_fairy'], paper: 0, bow: 2 },
  { id: 'birthday', items: ['cake', 'balloon', 'partyhat', 'cupcake', 'costume_princess'], paper: 1, bow: 0 },
];
export const GIFTS: Record<string, GiftSetDef> = Object.fromEntries(GIFT_SETS.map((g) => [g.id, g]));

export const IDEA_CARDS = ['breakfast', 'birthday', 'picnic', 'vet', 'winter', 'show'] as const;
