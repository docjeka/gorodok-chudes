// Правила езды по дороге: трасса из отрезков и чистая функция шага. Экран (drive.ts) только рисует и играет звуки.
import { CAR, KART, PROPS, ROAD, TRACK } from '../content/drive';

export type PropKind = 'cone' | 'tyres' | 'star' | 'tree' | 'bush' | 'flowers' | 'sign_stop' | 'sign_park' | 'flag';
export interface Prop { id: number; kind: PropKind; offset: number }
export interface Segment { index: number; curve: number; y1: number; y2: number; props: Prop[]; finish: boolean }
export interface Track { segments: Segment[]; length: number }

export interface DriveInput { gas: boolean; back: boolean; left: boolean; right: boolean; brake: boolean }
export interface DriveState {
  /** сколько проехано вдоль трассы (0 … length) */
  position: number;
  speed: number;
  /** поперёк дороги: −1 левый край, 1 правый */
  x: number;
  lap: number; stars: number; time: number;
  /** сбитые конусы и собранные звёзды этого круга (id предмета) */
  gone: Set<number>;
}
export type DriveEvent = { type: 'cone' | 'tyres' | 'star'; id: number; segment: number; offset: number } | { type: 'lap'; lap: number };

const ease = (a: number, b: number, k: number) => a + (b - a) * (-Math.cos(k * Math.PI) / 2 + 0.5);
/** Случайность с зерном: трасса всегда одна и та же. */
function rng(seed: number) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

export function buildTrack(): Track {
  const segments: Segment[] = [];
  let y = 0;
  for (const part of TRACK) {
    const y0 = y, y1 = y + (part.hill ?? 0), n = part.len, edge = Math.max(1, Math.round(n / 4));
    for (let i = 0; i < n; i++) {
      // вход в поворот и выход из него плавные
      const k = i < edge ? i / edge : i >= n - edge ? (n - i) / edge : 1;
      const a = ease(y0, y1, i / n), b = ease(y0, y1, (i + 1) / n);
      segments.push({ index: segments.length, curve: (part.curve ?? 0) * ease(0, 1, k), y1: a, y2: b, props: [], finish: false });
    }
    y = y1;
  }
  // трасса замкнута: высота конца плавно возвращается к началу
  const back = Math.min(60, segments.length), dy = segments[segments.length - 1].y2;
  for (let i = 0; i < back; i++) { const s = segments[segments.length - back + i]; s.y1 -= ease(0, dy, i / back); s.y2 -= ease(0, dy, (i + 1) / back); }
  for (let i = 0; i < 3; i++) segments[i].finish = true;
  const r = rng(20261125); let id = 1;
  const put = (seg: number, kind: PropKind, offset: number) => segments[seg % segments.length].props.push({ id: id++, kind, offset });
  put(3, 'flag', -1.18); put(3, 'flag', 1.18);
  // обочина: деревья, кусты, цветы, изредка знак
  for (let i = 8; i < segments.length; i += PROPS.sideEvery) {
    for (const side of [-1, 1]) {
      const v = r();
      if (v < 0.42) put(i, 'tree', side * (1.45 + r() * 2.6));
      else if (v < 0.7) put(i, 'bush', side * (1.25 + r() * 1.6));
      else if (v < 0.93) put(i, 'flowers', side * (1.15 + r() * 1.2));
      else put(i, r() < 0.5 ? 'sign_stop' : 'sign_park', side * 1.22);
    }
  }
  // дорога: препятствие каждые group отрезков, перед ним — дорожка звёзд, которая ведёт в свободную полосу
  for (let g = PROPS.free; g < segments.length - 20; g += PROPS.group) {
    const lanes = PROPS.lanes, free = Math.floor(r() * lanes.length);
    lanes.forEach((x, i) => { if (i !== free) put(g, r() < 0.22 ? 'tyres' : 'cone', x); });
    for (let k = 1; k <= PROPS.starsPerGroup; k++) put(g - k * PROPS.starGap, 'star', lanes[free] * (1 - (k - 1) / PROPS.starsPerGroup * 0.5));
  }
  return { segments, length: segments.length * ROAD.segment };
}

/**
 * Камера висит позади машины и смотрит на дорогу сверху. depth — глубина проекции; rearZ и noseZ — как далеко от камеры
 * задние колёса и нос машины (считаются из того, где машина нарисована на экране, чтобы рисунок и дорога сходились).
 */
export function camera() {
  const depth = 1 / Math.tan(((ROAD.fov / 2) * Math.PI) / 180), far = (row: number) => (depth * ROAD.cameraHeight) / (2 * Math.max(0.05, ROAD.look - ((KART.rear - row) * KART.squash * KART.size) / KART.w));
  return { depth, rearZ: far(KART.rear), noseZ: far(KART.nose) };
}
/** Машина задевает конусы и ловит звёзды носом. */
export const PLAYER_Z = camera().noseZ;

export const newDrive = (): DriveState => ({ position: 0, speed: 0, x: 0, lap: 1, stars: 0, time: 0, gone: new Set() });
export const segmentAt = (t: Track, position: number): Segment => t.segments[Math.floor((((position % t.length) + t.length) % t.length) / ROAD.segment) % t.segments.length];

/** Один шаг: dt в секундах. Меняет состояние на месте и возвращает, что случилось. */
export function stepDrive(t: Track, s: DriveState, input: DriveInput, dt: number): DriveEvent[] {
  const ev: DriveEvent[] = [];
  s.time += dt * 1000;
  const offRoad = Math.abs(s.x) > 1;
  // --- скорость
  if (input.brake) s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), CAR.brake * dt);
  else if (input.gas && !input.back) s.speed += (s.speed < 0 ? CAR.brake : CAR.accel) * dt;
  else if (input.back && !input.gas) s.speed -= (s.speed > 0 ? CAR.brake : CAR.accel * 0.7) * dt;
  else s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), CAR.drag * dt);
  if (offRoad && s.speed > CAR.grassSpeed) s.speed = Math.max(CAR.grassSpeed, s.speed - CAR.grassDrag * dt); // трава вязкая
  s.speed = Math.max(-CAR.reverse, Math.min(CAR.maxSpeed, s.speed));
  // --- руль и вынос в повороте
  const k = s.speed / CAR.maxSpeed, seg = segmentAt(t, s.position);
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  s.x += steer * CAR.steer * Math.min(1, Math.abs(k) * 2.2) * Math.sign(k || 1) * dt;
  s.x -= seg.curve * CAR.centrifugal * k * Math.abs(k) * dt;
  s.x = Math.max(-CAR.limit, Math.min(CAR.limit, s.x));
  // --- движение вдоль трассы и предметы на пройденных отрезках
  const from = s.position, to = from + s.speed * dt;
  const a = Math.floor((Math.min(from, to) + PLAYER_Z) / ROAD.segment), b = Math.floor((Math.max(from, to) + PLAYER_Z) / ROAD.segment); // машина едет впереди камеры
  for (let i = a; i <= b && s.speed > 0; i++) {
    const sg = t.segments[((i % t.segments.length) + t.segments.length) % t.segments.length];
    for (const p of sg.props) {
      if (s.gone.has(p.id) || (p.kind !== 'cone' && p.kind !== 'tyres' && p.kind !== 'star')) continue;
      if (Math.abs(s.x - p.offset) > CAR.half + PROPS[p.kind].half) continue;
      s.gone.add(p.id);
      if (p.kind === 'star') s.stars += 1; else s.speed *= PROPS[p.kind].slow;
      ev.push({ type: p.kind, id: p.id, segment: sg.index, offset: p.offset });
    }
  }
  s.position = to;
  if (s.position >= t.length) { s.position -= t.length; s.lap += 1; s.gone.clear(); ev.push({ type: 'lap', lap: s.lap }); } // новый круг: конусы и звёзды снова на местах
  if (s.position < 0) s.position = 0, s.speed = Math.max(0, s.speed); // задним ходом за линию старта не уехать
  return ev;
}
