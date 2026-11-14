// Общие помощники для оригинальных SVG-иллюстраций. Все рисунки создаются кодом в этом проекте.
export interface Art { svg: string; x: number; y: number; w: number; h: number }

export const INK = '#5a4a5c';
export const O = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
export const O2 = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;
export const NO = 'stroke="none"';

export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export const art = (svg: string, x: number, y: number, w: number, h: number): Art => ({ svg, x, y, w, h });
/** Рисунок с опорной точкой внизу по центру. */
export const based = (svg: string, w: number, h: number, pad = 8): Art => ({ svg, x: -w / 2 - pad, y: -h - pad, w: w + pad * 2, h: h + pad * 2 });

export const el = (cx: number, cy: number, rx: number, ry: number, fill: string, extra = O) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
export const ci = (cx: number, cy: number, r: number, fill: string, extra = O) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;
export const rc = (x: number, y: number, w: number, h: number, r: number, fill: string, extra = O) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
export const pa = (d: string, fill: string, extra = O) => `<path d="${d}" fill="${fill}" ${extra}/>`;
export const ln = (d: string, color = INK, w = 3) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
export const g = (inner: string, attrs = '') => `<g ${attrs}>${inner}</g>`;
/** Мягкая тень на полу. */
export const shadow = (w: number, y = 0, a = 0.16) => `<ellipse cx="0" cy="${y}" rx="${w / 2}" ry="${Math.max(5, w / 9)}" fill="#3a2f45" opacity="${a}"/>`;
/** Блик. */
export const shine = (d: string, a = 0.5, w = 3) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" opacity="${a}"/>`;

export function star(cx: number, cy: number, r: number, fill: string, extra = O2): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
  }
  return pa(d + 'Z', fill, extra);
}
export const heart = (cx: number, cy: number, s: number, fill: string, extra = O2) =>
  pa(`M${cx},${cy + s * 0.9} C${cx - s * 1.4},${cy - s * 0.2} ${cx - s * 0.6},${cy - s * 1.1} ${cx},${cy - s * 0.35} C${cx + s * 0.6},${cy - s * 1.1} ${cx + s * 1.4},${cy - s * 0.2} ${cx},${cy + s * 0.9}Z`, fill, extra);

export function toSvg(a: Art, scale = 1): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${a.x} ${a.y} ${a.w} ${a.h}" width="${Math.ceil(a.w * scale)}" height="${Math.ceil(a.h * scale)}">${a.svg}</svg>`;
}
export const dataUri = (a: Art, scale = 1) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(toSvg(a, scale));

export const PALETTE = {
  cream: '#fff6e6', mint: '#bfe8dc', mintDeep: '#7fd1b9', coral: '#ff8a73', sky: '#a9d4f5', skyDeep: '#6f9ad6',
  lilac: '#cdbdf2', lilacDeep: '#9f8bd6', sun: '#ffd166', wood: '#d9a877', woodDeep: '#b98454', white: '#ffffff', leaf: '#7fbf7a',
};
export const FURN_COLORS = [
  ['#ff9f8a', '#fff1dc'], ['#8fd6c2', '#fff6e6'], ['#a9c8f2', '#fff6e6'], ['#c9b6f0', '#fff6e6'],
];
export const WOODS = ['#d9a877', '#f1dcc0', '#b98a6a', '#e9c79a'];
