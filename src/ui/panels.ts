// Боковые панели: герои, вещи (сумка, каталог, найденное), подарки, настройки и родительская зона.
// Открыта всегда только одна панель; она не закрывает всю комнату и не закрывается от перетаскивания внутри.
import { dataUri } from '../art/base';
import { browArt, eyeArt, eyeStateFor, faceInk, mouthArt } from '../art/face';
import { portraitArt } from '../art/character';
import { itemArt } from '../art/items';
import charSprites from '../content/charSprites.json';
import itemSprites from '../content/itemSprites.json';
import { GIFT_SETS, ITEM_LIST, ITEMS } from '../content/items';
import type { Game } from '../game/game';
import { moveItem, newEmptyGift, patchFurniture, setRoomStyle, spawnItem, storeFurniture, summonCharacter, takeGiftSet, tidyRoom, unstoreFurniture } from '../game/rules';
import { FURNITURE } from '../content/furniture';
import { IDEA_CARDS } from '../content/items';
import { createWorld, parseWorld } from '../game/world';
import type { Character, ItemInst } from '../game/types';
import { BAG_CAPACITY } from '../game/types';
import { has, setLang, t, type Key } from '../i18n';
import { BOUND_CHARS, HOUSE_ROOMS } from '../content/furniture';
import { IDEA_KITS } from '../content/ideaKits';
import { prepareIdea, type PreparedItem } from '../game/rules';
import type { Play } from '../scene/play';
import type { Scene } from '../scene/scene';
import { exportFileName } from '../storage/store';
import { requestPersist, type Offline } from '../storage/offline';
import type { GameAudio } from '../audio/audio';

type PanelId = 'heroes' | 'things' | 'gifts' | 'decorate' | 'ideas' | 'settings';
type Pt = { x: number; y: number };
type CharSprite = { file: string; unit: number; origin: Pt; eyeL: Pt; eyeR: Pt; browL: Pt; browR: Pt; mouth: Pt; faceScale: number };
const SPRITES = charSprites as unknown as Record<string, CharSprite>;
const ITEM_FILES = itemSprites as unknown as Record<string, unknown>;
const BASE = import.meta.env.BASE_URL;
const CATS = ['food', 'toys', 'table', 'care', 'pets', 'party'] as const;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

export function itemThumb(it: Pick<ItemInst, 'definitionId' | 'state'>, size = 64): string {
  let name = it.definitionId;
  if (name === 'plate' && it.state.dirty) name = 'plate_dirty';
  if (name === 'giftbox' && !it.state.packed) name = 'giftbox_open';
  const src = ITEM_FILES[name] && !(name === 'wonderdish' && it.state.mix) ? `${BASE}assets/items/${name}.png` : dataUri(itemArt(it.definitionId, it.state));
  return `<img src="${src}" alt="" width="${size}" height="${size}" draggable="false" style="object-fit:contain">`;
}

/** Портрет героя: голова фигурки и лицо поверх неё по тем же точкам, что и в сцене. */
export function heroThumb(c: Character, size = 84): string {
  const sp = c.costume ? SPRITES[`${c.id}:${c.costume}:stand`] : undefined;
  if (!sp) return `<img src="${dataUri(portraitArt(c.look, c.outfit, c.emotion))}" alt="" width="${size}" height="${size}" draggable="false">`;
  const view = 150 * sp.unit; // сколько пикселей спрайта помещается в портрет
  const k = size / view;
  const cx = (sp.eyeL.x + sp.eyeR.x) / 2, cy = sp.eyeL.y + 6 * sp.unit;
  const part = (a: { svg: string }, at: Pt) => `<g transform="translate(${at.x} ${at.y}) scale(${sp.unit * sp.faceScale})">${a.svg}</g>`;
  const face = ([-1, 1] as const).map((s) => part(eyeArt(c.look.eyes, eyeStateFor(c.emotion, s, false), s, faceInk(c.look.skin)), s < 0 ? sp.eyeL : sp.eyeR) + part(browArt(c.look.brows, c.emotion, s, '#4a3526'), s < 0 ? sp.browL : sp.browR)).join('') + part(mouthArt(c.emotion, faceInk(c.look.skin)), sp.mouth);
  const x0 = cx - view / 2, y0 = cy - view / 2;
  return `<svg width="${size}" height="${size}" viewBox="${x0} ${y0} ${view} ${view}" aria-hidden="true"><image href="${BASE}assets/chars/${sp.file}" x="0" y="0"/>${face}</svg>`.replace('<image ', `<image width="${(sp as unknown as { w: number }).w}" height="${(sp as unknown as { h: number }).h}" `) + (k ? '' : '');
}

export class Panels {
  private drawer = el('aside', 'drawer hidden');
  private body = el('div', 'drawer-body');
  private head = el('div', 'drawer-head');
  private dock = el('nav', 'dock');
  private modal = el('div', 'modal hidden');
  open: PanelId | null = null;
  private thingsTab: 'bag' | 'catalog' | 'lost' = 'bag';
  /** что показала последняя подготовка идеи (до закрытия игры) */
  private ideaReport: Record<string, PreparedItem[]> = {};
  private cat: (typeof CATS)[number] = 'food';
  private parentOpen = false;
  onReplayTutorial: () => void = () => undefined;

  constructor(host: HTMLElement, private game: Game, private scene: Scene, private play: Play, private audio: GameAudio, private offline: Offline, private toast: (key: string) => void) {
    const icons: Record<PanelId, string> = {
      heroes: '<circle cx="20" cy="14" r="8"/><path d="M6 36c0-9 6-13 14-13s14 4 14 13"/>',
      things: '<path d="M8 16h24l-2 18H10zM14 16v-4a6 6 0 0 1 12 0v4"/>',
      gifts: '<path d="M6 16h28v6H6zM9 22h22v12H9zM20 16v18M20 16c-6 0-9-8-4-8s4 8 4 8c0 0 0-8 4-8s2 8-4 8"/>',
      decorate: '<path d="M8 32l4-10L28 6l6 6-16 16zM24 10l6 6"/>',
      ideas: '<path d="M14 26a10 10 0 1 1 12 0v4H14zM15 35h10"/>',
      settings: '<circle cx="20" cy="20" r="5"/><path d="M20 5v5M20 30v5M5 20h5M30 20h5M9.500 9.500l3.500 3.500M27 27l3.500 3.500M30.500 9.500L27 13M13 27l-3.500 3.500"/>',
    };
    for (const id of ['heroes', 'things', 'gifts', 'decorate', 'ideas', 'settings'] as PanelId[]) {
      const b = el('button', 'dockbtn', `<svg viewBox="0 0 40 40" width="34" height="34" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[id]}</svg>`);
      b.dataset.panel = id;
      b.setAttribute('aria-label', t(('panel.' + id) as Key));
      if (id === 'things') b.dataset.drop = 'bag';
      b.onclick = () => { this.audio.unlock(); this.audio.play('click'); this.toggle(id); };
      this.dock.append(b);
    }
    this.drawer.append(this.head, this.body);
    host.append(this.dock, this.drawer, this.modal);
    for (const e of [this.drawer, this.dock, this.modal]) e.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    game.subscribe(() => { if (this.open) this.render(); this.refreshDock(); });
    this.refreshDock();
  }

  private refreshDock() {
    for (const b of Array.from(this.dock.children) as HTMLElement[]) {
      b.setAttribute('aria-label', t(('panel.' + b.dataset.panel) as Key));
      b.classList.toggle('current', b.dataset.panel === this.open);
      b.setAttribute('aria-expanded', String(b.dataset.panel === this.open));
    }
    const n = Object.values(this.game.world.items).filter((i) => i.owner.kind === 'bag').length;
    const bag = this.dock.querySelector<HTMLElement>('[data-panel="things"]')!;
    bag.dataset.count = n ? String(n) : '';
  }

  toggle(id: PanelId | null) {
    this.open = this.open === id ? null : id;
    if (this.open !== 'settings') this.parentOpen = false;
    // режим украшения включён, пока открыта его панель: в обычной игре мебель защищена от случайного движения
    if (this.play.decorate !== (this.open === 'decorate')) this.play.setDecorate(this.open === 'decorate');
    this.drawer.classList.toggle('compact', this.open === 'decorate');
    this.drawer.classList.toggle('hidden', !this.open);
    this.refreshDock();
    if (this.open) this.render();
  }

  /** Предмет отпущен над кнопкой сумки. */
  dropToBag(itemId: string): boolean {
    const r = moveItem(this.game.world, itemId, { kind: 'bag', slot: 0 });
    if (!r.ok) { this.toast(r.reason === 'too_big' ? 'toast.tooBig' : 'toast.bagFull'); this.audio.play('nope'); return true; }
    this.game.commit(r);
    this.audio.play('put');
    this.toast('toast.inBag');
    return true;
  }

  private confirm(text: string, yes: string, onYes: () => void, extra?: [string, () => void]) {
    this.modal.innerHTML = '';
    const card = el('div', 'title-card');
    card.append(el('p', '', text));
    const row = el('div', 'row');
    const mk = (label: string, cls: string, fn: () => void) => { const b = el('button', 'pill ' + cls, label); b.onclick = () => { this.modal.classList.add('hidden'); fn(); }; row.append(b); };
    mk(t('common.cancel'), 'plain', () => undefined);
    if (extra) mk(extra[0], 'plain', extra[1]);
    mk(yes, '', onYes);
    card.append(row);
    this.modal.append(card);
    this.modal.classList.remove('hidden');
  }

  render() {
    const id = this.open;
    if (!id) return;
    this.head.innerHTML = '';
    const title = el('h2', '', t(('panel.' + id) as Key));
    const close = el('button', 'round small', '<svg viewBox="0 0 40 40" width="26" height="26" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M10 10l20 20M30 10L10 30"/></svg>');
    close.setAttribute('aria-label', t('hud.close'));
    close.onclick = () => this.toggle(null);
    this.head.append(title, close);
    const scroll = this.body.scrollTop;
    this.body.innerHTML = '';
    if (id === 'heroes') this.renderHeroes();
    if (id === 'things') this.renderThings();
    if (id === 'gifts') this.renderGifts();
    if (id === 'decorate') this.renderDecorate();
    if (id === 'ideas') this.renderIdeas();
    if (id === 'settings') this.renderSettings();
    this.body.scrollTop = scroll;
  }

  // ---------- герои ----------
  private renderHeroes() {
    const w = this.game.world;
    const grid = el('div', 'grid heroes');
    for (const c of Object.values(w.characters)) {
      const here = c.roomId === w.currentRoomId;
      const card = el('div', 'card' + (here ? ' here' : ''));
      const status = here ? 'heroes.here' : c.roomId ? 'heroes.away' : 'heroes.resting';
      card.innerHTML = `<div class="thumb">${heroThumb(c)}</div><div class="cardname">${c.name}</div><div class="cardsub">${t(status)}</div>`;
      const bound = !!BOUND_CHARS[c.id]; // фермера нельзя позвать с фермы или убрать на полку
      if (bound) card.querySelector('.cardsub')!.textContent = t('heroes.farm');
      const main = el('button', 'pill small', t(here ? 'heroes.show' : 'heroes.call'));
      if (bound && !here) main.disabled = true;
      main.onclick = () => {
        if (!here) { this.game.commit(summonCharacter(this.game.world, c.id, w.currentRoomId), true); this.audio.play('pop'); }
        const cur = this.game.world.characters[c.id];
        this.scene.centerOn(cur.x);
        this.play.select({ kind: 'char', ref: c.id });
        this.scene.hop(c.id);
      };
      card.append(main);
      if (c.roomId && !bound) {
        const rest = el('button', 'pill small plain', t('heroes.sendRest'));
        rest.onclick = () => { if (this.play.selection?.ref === c.id) this.play.select(null); this.game.commit(summonCharacter(this.game.world, c.id, null), true); this.audio.play('put'); };
        card.append(rest);
      }
      grid.append(card);
    }
    this.body.append(grid);
  }

  // ---------- вещи ----------
  private renderThings() {
    const w = this.game.world;
    const tabs = el('div', 'tabs');
    for (const tab of ['bag', 'catalog', 'lost'] as const) {
      const b = el('button', 'tab' + (this.thingsTab === tab ? ' current' : ''), t(('things.' + tab) as Key));
      b.setAttribute('aria-pressed', String(this.thingsTab === tab));
      b.onclick = () => { this.thingsTab = tab; this.audio.play('click'); this.render(); };
      tabs.append(b);
    }
    this.body.append(tabs);
    const toRoom = (it: ItemInst) => { const p = this.play.spawnSpot(); if (this.game.commit(moveItem(this.game.world, it.instanceId, { kind: 'room', roomId: this.game.world.currentRoomId, x: p.x, y: p.y }))) { this.audio.play('pop'); this.scene.pop(it.instanceId, 0.2); } };
    if (this.thingsTab === 'bag') {
      const items = Object.values(w.items).filter((i) => i.owner.kind === 'bag').sort((a, b) => (a.owner as { slot: number }).slot - (b.owner as { slot: number }).slot);
      const grid = el('div', 'grid slots');
      for (let i = 0; i < BAG_CAPACITY; i++) {
        const it = items.find((x) => (x.owner as { slot: number }).slot === i);
        const b = el('button', 'slot' + (it ? '' : ' empty'), it ? itemThumb(it) : '');
        b.disabled = !it;
        if (it) { b.setAttribute('aria-label', t('item.takeOut')); b.onclick = () => toRoom(it); }
        grid.append(b);
      }
      this.body.append(grid);
      if (!items.length) this.body.append(el('p', 'hint', t('things.bagEmpty')));
    } else if (this.thingsTab === 'catalog') {
      const cats = el('div', 'tabs wrap');
      for (const c of CATS) {
        const b = el('button', 'tab small' + (this.cat === c ? ' current' : ''), t(('cat.' + c) as Key));
        b.setAttribute('aria-pressed', String(this.cat === c));
        b.onclick = () => { this.cat = c; this.audio.play('click'); this.render(); };
        cats.append(b);
      }
      const grid = el('div', 'grid slots');
      for (const d of ITEM_LIST.filter((x) => x.catalog === this.cat)) {
        const b = el('button', 'slot', itemThumb({ definitionId: d.id, state: {} }));
        const pk = 'prop.' + d.id;
        const label = has(pk) ? t(pk) : '';
        if (label) { b.setAttribute('aria-label', label); b.title = label; b.classList.add('named'); b.insertAdjacentHTML('beforeend', `<small>${label}</small>`); }
        b.onclick = () => {
          const p = this.play.spawnSpot();
          const r = spawnItem(this.game.world, d.id, { kind: 'room', roomId: this.game.world.currentRoomId, x: p.x, y: p.y });
          if (!this.game.commit(r)) { this.toast('toast.tooMany'); this.audio.play('nope'); return; }
          this.audio.play('pop');
          if (r.ok) this.scene.pop(r.info!.instanceId as string, 0.25);
        };
        grid.append(b);
      }
      this.body.append(cats, grid);
    } else {
      const items = Object.values(w.items).filter((i) => i.owner.kind === 'lost');
      const grid = el('div', 'grid slots');
      for (const it of items) { const b = el('button', 'slot', itemThumb(it)); b.setAttribute('aria-label', t('item.takeOut')); b.onclick = () => toRoom(it); grid.append(b); }
      this.body.append(grid);
      if (!items.length) this.body.append(el('p', 'hint', t('things.lostEmpty')));
    }
    const tidy = el('button', 'pill plain wide', t('things.tidy'));
    tidy.onclick = () => this.confirm(t('things.tidyConfirm'), t('common.yes'), () => { this.game.commit(tidyRoom(this.game.world, this.game.world.currentRoomId)); this.audio.play('sparkle'); this.toast('things.tidyDone'); });
    this.body.append(tidy);
  }

  // ---------- подарки ----------
  private renderGifts() {
    const take = (setId: string) => {
      const p = this.play.spawnSpot();
      const r = takeGiftSet(this.game.world, setId, this.game.world.currentRoomId, p);
      if (!this.game.commit(r, true)) { this.toast('toast.tooMany'); this.audio.play('nope'); return; }
      this.audio.play('gift');
      if (r.ok) this.scene.pop(r.info!.instanceId as string, 0.25);
      this.toggle(null);
    };
    const top = el('div', 'row left');
    const surprise = el('button', 'pill', t('gifts.surprise'));
    surprise.onclick = () => take(GIFT_SETS[Math.floor(Math.random() * GIFT_SETS.length)].id); // просто перемешивание уже доступного каталога
    const pack = el('button', 'pill plain', t('gifts.pack'));
    pack.onclick = () => {
      const p = this.play.spawnSpot();
      const r = newEmptyGift(this.game.world, this.game.world.currentRoomId, p, Math.floor(Math.random() * 6), Math.floor(Math.random() * 3), '');
      if (!this.game.commit(r, true)) { this.toast('toast.tooMany'); return; }
      this.audio.play('pop');
      this.toast('gifts.packHint');
      this.toggle(null);
    };
    top.append(surprise, pack);
    const grid = el('div', 'grid gifts');
    for (const g of GIFT_SETS) {
      const card = el('button', 'card giftcard');
      card.innerHTML = `<div class="giftrow">${itemThumb({ definitionId: 'giftbox', state: { packed: true, paper: g.paper, bow: g.bow } }, 56)}<b>${t(('gift.' + g.id) as Key)}</b></div><div class="giftitems">${g.items.map((d) => itemThumb({ definitionId: d, state: {} }, 34)).join('')}</div>`;
      card.setAttribute('aria-label', `${t('gifts.take')}: ${t(('gift.' + g.id) as Key)}`);
      card.onclick = () => take(g.id);
      grid.append(card);
    }
    this.body.append(top, grid);
  }

  // ---------- украшение ----------
  private renderDecorate() {
    const w = this.game.world;
    const room = w.currentRoomId;
    const sel = this.play.selection?.kind === 'furn' ? w.furniture[this.play.selection.ref] : undefined;
    if (sel) {
      const row = el('div', 'row left');
      const flip = el('button', 'pill small', t('deco.flip'));
      flip.onclick = () => { this.game.commit(patchFurniture(this.game.world, sel.id, { flipped: !sel.flipped })); this.audio.play('click'); };
      const store = el('button', 'pill small plain', t('deco.store'));
      store.onclick = () => { const r = storeFurniture(this.game.world, sel.id); if (!this.game.commit(r)) { this.toast('deco.fixed'); this.audio.play('nope'); return; } this.play.select(null); this.audio.play('put'); };
      row.append(flip, store);
      this.body.append(row);
    } else this.body.append(el('p', 'hint', t('deco.hint')));
    const walls = el('div', 'grid slots');
    if (HOUSE_ROOMS.has(room)) {
    this.body.append(el('h3', '', t('deco.walls')));
      for (let i = 0; i < 4; i++) {
        const b = el('button', 'slot wall' + (w.rooms[room].wallpaper % 4 === i ? ' current' : ''), `<img src="${BASE}assets/rooms/room${i}.jpg" alt="" draggable="false">`);
        b.setAttribute('aria-pressed', String(w.rooms[room].wallpaper % 4 === i));
        b.onclick = () => { this.game.commit(setRoomStyle(this.game.world, room, { wallpaper: i })); this.audio.play('click'); };
        walls.append(b);
      }
    }
    this.body.append(walls, el('h3', '', t('deco.stored')));
    const stored = Object.values(w.furniture).filter((f) => f.roomId === null);
    const grid = el('div', 'grid slots');
    for (const f of stored) {
      const b = el('button', 'slot', `<img src="${BASE}assets/furn/${f.definitionId}.png" alt="" width="64" height="64" draggable="false" style="object-fit:contain">`);
      b.onclick = () => { this.game.commit(unstoreFurniture(this.game.world, f.id, this.game.world.currentRoomId)); this.audio.play('pop'); this.scene.centerOn(800); };
      grid.append(b);
    }
    this.body.append(grid);
    if (!stored.length) this.body.append(el('p', 'hint', t('deco.storedEmpty')));
    const done = el('button', 'pill wide', t('deco.done'));
    done.onclick = () => this.toggle(null);
    this.body.append(done);
    void FURNITURE;
  }

  // ---------- карточки идей: подсказки для историй, не задания ----------
  private renderIdeas() {
    const pics: Record<string, string[]> = { breakfast: ['bread', 'cheese', 'sandwich'], birthday: ['cake', 'balloon', 'giftbox'], picnic: ['basket', 'apple', 'cookies'], vet: ['teddy', 'pillow', 'teapot'], winter: ['mittens', 'cocoa', 'snowglobe'], show: ['crown', 'wand', 'mask'], party: ['cupcake', 'giftbox', 'club_headphones'], pets: ['pet_rope_ball', 'pet_food_bag', 'pet_double_bowl'] };
    const grid = el('div', 'grid gifts');
    for (const id of IDEA_CARDS) {
      const card = el('div', 'card idea');
      card.dataset.idea = id;
      card.innerHTML = `<div class="giftitems">${(pics[id] ?? []).map((d) => itemThumb({ definitionId: d, state: { packed: true } }, 52)).join('')}</div><b>${t(('idea.' + id) as Key)}</b><span>${t(('idea.' + id + '.t') as Key)}</span>`;
      const kit = IDEA_KITS[id];
      if (kit) {
        // просмотр карточки ничего не меняет; вещи появляются только по кнопке
        const prep = el('button', 'pill small', t('idea.prepare'));
        const run = (again: boolean) => {
          const r = prepareIdea(this.game.world, id, kit, again);
          if (!this.game.commit(r, true) || !r.ok) return;
          this.ideaReport[id] = r.info!.report as PreparedItem[];
          this.audio.play('sparkle');
          this.render();
        };
        prep.onclick = () => run(false);
        card.append(prep);
        const rep = this.ideaReport[id];
        if (rep) {
          const list = el('div', 'idea-report');
          for (const it of rep) {
            const where = it.inBag ? t('idea.inBag') : `${it.roomId ? t(('room.' + it.roomId) as Key) : ''}${it.holder ? ` · ${t('idea.withHero')} ${this.game.world.characters[it.holder]?.name ?? ''}` : ''}`;
            const row = el('div', 'idea-row ' + it.status, `${itemThumb({ definitionId: it.def, state: it.def === 'giftbox' ? { packed: false } : {} }, 36)}<span><b>${t(('idea.' + it.status) as Key)}</b>${it.status === 'eaten' ? '' : ': ' + where}</span>`);
            if (it.status === 'eaten') { const more = el('button', 'pill small plain', t('idea.again')); more.onclick = () => run(true); row.append(more); }
            list.append(row);
          }
          card.append(list);
        }
      }
      grid.append(card);
    }
    this.body.append(grid);
  }

  // ---------- настройки и родительская зона ----------
  private renderSettings() {
    const w = this.game.world;
    const slider = (label: Key, key: 'music' | 'sfx') => {
      const row = el('label', 'setrow', `<span>${t(label)}</span>`);
      const input = el('input');
      input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '0.05'; input.value = String(w.settings[key]);
      input.oninput = () => { this.audio.configure({ ...this.game.world.settings, [key]: Number(input.value) }); };
      input.onchange = () => { this.game.update((x) => { x.settings[key] = Number(input.value); }); if (key === 'sfx') this.audio.play('pop'); };
      row.append(input);
      return row;
    };
    const motion = el('label', 'setrow', `<span>${t('settings.motion')}</span>`);
    const cb = el('input'); cb.type = 'checkbox'; cb.dataset.setting = 'motion'; cb.checked = w.settings.reducedMotion;
    cb.onchange = () => this.game.update((x) => { x.settings.reducedMotion = cb.checked; });
    motion.append(cb);
    const voices = el('label', 'setrow', `<span>${t('settings.voices')}</span>`);
    const vb = el('input'); vb.type = 'checkbox'; vb.dataset.setting = 'voices'; vb.checked = w.settings.voices !== false;
    vb.onchange = () => { if (!vb.checked) this.play.talk?.stop(); this.game.update((x) => { x.settings.voices = vb.checked; }); };
    voices.append(vb);
    this.body.append(slider('settings.music', 'music'), slider('settings.sfx', 'sfx'), voices, motion);
    const replay = el('button', 'pill plain wide', t('settings.replay'));
    replay.onclick = () => { this.toggle(null); this.onReplayTutorial(); };
    this.body.append(replay);

    if (!this.parentOpen) {
      // простое удержание и подтверждение — защита от случайных нажатий, а не система безопасности
      const hold = el('button', 'pill plain wide hold', `<span>${t('settings.parent')}</span><i></i>`);
      let timer = 0;
      const stop = () => { clearTimeout(timer); hold.classList.remove('holding'); };
      hold.onpointerdown = () => { hold.classList.add('holding'); timer = window.setTimeout(() => { stop(); this.confirm(t('parent.confirm'), t('common.yes'), () => { this.parentOpen = true; this.render(); }); }, 1500); };
      hold.onpointerup = stop; hold.onpointerleave = stop; hold.onpointercancel = stop;
      hold.onkeydown = (e) => { if (e.key === 'Enter') this.confirm(t('parent.confirm'), t('common.yes'), () => { this.parentOpen = true; this.render(); }); };
      this.body.append(hold);
      return;
    }
    const sec = el('section', 'parent');
    sec.append(el('h3', '', t('parent.title')));
    const lang = el('div', 'setrow', `<span>${t('parent.lang')}</span>`);
    for (const l of ['ru', 'en'] as const) {
      const b = el('button', 'tab small' + (w.settings.lang === l ? ' current' : ''), l === 'ru' ? 'Русский' : 'English');
      b.setAttribute('aria-pressed', String(w.settings.lang === l));
      b.onclick = () => { setLang(l); this.game.update((x) => { x.settings.lang = l; }); document.title = t('app.title'); };
      lang.append(b);
    }
    const doExport = () => {
      const blob = new Blob([JSON.stringify(this.game.world)], { type: 'application/json' });
      const a = el('a'); a.href = URL.createObjectURL(blob); a.download = exportFileName();
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    const exp = el('button', 'pill wide', t('parent.export'));
    exp.onclick = doExport;
    const imp = el('button', 'pill plain wide', t('parent.import'));
    const file = el('input'); file.type = 'file'; file.accept = 'application/json,.json'; file.hidden = true;
    imp.onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      // импорт: размер, версия, типы, идентификаторы и ссылки проверяются; из файла ничего не исполняется
      const parsed = f.size > 2_000_000 ? { ok: false as const, reason: 'too_big' } : parseWorld(await f.text());
      if (!parsed.ok) { this.toast('parent.importBad'); this.audio.play('nope'); return; }
      this.play.select(null);
      setLang(parsed.world.settings.lang);
      this.game.replace({ ...parsed.world, lastScreen: 'room' });
      this.toast('parent.importOk');
    };
    const reset = el('button', 'pill plain wide danger', t('parent.reset'));
    const reallyReset = () => this.confirm(t('parent.reset2'), t('common.yes'), () => { this.play.select(null); const fresh = createWorld(this.game.world.settings.lang); this.game.replace({ ...fresh, settings: { ...this.game.world.settings, tutorialDone: false }, lastScreen: 'room' }); this.toast('parent.resetDone'); });
    reset.onclick = () => this.confirm(t('parent.reset1'), t('common.no'), reallyReset, [t('common.exportFirst'), () => { doExport(); reallyReset(); }]);
    const off = el('p', 'note offline ' + this.offline.state, t(('parent.offline.' + this.offline.state) as Key));
    sec.append(lang, exp, imp, file, el('p', 'note', t('parent.storageNote')));
    const persist = el('p', 'note');
    void requestPersist().then((ok) => { if (ok !== null) persist.textContent = t(ok ? 'parent.persistYes' : 'parent.persistNo'); });
    sec.append(persist, off);
    if (this.offline.updateReady) {
      const up = el('button', 'pill wide', t('parent.update'));
      up.onclick = () => void this.game.flush().then(() => this.offline.applyUpdate()); // сначала сохранение, потом обновление
      sec.append(up);
    }
    sec.append(el('p', 'note', t('parent.install')), el('p', 'note', t('parent.about')), reset);
    this.body.append(sec);
  }
}

void ITEMS;
