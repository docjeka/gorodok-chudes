import { expect, test, type Page } from '@playwright/test';

const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.game.world)));
const at = (page: Page, ref: string, dy = 0) => page.evaluate(([r, d]) => { const g = window.__game; const p = g.scene.nodePos(r as string); const s = g.scene.toScreen({ x: p.x, y: p.y + (d as number) }); return [s.x, s.y] as [number, number]; }, [ref, dy] as const);
const roomPt = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => { const s = window.__game.scene.toScreen({ x: a, y: b }); return [s.x, s.y] as [number, number]; }, [x, y] as const);
async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
  await page.waitForTimeout(50); await page.mouse.up(); await page.waitForTimeout(450);
}
const sprite = (page: Page, ref: string) => page.evaluate((r) => window.__game.scene.spriteOf(r), ref);
const go = (page: Page, room: string, who: string[] = []) => page.evaluate(([r, w]) => { const g = window.__game; g.game.commit(g.rules.travel(g.game.world, r, w)); g.scene.setZoom(0.1); }, [room, who] as const);

test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

test('Лиза: за прилавком кафе, приветствие, кекс на тарелке; её можно забрать, переодеть, посадить; после перезагрузки она там, где оставили. Искорка: четыре наряда', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; }));
  await page.click('#play');
  await page.evaluate(() => window.__game.map.enter('houses'));
  await go(page, 'cafe');
  await page.waitForTimeout(900);
  let w = await world(page);
  const heroes = Object.keys(w.characters).length;
  expect(w.characters.npc_liza.seat).toEqual({ furnitureId: 'cf_counter', slot: 0 });
  expect(await sprite(page, 'npc_liza')).toContain('npc_liza_liza_work_stand'); // пластилиновая, не заглушка
  const s = (await page.evaluate(() => window.__game.scene.shown('npc_liza')))!;
  expect(s.drawn && s.visible).toBe(true);

  // тап: улыбается и говорит свою фразу
  const face = await at(page, 'npc_liza', -215);
  await page.touchscreen.tap(face[0], face[1]);
  await expect(page.locator('.bubble')).toHaveText('Привет! Что тебе подать?');
  expect((await world(page)).characters.npc_liza.emotion).toBe('joy');
  expect(await page.evaluate(() => window.__game.talk.log.at(-1).lineId)).toBe('liza1');
  await page.waitForTimeout(2600);

  // кекс на прилавок — тот же кекс на тарелке, без копий; его можно забрать
  const cup = await page.evaluate(() => { const g = window.__game; const r = g.rules.spawnItem(g.game.world, 'cupcake', { kind: 'room', roomId: 'cafe', x: 400, y: 850 }); g.game.commit(r); return r.info.instanceId as string; });
  const items = Object.keys((await world(page)).items).length;
  await page.waitForTimeout(300);
  await drag(page, await at(page, cup, -15), await roomPt(page, 950, 425));
  w = await world(page);
  expect(w.items[cup].owner).toMatchObject({ kind: 'surface', furnitureId: 'cf_sill' });
  expect(w.items[cup].state.plated).toBe(true);
  expect(Object.keys(w.items).length).toBe(items);
  await drag(page, await at(page, cup, -15), await roomPt(page, 400, 850));
  expect((await world(page)).items[cup].owner.kind).toBe('room');

  // Лизу берут из-за прилавка пальцем, хотя ноги закрыты
  await drag(page, await at(page, 'npc_liza', -215), await roomPt(page, 1100, 700));
  w = await world(page);
  expect(w.characters.npc_liza.seat ?? null).toBeNull();
  expect(w.characters.npc_liza.roomId).toBe('cafe');
  // и ставят обратно
  await drag(page, await at(page, 'npc_liza', -160), await roomPt(page, 780, 440 + 152 - 120));
  expect((await world(page)).characters.npc_liza.seat).toEqual({ furnitureId: 'cf_counter', slot: 0 });

  // в клуб, переодеть в каждый наряд; чужой костюм не надевается
  await go(page, 'club', ['npc_liza', 'hero_iskorka']);
  await page.waitForTimeout(700);
  expect((await world(page)).characters.npc_liza.roomId).toBe('club');
  for (const set of ['liza_casual', 'liza_party', 'liza_work']) {
    await page.evaluate((x) => { const g = window.__game; g.game.commit(g.rules.wearSet(g.game.world, 'npc_liza', x)); }, set);
    await page.waitForFunction((x) => window.__game.scene.spriteOf('npc_liza').includes(`npc_liza_${x}_stand`), set);
  }
  expect(await page.evaluate(() => window.__game.rules.wearSet(window.__game.game.world, 'npc_liza', 'chef').ok)).toBe(false);
  for (const set of ['iskorka_pajama', 'iskorka_rain', 'iskorka_cosmic', 'emerald_party']) {
    await page.evaluate((x) => { const g = window.__game; g.game.commit(g.rules.wearSet(g.game.world, 'hero_iskorka', x)); }, set);
    await page.waitForFunction((x) => window.__game.scene.spriteOf('hero_iskorka').includes(`hero_iskorka_${x}_stand`), set);
  }

  // домой, на кресло, перезагрузка
  await go(page, 'living', ['npc_liza', 'hero_iskorka']);
  await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.wearSet(g.game.world, 'npc_liza', 'liza_party')); g.game.commit(g.rules.placeCharacter(g.game.world, 'npc_liza', { furnitureId: 'lv_armchair', slot: 0 })); g.game.commit(g.rules.placeCharacter(g.game.world, 'hero_iskorka', { furnitureId: 'lv_sofa', slot: 1 })); g.game.commit(g.rules.wearSet(g.game.world, 'hero_iskorka', 'iskorka_cosmic')); });
  await page.waitForTimeout(900);
  expect(await sprite(page, 'npc_liza')).toContain('npc_liza_liza_party_sit');
  expect(await sprite(page, 'hero_iskorka')).toContain('hero_iskorka_iskorka_cosmic_sit');
  await page.reload(); await page.waitForFunction(() => !!window.__game); await page.click('#play');
  await page.evaluate(() => window.__game.map.enter('houses'));
  await page.waitForTimeout(700);
  w = await world(page);
  expect(w.characters.npc_liza).toMatchObject({ roomId: 'living', costume: 'liza_party', seat: { furnitureId: 'lv_armchair', slot: 0 } });
  expect(w.characters.hero_iskorka).toMatchObject({ roomId: 'living', costume: 'iskorka_cosmic' });
  expect(Object.keys(w.characters).length).toBe(heroes);
  expect((Object.values(w.characters) as any[]).filter((c) => c.roomId === 'cafe')).toHaveLength(0); // в кафе нет второй Лизы
});
