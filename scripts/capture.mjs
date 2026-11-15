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
