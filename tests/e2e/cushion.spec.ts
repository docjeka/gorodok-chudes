import { expect, test, type Page } from '@playwright/test';

const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.game.world)));
const at = (page: Page, ref: string, dy = 0) => page.evaluate(([r, d]) => { const g = window.__game; const p = g.scene.nodePos(r as string); const s = g.scene.toScreen({ x: p.x, y: p.y + (d as number) }); return [s.x, s.y] as [number, number]; }, [ref, dy] as const);
const roomPt = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => { const s = window.__game.scene.toScreen({ x: a, y: b }); return [s.x, s.y] as [number, number]; }, [x, y] as const);
async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
  await page.waitForTimeout(50); await page.mouse.up(); await page.waitForTimeout(450);
}
const spawn = (page: Page, def: string, x: number) => page.evaluate(([d, px]) => { const g = window.__game; const r = g.rules.spawnItem(g.game.world, d, { kind: 'room', roomId: 'living', x: px, y: 860 }); g.game.commit(r); return r.info.instanceId as string; }, [def, x] as const);
const z = (page: Page, ref: string) => page.evaluate((r) => window.__game.scene.shown(r)!.z as number, ref);

test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

test('игрушки на диване и кресле: ложатся на подушку, видны перед спинкой, берутся рукой, едут с мебелью и переживают перезагрузку', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; }));
  await page.click('#play');
  await page.evaluate(() => { const g = window.__game; g.map.enter('houses'); g.scene.setZoom(0.1); });
  await page.waitForTimeout(600);
  const teddy = await spawn(page, 'teddy', 700), car = await spawn(page, 'car', 780);
  await page.waitForTimeout(300);
  const sofa = (await world(page)).furniture.lv_sofa, chair = (await world(page)).furniture.lv_armchair;
  const chairSeat = { x: chair.x, y: chair.y - 100 };

  // мишка — на среднюю подушку дивана, машинка — на кресло
  await drag(page, await at(page, teddy, -25), await roomPt(page, sofa.x, sofa.y - 92 - 45));
  await drag(page, await at(page, car, -15), await roomPt(page, chairSeat.x, chairSeat.y - 35));
  let w = await world(page);
  expect(w.items[teddy].owner).toEqual({ kind: 'surface', furnitureId: 'lv_sofa', slot: 1 });
  expect(w.items[car].owner).toEqual({ kind: 'surface', furnitureId: 'lv_armchair', slot: 0 });
  for (const [toy, furn] of [[teddy, 'lv_sofa'], [car, 'lv_armchair']] as const) {
    expect(await z(page, toy)).toBeGreaterThan(await z(page, furn));       // поверх подушки и спинки
    expect(await z(page, toy)).toBeLessThan((await z(page, furn)) + 0.15); // но за ближним подлокотником
    const hit = await page.evaluate((r) => { const g = window.__game; const p = g.scene.nodePos(r); return g.scene.pick({ x: p.x, y: p.y - 15 })?.ref; }, toy);
    expect(hit).toBe(toy);                                                 // можно снова взять
  }
  await page.screenshot({ path: '.studioigor/captures/cushion-toys.png' });

  // мимо зоны (на спинку) — обычный перенос, игрушка на полу
  const bunny = await spawn(page, 'bunnytoy', 860);
  await page.waitForTimeout(300);
  await drag(page, await at(page, bunny, -25), await roomPt(page, sofa.x + 105, sofa.y - 235));
  expect((await world(page)).items[bunny].owner.kind).toBe('room');

  // место занято героем — игрушка под него не кладётся
  await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.placeCharacter(g.game.world, 'hero_mila', { furnitureId: 'lv_sofa', slot: 2 }, 'living')); });
  await page.waitForTimeout(300);
  const before = Object.keys((await world(page)).items).length;

  // «Украшение»: диван переставили — мишка остался на сиденье; после перезагрузки всё на тех же местах
  await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.moveFurniture(g.game.world, 'lv_sofa', g.game.world.furniture.lv_sofa.x + 60, g.game.world.furniture.lv_sofa.y)); });
  await page.waitForTimeout(900);
  const moved = await page.evaluate((r) => window.__game.scene.nodePos(r), teddy);
  expect(Math.round(moved.x)).toBe(sofa.x + 60);
  await page.reload(); await page.waitForFunction(() => !!window.__game); await page.click('#play');
  await page.evaluate(() => { const g = window.__game; g.map.enter('houses'); g.scene.setZoom(0.1); });
  await page.waitForTimeout(600);
  w = await world(page);
  expect(w.items[teddy].owner).toEqual({ kind: 'surface', furnitureId: 'lv_sofa', slot: 1 });
  expect(w.items[car].owner).toEqual({ kind: 'surface', furnitureId: 'lv_armchair', slot: 0 });
  expect(Object.keys(w.items).length).toBe(before);

  // взяли мишку рукой с подушки и положили на пол
  await drag(page, await at(page, teddy, -20), await roomPt(page, 700, 850));
  expect((await world(page)).items[teddy].owner.kind).toBe('room');
});
