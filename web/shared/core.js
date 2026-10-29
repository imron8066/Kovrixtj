'use strict';
// Общая часть двух сайтов — клиента (web/user) и команды (web/admin):
// связь с Firebase, вход, деньги и курсы, чаты и мелкие помощники.
// Работает так же, как src/shared в приложениях.

const D = window.KOVRIX;
const { firebase: FB, games: GAMES } = D;
const app = document.getElementById('app');
const gameById = (id) => GAMES.find((g) => g.id === id);

// ——— язык ———
// Как src/shared/i18n в приложении: страницы пишутся по-русски, а текст
// на экране переводится по словарю D.strings сразу после отрисовки.
const LANGS = [['ru', 'Русский'], ['tg', 'Тоҷикӣ'], ['en', 'English']];
const LANG = (() => { try { return localStorage.getItem('donix:lang') || 'ru'; } catch { return 'ru'; } })();
const I18N = (() => {
  const exact = new Map();
  const patterns = [];
  const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [ru, pair] of Object.entries(D.strings ?? {})) {
    const slots = ru.match(/\{\d+\}/g);
    if (!slots) exact.set(ru, pair);
    else patterns.push({ re: new RegExp(`^${ru.split(/\{\d+\}/).map(escapeRe).join('([\\s\\S]*?)')}$`), slots, pair, fixed: ru.replace(/\{\d+\}/g, '').length });
  }
  patterns.sort((a, b) => b.fixed - a.fixed);
  return { exact, patterns };
})();
const which = (pair) => (LANG === 'tg' ? pair[0] : pair[1]);

function tr(text) {
  if (LANG === 'ru' || !text || !/[А-Яа-яЁё]/.test(text)) return text;
  const lead = text.match(/^\s*/)[0];
  const trail = text.match(/\s*$/)[0];
  const core = text.trim().replace(/\s+/g, ' ');
  if (I18N.exact.has(core)) return lead + which(I18N.exact.get(core)) + trail;
  for (const { re, slots, pair } of I18N.patterns) {
    const match = core.match(re);
    if (match) {
      let out = which(pair);
      slots.forEach((slot, i) => { out = out.split(slot).join(I18N.exact.has(match[i + 1]) ? which(I18N.exact.get(match[i + 1])) : match[i + 1]); });
      return lead + out + trail;
    }
  }
  return text;
}

// переводит текст и подсказки внутри node — и всё, что появится потом
function translate(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentNode?.nodeName;
    if (parent !== 'TEXTAREA' && parent !== 'SCRIPT' && parent !== 'STYLE') {
      const next = tr(node.data);
      if (next !== node.data) node.data = next;
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  for (const attr of ['placeholder', 'title', 'aria-label']) {
    if (node.hasAttribute(attr)) node.setAttribute(attr, tr(node.getAttribute(attr)));
  }
  node.childNodes.forEach(translate);
}
if (LANG !== 'ru') {
  document.documentElement.lang = LANG === 'tg' ? 'tg' : 'en';
  translate(document.body);
  new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach(translate)))
    .observe(document.body, { childList: true, subtree: true });
  const nativeAlert = window.alert.bind(window);
  const nativeConfirm = window.confirm.bind(window);
  const nativePrompt = window.prompt.bind(window);
  window.alert = (message) => nativeAlert(tr(String(message)));
  window.confirm = (message) => nativeConfirm(tr(String(message)));
  window.prompt = (message, value) => nativePrompt(tr(String(message)), value);
}

// выбор языка — на входе и в профиле; страница перезагружается на новом языке
// выбор языка — кнопками с флагами, выбранный подсвечен
const LANG_FLAGS = { ru: '🇷🇺', tg: '🇹🇯', en: '🇬🇧' };
const langSelect = () => `<div class="lang"><span class="lang-title">🌐 Язык / Забон / Language</span>
  <div class="seg">${LANGS.map(([key, name]) => `<button type="button" class="${key === LANG ? 'on' : ''}" data-lang-pick="${key}">${LANG_FLAGS[key] ?? ''} ${name}</button>`).join('')}</div></div>`;
document.addEventListener('click', (event) => {
  const pick = event.target.closest?.('[data-lang-pick]');
  if (!pick || pick.dataset.langPick === LANG) return;
  try { localStorage.setItem('donix:lang', pick.dataset.langPick); } catch { /* браузер не даёт сохранить */ }
  location.reload();
});

const labels = (done) => ({ new: ['На проверке', 'warn'], done: [done, 'ok'], rejected: ['Отклонён', 'bad'], sold: ['Продан', 'info'] });
const STATUS = {
  orders: labels('Донат зачислен'),
  listings: labels('На витрине'),
  sales: labels('Продажа подтверждена'),
  claims: labels('Награда выдана'),
};

// ——— помощники ———

// надпись как на логотипе: KOVRI + цветной X (src/shared/config.ts brandCut)
const brandCut = (name) => {
  const at = name.toLowerCase().lastIndexOf('x');
  return at < 0 ? 3 : at;
};
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = (ts) => new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const badge = (kind, status) => `<span class="badge ${STATUS[kind][status][1]}">${STATUS[kind][status][0]}</span>`;
const kv = (pairs) => `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
const fieldPairs = (defs, values) => defs.filter((d) => (values[d.key] ?? '').trim()).map((d) => [d.label, values[d.key].trim()]);
const digits = (count) => String(Math.floor(Math.random() * 9 * 10 ** (count - 1)) + 10 ** (count - 1));
const newCode = (prefix) => `${prefix}-${digits(5)}`;
const go = (path) => { location.hash = `#${path}`; };
const num = (text) => Number(String(text).replace(',', '.'));
const note = (text) => (text ? `<p class="note">Ответ: ${esc(text)}</p>` : '');
// игры с обложкой 16:9 — файл web/shared/games/<id>.jpg
const COVERS = ['free_fire', 'black_russia', 'pubg_mobile', 'fc_mobile', 'efootball', 'clash_of_clans', 'clash_royale', 'standoff2'];
// своё фото от админа важнее встроенной обложки
const coverOf = (id) => (/^data:image\//.test(S.covers?.[id] ?? '') ? S.covers[id] : COVERS.includes(id) ? `../shared/games/${id}.jpg?v=20261029c` : '');
// g.off — игра пока не работает: плитка с пометкой и без ссылки
const gameCard = (g, href, caption, off) => `
  <a class="game${coverOf(g.id) ? ' cover' : ''}${g.off ? ' disabled' : ''}" ${href && !g.off ? `href="${href}"` : ''} ${g.off ? `data-off="${esc(g.name)}"` : ''} data-tag="${esc(g.tag)}" style="--c1:${esc(g.colors[0])};--c2:${esc(g.colors[1])}">
    ${coverOf(g.id) ? `<img class="cover-img" src="${esc(coverOf(g.id))}" alt="">` : ''}${g.off ? '<span class="off muted-off">Не работает</span>' : off ? `<span class="off">${esc(off)}</span>` : ''}<b>${esc(g.name)}</b><small>${esc(caption ?? g.method)}</small>
  </a>`;
document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-off]');
  if (el) toast(`${el.dataset.off} пока не работает. Сейчас доступен Free Fire.`);
});
// фото присылают клиенты — показываем только настоящие картинки
const isPhoto = (p) => /^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+$/.test(p);
const photosHtml = (photos) => `<div class="photos">${photos.filter(isPhoto).map((p) => `<img src="${p}" alt="фото">`).join('')}</div>`;

// ——— деньги: цены хранятся в сомони, клиент видит их в своей валюте ———

const rateOf = (currency) => S.cloud.config.rates?.[currency] || D.currencies[currency].rate;
function amount(value, currency = 'TJS') {
  const { sign, digits: d } = D.currencies[currency];
  return `${Number(value).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: d })} ${sign}`;
}
const money = (tjs, currency = 'TJS') => amount(tjs * rateOf(currency), currency);
const toTjs = (value, currency) => Math.round((value / rateOf(currency)) * 100) / 100;
const myCurrency = () => D.countries.find((c) => c.key === S.user?.country)?.currency ?? 'TJS';
const mine$ = (tjs) => money(tjs, myCurrency());

// игра с ценами, которые выставил админ
function priced(game) {
  const own = S.cloud.config.prices?.[game.id];
  // товары, которые админ добавил сам, идут после товаров из games.ts
  const added = Object.values(S.cloud.config.products?.[game.id] ?? {});
  // товар с ценой 0 клиент не видит — админ ещё не назначил цену
  return {
    ...game,
    products: [...game.products.map((p, i) => ({ ...p, price: own?.products?.[i] ?? p.price })), ...added].filter((p) => p.price > 0),
    custom: game.custom && { ...game.custom, rate: own?.rate ?? game.custom.rate },
  };
}
// товары по группам — как productGroups в src/shared/utils.ts
const GROUP_TESTS = [['voucher', /ваучер/i], ['pass', /пропуск/i], ['gems', /алмаз/i]];
const GROUP_NAMES = { gems: '💎 Алмазы', voucher: '🎟️ Ваучеры', pass: '🎫 Пропуск', other: '🛒 Другое' };
function productGroups(products) {
  const keyOf = (title) => GROUP_TESTS.find(([, test]) => test.test(title))?.[0] ?? 'other';
  return ['gems', 'voucher', 'pass', 'other']
    .map((key) => ({ key, name: GROUP_NAMES[key], items: products.map((p, i) => ({ p, i })).filter(({ p }) => keyOf(p.title) === key) }))
    .filter((g) => g.items.length);
}
const activePromos = () => S.cloud.promos.filter((p) => p.until > Date.now());
const promoFor = (gameId) => activePromos().filter((p) => !p.game || p.game === gameId).sort((a, b) => b.percent - a.percent)[0];
const discounted = (price, promo) => (promo ? Math.round(price * (100 - promo.percent)) / 100 : price);
// промокоды — как codeKey/codePrice/codeText в src/shared/utils.ts
const codeKey = (text) => String(text ?? '').toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g, '').slice(0, 20);
function codePrice(code, gameId, item, full, now = Date.now()) {
  if (!code || (code.until && code.until < now) || (code.game && code.game !== gameId)) return null;
  if (code.product) return code.product === item && code.price != null ? code.price : null;
  if (code.prices) return code.prices[item] > 0 ? code.prices[item] : null;
  return code.percent ? Math.round(full * (100 - code.percent)) / 100 : null;
}
const codeText = (code, gameName) => (code.product ? `${code.product} — ${amount(code.price ?? 0)}` : code.prices ? `скидочные цены${gameName ? ` на ${gameName}` : ''}` : `скидка ${code.percent}%${gameName ? ` на ${gameName}` : ''}`);

// ——— защита оплаты (как src/shared/guard.ts) ———

// отпечаток скриншота чека: один и тот же чек в двух заказах — один отпечаток
function fingerprint(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}${text.length.toString(16)}`;
}
const txnKey = (text) => String(text ?? '').replace(/[^0-9a-zа-яё]/gi, '').toLowerCase();

function expectedPrice(order) {
  const base = gameById(order.game);
  if (!base) return null;
  const game = priced(base);
  const product = game.products.find((p) => p.title === order.item);
  let full = product ? product.price : null;
  if (full === null && game.custom) {
    const count = Number(order.item.split(' ')[0]);
    full = count > 0 ? Math.round(count * game.custom.rate * 100) / 100 : null;
  }
  if (full === null) return null;
  if (order.promoCode) {
    const code = S.cloud.codes.find((c) => c.id === order.promoCode);
    return code ? codePrice(code, order.game, order.item, full, order.createdAt) : null;
  }
  const percent = Number(order.promo?.match(/−(\d+(?:[.,]\d+)?)%/)?.[1]?.replace(',', '.') ?? 0);
  return percent ? Math.round(full * (100 - percent)) / 100 : full;
}

const statusWord = (status) => (status === 'done' ? 'зачислен' : status === 'rejected' ? 'отклонён' : 'ждёт');

function orderWarnings(order, orders) {
  const out = [];
  const others = orders.filter((o) => o.code !== order.code);
  const key = txnKey(order.txn);
  if (!key) out.push('Клиент не указал номер операции — сверьте чек с выпиской банка.');
  else {
    const same = others.find((o) => o.txn && txnKey(o.txn) === key);
    if (same) out.push(`Номер операции уже был в заказе ${same.code} (${same.client?.name ?? ''}, ${statusWord(same.status)}). Возможен повторный чек!`);
  }
  if (order.receipt) {
    const same = others.find((o) => o.receipt === order.receipt);
    if (same) out.push(`Этот же скриншот чека уже был в заказе ${same.code} (${same.client?.name ?? ''}, ${statusWord(same.status)}).`);
  }
  const expected = expectedPrice(order);
  if (expected !== null && Math.abs(expected - order.price) > 0.5) out.push(`Цена ${amount(order.price)} не совпадает с прайсом: сейчас ${amount(expected)}. Проверьте сумму в чеке.`);
  return out;
}

const PERIODS = [['day', 'День', 864e5], ['week', 'Неделя', 7 * 864e5], ['month', 'Месяц', 30 * 864e5], ['all', 'Всё время', Infinity]];
// кто сколько задонатил за период, от большего к меньшему
function ranking(donations, period) {
  const since = Date.now() - PERIODS.find((p) => p[0] === period)[2];
  const byUser = new Map();
  for (const d of donations) {
    if (d.at < since) continue;
    const row = byUser.get(d.uid) ?? { ...d, total: 0 };
    row.total += d.amount;
    byUser.set(d.uid, row);
  }
  return [...byUser.values()].sort((a, b) => b.total - a.total).map((row, i) => ({ ...row, place: i + 1 }));
}

const NICK_A = ['Turbo', 'Shadow', 'Lucky', 'Crazy', 'Silent', 'Golden', 'Frost', 'Rapid', 'Dark', 'Mega', 'Royal', 'Wild', 'Neon', 'Iron', 'Storm'];
const NICK_B = ['Wolf', 'Tiger', 'Sniper', 'Rider', 'Falcon', 'Ninja', 'King', 'Dragon', 'Ghost', 'Hunter', 'Panda', 'Viper', 'Ace', 'Boss', 'Fox'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const randomName = () => `${pick(NICK_A)}${pick(NICK_B)}_${digits(3)}`;

function toast(message, isError) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = 'toast'; }, 3500);
}

// кнопка недоступна, пока идёт запрос; ошибка показывается внизу экрана
async function busy(button, fn) {
  button.disabled = true;
  try {
    await fn();
  } catch (e) {
    toast(e.message || 'Не получилось', true);
  }
  button.disabled = false;
}

function onSubmit(form, fn) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    busy(form.querySelector('[type=submit]'), () => fn(form));
  });
}

// кнопки с data-<name>: нажатие вызывает fn(значение, кнопка)
const onClick = (name, fn, root = app) => root.querySelectorAll(`[data-${name}]`).forEach((el) => el.addEventListener('click', () => busy(el, () => fn(el.dataset[name], el))));

// нажатие на фото открывает его на весь экран
document.addEventListener('click', (event) => {
  if (event.target.closest('.viewer')) {
    event.target.closest('.viewer').remove();
  } else if (event.target.matches('.photos img, .carousel img')) {
    const viewer = document.createElement('div');
    viewer.className = 'viewer';
    viewer.append(Object.assign(new Image(), { src: event.target.src }));
    document.body.append(viewer);
  }
});

// Фото сжимается в браузере — так же, как в приложении (до 1000 точек)
function compress(file, max = 1000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => reject(new Error('Этот файл — не фото.'));
    img.src = URL.createObjectURL(file);
  });
}

// Выбор фото: box — блок с кнопкой, photos — массив, который он пополняет
function photoPicker(box, photos, max) {
  const draw = () => {
    box.innerHTML = `
      <label class="file"><span>🖼</span><span>Выбрать фото (${photos.length}/${max})</span>
        <input type="file" accept="image/*" ${max > 1 ? 'multiple' : ''}></label>
      <div class="photos">${photos.map((p, i) => `<span class="rm"><img src="${p}" alt="фото"><button type="button" data-rm="${i}">×</button></span>`).join('')}</div>`;
    box.querySelector('input').addEventListener('change', async (event) => {
      try {
        for (const file of [...event.target.files].slice(0, max - photos.length)) photos.push(await compress(file));
      } catch (e) {
        toast(e.message, true);
      }
      draw();
    });
    box.querySelectorAll('[data-rm]').forEach((el) => el.addEventListener('click', () => {
      photos.splice(Number(el.dataset.rm), 1);
      draw();
    }));
  };
  draw();
}

// Фото объявления по одному: подгружается, когда до него долистали
const photoCache = new Map();
function carousel(el) {
  const { code } = el.dataset;
  const count = Number(el.dataset.count);
  let index = 0;
  const draw = async () => {
    const key = `${code}/${index}`;
    const dots = count > 1 ? `<button type="button" class="prev">‹</button><button type="button" class="next">›</button><span class="dots">${Array.from({ length: count }, (_, i) => `<i class="${i === index ? 'on' : ''}"></i>`).join('')}</span>` : '';
    const show = (photo) => {
      el.innerHTML = (photo && isPhoto(photo) ? `<img src="${photo}" alt="фото аккаунта">` : count ? 'Загрузка фото…' : 'Нет фото') + dots;
      el.querySelector('.prev')?.addEventListener('click', () => { index = (index - 1 + count) % count; draw(); });
      el.querySelector('.next')?.addEventListener('click', () => { index = (index + 1) % count; draw(); });
    };
    show(photoCache.get(key));
    if (count && !photoCache.has(key)) {
      photoCache.set(key, (await db('GET', `marketPhotos/${code}/${index}`).catch(() => null)) ?? '');
      if (key === `${code}/${index}`) show(photoCache.get(key));
    }
  };
  draw();
}

function fieldHtml(def, prefix) {
  const name = prefix + def.key;
  const label = esc(def.label) + (def.required ? ' *' : '');
  if (def.options) {
    return `<label class="field">${label}<select name="${name}"><option value="">— выберите —</option>${def.options.map((o) => `<option>${esc(o)}</option>`).join('')}</select></label>`;
  }
  const mode = def.inputmode ? ` inputmode="${def.inputmode}"` : '';
  return `<label class="field">${label}<input type="text" name="${name}" maxlength="200" autocomplete="off" placeholder="${esc(def.placeholder ?? '')}"${mode}></label>`;
}

const readFields = (form, defs, prefix) => Object.fromEntries(defs.map((d) => [d.key, form.elements[prefix + d.key].value.trim()]));

// возвращает текст ошибки или null — как checkFields в приложении
function checkFields(defs, values) {
  for (const def of defs) {
    const value = values[def.key] ?? '';
    if (!value) {
      if (def.required) return `Заполните поле: ${def.label}`;
      continue;
    }
    if (def.pattern && !new RegExp(def.pattern).test(value)) return def.hint || `Проверьте поле: ${def.label}`;
  }
  return null;
}

// ——— Firebase ———

const ERRORS = [
  [/EMAIL_EXISTS/, 'Такой номер или ник уже зарегистрирован — нажмите «Вход».'],
  [/INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|INVALID_PASSWORD|INVALID_EMAIL/, 'Неверный номер, ник, ID или пароль.'],
  [/USER_DISABLED/, 'Аккаунт заблокирован.'],
  [/WEAK_PASSWORD/, 'Пароль — минимум 6 символов.'],
  [/TOO_MANY_ATTEMPTS/, 'Слишком много попыток. Подождите пару минут.'],
  [/OPERATION_NOT_ALLOWED|CONFIGURATION_NOT_FOUND/, 'В Firebase не включён вход по почте и паролю.'],
  [/TOKEN_EXPIRED|USER_NOT_FOUND|INVALID_REFRESH_TOKEN|INVALID_ID_TOKEN|CREDENTIAL_TOO_OLD/, 'Вход устарел. Выйдите и войдите снова.'],
  [/Permission denied|^401$|^403$/, 'Нет доступа к этим данным.'],
];

async function call(url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error('Нет связи с сервером. Проверьте интернет.');
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ответ не JSON */ }
  if (res.ok) return json;
  const code = typeof json?.error === 'string' ? json.error : json?.error?.message ?? String(res.status);
  throw new Error(ERRORS.find(([pattern]) => pattern.test(code))?.[1] ?? `Ошибка сервера: ${code}`);
}

const stored = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const NO_CLOUD = { loaded: false, role: null, perms: {}, blocked: false, tg: false, config: {}, promos: [], codes: [], news: [], owner: false, locked: false };
const S = { session: stored('donix:session'), user: stored('donix:user'), cloud: { ...NO_CLOUD } };

function keep(session, user) {
  // ключ восстановления: по нему бот выдаёт новый код, а админ меняет
  // пароль сотруднику (владельцу база сохранить его не даёт)
  if (session && user && session.refreshToken !== S.saved) {
    S.saved = session.refreshToken;
    setTimeout(() => db('PUT', `recovery/${user.uid}`, session.refreshToken).catch(() => {}));
  }
  S.session = session;
  S.user = user;
  localStorage.setItem('donix:session', JSON.stringify(session));
  localStorage.setItem('donix:user', JSON.stringify(user));
}

async function authorize(action, body) {
  const reply = await call(`${FB.authURL}/accounts:${action}?key=${FB.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
  });
  S.session = { uid: reply.localId, idToken: reply.idToken, refreshToken: reply.refreshToken, expiresAt: Date.now() + Number(reply.expiresIn) * 1000 };
  return reply.localId;
}

// пропуск живёт час; за минуту до конца берётся новый
async function token() {
  if (!S.session) throw new Error('Войдите в аккаунт.');
  if (S.session.expiresAt - Date.now() > 60000) return S.session.idToken;
  const reply = await call(`${FB.tokenURL ?? FB.authURL + "/token"}?key=${FB.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(S.session.refreshToken)}`,
  });
  keep({ uid: reply.user_id, idToken: reply.id_token, refreshToken: reply.refresh_token, expiresAt: Date.now() + Number(reply.expires_in) * 1000 }, S.user);
  return reply.id_token;
}

async function db(method, path, body) {
  return call(`${FB.databaseURL.replace(/\/+$/, '')}/${path}.json?auth=${await token()}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ——— вход ———

// шесть цифр — это ID аккаунта
const isId = (login) => /^\d{6}$/.test(login);

// номер телефона, ник или ID превращаются в служебный адрес — как в приложении
// настоящая почта (Gmail и другие) — как есть; иначе служебный адрес
const isEmail = (text) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(text);
const emailOf = (login) => (isEmail(login) ? login.trim().toLowerCase() : /[a-z]/i.test(login)
  ? `n${login.toLowerCase().replace(/[^a-z0-9_.-]/g, '')}@donix.example.com`
  : isId(login) ? `i${login}@donix.example.com`
    : `p${login.replace(/\D/g, '')}@donix.example.com`);

const authCall = (action, body) => call(`${FB.authURL}/accounts:${action}?key=${FB.apiKey}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

async function createProfile(uid, data) {
  let id = Number(digits(6));
  for (let attempt = 0; ; attempt++) {
    try {
      await db('PUT', `ids/${id}`, uid);
      break;
    } catch (e) {
      if (attempt >= 4) throw e;
      id = Number(digits(6));
    }
  }
  const user = { uid, id, ...data, createdAt: Date.now() };
  await db('PUT', `users/${uid}`, user);
  return user;
}

// ID друга из ссылки-приглашения (…/user/#/r/123456 или ?ref=123456)
const REF_KEY = 'donix:ref';
const savedRef = () => { try { return localStorage.getItem(REF_KEY) || ''; } catch { return ''; } };
(() => {
  const ref = (location.hash.match(/^#\/r\/(\d{6})$/) ?? new URLSearchParams(location.search).get('ref')?.match(/^(\d{6})$/))?.[1];
  if (!ref) return;
  try { localStorage.setItem(REF_KEY, ref); } catch { /* браузер не даёт сохранить */ }
  if (location.hash.startsWith('#/r/')) history.replaceState(null, '', `${location.pathname}${location.search}#/`);
})();

// письма Firebase (подтверждение почты, сброс пароля) — по-русски
const mailCall = (body) => call(`${FB.authURL}/accounts:sendOobCode?key=${FB.apiKey}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Firebase-Locale': 'ru' }, body: JSON.stringify(body),
});
// email — регистрация по почте (Gmail): вход по ней же, письма приходят туда
async function register({ name, phone, email, country, password, ref }) {
  const friend = /^\d{6}$/.test(ref ?? '') ? ref : '';
  const login = email ? email.trim().toLowerCase() : phone;
  const uid = await authorize('signUp', { email: emailOf(login), password });
  const user = await createProfile(uid, { name, phone: email ? '' : phone, ...(email ? { email: login } : {}), country, login, ...(friend ? { ref: friend } : {}) });
  if (email) await mailCall({ requestType: 'VERIFY_EMAIL', idToken: S.session.idToken }).catch(() => {});
  keep(S.session, user);
  // неверный ID друга регистрации не мешает — приглашение просто не засчитается
  if (friend) {
    await db('PUT', `invites/${friend}/${uid}`, { name: user.name, at: Date.now() }).catch(() => {});
    try { localStorage.removeItem(REF_KEY); } catch { /* ничего */ }
  }
}

// ник из профиля — как nickError в src/shared/api.ts
const nickKey = (nick) => nick.trim().toLowerCase();
const nickError = (nick) => (!/^[a-z0-9_.-]{3,20}$/.test(nickKey(nick))
  ? 'Ник — от 3 до 20 латинских букв и цифр (можно . _ -).'
  : !/[a-z]/.test(nickKey(nick)) ? 'В нике нужна хотя бы одна латинская буква.' : '');

// вход как раньше, а если не вышло и это ник — ищем ник из профиля (nicks/<ник>)
async function signInAny(name, password) {
  try {
    return await authorize('signInWithPassword', { email: emailOf(name), password });
  } catch (e) {
    const alias = /[a-z]/i.test(name)
      ? await call(`${FB.databaseURL.replace(/\/+$/, '')}/nicks/${encodeURIComponent(nickKey(name))}.json`).catch(() => null)
      : null;
    if (!alias?.email) throw e;
    return authorize('signInWithPassword', { email: alias.email, password });
  }
}

async function changeNick(nick) {
  const problem = nickError(nick);
  if (problem) throw new Error(problem);
  const key = nickKey(nick);
  const taken = await db('GET', `nicks/${key}`);
  if (taken && taken.uid !== S.user.uid) throw new Error('Этот ник уже занят — выберите другой.');
  const { email } = (await authCall('lookup', { idToken: await token() })).users[0];
  await db('PUT', `nicks/${key}`, { uid: S.user.uid, email });
  if (S.user.nick && nickKey(S.user.nick) !== key) await db('DELETE', `nicks/${nickKey(S.user.nick)}`).catch(() => {});
  await db('PATCH', `users/${S.user.uid}`, { nick: key });
  keep(S.session, { ...S.user, nick: key });
}

async function login(name, password) {
  const uid = await signInAny(name, password);
  const nick = /[a-z]/i.test(name);
  keep(S.session, (await db('GET', `users/${uid}`)) ?? (await createProfile(uid, { name, phone: nick ? '' : name, login: name })));
}

async function changePassword(current, next) {
  // адрес берётся у Firebase: анкета в браузере могла устареть
  const { email } = (await authCall('lookup', { idToken: await token() })).users[0];
  try {
    await authorize('signInWithPassword', { email, password: current });
  } catch (e) {
    throw e.message.startsWith('Неверный') ? new Error('Текущий пароль неверный.') : e;
  }
  await authorize('update', { idToken: S.session.idToken, password: next });
  keep(S.session, S.user);
}

// Вход по одноразовой ссылке из Telegram-бота (кнопка «Войти на сайт»)
async function enterByLink(key) {
  const base = FB.databaseURL.replace(/\/+$/, '');
  const link = await call(`${base}/logins/${key}.json`).catch(() => null);
  if (!link?.key) throw new Error('Ссылка устарела. Попросите у бота новую — кнопка «Войти на сайт».');
  const reply = await call(`${FB.tokenURL ?? FB.authURL + "/token"}?key=${FB.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(link.key)}`,
  });
  S.session = { uid: reply.user_id, idToken: reply.id_token, refreshToken: reply.refresh_token, expiresAt: Date.now() + Number(reply.expires_in) * 1000 };
  S.saved = reply.refresh_token;
  keep(S.session, await db('GET', `users/${reply.user_id}`));
  call(`${base}/logins/${key}.json`, { method: 'DELETE' }).catch(() => {});
}

function logout() {
  keep(null, null);
  S.cloud = { ...NO_CLOUD };
  go('/');
  window.dispatchEvent(new Event('hashchange'));
}

// роль, блокировка, Telegram, цены, курсы и акции
async function loadCloud() {
  const { uid } = S.user;
  const [role, perms, blocked, tg, config, promos, news] = await Promise.all([
    db('GET', `roles/${uid}`), db('GET', `perms/${uid}`), db('GET', `blocked/${uid}`), db('GET', `tg/${uid}`), db('GET', 'config'), db('GET', 'promos'),
    db('GET', 'news').catch(() => null),
  ]);
  // промокоды целиком видит только команда
  // код KovriX A: владельцу не нужен; без верного кода база не признаёт роль
  // (список блокировок читает только команда)
  const [owner, locked] = role
    ? await Promise.all([db('GET', `admins/${uid}`).catch(() => null), db('GET', 'blocked').then(() => false, (e) => /доступа/.test(e.message))])
    : [null, false];
  const codes = role && !locked ? await db('GET', 'codes').catch(() => null) : null;
  S.cloud = { loaded: true, role, perms: perms ?? {}, blocked: !!blocked, tg: !!tg, config: config ?? {}, promos: list(promos), codes: list(codes), news: list(news).sort((a, b) => b.at - a.at), owner: !!owner, locked };
}

// ——— заявки ———

const list = (stored) => Object.entries(stored ?? {}).map(([id, value]) => ({ ...value, id }));
const normalize = (item) => ({ ...item, fields: item.fields ?? {}, attrs: item.attrs ?? {}, note: item.note ?? '' });
const newestFirst = (items) => items.map(normalize).sort((a, b) => b.createdAt - a.createdAt);
const keyOf = (item) => item.task ?? item.code;
const client = () => ({ id: S.user.id, name: S.user.name, phone: S.user.phone });

// сначала фото, потом заявка: админ не увидит заказ без чека
async function createRequest(kind, item, photos, photoKey = keyOf(item)) {
  if (photos.length) await db('PUT', `photos/${item.uid}/${photoKey}`, photos);
  await db('PUT', `${kind}/${item.uid}/${keyOf(item)}`, item);
}

const mine = async (kind) => newestFirst(Object.values((await db('GET', `${kind}/${S.user.uid}`)) ?? {}));
const all = async (kind) => newestFirst(Object.values((await db('GET', kind)) ?? {}).flatMap(Object.values));
const loadMarket = async () => Object.values((await db('GET', 'market')) ?? {}).map((lot) => ({ ...lot, attrs: lot.attrs ?? {} })).sort((a, b) => b.createdAt - a.createdAt);

// Решение команды по заявке — то же, что decide в src/shared/api.ts:
// донат попадает в топ, аккаунт — на витрину, продажа убирает его оттуда
async function decide(kind, item, status, text) {
  // зачисленный донат потом отклонили — убрать его из топа
  if (status === 'rejected' && kind === 'orders' && item.status === 'done') await db('DELETE', `donations/${item.code}`);
  if (status === 'done' && kind === 'orders') {
    await db('PUT', `donations/${item.code}`, { uid: item.uid, id: item.client.id, name: item.client.name, code: item.code, amount: item.price, at: Date.now() });
  }
  if (status === 'done' && kind === 'listings') {
    const { client: seller, status: _s, note: _n, ...listing } = item;
    const photos = (await db('GET', `photos/${item.uid}/${item.code}`)) ?? [];
    await db('PUT', `marketPhotos/${item.code}`, photos);
    await db('PUT', `market/${item.code}`, { ...listing, bargain: !!listing.bargain, seller: { id: seller.id, name: seller.name }, photos: photos.length });
  }
  if (status === 'done' && kind === 'sales') {
    await db('DELETE', `market/${item.code}`);
    await db('DELETE', `marketPhotos/${item.code}`);
    await db('PATCH', `listings/${item.uid}/${item.code}`, { status: 'sold' });
  }
  await db('PATCH', `${kind}/${item.uid}/${keyOf(item)}`, { status, note: text, decidedAt: Date.now(), decidedBy: S.user.name });
  // журнал команды: кто что решил (запись только добавляется)
  await db('POST', 'history', {
    at: Date.now(), by: S.user.uid, byName: S.user.name, kind, code: keyOf(item), status,
    title: item.item ? `${item.item} · ${item.game}` : item.title ?? keyOf(item),
    ...(item.price !== undefined ? { amount: item.price } : {}), ...(text ? { note: text } : {}), client: item.client,
  }).catch(() => {});
}

// ——— чаты ———

const loadChats = async (owner) => list(await db('GET', `userChats/${owner}`)).sort((a, b) => b.updatedAt - a.updatedAt);

// открывает чат; если его ещё нет — создаёт и кладёт в списки обоих
async function openChat(chat) {
  if (!(await db('GET', `userChats/${chat.a}/${chat.id}`))) {
    const { a, b, kind, title } = chat;
    await db('PUT', `chats/${chat.id}/meta`, { a, b, kind, title }).catch(() => {});
    await db('PUT', `userChats/${a}/${chat.id}`, chat);
    await db('PUT', `userChats/${b}/${chat.id}`, chat);
  }
  go(`/chat/${chat.id}`);
}

const talk = (kind) => openChat({
  id: `${kind}_${S.user.uid}`, kind, title: kind === 'support' ? 'Поддержка' : 'Сотрудничество',
  a: S.user.uid, b: 'staff', aName: `${S.user.name} · ID ${S.user.id}`,
  bName: `Kovrix · ${kind === 'support' ? 'поддержка' : 'сотрудничество'}`, updatedAt: Date.now(),
});

const chatRow = (chat, owner) => `
  <a class="card link" href="#/chat/${esc(chat.id)}"><i>${{ deal: '🤝', support: '🛟', partner: '📣' }[chat.kind] ?? '💬'}</i>
    <span class="grow"><b>${esc(owner === chat.a ? chat.bName : chat.aName)}</b><br><span class="muted small">${esc(chat.last ?? chat.title)}</span></span>
    ${chat.unread ? '<span class="dot"></span>' : ''}<u>›</u></a>`;

// Переписка. owner — чей это список: uid клиента или 'staff' (поддержка).
// Новые сообщения подтягиваются сами.
async function viewChat(id, owner) {
  const chat = await db('GET', `userChats/${owner}/${id}`);
  if (!chat) throw new Error('Чат не найден.');
  app.innerHTML = `
    <a class="back" href="#/${owner === 'staff' ? 'chats' : 'answers'}">‹ Назад</a>
    <p class="muted center small">${esc(chat.title)} · ${esc(owner === chat.a ? chat.bName : chat.aName)}</p>
    <div class="chat" id="messages"></div>
    <form class="send" id="send"><input type="text" name="text" maxlength="1000" placeholder="Сообщение" autocomplete="off" class="grow"><button type="submit" class="btn sm">➤</button></form>`;
  const box = app.querySelector('#messages');
  let shown = -1;
  const load = async () => {
    const messages = Object.values((await db('GET', `chats/${id}/messages`)) ?? {}).sort((x, y) => x.at - y.at);
    if (messages.length === shown) return;
    shown = messages.length;
    box.innerHTML = messages.map((m) => {
      // как isOwnMessage в src/shared/utils.ts: в поддержке стороны — клиент и
      // команда, старые ответы команды без пометки узнаём по имени Kovrix
      const fromStaff = m.staff ?? m.name === 'Kovrix';
      const own = chat.b !== 'staff' ? m.from === S.user.uid : owner === 'staff' ? fromStaff : !fromStaff && m.from === S.user.uid;
      return `<div class="msg ${own ? 'own' : ''}">${own ? '' : `<b>${esc(m.name)}</b>`}${esc(m.text)}<small>${date(m.at)}</small></div>`;
    }).join('') || '<p class="muted center">Напишите первое сообщение.</p>';
    window.scrollTo(0, document.body.scrollHeight);
    db('PATCH', `userChats/${owner}/${id}`, { unread: false }).catch(() => {});
  };
  await load();
  if (S.draft?.id === id) {
    const input = app.querySelector('#send [name=text]');
    input.value = S.draft.text;
    input.focus();
  }
  S.draft = null;
  start.timer = setInterval(() => load().catch(() => {}), D.chatMs);
  onSubmit(app.querySelector('#send'), async (form) => {
    const text = form.elements.text.value.trim();
    if (!text) return;
    const at = Date.now();
    await db('POST', `chats/${id}/messages`, { from: S.user.uid, name: owner === 'staff' ? 'Kovrix' : S.user.name, text, at, ...(owner === 'staff' ? { staff: true } : {}) });
    const patch = { last: text.slice(0, 80), updatedAt: at };
    await db('PATCH', `userChats/${owner}/${id}`, { ...patch, unread: false });
    await db('PATCH', `userChats/${owner === chat.a ? chat.b : chat.a}/${id}`, { ...patch, unread: true });
    form.reset();
    await load();
  });
}

// ——— общие экраны ———

// Вход и регистрация. registration: false — только вход (сайт команды).
// Номер собирается из кода страны и цифр; вместо номера можно ввести ник.
function viewAuth({ registration, slogan, done, name = 'Kovrix' }) {
  let mode = registration && savedRef() ? 'register' : 'login';
  // регистрация по номеру или по почте (Gmail)
  let via = 'phone';
  const draw = () => {
    const reg = registration && mode === 'register';
    const mail = reg && via === 'email';
    app.innerHTML = `
      <div class="center stack tight"><img class="${registration ? 'poster' : 'mark'}" src="../shared/${registration ? 'poster.jpg' : 'logo.png'}?v=20261029c" alt="${esc(name)}">${registration ? '' : `<h1 class="logo" style="font-size:44px">${esc(name.slice(0, brandCut(name)).toUpperCase())}<span>${esc(name.slice(brandCut(name)).toUpperCase())}</span></h1><p class="motto">${esc(D.motto)}</p>`}<p class="muted">${esc(slogan)}</p></div>
      <form class="card stack" id="auth">
        ${registration ? `<div class="row">
          <button type="button" class="btn sm grow ${reg ? 'ghost' : ''}" data-mode="login">Вход</button>
          <button type="button" class="btn sm grow ${reg ? '' : 'ghost'}" data-mode="register">Регистрация</button>
        </div>` : ''}
        ${reg ? `<label class="field">Имя или ник<span class="row"><input type="text" name="name" maxlength="40" required minlength="2" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" class="grow">
          <button type="button" class="btn sm ghost" id="dice" title="Случайный ник">🎲</button></span></label>` : ''}
        ${reg ? `<div class="chips"><button type="button" class="chip ${mail ? '' : 'on'}" data-via="phone">📱 По номеру</button><button type="button" class="chip ${mail ? 'on' : ''}" data-via="email">✉️ По Gmail</button></div>` : ''}
        ${mail ? `<label class="field">Gmail или другая почта<input type="email" name="email" maxlength="80" required autocapitalize="off" autocomplete="email" placeholder="name@gmail.com"></label>
          <p class="muted small">На почту придёт письмо для подтверждения, а если забудете пароль — ссылка для нового.</p>` : `<label class="field">${reg ? 'Телефон' : 'ID, телефон, ник или почта'}<span class="phone">
          <select name="country" title="Страна">${D.countries.map((c) => `<option value="${c.key}">${c.flag} ${c.dial}</option>`).join('')}</select>
          <input type="${reg ? 'tel' : 'text'}" name="phone" placeholder="${reg ? '900000000' : 'ID, номер, ник или почта'}" maxlength="80" required autocapitalize="off"></span></label>`}
        <label class="field">${reg ? 'Пароль (минимум 6 символов)' : 'Пароль или код'}<input type="password" name="password" maxlength="100" required minlength="6"></label>
        ${reg ? `<label class="field">ID друга, который пригласил (если есть)<input type="text" name="ref" inputmode="numeric" maxlength="6" pattern="\\d{6}" placeholder="6 цифр" value="${esc(savedRef())}"></label>` : ''}
        <button type="submit" class="btn block">${reg ? 'Зарегистрироваться' : 'Войти'}</button>
        ${reg ? '' : '<button type="button" class="link-btn" data-forgot="1">Забыли пароль? Пришлём ссылку на почту</button>'}
        ${registration ? `<p class="muted small center">${reg ? 'Регистрируясь, вы принимаете' : 'Как мы храним ваши данные —'} <a href="/privacy.html" target="_blank" rel="noopener">политику конфиденциальности</a></p>` : ''}
      </form>
      <div class="card">${langSelect()}</div>`;
    app.querySelectorAll('[data-mode]').forEach((el) => el.addEventListener('click', () => { mode = el.dataset.mode; draw(); }));
    app.querySelectorAll('[data-via]').forEach((el) => el.addEventListener('click', () => { via = el.dataset.via; draw(); }));
    // сброс пароля — письмо Firebase на настоящую почту
    onClick('forgot', async () => {
      const typed = app.querySelector('[name=phone]').value.trim();
      const email = isEmail(typed) ? typed : prompt('Почта, с которой вы регистрировались:')?.trim();
      if (!email) return;
      if (!isEmail(email)) throw new Error('Это не похоже на почту. Пример: name@gmail.com');
      await mailCall({ requestType: 'PASSWORD_RESET', email: email.toLowerCase() });
      toast(`Письмо со ссылкой для нового пароля отправлено на ${email}`);
    });
    app.querySelector('#dice')?.addEventListener('click', () => { app.querySelector('[name=name]').value = randomName(); });
    onSubmit(app.querySelector('#auth'), async (form) => {
      if (mail) {
        const email = form.elements.email.value.trim();
        if (!isEmail(email)) throw new Error('Введите почту, например name@gmail.com.');
        await register({ name: form.elements.name.value.trim(), email, country: 'TJ', password: form.elements.password.value, ref: form.elements.ref?.value.trim() });
        toast(`Добро пожаловать! Ваш ID в Kovrix: ${S.user.id}. Подтвердите почту — письмо уже отправлено.`);
        done();
        return;
      }
      const typed = form.elements.phone.value.replace(/[\s()-]/g, '');
      const country = D.countries.find((c) => c.key === form.elements.country.value);
      const nick = !reg && /[a-z]/i.test(typed);
      const phone = typed.startsWith('+') ? typed : country.dial + typed.replace(/^0+/, '');
      const id = !reg && isId(typed);
      if (!nick && !id && !/^\+\d{9,15}$/.test(phone)) throw new Error(`Выберите страну и введите номер без кода, например ${country.dial} 900000000.`);
      const password = form.elements.password.value;
      if (reg) {
        await register({ name: form.elements.name.value.trim(), phone, country: country.key, password, ref: form.elements.ref?.value.trim() });
        toast(`Добро пожаловать! Ваш ID в Kovrix: ${S.user.id}`);
      } else {
        await login(nick || id ? typed : phone, password);
      }
      done();
    });
  };
  draw();
}

// Профиль. client: true — сайт клиента: статистика донатов, поддержка.
async function viewProfile({ client: forClient } = {}) {
  const uid = S.user.uid;
  const donations = forClient ? Object.values((await db('GET', 'donations')) ?? {}) : [];
  const stats = PERIODS.map(([key, name]) => {
    const row = ranking(donations, key).find((r) => r.uid === uid);
    return `<div class="stat"><span class="muted small">${name}</span><b>${mine$(row?.total ?? 0)}</b><small>${row ? `${row.place} место` : '—'}</small></div>`;
  }).join('');
  const role = { admin: 'Админ', deputy: 'Заместитель админа' }[S.cloud.role];
  const contact = S.user.email || S.user.phone || S.user.login;
  app.innerHTML = `
    <div class="card profile-head">
      <div class="avatar">${esc((S.user.name || '?').trim().slice(0, 1).toUpperCase())}</div>
      <div class="grow stack tight">
        <div class="row wrap"><h2>${esc(S.user.name)}</h2>${role ? `<span class="badge info">${role}</span>` : ''}</div>
        <div class="row wrap"><span class="id-chip">🆔 ${esc(S.user.id)}</span>${S.user.nick ? `<span class="id-chip">@${esc(S.user.nick)}</span>` : ''}</div>
        ${contact ? `<span class="muted small">${S.user.email ? '✉️' : S.user.phone ? '📱' : '👤'} ${esc(contact)}</span>` : ''}
      </div>
    </div>
    <div class="card stack"><h3>Страна и валюта</h3>
      <p class="muted small">Цены будут показаны в валюте вашей страны.</p>
      <select id="country" class="pretty">${D.countries.map((c) => `<option value="${c.key}" ${c.key === (S.user.country ?? 'TJ') ? 'selected' : ''}>${c.flag} ${esc(c.name)} · ${D.currencies[c.currency].name}</option>`).join('')}</select>
    </div>
    <form class="card stack" id="names"><h3>Имя и ник</h3>
      <div class="pair">
        <label class="field">Имя<input name="name" required minlength="2" maxlength="30" value="${esc(S.user.name)}"></label>
        <label class="field">Ник для входа<span class="with-at"><b>@</b><input name="nick" maxlength="20" autocapitalize="none" autocomplete="off" placeholder="imron_tj" value="${esc(S.user.nick ?? '')}"></span></label>
      </div>
      <p class="hint">💡 С ником можно входить вместо номера или ID — пароль тот же. Только латиница и цифры.</p>
      <button type="submit" class="btn block">Сохранить</button>
    </form>
    ${forClient ? `<div class="card stack"><h3>Мои донаты</h3><div class="stats">${stats}</div><a class="btn sm ghost" href="#/rewards">🏆 Топ донатеров и задания</a></div>` : ''}
    <div class="card stack tight"><h3>Telegram</h3>
      ${S.cloud.tg
        ? '<p class="muted small">✓ Номер подтверждён. Сообщения о заказах и ответы приходят в Telegram.</p><button class="btn sm ghost" data-tg="off">Отключить Telegram</button>'
        : `<p class="muted small">Откройте бота @${esc(D.botName)}, нажмите «Старт» и отправьте свой номер — бот подтвердит регистрацию и будет присылать сообщения о заказах.</p>
           <a class="btn sm" target="_blank" rel="noopener" href="https://t.me/${esc(D.botName)}?start=${esc(uid)}">✈️ Подтвердить в Telegram</a>`}
    </div>
    ${forClient ? `
      <button class="card link" data-talk="support" style="text-align:left;color:inherit;font:inherit;cursor:pointer"><i>🛟</i><span class="grow"><b>Поддержка</b><br><span class="muted small">Вопрос по заказу, оплате или аккаунту</span></span><u>›</u></button>
      <button class="card link" data-talk="partner" style="text-align:left;color:inherit;font:inherit;cursor:pointer"><i>🤝</i><span class="grow"><b>Сотрудничество</b><br><span class="muted small">Реклама, оптовые заказы, предложения</span></span><u>›</u></button>` : ''}
      <a class="card link" href="/privacy.html" style="text-align:left;color:inherit;font:inherit;text-decoration:none"><i>🔒</i><span class="grow"><b>Политика конфиденциальности</b><br><span class="muted small">Какие данные мы храним и зачем</span></span><u>›</u></a>
    <button class="card link" data-share="1" style="text-align:left;color:inherit;font:inherit;cursor:pointer"><i>📣</i><span class="grow"><b>Поделиться</b><br><span class="muted small">Отправьте ссылку другу</span></span><u>›</u></button>
    <div class="card">${langSelect()}</div>
    <form class="card stack" id="pass"><h3>Сменить пароль</h3>
      <label class="field">Текущий пароль<input type="password" name="current" required autocomplete="current-password"></label>
      <label class="field">Новый пароль<input type="password" name="next" required minlength="6" autocomplete="new-password" placeholder="минимум 6 символов"></label>
      <button type="submit" class="btn block">Сохранить пароль</button>
    </form>
    <button class="btn danger block" id="logout">Выйти</button>`;
  app.querySelector('#country').addEventListener('change', async (event) => {
    await db('PATCH', `users/${uid}`, { country: event.target.value });
    keep(S.session, { ...S.user, country: event.target.value });
    viewProfile({ client: forClient });
  });
  onSubmit(app.querySelector('#names'), async (form) => {
    const name = form.elements.name.value.trim();
    const nick = form.elements.nick.value.trim();
    if (name.length < 2) throw new Error('Имя — минимум 2 буквы.');
    if (name !== S.user.name) {
      await db('PATCH', `users/${uid}`, { name });
      keep(S.session, { ...S.user, name });
    }
    if (nick && nickKey(nick) !== (S.user.nick ?? '')) await changeNick(nick);
    toast('Сохранено');
    viewProfile({ client: forClient });
  });
  onClick('tg', async () => { await db('DELETE', `tg/${uid}`); S.cloud.tg = false; viewProfile({ client: forClient }); });
  onClick('talk', talk);
  onClick('share', async () => {
    const text = `Kovrix — ${D.motto}. Донат в игры и продажа аккаунтов: ${D.shareUrl}`;
    if (navigator.share) await navigator.share({ text }).catch(() => {});
    else { await navigator.clipboard.writeText(text); toast('Ссылка скопирована'); }
  });
  onSubmit(app.querySelector('#pass'), async (form) => {
    await changePassword(form.elements.current.value, form.elements.next.value);
    form.reset();
    toast('Пароль изменён');
  });
  app.querySelector('#logout').addEventListener('click', logout);
}

// Запуск сайта. routes — список [шаблон адреса, экран], первый подходящий
// показывается; gate — экран вместо всех остальных (вход, «нет доступа»).
// «в сети»: пока вкладка открыта и на экране, раз в полминуты — время сервера
const touchSeen = () => {
  if (S.user && document.visibilityState === 'visible') db('PUT', `seen/${S.user.uid}`, { '.sv': 'timestamp' }).catch(() => {});
};
setInterval(touchSeen, 30000);
document.addEventListener('visibilitychange', touchSeen);

function start({ routes, gate, tab }) {
  const tabs = document.getElementById('tabs');
  const render = async () => {
    const path = location.hash.slice(1) || '/';
    clearInterval(start.timer);
    if (!FB.apiKey || !FB.databaseURL) {
      tabs.hidden = true;
      app.innerHTML = '<p class="card muted">Сайт ещё не подключён к серверу. Выполните npm run web — см. README.md.</p>';
      return;
    }
    const enter = path.match(/^\/enter\/([0-9a-f]{48})$/);
    if (enter) {
      app.innerHTML = '<p class="muted center">Входим…</p>';
      await enterByLink(enter[1]).then(() => toast(`Вы вошли: ${S.user.name}`), (e) => toast(e.message, true));
      history.replaceState(null, '', '#/');
      return render();
    }
    if (S.user) await loadCloud().catch(() => {});
    // фото-обложки игр от админа (covers/<игра>) — один раз за открытие сайта
    if (!S.covers) S.covers = (await db('GET', 'covers').catch(() => null)) ?? {};
    touchSeen();
    if (S.user && S.cloud.blocked) {
      tabs.hidden = true;
      app.innerHTML = '<p class="card err">⛔ Аккаунт заблокирован администратором.</p><button class="btn danger block" id="logout">Выйти</button>';
      app.querySelector('#logout').addEventListener('click', logout);
      return;
    }
    const blocked = await gate(render);
    tabs.hidden = blocked;
    if (blocked) return;
    tabs.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab(path)));
    for (const [pattern, view] of routes) {
      const match = path.match(pattern);
      if (match) {
        try {
          await view(...match.slice(1).map(decodeURIComponent));
        } catch (e) {
          app.innerHTML = `<p class="card err">${esc(e.message)}</p>`;
        }
        break;
      }
    }
    if (!path.startsWith('/chat/')) window.scrollTo(0, 0);
  };
  window.addEventListener('hashchange', render);
  render();
  return render;
}
