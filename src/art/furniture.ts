// Оригинальные иллюстрации мебели и комнат. Опорная точка мебели — низ по центру.
import { FURNITURE } from '../content/furniture';
import { Art, FURN_COLORS, INK, O, O2, WOODS, ci, el, g, heart, ln, pa, rc, shade, shadow, shine, star } from './base';

export interface FurnState { color: number; open: boolean; on: number; night: boolean; frame?: number; occupied?: boolean }
export interface FurnArt { back: Art; front?: Art }

const knob = (x: number, y: number) => ci(x, y, 5, '#fff6e6', O2);
const legsOf = (xs: number[], h: number, c: string) => xs.map((x) => rc(x - 7, -h, 14, h, 4, c)).join('');
const cabinet = (w: number, h: number, c: string, top: string) =>
  rc(-w / 2, -h + 12, w, h - 12, 10, c) + rc(-w / 2 + 8, -8, w - 16, 8, 2, shade(c, -0.2), '') + rc(-w / 2 - 6, -h, w + 12, 16, 6, top);
const bubbles = (pts: number[][]) => pts.map(([x, y, r]) => ci(x, y, r, '#ffffff', O2) + `<circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.25}" fill="#dff2ff"/>`).join('');
const water = (x: number, y0: number, y1: number) => `<path d="M${x},${y0} L${x},${y1}" stroke="#8fd0f5" stroke-width="9" stroke-linecap="round" opacity="0.85"/><path d="M${x - 2},${y0} L${x - 2},${y1}" stroke="#e8f6ff" stroke-width="2.5" stroke-linecap="round"/>` + ci(x - 10, y1 - 2, 3, '#bfe4fa', '') + ci(x + 11, y1 - 5, 2.4, '#bfe4fa', '');

function tvScreen(scene: number, frame: number): string {
  const f = frame % 2;
  switch (scene) {
    case 1: return rc(-84, -234, 168, 108, 8, '#a9d4f5', '') + ci(-40 + f * 6, -196, 20, '#ffd94d', O2) + ln(`M-40,${-226 + f * 2} v-6 M-70,-196 h-6 M-10,-196 h6`, '#ffd94d', 3) + el(30, -180 - f * 4, 30, 13, '#fff', O2) + el(52, -200 + f * 3, 18, 9, '#fff', O2) + pa('M-84,-126 Q-40,-156 0,-140 Q40,-160 84,-134 L84,-126Z', '#9ed68a', '');
    case 2: return rc(-84, -234, 168, 108, 8, '#7fc4e8', '') + g(pa('M-20,0 Q0,-18 22,0 Q0,18 -20,0Z M-20,0 l-16,-12 v24z', '#ff9d4d', O2) + ci(10, -3, 2.4, INK, ''), `transform="translate(${-10 + f * 14} ${-184 + f * 4})"`) + g(pa('M-12,0 Q0,-10 13,0 Q0,10 -12,0Z M-12,0 l-9,-7 v14z', '#ffd94d', O2), `transform="translate(${46 - f * 10} -150) scale(-1 1)"`) + bubbles([[-56, -200 - f * 8, 5], [-48, -216 - f * 6, 3], [60, -210 - f * 8, 4]]) + pa('M-70,-126 q4,-30 -4,-40 q14,10 10,40z M60,-126 q-6,-24 4,-34 q4,16 2,34z', '#6fbf8a', '');
    case 3: return rc(-84, -234, 168, 108, 8, '#2f3a66', '') + [[-60, -216], [-30, -150], [50, -220], [66, -160], [0, -206], [-70, -176]].map(([x, y], i) => star(x, y, 4 + ((i + f) % 2) * 2, '#ffe9a8', '')).join('') + g(pa('M0,-30 Q13,-14 11,12 L-11,12 Q-13,-14 0,-30Z', '#f4f6fb', O2) + ci(0, -6, 5, '#8fc3f2', O2) + pa('M-6,13 Q0,' + (26 + f * 8) + ' 6,13Z', '#ffd166', ''), `transform="translate(${-6 + f * 8} ${-176 - f * 8}) rotate(24)"`) + ci(52, -150, 12, '#ff8a73', O2);
    default: return rc(-84, -234, 168, 108, 8, '#ffe0ea', '') + [-44, 0, 44].map((x, i) => g(ln('M0,0 V-30', '#6fae62', 4) + [0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-42" rx="6" ry="9" fill="${['#ff8a73', '#b79df0', '#8fc3f2'][i]}" ${O2} transform="rotate(${a} 0 -34)"/>`).join('') + ci(0, -34, 6, '#ffd166', O2), `transform="translate(${x} -130) rotate(${((i + f) % 2 ? 8 : -8)})"`)).join('') + `<text x="${-62 + f * 6}" y="-200" font-size="20" fill="#b79df0" font-family="serif">♪</text><text x="${50 - f * 6}" y="-208" font-size="16" fill="#ff8a73" font-family="serif">♫</text>`;
  }
}

function draw(id: string, s: FurnState): { back: string; front?: string; extraW?: number; extraH?: number } {
  const def = FURNITURE[id];
  const W = def.w, H = def.h;
  const [c, c2] = FURN_COLORS[s.color % FURN_COLORS.length];
  const wood = WOODS[s.color % WOODS.length];
  const d = shade(c, -0.14), l = shade(c, 0.16);
  switch (id) {
    case 'sofa': return { back: shadow(W, -2) + legsOf([-180, 180], 16, WOODS[0]) + rc(-196, -212, 392, 150, 34, c) + ln('M-66,-196 V-110 M66,-196 V-110', d, 2.4) + rc(-200, -74, 400, 62, 14, d) + [-120, 0, 120].map((x) => rc(x - 62, -104, 124, 40, 16, l)).join('') + rc(-214, -140, 48, 128, 22, c) + rc(166, -140, 48, 128, 22, c) + g(rc(-26, -26, 52, 52, 12, c2) + heart(0, 0, 9, c, ''), 'transform="translate(-150 -128) rotate(-12)"') };
    case 'armchair': return { back: shadow(W, -2) + legsOf([-70, 70], 16, WOODS[0]) + rc(-86, -208, 172, 150, 40, c) + rc(-86, -72, 172, 60, 14, d) + rc(-66, -102, 132, 40, 16, l) + rc(-102, -132, 40, 120, 20, c) + rc(62, -132, 40, 120, 20, c) };
    case 'coffeetable': return { back: shadow(W, -2) + legsOf([-104, 104], 76, shade(wood, -0.15)) + rc(-116, -40, 232, 10, 4, shade(wood, -0.1)) + rc(-130, -84, 260, 16, 8, wood) + shine('M-110,-78 h80', 0.4) };
    case 'shelf': case 'bathshelf': return { back: pa(`M${-W / 2 + 30},-18 l0,16 l-14,-16z M${W / 2 - 30},-18 l0,16 l14,-16z`, shade(wood, -0.2), O2) + rc(-W / 2, -30, W, 12, 5, id === 'bathshelf' ? '#ffffff' : wood) };
    case 'tv': return { back: shadow(W, -2) + rc(-150, -108, 300, 100, 10, WOODS[0]) + rc(-138, -96, 132, 76, 6, shade(WOODS[0], 0.2), O2) + rc(6, -96, 132, 76, 6, shade(WOODS[0], 0.2), O2) + knob(-18, -58) + knob(18, -58) + legsOf([-130, 130], 10, shade(WOODS[0], -0.2)) + rc(-20, -122, 40, 14, 3, '#6b6478') + rc(-96, -246, 192, 128, 14, '#4a4358') + (s.on ? tvScreen(s.on, s.frame ?? 0) : rc(-84, -234, 168, 108, 8, '#39334a', '') + shine('M-70,-220 L-40,-222', 0.2, 5)) + ci(84, -126, 3, s.on ? '#7fd1b9' : '#ff8a73', '') };
    case 'floorlamp': return { back: shadow(80, -2) + (s.on ? `<path d="M-40,-300 L40,-300 L120,0 L-120,0Z" fill="#ffe9a8" opacity="0.18"/>` : '') + el(0, -8, 34, 9, '#6b6478') + rc(-4, -300, 8, 294, 3, '#6b6478') + pa('M-30,-374 L30,-374 L50,-296 L-50,-296Z', s.on ? '#ffe9a8' : c) + ln('M-46,-306 h92', s.on ? '#ffd166' : d, 3) + ln('M30,-296 v20', INK, 2) + ci(30, -272, 4, '#ffd166', O2) };
    case 'rug': return { back: el(0, -60, 258, 58, c) + el(0, -60, 232, 46, c2, O2) + el(0, -60, 196, 34, l, O2) + [-150, -75, 0, 75, 150].map((x) => star(x, -60, 9, c2, '')).join('') };
    case 'bathmat': return { back: rc(-128, -78, 256, 74, 30, c) + rc(-108, -64, 216, 46, 20, c2, O2) + [-60, 0, 60].map((x) => ci(x, -41, 9, l, '')).join('') };
    case 'plant': { const pot = ['#e79a6b', '#8fc3f2', '#ffffff'][s.color % 3]; const leaf = (a: number, len: number, col: string) => g(pa(`M0,0 Q-26,${-len * 0.5} 0,${-len} Q26,${-len * 0.5} 0,0Z`, col) + ln(`M0,-6 V${-len + 10}`, shade(col, -0.2), 2.2), `transform="translate(0 -96) rotate(${a})"`); return { back: shadow(100, -2) + leaf(-48, 120, '#6fb57a') + leaf(46, 126, '#6fb57a') + leaf(-20, 150, '#86c98f') + leaf(22, 156, '#86c98f') + leaf(0, 130, '#9ed6a4') + pa('M-44,-100 L44,-100 L34,-4 Q0,4 -34,-4Z', pot) + rc(-50, -110, 100, 18, 7, shade(pot, -0.1)) + ln('M-34,-60 Q0,-52 34,-60', shade(pot, -0.18), 2.4) }; }
    case 'toybox': return { back: shadow(W, -2) + (s.open ? pa('M-110,-112 L-96,-170 L96,-170 L110,-112Z', d) + rc(-104, -112, 208, 14, 3, '#5d5068', '') : '') + rc(-110, -110, 220, 104, 12, c) + rc(-96, -94, 192, 72, 8, l, O2) + star(-50, -58, 16, c2) + heart(0, -58, 13, '#ff8a73') + ci(50, -58, 14, '#8fc3f2') + (s.open ? '' : rc(-116, -134, 232, 30, 12, d) + rc(-14, -116, 28, 14, 4, '#ffd166', O2)) };
    case 'picture': return { back: rc(-85, -140, 170, 136, 8, WOODS[(s.color + 1) % 4]) + rc(-70, -126, 140, 108, 4, ['#cfeaff', '#ffe6d6', '#e6dcff'][s.color % 3], O2) + (s.color % 3 === 0 ? pa('M-70,-18 L-70,-50 L-30,-90 L0,-58 L24,-78 L70,-36 L70,-18Z', '#9ed68a', O2) + ci(40, -102, 12, '#ffd94d', O2) : s.color % 3 === 1 ? heart(0, -72, 30, '#ff8a73') + star(-44, -100, 8, '#ffd166', '') + star(46, -44, 6, '#ffd166', '') : el(0, -60, 34, 26, '#fff', O2) + el(-12, -98, 9, 18, '#fff', O2) + el(12, -98, 9, 18, '#fff', O2) + ci(-10, -64, 3, INK, '') + ci(10, -64, 3, INK, '') + pa('M-4,-54 h8 l-4,5z', '#ff8a73', '')) };
    case 'window': return { back: rc(-140, -280, 280, 270, 16, '#fff6e6') + rc(-122, -262, 244, 234, 8, s.night ? '#2f3a66' : '#bfe4fa', O2) + (s.night ? [[-90, -230], [-40, -180], [30, -240], [80, -200], [-70, -120], [60, -110], [0, -150], [96, -70]].map(([x, y], i) => star(x, y, 5 + (i % 3) * 2, '#ffe9a8', '')).join('') + ci(60, -200, 26, '#fff3c4', '') + ci(72, -208, 24, '#2f3a66', '') : ci(-60, -210, 28, '#ffd94d', O2) + el(50, -190, 44, 18, '#fff', O2) + el(84, -206, 26, 12, '#fff', O2) + pa('M-122,-28 L-122,-70 Q-60,-120 0,-84 Q60,-124 122,-76 L122,-28Z', '#9ed68a', '')) + ln('M0,-262 V-28 M-122,-145 H122', '#fff6e6', 10) + ln('M0,-262 V-28 M-122,-145 H122', INK, 0) + rc(-150, -22, 300, 16, 6, '#f1dcc0') + pa('M-150,-290 L-96,-290 Q-96,-180 -150,-60Z M150,-290 L96,-290 Q96,-180 150,-60Z', s.night ? '#b7a6e0' : '#ffc9bd') + rc(-160, -300, 320, 16, 8, WOODS[0]), extraW: 50, extraH: 30 };
    case 'fridge': { const body = shadow(W, -2) + rc(-110, -440, 220, 434, 22, '#eef3fb'); if (!s.open) return { back: body + ln('M-110,-290 H110', INK, 3) + rc(74, -400, 12, 80, 6, c) + rc(74, -264, 12, 120, 6, c) + heart(-50, -360, 10, '#ff8a73') + star(-10, -330, 9, '#ffd166') + ci(-60, -230, 9, '#7fd1b9') + rc(-96, -8, 192, 8, 3, '#cfd8e6', '') }; return { back: g(pa('M-110,-438 L-196,-420 L-196,-30 L-110,-8Z', '#e3e9f4') + rc(-190, -330, 70, 10, 3, '#cfd8e6', O2) + rc(-190, -210, 70, 10, 3, '#cfd8e6', O2)) + body + rc(-98, -428, 196, 410, 14, '#d9efff', O2) + [-330, -238, -146, -54].map((y) => rc(-98, y, 196, 8, 2, '#ffffff', O2)).join('') + g(rc(-26, -26, 52, 52, 26, '#fff', O) + ln('M-12,0 h24 M0,-12 v24', '#7fd1b9', 6), 'transform="translate(134 -400)"'), extraW: 200 }; }
    case 'counter': return { back: shadow(W, -2) + cabinet(W, 214, c, '#fff6e6') + rc(-136, -180, 126, 160, 8, l, O2) + rc(10, -180, 126, 160, 8, l, O2) + knob(-22, -100) + knob(22, -100) + rc(-124, -220, 250, 8, 4, WOODS[0]) };
    case 'stove': return { back: shadow(W, -2) + cabinet(W, 214, '#f4f6fb', '#6b6478') + rc(-96, -150, 192, 124, 12, s.on ? '#ffd9a8' : '#4a4358') + (s.on ? `<rect x="-84" y="-138" width="168" height="100" rx="8" fill="#ffb86b" opacity="0.6"/>` + ln('M-60,-60 h120', '#ff8a73', 4) : shine('M-80,-136 L-50,-138', 0.25, 5)) + rc(-70, -160, 140, 8, 4, '#cfd8e6') + [-80, -40, 40, 80].map((x, i) => ci(x, -180, 8, s.on && i < 2 ? '#ff8a73' : '#fff6e6', O2)).join('') + [-56, 56].map((x) => el(x, -214, 40, 5, s.on ? '#ff9d6b' : '#3d374a', O2)).join('') };
    case 'sink': return { back: shadow(W, -2) + cabinet(W, 214, c, '#fff6e6') + rc(-106, -180, 100, 160, 8, l, O2) + rc(6, -180, 100, 160, 8, l, O2) + knob(-18, -100) + knob(18, -100) + rc(-52, -216, 104, 14, 6, '#cfe6f5') + `<path d="M0,-216 V-268 Q0,-292 24,-292 Q40,-292 40,-274" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round"/><path d="M0,-216 V-268 Q0,-292 24,-292 Q40,-292 40,-274" fill="none" stroke="#cfd8e6" stroke-width="7" stroke-linecap="round"/>` + ci(-22, -222, 7, '#ff8a73') + (s.on ? water(40, -268, -222) : ''), extraH: 90 };
    case 'cupboard': { if (!s.open) return { back: rc(-150, -190, 300, 186, 12, c) + rc(-138, -178, 132, 162, 8, l, O2) + rc(6, -178, 132, 162, 8, l, O2) + knob(-20, -60) + knob(20, -60) }; return { back: pa('M-150,-190 L-206,-176 L-206,-18 L-150,-4Z M150,-190 L206,-176 L206,-18 L150,-4Z', l) + rc(-150, -190, 300, 186, 12, c) + rc(-138, -178, 276, 162, 6, '#fff6e6', O2) + rc(-138, -106, 276, 8, 2, d, O2) + rc(-138, -24, 276, 8, 2, d, O2), extraW: 130 }; }
    case 'blenderstand': return { back: shadow(W, -2) + cabinet(W, 214, c, '#fff6e6') + rc(-106, -180, 212, 70, 8, l, O2) + rc(-106, -100, 212, 80, 8, l, O2) + knob(0, -146) + knob(0, -62) + rc(-106, -236, 52, 24, 6, '#6b6478') + ci(-80, -224, 5, '#ff8a73', O2) + pa('M-102,-296 L-58,-296 L-64,-236 L-96,-236Z', '#e3f3ff') + rc(-104, -304, 48, 10, 4, '#6b6478') + ln('M-92,-286 L-90,-246', '#fff', 3) + `<path d="M-58,-284 q14,2 12,20 q-2,10 -12,10" fill="none" ${O}/>`, extraH: 100 };
    case 'table': return { back: shadow(W, -2) + legsOf([-160, 160], 156, shade(wood, -0.15)) + rc(-174, -152, 348, 18, 4, shade(wood, -0.08)) + rc(-190, -168, 380, 18, 8, wood) + pa('M-70,-168 L70,-168 L70,-128 Q0,-116 -70,-128Z', '#fff6e6') + ln('M-70,-138 Q0,-126 70,-138', '#ff8a73', 3) };
    case 'chair': return { back: shadow(90, -2) + legsOf([-40, 40], 100, shade(wood, -0.15)) + rc(-46, -214, 92, 110, 18, c) + rc(-30, -196, 60, 60, 12, l, O2) + heart(0, -166, 10, c2, '') + rc(-52, -108, 104, 18, 8, c) };
    case 'stool': return { back: shadow(90, -2) + ln('M-36,-88 L-44,-2 M36,-88 L44,-2 M0,-88 V-4', shade(WOODS[0], -0.1), 9) + ln('M-40,-40 H40', shade(WOODS[0], -0.1), 5) + rc(-52, -100, 104, 18, 9, c) };
    case 'clock': return { back: ci(0, -55, 52, c) + ci(0, -55, 42, '#fff6e6', O2) + [0, 90, 180, 270].map((a) => `<rect x="-2" y="-93" width="4" height="8" rx="2" fill="${INK}" transform="rotate(${a} 0 -55)"/>`).join('') + ln('M0,-55 V-80 M0,-55 L18,-46', INK, 4) + ci(0, -55, 4, '#ff8a73', O2) };
    case 'bed': return {
      back: shadow(W, -2) + legsOf([-220, 220], 30, shade(wood, -0.15)) + rc(-240, -232, 40, 216, 16, wood) + pa('M-240,-170 Q-240,-232 -200,-232 L-200,-170Z', shade(wood, 0.1), '') + rc(204, -166, 36, 150, 14, wood) + rc(-214, -70, 430, 46, 8, shade(wood, -0.08)) + rc(-212, -104, 426, 44, 14, '#fff6e6') + g(rc(-70, -30, 140, 60, 26, '#ffffff') + ln('M-50,18 h100', '#e9e4dc', 2), 'transform="translate(-128 -124) rotate(-4)"'),
      front: pa('M-66,-174 Q-40,-190 0,-184 L196,-178 Q214,-176 214,-158 L214,-60 Q214,-52 204,-52 L-66,-52 Q-78,-52 -78,-64 L-78,-150 Q-78,-168 -66,-174Z', c) + pa('M-78,-150 Q-78,-170 -60,-176 L-20,-184 L-20,-152 Q-50,-140 -78,-128Z', c2, O2) + [[10, -150], [70, -120], [130, -150], [180, -110], [40, -86], [110, -84]].map(([x, y]) => star(x, y, 9, l, '')).join(''),
    };
    case 'nightstand': return { back: shadow(W, -2) + legsOf([-58, 58], 14, shade(wood, -0.15)) + rc(-75, -160, 150, 148, 10, wood) + (s.open ? rc(-66, -146, 132, 104, 6, '#5d5068', O2) + rc(-72, -56, 144, 40, 8, shade(wood, 0.14)) + knob(0, -36) : rc(-63, -146, 126, 58, 6, shade(wood, 0.14), O2) + rc(-63, -80, 126, 58, 6, shade(wood, 0.14), O2) + knob(0, -117) + knob(0, -51)) };
    case 'ceilinglamp': return { back: (s.on ? `<circle cx="0" cy="-36" r="110" fill="#ffe9a8" opacity="0.22"/>` : '') + ln('M0,-170 V-96', INK, 4) + pa('M-60,-40 Q-60,-100 0,-100 Q60,-100 60,-40Z', s.on ? '#ffe9a8' : '#cdbdf2') + rc(-66, -44, 132, 12, 6, s.on ? '#ffd166' : '#9f8bd6') + ci(0, -26, 12, s.on ? '#fff8dc' : '#e8e8f0'), extraW: 60, extraH: 60 };
    case 'wardrobe': return { back: shadow(W, -2) + legsOf([-104, 104], 14, shade(wood, -0.15)) + rc(-130, -430, 260, 418, 14, wood) + rc(-138, -444, 276, 22, 8, shade(wood, -0.1)) + rc(-118, -412, 112, 300, 8, shade(wood, 0.14), O2) + rc(6, -412, 112, 300, 8, shade(wood, 0.14), O2) + rc(-118, -100, 236, 76, 8, shade(wood, 0.14), O2) + rc(-22, -280, 10, 44, 5, '#ffd166', O2) + rc(12, -280, 10, 44, 5, '#ffd166', O2) + knob(0, -62) + g(ln('M0,-12 q0,-8 6,-8 q7,0 5,7 M-22,4 L0,-10 L22,4', c, 4) + pa('M-24,2 L-10,-2 Q0,6 10,-2 L24,2 L28,18 L18,20 L20,44 L-20,44 L-18,20 L-28,18Z', c, O2), 'transform="translate(-62 -360)"') + g(star(0, 0, 18, c2, O2), 'transform="translate(62 -340)"') };
    case 'toyshelf': return { back: shadow(W, -2) + rc(-150, -326, 300, 320, 12, wood) + [-316, -186, -56].map((y) => rc(-138, y + 4, 276, 116 - (y === -316 ? 126 : 0) > 0 ? 112 : 0, 6, shade(wood, 0.2), O2)).join('') + rc(-138, -312, 276, 114, 6, shade(wood, 0.2), O2) + rc(-156, -338, 312, 16, 6, shade(wood, -0.1)) + rc(-138, -196, 276, 10, 2, shade(wood, -0.1), O2) + rc(-138, -66, 276, 10, 2, shade(wood, -0.1), O2), extraH: 20 };
    case 'petbed': return { back: shadow(W, -2) + el(0, -30, 92, 32, c) + el(0, -30, 70, 20, c2, O2), front: pa('M-92,-30 Q-92,2 0,2 Q92,2 92,-30 Q60,-8 0,-8 Q-60,-8 -92,-30Z', d) + ci(0, -2, 0, d, '') };
    case 'bathtub': return {
      back: shadow(W, -2) + rc(-212, -150, 424, 60, 20, '#dfeaf5') + `<path d="M176,-150 V-200 Q176,-222 154,-222 Q138,-222 138,-204" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round"/><path d="M176,-150 V-200 Q176,-222 154,-222 Q138,-222 138,-204" fill="none" stroke="#cfd8e6" stroke-width="7" stroke-linecap="round"/>` + ci(196, -160, 8, '#ff8a73') + (s.on ? water(138, -198, -150) : ''),
      front: (s.on || s.occupied ? bubbles([[-150, -150, 18], [-110, -160, 22], [-66, -150, 16], [-20, -158, 20], [80, -154, 20], [120, -160, 16], [-170, -136, 12], [150, -146, 14], [-40, -140, 14], [100, -140, 12]]) : '') + pa('M-216,-146 Q-218,-134 -204,-40 Q-198,-14 -160,-14 L160,-14 Q198,-14 204,-40 Q218,-134 216,-146Z', '#ffffff') + rc(-222, -156, 444, 20, 10, '#ffffff') + ln('M-190,-120 Q-186,-70 -176,-40', '#dfeaf5', 6) + pa('M-170,-16 l-6,14 h28 l-6,-14z M170,-16 l6,14 h-28 l6,-14z', c) + ln('M-200,-100 Q0,-84 200,-100', c, 5),
      extraH: 40,
    };
    case 'bathsink': return { back: shadow(120, -2) + pa('M-30,-150 L30,-150 L22,-4 L-22,-4Z', '#f4f6fb') + pa('M-100,-216 L100,-216 Q96,-150 0,-150 Q-96,-150 -100,-216Z', '#ffffff') + rc(-104, -224, 208, 14, 7, '#ffffff') + `<path d="M0,-222 V-256 Q0,-276 20,-276 Q34,-276 34,-262" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/><path d="M0,-222 V-256 Q0,-276 20,-276 Q34,-276 34,-262" fill="none" stroke="#cfd8e6" stroke-width="6" stroke-linecap="round"/>` + ci(-20, -230, 6, c) + (s.on ? water(34, -256, -226) : ''), extraH: 70 };
    case 'mirror': return { back: el(0, -112, 86, 106, c) + el(0, -112, 72, 92, '#dff2ff', O2) + shine('M-40,-150 L-10,-180', 0.9, 8) + shine('M-30,-120 L-14,-136', 0.7, 5) + star(0, -216, 10, c2) };
    case 'laundry': return { back: shadow(W, -2) + pa('M-66,-150 L66,-150 L54,-4 Q0,4 -54,-4Z', '#e9c79a') + ln('M-62,-110 H62 M-58,-70 H58 M-55,-34 H55 M-30,-150 L-24,-2 M0,-150 V0 M30,-150 L24,-2', '#c9a070', 2.4) + rc(-72, -160, 144, 14, 6, '#d9a877') + (s.open ? '' : pa('M-70,-160 Q0,-196 70,-160Z', c) + ci(0, -182, 7, c2)), extraH: 40 };
    default: return { back: rc(-W / 2, -H, W, H, 10, c) };
  }
}

export function furnitureArt(id: string, s: FurnState): FurnArt {
  const def = FURNITURE[id];
  const dr = draw(id, s);
  const w = def.w + 40 + (dr.extraW ?? 0), h = def.h + 30 + (dr.extraH ?? 0);
  const box = { x: -w / 2, y: -h, w, h: h + 14 };
  return { back: { svg: dr.back, ...box }, front: dr.front ? { svg: dr.front, ...box } : undefined };
}

export function furnitureArtKey(id: string, s: FurnState): string {
  return `f:${id}:${s.color}:${s.open ? 1 : 0}:${s.on}:${s.night ? 1 : 0}:${s.frame ?? 0}:${s.occupied ? 1 : 0}`;
}

// ---------- Фон комнаты ----------
const WALLS = ['#fff1dc', '#dff3ea', '#e9e2fb', '#dcefff', '#ffe6dc', '#fff6c9'];
const FLOORS = [['#e3b98a', '#d3a676'], ['#f1dcc0', '#e3c9a4'], ['#cdbdf2', '#bda9ea'], ['#bfe8dc', '#a4dccb'], ['#ffe0c2', '#f6cfae']];

export function roomArt(wallpaper: number, floor: number): Art {
  const wc = WALLS[wallpaper % WALLS.length], wd = shade(wc, -0.07);
  const [fc, fd] = FLOORS[floor % FLOORS.length];
  let pat = '';
  const k = wallpaper % 6;
  if (k === 0) for (let x = 40; x < 1600; x += 80) pat += `<rect x="${x}" y="0" width="26" height="580" fill="${wd}"/>`;
  if (k === 1) for (let y = 40; y < 560; y += 70) for (let x = (y / 70) % 2 ? 40 : 80; x < 1600; x += 80) pat += `<circle cx="${x}" cy="${y}" r="7" fill="${wd}"/>`;
  if (k === 2) for (let y = 50; y < 560; y += 100) for (let x = (y / 100) % 2 ? 60 : 130; x < 1600; x += 140) pat += star(x, y, 13, wd, '');
  if (k === 3) { for (let x = 0; x <= 1600; x += 80) pat += `<path d="M${x},300 V580" stroke="${wd}" stroke-width="4"/>`; for (let y = 300; y <= 580; y += 70) pat += `<path d="M0,${y} H1600" stroke="${wd}" stroke-width="4"/>`; }
  if (k === 4) for (let y = 40; y < 580; y += 80) for (let x = (y / 80) % 2 ? 50 : 110; x < 1600; x += 120) pat += `<path d="M${x},${y - 16} l14,16 l-14,16 l-14,-16z" fill="${wd}"/>`;
  if (k === 5) for (let x = 60; x < 1600; x += 160) pat += `<path d="M${x},0 Q${x + 40},290 ${x},580" stroke="${wd}" stroke-width="10" fill="none"/>`;
  let fl = '';
  const f = floor % 5;
  if (f === 0 || f === 1) { for (let y = 640; y < 900; y += 64) fl += `<path d="M0,${y} H1600" stroke="${fd}" stroke-width="4"/>`; for (let r = 0; r < 5; r++) for (let x = (r % 2) * 130 + 60; x < 1600; x += 260) fl += `<path d="M${x},${596 + r * 64} v${r === 0 ? 44 : 64}" stroke="${fd}" stroke-width="4"/>`; }
  else if (f === 2) for (let y = 620; y < 900; y += 36) for (let x = ((y / 36) | 0) % 2 ? 30 : 70; x < 1600; x += 80) fl += `<circle cx="${x}" cy="${y}" r="5" fill="${fd}"/>`;
  else { for (let x = -200; x <= 1800; x += 100) fl += `<path d="M${800 + (x - 800) * 0.82},596 L${x},900" stroke="${fd}" stroke-width="4"/>`; for (const y of [640, 700, 780, 880]) fl += `<path d="M0,${y} H1600" stroke="${fd}" stroke-width="4"/>`; }
  const svg =
    `<defs><linearGradient id="wl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2f45" stop-opacity="0.14"/><stop offset="0.25" stop-color="#3a2f45" stop-opacity="0"/></linearGradient></defs>` +
    `<rect width="1600" height="600" fill="${wc}"/>${pat}<rect width="1600" height="600" fill="url(#wl)"/>` +
    `<rect y="596" width="1600" height="304" fill="${fc}"/>${fl}<rect y="596" width="1600" height="304" fill="url(#fg)"/>` +
    `<rect y="566" width="1600" height="34" fill="#fff6e6" stroke="${INK}" stroke-width="3"/><rect y="0" width="1600" height="26" fill="${shade(wc, -0.14)}"/><path d="M0,26 H1600" stroke="${INK}" stroke-width="3"/>`;
  return { svg, x: 0, y: 0, w: 1600, h: 900 };
}
export { WALLS, FLOORS };

/** Сценка телевизора отдельной картинкой — накладывается на экран спрайта. */
export function tvSceneArt(scene: number, frame: number): Art {
  return { svg: tvScreen(scene, frame), x: -84, y: -234, w: 168, h: 108 };
}
