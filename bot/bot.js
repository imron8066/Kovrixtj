'use strict';
// Telegram-бот Kovrix (@Kovrixtj_bot). Только Node.js 22+, без библиотек.
// Запуск: npm run bot (или службой: npm run bot:on). Настройки — bot/.env.
//
// Как устроен:
//   • Меню — клавиатура внизу чата (Цены, Регистрация/Заказать, Отзывы,
//     Поддержка, Ещё). Экран — одно компактное текстовое сообщение с
//     кнопками; кнопки меняют его на месте, новый экран заменяет старый.
//   • Два в одном: цены, отзывы и промокоды видны без регистрации, а
//     регистрация — одна кнопка «Отправить мой номер» (ID + код для входа).
//     Кто зарегистрировался в приложении, подтверждает номер из профиля.
//     «Новый код» ставит новый пароль по ключу восстановления (recovery/<uid>).
//   • Поддержка из бота пишет в тот же чат, что и приложение (support_<uid>);
//     отзывы — botSeen/reviews/<чат>, команда может их удалять.
//   • Профиль, мои заказы, приглашение друга, вход на сайт одноразовой
//     ссылкой, скачивание APK, подарок звёздами или на карту, помощь.
//   • Команде — экран «Команда»: заявки, статистика, KovriX A. Отдельный
//     бот команды с кнопками «Принять/Отклонить» — bot/admin.js (ADMIN_TOKEN).
//   • Раз в CHECK_MS смотрит базу: клиенту — что с заказом и новые сообщения
//     в чате, команде — новые заявки; рассылает новости и обновления APK.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CHECK_MS = 20000;
// больше Telegram от бота не принимает
const MAX_FILE = 50 * 1024 * 1024;
// новый код — не чаще раза в минуту
const CODE_PAUSE_MS = 60000;
const MAX_GIFT_STARS = 10000;
// сколько последних заказов показывать на экране «Мои заказы»
const LAST_ORDERS = 6;
// сколько ждать базу и Telegram, прежде чем считать запрос пропавшим
const NET_MS = 15000;

// ——— настройки ———

const env = {};
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match) env[match[1]] = match[2];
  }
} catch {
  // файла нет — ниже будет понятная ошибка
}
const need = (key) => {
  const value = process.env[key] || env[key];
  if (!value) {
    console.error(`В bot/.env не заполнено ${key}. Как получить — см. README.md, раздел «Telegram-бот».`);
    process.exit(1);
  }
  return value;
};
// проект Firebase — тот же, что у приложений и сайта (src/shared/config.ts);
// если там пусто — из bot/.env (свой сервер: FIREBASE_DB=…/api/db)
const shared = (() => {
  try {
    const source = fs.readFileSync(path.join(__dirname, '../src/shared/config.ts'), 'utf8');
    const pick = (name) => source.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`))?.[1] ?? '';
    return { key: pick('FIREBASE_API_KEY'), db: pick('FIREBASE_DB_URL') };
  } catch {
    return { key: '', db: '' };
  }
})();
const fromShared = !!(shared.key && shared.db);
const TOKEN = need('TELEGRAM_TOKEN');
const FIREBASE_KEY = fromShared ? shared.key : need('FIREBASE_KEY');
const FIREBASE_DB = (fromShared ? shared.db : need('FIREBASE_DB')).replace(/\/+$/, '');
const OWN_SERVER = /\/api\/db$/.test(FIREBASE_DB);
const AUTH_URL = (process.env.AUTH_URL || env.AUTH_URL || (OWN_SERVER ? FIREBASE_DB.replace(/\/api\/db$/, '/api/auth') : 'https://identitytoolkit.googleapis.com/v1')).replace(/\/+$/, '');
const TOKEN_URL = OWN_SERVER ? `${AUTH_URL}/token` : 'https://securetoken.googleapis.com/v1/token';
const BOT_EMAIL = need('BOT_EMAIL');
const BOT_PASSWORD = need('BOT_PASSWORD');
const SITE = (process.env.SITE_URL || env.SITE_URL || 'https://kovrixtj.web.app').replace(/\/+$/, '');
const FILES = {
  user: { file: path.join(__dirname, '../builds/Kovrix-ПОЛЬЗОВАТЕЛЬ.apk'), name: 'Kovrix.apk' },
  staff: { file: path.join(__dirname, '../builds/Kovrix-АДМИН.apk'), name: 'KovriX-A.apk' },
};
const BANNERS = path.join(__dirname, 'assets/banners');
// номера картинок, уже загруженных в Telegram: { имя: { stamp, id } }
const BANNER_IDS = path.join(__dirname, '.banners.json');

const log = (...args) => console.log(new Date().toLocaleString('ru-RU'), ...args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ——— Firebase ———

async function auth(action, body) {
  const res = await fetch(`${AUTH_URL}/accounts:${action}?key=${FIREBASE_KEY}`, {
    method: 'POST',
    signal: AbortSignal.timeout(NET_MS),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const reply = await res.json();
  if (!res.ok) throw new Error(reply.error?.message ?? String(res.status));
  return reply;
}

let session = { token: '', until: 0 };

async function token() {
  if (session.until - Date.now() > 60000) return session.token;
  const reply = await auth('signInWithPassword', { email: BOT_EMAIL, password: BOT_PASSWORD, returnSecureToken: true }).catch((e) => {
    throw new Error(`Firebase не пустил бота: ${e.message}`);
  });
  session = { token: reply.idToken, until: Date.now() + Number(reply.expiresIn) * 1000 };
  return session.token;
}

// as — пропуск другого аккаунта: так бот пишет анкету только что
// созданного клиента от его имени
async function db(method, where, body, as) {
  const res = await fetch(`${FIREBASE_DB}/${where}.json?auth=${as ?? (await token())}`, {
    method,
    signal: AbortSignal.timeout(NET_MS),
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const reply = await res.json();
  if (!res.ok) throw new Error(`База (${method} ${where}): ${reply?.error ?? res.status}`);
  return reply;
}

// ключи базы не могут содержать точки и скобки
const safe = (key) => key.replace(/[.#$/[\]]/g, '_');

// ——— Telegram ———

async function tg(method, body) {
  const form = body instanceof FormData;
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    // getUpdates ждёт до 25 с сам; файлы (APK) грузятся дольше
    signal: AbortSignal.timeout(method === 'getUpdates' ? 40000 : form ? 300000 : NET_MS),
    headers: form ? undefined : { 'Content-Type': 'application/json' },
    body: form ? body : JSON.stringify(body),
  });
  const reply = await res.json();
  if (!reply.ok) throw new Error(`Telegram ${method}: ${reply.description}`);
  return reply.result;
}

// запрос с файлами: fields — обычные поля (объекты уходят как JSON),
// files — { имя поля: путь к файлу }
async function tgForm(method, fields, files) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  for (const [key, file] of Object.entries(files)) {
    form.append(key, await fs.openAsBlob(file), path.basename(file));
  }
  return tg(method, form);
}

// человек мог заблокировать бота — это не повод останавливаться
const send = (chat, text, extra) =>
  tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra })
    .catch((e) => log('не отправлено:', e.message));

// всё чужое (имена, названия, ответы админа) — только через esc;
// то, что в <code>, в Telegram копируется нажатием
const esc = (text) => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const copy = (text) => `<code>${esc(text)}</code>`;
const digits = (phone) => String(phone ?? '').replace(/\D/g, '');
const day = (ms) => new Date(ms).toLocaleDateString('ru-RU');

// ——— кнопки ———

const btn = (text, data) => ({ text, callback_data: data });
const url = (text, where) => ({ text, url: where });
// открывает сайт прямо внутри Telegram
const app = (text, where = '/user/') => ({ text, web_app: { url: SITE + where } });
const BACK = [btn('⬅️ В меню', 'home')];
const markup = (rows) => ({ reply_markup: { inline_keyboard: rows } });
const ASK_CONTACT = {
  reply_markup: {
    keyboard: [[{ text: '📱 Отправить мой номер', request_contact: true }], [{ text: '✖️ Отмена' }]],
    resize_keyboard: true,
    one_time_keyboard: true,
    input_field_placeholder: 'Нажмите «Отправить мой номер» ⬇️',
  },
};
const NO_KEYBOARD = { reply_markup: { remove_keyboard: true } };

// ——— фон экранов ———

let bannerIds = {};
try {
  bannerIds = JSON.parse(fs.readFileSync(BANNER_IDS, 'utf8'));
} catch {
  // ещё ничего не загружено
}

function banner(name) {
  const file = path.join(BANNERS, `${name}.jpg`);
  try {
    const stat = fs.statSync(file);
    const stamp = `${stat.size}-${Math.round(stat.mtimeMs)}`;
    return { file, stamp, id: bannerIds[name]?.stamp === stamp ? bannerIds[name].id : null };
  } catch {
    return null;
  }
}

// картинка загружается в Telegram один раз, дальше — по её номеру
function rememberBanner(name, stamp, message) {
  const id = message?.photo?.at(-1)?.file_id;
  if (!id || bannerIds[name]?.id === id) return;
  bannerIds[name] = { stamp, id };
  fs.writeFile(BANNER_IDS, JSON.stringify(bannerIds, null, 2), () => {});
}

// Экран — одно компактное сообщение: текст и кнопки под ним. edit — номер
// сообщения, по кнопке которого пришли: оно меняется на месте. Иначе
// прежний экран удаляется, а новый приходит вниз — чат не засоряется.
const lastScreen = new Map();
// стиль «Кибер», как у приложения и сайта: заголовок экрана заглавными,
// под ним — светящаяся черта
const LINE = '▰▰▰▰▰▰▰▰▰▰▰▰▰▰';
function styled(text) {
  const head = text.match(/^<b>([^<&]+)<\/b>([^\n]*)\n*/);
  if (!head) return text;
  const body = text.slice(head[0].length);
  return `<b>${head[1].toUpperCase()}</b>${head[2]}\n${LINE}${body ? `\n${body}` : ''}`;
}
async function screen(chat, raw, rows, edit) {
  const text = styled(raw);
  const reply_markup = { inline_keyboard: rows };
  if (edit) {
    const ok = await tg('editMessageText', { chat_id: chat, message_id: edit, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup })
      .then(() => true, (e) => /not modified/.test(e.message));
    if (ok) return void lastScreen.set(chat, edit);
    // старый экран с картинкой текстом не заменить — убираем его
    tg('deleteMessage', { chat_id: chat, message_id: edit }).catch(() => {});
  } else if (lastScreen.has(chat)) {
    tg('deleteMessage', { chat_id: chat, message_id: lastScreen.get(chat) }).catch(() => {});
  }
  const message = await send(chat, text, { reply_markup });
  if (message) lastScreen.set(chat, message.message_id);
}

// ——— меню снизу ———

// Главное меню снизу: выбор товара (алмазы, ваучеры, пропуск), регистрация,
// отзывы, подарок. Кнопка товара меняет меню на пакеты с ценами.
const KB = {
  gems: '💎 Алмазы', voucher: '🎟 Ваучеры', pass: '🎫 Пропуск',
  reg: '📝 Регистрация', orders: '📦 Заказы', profile: '👤 Профиль',
  reviews: '⭐ Отзывы', gift: '🎁 Подарить', support: '💬 Поддержка', more: '☰ Ещё', promo: '🏷 Промокод',
  prices: '💰 Цены', back: '⬅️ Меню',
};
const KB_VERSION = 3;
const kbKind = (me) => `${KB_VERSION}:${me ? 'client' : 'guest'}`;
const PACKS_KIND = `${KB_VERSION}:packs`;
const key = (text, extra) => ({ text, ...extra });
function keyboard(me) {
  const shop = [key(KB.gems), key(KB.voucher), key(KB.pass)];
  const rows = me
    ? [shop, [key(KB.orders), key(KB.profile), key(KB.promo)], [key(KB.reviews), key(KB.support), key(KB.more)]]
    : [shop, [key(KB.reg), key(KB.promo), key(KB.reviews)], [key(KB.gift), key(KB.support), key(KB.more)]];
  return { reply_markup: { keyboard: rows, resize_keyboard: true, is_persistent: true, input_field_placeholder: 'Меню — кнопки ниже ⬇️' } };
}

// у кого какое меню уже стоит (гость или клиент) — чтобы не слать его заново
const KEYBOARDS = path.join(__dirname, '.keyboards.json');
let keyboards = {};
try {
  keyboards = JSON.parse(fs.readFileSync(KEYBOARDS, 'utf8'));
} catch {
  // ещё никому не ставили
}
const saveKeyboards = () => fs.writeFile(KEYBOARDS, JSON.stringify(keyboards), () => {});

async function menu(chat, me, text) {
  const sent = await send(chat, styled(text), keyboard(me));
  if (sent) {
    keyboards[chat] = kbKind(me);
    saveKeyboards();
  }
}

// меню устарело (человек зарегистрировался, вышла новая версия бота) — ставим новое
async function ensureMenu(chat) {
  const me = await whoIs(chat).catch(() => undefined);
  // меню пакетов — тоже наше, его не трогаем
  if (me === undefined || keyboards[chat] === kbKind(me) || keyboards[chat] === PACKS_KIND) return;
  await menu(chat, me, '👇 Меню — внизу экрана');
}

// ——— аккаунты ———

// tg/<uid> → { chat }: кто из Kovrix пишет в каком чате. Читается раз
// в 15 секунд, после своих записей — заново.
let linksCache = { at: 0, value: {} };
async function links(fresh = false) {
  if (fresh || Date.now() - linksCache.at > 15000) linksCache = { at: Date.now(), value: (await db('GET', 'tg')) ?? {} };
  return linksCache.value;
}
async function linkChat(uid, chat, phone) {
  await db('PUT', `tg/${uid}`, { chat, phone, at: Date.now() });
  linksCache.at = 0;
}

async function whoIs(chat) {
  const all = await links();
  const uid = Object.keys(all).find((key) => all[key].chat === chat);
  if (!uid) return null;
  const [user, role] = await Promise.all([db('GET', `users/${uid}`), db('GET', `roles/${uid}`)]);
  return user ? { uid, user, role, staff: role === 'admin' || role === 'deputy' } : null;
}

async function staffChats() {
  const [roles, all] = await Promise.all([db('GET', 'roles'), links()]);
  return Object.entries(roles ?? {})
    .filter(([, role]) => role === 'admin' || role === 'deputy')
    .map(([uid]) => all[uid]?.chat)
    .filter(Boolean);
}

const FLAGS = { TJ: '🇹🇯', UZ: '🇺🇿', KG: '🇰🇬', KZ: '🇰🇿', RU: '🇷🇺', US: '🇺🇸' };
const sixDigits = () => String(crypto.randomInt(100000, 1000000));

// подтверждение номера у того, кто регистрировался в приложении
async function confirmPhone(chat, uid, phone) {
  const user = await db('GET', `users/${uid}`);
  if (!user) {
    await send(chat, 'Аккаунт Kovrix не найден. Откройте бота кнопкой «Подтвердить в Telegram» в профиле приложения.');
    return home(chat);
  }
  // у аккаунта с ником (без телефона) сверять нечего
  if (digits(user.phone) && digits(user.phone) !== phone) {
    await send(chat, `Номер Telegram не совпадает с номером в Kovrix (${esc(user.phone)}). Войдите в Telegram с этим номером или зарегистрируйтесь в Kovrix с номером Telegram.`);
    return home(chat);
  }
  await linkChat(uid, chat, phone);
  log(`подтверждён ${user.name} (ID ${user.id})`);
  await send(chat, `✅ Номер подтверждён! Сюда будут приходить сообщения о заказах, продаже аккаунтов и ответы поддержки.`);
  return home(chat);
}

const lastCode = new Map();

// Забыл код: бот ставит аккаунту новый пароль по ключу восстановления
async function newCode(chat) {
  const me = await whoIs(chat);
  if (!me) return send(chat, 'Сначала зарегистрируйтесь — это одна кнопка.', markup([[btn('📝 Регистрация', 'reg')]]));
  if (me.staff) return send(chat, 'Сотрудникам пароль меняет админ: KovriX A → «Ещё» → «Люди».');
  if (Date.now() - (lastCode.get(chat) ?? 0) < CODE_PAUSE_MS) return send(chat, '⏳ Код только что отправлен. Новый можно получить через минуту.');
  const key = await db('GET', `recovery/${me.uid}`);
  const byId = /^\d{6}$/.test(me.user.login ?? '');
  const login = byId ? `ID ${me.user.id}` : `номер ${me.user.phone}`;
  const stale = `Для этого аккаунта код сейчас выдать нельзя. Войдите в приложение со своим паролем (${esc(login)}) — после этого кнопка заработает. Не помните пароль — напишите в поддержку в приложении.`;
  if (!key) return send(chat, stale);
  const code = sixDigits();
  try {
    const res = await fetch(`${TOKEN_URL}?key=${FIREBASE_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(key)}`,
    });
    const fresh = await res.json();
    if (!res.ok) throw new Error(fresh.error?.message ?? String(res.status));
    const reply = await auth('update', { idToken: fresh.id_token, password: code, returnSecureToken: true });
    await db('PUT', `recovery/${me.uid}`, reply.refreshToken);
  } catch (e) {
    log(`новый код для ID ${me.user.id} не выдан:`, e.message);
    return send(chat, stale);
  }
  lastCode.set(chat, Date.now());
  log(`новый код для ${me.user.name} (ID ${me.user.id})`);
  return send(chat, `🔑 <b>Новый код:</b> ${copy(code)}\n\nВход: ${byId ? `ID ${copy(me.user.id)}` : `номер ${copy(me.user.phone)}`} и этот код. Старый код больше не действует; на других устройствах нужно войти заново.`);
}

// Одноразовая ссылка: сайт открывается уже с аккаунтом клиента.
// В базе она живёт пять минут, и сайт стирает её сразу после входа.
async function siteLink(chat) {
  const me = await whoIs(chat);
  if (!me) return send(chat, 'Сайт Kovrix — по кнопке ниже. Чтобы бот входил за вас, зарегистрируйтесь.', markup([[url('🌐 Открыть сайт', `${SITE}/`), btn('📝 Регистрация', 'reg')]]));
  if (me.staff) return send(chat, 'Сайт команды — по кнопке ниже. Вход — ник и пароль.', markup([[url('🛠 KovriX A', `${SITE}/admin/`)]]));
  const key = await db('GET', `recovery/${me.uid}`).catch(() => null);
  if (!key) return send(chat, `Войдите на сайте по ID ${copy(me.user.id)} и своему коду.`, markup([[url('🌐 Открыть сайт', `${SITE}/`)]]));
  const once = crypto.randomBytes(24).toString('hex');
  await db('PUT', `logins/${once}`, { key, until: Date.now() + 5 * 60000 });
  return send(chat, '🌐 Нажмите кнопку — сайт откроется сразу с вашим аккаунтом.\n\n⏱ Ссылка одноразовая и работает 5 минут. Никому её не пересылайте.', markup([[url('🚀 Войти на сайт', `${SITE}/user/#/enter/${once}`)]]));
}

// ——— экраны ———

const GUEST_TEXT =
  '<b>💎 KOVRIX</b> — донат в игры и аккаунты\n\n' +
  '💎 <b>Алмазы, ваучеры, пропуск</b> — выбор и цены внизу, без регистрации\n' +
  '📝 <b>Регистрация</b> — одна кнопка, по номеру Telegram\n' +
  '🔔 Статус заказа и ответы поддержки — сюда';

function homeRows(me) {
  const shop = [btn(KB.gems, 'cat:gems'), btn(KB.voucher, 'cat:voucher'), btn(KB.pass, 'cat:pass')];
  return me
    ? [shop, [btn('📦 Заказы', 'orders'), btn('👤 Профиль', 'profile'), btn('🏷 Промокод', 'promo')], [btn('⭐ Отзывы', 'reviews'), btn('💬 Поддержка', 'support'), btn('☰ Ещё', 'more')]]
    : [shop, [btn('📝 Регистрация', 'reg'), btn('🏷 Промокод', 'promo'), btn('⭐ Отзывы', 'reviews')], [btn('🎁 Подарить', 'gift'), btn('💬 Поддержка', 'support'), btn('☰ Ещё', 'more')]];
}

// без edit — приветствие с меню внизу; по кнопке «В меню» — то же кнопками
// Анимированная заставка на /start (bot/assets/intro.gif, рисует
// scripts/intro-gif.swift): загружается один раз, дальше — по file_id
const INTRO = path.join(__dirname, 'assets', 'intro.gif');
async function intro(chat) {
  let stat;
  try {
    stat = fs.statSync(INTRO);
  } catch {
    return;
  }
  const stamp = `${stat.size}-${Math.round(stat.mtimeMs)}`;
  const caption = '💎 <b>Kovrix</b> — донать быстро, играй красиво';
  const saved = await db('GET', 'botSeen/files/intro').catch(() => null);
  if (saved?.stamp === stamp) {
    try {
      return await tg('sendAnimation', { chat_id: chat, animation: saved.id, caption, parse_mode: 'HTML' });
    } catch (e) {
      log('заставку придётся загрузить заново:', e.message);
    }
  }
  const message = await tgForm('sendAnimation', { chat_id: chat, caption, parse_mode: 'HTML' }, { animation: INTRO });
  const id = message.animation?.file_id ?? message.document?.file_id;
  if (id) await db('PUT', 'botSeen/files/intro', { id, stamp }).catch(() => {});
  return message;
}

async function home(chat, edit) {
  // база недоступна — главный экран всё равно показываем
  const me = await whoIs(chat).catch((e) => log('главный экран без профиля:', e.message));
  const text = me
    ? `<b>💎 KOVRIX</b> · привет, ${esc(me.user.name)}!\n🆔 ${copy(me.user.id)}\n\n💎 Выберите внизу, что купить — алмазы, ваучер или пропуск.`
    : GUEST_TEXT;
  if (!edit) return menu(chat, me, text);
  return screen(chat, text, homeRows(me), edit);
}

async function more(chat, edit) {
  const me = await whoIs(chat).catch(() => null);
  const rows = me
    ? [[btn('💰 Все цены', 'prices'), btn('🎁 Подарить', 'gift')], [btn('🔑 Новый код', 'code'), btn('🌐 Сайт без пароля', 'site')], [btn('👥 Пригласить', 'invite'), btn('📲 Скачать', 'download')]]
    : [[btn('💰 Все цены', 'prices'), btn('📲 Скачать', 'download')], [url('🌐 Сайт', `${SITE}/user/`)]];
  rows.unshift([btn('ℹ️ О Kovrix', 'info'), btn('🕹️ Мини-игры', 'games')]);
  if (me?.staff) rows.push([btn('🛠 Команда', 'staff')]);
  rows.push([btn('❓ Помощь', 'help'), BACK[0]]);
  return screen(chat, '<b>☰ Ещё</b>', rows, edit);
}

// «О Kovrix»: рекламный ролик (bot/assets/info.mp4 — копия
// ads/кибер/видео-реклама.mp4, рисует bash scripts/art.sh ad-video) и коротко
// о сервисе. Как заставка: загружается один раз, дальше — по file_id.
const INFO = path.join(__dirname, 'assets', 'info.mp4');
async function info(chat) {
  const caption =
    '<b>💎 KOVRIX</b> — донат в игры\n\n' +
    '💎 Алмазы, 🎟 ваучеры и 🎫 пропуск Free Fire — цены в сомони\n' +
    '🏷 Промокод дня — ещё дешевле\n' +
    '💳 Оплата: Алиф, Visa, Эсхата · подтверждение в течение дня\n' +
    '📲 Приложение для Android, 🌐 сайт для iPhone и ПК, 🤖 этот бот\n' +
    '🛒 Витрина игровых аккаунтов · 🕹️ мини-игры с топом';
  const rows = [[btn(KB.gems, 'cat:gems'), btn('🏷 Промокод', 'promo')], [app('🌐 Сайт'), btn('📲 Скачать', 'download')], BACK];
  let stat;
  try {
    stat = fs.statSync(INFO);
  } catch {
    return screen(chat, caption, rows);
  }
  const stamp = `${stat.size}-${Math.round(stat.mtimeMs)}`;
  const extra = { chat_id: chat, caption, parse_mode: 'HTML', supports_streaming: true, reply_markup: { inline_keyboard: rows } };
  const saved = await db('GET', 'botSeen/files/info').catch(() => null);
  if (saved?.stamp === stamp) {
    try {
      return await tg('sendVideo', { ...extra, video: saved.id });
    } catch (e) {
      log('ролик придётся загрузить заново:', e.message);
    }
  }
  await tg('sendChatAction', { chat_id: chat, action: 'upload_video' }).catch(() => {});
  const message = await tgForm('sendVideo', extra, { video: INFO });
  const id = message.video?.file_id ?? message.document?.file_id;
  if (id) await db('PUT', 'botSeen/files/info', { id, stamp }).catch(() => {});
  return message;
}

// Мини-игры — те же, что в приложении; открываются сайтом прямо в Telegram
// (web/user/games.js), рекорды идут в общий топ
function games(chat, edit) {
  return screen(chat,
    '<b>🕹️ Мини-игры</b>\n\nИграйте, пока ждёте заказ. Рекорды — в общем топе Kovrix.\n\n' +
    '💎 <b>Алмазный дождь</b> — лови алмазы, не трогай бомбы\n🧠 <b>Знаток Free Fire</b> — 10 вопросов на скорость\n🃏 <b>Найди пару</b> — запомни и открой пары на время',
    [[app('💎 Алмазный дождь', '/user/#/play/rain')], [app('🧠 Знаток', '/user/#/play/quiz'), app('🃏 Найди пару', '/user/#/play/pairs')], BACK], edit);
}

// ——— регистрация в боте ———
// Номер из «Отправить мой номер» Telegram подтверждает сам, поэтому
// по нему можно и создать аккаунт, и узнать уже существующий.

const COUNTRY = [['992', 'TJ'], ['998', 'UZ'], ['996', 'KG'], ['76', 'KZ'], ['77', 'KZ'], ['7', 'RU'], ['1', 'US']];
const countryOf = (phone) => COUNTRY.find(([dial]) => phone.startsWith(dial))?.[1] ?? 'XX';

async function regAsk(chat) {
  if (await whoIs(chat)) return profile(chat);
  delete keyboards[chat];
  return send(chat,
    '<b>📝 Регистрация</b>\n\nНажмите внизу «📱 Отправить мой номер» — бот сразу выдаст ID и код для входа в приложение и на сайт.',
    ASK_CONTACT);
}

// ID служит логином, код — паролем
async function createClient(chat, phone, name, ref) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const id = sixDigits();
    const code = sixDigits();
    let account;
    try {
      account = await auth('signUp', { email: `i${id}@donix.example.com`, password: code, returnSecureToken: true });
    } catch (e) {
      if (/EMAIL_EXISTS/.test(e.message)) continue;
      throw e;
    }
    const uid = account.localId;
    try {
      // правила базы не дают занять чужой ID
      await db('PUT', `ids/${id}`, uid, account.idToken);
    } catch {
      await auth('delete', { idToken: account.idToken }).catch(() => {});
      continue;
    }
    const user = { uid, id: Number(id), name, phone: `+${phone}`, login: id, country: countryOf(phone), createdAt: Date.now(), ...(ref && ref !== id ? { ref } : {}) };
    await db('PUT', `users/${uid}`, user, account.idToken);
    await linkChat(uid, chat, phone);
    // без ключа восстановления аккаунт работает, но «Новый код» — нет
    await db('PUT', `recovery/${uid}`, account.refreshToken, account.idToken).catch((e) => log('ключ восстановления не сохранён:', e.message));
    if (user.ref) await db('PUT', `invites/${user.ref}/${uid}`, { name, at: Date.now() }).catch(() => {});
    return { user, code };
  }
  throw new Error('не удалось подобрать свободный ID');
}

async function register(chat, phone, from) {
  const users = Object.values((await db('GET', 'users')) ?? {});
  const found = users.find((user) => digits(user.phone) === phone);
  if (found) {
    await linkChat(found.uid, chat, phone);
    log(`узнан по номеру ${found.name} (ID ${found.id})`);
    await send(chat, `✅ Этот номер уже в Kovrix.\n\n🆔 ID: ${copy(found.id)}\nВходите со своим паролем. Забыли — «☰ Ещё» → «🔑 Новый код».`);
    return home(chat);
  }
  const name = String(from?.first_name || from?.username || 'Игрок').slice(0, 40);
  // пришёл по ссылке-приглашению друга
  const ref = await db('GET', `botSeen/ref/${chat}`).catch(() => null);
  const inviter = ref ? users.find((u) => String(u.id) === String(ref)) : null;
  const { user, code } = await createClient(chat, phone, name, inviter ? String(inviter.id) : undefined);
  log(`зарегистрирован в боте ${user.name} (ID ${user.id})${inviter ? `, пригласил ID ${inviter.id}` : ''}`);
  if (ref) await db('DELETE', `botSeen/ref/${chat}`).catch(() => {});
  if (inviter) {
    const link = (await links(true))[inviter.uid];
    if (link?.chat) send(link.chat, `🎉 По вашей ссылке пришёл ${esc(user.name)}!`);
  }
  await send(chat,
    `✅ <b>Вы в Kovrix!</b>\n\n🆔 ID: ${copy(user.id)}\n🔑 Код: ${copy(code)}\n\n` +
    'Вход в приложение и на сайт — ID и код (нажмите, чтобы скопировать). Заказывайте кнопкой «🎮 Заказать».');
  return home(chat);
}

const STATUS = { new: '⏳', done: '✅', rejected: '❌', sold: '🤝' };

async function profile(chat, edit) {
  const me = await whoIs(chat);
  if (!me) return regAsk(chat);
  const u = me.user;
  const invited = Object.keys((await db('GET', `invites/${u.id}`).catch(() => null)) ?? {}).length;
  const role = me.role === 'admin' ? '👑 админ' : me.role === 'deputy' ? '🛡 заместитель' : '🎮 игрок';
  return screen(chat,
    `<b>👤 ${esc(u.name)}</b>${u.nick ? ` · @${esc(u.nick)}` : ''} · ${role}\n\n` +
    `🆔 ${copy(u.id)} · ${FLAGS[u.country] ?? '🌍'} ${u.phone ? copy(u.phone) : '—'}\n` +
    `📅 С нами с ${u.createdAt ? day(u.createdAt) : '—'} · 👥 друзей: ${invited}`,
    [
      [btn('🔑 Новый код', 'code'), btn('🌐 Сайт без пароля', 'site')],
      [btn('📦 Заказы', 'orders'), BACK[0]],
    ], edit);
}

async function orders(chat, edit) {
  const me = await whoIs(chat);
  if (!me) return regAsk(chat);
  const [own, lots] = await Promise.all([db('GET', `orders/${me.uid}`), db('GET', `listings/${me.uid}`)]);
  const items = [
    ...Object.values(own ?? {}).map((x) => ({ at: x.createdAt, line: `${STATUS[x.status] ?? x.status} · <b>${esc(x.code)}</b> · ${esc(x.item)} · ${esc(x.total ?? x.price)} ${esc(x.currency ?? 'TJS')}` })),
    ...Object.values(lots ?? {}).map((x) => ({ at: x.createdAt, line: `${STATUS[x.status] ?? x.status} · <b>${esc(x.code)}</b> · 🛒 ${esc(x.title)} · ${esc(x.price)} смн` })),
  ].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  const text = items.length
    ? `<b>📦 Мои заказы</b> · ${Math.min(items.length, LAST_ORDERS)} из ${items.length}\n\n${items.slice(0, LAST_ORDERS).map((x) => x.line).join('\n')}`
    : '<b>📦 Мои заказы</b>\n\nПока пусто. Закажите — статус придёт сюда.';
  return screen(chat, text, [[app('🎮 Новый заказ'), btn('🔄', 'orders')], BACK], edit);
}

async function invite(chat, edit) {
  const me = await whoIs(chat);
  if (!me) return regAsk(chat);
  const link = `${SITE}/user/#/r/${me.user.id}`;
  const [friends, rule] = await Promise.all([db('GET', `invites/${me.user.id}`).catch(() => null), db('GET', 'config/referral').catch(() => null)]);
  const total = Object.keys(friends ?? {}).length;
  const reward = rule?.need > 0
    ? `🎁 Награда: <b>${esc(rule.reward)}</b> за каждых ${rule.need} друзей. До следующей осталось: <b>${rule.need - (total % rule.need)}</b>.`
    : '🎁 Награды за друзей скоро появятся.';
  const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Донать в игры через Kovrix — быстро и надёжно 💎')}`;
  return screen(chat,
    `<b>👥 Пригласи друга</b>\n\nОтправьте другу эту ссылку — откроется регистрация с вашим ID:\n${copy(link)}\n\n👥 Уже пришли: <b>${total}</b>\n${reward}`,
    [[url('📤 Поделиться ссылкой', share)], [btn('🔄 Обновить', 'invite'), BACK[0]]], edit);
}

async function download(chat, edit) {
  const me = await whoIs(chat).catch(() => null);
  const rows = [[btn('🤖 Android', 'dl:android'), btn('🍏 iPhone', 'dl:iphone'), btn('💻 ПК', 'dl:desktop')]];
  if (me?.staff) rows.push([btn('🛠 KovriX A (команда)', 'dl:staff')]);
  rows.push(BACK);
  return screen(chat, '<b>📲 Приложение Kovrix</b>\n\n🤖 Android — файл APK прямо сюда\n🍏 iPhone и 💻 ПК — сайт, ставить ничего не нужно', rows, edit);
}

async function platform(chat, kind, edit) {
  const back = [btn('⬅️ Назад', 'download')];
  if (kind === 'iphone') {
    return screen(chat, '<b>🍏 Kovrix на iPhone</b>\n\n1. Откройте сайт кнопкой ниже в Safari\n2. «Поделиться» ⬆️ → «На экран „Домой“»\n3. Kovrix появится среди приложений', [[url('🌐 Открыть сайт', `${SITE}/`)], back], edit);
  }
  if (kind === 'desktop') {
    return screen(chat, '<b>💻 Kovrix на Windows и Mac</b>\n\nKovrix работает в браузере — устанавливать ничего не нужно. В Chrome можно нажать «Установить» в адресной строке.', [[url('🌐 Открыть сайт', `${SITE}/`)], back], edit);
  }
  if (kind === 'staff') {
    const me = await whoIs(chat);
    if (!me?.staff) return send(chat, 'Это приложение — только для команды Kovrix.');
    await sendApp(chat, 'staff');
    return send(chat, 'На iPhone, Windows и Mac KovriX A открывается в браузере.', markup([[url('🛠 Открыть KovriX A', `${SITE}/admin/`)]]));
  }
  return sendApp(chat, 'user');
}

// Файл загружается в Telegram один раз; дальше бот пересылает его
// по номеру, который вернул Telegram (botSeen/files).
async function sendApp(chat, kind) {
  const { file, name } = FILES[kind];
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    stat = null;
  }
  if (!stat || stat.size > MAX_FILE) {
    if (stat) log(`${name}: файл больше 50 МБ — Telegram его не примет. Соберите заново: npm run apk:release`);
    return send(chat, 'Файл приложения сейчас недоступен. Kovrix работает и в браузере — откройте сайт.', markup([[url('🌐 Открыть сайт', SITE + (kind === 'staff' ? '/admin/' : '/'))]]));
  }
  const stamp = `${stat.size}-${Math.round(stat.mtimeMs)}`;
  const caption = kind === 'staff'
    ? '🛠 <b>KovriX A</b> для Android — приложение админа и заместителей.\nОткройте файл → «Установить».'
    : `📲 <b>Kovrix</b> для Android · ${(stat.size / 1048576).toFixed(0)} МБ\nОткройте файл → «Установить». Если телефон спросит — разрешите установку из Telegram. Ставится поверх старой версии, вход сохранится.`;
  const saved = await db('GET', `botSeen/files/${kind}`).catch(() => null);
  if (saved?.stamp === stamp) {
    try {
      const sent = await tg('sendDocument', { chat_id: chat, document: saved.id, caption, parse_mode: 'HTML' });
      countDownload(chat, kind);
      return sent;
    } catch (e) {
      log('файл придётся загрузить заново:', e.message);
    }
  }
  await tg('sendChatAction', { chat_id: chat, action: 'upload_document' }).catch(() => {});
  await send(chat, '⏳ Отправляю файл, это займёт около минуты…');
  const form = new FormData();
  form.append('chat_id', String(chat));
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  form.append('document', await fs.openAsBlob(file), name);
  let message;
  try {
    message = await tg('sendDocument', form);
  } catch (e) {
    // загрузка большого файла иногда обрывается — клиенту даём сайт
    if (kind !== 'staff') await send(chat, 'Файл не загрузился — сеть оборвалась. Попробуйте ещё раз через минуту, а пока Kovrix работает в браузере.', markup([[url('🌐 Открыть сайт', `${SITE}/`)], [btn('🔁 Ещё раз', 'dl:android')]]));
    throw e;
  }
  await db('PUT', `botSeen/files/${kind}`, { id: message.document.file_id, stamp });
  countDownload(chat, kind);
  return message;
}

// ——— подарки ———

// как PAY_METHODS в src/shared/config.ts
const PAY_NAMES = [['alif', 'Алиф'], ['visa', 'Visa'], ['eskhata', 'Эсхата']]; // , ['dcity', 'DCity'], ['mastercard', 'Mastercard'], ['dc', 'DC Bank']
// кто сейчас пишет, сколько звёзд подарить
const askingStars = new Set();

function gift(chat, edit) {
  return screen(chat,
    '<b>🎁 Подарок Kovrix</b>\n\nСпасибо, что поддерживаете нас! Звёзды Telegram или перевод на карту.',
    [
      [btn('⭐ 10', 'gift:10'), btn('⭐ 50', 'gift:50'), btn('⭐ 100', 'gift:100'), btn('⭐ 500', 'gift:500')],
      [btn('✏️ Своё число', 'gift:other'), btn('💳 На карту', 'gift:card')],
      BACK,
    ], edit);
}

async function card(chat, edit) {
  const pay = (await db('GET', 'config/pay')) ?? {};
  const lines = PAY_NAMES.filter(([key]) => pay[key]).map(([key, name]) => `<b>${esc(name)}</b>: ${copy(pay[key])}`);
  const text = lines.length
    ? `<b>💳 Перевод на карту</b>\n\n${lines.join('\n')}\n\nНажмите на номер — он скопируется. Спасибо! 🎁`
    : '<b>💳 Перевод на карту</b>\n\nРеквизиты пока не указаны — напишите в поддержку в приложении.';
  return screen(chat, text, [[btn('⬅️ Назад', 'gift')]], edit);
}

// счёт в звёздах: Telegram сам покажет окно оплаты
async function starsInvoice(chat, stars) {
  if (!Number.isInteger(stars) || stars < 1 || stars > MAX_GIFT_STARS) {
    return send(chat, `Напишите целое число звёзд — от 1 до ${MAX_GIFT_STARS}.`);
  }
  askingStars.delete(chat);
  return tg('sendInvoice', {
    chat_id: chat,
    title: `Подарок Kovrix: ${stars} ⭐`,
    description: `Подарок проекту Kovrix — ${stars} звёзд Telegram. Спасибо за поддержку!`,
    payload: `gift|${stars}|${Date.now()}`,
    currency: 'XTR',
    prices: [{ label: `${stars} ⭐`, amount: stars }],
  });
}

async function starsPaid(chat, payment, from) {
  const charge = payment.telegram_payment_charge_id;
  const me = await whoIs(chat).catch(() => null);
  const who = me ? `${me.user.name} (ID ${me.user.id})` : `${from.first_name ?? ''} @${from.username ?? '—'} (не зарегистрирован)`;
  await db('PUT', `botSeen/stars/${safe(charge)}`, { chat, uid: me?.uid ?? null, gift: true, somoni: 0, stars: payment.total_amount, at: Date.now() });
  await send(chat, `💛 Спасибо за подарок: <b>${payment.total_amount} ⭐</b>!\nЧек: ${copy(charge)}`, markup([BACK]));
  const text = `🎁 Подарок звёздами: <b>${payment.total_amount} ⭐</b>\nОт: ${esc(who)}\nЧек: ${copy(charge)}`;
  await Promise.all((await staffChats()).map((staff) => send(staff, text)));
  log('подарок звёздами:', payment.total_amount, '⭐,', who);
}

// ——— промокоды ———
// Код создаёт админ («Акции» → «Промокоды»), клиент вводит его при заказе
// в приложении или на сайте. Бот только показывает, что код даёт.
// Ссылка для каналов: t.me/<бот>?start=promo_<КОД>
const GAME_NAMES = { free_fire: 'Free Fire' };
const codeKey = (text) => String(text ?? '').toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g, '').slice(0, 20);
// кто сейчас пишет промокод
const askingCode = new Set();

// действующие промокоды дня (codes/<КОД> с daily: true, создаёт rotateDaily)
async function dailyCodes() {
  const all = (await db('GET', 'codes')) ?? {};
  return Object.entries(all).filter(([, c]) => c.daily && c.until > Date.now()).map(([code, c]) => ({ code, ...c }));
}

// «110 💎 — 9 смн (было 10)»: цены по коду рядом с обычными
async function dailyText(daily) {
  const all = await shop().catch(() => []);
  const lines = Object.entries(daily.prices ?? {}).map(([title, price]) => {
    const p = all.find((x) => x.title === title && x.game.id === daily.game);
    return `${esc(p?.short ?? title)} — <b>${price}</b> смн${p && p.price > price ? ` <s>${p.price}</s>` : ''}`;
  });
  // до какого числа: «до 23:59 29.10»
  const end = new Date((daily.until ?? Date.now()) + TJ_MS);
  const date = `${String(end.getUTCDate()).padStart(2, '0')}.${String(end.getUTCMonth() + 1).padStart(2, '0')}`;
  const gift = lines.length ? lines.join('\n') : `Скидка <b>${daily.percent}%</b> на всё`;
  return `🏷 <b>Промокод ${esc(GAME_NAMES[daily.game] ?? daily.game ?? '')}</b>: ${copy(daily.code)}\n` +
    `⏳ До 23:59 ${date} · один раз на аккаунт · нажмите на код — он скопируется\n\n${gift}\n\n` +
    'Как применить: «Оформить заказ» → поле «Промокод» → «Применить».';
}

async function promoAsk(chat, edit) {
  askingCode.add(chat);
  const [codes, sub] = await Promise.all([dailyCodes().catch(() => []), db('GET', `botSeen/subs/${chat}`).catch(() => null)]);
  const texts = await Promise.all(codes.map(dailyText));
  const bell = sub?.off ? btn('🔔 Присылать промокод', 'sub:on') : btn('🔕 Не присылать', 'sub:off');
  return screen(chat,
    `${texts.length ? texts.join('\n\n') : '<b>🏷 Промокод</b>\n\nПромокода дня сейчас нет — бот пришлёт его, как только появится.'}\n\n` +
    '✏️ Есть свой код? Напишите его сюда — покажу, что он даёт.',
    [[btn(KB.gems, 'cat:gems'), btn(KB.voucher, 'cat:voucher'), btn(KB.pass, 'cat:pass')], [bell, BACK[0]]], edit);
}

// ——— рассылка промокода ———
// Каждый, кто писал боту, — в botSeen/subs/<чат> ({ at, off }). Раз в день
// (PROMO_EVERY=week в bot/.env — по понедельникам) в PROMO_HOUR по Душанбе
// бот присылает действующий промокод дня. «🔕 Не присылать» — off: true.
const PROMO_HOUR = Number(process.env.PROMO_HOUR || env.PROMO_HOUR || 10);
const PROMO_WEEKLY = (process.env.PROMO_EVERY || env.PROMO_EVERY) === 'week';
const subscribed = new Set();

function subscribe(chat) {
  if (subscribed.has(chat)) return;
  subscribed.add(chat);
  db('GET', `botSeen/subs/${chat}`)
    .then((sub) => sub ?? db('PUT', `botSeen/subs/${chat}`, { at: Date.now() }))
    .catch(() => subscribed.delete(chat));
}

async function setSub(chat, on, edit) {
  await db('PATCH', `botSeen/subs/${chat}`, { off: !on, at: Date.now() });
  await send(chat, on ? '🔔 Буду присылать промокод дня.' : '🔕 Хорошо, промокоды больше не пришлю. Включить — «🏷 Промокод».');
  return promoAsk(chat, edit);
}

async function promoBroadcast() {
  const local = new Date(Date.now() + TJ_MS);
  if (local.getUTCHours() < PROMO_HOUR) return;
  if (PROMO_WEEKLY && local.getUTCDay() !== 1) return;
  const today = tjDay();
  if ((await db('GET', 'botSeen/promoSent')) === today) return;
  const codes = await dailyCodes();
  if (!codes.length) return;
  // сначала отметка — при сбое не разошлём дважды
  await db('PUT', 'botSeen/promoSent', today);
  const [subs, all] = await Promise.all([db('GET', 'botSeen/subs'), links(true)]);
  const chats = new Set([...Object.keys(subs ?? {}).map(Number), ...Object.values(all).map((l) => l.chat)]);
  for (const [chat, sub] of Object.entries(subs ?? {})) if (sub.off) chats.delete(Number(chat));
  const text = (await Promise.all(codes.map(dailyText))).join('\n\n');
  const extra = markup([[btn(KB.gems, 'cat:gems'), btn(KB.voucher, 'cat:voucher'), btn(KB.pass, 'cat:pass')], [btn('🔕 Не присылать', 'sub:off')]]);
  let sent = 0;
  for (const chat of chats) {
    if (!chat) continue;
    if (await send(chat, text, extra)) sent++;
    await sleep(60);
  }
  log(`промокод дня разослан: ${sent} из ${chats.size}`);
}

async function promoCheck(chat, text) {
  askingCode.delete(chat);
  const key = codeKey(text);
  const code = key ? await db('GET', `codes/${key}`) : null;
  const live = code && (!code.until || code.until > Date.now());
  if (!live) {
    return send(chat, code ? `⌛ Срок промокода ${esc(key)} закончился.` : `❌ Промокода ${esc(key)} нет. Проверьте буквы.`, markup([[btn('🏷 Ввести другой', 'promo')], BACK]));
  }
  const game = GAME_NAMES[code.game] ?? (code.game ? code.game : 'все игры');
  const what = code.product
    ? `${esc(code.product)} — <b>${code.price} смн</b>`
    : code.prices
    ? `скидочные цены:\n${Object.entries(code.prices).map(([item, price]) => `• ${esc(item)} — <b>${price} смн</b>`).join('\n')}`
    : `скидка <b>${code.percent}%</b>`;
  const until = code.until ? `\n⏳ Действует до ${new Date(code.until).toLocaleDateString('ru-RU')}` : '';
  return send(chat,
    `<b>🏷 Промокод ${copy(key)}</b>\n\n🎮 ${esc(game)}: ${what}${until}\n\n` +
    'Как применить: откройте Kovrix → игра → выберите товар → поле «Промокод» → «Применить». Цена пересчитается сама.',
    markup([[app('🎮 Открыть Kovrix')], BACK]));
}

// ——— цены ———
// Товары — из web/shared/data.js (npm run web собирает его из games.ts),
// цены — как в приложении: config/prices/<игра> поверх цен по умолчанию,
// плюс товары, добавленные админом (config/products). Цена 0 — товар скрыт.
// Смотреть может каждый, без регистрации.

// группа, значок и короткое имя товара: «110 алмазов» → «110 💎»
const PRICE_GROUPS = [
  ['gems', '💎 Алмазы', /алмаз/i, (t) => t.replace(/\s*алмаз\S*/i, ' 💎')],
  ['voucher', '🎟 Ваучеры', /ваучер/i, (t) => `🎟 ${t.replace(/^ваучер\s+(на\s+)?/i, '').replace(/^неделю/i, 'Неделя').replace(/^месяц/i, 'Месяц')}`],
  ['pass', '🎫 Пропуск прокачки', /пропуск/i, (t) => `🎫 ${t.replace(/^пропуск\s+(прокачки\s+)?/i, '')}`],
  ['other', '🛒 Другое', /./, (t) => t],
];

function shopGames() {
  try {
    const source = fs.readFileSync(path.join(__dirname, '../web/shared/data.js'), 'utf8');
    return JSON.parse(source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1)).games.filter((g) => !g.off);
  } catch (e) {
    log('цены: нет web/shared/data.js —', e.message);
    return [];
  }
}

// Все пакеты с ценами: { game, i, title, price, group, short, label }.
// i — номер в том же списке, что на сайте (priced): по нему сайт
// открывает заказ с уже выбранным пакетом.
async function shop() {
  const [own, added] = await Promise.all([db('GET', 'config/prices'), db('GET', 'config/products')]).catch(() => [null, null]);
  return shopGames().flatMap((game) => [
    ...game.products.map((p) => ({ ...p, price: own?.[game.id]?.products?.[game.products.indexOf(p)] ?? p.price })),
    ...Object.values(added?.[game.id] ?? {}),
  ].filter((p) => p.price > 0).map((p, i) => {
    const [group, , , short] = PRICE_GROUPS.find(([, , test]) => test.test(p.title));
    return { game, i, title: p.title, price: p.price, group, short: short(p.title), label: `${short(p.title)} — ${p.price} смн` };
  }));
}

// заказ на сайте внутри Telegram: ?pack= понимает и старая версия сайта
// (просто откроет игру), новая — сразу выбирает пакет
const orderUrl = (p) => `/user/?pack=${p.i}#/game/${p.game.id}/${p.i}`;

async function prices(chat, edit) {
  const all = await shop();
  const rows = [];
  for (const [group] of PRICE_GROUPS) {
    const mine = all.filter((p) => p.group === group);
    for (let k = 0; k < mine.length; k += 3) rows.push(mine.slice(k, k + 3).map((p) => app(`${p.short} · ${p.price}`, orderUrl(p))));
  }
  const games = [...new Set(all.map((p) => p.game.name))];
  const text = rows.length
    ? `<b>💰 Цены</b> · ${esc(games.join(', '))}\n\nЦены в сомони. 💎 — алмазы, 🎟 — ваучеры, 🎫 — пропуск прокачки.\n👇 <b>Нажмите на пакет</b> — откроется заказ, пакет уже выбран.\n🏷 По промокоду — дешевле.`
    : '<b>💰 Цены</b>\n\nЦены скоро появятся.';
  return screen(chat, text, [...rows, [btn('🏷 Промокод', 'promo'), BACK[0]]], edit);
}

// Кнопка «💎 Алмазы» и т. п.: меню снизу превращается в пакеты с ценами
const CAT_TITLES = { gems: '💎 Сколько алмазов?', voucher: '🎟 Какой ваучер?', pass: '🎫 Какой пропуск прокачки?' };
async function category(chat, group) {
  const mine = (await shop()).filter((p) => p.group === group);
  if (!mine.length) return send(chat, 'Здесь пока пусто — цены скоро появятся.');
  const rows = [];
  for (let k = 0; k < mine.length; k += 2) rows.push(mine.slice(k, k + 2).map((p) => key(p.label)));
  rows.push([key(KB.back), key(KB.prices)]);
  const sent = await send(chat,
    `<b>${CAT_TITLES[group] ?? 'Выберите товар'}</b> · ${esc(mine[0].game.name)}\n\nВыберите внизу 👇 Цены в сомони.`,
    { reply_markup: { keyboard: rows, resize_keyboard: true, is_persistent: true, input_field_placeholder: 'Выберите пакет ⬇️' } });
  if (sent) {
    keyboards[chat] = PACKS_KIND;
    saveKeyboards();
  }
}

// выбрали пакет в меню снизу — карточка с кнопкой оформления
async function pack(chat, label) {
  const p = (await shop()).find((x) => x.label === label);
  if (!p) return category(chat, PRICE_GROUPS.find(([, , test]) => test.test(label))?.[0] ?? 'gems');
  const me = await whoIs(chat).catch(() => null);
  return screen(chat,
    `<b>${esc(p.title)}</b> · ${esc(p.game.name)}\n💰 Цена: <b>${p.price} смн</b>\n\n` +
    (me ? 'Нажмите «Оформить» — впишите Player ID, оплатите и приложите чек.' : 'Нажмите «Оформить». Аккаунта нет? «📝 Регистрация» — одна кнопка.'),
    me
      ? [[app('🛒 Оформить заказ', orderUrl(p))], [btn('🏷 Промокод', 'promo')]]
      : [[app('🛒 Оформить заказ', orderUrl(p))], [btn('📝 Регистрация', 'reg'), btn('🏷 Промокод', 'promo')]]);
}

// ——— отзывы ———
// botSeen/reviews/<чат> = { name, stars, text, at, uid }: один отзыв на
// человека, новый заменяет старый. Оставить может каждый, удалить — команда.

const REVIEWS_PAGE = 5;
const MAX_REVIEW = 300;
// кто сейчас пишет отзыв: чат → сколько звёзд поставил
const askingReview = new Map();
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

async function reviews(chat, edit, page = 0) {
  const [all, me] = await Promise.all([db('GET', 'botSeen/reviews'), whoIs(chat).catch(() => null)]);
  const list = Object.entries(all ?? {}).map(([key, r]) => ({ key, ...r })).sort((a, b) => b.at - a.at);
  if (!list.length) {
    return screen(chat, '<b>⭐ Отзывы</b>\n\nОтзывов пока нет — будьте первым!', [[btn('✍️ Оставить отзыв', 'rv:new')], BACK], edit);
  }
  const avg = list.reduce((sum, r) => sum + r.stars, 0) / list.length;
  const pages = Math.ceil(list.length / REVIEWS_PAGE);
  page = Math.min(Math.max(page, 0), pages - 1);
  const shown = list.slice(page * REVIEWS_PAGE, (page + 1) * REVIEWS_PAGE);
  const lines = shown.map((r) => `${stars(r.stars)} <b>${esc(r.name)}</b> · ${day(r.at)}${r.text ? `\n<i>${esc(r.text)}</i>` : ''}`);
  const rows = [[btn('✍️ Оставить отзыв', 'rv:new')]];
  if (pages > 1) rows.push([btn('◀️', `rv:p${(page - 1 + pages) % pages}`), btn(`${page + 1} / ${pages}`, `rv:p${page}`), btn('▶️', `rv:p${(page + 1) % pages}`)]);
  if (me?.staff) rows.push(shown.map((r, i) => btn(`🗑 ${page * REVIEWS_PAGE + i + 1}`, `rv:d${r.key}`)));
  rows.push(BACK);
  return screen(chat,
    `<b>⭐ Отзывы</b> · ${avg.toFixed(1)} из 5 · ${list.length} шт.\n\n${lines.join('\n\n')}`,
    rows, edit);
}

function reviewAsk(chat, edit) {
  return screen(chat, '<b>✍️ Ваш отзыв</b>\n\nОцените Kovrix:',
    [[1, 2, 3, 4, 5].map((n) => btn(`${n}⭐`, `rv:s${n}`)), [btn('⬅️ Назад', 'reviews')]], edit);
}

function reviewText(chat, n, edit) {
  askingReview.set(chat, n);
  return screen(chat, `<b>✍️ Ваш отзыв</b> · ${stars(n)}\n\nНапишите пару слов одним сообщением — или сохраните без текста.`,
    [[btn('✅ Без текста', 'rv:save'), btn('✖️ Отмена', 'reviews')]], edit);
}

async function reviewSave(chat, text, from) {
  const n = askingReview.get(chat);
  askingReview.delete(chat);
  if (!n) return reviews(chat);
  const me = await whoIs(chat).catch(() => null);
  const name = String(me?.user.name || from?.first_name || from?.username || 'Игрок').slice(0, 40);
  const review = { name, stars: n, text: String(text ?? '').trim().slice(0, MAX_REVIEW), at: Date.now(), uid: me?.uid ?? null };
  await db('PUT', `botSeen/reviews/${chat}`, review);
  log(`отзыв ${n}★ от ${name}`);
  const note = `⭐ <b>Новый отзыв</b> ${stars(n)}\n${esc(name)}${me ? ` (ID ${copy(me.user.id)})` : ''}${review.text ? `: <i>${esc(review.text)}</i>` : ''}`;
  Promise.all((await staffChats().catch(() => [])).filter((c) => c !== chat).map((c) => send(c, note)));
  await send(chat, '💛 Спасибо за отзыв!');
  return reviews(chat);
}

async function reviewDelete(chat, key, edit) {
  const me = await whoIs(chat);
  if (!me?.staff) return reviews(chat, edit);
  await db('DELETE', `botSeen/reviews/${safe(key)}`);
  log(`отзыв ${key} удалил ${me.user.name}`);
  return reviews(chat, edit);
}

// ——— поддержка ———
// Сообщение из бота уходит в тот же чат поддержки, что и в приложении
// (chats/support_<uid>), от имени клиента — по его ключу восстановления.
// Ответ команды бот присылает сюда (см. check()).

const askingSupport = new Set();
// текст, который человек написал просто так: «отправить в поддержку?»
const supportDrafts = new Map();

// пропуск клиента по его ключу восстановления
async function clientToken(uid) {
  const key = await db('GET', `recovery/${uid}`);
  if (!key) return null;
  const res = await fetch(`${TOKEN_URL}?key=${FIREBASE_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(key)}`,
  });
  const fresh = await res.json();
  if (!res.ok) throw new Error(fresh.error?.message ?? String(res.status));
  return fresh.id_token;
}

async function support(chat, edit) {
  const me = await whoIs(chat).catch(() => null);
  if (!me) {
    return screen(chat,
      '<b>💬 Поддержка</b>\n\nЧтобы мы могли ответить, зарегистрируйтесь — одна кнопка, по номеру Telegram.',
      [[btn('📝 Регистрация', 'reg'), btn('❓ Помощь', 'help')], BACK], edit);
  }
  if (me.staff) return screen(chat, '<b>💬 Поддержка</b>\n\nЧаты клиентов — в KovriX A.', [[app('🛠 KovriX A', '/admin/')], BACK], edit);
  askingSupport.add(chat);
  return screen(chat,
    '<b>💬 Поддержка</b>\n\nНапишите вопрос одним сообщением — ответ придёт сюда. Про заказ — укажите его номер.',
    [[btn('❓ Частые вопросы', 'help'), app('💬 Чат в приложении')], BACK], edit);
}

async function supportSend(chat, text) {
  askingSupport.delete(chat);
  const me = await whoIs(chat);
  if (!me) return support(chat);
  const as = await clientToken(me.uid).catch((e) => log(`поддержка: пропуск ID ${me.user.id} не получен:`, e.message));
  if (!as) {
    return send(chat, 'Отсюда пока не отправить — откройте чат поддержки в приложении (Профиль → Поддержка). После входа в приложение заработает и здесь.', markup([[app('💬 Открыть чат')]]));
  }
  const id = `support_${me.uid}`;
  const at = Date.now();
  const message = { from: me.uid, name: me.user.name, text: text.slice(0, 1000), at };
  const patch = { last: message.text.slice(0, 80), updatedAt: at };
  if (!(await db('GET', `userChats/${me.uid}/${id}`, undefined, as))) {
    const chatInfo = { id, kind: 'support', title: 'Поддержка', a: me.uid, b: 'staff', aName: `${me.user.name} · ID ${me.user.id}`, bName: 'Kovrix · поддержка', updatedAt: at };
    await db('PUT', `chats/${id}/meta`, { a: me.uid, b: 'staff', kind: 'support', title: 'Поддержка' }, as).catch(() => {});
    await db('PUT', `userChats/${me.uid}/${id}`, chatInfo, as);
    await db('PUT', `userChats/staff/${id}`, chatInfo, as);
  }
  await db('POST', `chats/${id}/messages`, message, as);
  await Promise.all([
    db('PATCH', `userChats/${me.uid}/${id}`, { ...patch, unread: false }, as),
    db('PATCH', `userChats/staff/${id}`, { ...patch, unread: true }, as),
  ]);
  log(`поддержка: сообщение от ${me.user.name} (ID ${me.user.id})`);
  return send(chat, '✅ Отправлено в поддержку. Ответ придёт сюда.', markup([[btn('✍️ Написать ещё', 'support')]]));
}

// ——— помощь ———

function help(chat, edit) {
  return screen(chat,
    '<b>❓ Помощь</b>\n\n' +
    '<b>Как начать?</b> «📝 Регистрация» → «Отправить мой номер» — бот выдаст ID и код.\n' +
    '<b>Как войти?</b> Приложение или сайт → «Вход» → ID и код.\n' +
    '<b>Забыл код?</b> «☰ Ещё» → «🔑 Новый код».\n' +
    '<b>Как заказать?</b> «🎮 Заказать» → игра и товар → оплата и чек. Как команда проверит — бот напишет.\n' +
    '<b>Продать аккаунт?</b> В приложении: «Аккаунты» → «Продать».\n' +
    '<b>Вопрос?</b> «💬 Поддержка».',
    [[btn('💬 Поддержка', 'support'), url('🔒 Конфиденциальность', `${SITE}/privacy.html`)], BACK], edit);
}

// ——— команда ———

async function staffScreen(chat, edit) {
  const me = await whoIs(chat);
  if (!me?.staff) return home(chat, edit);
  const [users, all, ...lists] = await Promise.all([db('GET', 'users'), links(true), ...Object.keys(KINDS).map((kind) => db('GET', kind))]);
  const pending = Object.keys(KINDS).map((kind, i) => {
    const count = Object.values(lists[i] ?? {}).flatMap((own) => Object.values(own)).filter((x) => x.status === 'new').length;
    return `${KINDS[kind].icon} ${KINDS[kind].title}: <b>${count}</b>`;
  });
  const midnight = new Date().setHours(0, 0, 0, 0);
  const today = Object.values(lists[0] ?? {}).flatMap((own) => Object.values(own)).filter((x) => x.status === 'done' && (x.decidedAt ?? 0) >= midnight);
  const sum = today.reduce((total, x) => total + (Number(x.price) || 0), 0);
  return screen(chat,
    `<b>🛠 Команда Kovrix</b>\n\n<b>Ждут проверки:</b>\n${pending.join('\n')}\n\n` +
    `<b>Сегодня:</b> донатов выполнено ${today.length} на ${sum} смн\n` +
    `<b>Клиентов:</b> ${Object.keys(users ?? {}).length}, с Telegram — ${Object.keys(all).length}\n\n` +
    (me.role === 'admin' ? '📸 Пришлите сюда фото с подписью — это пост к следующему обновлению приложения.' : ''),
    [[app('🛠 Открыть KovriX A', '/admin/')], [btn('📲 APK KovriX A', 'dl:staff'), btn('🔄 Обновить', 'staff')], BACK], edit);
}

// ——— обновления ———

const GRADLE = path.join(__dirname, '../android/app/build.gradle');

function projectVersion() {
  try {
    const text = fs.readFileSync(GRADLE, 'utf8');
    const code = Number(text.match(/versionCode\s+(\d+)/)[1]);
    const name = text.match(/versionName\s+"([^"]+)"/)[1];
    return { code, name, changed: fs.statSync(GRADLE).mtimeMs };
  } catch {
    return null;
  }
}

let checkedApk = '';
// если база не приняла запись — повтор не сразу
let retryUpdateAt = 0;
// после сборки APK бот ждёт фото от админа, потом объявляет и без него
const PHOTO_WAIT_MS = 30 * 60000;
const startedAt = Date.now();

const updateCaption = (name, news, staff) =>
  `<b>🔄 Вышло обновление Kovrix ${esc(name)}!</b>${news ? `\n\n${esc(news)}` : ''}\n\nФайл — ниже${staff ? ' (KovriX A — «🛠 Команда» → «APK KovriX A»)' : ''}. Установите поверх старой версии: вход и заказы сохранятся.`;

// пост к следующему обновлению: фото с подписью от админа (botSeen/updatePost)
async function saveUpdatePost(chat, message) {
  const me = await whoIs(chat);
  if (me?.role !== 'admin') {
    return send(chat, 'Фото сюда присылать не нужно — чек к заказу прикладывается в приложении Kovrix.', markup([[app('🎮 Открыть Kovrix')]]));
  }
  const photo = message.photo.at(-1).file_id;
  const caption = (message.caption ?? '').trim().slice(0, 700);
  await db('PUT', 'botSeen/updatePost', { photo, caption, at: Date.now() });
  await tg('sendPhoto', { chat_id: chat, photo, caption: updateCaption('X.X', caption, false), parse_mode: 'HTML' });
  await send(chat, '✅ Сохранил — так увидят клиенты. Если новая версия уже собрана, рассылка уходит сейчас; если нет — вместе с файлом после следующей сборки. Другое фото — просто пришлите новое.');
  return announceUpdate(true);
}

// Новый APK в builds/ с версией старше объявленной: приложения узнают
// о ней из config/version, подключившие Telegram получают сообщение и файл.
// force — админ только что прислал фото: объявить, не дожидаясь паузы
async function announceUpdate(force = false) {
  let stat;
  try {
    stat = fs.statSync(FILES.user.file);
  } catch {
    return;
  }
  const stamp = `${stat.size}-${Math.round(stat.mtimeMs)}`;
  if (stamp === checkedApk || (!force && Date.now() < retryUpdateAt)) return;
  const version = projectVersion();
  // версию уже подняли, а APK ещё старый — ждём сборку
  if (!version || stat.size > MAX_FILE || stat.mtimeMs < version.changed) return;
  const told = await db('GET', 'botSeen/update');
  if (told?.code >= version.code) {
    checkedApk = stamp;
    return;
  }
  const post = await db('GET', 'botSeen/updatePost');
  if (!force && !post && Date.now() < Math.max(stat.mtimeMs, startedAt) + PHOTO_WAIT_MS) return;
  retryUpdateAt = Date.now() + 10 * 60000;
  await db('PUT', 'config/version', { code: version.code, name: version.name }).catch((e) => log('версия в базе не записана:', e.message));
  checkedApk = stamp;
  await db('PUT', 'botSeen/update', { code: version.code, at: Date.now() });
  const [all, roles] = await Promise.all([links(true), db('GET', 'roles')]);
  const chats = Object.entries(all);
  log(`обновление ${version.name}: сообщаю ${chats.length} чатам`);
  // фото: присланное админом (file_id), файл в проекте (post.file) или фон «update»
  const pic = banner('update');
  let photo = post?.photo ?? pic?.id;
  const file = post?.file ? path.join(__dirname, '..', post.file) : pic?.file;
  for (const [uid, { chat }] of chats) {
    const caption = updateCaption(version.name, post?.caption, ['admin', 'deputy'].includes(roles?.[uid]));
    const fields = { chat_id: chat, caption, parse_mode: 'HTML', ...markup([[app('🎮 Открыть Kovrix')]]) };
    if (photo) await tg('sendPhoto', { ...fields, photo }).catch((e) => log('не отправлено:', e.message));
    else if (file) {
      const sent = await tgForm('sendPhoto', fields, { photo: file }).catch((e) => log('не отправлено:', e.message));
      photo = sent?.photo?.at(-1)?.file_id;
      if (!post?.file) rememberBanner('update', pic.stamp, sent);
    } else await send(chat, caption);
    await sendApp(chat, 'user').catch((e) => log('файл не отправлен:', e.message));
    await sleep(60);
  }
  // фото было к этой версии — к следующей админ пришлёт новое
  if (post) await db('DELETE', 'botSeen/updatePost');
}

// Новости админа (news/<ключ>): каждую ещё не разосланную свежую новость
// бот отправляет во все подключённые чаты и записывает, скольким дошла
async function sendNews() {
  const news = await db('GET', 'news');
  for (const [key, item] of Object.entries(news ?? {})) {
    if (item.sent !== undefined || !item.text) continue;
    // сначала отметка, чтобы при сбое не разослать дважды;
    // старые новости (бот долго был выключен) не рассылаем
    await db('PUT', `news/${key}/sent`, 0);
    if (Date.now() - item.at > 864e5) continue;
    const chats = [...new Set(Object.values(await links(true)).map((link) => link.chat).filter(Boolean))];
    const pic = banner('news');
    let photo = pic?.id;
    let sent = 0;
    for (const chat of chats) {
      const fields = { chat_id: chat, caption: `<b>📢 Новости Kovrix</b>\n\n${esc(item.text).slice(0, 950)}`, parse_mode: 'HTML', ...markup([[app('🎮 Открыть Kovrix')]]) };
      const message = await (photo ? tg('sendPhoto', { ...fields, photo }) : pic ? tgForm('sendPhoto', fields, { photo: pic.file }) : tg('sendMessage', { ...fields, text: fields.caption }))
        .catch((e) => log('не отправлено:', e.message));
      if (message) sent++;
      if (!photo && pic && message) {
        rememberBanner('news', pic.stamp, message);
        photo = message.photo?.at(-1)?.file_id;
      }
      await sleep(60);
    }
    await db('PUT', `news/${key}/sent`, sent);
    log(`новость разослана: ${sent} из ${chats.length}`);
  }
}

// ——— сообщения о заявках и чатах ———

const KINDS = {
  orders: {
    icon: '💎', title: 'Донаты',
    name: (x) => `Заказ <b>${esc(x.code)}</b>: ${esc(x.item)}`,
    fresh: (x) => `🆕 <b>Новый донат ${esc(x.code)}</b>\n${esc(x.item)} · ${esc(x.total ?? x.price)} ${esc(x.currency ?? 'TJS')} · ${esc(x.pay ?? '')}\nКлиент: ${esc(x.client?.name)} (ID ${copy(x.client?.id)})`,
    done: 'донат зачислен ✅',
  },
  listings: {
    icon: '🛒', title: 'Аккаунты',
    name: (x) => `Аккаунт <b>${esc(x.code)}</b>: ${esc(x.title)}`,
    fresh: (x) => `🆕 <b>Аккаунт на продажу ${esc(x.code)}</b>\n${esc(x.title)} · ${esc(x.price)} смн\nПродавец: ${esc(x.client?.name)} (ID ${copy(x.client?.id)})`,
    done: 'принят и выставлен на витрину ✅',
    sold: 'продажа подтверждена, аккаунт снят с витрины 🤝',
  },
  sales: {
    icon: '🤝', title: 'Продажи',
    name: (x) => `Продажа <b>${esc(x.code)}</b>`,
    fresh: (x) => `🆕 <b>Продавец сообщил о продаже ${esc(x.code)}</b>\n${esc(x.title)} · ${esc(x.price)} смн — проверьте чек\nПродавец: ${esc(x.client?.name)} (ID ${copy(x.client?.id)})`,
    done: 'подтверждена ✅',
  },
  claims: {
    icon: '🎁', title: 'Награды',
    name: (x) => `Задание «${esc(x.title)}»`,
    fresh: (x) => `🆕 <b>Заявка на награду:</b> ${esc(x.title)}\n${esc(x.client?.name)} (ID ${copy(x.client?.id)}): ${esc(x.proof)}`,
    done: 'награда выдана 🎁',
  },
};

const TO_CLIENT = markup([[app('🎮 Открыть Kovrix')], [btn('📦 Мои заказы', 'orders')]]);
const TO_STAFF = markup([[app('🛠 Открыть KovriX A', '/admin/')]]);

async function check() {
  const [seen, all, roles, chats, ...lists] = await Promise.all([
    db('GET', 'botSeen/items'),
    links(true),
    db('GET', 'roles'),
    db('GET', 'userChats'),
    ...Object.keys(KINDS).map((kind) => db('GET', kind)),
  ]);
  // первый запуск: старые заявки запоминаем молча, чтобы не засыпать сообщениями
  const first = seen === null;
  const known = seen ?? {};
  const changed = {};
  const chatOf = (uid) => all[uid]?.chat;
  const staff = Object.entries(roles ?? {})
    .filter(([, role]) => role === 'admin' || role === 'deputy')
    .map(([uid]) => chatOf(uid))
    .filter(Boolean);
  const toStaff = (text) => Promise.all(staff.map((chat) => send(chat, text, TO_STAFF)));

  Object.keys(KINDS).forEach((kind, i) => {
    for (const [uid, items] of Object.entries(lists[i] ?? {})) {
      for (const [key, item] of Object.entries(items)) {
        const id = safe(`${kind}|${uid}|${key}`);
        if (known[id] === item.status) continue;
        changed[id] = item.status;
        if (first) continue;
        const about = KINDS[kind];
        if (item.status === 'new') {
          toStaff(about.fresh(item));
        } else if (chatOf(uid)) {
          const result = item.status === 'rejected' ? 'отклонено ❌' : about[item.status] ?? item.status;
          send(chatOf(uid), `${about.name(item)} — ${result}${item.note ? `\n\n💬 Ответ: ${esc(item.note)}` : ''}`, TO_CLIENT);
        }
      }
    }
  });

  for (const [owner, own] of Object.entries(chats ?? {})) {
    for (const [key, chat] of Object.entries(own)) {
      const id = safe(`chat|${owner}|${key}`);
      if (!chat.unread || known[id] === chat.updatedAt) continue;
      changed[id] = chat.updatedAt;
      if (first) continue;
      const from = owner === chat.a ? chat.bName : chat.aName;
      const text = `💬 <b>${esc(chat.title)}</b>\n${esc(from)}: ${esc(chat.last ?? '')}`;
      if (owner === 'staff') toStaff(text);
      else if (chatOf(owner)) send(chatOf(owner), text, markup([[app('💬 Ответить')]]));
    }
  }

  if (first || Object.keys(changed).length) {
    await db('PATCH', 'botSeen/items', { ...changed, _started: Date.now() });
  }
}

// «Kovrix скачали N человек» на главной приложения: каждый чат, получивший
// APK, считается один раз (botSeen/downloads), рядом — число аккаунтов
function countDownload(chat, kind) {
  if (kind === 'staff') return;
  db('PUT', `botSeen/downloads/${chat}`, Date.now()).catch((e) => log('скачивание не записано:', e.message));
}

let statsAt = 0;
async function writeStats() {
  if (Date.now() < statsAt + 10 * 60000) return;
  statsAt = Date.now();
  const [users, downloads] = await Promise.all([db('GET', 'users'), db('GET', 'botSeen/downloads')]);
  await db('PUT', 'config/stats', { users: Object.keys(users ?? {}).length, downloads: Object.keys(downloads ?? {}).length, at: Date.now() });
}

// ——— курсы валют ———
// Каждые 6 часов бот берёт курс сомони с open.er-api.com (без ключа)
// и пишет config/rates: сколько рублей, тенге и долларов в одном сомони.
let ratesAt = 0;
async function updateRates() {
  if (Date.now() < ratesAt + 6 * 3600000) return;
  ratesAt = Date.now();
  const res = await fetch('https://open.er-api.com/v6/latest/TJS', { signal: AbortSignal.timeout(NET_MS) });
  const data = await res.json();
  if (data.result !== 'success') throw new Error(data['error-type'] || 'нет курса');
  const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;
  const rates = { RUB: round(data.rates.RUB, 2), KZT: round(data.rates.KZT, 1), USD: round(data.rates.USD, 4) };
  if (!(rates.RUB > 0 && rates.KZT > 0 && rates.USD > 0)) throw new Error('странный курс');
  await db('PUT', 'config/rates', rates);
  log('курсы', JSON.stringify(rates));
}

// ——— промокод на два дня ———
// Коды от админа (28.10.2026): каждый действует два дня по Душанбе и один
// раз на аккаунт (once — usedCodes/<uid>/<код>), потом следующий; после
// последнего — снова первый. Скидка — цены промокода дня, если админ их
// задал (daily/free_fire/prices, «Акции» → «Промокод дня»), иначе PROMO_PERCENT.
const TJ_MS = 5 * 3600000;
const tjDay = (at = Date.now()) => new Date(at + TJ_MS).toISOString().slice(0, 10);
const PROMO_LIST = ['DONIX10', 'FIREMAX', 'GAMERX', 'DIAMOND', 'FREEGIFT', 'VIPSTAR', 'LUCKYGO', 'DARKFOX', 'PROPLAY', 'MEGABONUS'];
const PROMO_START = '2026-10-28';
const PROMO_DAYS = 2;
const PROMO_PERCENT = 10;
const PROMO_GAME = 'free_fire';

async function rotateDaily() {
  const today = tjDay();
  const n = Math.floor((Date.parse(today) - Date.parse(PROMO_START)) / 864e5 / PROMO_DAYS);
  if (n < 0) return;
  const code = PROMO_LIST[n % PROMO_LIST.length];
  const state = (await db('GET', 'botSeen/promoCode')) ?? {};
  if (state.code === code && state.period === n) return;
  // конец второго дня по Душанбе
  const until = Date.parse(`${PROMO_START}T00:00:00Z`) + (n + 1) * PROMO_DAYS * 864e5 - TJ_MS - 1;
  const daily = await db('GET', `daily/${PROMO_GAME}`).catch(() => null);
  const prices = Object.keys(daily?.prices ?? {}).length ? daily.prices : null;
  await db('PUT', `codes/${code}`, { game: PROMO_GAME, ...(prices ? { prices } : { percent: PROMO_PERCENT }), until, daily: true, once: true });
  if (state.code && state.code !== code) await db('DELETE', `codes/${state.code}`).catch(() => {});
  await db('PUT', 'botSeen/promoCode', { code, period: n, until });
  await db('PATCH', `daily/${PROMO_GAME}`, { code, day: today }).catch(() => {});
  log('промокод', code, 'до', new Date(until + TJ_MS).toISOString().slice(0, 16));
  const text = await dailyText({ code, game: PROMO_GAME, prices, percent: PROMO_PERCENT, until });
  await Promise.all((await staffChats()).map((staff) => send(staff, text).catch(() => {})));
}

// одна и та же ошибка — в журнал не чаще раза в час
const quietSeen = {};
function quietLog(what, ...args) {
  if (Date.now() - (quietSeen[what] ?? 0) < 3600000) return;
  quietSeen[what] = Date.now();
  log(...args);
}

async function watch() {
  for (;;) {
    await check().catch((e) => log('проверка не удалась:', e.message));
    await announceUpdate().catch((e) => log('обновление не объявлено:', e.message));
    await sendNews().catch((e) => log('новость не разослана:', e.message));
    await writeStats().catch((e) => log('счётчик не записан:', e.message));
    await updateRates().catch((e) => quietLog('rates', 'курсы не обновлены:', e.message));
    await rotateDaily().catch((e) => quietLog('daily', 'промокод дня не сменён:', e.message));
    await promoBroadcast().catch((e) => quietLog('promo', 'промокод дня не разослан:', e.message));
    await sleep(CHECK_MS);
  }
}

// ——— разговор ———

// одно действие — и для кнопки под экраном, и для команды, и для старых
// кнопок клавиатуры у тех, кто не обновил чат
async function act(chat, action, edit, from) {
  if (action.startsWith('gift:')) {
    const what = action.slice(5);
    if (what === 'card') return card(chat, edit);
    if (what === 'other') {
      askingStars.add(chat);
      return send(chat, '✏️ Сколько звёзд подарить? Напишите число, например 75.');
    }
    return starsInvoice(chat, Number(what));
  }
  if (action.startsWith('dl:')) return platform(chat, action.slice(3), edit);
  if (action.startsWith('cat:')) return category(chat, action.slice(4));
  if (action.startsWith('rv:')) {
    const what = action.slice(3);
    if (what === 'new') return reviewAsk(chat, edit);
    if (what === 'save') return reviewSave(chat, '', from);
    if (what[0] === 's') return reviewText(chat, Math.min(5, Math.max(1, Number(what.slice(1)) || 5)), edit);
    if (what[0] === 'p') return reviews(chat, edit, Number(what.slice(1)) || 0);
    if (what[0] === 'd') return reviewDelete(chat, what.slice(1), edit);
  }
  if (action === 'sup:send') {
    const draft = supportDrafts.get(chat);
    supportDrafts.delete(chat);
    if (edit) tg('deleteMessage', { chat_id: chat, message_id: edit }).catch(() => {});
    return draft ? supportSend(chat, draft) : support(chat);
  }
  switch (action) {
    case 'home': return home(chat, edit);
    case 'reg': return regAsk(chat);
    case 'more': return more(chat, edit);
    case 'games': return games(chat, edit);
    case 'info': return info(chat).catch((e) => { log('ролик не отправлен:', e.message); return send(chat, 'Не получилось отправить ролик — попробуйте ещё раз.'); });
    case 'reviews': return reviews(chat, edit);
    case 'support': return support(chat, edit);
    case 'profile': return profile(chat, edit);
    case 'orders': return orders(chat, edit);
    case 'invite': return invite(chat, edit);
    case 'download': return download(chat, edit);
    case 'gift': return gift(chat, edit);
    case 'help': return help(chat, edit);
    case 'promo': return promoAsk(chat, edit);
    case 'sub:on': return setSub(chat, true, edit);
    case 'sub:off': return setSub(chat, false, edit);
    case 'prices': return prices(chat, edit);
    case 'staff': return staffScreen(chat, edit);
    case 'code': return newCode(chat);
    case 'site': return siteLink(chat);
    case 'id': {
      const me = await whoIs(chat);
      return me ? send(chat, `🆔 Ваш ID в Kovrix: ${copy(me.user.id)}`) : regAsk(chat);
    }
    case 'privacy':
      return send(chat, '🔒 Политика конфиденциальности Kovrix: какие данные мы собираем (имя, телефон, ID Telegram, заказы), зачем и как их удалить.', markup([[url('🔒 Открыть политику', `${SITE}/privacy.html`)]]));
    case 'paysupport':
      return send(chat, 'Вопрос по подарку звёздами? Нажмите «💬 Поддержка» и укажите номер чека из сообщения.', markup([[btn('💬 Поддержка', 'support')]]));
    default: return home(chat, edit);
  }
}

const MENU_TEXTS = new Set(Object.values(KB));
// кнопка меню или пакет из меню пакетов («110 💎 — 10 смн»)
const PACK_RE = / — \d+(\.\d+)? смн$/;
const isMenu = (text) => MENU_TEXTS.has(text) || PACK_RE.test(text);
const COMMANDS = {
  '/register': 'reg', '/profile': 'profile', '/orders': 'orders', '/code': 'code', '/site': 'site',
  '/download': 'download', '/update': 'dl:android', '/invite': 'invite', '/gift': 'gift', '/pay': 'gift',
  '/help': 'help', '/promo': 'promo', '/prices': 'prices', '/price': 'prices', '/support': 'support', '/reviews': 'reviews', '/more': 'more', '/games': 'games', '/info': 'info', '/about': 'info',
  // меню снизу
  [KB.prices]: 'prices', [KB.reg]: 'reg', [KB.orders]: 'orders', [KB.profile]: 'profile', [KB.reviews]: 'reviews',
  [KB.support]: 'support', [KB.more]: 'more', [KB.gift]: 'gift', [KB.back]: 'home', [KB.promo]: 'promo',
  [KB.gems]: 'cat:gems', [KB.voucher]: 'cat:voucher', [KB.pass]: 'cat:pass',
  // меню прошлой версии
  '🎮 Заказать': 'cat:gems', '/privacy': 'privacy', '/paysupport': 'paysupport', '/id': 'id', '/staff': 'staff',
  // кнопки старой клавиатуры
  '📝 Регистрация': 'reg', '🔑 Новый код': 'code', '🆔 Мой ID': 'profile', '📲 Скачать приложение': 'download',
  '🔄 Обновить': 'dl:android', '🌐 Войти на сайт': 'site', '🤖 Android': 'dl:android', '🍏 iPhone': 'dl:iphone',
  '💻 Windows / Mac': 'dl:desktop', '🛠 KovriX A — для команды': 'dl:staff', '🎁 Подарить': 'gift', '💳 Оплата': 'gift',
  '⭐ Звёзды Telegram': 'gift', '💳 Алиф / Mastercard': 'gift:card', '⬅️ Назад': 'home', '✖️ Отмена': 'home',
};

async function onMessage(message) {
  const chat = message.chat.id;
  if (message.chat.type !== 'private') return;
  const text = (message.text ?? '').trim();
  log(`← ${chat} ${message.from?.first_name ?? ''}: ${message.contact ? '[номер]' : message.photo ? '[фото]' : text.slice(0, 40)}`);
  subscribe(chat);

  if (message.successful_payment) return starsPaid(chat, message.successful_payment, message.from);
  if (message.photo) return saveUpdatePost(chat, message);
  if (askingStars.has(chat) && /^\d+$/.test(text)) return starsInvoice(chat, Number(text));
  askingStars.delete(chat);
  // /promo КОД или ответ на «Напишите промокод»
  const promoArg = text.match(/^\/promo(?:@\w+)?\s+(\S+)/)?.[1];
  if (promoArg) return promoCheck(chat, promoArg);
  if (askingCode.has(chat) && text && !text.startsWith('/') && !isMenu(text)) return promoCheck(chat, text);
  askingCode.delete(chat);
  if (askingReview.has(chat) && text && !text.startsWith('/') && !isMenu(text)) return reviewSave(chat, text, message.from);
  askingReview.delete(chat);
  if (askingSupport.has(chat) && text && !text.startsWith('/') && !isMenu(text)) return supportSend(chat, text);
  askingSupport.delete(chat);

  if (message.contact) {
    // чужой контакт из записной книжки не подходит
    if (message.contact.user_id !== message.from.id) return send(chat, 'Нужен ваш собственный номер — нажмите «📱 Отправить мой номер».', ASK_CONTACT);
    const phone = digits(message.contact.phone_number);
    const uid = await db('GET', `botSeen/pending/${chat}`);
    if (uid) {
      await db('DELETE', `botSeen/pending/${chat}`);
      return confirmPhone(chat, uid, phone);
    }
    return register(chat, phone, message.from);
  }

  if (text.startsWith('/start')) {
    const arg = text.split(/\s+/)[1] ?? '';
    // из профиля в приложении: /start <ключ аккаунта>
    if (/^[A-Za-z0-9]{10,40}$/.test(arg)) {
      await db('PUT', `botSeen/pending/${chat}`, arg);
      return send(chat, '📱 Чтобы подтвердить номер в Kovrix, нажмите внизу «Отправить мой номер».', ASK_CONTACT);
    }
    await db('DELETE', `botSeen/pending/${chat}`);
    // ссылка-приглашение друга: ref<ID пригласившего>
    const invited = arg.match(/^ref(\d{6})$/);
    if (invited) {
      if (await whoIs(chat)) {
        await send(chat, 'Вы уже в Kovrix — приглашение работает только для новых игроков. Позовите своих друзей! 👇', markup([[btn('👥 Пригласить друга', 'invite')]]));
        return;
      }
      await db('PUT', `botSeen/ref/${chat}`, invited[1]);
      await send(chat, '👋 Вас пригласил друг!');
      return regAsk(chat);
    }
    // кнопки приложения: регистрация и «вышло обновление»
    if (arg === 'reg') return regAsk(chat);
    if (arg === 'prices') return prices(chat);
    if (arg.startsWith('promo_')) return promoCheck(chat, arg.slice(6));
    if (arg === 'update') return sendApp(chat, 'user');
    if (arg === 'updateA') return platform(chat, 'staff');
    // обычный /start — сначала заставка, потом меню
    await intro(chat).catch((e) => log('заставка не отправлена:', e.message));
    return home(chat);
  }

  if (PACK_RE.test(text)) {
    tg('deleteMessage', { chat_id: chat, message_id: message.message_id }).catch(() => {});
    return pack(chat, text);
  }
  const command = COMMANDS[text] ?? (text.startsWith('/') ? COMMANDS[text.split(/[\s@]/)[0]] : undefined);
  // кнопка меню: её текст в чате не нужен — экран заменит его
  if (MENU_TEXTS.has(text)) tg('deleteMessage', { chat_id: chat, message_id: message.message_id }).catch(() => {});
  else await ensureMenu(chat);
  if (command) return act(chat, command, undefined, message.from);
  // просто текст от клиента — предложить отправить в поддержку
  if (text && !text.startsWith('/') && (await whoIs(chat).catch(() => null))?.staff === false) {
    supportDrafts.set(chat, text);
    return send(chat, '💬 Отправить это сообщение в поддержку?', markup([[btn('✅ Отправить', 'sup:send'), btn('✖️ Нет', 'home')]]));
  }
  return home(chat);
}

async function onCallback(query) {
  const chat = query.message?.chat.id;
  if (!chat) return tg('answerCallbackQuery', { callback_query_id: query.id });
  // сначала гасим «часики» на кнопке, потом работаем
  const wait = query.data === 'dl:android' || query.data === 'dl:staff' ? '📲 Отправляю файл…' : undefined;
  await tg('answerCallbackQuery', { callback_query_id: query.id, text: wait }).catch(() => {});
  log(`← ${chat} ${query.from?.first_name ?? ''}: [${query.data}]`);
  subscribe(chat);
  await ensureMenu(chat);
  return act(chat, query.data ?? 'home', query.message.message_id, query.from);
}

const fail = (chat, e) => {
  log('ошибка:', e.message);
  // база Firebase отключена — говорим честно, а не «попробуйте через минуту»
  if (/deactivated/i.test(e.message)) return send(chat, '⚠️ Kovrix временно не работает — идут технические работы. Мы напишем здесь, как только всё заработает.');
  return send(chat, '😕 Не получилось — попробуйте ещё раз через минуту.', markup([BACK]));
};

// Каждый чат — своя очередь: долгая отправка APK одному не тормозит других,
// а нажатия одного человека выполняются по порядку
const lanes = new Map();
function lane(chat, job) {
  const next = (lanes.get(chat) ?? Promise.resolve()).then(job);
  lanes.set(chat, next);
  next.finally(() => lanes.get(chat) === next && lanes.delete(chat));
}

async function listen() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await tg('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query', 'pre_checkout_query'] });
      for (const update of updates) {
        offset = update.update_id + 1;
        // перед списанием звёзд Telegram спрашивает, готов ли бот принять оплату
        if (update.pre_checkout_query) {
          await tg('answerPreCheckoutQuery', { pre_checkout_query_id: update.pre_checkout_query.id, ok: true }).catch((e) => log('оплата не подтверждена:', e.message));
        } else if (update.callback_query) {
          const chat = update.callback_query.message?.chat.id;
          lane(chat, () => onCallback(update.callback_query).catch((e) => fail(chat, e)));
        } else if (update.message) {
          const chat = update.message.chat.id;
          lane(chat, () => onMessage(update.message).catch((e) => fail(chat, e)));
        }
      }
    } catch (e) {
      log('Telegram недоступен:', e.message);
      // «Conflict»: этим же токеном бот запущен ещё где-то
      await sleep(/Conflict/.test(e.message) ? 30000 : 5000);
    }
  }
}

// ——— профиль бота ———
// Имя, описания, команды и аватарка ставятся сами при запуске.
// Русский — для всех, таджикский (tg) и английский (en) — по языку Telegram.
const COMMAND_KEYS = ['start', 'info', 'prices', 'games', 'register', 'support', 'reviews', 'profile', 'orders', 'code', 'site', 'download', 'invite', 'promo', 'gift', 'help', 'privacy', 'paysupport'];
const PROFILE = {
  '': {
    short: 'Kovrix — донат в игры и продажа аккаунтов. Быстро, безопасно, 24/7.',
    about: '💎 Kovrix — донат в игры: алмазы Free Fire и другие.\n\n' +
      '📱 Приложение для Android и сайт для iPhone и компьютера\n' +
      '🛒 Покупка и продажа игровых аккаунтов\n' +
      '🔔 Статус заказа — прямо здесь\n\n' +
      'Нажмите «Старт» 👇',
    open: 'Kovrix',
    commands: ['Главное меню', 'О Kovrix — видео', 'Цены', 'Мини-игры', 'Регистрация', 'Поддержка', 'Отзывы', 'Мой профиль', 'Мои заказы', 'Новый код', 'Войти на сайт', 'Скачать приложение', 'Пригласить друга', 'Промокод', 'Подарить звёзды', 'Помощь', 'Политика конфиденциальности', 'Помощь с подарком'],
  },
  tg: {
    short: 'Kovrix — донат ба бозиҳо ва фурӯши аккаунтҳо. Зуд, бехатар, 24/7.',
    about: '💎 Kovrix — донат ба бозиҳо: алмазҳои Free Fire ва дигарон.\n\n' +
      '📱 Барнома барои Android ва сайт барои iPhone ва компютер\n' +
      '🛒 Харид ва фурӯши аккаунтҳои бозӣ\n' +
      '🔔 Ҳолати фармоиш — дар ҳамин ҷо\n\n' +
      '«Старт»-ро пахш кунед 👇',
    open: 'Kovrix',
    commands: ['Менюи асосӣ', 'Дар бораи Kovrix — видео', 'Нархҳо', 'Бозиҳои хурд', 'Бақайдгирӣ', 'Дастгирӣ', 'Фикру мулоҳизаҳо', 'Профили ман', 'Фармоишҳои ман', 'Коди нав', 'Ворид ба сайт', 'Боргирии барнома', 'Даъвати дӯст', 'Промокод', 'Тӯҳфаи ситораҳо', 'Кӯмак', 'Сиёсати махфият', 'Кӯмак бо тӯҳфа'],
  },
  en: {
    short: 'Kovrix — game top-ups and game accounts marketplace. Fast, safe, 24/7.',
    about: '💎 Kovrix — game top-ups: Free Fire diamonds and more.\n\n' +
      '📱 Android app, plus a website for iPhone and computers\n' +
      '🛒 Buy and sell game accounts\n' +
      '🔔 Order status right here\n\n' +
      'Tap “Start” 👇',
    open: 'Kovrix',
    commands: ['Main menu', 'About Kovrix — video', 'Prices', 'Mini-games', 'Sign up', 'Support', 'Reviews', 'My profile', 'My orders', 'New code', 'Open the website', 'Download the app', 'Invite a friend', 'Promo code', 'Gift stars', 'Help', 'Privacy policy', 'Help with a gift'],
  },
};
const AVATAR = path.join(__dirname, 'avatar.jpg');
// какая аватарка уже стоит у какого бота: «id бота:хеш файла»
const AVATAR_SENT = path.join(__dirname, '.avatar-sent');

async function setupProfile() {
  const quiet = (method, body) => tg(method, body).catch((e) => log('профиль:', e.message));
  for (const [lang, p] of Object.entries(PROFILE)) {
    const language_code = lang || undefined;
    await quiet('setMyName', { name: 'Kovrix', language_code });
    await quiet('setMyShortDescription', { short_description: p.short, language_code });
    await quiet('setMyDescription', { description: p.about, language_code });
    await quiet('setMyCommands', { commands: COMMAND_KEYS.map((command, i) => ({ command, description: p.commands[i] })), language_code });
  }
  // кнопка слева от поля ввода открывает сайт прямо в Telegram
  await quiet('setChatMenuButton', { menu_button: { type: 'web_app', text: PROFILE[''].open, web_app: { url: `${SITE}/user/` } } });
  // аватарку ставим один раз: каждая новая загрузка остаётся в истории фото бота
  if (!fs.existsSync(AVATAR)) return;
  const photo = fs.readFileSync(AVATAR);
  const mark = `${bot.id}:${crypto.createHash('sha1').update(photo).digest('hex')}`;
  if (fs.existsSync(AVATAR_SENT) && fs.readFileSync(AVATAR_SENT, 'utf8').trim() === mark) return;
  const form = new FormData();
  form.append('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }));
  form.append('avatar', new Blob([photo], { type: 'image/jpeg' }), 'avatar.jpg');
  if (await quiet('setMyProfilePhoto', form)) fs.writeFileSync(AVATAR_SENT, mark);
}

let bot = { id: 0, username: 'Kovrixtj_bot' };

(async () => {
  bot = await tg('getMe', {});
  // вебхук мешает getUpdates — бот работает опросом
  await tg('deleteWebhook', {}).catch(() => {});
  await token().catch((e) => log(e.message));
  await setupProfile();
  log(`Бот @${bot.username} запущен. Остановить — Ctrl+C.`);
  listen();
  watch();
  // бот команды (KovriX A) — в этом же процессе, если задан его токен
  const adminToken = process.env.ADMIN_TOKEN || env.ADMIN_TOKEN;
  if (adminToken) require('./admin').start({ token: adminToken, db, auth, TOKEN_URL, FIREBASE_KEY, SITE, log, sleep, esc, copy });
  // на бесплатном Render бот — web-сервис: отвечает на HTTP, чтобы его
  // можно было будить пингом (иначе через 15 минут без запросов он засыпает)
  if (process.env.PORT) require('http').createServer((req, res) => res.end('ok')).listen(Number(process.env.PORT));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
