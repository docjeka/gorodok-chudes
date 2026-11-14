// Питомцы: кот, собака, кролик — каждый со своим силуэтом и настроениями.
import type { PetKind } from '../game/types';
import { Art, INK, O, O2, ci, el, heart, ln, pa, rc, shadow } from './base';

export type PetMood = 'idle' | 'happy' | 'sleep' | 'eat' | 'play';
const COLLARS = ['#ff8a73', '#7fd1b9', '#8fc3f2', '#b79df0'];

const eyes = (x: number, y: number, dx: number, mood: PetMood) =>
  mood === 'sleep' ? ln(`M${x - dx - 5},${y} q5,4 10,0 M${x + dx - 5},${y} q5,4 10,0`, INK, 2.6)
  : mood === 'happy' || mood === 'play' ? ln(`M${x - dx - 5},${y + 2} q5,-7 10,0 M${x + dx - 5},${y + 2} q5,-7 10,0`, INK, 2.8)
  : ci(x - dx, y, 4, INK, '') + ci(x + dx, y, 4, INK, '') + ci(x - dx - 1, y - 1.5, 1.4, '#fff', '') + ci(x + dx - 1, y - 1.5, 1.4, '#fff', '');
const mouth = (x: number, y: number, mood: PetMood) =>
  mood === 'eat' ? el(x, y + 4, 5, 6, '#8a3d4a', O2) : ln(`M${x - 6},${y} q3,5 6,0 q3,5 6,0`, INK, 2.2) + (mood === 'happy' || mood === 'play' ? pa(`M${x - 3},${y + 3} h6 v3 a3,3 0 0,1 -6,0z`, '#ff7f8f', '') : '');
const extras = (mood: PetMood, x: number, y: number) =>
  mood === 'happy' ? heart(x, y, 9, '#ff7f8f') : mood === 'sleep' ? `<text x="${x - 6}" y="${y + 6}" font-size="20" font-weight="800" fill="#8f7be0" font-family="sans-serif">z</text><text x="${x + 8}" y="${y - 8}" font-size="14" font-weight="800" fill="#8f7be0" font-family="sans-serif">z</text>` : '';

function cat(collar: string, mood: PetMood): string {
  const c = '#f2b880', d = '#e09a58';
  if (mood === 'sleep') return shadow(96, -2) + `<path d="M34,-14 Q62,-10 52,-34" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round"/><path d="M34,-14 Q62,-10 52,-34" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round"/>` + el(4, -22, 42, 24, c) + ln('M-6,-42 q8,6 4,16 M10,-44 q8,6 4,16', d, 4) + pa('M-52,-42 L-46,-62 L-32,-48Z M-22,-48 L-10,-62 L-8,-42Z', c) + ci(-30, -30, 24, c) + eyes(-32, -30, 9, mood) + pa('M-35,-24 h6 l-3,4z', '#ff7f8f', '') + extras(mood, -62, -64);
  return shadow(74, -2) + `<path d="M22,-12 Q58,-10 50,-56" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round"/><path d="M22,-12 Q58,-10 50,-56" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round"/>` + pa('M-26,-4 Q-34,-52 0,-56 Q34,-52 26,-4 Q0,2 -26,-4Z', c) + el(0, -22, 13, 18, '#fff3e0', '') + el(-14, -4, 9, 6, '#fff3e0') + el(14, -4, 9, 6, '#fff3e0') + rc(-18, -60, 36, 8, 4, collar) + ci(0, -52, 4.5, '#ffd166', O2) + pa('M-28,-92 L-24,-118 L-6,-100Z M28,-92 L24,-118 L6,-100Z', c) + pa('M-23,-98 L-22,-110 L-13,-102Z M23,-98 L22,-110 L13,-102Z', '#ffc2d1', '') + ci(0, -82, 28, c) + ln('M-8,-108 v8 M0,-110 v9 M8,-108 v8', d, 3) + eyes(0, -84, 11, mood) + pa('M-4,-76 h8 l-4,5z', '#ff7f8f', '') + mouth(0, -70, mood) + ln('M-18,-74 h-16 M-18,-70 l-15,4 M18,-74 h16 M18,-70 l15,4', INK, 1.6) + extras(mood, 34, -112);
}

function dog(collar: string, mood: PetMood): string {
  const c = '#f6e3c8', d = '#b98454';
  if (mood === 'sleep') return shadow(110, -2) + el(6, -22, 50, 24, c) + el(26, -30, 22, 14, d, '') + pa('M-62,-30 Q-70,-8 -52,-10 Q-48,-28 -50,-40Z', d) + ci(-38, -30, 25, c) + el(-52, -22, 12, 9, '#fff', O2) + el(-58, -26, 5, 4, INK, '') + eyes(-34, -36, 9, mood) + el(40, -6, 12, 6, c) + extras(mood, -70, -66);
  const jump = mood === 'play' ? -10 : 0;
  return shadow(100, -2) + `<g transform="translate(0 ${jump})"><path d="M38,-48 Q58,-62 52,-82" fill="none" stroke="${INK}" stroke-width="14" stroke-linecap="round"/><path d="M38,-48 Q58,-62 52,-82" fill="none" stroke="${c}" stroke-width="8" stroke-linecap="round"/>` + rc(-34, -30, 15, 30, 7, c) + rc(-12, -30, 15, 30, 7, c) + rc(14, -30, 15, 30, 7, c) + rc(32, -30, 15, 30, 7, c) + rc(-40, -66, 90, 46, 22, c) + el(20, -52, 20, 14, d, '') + rc(-40, -70, 26, 9, 4, collar) + ci(-28, -60, 4.5, '#ffd166', O2) + pa('M-66,-108 Q-78,-80 -62,-74 Q-54,-92 -54,-110Z', d) + pa('M-18,-110 Q-6,-84 -20,-76 Q-28,-94 -30,-110Z', d) + ci(-42, -92, 28, c) + el(-42, -82, 16, 12, '#fff', O2) + el(-42, -88, 6, 4.5, INK, '') + eyes(-42, -100, 12, mood) + mouth(-42, -80, mood) + '</g>' + extras(mood, -8, -124);
}

function rabbit(collar: string, mood: PetMood): string {
  const c = '#f3ecf7', d = '#d9cfe6';
  if (mood === 'sleep') return shadow(84, -2) + el(6, -20, 36, 22, c) + ci(38, -18, 9, '#fff') + el(-40, -44, 7, 20, c, O + ' transform="rotate(-50 -40 -44)"') + ci(-24, -28, 22, c) + eyes(-26, -28, 8, mood) + pa('M-29,-22 h6 l-3,4z', '#ff7f8f', '') + extras(mood, -56, -62);
  const hop = mood === 'play' ? -8 : 0;
  return shadow(70, -2) + `<g transform="translate(0 ${hop})">` + ci(26, -18, 10, '#fff') + pa('M-24,-4 Q-30,-48 0,-52 Q30,-48 24,-4 Q0,2 -24,-4Z', c) + el(-14, -4, 10, 6, '#fff') + el(14, -4, 10, 6, '#fff') + rc(-16, -56, 32, 8, 4, collar) + el(-12, -116, 9, 26, c) + el(12, -116, 9, 26, c, O + (mood === 'idle' ? ' transform="rotate(16 12 -100)"' : '')) + el(-12, -116, 4, 17, '#ffc2d1', '') + ci(0, -76, 26, c) + el(-9, -68, 9, 7, '#fff', '') + el(9, -68, 9, 7, '#fff', '') + eyes(0, -80, 11, mood) + pa('M-4,-72 h8 l-4,5z', '#ff7f8f', '') + mouth(0, -66, mood) + `<ellipse cx="-20" cy="-70" rx="6" ry="4" fill="#ff7f8f" opacity="0.4"/><ellipse cx="20" cy="-70" rx="6" ry="4" fill="#ff7f8f" opacity="0.4"/></g>` + extras(mood, 30, -120) + (d ? '' : '');
}

export function petArt(kind: PetKind, collar: number, mood: PetMood): Art {
  const col = COLLARS[collar % COLLARS.length];
  const svg = kind === 'cat' ? cat(col, mood) : kind === 'dog' ? dog(col, mood) : rabbit(col, mood);
  return { svg, x: -90, y: -160, w: 180, h: 174 };
}
export const PET_COLLARS = COLLARS.length;
