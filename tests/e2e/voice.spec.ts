import { expect, test, type Page } from '@playwright/test';

async function start(page: Page) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; }));
  await page.click('#play'); await page.evaluate(() => window.__game.map.enter('houses'));
  await page.waitForFunction(() => window.__game.talk.loaded >= 12, null, { timeout: 15_000 }); // все 12 реплик декодированы
  await page.waitForTimeout(500);
}
const at = (page: Page, ref: string, dy = -40) => page.evaluate(([r, d]) => { const g = window.__game; const p = g.scene.nodePos(r as string); const s = g.scene.toScreen({ x: p.x, y: p.y + (d as number) }); return [s.x, s.y] as [number, number]; }, [ref, dy] as const);
const roomPt = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => { const s = window.__game.scene.toScreen({ x: a, y: b }); return [s.x, s.y] as [number, number]; }, [x, y] as const);
async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
  await page.waitForTimeout(50); await page.mouse.up(); await page.waitForTimeout(250);
}
/** Ждёт пузырёк и возвращает его положение относительно героя — одним замером внутри страницы. */
const bubbleInfo = async (page: Page, hero: string) => (await page.waitForFunction((h) => {
  const b = document.querySelector('.bubble') as HTMLElement | null;
  const g = window.__game;
  if (!b || b.classList.contains('hidden') || g.talk.speaking !== h) return null;
  const r = b.getBoundingClientRect();
  const feet = g.scene.toScreen(g.scene.nodePos(h));
  const c = g.game.world.characters[h];
  return { text: b.textContent, cx: r.x + r.width / 2, bottom: r.bottom, feetX: feet.x, feetY: feet.y, pose: c.pose, scale: g.scene.scale };
}, hero, { timeout: 10_000 })).jsonValue() as any;
/** Записывает кадры рта героя, пока идёт игра. */
const recordMouth = (page: Page, hero: string) => page.evaluate((h) => { (window as any).__mouth = new Set<string>(); setInterval(() => { const n = [...window.__game.scene.nodes.values()].find((x: any) => x.ref === h) as any; if (n?.parts) (window as any).__mouth.add(n.parts.mouth._k); }, 30); }, hero);
const log = (page: Page) => page.evaluate(() => window.__game.talk.log.map((l: any) => ({ ...l })));
const quiet = (page: Page) => page.waitForFunction(() => !window.__game.talk.speaking && !window.__game.talk.queue.length && !window.__game.talk.pending.length, null, { timeout: 12_000 });
const noOverlap = (entries: any[]) => { for (let i = 1; i < entries.length; i++) expect(entries[i].start, `реплика ${i} началась до конца предыдущей`).toBeGreaterThanOrEqual(entries[i - 1].end); };

test('тап: герой обращается к игроку, пузырёк над головой, рот шевелится, повтор не накладывается', async ({ page }) => {
  await start(page);
  await recordMouth(page, 'hero_mila');
  await page.mouse.click(...(await at(page, 'hero_mila', -150)));
  const info = await bubbleInfo(page, 'hero_mila');
  expect(['Привет! Поиграем?', 'Я тут! Что будем делать?', 'Ура, ты здесь!']).toContain(info.text);
  // пузырёк над головой говорящего: по центру героя и выше его макушки
  expect(Math.abs(info.cx - info.feetX)).toBeLessThan(40);
  expect(info.bottom).toBeLessThan(info.feetY - 220 * info.scale);
  expect((await log(page))[0]).toMatchObject({ heroId: 'hero_mila', event: 'tap', audio: true });
  const bubble = page.locator('.bubble');
  // нажатия во время реплики не запускают второй звук
  await page.mouse.click(...(await at(page, 'hero_mila', -150)));
  await page.mouse.click(...(await at(page, 'hero_timur', -150)));
  expect(await log(page)).toHaveLength(1);
  await quiet(page);
  await expect(bubble).toBeHidden();
  // рот шевелился: за время реплики показаны и «открытый» кадр, и обычный
  const frames: string[] = await page.evaluate(() => [...(window as any).__mouth]);
  expect(frames).toContain('mouth:talk');
  expect(frames.length).toBeGreaterThanOrEqual(2);
  // пауза между повторами: сразу после реплики тот же герой молчит
  await page.mouse.click(...(await at(page, 'hero_mila', -150)));
  await page.waitForTimeout(300);
  expect(await log(page)).toHaveLength(1);
  // после паузы — другая фраза, не та же самая
  await page.waitForTimeout(3600);
  await page.mouse.click(...(await at(page, 'hero_mila', -150)));
  await page.waitForFunction(() => window.__game.talk.log.length === 2);
  const entries = await log(page);
  expect(entries[1].lineId).not.toBe(entries[0].lineId);
  noOverlap(entries);
});

test('перетаскивание не считается тапом; рядом стоящие герои говорят по очереди один раз и не повторяют сами', async ({ page }) => {
  await start(page);
  // перенос героя в пустое место: реплики «по тапу» нет
  await drag(page, await at(page, 'hero_mila', -150), await roomPt(page, 1000, 700));
  await page.waitForTimeout(600);
  expect(await log(page)).toHaveLength(0);
  // отпустили рядом с другим героем (оба стоят)
  await drag(page, await at(page, 'hero_mila', -150), await roomPt(page, 440, 690));
  await page.waitForFunction(() => window.__game.talk.log.length === 2, null, { timeout: 10_000 });
  await quiet(page);
  // тот же жест сразу снова — пара ещё «молчит» (пауза между повторами разговора)
  expect(await page.evaluate(() => [window.__game.talk.dialogue('hero_mila', 'hero_timur'), window.__game.talk.say('hero_mila', 'hello')])).toEqual([false, false]);
  let entries = await log(page);
  expect(entries.map((e: any) => [e.heroId, e.event])).toEqual([['hero_mila', 'hello'], ['hero_timur', 'reply']]);
  expect(entries.every((e: any) => e.audio)).toBe(true);
  noOverlap(entries);
  const w = await page.evaluate(() => window.__game.game.world.characters);
  expect([w.hero_mila.pose, w.hero_timur.pose]).toEqual(['standing', 'standing']);
  expect(await log(page)).toHaveLength(2);
  // герои продолжают стоять рядом — сами они больше ничего не говорят
  await page.waitForTimeout(9000);
  expect(await log(page)).toHaveLength(2);
});

test('сидя: реакция на посадку и разговор двух сидящих, пузырёк над сидящим героем', async ({ page }) => {
  await start(page);
  await drag(page, await at(page, 'hero_timur', -150), await roomPt(page, 322, 560)); // один на диване — реакция на посадку
  const info = await bubbleInfo(page, 'hero_timur');
  expect(info.pose).toBe('sitting');
  expect(['Ух, как мягко!', 'Посижу немножко.']).toContain(info.text);
  expect(Math.abs(info.cx - info.feetX)).toBeLessThan(40);
  expect(info.bottom).toBeLessThan(info.feetY - 180 * info.scale); // над головой сидящего
  let entries = await log(page);
  expect(entries[0]).toMatchObject({ heroId: 'hero_timur', event: 'sit', audio: true });
  await quiet(page);
  await drag(page, await at(page, 'hero_mila', -150), await roomPt(page, 440, 560)); // вторая садится рядом — разговор
  await page.waitForFunction(() => window.__game.talk.log.length === 3, null, { timeout: 10_000 });
  await quiet(page);
  entries = await log(page);
  expect(entries.slice(1).map((e: any) => [e.heroId, e.event])).toEqual([['hero_mila', 'hello'], ['hero_timur', 'reply']]);
  const w = await page.evaluate(() => window.__game.game.world.characters);
  expect([w.hero_mila.pose, w.hero_timur.pose]).toEqual(['sitting', 'sitting']);
  noOverlap(entries);
  await page.waitForTimeout(5000);
  expect(await log(page)).toHaveLength(3);
});

test('реакции на еду и подарок; голоса можно отключить', async ({ page }) => {
  await start(page);
  const id = (def: string) => page.evaluate((d) => (Object.values(window.__game.game.world.items) as any[]).find((i) => i.definitionId === d && i.owner.kind === 'room' && i.owner.roomId === 'living')?.instanceId as string, def);
  await page.click('[data-panel="things"]'); await page.click('.tab:has-text("Каталог")'); await page.click('.slot >> nth=5'); await page.click('.drawer .round');
  const apple = await id('apple');
  await drag(page, await at(page, apple, -15), await at(page, 'hero_mila', -200));
  await page.waitForFunction(() => window.__game.talk.log.length === 1);
  expect((await log(page))[0]).toMatchObject({ heroId: 'hero_mila', event: 'food', audio: true });
  await quiet(page);
  // подарок
  await page.click('[data-panel="gifts"]'); await page.click('.giftcard >> nth=0');
  const box = await id('giftbox');
  await drag(page, await at(page, box, -30), await at(page, 'hero_timur', -90));
  await page.waitForFunction(() => window.__game.talk.log.length === 2);
  expect((await log(page))[1]).toMatchObject({ heroId: 'hero_timur', event: 'gift', audio: true });
  await quiet(page);
  // отключение голосов: текст остаётся, звука нет
  await page.click('[data-panel="settings"]'); await page.uncheck('[data-setting="voices"]'); await page.click('.drawer .round');
  await page.waitForTimeout(3600);
  await page.mouse.click(...(await at(page, 'hero_mila', -150)));
  await page.waitForFunction(() => window.__game.talk.log.length === 3);
  expect((await log(page))[2]).toMatchObject({ event: 'tap', audio: false });
  await expect(page.locator('.bubble')).toBeVisible();
  noOverlap(await log(page));
});

test('после установки голоса работают без сети', async ({ page, context }) => {
  await start(page);
  await page.waitForFunction(() => window.__game.offline.state === 'ready', null, { timeout: 30_000 });
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  await page.click('#play'); await page.evaluate(() => window.__game.map.enter('houses')); // звук разблокирует первое нажатие
  await page.mouse.click(...(await roomPt(page, 1000, 300)));
  await page.click('[aria-label="Звук"]'); await page.click('[aria-label="Звук"]');
  await page.waitForFunction(() => window.__game.talk.loaded >= 12, null, { timeout: 15_000 });
  await page.mouse.click(...(await at(page, 'hero_mila', -150)));
  await page.waitForFunction(() => window.__game.talk.log.length === 1);
  expect((await log(page))[0]).toMatchObject({ event: 'tap', audio: true });
});
