import './style.css';
import { GameAudio } from './audio/audio';
import { Game } from './game/game';
import * as rules from './game/rules';
import { createWorld, repairWorld, validateWorld } from './game/world';
import type { World } from './game/types';
import { setLang, t } from './i18n';
import { Input } from './scene/input';
import { Play } from './scene/play';
import { Scene } from './scene/scene';
import { Talk } from './scene/talk';
import { IdbKV, K_WORLD, MemoryKV, Saver, loadWorld, quarantine, type KV } from './storage/store';
import { Hud } from './ui/hud';
import { Panels } from './ui/panels';
import { Offline } from './storage/offline';

const stage = document.getElementById('stage')!;
const ui = document.getElementById('ui')!;

/** Одна активная игровая сессия: вторая вкладка не затирает мир первой. */
async function acquireTab(): Promise<boolean> {
  if (!('locks' in navigator)) return true;
  return new Promise((resolve) => {
    void navigator.locks.request('gorodok-chudes-session', { ifAvailable: true }, (lock) => {
      if (!lock) { resolve(false); return undefined; }
      resolve(true);
      return new Promise<void>(() => undefined); // держим блокировку, пока вкладка жива
    });
  });
}

function message(text: string, buttons: [string, () => void][]) {
  const box = document.createElement('div');
  box.className = 'title';
  box.innerHTML = `<div class="title-card"><p>${text}</p><div class="row"></div></div>`;
  for (const [label, fn] of buttons) { const b = document.createElement('button'); b.className = 'pill'; b.textContent = label; b.onclick = () => { box.remove(); fn(); }; box.querySelector('.row')!.append(b); }
  ui.append(box);
}

async function boot() {
  if (!(await acquireTab())) { message(t('tab.busy'), [[t('tab.retry'), () => void boot()]]); return; }
  let kv: KV;
  try { kv = new IdbKV(); await kv.get(K_WORLD); } catch { kv = new MemoryKV(); } // приватный режим без IndexedDB: играем в памяти
  const loaded = await loadWorld(kv).catch(() => ({ status: 'empty' as const }));
  const start = (world: World) => void run(kv, world);
  if (loaded.status === 'ok') start(loaded.world);
  else if (loaded.status === 'empty') start(createWorld());
  else {
    // белого экрана нет: предлагаем копию или новый мир, старое уходит в карантин, а не удаляется
    const buttons: [string, () => void][] = [];
    if (loaded.backup) buttons.push([t('recover.backup'), () => void quarantine(kv).then(() => start(loaded.backup!))]);
    buttons.push([t('recover.fresh'), () => void quarantine(kv).then(() => start(createWorld()))]);
    message(`<b>${t('recover.title')}</b><br>${t('recover.text')}`, buttons);
  }
}

async function run(kv: KV, initial: World) {
  let world = initial;
  if (validateWorld(world).length) world = repairWorld(world);
  setLang(world.settings.lang);
  const audio = new GameAudio();
  const scene = new Scene();
  await scene.init(stage);
  let hud: Hud | null = null;
  const saver = new Saver(kv, (s) => hud?.setSave(s));
  const game = new Game(world, saver);
  hud = new Hud(ui, game, scene, audio);
  const theHud = hud;
  let panels: Panels | null = null;
  const play = new Play(game, scene, audio, {
    toast: (k) => theHud.toast(k),
    selectionChanged: (s) => { theHud.selectionChanged(s); if (panels?.open === 'decorate') panels.render(); },
    openWardrobe: () => { if (panels && panels.open !== 'heroes') panels.toggle('heroes'); },
    openItemMenu: (id) => theHud.openItemMenu(id),
    tutorialEvent: (ev) => theHud.tutorialEvent(ev),
  });
  hud.play = play;
  const talk = new Talk(game, scene, audio, { showBubble: (id, text) => theHud.showBubble(id, text), hideBubble: () => theHud.hideBubble() });
  play.talk = talk;
  document.addEventListener('visibilitychange', () => { if (document.hidden) talk.stop(); });
  const offline = new Offline(() => { if (panels?.open === 'settings') panels.render(); });
  panels = new Panels(ui, game, scene, play, audio, offline, (k) => theHud.toast(k));
  const thePanels = panels;
  thePanels.onReplayTutorial = () => theHud.startTutorial();
  const input = new Input(scene, play);
  input.onDropUi = (el, target) => (el.dataset.drop === 'bag' && target.kind === 'item' ? thePanels.dropToBag(target.ref) : false);
  void offline.start();
  scene.reducedMotion = world.settings.reducedMotion;
  game.subscribe((w) => { scene.reducedMotion = w.settings.reducedMotion; scene.sync(w); if (w.settings.voices === false || w.settings.mute) { /* звук голоса гаснет сразу, пузырёк дочитывается */ } });
  scene.sync(game.world);
  hud.showTitle(true);
  hud.refresh();
  // сохранить перед уходом со страницы
  document.addEventListener('visibilitychange', () => { if (document.hidden) void game.flush(); });
  window.addEventListener('pagehide', () => void game.flush());
  // отладочный доступ для автоматических тестов
  (window as unknown as { __game: unknown }).__game = { game, scene, play, input, audio, rules, offline, talk };
}

void boot();
