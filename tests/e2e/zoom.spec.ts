import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1366, height: 1024 }, hasTouch: true }); // пропорции планшета 4:3

async function start(page: Page) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; }));
  await page.click('#play');
  await page.waitForTimeout(600);
}
const cam = (page: Page) => page.evaluate(() => { const s = window.__game.scene; return { zoom: s.zoom, min: s.minZoom, viewW: s.viewW, viewH: s.viewH }; });
const touch = (page: Page, steps: [string, number, number, number][]) => page.evaluate((list) => {
  const cv = window.__game.scene.app.canvas as HTMLCanvasElement;
  for (const [type, id, x, y] of list) cv.dispatchEvent(new PointerEvent(type as string, { pointerId: id as number, pointerType: 'touch', clientX: x as number, clientY: y as number, bubbles: true, button: 0 }));
}, steps);

test('комнату можно отдалить и приблизить кнопкой и двумя пальцами; масштаб сохраняется, перенос вещей работает', async ({ page }) => {
  await start(page);
  let c = await cam(page);
  expect(c.zoom).toBe(1);
  expect(c.viewW).toBeLessThan(1600); // на экране 4:3 комната не помещается целиком
  // кнопка: показать всю комнату
  await page.click('[aria-label="Отдалить: показать всю комнату"]');
  c = await cam(page);
  expect(c.zoom).toBeCloseTo(c.min, 3);
  expect(Math.round(c.viewW)).toBe(1600);
  // вещь переносится и в отдалённом виде: координаты считаются верно
  const ball = await page.evaluate(() => (Object.values(window.__game.game.world.items) as any[]).find((i) => i.definitionId === 'ball').instanceId as string);
  const at = (ref: string, dy: number) => page.evaluate(([r, d]) => { const g = window.__game; const p = g.scene.nodePos(r as string); const s = g.scene.toScreen({ x: p.x, y: p.y + (d as number) }); return [s.x, s.y] as [number, number]; }, [ref, dy] as const);
  const from = await at(ball, -20), to = await at('hero_timur', -90);
  await page.mouse.move(...from); await page.mouse.down(); await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 4 }); await page.mouse.move(...to, { steps: 4 }); await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await page.evaluate((id) => window.__game.game.world.items[id].owner, ball)).toMatchObject({ kind: 'hand', characterId: 'hero_timur' });
  // два пальца на пустой стене: развели — приблизили
  await touch(page, [['pointerdown', 21, 600, 300], ['pointerdown', 22, 760, 300], ['pointermove', 22, 900, 300], ['pointermove', 21, 500, 300], ['pointerup', 22, 900, 300], ['pointerup', 21, 500, 300]]);
  const zoomedIn = (await cam(page)).zoom;
  expect(zoomedIn).toBeGreaterThan(c.min * 1.8);
  // свели — отдалили, но не меньше «всей комнаты»
  await touch(page, [['pointerdown', 31, 300, 300], ['pointerdown', 32, 1100, 300], ['pointermove', 32, 420, 300], ['pointerup', 32, 420, 300], ['pointerup', 31, 300, 300]]);
  c = await cam(page);
  expect(c.zoom).toBeLessThan(zoomedIn);
  expect(c.zoom).toBeGreaterThanOrEqual(c.min - 0.001);
  // жест масштаба не считается нажатием и ничего не выбирает
  expect(await page.evaluate(() => window.__game.play.selection)).toBeNull();
  // второй палец во время переноса вещи масштаб не меняет
  const before = c.zoom;
  const cup = await page.evaluate(() => (Object.values(window.__game.game.world.items) as any[]).find((i) => i.definitionId === 'cup' && i.owner.kind === 'surface').instanceId as string);
  const cp = await at(cup, -15);
  await touch(page, [['pointerdown', 41, cp[0], cp[1]], ['pointermove', 41, cp[0] + 60, cp[1] - 10], ['pointerdown', 42, cp[0] + 300, cp[1]], ['pointermove', 42, cp[0] + 500, cp[1]], ['pointerup', 42, cp[0] + 500, cp[1]], ['pointerup', 41, cp[0] + 60, cp[1] - 10]]);
  expect((await cam(page)).zoom).toBe(before);
  // масштаб сохраняется после перезапуска
  await expect(page.locator('.save.saved')).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  expect((await cam(page)).zoom).toBeCloseTo(before, 2);
});
