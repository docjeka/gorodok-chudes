import { expect, test, type Page } from '@playwright/test';

const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.game.world)));
const at = (page: Page, ref: string, dy = -40) => page.evaluate(([r, d]) => { const g = window.__game; const p = g.scene.nodePos(r as string); const s = g.scene.toScreen({ x: p.x, y: p.y + (d as number) }); return [s.x, s.y] as [number, number]; }, [ref, dy] as const);
const roomPt = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => { const s = window.__game.scene.toScreen({ x: a, y: b }); return [s.x, s.y] as [number, number]; }, [x, y] as const);
async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
  await page.waitForTimeout(50); await page.mouse.up(); await page.waitForTimeout(400);
}
async function park(page: Page) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => {
    w.settings.tutorialDone = true; w.rooms.animals.visited = true;
    w.furniture.an_tunnel.roomId = null; w.furniture.an_cushion.roomId = null; // убраны на склад, чтобы не загораживали зверей
    const put = (id: string, x: number, y: number) => Object.assign(w.pets[id], { roomId: 'animals', x, y, seat: null, sleeping: false });
    put('pet_cat', 250, 850); put('pet_dog', 430, 720); put('pet_rabbit', 1420, 700); put('pet_capybara', 1150, 860); put('pet_frenchie', 1000, 700); put('pet_wolf', 1250, 720);
    for (const it of Object.values<any>(w.items)) { if (it.definitionId === 'pet_double_bowl') it.owner = { kind: 'room', roomId: 'animals', x: 700, y: 850 }; if (it.definitionId === 'pet_food_bag') it.owner = { kind: 'room', roomId: 'animals', x: 520, y: 860 }; if (it.definitionId === 'kibble' && it.owner.roomId === 'animals') it.owner = { kind: 'room', roomId: 'animals', x: 1500, y: 860 }; if (it.definitionId === 'pet_rope_ball') it.owner = { kind: 'room', roomId: 'animals', x: 1560, y: 800 }; if (it.definitionId === 'pet_grooming_brush') it.owner = { kind: 'room', roomId: 'animals', x: 1560, y: 860 }; }
  }));
  await page.click('#play');
  await page.evaluate(() => { const g = window.__game; g.map.enter('animals'); });
  if (await page.locator('.travelcard').isVisible()) await page.click('.travelcard .pill:not(.plain)');
  await page.evaluate(() => window.__game.scene.setZoom(0.1));
  await page.waitForTimeout(600);
}
const id = (page: Page, def: string) => page.evaluate((d) => (Object.values(window.__game.game.world.items) as any[]).find((i) => i.definitionId === d && i.owner.roomId === 'animals').instanceId as string, def);

test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

test('двойная миска: корм из мешка, вода из кувшина, питомец ест, потом пьёт; унесли — порция остаётся; всё сохраняется и работает без сети', async ({ page, context }) => {
  await park(page);
  await page.waitForFunction(() => window.__game.offline.state === 'ready', null, { timeout: 60_000 });
  const bowl = await id(page, 'pet_double_bowl'), bag = await id(page, 'pet_food_bag');
  const st = async () => (await world(page)).items[bowl].state;
  const done = () => page.waitForFunction(() => !window.__game.scene.busy);
  expect(await st()).toEqual({});
  // пустая миска ничего не даёт
  await drag(page, await at(page, 'pet_frenchie', -50), await roomPt(page, 820, 850));
  await page.waitForTimeout(1800);
  expect(await st()).toEqual({});
  await drag(page, await at(page, 'pet_frenchie', -50), await roomPt(page, 1000, 700));
  // мешок — к правой половине: гранулы появились, мешок остался на месте
  const bag0 = (await world(page)).items[bag].owner;
  const right = async () => { const p = await at(page, bowl, -30); return [p[0] + 14, p[1]] as [number, number]; };
  await drag(page, await at(page, bag, -40), await right());
  await done();
  expect(await st()).toEqual({ kibble: true });
  expect((await world(page)).items[bag].owner).toEqual(bag0);
  expect(await page.evaluate((b) => !!window.__game.scene.nodeOf(b).bowlG, bowl)).toBe(true); // гранулы нарисованы слоем
  // повторно в полную половину нельзя
  await drag(page, await at(page, bag, -40), await right());
  await expect(page.locator('.toast')).toHaveText('В этой половине миски уже есть порция.');
  expect(await st()).toEqual({ kibble: true });
  // вода из кувшина — в левую половину, корм не меняется
  const pot = await page.evaluate(() => { const g = window.__game; const r = g.rules.spawnItem(g.game.world, 'teapot', { kind: 'room', roomId: 'animals', x: 380, y: 860 }); g.game.commit(r); return r.info.instanceId as string; });
  await page.waitForTimeout(300);
  await drag(page, await at(page, pot, -25), await (async () => { const p = await at(page, bowl, -30); return [p[0] - 14, p[1]] as [number, number]; })());
  await done();
  expect(await st()).toEqual({ kibble: true, water: true });
  expect((await world(page)).items[pot]).toBeDefined();
  // питомца поднесли и сразу унесли — порция остаётся
  await drag(page, await at(page, 'pet_frenchie', -50), await roomPt(page, 820, 850));
  await drag(page, await at(page, 'pet_frenchie', -50), await roomPt(page, 1100, 720));
  await page.waitForTimeout(1700);
  expect(await st()).toEqual({ kibble: true, water: true });
  // сначала ест: исчезает только корм; зверь стоит у правой половины и смотрит на неё
  await drag(page, await at(page, 'pet_frenchie', -50), await roomPt(page, 820, 850));
  let w = await world(page);
  expect(w.pets.pet_frenchie.x).toBeGreaterThan(w.items[bowl].owner.x);
  expect(w.items[bowl].state).toEqual({ kibble: true, water: true }); // пока ест — порция на месте
  await page.waitForFunction((b) => !window.__game.game.world.items[b].state.kibble, bowl, { timeout: 5000 });
  expect(await st()).toEqual({ water: true });
  // потом пьёт: питомца подносят ещё раз, он встаёт слева
  await drag(page, await at(page, 'pet_frenchie', -50), await roomPt(page, 1100, 720));
  await drag(page, await at(page, 'pet_frenchie', -50), await roomPt(page, 820, 850));
  await page.waitForFunction((b) => !window.__game.game.world.items[b].state.water, bowl, { timeout: 5000 });
  w = await world(page);
  expect(w.pets.pet_frenchie.x).toBeLessThan(w.items[bowl].owner.x);
  expect(w.items[bowl].state).toEqual({});
  expect(w.items[bowl].owner).toMatchObject({ kind: 'room', x: 700, y: 850 }); // миска на месте
  // снова наполняем обе половины; вода — из стакана, он пустеет
  await drag(page, await at(page, 'pet_frenchie', -50), await roomPt(page, 1000, 700));
  await drag(page, await at(page, bag, -40), await right());
  await done();
  const glass = await page.evaluate(() => { const g = window.__game; const r = g.rules.spawnItem(g.game.world, 'glass', { kind: 'room', roomId: 'animals', x: 300, y: 800 }); g.game.commit(r); g.game.commit(g.rules.fill(g.game.world, r.info.instanceId, 'water')); return r.info.instanceId as string; });
  await page.waitForTimeout(300);
  await drag(page, await at(page, glass, -20), await (async () => { const p = await at(page, bowl, -30); return [p[0] - 14, p[1]] as [number, number]; })());
  await done();
  w = await world(page);
  expect(w.items[bowl].state).toEqual({ kibble: true, water: true });
  expect(w.items[glass].state.contents).toBeUndefined();
  expect(Object.values<any>(w.items).filter((i) => i.definitionId === 'pet_double_bowl')).toHaveLength(1);
  // другая комната и перезапуск без сети: содержимое миски то же
  await expect(page.locator('.save.saved')).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  expect((await world(page)).items[bowl].state).toEqual({ kibble: true, water: true });
  await page.click('#play'); await page.evaluate(() => window.__game.map.enter('animals'));
  await page.waitForFunction((b) => !!window.__game.scene.nodeOf(b)?.bowlG, bowl);
});

test('голоса питомцев: шесть разных, только по тапу, не чаще раза в пару секунд, спящий молчит, перенос молчит', async ({ page }) => {
  await park(page);
  const log = () => page.evaluate(() => window.__game.play.petVoiceLog.slice());
  const pets = ['pet_cat', 'pet_dog', 'pet_frenchie', 'pet_wolf', 'pet_capybara', 'pet_rabbit'];
  await page.mouse.click(...(await roomPt(page, 800, 140))); // первое касание включает звук и подгружает записи
  await page.waitForFunction(() => window.__game.audio.animalsReady, null, { timeout: 20_000 });
  for (const p of pets) { await page.mouse.click(...(await at(page, p, -45))); await page.waitForTimeout(p === 'pet_wolf' ? 5000 : 3000); } // пауза не короче самой записи
  expect(await log()).toEqual(['meow', 'woof', 'frenchie', 'howl', 'whistle', 'sniff']);
  // звучат настоящие записи, у каждого вида своя; синтетикой не подменяются
  expect(await page.evaluate(() => window.__game.audio.animalLog.slice())).toEqual(['cat', 'dog', 'frenchie', 'wolf', 'capybara', 'rabbit']);
  expect(await page.evaluate(() => window.__game.audio.running)).toBe(true); // звук идёт через общий движок после «Играть»
  // второй тап сразу — пауза ещё не прошла
  await page.mouse.click(...(await at(page, 'pet_cat', -45)));
  await page.mouse.click(...(await at(page, 'pet_dog', -45)));
  expect(await log()).toHaveLength(7);
  await page.waitForTimeout(2400);
  // перенос питомца — без голоса
  await drag(page, await at(page, 'pet_wolf', -50), await roomPt(page, 900, 850));
  expect(await log()).toHaveLength(7);
  // спящий зверь: тап будит, но голоса нет
  await page.evaluate(() => window.__game.game.update((w: any) => { w.pets.pet_cat.sleeping = true; }));
  await page.waitForTimeout(300);
  await page.mouse.click(...(await at(page, 'pet_cat', -30)));
  expect(await log()).toHaveLength(7);
  expect((await world(page)).pets.pet_cat.sleeping).toBe(false);
  // общая кнопка звука выключает и их
  await page.click('[aria-label="Звук"]');
  expect(await page.evaluate(() => window.__game.audio.running)).toBe(false);
});
