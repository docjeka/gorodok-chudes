import { describe, expect, it } from 'vitest';
import { createWorld, parseWorld, repairWorld, validateWorld } from '../../src/game/world';
import {
  applyGarment, placePet, cook, drink, collectEgg, eatFromFeeder, emptyBowl, fill, fillBowl, fillFeeder, prepareIdea, waterBed, summonCharacter, wearSet, deleteCharacter, feed, handItems, isValidOutfit, moveItem, openGift, addCustomCharacter,
  placeCharacter, removeGarment, spawnItem, takeGiftSet, tidyRoom, travel, wrapGift, newEmptyGift, storeFurniture, moveFurniture,
} from '../../src/game/rules';
import { itemPlace } from '../../src/game/geometry';
import { ITEMS } from '../../src/content/items';
import { OUTFITS } from '../../src/content/wardrobe';
import { FURNITURE } from '../../src/content/furniture';
import { IDEA_KITS } from '../../src/content/ideaKits';
import charSprites from '../../src/content/charSprites.json';
import { resolveItemDrop } from '../../src/game/drop';
import { K_BACKUP, K_WORLD, MemoryKV, Saver, loadWorld } from '../../src/storage/store';
import type { World } from '../../src/game/types';

const must = (r: ReturnType<typeof moveItem>): World => { if (!r.ok) throw new Error(r.reason); return r.world; };
const find = (w: World, def: string, pred: (o: any) => boolean = () => true) => Object.values(w.items).find((i) => i.definitionId === def && pred(i.owner))!;

describe('новый мир', () => {
  it('цел и проходит проверку', () => {
    const w = createWorld();
    expect(validateWorld(w)).toEqual([]);
    expect(Object.keys(w.characters)).toHaveLength(7); // шесть героев и фермер Лев
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
    const box = find(w, 'giftbox', (o) => o.roomId !== 'toys_workshop');
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

describe('напитки', () => {
  it('чашка наполняется под краном и из пакета молока; выпитое исчезает, чашка остаётся', () => {
    let w = createWorld();
    const cup = find(w, 'cup', (o) => o.kind === 'surface').instanceId;
    expect(drink(w, cup)).toEqual({ ok: false, reason: 'empty' });
    w = must(moveItem(w, cup, { kind: 'surface', furnitureId: 'kt_sink', slot: 0 }));
    expect(w.items[cup].state.contents).toBe('water');
    // полная чашка над головой героя — «выпить», пустая — просто в руку
    w = must(moveItem(w, cup, { kind: 'room', roomId: 'living', x: 500, y: 800 }));
    const head = { x: w.characters.hero_mila.x, y: w.characters.hero_mila.y - 190 };
    expect(resolveItemDrop(w, cup, head, 'living').type).toBe('feed');
    const r = drink(w, cup); w = must(r);
    expect(r.ok && r.info!.liquid).toBe('water');
    expect(w.items[cup].state.contents).toBeUndefined();
    expect(w.items[cup].definitionId).toBe('cup');
    expect(resolveItemDrop(w, cup, head, 'living').type).toBe('hand');
    w = must(fill(w, cup, 'milk'));
    expect(w.items[cup].state.contents).toBe('milk');
    expect(fill(w, find(w, 'ball').instanceId, 'milk')).toEqual({ ok: false, reason: 'not_fillable' });
    // молоко над чашкой — «налить»
    w = must(spawnItem(w, 'milk', { kind: 'room', roomId: 'living', x: 900, y: 800 }));
    const milk = find(w, 'milk', (o) => o.kind === 'room').instanceId;
    expect(resolveItemDrop(w, milk, { x: 500, y: 780 }, 'living')).toEqual({ type: 'pour', itemId: cup });
    expect(parseWorld(JSON.stringify(w)).ok).toBe(true);
  });
});

describe('головные уборы', () => {
  it('корона надевается на голову, не занимает руки и заменяет прежний убор', () => {
    let w = createWorld();
    w = must(spawnItem(w, 'crown', { kind: 'room', roomId: 'living', x: 900, y: 800 }));
    w = must(spawnItem(w, 'partyhat', { kind: 'room', roomId: 'living', x: 960, y: 800 }));
    const crown = find(w, 'crown', (o) => o.kind === 'room').instanceId, hat = find(w, 'partyhat', (o) => o.kind === 'room').instanceId;
    const m = w.characters.hero_mila;
    expect(resolveItemDrop(w, crown, { x: m.x, y: m.y - 190 }, 'living')).toEqual({ type: 'hand', characterId: 'hero_mila', slot: 'head' });
    w = must(moveItem(w, crown, { kind: 'hand', characterId: 'hero_mila', slot: 'head' }));
    expect(w.items[crown].owner).toMatchObject({ kind: 'hand', slot: 'head' });
    w = must(moveItem(w, hat, { kind: 'hand', characterId: 'hero_mila', slot: 'head' }));
    expect(w.items[crown].owner.kind).toBe('room');
    expect(moveItem(w, find(w, 'ball').instanceId, { kind: 'hand', characterId: 'hero_mila', slot: 'head' })).toEqual({ ok: false, reason: 'not_headwear' });
    expect(validateWorld(w)).toEqual([]);
    expect(parseWorld(JSON.stringify(w)).ok).toBe(true);
  });
});

describe('двойная миска', () => {
  it('половины наполняются и пустеют независимо; повторно в полную не насыпать; старое сохранение получает один мешок', () => {
    let w = createWorld();
    const bowl = find(w, 'pet_double_bowl').instanceId, bag = find(w, 'pet_food_bag').instanceId;
    const pl = itemPlace(w, w.items[bowl]);
    expect(resolveItemDrop(w, bag, { x: pl.x + 20, y: pl.y - 30 }, 'animals')).toEqual({ type: 'bowl', itemId: bowl, half: 'kibble' });
    expect(emptyBowl(w, bowl, 'kibble')).toEqual({ ok: false, reason: 'bowl_empty' });
    w = must(fillBowl(w, bowl, 'kibble'));
    expect(fillBowl(w, bowl, 'kibble')).toEqual({ ok: false, reason: 'bowl_full' });
    expect(w.items[bowl].state).toMatchObject({ kibble: true });
    expect(w.items[bowl].state.water).toBeUndefined();
    w = must(fillBowl(w, bowl, 'water'));
    w = must(emptyBowl(w, bowl, 'kibble'));
    expect(w.items[bowl].state.kibble).toBeUndefined();
    expect(w.items[bowl].state.water).toBe(true);
    expect(w.items[bag]).toBeDefined(); // мешок многоразовый
    // вода: пустая чашка не источник, полная — источник
    w = must(spawnItem(w, 'cup', { kind: 'room', roomId: 'animals', x: 900, y: 800 }));
    const cup = find(w, 'cup', (o) => o.roomId === 'animals').instanceId;
    expect(resolveItemDrop(w, cup, { x: pl.x - 20, y: pl.y - 30 }, 'animals').type).not.toBe('bowl');
    w = must(fill(w, cup, 'water'));
    expect(resolveItemDrop(w, cup, { x: pl.x - 20, y: pl.y - 30 }, 'animals')).toEqual({ type: 'bowl', itemId: bowl, half: 'water' });
    expect(parseWorld(JSON.stringify(w)).ok).toBe(true);
    // сохранение прошлой версии: миска остаётся, мешок появляется один раз
    const old: any = JSON.parse(JSON.stringify(createWorld()));
    for (const [id, it] of Object.entries<any>(old.items)) if (it.definitionId === 'pet_food_bag') delete old.items[id];
    old.schemaVersion = 5;
    const r = parseWorld(JSON.stringify(old));
    expect(r.ok && Object.values(r.world.items).filter((i) => i.definitionId === 'pet_food_bag')).toHaveLength(1);
    expect(r.ok && Object.values(r.world.items).filter((i) => i.definitionId === 'pet_double_bowl')).toHaveLength(1);
    const again = r.ok ? parseWorld(JSON.stringify(r.world)) : r;
    expect(again.ok && Object.values(again.world.items).filter((i) => i.definitionId === 'pet_food_bag')).toHaveLength(1);
  });
});

describe('подготовка идей', () => {
  it('ничего не копирует и не двигает; недостающее появляется один раз; съеденное угощение — только по «Приготовить ещё»', () => {
    let w = createWorld();
    const n0 = Object.keys(w.items).length;
    // в новом мире всё для вечеринки уже есть: коробка и игрушка в мастерской, капкейк в пекарне
    let r = prepareIdea(w, 'party', IDEA_KITS.party); w = must(r);
    expect(Object.keys(w.items).length).toBe(n0);
    expect(((r.ok ? r.info!.report : []) as any[]).map((x: any) => x.status)).toEqual(['found', 'found', 'found']);
    // капкейки съели, коробку унёс герой, игрушку положили в сумку
    for (const it of Object.values(w.items)) if (it.definitionId === 'cupcake') delete w.items[it.instanceId];
    const box = find(w, 'giftbox').instanceId, toy = find(w, 'toy_jack_box').instanceId;
    w = must(summonCharacter(w, 'hero_lev', 'club'));
    w = must(moveItem(w, box, { kind: 'hand', characterId: 'hero_lev', slot: 'left' }));
    w = must(moveItem(w, toy, { kind: 'bag', slot: 0 }));
    const snap = JSON.stringify([w.items[box], w.items[toy], w.characters, w.pets]);
    r = prepareIdea(w, 'party', IDEA_KITS.party); w = must(r);
    const rep = (r.ok ? r.info!.report : []) as any[];
    expect(rep.find((x) => x.def === 'cupcake').status).toBe('eaten'); // само не появляется
    expect(rep.find((x) => x.def === 'giftbox')).toMatchObject({ status: 'found', roomId: 'club', holder: 'hero_lev' });
    expect(rep.find((x) => x.def === 'toy_jack_box')).toMatchObject({ status: 'found', inBag: true });
    expect(JSON.stringify([w.items[box], w.items[toy], w.characters, w.pets])).toBe(snap); // ничего не переставлено
    expect(Object.values(w.items).filter((i) => i.definitionId === 'cupcake')).toHaveLength(0);
    r = prepareIdea(w, 'party', IDEA_KITS.party, true); w = must(r);
    expect(Object.values(w.items).filter((i) => i.definitionId === 'cupcake')).toHaveLength(1);
    expect(find(w, 'cupcake').owner).toMatchObject({ kind: 'surface' }); // стол в пекарне занят — капкейк встал на соседнюю столешницу
    expect(['cb_table', 'cb_oven']).toContain((find(w, 'cupcake').owner as any).furnitureId);
    for (let i = 0; i < 3; i++) w = must(prepareIdea(w, 'party', IDEA_KITS.party, true));
    expect(Object.values(w.items).filter((i) => i.definitionId === 'cupcake')).toHaveLength(1); // повторные нажатия не плодят
    // убранные на склад пульт и столик возвращаются на свои места; стоящую мебель не двигает
    w = must(storeFurniture(w, 'cl_table'));
    const dj = { ...w.furniture.cl_dj, x: 500 }; w.furniture.cl_dj = dj;
    w = must(prepareIdea(w, 'party', IDEA_KITS.party));
    expect(w.furniture.cl_table).toMatchObject({ roomId: 'club', x: w.furniture.cl_table.homeX });
    expect(w.furniture.cl_dj.x).toBe(500);
    // питомцы: в новом мире нет кувшина в парке — появляется один, остальное уже есть
    const pr = prepareIdea(w, 'pets', IDEA_KITS.pets); w = must(pr);
    expect((pr.ok ? pr.info!.report as any[] : []).map((x) => x.status)).toEqual(['found', 'found', 'found', 'found']);
    expect(validateWorld(w)).toEqual([]);
    expect(parseWorld(JSON.stringify(w)).ok).toBe(true);
    // сохранение без поля preparedIdeas читается как раньше
    const old: any = JSON.parse(JSON.stringify(createWorld())); delete old.preparedIdeas;
    expect(parseWorld(JSON.stringify(old)).ok).toBe(true);
  });
});

describe('ферма', () => {
  it('жители фермы остаются на ферме на уровне правил; обычные питомцы ездят как раньше', () => {
    let w = createWorld();
    expect(Object.keys(w.pets).filter((id) => ['pet_cow', 'pet_sheep', 'pet_pig', 'pet_goat', 'pet_hen', 'pet_chick', 'pet_pony'].includes(id))).toHaveLength(7);
    w = must(travel(w, 'farm_yard', []));
    // внутри фермы — можно
    w = must(travel(w, 'farm_barn', [], ['pet_hen']));
    expect(w.pets.pet_hen.roomId).toBe('farm_barn');
    // за пределы фермы — нельзя: зверь остаётся, игра сообщает об отказе
    const r = travel(w, 'living', [], ['pet_hen', 'pet_cow']);
    expect(r.ok && r.info!.refused).toEqual(['pet_hen', 'pet_cow']);
    w = must(r);
    expect(w.pets.pet_hen.roomId).toBe('farm_barn'); expect(w.pets.pet_cow.roomId).toBe('farm_barn');
    w = must(travel(w, 'animals', [], ['pet_cat']));
    expect(w.pets.pet_cat.roomId).toBe('animals'); // обычных питомцев правило не касается
    // испорченное сохранение, где корова оказалась в гостиной, чинится: она возвращается на ферму
    const bad: World = JSON.parse(JSON.stringify(w)); bad.pets.pet_cow.roomId = 'living';
    expect(validateWorld(bad)).toContain('farm_pet:pet_cow');
    expect(repairWorld(bad).pets.pet_cow.roomId).toBe('farm_barn');
  });
  it('кормушка, яйцо и грядка: порция одна, яйца не множатся, цветок растёт от полива', () => {
    let w = createWorld();
    expect(fillFeeder(w, 'kt_table')).toEqual({ ok: false, reason: 'not_feeder' });
    w = must(fillFeeder(w, 'fb_trough'));
    expect(fillFeeder(w, 'fb_trough')).toEqual({ ok: false, reason: 'feeder_full' });
    expect(eatFromFeeder(w, 'fb_trough', 'pet_hen')).toEqual({ ok: false, reason: 'wrong_food' });
    w = must(eatFromFeeder(w, 'fb_trough', 'pet_cow'));
    expect(w.furniture.fb_trough.on).toBe(0);
    expect(eatFromFeeder(w, 'fb_trough', 'pet_cow')).toEqual({ ok: false, reason: 'feeder_empty' });
    w = must(fillFeeder(w, 'fb_trough')); // пустую можно наполнить снова
    // яйцо: одно; повторное нажатие ничего не даёт; в корзинку, если она во дворе
    const eggs = (x: World) => Object.values(x.items).filter((i) => i.definitionId === 'farm_eggs');
    let r = collectEgg(w, 'fy_nest'); w = must(r);
    expect(eggs(w)).toHaveLength(1);
    expect(eggs(w)[0].owner.kind).toBe('item'); // лежит в корзинке
    expect(collectEgg(w, 'fy_nest')).toEqual({ ok: false, reason: 'nest_empty' });
    expect(collectEgg(parseWorld(JSON.stringify(w)).ok ? (parseWorld(JSON.stringify(w)) as any).world : w, 'fy_nest').ok).toBe(false); // и после перезапуска
    // курочка поела зерна — в гнезде новое яйцо; не больше трёх яиц в мире
    for (let i = 0; i < 5; i++) { w = must(fillFeeder(w, 'fy_grain')); w = must(eatFromFeeder(w, 'fy_grain', 'pet_hen')); r = collectEgg(w, 'fy_nest'); if (r.ok) w = r.world; }
    expect(eggs(w)).toHaveLength(3);
    // грядка
    expect(w.furniture.fy_bed1.on).toBe(0);
    w = must(waterBed(w, 'fy_bed1')); expect(w.furniture.fy_bed1.on).toBe(1);
    w = must(waterBed(w, 'fy_bed1')); w = must(waterBed(w, 'fy_bed1')); expect(w.furniture.fy_bed1.on).toBe(2);
    expect(w.furniture.fy_bed2.on).toBe(0);
    expect(validateWorld(w)).toEqual([]);
    // сохранение прошлой версии получает ферму один раз
    const old: any = JSON.parse(JSON.stringify(createWorld()));
    for (const id of Object.keys(old.pets)) if (['cow', 'sheep', 'pig', 'goat', 'hen', 'chick', 'pony'].includes(old.pets[id].kind)) delete old.pets[id];
    for (const [id, it] of Object.entries<any>(old.items)) if (it.definitionId.startsWith('farm_')) delete old.items[id];
    for (const id of Object.keys(old.furniture)) if (id.startsWith('fy_') || id.startsWith('fb_')) delete old.furniture[id];
    delete old.rooms.farm_yard; delete old.rooms.farm_barn; old.schemaVersion = 6;
    const m = parseWorld(JSON.stringify(old));
    expect(m.ok && Object.keys(m.world.pets).length).toBe(15);
    const again = m.ok ? parseWorld(JSON.stringify(m.world)) : m;
    expect(again.ok && Object.keys(again.world.items).length).toBe(m.ok ? Object.keys(m.world.items).length : -1);
    expect(again.ok && Object.keys(again.world.pets).length).toBe(15);
  });
});

describe('фермер и кенгуру', () => {
  it('фермер Лев один, с фермы не уезжает и на полку не убирается; три наряда с готовыми фигурками', () => {
    let w = createWorld();
    expect(w.characters.farm_worker_lev).toMatchObject({ roomId: 'farm_yard', costume: 'farmer_work', pose: 'standing' });
    expect(summonCharacter(w, 'farm_worker_lev', 'living')).toEqual({ ok: false, reason: 'lives_on_farm' });
    expect(summonCharacter(w, 'farm_worker_lev', null)).toEqual({ ok: false, reason: 'lives_on_farm' });
    w = must(travel(w, 'farm_yard', []));
    const r = travel(w, 'club', ['farm_worker_lev', 'hero_mila']); w = must(r);
    expect(r.ok && r.info!.refused).toEqual(['farm_worker_lev']);
    expect(w.characters.farm_worker_lev.roomId).toBe('farm_yard');
    w = must(travel(w, 'farm_yard', [])); w = must(travel(w, 'farm_barn', ['farm_worker_lev']));
    expect(w.characters.farm_worker_lev.roomId).toBe('farm_barn'); // по ферме ходит
    for (const set of ['farmer_rain', 'farmer_harvest', 'farmer_work']) {
      const pos = [w.characters.farm_worker_lev.x, w.characters.farm_worker_lev.y, w.characters.farm_worker_lev.pose];
      w = must(wearSet(w, 'farm_worker_lev', set));
      expect(w.characters.farm_worker_lev.costume).toBe(set);
      expect([w.characters.farm_worker_lev.x, w.characters.farm_worker_lev.y, w.characters.farm_worker_lev.pose]).toEqual(pos); // наряд не двигает и не меняет позу
      for (const pose of ['stand', 'sit']) expect((charSprites as any)[`farm_worker_lev:${set}:${pose}`], `${set}:${pose}`).toBeDefined();
    }
    const bad: World = JSON.parse(JSON.stringify(w)); bad.characters.farm_worker_lev.roomId = 'club';
    expect(validateWorld(bad)).toContain('farm_char:farm_worker_lev');
    expect(repairWorld(bad).characters.farm_worker_lev.roomId).toBe('farm_yard');
    expect(Object.keys(parseWorld(JSON.stringify(w)).ok ? (parseWorld(JSON.stringify(w)) as any).world.characters : {}).filter((id) => id.includes('lev'))).toEqual(['hero_lev', 'farm_worker_lev']);
  });
  it('кенгуру живут только в загоне: ни в другие экраны фермы, ни за её пределы', () => {
    let w = must(travel(createWorld(), 'farm_pen', []));
    expect(Object.values(w.pets).filter((p) => p.roomId === 'farm_pen').map((p) => p.id).sort()).toEqual(['farm_kangaroo_adult', 'farm_kangaroo_joey']);
    for (const room of ['farm_yard', 'farm_barn', 'living', 'animals'] as const) {
      const r = travel(w, room, [], ['farm_kangaroo_adult', 'farm_kangaroo_joey']);
      expect(r.ok && r.info!.refused, room).toEqual(['farm_kangaroo_adult', 'farm_kangaroo_joey']);
      expect(r.ok && r.world.pets.farm_kangaroo_joey.roomId).toBe('farm_pen');
    }
    w = must(placePet(w, 'farm_kangaroo_joey', { x: 400, y: 820 })); // внутри загона двигать можно
    expect(w.pets.farm_kangaroo_joey.x).toBe(400);
    const bad: World = JSON.parse(JSON.stringify(w)); bad.pets.farm_kangaroo_adult.roomId = 'farm_yard';
    expect(validateWorld(bad)).toContain('farm_pet:farm_kangaroo_adult');
    expect(repairWorld(bad).pets.farm_kangaroo_adult.roomId).toBe('farm_pen');
    // курочка по-прежнему ходит по всей ферме, но не в загон? — в загон можно: это тоже ферма
    expect(must(travel(must(travel(w, 'farm_yard', [])), 'farm_pen', [], ['pet_hen'])).pets.pet_hen.roomId).toBe('farm_pen');
    // сохранение прошлой версии: фермер и кенгуру добавляются один раз
    const old: any = JSON.parse(JSON.stringify(createWorld()));
    delete old.characters.farm_worker_lev; delete old.pets.farm_kangaroo_adult; delete old.pets.farm_kangaroo_joey; delete old.rooms.farm_pen; old.schemaVersion = 7;
    const m = parseWorld(JSON.stringify(old));
    expect(m.ok && [Object.keys(m.world.characters).length, Object.keys(m.world.pets).length, m.world.schemaVersion]).toEqual([7, 15, 9]);
    const again = m.ok ? parseWorld(JSON.stringify(m.world)) : m;
    expect(again.ok && [Object.keys(again.world.characters).length, Object.keys(again.world.pets).length]).toEqual([7, 15]);
  });
});

describe('подарки', () => {
  it('открытие атомарно и не даёт дубликатов при повторе', () => {
    let w = createWorld();
    w = must(takeGiftSet(w, 'cozy', 'living', { x: 800, y: 800 }));
    const box = find(w, 'giftbox', (o) => o.roomId !== 'toys_workshop').instanceId;
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
    const box = find(w, 'giftbox', (o) => o.roomId !== 'toys_workshop').instanceId;
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
    if (r.ok) { expect(r.world.schemaVersion).toBe(9); expect(Object.keys(r.world.pets)).toHaveLength(15); }
  });
  it('миграция v2 → v8 добавляет локации города, Парк животных и трёх новых питомцев и ничего не трогает в домиках', () => {
    let w: any = createWorld();
    const cup = find(w, 'cup', (o) => o.kind === 'surface').instanceId;
    w = must(moveItem(w, cup, { kind: 'hand', characterId: 'hero_mila', slot: 'left' }));
    w = must(wearSet(w, 'hero_mila', 'fairy'));
    w = JSON.parse(JSON.stringify(w));
    const loc = ['park', 'park_games', 'cafe', 'cafe_bakery', 'toys', 'toys_workshop', 'beach', 'beach_boats', 'club', 'animals', 'farm_yard', 'farm_barn', 'farm_pen'];
    const locFurn = new Set(Object.values<any>(w.furniture).filter((f) => loc.includes(f.roomId)).map((f) => f.id));
    for (const [id, it] of Object.entries<any>(w.items)) if ((it.owner.kind === 'room' && loc.includes(it.owner.roomId)) || (it.owner.kind === 'surface' && locFurn.has(it.owner.furnitureId))) delete w.items[id];
    for (const id of locFurn) delete w.furniture[id as string];
    for (const r of loc) delete w.rooms[r];
    for (const id of Object.keys(w.pets)) if (!['pet_cat', 'pet_dog', 'pet_rabbit'].includes(id)) delete w.pets[id];
    delete w.characters.farm_worker_lev;
    w.schemaVersion = 2;
    const before = JSON.parse(JSON.stringify(w));
    const r = parseWorld(JSON.stringify(w));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.world.schemaVersion).toBe(9);
    expect(validateWorld(r.world)).toEqual([]);
    expect(r.world.furniture.cl_table.roomId).toBe('club');
    expect(Object.values(r.world.items).filter((i) => i.definitionId === 'giftbox' && i.owner.kind === 'room' && i.owner.roomId === 'toys_workshop')).toHaveLength(1);
    expect(Object.keys(r.world.pets).sort()).toEqual(['farm_kangaroo_adult', 'farm_kangaroo_joey', 'pet_capybara', 'pet_cat', 'pet_chick', 'pet_cow', 'pet_dog', 'pet_frenchie', 'pet_goat', 'pet_hen', 'pet_pig', 'pet_pony', 'pet_rabbit', 'pet_sheep', 'pet_wolf']);
    expect(r.world.characters.farm_worker_lev).toMatchObject({ roomId: 'farm_yard', costume: 'farmer_work' });
    for (const id of ['pet_cat', 'pet_dog', 'pet_rabbit']) expect(r.world.pets[id]).toEqual(before.pets[id]); // старые звери остались дома
    // повторная загрузка ничего не дублирует
    const again = parseWorld(JSON.stringify(r.world));
    expect(again.ok && Object.keys(again.world.items).length).toBe(Object.keys(r.world.items).length);
    // каждый из 36 предметов набора есть в игре: вещью каталога или мебелью
    const props = ['beach_lounger', 'beach_umbrella', 'beach_bucket', 'beach_float', 'beach_sandcastle', 'beach_rowboat', 'club_speaker', 'club_microphone', 'club_headphones', 'club_drum', 'club_stool', 'club_light', 'toy_octopus', 'toy_train', 'toy_dinosaur', 'toy_music_box', 'toy_jack_box', 'toy_ribbon_station', 'cafe_croissant', 'cafe_donut', 'cafe_berry_tart', 'cafe_mixer', 'cafe_rolling_pin', 'cafe_mixing_bowl', 'pet_double_bowl', 'pet_grooming_brush', 'pet_rope_ball', 'pet_tunnel', 'pet_cushion', 'pet_picnic_box', 'fair_ring_toss', 'fair_rings', 'fair_popcorn', 'fair_cotton_candy', 'fair_plush_prize', 'fair_ticket_machine'];
    expect(props).toHaveLength(36);
    for (const id of props) expect(!!ITEMS[id]?.catalog || !!FURNITURE[id], id).toBe(true);
    for (const room of loc) expect(r.world.rooms[room as 'park']).toBeDefined();
    expect(r.world.furniture.cl_dj.definitionId).toBe('djconsole');
    expect(Object.values(r.world.items).some((i) => i.owner.kind === 'surface' && i.owner.furnitureId === 'ty_left')).toBe(true);
    // всё прежнее осталось на местах
    for (const [id, it] of Object.entries<any>(before.items)) expect(r.world.items[id].owner).toEqual(it.owner);
    { const { farm_worker_lev: _lev, ...rest } = r.world.characters; void _lev; expect(rest).toEqual(before.characters); }
    for (const [id, f] of Object.entries<any>(before.furniture)) expect(r.world.furniture[id]).toEqual(f);
    expect(r.world.characters.hero_mila.costume).toBe('fairy');
  });
  it('миграция v4 → v8: столик в клубе и одна коробка в мастерской, без дублей при повторной загрузке', () => {
    const w: any = JSON.parse(JSON.stringify(createWorld()));
    delete w.furniture.cl_table;
    for (const [id, it] of Object.entries<any>(w.items)) if ((it.definitionId === 'giftbox' && it.owner.roomId === 'toys_workshop') || (it.definitionId === 'cupcake' && it.owner.furnitureId === 'cb_shelves') || it.definitionId === 'pet_food_bag' || it.definitionId.startsWith('farm_')) delete w.items[id];
    w.schemaVersion = 4;
    const before = JSON.parse(JSON.stringify(w));
    const r = parseWorld(JSON.stringify(w));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.world.schemaVersion).toBe(9);
    expect(validateWorld(r.world)).toEqual([]);
    expect(Object.keys(r.world.items).length).toBe(Object.keys(before.items).length + 8); // коробка, капкейк, мешок корма и пять вещей фермы
    for (const [id, it] of Object.entries<any>(before.items)) expect(r.world.items[id]).toEqual(it);
    const again = parseWorld(JSON.stringify(r.world));
    expect(again.ok && Object.keys(again.world.items).length).toBe(Object.keys(r.world.items).length);
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
    if (r.status === 'corrupt') expect(r.backup && Object.keys(r.backup.characters)).toHaveLength(7);
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

describe('запасное хранилище', () => {
  it('если основное не пишет, мир уходит в запасное и читается самый свежий', async () => {
    const { FallbackKV, MemoryKV, Saver, loadWorld } = await import('../../src/storage/store');
    const main = new MemoryKV(), spare = new MemoryKV();
    const kv = new FallbackKV(main, spare);
    const states: string[] = [];
    const saver = new Saver(kv, (s) => states.push(s), 0);
    const w1 = { ...createWorld(), revision: 3 };
    saver.schedule(w1, true); await saver.flush();
    expect(main.data.has('world')).toBe(true);
    main.failWrites = true;
    const w2 = { ...w1, revision: 9, currentRoomId: 'kitchen' as const };
    saver.schedule(w2, true); await saver.flush();
    expect(states.includes('error')).toBe(false); // игрок не видит ошибку: запись ушла в запасное
    expect(saver.state).toBe('saved');
    const loaded = await loadWorld(kv);
    expect(loaded.status === 'ok' && loaded.world.currentRoomId).toBe('kitchen');
  });
});

describe('карусель: живые места', () => {
  it('старые сохранения: оба места посадки на карусели остаются теми же', () => {
    let w = createWorld();
    for (const [id, slot] of [['hero_mila', 0], ['hero_timur', 1]] as const) { const r = placeCharacter(w, id, { furnitureId: 'pk_carousel', slot }, 'park'); expect(r.ok).toBe(true); if (r.ok) w = r.world; }
    const back = parseWorld(JSON.stringify(w));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(validateWorld(back.world)).toEqual([]);
    expect(back.world.characters.hero_mila.seat).toEqual({ furnitureId: 'pk_carousel', slot: 0 });
    expect(back.world.characters.hero_timur.seat).toEqual({ furnitureId: 'pk_carousel', slot: 1 });
  });
  it('герой садится туда, где сейчас лошадка, а без сцены — на место из мебели', async () => {
    const { setLiveSeats, charPos, seatPos } = await import('../../src/game/geometry');
    const { resolveCharDrop } = await import('../../src/game/drop');
    let w = createWorld();
    const f = w.furniture.pk_carousel;
    const rest = seatPos(f, 1);
    expect(rest.s).toBe(1);
    setLiveSeats((id, slot) => (id === 'pk_carousel' ? { x: 700 + slot * 300, y: 400, s: 0.5, flip: slot === 1 } : null));
    try {
      expect(resolveCharDrop(w, 'hero_mila', { x: 1000, y: 400 - 35 }, 'park')).toEqual({ type: 'seat', furnitureId: 'pk_carousel', slot: 1 });
      const r = placeCharacter(w, 'hero_mila', { furnitureId: 'pk_carousel', slot: 1 }, 'park');
      expect(r.ok).toBe(true);
      if (r.ok) w = r.world;
      expect(charPos(w, w.characters.hero_mila)).toEqual({ x: 1000, y: 400 });
    } finally { setLiveSeats(null); }
    expect(charPos(w, w.characters.hero_mila)).toEqual({ x: rest.x, y: rest.y });
  });
});

describe('наряды пластилиновых героев', () => {
  it('список нарядов — только свои нарисованные (стоя и сидя); игровой Лев и фермер — разные герои', async () => {
    const { heroCostumes, costumeFits } = await import('../../src/content/wardrobe');
    expect(heroCostumes('hero_lev')).toEqual(['sport', 'astronaut', 'rain', 'pajama']);
    expect(heroCostumes('farm_worker_lev')).toEqual(['farmer_work', 'farmer_rain', 'farmer_harvest']);
    expect(heroCostumes('hero_mila')).toEqual(['summer', 'princess', 'pajama', 'fairy', 'dj']); // поза верхом не обязательна и нарядом не считается
    expect(costumeFits('hero_lev', 'chef')).toBe(false);
    expect(costumeFits('hero_lev', 'farmer_work')).toBe(false);
    expect(costumeFits('farm_worker_lev', 'sport')).toBe(false);
    expect(heroCostumes('custom_1')).toEqual([]); // рисованный герой
    expect(costumeFits('custom_1', 'chef')).toBe(true);
  });
  it('неподходящий наряд не надевается, подходящий — надевается', () => {
    let w = createWorld();
    for (const set of ['chef', 'cat']) { const r = wearSet(w, 'hero_lev', set); expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe('no_costume_for_hero'); }
    expect(w.characters.hero_lev.costume).toBe('sport');
    const r = wearSet(w, 'hero_lev', 'astronaut');
    expect(r.ok).toBe(true);
    if (r.ok) w = r.world;
    expect(w.characters.hero_lev.costume).toBe('astronaut');
  });
  it('старое сохранение с неподдерживаемым нарядом: герой получает свой штатный, мир, вещи и место не меняются', () => {
    const w = createWorld();
    w.schemaVersion = 8;
    Object.assign(w.characters.hero_lev, { costume: 'chef', outfit: structuredClone(OUTFITS.chef.outfit), roomId: 'kitchen', x: 432, y: 801 });
    delete w.characters.hero_nora.costume;
    w.characters.farm_worker_lev.costume = 'farmer_rain';
    const items = JSON.stringify(w.items);
    const r = parseWorld(JSON.stringify(w));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lev = r.world.characters.hero_lev;
    expect(lev.costume).toBe('sport');
    expect(lev.outfit).toEqual(OUTFITS.sport.outfit);
    expect([lev.roomId, lev.x, lev.y]).toEqual(['kitchen', 432, 801]);
    expect(r.world.characters.hero_nora.costume).toBe('gardener');
    expect(r.world.characters.farm_worker_lev.costume).toBe('farmer_rain'); // свой наряд фермера не тронут
    expect(r.world.characters.hero_mila.costume).toBe('summer');
    expect(JSON.stringify(r.world.items)).toBe(items);
    expect(validateWorld(r.world)).toEqual([]);
    // и то же без миграции: починка при запуске
    const bad = createWorld();
    bad.characters.hero_lev.costume = 'cat';
    expect(validateWorld(bad)).toContain('bad_costume:hero_lev');
    expect(repairWorld(bad).characters.hero_lev.costume).toBe('sport');
  });
});

describe('игрушки на подушках дивана и кресла', () => {
  const toyOf = (w: any, def: string) => (Object.values(w.items) as any[]).find((i) => i.definitionId === def).instanceId as string;
  it('игрушка ложится на подушку в небольшой зоне; мимо зоны — обычный перенос; не игрушка на подушку не кладётся', async () => {
    const { resolveItemDrop } = await import('../../src/game/drop');
    let w = createWorld();
    const sofa = w.furniture.lv_sofa, teddy = toyOf(w, 'teddy');
    const on = resolveItemDrop(w, teddy, { x: sofa.x, y: sofa.y - 92 - 31 }, 'living');
    expect(on).toEqual({ type: 'surface', furnitureId: 'lv_sofa', slot: 1 });
    expect(resolveItemDrop(w, teddy, { x: sofa.x, y: sofa.y - 230 }, 'living').type).toBe('floor'); // спинка — не зона
    w = must(moveItem(w, teddy, { kind: 'surface', furnitureId: 'lv_sofa', slot: 1 }));
    expect(itemPlace(w, w.items[teddy])).toMatchObject({ roomId: 'living', x: sofa.x, y: sofa.y - 92, visible: true });
    const cup = toyOf(w, 'cup');
    expect(moveItem(w, cup, { kind: 'surface', furnitureId: 'lv_sofa', slot: 0 }).ok).toBe(false);
    expect(resolveItemDrop(w, cup, { x: sofa.x - 105, y: sofa.y - 110 }, 'living').type).not.toBe('surface');
    // мебель переставили — игрушка едет вместе с ней; после сохранения и загрузки она там же
    w = must(moveFurniture(w, 'lv_sofa', sofa.x + 200, sofa.y));
    expect(itemPlace(w, w.items[teddy]).x).toBe(sofa.x + 200);
    const back = parseWorld(JSON.stringify(w));
    expect(back.ok && back.world.items[teddy].owner).toEqual({ kind: 'surface', furnitureId: 'lv_sofa', slot: 1 });
  });
  it('занятое место игрушку не принимает, а севший герой игрушку под собой не прячет', () => {
    let w = createWorld();
    const teddy = toyOf(w, 'teddy'), bunny = toyOf(w, 'bunnytoy');
    w = must(placeCharacter(w, 'hero_mila', { furnitureId: 'lv_sofa', slot: 0 }, 'living'));
    w = must(moveItem(w, teddy, { kind: 'surface', furnitureId: 'lv_sofa', slot: 0 })); // место занято — рядом, на свободную подушку
    expect(w.items[teddy].owner).toEqual({ kind: 'surface', furnitureId: 'lv_sofa', slot: 1 });
    w = must(placeCharacter(w, 'hero_timur', { furnitureId: 'lv_sofa', slot: 1 }, 'living'));     // сел на подушку с мишкой
    expect(w.items[teddy].owner).toEqual({ kind: 'surface', furnitureId: 'lv_sofa', slot: 2 });
    w = must(placeCharacter(w, 'hero_lev', { furnitureId: 'lv_sofa', slot: 2 }, 'living'));       // свободных подушек нет — на пол перед диваном
    expect(w.items[teddy].owner.kind).toBe('room');
    expect(moveItem(w, bunny, { kind: 'surface', furnitureId: 'lv_sofa', slot: 0 }).ok).toBe(false);
    // кресло: одно место
    w = must(moveItem(w, bunny, { kind: 'surface', furnitureId: 'lv_armchair', slot: 0 }));
    expect(moveItem(w, teddy, { kind: 'surface', furnitureId: 'lv_armchair', slot: 0 }).ok).toBe(false);
    expect(validateWorld(w)).toEqual([]);
  });
});

describe('карман кенгуру', () => {
  it('в карман садится только детёныш и только к взрослому; связь хранится в сохранении без копий', async () => {
    const { pouchJoey, placePet: put } = await import('../../src/game/rules');
    const { resolvePetDrop, resolveItemDrop } = await import('../../src/game/drop');
    let w = createWorld();
    const adult = Object.values(w.pets).find((p) => p.kind === 'kangaroo')!, joey = Object.values(w.pets).find((p) => p.kind === 'joey')!;
    const n = Object.keys(w.pets).length;
    expect(resolvePetDrop(w, joey.id, { x: adult.x, y: adult.y - 60 }, 'farm_pen')).toEqual({ type: 'pouch', adultId: adult.id });
    expect(resolvePetDrop(w, joey.id, { x: adult.x + 400, y: adult.y }, 'farm_pen').type).toBe('floor');
    expect(pouchJoey(w, adult.id, joey.id).ok).toBe(false);
    expect(pouchJoey(w, 'pet_cat', adult.id).ok).toBe(false);
    w = must(pouchJoey(w, joey.id, adult.id));
    expect(w.pets[joey.id].carriedBy).toBe(adult.id);
    expect(Object.keys(w.pets).length).toBe(n);
    // вещь, отпущенная над карманом, малыша в нём не «находит»
    const hay = Object.values(w.items).find((i) => i.definitionId === 'farm_hay');
    if (hay) { const d = resolveItemDrop(w, hay.instanceId, { x: adult.x, y: adult.y - 60 }, 'farm_pen') as any; expect(d.petId).not.toBe(joey.id); }
    const back = parseWorld(JSON.stringify(w));
    expect(back.ok && back.world.pets[joey.id].carriedBy).toBe(adult.id);
    expect(validateWorld(w)).toEqual([]);
    // достали на землю — связь снята, зверь тот же
    w = must(put(w, joey.id, { x: adult.x + 200, y: 800 }));
    expect(w.pets[joey.id].carriedBy).toBeUndefined();
    expect(Object.keys(w.pets).length).toBe(n);
    // битая связь в сохранении просто снимается
    w.pets[joey.id].carriedBy = 'pet_cat';
    expect(validateWorld(w)).toContain(`bad_pouch:${joey.id}`);
    expect(repairWorld(w).pets[joey.id].carriedBy).toBeUndefined();
  });
});
