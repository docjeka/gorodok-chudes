// Эталонные листы фигурок без лица для перерисовки: npx vite-node scripts/ref-chars.ts
// Порядок на листе: костюм стоя, тот же костюм сидя, следующий костюм… (по 4 в ряд).
import sharp from 'sharp';
import { characterArt } from '../src/art/character';
import { toSvg } from '../src/art/base';
import { HERO_COSTUMES, OUTFITS, PILOT_SPRITES, PRESET_HEROES } from '../src/content/wardrobe';

const CW = 460, CH = 680;
async function sheet(name: string, cells: [string, string][]) {
  const comp = [];
  let i = 0;
  for (const [heroId, setId] of cells) for (const pose of ['standing', 'sitting'] as const) {
    const look = PRESET_HEROES.find((h) => h[0] === heroId)![2];
    const a = characterArt({ look, outfit: OUTFITS[setId].outfit, pose, emotion: 'joy', bareFace: true });
    comp.push({ input: await sharp(Buffer.from(toSvg(a, 2))).png().toBuffer(), left: (i % 4) * CW, top: Math.floor(i / 4) * CH });
    i++;
  }
  await sharp({ create: { width: 4 * CW, height: Math.ceil(i / 4) * CH, channels: 4, background: { r: 255, g: 246, b: 230, alpha: 1 } } }).composite(comp).png().toFile(`.studioigor/captures/sheets/${name}.png`);
  console.log(name, cells.map((c) => c.join(':')).join(','));
}
for (const hero of ['hero_asya', 'hero_lev', 'hero_nora', 'hero_yuki']) await sheet(`ref-${hero}`, HERO_COSTUMES[hero].map((s) => [hero, s]));
await sheet('ref-extra-mila-timur', Object.entries(HERO_COSTUMES).filter(([h]) => PILOT_SPRITES[h]).flatMap(([h, sets]) => sets.filter((s) => !PILOT_SPRITES[h].includes(s)).map((s): [string, string] => [h, s])));
