// Игровые взаимодействия: что происходит при нажатии и при отпускании. Связывает правила, сцену и звук.
import type { GameAudio } from '../audio/audio';
import { FURNITURE, TV_SCENES } from '../content/furniture';
import { ITEMS } from '../content/items';
import { resolveCharDrop, resolveItemDrop, resolvePetDrop, freeFloorSpot, type ItemDrop } from '../game/drop';
import type { Game } from '../game/game';
import { charBox, charPos, clampFloor, dist, itemPlace, petPos, slotPos } from '../game/geometry';
import {
  clone, cook, cookables, feed, moveItem, openGift, patchPet, placeCharacter, placePet, recipeAt, seatTaken, setFurnitureOn,
  setRoomStyle, toggleOpen, travel, wake, wearSet, moveFurniture,
} from '../game/rules';
import type { Pt, RoomId, World } from '../game/types';
import type { Scene } from './scene';
import type { Talk } from './talk';

export type Selection = { kind: 'item' | 'char' | 'furn'; ref: string } | null;
export type Target = { kind: 'item' | 'char' | 'pet' | 'furn'; ref: string };

export interface PlayUi {
  toast(key: string): void;
  selectionChanged(sel: Selection): void;
  openWardrobe(characterId: string | null): void;
  openItemMenu(itemId: string): void;
  tutorialEvent(ev: 'item_in_hand' | 'hero_seated'): void;
}

export class Play {
  selection: Selection = null;
  decorate = false;
  talk: Talk | null = null;
  constructor(private game: Game, private scene: Scene, private audio: GameAudio, private ui: PlayUi) {}

  private get w(): World { return this.game.world; }
  private get room(): RoomId { return this.w.currentRoomId; }

  select(sel: Selection) {
    this.selection = sel;
    this.scene.setSelected(sel?.ref ?? null);
    this.ui.selectionChanged(sel);
  }

  setDecorate(on: boolean) { this.decorate = on; this.select(null); this.talk?.stop(); }

  /** Можно ли тащить объект в текущем режиме. */
  canDrag(t: Target): boolean {
    if (this.decorate) return t.kind === 'furn' && FURNITURE[this.w.furniture[t.ref]?.definitionId]?.layer !== undefined;
    return t.kind !== 'furn'; // в обычном режиме мебель защищена от случайного движения
  }

  // ---------- подсветка цели во время переноса ----------
  preview(t: Target, pt: Pt) {
    const w = this.w;
    if (t.kind === 'item') {
      const d = resolveItemDrop(w, t.ref, pt, this.room);
      this.scene.setHighlight(this.dropSpot(d));
    } else if (t.kind === 'char') {
      const d = resolveCharDrop(w, t.ref, pt, this.room);
      if (d.type === 'seat') { const f = w.furniture[d.furnitureId]; const s = slotPos(f, FURNITURE[f.definitionId].seats![d.slot]); this.scene.setHighlight({ x: s.x, y: s.y - 30, r: 70 }); }
      else this.scene.setHighlight(null);
    } else this.scene.setHighlight(null);
  }
  private dropSpot(d: ItemDrop): { x: number; y: number; r: number } | null {
    const w = this.w;
    switch (d.type) {
      case 'feed': case 'care': { const b = charBox(w, w.characters[d.characterId]); return { x: b.headX, y: b.headLine === null ? b.y0 + 60 : b.headLine - 50, r: 62 }; }
      case 'hand': case 'wear': { const p = charPos(w, w.characters[d.characterId]); const sit = w.characters[d.characterId].pose === 'sitting'; return { x: p.x, y: p.y - (sit ? 40 : 90), r: 58 }; }
      case 'pet': { const p = petPos(w, w.pets[d.petId]); return { x: p.x, y: p.y - 50, r: 60 }; }
      case 'into': { const pl = itemPlace(w, w.items[d.itemId]); return { x: pl.x, y: pl.y - 30, r: 52 }; }
      case 'surface': { const f = w.furniture[d.furnitureId]; const s = slotPos(f, FURNITURE[f.definitionId].surfaces![d.slot]); return { x: s.x, y: s.y - 22, r: 36 }; }
      case 'furniture': { const f = w.furniture[d.furnitureId]; const fd = FURNITURE[f.definitionId]; return { x: f.x, y: f.y - fd.h / 2, r: Math.min(fd.w, fd.h) * 0.42 }; }
      default: return null;
    }
  }

  // ---------- отпускание ----------
  drop(t: Target, pt: Pt) {
    if (t.kind === 'item') this.dropItem(t.ref, pt);
    else if (t.kind === 'char') this.dropChar(t.ref, pt);
    else if (t.kind === 'pet') this.dropPet(t.ref, pt);
    else if (t.kind === 'furn') { this.game.commit(moveFurniture(this.w, t.ref, pt.x, pt.y)); this.audio.play('put'); }
  }

  dropItem(itemId: string, pt: Pt, d: ItemDrop = resolveItemDrop(this.w, itemId, pt, this.room)) {
    const w = this.w;
    const it = w.items[itemId];
    if (!it) return;
    const def = ITEMS[it.definitionId];
    const fail = (key: string) => { this.ui.toast(key); this.audio.play('nope'); };
    switch (d.type) {
      case 'feed': {
        const r = feed(w, itemId);
        if (!r.ok) return fail('toast.notFood');
        const silly = it.definitionId === 'wonderdish';
        r.world.characters[d.characterId].emotion = silly ? 'silly' : 'delight';
        r.world.characters[d.characterId].dream = it.definitionId;
        this.game.commit(r);
        const b = charBox(this.w, this.w.characters[d.characterId]);
        this.scene.burst('crumb', { x: b.headX, y: (b.headLine ?? b.y0 + 80) - 20 }, 6);
        this.scene.pop(d.characterId, 0.08);
        this.audio.play('munch');
        this.talk?.say(d.characterId, 'food', 550);
        return;
      }
      case 'care': {
        const cur = clone(w);
        cur.characters[d.characterId].emotion = 'joy';
        const held = moveItem(cur, itemId, { kind: 'hand', characterId: d.characterId, slot: 'right' });
        this.game.commit(held.ok ? held : { ok: true, world: cur });
        const b = charBox(this.w, this.w.characters[d.characterId]);
        this.scene.burst(it.definitionId === 'soap' ? 'bubble' : 'star', { x: b.headX, y: (b.headLine ?? b.y0 + 80) - 60 }, 7);
        this.audio.play('sparkle');
        return;
      }
      case 'wear': {
        if (!this.game.commit(wearSet(w, d.characterId, d.setId), true)) return fail('toast.cant');
        const p = charPos(this.w, this.w.characters[d.characterId]);
        this.scene.burst('star', { x: p.x, y: p.y - 130 }, 10);
        this.scene.pop(d.characterId);
        this.audio.play('sparkle');
        return;
      }
      case 'hand': {
        const r = moveItem(w, itemId, { kind: 'hand', characterId: d.characterId, slot: d.slot });
        if (!r.ok) return fail(r.reason === 'hands_full' ? 'toast.handsFull' : 'toast.cant');
        r.world.characters[d.characterId].dream = it.definitionId;
        this.game.commit(r);
        this.scene.pop(d.characterId, 0.06);
        this.audio.play('pop');
        if (it.definitionId === 'giftbox') this.talk?.say(d.characterId, 'gift', 300);
        this.ui.tutorialEvent('item_in_hand');
        return;
      }
      case 'pet': return this.petAction(d.petId, d.action, itemId, pt);
      case 'into': {
        const r = moveItem(w, itemId, { kind: 'item', itemId: d.itemId, slot: 0 });
        if (!this.game.commit(r)) return fail(r.ok ? 'toast.cant' : r.reason === 'container_full' ? 'toast.full' : 'toast.cant');
        this.scene.pop(d.itemId);
        this.audio.play('put');
        return;
      }
      case 'surface': {
        const wasDirty = it.state.dirty;
        const r = moveItem(w, itemId, { kind: 'surface', furnitureId: d.furnitureId, slot: d.slot });
        if (!this.game.commit(r)) return fail('toast.full');
        this.audio.play('put');
        if (wasDirty && !this.w.items[itemId]?.state.dirty) { const pl = itemPlace(this.w, this.w.items[itemId]); this.scene.burst('bubble', { x: pl.x, y: pl.y - 20 }, 8); this.audio.play('water'); }
        return;
      }
      case 'furniture': {
        const opened = toggleOpen(w, d.furnitureId, true); // закрытый ящик сам открывается
        const r = opened.ok ? moveItem(opened.world, itemId, { kind: 'furniture', furnitureId: d.furnitureId, slot: d.slot }) : opened;
        if (!this.game.commit(r)) return fail('toast.full');
        this.audio.play('put');
        return;
      }
      case 'floor': {
        this.game.commit(moveItem(w, itemId, { kind: 'room', roomId: this.room, x: d.x, y: d.y }));
        this.audio.play('put');
        this.petsReact(itemId);
        return;
      }
      default: void def; this.audio.play('nope');
    }
  }

  private petAction(petId: string, action: 'feed' | 'play' | 'brush', itemId: string, pt: Pt) {
    const pos = petPos(this.w, this.w.pets[petId]);
    if (this.w.pets[petId].sleeping) this.game.commit(patchPet(this.w, petId, { sleeping: false }));
    if (action === 'feed') {
      if (!this.game.commit(feed(this.w, itemId))) return;
      this.scene.setPetMood(petId, 'eat', 900);
      setTimeout(() => this.scene.setPetMood(petId, 'happy', 1400), 900);
      this.scene.burst('crumb', { x: pos.x, y: pos.y - 60 }, 5);
      this.audio.play('munch');
    } else if (action === 'brush') {
      this.scene.setPetMood(petId, 'happy', 1600);
      this.scene.burst('star', { x: pos.x, y: pos.y - 70 }, 7);
      this.audio.play('sparkle');
    } else {
      const p = clampFloor(pt.x + 70, Math.max(pt.y, pos.y));
      this.game.commit(moveItem(this.w, itemId, { kind: 'room', roomId: this.room, x: p.x, y: p.y }));
      this.scene.setPetMood(petId, 'play', 1600);
      this.scene.hop('p:' + petId);
      this.scene.hop(petId, 34);
      this.audio.play('pet');
    }
  }

  /** Питомцы с характером: собака приносит мяч, кролик идёт за морковкой. */
  private petsReact(itemId: string) {
    const it = this.w.items[itemId];
    if (!it || it.owner.kind !== 'room') return;
    const at = { x: it.owner.x, y: it.owner.y };
    const def = ITEMS[it.definitionId];
    for (const pet of Object.values(this.w.pets)) {
      if (pet.roomId !== this.room || pet.sleeping) continue;
      if (pet.kind === 'rabbit' && it.definitionId === 'carrot') {
        setTimeout(() => {
          const cur = this.w.items[itemId];
          if (!cur || cur.owner.kind !== 'room') return;
          this.game.commit(placePet(this.w, pet.id, { x: at.x - 80, y: at.y }));
          this.scene.setPetMood(pet.id, 'happy', 1400);
          this.scene.hop(pet.id, 30);
          this.audio.play('pet');
        }, 350);
      }
      if (pet.kind === 'dog' && def.tags.includes('pettoy')) {
        setTimeout(() => {
          const cur = this.w.items[itemId];
          if (!cur || cur.owner.kind !== 'room' || this.w.pets[pet.id]?.sleeping) return;
          // собака бежит к игрушке и несёт её ближайшему герою
          const heroes = Object.values(this.w.characters).filter((c) => c.roomId === this.room && c.pose !== 'sleeping');
          const hero = heroes.sort((a, b) => dist(charPos(this.w, a), at) - dist(charPos(this.w, b), at))[0];
          const to = hero ? clampFloor(charPos(this.w, hero).x + 90, Math.max(charPos(this.w, hero).y, 720) + 10) : at;
          this.game.update((w) => {
            const p = w.pets[pet.id]; p.x = clampFloor(to.x + 80, to.y).x; p.y = to.y; p.seat = null; p.flipped = false;
            w.items[itemId].owner = { kind: 'room', roomId: this.room, x: to.x, y: to.y };
          });
          this.scene.setPetMood(pet.id, 'play', 1500);
          this.scene.hop(pet.id, 30);
          this.audio.play('pet');
        }, 450);
      }
    }
  }

  dropChar(id: string, pt: Pt) {
    const d = resolveCharDrop(this.w, id, pt, this.room);
    const r = d.type === 'seat' ? placeCharacter(this.w, id, { furnitureId: d.furnitureId, slot: d.slot }) : placeCharacter(this.w, id, { x: d.x, y: d.y });
    if (!this.game.commit(r)) { this.audio.play('nope'); return; }
    const c = this.w.characters[id];
    const p = charPos(this.w, c);
    if (c.pose === 'sleeping') { this.audio.play('sleep'); this.scene.burst('zzz', { x: p.x - 190, y: p.y - 80 }, 4); }
    else if (c.pose === 'bathing') { this.audio.play('water'); this.scene.burst('bubble', { x: p.x, y: p.y - 150 }, 10); }
    else { this.audio.play('put'); this.scene.hop(id, c.pose === 'sitting' ? 10 : 16); }
    if (c.seat) this.ui.tutorialEvent('hero_seated');
    // разговор начинается только от действия игрока: героя отпустили рядом с другим
    if (c.pose !== 'sleeping' && this.talk) {
      const other = this.talk.neighbour(id);
      if (other) this.talk.dialogue(id, other);
      else if (c.pose === 'sitting') this.talk.say(id, 'sit', 350);
    }
  }

  dropPet(id: string, pt: Pt) {
    const d = resolvePetDrop(this.w, id, pt, this.room);
    if (d.type === 'seat') { this.game.commit(placePet(this.w, id, { furnitureId: d.furnitureId, slot: d.slot })); this.audio.play('sleep'); return; }
    if (d.type === 'intoItem') {
      this.game.update((w) => { const p = w.pets[id]; p.x = d.x; p.y = d.y; p.seat = null; p.sleeping = false; p.inItem = d.itemId; });
      this.scene.setPetMood(id, 'happy', 1500);
      this.audio.play('pet');
      return;
    }
    this.game.update((w) => { const p = w.pets[id]; const c = clampFloor(d.x, d.y); p.x = c.x; p.y = c.y; p.seat = null; p.sleeping = false; delete p.inItem; });
    this.scene.hop(id, 14);
    this.audio.play('put');
  }

  // ---------- нажатие ----------
  tap(t: Target | null, pt: Pt) {
    const w = this.w;
    const sel = this.selection;
    if (this.decorate) { if (t?.kind === 'furn') { this.select(sel?.ref === t.ref ? null : { kind: 'furn', ref: t.ref }); this.audio.play('click'); } else this.select(null); return; }
    if (!t) {
      // «нажал предмет — нажал цель»: пустое место на полу
      if (sel?.kind === 'item') { this.dropItem(sel.ref, pt, { type: 'floor', ...clampFloor(pt.x, pt.y) }); this.select(null); }
      else if (sel?.kind === 'char' && pt.y > 560) { this.dropChar(sel.ref, { x: pt.x, y: pt.y - 110 }); }
      else this.select(null);
      return;
    }
    if (t.kind === 'char') {
      const c = w.characters[t.ref];
      if (sel?.kind === 'item') {
        const b = charBox(w, c);
        const def = ITEMS[w.items[sel.ref]?.definitionId];
        const head = def && (def.tags.includes('food') || def.tags.includes('care'));
        const at = { x: b.headX, y: head && b.headLine !== null ? b.headLine - 30 : (b.y0 + b.y1) / 2 + 30 };
        this.dropItem(sel.ref, at);
        this.select(null);
        return;
      }
      if (c.pose === 'sleeping') { this.game.commit(wake(w, t.ref)); this.audio.play('pop'); this.scene.hop(t.ref); return; }
      this.select(sel?.ref === t.ref ? null : { kind: 'char', ref: t.ref });
      this.audio.play('click');
      this.scene.pop(t.ref, 0.05);
      this.talk?.say(t.ref, 'tap', 120);
      return;
    }
    if (t.kind === 'pet') {
      const p = w.pets[t.ref];
      if (sel?.kind === 'item') { const pos = petPos(w, p); this.dropItem(sel.ref, { x: pos.x, y: pos.y - 50 }); this.select(null); return; }
      if (p.sleeping) { this.game.commit(patchPet(w, t.ref, { sleeping: false })); this.audio.play('pop'); return; }
      const pos = petPos(w, p);
      this.scene.setPetMood(t.ref, 'happy', 1500);
      this.scene.burst('heart', { x: pos.x, y: pos.y - 110 }, 3);
      this.audio.play('pet');
      return;
    }
    if (t.kind === 'item') {
      const it = w.items[t.ref];
      if (sel?.kind === 'item' && sel.ref !== t.ref && ITEMS[it.definitionId].capacity && !it.state.packed) { this.dropItem(sel.ref, pt, { type: 'into', itemId: t.ref }); this.select(null); return; }
      if (sel?.ref === t.ref) { this.select(null); return; }
      this.select({ kind: 'item', ref: t.ref });
      this.audio.play('click');
      this.scene.pop(t.ref, 0.1);
      if (it.definitionId === 'giftbox' || it.definitionId === 'book' || ITEMS[it.definitionId].capacity) this.ui.openItemMenu(t.ref);
      return;
    }
    // мебель
    const f = w.furniture[t.ref];
    const fd = FURNITURE[f.definitionId];
    if (sel?.kind === 'item') {
      const used = (kind: 'surface' | 'furniture') => new Set(Object.values(w.items).filter((i) => i.owner.kind === kind && (i.owner as { furnitureId: string }).furnitureId === f.id && i.instanceId !== sel.ref).map((i) => (i.owner as { slot: number }).slot));
      const sFree = fd.surfaces ? fd.surfaces.findIndex((_, i) => !used('surface').has(i)) : -1;
      if (sFree >= 0) { this.dropItem(sel.ref, pt, { type: 'surface', furnitureId: f.id, slot: sFree }); this.select(null); return; }
      if (fd.container) { this.dropItem(sel.ref, pt, { type: 'furniture', furnitureId: f.id, slot: 0 }); this.select(null); return; }
    }
    if (sel?.kind === 'char' && fd.seats) {
      const slot = fd.seats.findIndex((_, i) => !seatTaken(w, f.id, i, sel.ref));
      if (slot >= 0) { const s = slotPos(f, fd.seats[slot]); const pose = fd.seats[slot].pose; this.dropChar(sel.ref, pose === 'sleeping' ? { x: s.x - 150, y: s.y - 20 } : pose === 'bathing' ? { x: s.x, y: s.y - 150 } : { x: s.x, y: s.y - 70 }); return; }
    }
    this.furnitureAction(t.ref, pt);
  }

  private furnitureAction(id: string, pt: Pt) {
    const w = this.w;
    const f = w.furniture[id];
    const fd = FURNITURE[f.definitionId];
    switch (fd.tap) {
      case 'toggleOpen': this.game.commit(toggleOpen(w, id)); this.audio.play('door'); break;
      case 'tv': this.game.commit(setFurnitureOn(w, id, (f.on + 1) % (TV_SCENES + 1))); this.audio.play('click'); break;
      case 'light': this.game.commit(setRoomStyle(w, this.room, { lightOn: !w.rooms[this.room].lightOn })); this.audio.play('light'); break;
      case 'stove': this.game.commit(setFurnitureOn(w, id, f.on ? 0 : 1)); this.audio.play('click'); if (!f.on) this.scene.burst('steam', { x: f.x, y: f.y - fd.h }, 4); break;
      case 'water': {
        if (f.on) return;
        this.game.commit(setFurnitureOn(w, id, 1));
        this.audio.play('water');
        this.scene.burst('bubble', { x: f.x + 30, y: f.y - fd.h * 0.8 }, 8);
        setTimeout(() => { if (this.w.furniture[id]?.on) this.game.commit(setFurnitureOn(this.w, id, 0)); }, 1800);
        break;
      }
      case 'wardrobe': this.ui.openWardrobe(this.selection?.kind === 'char' ? this.selection.ref : null); this.audio.play('door'); break;
      default: this.select(null); void pt;
    }
  }

  // ---------- готовка ----------
  /** Рабочие места, где сейчас можно что-то приготовить (по рецепту или чудо-блюдо). */
  cookSpots(): { furnitureId: string; at: Pt; recipe: string | null }[] {
    const w = this.w;
    const out: { furnitureId: string; at: Pt; recipe: string | null }[] = [];
    for (const f of Object.values(w.furniture)) {
      if (f.roomId !== this.room || !FURNITURE[f.definitionId].workspace) continue;
      const rec = recipeAt(w, f.id);
      if (rec || cookables(w, f.id).length >= 2) out.push({ furnitureId: f.id, at: { x: f.x, y: f.y - FURNITURE[f.definitionId].h - 90 }, recipe: rec?.recipe.id ?? null });
    }
    return out;
  }
  cookAt(furnitureId: string) {
    const f = this.w.furniture[furnitureId];
    const r = cook(this.w, furnitureId);
    if (!this.game.commit(r)) { this.audio.play('nope'); return; }
    const id = r.ok ? (r.info!.instanceId as string) : '';
    const pl = itemPlace(this.w, this.w.items[id]);
    this.scene.burst('steam', { x: pl.x, y: pl.y - 40 }, 6);
    this.scene.burst('star', { x: pl.x, y: pl.y - 50 }, 6);
    this.scene.pop(id, 0.2);
    this.audio.play('cook');
    void f;
  }

  // ---------- подарки, комнаты ----------
  openGiftBox(itemId: string) {
    const pl = itemPlace(this.w, this.w.items[itemId]);
    const r = openGift(this.w, itemId);
    if (!this.game.commit(r, true)) { this.ui.toast('toast.cant'); return; }
    this.select(null);
    this.scene.burst('confetti', { x: pl.x, y: pl.y - 60 }, 26);
    this.audio.play('gift');
    const near = Object.values(this.w.characters).filter((c) => c.roomId === this.room && c.pose !== 'sleeping').sort((a, b) => dist(charPos(this.w, a), pl) - dist(charPos(this.w, b), pl))[0];
    if (near && dist(charPos(this.w, near), pl) < 420) this.talk?.say(near.id, 'gift', 700);
    const ids = r.ok ? (r.info!.opened as string[]) : [];
    ids.forEach((id, i) => setTimeout(() => this.scene.pop(id, 0.25), 80 + i * 110));
  }

  goRoom(roomId: RoomId, withHeroes: string[]) {
    if (roomId === this.room) return;
    this.select(null);
    this.talk?.stop();
    this.game.commit(travel(this.w, roomId, withHeroes.slice(0, 4)), true);
    this.audio.play('door');
  }

  /** Куда поставить новую вещь из каталога. */
  spawnSpot(): Pt { return freeFloorSpot(this.w, this.room, { x: this.scene.camX + this.scene.viewW / 2, y: 800 }); }
}
