import { en } from './en';
import { ru, type Key } from './ru';

let lang: 'ru' | 'en' = 'ru';
export const setLang = (l: 'ru' | 'en') => { lang = l; document.documentElement.lang = l; };
export const getLang = () => lang;
export const t = (key: Key): string => (lang === 'en' ? en[key] : ru[key]) ?? key;
export type { Key };
export const has = (key: string): key is Key => key in ru;
