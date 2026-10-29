'use strict';
// Бот команды Kovrix (KovriX A). Работает в том же процессе, что и
// клиентский бот (bot/bot.js), если в bot/.env есть ADMIN_TOKEN.
//
// Как устроен:
//   • Вход — ник и пароль сотрудника из KovriX A, одним сообщением. Бот
//     сразу стирает это сообщение и хранит только ключ входа (refresh token)
//     в bot/.staff.json. Права те же, что в приложении: решения пишутся от
//     имени сотрудника и проверяются правилами базы.
//   • Новые заявки (донаты, аккаунты, продажи, награды) приходят карточкой
//     с кнопками «Принять» / «Отклонить» и фото чека; сообщения в чат
//     поддержки — с кнопкой «Ответить здесь» (или ответом Reply на
//     уведомление): ответ уходит клиенту от имени Kovrix, как из KovriX A.
//   • Меню: сколько заявок ждёт, статистика за сегодня, KovriX A.

const fs = require('fs');
const path = require('path');

const CHECK_MS = 20000;
// попыток входа на один чат за LOGIN_WINDOW_MS
const LOGIN_TRIES = 5;
const LOGIN_WINDOW_MS = 10 * 60000;
const STAFF_FILE = path.join(__dirname, '.staff.json');
const SEEN_FILE = path.join(__dirname, '.admin-seen.json');

// заявки: короткая буква для кнопок (у них лимит 64 байта), право в KovriX A
const KINDS = {
  orders: { short: 'o', perm: 'orders', icon: '💎', title: 'Донаты' },
  listings: { short: 'l', perm: 'accounts', icon: '🛒', title: 'Аккаунты' },
  sales: { short: 's', perm: 'accounts', icon: '🤝', title: 'Продажи' },
  claims: { short: 'c', perm: 'claims', icon: '🎁', title: 'Награды' },
};
const BY_SHORT = Object.fromEntries(Object.entries(KINDS).map(([kind, k]) => [k.short, kind]));
// права, включённые заместителю по умолчанию (PERMS в src/shared/config.ts)
const DEFAULT_PERMS = { orders: true, accounts: true, chats: true, claims: true };

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
};
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 });

exports.start = function start({ token: TOKEN, db, auth, TOKEN_URL, FIREBASE_KEY, SITE, log, sleep, esc, copy }) {
  const markup = (rows) => ({ reply_markup: { inline_keyboard: rows } });
  const btn = (text, data) => ({ text, callback_data: data });
  const panel = (text = '🛠 Открыть KovriX A') => ({ text, web_app: { url: `${SITE}/admin/` } });
  const MENU = [btn('⬅️ Меню', 'menu')];

  // ——— Telegram ———

  async function tg(method, body) {
    const form = body instanceof FormData;
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: 'POST',
      headers: form ? undefined : { 'Content-Type': 'application/json' },
      body: form ? body : JSON.stringify(body),
    });
    const reply = await res.json();
    if (!reply.ok) throw new Error(`Telegram ${method}: ${reply.description}`);
    return reply.result;
  }
  const send = (chat, text, extra) =>
    tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra })
      .catch((e) => log('админ-бот: не отправлено:', e.message));
  // экран меняет то же сообщение, если пришёл с кнопки
  const show = (chat, text, rows, edit) =>
    edit
      ? tg('editMessageText', { chat_id: chat, message_id: edit, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...markup(rows) })
          .catch((e) => (/not modified/.test(e.message) ? null : send(chat, text, markup(rows))))
      : send(chat, text, markup(rows));

  // ——— сотрудники ———

  // chat → { uid, name, role, refresh }
  const staff = readJson(STAFF_FILE);
  const saveStaff = () => writeJson(STAFF_FILE, staff);
  const sessions = new Map();

  // пропуск сотрудника: обменять ключ входа на свежий токен
  async function tokenOf(chat) {
    const me = staff[chat];
    const cached = sessions.get(chat);
    if (cached && cached.until - Date.now() > 60000) return cached.token;
    const res = await fetch(`${TOKEN_URL}?key=${FIREBASE_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(me.refresh)}`,
    });
    const reply = await res.json();
    if (!res.ok) {
      // пароль сменили или аккаунт удалили — пусть войдёт заново
      const reason = reply.error?.message ?? String(res.status);
      if (/TOKEN_EXPIRED|USER_NOT_FOUND|USER_DISABLED|INVALID_REFRESH_TOKEN/.test(reason)) {
        delete staff[chat];
        saveStaff();
        sessions.delete(chat);
        await send(chat, '🔒 Вход в бот команды больше не действует (сменился пароль?). Пришлите ник и пароль заново.');
      }
      throw new Error(`вход сотрудника: ${reason}`);
    }
    if (reply.refresh_token && reply.refresh_token !== me.refresh) {
      me.refresh = reply.refresh_token;
      saveStaff();
    }
    sessions.set(chat, { token: reply.id_token, until: Date.now() + Number(reply.expires_in) * 1000 });
    return reply.id_token;
  }

  // как emailOf в src/shared/api.ts
  const emailOf = (login) =>
    /[a-z]/i.test(login)
      ? `n${login.toLowerCase().replace(/[^a-z0-9_.-]/g, '')}@donix.example.com`
      : /^\d{6}$/.test(login)
      ? `i${login}@donix.example.com`
      : `p${login.replace(/\D/g, '')}@donix.example.com`;

  const signIn = (email, password) => auth('signInWithPassword', { email, password, returnSecureToken: true });

  const tries = new Map();
  async function login(chat, message, text) {
    // пароль не должен оставаться в переписке
    tg('deleteMessage', { chat_id: chat, message_id: message.message_id }).catch(() => {});
    const recent = (tries.get(chat) ?? []).filter((at) => Date.now() - at < LOGIN_WINDOW_MS);
    if (recent.length >= LOGIN_TRIES) return send(chat, '⏳ Слишком много попыток. Попробуйте через 10 минут.');
    tries.set(chat, [...recent, Date.now()]);

    const [name, password, code] = text.split(/\s+/);
    if (!name || !password) return askLogin(chat);
    let reply;
    try {
      reply = await signIn(emailOf(name), password);
    } catch {
      // ник мог смениться: nicks/<ник> → почта аккаунта (читается без входа)
      const alias = /[a-z]/i.test(name) ? await db('GET', `nicks/${name.trim().toLowerCase()}`).catch(() => null) : null;
      reply = alias?.email ? await signIn(alias.email, password).catch(() => null) : null;
    }
    if (!reply) return send(chat, '❌ Неверный ник или пароль. Пришлите ещё раз: <code>ник пароль</code>');
    const uid = reply.localId;
    const [role, user] = await Promise.all([db('GET', `roles/${uid}`, undefined, reply.idToken), db('GET', `users/${uid}`, undefined, reply.idToken)]);
    if (role !== 'admin' && role !== 'deputy') return send(chat, '⛔ Этот бот — только для команды Kovrix. Клиентам — @Kovrixtj_bot.');
    // код KovriX A (задаёт владелец): база примет только верный
    const [teamOn, owner] = await Promise.all([db('GET', 'config/teamOn', undefined, reply.idToken), db('GET', `admins/${uid}`, undefined, reply.idToken).catch(() => null)]);
    if (teamOn && !owner) {
      if (!code) return send(chat, '🔐 Нужен код KovriX A (его даёт владелец). Пришлите одним сообщением: <code>ник пароль код</code>');
      try {
        await db('PUT', `unlock/${uid}`, code, reply.idToken);
      } catch {
        return send(chat, '❌ Неверный код KovriX A. Пришлите ещё раз: <code>ник пароль код</code>');
      }
    }
    // один сотрудник — один чат
    for (const [other, s] of Object.entries(staff)) if (s.uid === uid && other !== String(chat)) delete staff[other];
    staff[chat] = { uid, name: user?.name ?? name, role, refresh: reply.refreshToken };
    saveStaff();
    sessions.set(String(chat), { token: reply.idToken, until: Date.now() + Number(reply.expiresIn) * 1000 });
    tries.delete(chat);
    log(`админ-бот: вошёл ${staff[chat].name} (${role})`);
    await send(chat, `✅ Вы вошли как <b>${esc(staff[chat].name)}</b> (${role === 'admin' ? 'админ' : 'заместитель'}). Новые заявки будут приходить сюда.`);
    return menu(chat);
  }

  const askLogin = (chat) =>
    send(chat, '<b>🛠 KovriX A — бот команды</b>\n\nВойдите тем же ником и паролем, что в приложении KovriX A. Пришлите одним сообщением:\n\n<code>ник пароль</code>\n\nЕсли владелец включил код KovriX A — через пробел и его: <code>ник пароль код</code>. Сообщение с паролем бот сразу удалит.');

  // какие заявки видит сотрудник
  let permsCache = { at: 0, value: {} };
  async function allowed(chat, perm) {
    const me = staff[chat];
    if (!me) return false;
    if (me.role === 'admin') return true;
    if (Date.now() - permsCache.at > 60000) permsCache = { at: Date.now(), value: (await db('GET', 'perms').catch(() => null)) ?? {} };
    return (permsCache.value[me.uid] ?? DEFAULT_PERMS)[perm] === true;
  }

  // ——— заявки ———

  const keyOf = (item) => item.task ?? item.code;
  const entries = (byUser) =>
    Object.entries(byUser ?? {}).flatMap(([uid, own]) => Object.entries(own ?? {}).map(([key, item]) => ({ ...item, uid: item.uid ?? uid, key })));

  function cardText(kind, x, all) {
    const who = `${esc(x.client?.name)} · ID ${copy(x.client?.id)}${x.client?.phone ? ` · ${copy(x.client.phone)}` : ''}`;
    const when = new Date(x.createdAt).toLocaleString('ru-RU');
    const lines = [];
    if (kind === 'orders') {
      lines.push(`💎 <b>Донат ${copy(x.code)}</b>`, `${esc(x.game)} · ${esc(x.item)}`);
      lines.push(`💰 <b>${esc(x.total ?? x.price)} ${esc(x.currency ?? 'TJS')}</b>${x.currency && x.currency !== 'TJS' ? ` (${esc(x.price)} смн)` : ''} · ${esc(x.pay ?? x.method ?? '')}`);
      for (const [field, value] of Object.entries(x.fields ?? {})) lines.push(`${esc(field)}: ${copy(value)}`);
      if (x.txn) lines.push(`Номер операции: ${copy(x.txn)}`);
      if (x.promo) lines.push(`Акция: ${esc(x.promo)}`);
      if (x.check) lines.push(`Проверка аккаунта: ${esc(x.check)}`);
      // тот же чек уже был в другом заказе — как предупреждения в KovriX A
      const others = (all ?? []).filter((o) => o.code !== x.code);
      if (x.txn && others.some((o) => o.txn === x.txn)) lines.push('⚠️ <b>Этот номер операции уже был в другом заказе!</b>');
      if (x.receipt && others.some((o) => o.receipt === x.receipt)) lines.push('⚠️ <b>Этот скриншот чека уже присылали!</b>');
    } else if (kind === 'listings') {
      lines.push(`🛒 <b>Аккаунт на продажу ${copy(x.code)}</b>`, `${esc(x.game)} · ${esc(x.title)}`, `💰 <b>${esc(x.price)} смн</b>${x.bargain ? ' · торг' : ''}`);
      for (const [field, value] of Object.entries(x.attrs ?? {})) lines.push(`${esc(field)}: ${esc(value)}`);
      if (x.description) lines.push('', esc(x.description));
    } else if (kind === 'sales') {
      lines.push(`🤝 <b>Продажа ${copy(x.code)}</b>`, `${esc(x.title)} · ${esc(x.price)} смн`, 'Продавец прислал чек — проверьте фото.');
    } else {
      lines.push(`🎁 <b>Награда: ${esc(x.title)}</b>`, `Приз: ${esc(x.reward)}`, `Доказательство: ${esc(x.proof)}`);
    }
    lines.push('', `👤 ${who}`, `🕒 ${when}`);
    if (x.status !== 'new') lines.push('', `${x.status === 'rejected' ? '❌ Отклонено' : '✅ Принято'}${x.decidedBy ? ` — ${esc(x.decidedBy)}` : ''}${x.note ? `\n💬 ${esc(x.note)}` : ''}`);
    return lines.join('\n');
  }

  const ref = (kind, x) => `${KINDS[kind].short}|${x.uid}|${x.key ?? keyOf(x)}`;
  const cardRows = (kind, x) => {
    if (x.status !== 'new') return [[panel()]];
    const rows = [[btn('✅ Принять', `ok|${ref(kind, x)}`), btn('❌ Отклонить', `no|${ref(kind, x)}`)]];
    if (kind !== 'claims') rows.push([btn(kind === 'listings' ? '🖼 Фото' : '🧾 Чек', `ph|${ref(kind, x)}`)]);
    return rows;
  };

  async function load(kind, uid, key) {
    const item = await db('GET', `${kind}/${uid}/${key}`);
    return item && { ...item, uid: item.uid ?? uid, key };
  }

  async function sendCard(chat, kind, x, all) {
    await send(chat, cardText(kind, x, all), markup(cardRows(kind, x)));
  }

  // фото из базы — data:URL (base64) или ссылки
  async function sendPhotos(chat, uid, key) {
    const photos = ((await db('GET', `photos/${uid}/${key}`)) ?? []).filter(Boolean).slice(0, 10);
    if (!photos.length) return send(chat, 'Фото нет.');
    const form = new FormData();
    form.append('chat_id', String(chat));
    form.append('media', JSON.stringify(photos.map((p, i) => ({ type: 'photo', media: /^data:/.test(p) ? `attach://p${i}` : p }))));
    photos.forEach((p, i) => {
      const match = /^data:([^;]+);base64,(.*)$/s.exec(p);
      if (match) form.append(`p${i}`, new Blob([Buffer.from(match[2], 'base64')], { type: match[1] }), `photo${i}.jpg`);
    });
    return tg('sendMediaGroup', form);
  }

  // То же, что decide() в src/shared/api.ts, но от имени сотрудника
  async function decide(chat, kind, item, status, note) {
    const as = await tokenOf(chat);
    const me = staff[chat];
    const put = (method, where, body) => db(method, where, body, as);
    if (status === 'rejected' && kind === 'orders' && item.status === 'done') await put('DELETE', `donations/${item.code}`);
    if (status === 'done' && kind === 'orders') {
      await put('PUT', `donations/${item.code}`, { uid: item.uid, id: item.client.id, name: item.client.name, code: item.code, amount: item.price, at: Date.now() });
    }
    if (status === 'done' && kind === 'listings') {
      const photos = (await put('GET', `photos/${item.uid}/${item.code}`)) ?? [];
      await put('PUT', `marketPhotos/${item.code}`, photos);
      await put('PUT', `market/${item.code}`, {
        code: item.code, uid: item.uid, game: item.game, title: item.title, description: item.description,
        attrs: item.attrs ?? {}, price: item.price, bargain: !!item.bargain,
        seller: { id: item.client.id, name: item.client.name }, photos: photos.length, createdAt: item.createdAt,
      });
    }
    if (status === 'done' && kind === 'sales') {
      await put('DELETE', `market/${item.code}`);
      await put('DELETE', `marketPhotos/${item.code}`);
      await put('PATCH', `listings/${item.uid}/${item.code}`, { status: 'sold' });
    }
    await put('PATCH', `${kind}/${item.uid}/${item.key}`, { status, note, decidedAt: Date.now(), decidedBy: me.name });
    await put('POST', 'history', {
      at: Date.now(), by: me.uid, byName: me.name, kind, code: item.key, status,
      title: item.item ? `${item.item} · ${item.game}` : item.title ?? item.key,
      ...(item.price !== undefined ? { amount: item.price } : {}),
      ...(note ? { note } : {}),
      client: item.client,
    }).catch(() => {});
    log(`админ-бот: ${me.name} — ${kind} ${item.key} → ${status}`);
  }

  // кто сейчас пишет причину отказа: chat → { kind, uid, key, message }
  const rejecting = new Map();

  async function onDecision(chat, action, kind, uid, key, message) {
    if (!(await allowed(chat, KINDS[kind].perm))) return send(chat, '⛔ У вас нет доступа к этому разделу. Права выдаёт админ.');
    const item = await load(kind, uid, key);
    if (!item) return show(chat, 'Заявки больше нет — её удалили.', [MENU], message);
    if (item.status !== 'new') return show(chat, cardText(kind, item), cardRows(kind, item), message);
    if (action === 'ok' && kind === 'orders') {
      // как в KovriX A: сначала убедиться, что деньги пришли
      return show(chat, `${cardText(kind, item)}\n\n❓ <b>Деньги ${esc(item.total ?? item.price)} ${esc(item.currency ?? 'TJS')} точно пришли на счёт?</b>`,
        [[btn('✅ Да, пришли — принять', `OK|${ref(kind, item)}`)], [btn('⬅️ Назад', `cd|${ref(kind, item)}`)]], message);
    }
    if (action === 'ok' || action === 'OK') {
      await decide(chat, kind, item, 'done', '');
      return show(chat, cardText(kind, { ...item, status: 'done', decidedBy: staff[chat].name }), [[panel()]], message);
    }
    if (action === 'cd') return show(chat, cardText(kind, item), cardRows(kind, item), message);
    if (action === 'no') {
      rejecting.set(chat, { kind, uid, key, message });
      return send(chat, `✏️ Напишите клиенту причину отказа (${esc(KINDS[kind].title.toLowerCase())} ${esc(key)}).\nБез причины — отправьте «-».`, markup([[btn('✖️ Не отклонять', 'nocancel')]]));
    }
  }

  async function finishReject(chat, text) {
    const { kind, uid, key, message } = rejecting.get(chat);
    rejecting.delete(chat);
    const item = await load(kind, uid, key);
    if (!item || item.status !== 'new') return send(chat, 'Эту заявку уже решили.');
    const note = text === '-' ? '' : text.slice(0, 500);
    await decide(chat, kind, item, 'rejected', note);
    await show(chat, cardText(kind, { ...item, status: 'rejected', note, decidedBy: staff[chat].name }), [[panel()]], message);
    return send(chat, '❌ Отклонено, клиенту придёт ответ.');
  }

  // ——— чаты поддержки ———

  // кто сейчас пишет ответ клиенту: chat → номер чата поддержки
  const replying = new Map();
  // уведомление о сообщении в Telegram → номер чата (для ответа Reply)
  const notices = new Map();

  const chatRows = (key) => [[btn('✍️ Ответить здесь', `rp|${key}`), btn('📜 Переписка', `hs|${key}`)], [panel('💬 Открыть в KovriX A')]];

  async function askReply(chat, key) {
    if (!(await allowed(chat, 'chats'))) return send(chat, '⛔ У вас нет доступа к чатам. Права выдаёт админ.');
    const c = await db('GET', `userChats/staff/${key}`);
    if (!c) return send(chat, 'Чат не найден.');
    replying.set(chat, key);
    return send(chat, `✍️ Напишите ответ для <b>${esc(c.aName ?? '')}</b> — он придёт клиенту от имени Kovrix.`, markup([[btn('✖️ Не отвечать', 'rpcancel')]]));
  }

  // последние сообщения чата — чтобы ответить по делу
  async function history(chat, key) {
    if (!(await allowed(chat, 'chats'))) return send(chat, '⛔ У вас нет доступа к чатам.');
    const [c, messages] = await Promise.all([db('GET', `userChats/staff/${key}`), db('GET', `chats/${key}/messages`)]);
    if (!c) return send(chat, 'Чат не найден.');
    const last = Object.values(messages ?? {}).sort((x, y) => x.at - y.at).slice(-15);
    const time = (at) => new Date(at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const lines = last.map((m) => `${m.from === c.a ? '👤' : '🛟'} <b>${esc(m.name)}</b> · ${time(m.at)}\n${esc(m.text)}`);
    return send(chat, `📜 <b>${esc(c.title ?? 'Поддержка')} — ${esc(c.aName ?? '')}</b>\n\n${lines.join('\n\n') || 'Сообщений нет.'}`.slice(0, 4000), markup(chatRows(key)));
  }

  // То же, что sendMessage() в src/shared/api.ts — от имени сотрудника
  async function reply(chat, key, text) {
    replying.delete(chat);
    if (!(await allowed(chat, 'chats'))) return send(chat, '⛔ У вас нет доступа к чатам.');
    const as = await tokenOf(chat);
    const c = await db('GET', `userChats/staff/${key}`, undefined, as);
    if (!c) return send(chat, 'Чат не найден.');
    const message = { from: staff[chat].uid, name: 'Kovrix', text: text.slice(0, 1000), at: Date.now(), staff: true };
    await db('POST', `chats/${key}/messages`, message, as);
    const patch = { last: message.text.slice(0, 80), updatedAt: message.at };
    await Promise.all([
      db('PATCH', `userChats/staff/${key}`, { ...patch, unread: false }, as),
      db('PATCH', `userChats/${c.a}/${key}`, { ...patch, unread: true }, as),
    ]);
    // своё же сообщение не должно прийти уведомлением
    seen[`chat|${key}`] = message.at;
    log(`админ-бот: ${staff[chat].name} ответил в ${key}`);
    return send(chat, `✅ Отправлено: <b>${esc(c.aName ?? '')}</b> увидит ответ в приложении и на сайте.`, markup([[btn('📜 Переписка', `hs|${key}`)]]));
  }

  // ——— экраны ———

  async function menu(chat, edit) {
    const me = staff[chat];
    const lists = await Promise.all(Object.keys(KINDS).map((kind) => db('GET', kind)));
    const rows = [];
    const lines = [];
    for (const [i, kind] of Object.keys(KINDS).entries()) {
      if (!(await allowed(chat, KINDS[kind].perm))) continue;
      const count = entries(lists[i]).filter((x) => x.status === 'new').length;
      lines.push(`${KINDS[kind].icon} ${KINDS[kind].title}: <b>${count}</b>`);
      rows.push(btn(`${KINDS[kind].icon} ${KINDS[kind].title} (${count})`, `list|${KINDS[kind].short}`));
    }
    const grid = [];
    for (let i = 0; i < rows.length; i += 2) grid.push(rows.slice(i, i + 2));
    return show(chat,
      `<b>🛠 KovriX A — команда</b>\n${esc(me.name)} · ${me.role === 'admin' ? 'админ' : 'заместитель'}\n\n<b>Ждут проверки:</b>\n${lines.join('\n') || 'нет доступных разделов'}`,
      [...grid, [btn('📊 Сегодня', 'stats'), btn('🔄 Обновить', 'menu')], [panel()], [btn('🚪 Выйти', 'logout')]], edit);
  }

  // все ждущие заявки раздела — карточками, старые сверху
  async function list(chat, kind, edit) {
    if (!(await allowed(chat, KINDS[kind].perm))) return send(chat, '⛔ У вас нет доступа к этому разделу.');
    const all = entries(await db('GET', kind));
    const waiting = all.filter((x) => x.status === 'new').sort((a, b) => a.createdAt - b.createdAt);
    if (!waiting.length) return show(chat, `${KINDS[kind].icon} <b>${KINDS[kind].title}</b>: новых заявок нет 👌`, [MENU], edit);
    await show(chat, `${KINDS[kind].icon} <b>${KINDS[kind].title}</b>: ждут проверки — ${waiting.length}${waiting.length > 10 ? ' (ниже первые 10)' : ''}`, [MENU], edit);
    for (const x of waiting.slice(0, 10)) await sendCard(chat, kind, x, all);
  }

  async function stats(chat, edit) {
    const [orders, users, donations] = await Promise.all([db('GET', 'orders'), db('GET', 'users'), db('GET', 'donations')]);
    const midnight = new Date().setHours(0, 0, 0, 0);
    const all = entries(orders);
    const today = all.filter((x) => x.status === 'done' && (x.decidedAt ?? 0) >= midnight);
    const sum = today.reduce((total, x) => total + (Number(x.price) || 0), 0);
    const fresh = Object.values(users ?? {}).filter((u) => (u.createdAt ?? 0) >= midnight).length;
    const total = Object.values(donations ?? {}).reduce((s, d) => s + (Number(d.amount) || 0), 0);
    return show(chat,
      `<b>📊 Сегодня</b>\n\n💎 Донатов выполнено: <b>${today.length}</b> на <b>${sum} смн</b>\n` +
      `⏳ Ждут проверки: <b>${all.filter((x) => x.status === 'new').length}</b>\n👥 Новых клиентов: <b>${fresh}</b>\n\n` +
      `<b>За всё время</b>\nКлиентов: ${Object.keys(users ?? {}).length}\nЗачислено донатов: ${Object.keys(donations ?? {}).length} на ${total} смн`,
      [[btn('🔄 Обновить', 'stats')], MENU], edit);
  }

  // ——— разговор ———

  async function onMessage(message) {
    const chat = String(message.chat.id);
    if (message.chat.type !== 'private') return;
    const text = (message.text ?? '').trim();
    if (!staff[chat]) {
      if (!text || text.startsWith('/')) return askLogin(chat);
      return login(chat, message, text);
    }
    if (rejecting.has(chat) && text && !text.startsWith('/')) return finishReject(chat, text);
    rejecting.delete(chat);
    // ответ клиенту: после «Ответить здесь» или Reply на уведомление
    const answered = notices.get(`${chat}|${message.reply_to_message?.message_id}`);
    if (text && !text.startsWith('/') && (answered || replying.has(chat))) return reply(chat, answered ?? replying.get(chat), text);
    replying.delete(chat);
    if (text === '/stats') return stats(chat);
    if (text === '/logout') return logout(chat);
    const kind = { '/orders': 'orders', '/listings': 'listings', '/sales': 'sales', '/claims': 'claims' }[text];
    if (kind) return list(chat, kind);
    return menu(chat);
  }

  async function logout(chat, edit) {
    delete staff[chat];
    saveStaff();
    sessions.delete(chat);
    await show(chat, '🚪 Вы вышли. Заявки сюда больше не приходят. Чтобы войти снова — пришлите ник и пароль.', [], edit);
  }

  async function onCallback(query) {
    const chat = String(query.message?.chat.id ?? '');
    await tg('answerCallbackQuery', { callback_query_id: query.id }).catch(() => {});
    if (!chat) return;
    if (!staff[chat]) return askLogin(chat);
    const edit = query.message.message_id;
    const [action, short, uid, key] = (query.data ?? '').split('|');
    if (action === 'menu') return menu(chat, edit);
    if (action === 'stats') return stats(chat, edit);
    if (action === 'logout') return logout(chat, edit);
    if (action === 'list') return list(chat, BY_SHORT[short], edit);
    if (action === 'rp') return askReply(chat, short);
    if (action === 'hs') return history(chat, short);
    if (action === 'rpcancel') {
      replying.delete(chat);
      return show(chat, 'Хорошо, ответ не отправлен.', [MENU], edit);
    }
    if (action === 'nocancel') {
      rejecting.delete(chat);
      return show(chat, 'Хорошо, заявка не отклонена.', [MENU], edit);
    }
    const kind = BY_SHORT[short];
    if (!kind || !uid || !key) return menu(chat);
    if (action === 'ph') return sendPhotos(chat, uid, kind === 'sales' ? (await load(kind, uid, key))?.photo ?? key : key);
    return onDecision(chat, action, kind, uid, key, edit);
  }

  const fail = (chat, e) => {
    log('админ-бот: ошибка:', e.message);
    if (!chat) return;
    if (/Permission denied/.test(e.message)) return send(chat, '⛔ База не разрешила это действие — проверьте свои права в KovriX A.');
    return send(chat, '😕 Не получилось — попробуйте ещё раз через минуту.');
  };

  async function listen() {
    let offset = 0;
    for (;;) {
      try {
        const updates = await tg('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] });
        for (const update of updates) {
          offset = update.update_id + 1;
          if (update.callback_query) await onCallback(update.callback_query).catch((e) => fail(update.callback_query.message?.chat.id, e));
          else if (update.message) await onMessage(update.message).catch((e) => fail(update.message.chat.id, e));
        }
      } catch (e) {
        log('админ-бот: Telegram недоступен:', e.message);
        await sleep(/Conflict/.test(e.message) ? 30000 : 5000);
      }
    }
  }

  // ——— новые заявки и сообщения ———

  // { id: статус или время сообщения }; при первом запуске — молча
  let seen = readJson(SEEN_FILE);
  async function check() {
    const chats = Object.keys(staff);
    const [lists, staffChats] = await Promise.all([
      Promise.all(Object.keys(KINDS).map((kind) => db('GET', kind))),
      db('GET', 'userChats/staff'),
    ]);
    const first = !seen._started;
    const next = { _started: seen._started ?? Date.now() };
    const fresh = [];
    for (const [i, kind] of Object.keys(KINDS).entries()) {
      const all = entries(lists[i]);
      for (const x of all) {
        const id = `${kind}|${x.uid}|${x.key}`;
        next[id] = x.status;
        if (!first && x.status === 'new' && seen[id] !== 'new') fresh.push(() => Promise.all(chats.map(async (chat) => {
          if (await allowed(chat, KINDS[kind].perm)) await sendCard(chat, kind, x, all);
        })));
      }
    }
    for (const [key, c] of Object.entries(staffChats ?? {})) {
      const id = `chat|${key}`;
      next[id] = c.updatedAt;
      if (!first && c.unread && seen[id] !== c.updatedAt) fresh.push(() => Promise.all(chats.map(async (chat) => {
        if (!(await allowed(chat, 'chats'))) return;
        const sent = await send(chat, `💬 <b>${esc(c.title ?? 'Поддержка')}</b>\n${esc(c.aName ?? c.bName ?? '')}: ${esc(c.last ?? '')}\n\n<i>Ответьте на это сообщение (Reply) или нажмите «Ответить здесь».</i>`, markup(chatRows(key)));
        if (sent?.message_id) notices.set(`${chat}|${sent.message_id}`, key);
      })));
    }
    seen = next;
    writeJson(SEEN_FILE, seen);
    for (const notify of fresh) await notify();
  }

  async function watch() {
    for (;;) {
      await check().catch((e) => log('админ-бот: проверка не удалась:', e.message));
      await sleep(CHECK_MS);
    }
  }

  (async () => {
    const me = await tg('getMe', {});
    await tg('deleteWebhook', {}).catch(() => {});
    await tg('setMyCommands', {
      commands: [
        { command: 'start', description: 'Меню команды' },
        { command: 'orders', description: 'Донаты на проверке' },
        { command: 'listings', description: 'Аккаунты на проверке' },
        { command: 'sales', description: 'Продажи на проверке' },
        { command: 'claims', description: 'Награды на проверке' },
        { command: 'stats', description: 'Статистика за сегодня' },
        { command: 'logout', description: 'Выйти' },
      ],
    }).catch(() => {});
    await tg('setMyShortDescription', { short_description: 'KovriX A — бот команды Kovrix: заявки, чеки, статистика. Только для сотрудников.' }).catch(() => {});
    await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'KovriX A', web_app: { url: `${SITE}/admin/` } } }).catch(() => {});
    log(`Админ-бот @${me.username} запущен.`);
    listen();
    watch();
  })().catch((e) => log('админ-бот не запустился:', e.message));
};
