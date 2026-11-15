import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, room: string) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; }));
  await page.click('#play'); await page.evaluate(() => window.__game.map.enter('houses'));
  await page.evaluate((r) => { const g = window.__game; if (g.game.world.currentRoomId !== r) g.game.commit(g.rules.travel(g.game.world, r, [])); }, room);
  await page.waitForTimeout(500);
}
/** Геометрия кадра: где на экране углы комнаты и какой масштаб по осям. */
const frame = (page: Page) => page.evaluate(() => {
  const s = window.__game.scene; const c = s.app.canvas.getBoundingClientRect();
  const tl = s.toScreen({ x: 0, y: 0 }), br = s.toScreen({ x: 1600, y: 900 });
  return { vw: innerWidth, vh: innerHeight, canvas: [Math.round(c.width), Math.round(c.height)], top: Math.round(tl.y), bottom: Math.round(br.y), left: Math.round(tl.x), right: Math.round(br.x), sx: (br.x - tl.x) / 1600, sy: (br.y - tl.y) / 900, zoom: s.zoom, min: s.minZoom };
});
const roomPt = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => { const s = window.__game.scene.toScreen({ x: a, y: b }); return [s.x, s.y] as [number, number]; }, [x, y] as const);
const at = (page: Page, ref: string, dy = -40) => page.evaluate(([r, d]) => { const g = window.__game; const p = g.scene.nodePos(r as string); const s = g.scene.toScreen({ x: p.x, y: p.y + (d as number) }); return [s.x, s.y] as [number, number]; }, [ref, dy] as const);

for (const [name, vw, vh] of [['4:3', 1024, 768], ['16:9', 1280, 720]] as const) {
  test(`кадр ${name}: пол не обрезан, фон не растянут, холст по размеру экрана — «Парк → Игры», клуб, кафе, домики`, async ({ page }) => {
    await page.setViewportSize({ width: vw, height: vh });
    for (const room of ['park_games', 'club', 'cafe', 'living']) {
      await open(page, room);
      let f = await frame(page);
      expect(f.canvas).toEqual([vw, vh]); // холст — ровно видимая область
      expect(Math.abs(f.sx - f.sy)).toBeLessThan(0.001); // без растяжения
      expect(f.bottom).toBe(vh); // масштаб по умолчанию: нижний край пола у нижнего края экрана
      expect(f.top).toBeLessThanOrEqual(0); // сверху нет пустой полосы
      // отдалили до конца: комната целиком по ширине, пол по-прежнему внизу, сверху — продолжение фона, а не полоса цвета холста
      await page.evaluate(() => window.__game.scene.setZoom(0.1));
      f = await frame(page);
      expect(f.bottom).toBe(vh);
      expect(f.left).toBeGreaterThanOrEqual(0); expect(f.right).toBeLessThanOrEqual(vw + 1);
      if (f.top > 2) {
        const strip = await page.evaluate(() => { const b = (window.__game.scene as any).bgTop; const g = b.getBounds(); return { top: Math.round(g.y), bottom: Math.round(g.y + g.height), ok: !!b.texture && b.texture.source.width > 10 }; });
        expect(strip.ok).toBe(true); expect(strip.top).toBeLessThanOrEqual(0); expect(strip.bottom).toBeGreaterThanOrEqual(f.top - 1); // полоса закрыта продолжением фона
      }
      // сброс зума возвращает обычный кадр
      await page.evaluate(() => window.__game.scene.setZoom(1));
      f = await frame(page);
      expect(f.bottom).toBe(vh); expect(f.top).toBeLessThanOrEqual(0);
    }
  });
}

test('поворот планшета: кадр пересчитывается, вещь у нижнего края берётся и переносится, координаты в мире не меняются', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await open(page, 'park_games');
  const before = await page.evaluate(() => JSON.stringify(window.__game.game.world.items));
  await page.setViewportSize({ width: 1024, height: 768 }); // повернули в альбомный
  await page.waitForTimeout(1300);
  let f = await frame(page);
  expect(f.canvas).toEqual([1024, 768]);
  expect(f.bottom).toBe(768);
  expect(Math.abs(f.sx - f.sy)).toBeLessThan(0.001);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('ui')!).height)).toBe('768px'); // кнопки — в той же области
  expect(await page.evaluate(() => JSON.stringify(window.__game.game.world.items))).toBe(before); // сохранённые координаты те же
  // вещь у самого нижнего края: видна целиком и переносится
  const id = await page.evaluate(() => { const g = window.__game; const r = g.rules.spawnItem(g.game.world, 'cup', { kind: 'room', roomId: 'park_games', x: 800, y: 885 }); g.game.commit(r); return r.info.instanceId as string; });
  await page.waitForTimeout(300);
  const p = await at(page, id, -15);
  expect(p[1]).toBeLessThan(768 - 4);
  await page.mouse.move(p[0], p[1]); await page.mouse.down();
  const to = await roomPt(page, 1000, 760);
  for (let i = 1; i <= 8; i++) await page.mouse.move(p[0] + ((to[0] - p[0]) * i) / 8, p[1] + ((to[1] - p[1]) * i) / 8);
  await page.mouse.up(); await page.waitForTimeout(400);
  const o = await page.evaluate((i) => window.__game.game.world.items[i].owner, id);
  expect(o.kind).toBe('room'); expect(Math.abs(o.x - 1000)).toBeLessThan(40);
  // тап попадает туда же, куда нарисовано: зона нажатия и картинка считаются одним расчётом
  const hit = await page.evaluate((i) => { const g = window.__game; const n = g.scene.nodeOf(i); const s = g.scene.toScreen({ x: n.c.x, y: n.c.y - 15 }); return g.scene.pick(g.scene.toRoom(s.x, s.y))?.ref; }, id);
  expect(hit).toBe(id);
  // обратно в книжный и снова в альбомный — без накопления ошибки
  await page.setViewportSize({ width: 768, height: 1024 }); await page.waitForTimeout(600);
  await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(1300);
  f = await frame(page);
  expect(f.canvas).toEqual([1024, 768]); expect(f.bottom).toBe(768);
  // карта города тоже по размеру экрана
  await page.click('#tomap');
  expect(await page.evaluate(() => { const r = document.querySelector('.map')!.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })).toEqual([1024, 768]);
});
