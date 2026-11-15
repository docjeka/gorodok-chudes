// Короткие реплики героев. Текст показывается в пузырьке, звук лежит в public/assets/voice/<id>.mp3.
// Формулировки без рода: у героев игры пол не задаётся.
export type LineEvent = 'tap' | 'hello' | 'reply' | 'food' | 'sit' | 'gift' | 'party' | 'farmer';
/** text: true — готовой озвучки нет, реплика показывается только текстом в пузырьке. */
export interface Line { id: string; event: LineEvent; ru: string; en: string; text?: boolean }

export const LINES: Line[] = [
  { id: 'tap1', event: 'tap', ru: 'Привет! Поиграем?', en: 'Hi! Shall we play?' },
  { id: 'tap2', event: 'tap', ru: 'Я тут! Что будем делать?', en: 'I am here! What shall we do?' },
  { id: 'tap3', event: 'tap', ru: 'Ура, ты здесь!', en: 'Hooray, you are here!' },
  { id: 'hello1', event: 'hello', ru: 'Привет! Давай дружить!', en: 'Hi! Let us be friends!' },
  { id: 'hello2', event: 'hello', ru: 'О, привет! Пойдём играть?', en: 'Oh, hi! Want to play?' },
  { id: 'reply1', event: 'reply', ru: 'Давай! Вот здорово!', en: 'Yes! That is great!' },
  { id: 'reply2', event: 'reply', ru: 'Конечно! Побежали!', en: 'Sure! Let us go!' },
  { id: 'food1', event: 'food', ru: 'Ням-ням, вкусно!', en: 'Yum-yum, tasty!' },
  { id: 'food2', event: 'food', ru: 'М-м, спасибо!', en: 'Mmm, thank you!' },
  { id: 'sit1', event: 'sit', ru: 'Ух, как мягко!', en: 'Ooh, so soft!' },
  { id: 'sit2', event: 'sit', ru: 'Посижу немножко.', en: 'I will sit for a bit.' },
  { id: 'gift1', event: 'gift', ru: 'Ого, подарок! Спасибо!', en: 'Wow, a gift! Thank you!' },
  // подарок вручили в Клубе друзей
  // фермер Лев — по тапу
  { id: 'farmer1', event: 'farmer', ru: 'Привет! Поможешь на ферме?', en: 'Hi! Will you help on the farm?', text: true },
  { id: 'farmer2', event: 'farmer', ru: 'Загляни к кенгуру!', en: 'Go and see the kangaroos!', text: true },
  { id: 'party1', event: 'party', ru: 'Это мне? Спасибо!', en: 'Is this for me? Thank you!', text: true },
];
