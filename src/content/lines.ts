// Короткие реплики героев. Текст показывается в пузырьке, звук лежит в public/assets/voice/<id>.mp3.
// Формулировки без рода: у героев игры пол не задаётся.
export type LineEvent = 'tap' | 'hello' | 'reply' | 'food' | 'sit' | 'gift' | 'party' | 'farmer' | 'liza' | 'tempOk' | 'tempHot' | 'syrupCured' | 'syrupSweet' | 'heart' | 'plasterOn' | 'bandageOn' | 'careOff';
/** text: true — готовой озвучки нет, реплика показывается только текстом в пузырьке. */
export interface Line { id: string; event: LineEvent; ru: string; en: string; text?: boolean; /** своя запись голоса для этой фразы */ file?: string }

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
  { id: 'liza1', event: 'liza', ru: 'Привет! Что тебе подать?', en: 'Hi! What can I get you?', file: 'liza/hello' },
  { id: 'farmer1', event: 'farmer', ru: 'Привет! Поможешь на ферме?', en: 'Hi! Will you help on the farm?', text: true },
  { id: 'farmer2', event: 'farmer', ru: 'Загляни к кенгуру!', en: 'Go and see the kangaroos!', text: true },
  // кабинет доктора
  { id: 'tempOk1', event: 'tempOk', ru: '36 и 6! Всё хорошо!', en: '36.6! All is well!' },
  { id: 'tempOk2', event: 'tempOk', ru: '36 и 6! Можно играть!', en: '36.6! Time to play!' },
  { id: 'tempHot1', event: 'tempHot', ru: 'Ой, 37 и 8! Нужен сироп.', en: 'Oh, 37.8! I need some syrup.' },
  { id: 'tempHot2', event: 'tempHot', ru: '37 и 8… Щёки горят!', en: '37.8… My cheeks are hot!' },
  { id: 'syrupCured1', event: 'syrupCured', ru: 'Вкусно! Мне уже лучше!', en: 'Yummy! I feel better!' },
  { id: 'syrupSweet1', event: 'syrupSweet', ru: 'М-м, сладкий сироп!', en: 'Mmm, sweet syrup!' },
  { id: 'heart1', event: 'heart', ru: 'Тук-тук! Тук-тук!', en: 'Thump-thump! Thump-thump!' },
  { id: 'heart2', event: 'heart', ru: 'Сердце стучит ровно!', en: 'My heart beats nice and steady!' },
  { id: 'plasterOn1', event: 'plasterOn', ru: 'Теперь не болит!', en: 'It does not hurt now!' },
  { id: 'bandageOn1', event: 'bandageOn', ru: 'Спасибо, доктор!', en: 'Thank you, doctor!' },
  { id: 'careOff1', event: 'careOff', ru: 'Уже зажило!', en: 'All healed!' },
  { id: 'party1', event: 'party', ru: 'Это мне? Спасибо!', en: 'Is this for me? Thank you!', text: true },
];
