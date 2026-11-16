import './style.css';
import { GameAudio } from './audio/audio';
import { Game } from './game/game';
import * as rules from './game/rules';
import * as geometry from './game/geometry';
import { FARMER_SPOT, createWorld, repairWorld, validateWorld } from './game/world';
import type { RoomId, World } from './game/types';
import { setLang, t } from './i18n';
import { Input } from './scene/input';
import { Play } from './scene/play';
import { Scene } from './scene/scene';
import { Talk } from './scene/talk';
import { FallbackKV, IdbKV, K_WORLD, LocalKV, MemoryKV, Saver, loadWorld, quarantine, type KV } from './storage/store';
import { Hud } from './ui/hud';
import { Panels } from './ui/panels';
import { Offline } from './storage/offline';
import { WorldMap } from './map/globe';
import { ROOM_GROUPS, charAllowedIn, groupOf } from './content/furniture';

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
  // основное хранилище — IndexedDB, запасное — localStorage; если нет ни того ни другого (приватный режим) — играем в памяти
  let spare: KV | null = null;
  try { localStorage.setItem('gorodok-chudes:probe', '1'); localStorage.removeItem('gorodok-chudes:probe'); spare = new LocalKV(); } catch { /* нет localStorage */ }
  try { const idb = new IdbKV(); await idb.get(K_WORLD); kv = spare ? new FallbackKV(idb, spare) : idb; }
  catch { kv = spare ?? new MemoryKV(); }
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
  let mapOpen = () => false;
  let world = initial;
  if (validateWorld(world).length) world = repairWorld(world);
  setLang(world.settings.lang);
  const audio = new GameAudio();
  const scene = new Scene();
  // фактический размер игровой области: на iPad после поворота и в установленной игре размеры окна запаздывают, поэтому перепроверяем несколько раз
  const fit = () => {
    const vv = window.visualViewport;
    const w = Math.round(vv?.width ?? window.innerWidth), h = Math.round(vv?.height ?? window.innerHeight);
    if (w < 50 || h < 50) return;
    document.documentElement.style.setProperty('--app-w', `${w}px`);
    document.documentElement.style.setProperty('--app-h', `${h}px`);
    scene.fit(w, h);
  };
  const refit = () => { fit(); for (const ms of [120, 400, 1000, 2000]) window.setTimeout(fit, ms); };
  document.documentElement.style.setProperty('--app-w', `${Math.round(window.visualViewport?.width ?? window.innerWidth)}px`);
  document.documentElement.style.setProperty('--app-h', `${Math.round(window.visualViewport?.height ?? window.innerHeight)}px`);
  await scene.init(stage);
  for (const ev of ['resize', 'orientationchange', 'pageshow']) window.addEventListener(ev, refit);
  window.visualViewport?.addEventListener('resize', refit);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refit(); });
  refit();
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
    djStart: () => { if (!mapOpen()) audio.setClub(true); },
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
  input.onDropUi = (el, target) => {
    if (target.kind === 'pet') return play.farmStay(target.ref); // зверя с фермы нельзя положить в сумку или унести за дверь и на карту
    return el.dataset.drop === 'bag' && target.kind === 'item' ? thePanels.dropToBag(target.ref) : false;
  };
  void offline.start();
  scene.reducedMotion = world.settings.reducedMotion;
  scene.zoom = world.settings.zoom ?? 1;
  scene.layout();
  input.onZoomEnd = () => theHud.saveZoom();
  game.subscribe((w) => { scene.reducedMotion = w.settings.reducedMotion; scene.sync(w); if (w.settings.voices === false || w.settings.mute) { /* звук голоса гаснет сразу, пузырёк дочитывается */ } });
  scene.sync(game.world);
  // «Мой город»: планета между заставкой и комнатами. Вход в место открывает его экраны; мир сохраняется как обычно.
  const lastRoom: Record<string, RoomId> = {};
  const map = new WorldMap(document.body, {
    enter: (place) => {
      const group = place.route ? ROOM_GROUPS[place.route] : undefined;
      if (!group) return;
      map.close();
      scene.app.start();
      const cur = game.world.currentRoomId;
      const target = group.includes(cur) ? cur : lastRoom[place.route!] ?? group[0];
      if (place.route === 'farm') {
        // при каждом входе на ферму Лев уже во дворе, сбоку от дорожки: тот же самый житель, не копия
        const lev = game.world.characters.farm_worker_lev;
        if (lev && lev.roomId !== FARMER_SPOT.roomId) game.update((w) => { Object.assign(w.characters.farm_worker_lev, { roomId: FARMER_SPOT.roomId, x: FARMER_SPOT.x, y: FARMER_SPOT.y, seat: null, pose: 'standing' }); }, true);
      }
      if (target === 'club') audio.preloadClub();
      if (target === 'club' && !game.world.rooms.club.visited) {
        // первый вход в клуб: три уже существующих героя ждут там — один у пульта, двое на танцполе. Копий нет; потом их можно увести куда угодно.
        game.update((w) => {
          const all = Object.values(w.characters).filter((c) => charAllowedIn(c.id, 'club')); // фермер остаётся на ферме
          const pick = [...all.filter((c) => c.roomId === null), ...all.filter((c) => c.roomId !== null && c.roomId !== w.currentRoomId && c.pose !== 'sleeping')].slice(0, 3); // тех, кто сейчас с игроком, не трогаем — их берут с собой
          const spots = [{ x: 1090, y: 740 }, { x: 420, y: 800 }, { x: 700, y: 840 }];
          pick.forEach((c, i) => { c.roomId = 'club'; c.x = spots[i].x; c.y = spots[i].y; c.seat = null; c.pose = 'standing'; c.flipped = i === 0; if (c.emotion === 'sleepy') c.emotion = 'joy'; });
          w.rooms.club.visited = true;
        }, true);
        theHud.askTravel(target); // героев из прежнего места можно взять с собой
      } else if (target === 'animals' && !game.world.rooms.animals.visited) {
        // первый вход в Парк животных: все шестеро зверей встречают игрока. Это те же питомцы, не копии; потом их можно унести обратно.
        game.update((w) => {
          const spots: Record<string, [number, number]> = { pet_cat: [300, 830], pet_dog: [480, 720], pet_rabbit: [1380, 700] };
          for (const [id, [x, y]] of Object.entries(spots)) { const p = w.pets[id]; if (p) { p.roomId = 'animals'; p.x = x; p.y = y; p.seat = null; p.sleeping = false; delete p.inItem; } }
          w.rooms.animals.visited = true;
        }, true);
        theHud.askTravel(target);
      } else if (target !== cur) {
        // в другое место можно взять героев с собой — тем же окошком, что и между комнатами
        theHud.askTravel(target); // само решает, спрашивать ли
      }
      scene.sync(game.world);
      theHud.enterRooms();
    },
    toast: (k) => theHud.toast(k),
    sound: (n) => audio.play(n),
    reducedMotion: () => game.world.settings.reducedMotion,
  });
  mapOpen = () => map.isOpen;
  const toMap = () => {
    input.cancel();
    talk.stop();
    play.select(null);
    if (thePanels.open) thePanels.toggle(thePanels.open);
    audio.setClub(false); // с карты клубная музыка не слышна
    void game.flush();
    scene.app.stop(); // комнаты не рисуются, пока открыта карта
    map.open();
  };
  hud.onPlay = toMap;
  hud.onToMap = toMap;
  // клубный трек звучит, только пока кто-то стоит за пультом и игрок в клубе; танцпол слегка качает героев в такт
  const djSeated = (w: World) => w.currentRoomId === 'club' && Object.values(w.characters).some((c) => c.roomId === 'club' && c.seat !== null && w.furniture[c.seat.furnitureId]?.definitionId === 'djconsole');
  game.subscribe((w) => {
    map.texts();
    lastRoom[groupOf(w.currentRoomId)] = w.currentRoomId;
    if (!djSeated(w) || w.settings.mute) audio.setClub(false);
  });
  // танцы: пока играет клубный трек, свободные стоящие герои на танцполе танцуют; диджей, сидящие и те, кого несут, — нет
  const dancers = () => {
    const w = game.world;
    if (!audio.musicState().club || map.isOpen || w.currentRoomId !== 'club') return [];
    return Object.values(w.characters).filter((c) => c.roomId === 'club' && c.pose === 'standing' && !c.seat).map((c) => c.id);
  };
  const syncDance = () => {
    scene.setBeat(audio.musicState().club && !map.isOpen && game.world.currentRoomId === 'club', 500); // 120 ударов в минуту — темп клубного трека
    scene.setDanceClock(audio.clubBeats()); // фаза танца — из положения звука
    scene.setDancers(dancers(), 500);
  };
  window.setInterval(syncDance, 200);
  game.subscribe(syncDance);
  hud.showTitle(true);
  hud.refresh();
  // сохранить перед уходом со страницы
  document.addEventListener('visibilitychange', () => { if (document.hidden) void game.flush(); });
  window.addEventListener('pagehide', () => void game.flush());
  // отладочный доступ для автоматических тестов
  (window as unknown as { __game: unknown }).__game = { game, scene, play, input, audio, rules, geometry, offline, talk, map };
}

void boot();
