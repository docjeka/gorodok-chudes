import { expect, test, type Page } from '@playwright/test';

const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.game.world)));
const music = (page: Page) => page.evaluate(() => window.__game.audio.musicState());
const at = (page: Page, ref: string, dy = -40) => page.evaluate(([r, d]) => { const g = window.__game; const p = g.scene.nodePos(r as string); const s = g.scene.toScreen({ x: p.x, y: p.y + (d as number) }); return [s.x, s.y] as [number, number]; }, [ref, dy] as const);
const roomPt = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => { const s = window.__game.scene.toScreen({ x: a, y: b }); return [s.x, s.y] as [number, number]; }, [x, y] as const);
const spot = async (page: Page, id: string) => { const p = await page.evaluate((i) => window.__game.map.screenOf(i), id); return [p!.x, p!.y] as [number, number]; };
async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
  await page.waitForTimeout(50); await page.mouse.up(); await page.waitForTimeout(400);
}
async function open(page: Page) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; }));
  await page.click('#play');
  await expect(page.locator('.map')).toBeVisible();
}
/** С карты в место; если спрашивают, кого взять, — идём без героев. */
async function enter(page: Page, place: string) {
  await page.mouse.click(...(await spot(page, place)));
  await expect(page.locator('.map')).toBeHidden();
  if (await page.locator('.travelcard').isVisible()) await page.click('.travelcard .pill:not(.plain)');
  await page.evaluate(() => window.__game.scene.setZoom(0.1));
  await page.waitForTimeout(500);
}
const itemIn = (page: Page, def: string, furn: string) => page.evaluate(([d, f]) => (Object.values(window.__game.game.world.items) as any[]).find((i) => i.definitionId === d && i.owner.furnitureId === f)?.instanceId as string, [def, furn] as const);

test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

test('магазин игрушек и мастерская: у каждого экрана своя раскладка, вещи остаются на местах после переходов и перезапуска', async ({ page }) => {
  await open(page);
  await enter(page, 'toys');
  expect((await world(page)).currentRoomId).toBe('toys');
  await expect(page.locator('.roombtn')).toHaveCount(2);
  await expect(page.locator('.roombtn.current')).toHaveText('Магазин игрушек');
  // мишка с нарисованной полки — на пол
  const teddy = await itemIn(page, 'teddy', 'ty_left');
  await drag(page, await at(page, teddy, -25), await roomPt(page, 800, 800));
  expect((await world(page)).items[teddy].owner).toMatchObject({ kind: 'room', roomId: 'toys' });
  // машинка — на другую полку (правый шкаф)
  const car = await itemIn(page, 'car', 'ty_left');
  const slot = await page.evaluate(() => { const g = window.__game; const f = g.game.world.furniture.ty_right; return { x: f.x - 120 + 4 * 60, y: f.y - 191 }; });
  await drag(page, await at(page, car, -15), await roomPt(page, slot.x, slot.y - 18));
  expect((await world(page)).items[car].owner).toMatchObject({ kind: 'surface', furnitureId: 'ty_right', slot: 4 });
  // дверь во второй экран и обратно
  await page.click('.roombtn:has-text("Мастерская подарков")');
  await page.waitForTimeout(500);
  expect((await world(page)).currentRoomId).toBe('toys_workshop');
  const crown = await itemIn(page, 'crown', 'tw_bench');
  await drag(page, await at(page, crown, -12), await roomPt(page, 900, 820));
  await page.click('.roombtn:has-text("Магазин игрушек")');
  await page.waitForTimeout(400);
  await expect(page.locator('.save.saved')).toBeVisible();
  const before = await world(page);
  // на карту, в домики и обратно, потом перезапуск
  await page.click('#tomap'); await enter(page, 'houses');
  expect((await world(page)).currentRoomId).toBe('living');
  await page.click('#tomap'); await enter(page, 'toys');
  await expect(page.locator('.save.saved')).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  const after = await world(page);
  for (const id of [teddy, car, crown]) expect(after.items[id].owner).toEqual(before.items[id].owner);
  expect(after.items[crown].owner).toMatchObject({ kind: 'room', roomId: 'toys_workshop' });
  expect(Object.keys(after.items).length).toBe(Object.keys(before.items).length);
});

test('все локации открываются с карты, у каждой второй экран с подписью на двух языках', async ({ page }) => {
  await open(page);
  const pairs: [string, string, string, string][] = [['park', 'park', 'Игры', 'park_games'], ['cafe', 'cafe', 'Пекарня', 'cafe_bakery'], ['beach', 'beach', 'Лодочная', 'beach_boats'], ['toys', 'toys', 'Мастерская подарков', 'toys_workshop']];
  for (const [place, room, second, secondId] of pairs) {
    await enter(page, place);
    expect((await world(page)).currentRoomId).toBe(room);
    await page.click(`.roombtn:has-text("${second}")`);
    await page.waitForTimeout(400);
    expect((await world(page)).currentRoomId).toBe(secondId);
    expect(await page.evaluate(() => window.__game.scene.stats().nodes)).toBeGreaterThan(0);
    await page.click('#tomap');
  }
  // домики не изменились: те же четыре комнаты
  await enter(page, 'houses');
  await expect(page.locator('.roombtn')).toHaveCount(4);
  await page.evaluate(async () => { window.__game.game.update((w: any) => { w.settings.lang = 'en'; }); await window.__game.game.flush(); });
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  await page.click('#play'); await enter(page, 'beach');
  await expect(page.locator('.roombtn').nth(1)).toHaveText('Boathouse');
  await expect(page.locator('.roombtn').nth(0)).toHaveText('Beach');
});

test('клуб: герои ждут при первом входе; музыку включает только герой за пультом — одна копия, уход и выключение звука её гасят', async ({ page }) => {
  await open(page);
  await page.waitForFunction(() => window.__game.audio.musicState().town, null, { timeout: 20_000 }); // фон заиграл после «Играть»
  const heroes0 = Object.keys((await world(page)).characters).length;
  await enter(page, 'club');
  let w = await world(page);
  expect(w.currentRoomId).toBe('club');
  const inClub = Object.values<any>(w.characters).filter((c) => c.roomId === 'club');
  expect(inClub).toHaveLength(3);
  expect(inClub.every((c) => c.seat === null)).toBe(true); // у пульта, но не за ним
  expect(Object.keys(w.characters).length).toBe(heroes0); // копий нет
  await page.waitForFunction(() => window.__game.audio.musicState().loaded[1], null, { timeout: 20_000 });
  expect((await music(page)).club).toBe(false); // вход в клуб музыку не включает
  expect((await music(page)).town).toBe(true);
  const [a, b] = inClub.map((c) => c.id as string);
  // промах: отпустили героя на танцполе
  await drag(page, await at(page, a, -120), await roomPt(page, 300, 840));
  expect((await music(page)).club).toBe(false);
  // за пульт
  const dj = await roomPt(page, 800, 700 - 62 - 120 + 110);
  await drag(page, await at(page, a, -120), dj);
  w = await world(page);
  expect(w.characters[a].seat).toMatchObject({ furnitureId: 'cl_dj' });
  expect(w.characters[a].pose).toBe('standing');
  await page.waitForFunction(() => { const m = window.__game.audio.musicState(); return m.club && !m.town; });
  // второй герой рядом и разговоры — трек по-прежнему один
  await drag(page, await at(page, b, -120), await roomPt(page, 560, 830));
  let m = await music(page);
  expect(m.clubStarts).toBe(1); expect(m.clubSources).toBe(1);
  // героя убрали — трек стихает, фон продолжается (без второй копии фона)
  await drag(page, await at(page, a, -150), await roomPt(page, 1200, 840));
  expect((await world(page)).characters[a].seat).toBeNull();
  await page.waitForFunction(() => { const s = window.__game.audio.musicState(); return !s.club && s.town; });
  await page.waitForTimeout(1300);
  expect((await music(page)).townSources).toBe(1);
  // снова за пульт, потом выключили звук
  await drag(page, await at(page, a, -120), dj);
  await page.waitForFunction(() => window.__game.audio.musicState().club);
  await page.click('[aria-label="Звук"]');
  await page.waitForFunction(() => !window.__game.audio.musicState().club);
  await page.click('[aria-label="Звук"]');
  await page.waitForTimeout(400);
  expect((await music(page)).club).toBe(false); // само не включается
  // пересадили за пульт заново и ушли на карту
  await drag(page, await at(page, a, -150), await roomPt(page, 1200, 840));
  await drag(page, await at(page, a, -120), dj);
  await page.waitForFunction(() => window.__game.audio.musicState().club);
  await page.click('#tomap');
  await page.waitForFunction(() => { const s = window.__game.audio.musicState(); return !s.club && s.town; });
  // возвращение в клуб: герой стоит за пультом, но музыка сама не начинается, героев не переставляют
  const kept = (await world(page)).characters;
  await enter(page, 'club');
  await page.waitForTimeout(600);
  expect((await music(page)).club).toBe(false);
  expect((await world(page)).characters).toEqual(kept);
  expect((await music(page)).clubStarts).toBe(3);
});
