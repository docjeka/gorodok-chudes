import { expect, test, type Page } from '@playwright/test';

const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.game.world)));
const at = (page: Page, ref: string, dy = 0) => page.evaluate(([r, d]) => { const g = window.__game; const p = g.scene.nodePos(r as string); const s = g.scene.toScreen({ x: p.x, y: p.y + (d as number) }); return [s.x, s.y] as [number, number]; }, [ref, dy] as const);
const roomPt = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => { const s = window.__game.scene.toScreen({ x: a, y: b }); return [s.x, s.y] as [number, number]; }, [x, y] as const);
async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
  await page.waitForTimeout(50); await page.mouse.up(); await page.waitForTimeout(250);
}
const boot = async (page: Page) => { await page.reload(); await page.waitForFunction(() => !!window.__game); await page.click('#play'); await page.evaluate(() => window.__game.map.enter('farm')); await page.waitForTimeout(500); if (await page.locator('.travelcard').isVisible()) await page.click('.travelcard .pill:not(.plain)'); await page.waitForTimeout(300); await page.evaluate(() => { const g = window.__game; if (g.game.world.currentRoomId !== 'farm_yard') g.game.commit(g.rules.travel(g.game.world, 'farm_yard', [])); g.scene.setZoom(0.1); }); await page.waitForTimeout(600); };

test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

test('вылупление: особое яйцо в гнезде дрожит, трескается и становится цыплёнком; уход из комнаты и перезагрузка не сбрасывают и не дублируют', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; w.currentRoomId = 'farm_yard'; }));
  await page.waitForTimeout(900);
  await boot(page);
  let w = await world(page);
  const egg = (Object.values(w.items) as any[]).find((i) => i.definitionId === 'farm_egg_special').instanceId as string;
  const pets = Object.keys(w.pets).length, nest = w.furniture.fy_nest;
  const nestPt = await roomPt(page, nest.x + 30, nest.y - 14);

  // обычное яйцо по-прежнему собирается в корзинку
  const tapNest = await roomPt(page, nest.x - 20, nest.y - 20);
  await page.touchscreen.tap(tapNest[0], tapNest[1]);
  await page.waitForTimeout(400);
  expect((Object.values((await world(page)).items) as any[]).filter((i) => i.definitionId === 'farm_eggs')).toHaveLength(1);

  // кладём особое яйцо в гнездо: через полторы-три секунды оно дрожит
  await drag(page, await at(page, egg, -15), nestPt);
  expect((await world(page)).items[egg].owner).toEqual({ kind: 'surface', furnitureId: 'fy_nest', slot: 0 });
  await page.waitForFunction((e) => (window.__game.game.world.items[e]?.state.warm ?? 0) >= 1, egg, { timeout: 6000 });
  await page.screenshot({ path: '.studioigor/captures/hatch-1.png' });

  // передумали и забрали: яйцо цело, вылупление не идёт
  await drag(page, await at(page, egg, -15), await roomPt(page, 1100, 840));
  const warm = (await world(page)).items[egg].state.warm;
  await page.waitForTimeout(3500);
  w = await world(page);
  expect(w.items[egg].state.warm).toBe(warm);
  expect(Object.keys(w.pets).length).toBe(pets);

  // вернули в гнездо, вышли из комнаты и перезагрузились посреди вылупления
  await drag(page, await at(page, egg, -15), nestPt);
  await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.travel(g.game.world, 'farm_barn', [])); });
  await page.waitForTimeout(3500);
  expect((await world(page)).pets.pet_chick_hatched).toBeUndefined(); // без игрока в комнате яйцо ждёт
  await page.waitForTimeout(900);
  await boot(page);
  await page.waitForFunction(() => !!window.__game.game.world.pets.pet_chick_hatched, null, { timeout: 12_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '.studioigor/captures/hatch-2.png' });
  w = await world(page);
  expect(w.items[egg]).toBeUndefined();
  expect(Object.keys(w.pets).length).toBe(pets + 1);
  expect(w.pets.pet_chick.roomId).toBe('farm_yard');
  expect(w.pets.pet_chick_hatched).toMatchObject({ kind: 'chick', roomId: 'farm_yard' });
  expect((await page.evaluate(() => window.__game.scene.shown('pet_chick_hatched')))!.visible).toBe(true);

  // перезагрузка после вылупления: малыш один, нового яйца нет
  await page.waitForTimeout(900);
  await boot(page);
  await page.waitForTimeout(3500);
  w = await world(page);
  expect(Object.keys(w.pets).length).toBe(pets + 1);
  expect((Object.values(w.items) as any[]).filter((i) => i.definitionId === 'farm_egg_special')).toHaveLength(0);
});
