export interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  pattern?: string;
  hint?: string;
  inputmode?: 'numeric' | 'decimal';
  options?: string[];
}

export interface ImageDef {
  key: string;
  label: string;
}

export interface Product {
  title: string;
  price: number;
}

// Как проверить, что аккаунт существует (src/shared/lookup.ts).
// field — ключ поля заказа, в котором клиент пишет ID или тег.
export type LookupDef =
  | {
      // магазины, которые показывают ник по ID
      via: 'shop';
      field: string;
      // коды товара в GoPay Games — пробуются по очереди
      gopay?: string[];
      // запасной вариант — Codashop
      coda?: { vppId: number; price: string; type: string };
    }
  | {
      // официальный API Supercell, ключ — в SUPERCELL_KEYS (src/shared/config.ts)
      via: 'supercell';
      field: string;
      host: string;
      key: 'coc' | 'cr';
    };

// Игра (src/shared/games.ts): у каждой свой способ доната, свои поля заказа
// и свои поля для продажи аккаунта.
export interface Game {
  id: string;
  // игра временно не работает: плитка с пометкой, заказать и продать нельзя
  off?: boolean;
  name: string;
  tag: string;
  colors: [string, string];
  currency: string;
  method: string;
  steps: string[];
  fields: FieldDef[];
  images: ImageDef[];
  accountAttrs: FieldDef[];
  products: Product[];
  // донат на любую сумму: цена = количество × rate
  custom?: { min: number; max: number; quick: number[]; rate: number };
  // автопроверка аккаунта; если поля нет — аккаунт сверяет оператор
  lookup?: LookupDef;
  // какие скриншоты сделать перед продажей аккаунта этой игры
  sellGuide?: string[];
}

// Заявку решает админ или его заместитель. sold — аккаунт продан
// (только у объявлений, после подтверждения чека продажи).
export type Status = 'new' | 'done' | 'rejected' | 'sold';

// admin — всё; deputy (заместитель) — донаты, аккаунты, чаты, награды;
// bot — Telegram-бот (папка bot/)
export type Role = 'admin' | 'deputy' | 'bot';

// Что можно разрешить заместителю (список — PERMS в src/shared/config.ts)
export type Perm =
  | 'orders'
  | 'accounts'
  | 'chats'
  | 'claims'
  | 'prices'
  | 'promos'
  | 'tasks'
  | 'money'
  | 'stats'
  | 'block';
export type Perms = Partial<Record<Perm, boolean>>;

export type Currency = 'TJS' | 'RUB' | 'KZT' | 'USD';

export interface User {
  // ключ аккаунта в Firebase
  uid: string;
  // короткий ID клиента — он указан в каждом заказе
  id: number;
  name: string;
  phone: string;
  // с чем входит: номер или ник (у старых аккаунтов поля нет — это номер)
  login?: string;
  // ник, который человек выбрал себе сам в профиле: с ним тоже можно войти
  nick?: string;
  // страна из COUNTRIES (src/shared/config.ts) — от неё зависит валюта
  country?: string;
  // ID друга, который пригласил (ставится один раз при регистрации)
  ref?: string;
  createdAt: number;
}

// Кого пригласил клиент: invites/<его ID>/<uid друга>
export interface Invite {
  uid: string;
  name: string;
  at: number;
}

// Новость от админа: видна на главной, бот рассылает её в Telegram
// и записывает sent — сколько чатов получили
export interface News {
  id: string;
  text: string;
  by: string;
  at: number;
  sent?: number;
}

export type Client = Pick<User, 'id' | 'name' | 'phone'>;

// Общая часть заказа доната и аккаунта на продажу.
// price всегда в сомони — по нему считаются топ и статистика.
interface Request {
  code: string;
  uid: string;
  game: string;
  price: number;
  status: Status;
  // ответ админа клиенту
  note?: string;
  createdAt: number;
  client: Client;
  // когда и кто из команды принял решение
  decidedAt?: number;
  decidedBy?: string;
}

export interface Order extends Request {
  item: string;
  method: string;
  fields: Record<string, string>;
  // чем закончилась автопроверка аккаунта
  check?: string;
  // в какой валюте и каким способом платил клиент
  currency?: Currency;
  total?: number;
  pay?: string;
  // сработавшая акция или промокод (текстом)
  promo?: string;
  // введённый промокод (codes/<код>)
  promoCode?: string;
  // номер операции из чека банка — по нему ловятся повторные чеки
  txn?: string;
  // отпечаток скриншота чека (fingerprint в src/shared/guard.ts)
  receipt?: string;
}

export interface Listing extends Request {
  title: string;
  description: string;
  attrs: Record<string, string>;
  // продавец готов торговаться
  bargain?: boolean;
  // ссылка на видео аккаунта (YouTube, TikTok, Telegram…) — сами видео
  // в базу не влезают
  video?: string;
}

// Объявление на витрине — его видят все (market/<код>)
export interface Lot {
  code: string;
  uid: string;
  game: string;
  title: string;
  description: string;
  attrs: Record<string, string>;
  price: number;
  bargain: boolean;
  seller: Pick<User, 'id' | 'name'>;
  photos: number;
  video?: string;
  createdAt: number;
}

// Продавец сообщает о продаже и прикладывает чек; подтверждает админ
export interface Sale {
  code: string;
  uid: string;
  title: string;
  price: number;
  // под каким ключом лежит фото чека (photos/<uid>/<ключ>)
  photo: string;
  status: Status;
  note?: string;
  createdAt: number;
  client: Client;
  decidedAt?: number;
  decidedBy?: string;
}

// Журнал команды (history/<ключ>): кто, когда и что решил. Записи только
// добавляются — изменить или стереть их из приложения нельзя.
export interface HistoryEntry {
  id: string;
  at: number;
  by: string;
  byName: string;
  kind: 'orders' | 'listings' | 'sales' | 'claims';
  code: string;
  status: Status;
  title: string;
  amount?: number;
  note?: string;
  client: Client;
}

// Скидка: percent процентов на игру game ('' — на все игры) до until
export interface Promo {
  id: string;
  title: string;
  percent: number;
  game: string;
  until: number;
}

// Промокод (codes/<КОД>): клиент вводит его при заказе. Либо своя цена
// price на один товар product, либо свои цены prices на много товаров
// (название → цена), либо скидка percent на всю игру.
// game '' — на все игры, until 0 — бессрочно; daily — код дня от бота.
export interface PromoCode {
  id: string;
  game: string;
  product?: string;
  price?: number;
  prices?: Record<string, number>;
  percent?: number;
  until: number;
  daily?: boolean;
  // один раз на аккаунт: кто оформил заказ с кодом — в usedCodes/<uid>/<код>
  once?: boolean;
}

// Промокод дня (daily/<игра>): цены по коду задаёт админ, а сам код бот
// меняет каждый день в полночь по Душанбе. Клиент сюда не заглядывает.
export interface DailyCode {
  prices: Record<string, number>;
  code?: string;
  day?: string;
}

// Задание от админа и награда за него
export interface Task {
  id: string;
  title: string;
  text: string;
  reward: string;
  until: number;
  createdAt: number;
}

// Клиент сообщает, что выполнил задание
export interface Claim {
  task: string;
  title: string;
  reward: string;
  uid: string;
  proof: string;
  status: Status;
  note?: string;
  createdAt: number;
  client: Client;
  decidedAt?: number;
  decidedBy?: string;
}

// Зачисленный донат — из них складываются топ и статистика профиля
export interface Donation {
  code: string;
  uid: string;
  id: number;
  name: string;
  amount: number;
  at: number;
}

// deal — торг покупателя с продавцом, support — поддержка,
// partner — сотрудничество. a — кто начал чат, b — второй участник
// (у поддержки и сотрудничества это 'staff': отвечает админ или зам).
export interface Chat {
  id: string;
  kind: 'deal' | 'support' | 'partner';
  title: string;
  a: string;
  b: string;
  aName: string;
  bName: string;
  last?: string;
  updatedAt: number;
  unread?: boolean;
}

export interface Message {
  from: string;
  name: string;
  text: string;
  at: number;
  // ответ команды (поддержка) — даже если админ пишет со своего же
  // клиентского аккаунта
  staff?: boolean;
}

// Что админ меняет из приложения (config в базе)
export interface CloudConfig {
  // последняя вышедшая версия приложения
  version?: { code: number; name: string };
  // сколько единиц валюты в одном сомони
  rates?: Partial<Record<Currency, number>>;
  // реквизиты по способам оплаты
  pay?: Record<string, string>;
  // цены: rate — курс «любой суммы», products — цены пакетов по номеру
  prices?: Record<string, { rate?: number; products?: Record<string, number> }>;
  // товары, которые админ добавил сам (ваучер, пропуск…): игра → номер → товар
  products?: Record<string, Record<string, Product>>;
  // «Пригласи друга»: за каждые need друзей — награда reward
  referral?: { need: number; reward: string };
  // сколько людей с нами: аккаунтов и скачиваний APK из бота — считает бот
  stats?: { users: number; downloads?: number; at: number };
  // нужен ли код входа в KovriX A (сам код видит только владелец)
  teamOn?: boolean;
}

export interface Device {
  name: string;
  at: number;
}

export interface Session {
  uid: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

// Свой стиль поверх выбранного оформления: цвет кнопок, фон, свечение
export interface CustomLook {
  primary?: string;
  bg?: string;
  glow?: boolean;
}

// Что хранится на самом телефоне
export interface Settings {
  theme: string;
  custom?: CustomLook;
  // для какого оформления по умолчанию theme уже выбирали
  look?: string;
  // кто вошёл — чтобы приложение открывалось и без интернета
  user: User | null;
  // все аккаунты, в которые входили с этого телефона, — между ними
  // можно переключаться без пароля
  // linked — телефон уже записан в список устройств аккаунта
  accounts: { user: User; session: Session; linked?: boolean }[];
  // имя этого телефона в списке устройств
  device: string;
  // последние введённые данные по каждой игре (ID, ник, сервер)
  saved: Record<string, Record<string, string>>;
  // рекорд мини-игры «Алмазный дождь»
  gameBest?: number;
  // рекорды остальных мини-игр: quiz, pairs
  gameBests?: Record<string, number>;
  // аккаунты команды, для которых на этом телефоне введён код KovriX A
  teamUnlocked?: string[];
  // язык приложения: ru, tg, en (src/shared/i18n)
  lang?: 'ru' | 'tg' | 'en';
}

export const defaultSettings: Settings = {
  theme: 'cyber',
  user: null,
  accounts: [],
  device: '',
  saved: {},
};
