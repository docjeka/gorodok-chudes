// Места на экране «Мой город». Новое место = одна запись здесь: сторона планеты и точка на её рисунке.
// x, y — доля ширины и высоты рисунка (0…1), r — радиус зоны нажатия в долях ширины.

export type PlaceStatus = 'open' | 'soon';
export type PlaceSide = 'front' | 'back';

export interface Place {
  id: string;
  nameKey: string;
  side: PlaceSide;
  x: number;
  y: number;
  r: number;
  /** где стоит подпись (доли рисунка) */
  lx: number;
  ly: number;
  status: PlaceStatus;
  /** куда ведёт место: 'rooms' — уже существующие комнаты */
  route: string | null;
}

export const PLACES: Place[] = [
  { id: 'houses', nameKey: 'place.houses', side: 'front', x: 0.502, y: 0.5, r: 0.085, lx: 0.502, ly: 0.625, status: 'open', route: 'rooms' },
  { id: 'park', nameKey: 'place.park', side: 'front', x: 0.335, y: 0.29, r: 0.075, lx: 0.3, ly: 0.185, status: 'soon', route: null },
  { id: 'club', nameKey: 'place.club', side: 'front', x: 0.507, y: 0.265, r: 0.06, lx: 0.515, ly: 0.165, status: 'soon', route: null },
  { id: 'cafe', nameKey: 'place.cafe', side: 'front', x: 0.67, y: 0.31, r: 0.06, lx: 0.7, ly: 0.225, status: 'soon', route: null },
  { id: 'toys', nameKey: 'place.toys', side: 'front', x: 0.323, y: 0.6, r: 0.065, lx: 0.3, ly: 0.715, status: 'soon', route: null },
  { id: 'beach', nameKey: 'place.beach', side: 'front', x: 0.675, y: 0.62, r: 0.065, lx: 0.705, ly: 0.725, status: 'soon', route: null },
];
