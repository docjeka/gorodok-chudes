// Наборы для карточек идей: какие вещи нужны для игры и где они появляются по кнопке «Подготовить игру».
// Чтобы подготовка появилась у другой идеи, достаточно добавить сюда запись — код менять не нужно.
import type { RoomId } from '../game/types';

export interface KitItem {
  def: string;
  room: RoomId;
  /** место: слот нарисованной полки/стола или точка на полу */
  surface?: [furnitureId: string, slot: number];
  /** запасная поверхность, если первая занята целиком */
  alt?: [furnitureId: string, slot: number];
  floor?: [x: number, y: number];
  /** угощение: если его уже съели, новое выдаётся только по кнопке «Приготовить ещё» */
  treat?: boolean;
}
export interface IdeaKit {
  items: KitItem[];
  /** мебель, которая должна стоять в комнате; если её убрали на склад — возвращается на своё место */
  furniture?: { id: string; room: RoomId }[];
}

export const IDEA_KITS: Record<string, IdeaKit> = {
  party: {
    items: [
      { def: 'cupcake', room: 'cafe_bakery', surface: ['cb_table', 5], alt: ['cb_oven', 1], treat: true },
      { def: 'toy_jack_box', room: 'toys_workshop', surface: ['tw_bench', 6] },
      { def: 'giftbox', room: 'toys_workshop', floor: [820, 830] },
    ],
    furniture: [{ id: 'cl_dj', room: 'club' }, { id: 'cl_table', room: 'club' }],
  },
  pets: {
    items: [
      { def: 'pet_rope_ball', room: 'animals', floor: [600, 800] },
      { def: 'pet_food_bag', room: 'animals', floor: [1180, 690] },
      { def: 'pet_double_bowl', room: 'animals', floor: [1290, 700] },
      { def: 'teapot', room: 'animals', floor: [1400, 690] },
    ],
  },
};
