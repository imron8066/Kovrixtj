import { t } from './i18n';
import { APP_NAME, COUNTRIES, CURRENCIES, PAY_METHODS } from './config';
import {
  Chat,
  CloudConfig,
  Currency,
  Donation,
  FieldDef,
  Game,
  Message,
  Promo,
  PromoCode,
  Status,
  User,
} from './types';

export function formatPrice(value: number) {
  const [whole, cents] = (Math.round(value * 100) / 100).toString().split('.');
  const digits = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${digits}${cents ? `,${cents.padEnd(2, '0')}` : ''} смн`;
}

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export function formatDate(ts: number) {
  const d = new Date(ts);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

// Поиск по журналу команды. Слова ищутся в имени, ID и телефоне клиента,
// коде заказа, товаре, сотруднике и ответе. День — «22.10.2026» или его
// начало («22.10»), время — «ЧЧ:ММ», границы входят
export interface HistoryFilter {
  text: string;
  day: string;
  from: string;
  to: string;
}
export const NO_FILTER: HistoryFilter = { text: '', day: '', from: '', to: '' };

const minutesOf = (hhmm: string) => {
  const m = hhmm.trim().match(/^(\d{1,2})[:.]?(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function matchHistory(
  entry: {
    at: number;
    code: string;
    title?: string;
    byName?: string;
    note?: string;
    client?: Partial<Pick<User, 'id' | 'name' | 'phone'>>;
  },
  filter: HistoryFilter,
) {
  const [day, time] = formatDate(entry.at).split(' ');
  if (filter.day.trim() && !day.startsWith(filter.day.trim())) {
    return false;
  }
  const now = minutesOf(time)!;
  const from = minutesOf(filter.from);
  const to = minutesOf(filter.to);
  if ((from !== null && now < from) || (to !== null && now > to)) {
    return false;
  }
  const where = [
    entry.code,
    entry.title,
    entry.byName,
    entry.note,
    entry.client?.name,
    entry.client?.id,
    entry.client?.phone,
  ]
    .filter(v => v !== undefined && v !== null)
    .join(' ')
    .toLowerCase();
  return filter.text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every(word => where.includes(word));
}

const randomDigits = (count: number) =>
  String(Math.floor(Math.random() * 9 * 10 ** (count - 1)) + 10 ** (count - 1));

// Номер заказа или объявления, например D-48213: его придумывает
// телефон, клиент называет его оператору.
// Своё ли сообщение — справа. В чате поддержки стороны — клиент и команда:
// по одному uid их не различить, если админ сам себе пишет как клиент.
// Старые ответы команды без пометки staff узнаём по имени Kovrix.
export const isOwnMessage = (
  m: Message,
  chat: Chat,
  owner: string,
  uid: string,
) => {
  if (chat.b !== 'staff') {
    return m.from === uid;
  }
  const fromStaff = m.staff ?? m.name === APP_NAME;
  return owner === 'staff' ? fromStaff : !fromStaff && m.from === uid;
};

// Ссылка на видео аккаунта: только http(s), без пробелов. Пусто — видео нет,
// null — ссылка с ошибкой.
export const videoLink = (text: string): string | null => {
  const link = text.trim();
  if (!link) {
    return '';
  }
  return /^https?:\/\/[^\s]{4,300}$/i.test(link) ? link : null;
};

export const newCode = (prefix: string) => `${prefix}-${randomDigits(5)}`;

export const newUserId = () => Number(randomDigits(6));

// Проверка полей, которые описаны в src/shared/games.ts.
// Возвращает текст ошибки или null, если всё заполнено верно.
export function checkFields(defs: FieldDef[], values: Record<string, string>) {
  for (const def of defs) {
    const value = (values[def.key] ?? '').trim();
    if (!value) {
      if (def.required) {
        return `Заполните поле: ${def.label}`;
      }
      continue;
    }
    if (def.pattern && !new RegExp(def.pattern).test(value)) {
      return def.hint || `Проверьте поле: ${def.label}`;
    }
  }
  return null;
}

// пары «название — значение» для заполненных полей
export const fieldPairs = (
  defs: FieldDef[],
  values: Record<string, string>,
): [string, string][] =>
  defs
    .filter(def => (values[def.key] ?? '').trim())
    .map(def => [def.label, values[def.key].trim()]);

// Клиенту — только способы, где админ вписал реквизиты (если нет ни одного,
// показываем все: при выборе будет подсказка «напишите в поддержку»)
export function payMethods(pay?: Record<string, string> | null) {
  const ready = PAY_METHODS.filter(m => pay?.[m.key]?.trim());
  return ready.length ? ready : PAY_METHODS;
}

// номер карты или телефона из реквизитов — его клиент копирует нажатием
export const payNumber = (text: string) =>
  (text.match(/\+?\d[\d -]{7,}\d/)?.[0] ?? '').replace(/[ -]/g, '');

export const errorText = (e: unknown) => (e instanceof Error ? e.message : '');

// Подписи состояний: у каждого вида заявок они свои
type Tone = 'warning' | 'ok' | 'danger' | 'info';
const labels = (done: string, sold = 'Продан') =>
  ({
    new: { text: 'На проверке', tone: 'warning' },
    done: { text: done, tone: 'ok' },
    rejected: { text: 'Отклонён', tone: 'danger' },
    sold: { text: sold, tone: 'info' },
  } as Record<Status, { text: string; tone: Tone }>);

export const STATUS = {
  orders: labels('Донат зачислен'),
  listings: labels('На витрине'),
  sales: labels('Продажа подтверждена'),
  claims: labels('Награда выдана'),
};

// ——— деньги ———
// Все цены хранятся в сомони; в валюту клиента они переводятся по курсу
// из базы (config/rates), а если админ курс не менял — из CURRENCIES.

// валюта страны клиента; у старых аккаунтов страны нет — это сомони
export const currencyOf = (user?: Pick<User, 'country'> | null): Currency =>
  COUNTRIES.find(c => c.key === user?.country)?.currency ?? 'TJS';

export const rateOf = (currency: Currency, config?: CloudConfig | null) =>
  config?.rates?.[currency] || CURRENCIES[currency].rate;

// сумма, уже посчитанная в валюте: «1 250 ₽», «12,50 смн»
export function amount(value: number, currency: Currency = 'TJS') {
  const { sign, digits } = CURRENCIES[currency];
  const [whole, cents] = value.toFixed(digits).split('.');
  const text = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${text}${cents && Number(cents) ? `,${cents}` : ''} ${t(sign)}`;
}

// цена в сомони → в валюте клиента
export const money = (
  tjs: number,
  currency: Currency = 'TJS',
  config?: CloudConfig | null,
) => amount(tjs * rateOf(currency, config), currency);

// сумма, введённая в валюте клиента, → сомони
export const toTjs = (
  value: number,
  currency: Currency,
  config?: CloudConfig | null,
) => Math.round((value / rateOf(currency, config)) * 100) / 100;

// Игра с ценами, которые выставил админ.
// Товар с ценой 0 клиент не видит — админ ещё не назначил цену (all — показать все).
export function priced(
  game: Game,
  config?: CloudConfig | null,
  all = false,
): Game {
  const own = config?.prices?.[game.id];
  // товары, которые админ добавил сам, идут после товаров из games.ts
  const added = Object.values(config?.products?.[game.id] ?? {});
  // админ ничего не менял — та же игра, без копии
  if (!own && !added.length && (all || game.products.every(p => p.price > 0))) {
    return game;
  }
  return {
    ...game,
    products: [
      ...game.products.map((p, i) => ({
        ...p,
        price: own?.products?.[i] ?? p.price,
      })),
      ...added,
    ].filter(p => all || p.price > 0),
    custom: game.custom && {
      ...game.custom,
      rate: own?.rate ?? game.custom.rate,
    },
  };
}

// Товары игры по группам — как в прайсе: алмазы, ваучеры, пропуск.
// Группа узнаётся по названию, поэтому и товар, добавленный админом,
// попадает куда надо; i — номер товара в game.products
// порядок проверки: «Ваучер на 100 алмазов» — это ваучер, а не алмазы
const GROUPS = [
  { key: 'voucher', test: /ваучер/i },
  { key: 'pass', test: /пропуск/i },
  { key: 'gems', test: /алмаз/i },
];
// а на экране — как в прайсе: алмазы, ваучеры, пропуск, остальное
const GROUP_ORDER = ['gems', 'voucher', 'pass', 'other'];
const GROUP_NAMES: Record<string, string> = {
  gems: '💎 Алмазы',
  voucher: '🎟️ Ваучеры',
  pass: '🎫 Пропуск',
  other: '🛒 Другое',
};

export function productGroups<T extends { title: string }>(products: T[]) {
  const keyOf = (title: string) =>
    GROUPS.find(g => g.test.test(title))?.key ?? 'other';
  return GROUP_ORDER.map(key => ({
    key,
    name: GROUP_NAMES[key],
    items: products
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => keyOf(p.title) === key),
  })).filter(g => g.items.length);
}

// самая большая действующая скидка на игру
export const promoFor = (promos: Promo[], gameId: string, now = Date.now()) =>
  promos
    .filter(p => p.until > now && (!p.game || p.game === gameId))
    .sort((a, b) => b.percent - a.percent)[0];

export const discounted = (price: number, promo?: Promo) =>
  promo ? Math.round(price * (100 - promo.percent)) / 100 : price;

// промокод так, как его хранит база: «ilm hona» → «ILMHONA»
export const codeKey = (text: string) =>
  text
    .toUpperCase()
    .replace(/[^A-ZА-ЯЁ0-9]/g, '')
    .slice(0, 20);

// цена товара item по промокоду; null — код к нему не подходит
export function codePrice(
  code: PromoCode | null | undefined,
  gameId: string,
  item: string,
  full: number,
  now = Date.now(),
) {
  if (!code || (code.until && code.until < now)) {
    return null;
  }
  if (code.game && code.game !== gameId) {
    return null;
  }
  if (code.product) {
    return code.product === item && code.price != null ? code.price : null;
  }
  if (code.prices) {
    return code.prices[item] > 0 ? code.prices[item] : null;
  }
  return code.percent ? Math.round(full * (100 - code.percent)) / 100 : null;
}

// что даёт промокод — для клиента и админа
export const codeText = (code: PromoCode, gameName?: string) =>
  code.product
    ? `${code.product} — ${amount(code.price ?? 0)}`
    : code.prices
    ? `скидочные цены${gameName ? ` на ${gameName}` : ''}`
    : `скидка ${code.percent}%${gameName ? ` на ${gameName}` : ''}`;

// ——— топ и статистика ———

export type Period = 'day' | 'week' | 'month' | 'all';

export const PERIODS: { key: Period; name: string; ms: number }[] = [
  { key: 'day', name: 'День', ms: 864e5 },
  { key: 'week', name: 'Неделя', ms: 7 * 864e5 },
  { key: 'month', name: 'Месяц', ms: 30 * 864e5 },
  { key: 'all', name: 'Всё время', ms: Infinity },
];

export interface Place {
  uid: string;
  id: number;
  name: string;
  total: number;
  place: number;
}

// кто сколько задонатил за период, от большего к меньшему
export function ranking(
  donations: Donation[],
  period: Period,
  now = Date.now(),
): Place[] {
  const since = now - PERIODS.find(p => p.key === period)!.ms;
  const byUser = new Map<string, Place>();
  for (const d of donations) {
    if (d.at < since) {
      continue;
    }
    const row = byUser.get(d.uid) ?? { ...d, total: 0, place: 0 };
    row.total += d.amount;
    row.name = d.name;
    byUser.set(d.uid, row);
  }
  return [...byUser.values()]
    .sort((a, b) => b.total - a.total)
    .map((row, i) => ({ ...row, place: i + 1 }));
}

// ——— случайный ник для регистрации ———

const NICK_A = [
  'Turbo',
  'Shadow',
  'Lucky',
  'Crazy',
  'Silent',
  'Golden',
  'Frost',
  'Rapid',
  'Dark',
  'Mega',
  'Royal',
  'Wild',
  'Neon',
  'Iron',
  'Storm',
];
const NICK_B = [
  'Wolf',
  'Tiger',
  'Sniper',
  'Rider',
  'Falcon',
  'Ninja',
  'King',
  'Dragon',
  'Ghost',
  'Hunter',
  'Panda',
  'Viper',
  'Ace',
  'Boss',
  'Fox',
];
const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];

export const randomName = () =>
  `${pick(NICK_A)}${pick(NICK_B)}_${randomDigits(3)}`;
