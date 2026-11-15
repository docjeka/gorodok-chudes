// Интерфейс поверх сцены (HTML/CSS): титульный экран, комнаты, панель героя, кнопки готовки, подсказки.
import { toSvg } from '../art/base';
import { eyeArt, eyeStateFor, mouthArt } from '../art/face';
import { ROOM_IDS } from '../content/furniture';
import { HERO_COSTUMES, OUTFIT_SETS } from '../content/wardrobe';
import type { Game } from '../game/game';
import { charPos, itemPlace } from '../game/geometry';
import { flipCharacter, setEmotion, wearSet } from '../game/rules';
import type { Emotion, RoomId } from '../game/types';
import { t, type Key } from '../i18n';
import type { Play, Selection } from '../scene/play';
import type { Scene } from '../scene/scene';
import type { SaveState } from '../storage/store';
import type { GameAudio } from '../audio/audio';
import { ITEMS } from '../content/items';
import { moveItem, wrapGift } from '../game/rules';
import { heroThumb, itemThumb } from './panels';

const EMOTIONS: Emotion[] = ['joy', 'delight', 'surprise', 'calm', 'silly', 'thinking', 'sleepy', 'sad'];
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

const ICON = {
  living: '<path d="M6 22v-7a3 3 0 0 1 6 0v2h16v-2a3 3 0 0 1 6 0v7zM10 14v-3a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v3"/>',
  kitchen: '<path d="M12 6v10a4 4 0 0 0 8 0V6M16 6v26M28 6c-4 4-4 12 0 14v12"/>',
  bedroom: '<path d="M5 30V10M5 24h30v6M5 18h12a4 4 0 0 1 4 4v2M21 24v-3a3 3 0 0 1 3-3h7a4 4 0 0 1 4 4v2"/>',
  bathroom: '<path d="M5 20h30v3a8 8 0 0 1-8 8H13a8 8 0 0 1-8-8zM10 20V9a3 3 0 0 1 6 0M12 31l-2 4M28 31l2 4"/>',
  sound: '<path d="M6 16v8h6l8 7V9l-8 7zM26 14a8 8 0 0 1 0 12M30 10a14 14 0 0 1 0 20"/>',
  mute: '<path d="M6 16v8h6l8 7V9l-8 7zM26 15l8 10M34 15l-8 10"/>',
  zoomOut: '<circle cx="17" cy="17" r="10"/><path d="M25 25l9 9M12 17h10"/>',
  zoomIn: '<circle cx="17" cy="17" r="10"/><path d="M25 25l9 9M12 17h10M17 12v10"/>',
  prev: '<path d="M24 8L12 20l12 12"/>',
  next: '<path d="M16 8l12 12-12 12"/>',
  flip: '<path d="M20 6v28M14 12L5 20l9 8zM26 12l9 8-9 8z"/>',
  globe: '<circle cx="20" cy="20" r="14"/><path d="M6 20h28M20 6c-7 8-7 20 0 28M20 6c7 8 7 20 0 28"/>',
  undo: '<path d="M14 10L6 18l8 8M6 18h18a10 10 0 0 1 0 20h-6"/>',
  cook: '<path d="M11 22a7 7 0 0 1 3-13 8 8 0 0 1 12 0 7 7 0 0 1 3 13v8H11zM11 26h18"/>',
  gift: '<path d="M6 16h28v6H6zM9 22h22v12H9zM20 16v18M20 16c-6 0-9-8-4-8s4 8 4 8c0 0 0-8 4-8s2 8-4 8"/>',
  ok: '<path d="M8 21l8 8 16-18"/>', dots: '<circle cx="10" cy="20" r="3"/><circle cx="20" cy="20" r="3"/><circle cx="30" cy="20" r="3"/>', warn: '<path d="M20 6l16 28H4zM20 16v9M20 29v1"/>',
};
const icon = (name: keyof typeof ICON) => `<svg viewBox="0 0 40 40" width="30" height="30" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

function emotionSvg(e: Emotion): string {
  const m = mouthArt(e);
  const eye = (side: -1 | 1) => { const a = eyeArt(0, eyeStateFor(e, side, false), side); return `<g transform="translate(${side * 13} -6)">${a.svg}</g>`; };
  return toSvg({ svg: `<circle cx="0" cy="2" r="30" fill="#ffe2c4" stroke="#5a4a5c" stroke-width="3"/>${eye(-1)}${eye(1)}<g transform="translate(0 14)">${m.svg}</g>`, x: -34, y: -32, w: 68, h: 68 }, 0.7);
}

export class Hud {
  private root: HTMLElement;
  private rooms = h('nav', 'rooms');
  private charBar = h('div', 'charbar hidden');
  private itemBar = h('div', 'itembar hidden');
  private cookLayer = h('div', 'cooklayer');
  private toastEl = h('div', 'toast hidden');
  private saveWarned = false;
  private saveEl = h('div', 'save');
  private soundBtn = h('button', 'round');
  private undoBtn = h('button', 'round');
  private zoomBtn = h('button', 'round');
  private mapBtn = h('button', 'round');
  private title = h('div', 'title');
  private travelEl = h('div', 'modal hidden');
  private bubble = h('div', 'bubble hidden');
  private bubbleHero = '';
  private tutEl = h('div', 'tutorial hidden');
  private tutStep = -1;
  private bookEl = h('div', 'modal hidden');
  private toastTimer = 0;
  private sel: Selection = null;
  play!: Play;

  constructor(host: HTMLElement, private game: Game, private scene: Scene, private audio: GameAudio) {
    this.root = host;
    const top = h('div', 'topbar');
    const right = h('div', 'topright');
    right.append(this.saveEl, this.mapBtn, this.zoomBtn, this.undoBtn, this.soundBtn);
    this.mapBtn.id = 'tomap';
    this.mapBtn.innerHTML = icon('globe');
    this.mapBtn.onclick = () => { this.audio.play('click'); this.onToMap?.(); };
    this.zoomBtn.onclick = () => {
      // кнопка переключает «вся комната целиком» и «крупно»; точнее — двумя пальцами
      const min = this.scene.minZoom;
      const far = this.scene.zoom <= min + 0.02;
      this.scene.setZoom(far ? (min < 0.98 ? 1 : 1.4) : min);
      this.audio.play('click');
      this.saveZoom();
    };
    top.append(this.rooms, right);
    host.append(this.tutEl, this.bookEl, top, this.cookLayer, this.bubble, this.charBar, this.itemBar, this.toastEl, this.travelEl, this.title);
    this.toastEl.setAttribute('role', 'status');
    this.soundBtn.onclick = () => { this.audio.unlock(); this.game.update((w) => { w.settings.mute = !w.settings.mute; }); };
    this.undoBtn.innerHTML = icon('undo');
    this.undoBtn.setAttribute('aria-label', t('hud.undo'));
    this.undoBtn.onclick = () => { if (this.game.undo()) this.audio.play('click'); };
    // окно не закрывается и не двигает сцену от нажатий внутри него
    for (const el of [this.charBar, this.itemBar, top, this.travelEl, this.bookEl]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.buildTitle();
    this.setSave('saved');
    game.subscribe(() => this.refresh());
    scene.app.ticker.add(() => this.follow());
    this.refresh();
  }

  private buildTitle() {
    this.title.innerHTML = `<div class="title-card"><img src="${import.meta.env.BASE_URL}icons/icon-192.png" width="96" height="96" alt=""><h1>${t('app.title')}</h1><button class="playbtn" id="play">${t('title.play')}</button></div>`;
    (this.title.querySelector('#play') as HTMLButtonElement).onclick = () => {
      this.audio.unlock();
      this.audio.play('pop');
      this.title.classList.add('hidden');
      if (this.onPlay) this.onPlay(); else this.enterRooms();
    };
  }
  /** «Играть» ведёт на карту города; если её нет — сразу в комнаты. */
  onPlay: (() => void) | null = null;
  onToMap: (() => void) | null = null;
  /** Вход в комнаты (с карты или сразу): здесь же начинается обучение. */
  enterRooms() {
    if (this.game.world.lastScreen !== 'room') this.game.update((w) => { w.lastScreen = 'room'; });
    if (!this.game.world.settings.tutorialDone && this.tutEl.classList.contains('hidden')) this.startTutorial();
  }
  saveZoom() {
    const z = Math.round(this.scene.zoom * 100) / 100;
    if (this.game.world.settings.zoom !== z) this.game.update((w) => { w.settings.zoom = z; });
    else this.refresh();
  }

  showTitle(show: boolean) { this.title.classList.toggle('hidden', !show); }

  toast(key: string) {
    this.toastEl.textContent = t(key as Key);
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), 2400);
  }

  setSave(s: SaveState) {
    this.saveEl.className = 'save ' + s;
    this.saveEl.innerHTML = icon(s === 'saved' ? 'ok' : s === 'saving' ? 'dots' : 'warn');
    this.saveEl.title = t(s === 'saved' ? 'save.saved' : s === 'saving' ? 'save.saving' : 'save.error');
    this.saveEl.setAttribute('aria-label', this.saveEl.title);
    if (s === 'error' && !this.saveWarned) { this.saveWarned = true; this.toast('save.error'); } // один раз за игру, дальше — только значок
  }

  // ---------- обучение: ненавязчивая рука, которую можно пропустить ----------
  startTutorial() {
    this.tutStep = 0;
    this.tutEl.innerHTML = `<div class="tut-hand"><svg viewBox="0 0 60 70" width="60" height="70"><path d="M22 34V10a6 6 0 0 1 12 0v18l14 4a8 8 0 0 1 6 9l-3 16a10 10 0 0 1-10 8H30a10 10 0 0 1-8-4L8 44a5 5 0 0 1 8-6z" fill="#fff" stroke="#5a4a5c" stroke-width="4" stroke-linejoin="round"/></svg></div><div class="tut-text"></div>`;
    const skip = h('button', 'pill small plain tut-skip', t('tut.skip'));
    skip.onclick = () => this.endTutorial();
    skip.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.tutEl.append(skip);
    this.tutEl.classList.remove('hidden');
  }
  private endTutorial() {
    this.tutStep = -1;
    this.tutEl.classList.add('hidden');
    if (!this.game.world.settings.tutorialDone) this.game.update((w) => { w.settings.tutorialDone = true; });
  }
  tutorialEvent(ev: 'item_in_hand' | 'hero_seated') {
    if (this.tutStep === 0 && ev === 'item_in_hand') this.tutStep = 1;
    else if (this.tutStep >= 0 && ev === 'hero_seated') this.endTutorial(); // после успешного действия подсказка исчезает
  }
  private followTutorial() {
    if (this.tutStep < 0) return;
    const w = this.game.world;
    const hero = Object.values(w.characters).find((c) => c.roomId === w.currentRoomId && c.pose === 'standing');
    const toy = Object.values(w.items).find((i) => i.owner.kind === 'room' && i.owner.roomId === w.currentRoomId);
    const sofa = Object.values(w.furniture).find((f) => f.roomId === w.currentRoomId && f.definitionId === 'sofa');
    let from: { x: number; y: number } | null = null, to: { x: number; y: number } | null = null;
    if (this.tutStep === 0 && hero && toy && toy.owner.kind === 'room') { from = { x: toy.owner.x, y: toy.owner.y - 20 }; to = { x: hero.x, y: hero.y - 90 }; }
    if (this.tutStep === 1 && hero && sofa) { from = { x: hero.x, y: hero.y - 130 }; to = { x: sofa.x, y: sofa.y - 150 }; }
    const hand = this.tutEl.querySelector<HTMLElement>('.tut-hand')!;
    const text = this.tutEl.querySelector<HTMLElement>('.tut-text')!;
    text.textContent = t(this.tutStep === 0 ? 'tut.step1' : 'tut.step2');
    if (!from || !to) { hand.style.opacity = '0'; return; }
    const k = (performance.now() % 2200) / 2200;
    const e = k < 0.15 ? 0 : k > 0.8 ? 1 : (k - 0.15) / 0.65;
    const a = this.scene.toScreen(from), b = this.scene.toScreen(to);
    hand.style.opacity = k > 0.92 ? '0' : '1';
    hand.style.transform = `translate(${Math.round(a.x + (b.x - a.x) * e - 22)}px, ${Math.round(a.y + (b.y - a.y) * e - 6)}px)`;
  }

  // ---------- книга ----------
  openBook(page = Math.floor(Math.random() * 3)) {
    const pics = [['apple', 'teddy'], ['rocket', 'robot'], ['cake', 'balloon']][page % 3];
    const n = (page % 3) + 1;
    this.bookEl.innerHTML = '';
    const card = h('div', 'book');
    card.innerHTML = `<div class="page">${itemThumb({ definitionId: pics[0], state: {} }, 120)}<p>${t(('book.' + n + 'a') as Key)}</p></div><div class="page">${itemThumb({ definitionId: pics[1], state: {} }, 120)}<p>${t(('book.' + n + 'b') as Key)}</p></div>`;
    const row = h('div', 'row');
    const next = h('button', 'pill plain', t('book.next'));
    next.onclick = () => { this.audio.play('click'); this.openBook(page + 1); };
    const close = h('button', 'pill', t('book.close'));
    close.onclick = () => { this.audio.play('put'); this.bookEl.classList.add('hidden'); };
    row.append(next, close);
    const wrap = h('div', 'bookwrap');
    wrap.append(card, row);
    this.bookEl.append(wrap);
    this.bookEl.classList.remove('hidden');
  }

  showBubble(heroId: string, text: string) { this.bubbleHero = heroId; this.bubble.textContent = text; this.bubble.classList.remove('hidden'); this.follow(); }
  hideBubble() { this.bubble.classList.add('hidden'); this.bubbleHero = ''; }

  selectionChanged(sel: Selection) { this.sel = sel; this.itemBar.classList.add('hidden'); this.refresh(); }

  openItemMenu(itemId: string) {
    const w = this.game.world;
    const it = w.items[itemId];
    if (!it) return;
    this.itemBar.innerHTML = '';
    const def = ITEMS[it.definitionId];
    const inside = Object.values(w.items).filter((i) => i.owner.kind === 'item' && i.owner.itemId === itemId);
    if (it.definitionId === 'book') {
      const b = h('button', 'pill', `<span>${t('item.read')}</span>`);
      b.onclick = () => { this.itemBar.classList.add('hidden'); this.audio.play('pop'); this.openBook(); };
      this.itemBar.append(b);
    } else if (it.definitionId === 'giftbox' && it.state.packed) {
      const b = h('button', 'pill', `${icon('gift')}<span>${t('item.openGift')}</span>`);
      b.onclick = () => { this.itemBar.classList.add('hidden'); this.play.openGiftBox(itemId); };
      this.itemBar.append(b);
    } else if (def.capacity) {
      // корзина или открытая коробка: показываем содержимое, вещь можно достать нажатием
      const row = h('div', 'contents');
      if (!inside.length) row.append(h('span', 'hint', t('item.empty')));
      for (const child of inside) {
        const b = h('button', 'slot small', itemThumb(child, 44));
        b.setAttribute('aria-label', t('item.takeOut'));
        b.onclick = () => { const p = this.play.spawnSpot(); if (this.game.commit(moveItem(this.game.world, child.instanceId, { kind: 'room', roomId: this.game.world.currentRoomId, x: p.x, y: p.y }))) { this.audio.play('pop'); this.openItemMenu(itemId); } };
        row.append(b);
      }
      this.itemBar.append(row);
      if (it.definitionId === 'giftbox') {
        const b = h('button', 'pill', `${icon('gift')}<span>${t('item.wrap')}</span>`);
        b.onclick = () => { if (this.game.commit(wrapGift(this.game.world, itemId), true)) { this.audio.play('sparkle'); this.scene.pop(itemId, 0.2); this.itemBar.classList.add('hidden'); } else this.toast('item.emptyGift'); };
        this.itemBar.append(b);
      }
    } else return;
    this.itemBar.dataset.ref = itemId;
    this.itemBar.classList.remove('hidden');
  }

  /** Переход: если в комнате есть герои, спрашиваем, кого взять с собой (до четырёх). */
  private askTravel(roomId: RoomId) {
    const w = this.game.world;
    const here = Object.values(w.characters).filter((c) => c.roomId === w.currentRoomId);
    if (!here.length) { this.play.goRoom(roomId, []); return; }
    const chosen = new Set<string>(this.sel?.kind === 'char' ? [this.sel.ref] : []);
    this.travelEl.innerHTML = '';
    const card = h('div', 'travelcard');
    card.append(h('p', '', t('travel.who')));
    const row = h('div', 'row');
    for (const c of here) {
      const b = h('button', 'herochip' + (chosen.has(c.id) ? ' current' : ''), heroThumb(c, 64) + `<span>${c.name}</span>`);
      b.setAttribute('aria-pressed', String(chosen.has(c.id)));
      b.onclick = () => {
        if (chosen.has(c.id)) chosen.delete(c.id); else if (chosen.size < 4) chosen.add(c.id);
        b.classList.toggle('current', chosen.has(c.id)); b.setAttribute('aria-pressed', String(chosen.has(c.id)));
        this.audio.play('click');
      };
      row.append(b);
    }
    const go = h('button', 'pill', `<span>${t('travel.go')}: ${t(('room.' + roomId) as Key)}</span>`);
    go.onclick = () => { this.travelEl.classList.add('hidden'); this.play.goRoom(roomId, [...chosen]); };
    const cancel = h('button', 'pill plain', t('common.cancel'));
    cancel.onclick = () => this.travelEl.classList.add('hidden');
    const actions = h('div', 'row');
    actions.append(cancel, go);
    card.append(row, actions);
    this.travelEl.append(card);
    this.travelEl.classList.remove('hidden');
  }

  refresh() {
    const w = this.game.world;
    this.soundBtn.innerHTML = icon(w.settings.mute ? 'mute' : 'sound');
    this.soundBtn.setAttribute('aria-label', t('hud.sound'));
    this.soundBtn.setAttribute('aria-pressed', String(!w.settings.mute));
    const far = this.scene.zoom <= this.scene.minZoom + 0.02;
    this.zoomBtn.innerHTML = icon(far ? 'zoomIn' : 'zoomOut');
    this.zoomBtn.setAttribute('aria-label', t(far ? 'hud.zoomIn' : 'hud.zoomOut'));
    this.undoBtn.disabled = !this.game.canUndo();
    this.undoBtn.setAttribute('aria-label', t('hud.undo'));
    this.mapBtn.setAttribute('aria-label', t('hud.toMap'));
    this.mapBtn.title = t('hud.toMap');
    const playBtn = this.title.querySelector('#play'); if (playBtn) playBtn.textContent = t('title.play');
    const h1 = this.title.querySelector('h1'); if (h1) h1.textContent = t('app.title');
    this.audio.configure(w.settings);
    // комнаты
    this.rooms.innerHTML = '';
    for (const id of ROOM_IDS) {
      const b = h('button', 'roombtn' + (id === w.currentRoomId ? ' current' : ''), icon(id) + `<span>${t(('room.' + id) as Key)}</span>`);
      b.setAttribute('aria-current', String(id === w.currentRoomId));
      b.onclick = () => { if (id !== this.game.world.currentRoomId) this.askTravel(id as RoomId); };
      this.rooms.append(b);
    }
    // панель героя
    const c = this.sel?.kind === 'char' ? w.characters[this.sel.ref] : undefined;
    this.charBar.classList.toggle('hidden', !c || c.roomId !== w.currentRoomId);
    if (c) {
      const sets = HERO_COSTUMES[c.id] ?? OUTFIT_SETS.map((s) => s.id);
      const cur = Math.max(0, sets.indexOf(c.costume ?? ''));
      this.charBar.innerHTML = '';
      const name = h('div', 'charname', c.name);
      const step = (d: number, label: Key, ic: 'prev' | 'next') => { const b = h('button', 'round', icon(ic)); b.setAttribute('aria-label', t(label)); b.onclick = () => { if (this.game.commit(wearSet(this.game.world, c.id, sets[(cur + d + sets.length) % sets.length]), true)) { this.audio.play('sparkle'); this.scene.pop(c.id, 0.08); } }; return b; };
      const costume = h('div', 'group');
      costume.append(step(-1, 'char.prev', 'prev'), h('span', 'grouplabel', `${t('char.costume')} ${cur + 1}/${sets.length}`), step(1, 'char.next', 'next'));
      const moods = h('div', 'group moods');
      for (const e of EMOTIONS) {
        const b = h('button', 'mood' + (c.emotion === e ? ' current' : ''), emotionSvg(e));
        b.setAttribute('aria-label', t(('emotion.' + e) as Key));
        b.setAttribute('aria-pressed', String(c.emotion === e));
        b.onclick = () => { this.game.commit(setEmotion(this.game.world, c.id, e)); this.audio.play('click'); this.scene.pop(c.id, 0.05); };
        moods.append(b);
      }
      const flip = h('button', 'round', icon('flip'));
      flip.setAttribute('aria-label', t('char.flip'));
      flip.onclick = () => { this.game.commit(flipCharacter(this.game.world, c.id)); this.audio.play('click'); };
      this.charBar.append(name, costume, moods, flip);
    }
    // кнопки готовки
    this.cookLayer.innerHTML = '';
    if (w.lastScreen === 'room') for (const spot of this.play?.cookSpots() ?? []) {
      const b = h('button', 'cookbtn' + (spot.recipe ? '' : ' wonder'), icon('cook'));
      b.setAttribute('aria-label', t('item.cook'));
      b.dataset.x = String(spot.at.x); b.dataset.y = String(spot.at.y);
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.onclick = () => this.play.cookAt(spot.furnitureId);
      this.cookLayer.append(b);
    }
    this.follow();
  }

  /** Кнопки, привязанные к объектам сцены, следуют за ними при прокрутке и изменении размера. */
  private follow() {
    this.followTutorial();
    if (this.bubbleHero) {
      const top = this.scene.headTop(this.bubbleHero);
      if (!top) this.bubble.classList.add('hidden');
      else {
        const p = this.scene.toScreen(top);
        const w = this.bubble.offsetWidth, hgt = this.bubble.offsetHeight;
        const x = Math.max(8, Math.min(window.innerWidth - w - 8, p.x - w / 2)), y = Math.max(8, p.y - hgt);
        this.bubble.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      }
    }
    for (const b of Array.from(this.cookLayer.children) as HTMLElement[]) {
      const p = this.scene.toScreen({ x: Number(b.dataset.x), y: Number(b.dataset.y) });
      b.style.transform = `translate(${Math.round(p.x - 32)}px, ${Math.round(Math.max(70, p.y))}px)`;
    }
    if (!this.itemBar.classList.contains('hidden')) {
      const it = this.game.world.items[this.itemBar.dataset.ref ?? ''];
      if (!it) { this.itemBar.classList.add('hidden'); return; }
      const pl = itemPlace(this.game.world, it);
      const p = this.scene.toScreen({ x: pl.x, y: pl.y - 130 });
      this.itemBar.style.transform = `translate(calc(${Math.round(p.x)}px - 50%), ${Math.round(Math.max(70, p.y))}px)`;
    }
    void charPos;
  }
}
