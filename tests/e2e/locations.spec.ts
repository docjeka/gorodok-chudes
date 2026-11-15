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

const PROPS = ['beach_lounger', 'beach_umbrella', 'beach_bucket', 'beach_float', 'beach_sandcastle', 'beach_rowboat', 'club_speaker', 'club_microphone', 'club_headphones', 'club_drum', 'club_stool', 'club_light', 'toy_octopus', 'toy_train', 'toy_dinosaur', 'toy_music_box', 'toy_jack_box', 'toy_ribbon_station', 'cafe_croissant', 'cafe_donut', 'cafe_berry_tart', 'cafe_mixer', 'cafe_rolling_pin', 'cafe_mixing_bowl', 'pet_double_bowl', 'pet_grooming_brush', 'pet_rope_ball', 'pet_tunnel', 'pet_cushion', 'pet_picnic_box', 'fair_ring_toss', 'fair_rings', 'fair_popcorn', 'fair_cotton_candy', 'fair_plush_prize', 'fair_ticket_machine'];
const FURN_PROPS = new Set(['beach_lounger', 'beach_umbrella', 'beach_rowboat', 'club_speaker', 'club_stool', 'club_light', 'pet_tunnel', 'pet_cushion', 'fair_ring_toss', 'fair_ticket_machine']);
const travel = (page: Page, room: string, heroes: string[] = []) => page.evaluate(([r, h]) => { const g = window.__game; g.game.commit(g.rules.travel(g.game.world, r, h)); g.scene.setZoom(0.1); }, [room, heroes] as const);

test('36 предметов: все картинки загружаются, вещи переносятся, на шезлонг садятся, выпечка съедается, всё переживает перезапуск', async ({ page }) => {
  await open(page);
  await enter(page, 'beach');
  // все 36 ассетов отдаются и декодируются
  const bad = await page.evaluate(async ([ids, furn]) => { const out: string[] = []; for (const id of ids as string[]) { const img = new Image(); img.src = `./assets/${(furn as string[]).includes(id) ? 'furn' : 'items'}/${id}.png`; try { await img.decode(); if (!img.naturalWidth) out.push(id); } catch { out.push(id); } } return out; }, [PROPS, [...FURN_PROPS]] as const);
  expect(bad).toEqual([]);
  let w = await world(page);
  const n0 = Object.keys(w.items).length;
  // герой садится на шезлонг пальцем
  await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.summonCharacter(g.game.world, 'hero_mila', 'beach')); g.game.update((x: any) => { x.characters.hero_mila.x = 900; x.characters.hero_mila.y = 800; }); });
  await page.waitForTimeout(400);
  const seatPt = await page.evaluate(() => { const f = window.__game.game.world.furniture.bc_lounger; return { x: f.x - 10, y: f.y - 92 - 70 + 110 }; });
  await drag(page, await at(page, 'hero_mila', -120), await roomPt(page, seatPt.x, seatPt.y));
  w = await world(page);
  expect(w.characters.hero_mila.seat).toMatchObject({ furnitureId: 'bc_lounger' });
  expect(w.characters.hero_mila.pose).toBe('sitting');
  // ведёрко — в руку герою
  const bucket = Object.values<any>(w.items).find((i) => i.definitionId === 'beach_bucket').instanceId;
  await drag(page, await at(page, bucket, -20), await at(page, 'hero_mila', -60));
  expect((await world(page)).items[bucket].owner).toMatchObject({ kind: 'hand', characterId: 'hero_mila' });
  // пончик из каталога кафе съедается у рта
  await page.evaluate(() => { const g = window.__game; const r = g.rules.spawnItem(g.game.world, 'cafe_donut', { kind: 'room', roomId: 'beach', x: 1000, y: 840 }); g.game.commit(r); (window as any).__donut = r.info.instanceId; });
  await page.waitForTimeout(300);
  const donut = await page.evaluate(() => (window as any).__donut as string);
  await drag(page, await at(page, donut, -15), await at(page, 'hero_mila', -150));
  await page.waitForFunction(() => !window.__game.scene.busy);
  expect((await world(page)).items[donut]).toBeUndefined();
  // наушники надеваются на голову; колечки садятся на стойку
  await travel(page, 'club', ['hero_mila']);
  await page.waitForTimeout(500);
  const phones = Object.values<any>((await world(page)).items).find((i) => i.definitionId === 'club_headphones').instanceId;
  await drag(page, await at(page, phones, -20), await at(page, 'hero_mila', -200));
  expect((await world(page)).items[phones].owner).toMatchObject({ kind: 'hand', slot: 'head' });
  expect((await music(page)).club).toBe(false); // реквизит клуба музыку не включает
  await page.mouse.click(...(await at(page, 'cl_speaker', -100)));
  await page.waitForTimeout(300);
  expect((await music(page)).club).toBe(false);
  await travel(page, 'park_games');
  await page.waitForTimeout(500);
  const rings = Object.values<any>((await world(page)).items).find((i) => i.definitionId === 'fair_rings').instanceId;
  await drag(page, await at(page, rings, -15), await roomPt(page, 1000, 840));
  expect((await world(page)).items[rings].owner.kind).toBe('room');
  const peg = await page.evaluate(() => { const f = window.__game.game.world.furniture.pg_rings; return { x: f.x + 40, y: f.y - 74 }; });
  await drag(page, await at(page, rings, -15), await roomPt(page, peg.x, peg.y - 20));
  expect((await world(page)).items[rings].owner).toMatchObject({ kind: 'surface', furnitureId: 'pg_rings', slot: 2 });
  // перезапуск: ничего не сбросилось и не раздвоилось
  await expect(page.locator('.save.saved')).toBeVisible();
  const before = await world(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  const after = await world(page);
  expect(after.items).toEqual(before.items);
  expect(after.characters.hero_mila).toEqual(before.characters.hero_mila);
  expect(Object.keys(after.items).length).toBe(n0); // +пончик −пончик
  await page.click('#play'); await enter(page, 'beach'); await page.click('#tomap'); await enter(page, 'beach');
  expect(Object.keys((await world(page)).items).length).toBe(n0); // повторные входы ничего не добавляют
});

test('Парк животных: шесть зверей без копий, мячик, поглаживание, пруд; после карты всё на местах', async ({ page }) => {
  await open(page);
  await page.click('.map-turn.right');
  await page.waitForFunction(() => !window.__game.map.turning);
  await enter(page, 'animals');
  let w = await world(page);
  expect(w.currentRoomId).toBe('animals');
  const park = ['pet_capybara', 'pet_cat', 'pet_dog', 'pet_frenchie', 'pet_rabbit', 'pet_wolf'];
  expect(Object.values<any>(w.pets).filter((p) => p.roomId === 'animals').map((p) => p.id).sort()).toEqual(park); // шестеро, без копий; жители фермы остались на ферме
  expect(Object.keys(w.pets)).toHaveLength(13);
  // мячик: ближайший бодрствующий зверь подбегает и толкает мяч
  const ball = Object.values<any>(w.items).find((i) => i.definitionId === 'pet_rope_ball').instanceId;
  await page.evaluate(() => window.__game.game.update((x: any) => { x.pets.pet_cat.sleeping = true; })); // спящий кот не побежит
  await drag(page, await at(page, ball, -15), await roomPt(page, 380, 850));
  await page.waitForFunction(() => !window.__game.scene.busy);
  await page.waitForTimeout(700);
  w = await world(page);
  const b = w.items[ball].owner;
  expect(b.kind).toBe('room');
  expect(Math.abs(b.x - 380)).toBeGreaterThan(60); // мяч откатился
  expect(Math.abs(w.pets.pet_dog.x - 380)).toBeLessThan(120); // подбежал пёс — он был ближе всех из неспящих
  expect(w.pets.pet_cat.sleeping).toBe(true);
  // мяч можно бросать снова: бульдог приносит обратно
  await page.evaluate(() => window.__game.game.update((x: any) => { x.pets.pet_frenchie.x = 1200; x.pets.pet_frenchie.y = 850; }));
  await page.waitForTimeout(300);
  await drag(page, await at(page, ball, -15), await roomPt(page, 1280, 860));
  await page.waitForFunction(() => !window.__game.scene.busy);
  await page.waitForTimeout(900);
  w = await world(page);
  expect(Math.abs(w.items[ball].owner.x - 1260)).toBeLessThan(40); // мяч лежит у бульдога
  expect(w.pets.pet_frenchie.x).toBe(1200);
  // поглаживание: палец водит по зверю — он не переносится, появляется ласка; потянули в сторону — перенос
  const wolf0 = w.pets.pet_wolf;
  const [x, y] = await at(page, 'pet_wolf', -55);
  const moodBefore = await page.evaluate(() => (window.__game.scene as any).petMoods.get('pet_wolf')?.mood ?? 'idle');
  await page.mouse.move(x, y); await page.mouse.down();
  for (const dx of [14, -14, 16, -16, 14, -12, 10]) { await page.mouse.move(x + dx, y + 3); await page.waitForTimeout(25); }
  expect(await page.evaluate(() => (window.__game.scene as any).petMoods.get('pet_wolf')?.mood)).toBe('play'); // глаза прикрыты
  expect(moodBefore).not.toBe('play');
  await page.mouse.up(); await page.waitForTimeout(300);
  expect((await world(page)).pets.pet_wolf).toEqual(wolf0);
  // пруд: капибару отпустили у берега — она идёт к воде
  await drag(page, await at(page, 'pet_capybara', -50), await roomPt(page, 420, 700));
  await page.waitForFunction(() => !window.__game.scene.busy);
  await page.waitForTimeout(400);
  w = await world(page);
  expect(w.pets.pet_capybara.y).toBeLessThan(600);
  expect(Math.abs(w.pets.pet_capybara.x - w.furniture.an_pond.x)).toBeLessThan(180);
  // кормление и сон работают как раньше
  const kibble = Object.values<any>(w.items).find((i) => i.definitionId === 'kibble' && i.owner.roomId === 'animals').instanceId;
  await drag(page, await at(page, kibble, -12), await at(page, 'pet_frenchie', -50));
  expect((await world(page)).items[kibble].state.servings).toBe(2);
  await drag(page, await at(page, 'pet_rabbit', -50), await at(page, 'an_cushion', -40));
  expect((await world(page)).pets.pet_rabbit).toMatchObject({ sleeping: true, seat: { furnitureId: 'an_cushion' } });
  // на карту и обратно, затем перезапуск: все там, где оставили
  await expect(page.locator('.save.saved')).toBeVisible();
  const kept = await world(page);
  await page.click('#tomap');
  expect(await page.evaluate(() => window.__game.map.side)).toBe('back');
  await enter(page, 'animals');
  w = await world(page);
  expect(w.pets).toEqual(kept.pets);
  expect(w.items).toEqual(kept.items);
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  expect((await world(page)).pets).toEqual(kept.pets);
});
