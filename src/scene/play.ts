// Игровые взаимодействия: что происходит при нажатии и при отпускании. Связывает правила, сцену и звук.
import type { GameAudio } from '../audio/audio';
import { BOUND_CHARS, DISCO_BALL, FARM_KINDS, FURNITURE, PEN_KINDS, GRAIN_EATERS, HAY_EATERS, TV_SCENES } from '../content/furniture';
import { ITEMS } from '../content/items';
import { resolveCharDrop, resolveItemDrop, resolvePetDrop, freeFloorSpot, type ItemDrop } from '../game/drop';
import type { Game } from '../game/game';
import { charBox, charPos, clampFloor, dist, itemPlace, petPos, slotPos } from '../game/geometry';
import {
  HEADWEAR, POURS, clone, collectEgg, eatFromFeeder, emptyBowl, fillBowl, fillFeeder, henFed, waterBed, cook, cookables, drink, feed, fill, moveItem, openGift, patchPet, placeCharacter, placePet, recipeAt, seatTaken, setFurnitureOn,
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
  /** героя поставили за DJ-пульт */
  djStart?(): void;
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
    return t.kind !== 'furn'; // в обычном режиме мебель защищена от случайного движения: её поднимают долгим нажатием
  }
  /** Долгое нажатие на мебель поднимает её и в обычной игре. */
  canLift(t: Target): boolean { return t.kind === 'furn' && !!this.w.furniture[t.ref]?.roomId; }
  lifted(t: Target) { this.select(null); this.scene.pop(t.ref, 0.06); this.audio.play('pop'); try { navigator.vibrate?.(15); } catch { /* нет вибрации */ }
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
      case 'feeder': case 'bed': { const f = w.furniture[d.furnitureId]; return { x: f.x, y: f.y - 30, r: 70 }; }
      case 'farmfeed': { const p = petPos(w, w.pets[d.petId]); return { x: p.x, y: p.y - 50, r: 60 }; }
      case 'into': case 'pour': case 'water': case 'bowl': { const pl = itemPlace(w, w.items[d.itemId]); return { x: pl.x, y: pl.y - 30, r: 52 }; }
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
        // сначала проверяем, что это можно съесть или выпить; сам мир меняется после анимации
        const drinking = !!it.state.contents;
        const asDrink = drinking || def.tags.includes('drink');
        if (!(drinking ? drink(w, itemId) : feed(w, itemId)).ok) return fail('toast.notFood');
        const heroId = d.characterId;
        const b0 = charBox(w, w.characters[heroId]);
        const mouth = this.scene.mouthPos(heroId) ?? { x: b0.headX, y: (b0.headLine ?? b0.y0 + 80) - 30 };
        this.audio.play('pop');
        setTimeout(() => this.audio.play(asDrink ? 'gulp' : 'munch'), 260);
        this.scene.consume(itemId, mouth, asDrink ? 'drink' : 'eat', () => {
          const cur = this.w;
          const r = drinking ? drink(cur, itemId) : feed(cur, itemId);
          if (!r.ok || !r.world.characters[heroId]) return;
          let next = r.world;
          // что осталось (чашка, тарелка, недоеденное) — герой держит в руке, если она свободна
          if (next.items[itemId]) { const held = moveItem(next, itemId, { kind: 'hand', characterId: heroId, slot: 'right' }); if (held.ok) next = held.world; }
          next.characters[heroId].emotion = it.definitionId === 'wonderdish' ? 'silly' : 'delight';
          next.characters[heroId].dream = it.definitionId;
          this.game.commit({ ok: true, world: next });
          this.scene.burst(asDrink ? 'bubble' : 'crumb', { x: mouth.x, y: mouth.y + 6 }, asDrink ? 4 : 6);
          this.scene.pop(heroId, 0.08);
          this.talk?.say(heroId, 'food', 350);
        });
        return;
      }
      case 'feeder': {
        // сено в кормушку или зерно на землю: одна порция, сено и ведёрко многоразовые
        const f = w.furniture[d.furnitureId];
        if (!fillFeeder(w, d.furnitureId).ok) return fail('farm.feederFull');
        this.audio.play('crunch');
        const drops = window.setInterval(() => this.scene.burst('crumb', { x: f.x, y: f.y - 40 }, 2), 160);
        this.scene.consume(itemId, { x: f.x + 50, y: f.y - 130 }, 'tilt', () => {
          window.clearInterval(drops);
          this.game.commit(fillFeeder(this.w, d.furnitureId));
          this.scene.sync(this.w);
        });
        return;
      }
      case 'farmfeed': {
        // сено или зерно поднесли прямо зверю: он ест и радуется, запас не убывает
        const pet = w.pets[d.petId];
        const pos = petPos(w, pet);
        if (pet.sleeping) this.game.commit(patchPet(w, d.petId, { sleeping: false }));
        this.scene.setPetMood(d.petId, 'happy', 1800);
        this.audio.play('crunch');
        this.scene.burst('crumb', { x: pos.x, y: pos.y - 50 }, 5);
        this.scene.consume(itemId, { x: pos.x + 40, y: pos.y - 60 }, 'eat', () => {
          if (pet.kind === 'hen') this.game.commit(henFed(this.w));
          this.scene.sync(this.w);
          this.scene.burst('heart', { x: pos.x, y: pos.y - 110 }, 2);
          this.scene.hop(d.petId, 16);
        });
        return;
      }
      case 'bed': {
        // полив грядки: росток, потом цветок
        const f = w.furniture[d.furnitureId];
        this.audio.play('pour');
        const rain = window.setInterval(() => this.scene.burst('bubble', { x: f.x, y: f.y - 60 }, 2), 200);
        this.scene.consume(itemId, { x: f.x + 80, y: f.y - 150 }, 'tilt', () => {
          window.clearInterval(rain);
          const r = waterBed(this.w, d.furnitureId);
          this.game.commit(r);
          this.scene.sync(this.w);
          this.scene.burst(r.ok && r.info!.level === 2 ? 'heart' : 'star', { x: f.x, y: f.y - 70 }, 5);
          this.audio.play('sparkle');
        });
        return;
      }
      case 'bowl': {
        // мешок корма сыплет гранулы в правую половину; вода из кувшина или чашки — в левую
        const r = fillBowl(w, d.itemId, d.half);
        if (!r.ok) return fail('toast.bowlFull');
        const pl = itemPlace(w, w.items[d.itemId]);
        const at = { x: pl.x + (d.half === 'kibble' ? 24 : -24), y: pl.y - 40 };
        this.audio.play(d.half === 'kibble' ? 'crunch' : 'pour');
        const drops = window.setInterval(() => this.scene.burst(d.half === 'kibble' ? 'crumb' : 'bubble', { x: at.x, y: at.y - 20 }, 2), 160);
        this.scene.consume(itemId, { x: at.x + (d.half === 'kibble' ? 40 : -40), y: at.y - 95 }, 'tilt', () => {
          window.clearInterval(drops);
          let next = fillBowl(this.w, d.itemId, d.half);
          // чашка или стакан отдают свою воду; кувшин и мешок многоразовые
          if (next.ok && d.half === 'water' && this.w.items[itemId]?.state.contents) { const dr = drink(next.world, itemId); if (dr.ok) next = dr; }
          this.game.commit(next);
          this.scene.sync(this.w); // мешок или кувшин возвращаются туда, откуда их взяли
          this.scene.pop(d.itemId, 0.14);
        });
        return;
      }
      case 'pour': {
        const liquid = POURS[it.definitionId];
        if (!liquid || !this.game.commit(fill(w, d.itemId, liquid))) return fail('toast.cant');
        const pl = itemPlace(this.w, this.w.items[d.itemId]);
        this.scene.pop(d.itemId, 0.18);
        this.scene.burst('bubble', { x: pl.x, y: pl.y - 44 }, 5);
        this.audio.play('pour');
        return;
      }
      case 'care': {
        // щётка чистит зубы у рта, расчёска причёсывает, полотенце вытирает, мыло пенится
        const heroId = d.characterId, id = it.definitionId;
        const b0 = charBox(w, w.characters[heroId]);
        const mouth = this.scene.mouthPos(heroId) ?? { x: b0.headX, y: (b0.headLine ?? b0.y0 + 80) - 30 };
        const top = this.scene.headTop(heroId) ?? { x: mouth.x, y: mouth.y - 70 };
        const at = id === 'toothbrush' ? mouth : id === 'comb' ? { x: top.x, y: top.y + 18 } : { x: mouth.x, y: mouth.y - 24 };
        const motion = id === 'toothbrush' ? 'scrub' : id === 'comb' ? 'stroke' : 'rub';
        const fx = id === 'toothbrush' || id === 'soap' ? 'bubble' : 'star';
        this.audio.play('pop');
        setTimeout(() => this.audio.play(id === 'comb' ? 'sparkle' : 'scrub'), 240);
        const foam = id === 'comb' ? 0 : window.setInterval(() => this.scene.burst(fx, { x: at.x, y: at.y }, 2), 260);
        this.scene.consume(itemId, at, motion, () => {
          window.clearInterval(foam);
          const cur = clone(this.w);
          if (!cur.characters[heroId] || !cur.items[itemId]) return;
          cur.characters[heroId].emotion = id === 'toothbrush' ? 'delight' : 'joy';
          const held = moveItem(cur, itemId, { kind: 'hand', characterId: heroId, slot: 'right' });
          this.game.commit(held.ok ? held : { ok: true, world: cur });
          this.scene.burst('star', { x: at.x, y: at.y - 20 }, 8);
          this.scene.pop(heroId, 0.08);
          this.audio.play('sparkle');
        });
        return;
      }
      case 'water': {
        const pl = itemPlace(w, w.items[d.itemId]);
        const potId = d.itemId;
        this.audio.play('pour');
        const rain = window.setInterval(() => this.scene.burst('bubble', { x: pl.x, y: pl.y - 70 }, 2), 220);
        this.scene.consume(itemId, { x: pl.x + 70, y: pl.y - 120 }, 'tilt', () => {
          window.clearInterval(rain);
          this.scene.sync(this.w); // лейка возвращается туда, где была
          this.scene.pop(potId, 0.25);
          this.scene.burst('heart', { x: pl.x, y: pl.y - 70 }, 5);
          this.audio.play('sparkle');
        });
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
        if (it.definitionId === 'giftbox') {
          // подарок вручили: герой улыбается, над ним сердечко; в клубе — своя реплика
          this.game.update((x) => { const c = x.characters[d.characterId]; if (c) c.emotion = 'delight'; });
          const b = charBox(this.w, this.w.characters[d.characterId]);
          this.scene.burst('heart', { x: b.headX, y: (b.headLine ?? b.y0 + 80) - 70 }, 3);
          this.talk?.say(d.characterId, this.room === 'club' ? 'party' : 'gift', 300);
        }
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
        const wasDirty = it.state.dirty, wasEmpty = !it.state.contents;
        const r = moveItem(w, itemId, { kind: 'surface', furnitureId: d.furnitureId, slot: d.slot });
        if (!this.game.commit(r)) return fail('toast.full');
        this.audio.play('put');
        if (wasEmpty && this.w.items[itemId]?.state.contents) { const pl = itemPlace(this.w, this.w.items[itemId]); this.scene.burst('bubble', { x: pl.x, y: pl.y - 44 }, 6); this.scene.pop(itemId, 0.15); this.audio.play('pour'); }
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
        if (!this.ballGame(itemId)) this.petsReact(itemId);
        return;
      }
      default: void def; this.audio.play('nope');
    }
  }

  /** Мячик в Парке животных: ближайший бодрствующий питомец подбегает и толкает мяч носом; бульдог приносит его обратно. */
  private ballGame(itemId: string): boolean {
    const it = this.w.items[itemId];
    if (this.room !== 'animals' || !it || it.owner.kind !== 'room' || !['ball', 'pet_rope_ball'].includes(it.definitionId)) return false;
    const at = { x: it.owner.x, y: it.owner.y };
    const pets = Object.values(this.w.pets).filter((p) => p.roomId === 'animals' && !p.sleeping && !p.seat && !p.inItem);
    if (!pets.length) return true;
    const pet = pets.reduce((a, b) => (Math.hypot(a.x - at.x, a.y - at.y) <= Math.hypot(b.x - at.x, b.y - at.y) ? a : b));
    const home = { x: pet.x, y: pet.y };
    const side = pet.x <= at.x ? -1 : 1; // с какой стороны питомец подбегает к мячу
    const near = clampFloor(at.x + side * 70, at.y + 6);
    this.scene.setPetMood(pet.id, 'play', 1200);
    this.scene.glide(pet.id, near, 650, () => {
      if (!this.w.pets[pet.id] || !this.w.items[itemId] || this.w.items[itemId].owner.kind !== 'room') { this.scene.sync(this.w); return; }
      const fetch = pet.kind === 'frenchie';
      const ballTo = fetch ? clampFloor(home.x + 60, home.y + 10) : clampFloor(at.x - side * 150, at.y);
      const petTo = fetch ? home : near;
      this.audio.play('boing');
      this.scene.burst('heart', { x: near.x, y: near.y - 110 }, 3);
      this.scene.setPetMood(pet.id, 'happy', 1800);
      const finish = () => {
        this.game.update((w) => { const p = w.pets[pet.id]; const b = w.items[itemId]; if (p) { p.x = petTo.x; p.y = petTo.y; p.flipped = false; } if (b && b.owner.kind === 'room') { b.owner.x = ballTo.x; b.owner.y = ballTo.y; } });
        this.scene.hop(pet.id, 26);
        this.audio.play('pet');
      };
      this.scene.glide(itemId, ballTo, fetch ? 700 : 450, () => undefined);
      if (fetch) this.scene.glide(pet.id, petTo, 700, finish); else window.setTimeout(finish, 460);
    });
    return true;
  }

  /** Жителя фермы пытаются унести (на дверь, карту или в сумку): он остаётся и спокойно отвечает. */
  farmStay(petId: string): boolean {
    const p = this.w.pets[petId];
    if (!p || !FARM_KINDS.has(p.kind)) return false;
    this.ui.toast('farm.home');
    this.scene.hop(petId, 12);
    this.petVoice(p.kind);
    return true;
  }

  /** время, до которого питомцы молчат: один голос за раз и пауза между повторами */
  private petQuietUntil = 0;
  /** сколько раз и каким голосом отвечали питомцы — для проверок */
  petVoiceLog: string[] = [];
  /** Зверь отвечает своим голосом. Не звучит поверх реплики героя и чаще, чем раз в пару секунд. */
  petVoice(kind: string): boolean {
    const now = performance.now();
    if (now < this.petQuietUntil || this.talk?.speaking) return false;
    const voice = ({ cat: 'meow', dog: 'woof', frenchie: 'frenchie', wolf: 'howl', capybara: 'whistle', rabbit: 'sniff', cow: 'moo', sheep: 'baa', pig: 'oink', goat: 'meh', hen: 'cluck', chick: 'peep', pony: 'neigh' } as const)[kind as 'cat'];
    if (!voice) return false;
    this.petQuietUntil = now + 2200;
    this.petVoiceLog.push(voice);
    this.audio.play(voice);
    return true;
  }

  /** Житель фермы у полной кормушки: ест, радуется, порция исчезает в конце (если его не увели). */
  private feederMeal(petId: string): boolean {
    const p = this.w.pets[petId];
    if (!p || p.seat || p.sleeping) return false;
    const f = Object.values(this.w.furniture).find((x) => x.roomId === this.room && x.on > 0 && ['trough', 'grain'].includes(FURNITURE[x.definitionId].farm ?? '') && Math.abs(x.x - p.x) < FURNITURE[x.definitionId].w / 2 + 120 && (FURNITURE[x.definitionId].farm === 'trough' ? HAY_EATERS : GRAIN_EATERS).has(p.kind));
    if (!f) return false;
    const spot = { x: p.x, y: p.y };
    this.scene.setPetMood(petId, 'happy', 1500);
    this.audio.play('crunch');
    this.scene.burst('crumb', { x: f.x, y: f.y - 30 }, 4);
    window.setTimeout(() => {
      const c = this.w.pets[petId];
      if (!c || c.roomId !== this.room || c.x !== spot.x || c.y !== spot.y || this.scene.dragging === petId) return;
      if (!this.game.commit(eatFromFeeder(this.w, f.id, petId))) return;
      this.scene.burst('heart', { x: spot.x, y: spot.y - 120 }, 2);
      this.scene.hop(petId, 16);
      this.petVoice(c.kind);
    }, 1450);
    return true;
  }

  /** Питомец у двойной миски: ест корм (правая половина) или пьёт воду (левая). Порция исчезает только в конце и только если зверя не унесли. */
  private bowlMeal(petId: string): boolean {
    const p = this.w.pets[petId];
    if (!p || p.seat || p.sleeping) return false;
    const bowls = Object.values(this.w.items).filter((i) => i.definitionId === 'pet_double_bowl' && (i.state.kibble || i.state.water)).map((i) => ({ i, pl: itemPlace(this.w, i) })).filter((b) => b.pl.roomId === this.room && b.pl.visible && Math.hypot(b.pl.x - p.x, b.pl.y - p.y) < 150);
    if (!bowls.length) return false;
    const { i: bowl, pl } = bowls[0];
    const half = bowl.state.kibble ? 'kibble' : 'water';
    // зверь встаёт сбоку от нужной половины и поворачивается к ней
    const side = half === 'kibble' ? 1 : -1;
    const spot = clampFloor(pl.x + side * 95, Math.max(pl.y + 4, 640));
    this.game.update((w) => { const c = w.pets[petId]; c.x = spot.x; c.y = spot.y; c.flipped = side < 0; });
    this.scene.setPetMood(petId, 'eat', 1500);
    this.audio.play(half === 'kibble' ? 'crunch' : 'lap');
    this.scene.burst(half === 'kibble' ? 'crumb' : 'bubble', { x: pl.x + side * 24, y: pl.y - 44 }, 4);
    window.setTimeout(() => {
      const c = this.w.pets[petId], b = this.w.items[bowl.instanceId];
      // унесли питомца или миску — порция остаётся
      if (!c || !b || c.roomId !== this.room || c.x !== spot.x || c.y !== spot.y || c.seat || this.scene.dragging === petId) return;
      const bp = itemPlace(this.w, b);
      if (bp.roomId !== this.room || Math.abs(bp.x - pl.x) > 2 || Math.abs(bp.y - pl.y) > 2) return;
      if (!this.game.commit(emptyBowl(this.w, bowl.instanceId, half))) return;
      this.scene.setPetMood(petId, 'happy', 1500);
      this.scene.burst('heart', { x: spot.x, y: spot.y - 110 }, 2);
      this.scene.hop(petId, 16);
    }, 1450);
    return true;
  }

  /** Питомца погладили: он прикрывает глаза, над ним сердечко. Ничего не сохраняется — это просто ласка. */
  petStroke(id: string) {
    const p = this.w.pets[id];
    if (!p || p.roomId !== this.room) return;
    const pos = petPos(this.w, p);
    if (!p.sleeping) this.scene.setPetMood(id, ['capybara', 'frenchie', 'wolf'].includes(p.kind) ? 'play' : 'happy', 1600); // у жителей фермы это радостная поза
    this.scene.burst('heart', { x: pos.x, y: pos.y - 120 }, 2);
    this.audio.play('pet');
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
    // героя отпустили за DJ-пультом — только это включает клубную музыку
    if (c.seat && this.w.furniture[c.seat.furnitureId]?.definitionId === 'djconsole') this.ui.djStart?.();
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
    if (this.feederMeal(id) || this.bowlMeal(id)) return;
    if (this.room === 'animals') this.parkHabits(id);
  }

  /** Каждая вещь по нажатию делает что-то своё: мяч прыгает, машинка едет, утка пищит. */
  private itemTrick(id: string) {
    const it = this.w.items[id];
    const def = ITEMS[it.definitionId];
    const pl = itemPlace(this.w, it);
    const top = { x: pl.x, y: pl.y - def.h };
    const T: Record<string, [Parameters<Scene['trick']>[1], Parameters<GameAudio['play']>[0], Parameters<Scene['burst']>[0]?]> = {
      ball: ['bounce', 'boing'], planet: ['spin', 'whoosh', 'star'], car: ['roll', 'vroom'], sled: ['roll', 'whoosh'],
      rocket: ['fly', 'whoosh', 'star'], balloon: ['fly', 'squeak'], duck: ['squash', 'squeak'], robot: ['wiggle', 'beep'],
      teddy: ['squash', 'pet', 'heart'], bunnytoy: ['bounce', 'pet', 'heart'], doll: ['wiggle', 'pet', 'heart'], blocks: ['wiggle', 'put'],
      snowglobe: ['wiggle', 'sparkle', 'bubble'], starlamp: ['squash', 'light', 'star'], wand: ['spin', 'sparkle', 'star'], crown: ['squash', 'sparkle', 'star'],
      mask: ['wiggle', 'squeak'], partyhat: ['bounce', 'gift', 'confetti'], pillow: ['squash', 'put'], mittens: ['wiggle', 'put'],
      wateringcan: ['wiggle', 'water', 'bubble'], flowerpot: ['squash', 'sparkle', 'heart'], soap: ['squash', 'scrub', 'bubble'], towel: ['wiggle', 'put'],
      toothbrush: ['wiggle', 'scrub', 'bubble'], comb: ['wiggle', 'click'], petbrush: ['wiggle', 'click'], bone: ['spin', 'pet'], kibble: ['wiggle', 'munch', 'crumb'],
      beach_bucket: ['squash', 'put'], beach_float: ['bounce', 'boing'], beach_sandcastle: ['squash', 'sparkle', 'star'], club_microphone: ['wiggle', 'squeak', 'star'], club_headphones: ['wiggle', 'click'], club_drum: ['squash', 'boing'],
      toy_octopus: ['wiggle', 'pet', 'heart'], toy_train: ['roll', 'vroom', 'steam'], toy_dinosaur: ['roll', 'squeak'], toy_music_box: ['spin', 'gift', 'star'], toy_jack_box: ['bounce', 'boing', 'confetti'], toy_ribbon_station: ['wiggle', 'put'],
      cafe_mixer: ['wiggle', 'cook'], cafe_rolling_pin: ['roll', 'put'], cafe_mixing_bowl: ['wiggle', 'clink'], pet_double_bowl: ['wiggle', 'clink'], pet_grooming_brush: ['wiggle', 'click'], pet_rope_ball: ['bounce', 'boing'],
      fair_rings: ['bounce', 'clink'], fair_popcorn: ['squash', 'pop', 'crumb'], fair_cotton_candy: ['wiggle', 'pop'], fair_plush_prize: ['squash', 'pet', 'heart'], pet_picnic_box: ['squash', 'put'],
      teapot: ['wiggle', 'water', 'steam'], cocoa: ['squash', 'pop', 'steam'], basket: ['squash', 'put'], giftbox: ['wiggle', 'gift', 'star'], book: ['squash', 'put'],
    };
    const tr = T[it.definitionId] ?? (def.tags.includes('tableware') ? ['wiggle', 'clink'] : def.tags.includes('food') || def.tags.includes('ingredient') ? ['squash', 'pop'] : def.tags.includes('costume') ? ['spin', 'sparkle', 'star'] : ['wiggle', 'click']);
    this.scene.trick(id, tr[0]);
    this.audio.play(tr[1]);
    if (tr[2]) this.scene.burst(tr[2], top, 5);
  }

  /** Привычки зверей в парке: капибара у берега идёт к воде отдыхать, волк ищет игрушку по следам. */
  private parkHabits(id: string) {
    const p = this.w.pets[id];
    const pond = this.w.furniture.an_pond;
    if (p.kind === 'capybara' && pond && pond.roomId === 'animals' && Math.abs(p.x - pond.x) < 330 && p.y < 760) {
      const shore = { x: Math.max(pond.x - 150, Math.min(pond.x + 170, p.x)), y: pond.y + 100 };
      this.scene.glide(id, shore, 900, () => {
        this.game.update((w) => { const c = w.pets[id]; if (c) { c.x = shore.x; c.y = shore.y; } });
        this.scene.setPetMood(id, 'play', 5000); // глаза прикрыты — отдыхает у воды
        this.scene.burst('bubble', { x: shore.x, y: shore.y - 30 }, 6);
        this.audio.play('water');
      });
      return;
    }
    if (p.kind === 'wolf') {
      const toys = Object.values(this.w.items).filter((i) => i.owner.kind === 'room' && i.owner.roomId === 'animals' && ITEMS[i.definitionId].tags.includes('toy'));
      if (!toys.length) return;
      const toy = toys.reduce((a, b) => (Math.abs((a.owner as { x: number }).x - p.x) >= Math.abs((b.owner as { x: number }).x - p.x) ? a : b)); // самая дальняя — интереснее искать
      const o = toy.owner as { x: number; y: number };
      const to = clampFloor(o.x + (p.x < o.x ? -80 : 80), o.y + 4);
      // следы на земле от волка к игрушке
      for (let i = 1; i <= 4; i++) window.setTimeout(() => this.scene.burst('crumb', { x: p.x + ((to.x - p.x) * i) / 5, y: p.y + ((to.y - p.y) * i) / 5 - 6 }, 2), i * 160);
      window.setTimeout(() => this.scene.glide(id, to, 1100, () => {
        this.game.update((w) => { const c = w.pets[id]; if (c) { c.x = to.x; c.y = to.y; } });
        this.scene.setPetMood(id, 'happy', 1800);
        this.scene.pop(toy.instanceId, 0.2);
        this.scene.burst('star', { x: o.x, y: o.y - 50 }, 6);
        this.audio.play('sparkle');
      }), 500);
    }
  }

  // ---------- нажатие ----------
  tap(t: Target | null, pt: Pt) {
    const w = this.w;
    const sel = this.selection;
    if (this.decorate) { if (t?.kind === 'furn') { this.select(sel?.ref === t.ref ? null : { kind: 'furn', ref: t.ref }); this.audio.play('click'); } else this.select(null); return; }
    if (!t && this.room === 'club' && Math.hypot(pt.x - DISCO_BALL.x, pt.y - DISCO_BALL.y) < DISCO_BALL.r + 8) {
      // диско-шар: тап включает, второй тап выключает
      this.game.update((x) => { x.rooms.club.ball = !x.rooms.club.ball; });
      this.audio.play('light');
      return;
    }
    if (!t && this.room === 'farm_yard') {
      // пустое гнездо: спокойная подсказка
      const nest = Object.values(w.furniture).find((f) => f.roomId === 'farm_yard' && FURNITURE[f.definitionId].farm === 'nest');
      if (nest && Math.hypot(pt.x - nest.x, pt.y - (nest.y - 20)) < 70) { this.nestTap(nest.id); return; }
    }
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
        const head = def && (def.tags.includes('food') || def.tags.includes('care') || HEADWEAR.has(def.id) || !!w.items[sel.ref]?.state.contents);
        const at = { x: b.headX, y: head && b.headLine !== null ? b.headLine - 30 : (b.y0 + b.y1) / 2 + 30 };
        this.dropItem(sel.ref, at);
        this.select(null);
        return;
      }
      if (c.pose === 'sleeping') { this.game.commit(wake(w, t.ref)); this.audio.play('pop'); this.scene.hop(t.ref); return; }
      this.select(sel?.ref === t.ref ? null : { kind: 'char', ref: t.ref });
      this.audio.play('click');
      this.scene.pop(t.ref, 0.05);
      // фермер машет и иногда говорит своё
      if (BOUND_CHARS[t.ref]) { this.game.update((x) => { x.characters[t.ref].emotion = 'joy'; }); this.scene.hop(t.ref, 10); this.talk?.say(t.ref, 'farmer', 120); }
      else this.talk?.say(t.ref, 'tap', 120);
      return;
    }
    if (t.kind === 'pet') {
      const p = w.pets[t.ref];
      if (sel?.kind === 'item') { const pos = petPos(w, p); this.dropItem(sel.ref, { x: pos.x, y: pos.y - 50 }); this.select(null); return; }
      if (p.sleeping) { this.game.commit(patchPet(w, t.ref, { sleeping: false })); this.audio.play('pop'); return; }
      const pos = petPos(w, p);
      this.scene.setPetMood(t.ref, 'happy', 1500);
      this.scene.burst('heart', { x: pos.x, y: pos.y - 110 }, 3);
      if (!this.petVoice(p.kind)) this.audio.play('pet');
      if (PEN_KINDS.has(p.kind)) this.scene.hop(t.ref, 46); // один мягкий прыжок и обратно на место
      return;
    }
    if (t.kind === 'item') {
      const it = w.items[t.ref];
      if (sel?.kind === 'item' && sel.ref !== t.ref && ITEMS[it.definitionId].capacity && !it.state.packed) { this.dropItem(sel.ref, pt, { type: 'into', itemId: t.ref }); this.select(null); return; }
      if (sel?.ref === t.ref) { this.select(null); return; }
      this.select({ kind: 'item', ref: t.ref });
      this.itemTrick(t.ref);
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
    if (fd.farm === 'nest') { this.nestTap(id); return; }
    if (fd.farm) { this.select(null); return; }
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
      case 'toggleOn': this.game.commit(setFurnitureOn(w, id, f.on ? 0 : 1)); this.audio.play('light'); this.select(null); break; // прожектор клуба: звёздочки
      case 'wardrobe': this.ui.openWardrobe(this.selection?.kind === 'char' ? this.selection.ref : null); this.audio.play('door'); break;
      default: this.select(null); void pt;
    }
  }

  /** Гнездо в курятнике: яйцо собирается в корзинку (или на землю рядом). Пустое гнездо яиц не выдаёт. */
  private nestTap(nestId: string) {
    const r = collectEgg(this.w, nestId);
    if (!this.game.commit(r) || !r.ok) { this.ui.toast('farm.nestEmpty'); this.audio.play('nope'); return; }
    const egg = r.info!.instanceId as string;
    const pl = itemPlace(this.w, r.info!.inBasket ? this.w.items[(this.w.items[egg].owner as { itemId: string }).itemId] : this.w.items[egg]);
    this.audio.play('pop');
    this.scene.burst('star', { x: pl.x, y: pl.y - 50 }, 5);
    if (!r.info!.inBasket) this.scene.pop(egg, 0.25);
    this.petVoice('hen');
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

  goRoom(roomId: RoomId, withHeroes: string[], withPets: string[] = []) {
    if (roomId === this.room) return;
    this.select(null);
    this.talk?.stop();
    this.game.commit(travel(this.w, roomId, withHeroes.slice(0, 4), withPets), true);
    this.audio.play('door');
  }

  /** Куда поставить новую вещь из каталога. */
  spawnSpot(): Pt { return freeFloorSpot(this.w, this.room, { x: this.scene.camX + this.scene.viewW / 2, y: 800 }); }
}
