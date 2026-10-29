import { SUPERCELL_KEYS } from './config';
import { Game, LookupDef } from './types';

// Проверка «есть ли такой аккаунт в игре». Своего сервера у приложения нет,
// поэтому телефон сам спрашивает открытые сервисы:
//  • Free Fire, PUBG Mobile, FC Mobile — магазины GoPay Games и Codashop:
//    они показывают ник по ID перед оплатой. Это неофициальные адреса,
//    магазины могут поменять их без предупреждения — тогда проверка
//    отвечает «не удалось проверить», а заказ всё равно можно оформить.
//  • Clash of Clans, Clash Royale — официальный API Supercell
//    (нужен ключ, см. SUPERCELL_KEYS в src/shared/config.ts).
// У Black Russia, Standoff 2 и eFootball открытой проверки нет —
// у этих игр поля lookup в src/shared/games.ts нет, аккаунт сверяет оператор.
export type LookupResult =
  // аккаунт есть, nick — ник из игры
  | { status: 'found'; nick: string }
  // аккаунт есть, но он из другого региона — ник магазин не показывает
  | { status: 'exists' }
  // игра ответила, что такого ID нет
  | { status: 'missing' }
  // проверить не получилось: нет интернета, сервис недоступен, нет ключа
  | { status: 'unknown'; reason: string };

const TIMEOUT_MS = 12000;

const unknown = (reason: string): LookupResult => ({
  status: 'unknown',
  reason,
});

async function request(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      // сервис ответил не JSON — например, страницей защиты от роботов
    }
    return { status: res.status, ok: res.ok, json };
  } finally {
    clearTimeout(timer);
  }
}

const pick = (data: any, paths: string[]) => {
  for (const path of paths) {
    const value = path
      .split('.')
      .reduce((node, key) => (node == null ? node : node[key]), data);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

// Codashop отдаёт ник в виде «Ivan+%E2%9C%93»
function decodeNick(raw: string) {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' ')).trim();
  } catch {
    return raw;
  }
}

const NO_PLAYER =
  /(unknown|invalid|wrong) (user|player|id)|(user|player|account|id) (is )?(not found|invalid|does ?n.t exist)/i;
const NO_PRODUCT =
  /unknown (product|game)|invalid code|(product|game) code|product not found/i;

async function gopay(code: string, id: string): Promise<LookupResult> {
  const res = await request('https://gopay.co.id/games/v1/order/user-account', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      Origin: 'https://gopay.co.id',
      Referer: 'https://gopay.co.id/games',
    },
    body: JSON.stringify({ code, data: { userId: id, zoneId: '' } }),
  });
  if (res.status === 429) {
    return unknown('Слишком много проверок подряд. Подождите минуту.');
  }
  const nick = pick(res.json, [
    'data.username',
    'data.userAccount',
    'data.nickname',
    'data.name',
    'username',
    'userAccount',
  ]);
  if (res.ok && nick) {
    return { status: 'found', nick };
  }
  const message = pick(res.json, [
    'message',
    'error',
    'data.message',
    'errorMessage',
    'msg',
  ]);
  if (NO_PRODUCT.test(message)) {
    return unknown('Магазин не знает такой товар.');
  }
  if (NO_PLAYER.test(message)) {
    return { status: 'missing' };
  }
  return unknown(`Сервис проверки ответил: ${message || res.status}`);
}

async function codashop(
  coda: NonNullable<Extract<LookupDef, { via: 'shop' }>['coda']>,
  id: string,
): Promise<LookupResult> {
  const form: Record<string, string> = {
    'voucherPricePoint.id': String(coda.vppId),
    'voucherPricePoint.price': coda.price,
    'voucherPricePoint.variablePrice': '0',
    'user.userId': id,
    voucherTypeName: coda.type,
    shopLang: 'id_ID',
  };
  const res = await request(
    'https://order-sg.codashop.com/initPayment.action',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://www.codashop.com',
        Referer: 'https://www.codashop.com/',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: Object.entries(form)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&'),
    },
  );
  if (res.status === 429) {
    return unknown('Слишком много проверок подряд. Подождите минуту.');
  }
  const nick = pick(res.json, [
    'confirmationFields.roles.0.role',
    'confirmationFields.username',
    'confirmationFields.nickname',
  ]);
  if (res.ok && nick) {
    return { status: 'found', nick: decodeNick(nick) };
  }
  const message = pick(res.json, ['errorMsg', 'errorMessage', 'message']);
  // errorCode 24 «Topup region blocked for player»: ID настоящий, но аккаунт
  // не из региона магазина (Индонезия) — так отвечают все остальные регионы
  if (res.json?.errorCode === 24 || /region blocked/i.test(message)) {
    return { status: 'exists' };
  }
  // на несуществующий ID Codashop отвечает «Wrong player id» (errorCode 12)
  // или «Invalid user ID» (errorCode -100)
  if (
    res.json?.errorCode === 12 ||
    res.json?.errorCode === -100 ||
    NO_PLAYER.test(message)
  ) {
    return { status: 'missing' };
  }
  return unknown(`Сервис проверки ответил: ${message || res.status}`);
}

// Тег Supercell: без «#», заглавными, буква O вместо нуля — частая опечатка
export const normalizeTag = (tag: string) =>
  tag.trim().toUpperCase().replace(/^#/, '').replace(/O/g, '0');

async function supercell(
  def: Extract<LookupDef, { via: 'supercell' }>,
  tag: string,
): Promise<LookupResult> {
  const key = SUPERCELL_KEYS[def.key];
  if (!key) {
    return unknown('Автопроверка для этой игры ещё не настроена.');
  }
  const res = await request(
    `https://${def.host}/v1/players/%23${normalizeTag(tag)}`,
    { headers: { Accept: 'application/json', Authorization: `Bearer ${key}` } },
  );
  if (res.ok && typeof res.json?.name === 'string') {
    return { status: 'found', nick: res.json.name };
  }
  if (res.status === 404) {
    return { status: 'missing' };
  }
  if (res.status === 403) {
    return unknown('Ключ Supercell не подходит (src/shared/config.ts).');
  }
  if (res.status === 429) {
    return unknown('Слишком много проверок подряд. Подождите минуту.');
  }
  return unknown(`Сервис проверки ответил: ${res.status}`);
}

// Спрашивает сервисы по очереди, пока один не даст точный ответ.
// GoPay знает только аккаунты своего региона и на остальные отвечает
// «такого ID нет», поэтому, если у игры есть Codashop, его «нет»
// не окончательное — решает Codashop: он отличает чужой регион
// от несуществующего ID.
export async function checkAccount(
  game: Game,
  fields: Record<string, string>,
): Promise<LookupResult> {
  const def = game.lookup;
  if (!def) {
    return unknown('Для этой игры автопроверки нет.');
  }
  const id = (fields[def.field] ?? '').trim();
  const tries: (() => Promise<LookupResult>)[] =
    def.via === 'supercell'
      ? [() => supercell(def, id)]
      : [
          ...(def.gopay ?? []).map(code => () => gopay(code, id)),
          ...(def.coda ? [() => codashop(def.coda!, id)] : []),
        ];
  let last = unknown('Для этой игры автопроверки нет.');
  for (const attempt of tries) {
    try {
      last = await attempt();
    } catch {
      last = unknown('Нет связи с сервисом проверки. Проверьте интернет.');
    }
    const final =
      last.status === 'found' ||
      last.status === 'exists' ||
      (last.status === 'missing' &&
        (def.via !== 'shop' ||
          !def.coda ||
          attempt === tries[tries.length - 1]));
    if (final) {
      return last;
    }
  }
  // сюда доходит и «GoPay не нашёл, а Codashop не ответил» — это не «нет»
  return last.status === 'missing'
    ? unknown('Не удалось проверить в других регионах.')
    : last;
}
