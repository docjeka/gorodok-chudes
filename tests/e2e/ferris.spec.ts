import { expect, test, type Page } from '@playwright/test';

const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.game.world)));
const at = (page: Page, ref: string, dy = 0) => page.evaluate(([r, d]) => { const g = window.__game; const p = g.scene.nodePos(r as string); const s = g.scene.toScreen({ x: p.x, y: p.y + (d as number) }); return [s.x, s.y] as [number, number]; }, [ref, dy] as const);
const roomPt = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => { const s = window.__game.scene.toScreen({ x: a, y: b }); return [s.x, s.y] as [number, number]; }, [x, y] as const);
const seatPt = (page: Page, slot: number) => page.evaluate((i) => { const g = window.__game; const p = g.geometry.seatPos(g.game.world.furniture.pk_ferris, i); const s = g.scene.toScreen({ x: p.x, y: p.y - 70 * p.s }); return [s.x, s.y] as [number, number]; }, slot);
async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
  await page.waitForTimeout(50); await page.mouse.up(); await page.waitForTimeout(450);
}
const wheel = (page: Page) => page.evaluate(() => window.__game.scene.rideOf('pk_ferris'));
const on = (page: Page) => page.evaluate(() => window.__game.game.world.furniture.pk_ferris.on as number);
const HEROES = ['hero_mila', 'hero_timur', 'hero_asya', 'hero_lev', 'hero_nora', 'hero_yuki'];

test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

test('колесо обозрения: шестеро в кабинках, пуск → стоп → пуск на опоре, кабинки вертикальны, снятие на ходу, выход из парка останавливает, перезагрузка хранит места', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; }));
  await page.click('#play');
  await page.evaluate((ids) => { const g = window.__game; g.map.enter('houses'); g.game.commit(g.rules.travel(g.game.world, 'park', [])); g.game.update((w: any) => { ids.forEach((id: string, i: number) => Object.assign(w.characters[id], { roomId: 'park', x: 250 + i * 110, y: 800, seat: null, pose: 'standing' })); }); g.scene.setZoom(0.1); }, HEROES);
  await page.waitForTimeout(900);
  const heroes = Object.keys((await world(page)).characters).length;
  const carousel = (await world(page)).furniture.pk_carousel;
  expect((await world(page)).furniture.pk_ferris.roomId).toBe('park');

  // первого сажаем перетаскиванием, остальных — так же по очереди в свободные кабинки
  for (let i = 0; i < 6; i++) {
    await drag(page, await at(page, HEROES[i], -120), await seatPt(page, i));
    expect((await world(page)).characters[HEROES[i]].seat).toEqual({ furnitureId: 'pk_ferris', slot: i });
    expect(await page.evaluate((id) => window.__game.scene.spriteOf(id), HEROES[i])).toContain('_sit'); // свой сидячий спрайт в своём наряде
  }
  // занятое место занять нельзя
  expect(await page.evaluate(() => window.__game.rules.placeCharacter(window.__game.game.world, 'hero_iskorka', { furnitureId: 'pk_ferris', slot: 0 }, 'park').ok)).toBe(false);
  // верхняя кабинка и лица в кадре
  const tops = await page.evaluate((ids) => ids.map((id) => window.__game.scene.toScreen(window.__game.scene.nodePos(id)).y), HEROES);
  expect(Math.min(...tops)).toBeGreaterThan(40);

  // кнопка — неподвижная опора (цветок на оси): пуск → стоп → пуск; одно касание — одно действие
  const hub = await roomPt(page, 474, 404 - 191);
  await page.touchscreen.tap(hub[0], hub[1]);
  expect(await on(page)).toBe(1);
  await page.waitForTimeout(3200);
  expect((await wheel(page))!.speed).toBeGreaterThan(0);
  // кабинки не переворачиваются, ротор крутится
  const rot = await page.evaluate(() => { const g = window.__game; const ns = [...(g.scene as any).nodes.values()]; return { cab: ns.filter((n: any) => n.id.startsWith('rw:pk_ferris:c')).map((n: any) => n.c.rotation), rotor: ns.find((n: any) => n.id === 'rw:pk_ferris:rotor').c.rotation }; });
  expect(rot.cab).toEqual([0, 0, 0, 0, 0, 0]); expect(rot.rotor).not.toBe(0);
  // тап по едущей кабинке колесо не останавливает
  const cab = await page.evaluate(() => { const g = window.__game; const n = [...(g.scene as any).nodes.values()].find((x: any) => x.id === 'rw:pk_ferris:c3'); const s = g.scene.toScreen({ x: n.c.x, y: n.c.y + 104 }); return [s.x, s.y] as [number, number]; });
  await page.touchscreen.tap(cab[0], cab[1]);
  expect(await on(page)).toBe(1);
  await page.waitForTimeout(450);
  // снятие на ходу за видимую часть: колесо едет дальше, герой тот же, наряд тот же
  const costume = (await world(page)).characters.hero_timur.costume;
  await drag(page, await at(page, 'hero_timur', -30), await roomPt(page, 300, 780));
  let w = await world(page);
  expect(w.characters.hero_timur.seat ?? null).toBeNull();
  expect(w.characters.hero_timur.costume).toBe(costume);
  expect(await on(page)).toBe(1);
  expect(await page.evaluate(() => window.__game.scene.shown('hero_timur')!.scale[1])).toBeGreaterThan(0.9); // на земле — прежний размер
  expect(Object.keys(w.characters).length).toBe(heroes);
  await page.touchscreen.tap(hub[0], hub[1]);
  expect(await on(page)).toBe(0);
  await page.waitForFunction(() => window.__game.scene.rideOf('pk_ferris')!.speed === 0, null, { timeout: 8000 });
  await page.touchscreen.tap(hub[0], hub[1]);
  expect(await on(page)).toBe(1);

  // вышли из парка — колесо останавливается; места карусели и её ID прежние
  await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.travel(g.game.world, 'park_games', [])); });
  await page.waitForTimeout(400);
  expect(await on(page)).toBe(0);
  expect((await world(page)).furniture.pk_carousel).toEqual(carousel);
  await page.waitForTimeout(900);
  await page.reload(); await page.waitForFunction(() => !!window.__game); await page.click('#play');
  await page.evaluate(() => { const g = window.__game; g.map.enter('houses'); g.game.commit(g.rules.travel(g.game.world, 'park', [])); g.scene.setZoom(0.1); });
  await page.waitForTimeout(800);
  w = await world(page);
  expect(w.furniture.pk_ferris.on).toBe(0);
  expect((await wheel(page))!.speed).toBe(0);
  for (const [i, id] of HEROES.entries()) if (id !== 'hero_timur') expect(w.characters[id].seat).toEqual({ furnitureId: 'pk_ferris', slot: i });
  expect(Object.keys(w.characters).length).toBe(heroes);
});
