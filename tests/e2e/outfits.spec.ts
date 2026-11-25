import { expect, test, type Page } from '@playwright/test';

const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.game.world)));
const at = (page: Page, ref: string, dy = 0) => page.evaluate(([r, d]) => { const g = window.__game; const p = g.scene.nodePos(r as string); const s = g.scene.toScreen({ x: p.x, y: p.y + (d as number) }); return [s.x, s.y] as [number, number]; }, [ref, dy] as const);
async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
  await page.waitForTimeout(50); await page.mouse.up(); await page.waitForTimeout(500);
}
const sprite = (page: Page, ref: string) => page.evaluate((r) => window.__game.scene.spriteOf(r), ref);
const spawn = (page: Page, def: string, x: number) => page.evaluate(([d, px]) => { const g = window.__game; const r = g.rules.spawnItem(g.game.world, d, { kind: 'room', roomId: g.game.world.currentRoomId, x: px, y: 850 }); g.game.commit(r); return r.info.instanceId as string; }, [def, x] as const);

test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

test('наряды: игровой Лев остаётся пластилиновым; чужой костюм не надевается и возвращается на место; свой — надевается; старое сохранение чинится', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; }));
  await page.click('#play');
  await page.evaluate(() => { const g = window.__game; g.map.enter('houses'); g.game.commit(g.rules.travel(g.game.world, 'living', ['hero_lev'])); g.game.commit(g.rules.placeCharacter(g.game.world, 'hero_lev', { x: 800, y: 820 })); g.scene.setZoom(0.1); });
  await page.waitForTimeout(600);
  expect(await sprite(page, 'hero_lev')).toContain('hero_lev_sport_stand');

  // костюм повара и костюм зверька: для Льва их нет
  for (const def of ['costume_chef', 'costume_cat']) {
    const id = await spawn(page, def, 400);
    const before = (await world(page)).items[id].owner;
    await drag(page, await at(page, id, -20), await at(page, 'hero_lev', -90));
    const w = await world(page);
    expect(w.characters.hero_lev.costume).toBe('sport');
    expect(await sprite(page, 'hero_lev')).toContain('hero_lev_sport_stand'); // не плоская фигурка
    expect(w.items[id].owner).toEqual(before);                                 // одежда вернулась туда, откуда взяли
    await expect(page.locator('.toast')).toHaveText('У этого героя пока нет такого наряда');
    await page.evaluate((i) => { const g = window.__game; g.game.commit(g.rules.moveItem(g.game.world, i, { kind: 'bag', slot: 0 })); g.game.update((x: any) => { delete x.items[i]; }); }, id);
  }
  // подсказка по-английски
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.lang = 'en'; }));
  await page.waitForTimeout(900);
  await page.reload(); await page.waitForFunction(() => !!window.__game); await page.click('#play');
  await page.evaluate(() => { const g = window.__game; g.map.enter('houses'); g.scene.setZoom(0.1); });
  await page.waitForTimeout(600);
  const cat = await spawn(page, 'costume_cat', 400);
  await drag(page, await at(page, cat, -20), await at(page, 'hero_lev', -90));
  await expect(page.locator('.toast')).toHaveText("This outfit isn't available for this character yet.");
  expect((await world(page)).characters.hero_lev.costume).toBe('sport');

  // совместимый наряд надевается перетаскиванием, сидя — тоже пластилиновый
  const astro = await spawn(page, 'costume_astronaut', 500);
  await drag(page, await at(page, astro, -20), await at(page, 'hero_lev', -90));
  expect((await world(page)).characters.hero_lev.costume).toBe('astronaut');
  expect(await sprite(page, 'hero_lev')).toContain('hero_lev_astronaut_stand');
  await page.evaluate(() => { const g = window.__game; const w = g.game.world; const f = (Object.values(w.furniture) as any[]).find((x) => x.roomId === 'living' && x.definitionId === 'sofa'); g.game.commit(g.rules.placeCharacter(w, 'hero_lev', { furnitureId: f.id, slot: 0 })); });
  await page.waitForTimeout(300);
  expect((await world(page)).characters.hero_lev.pose).toBe('sitting');
  expect(await sprite(page, 'hero_lev')).toContain('hero_lev_astronaut_sit');

  // стрелки «Наряд» листают только свои наряды Льва — полный круг без плоской фигурки
  const lev = await at(page, 'hero_lev', -60);
  await page.touchscreen.tap(lev[0], lev[1]);
  await expect(page.locator('.charbar')).toBeVisible();
  const seen: string[] = [];
  for (let i = 0; i < 4; i++) { await page.click('.charbar .group button >> nth=1'); const c = (await world(page)).characters.hero_lev.costume; seen.push(c); expect(await sprite(page, 'hero_lev')).toContain(`hero_lev_${c}_sit`); }
  expect([...seen].sort()).toEqual(['astronaut', 'pajama', 'rain', 'sport']);

  // старое сохранение: Лев в костюме повара, фермер — в своём дождевике
  await page.evaluate(() => { const g = window.__game; g.game.update((w: any) => { w.schemaVersion = 8; w.characters.hero_lev.costume = 'chef'; w.characters.farm_worker_lev.costume = 'farmer_rain'; }); });
  await page.waitForTimeout(900);
  const items = Object.keys((await world(page)).items).length;
  const was = (await world(page)).characters.hero_lev;
  await page.reload(); await page.waitForFunction(() => !!window.__game); await page.click('#play');
  await page.evaluate(() => { const g = window.__game; g.map.enter('houses'); g.scene.setZoom(0.1); });
  await page.waitForTimeout(600);
  const w = await world(page);
  expect(w.schemaVersion).toBe(12);
  expect(w.characters.hero_lev.costume).toBe('sport');
  expect(w.characters.hero_lev.seat).toEqual(was.seat);
  expect(w.characters.hero_lev.roomId).toBe(was.roomId);
  expect(w.characters.farm_worker_lev.costume).toBe('farmer_rain');
  expect(Object.keys(w.items).length).toBe(items);
  expect(await sprite(page, 'hero_lev')).toContain('hero_lev_sport_sit');
});
