// Лицо отдельным слоем: глаза, брови и рот — самостоятельные детали, которые сцена ставит в точки спрайта.
// Каждая деталь нарисована вокруг своей точки (0,0), поэтому её можно поставить на любую фигурку.
import type { Emotion } from '../game/types';
import { Art, INK as DEFAULT_INK, ci, el, g, ln, pa, rc } from './base';

/** На очень тёмной коже линии лица рисуются темнее, иначе их не видно. */
export const faceInk = (skin: number) => (skin >= 5 ? '#1f0f0b' : DEFAULT_INK);

export type EyeState = 'open' | 'wide' | 'down' | 'up' | 'look';

/** Какие детали показывать для эмоции. side: -1 левый, 1 правый (как видит зритель). */
export function eyeStateFor(emotion: Emotion, side: -1 | 1, blink: boolean): EyeState {
  if (blink || emotion === 'sleepy') return 'down';
  if (emotion === 'delight') return 'up';
  if (emotion === 'silly') return side < 0 ? 'up' : 'open';
  if (emotion === 'surprise') return 'wide';
  if (emotion === 'thinking') return 'look';
  return 'open';
}

export function eyeArt(type: number, state: EyeState, side: -1 | 1, INK: string = DEFAULT_INK): Art {
  let s = '';
  if (state === 'down') s = ln('M-8,-1 Q0,7 8,-1', INK, 3.2);
  else if (state === 'up') s = ln('M-8,2 Q0,-8 8,2', INK, 3.2);
  else {
    const k = state === 'wide' ? 1.2 : 1;
    const dx = state === 'look' ? 2 : 0, dy = state === 'look' ? -2 : 0;
    switch (type) {
      case 1: s = ci(0, 0, 7.5 * k, '#3a2f45', '') + ci(-2 + dx, -3 + dy, 2.6, '#fff', ''); break;
      case 2: s = el(0, 0, 5.5 * k, 7.5 * k, '#3a2f45', '') + ci(-1.5 + dx, -3 + dy, 2.2, '#fff', '') + ln(`M${side * 5},-6 l${side * 6},-5 M${side * 7},-1 l${side * 6},-2`, INK, 2); break;
      case 3: s = ci(0, 0, 9 * k, '#fff', `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`) + ci(dx, 1 + dy, 6.5 * k, '#8a5a3c', '') + ci(dx, 1 + dy, 3.4, '#2b2030', '') + ci(-3 + dx, -3 + dy, 2.4, '#fff', ''); break;
      case 4: s = el(0, 1, 7.5 * k, 5.5 * k, '#3a2f45', '') + ci(-2 + dx, -1 + dy, 2, '#fff', '') + ln('M-9,-3 Q0,-9 9,-3', INK, 2.2); break;
      case 5: s = ci(dx, dy, 4.6 * k, '#3a2f45', ''); break;
      default: s = el(0, 0, 5 * k, 7 * k, '#3a2f45', '') + ci(-1.5 + dx, -3 + dy, 2.2, '#fff', '');
    }
  }
  return { svg: s, x: -18, y: -18, w: 36, h: 36 };
}

export function browArt(type: number, emotion: Emotion, side: -1 | 1, color: string): Art {
  const w = type === 2 ? 4.6 : 3;
  const lift = emotion === 'surprise' ? -6 : 0;
  const tilt = emotion === 'sad' ? -5 : emotion === 'thinking' && side > 0 ? -7 : 0;
  const inner = lift + tilt, outer = lift - tilt * 0.3;
  const s = type === 1
    ? ln(`M${-side * 8},${inner * 0.6} L${side * 8},${outer * 0.6 + lift * 0.4}`, color, w)
    : ln(`M${-side * 9},${inner} Q0,${lift - 6 + (emotion === 'thinking' && side > 0 ? -4 : 0)} ${side * 9},${outer}`, color, w);
  return { svg: s, x: -16, y: -20, w: 32, h: 32 };
}

export function mouthArt(emotion: Emotion | 'talk', INK: string = DEFAULT_INK): Art {
  let s = '';
  switch (emotion) {
    case 'talk': s = el(0, 3, 8, 7, '#8a3d4a', `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`) + pa('M-5,6 Q0,2 5,6 Q0,10 -5,6Z', '#ff7f8f', ''); break;
    case 'joy': s = ln('M-12,-2 Q0,10 12,-2', INK, 3.2); break;
    case 'surprise': s = el(0, 2, 6, 7.5, '#8a3d4a', `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`); break;
    case 'sleepy': s = el(0, 2, 4, 3, '#8a3d4a', `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`); break;
    case 'calm': s = ln('M-8,0 Q0,5 8,0', INK, 3); break;
    case 'silly': s = ln('M-12,-2 Q0,8 12,-2', INK, 3.2) + pa('M-2,3 h12 v6 a6,6 0 0,1 -12,0z', '#ff7f8f', `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`); break;
    case 'sad': s = ln('M-9,5 Q0,-3 9,5', INK, 3); break;
    case 'delight': s = pa('M-14,-4 Q0,18 14,-4 Z', '#8a3d4a', `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`) + pa('M-7,5 Q0,1 7,5 Q0,11 -7,5Z', '#ff7f8f', ''); break;
    case 'thinking': s = ln('M2,2 Q8,-1 14,1', INK, 3); break;
  }
  return { svg: s, x: -20, y: -12, w: 40, h: 32 };
}

// Кабинет доктора: три детали поверх лица. Каждая нарисована вокруг своей точки, как глаза и рот.
/** Жар: горячие щёки и капелька на лбу. Точка — середина между щеками. */
export function feverArt(): Art {
  const cheek = (x: number) => el(x, 0, 17, 12, '#ff4b3e', 'opacity="0.5"') + el(x, 0, 10, 7, '#ff2f2f', 'opacity="0.35"');
  const drop = pa('M36,-62 q-8,12 0,16 q8,-4 0,-16Z', '#8fd3ff', 'stroke="#5aa9e0" stroke-width="1.6" stroke-linejoin="round"');
  return { svg: cheek(-27) + cheek(27) + drop, x: -48, y: -66, w: 96, h: 82 };
}
/** Пластырь на щеке. Точка — его середина. */
export function plasterArt(): Art {
  const s = rc(-17, -7, 34, 14, 7, '#f6c9a0', 'stroke="#d79f74" stroke-width="1.6"') + rc(-6, -5, 12, 10, 2.5, '#fff6ea', 'stroke="#e6c4a2" stroke-width="1"')
    + [-12, 12].map((x) => ci(x, -2.5, 1, '#d79f74', '') + ci(x, 2.5, 1, '#d79f74', '')).join('');
  return { svg: g(s, 'transform="rotate(-24)"'), x: -22, y: -18, w: 44, h: 36 };
}
/** Повязка на лбу с узелком сбоку. Точка — середина лба. */
export function bandageArt(): Art {
  const band = pa('M-50,-4 Q0,-13 50,-4 L50,9 Q0,0 -50,9Z', '#fbf4e4', 'stroke="#d9cdb4" stroke-width="1.8" stroke-linejoin="round"');
  const weave = [-34, -17, 0, 17, 34].map((x) => ln(`M${x - 4},${-7 + Math.abs(x) * 0.07} l8,12`, '#e6dcc6', 1.4)).join('');
  const knot = el(52, 3, 7, 8, '#fbf4e4', 'stroke="#d9cdb4" stroke-width="1.8"') + pa('M55,8 q10,6 6,18 q-8,-4 -11,-14Z', '#fbf4e4', 'stroke="#d9cdb4" stroke-width="1.8" stroke-linejoin="round"');
  return { svg: band + weave + knot, x: -56, y: -18, w: 124, h: 50 };
}

/** Точки лица в координатах векторного героя (стоя, опора между ступнями). */
export const VECTOR_FACE = { eyeL: { x: -20, y: -184 }, eyeR: { x: 20, y: -184 }, browL: { x: -20, y: -202 }, browR: { x: 20, y: -202 }, mouth: { x: 0, y: -162 } };
