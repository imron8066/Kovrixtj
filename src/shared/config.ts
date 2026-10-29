import { Currency, Perm } from './types';

export const APP_NAME = 'Kovrix';

// Версия приложения. code — как versionCode в android/app/build.gradle:
// меняйте оба числа вместе. Когда в базе появляется версия новее
// (её записывает бот, увидев новый APK), приложение предлагает обновиться.
export const VERSION = { code: 14, name: '3.2' };

// Приложение и сайт админа и заместителей
export const ADMIN_APP_NAME = 'KovriX A';
// надпись как на логотипе: KOVRI белым, X (и всё после) — цветом темы
export const brandCut = (name: string) => {
  const at = name.toLowerCase().lastIndexOf('x');
  return at < 0 ? 3 : at;
};

// Девиз — на экране входа, на главной и на сайте
export const MOTTO = 'Донать быстро — играй красиво';

// Telegram-бот (папка bot/): регистрирует по номеру, выдаёт ID и код
// для входа, присылает сообщения и приложение для скачивания
export const BOT_NAME = 'Kovrixtj_bot';

// Этой ссылкой делятся из профиля («Поделиться приложением»)
export const SHARE_URL = 'https://kovrixtj.web.app';

// Свой сервер (папка server/, ставится на VPS): через него заказы
// с телефонов клиентов попадают в приложение админа и на сайт.
// Адрес — например https://donix.tj или http://<IP сервера>. Пока он
// пустой, приложения показывают подсказку, а сайт работает с того же
// сервера, откуда открыт. После правки: npm run web и npm run apk.
export const SERVER = '';

// Firebase: Project settings → Your apps → Web app (apiKey) и
// Realtime Database (databaseURL). Если оба заполнены — работаем
// через Firebase, иначе через свой сервер (SERVER).
export const FIREBASE_API_KEY = 'AIzaSyDa9MAQaoPlK2iUgpndws-l2hVCiVsbhPQ';
export const FIREBASE_DB_URL =
  'https://kovrixtj-default-rtdb.europe-west1.firebasedatabase.app';

const useFirebase = !!(FIREBASE_API_KEY && FIREBASE_DB_URL);

// Свой сервер отвечает так же, как Firebase (вход и база), поэтому
// остальной код с обоими говорит одинаково
export const FIREBASE = useFirebase
  ? {
      apiKey: FIREBASE_API_KEY,
      databaseURL: FIREBASE_DB_URL,
      authURL: 'https://identitytoolkit.googleapis.com/v1',
      tokenURL: 'https://securetoken.googleapis.com/v1/token',
    }
  : {
      apiKey: 'donix',
      databaseURL: `${SERVER}/api/db`,
      authURL: `${SERVER}/api/auth`,
      tokenURL: `${SERVER}/api/auth/token`,
    };

// Страны на экране регистрации: код номера и валюта оплаты.
// У «Другой страны» код вводят вместе с номером.
export const COUNTRIES: {
  key: string;
  name: string;
  flag: string;
  dial: string;
  currency: Currency;
}[] = [
  { key: 'TJ', name: 'Таджикистан', flag: '🇹🇯', dial: '+992', currency: 'TJS' },
  { key: 'RU', name: 'Россия', flag: '🇷🇺', dial: '+7', currency: 'RUB' },
  { key: 'KZ', name: 'Казахстан', flag: '🇰🇿', dial: '+7', currency: 'KZT' },
  { key: 'US', name: 'США', flag: '🇺🇸', dial: '+1', currency: 'USD' },
  { key: 'UZ', name: 'Узбекистан', flag: '🇺🇿', dial: '+998', currency: 'USD' },
  { key: 'KG', name: 'Кыргызстан', flag: '🇰🇬', dial: '+996', currency: 'USD' },
  { key: 'XX', name: 'Другая страна', flag: '🌍', dial: '+', currency: 'USD' },
];

// Валюты. rate — сколько единиц валюты в одном сомони; курс по умолчанию
// на 28.10.2026 (open.er-api.com). Бот сам обновляет config/rates каждые
// 6 часов, админ может поправить в приложении («Ещё» → «Курсы»).
export const CURRENCIES: Record<
  Currency,
  { name: string; sign: string; rate: number; digits: number }
> = {
  TJS: { name: 'Сомони', sign: 'смн', rate: 1, digits: 2 },
  RUB: { name: 'Рубли', sign: '₽', rate: 8.75, digits: 0 },
  KZT: { name: 'Тенге', sign: '₸', rate: 49.6, digits: 0 },
  USD: { name: 'Доллары', sign: '$', rate: 0.1085, digits: 2 },
};

// Способы оплаты. Реквизиты каждого админ вписывает в приложении
// («Ещё» → «Реквизиты»); пока их нет, клиент видит PAY_EMPTY.
// Клиент видит только способы с вписанными реквизитами. Новый способ —
// строка здесь и в PAY_NAMES в bot/bot.js. hint — подсказка админу.
export const PAY_METHODS = [
  { key: 'alif', name: 'Алиф', hint: 'Номер Alif Mobi: +992 900 00 00 00, Имрон И.' },
  { key: 'visa', name: 'Visa', hint: 'Номер карты: 4000 0000 0000 0000, Имрон И.' },
  { key: 'eskhata', name: 'Эсхата', hint: 'Номер карты Эсхата: 5058 0000 0000 0000, Имрон И.' },
  // с 28.10.2026 только Алиф, Visa и Эсхата; вернуть — раскомментировать:
  // { key: 'dcity', name: 'DCity', hint: 'Номер кошелька DCity: +992 900 00 00 00, Имрон И.' },
  // { key: 'mastercard', name: 'Mastercard', hint: 'Номер карты: 5400 0000 0000 0000, Имрон И.' },
  // { key: 'dc', name: 'DC Bank', hint: '' },
];

export const PAY_EMPTY =
  'Реквизиты для этого способа пока не указаны — напишите в поддержку (Профиль → Поддержка).';

// Доступы заместителя: админ отмечает нужные в «Ещё» → «Люди».
// У админа есть все. on — что включено у нового заместителя: по просьбе
// владельца (29.10.2026) зам сразу видит статистику, историю, акции,
// задания, людей и награды; цены, курсы и реквизиты — только если разрешить.
export const PERMS: { key: Perm; name: string; on?: boolean }[] = [
  { key: 'orders', name: 'Донаты', on: true },
  { key: 'accounts', name: 'Аккаунты и продажи', on: true },
  { key: 'chats', name: 'Чаты поддержки', on: true },
  { key: 'claims', name: 'Награды', on: true },
  { key: 'prices', name: 'Цены и товары' },
  { key: 'stats', name: 'Статистика и история', on: true },
  { key: 'promos', name: 'Акции и новости', on: true },
  { key: 'tasks', name: 'Задания', on: true },
  { key: 'money', name: 'Курсы и реквизиты' },
  { key: 'block', name: 'Люди и блокировка', on: true },
];

export const RECEIPT = { key: 'receipt', label: 'Скриншот чека об оплате' };

// Ключи официального API Supercell — нужны для проверки тега игрока
// в Clash of Clans и Clash Royale. Пока ключ пустой, проверка отвечает
// «не настроена», а заказ оформляется без неё.
// Как получить (бесплатно): зайдите на developer.clashofclans.com
// (для Clash Royale — developer.clashroyale.com), My Account → Create New Key,
// в поле Allowed IP впишите 45.79.218.79 — это адрес посредника RoyaleAPI,
// через него ключ работает с любого телефона. Готовый ключ вставьте сюда.
export const SUPERCELL_KEYS: Record<'coc' | 'cr', string> = {
  coc: '',
  cr: '',
};

// сколько фото можно приложить к аккаунту
export const MAX_PHOTOS = 6;

// как часто приложения сами обновляют списки заказов, мс
export const REFRESH_MS = 30000;

// как часто открытый чат проверяет новые сообщения, мс
export const CHAT_MS = 4000;

// «в сети» — если приложение или сайт отмечались не раньше чем столько
// мс назад (отмечаются раз в REFRESH_MS, пока открыты)
export const ONLINE_MS = 90000;
