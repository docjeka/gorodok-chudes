import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';


async function start(page: Page, click = true) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; })); // обучение проверяется отдельным сценарием
  if (click) { await page.click('#play'); await page.evaluate(() => window.__game.map.enter('houses')); await page.waitForTimeout(700); }
}
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.game.world)));
const at = (page: Page, ref: string, dy = -40) => page.evaluate(([r, d]) => { const g = window.__game; const p = g.scene.nodePos(r as string); const s = g.scene.toScreen({ x: p.x, y: p.y + (d as number) }); return [s.x, s.y] as [number, number]; }, [ref, dy] as const);
const roomPt = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => { const s = window.__game.scene.toScreen({ x: a, y: b }); return [s.x, s.y] as [number, number]; }, [x, y] as const);
const find = (page: Page, def: string, kind?: string) => page.evaluate(([d, k]) => (Object.values(window.__game.game.world.items) as any[]).find((i) => i.definitionId === d && (!k || i.owner.kind === k))?.instanceId as string, [def, kind] as const);
async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
  await page.waitForTimeout(50); await page.mouse.up(); await page.waitForTimeout(350);
}
const saved = (page: Page) => expect(page.locator('.save.saved')).toBeVisible();
async function goRoom(page: Page, name: string, heroes: string[] = []) {
  await page.click(`.roombtn:has-text("${name}")`);
  if (await page.locator('.travelcard').isVisible()) {
    for (const h of heroes) await page.click(`.herochip:has-text("${h}")`);
    await page.click('.travelcard .pill:not(.plain)');
  }
  await page.waitForTimeout(500);
}
const itemCount = async (page: Page) => Object.keys((await world(page)).items).length;

test('1. чашка в руке, герой на диване, переход в другую комнату — чашка одна и в той же руке', async ({ page }) => {
  await start(page);
  const cup = await find(page, 'cup', 'surface');
  await drag(page, await at(page, cup, -15), await at(page, 'hero_mila', -90));
  let w = await world(page);
  expect(w.items[cup].owner).toMatchObject({ kind: 'hand', characterId: 'hero_mila' });
  const slot = w.items[cup].owner.slot;
  await drag(page, await at(page, 'hero_mila', -150), await roomPt(page, 440, 560));
  expect((await world(page)).characters.hero_mila.pose).toBe('sitting');
  await goRoom(page, 'Кухня', ['Мила']);
  w = await world(page);
  expect(w.currentRoomId).toBe('kitchen');
  expect(w.characters.hero_mila.roomId).toBe('kitchen');
  expect(w.items[cup].owner).toEqual({ kind: 'hand', characterId: 'hero_mila', slot });
  expect(Object.values(w.items).filter((i: any) => i.definitionId === 'cup' && i.owner.kind === 'hand')).toHaveLength(1);
  expect(w.characters.hero_timur.roomId).toBe('living'); // остальные комнаты не сброшены
});

test('2. переодеть героя, закрыть и открыть — внешность и предметы сохранены', async ({ page }) => {
  await start(page);
  await page.mouse.click(...(await at(page, 'hero_mila', -150)));
  await page.click('[aria-label="Следующий наряд"]');
  await page.click('[aria-label="Удивление"]');
  const ball = await find(page, 'ball');
  await drag(page, await at(page, ball, -20), await at(page, 'hero_timur', -90));
  const before = await world(page);
  expect(before.characters.hero_mila.costume).toBe('princess');
  await saved(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  const after = await world(page);
  expect(after.characters.hero_mila.costume).toBe('princess');
  expect(after.characters.hero_mila.emotion).toBe('surprise');
  expect(after.items[ball].owner).toMatchObject({ kind: 'hand', characterId: 'hero_timur' });
  expect(after.lastScreen).toBe('room');
  expect(Object.keys(after.items).length).toBe(Object.keys(before.items).length);
});

test('3. игрушка в ящике: после закрытия и возвращения она внутри и не нажимается сквозь ящик', async ({ page }) => {
  await start(page);
  const ball = await find(page, 'ball');
  const boxAt = await roomPt(page, 1180, 790);
  await drag(page, await at(page, ball, -20), boxAt); // закрытый ящик сам открывается
  let w = await world(page);
  expect(w.items[ball].owner).toMatchObject({ kind: 'furniture', furnitureId: 'lv_toybox' });
  expect(w.furniture.lv_toybox.open).toBe(true);
  await page.mouse.click(...(await roomPt(page, 1180, 820))); // закрыть
  expect((await world(page)).furniture.lv_toybox.open).toBe(false);
  await goRoom(page, 'Кухня'); await goRoom(page, 'Гостиная');
  w = await world(page);
  expect(w.items[ball].owner).toMatchObject({ kind: 'furniture', furnitureId: 'lv_toybox' });
  expect(await page.evaluate((id) => window.__game.scene.nodePos(id), ball)).toBeNull(); // не нарисована → не нажимается
  const hit = await page.evaluate(() => window.__game.scene.pick({ x: 1180, y: 780 }));
  expect(hit).toMatchObject({ kind: 'furn', ref: 'lv_toybox' });
});

test('4. бутерброд: ингредиенты расходуются, порции убывают, тарелка остаётся', async ({ page }) => {
  await start(page);
  await page.mouse.click(...(await at(page, 'hero_mila', -150)));
  await goRoom(page, 'Кухня', []);
  await page.evaluate(() => window.__game.play.select(null));
  await page.mouse.click(...(await roomPt(page, 235, 420))); // открыть холодильник
  const n0 = await itemCount(page);
  for (const [i, d] of ['bread', 'cheese', 'tomato'].entries()) await drag(page, await at(page, await find(page, d), -18), await roomPt(page, 470 + i * 54, 440));
  await page.click('.cookbtn', { force: true });
  await page.waitForTimeout(300);
  let w = await world(page);
  const sandwich = (Object.values(w.items) as any[]).find((i) => i.definitionId === 'sandwich');
  expect(sandwich.state.servings).toBe(2);
  expect(Object.keys(w.items).length).toBe(n0 - 2);
  expect((Object.values(w.items) as any[]).some((i) => i.definitionId === 'bread')).toBe(false);
  for (let i = 0; i < 2; i++) { await drag(page, await at(page, sandwich.instanceId, -15), await at(page, 'hero_mila', -200)); await page.waitForFunction(() => !window.__game.scene.busy); await page.waitForTimeout(150); }
  expect((await world(page)).items[sandwich.instanceId].owner).toMatchObject({ kind: 'hand', characterId: 'hero_mila' }); // тарелка осталась в руке
  w = await world(page);
  expect(w.items[sandwich.instanceId].definitionId).toBe('plate');
  expect(w.characters.hero_mila.emotion).toBe('delight');
  expect(Object.keys(w.items).length).toBe(n0 - 2);
});

test('5. подарок открыт и страница сразу перезагружена — вещи не исчезают и не размножаются', async ({ page }) => {
  await start(page);
  const n0 = await itemCount(page);
  await page.click('[data-panel="gifts"]');
  await page.click('.giftcard >> nth=2'); // «Космос»
  await page.waitForTimeout(300);
  expect(await itemCount(page)).toBe(n0 + 6);
  const box = await page.evaluate(() => (Object.values(window.__game.game.world.items) as any[]).find((i) => i.definitionId === 'giftbox' && i.owner.roomId !== 'toys_workshop').instanceId as string);
  await page.mouse.click(...(await at(page, box, -40)));
  await page.click('.itembar .pill');
  await page.reload(); // сразу, не дожидаясь значка сохранения
  await page.waitForFunction(() => !!window.__game);
  const w = await world(page);
  expect(Object.keys(w.items).length).toBe(n0 + 5);
  expect(w.openedGiftIds).toEqual(['space']);
  expect((Object.values(w.items) as any[]).filter((i) => i.definitionId === 'giftbox' && i.owner.roomId !== 'toys_workshop')).toHaveLength(0);
  expect((Object.values(w.items) as any[]).filter((i) => i.definitionId === 'costume_astronaut' && i.owner.kind === 'room')).toHaveLength(1);
});

test('7–9. предмет за границей комнаты, отмена переноса и второй палец не ломают состояние', async ({ page }) => {
  await start(page);
  const ball = await find(page, 'ball');
  const n0 = await itemCount(page);
  await drag(page, await at(page, ball, -20), [800, -200 + 5]);
  let w = await world(page);
  expect(w.items[ball].owner.kind).toBe('room');
  expect(w.items[ball].owner.y).toBeGreaterThanOrEqual(630);
  // отмена во время переноса (как при сворачивании приложения)
  const from = await at(page, ball, -20);
  await page.mouse.move(...from); await page.mouse.down(); await page.mouse.move(from[0] + 200, from[1] - 100, { steps: 5 });
  const before = (await world(page)).items[ball].owner;
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  expect((await world(page)).items[ball].owner).toEqual(before);
  expect(await page.evaluate(() => window.__game.scene.dragging)).toBeNull();
  // второй палец во время переноса и быстрые повторы
  await page.evaluate(async (id) => {
    const g = window.__game; const cv = g.scene.app.canvas as HTMLCanvasElement;
    const p = g.scene.nodePos(id); const s = g.scene.toScreen({ x: p.x, y: p.y - 20 });
    const ev = (type: string, pid: number, x: number, y: number) => cv.dispatchEvent(new PointerEvent(type, { pointerId: pid, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: pid === 11, button: 0 }));
    for (let k = 0; k < 4; k++) {
      ev('pointerdown', 11, s.x, s.y); ev('pointermove', 11, s.x + 40, s.y);
      ev('pointerdown', 12, s.x + 5, s.y + 5); ev('pointermove', 12, s.x - 80, s.y);
      ev('pointerup', 12, s.x - 80, s.y); ev('pointermove', 11, s.x + 90, s.y); ev('pointerup', 11, s.x + 90, s.y);
    }
  }, ball);
  w = await world(page);
  expect(Object.keys(w.items).length).toBe(n0);
  expect((Object.values(w.items) as any[]).filter((i) => i.definitionId === 'ball' && i.home?.roomId === 'living')).toHaveLength(1);
  expect(await page.evaluate(() => window.__game.scene.dragging)).toBeNull();
});

test('сумка: вещь кладётся на кнопку сумки и достаётся обратно', async ({ page }) => {
  await start(page);
  const ball = await find(page, 'ball');
  const bag = await page.locator('[data-panel="things"]').boundingBox();
  await drag(page, await at(page, ball, -20), [bag!.x + bag!.width / 2, bag!.y + bag!.height / 2]);
  expect((await world(page)).items[ball].owner.kind).toBe('bag');
  await goRoom(page, 'Спальня');
  await page.click('[data-panel="things"]');
  await page.click('.slot:not(.empty)');
  const w = await world(page);
  expect(w.items[ball].owner).toMatchObject({ kind: 'room', roomId: 'bedroom' }); // сумка едет вместе с игроком
});

test('11–12. экспорт, изменение мира и импорт; переключение языка', async ({ page }) => {
  await start(page);
  await page.click('[data-panel="settings"]');
  const hold = page.locator('.hold');
  await hold.dispatchEvent('pointerdown'); await page.waitForTimeout(1700);
  await page.click('.modal .pill:not(.plain)');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=Сохранить копию мира в файл')]);
  expect(download.suggestedFilename()).toMatch(/^gorodok-chudes-\d{4}-\d\d-\d\d-\d{4}\.json$/);
  const path = await download.path();
  const exported = JSON.parse(readFileSync(path!, 'utf8'));
  // меняем мир
  await page.evaluate(() => window.__game.game.update((w: any) => { w.characters.hero_mila.name = 'Другая'; for (const id of Object.keys(w.items).slice(0, 5)) delete w.items[id]; }));
  expect((await world(page)).characters.hero_mila.name).toBe('Другая');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=Загрузить мир из файла')]);
  await chooser.setFiles(path!);
  await expect(page.locator('.toast')).toContainText('Мир загружен');
  const w = await world(page);
  expect(w.characters.hero_mila.name).toBe('Мила');
  expect(Object.keys(w.items).sort()).toEqual(Object.keys(exported.items).sort());
  expect(Object.keys(w.furniture).sort()).toEqual(Object.keys(exported.furniture).sort());
  // повреждённый файл отклоняется
  const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=Загрузить мир из файла')]);
  await chooser2.setFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":2,"items":"oops"}') });
  await expect(page.locator('.toast')).toContainText('не подходит');
  // язык
  await page.click('text=English');
  await expect(page.locator('.drawer-head h2')).toHaveText('Settings');
  await expect(page.locator('.roombtn').first()).toContainText('Living room');
  const visible = await page.evaluate(() => Array.from(document.querySelectorAll('#ui button, #ui h2, #ui h3, #ui p, #ui span')).filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.textContent ?? '').join(' '));
  expect(visible.replace(/Русский/g, '')).not.toMatch(/[А-Яа-яЁё]/);
});

test('13. двадцать переходов между комнатами не копят объекты и текстуры', async ({ page }) => {
  await start(page);
  const rooms = ['Кухня', 'Спальня', 'Ванная', 'Гостиная'];
  for (let i = 0; i < 4; i++) await goRoom(page, rooms[i]);
  const base = await page.evaluate(() => window.__game.scene.stats());
  for (let i = 0; i < 20; i++) await page.evaluate((r) => { const g = window.__game; g.play.goRoom(r, []); }, ['kitchen', 'bedroom', 'bathroom', 'living'][i % 4]);
  await page.waitForTimeout(600);
  const end = await page.evaluate(() => window.__game.scene.stats());
  expect(end.textures).toBeLessThanOrEqual(base.textures + 2);
  expect(end.nodes).toBeLessThanOrEqual(base.nodes + 2);
  expect(end.tweens).toBe(0);
});

test('15. звук выключен и анимации уменьшены — настройки переживают перезапуск', async ({ page }) => {
  await start(page);
  await page.click('[aria-label="Звук"]');
  await page.click('[data-panel="settings"]');
  await page.check('[data-setting="motion"]');
  await saved(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  const w = await world(page);
  expect(w.settings.mute).toBe(true);
  expect(w.settings.reducedMotion).toBe(true);
  expect(await page.evaluate(() => window.__game.scene.reducedMotion)).toBe(true);
});

test('10. после подготовки офлайн игра открывается без сети', async ({ page, context }) => {
  await start(page);
  await page.waitForFunction(() => window.__game.offline.state === 'ready', null, { timeout: 30_000 });
  await goRoom(page, 'Спальня');
  await saved(page);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  expect((await world(page)).currentRoomId).toBe('bedroom');
  await page.click('#play'); await page.evaluate(() => window.__game.map.enter('houses')); // после перезапуска — титульный экран, «Играть» возвращает в последнюю комнату
  for (const r of ['Кухня', 'Ванная', 'Гостиная']) await goRoom(page, r);
  await page.waitForTimeout(800);
  const failed = await page.evaluate(() => performance.getEntriesByType('resource').filter((e: any) => e.responseStatus >= 400).map((e) => e.name));
  expect(failed).toEqual([]);
  expect(await page.evaluate(() => window.__game.scene.stats().nodes)).toBeGreaterThan(8);
});

test('повреждённое сохранение не даёт белый экран: предлагается копия', async ({ page }) => {
  await start(page);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.characters.hero_mila.name = 'Копия'; }));
  await saved(page);
  await page.reload(); // исправный мир стал резервной копией
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => new Promise<void>((resolve) => { const r = indexedDB.open('gorodok-chudes', 1); r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put('{"broken":', 'world'); tx.oncomplete = () => resolve(); }; }));
  await page.evaluate(() => { window.__game.game.flush = async () => undefined; }); // чтобы уход со страницы не переписал испорченную запись
  await page.reload();
  await expect(page.locator('text=Сохранение повреждено')).toBeVisible();
  await page.click('text=Восстановить копию');
  await page.waitForFunction(() => !!window.__game);
  expect((await world(page)).characters.hero_mila.name).toBe('Копия');
});
