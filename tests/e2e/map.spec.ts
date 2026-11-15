import { expect, test, type Page } from '@playwright/test';

const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.game.world)));
async function open(page: Page) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; }));
  await page.click('#play');
  await expect(page.locator('.map')).toBeVisible();
}
const spot = async (page: Page, id: string) => { const p = await page.evaluate((i) => window.__game.map.screenOf(i), id); return [p!.x, p!.y] as [number, number]; };
const settled = (page: Page) => page.waitForFunction(() => !window.__game.map.turning);
async function swipe(page: Page, dx: number) {
  const [x, y] = await spot(page, 'houses');
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y);
  await page.mouse.up();
}

test.use({ viewport: { width: 1024, height: 768 } }); // экран iPad 4:3

test('«Играть» открывает планету целиком; заголовок не закрывает места; стрелки и свайпы в обе стороны переключают стороны', async ({ page }) => {
  await open(page);
  const box = await page.evaluate(() => { const f = document.querySelector('.map-frame')!.getBoundingClientRect(); const t = document.querySelector('.map-title')!.getBoundingClientRect(); const club = document.querySelector('.map-label[data-place="club"]')!.getBoundingClientRect(); return { planet: [f.left + f.width * 0.21, f.top + f.height * 0.17, f.left + f.width * 0.79, f.top + f.height * 0.985], title: t.bottom, club: club.top, vw: innerWidth, vh: innerHeight, ratio: f.width / f.height, img: (document.querySelector('.map-img.front') as HTMLImageElement).naturalWidth / (document.querySelector('.map-img.front') as HTMLImageElement).naturalHeight }; });
  expect(box.planet[0]).toBeGreaterThanOrEqual(0); expect(box.planet[1]).toBeGreaterThan(box.title - 8); expect(box.planet[2]).toBeLessThanOrEqual(box.vw); expect(box.planet[3]).toBeLessThanOrEqual(box.vh + 1); // планета не обрезана
  expect(box.club).toBeGreaterThanOrEqual(box.title); // заголовок выше метки клуба
  expect(Math.abs(box.ratio - box.img)).toBeLessThan(0.01); // рисунок не растянут
  expect(await page.evaluate(() => window.__game.map.frontPlaces())).toEqual(['houses', 'park', 'club', 'cafe', 'toys', 'beach']);
  for (const btn of ['.map-turn.right', '.map-turn.right', '.map-turn.left', '.map-turn.left']) {
    const before = await page.evaluate(() => window.__game.map.side);
    await page.click(btn); await settled(page);
    expect(await page.evaluate(() => window.__game.map.side)).not.toBe(before);
  }
  expect(await page.evaluate(() => window.__game.map.side)).toBe('front');
  await swipe(page, -220); await settled(page);
  expect(await page.evaluate(() => window.__game.map.side)).toBe('back');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.map-img.back')!).opacity)).toBe('1');
  await swipe(page, 220); await settled(page);
  expect(await page.evaluate(() => window.__game.map.side)).toBe('front');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.map-img')!).transform)).not.toContain('-1'); // без зеркала
});

test('тап открывает место, свайп — нет; на обратной стороне места не нажимаются', async ({ page }) => {
  await open(page);
  // свайп, начатый прямо на домиках, ничего не открывает
  await swipe(page, -200); await settled(page);
  await expect(page.locator('.map')).toBeVisible();
  expect(await page.evaluate(() => window.__game.map.frontPlaces())).toEqual(['farm', 'animals']); // на обороте — Ферма и Парк животных
  // обратная сторона: там, где спереди домики, тап ничего не делает
  await page.mouse.click(...(await spot(page, 'houses')));
  await page.waitForTimeout(300);
  await expect(page.locator('.map')).toBeVisible();
  expect(await page.evaluate(() => [...document.querySelectorAll('.map-zone')].filter((z) => !(z as HTMLButtonElement).disabled).map((z) => (z as HTMLElement).dataset.place))).toEqual(['farm', 'animals']);
  await page.click('.map-turn.left'); await settled(page);
  // короткое дрожание пальца (меньше порога) — всё ещё тап
  const [x, y] = await spot(page, 'houses');
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 4, y + 2); await page.mouse.up();
  await expect(page.locator('.map')).toBeHidden();
  expect((await world(page)).lastScreen).toBe('room');
});

test('«Играть → планета → Домики → На карту» не теряет комнату, вещи, подарки и наряды', async ({ page }) => {
  await open(page);
  await page.mouse.click(...(await spot(page, 'houses')));
  await expect(page.locator('.map')).toBeHidden();
  // меняем мир: другая комната, наряд, вещь в руке, открытый подарок
  await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.travel(g.game.world, 'kitchen', ['hero_mila'])); const w = g.game.world; g.game.commit(g.rules.wearSet(w, 'hero_mila', 'fairy')); const apple = (Object.values(g.game.world.items) as any[]).find((i) => i.definitionId === 'apple'); g.game.commit(g.rules.moveItem(g.game.world, apple.instanceId, { kind: 'hand', characterId: 'hero_mila', slot: 'left' })); });
  const strip = (w: any) => { const { revision, ...rest } = w; return rest; };
  const before = strip(await world(page));
  await page.click('#tomap');
  await expect(page.locator('.map')).toBeVisible();
  await page.click('.map-turn.right'); await settled(page); await page.click('.map-turn.right'); await settled(page);
  await page.mouse.click(...(await spot(page, 'houses')));
  await expect(page.locator('.map')).toBeHidden();
  expect(strip(await world(page))).toEqual(before);
  expect(before.currentRoomId).toBe('kitchen');
  // после перезапуска — то же самое
  await expect(page.locator('.save.saved')).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  expect(strip(await world(page))).toEqual(before);
  // комнаты работают как раньше: герой нажимается
  await page.click('#play'); await page.mouse.click(...(await spot(page, 'houses')));
  await expect(page.locator('.roombtn.current')).toBeVisible();
});

test('английская локаль: заголовок, места и кнопки переведены', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(async () => { window.__game.game.update((w: any) => { w.settings.tutorialDone = true; w.settings.lang = 'en'; }); await window.__game.game.flush(); });
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  await page.click('#play');
  await expect(page.locator('.map-title')).toHaveText('My town');
  await expect(page.locator('.map-label[data-place="houses"]')).toHaveText('Houses');
  await expect(page.locator('.map-label[data-place="toys"]')).toContainText('Toy shop');
  await expect(page.locator('.map-turn.left')).toHaveAttribute('aria-label', 'Rotate left');
  expect(await page.locator('.map').innerText()).not.toMatch(/map\.|place\./);
  await page.mouse.click(...(await spot(page, 'houses')));
  await expect(page.locator('#tomap')).toHaveAttribute('aria-label', 'To the map');
});

test('после установки планета открывается без сети: обе картинки в офлайн-кэше', async ({ page, context }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.waitForFunction(() => window.__game.offline.state === 'ready', null, { timeout: 60_000 });
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; }));
  await page.click('#play');
  await page.waitForFunction(() => [...document.querySelectorAll('.map-img')].every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0));
  await page.click('.map-turn.right'); await settled(page);
  await page.click('.map-turn.right'); await settled(page);
  await page.mouse.click(...(await spot(page, 'houses')));
  await expect(page.locator('.map')).toBeHidden();
});
