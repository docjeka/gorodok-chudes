import type { FurnitureDef, FurnitureInst, RoomId, Pt } from '../game/types';

const row = (n: number, x0: number, dx: number, y: number): Pt[] => Array.from({ length: n }, (_, i) => ({ x: x0 + i * dx, y }));
const grid = (cols: number, rows: number, x0: number, dx: number, y0: number, dy: number): Pt[] =>
  Array.from({ length: cols * rows }, (_, i) => ({ x: x0 + (i % cols) * dx, y: y0 + Math.floor(i / cols) * dy }));

// Координаты слотов — относительно опорной точки мебели (низ по центру), y вверх отрицательный.
export const FURNITURE_LIST: FurnitureDef[] = [
  // гостиная
  { id: 'sofa', category: 'seats', w: 430, h: 250, layer: 'floor', seats: [{ x: -118, y: -98, pose: 'sitting' }, { x: 0, y: -98, pose: 'sitting' }, { x: 118, y: -98, pose: 'sitting' }] },
  { id: 'armchair', category: 'seats', w: 250, h: 255, layer: 'floor', seats: [{ x: 0, y: -112, pose: 'sitting' }] },
  { id: 'coffeetable', category: 'tables', w: 250, h: 105, layer: 'floor', surfaces: row(4, -84, 56, -96) },
  { id: 'shelf', category: 'storage', w: 300, h: 62, layer: 'wall', surfaces: row(5, -110, 55, -56) },
  { id: 'tv', category: 'decor', w: 290, h: 250, layer: 'floor', tap: 'tv', surfaces: [{ x: -118, y: -112 }, { x: 118, y: -112 }] },
  { id: 'floorlamp', category: 'lighting', w: 130, h: 390, layer: 'floor', tap: 'light' },
  { id: 'rug', category: 'decor', w: 500, h: 205, layer: 'rug' },
  { id: 'plant', category: 'plants', w: 200, h: 270, layer: 'floor' },
  { id: 'toybox', category: 'toys', w: 250, h: 155, layer: 'floor', tap: 'toggleOpen', container: { capacity: 8, slots: grid(4, 2, -72, 48, -165, 40) } },
  { id: 'picture', category: 'decor', w: 200, h: 165, layer: 'wall' },
  { id: 'window', category: 'decor', w: 290, h: 240, layer: 'wall', fixed: true },
  // кухня
  { id: 'fridge', category: 'kitchen', w: 270, h: 430, layer: 'floor', tap: 'toggleOpen',
    container: { capacity: 12, slots: [...row(3, -62, 64, -305), ...row(3, -62, 64, -215), ...row(3, -62, 64, -130), ...row(3, -62, 64, -34)] } },
  { id: 'counter', category: 'kitchen', w: 290, h: 200, layer: 'floor', workspace: 'board', surfaces: row(4, -81, 54, -192) },
  { id: 'stove', category: 'kitchen', w: 260, h: 235, layer: 'floor', workspace: 'stove', tap: 'stove', surfaces: row(4, -84, 56, -222) },
  { id: 'sink', category: 'kitchen', w: 250, h: 260, layer: 'floor', tap: 'water', surfaces: [{ x: -88, y: -182 }, { x: 88, y: -182 }] },
  { id: 'cupboard', category: 'kitchen', w: 290, h: 180, layer: 'wall', tap: 'toggleOpen', container: { capacity: 8, slots: [...row(4, -84, 56, -102), ...row(4, -84, 56, -26)] } },
  { id: 'blenderstand', category: 'kitchen', w: 250, h: 265, layer: 'floor', workspace: 'blender', surfaces: row(3, 6, 48, -168) },
  { id: 'table', category: 'tables', w: 320, h: 180, layer: 'floor', surfaces: row(5, -110, 55, -164) },
  { id: 'chair', category: 'seats', w: 122, h: 225, layer: 'floor', seats: [{ x: 0, y: -100, pose: 'sitting' }] },
  { id: 'clock', category: 'decor', w: 120, h: 120, layer: 'wall' },
  // спальня
  { id: 'bed', category: 'beds', w: 500, h: 305, layer: 'floor', seats: [{ x: 48, y: -165, pose: 'sleeping' }], surfaces: [{ x: 218, y: -212 }],
    front: { x0: -92, y0: -244, x1: 226, y1: -86 } },
  { id: 'nightstand', category: 'storage', w: 165, h: 176, layer: 'floor', tap: 'toggleOpen', surfaces: [{ x: -36, y: -164 }, { x: 36, y: -164 }], container: { capacity: 6, slots: grid(3, 2, -40, 40, -102, 40) } },
  { id: 'ceilinglamp', category: 'lighting', w: 170, h: 200, layer: 'wall', tap: 'light', fixed: true },
  { id: 'wardrobe', category: 'storage', w: 290, h: 440, layer: 'floor', tap: 'wardrobe' },
  { id: 'toyshelf', category: 'toys', w: 240, h: 278, layer: 'floor', surfaces: row(4, -84, 56, -264) },
  { id: 'petbed', category: 'decor', w: 210, h: 85, layer: 'floor', petSeats: [{ x: 0, y: -26 }] },
  // ванная
  { id: 'bathtub', category: 'bath', w: 450, h: 300, layer: 'floor', tap: 'water', seats: [{ x: -30, y: -92, pose: 'bathing' }], surfaces: [{ x: -188, y: -210 }],
    front: { x0: -240, y0: -214, x1: 240, y1: 4 }, frontOn: { x0: -240, y0: -262, x1: 118, y1: 4 } },
  { id: 'bathsink', category: 'bath', w: 200, h: 262, layer: 'floor', tap: 'water', surfaces: [{ x: -76, y: -203 }, { x: 80, y: -203 }] },
  { id: 'mirror', category: 'decor', w: 195, h: 240, layer: 'wall' },
  { id: 'bathshelf', category: 'storage', w: 280, h: 58, layer: 'wall', surfaces: row(5, -100, 50, -52) },
  { id: 'laundry', category: 'storage', w: 150, h: 190, layer: 'floor', tap: 'toggleOpen', container: { capacity: 6, slots: grid(3, 2, -40, 40, -190, 40) } },
  { id: 'bathmat', category: 'decor', w: 260, h: 100, layer: 'rug' },
  { id: 'stool', category: 'seats', w: 125, h: 135, layer: 'floor', seats: [{ x: 0, y: -116, pose: 'sitting' }] },
];

/** Экран телевизора в единицах комнаты относительно опорной точки — сюда рисуются сценки. */
export const TV_SCREEN = { x0: -80, y0: -228, x1: 80, y1: -140 };

export const FURNITURE: Record<string, FurnitureDef> = Object.fromEntries(FURNITURE_LIST.map((f) => [f.id, f]));

type Place = [id: string, def: string, x: number, y: number, color?: number];
const LAYOUT: Record<RoomId, Place[]> = {
  living: [
    ['lv_window', 'window', 800, 400], ['lv_picture', 'picture', 400, 300], ['lv_shelf', 'shelf', 1250, 250],
    ['lv_lamp', 'floorlamp', 110, 660], ['lv_sofa', 'sofa', 440, 690], ['lv_armchair', 'armchair', 880, 700, 1],
    ['lv_tv', 'tv', 1250, 650], ['lv_plant', 'plant', 1500, 660], ['lv_rug', 'rug', 640, 880],
    ['lv_table', 'coffeetable', 640, 830], ['lv_toybox', 'toybox', 1180, 850],
  ],
  kitchen: [
    ['kt_window', 'window', 960, 400], ['kt_cupboard', 'cupboard', 545, 330], ['kt_clock', 'clock', 1330, 250],
    ['kt_fridge', 'fridge', 235, 650], ['kt_counter', 'counter', 545, 650], ['kt_stove', 'stove', 835, 650],
    ['kt_sink', 'sink', 1095, 650], ['kt_blender', 'blenderstand', 1350, 650], ['kt_plant', 'plant', 1535, 665, 1],
    ['kt_chair1', 'chair', 520, 840], ['kt_chair2', 'chair', 1120, 840, 2], ['kt_table', 'table', 820, 860],
  ],
  bedroom: [
    ['bd_window', 'window', 640, 400], ['bd_picture', 'picture', 290, 290, 1], ['bd_lamp', 'ceilinglamp', 1040, 200],
    ['bd_bed', 'bed', 330, 720], ['bd_night', 'nightstand', 670, 660], ['bd_wardrobe', 'wardrobe', 1040, 650],
    ['bd_shelf', 'toyshelf', 1380, 650], ['bd_rug', 'rug', 760, 880, 2], ['bd_petbed', 'petbed', 1240, 840],
  ],
  bathroom: [
    ['bt_window', 'window', 430, 380], ['bt_mirror', 'mirror', 900, 400], ['bt_shelf', 'bathshelf', 1270, 300],
    ['bt_tub', 'bathtub', 430, 720], ['bt_sink', 'bathsink', 900, 650], ['bt_laundry', 'laundry', 1440, 700],
    ['bt_plant', 'plant', 1300, 660, 2], ['bt_mat', 'bathmat', 760, 870], ['bt_stool', 'stool', 1180, 820, 1],
  ],
};

export function initialFurniture(): Record<string, FurnitureInst> {
  const out: Record<string, FurnitureInst> = {};
  for (const roomId of Object.keys(LAYOUT) as RoomId[]) {
    for (const [id, definitionId, x, y, color] of LAYOUT[roomId]) {
      out[id] = { id, definitionId, roomId, x, y, flipped: false, open: false, on: 0, color: color ?? 0, homeX: x, homeY: y };
    }
  }
  return out;
}

export const ROOM_IDS: RoomId[] = ['living', 'kitchen', 'bedroom', 'bathroom'];
export const WALLPAPERS = 6;
export const FLOORS = 5;
export const TV_SCENES = 4;
