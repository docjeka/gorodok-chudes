import { expect, test, type Page } from '@playwright/test';

const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.game.world)));
const at = (page: Page, ref: string, dy = 0) => page.evaluate(([r, d]) => { const g = window.__game; const p = g.scene.nodePos(r as string); const s = g.scene.toScreen({ x: p.x, y: p.y + (d as number) }); return [s.x, s.y] as [number, number]; }, [ref, dy] as const);
const roomPt = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => { const s = window.__game.scene.toScreen({ x: a, y: b }); return [s.x, s.y] as [number, number]; }, [x, y] as const);
async function drag(page: Page, from: [number, number], to: [number, number], settle = 300) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
  await page.waitForTimeout(50); await page.mouse.up(); await page.waitForTimeout(settle);
}
const shown = (page: Page, ref: string) => page.evaluate((r) => window.__game.scene.shown(r), ref);
const pickAt = (page: Page, ref: string) => page.evaluate((r) => { const g = window.__game; const p = g.scene.nodePos(r); const t = g.scene.shown(r); const h = t.key.includes('sleep') ? 30 : 60; return g.scene.pick({ x: p.x, y: p.y - h })?.ref ?? null; }, ref);
async function seen(page: Page, ref: string, frame: string, touch = true) {
  await page.waitForFunction(([r, f]) => { const s = window.__game.scene.shown(r); return !!s && s.drawn && s.visible && s.key.includes(f); }, [ref, frame] as const, { timeout: 5000 });
  const s = (await shown(page, ref))!;
  expect(s.z).toBeGreaterThan(100); // не под фоном и не под ковриком
  if (touch) expect(await pickAt(page, ref)).toBe(ref); // реагирует на касание (пока щётка на шерсти, палец попадает в неё)
}

test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

test('расчёсывание и коврик: кот и собака остаются видимыми; щётка идёт по шерсти, её можно забрать посреди движения, она не расходуется', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => {
    w.settings.tutorialDone = true; w.rooms.animals.visited = true; w.currentRoomId = 'animals';
    Object.assign(w.pets.pet_cat, { roomId: 'animals', x: 520, y: 800, seat: null, sleeping: false, flipped: false });
    Object.assign(w.pets.pet_dog, { roomId: 'animals', x: 820, y: 720, seat: null, sleeping: false, flipped: true });
    for (const it of Object.values<any>(w.items)) if (it.definitionId === 'pet_grooming_brush') it.owner = { kind: 'room', roomId: 'animals', x: 300, y: 860 };
  }));
  await page.waitForTimeout(900);
  await page.reload(); await page.waitForFunction(() => !!window.__game);
  await page.click('#play'); await page.evaluate(() => { const g = window.__game; g.map.enter('animals'); g.scene.setZoom(0.1); });
  await page.waitForTimeout(700);
  const brush = await page.evaluate(() => (Object.values(window.__game.game.world.items) as any[]).find((i) => i.definitionId === 'pet_grooming_brush').instanceId as string);
  const home = (await world(page)).items[brush].owner;
  const pets = Object.keys((await world(page)).pets).length;
  const cushion = await roomPt(page, 1330, 780);

  for (const pet of ['pet_cat', 'pet_dog']) {
    await seen(page, pet, '_idle');
    // расчёсываем три раза подряд
    for (let i = 0; i < 3; i++) {
      await drag(page, await at(page, brush, -20), await at(page, pet, -70), 250);
      const mid = (await shown(page, brush))!;
      expect(mid.grooming).toBe(brush);                         // щётка сейчас на шерсти
      const b = await page.evaluate((r) => window.__game.scene.nodePos(r), brush), p = await page.evaluate((r) => window.__game.scene.nodePos(r), pet);
      expect(Math.abs(b.x - p.x)).toBeLessThan(120);            // у тела питомца, а не в воздухе
      expect(mid.z).toBeGreaterThan((await shown(page, pet))!.z); // поверх шерсти
      await seen(page, pet, '_happy', false);
      await page.waitForFunction((r) => window.__game.scene.shown(r).grooming === null, brush, { timeout: 5000 });
      expect((await world(page)).items[brush].owner).toEqual(home); // не израсходована, вернулась на место
    }
    await page.waitForTimeout(2600);
    await seen(page, pet, '_idle');

    // щётку забирают посреди движения
    await drag(page, await at(page, brush, -20), await at(page, pet, -70), 500);
    expect((await shown(page, brush))!.grooming).toBe(brush);
    await drag(page, await at(page, brush, -10), await roomPt(page, 300, 860), 300);
    expect((await shown(page, brush))!.grooming).toBeNull();
    await page.evaluate(([b, h]) => window.__game.game.update((w: any) => { w.items[b as string].owner = h; }), [brush, home] as const);
    await page.waitForTimeout(2600);
    await seen(page, pet, '_idle');

    // коврик: посадить → расчесать → снять
    await drag(page, await at(page, pet, -60), cushion, 500);
    expect((await world(page)).pets[pet].seat).toEqual({ furnitureId: 'an_cushion', slot: 0 });
    await seen(page, pet, '_sleep');
    await drag(page, await at(page, brush, -20), await at(page, pet, -30), 400);
    await seen(page, pet, '_happy', false);
    await page.waitForFunction((r) => window.__game.scene.shown(r).grooming === null, brush, { timeout: 5000 });

    // выйти из комнаты и вернуться
    await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.travel(g.game.world, 'living', [])); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.travel(g.game.world, 'animals', [])); });
    await page.waitForTimeout(700);
    expect((await shown(page, pet))!.visible).toBe(true);
    expect((await shown(page, pet))!.drawn).toBe(true);
    expect(await pickAt(page, pet)).toBe(pet);

    // снять с коврика перетаскиванием
    await drag(page, await at(page, pet, -40), await roomPt(page, pet === 'pet_cat' ? 520 : 820, 700), 500);
    expect((await world(page)).pets[pet].seat).toBeNull();
    await page.waitForTimeout(2600);
    await seen(page, pet, '_idle');
  }
  expect(Object.keys((await world(page)).pets).length).toBe(pets); // без копий
});
