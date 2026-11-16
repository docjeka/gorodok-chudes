// Снимки игровых сцен без человека: node scripts/capture.mjs [имя сценария]
// Поднимает production-сборку (vite preview) и снимает кадры в .studioigor/captures/.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = '.studioigor/captures';
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { if ((await fetch('http://127.0.0.1:4173/')).ok) break; } catch { /* ждём */ } await wait(250); }

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
export async function open(query = '', viewport = { width: 1366, height: 1024 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.goto('http://127.0.0.1:4173/' + query);
  await page.waitForFunction(() => !!window.__game);
  if (!query.includes('tutorial')) await page.evaluate(() => window.__game.game.update((w) => { w.settings.tutorialDone = true; }));
  await page.click('#play'); await page.evaluate(() => window.__game.map.enter('houses'));
  await wait(900);
  return page;
}
const shot = async (page, name) => { await wait(350); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
/** Экранные координаты объекта сцены. */
const at = (page, ref, dy = -40) => page.evaluate(([r, d]) => { const g = window.__game; const p = g.scene.nodePos(r); const s = g.scene.toScreen({ x: p.x, y: p.y + d }); return [s.x, s.y]; }, [ref, dy]);
const roomPt = (page, x, y) => page.evaluate(([a, b]) => { const s = window.__game.scene.toScreen({ x: a, y: b }); return [s.x, s.y]; }, [x, y]);
async function drag(page, from, to) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
  await wait(60); await page.mouse.up(); await wait(450);
}
const find = (page, def, kind) => page.evaluate(([d, k]) => Object.values(window.__game.game.world.items).find((i) => i.definitionId === d && (!k || i.owner.kind === k))?.instanceId, [def, kind]);

const scenario = process.argv[2] ?? 'pilot';
try {
  if (scenario === 'pilot' || scenario === 'all') {
    const page = await open('?debug=anchors');
    await shot(page, 'pilot-01-living');
    const next = () => page.click('[aria-label="Следующий наряд"]');
    for (const hero of ['hero_mila', 'hero_timur']) {
      await page.mouse.click(...(await at(page, hero, -120)));
      await shot(page, `pilot-${hero}-stand-1`);
      for (const n of [2, 3]) { await next(); await shot(page, `pilot-${hero}-stand-${n}`); }
      await next();
    }
    // эмоции на лице-слое
    await page.mouse.click(...(await at(page, 'hero_mila', -120)));
    for (const e of ['Удивление', 'Смешная гримаса', 'Восторг']) { await page.click(`[aria-label="${e}"]`); await shot(page, `pilot-emotion-${e}`); }
    // сидя: точка посадки не меняется при смене наряда
    await drag(page, await at(page, 'hero_mila', -120), await roomPt(page, 440, 560));
    await drag(page, await at(page, 'hero_timur', -120), await roomPt(page, 328, 560));
    await page.mouse.click(...(await roomPt(page, 1000, 520)));
    await shot(page, 'pilot-sit-1');
    for (const n of [2, 3]) {
      for (const hero of ['hero_mila', 'hero_timur']) { await page.mouse.click(...(await at(page, hero, -90))); await next(); await page.mouse.click(...(await roomPt(page, 1000, 520))); }
      await shot(page, `pilot-sit-${n}`);
    }
    // чашка в руку сидящему герою
    const cup = await find(page, 'cup', 'surface');
    await drag(page, await at(page, cup, -15), await at(page, 'hero_mila', -30));
    await shot(page, 'pilot-cup-in-hand');
    console.log(JSON.stringify(await page.evaluate(() => { const w = window.__game.game.world; return { mila: [w.characters.hero_mila.pose, w.characters.hero_mila.seat, w.characters.hero_mila.costume], timur: [w.characters.hero_timur.pose, w.characters.hero_timur.costume], cup: Object.values(w.items).find((i) => i.definitionId === 'cup' && i.owner.kind === 'hand')?.owner, stats: window.__game.scene.stats() }; })));
  }
  if (scenario === 'rooms' || scenario === 'all') {
    const page = await open('', { width: 1600, height: 900 });
    const IDS = { 'Гостиная': 'living', 'Кухня': 'kitchen', 'Спальня': 'bedroom', 'Ванная': 'bathroom' };
    const room = async (name, heroes = []) => { await page.evaluate(([r, h]) => window.__game.play.goRoom(r, h), [IDS[name], heroes]); await wait(700); };
    // кухня: открыть холодильник, собрать бутерброд
    await room('Кухня');
    await page.mouse.click(...(await roomPt(page, 235, 420)));
    await shot(page, 'room-kitchen-fridge');
    for (const [i, d] of ['bread', 'cheese', 'tomato'].entries()) await drag(page, await at(page, await find(page, d), -18), await roomPt(page, 470 + i * 54, 440));
    await shot(page, 'room-kitchen-cook-button');
    await page.click('.cookbtn', { force: true }); await shot(page, 'room-kitchen-sandwich');
    // спальня: герой идёт с нами и ложится спать, свет гаснет
    await room('Гостиная');
    await room('Спальня', ['hero_mila']);
    await shot(page, 'room-bedroom');
    await drag(page, await at(page, 'hero_mila', -150), await roomPt(page, 230, 540));
    await page.mouse.click(...(await roomPt(page, 1040, 110)));
    await shot(page, 'room-bedroom-night');
    await page.mouse.click(...(await roomPt(page, 1040, 110)));
    await page.mouse.click(...(await roomPt(page, 190, 555))); await wait(300);
    await room('Ванная', ['hero_mila']);
    await shot(page, 'room-bathroom');
    await drag(page, await at(page, 'hero_mila', -150), await roomPt(page, 400, 520));
    await shot(page, 'room-bathroom-bath');
    console.log(JSON.stringify(await page.evaluate(() => { const w = window.__game.game.world; return { room: w.currentRoomId, mila: [w.characters.hero_mila.roomId, w.characters.hero_mila.pose], sandwich: !!Object.values(w.items).find((i) => i.definitionId === 'sandwich'), stats: window.__game.scene.stats() }; })));
  }
  if (scenario === 'clean' || scenario === 'all') {
    const page = await open('');
    await shot(page, 'clean-01-stand');
    await drag(page, await at(page, 'hero_timur', -120), await roomPt(page, 328, 560));
    await page.mouse.click(...(await at(page, 'hero_mila', -120)));
    await page.click('[aria-label="Следующий наряд"]');
    await page.click('[aria-label="Восторг"]');
    const cup = await find(page, 'cup', 'surface');
    await drag(page, await at(page, cup, -15), await at(page, 'hero_mila', -60));
    await shot(page, 'clean-02-play');
    await drag(page, await at(page, 'hero_mila', -120), await roomPt(page, 440, 560));
    await page.mouse.click(...(await roomPt(page, 1000, 520)));
    await shot(page, 'clean-03-sofa');
  }
  if (scenario === 'voice' || scenario === 'all') {
    const page = await open('', { width: 1600, height: 900 });
    await page.waitForFunction(() => window.__game.talk.loaded === 12);
    // позвать остальных пластилиновых героев
    await page.evaluate(() => { const g = window.__game; for (const [id, x, y] of [['hero_asya', 1060, 820], ['hero_lev', 1290, 800], ['hero_nora', 1470, 840]]) g.game.update((w) => { Object.assign(w.characters[id], { roomId: 'living', x, y }); }); });
    await wait(600);
    // для снимка реплика «замирает»: таймер окончания снимается, после кадра реплика завершается вручную
    const hold = (hero) => page.waitForFunction((h) => { const t = window.__game.talk; if (t.speaking !== h) return false; clearTimeout(t.current.timer); return true; }, hero);
    const release = () => page.evaluate(() => window.__game.talk.finish());
    await drag(page, await at(page, 'hero_mila', -150), await roomPt(page, 440, 690));
    await hold('hero_mila'); await shot(page, 'voice-01-hello-stand'); await release();
    await hold('hero_timur'); await shot(page, 'voice-02-reply-stand'); await release();
    await wait(300);
    await drag(page, await at(page, 'hero_asya', -150), await roomPt(page, 880, 560));
    await hold('hero_asya'); await shot(page, 'voice-03-sit'); await release();
    await page.click('[data-panel="heroes"]'); await wait(400);
    await shot(page, 'panel-heroes');
    await page.click('[data-panel="things"]'); await page.click('.tab:has-text("Каталог")'); await wait(400);
    await shot(page, 'panel-catalog');
    await page.click('[data-panel="gifts"]'); await wait(400);
    await shot(page, 'panel-gifts');
  }
  if (scenario === 'panels') {
    for (const [wd, ht] of [[1024, 768], [768, 1024], [1180, 820], [800, 1280], [1280, 800], [960, 600]]) {
      const page = await open('', { width: wd, height: ht });
      for (const id of ['heroes', 'things']) {
        await page.click(`[data-panel="${id}"]`);
        if (id === 'things') await page.click('.tab:nth-child(2)');
        await shot(page, `panel-${id}-${wd}x${ht}`);
        const r = await page.evaluate(() => { const d = document.querySelector('.drawer').getBoundingClientRect(); const b = document.querySelector('.drawer-body'); const cards = [...b.querySelectorAll('.card,.slot,.pill,.tab')].filter((e) => { const q = e.getBoundingClientRect(); return q.right > d.right - 4 || q.left < d.left; }).length; return { d: [d.left, d.top, d.right, d.bottom].map(Math.round), vw: innerWidth, vh: innerHeight, sw: b.scrollWidth, cw: b.clientWidth, sh: b.scrollHeight, ch: b.clientHeight, out: cards }; });
        console.log(wd, ht, id, JSON.stringify(r));
        await page.click(`[data-panel="${id}"]`);
      }
      await page.context().close();
    }
  }
  if (scenario === 'use') {
    const page = await open('', { width: 1024, height: 768 });
    const spawn = (def, x) => page.evaluate(([d, px]) => { const g = window.__game; const r = g.rules.spawnItem(g.game.world, d, { kind: 'room', roomId: 'living', x: px, y: 850 }); g.game.commit(r); return r.info.instanceId; }, [def, x]);
    const cup = await spawn('cup', 700);
    await page.evaluate((id) => window.__game.game.commit(window.__game.rules.fill(window.__game.game.world, id, 'milk')), cup);
    await shot(page, 'use-01-cup-full');
    const go = async (id, name, delay) => {
      const from = await at(page, id, -8), to = await at(page, 'hero_mila', -200);
      await page.mouse.move(from[0], from[1]); await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
      await page.mouse.up(); await wait(delay);
      const h = await at(page, 'hero_mila', -120);
      await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: h[0] - 150, y: h[1] - 170, width: 300, height: 300 } }); console.log('shot', name);
      await page.waitForFunction(() => !window.__game.scene.busy); await wait(300);
    };
    await go(cup, 'use-02-drinking', 200);
    await shot(page, 'use-03-cup-in-hand');
    await go(await spawn('toothbrush', 760), 'use-04-brushing', 350);
    await go(await spawn('comb', 820), 'use-05-combing', 350);
    await go(await spawn('apple', 880), 'use-06-eating', 200);
  }
  if (scenario === 'map') {
    for (const [wd, ht] of [[1024, 768], [768, 1024], [1280, 720]]) {
      const ctx = await browser.newContext({ viewport: { width: wd, height: ht }, deviceScaleFactor: 1, hasTouch: true });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForFunction(() => !!window.__game);
      await page.click('#play');
      await wait(800);
      await shot(page, `map-front-${wd}x${ht}`);
      if (wd === 1024) { await page.click('.map-turn.right'); await wait(250); await shot(page, 'map-turning'); await wait(500); await shot(page, 'map-back'); }
      await ctx.close();
    }
  }
  if (scenario === 'loc') {
    const page = await open(process.argv[3] === 'debug' ? '?debug=anchors' : '', { width: 1024, height: 576 });
    for (const r of ['park', 'park_games', 'cafe', 'cafe_bakery', 'toys', 'toys_workshop', 'beach', 'beach_boats', 'club']) {
      await page.evaluate((room) => { const g = window.__game; g.game.commit(g.rules.travel(g.game.world, room, room === 'club' || room === 'park' ? ['hero_mila', 'hero_timur'] : [])); g.scene.setZoom(0.1); }, r);
      if (r === 'club') await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.placeCharacter(g.game.world, 'hero_mila', { furnitureId: 'cl_dj', slot: 0 })); });
      if (r === 'park') await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.placeCharacter(g.game.world, 'hero_mila', { furnitureId: 'pk_carousel', slot: 0 })); g.game.commit(g.rules.placeCharacter(g.game.world, 'hero_timur', { furnitureId: 'pk_carousel', slot: 1 })); });
      await wait(900);
      await shot(page, `loc-${r}`);
    }
  }
  if (scenario === 'carousel') {
    const page = await open('', { width: 1024, height: 768 });
    const clip = async () => { const c = await roomPt(page, 861, 300); return { x: c[0] - 300, y: c[1] - 300, width: 600, height: 600 }; };
    const seat = (slot, hero = 'hero_mila') => page.evaluate(([slot, hero]) => { const g = window.__game; g.game.commit(g.rules.placeCharacter(g.game.world, hero, { furnitureId: 'pk_carousel', slot })); }, [slot, hero]);
    await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.travel(g.game.world, 'park', ['hero_mila', 'hero_timur'])); g.scene.setZoom(0.1); });
    await wait(900);
    await page.screenshot({ path: `${OUT}/carousel-empty.png`, clip: await clip() });
    await seat(0); await wait(700);
    await page.screenshot({ path: `${OUT}/carousel-mila-near.png`, clip: await clip() });
    await seat(1); await wait(700);
    await page.screenshot({ path: `${OUT}/carousel-mila-far.png`, clip: await clip() });
    await seat(0); await seat(1, 'hero_timur'); await wait(700);
    await page.screenshot({ path: `${OUT}/carousel-two.png`, clip: await clip() });
    await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.placeCharacter(g.game.world, 'hero_timur', { x: 300, y: 800 })); g.game.commit(g.rules.setFurnitureOn(g.game.world, 'pk_carousel', 1)); });
    for (let i = 0; i < 12; i++) { await wait(750); await page.screenshot({ path: `${OUT}/carousel-spin-${String(i).padStart(2, '0')}.png`, clip: await clip() }); }
    console.log('shot carousel');
  }
  if (scenario === 'props') {
    const page = await open('', { width: 1024, height: 576 });
    const go = (room, heroes = []) => page.evaluate(([r, h]) => { const g = window.__game; g.game.commit(g.rules.travel(g.game.world, r, h)); g.scene.setZoom(0.1); }, [room, heroes]);
    const seat = (hero, furn, slot = 0) => page.evaluate(([h, f, s]) => { const g = window.__game; g.game.commit(g.rules.placeCharacter(g.game.world, h, { furnitureId: f, slot: s })); }, [hero, furn, slot]);
    await go('beach', ['hero_mila', 'hero_timur']); await seat('hero_mila', 'bc_lounger'); await wait(900); await shot(page, 'props-beach');
    await go('beach_boats', ['hero_mila', 'hero_timur']); await seat('hero_mila', 'bb_boat', 0); await seat('hero_timur', 'bb_boat', 1); await wait(900); await shot(page, 'props-boat');
    await go('club', ['hero_mila', 'hero_timur']); await seat('hero_mila', 'cl_dj'); await seat('hero_timur', 'cl_stool'); await wait(900); await shot(page, 'props-club');
    await go('park_games'); await wait(900); await shot(page, 'props-games');
    await page.evaluate(() => { const g = window.__game; g.game.update((w) => { for (const p of Object.values(w.pets)) if (['pet_cat', 'pet_dog', 'pet_rabbit'].includes(p.id)) { p.roomId = 'animals'; } w.pets.pet_cat.x = 300; w.pets.pet_cat.y = 830; w.pets.pet_dog.x = 480; w.pets.pet_dog.y = 720; w.pets.pet_rabbit.x = 1380; w.pets.pet_rabbit.y = 700; }); });
    await go('animals'); await wait(900); await shot(page, 'props-animals');
    // мячик: бросаем рядом с бульдогом
    const ball = await find(page, 'pet_rope_ball', 'room');
    await drag(page, await at(page, ball, -15), await roomPt(page, 1050, 860));
    await wait(350); await shot(page, 'props-animals-ball-run'); await wait(1800); await shot(page, 'props-animals-ball-done');
    for (const r of ['toys', 'cafe', 'cafe_bakery']) { await go(r); await wait(700); await shot(page, `props-${r}`); }
  }
  if (scenario === 'party') {
    const page = await open('', { width: 1024, height: 576 });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    // мастерская: игрушка в коробке, бант завязан, коробка у Милы
    await ev(() => { const g = window.__game; g.game.commit(g.rules.travel(g.game.world, 'toys_workshop', ['hero_mila'])); g.scene.setZoom(0.1); const w = g.game.world; const box = Object.values(w.items).find((i) => i.definitionId === 'giftbox' && i.owner.roomId === 'toys_workshop'); const toy = Object.values(w.items).find((i) => i.definitionId === 'toy_jack_box'); g.game.commit(g.rules.moveItem(g.game.world, toy.instanceId, { kind: 'item', itemId: box.instanceId, slot: 0 })); g.game.commit(g.rules.wrapGift(g.game.world, box.instanceId)); window.__box = box.instanceId; });
    await wait(700); await shot(page, 'party-1-workshop');
    await ev(() => { const g = window.__game; g.game.commit(g.rules.moveItem(g.game.world, window.__box, { kind: 'hand', characterId: 'hero_mila', slot: 'left' })); g.game.update((w) => { for (const [id, x, y] of [['hero_lev', 1090, 760], ['hero_nora', 560, 830], ['hero_asya', 980, 850]]) Object.assign(w.characters[id], { roomId: 'club', x, y, pose: 'standing', seat: null }); w.rooms.club.visited = true; }); g.game.commit(g.rules.travel(g.game.world, 'club', ['hero_mila'])); g.game.update((w) => { w.characters.hero_mila.x = 330; w.characters.hero_mila.y = 840; const c = Object.values(w.items).find((i) => i.definitionId === 'cupcake'); c.owner = { kind: 'surface', furnitureId: 'cl_table', slot: 1 }; }); g.scene.setZoom(0.1); });
    await wait(900);
    await drag(page, await at(page, await ev(() => window.__box), -40), await at(page, 'hero_nora', -60));
    await wait(700); await shot(page, 'party-2-gift');
    await wait(2500);
    await drag(page, await at(page, 'hero_mila', -120), await roomPt(page, 800, 628));
    await wait(1300); await shot(page, 'party-3-dj');
  }
  if (scenario === 'carouselvid') {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, hasTouch: true, recordVideo: { dir: `${OUT}/video-carousel`, size: { width: 1024, height: 768 } } });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:4173/');
    await page.waitForFunction(() => !!window.__game);
    await page.evaluate(() => window.__game.game.update((w) => { w.settings.tutorialDone = true; }));
    await page.click('#play');
    await page.evaluate(() => { const g = window.__game; g.map.enter('houses'); g.game.commit(g.rules.travel(g.game.world, 'park', ['hero_mila'])); g.scene.setZoom(0.1); });
    await wait(1200);
    const seat = () => page.evaluate(() => { const g = window.__game; const p = g.geometry.seatPos(g.game.world.furniture.pk_carousel, 0); const s = g.scene.toScreen({ x: p.x, y: p.y - 70 * p.s }); return [s.x, s.y]; });
    await drag(page, await at(page, 'hero_mila', -120), await seat()); // Мила садится на лошадку
    await wait(1200);
    const tap = await roomPt(page, 861, 150);
    await page.touchscreen.tap(tap[0], tap[1]); // поехали
    await wait(13000);
    await drag(page, await at(page, 'hero_mila', -30), await roomPt(page, 330, 760)); // сняли на ходу
    await wait(2500);
    await drag(page, await at(page, 'hero_mila', -120), await seat()); // и посадили обратно
    await wait(4000);
    await page.touchscreen.tap(tap[0], tap[1]); // плавная остановка
    await wait(5000);
    const v = page.video();
    await ctx.close();
    console.log('video', await v.path());
  }
  if (scenario === 'dance') {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 576 }, deviceScaleFactor: 1, hasTouch: true, recordVideo: { dir: `${OUT}/video`, size: { width: 1024, height: 576 } } });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:4173/');
    await page.waitForFunction(() => !!window.__game);
    await page.evaluate(() => window.__game.game.update((w) => { w.settings.tutorialDone = true; w.rooms.club.visited = true; const put = (id, x, y) => Object.assign(w.characters[id], { roomId: 'club', x, y, pose: 'standing', seat: null }); put('hero_mila', 1150, 840); put('hero_timur', 480, 830); put('hero_lev', 700, 850); w.currentRoomId = 'club'; }));
    await page.click('#play'); await page.evaluate(() => window.__game.map.enter('club'));
    await page.evaluate(() => window.__game.scene.setZoom(0.1));
    await page.waitForFunction(() => window.__game.audio.musicState().loaded[1], null, { timeout: 30000 });
    await wait(800);
    const t0 = Date.now();
    await drag(page, await at(page, 'hero_mila', -120), await roomPt(page, 800, 628)); // Мила — за пульт
    await page.waitForFunction(() => window.__game.scene.dancing.length === 2);
    await wait(6000);
    await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.wearSet(g.game.world, 'hero_timur', 'dragon')); g.game.commit(g.rules.wearSet(g.game.world, 'hero_lev', 'astronaut')); }); // переодели на танцполе
    await wait(6000);
    await drag(page, await at(page, 'hero_lev', -120), await roomPt(page, 300, 720)); // Льва сажаем на пуфик
    await wait(4500);
    await drag(page, await at(page, 'hero_mila', -150), await roomPt(page, 1150, 840)); // музыка остановилась
    await wait(2500);
    console.log('video seconds', (Date.now() - t0) / 1000);
    const v = page.video();
    await ctx.close();
    console.log('video', await v.path());
  }
  if (scenario === 'outfits') {
    const page = await open('', { width: 1024, height: 576 });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const clip = async (hero, name, h = 330) => { const c = await at(page, hero, -110); await wait(700); await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: Math.max(0, c[0] - 190), y: Math.max(0, c[1] - 190), width: 380, height: h } }); console.log('shot', name); };
    await ev(() => { const g = window.__game; g.game.commit(g.rules.wearSet(g.game.world, 'hero_mila', 'dj')); g.game.commit(g.rules.wearSet(g.game.world, 'hero_timur', 'confectioner')); g.game.update((w) => { w.rooms.club.visited = true; }); g.game.commit(g.rules.travel(g.game.world, 'club', ['hero_mila'])); g.scene.setZoom(0.1); g.game.commit(g.rules.placeCharacter(g.game.world, 'hero_mila', { furnitureId: 'cl_dj', slot: 0 })); });
    await clip('hero_mila', 'outfit-mila-dj-stand');
    await ev(() => { const g = window.__game; g.game.commit(g.rules.placeCharacter(g.game.world, 'hero_mila', { furnitureId: 'cl_stool', slot: 0 })); });
    await clip('hero_mila', 'outfit-mila-dj-sit');
    await ev(() => { const g = window.__game; g.game.commit(g.rules.storeFurniture(g.game.world, 'kt_chair1')); g.game.commit(g.rules.unstoreFurniture(g.game.world, 'kt_chair1', 'cafe_bakery')); g.game.commit(g.rules.travel(g.game.world, 'cafe_bakery', ['hero_timur'])); g.game.commit(g.rules.moveFurniture(g.game.world, 'kt_chair1', 1100, 800)); g.game.update((w) => { w.characters.hero_timur.x = 760; w.characters.hero_timur.y = 820; }); g.scene.setZoom(0.1); });
    await clip('hero_timur', 'outfit-timur-confectioner-stand');
    await ev(() => { const g = window.__game; g.game.commit(g.rules.placeCharacter(g.game.world, 'hero_timur', { furnitureId: 'kt_chair1', slot: 0 })); });
    await clip('hero_timur', 'outfit-timur-confectioner-sit');
  }
  if (scenario === 'clubfx') {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 576 }, deviceScaleFactor: 1, hasTouch: true, recordVideo: { dir: `${OUT}/video-fx`, size: { width: 1024, height: 576 } } });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:4173/');
    await page.waitForFunction(() => !!window.__game);
    await page.evaluate(() => window.__game.game.update((w) => { w.settings.tutorialDone = true; w.rooms.club.visited = true; const put = (id, x, y) => Object.assign(w.characters[id], { roomId: 'club', x, y, pose: 'standing', seat: null }); put('hero_mila', 1320, 850); put('hero_timur', 520, 840); put('hero_lev', 760, 850); w.currentRoomId = 'club'; }));
    await page.click('#play'); await page.evaluate(() => window.__game.map.enter('club'));
    await page.evaluate(() => window.__game.scene.setZoom(0.1));
    await page.waitForFunction(() => window.__game.audio.musicState().loaded[1], null, { timeout: 30000 });
    await wait(1200);
    await page.mouse.click(...(await roomPt(page, 799, 181))); await wait(4500); // шар
    await page.screenshot({ path: `${OUT}/clubfx-ball.png` });
    await page.mouse.click(...(await at(page, 'cl_light', -90))); await wait(4000); // прожектор
    await page.screenshot({ path: `${OUT}/clubfx-stars.png` });
    await drag(page, await at(page, 'hero_mila', -120), await roomPt(page, 800, 628)); await wait(7000); // DJ: колонка и танцы
    await page.screenshot({ path: `${OUT}/clubfx-all.png` });
    await drag(page, await at(page, 'hero_mila', -150), await roomPt(page, 1320, 850)); await wait(2500);
    await page.mouse.click(...(await roomPt(page, 799, 181))); await wait(2000);
    const v = page.video(); await ctx.close(); console.log('video', await v.path());
  }
  if (scenario === 'frame') {
    const base = process.argv[3] ?? 'http://127.0.0.1:4173/', tag = process.argv[4] ?? 'after';
    for (const [wd, ht] of [[1024, 768], [1280, 720]]) {
      const ctx = await browser.newContext({ viewport: { width: wd, height: ht }, deviceScaleFactor: 1, hasTouch: true });
      const page = await ctx.newPage();
      await page.goto(base);
      await page.waitForFunction(() => !!window.__game);
      await page.evaluate(() => window.__game.game.update((w) => { w.settings.tutorialDone = true; }));
      await page.click('#play'); await page.evaluate(() => window.__game.map.enter('houses'));
      for (const room of ['park_games', 'club', 'cafe', 'living']) {
        await page.evaluate((r) => { const g = window.__game; if (g.game.world.currentRoomId !== r) g.game.commit(g.rules.travel(g.game.world, r, r === 'park_games' ? ['hero_mila', 'hero_timur'] : [])); g.scene.setZoom(1); }, room);
        await wait(800); await page.screenshot({ path: `${OUT}/frame-${tag}-${room}-${wd}x${ht}-default.png` });
        await page.evaluate(() => window.__game.scene.setZoom(0.1));
        await wait(500); await page.screenshot({ path: `${OUT}/frame-${tag}-${room}-${wd}x${ht}-far.png` });
      }
      await ctx.close();
    }
    console.log('frames', tag);
  }
  if (scenario === 'bowl') {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, hasTouch: true, recordVideo: { dir: `${OUT}/video-bowl`, size: { width: 1024, height: 768 } } });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:4173/');
    await page.waitForFunction(() => !!window.__game);
    await page.evaluate(() => window.__game.game.update((w) => { w.settings.tutorialDone = true; w.rooms.animals.visited = true; w.furniture.an_tunnel.roomId = null; w.pets.pet_frenchie.x = 1100; w.pets.pet_frenchie.y = 760; w.pets.pet_capybara.x = 1300; w.pets.pet_wolf.x = 1450; for (const it of Object.values(w.items)) { if (it.definitionId === 'pet_double_bowl') it.owner = { kind: 'room', roomId: 'animals', x: 760, y: 840 }; if (it.definitionId === 'pet_food_bag') it.owner = { kind: 'room', roomId: 'animals', x: 520, y: 850 }; if (['kibble', 'pet_rope_ball', 'pet_grooming_brush'].includes(it.definitionId)) it.owner = { kind: 'room', roomId: 'animals', x: 1500, y: 860 }; } w.currentRoomId = 'animals'; }));
    await page.evaluate(() => { const g = window.__game; const r = g.rules.spawnItem(g.game.world, 'teapot', { kind: 'room', roomId: 'animals', x: 640, y: 780 }); g.game.commit(r); window.__pot = r.info.instanceId; });
    await page.click('#play'); await page.evaluate(() => window.__game.map.enter('animals'));
    await page.evaluate(() => window.__game.scene.setZoom(1.25, { x: 512, y: 700 })); await wait(1200);
    const bowl = await find(page, 'pet_double_bowl', 'room'), bag = await find(page, 'pet_food_bag', 'room'), pot = await page.evaluate(() => window.__pot);
    const half = async (dx) => { const p = await at(page, bowl, -30); return [p[0] + dx, p[1]]; };
    const idle = () => page.waitForFunction(() => !window.__game.scene.busy);
    await drag(page, await at(page, bag, -40), await half(16)); await idle(); await wait(900);
    await drag(page, await at(page, pot, -25), await half(-16)); await idle(); await wait(900);
    await page.screenshot({ path: `${OUT}/bowl-full.png` });
    await drag(page, await at(page, 'pet_frenchie', -50), await roomPt(page, 880, 840)); await wait(2600);
    await drag(page, await at(page, 'pet_frenchie', -50), await roomPt(page, 1100, 760)); await wait(500);
    await drag(page, await at(page, 'pet_frenchie', -50), await roomPt(page, 880, 840)); await wait(2600);
    await drag(page, await at(page, 'pet_frenchie', -50), await roomPt(page, 1100, 760)); await wait(500);
    await drag(page, await at(page, bag, -40), await half(16)); await idle(); await wait(600);
    await drag(page, await at(page, pot, -25), await half(-16)); await idle(); await wait(1200);
    const v = page.video(); await ctx.close(); console.log('video', await v.path());
  }
  if (scenario === 'ideas') {
    const page = await open('', { width: 1024, height: 768 });
    await page.evaluate(() => window.__game.game.update((w) => { for (const [id, it] of Object.entries(w.items)) if (['giftbox', 'cupcake', 'pet_rope_ball', 'pet_double_bowl', 'pet_food_bag'].includes(it.definitionId)) delete w.items[id]; }));
    await page.click('[data-panel="ideas"]');
    await page.locator('.card.idea[data-idea="party"]').scrollIntoViewIfNeeded();
    await page.click('.card.idea[data-idea="party"] .pill'); await page.click('.card.idea[data-idea="pets"] .pill');
    await page.locator('.card.idea[data-idea="party"]').scrollIntoViewIfNeeded();
    await shot(page, 'ideas-panel');
    await page.click('[data-panel="ideas"]');
    for (const r of ['cafe_bakery', 'toys_workshop', 'animals']) { await page.evaluate((room) => { const g = window.__game; g.game.commit(g.rules.travel(g.game.world, room, [])); g.scene.setZoom(0.1); }, r); await wait(800); await shot(page, `ideas-${r}`); }
  }
  if (scenario === 'farm') {
    const page = await open('', { width: 1024, height: 768 });
    const go = (room) => page.evaluate((r) => { const g = window.__game; g.game.commit(g.rules.travel(g.game.world, r, [])); g.scene.setZoom(1); g.scene.panBy(0, 0); }, room);
    await go('farm_yard'); await wait(900); await shot(page, 'farm-yard');
    await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.fillFeeder(g.game.world, 'fy_grain')); g.game.commit(g.rules.waterBed(g.game.world, 'fy_bed1')); g.game.commit(g.rules.waterBed(g.game.world, 'fy_bed2')); g.game.commit(g.rules.waterBed(g.game.world, 'fy_bed2')); g.scene.setZoom(0.1); });
    await wait(700); await shot(page, 'farm-yard-far');
    await go('farm_barn'); await wait(900); await shot(page, 'farm-barn');
    await page.evaluate(() => { const g = window.__game; g.game.commit(g.rules.fillFeeder(g.game.world, 'fb_trough')); g.scene.setZoom(0.1); });
    await wait(700); await shot(page, 'farm-barn-far');
    await page.click('#tomap'); await wait(500); await page.click('.map-turn.right'); await wait(900); await shot(page, 'farm-map-back');
  }
  if (scenario === 'farmx') {
    const page = await open('', { width: 1024, height: 768 });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    await ev(() => { const g = window.__game; g.game.commit(g.rules.travel(g.game.world, 'farm_yard', [])); g.scene.setZoom(0.1); });
    await wait(900); await shot(page, 'farmx-yard');
    await ev(() => { const g = window.__game; g.game.commit(g.rules.storeFurniture(g.game.world, 'kt_chair1')); g.game.commit(g.rules.unstoreFurniture(g.game.world, 'kt_chair1', 'farm_yard')); g.game.commit(g.rules.moveFurniture(g.game.world, 'kt_chair1', 1120, 800)); });
    const strip = [];
    for (const set of ['farmer_work', 'farmer_rain', 'farmer_harvest']) for (const sit of [false, true]) {
      await ev(([st, s]) => { const g = window.__game; g.game.commit(g.rules.wearSet(g.game.world, 'farm_worker_lev', st)); g.game.commit(s ? g.rules.placeCharacter(g.game.world, 'farm_worker_lev', { furnitureId: 'kt_chair1', slot: 0 }) : g.rules.placeCharacter(g.game.world, 'farm_worker_lev', { x: 860, y: 810 })); }, [set, sit]);
      await wait(700);
      const c = await at(page, 'farm_worker_lev', sit ? -70 : -110);
      const name = `farmx-lev-${set}-${sit ? 'sit' : 'stand'}`;
      await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: c[0] - 110, y: c[1] - 150, width: 220, height: 300 } }); strip.push(name);
    }
    console.log(strip.join(','));
    await ev(() => { const g = window.__game; g.game.commit(g.rules.travel(g.game.world, 'farm_pen', [])); g.scene.setZoom(0.1); });
    await wait(900); await shot(page, 'farmx-pen');
    await page.mouse.click(...(await at(page, 'farm_kangaroo_adult', -80))); await wait(170); await shot(page, 'farmx-pen-hop');
  }
  if (scenario === 'six' || scenario === 'all') {
    const page = await open('', { width: 1600, height: 900 });
    await page.evaluate(() => { const g = window.__game; const R = g.rules; const put = [['hero_mila', 330, 860, 'fairy', 'delight'], ['hero_timur', 560, 850, 'pirate', 'silly'], ['hero_yuki', 800, 860, 'casual', 'joy'], ['hero_asya', 1040, 850, 'cat', 'surprise'], ['hero_lev', 1270, 860, 'astronaut', 'calm'], ['hero_nora', 1480, 850, 'princess', 'thinking']];
      for (const [id, x, y, set, emo] of put) { g.game.commit(R.wearSet(g.game.world, id, set)); g.game.update((w) => { Object.assign(w.characters[id], { roomId: 'living', x, y, emotion: emo }); }); } });
    await wait(900); await shot(page, 'six-heroes');
    await page.evaluate(() => { const g = window.__game; for (const [id, slot] of [['hero_yuki', 0], ['hero_mila', 1], ['hero_timur', 2]]) g.game.commit(g.rules.placeCharacter(g.game.world, id, { furnitureId: 'lv_sofa', slot })); g.game.commit(g.rules.wearSet(g.game.world, 'hero_yuki', 'winter')); g.game.commit(g.rules.setEmotion(g.game.world, 'hero_yuki', 'delight')); });
    await wait(900); await shot(page, 'six-heroes-sofa');
  }
} finally {
  await browser.close();
  server.kill();
  if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
}
export { at, roomPt, drag, find, shot };
