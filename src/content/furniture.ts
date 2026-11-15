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
  // ---------- локации города: полки и столы нарисованы на фоне, здесь только места для вещей ----------
  { id: 'loc_shelf3x5', category: 'storage', w: 320, h: 250, layer: 'wall', fixed: true, invisible: true, surfaces: [...row(5, -120, 60, -191), ...row(5, -120, 60, -89), ...row(5, -120, 60, 0)] },
  { id: 'loc_bench8', category: 'tables', w: 600, h: 60, layer: 'wall', fixed: true, invisible: true, surfaces: row(8, -245, 70, 0) },
  { id: 'loc_cubby3x2', category: 'storage', w: 460, h: 300, layer: 'wall', fixed: true, invisible: true, surfaces: [...row(3, -153, 153, -151), ...row(3, -153, 153, 0)] },
  { id: 'loc_sill5', category: 'tables', w: 380, h: 40, layer: 'wall', fixed: true, invisible: true, surfaces: row(5, -160, 80, 0) },
  { id: 'loc_case', category: 'storage', w: 290, h: 170, layer: 'wall', fixed: true, invisible: true, surfaces: [...row(4, -105, 70, -84), ...row(4, -105, 70, 0)] },
  { id: 'loc_oven', category: 'kitchen', w: 430, h: 40, layer: 'wall', fixed: true, invisible: true, workspace: 'stove', surfaces: row(4, -120, 80, 0) },
  { id: 'loc_worktable', category: 'kitchen', w: 820, h: 40, layer: 'wall', fixed: true, invisible: true, workspace: 'board', surfaces: row(8, -350, 100, 0) },
  { id: 'loc_wallshelves', category: 'storage', w: 430, h: 240, layer: 'wall', fixed: true, invisible: true, surfaces: [...row(5, -170, 85, -193), ...row(5, -170, 85, -95), ...row(5, -170, 85, 0)] },
  { id: 'loc_counter5', category: 'tables', w: 430, h: 40, layer: 'wall', fixed: true, invisible: true, surfaces: row(5, -170, 85, 0) },
  { id: 'loc_stall', category: 'storage', w: 430, h: 120, layer: 'wall', fixed: true, invisible: true, surfaces: [...row(3, -110, 110, -73), ...row(5, -170, 85, 0)] },
  { id: 'loc_pier', category: 'tables', w: 300, h: 40, layer: 'wall', fixed: true, invisible: true, surfaces: row(3, -90, 90, 0) },
  { id: 'loc_rack3x3', category: 'storage', w: 290, h: 260, layer: 'wall', fixed: true, invisible: true, surfaces: [...row(3, -94, 93, -165), ...row(3, -94, 93, -80), ...row(3, -94, 93, 0)] },
  { id: 'loc_bench4', category: 'tables', w: 320, h: 40, layer: 'wall', fixed: true, invisible: true, surfaces: row(4, -128, 85, 0) },
  { id: 'loc_pond', category: 'decor', w: 380, h: 120, layer: 'wall', fixed: true, invisible: true },
  // реквизит локаций: обычная мебель — её можно двигать, поворачивать и убирать
  { id: 'beach_lounger', category: 'seats', w: 300, h: 165, layer: 'floor', seats: [{ x: -10, y: -92, pose: 'sitting' }] },
  { id: 'beach_umbrella', category: 'decor', w: 250, h: 285, layer: 'floor' },
  // передний борт лодочки прикрывает ноги сидящих
  { id: 'beach_rowboat', category: 'seats', w: 380, h: 195, layer: 'floor', seats: [{ x: -85, y: -84, pose: 'sitting' }, { x: 85, y: -84, pose: 'sitting' }], front: { x0: -190, y0: -92, x1: 190, y1: 0 } },
  { id: 'club_stool', category: 'seats', w: 160, h: 120, layer: 'floor', seats: [{ x: 0, y: -100, pose: 'sitting' }] },
  { id: 'club_speaker', category: 'decor', w: 115, h: 223, layer: 'floor' },
  { id: 'club_light', category: 'lighting', w: 135, h: 185, layer: 'floor' },
  { id: 'pet_tunnel', category: 'toys', w: 250, h: 173, layer: 'floor', petSeats: [{ x: -40, y: -18 }] },
  { id: 'pet_cushion', category: 'beds', w: 200, h: 140, layer: 'floor', petSeats: [{ x: 0, y: -40 }] },
  // колечки надеваются на три колышка стойки
  { id: 'fair_ring_toss', category: 'toys', w: 150, h: 140, layer: 'floor', surfaces: [{ x: -34, y: -78 }, { x: 4, y: -96 }, { x: 40, y: -74 }] },
  { id: 'fair_ticket_machine', category: 'decor', w: 150, h: 201, layer: 'floor' },
  // отдельные предметы локаций
  // у каждой лошадки своё седло; ближняя часть лошадки рисуется поверх героя, чтобы он сидел верхом, а не перед ней
  { id: 'carousel', category: 'decor', w: 450, h: 591, layer: 'floor', fixed: true, seats: [{ x: -90, y: -150, pose: 'sitting' }, { x: 82, y: -150, pose: 'sitting' }],
    fronts: [{ x0: -146, y0: -152, x1: -28, y1: -104 }, { x0: 24, y0: -152, x1: 144, y1: -104 }] },
  // герой встаёт за пульт: он виден над пультом, а передняя часть пульта закрывает ноги
  { id: 'djconsole', category: 'decor', w: 430, h: 160, layer: 'floor', fixed: true, seats: [{ x: 0, y: -62, pose: 'standing' }], front: { x0: -215, y0: -160, x1: 215, y1: 0 } },
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
  park: [['pk_carousel', 'carousel', 861, 582]],
  park_games: [['pg_left', 'loc_counter5', 397, 457], ['pg_right', 'loc_stall', 1230, 461], ['pg_rings', 'fair_ring_toss', 820, 730], ['pg_tickets', 'fair_ticket_machine', 110, 700]],
  cafe: [['cf_sill', 'loc_sill5', 780, 448], ['cf_case', 'loc_case', 1410, 505]],
  cafe_bakery: [['cb_oven', 'loc_oven', 285, 483], ['cb_table', 'loc_worktable', 926, 469], ['cb_shelves', 'loc_wallshelves', 1306, 351]],
  toys: [['ty_left', 'loc_shelf3x5', 294, 553], ['ty_right', 'loc_shelf3x5', 1311, 553]],
  toys_workshop: [['tw_bench', 'loc_bench8', 347, 481], ['tw_cubby', 'loc_cubby3x2', 1292, 522]],
  beach: [['bc_pier', 'loc_pier', 1430, 383], ['bc_umbrella', 'beach_umbrella', 330, 720], ['bc_lounger', 'beach_lounger', 540, 760]],
  beach_boats: [['bb_rack', 'loc_rack3x3', 271, 574], ['bb_bench', 'loc_bench4', 1335, 497], ['bb_boat', 'beach_rowboat', 820, 820]],
  club: [['cl_dj', 'djconsole', 800, 700], ['cl_speaker', 'club_speaker', 520, 690], ['cl_light', 'club_light', 1090, 690], ['cl_stool', 'club_stool', 300, 820], ['cl_table', 'coffeetable', 1330, 840]],
  animals: [['an_pond', 'loc_pond', 364, 450], ['an_tunnel', 'pet_tunnel', 1000, 760], ['an_cushion', 'pet_cushion', 1330, 820]],
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

/** Группы экранов: место на карте города → его комнаты (первая открывается по умолчанию). */
export const ROOM_GROUPS: Record<string, RoomId[]> = {
  houses: ['living', 'kitchen', 'bedroom', 'bathroom'],
  park: ['park', 'park_games'],
  club: ['club'],
  cafe: ['cafe', 'cafe_bakery'],
  toys: ['toys', 'toys_workshop'],
  beach: ['beach', 'beach_boats'],
  animals: ['animals'],
};
export const ROOM_IDS: RoomId[] = Object.values(ROOM_GROUPS).flat();
export const HOUSE_ROOMS = new Set<RoomId>(ROOM_GROUPS.houses);
export const groupOf = (roomId: RoomId): string => Object.keys(ROOM_GROUPS).find((g) => ROOM_GROUPS[g].includes(roomId)) ?? 'houses';
export const WALLPAPERS = 6;
export const FLOORS = 5;
export const TV_SCENES = 4;
