import { expect, test, type Page } from '@playwright/test';

async function start(page: Page, tutorial = false) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  if (!tutorial) await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; }));
  await page.click('#play');
  await page.waitForTimeout(700);
}
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.game.world)));
const at = (page: Page, ref: string, dy = -40) => page.evaluate(([r, d]) => { const g = window.__game; const p = g.scene.nodePos(r as string); const s = g.scene.toScreen({ x: p.x, y: p.y + (d as number) }); return [s.x, s.y] as [number, number]; }, [ref, dy] as const);
const roomPt = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => { const s = window.__game.scene.toScreen({ x: a, y: b }); return [s.x, s.y] as [number, number]; }, [x, y] as const);
const find = (page: Page, def: string, room: string) => page.evaluate(([d, r]) => (Object.values(window.__game.game.world.items) as any[]).find((i) => i.definitionId === d && i.owner.kind === 'room' && i.owner.roomId === r)?.instanceId as string, [def, room] as const);
async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
  await page.waitForTimeout(50); await page.mouse.up(); await page.waitForTimeout(300);
}
const go = (page: Page, room: string) => page.evaluate((r) => window.__game.play.goRoom(r, []), room).then(() => page.waitForTimeout(600));

test('6. мебель защищена в обычном режиме; в режиме украшения стол едет вместе с вещами, убранная мебель возвращается', async ({ page }) => {
  await start(page);
  const before = await world(page);
  await drag(page, await roomPt(page, 640, 790), await roomPt(page, 1000, 820)); // обычный режим: стол не двигается
  expect((await world(page)).furniture.lv_table.x).toBe(before.furniture.lv_table.x);
  await page.click('[data-panel="decorate"]');
  const cupPos = () => page.evaluate(() => { const g = window.__game; const cup = (Object.values(g.game.world.items) as any[]).find((i) => i.definitionId === 'cup' && i.owner.kind === 'surface' && i.owner.furnitureId === 'lv_table'); return g.scene.nodePos(cup.instanceId); });
  const cup0 = await cupPos();
  await drag(page, await roomPt(page, 640, 790), await roomPt(page, 900, 800));
  const w = await world(page);
  const dx = w.furniture.lv_table.x - before.furniture.lv_table.x;
  expect(dx).toBeGreaterThan(150);
  const cup1 = await cupPos();
  expect(Math.round(cup1.x - cup0.x)).toBe(dx); // чашка не висит в воздухе — она там же на столе
  expect(Math.round(cup1.y - cup0.y)).toBe(w.furniture.lv_table.y - before.furniture.lv_table.y);
  // за край комнаты мебель не уходит
  await drag(page, await at(page, 'lv_table', -40), [2, 880]);
  expect((await world(page)).furniture.lv_table.x).toBeGreaterThanOrEqual(100);
  // убрать и вернуть
  await page.mouse.click(...(await at(page, 'lv_table', -40)));
  await page.click('.drawer .pill:has-text("Убрать")');
  let w2 = await world(page);
  expect(w2.furniture.lv_table.roomId).toBeNull();
  expect((Object.values(w2.items) as any[]).filter((i) => i.owner.kind === 'surface' && i.owner.furnitureId === 'lv_table')).toHaveLength(0);
  expect(Object.keys(w2.items).length).toBe(Object.keys(before.items).length); // вещи со стола на полу, ничего не потеряно
  await page.click('.drawer .slot >> nth=4'); // первая из убранной мебели (после четырёх обоев)
  expect((await world(page)).furniture.lv_table.roomId).toBe('living');
  // обои
  await page.click('.drawer .slot.wall >> nth=2');
  expect((await world(page)).rooms.living.wallpaper).toBe(2);
  await page.click('.drawer .pill:has-text("Готово")');
  expect(await page.evaluate(() => window.__game.play.decorate)).toBe(false);
});

test('обучение: рука подсказывает, исчезает после успеха, пропускается и повторяется', async ({ page }) => {
  await start(page, true);
  await expect(page.locator('.tut-text')).toHaveText('Перетащи игрушку к герою');
  const ball = await find(page, 'ball', 'living');
  await drag(page, await at(page, ball, -20), await at(page, 'hero_mila', -90));
  await expect(page.locator('.tut-text')).toHaveText('Посади героя на диван');
  await drag(page, await at(page, 'hero_mila', -150), await roomPt(page, 440, 560));
  await expect(page.locator('.tutorial')).toBeHidden();
  expect((await world(page)).settings.tutorialDone).toBe(true);
  // повтор из настроек и пропуск
  await page.click('[data-panel="settings"]'); await page.click('text=Показать подсказку заново');
  await expect(page.locator('.tutorial')).toBeVisible();
  await page.click('.tut-skip');
  await expect(page.locator('.tutorial')).toBeHidden();
});

test('питомцы с характером: кот в корзине, собака несёт игрушку герою, кролик идёт за морковкой', async ({ page }) => {
  await start(page);
  const basket = await find(page, 'basket', 'living');
  await drag(page, await at(page, 'pet_cat', -50), await at(page, basket, -30));
  let w = await world(page);
  expect(w.pets.pet_cat.inItem).toBe(basket);
  // собака
  await page.evaluate(() => window.__game.game.update((x: any) => { Object.assign(x.characters.hero_lev, { roomId: 'bedroom', x: 500, y: 830 }); }));
  await go(page, 'bedroom');
  const bone = await find(page, 'bone', 'bedroom');
  await drag(page, await at(page, bone, -10), await roomPt(page, 1300, 790));
  await page.waitForTimeout(900);
  w = await world(page);
  expect(Math.abs(w.items[bone].owner.x - 590)).toBeLessThan(30); // игрушка у ног героя
  expect(Math.abs(w.pets.pet_dog.x - w.items[bone].owner.x)).toBeLessThan(120);
  // кролик
  await go(page, 'kitchen');
  const carrot = await page.evaluate(() => (Object.values(window.__game.game.world.items) as any[]).find((i) => i.definitionId === 'carrot').instanceId as string);
  await drag(page, await at(page, carrot, -10), await roomPt(page, 600, 780));
  await page.waitForTimeout(800);
  w = await world(page);
  expect(w.items[carrot].owner.kind).toBe('room');
  expect(Math.abs(w.pets.pet_rabbit.x - (w.items[carrot].owner.x - 80))).toBeLessThan(10);
  expect(w.pets.pet_rabbit.roomId).toBe('kitchen'); // питомец остаётся в комнате
});

test('книга открывается и закрывается; карточки идей — шесть подсказок без заданий', async ({ page }) => {
  await start(page);
  const book = await page.evaluate(() => (Object.values(window.__game.game.world.items) as any[]).find((i) => i.definitionId === 'book' && i.owner.furnitureId === 'lv_table').instanceId as string);
  await page.mouse.click(...(await at(page, book, -18)));
  await page.click('.itembar .pill:has-text("Читать")');
  await expect(page.locator('.book .page')).toHaveCount(2);
  await page.click('text=Дальше');
  await page.click('text=Закрыть книгу');
  await expect(page.locator('.book')).toBeHidden();
  await page.click('[data-panel="ideas"]');
  await expect(page.locator('.card.idea')).toHaveCount(6);
  await page.click('.drawer .round');
  await expect(page.locator('.drawer')).toBeHidden();
});

test('волшебная ночь: в темноте окно ночное, спящему снится то, что он держал', async ({ page }) => {
  await start(page);
  await page.evaluate(() => window.__game.game.update((w: any) => { Object.assign(w.characters.hero_mila, { roomId: 'bedroom', x: 700, y: 820 }); }));
  await go(page, 'bedroom');
  const wand = await find(page, 'wand', 'bedroom');
  await drag(page, await at(page, wand, -30), await at(page, 'hero_mila', -90));
  expect((await world(page)).characters.hero_mila.dream).toBe('wand');
  await drag(page, await at(page, 'hero_mila', -150), await roomPt(page, 230, 540));
  expect((await world(page)).characters.hero_mila.pose).toBe('sleeping');
  await page.mouse.click(...(await roomPt(page, 1040, 110)));
  const w = await world(page);
  expect(w.rooms.bedroom.lightOn).toBe(false);
  const info = await page.evaluate(() => { const s = window.__game.scene; return { glow: s.glow.children.length, window: [...s.nodes.values()].find((n: any) => n.ref === 'bd_window').key }; });
  expect(info.window).toBe('F:window_night');
  expect(info.glow).toBeGreaterThanOrEqual(4); // свечение ночника и облачко сна с картинкой
});
