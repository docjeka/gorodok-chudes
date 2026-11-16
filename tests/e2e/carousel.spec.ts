import { expect, test, type Page } from '@playwright/test';

const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.game.world)));
const at = (page: Page, ref: string, dy = 0) => page.evaluate(([r, d]) => { const g = window.__game; const p = g.scene.nodePos(r as string); const s = g.scene.toScreen({ x: p.x, y: p.y + (d as number) }); return [s.x, s.y] as [number, number]; }, [ref, dy] as const);
const seatPt = (page: Page, slot: number) => page.evaluate((i) => { const g = window.__game; const f = g.game.world.furniture.pk_carousel; const p = g.geometry.seatPos(f, i); const s = g.scene.toScreen({ x: p.x, y: p.y - 70 * p.s }); return [s.x, s.y] as [number, number]; }, slot);
const roomPt = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => { const s = window.__game.scene.toScreen({ x: a, y: b }); return [s.x, s.y] as [number, number]; }, [x, y] as const);
async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
  await page.waitForTimeout(50); await page.mouse.up(); await page.waitForTimeout(400);
}
const ride = (page: Page) => page.evaluate(() => window.__game.scene.rideOf('pk_carousel'));
const sprite = (page: Page, ref: string) => page.evaluate((r) => window.__game.scene.spriteOf(r), ref);

test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

test('карусель: Мила садится верхом, тап запускает и плавно останавливает, снятие возвращает обычную позу, смена комнаты ничего не ломает', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; }));
  await page.click('#play');
  await page.evaluate(() => { const g = window.__game; g.map.enter('houses'); g.game.commit(g.rules.travel(g.game.world, 'park', ['hero_mila', 'hero_timur'])); g.scene.setZoom(0.1); });
  await page.waitForTimeout(600);
  const heroes = Object.keys((await world(page)).characters).length;

  // Мила в жёлтом платье садится перетаскиванием на свободную лошадку и получает позу верхом
  await drag(page, await at(page, 'hero_mila', -120), await seatPt(page, 0));
  let w = await world(page);
  expect(w.characters.hero_mila.seat).toEqual({ furnitureId: 'pk_carousel', slot: 0 });
  expect(await sprite(page, 'hero_mila')).toContain('summer_ride');
  const outfit = JSON.stringify(w.characters.hero_mila.outfit) + w.characters.hero_mila.costume;

  // Тимур садится на вторую лошадку: своей позы верхом у него нет, жёлтый костюм ему не подставляется
  await drag(page, await at(page, 'hero_timur', -120), await seatPt(page, 1));
  w = await world(page);
  expect(w.characters.hero_timur.seat).toEqual({ furnitureId: 'pk_carousel', slot: 1 });
  expect(await sprite(page, 'hero_timur')).toContain('timur');
  expect(await sprite(page, 'hero_timur')).not.toContain('ride');

  // тап по карусели запускает её: лошадка и Мила едут вместе
  const before = await at(page, 'hero_mila');
  const tap = await roomPt(page, 861, 150);
  await page.touchscreen.tap(tap[0], tap[1]);
  await page.waitForTimeout(2500);
  expect((await world(page)).furniture.pk_carousel.on).toBe(1);
  expect((await ride(page))!.speed).toBeGreaterThan(0);
  const moved = await at(page, 'hero_mila');
  expect(Math.hypot(moved[0] - before[0], moved[1] - before[1])).toBeGreaterThan(8);

  // на ходу: область касания едет вместе с Милой — её можно снять с лошадки, не останавливая карусель, и посадить обратно
  await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.placeCharacter(g.game.world, 'hero_timur', { x: 1300, y: 800 })); });
  await page.waitForTimeout(1500);
  await drag(page, await at(page, 'hero_mila', -30), await roomPt(page, 300, 700));
  expect((await world(page)).characters.hero_mila.seat ?? null).toBeNull();
  expect(await sprite(page, 'hero_mila')).toContain('stand');
  expect((await ride(page))!.speed).toBeGreaterThan(0);
  await drag(page, await at(page, 'hero_mila', -120), await seatPt(page, 0));
  const onHorse = (await world(page)).characters.hero_mila.seat; // ближайшая свободная лошадка — они едут
  expect(onHorse.furnitureId).toBe('pk_carousel');
  expect(await sprite(page, 'hero_mila')).toContain('summer_ride');

  // второй тап плавно останавливает
  await page.touchscreen.tap(tap[0], tap[1]);
  expect((await world(page)).furniture.pk_carousel.on).toBe(0);
  await page.waitForFunction(() => window.__game.scene.rideOf('pk_carousel')!.speed === 0, null, { timeout: 15_000 });
  const stopped = await at(page, 'hero_mila');
  await page.waitForTimeout(400);
  expect(await at(page, 'hero_mila')).toEqual(stopped);

  // другой наряд — обычная поза сидя, не жёлтая
  await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.wearSet(g.game.world, 'hero_mila', 'princess')); });
  expect(await sprite(page, 'hero_mila')).toContain('princess');
  await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.wearSet(g.game.world, 'hero_mila', 'summer')); });
  expect(await sprite(page, 'hero_mila')).toContain('summer_ride');

  // смена комнаты и возврат: Мила всё ещё верхом
  await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.travel(g.game.world, 'park_games', [])); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.travel(g.game.world, 'park', [])); });
  await page.waitForTimeout(400);
  expect((await world(page)).characters.hero_mila.seat).toEqual(onHorse);
  expect(await sprite(page, 'hero_mila')).toContain('summer_ride');

  // снимаем Милу с лошадки: обычная поза, наряд прежний, копий нет
  await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.placeCharacter(g.game.world, 'hero_timur', { x: 1300, y: 800 })); }); // чтобы ближний седок не заслонял Милу
  await page.waitForTimeout(300);
  await drag(page, await at(page, 'hero_mila', -30), await roomPt(page, 300, 700));
  w = await world(page);
  expect(w.characters.hero_mila.seat ?? null).toBeNull();
  expect(await sprite(page, 'hero_mila')).toContain('stand');
  expect(JSON.stringify(w.characters.hero_mila.outfit) + w.characters.hero_mila.costume).toBe(outfit);
  expect(Object.keys(w.characters).length).toBe(heroes);
});
