import { expect, test, type Page } from '@playwright/test';

const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.game.world)));
const at = (page: Page, ref: string, dy = 0, dx = 0) => page.evaluate(([r, d, e]) => { const g = window.__game; const p = g.scene.nodePos(r as string); const s = g.scene.toScreen({ x: p.x + (e as number), y: p.y + (d as number) }); return [s.x, s.y] as [number, number]; }, [ref, dy, dx] as const);
const roomPt = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => { const s = window.__game.scene.toScreen({ x: a, y: b }); return [s.x, s.y] as [number, number]; }, [x, y] as const);
const shown = (page: Page, ref: string) => page.evaluate((r) => window.__game.scene.shown(r), ref);

test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

test('карман кенгуру: посадить → подпрыгнуть → достать за голову → посадить снова → перезагрузить', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => {
    w.settings.tutorialDone = true; w.currentRoomId = 'farm_pen';
    for (const p of Object.values<any>(w.pets)) { if (p.kind === 'kangaroo') Object.assign(p, { x: 900, y: 800, flipped: false }); if (p.kind === 'joey') Object.assign(p, { x: 500, y: 820 }); }
  }));
  await page.waitForTimeout(900);
  const boot = async () => { await page.reload(); await page.waitForFunction(() => !!window.__game); await page.click('#play'); await page.evaluate(() => { const g = window.__game; g.map.enter('farm'); g.scene.setZoom(0.1); }); await page.waitForTimeout(700); if (await page.locator('.travelcard').isVisible()) await page.click('.travelcard .pill:not(.plain)'); await page.evaluate(() => { const g = window.__game; if (g.game.world.currentRoomId !== 'farm_pen') g.game.commit(g.rules.travel(g.game.world, 'farm_pen', [])); g.scene.setZoom(0.1); }); await page.waitForTimeout(700); };
  await boot();
  let w = await world(page);
  const adult = (Object.values(w.pets) as any[]).find((p) => p.kind === 'kangaroo').id as string, joey = (Object.values(w.pets) as any[]).find((p) => p.kind === 'joey').id as string;
  const pets = Object.keys(w.pets).length;

  // тянем палец: touch-события через CDP
  const cdp = await page.context().newCDPSession(page);
  const touchDrag = async (from: [number, number], to: [number, number], hover?: () => Promise<void>) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1] }] });
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from[0] + ((to[0] - from[0]) * i) / 10, y: from[1] + ((to[1] - from[1]) * i) / 10 }] }); await page.waitForTimeout(20); }
    if (hover) await hover();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(500);
  };
  const seat = async () => touchDrag(await at(page, joey, -60), await at(page, adult, -70), async () => {
    // пока малыш над взрослым — карман подсвечен
    const hl = await page.evaluate(() => (window.__game.scene as any).hlTarget);
    const a = await page.evaluate((r) => window.__game.scene.nodePos(r), adult);
    expect(hl).not.toBeNull();
    expect(Math.abs(hl.x - (a.x - 5))).toBeLessThan(2);
  });

  // посадить
  await seat();
  w = await world(page);
  expect(w.pets[joey].carriedBy).toBe(adult);
  expect(await shown(page, joey)).toBeNull();                       // отдельной фигурки малыша нет
  const withJoey = (await shown(page, adult))!;
  expect(withJoey.key).toContain('kangaroo_pouch');                   // один общий спрайт
  expect(withJoey.drawn && withJoey.visible).toBe(true);
  const feet = await page.evaluate((r) => window.__game.scene.nodePos(r), adult);
  expect([Math.round(feet.x), Math.round(feet.y)]).toEqual([900, 800]); // опора лап на месте
  await page.waitForTimeout(1800);
  await page.screenshot({ path: '.studioigor/captures/pouch.png' });

  // подпрыгнуть: тап по взрослому, малыш едет вместе с ним, зона захвата — тоже
  const body = await at(page, adult, -150, 40);
  await page.touchscreen.tap(body[0], body[1]);
  let top = 0;
  for (let i = 0; i < 12; i++) { await page.waitForTimeout(40); const p = await page.evaluate((r) => window.__game.scene.nodePos(r), adult); top = Math.max(top, 800 - p.y); const hit = await page.evaluate((r) => { const g = window.__game; const q = g.scene.nodePos(r); return g.scene.pick({ x: q.x - 5, y: q.y - 70 })?.ref; }, adult); expect(hit).toBe(joey); }
  expect(top).toBeGreaterThan(10);
  expect((await world(page)).pets[joey].carriedBy).toBe(adult);
  await page.waitForTimeout(1800);

  // отменённый жест: малыш остаётся в кармане
  const head = await at(page, adult, -70, -5);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: head[0], y: head[1] }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: head[0] - i * 25, y: head[1] }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForTimeout(400);
  expect((await world(page)).pets[joey].carriedBy).toBe(adult);
  expect(await shown(page, joey)).toBeNull();
  expect((await shown(page, adult))!.key).toContain('kangaroo_pouch');

  // достать за голову и отпустить на землю
  await touchDrag(await at(page, adult, -70, -5), await roomPt(page, 450, 760));
  w = await world(page);
  expect(w.pets[joey].carriedBy).toBeUndefined();
  expect(w.pets[joey].roomId).toBe('farm_pen');
  expect((await shown(page, joey))!.visible).toBe(true);
  expect((await shown(page, adult))!.key).not.toContain('pouch');

  // другой зверь и вещь в карман не садятся: сено над взрослым — это кормление, а не карман
  const none = await page.evaluate((a) => { const g = window.__game; const w = g.game.world; const p = w.pets[a]; return (Object.values(w.pets) as any[]).filter((x) => x.carriedBy).length; }, adult);
  expect(none).toBe(0);

  // посадить снова и перезагрузить
  await seat();
  expect((await world(page)).pets[joey].carriedBy).toBe(adult);
  await page.waitForTimeout(900);
  await boot();
  w = await world(page);
  expect(w.pets[joey].carriedBy).toBe(adult);
  expect(Object.keys(w.pets).length).toBe(pets);
  expect(await shown(page, joey)).toBeNull();
  expect((await shown(page, adult))!.key).toContain('kangaroo_pouch');
});
