import { describe, expect, it } from 'vitest';
import { createWorld, parseWorld, repairWorld, validateWorld } from '../../src/game/world';
import {
  applyGarment, cook, deleteCharacter, feed, handItems, isValidOutfit, moveItem, openGift, addCustomCharacter,
  placeCharacter, removeGarment, spawnItem, takeGiftSet, tidyRoom, travel, wrapGift, newEmptyGift, storeFurniture, moveFurniture,
} from '../../src/game/rules';
import { itemPlace } from '../../src/game/geometry';
import { resolveItemDrop } from '../../src/game/drop';
import { K_BACKUP, K_WORLD, MemoryKV, Saver, loadWorld } from '../../src/storage/store';
import type { World } from '../../src/game/types';

const must = (r: ReturnType<typeof moveItem>): World => { if (!r.ok) throw new Error(r.reason); return r.world; };
const find = (w: World, def: string, pred: (o: any) => boolean = () => true) => Object.values(w.items).find((i) => i.definitionId === def && pred(i.owner))!;

describe('новый мир', () => {
  it('цел и проходит проверку', () => {
    const w = createWorld();
    expect(validateWorld(w)).toEqual([]);
    expect(Object.keys(w.characters)).toHaveLength(6);
    expect(parseWorld(JSON.stringify(w)).ok).toBe(true);
  });
});

describe('владение предметами', () => {
  it('чашка переходит в руку и остаётся одна после поездки в другую комнату', () => {
    let w = createWorld();
    const cup = find(w, 'cup', (o) => o.kind === 'surface');
    w = must(moveItem(w, cup.instanceId, { kind: 'hand', characterId: 'hero_mila', slot: 'left' }));
    w = must(placeCharacter(w, 'hero_mila', { furnitureId: 'lv_sofa', slot: 1 }));
    w = must(travel(w, 'kitchen', ['hero_mila']));
    expect(w.items[cup.instanceId].owner).toEqual({ kind: 'hand', characterId: 'hero_mila', slot: 'left' });
    expect(itemPlace(w, w.items[cup.instanceId]).roomId).toBe('kitchen');
    expect(Object.values(w.items).filter((i) => i.instanceId === cup.instanceId)).toHaveLength(1);
    expect(w.characters.hero_mila.seat).toBeNull();
    expect(validateWorld(w)).toEqual([]);
  });

  it('занятые руки ничего не затирают', () => {
    let w = createWorld();
    const [a, b, c] = ['cup', 'book', 'teapot'].map((d) => find(w, d, (o) => o.kind === 'surface').instanceId);
    w = must(moveItem(w, a, { kind: 'hand', characterId: 'hero_mila', slot: 'left' }));
    w = must(moveItem(w, b, { kind: 'hand', characterId: 'hero_mila', slot: 'left' })); // левая занята → правая
    expect(w.items[b].owner).toMatchObject({ slot: 'right' });
    const r = moveItem(w, c, { kind: 'hand', characterId: 'hero_mila', slot: 'left' });
    expect(r).toEqual({ ok: false, reason: 'hands_full' });
    expect(Object.keys(handItems(w, 'hero_mila')).sort()).toEqual(['left', 'right']);
  });

  it('большая коробка занимает обе руки', () => {
    let w = createWorld();
    w = must(takeGiftSet(w, 'space', 'living', { x: 800, y: 800 }));
    const box = find(w, 'giftbox');
    const cup = find(w, 'cup', (o) => o.kind === 'surface');
    w = must(moveItem(w, cup.instanceId, { kind: 'hand', characterId: 'hero_mila', slot: 'left' }));
    expect(moveItem(w, box.instanceId, { kind: 'hand', characterId: 'hero_mila', slot: 'left' }).ok).toBe(false);
    w = must(moveItem(w, box.instanceId, { kind: 'hand', characterId: 'hero_timur', slot: 'left' }));
    expect(w.items[box.instanceId].owner).toMatchObject({ slot: 'both' });
    expect(moveItem(w, cup.instanceId, { kind: 'hand', characterId: 'hero_timur', slot: 'right' }).ok).toBe(false);
  });

  it('девятый предмет в полную сумку не удаляется', () => {
    let w = createWorld();
    for (let i = 0; i < 8; i++) w = must(spawnItem(w, 'apple', { kind: 'bag', slot: i }));
    const extra = must(spawnItem(w, 'apple', { kind: 'room', roomId: 'living', x: 500, y: 800 }));
    const id = Object.keys(extra.items).find((k) => !w.items[k])!;
    const r = moveItem(extra, id, { kind: 'bag', slot: 0 });
    expect(r).toEqual({ ok: false, reason: 'bag_full' });
    expect(extra.items[id].owner.kind).toBe('room');
  });

  it('контейнер не может содержать себя или своего предка', () => {
    let w = createWorld();
    const basket = find(w, 'basket').instanceId;
    w = must(spawnItem(w, 'basket', { kind: 'item', itemId: basket, slot: 0 }));
    const inner = Object.values(w.items).find((i) => i.owner.kind === 'item' && i.definitionId === 'basket')!.instanceId;
    expect(moveItem(w, basket, { kind: 'item', itemId: basket, slot: 1 })).toEqual({ ok: false, reason: 'cycle' });
    expect(moveItem(w, basket, { kind: 'item', itemId: inner, slot: 0 })).toEqual({ ok: false, reason: 'cycle' });
  });

  it('игрушка в закрытом ящике невидима, но сохраняется', () => {
    const w = createWorld();
    const teddy = find(w, 'teddy', (o) => o.kind === 'furniture');
    expect(w.furniture.lv_toybox.open).toBe(false);
    expect(itemPlace(w, teddy).visible).toBe(false);
  });

  it('бросок за границу комнаты приводится к допустимой точке пола', () => {
    const w = createWorld();
    const ball = find(w, 'ball');
    const d = resolveItemDrop(w, ball.instanceId, { x: 5000, y: -400 }, 'living');
    expect(d.type).toBe('floor');
    if (d.type === 'floor') { expect(d.x).toBeLessThanOrEqual(1550); expect(d.y).toBeGreaterThanOrEqual(630); }
  });
});

describe('одежда', () => {
  it('цельный наряд заменяет верх и низ и обратно', () => {
    let o = applyGarment({ top: { id: 'tee', color: 0 }, bottom: { id: 'shorts', color: 0 } }, 'gown', 1)!;
    expect(o.top).toBeUndefined(); expect(o.bottom).toBeUndefined(); expect(o.dress).toEqual({ id: 'gown', color: 1 });
    o = applyGarment(o, 'hoodie', 2)!;
    expect(o.dress).toBeUndefined(); expect(o.top!.id).toBe('hoodie'); expect(o.bottom).toBeDefined();
    expect(isValidOutfit(o)).toBe(true);
  });
  it('основу нельзя снять, аксессуар можно; неизвестная вещь не ломает наряд', () => {
    const o = applyGarment({ dress: { id: 'tutu', color: 0 } }, 'crown')!;
    expect(removeGarment(o, 'dress')).toBeNull();
    expect(removeGarment(o, 'hat')!.hat).toBeUndefined();
    expect(applyGarment(o, 'nope')).toBeNull();
    expect(isValidOutfit({ top: { id: 'tee', color: 0 } })).toBe(false);
    expect(isValidOutfit({ top: { id: 'gown', color: 0 }, bottom: { id: 'shorts', color: 0 } })).toBe(false);
  });
});

describe('еда', () => {
  it('бутерброд: ингредиенты расходуются, тарелка остаётся', () => {
    let w = createWorld();
    for (const [i, d] of ['bread', 'cheese', 'tomato'].entries()) w = must(moveItem(w, find(w, d).instanceId, { kind: 'surface', furnitureId: 'kt_counter', slot: i }));
    const before = Object.keys(w.items).length;
    w = must(cook(w, 'kt_counter'));
    expect(Object.keys(w.items).length).toBe(before - 2);
    const s = find(w, 'sandwich');
    expect(s.state.servings).toBe(2);
    expect(find(w, 'bread')).toBeUndefined();
    let r = feed(w, s.instanceId); w = must(r);
    expect(w.items[s.instanceId].state.servings).toBe(1);
    w = must(feed(w, s.instanceId));
    expect(w.items[s.instanceId].definitionId).toBe('plate');
    expect(w.items[s.instanceId].state.dirty).toBe(true);
  });
  it('несъедобное нельзя съесть; странное сочетание даёт чудо-блюдо, а не пропажу', () => {
    let w = createWorld();
    expect(feed(w, find(w, 'ball').instanceId)).toEqual({ ok: false, reason: 'not_food' });
    for (const [i, d] of ['banana', 'cheese'].entries()) w = must(moveItem(w, find(w, d).instanceId, { kind: 'surface', furnitureId: 'kt_stove', slot: i }));
    w = must(cook(w, 'kt_stove'));
    expect(find(w, 'wonderdish').state.mix).toEqual(['banana', 'cheese']);
    expect(cook(w, 'kt_stove').ok).toBe(false);
  });
});

describe('подарки', () => {
  it('открытие атомарно и не даёт дубликатов при повторе', () => {
    let w = createWorld();
    w = must(takeGiftSet(w, 'cozy', 'living', { x: 800, y: 800 }));
    const box = find(w, 'giftbox').instanceId;
    const n = Object.keys(w.items).length;
    const opened = must(openGift(w, box));
    expect(Object.keys(opened.items).length).toBe(n - 1);
    expect(opened.openedGiftIds).toEqual(['cozy']);
    expect(Object.values(opened.items).filter((i) => i.owner.kind === 'item')).toHaveLength(0); // внутри коробок ничего не осталось
    expect(openGift(opened, box)).toEqual({ ok: false, reason: 'no_gift' });
    // сохранили и загрузили — то же самое
    const again = parseWorld(JSON.stringify(opened));
    expect(again.ok && Object.keys(again.world.items).length).toBe(n - 1);
    expect(validateWorld(opened)).toEqual([]);
  });
  it('свой подарок: вещи действительно переходят в коробку и возвращаются', () => {
    let w = createWorld();
    w = must(newEmptyGift(w, 'living', { x: 700, y: 800 }, 1, 1, 'Миле'));
    const box = find(w, 'giftbox').instanceId;
    expect(wrapGift(w, box)).toEqual({ ok: false, reason: 'empty_gift' });
    const ball = find(w, 'ball').instanceId;
    w = must(moveItem(w, ball, { kind: 'item', itemId: box, slot: 0 }));
    for (let i = 0; i < 4; i++) w = must(spawnItem(w, 'apple', { kind: 'item', itemId: box, slot: 0 }));
    expect(spawnItem(w, 'apple', { kind: 'item', itemId: box, slot: 0 })).toEqual({ ok: false, reason: 'container_full' });
    w = must(wrapGift(w, box));
    expect(moveItem(w, find(w, 'cup').instanceId, { kind: 'item', itemId: box, slot: 0 })).toEqual({ ok: false, reason: 'packed' });
    w = must(moveItem(w, box, { kind: 'hand', characterId: 'hero_mila', slot: 'left' }));
    const r = openGift(w, box);
    w = must(r);
    expect(w.items[ball].owner.kind).toBe('room');
    expect(r.ok && r.info!.card).toBe('Миле');
  });
});

describe('герои и мебель', () => {
  it('вещи удалённого героя попадают в корзину найденных вещей; готового героя удалить нельзя', () => {
    let w = createWorld();
    const r = addCustomCharacter(w, 'Соня', w.characters.hero_mila.look, w.characters.hero_mila.outfit);
    w = must(r);
    const id = r.ok ? (r.info!.id as string) : '';
    w.characters[id].roomId = 'living';
    const cup = find(w, 'cup', (o) => o.kind === 'surface').instanceId;
    w = must(moveItem(w, cup, { kind: 'hand', characterId: id, slot: 'left' }));
    w = must(deleteCharacter(w, id));
    expect(w.items[cup].owner).toEqual({ kind: 'lost' });
    expect(deleteCharacter(w, 'hero_mila')).toEqual({ ok: false, reason: 'preset' });
    expect(validateWorld(w)).toEqual([]);
  });
  it('стол переезжает вместе с вещами; убранная мебель ставит вещи на пол', () => {
    let w = createWorld();
    const cup = find(w, 'cup', (o) => o.kind === 'surface' && o.furnitureId === 'lv_table');
    const before = itemPlace(w, cup);
    w = must(moveFurniture(w, 'lv_table', 1000, 860));
    const after = itemPlace(w, w.items[cup.instanceId]);
    expect(after.x - before.x).toBe(1000 - 640);
    w = must(moveFurniture(w, 'lv_table', 99999, 99999));
    expect(w.furniture.lv_table.x).toBeLessThanOrEqual(1600);
    w = must(storeFurniture(w, 'lv_table'));
    expect(w.items[cup.instanceId].owner.kind).toBe('room');
    expect(validateWorld(w)).toEqual([]);
  });
  it('уборка возвращает вещи на стартовые места только в этой комнате', () => {
    let w = createWorld();
    const cup = find(w, 'cup', (o) => o.kind === 'surface' && o.furnitureId === 'lv_table').instanceId;
    w = must(moveItem(w, cup, { kind: 'room', roomId: 'living', x: 300, y: 800 }));
    const bread = find(w, 'bread').instanceId;
    w = must(moveItem(w, bread, { kind: 'room', roomId: 'kitchen', x: 300, y: 800 }));
    w = must(tidyRoom(w, 'living'));
    expect(w.items[cup].owner).toMatchObject({ kind: 'surface', furnitureId: 'lv_table' });
    expect(w.items[bread].owner.kind).toBe('room');
  });
});

describe('сохранения', () => {
  it('миграция v1 → v2 добавляет недостающее', () => {
    const w: any = createWorld();
    w.schemaVersion = 1; delete w.pets; delete w.savedOutfits;
    for (const f of Object.values<any>(w.furniture)) { delete f.homeX; delete f.homeY; }
    const r = parseWorld(JSON.stringify(w));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.world.schemaVersion).toBe(2); expect(Object.keys(r.world.pets)).toHaveLength(3); }
  });
  it('повреждённый импорт отклоняется с причиной', () => {
    const good = createWorld();
    expect(parseWorld('{oops').ok).toBe(false);
    expect(parseWorld('[]')).toEqual({ ok: false, reason: 'not_world' });
    expect(parseWorld(JSON.stringify({ ...good, schemaVersion: 99 }))).toEqual({ ok: false, reason: 'newer_version' });
    expect(parseWorld('x'.repeat(2_000_001))).toEqual({ ok: false, reason: 'too_big' });
    const bad: any = JSON.parse(JSON.stringify(good));
    const first = Object.keys(bad.items)[0];
    bad.items[first].owner = { kind: 'surface', furnitureId: 'nope', slot: 0 };
    expect(parseWorld(JSON.stringify(bad)).ok).toBe(false);
    const dup: any = JSON.parse(JSON.stringify(good));
    const [a, b] = Object.keys(dup.items);
    dup.items[a].owner = { kind: 'bag', slot: 0 }; dup.items[b].owner = { kind: 'bag', slot: 0 };
    expect(parseWorld(JSON.stringify(dup)).ok).toBe(false);
    const evil: any = JSON.parse(JSON.stringify(good));
    evil.items[first].definitionId = 'https://evil.example/x.svg';
    expect(parseWorld(JSON.stringify(evil)).ok).toBe(false);
    expect(validateWorld(repairWorld(bad))).toEqual([]);
    expect(Object.keys(repairWorld(bad).items)).toHaveLength(Object.keys(good.items).length); // починка ничего не удаляет
  });
  it('восстановление из резервной копии и честный статус при ошибке записи', async () => {
    const kv = new MemoryKV();
    expect((await loadWorld(kv)).status).toBe('empty');
    const w = createWorld();
    const states: string[] = [];
    const saver = new Saver(kv, (s) => states.push(s), 5);
    saver.schedule(w, true); await saver.flush();
    expect(states.at(-1)).toBe('saved');
    expect((await loadWorld(kv)).status).toBe('ok'); // исправный мир стал копией
    expect(kv.data.has(K_BACKUP)).toBe(true);
    kv.data.set(K_WORLD, '{"broken":');
    const r = await loadWorld(kv);
    expect(r.status).toBe('corrupt');
    if (r.status === 'corrupt') expect(r.backup && Object.keys(r.backup.characters)).toHaveLength(6);
    expect(kv.data.get(K_WORLD)).toBe('{"broken":'); // старое не удалено автоматически
    kv.failWrites = true;
    saver.schedule({ ...w, revision: 5 }, true); await saver.flush();
    expect(states.at(-1)).toBe('error');
    kv.failWrites = false;
    await saver.flush();
    expect(states.at(-1)).toBe('saved');
    expect(JSON.parse(kv.data.get(K_WORLD)!).revision).toBe(5);
  });
});
