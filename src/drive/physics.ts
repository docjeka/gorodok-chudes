// Езда в автошколе: чистая функция шага. Экран (drive.ts) только рисует состояние и играет звуки по событиям.
import { CAR, CONE, CONES, PARK, PARKING, TYRE, TYRES, YARD, type Pt2 } from '../content/drive';

export interface DriveInput { gas: boolean; back: boolean; left: boolean; right: boolean; brake: boolean }
export interface ConeState { x: number; y: number; home: Pt2; down: boolean; downAt: number }
export interface DriveState {
  x: number; y: number; angle: number; speed: number;
  cones: ConeState[];
  /** когда каждый конус последний раз объехали чисто */
  passAt: number[];
  /** с какой стороны от каждого конуса (левее или правее) машина была на прошлом шаге */
  passSide: number[];
  parkedSince: number; parkedIn: number;
  stars: number; time: number;
}
export type DriveEvent = { type: 'cone'; index: number } | { type: 'pass'; index: number } | { type: 'bump' } | { type: 'parked'; index: number };

export function newDrive(): DriveState {
  const cones = CONES.map((p) => ({ x: p.x, y: p.y, home: { ...p }, down: false, downAt: 0 }));
  return { ...CAR.start, speed: 0, cones, passAt: CONES.map(() => -1e9), passSide: CONES.map((p) => Math.sign(CAR.start.x - p.x) || 1), parkedSince: 0, parkedIn: -1, stars: 0, time: 0 };
}

const dir = (a: number): Pt2 => ({ x: Math.sin(a), y: -Math.cos(a) });
/** Два круга машины: передний и задний мост. */
export function carCircles(s: Pick<DriveState, 'x' | 'y' | 'angle'>): Pt2[] {
  const d = dir(s.angle);
  return [{ x: s.x + d.x * CAR.axle, y: s.y + d.y * CAR.axle }, { x: s.x - d.x * CAR.axle, y: s.y - d.y * CAR.axle }];
}

/** Один шаг: dt в секундах. Меняет состояние на месте и возвращает, что случилось. */
export function stepDrive(s: DriveState, input: DriveInput, dt: number): DriveEvent[] {
  const ev: DriveEvent[] = [];
  s.time += dt * 1000;
  // --- скорость
  if (input.brake) s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), CAR.brake * dt);
  else if (input.gas && !input.back) s.speed += (s.speed < 0 ? CAR.brake : CAR.accel) * dt;
  else if (input.back && !input.gas) s.speed -= (s.speed > 0 ? CAR.brake : CAR.reverse) * dt;
  else s.speed *= Math.exp(-CAR.drag * dt);
  s.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, s.speed));
  if (Math.abs(s.speed) < 2 && !input.gas && !input.back) s.speed = 0;
  // --- руль: на месте не поворачивает, задним ходом — как у настоящей машины
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  s.angle += steer * CAR.turn * Math.max(-1, Math.min(1, s.speed / CAR.turnSpeed)) * dt;
  const d = dir(s.angle), px = s.x, py = s.y;
  s.x += d.x * s.speed * dt; s.y += d.y * s.speed * dt;
  // --- край площадки
  const cx = Math.max(YARD.x0, Math.min(YARD.x1, s.x)), cy = Math.max(YARD.y0, Math.min(YARD.y1, s.y));
  if (cx !== s.x || cy !== s.y) { if (Math.abs(s.speed) > 90) ev.push({ type: 'bump' }); s.x = cx; s.y = cy; s.speed *= 0.35; }
  // --- шины: упёрлись и встали
  for (const t of TYRES) for (const c of carCircles(s)) {
    const dx = c.x - t.x, dy = c.y - t.y, dist = Math.hypot(dx, dy), min = CAR.radius + TYRE.radius;
    if (dist >= min || dist === 0) continue;
    s.x += (dx / dist) * (min - dist); s.y += (dy / dist) * (min - dist);
    if (Math.abs(s.speed) > 90) ev.push({ type: 'bump' });
    s.speed *= 0.3;
  }
  // --- конусы: задетый падает и чуть отлетает; встаёт сам, когда машина отъехала
  const circles = carCircles(s);
  s.cones.forEach((k, i) => {
    const near = Math.min(...circles.map((c) => Math.hypot(c.x - k.x, c.y - k.y)));
    if (!k.down && near < CAR.radius + CONE.radius) {
      const m = Math.hypot(k.x - s.x, k.y - s.y) || 1;
      k.down = true; k.downAt = s.time; k.x += ((k.x - s.x) / m) * CONE.push; k.y += ((k.y - s.y) / m) * CONE.push;
      ev.push({ type: 'cone', index: i });
    } else if (k.down && s.time - k.downAt > CONE.standUp && Math.hypot(s.x - k.home.x, s.y - k.home.y) > CONE.clear) { k.down = false; k.x = k.home.x; k.y = k.home.y; }
  });
  // --- объезд: центр машины проехал мимо стоящего конуса вплотную и не задел его
  CONES.forEach((home, i) => {
    const side = Math.sign(s.x - home.x) || s.passSide[i];
    if (side === s.passSide[i]) return;
    s.passSide[i] = side;
    const yAt = py + ((s.y - py) * (home.x - px)) / ((s.x - px) || 1);
    if (!s.cones[i].down && Math.abs(yAt - home.y) < CONE.near && s.time - s.passAt[i] > CONE.cooldown) { s.passAt[i] = s.time; s.stars += 1; ev.push({ type: 'pass', index: i }); }
  });
  // --- парковка: остановился внутри места
  const spot = PARKING.findIndex((p) => s.x > p.x0 && s.x < p.x1 && s.y > p.y0 && s.y < p.y1);
  if (spot < 0) { s.parkedIn = -1; s.parkedSince = 0; }
  else if (Math.abs(s.speed) > PARK.stopSpeed) s.parkedSince = 0;
  else if (s.parkedIn !== spot) {
    if (!s.parkedSince) s.parkedSince = s.time;
    else if (s.time - s.parkedSince >= PARK.hold) { s.parkedIn = spot; s.stars += PARK.stars; ev.push({ type: 'parked', index: spot }); }
  }
  return ev;
}
