import charSprites from './charSprites.json';
import type { GarmentDef, GarmentSlot, OutfitSetDef, Look, Outfit, Character } from '../game/types';

// Согласованные палитры: [основной, дополнительный]
const P = {
  warm: [['#ff8a73', '#fff3e0'], ['#7fd1b9', '#fff8e7'], ['#8fc3f2', '#fdf6e3'], ['#b79df0', '#fff3e0'], ['#ffd166', '#ff8a73']],
  denim: [['#6f9ad6', '#f2efe6'], ['#5a6c96', '#f2efe6'], ['#8d7bb8', '#fff3e0'], ['#7a9a6a', '#fff8e7'], ['#c98c6b', '#fff3e0']],
  soft: [['#ffc2d1', '#ffffff'], ['#bfe8dc', '#ffffff'], ['#c9d8ff', '#ffffff'], ['#e3d0ff', '#ffffff'], ['#ffe6a8', '#ffffff']],
  shoe: [['#ffffff', '#ff8a73'], ['#ff8a73', '#ffffff'], ['#6f9ad6', '#ffffff'], ['#7fd1b9', '#ffffff'], ['#5a4a5c', '#ffd166']],
};
const g = (id: string, slot: GarmentSlot, colors: string[][], coversHair = false): GarmentDef => ({ id, slot, colors, coversHair });

export const GARMENT_LIST: GarmentDef[] = [
  g('tee', 'top', P.warm), g('striped', 'top', P.warm), g('hoodie', 'top', P.warm), g('sweater', 'top', P.warm),
  g('raincoat', 'top', [['#ffd166', '#6f9ad6'], ['#7fd1b9', '#ffd166'], ['#ff8a73', '#fff3e0'], ['#8fc3f2', '#ffd166']]),
  g('pajamatop', 'top', P.soft), g('sportshirt', 'top', P.warm), g('chefcoat', 'top', [['#ffffff', '#ff8a73'], ['#fff3e0', '#6f9ad6'], ['#ffffff', '#7fd1b9']]),
  g('smock', 'top', [['#8fc3f2', '#ffd166'], ['#b79df0', '#7fd1b9'], ['#7fd1b9', '#ff8a73']]),
  g('shorts', 'bottom', P.denim), g('trousers', 'bottom', P.denim), g('skirt', 'bottom', P.warm), g('leggings', 'bottom', P.denim),
  g('pajamabottom', 'bottom', P.soft), g('snowpants', 'bottom', P.denim),
  g('sundress', 'dress', P.warm), g('tutu', 'dress', P.soft), g('gown', 'dress', [['#f7a8c4', '#ffd166'], ['#a9c8ff', '#ffffff'], ['#c5a8f0', '#ffd166'], ['#9fe0cc', '#ffffff']]),
  g('spacesuit', 'dress', [['#f4f6fb', '#ff8a73'], ['#f4f6fb', '#6f9ad6'], ['#ffe6a8', '#b79df0']]),
  g('dragonsuit', 'dress', [['#7fd1b9', '#ffd166'], ['#b79df0', '#ffc2d1'], ['#ff8a73', '#ffd166']]),
  g('catsuit', 'dress', [['#f2b880', '#fff3e0'], ['#8d8d9c', '#ffffff'], ['#3f3a4a', '#ffc2d1'], ['#ffffff', '#ffc2d1']]),
  g('overalls', 'dress', [['#7a9a6a', '#ffd166'], ['#6f9ad6', '#ff8a73'], ['#c98c6b', '#7fd1b9']]),
  g('fairydress', 'dress', [['#c5f0d8', '#ffc2d1'], ['#e3d0ff', '#ffe6a8'], ['#ffc2d1', '#c9d8ff']]),
  g('piratesuit', 'dress', [['#d9534f', '#3f3a4a'], ['#6f9ad6', '#3f3a4a'], ['#7fd1b9', '#5a4a5c']]),
  g('sneakers', 'shoes', P.shoe), g('boots', 'shoes', [['#c98c6b', '#fff3e0'], ['#ffd166', '#ffffff'], ['#ff8a73', '#ffffff'], ['#6f9ad6', '#ffffff'], ['#5a4a5c', '#ffd166']]),
  g('slippers', 'shoes', P.soft), g('ballet', 'shoes', P.soft),
  g('beanie', 'hat', P.warm, true), g('cap', 'hat', P.warm, true), g('chefhat', 'hat', [['#ffffff', '#e9e4dc']], true),
  g('crown', 'hat', [['#ffd166', '#ff8a73'], ['#e8e8f0', '#8fc3f2'], ['#ffd166', '#b79df0']]),
  g('bandana', 'hat', [['#d9534f', '#ffffff'], ['#6f9ad6', '#ffffff'], ['#3f3a4a', '#ffd166']], true),
  g('helmet', 'hat', [['#f4f6fb', '#8fc3f2']]), g('catears', 'hat', [['#f2b880', '#ffc2d1'], ['#8d8d9c', '#ffc2d1'], ['#3f3a4a', '#ffc2d1'], ['#ffffff', '#ffc2d1']]),
  g('dragonhood', 'hat', [['#7fd1b9', '#ffd166'], ['#b79df0', '#ffc2d1'], ['#ff8a73', '#ffd166']], true),
  g('wreath', 'hat', [['#7fd1b9', '#ffc2d1'], ['#7fd1b9', '#ffd166'], ['#7fd1b9', '#c9d8ff']]),
  g('beret', 'hat', P.warm, true), g('strawhat', 'hat', [['#f3d9a0', '#ff8a73'], ['#f3d9a0', '#7fd1b9'], ['#f3d9a0', '#8fc3f2']], true),
  g('hairbow', 'hat', P.warm),
  g('backpack', 'bag', P.warm), g('satchel', 'bag', P.denim),
  g('necklace', 'jewelry', [['#ffd166', '#ff8a73'], ['#ffffff', '#8fc3f2'], ['#ffc2d1', '#b79df0']]),
  g('bowtie', 'jewelry', P.warm), g('scarf', 'jewelry', P.warm),
  g('wings', 'extra', [['#ffffff', '#c9d8ff'], ['#ffe6f0', '#ffc2d1'], ['#e8fff4', '#bfe8dc']]),
  g('cape', 'extra', P.warm), g('medal', 'extra', [['#ffd166', '#ff8a73'], ['#e8e8f0', '#6f9ad6']]),
];
export const GARMENTS: Record<string, GarmentDef> = Object.fromEntries(GARMENT_LIST.map((x) => [x.id, x]));
export const GARMENT_SLOTS: GarmentSlot[] = ['top', 'bottom', 'dress', 'shoes', 'hat', 'bag', 'jewelry', 'extra'];

const o = (parts: Record<string, [string, number]>): Outfit =>
  Object.fromEntries(Object.entries(parts).map(([slot, [id, color]]) => [slot, { id, color }])) as Outfit;

export const OUTFIT_SETS: OutfitSetDef[] = [
  { id: 'casual', outfit: o({ top: ['tee', 0], bottom: ['shorts', 0], shoes: ['sneakers', 0] }) },
  { id: 'pajama', outfit: o({ top: ['pajamatop', 2], bottom: ['pajamabottom', 2], shoes: ['slippers', 2] }) },
  { id: 'winter', outfit: o({ top: ['sweater', 2], bottom: ['snowpants', 1], shoes: ['boots', 0], hat: ['beanie', 0], jewelry: ['scarf', 0] }) },
  { id: 'rain', outfit: o({ top: ['raincoat', 0], bottom: ['trousers', 0], shoes: ['boots', 1] }) },
  { id: 'sport', outfit: o({ top: ['sportshirt', 1], bottom: ['leggings', 1], shoes: ['sneakers', 3], hat: ['cap', 1], extra: ['medal', 0] }) },
  { id: 'ballerina', outfit: o({ dress: ['tutu', 0], shoes: ['ballet', 0], hat: ['hairbow', 0] }) },
  { id: 'astronaut', outfit: o({ dress: ['spacesuit', 0], shoes: ['boots', 3], hat: ['helmet', 0] }) },
  { id: 'chef', outfit: o({ top: ['chefcoat', 0], bottom: ['trousers', 1], shoes: ['sneakers', 0], hat: ['chefhat', 0] }) },
  { id: 'artist', outfit: o({ top: ['smock', 0], bottom: ['trousers', 2], shoes: ['sneakers', 1], hat: ['beret', 0] }) },
  { id: 'gardener', outfit: o({ dress: ['overalls', 0], shoes: ['boots', 1], hat: ['strawhat', 0] }) },
  { id: 'fairy', outfit: o({ dress: ['fairydress', 0], shoes: ['ballet', 1], hat: ['wreath', 0], extra: ['wings', 0] }) },
  { id: 'dragon', outfit: o({ dress: ['dragonsuit', 0], shoes: ['slippers', 1], hat: ['dragonhood', 0] }) },
  { id: 'cat', outfit: o({ dress: ['catsuit', 0], shoes: ['slippers', 4], hat: ['catears', 0] }) },
  { id: 'princess', outfit: o({ dress: ['gown', 0], shoes: ['ballet', 0], hat: ['crown', 0], jewelry: ['necklace', 0] }) },
  { id: 'pirate', outfit: o({ dress: ['piratesuit', 0], shoes: ['boots', 4], hat: ['bandana', 0] }) },
  { id: 'summer', outfit: o({ dress: ['sundress', 4], shoes: ['sneakers', 1], bag: ['satchel', 0] }) },
  // наряды только с готовыми фигурками (векторный запасной вид — из похожих вещей)
  { id: 'dj', outfit: o({ top: ['sweater', 2], bottom: ['trousers', 2], shoes: ['sneakers', 1] }) },
  { id: 'farmer_work', outfit: o({ dress: ['overalls', 0], shoes: ['boots', 1] }) },
  { id: 'farmer_rain', outfit: o({ top: ['raincoat', 0], bottom: ['trousers', 0], shoes: ['boots', 1] }) },
  { id: 'farmer_harvest', outfit: o({ top: ['sweater', 2], bottom: ['trousers', 2], shoes: ['boots', 0] }) },
  { id: 'confectioner', outfit: o({ top: ['chefcoat', 0], bottom: ['trousers', 1], shoes: ['sneakers', 1], hat: ['chefhat', 0] }) },
];
export const OUTFITS: Record<string, OutfitSetDef> = Object.fromEntries(OUTFIT_SETS.map((s) => [s.id, s]));

export const SKINS = ['#fde3cf', '#f6cfae', '#e8b48c', '#c98e64', '#a06a45', '#6f4630'];
export const HAIR_COLORS = ['#3b2a26', '#6b4226', '#a8643a', '#e0a546', '#f3d27a', '#d9543a', '#8d7bb8', '#5aa9a0'];
export const COUNTS = { skin: 6, face: 3, eyes: 6, brows: 3, hair: 8, hairColor: 8, glasses: 4 };

type Preset = [id: string, name: string, look: Look, set: string];
const L = (skin: number, face: number, eyes: number, brows: number, hair: number, hairColor: number, freckles = false, glasses = 0, hearingAid = false): Look =>
  ({ skin, face, eyes, brows, hair, hairColor, freckles, glasses, hearingAid });

export const PRESET_HEROES: Preset[] = [
  ['hero_mila', 'Мила', L(0, 0, 2, 0, 3, 3, true), 'summer'],
  ['hero_timur', 'Тимур', L(3, 1, 0, 1, 0, 0), 'casual'],
  ['hero_asya', 'Ася', L(4, 0, 3, 0, 4, 0, false, 1), 'artist'],
  ['hero_lev', 'Лев', L(1, 2, 1, 2, 7, 5, true), 'sport'],
  ['hero_nora', 'Нора', L(2, 0, 4, 0, 6, 1, false, 0, true), 'gardener'],
  ['hero_yuki', 'Юки', L(5, 1, 3, 1, 1, 6), 'casual'],
];
/** Постоянный житель фермы — не из набора героев игрока. */
export const FARMER: Preset = ['farm_worker_lev', 'Фермер Лев', L(1, 2, 1, 2, 7, 5, true), 'farmer_work'];

export function presetCharacter(id: string): Character | null {
  const p = [...PRESET_HEROES, FARMER].find((h) => h[0] === id);
  if (!p) return null;
  return {
    id: p[0], name: p[1], preset: true, look: { ...p[2] }, outfit: structuredClone(OUTFITS[p[3]].outfit), costume: p[3],
    roomId: null, x: 800, y: 760, pose: 'standing', seat: null, emotion: 'joy', flipped: false,
  };
}

/** Костюмы каждого героя: для них есть (или готовятся) готовые фигурки стоя и сидя. */
export const HERO_COSTUMES: Record<string, string[]> = {
  hero_mila: ['summer', 'princess', 'pajama', 'fairy', 'dj'],
  hero_timur: ['casual', 'chef', 'dragon', 'pirate', 'confectioner'],
  farm_worker_lev: ['farmer_work', 'farmer_rain', 'farmer_harvest'],
  hero_asya: ['artist', 'ballerina', 'winter', 'cat'],
  hero_lev: ['sport', 'astronaut', 'rain', 'pajama'],
  hero_nora: ['gardener', 'summer', 'chef', 'princess'],
  hero_yuki: ['casual', 'winter', 'dragon', 'ballerina'],
};
/**
 * Наряды пластилинового героя — только те, для которых у него самого зарегистрированы оба кадра: стоя и сидя.
 * Порядок — как в HERO_COSTUMES, затем остальные. Пустой список — герой рисованный (2D), ему подходит любой набор.
 */
export function heroCostumes(heroId: string): string[] {
  const has = (set: string) => OUTFITS[set] && `${heroId}:${set}:stand` in charSprites && `${heroId}:${set}:sit` in charSprites;
  const found = new Set<string>();
  for (const key of Object.keys(charSprites)) { const [h, set] = key.split(':'); if (h === heroId && has(set)) found.add(set); }
  return [...(HERO_COSTUMES[heroId] ?? []).filter((s) => found.has(s)), ...[...found].filter((s) => !(HERO_COSTUMES[heroId] ?? []).includes(s))];
}
/** Подходит ли набор герою: пластилиновому — только свой нарисованный, рисованному — любой. */
export function costumeFits(heroId: string, setId: string): boolean {
  const own = heroCostumes(heroId);
  return own.length === 0 || own.includes(setId);
}
/** Штатный наряд пластилинового героя: его исходный, а если того нет среди нарисованных — первый из своих. */
export function homeCostume(heroId: string): string | null {
  const own = heroCostumes(heroId);
  if (!own.length) return null;
  const preset = [...PRESET_HEROES, FARMER].find((h) => h[0] === heroId)?.[3];
  return preset && own.includes(preset) ? preset : own[0];
}
/** Пилот, для которого фигурки уже нарисованы. */
export const PILOT_SPRITES: Record<string, string[]> = { hero_mila: ['summer', 'princess', 'pajama'], hero_timur: ['casual', 'chef', 'dragon'] };
