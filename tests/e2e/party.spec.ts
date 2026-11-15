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
/** Окошко «кто идёт с нами»: отмечаем героев и идём. */
async function choose(page: Page, heroes: string[]) {
  if (!(await page.locator('.travelcard').isVisible())) return;
  for (const h of heroes) await page.click(`.herochip:has-text("${h}")`);
  await page.click('.travelcard .pill:not(.plain)');
}
async function enter(page: Page, place: string, heroes: string[] = []) {
  if (!(await page.locator('.map').isVisible())) await page.click('#tomap');
  await page.mouse.click(...(await spot(page, place)));
  await expect(page.locator('.map')).toBeHidden();
  await choose(page, heroes);
  await page.evaluate(() => window.__game.scene.setZoom(0.1));
  await page.waitForTimeout(500);
}
async function door(page: Page, label: string, heroes: string[] = []) {
  await page.click(`.roombtn:has-text("${label}")`);
  await choose(page, heroes);
  await page.waitForTimeout(500);
}
const count = (w: any, def: string) => Object.values<any>(w.items).filter((i) => i.definitionId === def).length;

test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

test('«Устрой вечеринку»: пекарня → мастерская → клуб → вручить и открыть подарок → DJ → выйти и вернуться; без дублей, после перезапуска и без сети', async ({ page, context }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; }));
  await page.waitForFunction(() => window.__game.offline.state === 'ready', null, { timeout: 60_000 });
  await page.click('#play');
  const start = await world(page);
  const total0 = Object.keys(start.items).length;

  // 1. пекарня: одно угощение — в сумку
  await enter(page, 'cafe', ['Мила']);
  await door(page, 'Пекарня', ['Мила']);
  expect((await world(page)).characters.hero_mila.roomId).toBe('cafe_bakery');
  const treat = Object.values<any>((await world(page)).items).find((i) => i.definitionId === 'cupcake' && i.owner.furnitureId === 'cb_shelves').instanceId;
  const bag = await page.locator('[data-panel="things"]').boundingBox();
  await drag(page, await at(page, treat, -20), [bag!.x + bag!.width / 2, bag!.y + bag!.height / 2]);
  expect((await world(page)).items[treat].owner.kind).toBe('bag');

  // 2. мастерская: игрушка — в коробку, бант, коробка — герою в руки
  await enter(page, 'toys', ['Мила']);
  await door(page, 'Мастерская подарков', ['Мила']);
  let w = await world(page);
  const box = Object.values<any>(w.items).find((i) => i.definitionId === 'giftbox' && i.owner.roomId === 'toys_workshop').instanceId;
  const toy = Object.values<any>(w.items).find((i) => i.definitionId === 'toy_jack_box').instanceId;
  await drag(page, await at(page, toy, -25), await at(page, box, -40));
  expect((await world(page)).items[toy].owner).toMatchObject({ kind: 'item', itemId: box });
  await page.mouse.click(...(await at(page, box, -40)));
  await page.click('.pill:has-text("Завязать бант")');
  expect((await world(page)).items[box].state.packed).toBe(true);
  await page.mouse.click(...(await roomPt(page, 1400, 560))); // снять выделение
  await drag(page, await at(page, box, -40), await at(page, 'hero_mila', -60));
  expect((await world(page)).items[box].owner).toMatchObject({ kind: 'hand', characterId: 'hero_mila', slot: 'both' });

  // 3. клуб: герой приходит с подарком, там уже ждут трое
  await enter(page, 'club', ['Мила']);
  w = await world(page);
  expect(w.currentRoomId).toBe('club');
  expect(w.characters.hero_mila.roomId).toBe('club');
  expect(w.items[box].owner).toMatchObject({ kind: 'hand', characterId: 'hero_mila' }); // тот же предмет, не копия
  expect(count(w, 'giftbox')).toBe(count(start, 'giftbox'));
  const friend = Object.values<any>(w.characters).find((c) => c.roomId === 'club' && c.id !== 'hero_mila').id as string;
  await page.waitForFunction(() => window.__game.audio.musicState().loaded[1], null, { timeout: 20_000 });
  expect((await music(page)).club).toBe(false);

  // 4. подарок другому герою: улыбка и реплика текстом
  await page.evaluate((f) => window.__game.game.update((x: any) => { x.characters.hero_mila.x = 180; x.characters.hero_mila.y = 850; x.characters[f].x = 900; x.characters[f].y = 840; x.characters[f].flipped = false; }), friend);
  await page.waitForTimeout(400);
  await drag(page, await at(page, box, -40), await at(page, friend, -60));
  w = await world(page);
  expect(w.items[box].owner).toMatchObject({ kind: 'hand', characterId: friend });
  expect(w.characters[friend].emotion).toBe('delight');
  await expect(page.locator('.bubble')).toHaveText('Это мне? Спасибо!');
  const said = await page.evaluate(() => window.__game.talk.log.at(-1));
  expect(said).toMatchObject({ heroId: friend, event: 'party', lineId: 'party1', audio: false }); // озвучки нет — только текст
  expect((await music(page)).club).toBe(false); // подарок музыку не включает
  // получатель открывает подарок: коробки нет, игрушка та же самая и одна
  await page.waitForFunction(() => !window.__game.talk.speaking);
  await page.mouse.click(...(await at(page, box, -40)));
  await page.click('.pill:has-text("Открыть подарок")');
  await page.waitForTimeout(600);
  w = await world(page);
  expect(w.items[box]).toBeUndefined();
  expect(w.items[toy].owner).toMatchObject({ kind: 'room', roomId: 'club' });
  expect(count(w, 'toy_jack_box')).toBe(count(start, 'toy_jack_box'));

  // 5. угощение из сумки — на столик
  await page.click('[data-panel="things"]');
  await page.click('.drawer .slot:not(.empty) >> nth=0');
  await page.click('[data-panel="things"]');
  await page.waitForTimeout(300);
  expect((await world(page)).items[treat].owner).toMatchObject({ kind: 'room', roomId: 'club' });
  const tbl = await page.evaluate(() => { const f = window.__game.game.world.furniture.cl_table; return { x: f.x - 84 + 56, y: f.y - 96 }; });
  await drag(page, await at(page, treat, -20), await roomPt(page, tbl.x, tbl.y - 20));
  expect((await world(page)).items[treat].owner).toMatchObject({ kind: 'surface', furnitureId: 'cl_table' });

  // 6. герой за пульт: трек один, свободные герои пританцовывают
  await drag(page, await at(page, 'hero_mila', -120), await roomPt(page, 800, 700 - 62 - 120 + 110));
  expect((await world(page)).characters.hero_mila.seat).toMatchObject({ furnitureId: 'cl_dj' });
  await page.waitForFunction(() => { const m = window.__game.audio.musicState(); return m.club && !m.town; });
  const ys = await page.evaluate(async (f) => { const n = [...window.__game.scene.nodes.values()].find((x: any) => x.ref === f); const out: number[] = []; for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 60)); out.push(n.c.y); } return out; }, friend);
  expect(await page.evaluate(() => window.__game.scene.stats().tweens)).toBeLessThan(8); // анимации не «залипают» после открытия подарка
  expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(3); // танцует
  expect((await music(page)).clubStarts).toBe(1);

  // 7. выйти и вернуться: музыка стихла и сама не включается, всё на местах
  await expect(page.locator('.save.saved')).toBeVisible();
  const kept = await world(page);
  await page.click('#tomap');
  await page.waitForFunction(() => !window.__game.audio.musicState().club);
  await enter(page, 'club');
  await page.waitForTimeout(500);
  expect((await music(page)).club).toBe(false);
  w = await world(page);
  expect(w.items).toEqual(kept.items);
  expect(w.characters).toEqual(kept.characters);
  expect(Object.keys(w.items).length).toBe(total0 - 1); // исчезла только коробка, ничего не раздвоилось

  // 8. перезапуск без интернета: мир тот же, клуб открывается
  await expect(page.locator('.save.saved')).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  w = await world(page);
  expect(w.items).toEqual(kept.items);
  expect(w.characters.hero_mila.seat).toMatchObject({ furnitureId: 'cl_dj' });
  await page.click('#play'); await enter(page, 'club');
  expect((await world(page)).currentRoomId).toBe('club');
  expect(await page.evaluate(() => window.__game.scene.stats().nodes)).toBeGreaterThan(5);
});

test('история есть в карточках идей на двух языках; действия работают и по отдельности', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; }));
  await page.click('#play'); await enter(page, 'houses');
  await page.click('[data-panel="ideas"]');
  await expect(page.locator('.card.idea[data-idea="party"]')).toContainText('Устрой вечеринку');
  await page.click('[data-panel="ideas"]');
  // подарок в домике — прежняя реплика с озвучкой; в клубе без подарка музыка включается сама по себе
  await page.evaluate(() => { const g = window.__game; const r = g.rules.takeGiftSet(g.game.world, 'tea', 'living', { x: 900, y: 840 }); g.game.commit(r); });
  await page.waitForTimeout(400);
  const box = await page.evaluate(() => (Object.values(window.__game.game.world.items) as any[]).find((i) => i.definitionId === 'giftbox' && i.owner.roomId === 'living').instanceId as string);
  await drag(page, await at(page, box, -40), await at(page, 'hero_timur', -60));
  await page.waitForFunction(() => window.__game.talk.log.length === 1);
  expect(await page.evaluate(() => window.__game.talk.log[0].event)).toBe('gift');
  await page.evaluate(async () => { window.__game.game.update((w: any) => { w.settings.lang = 'en'; }); await window.__game.game.flush(); });
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  await page.click('#play'); await enter(page, 'houses');
  await page.click('[data-panel="ideas"]');
  await expect(page.locator('.card.idea[data-idea="party"]')).toContainText('Throw a party');
});

test('танцы в клубе: диджей и сидящие не танцуют, новый герой присоединяется, унесённый сразу стоит ровно, после музыки все спокойны и координаты не изменились', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; }));
  await page.click('#play');
  await page.evaluate(() => window.__game.game.update((w: any) => {
    w.rooms.club.visited = true;
    const put = (id: string, x: number, y: number) => Object.assign(w.characters[id], { roomId: 'club', x, y, pose: 'standing', seat: null });
    put('hero_mila', 1150, 840); put('hero_timur', 480, 830); put('hero_lev', 700, 850); put('hero_nora', 1300, 800);
    w.characters.hero_nora.seat = { furnitureId: 'cl_stool', slot: 0 }; w.characters.hero_nora.pose = 'sitting';
  }));
  await enter(page, 'club');
  await page.waitForFunction(() => window.__game.audio.musicState().loaded[1], null, { timeout: 20_000 });
  const sample = (ids: string[], ms = 2200) => page.evaluate(async ([list, dur]) => { const g = window.__game; const out: Record<string, { rot: number; dy: number }> = {}; for (const id of list as string[]) out[id] = { rot: 0, dy: 0 }; const t0 = performance.now(); while (performance.now() - t0 < (dur as number)) { for (const id of list as string[]) { const n = g.scene.nodeOf(id); out[id].rot = Math.max(out[id].rot, Math.abs(n.c.rotation)); out[id].dy = Math.max(out[id].dy, Math.abs(n.c.y - n.by)); } await new Promise((r) => requestAnimationFrame(r)); } return out; }, [ids, ms] as const);
  // без музыки никто не танцует
  let m = await sample(['hero_timur', 'hero_lev'], 600);
  expect(m.hero_timur.rot + m.hero_lev.rot).toBe(0);
  const coords = (await world(page)).characters;
  // Мила — за пульт
  await drag(page, await at(page, 'hero_mila', -120), await roomPt(page, 800, 628));
  await page.waitForFunction(() => window.__game.audio.musicState().club);
  await page.waitForFunction(() => window.__game.scene.dancing.length === 2);
  expect(await page.evaluate(() => window.__game.scene.dancing.sort())).toEqual(['hero_lev', 'hero_timur']);
  m = await sample(['hero_mila', 'hero_timur', 'hero_lev', 'hero_nora']);
  expect(m.hero_timur.rot).toBeGreaterThan(0.03); expect(m.hero_lev.rot).toBeGreaterThan(0.03); // качаются
  expect(m.hero_timur.dy).toBeGreaterThan(4); expect(m.hero_lev.dy).toBeGreaterThan(4); // подскок
  expect(m.hero_timur.rot).toBeLessThan(0.15); // без рывков
  expect(m.hero_mila.rot).toBe(0); expect(m.hero_nora.rot).toBe(0); // диджей и сидящая не танцуют
  // ещё одного героя принесли на танцпол — присоединяется
  await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.summonCharacter(g.game.world, 'hero_asya', 'club')); });
  await page.waitForFunction(() => window.__game.scene.dancing.includes('hero_asya'));
  // героя несут: пока он в пальцах, он не танцует
  const from = await at(page, 'hero_timur', -120);
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(from[0] + i * 12, from[1] - i * 6);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__game.scene.nodeOf('hero_timur').c.rotation)).toBe(0);
  await page.mouse.up(); await page.waitForTimeout(300);
  // Тимура сажаем на свободное место — больше не танцует
  await page.evaluate(() => window.__game.game.update((w: any) => { w.characters.hero_nora.seat = null; w.characters.hero_nora.pose = 'standing'; w.characters.hero_nora.x = 1380; w.characters.hero_nora.y = 830; w.characters.hero_timur.seat = { furnitureId: 'cl_stool', slot: 0 }; w.characters.hero_timur.pose = 'sitting'; }));
  await page.waitForFunction(() => !window.__game.scene.dancing.includes('hero_timur') && window.__game.scene.dancing.includes('hero_nora'));
  // музыка остановилась: все встают спокойно
  await drag(page, await at(page, 'hero_mila', -150), await roomPt(page, 1150, 840));
  await page.waitForFunction(() => !window.__game.audio.musicState().club);
  await page.waitForFunction(() => window.__game.scene.dancing.length === 0);
  await page.waitForTimeout(700);
  m = await sample(['hero_lev', 'hero_nora', 'hero_asya'], 500);
  expect(m.hero_lev.rot + m.hero_nora.rot + m.hero_asya.rot).toBe(0);
  expect(m.hero_lev.dy + m.hero_nora.dy + m.hero_asya.dy).toBe(0);
  // танец не трогал сохранённые координаты
  const after = (await world(page)).characters;
  expect([after.hero_lev.x, after.hero_lev.y]).toEqual([coords.hero_lev.x, coords.hero_lev.y]);
});

test('новые наряды: Мила-диджей и Тимур-кондитер — стоя и сидя, сохраняются после смены комнаты и перезапуска; наряд музыку не включает', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; }));
  await page.click('#play'); await enter(page, 'houses');
  // наряд выбирается стрелкой в панели героя; название видно
  await page.mouse.click(...(await at(page, 'hero_mila', -120)));
  await page.click('[aria-label="Предыдущий наряд"]');
  await expect(page.locator('.grouplabel').first()).toHaveText('Диджей');
  expect((await world(page)).characters.hero_mila.costume).toBe('dj');
  await page.mouse.click(...(await at(page, 'hero_timur', -120)));
  await page.click('[aria-label="Предыдущий наряд"]');
  await expect(page.locator('.grouplabel').first()).toHaveText('Кондитер');
  // старые наряды на месте, новых героев нет
  let w = await world(page);
  expect(Object.keys(w.characters)).toHaveLength(6);
  await page.click('[aria-label="Следующий наряд"]');
  expect((await world(page)).characters.hero_timur.costume).toBe('casual');
  await page.click('[aria-label="Предыдущий наряд"]');
  // готовые фигурки стоя и сидя загружаются, точки лица на месте
  const spr = (hero: string) => page.evaluate((h) => { const n = window.__game.scene.nodeOf(h); return { key: n.key as string, ok: !!n.tex, eyes: n.parts ? [Math.round(n.parts.eyeL.x), Math.round(n.parts.eyeR.x)] : null }; }, hero);
  await page.waitForFunction(() => !!window.__game.scene.nodeOf('hero_mila').tex && window.__game.scene.nodeOf('hero_mila').key.includes('dj'));
  expect((await spr('hero_mila')).key).toContain('hero_mila_dj_stand');
  expect((await spr('hero_timur')).key).toContain('hero_timur_confectioner_stand');
  await page.mouse.click(...(await roomPt(page, 1000, 300)));
  await drag(page, await at(page, 'hero_mila', -120), await roomPt(page, 440, 560)); // на диван
  await page.waitForFunction(() => window.__game.scene.nodeOf('hero_mila').key.includes('dj_sit'));
  expect((await world(page)).characters.hero_mila.pose).toBe('sitting');
  await drag(page, await at(page, 'hero_mila', -90), await roomPt(page, 1000, 820)); // и встать
  await page.waitForFunction(() => window.__game.scene.nodeOf('hero_mila').key.includes('dj_stand'));
  // Тимур — в пекарню, Мила — в клуб за пульт
  await page.click('#tomap'); await enter(page, 'cafe', ['Тимур']); await door(page, 'Пекарня', ['Тимур']);
  w = await world(page);
  expect(w.characters.hero_timur).toMatchObject({ roomId: 'cafe_bakery', costume: 'confectioner' });
  await page.waitForFunction(() => window.__game.scene.nodeOf('hero_timur')?.key.includes('confectioner_stand'));
  await page.evaluate(() => { const g = window.__game; g.game.update((x: any) => { Object.assign(x.characters.hero_mila, { roomId: 'club', x: 1150, y: 840, seat: null, pose: 'standing' }); x.rooms.club.visited = true; }); });
  await page.click('#tomap'); await enter(page, 'club');
  await page.waitForFunction(() => window.__game.audio.musicState().loaded[1], null, { timeout: 20_000 });
  await page.waitForTimeout(600);
  expect((await music(page)).club).toBe(false); // наряд диджея сам музыку не включает
  await drag(page, await at(page, 'hero_mila', -120), await roomPt(page, 800, 628));
  await page.waitForFunction(() => window.__game.audio.musicState().club);
  expect((await world(page)).characters.hero_mila).toMatchObject({ costume: 'dj', seat: { furnitureId: 'cl_dj' } });
  // перезапуск: наряды те же
  await expect(page.locator('.save.saved')).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  w = await world(page);
  expect(w.characters.hero_mila.costume).toBe('dj');
  expect(w.characters.hero_timur.costume).toBe('confectioner');
});

test('живые вещи клуба: шар включается и выключается тапом, звёзды летят из прожектора и после его перемещения, колонка пульсирует только под DJ-трек', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.game.update((w: any) => { w.settings.tutorialDone = true; w.rooms.club.visited = true; Object.assign(w.characters.hero_mila, { roomId: 'club', x: 1300, y: 850, pose: 'standing', seat: null }); }));
  await page.click('#play'); await enter(page, 'club');
  await page.waitForFunction(() => window.__game.audio.musicState().loaded[1], null, { timeout: 20_000 });
  const fx = () => page.evaluate(() => window.__game.scene.clubFx());
  expect(await fx()).toMatchObject({ ball: false, stars: false, pulse: false, speakerScale: 1 });
  // шар: тап — включён, второй тап — выключен; музыка от этого не начинается
  const ball = await roomPt(page, 799, 181);
  await page.mouse.click(...ball);
  await page.waitForFunction(() => window.__game.scene.clubFx().ball);
  expect((await world(page)).rooms.club.ball).toBe(true);
  expect((await music(page)).club).toBe(false);
  // плитки едут: картинка внутри шара меняется со временем, а за его контуром — нет рывков яркости
  const draws = await page.evaluate(async () => { const g = (window.__game.scene as any).clubBall; const a = g.context.instructions.length; const b0 = JSON.stringify(g.context.instructions[0]?.data?.path?.instructions?.[0]?.data ?? null); await new Promise((r) => setTimeout(r, 700)); const b1 = JSON.stringify(g.context.instructions[0]?.data?.path?.instructions?.[0]?.data ?? null); return { n: a, moved: b0 !== b1 }; });
  expect(draws.n).toBeGreaterThan(20); expect(draws.moved).toBe(true);
  await page.mouse.click(...ball);
  await page.waitForFunction(() => !window.__game.scene.clubFx().ball, null, { timeout: 5000 });
  await page.mouse.click(...ball); // оставим включённым
  // прожектор: тап включает звёздочки; перенос (долгое нажатие) не считается тапом
  const lampX0 = (await world(page)).furniture.cl_light.x;
  await page.mouse.click(...(await at(page, 'cl_light', -90)));
  await page.waitForFunction(() => window.__game.scene.clubFx().stars);
  expect((await world(page)).furniture.cl_light.on).toBe(1);
  const starXs = () => page.evaluate(() => (window.__game.scene as any).particles.map((p: any) => Math.round(p.s.x)));
  await page.waitForTimeout(700);
  const near = await starXs();
  expect(near.length).toBeGreaterThan(2);
  expect(near.every((x: number) => x < lampX0 + 40 && x > lampX0 - 420)).toBe(true); // летят от лампы к танцполу
  const a = await at(page, 'cl_light', -90);
  await page.mouse.move(a[0], a[1]); await page.mouse.down(); await page.waitForTimeout(650);
  for (let i = 1; i <= 8; i++) await page.mouse.move(a[0] + (300 * i) / 8, a[1] + 15);
  await page.mouse.up(); await page.waitForTimeout(400);
  const lamp = (await world(page)).furniture.cl_light;
  expect(lamp.x).toBeGreaterThan(lampX0 + 200);
  expect(lamp.on).toBe(1); // перенос не выключил
  await page.waitForTimeout(3200); // старые звёздочки погасли
  const moved = await starXs();
  expect(moved.length).toBeGreaterThan(2);
  expect(moved.every((x: number) => x > lampX0 + 200 - 420 + 34 && x < lamp.x + 40)).toBe(true); // вылетают из нового места
  expect(Math.max(...moved)).toBeGreaterThan(lampX0 + 100);
  // колонка: тап музыку не запускает и не пульсирует
  await page.mouse.click(...(await at(page, 'cl_speaker', -110)));
  await page.waitForTimeout(400);
  expect((await music(page)).club).toBe(false);
  expect((await fx()).pulse).toBe(false);
  // герой за пультом — колонка пульсирует в такт
  await drag(page, await at(page, 'hero_mila', -120), await roomPt(page, 800, 628));
  await page.waitForFunction(() => window.__game.audio.musicState().club);
  await page.waitForFunction(() => window.__game.scene.clubFx().pulse);
  const scales = await page.evaluate(async () => { const out: number[] = []; const t0 = performance.now(); while (performance.now() - t0 < 1600) { out.push(window.__game.scene.clubFx().speakerScale); await new Promise((r) => requestAnimationFrame(r)); } return out; });
  expect(Math.max(...scales)).toBeGreaterThan(1.008); expect(Math.max(...scales)).toBeLessThan(1.05); expect(Math.min(...scales)).toBeLessThan(1.004);
  // героя сняли с пульта — колонка сразу обычная; шар и прожектор работают дальше, они независимы
  await drag(page, await at(page, 'hero_mila', -150), await roomPt(page, 1300, 850));
  await page.waitForFunction(() => !window.__game.audio.musicState().club);
  await page.waitForFunction(() => { const f = window.__game.scene.clubFx(); return !f.pulse && f.speakerScale === 1; });
  expect(await fx()).toMatchObject({ ball: true, stars: true });
  // выход из клуба останавливает эффекты; при возвращении включённые шар и прожектор снова работают
  await page.click('#tomap'); await enter(page, 'houses');
  await page.waitForTimeout(900);
  expect(await fx()).toMatchObject({ ball: false, stars: false, pulse: false });
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => (window.__game.scene as any).particles.length)).toBe(0);
  await page.click('#tomap'); await enter(page, 'club');
  await page.waitForFunction(() => { const f = window.__game.scene.clubFx(); return f.ball && f.stars; });
});

test('«Подготовить игру»: просмотр ничего не меняет, вещи появляются один раз в своих комнатах, найденные не двигаются; после перезапуска без сети всё на месте', async ({ page, context }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__game);
  await page.waitForFunction(() => window.__game.offline.state === 'ready', null, { timeout: 60_000 });
  // «старое сохранение»: ни коробки, ни капкейков, ни мячика с миской; мешок корма — у героя в другой комнате
  await page.evaluate(() => window.__game.game.update((w: any) => {
    w.settings.tutorialDone = true; delete w.preparedIdeas;
    for (const [id, it] of Object.entries<any>(w.items)) if (['giftbox', 'cupcake', 'pet_rope_ball', 'pet_double_bowl'].includes(it.definitionId)) delete w.items[id];
    const bag = Object.values<any>(w.items).find((i) => i.definitionId === 'pet_food_bag'); bag.owner = { kind: 'hand', characterId: 'hero_mila', slot: 'left' };
  }));
  await page.click('#play'); await enter(page, 'houses');
  const count = async (def: string) => Object.values<any>((await world(page)).items).filter((i) => i.definitionId === def).length;
  const before = JSON.stringify((await world(page)).items);
  await page.click('[data-panel="ideas"]');
  await expect(page.locator('.card.idea[data-idea="party"] .pill')).toHaveText('Подготовить игру');
  expect(JSON.stringify((await world(page)).items)).toBe(before); // просмотр карточек ничего не меняет
  expect((await music(page)).club).toBe(false);
  // вечеринка
  await page.click('.card.idea[data-idea="party"] .pill');
  let w = await world(page);
  const cup = Object.values<any>(w.items).find((i) => i.definitionId === 'cupcake');
  const box = Object.values<any>(w.items).find((i) => i.definitionId === 'giftbox');
  expect(cup.owner.kind).toBe('surface'); expect(w.furniture[cup.owner.furnitureId].roomId).toBe('cafe_bakery');
  expect(box.owner).toMatchObject({ kind: 'room', roomId: 'toys_workshop' }); expect(box.state.packed).toBe(false);
  await expect(page.locator('.card.idea[data-idea="party"] .idea-row')).toHaveCount(3);
  await expect(page.locator('.card.idea[data-idea="party"] .idea-row.created').first()).toContainText('появилось: Пекарня');
  await expect(page.locator('.card.idea[data-idea="party"] .idea-row.found')).toContainText('уже есть: Мастерская подарков');
  expect((await music(page)).club).toBe(false); // музыку карточка не включает
  expect(w.currentRoomId).toBe('living'); // игрока никуда не уносит
  // повторные нажатия не плодят
  for (let i = 0; i < 3; i++) await page.click('.card.idea[data-idea="party"] .pill >> nth=0');
  expect(await count('cupcake')).toBe(1); expect(await count('giftbox')).toBe(1); expect(await count('toy_jack_box')).toBe(1);
  // питомцы: мешок у Милы в руках — показывается, где он, и не переставляется
  await page.click('.card.idea[data-idea="pets"] .pill');
  w = await world(page);
  expect(Object.values<any>(w.items).find((i) => i.definitionId === 'pet_food_bag').owner).toMatchObject({ kind: 'hand', characterId: 'hero_mila' });
  await expect(page.locator('.card.idea[data-idea="pets"] .idea-row.found').filter({ hasText: 'у героя' })).toContainText('уже есть: Гостиная · у героя Мила');
  await expect(page.locator('.card.idea[data-idea="pets"] .idea-row.found')).toHaveCount(2); // мешок и кувшин уже есть в мире — показано, где они
  for (const d of ['pet_rope_ball', 'pet_double_bowl']) expect(Object.values<any>(w.items).some((i) => i.definitionId === d && i.owner.roomId === 'animals')).toBe(true);
  expect(w.items[Object.keys(w.items).find((k) => w.items[k].definitionId === 'pet_double_bowl')!].state).toEqual({}); // питомцев никто не кормит автоматически
  const pets0 = JSON.stringify(w.pets);
  await page.click('.card.idea[data-idea="pets"] .pill >> nth=0');
  expect(await count('pet_double_bowl')).toBe(1); expect(await count('pet_rope_ball')).toBe(1);
  expect(JSON.stringify((await world(page)).pets)).toBe(pets0);
  // угощение съели: само не появляется, только по «Приготовить ещё»
  await page.evaluate(() => window.__game.game.update((x: any) => { for (const [id, it] of Object.entries<any>(x.items)) if (it.definitionId === 'cupcake') delete x.items[id]; }));
  await page.click('.card.idea[data-idea="party"] .pill >> nth=0');
  expect(await count('cupcake')).toBe(0);
  await expect(page.locator('.card.idea[data-idea="party"] .idea-row.eaten')).toContainText('уже съели');
  await page.click('.card.idea[data-idea="party"] .idea-row.eaten .pill');
  expect(await count('cupcake')).toBe(1);
  // перезапуск без интернета
  await expect(page.locator('.save.saved')).toBeVisible();
  const kept = JSON.stringify((await world(page)).items);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  expect(JSON.stringify((await world(page)).items)).toBe(kept);
  await page.click('#play'); await enter(page, 'houses');
  await page.click('[data-panel="ideas"]');
  await page.click('.card.idea[data-idea="party"] .pill');
  expect(JSON.stringify((await world(page)).items)).toBe(kept); // и после перезапуска ничего не дублируется
});
