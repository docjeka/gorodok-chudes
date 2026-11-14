// Контактные листы для самопроверки графики: npx vite-node scripts/preview.ts <what>
import { writeFileSync, mkdirSync } from 'node:fs';
import { characterArt } from '../src/art/character';
import { OUTFIT_SETS, PRESET_HEROES } from '../src/content/wardrobe';
import type { Art } from '../src/art/base';

const out = '.studioigor/captures/sheets';
mkdirSync(out, { recursive: true });
export function sheet(name: string, arts: Art[], cols: number, cell: [number, number], bg = '#fff6e6') {
  const rows = Math.ceil(arts.length / cols);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${cols * cell[0]}" height="${rows * cell[1]}"><rect width="100%" height="100%" fill="${bg}"/>`;
  arts.forEach((a, i) => {
    const x = (i % cols) * cell[0], y = Math.floor(i / cols) * cell[1];
    // вложенный svg изолирует id клипов
    const k = Math.min(cell[0] / a.w, cell[1] / a.h) * 0.94;
    s += `<svg x="${x + (cell[0] - a.w * k) / 2}" y="${y + (cell[1] - a.h * k) / 2}" width="${a.w * k}" height="${a.h * k}" viewBox="${a.x} ${a.y} ${a.w} ${a.h}">${a.svg.replace(/id="(\w+)"/g, `id="$1${i}"`).replace(/url\(#(\w+)\)/g, `url(#$1${i})`)}</svg>`;
  });
  writeFileSync(`${out}/${name}.svg`, s + '</svg>');
}
const what = process.argv[2] ?? 'chars';
if (what === 'chars') {
  const emo = ['joy', 'surprise', 'sleepy', 'calm', 'silly', 'sad', 'delight', 'thinking'] as const;
  const arts: Art[] = [];
  OUTFIT_SETS.forEach((s, i) => { const h = PRESET_HEROES[i % 6][2]; arts.push(characterArt({ look: { ...h, hair: i % 8, eyes: i % 6, brows: i % 3, glasses: i % 5 === 4 ? (i % 3) + 1 : 0 }, outfit: s.outfit, pose: i % 5 === 3 ? 'sitting' : 'standing', emotion: emo[i % 8] })); });
  sheet('chars', arts, 8, [200, 280]);
}
if (what === 'items') {
  const { itemArt } = await import('../src/art/items');
  const { ITEM_LIST } = await import('../src/content/items');
  const arts = ITEM_LIST.map((d) => itemArt(d.id, { servings: d.servings, packed: d.id === 'giftbox' }));
  arts.push(itemArt('giftbox', { packed: false, paper: 2, bow: 1 }), itemArt('wonderdish', { mix: ['banana', 'cheese', 'tomato'] }), itemArt('plate', { dirty: true }), itemArt('cake', { servings: 2 }));
  sheet('items', arts, 12, [130, 130]);
}
if (what === 'furn') {
  const { furnitureArt, roomArt } = await import('../src/art/furniture');
  const { petArt } = await import('../src/art/pets');
  const { FURNITURE_LIST } = await import('../src/content/furniture');
  const base = { color: 0, open: false, on: 0, night: false };
  const one = (id: string, st: object = {}) => { const a = furnitureArt(id, { ...base, ...st }); return { ...a.back, svg: a.back.svg + (a.front?.svg ?? '') }; };
  sheet('ref-furniture-1', FURNITURE_LIST.slice(0, 18).map((d) => one(d.id)), 6, [300, 300]);
  sheet('ref-furniture-2', FURNITURE_LIST.slice(18).map((d) => one(d.id)), 6, [300, 300]);
  sheet('ref-furniture-states', [one('fridge', { open: true }), one('cupboard', { open: true }), one('toybox', { open: true }), one('nightstand', { open: true }), one('laundry', { open: true }), one('tv', { on: 1 }), one('floorlamp', { on: 1 }), one('ceilinglamp', { on: 1 }), one('stove', { on: 1 }), one('bathtub', { on: 1 }), one('window', { night: true }), one('sink', { on: 1 })], 6, [300, 300]);
  const moods = ['idle', 'happy', 'sleep', 'eat', 'play'] as const;
  sheet('ref-pets', (['cat', 'dog', 'rabbit'] as const).flatMap((k, i) => moods.map((m) => petArt(k, i, m))), 5, [220, 220]);
  sheet('ref-rooms', [roomArt(0, 0), roomArt(1, 1), roomArt(2, 2), roomArt(3, 3)], 2, [800, 450]);
}
