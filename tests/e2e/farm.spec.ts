import { expect, test, type Page } from '@playwright/test';

const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.game.world)));
const at = (page: Page, ref: string, dy = -40) => page.evaluate(([r, d]) => { const g = window.__game; const p = g.scene.nodePos(r as string); const s = g.scene.toScreen({ x: p.x, y: p.y + (d as number) }); return [s.x, s.y] as [number, number]; }, [ref, dy] as const);
const roomPt = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => { const s = window.__game.scene.toScreen({ x: a, y: b }); return [s.x, s.y] as [number, number]; }, [x, y] as const);
async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
  await page.waitForTimeout(50); await page.mouse.up(); await page.waitForTimeout(400);
}
const item = (page: Page, def: string) => page.evaluate((d) => (Object.values(window.__game.game.world.items) as any[]).find((i) => i.definitionId === d)?.instanceId as string, def);
const idle = (page: Page) => page.waitForFunction(() => !window.__game.scene.busy);
const far = (page: Page) => page.evaluate(() => window.__game.scene.setZoom(0.1));

test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

test('ферма: двор и амбар с животными, кормление, яйцо, полив; зверя нельзя увезти; после перезапуска без сети всё на месте', async ({ page, context }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; }));
  await page.waitForFunction(() => window.__game.offline.state === 'ready', null, { timeout: 60_000 });
  await page.click('#play');
  await page.click('.map-turn.right'); await page.waitForFunction(() => !window.__game.map.turning);
  expect(await page.evaluate(() => window.__game.map.frontPlaces().sort())).toEqual(['animals', 'farm']);
  const p = await page.evaluate(() => window.__game.map.screenOf('farm'));
  await page.mouse.click(p!.x, p!.y);
  await expect(page.locator('.map')).toBeHidden();
  if (await page.locator('.travelcard').isVisible()) await page.click('.travelcard .pill:not(.plain)');
  let w = await world(page);
  expect(w.currentRoomId).toBe('farm_yard');
  await expect(page.locator('.roombtn')).toHaveCount(2);
  await expect(page.locator('.roombtn.current')).toHaveText('Двор');
  const where = (x: any) => Object.fromEntries(Object.values<any>(x.pets).filter((q) => q.id.match(/hen|chick|pony|cow|sheep|pig|goat/)).map((q) => [q.id, q.roomId]));
  expect(where(w)).toEqual({ pet_hen: 'farm_yard', pet_chick: 'farm_yard', pet_pony: 'farm_yard', pet_cow: 'farm_barn', pet_sheep: 'farm_barn', pet_pig: 'farm_barn', pet_goat: 'farm_barn' });
  // кадр 4:3 без полосы и обрезанного пола
  const frame = () => page.evaluate(() => { const s = window.__game.scene; return [Math.round(s.toScreen({ x: 0, y: 900 }).y), Math.round(s.toScreen({ x: 0, y: 0 }).y)]; });
  expect((await frame())[0]).toBe(768); expect((await frame())[1]).toBeLessThanOrEqual(0);
  await far(page); await page.waitForTimeout(400);
  // голоса: у каждого свой, перенос молчит
  const voices = () => page.evaluate(() => window.__game.play.petVoiceLog.slice());
  for (const id of ['pet_hen', 'pet_chick', 'pet_pony']) { await page.mouse.click(...(await at(page, id, -30))); await page.waitForTimeout(2350); }
  expect(await voices()).toEqual(['cluck', 'peep', 'neigh']);
  await drag(page, await at(page, 'pet_pony', -60), await roomPt(page, 1250, 760));
  expect(await voices()).toHaveLength(3);
  expect((await world(page)).pets.pet_pony.x).toBeGreaterThan(1150); // внутри фермы двигать можно
  // яйцо: нажали на гнездо — яйцо в корзинке; второй раз — ничего нового
  const eggs = async () => Object.values<any>((await world(page)).items).filter((i) => i.definitionId === 'farm_eggs');
  expect(await eggs()).toHaveLength(0);
  await page.mouse.click(...(await roomPt(page, 352, 378)));
  await page.waitForTimeout(400);
  let e = await eggs();
  expect(e).toHaveLength(1);
  expect(e[0].owner).toMatchObject({ kind: 'item', itemId: await item(page, 'farm_basket') });
  await page.mouse.click(...(await roomPt(page, 352, 378)));
  await expect(page.locator('.toast')).toHaveText('В гнезде пока пусто. Насыпь курочке зерна.');
  expect(await eggs()).toHaveLength(1);
  // зерно на землю, курочка ест — порция исчезает, в гнезде снова яйцо
  const grain = await item(page, 'farm_grain');
  const g0 = (await world(page)).items[grain].owner;
  await drag(page, await at(page, grain, -30), await roomPt(page, 560, 670));
  await idle(page);
  w = await world(page);
  expect(w.furniture.fy_grain.on).toBe(1);
  expect(w.items[grain].owner).toEqual(g0); // ведёрко осталось
  await drag(page, await at(page, grain, -30), await roomPt(page, 560, 670));
  await expect(page.locator('.toast')).toHaveText('Тут уже лежит порция.');
  await page.waitForTimeout(2300);
  await drag(page, await at(page, 'pet_hen', -40), await roomPt(page, 640, 720));
  await page.waitForFunction(() => window.__game.game.world.furniture.fy_grain.on === 0, null, { timeout: 6000 });
  expect((await world(page)).furniture.fy_nest.on).toBe(0); // курочка снесла новое яйцо
  // лошадку кормят сеном прямо с рук: сено остаётся
  await page.evaluate(() => { const g = window.__game; const r = g.rules.spawnItem(g.game.world, 'farm_hay', { kind: 'room', roomId: 'farm_yard', x: 900, y: 850 }); g.game.commit(r); (window as any).__hay = r.info.instanceId; });
  await page.waitForTimeout(300);
  const hay = await page.evaluate(() => (window as any).__hay as string);
  await drag(page, await at(page, hay, -30), await at(page, 'pet_pony', -70));
  await idle(page);
  expect((await world(page)).items[hay].owner).toMatchObject({ kind: 'room', roomId: 'farm_yard' });
  // полив: росток, потом цветок
  const can = await item(page, 'farm_can');
  await drag(page, await at(page, can, -20), await roomPt(page, 1177, 380)); await idle(page);
  expect((await world(page)).furniture.fy_bed1.on).toBe(1);
  await drag(page, await at(page, can, -20), await roomPt(page, 1177, 380)); await idle(page);
  expect((await world(page)).furniture.fy_bed1.on).toBe(2);
  expect((await world(page)).furniture.fy_bed2.on).toBe(0);
  // нельзя увезти: зверя тянут на кнопку карты и в сумку — он остаётся и отвечает
  const hen0 = (await world(page)).pets.pet_hen;
  const mapBtn = await page.locator('#tomap').boundingBox();
  await page.waitForTimeout(2300);
  await drag(page, await at(page, 'pet_hen', -40), [mapBtn!.x + mapBtn!.width / 2, mapBtn!.y + mapBtn!.height / 2]);
  await expect(page.locator('.toast')).toHaveText('Я живу на ферме.');
  expect((await world(page)).pets.pet_hen).toEqual(hen0);
  const bag = await page.locator('[data-panel="things"]').boundingBox();
  await drag(page, await at(page, 'pet_chick', -25), [bag!.x + bag!.width / 2, bag!.y + bag!.height / 2]);
  expect((await world(page)).pets.pet_chick.roomId).toBe('farm_yard');
  // герой уходит с фермы: в списке поездки жителей фермы нет; обычный питомец — есть
  await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.summonCharacter(g.game.world, 'hero_mila', 'farm_yard')); g.game.update((x: any) => { x.pets.pet_cat.roomId = 'farm_yard'; x.pets.pet_cat.x = 900; x.pets.pet_cat.y = 760; x.pets.pet_cat.seat = null; }); });
  await page.click('#tomap');
  await page.click('.map-turn.right'); await page.waitForFunction(() => !window.__game.map.turning);
  const h = await page.evaluate(() => window.__game.map.screenOf('houses'));
  await page.mouse.click(h!.x, h!.y);
  await expect(page.locator('.travelcard')).toBeVisible();
  expect(await page.locator('.petchip').evaluateAll((els) => els.map((x) => (x as HTMLElement).dataset.pet))).toEqual(['pet_cat']);
  await page.click('.travelcard .pill.plain'); // остаёмся
  // на уровне правил: даже прямой вызов не увозит
  const refused = await page.evaluate(() => { const g = window.__game; const r = g.rules.travel(g.game.world, 'living', [], ['pet_hen', 'pet_pony']); return [r.info?.refused, r.world.pets.pet_hen.roomId]; });
  expect(refused).toEqual([['pet_hen', 'pet_pony'], 'farm_yard']);
  // амбар: сено в кормушку, корова ест, кормушку можно наполнить снова
  await page.click('.roombtn:has-text("Амбар")');
  if (await page.locator('.travelcard').isVisible()) await page.click('.travelcard .pill:not(.plain)');
  await far(page); await page.waitForTimeout(600);
  expect((await frame())[0]).toBe(768);
  const hay2 = await page.evaluate(() => (Object.values(window.__game.game.world.items) as any[]).find((i) => i.definitionId === 'farm_hay' && i.owner.roomId === 'farm_barn').instanceId as string);
  await drag(page, await at(page, hay2, -30), await roomPt(page, 1305, 440)); await idle(page);
  expect((await world(page)).furniture.fb_trough.on).toBe(1);
  await page.mouse.click(...(await at(page, 'pet_cow', -60))); await page.waitForTimeout(300);
  expect((await voices()).at(-1)).toBe('moo');
  await page.waitForTimeout(2300);
  await drag(page, await at(page, 'pet_cow', -60), await roomPt(page, 1250, 760));
  await page.waitForFunction(() => window.__game.game.world.furniture.fb_trough.on === 0, null, { timeout: 6000 });
  await drag(page, await at(page, hay2, -30), await roomPt(page, 1305, 440)); await idle(page);
  expect((await world(page)).furniture.fb_trough.on).toBe(1);
  // перезапуск без сети: ферма та же, яйца не размножились
  await expect(page.locator('.save.saved')).toBeVisible();
  const kept = await world(page);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  w = await world(page);
  expect(w.furniture.fy_bed1.on).toBe(2); expect(w.furniture.fb_trough.on).toBe(1);
  expect(w.pets).toEqual(kept.pets);
  expect(Object.values<any>(w.items).filter((i) => i.definitionId === 'farm_eggs')).toHaveLength(1);
  await page.click('#play'); await page.evaluate(() => window.__game.map.enter('farm'));
  if (await page.locator('.travelcard').isVisible()) await page.click('.travelcard .pill:not(.plain)');
  await page.waitForFunction(() => !!window.__game.scene.nodeOf('pet_cow')?.tex || !!window.__game.scene.nodeOf('pet_hen')?.tex);
});

test('ферма на английском: экраны, место на карте и ответ животного', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(async () => { window.__game.game.update((w: any) => { w.settings.tutorialDone = true; w.settings.lang = 'en'; }); await window.__game.game.flush(); });
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  await page.click('#play');
  await expect(page.locator('.map-label[data-place="farm"]')).toHaveText('Farm');
  await page.evaluate(() => window.__game.map.enter('farm'));
  if (await page.locator('.travelcard').isVisible()) await page.click('.travelcard .pill:not(.plain)');
  await expect(page.locator('.roombtn').nth(0)).toHaveText('Yard');
  await expect(page.locator('.roombtn').nth(1)).toHaveText('Barn');
  await page.evaluate(() => window.__game.play.farmStay('pet_hen'));
  await expect(page.locator('.toast')).toHaveText('I live on the farm.');
});
