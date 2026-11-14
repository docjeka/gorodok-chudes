import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import manifest from '../../src/content/charSprites.json';
import { PILOT_SPRITES } from '../../src/content/wardrobe';

type Pt = { x: number; y: number };
type Sp = { file: string; w: number; h: number; unit: number; origin: Pt; eyeL: Pt; eyeR: Pt; browL: Pt; browR: Pt; mouth: Pt; handL: Pt; handR: Pt; faceScale: number };
const M = manifest as unknown as Record<string, Sp>;

describe('спрайты героев', () => {
  it('у каждого героя, костюма и позы есть спрайт со всеми точками', () => {
    for (const [hero, sets] of Object.entries(PILOT_SPRITES)) for (const set of sets) for (const pose of ['stand', 'sit']) {
      const s = M[`${hero}:${set}:${pose}`];
      expect(s, `${hero}:${set}:${pose}`).toBeDefined();
      for (const k of ['origin', 'eyeL', 'eyeR', 'browL', 'browR', 'mouth', 'handL', 'handR'] as const) {
        expect(s[k].x).toBeGreaterThanOrEqual(0); expect(s[k].x).toBeLessThanOrEqual(s.w);
        expect(s[k].y).toBeGreaterThanOrEqual(0); expect(s[k].y).toBeLessThanOrEqual(s.h);
      }
      expect(s.browL.y).toBeLessThan(s.eyeL.y); expect(s.eyeL.y).toBeLessThan(s.mouth.y); expect(s.eyeL.x).toBeLessThan(s.eyeR.x);
    }
  });

  it('стоя: нижний край фигурки совпадает с опорной точкой у всех костюмов — герой не прыгает', async () => {
    for (const [key, s] of Object.entries(M)) {
      if (!key.endsWith(':stand')) continue;
      const { data, info } = await sharp(`public/assets/chars/${s.file}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let bottom = 0;
      for (let y = info.height - 1; y >= 0 && !bottom; y--) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 60) { bottom = y; break; }
      // подошва обуви — не дальше 10 единиц комнаты от опорной точки
      expect(Math.abs(bottom - s.origin.y) / s.unit, key).toBeLessThanOrEqual(10);
    }
  });

  it('сидя: точка посадки и лицо одинаковы относительно друг друга у всех костюмов героя', () => {
    for (const [hero, sets] of Object.entries(PILOT_SPRITES)) {
      const rel = sets.map((set) => { const s = M[`${hero}:${set}:sit`]; return [(s.eyeL.x - s.origin.x) / s.unit, (s.eyeL.y - s.origin.y) / s.unit]; });
      for (const r of rel) { expect(Math.abs(r[0] - rel[0][0])).toBeLessThanOrEqual(2); expect(Math.abs(r[1] - rel[0][1])).toBeLessThanOrEqual(2); } // в пределах 2 единиц комнаты
    }
  });
});
