// Слоистый герой. Порядок слоёв: задние аксессуары → волосы сзади → ноги → обувь → низ/наряд → тело → верх →
// руки с рукавами → шея/голова → лицо → волосы спереди (с маской под шапку) → шапка → очки.
// Точки крепления: голова (0,-188), кисти (±47,-74), ступни (±14,0). Опорная точка — между ступнями.
import { GARMENTS, HAIR_COLORS, SKINS } from '../content/wardrobe';
import type { Emotion, Look, Outfit, Pose } from '../game/types';
import { Art, INK, O, O2, ci, el, heart, ln, pa, rc, shade, shine, star } from './base';

const HEAD_Y = -188;
const TORSO = 'M-30,-138 Q-39,-136 -39,-124 L-37,-72 Q-37,-62 -27,-62 L27,-62 Q37,-62 37,-72 L39,-124 Q39,-136 30,-138 Z';

const limb = (x1: number, y1: number, x2: number, y2: number, w: number, fill: string) =>
  `<path d="M${x1},${y1} L${x2},${y2}" stroke="${INK}" stroke-width="${w + 6}" stroke-linecap="round" fill="none"/>` +
  `<path d="M${x1},${y1} L${x2},${y2}" stroke="${fill}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;

const ARM = { sx: 36, sy: -128, hx: 47, hy: -74 };
function arms(skin: string, sleeve: { len: number; fill: string; cuff?: string } | null): string {
  let s = '';
  for (const k of [-1, 1]) {
    s += limb(k * ARM.sx, ARM.sy, k * ARM.hx, ARM.hy, 15, skin);
    if (sleeve) {
      const ex = ARM.sx + (ARM.hx - ARM.sx) * sleeve.len, ey = ARM.sy + (ARM.hy - ARM.sy) * sleeve.len;
      s += limb(k * ARM.sx, ARM.sy, k * ex, ey, 19, sleeve.fill);
      if (sleeve.cuff) s += `<path d="M${k * (ex - 8)},${ey - 2} L${k * (ex + 8)},${ey + 2}" stroke="${sleeve.cuff}" stroke-width="6" stroke-linecap="round"/>`;
    }
    s += ci(k * ARM.hx, ARM.hy, 9.5, skin);
  }
  return s;
}

function legs(skin: string, bottomY: number): string {
  return rc(-25, -72, 21, 72 + bottomY, 9, skin) + rc(4, -72, 21, 72 + bottomY, 9, skin);
}
const trouser = (c: string, bottomY: number, wide = 0) =>
  pa(`M-38,-80 L38,-80 L${32 + wide},${bottomY} L${4 - wide * 0.2},${bottomY} L0,-56 L${-4 + wide * 0.2},${bottomY} L${-32 - wide},${bottomY} Z`, c);

const dots = (c: string, pts: number[][], r = 3) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join('');
const TORSO_DOTS = [[-22, -122], [-4, -116], [16, -124], [-14, -100], [8, -98], [24, -106], [-24, -82], [-2, -80], [20, -84]];

interface Parts { backAcc: string; legs: string; shoes: string; lower: string; body: string; upper: string; arms: string; neckAcc: string; hat: string; hatBack: string; coversHair: boolean }

function shoe(id: string | undefined, c: string[], bottomY: number): string {
  let s = '';
  for (const k of [-1, 1]) {
    const x = k * 14.5, y = bottomY;
    if (id === 'boots') s += pa(`M${x - 12},${y - 24} L${x + 12},${y - 24} L${x + 13},${y - 2} Q${x + 14 + k * 4},${y + 6} ${x + k * 6},${y + 6} L${x - 12 + (k > 0 ? 0 : -4)},${y + 6} Q${x - 15},${y + 6} ${x - 13},${y - 2}Z`, c[0]) + rc(x - 13, y - 27, 26, 7, 3, c[1]);
    else if (id === 'slippers') s += el(x + k * 2, y, 15, 8, c[0]) + ci(x + k * 4, y - 6, 5, c[1], O2);
    else if (id === 'ballet') s += el(x + k * 2, y + 1, 14, 6.5, c[0]) + ln(`M${x - 8},${y - 8} L${x + 8},${y - 14} M${x + 8},${y - 8} L${x - 8},${y - 14}`, shade(c[0], -0.2), 2.2);
    else if (id === 'sneakers') s += pa(`M${x - 13},${y - 8} Q${x},${y - 14} ${x + 13},${y - 6} Q${x + 15 + k * 3},${y + 6} ${x + k * 5},${y + 6} L${x - 13 - (k < 0 ? 3 : 0)},${y + 6} Z`, c[0]) + ln(`M${x - 13},${y + 4} L${x + 14},${y + 4}`, c[1], 3.5) + ln(`M${x - 4},${y - 7} L${x + 4},${y - 5}`, c[1], 2.4);
    else s += el(x, y + 1, 12, 5, 'none', 'stroke="none"');
  }
  return s;
}

function wear(outfit: Outfit, skin: string, bottomY: number): Parts {
  const P: Parts = { backAcc: '', legs: legs(skin, bottomY), shoes: '', lower: '', body: pa(TORSO, skin), upper: '', arms: '', neckAcc: '', hat: '', hatBack: '', coversHair: false };
  const col = (slot: keyof Outfit) => { const w = outfit[slot]; const gd = w && GARMENTS[w.id]; return gd ? gd.colors[Math.min(w!.color, gd.colors.length - 1)] : ['#ccc', '#fff']; };
  let sleeve: { len: number; fill: string; cuff?: string } | null = null;
  const cuffY = bottomY - 2;

  // --- низ ---
  if (outfit.bottom) {
    const [c, c2] = col('bottom');
    switch (outfit.bottom.id) {
      case 'shorts': P.lower = trouser(c, -44, 2) + ln('M-30,-48 L-8,-48 M8,-48 L30,-48', shade(c, -0.18), 2.5); break;
      case 'skirt': P.lower = pa('M-37,-82 L37,-82 L50,-42 Q0,-34 -50,-42 Z', c) + ln('M-46,-48 Q0,-40 46,-48', c2, 4) + ln('M-18,-78 L-24,-48 M0,-78 L0,-46 M18,-78 L24,-48', shade(c, -0.14), 2); break;
      case 'leggings': P.lower = trouser(c, cuffY, -3) + ln(`M-33,-76 L-29,${cuffY - 4} M33,-76 L29,${cuffY - 4}`, c2, 3); break;
      case 'pajamabottom': P.lower = trouser(c, cuffY, 2) + dots(c2, [[-22, -66], [-14, -40], [-24, -22], [20, -62], [14, -38], [24, -20]].filter((p) => p[1] < cuffY - 4), 2.6); break;
      case 'snowpants': P.lower = trouser(c, cuffY, 6) + rc(-38, cuffY - 8, 32, 8, 4, c2) + rc(6, cuffY - 8, 32, 8, 4, c2); break;
      default: P.lower = trouser(c, cuffY, 1) + ln(`M-20,-74 L-18,${cuffY - 4} M20,-74 L18,${cuffY - 4}`, shade(c, -0.14), 2);
    }
  }
  // --- верх ---
  if (outfit.top) {
    const [c, c2] = col('top');
    const d = shade(c, -0.16);
    let deco = '';
    sleeve = { len: 0.86, fill: c };
    switch (outfit.top.id) {
      case 'tee': sleeve = { len: 0.4, fill: c }; deco = heart(0, -104, 9, c2); break;
      case 'striped': deco = `<g clip-path="url(#torso)">${[-124, -108, -92, -76].map((y) => `<rect x="-42" y="${y}" width="84" height="7" fill="${c2}"/>`).join('')}</g>`; sleeve = { len: 0.86, fill: c, cuff: c2 }; break;
      case 'hoodie': deco = pa('M-18,-92 L18,-92 L22,-70 L-22,-70 Z', d, O2) + ln('M-7,-134 L-8,-112 M7,-134 L8,-112', c2, 2.6) + ci(-8, -110, 2.5, c2, '') + ci(8, -110, 2.5, c2, ''); P.hatBack = pa('M-40,-150 Q0,-120 40,-150 Q30,-128 0,-126 Q-30,-128 -40,-150Z', d); sleeve.cuff = d; break;
      case 'sweater': deco = ln('M-36,-104 L-24,-114 L-12,-104 L0,-114 L12,-104 L24,-114 L36,-104', c2, 3.2) + ln('M-36,-90 L36,-90', c2, 2.4) + dots(c2, [[-24, -78], [-8, -78], [8, -78], [24, -78]], 2.2); sleeve.cuff = c2; break;
      case 'raincoat': deco = ln('M0,-136 L0,-60', d, 2.4) + dots(c2, [[7, -120], [7, -100], [7, -80]], 3.4) + pa('M-39,-74 L39,-74 L42,-52 L-42,-52 Z', c) + rc(-30, -72, 16, 12, 3, d, O2); sleeve.cuff = c2; break;
      case 'pajamatop': deco = dots(c2, TORSO_DOTS, 2.8) + pa('M-12,-138 L0,-124 L12,-138', c2, O2); break;
      case 'sportshirt': sleeve = { len: 0.4, fill: c, cuff: c2 }; deco = `<g clip-path="url(#torso)"><path d="M-44,-70 L44,-120 L44,-104 L-44,-54Z" fill="${c2}"/></g>` + ci(-16, -116, 9, c2, O2) + `<text x="-16" y="-111.500" font-size="12" font-weight="700" text-anchor="middle" fill="${c}" font-family="sans-serif">7</text>`; break;
      case 'chefcoat': deco = ln('M-6,-136 L-10,-62', '#e3ddd3', 2.4) + dots(c2, [[-20, -116], [-20, -98], [-20, -80], [4, -116], [4, -98], [4, -80]], 3) + pa('M-16,-140 Q0,-126 16,-140 L10,-128 Q0,-120 -10,-128Z', c2, O2); break;
      case 'smock': deco = rc(-16, -92, 32, 22, 5, d, O2) + ci(-24, -118, 5, '#ffd166', '') + ci(20, -110, 6, '#ff8a73', '') + ci(-2, -124, 4, '#7fd1b9', '') + ci(24, -84, 4, c2, '') + pa('M-14,-140 L0,-130 L14,-140 L10,-132 L0,-124 L-10,-132Z', '#fff', O2); break;
    }
    P.upper = `<clipPath id="torso"><path d="${TORSO}"/></clipPath>` + pa(TORSO, c) + deco;
  }
  // --- цельный наряд ---
  if (outfit.dress) {
    const [c, c2] = col('dress');
    const d = shade(c, -0.16);
    const clip = `<clipPath id="torso"><path d="${TORSO}"/></clipPath>`;
    const suit = (fill: string) => trouser(fill, cuffY, 3) + pa(TORSO, fill);
    switch (outfit.dress.id) {
      case 'sundress': P.upper = pa('M-37,-90 L37,-90 L54,-40 Q0,-30 -54,-40 Z', c) + pa(TORSO, c) + dots(c2, [...TORSO_DOTS, [-34, -56], [-12, -50], [12, -52], [34, -56]], 3) + ln('M-50,-46 Q0,-36 50,-46', c2, 3.5); sleeve = { len: 0.22, fill: c }; break;
      case 'tutu': P.upper = el(0, -64, 62, 16, shade(c, 0.35)) + el(0, -70, 54, 14, c) + el(0, -76, 44, 11, shade(c, 0.2)) + pa(TORSO, shade(c, -0.08)) + star(0, -108, 8, c2) + ln('M-37,-80 L37,-80', d, 3); sleeve = null; break;
      case 'gown': P.legs = ''; P.upper = pa(`M-36,-92 L36,-92 L62,${cuffY + 4} Q0,${cuffY + 16} -62,${cuffY + 4} Z`, c) + ln(`M-20,-80 L-34,${cuffY} M0,-80 L0,${cuffY + 6} M20,-80 L34,${cuffY}`, d, 2.2) + pa(TORSO, shade(c, 0.12)) + rc(-38, -88, 76, 10, 4, c2) + star(-40, -30, 5, c2, '') + star(38, -44, 4, c2, '') + star(8, -22, 4, c2, '') + ci(-36, -128, 13, c) + ci(36, -128, 13, c); sleeve = null; break;
      case 'spacesuit': P.upper = suit(c) + rc(-20, -122, 40, 26, 6, shade(c, -0.1), O2) + ci(-10, -109, 4, c2, '') + ci(2, -109, 4, '#ffd166', '') + ci(13, -109, 4, '#7fd1b9', '') + rc(-39, -80, 78, 9, 4, c2) + rc(-34, cuffY - 8, 28, 8, 4, c2) + rc(6, cuffY - 8, 28, 8, 4, c2); sleeve = { len: 0.86, fill: c, cuff: c2 }; break;
      case 'dragonsuit': P.backAcc = pa('M20,-70 Q78,-64 84,-20 Q70,-34 40,-40 Z', c) + pa('M70,-46 l10,-10 l2,14z M56,-56 l8,-12 l4,14z', c2, O2); P.upper = suit(c) + el(0, -96, 22, 30, c2, O2) + ln('M-14,-108 L14,-108 M-17,-96 L17,-96 M-14,-84 L14,-84', shade(c2, -0.18), 2); sleeve = { len: 0.86, fill: c }; break;
      case 'catsuit': P.backAcc = `<path d="M24,-68 Q84,-70 78,-124" fill="none" stroke="${INK}" stroke-width="19" stroke-linecap="round"/><path d="M24,-68 Q84,-70 78,-124" fill="none" stroke="${c}" stroke-width="13" stroke-linecap="round"/>`; P.upper = suit(c) + el(0, -96, 21, 28, c2, O2); sleeve = { len: 0.86, fill: c, cuff: c2 }; break;
      case 'overalls': P.upper = pa(TORSO, c2) + trouser(c, cuffY, 3) + pa('M-24,-112 L24,-112 L28,-74 L-28,-74 Z', c) + rc(-11, -100, 22, 16, 4, d, O2) + ln('M-22,-112 L-26,-138 M22,-112 L26,-138', c, 7) + ci(-22, -110, 3.4, '#ffd166', O2) + ci(22, -110, 3.4, '#ffd166', O2); sleeve = { len: 0.4, fill: c2 }; break;
      case 'fairydress': P.upper = [-44, -22, 0, 22, 44].map((x, i) => pa(`M${x - 16},-84 Q${x},${-30 + (i % 2) * 6} ${x + 16},-84 Z`, i % 2 ? c2 : c)).join('') + pa(TORSO, c) + ln('M-37,-84 L37,-84', c2, 5) + star(0, -110, 7, '#ffd166'); sleeve = null; break;
      case 'piratesuit': P.upper = clip + trouser(c2, cuffY, 2) + pa(TORSO, '#fff') + `<g clip-path="url(#torso)">${[-126, -110, -94, -78].map((y) => `<rect x="-42" y="${y}" width="84" height="7" fill="${c}"/>`).join('')}</g>` + pa('M-39,-134 L-14,-136 L-20,-66 L-37,-66Z M39,-134 L14,-136 L20,-66 L37,-66Z', c2) + rc(-39, -80, 78, 10, 3, '#c98c6b') + rc(-8, -83, 16, 15, 3, '#ffd166', O2); sleeve = { len: 0.86, fill: '#fff', cuff: c }; break;
    }
    if (!P.upper.includes('clipPath')) P.upper = clip + P.upper;
  }
  P.arms = arms(skin, sleeve);
  P.shoes = shoe(outfit.shoes?.id, col('shoes'), bottomY);

  // --- аксессуары ---
  if (outfit.extra) {
    const [c, c2] = col('extra');
    if (outfit.extra.id === 'wings') P.backAcc += [-1, 1].map((k) => `<g opacity="0.92">${pa(`M${k * 10},-120 Q${k * 80},-200 ${k * 96},-130 Q${k * 86},-100 ${k * 10},-106Z`, c)}${pa(`M${k * 10},-104 Q${k * 76},-96 ${k * 70},-56 Q${k * 40},-50 ${k * 10},-92Z`, c2)}${ln(`M${k * 16},-116 Q${k * 60},-150 ${k * 84},-134`, shade(c2, -0.1), 2)}</g>`).join('');
    if (outfit.extra.id === 'cape') P.backAcc += pa(`M-34,-136 L34,-136 L58,-30 Q0,-16 -58,-30 Z`, c) + ln('M-20,-120 L-30,-34 M20,-120 L30,-34', shade(c, -0.16), 2.4);
    if (outfit.extra.id === 'medal') P.neckAcc += ln('M-12,-136 L0,-106 L12,-136', c2, 4.5) + ci(0, -102, 9, c) + star(0, -102, 5, shade(c, -0.25), '');
  }
  if (outfit.bag) {
    const [c] = col('bag');
    if (outfit.bag.id === 'backpack') { P.backAcc += rc(-44, -136, 88, 70, 18, c) + rc(-48, -100, 96, 12, 5, shade(c, -0.15)); P.neckAcc += ln('M-26,-136 Q-30,-104 -34,-76 M26,-136 Q30,-104 34,-76', shade(c, -0.2), 6.5); }
    else P.neckAcc += ln('M-30,-136 L34,-74', shade(c, -0.25), 5) + pa('M22,-78 L52,-78 L54,-50 Q38,-44 20,-50 Z', c) + pa('M22,-78 L52,-78 L48,-64 Q37,-60 26,-64Z', shade(c, -0.14), O2) + ci(37, -64, 3, '#ffd166', O2);
  }
  if (outfit.jewelry) {
    const [c, c2] = col('jewelry');
    if (outfit.jewelry.id === 'necklace') P.neckAcc += [-16, -9, 0, 9, 16].map((x, i) => ci(x, -128 + (8 - Math.abs(x) / 2.4), i === 2 ? 5 : 3.6, i === 2 ? c2 : c, O2)).join('');
    if (outfit.jewelry.id === 'bowtie') P.neckAcc += pa('M0,-132 L-15,-141 L-15,-123Z M0,-132 L15,-141 L15,-123Z', c) + ci(0, -132, 4.5, c2, O2);
    if (outfit.jewelry.id === 'scarf') P.neckAcc += pa('M-30,-146 Q0,-132 30,-146 L32,-132 Q0,-118 -32,-132Z', c) + pa('M10,-130 L26,-128 L24,-96 L8,-98Z', c) + ln('M10,-104 L24,-102', c2, 3);
  }
  if (outfit.hat) {
    const [c, c2] = col('hat');
    const d = shade(c, -0.16);
    P.coversHair = !!GARMENTS[outfit.hat.id]?.coversHair;
    const Y = HEAD_Y;
    switch (outfit.hat.id) {
      case 'beanie': P.hat = pa(`M-56,${Y - 20} Q-58,${Y - 66} 0,${Y - 66} Q58,${Y - 66} 56,${Y - 20} Z`, c) + rc(-60, Y - 30, 120, 18, 8, c2) + ln(`M-36,${Y - 28} v12 M-12,${Y - 28} v12 M12,${Y - 28} v12 M36,${Y - 28} v12`, shade(c2, -0.14), 2) + ci(0, Y - 70, 12, c2); break;
      case 'cap': P.hat = pa(`M-55,${Y - 22} Q-56,${Y - 64} 0,${Y - 64} Q56,${Y - 64} 55,${Y - 22} Z`, c) + pa(`M10,${Y - 26} Q60,${Y - 34} 84,${Y - 14} Q50,${Y - 12} 10,${Y - 18}Z`, c2) + ci(0, Y - 64, 4, c2, O2) + ln(`M0,${Y - 62} L0,${Y - 26}`, d, 2); break;
      case 'chefhat': P.hat = pa(`M-40,${Y - 30} L-40,${Y - 66} Q-66,${Y - 78} -50,${Y - 100} Q-36,${Y - 118} -14,${Y - 106} Q0,${Y - 124} 14,${Y - 106} Q36,${Y - 118} 50,${Y - 100} Q66,${Y - 78} 40,${Y - 66} L40,${Y - 30}Z`, c) + rc(-44, Y - 40, 88, 16, 5, c2) + ln(`M-16,${Y - 66} v-22 M16,${Y - 66} v-22`, '#e3ddd3', 2.2); break;
      case 'crown': P.hat = pa(`M-34,${Y - 42} L-38,${Y - 76} L-18,${Y - 58} L0,${Y - 82} L18,${Y - 58} L38,${Y - 76} L34,${Y - 42}Z`, c) + ci(0, Y - 52, 5, c2, O2) + ci(-20, Y - 50, 3.4, '#7fd1b9', O2) + ci(20, Y - 50, 3.4, '#7fd1b9', O2); break;
      case 'bandana': P.hat = pa(`M-56,${Y - 14} Q-58,${Y - 58} 0,${Y - 58} Q58,${Y - 58} 56,${Y - 14} Q0,${Y - 34} -56,${Y - 14}Z`, c) + [[-28, -38], [-6, -46], [20, -42], [38, -30], [-42, -26]].map(([x, y]) => ci(x, Y + y, 3.4, c2, '')).join('') + pa(`M54,${Y - 18} l22,-6 l-6,16z M54,${Y - 16} l18,14 l-18,2z`, c); break;
      case 'helmet': P.hat = `<circle cx="0" cy="${Y - 2}" r="70" fill="#dff2ff" opacity="0.38" ${O}/>` + shine(`M-48,${Y - 30} Q-40,${Y - 56} -16,${Y - 62}`, 0.9, 6) + rc(-46, Y + 52, 92, 16, 8, c2); break;
      case 'catears': P.hat = [-1, 1].map((k) => pa(`M${k * 20},${Y - 46} L${k * 44},${Y - 76} L${k * 52},${Y - 34}Z`, c) + pa(`M${k * 30},${Y - 48} L${k * 42},${Y - 64} L${k * 46},${Y - 40}Z`, c2, '')).join(''); break;
      case 'dragonhood': P.hatBack = el(0, Y, 64, 60, c); P.hat = pa(`M-60,${Y + 6} Q-66,${Y - 62} 0,${Y - 62} Q66,${Y - 62} 60,${Y + 6} Q50,${Y - 30} 0,${Y - 32} Q-50,${Y - 30} -60,${Y + 6}Z`, c) + pa(`M-12,${Y - 60} l12,-20 l12,20z`, c2) + pa(`M-40,${Y - 50} l4,-18 l12,12z M40,${Y - 50} l-4,-18 l-12,12z`, c2) + ci(-22, Y - 44, 4, '#fff', O2) + ci(22, Y - 44, 4, '#fff', O2); break;
      case 'wreath': P.hat = [-42, -28, -14, 0, 14, 28, 42].map((x, i) => (i % 2 ? ci(x, Y - 44 - (20 - Math.abs(x) / 2.2) * 0.5, 7, c2, O2) : el(x, Y - 44 - (20 - Math.abs(x) / 2.2) * 0.5, 9, 6, c, O2))).join(''); break;
      case 'beret': P.hat = el(8, Y - 46, 56, 22, c) + pa(`M-44,${Y - 34} Q0,${Y - 24} 50,${Y - 34} L50,${Y - 28} Q0,${Y - 18} -44,${Y - 28}Z`, d, O2) + ln(`M8,${Y - 68} v-8`, INK, 3); break;
      case 'strawhat': P.hat = el(0, Y - 30, 88, 18, c) + pa(`M-44,${Y - 30} Q-46,${Y - 74} 0,${Y - 74} Q46,${Y - 74} 44,${Y - 30}Z`, c) + pa(`M-44,${Y - 38} Q0,${Y - 28} 44,${Y - 38} L44,${Y - 30} Q0,${Y - 20} -44,${Y - 30}Z`, c2, O2) + ln(`M-70,${Y - 30} Q-40,${Y - 22} 0,${Y - 21}`, shade(c, -0.14), 2); break;
      case 'hairbow': P.hat = pa(`M30,${Y - 50} L8,${Y - 66} L10,${Y - 36}Z M30,${Y - 50} L54,${Y - 66} L52,${Y - 36}Z`, c) + ci(30, Y - 50, 6, c2, O2); break;
    }
  }
  return P;
}

// ---------- Волосы ----------
function hair(style: number, color: string): { back: string; front: string } {
  const Y = HEAD_Y, c = color, d = shade(color, -0.2), l = shade(color, 0.22);
  const cap = (fringe: string) => pa(`M-56,${Y - 4} Q-60,${Y - 60} 0,${Y - 58} Q60,${Y - 60} 56,${Y - 4} ${fringe} Z`, c);
  switch (style) {
    case 0: return { back: '', front: cap(`Q44,${Y - 34} 12,${Y - 34} Q-22,${Y - 34} -56,${Y - 4}`) + shine(`M-30,${Y - 44} Q-10,${Y - 52} 12,${Y - 50}`, 0.35) };
    case 1: return { back: pa(`M-62,${Y - 10} Q-66,${Y - 62} 0,${Y - 62} Q66,${Y - 62} 62,${Y - 10} L64,${Y + 34} Q50,${Y + 46} 40,${Y + 34} L-40,${Y + 34} Q-50,${Y + 46} -64,${Y + 34}Z`, c), front: cap(`L48,${Y - 22} Q0,${Y - 30} -48,${Y - 22}`) + ln(`M-20,${Y - 26} v-10 M0,${Y - 27} v-12 M20,${Y - 26} v-10`, d, 2) };
    case 2: return { back: pa(`M-62,${Y - 10} Q-66,${Y - 62} 0,${Y - 62} Q66,${Y - 62} 62,${Y - 10} L68,${Y + 84} Q56,${Y + 94} 46,${Y + 84} L40,${Y + 20} L-40,${Y + 20} L-46,${Y + 84} Q-56,${Y + 94} -68,${Y + 84}Z`, c), front: cap(`Q40,${Y - 20} 20,${Y - 40} Q-10,${Y - 20} -56,${Y - 4}`) + shine(`M-34,${Y - 40} Q-14,${Y - 52} 6,${Y - 50}`, 0.35) };
    case 3: return { back: [-1, 1].map((k) => pa(`M${k * 50},${Y - 26} Q${k * 96},${Y - 30} ${k * 88},${Y + 30} Q${k * 78},${Y + 44} ${k * 64},${Y + 30} Q${k * 70},${Y} ${k * 50},${Y - 6}Z`, c) + ci(k * 56, Y - 22, 7, '#ff8a73', O2)).join(''), front: cap(`Q40,${Y - 26} 0,${Y - 44} Q-40,${Y - 26} -56,${Y - 4}`) };
    case 4: { const pts = [[-52, -8], [-62, -36], [-44, -62], [-16, -74], [16, -74], [44, -62], [62, -36], [52, -8]]; return { back: pts.map(([x, y]) => ci(x, Y + y, 24, c)).join('') + el(0, Y - 20, 60, 52, c, ''), front: [[-34, -44], [-12, -52], [12, -52], [34, -44]].map(([x, y]) => ci(x, Y + y, 15, c)).join('') + [[-24, -48], [0, -56], [24, -48]].map(([x, y]) => `<path d="M${x - 5},${Y + y} a5,5 0 1,1 6,5" fill="none" stroke="${l}" stroke-width="2.4" stroke-linecap="round"/>`).join('') }; }
    case 5: return { back: pa(`M30,${Y - 50} Q92,${Y - 70} 90,${Y - 6} Q88,${Y + 40} 66,${Y + 54} Q74,${Y + 10} 52,${Y - 20}Z`, c) + ci(46, Y - 46, 7, '#7fd1b9', O2), front: cap(`Q46,${Y - 30} 24,${Y - 38} Q-6,${Y - 26} -56,${Y - 4}`) };
    case 6: return { back: pa(`M-60,${Y - 10} Q-64,${Y - 62} 0,${Y - 62} Q64,${Y - 62} 60,${Y - 10} L56,${Y + 10} L-56,${Y + 10}Z`, c), front: cap(`Q40,${Y - 26} 0,${Y - 46} Q-40,${Y - 26} -56,${Y - 4}`) + [-1, 1].map((k) => [0, 1, 2, 3, 4].map((i) => el(k * 58, Y + 14 + i * 17, 10, 11, i % 2 ? c : d, O2)).join('') + pa(`M${k * 58},${Y + 92} l-9,14 h18z`, c, O2) + ci(k * 58, Y + 90, 5, '#ffd166', O2)).join('') };
    default: return { back: '', front: cap(`Q40,${Y - 30} 10,${Y - 32} Q-24,${Y - 32} -56,${Y - 4}`) + pa(`M-18,${Y - 54} L-10,${Y - 84} L0,${Y - 60} L10,${Y - 90} L18,${Y - 58} L30,${Y - 78} L30,${Y - 50}Z`, c) };
  }
}

// ---------- Лицо ----------
function face(look: Look, emotion: Emotion, closed: boolean, skin: string, browColor: string, bare = false): string {
  const Y = HEAD_Y;
  let s = '';
  const ex = 20, ey = Y + 4;
  const blush = emotion === 'delight' || emotion === 'joy' ? 0.5 : 0.32;
  s += `<ellipse cx="-32" cy="${Y + 20}" rx="10" ry="6.500" fill="#ff7f8f" opacity="${blush}"/><ellipse cx="32" cy="${Y + 20}" rx="10" ry="6.500" fill="#ff7f8f" opacity="${blush}"/>`;
  if (look.freckles) s += dots(shade(skin, -0.28), [[-36, Y + 12], [-28, Y + 14], [-32, Y + 20], [36, Y + 12], [28, Y + 14], [32, Y + 20]], 1.7);
  const glasses = () => {
    const ex = 20, ey = Y + 4;
    if (look.glasses === 1) return ci(-ex, ey, 14, 'rgba(255,255,255,0.25)', `stroke="#6f9ad6" stroke-width="3.5"`) + ci(ex, ey, 14, 'rgba(255,255,255,0.25)', `stroke="#6f9ad6" stroke-width="3.5"`) + ln(`M-6,${ey - 2} Q0,${ey - 6} 6,${ey - 2}`, '#6f9ad6', 3.5);
    return '';
  };
  if (bare) return s + glasses(); // лицо будет отдельным слоем: остаются румянец, веснушки и очки
  const arcUp = (x: number) => ln(`M${x - 8},${ey + 2} Q${x},${ey - 8} ${x + 8},${ey + 2}`, INK, 3.2);
  const arcDown = (x: number) => ln(`M${x - 8},${ey - 1} Q${x},${ey + 7} ${x + 8},${ey - 1}`, INK, 3.2);
  const openEye = (x: number, look_: number, dx = 0, dy = 0, k = 1) => {
    switch (look_) {
      case 1: return ci(x, ey, 7.5 * k, '#3a2f45', '') + ci(x - 2 + dx, ey - 3 + dy, 2.6, '#fff', '');
      case 2: return el(x, ey, 5.5 * k, 7.5 * k, '#3a2f45', '') + ci(x - 1.5 + dx, ey - 3 + dy, 2.2, '#fff', '') + ln(`M${x + (x > 0 ? 5 : -5)},${ey - 6} l${x > 0 ? 6 : -6},-5 M${x + (x > 0 ? 7 : -7)},${ey - 1} l${x > 0 ? 6 : -6},-2`, INK, 2);
      case 3: return ci(x, ey, 9 * k, '#fff', O2) + ci(x + dx, ey + 1 + dy, 6.5 * k, '#8a5a3c', '') + ci(x + dx, ey + 1 + dy, 3.4, '#2b2030', '') + ci(x - 3 + dx, ey - 3 + dy, 2.4, '#fff', '');
      case 4: return el(x, ey + 1, 7.5 * k, 5.5 * k, '#3a2f45', '') + ci(x - 2 + dx, ey - 1 + dy, 2, '#fff', '') + ln(`M${x - 9},${ey - 3} Q${x},${ey - 9} ${x + 9},${ey - 3}`, INK, 2.2);
      case 5: return ci(x + dx, ey + dy, 4.6 * k, '#3a2f45', '');
      default: return el(x, ey, 5 * k, 7 * k, '#3a2f45', '') + ci(x - 1.5 + dx, ey - 3 + dy, 2.2, '#fff', '');
    }
  };
  // глаза
  if (closed || emotion === 'sleepy') s += arcDown(-ex) + arcDown(ex);
  else if (emotion === 'delight') s += arcUp(-ex) + arcUp(ex);
  else if (emotion === 'silly') s += arcUp(-ex) + openEye(ex, look.eyes);
  else if (emotion === 'surprise') s += openEye(-ex, look.eyes, 0, 0, 1.2) + openEye(ex, look.eyes, 0, 0, 1.2);
  else if (emotion === 'thinking') s += openEye(-ex, look.eyes, 2, -2) + openEye(ex, look.eyes, 2, -2);
  else s += openEye(-ex, look.eyes) + openEye(ex, look.eyes);
  // брови
  const by = Y - 14 - (emotion === 'surprise' ? 6 : 0);
  const bw = look.brows === 2 ? 4.6 : 3;
  const brow = (k: number) => {
    const x = k * ex;
    const tilt = emotion === 'sad' ? -5 : emotion === 'thinking' && k > 0 ? -7 : 0; // внутренний край выше
    if (look.brows === 1) return ln(`M${x - 8},${by + (k > 0 ? tilt : -tilt) * -0.5} L${x + 8},${by + (k > 0 ? -tilt : tilt) * -0.5}`, browColor, bw);
    const inner = by + tilt, outer = by - tilt * 0.3;
    return ln(`M${x - k * 9},${inner} Q${x},${by - 6 + (emotion === 'thinking' && k > 0 ? -4 : 0)} ${x + k * 9},${outer}`, browColor, bw);
  };
  if (!closed) s += brow(-1) + brow(1);
  // рот
  const my = Y + 26;
  switch (closed ? 'sleepy' : emotion) {
    case 'joy': s += ln(`M-12,${my - 2} Q0,${my + 10} 12,${my - 2}`, INK, 3.2); break;
    case 'surprise': s += el(0, my + 2, 6, 7.5, '#8a3d4a', O2); break;
    case 'sleepy': s += el(0, my + 2, 4, 3, '#8a3d4a', O2); break;
    case 'calm': s += ln(`M-8,${my} Q0,${my + 5} 8,${my}`, INK, 3); break;
    case 'silly': s += ln(`M-12,${my - 2} Q0,${my + 8} 12,${my - 2}`, INK, 3.2) + pa(`M-2,${my + 3} h12 v6 a6,6 0 0,1 -12,0z`, '#ff7f8f', O2); break;
    case 'sad': s += ln(`M-9,${my + 5} Q0,${my - 3} 9,${my + 5}`, INK, 3); break;
    case 'delight': s += pa(`M-14,${my - 4} Q0,${my + 18} 14,${my - 4} Z`, '#8a3d4a', O2) + pa(`M-7,${my + 5} Q0,${my + 1} 7,${my + 5} Q0,${my + 11} -7,${my + 5}Z`, '#ff7f8f', ''); break;
    case 'thinking': s += ln(`M2,${my + 2} Q8,${my - 1} 14,${my + 1}`, INK, 3); break;
  }
  // очки
  if (look.glasses === 1) s += ci(-ex, ey, 14, 'rgba(255,255,255,0.25)', `stroke="#6f9ad6" stroke-width="3.5"`) + ci(ex, ey, 14, 'rgba(255,255,255,0.25)', `stroke="#6f9ad6" stroke-width="3.5"`) + ln(`M-6,${ey - 2} Q0,${ey - 6} 6,${ey - 2}`, '#6f9ad6', 3.5);
  if (look.glasses === 2) s += rc(-ex - 14, ey - 11, 28, 22, 6, 'rgba(255,255,255,0.25)', `stroke="#ff8a73" stroke-width="3.5"`) + rc(ex - 14, ey - 11, 28, 22, 6, 'rgba(255,255,255,0.25)', `stroke="#ff8a73" stroke-width="3.5"`) + ln(`M-6,${ey - 2} L6,${ey - 2}`, '#ff8a73', 3.5);
  if (look.glasses === 3) s += star(-ex, ey, 17, 'rgba(255,230,168,0.35)', `stroke="#b79df0" stroke-width="3"`) + star(ex, ey, 17, 'rgba(255,230,168,0.35)', `stroke="#b79df0" stroke-width="3"`) + ln(`M-6,${ey - 2} L6,${ey - 2}`, '#b79df0', 3);
  return s;
}

function head(look: Look, skin: string): string {
  const Y = HEAD_Y;
  let s = rc(-9, Y + 40, 18, 16, 6, skin) + ci(-54, Y + 6, 9, skin) + ci(54, Y + 6, 9, skin);
  if (look.hearingAid) s += pa(`M58,${Y - 6} q12,-2 10,12 q-2,10 -8,8z`, '#7fd1b9', O2) + ln(`M60,${Y - 6} q-6,-8 -8,4`, '#e8f6ff', 2.4);
  if (look.face === 1) s += el(0, Y, 50, 54, skin);
  else if (look.face === 2) s += rc(-53, Y - 50, 106, 100, 44, skin);
  else s += el(0, Y, 55, 50, skin);
  return s;
}

export interface CharacterRender { look: Look; outfit: Outfit; pose: Pose; emotion: Emotion; closed?: boolean; bareFace?: boolean }

/** Собирает героя из слоёв. Сидя — ноги укорочены, опорная точка на уровне сиденья. */
export const SIT_DY = 46;
export function characterArt(r: CharacterRender): Art {
  const skin = SKINS[r.look.skin] ?? SKINS[0];
  const hc = HAIR_COLORS[r.look.hairColor] ?? HAIR_COLORS[0];
  const sitting = r.pose === 'sitting';
  const bottomY = sitting ? -22 : -6;
  const P = wear(r.outfit, skin, bottomY);
  const H = hair(r.look.hair, hc);
  const closed = !!r.closed || r.pose === 'sleeping';
  const clip = P.coversHair ? `<clipPath id="hatclip"><rect x="-130" y="${HEAD_Y - 22}" width="260" height="240"/></clipPath>` : '';
  const hairWrap = (h: string) => (P.coversHair ? `<g clip-path="url(#hatclip)">${h}</g>` : h);
  const body =
    clip + P.backAcc + P.hatBack + hairWrap(H.back) + P.legs + P.shoes + P.lower + P.body + P.upper + P.arms +
    head(r.look, skin) + P.neckAcc + face(r.look, r.emotion, closed, skin, shade(hc, -0.25), r.bareFace) + hairWrap(H.front) + P.hat;
  const dy = sitting ? SIT_DY : 0; // сидя: бёдра у опорной точки, ноги свисают ниже
  return { svg: `<g transform="translate(0 ${dy})">${body}</g>`, x: -115, y: -322 + dy, w: 230, h: 340 };
}

/** Портрет для интерфейса: голова и плечи. */
export function portraitArt(look: Look, outfit: Outfit, emotion: Emotion = 'joy'): Art {
  const a = characterArt({ look, outfit, pose: 'standing', emotion });
  return { svg: a.svg, x: -84, y: -272, w: 168, h: 168 };
}
