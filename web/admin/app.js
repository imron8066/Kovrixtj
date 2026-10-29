'use strict';
// Сайт админа и заместителей: донаты, аккаунты и подтверждение продаж,
// чаты поддержки, награды; админу — ещё цены, акции, задания, курсы,
// реквизиты, доступы и блокировка. То же, что приложение KovriX A
// (src/admin). Войти может любой, но данные откроются только тому, у кого
// есть роль в разделе roles базы Firebase, — это проверяют правила базы.

const A = { onlyNew: true };
const isAdmin = () => S.cloud.role === 'admin';
// код KovriX A: в этом браузере сотрудник уже вводил его (donix:team)
const teamDone = () => { try { return (JSON.parse(localStorage.getItem('donix:team')) ?? []).includes(S.user?.uid); } catch { return false; } };
const markTeam = () => { try { localStorage.setItem('donix:team', JSON.stringify([...(JSON.parse(localStorage.getItem('donix:team')) ?? []), S.user.uid])); } catch { /* браузер не даёт сохранить */ } };
const needCode = () => !S.cloud.owner && (S.cloud.locked || (!!S.cloud.config.teamOn && !teamDone()));
const isStaff = () => (S.cloud.role === 'admin' || S.cloud.role === 'deputy') && !needCode();
// админу можно всё, заместителю — то, что отмечено в его списке доступов
const can = (perm) => isAdmin() || (S.cloud.role === 'deputy' && !!S.cloud.perms[perm]);

const KINDS = {
  orders: { done: '✓ Подтвердить донат', photos: '🖼 Показать чек' },
  listings: { done: '✓ На витрину', photos: '🖼 Показать фото' },
  sales: { done: '✓ Подтвердить продажу', photos: '🖼 Показать чек' },
  claims: { done: '✓ Выдал награду', photos: '' },
};

function setCount(id, count) {
  const el = document.getElementById(`count-${id}`);
  el.hidden = !count;
  el.textContent = count;
}
const fresh = (items) => items.filter((item) => item.status === 'new').length;

// крупные значения, которые копируются нажатием (ID игрока, телефон)
const copyKv = (pairs) => pairs.filter(([, v]) => v).map(([k, v]) => `<button type="button" class="copy" data-copy="${esc(v)}" data-label="${esc(k)}"><span>${esc(k)}</span><b>${esc(v)}</b><i>📋</i></button>`).join('');
document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-copy]');
  if (!el) return;
  navigator.clipboard.writeText(el.dataset.copy).then(() => toast(`${el.dataset.label} скопирован: ${el.dataset.copy}`), () => toast('Не удалось скопировать', true));
});

function requestCard(kind, item, orders = []) {
  const game = gameById(item.game);
  let title = keyOf(item);
  let price = '';
  let details;
  let ids = [];
  let warnings = [];
  if (kind === 'orders') {
    warnings = orderWarnings(item, orders);
    ids = fieldPairs(game?.fields ?? [], item.fields);
    title = `${item.code} · ${game?.name ?? item.game}`;
    // клиент платил в своей валюте — рядом показана сумма в сомони
    price = item.total && item.currency && item.currency !== 'TJS' ? `${amount(item.total, item.currency)} · ${amount(item.price)}` : amount(item.price);
    details = [['Донат', item.item], ['Способ', item.method], ...(item.check ? [['Проверка ID', item.check]] : []), ...(item.pay ? [['Оплата', item.pay]] : []), ...(item.txn ? [['№ операции', item.txn]] : []), ...(item.promo ? [[item.promoCode ? 'Промокод' : 'Акция', item.promo]] : [])];
  } else if (kind === 'listings') {
    title = `${item.code} · ${game?.name ?? item.game}`;
    price = amount(item.price);
    details = [['Заголовок', item.title], ['Торг', item.bargain ? 'да' : 'нет'], ...fieldPairs(game?.accountAttrs ?? [], item.attrs), ['Описание', item.description], ...(item.video ? [['Видео', item.video]] : [])];
  } else if (kind === 'sales') {
    title = `Продан ${item.code}`;
    price = amount(item.price);
    details = [['Аккаунт', item.title]];
  } else {
    title = item.title;
    details = [['Награда', item.reward], ['Как выполнил', item.proof]];
  }
  const c = item.client ?? {};
  return `<div class="card stack tight" data-uid="${esc(item.uid)}" data-key="${esc(keyOf(item))}">
    <div class="row between"><b>${esc(title)}</b>${badge(kind, item.status)}</div>
    ${price ? `<span class="price">${price}</span>` : ''}
    ${warnings.map((w) => `<p class="warn-box">⚠️ ${esc(w)}</p>`).join('')}
    <div data-swapped></div>
    ${copyKv(ids)}
    ${kv(details)}
    <h3>Клиент · нажмите, чтобы скопировать</h3>
    ${copyKv([['ID', c.id], ['Телефон', c.phone]])}
    ${kv([['Имя', c.name]])}
    ${KINDS[kind].photos ? `<div data-photos><button class="btn ghost sm" data-act="photos">${KINDS[kind].photos}</button></div>` : ''}
    ${item.status === 'sold' ? '' : `<label class="field">Ответ клиенту (необязательно)<input type="text" data-note maxlength="300" value="${esc(item.note)}" placeholder="Например: донат зачислен"></label>
    <div class="row">
      <button class="btn sm grow" data-act="done">${KINDS[kind].done}</button>
      <button class="btn danger sm grow" data-act="rejected">✕ Отклонить</button>
    </div>`}
    <span class="muted small">${date(item.createdAt)}${item.decidedAt ? ` · решение ${date(item.decidedAt)}${item.decidedBy ? `, ${esc(item.decidedBy)}` : ''}` : ''}</span>
  </div>`;
}

const SWAPPED = 'Скриншот чека отличается от того, что клиент приложил при заказе — фото подменили.';

// Список заявок одного вида. tabs — переключатель над списком.
async function viewRequests(kind, tabs = '') {
  const draw = async () => {
    const items = await all(kind);
    const shown = A.onlyNew ? items.filter((item) => item.status === 'new') : items;
    app.innerHTML = `${tabs}
      <div class="chips">
        <button class="chip ${A.onlyNew ? 'on' : ''}" data-filter="new">Новые (${fresh(items)})</button>
        <button class="chip ${A.onlyNew ? '' : 'on'}" data-filter="all">Все (${items.length})</button>
      </div>
      ${shown.map((item) => requestCard(kind, item, kind === 'orders' ? items : [])).join('') || '<p class="card muted center">Здесь пока пусто. Список обновляется сам.</p>'}`;
    app.querySelectorAll('[data-filter]').forEach((el) => el.addEventListener('click', () => { A.onlyNew = el.dataset.filter === 'new'; draw(); }));
    app.querySelectorAll('[data-act]').forEach((button) => button.addEventListener('click', () => busy(button, async () => {
      const card = button.closest('[data-key]');
      const item = items.find((x) => x.uid === card.dataset.uid && keyOf(x) === card.dataset.key);
      if (button.dataset.act === 'photos') {
        const photos = (await db('GET', `photos/${item.uid}/${kind === 'sales' ? item.photo : keyOf(item)}`)) ?? [];
        card.querySelector('[data-photos]').innerHTML = photos.length ? photosHtml(photos) : '<span class="muted small">Фото нет.</span>';
        // чек — последнее фото заказа: сверяем с тем, что клиент приложил при заказе
        if (kind === 'orders' && item.receipt && photos.length && fingerprint(photos[photos.length - 1]) !== item.receipt) {
          card.dataset.swapped = '1';
          card.querySelector('[data-swapped]').innerHTML = `<p class="warn-box">⚠️ ${SWAPPED}</p>`;
        }
        return;
      }
      // зачисление доната — в два шага: сначала сверить деньги в банке
      if (kind === 'orders' && button.dataset.act === 'done') {
        const alarms = [...orderWarnings(item, items), ...(card.dataset.swapped ? [SWAPPED] : [])];
        const sum = item.total && item.currency && item.currency !== 'TJS' ? amount(item.total, item.currency) : amount(item.price);
        // eslint-disable-next-line no-alert
        if (!window.confirm(`${alarms.length ? `⚠️ ПРОВЕРЬТЕ ЕЩЁ РАЗ\n\n${alarms.join('\n\n')}\n\n` : ''}Зачислять только если в банке есть перевод на ${sum}${item.txn ? ` с номером операции ${item.txn}` : ''}.\n\nДеньги пришли?`)) return;
      }
      await decide(kind, item, button.dataset.act, card.querySelector('[data-note]').value.trim());
      toast('Сохранено');
      await draw();
      counts();
    })));
  };
  await draw();
  // пока админ пишет ответ, список не перерисовывается
  start.timer = setInterval(() => {
    if (!app.contains(document.activeElement) || document.activeElement.tagName !== 'INPUT') draw().catch(() => {});
  }, D.refreshMs);
}

const accountTabs = (kind) => `<div class="chips"><a class="chip ${kind === 'listings' ? 'on' : ''}" href="#/listings">Объявления</a><a class="chip ${kind === 'sales' ? 'on' : ''}" href="#/sales">Продажи с чеком</a></div>`;

async function viewChats() {
  const chats = await loadChats('staff');
  app.innerHTML = `<h2>Поддержка и сотрудничество</h2>${chats.map((chat) => chatRow(chat, 'staff')).join('') || '<p class="card muted center">Обращений пока нет.</p>'}`;
}

// ——— управление (только админ) ———

// раздел, название и доступ, который для него нужен
const SECTIONS = [['claims', 'Награды', 'claims'], ['stats', 'Статистика', 'stats'], ['history', 'История', 'stats'], ['news', 'Новости', 'promos'], ['prices', 'Цены и товары', 'prices'], ['promos', 'Акции', 'promos'], ['tasks', 'Задания', 'tasks'], ['rates', 'Курсы', 'money'], ['pay', 'Реквизиты', 'money'], ['people', 'Люди', 'block']];
const openSections = () => [...SECTIONS.filter(([, , perm]) => can(perm)), ...(S.cloud.owner ? [['code', 'Код KovriX A']] : [])];
const sectionTabs = (current) => (openSections().length > 1 ? `<div class="chips">${openSections().map(([key, name]) => `<a class="chip ${key === current ? 'on' : ''}" href="#/more/${key}">${name}</a>`).join('')}</div>` : '');
const DAY = 864e5;
const saved = async (text) => { await loadCloud(); toast(text); };

function viewPrices(id = GAMES[0].id) {
  // цены меняются у товаров из games.ts; свои товары — отдельным списком
  const base = gameById(id);
  const own = S.cloud.config.prices?.[id];
  const game = { ...base, products: base.products.map((p, i) => ({ ...p, price: own?.products?.[i] ?? p.price })), custom: base.custom && { ...base.custom, rate: own?.rate ?? base.custom.rate } };
  const added = Object.entries(S.cloud.config.products?.[id] ?? {});
  app.innerHTML = `${sectionTabs('prices')}
    <form class="card stack" id="prices">
      <label class="field">Игра<select id="game">${GAMES.map((g) => `<option value="${g.id}" ${g.id === id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
      ${game.custom ? `<label class="field">Цена за 1 ${esc(game.currency)}, смн<input type="text" name="rate" inputmode="decimal" value="${game.custom.rate}"></label>` : ''}
      ${game.products.map((p, i) => `<label class="field">${esc(p.title)}, смн<input type="text" name="p${i}" inputmode="decimal" value="${p.price}"></label>`).join('')}
      <p class="muted small">Клиент увидит новую цену в течение полминуты. В другие валюты она пересчитывается по курсу из раздела «Курсы».</p>
      <button type="submit" class="btn">Сохранить цены</button></form>
    <form class="card stack" id="product"><h3>Свои товары в ${esc(game.name)}</h3>
      <p class="muted small">Добавьте то, чего нет в списке: ваучер, пропуск, набор. Клиент увидит товар рядом с остальными пакетами.</p>
      ${added.map(([key, p]) => `<div class="row between"><b>${esc(p.title)} · ${esc(p.price)} смн</b><button type="button" class="btn danger sm" data-remove="${esc(key)}">Удалить</button></div>`).join('')}
      <label class="field">Название<input type="text" name="title" maxlength="60" required minlength="2" placeholder="Например: Ваучер на 100 алмазов"></label>
      <label class="field">Цена, смн<input type="text" name="price" inputmode="decimal" maxlength="8" required></label>
      <button type="submit" class="btn ghost">＋ Добавить товар</button></form>
    <form class="card stack" id="cover"><h3>Обложка ${esc(game.name)}</h3>
      <p class="muted small">Своё фото для плитки игры в приложении и на сайте. Лучше горизонтальное (16:9) — с логотипом или названием игры.</p>
      ${S.covers?.[id] ? `<img class="cover-preview" src="${esc(S.covers[id])}" alt="">` : ''}
      <label class="file"><span>🖼</span><span>Выбрать фото</span><input type="file" name="photo" accept="image/*"></label>
      <div class="row wrap"><button type="submit" class="btn">Сохранить обложку</button><button type="button" class="btn danger sm" data-cover-reset="1">Вернуть стандартную</button></div></form>`;
  // как saveCover в src/shared/api.ts
  onSubmit(app.querySelector('#cover'), async (form) => {
    const file = form.elements.photo.files[0];
    if (!file) throw new Error('Выберите фото.');
    const photo = await compress(file, 1280);
    await db('PUT', `covers/${id}`, photo);
    S.covers = { ...S.covers, [id]: photo };
    toast(`Обложка ${game.name} сохранена`);
    viewPrices(id);
  });
  onClick('cover-reset', async () => {
    await db('DELETE', `covers/${id}`);
    const { [id]: _gone, ...rest } = S.covers ?? {};
    S.covers = rest;
    toast('Обложка сброшена');
    viewPrices(id);
  });
  onClick('remove', async (key) => { await db('DELETE', `config/products/${id}/${key}`); await loadCloud(); viewPrices(id); });
  onSubmit(app.querySelector('#product'), async (form) => {
    const price = num(form.elements.price.value);
    if (!(price > 0)) throw new Error('Цена должна быть числом больше нуля.');
    await db('PUT', `config/products/${id}/${Date.now().toString(36)}`, { title: form.elements.title.value.trim(), price });
    await saved(`Товар добавлен в ${game.name}`);
    viewPrices(id);
  });
  app.querySelector('#game').addEventListener('change', (event) => viewPrices(event.target.value));
  onSubmit(app.querySelector('#prices'), async (form) => {
    const products = Object.fromEntries(game.products.map((p, i) => [i, num(form.elements[`p${i}`].value)]));
    const rate = game.custom && num(form.elements.rate.value);
    if (Object.values(products).some((price) => !(price >= 0)) || (game.custom && !(rate > 0))) throw new Error('Цена должна быть числом. 0 — товар скрыт от клиентов.');
    await db('PUT', `config/prices/${id}`, { products, ...(rate && { rate }) });
    await saved(`Цены ${game.name} сохранены`);
  });
}

function viewPromos() {
  app.innerHTML = `${sectionTabs('promos')}
    ${S.cloud.promos.map((p) => `<div class="card stack tight"><div class="row between"><b>−${p.percent}% · ${esc(p.title)}</b><span class="badge ${p.until > Date.now() ? 'ok' : 'warn'}">${p.until > Date.now() ? 'Идёт' : 'Закончилась'}</span></div>
      <span class="muted small">${esc(gameById(p.game)?.name ?? 'Все игры')} · до ${date(p.until)}</span><button class="btn danger sm" data-remove="${esc(p.id)}">Удалить</button></div>`).join('')}
    <form class="card stack" id="promo"><h3>Новая акция</h3>
      <label class="field">Название<input type="text" name="title" maxlength="60" required minlength="3" placeholder="Например: Выходные со скидкой"></label>
      <label class="field">Скидка, %<input type="text" name="percent" inputmode="decimal" maxlength="4" required></label>
      <label class="field">Сколько дней действует<input type="text" name="days" inputmode="decimal" maxlength="4" value="3" required></label>
      <label class="field">На что<select name="game"><option value="">Все игры</option>${GAMES.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label>
      <button type="submit" class="btn">Запустить акцию</button></form>
    <form class="card stack" id="daily"><h3>Промокод дня</h3>
      <p class="muted small">Каждый день в 00:00 (Душанбе) бот сам меняет код и присылает его команде в Telegram. Код действует до конца дня. Пусто — товар без скидки.</p>
      <label class="field">Игра<select name="game">${GAMES.filter((g) => !g.off).map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label>
      <b id="daily-code">…</b><div class="stack tight" id="daily-prices"></div>
      <button type="submit" class="btn">Сохранить цены</button>
      <button type="button" class="btn ghost sm" id="daily-renew">Новый код прямо сейчас</button></form>
    <h3>Промокоды</h3>
    ${S.cloud.codes.map((c) => { const live = !c.until || c.until > Date.now(); return `<div class="card stack tight"><div class="row between"><b>${esc(c.id)}</b><span class="badge ${live ? 'ok' : 'warn'}">${live ? 'Действует' : 'Закончился'}</span></div>
      <span class="muted small">${esc(gameById(c.game)?.name ?? 'Все игры')} · ${esc(codeText(c))} · ${c.until ? `до ${date(c.until)}` : 'бессрочно'}</span><button class="btn danger sm" data-uncode="${esc(c.id)}">Удалить</button></div>`; }).join('')}
    <form class="card stack" id="code"><h3>Новый промокод</h3>
      <p class="muted small">Клиент вводит код при заказе. Своя цена на один товар (например, 100 алмазов за 9 смн) или скидка % на всю игру.</p>
      <label class="field">Код<input type="text" name="code" maxlength="20" required placeholder="Например: ILMHONA" style="text-transform:uppercase"></label>
      <label class="field">Игра<select name="game"><option value="">Все игры</option>${GAMES.map((g) => `<option value="${g.id}" ${g.id === GAMES[0].id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
      <label class="field">Товар<select name="product"></select></label>
      <label class="field"><span id="code-value">Скидка, %</span><input type="text" name="value" inputmode="decimal" maxlength="7" required></label>
      <label class="field">Сколько дней действует (пусто — бессрочно)<input type="text" name="days" inputmode="decimal" maxlength="4"></label>
      <button type="submit" class="btn">Создать промокод</button></form>`;
  onClick('remove', async (id) => { await db('DELETE', `promos/${id}`); await loadCloud(); viewPromos(); });
  onClick('uncode', async (id) => { await db('DELETE', `codes/${id}`); await loadCloud(); viewPromos(); });
  // промокод дня: цены в daily/<игра>/prices, код меняет бот
  const dailyForm = app.querySelector('#daily');
  let shown = [];
  const fillDaily = async () => {
    const id = dailyForm.elements.game.value;
    const daily = await db('GET', `daily/${id}`).catch(() => null);
    const live = daily?.code && S.cloud.codes.find((c) => c.id === daily.code);
    dailyForm.querySelector('#daily-code').textContent = live ? `Сегодня: ${live.id}` : 'Код ещё не выдан';
    shown = priced(gameById(id)).products;
    dailyForm.querySelector('#daily-prices').innerHTML = shown.map((p, i) => `<label class="field">${esc(p.title)} (обычная ${p.price}), смн<input type="text" name="d${i}" inputmode="decimal" maxlength="7" value="${daily?.prices?.[p.title] ?? ''}"></label>`).join('');
  };
  dailyForm.elements.game.addEventListener('change', fillDaily);
  fillDaily();
  onSubmit(dailyForm, async (form) => {
    const prices = {};
    shown.forEach((p, i) => {
      const text = form.elements[`d${i}`].value.trim();
      const n = num(text);
      if (text && !(n > 0 && n < p.price)) throw new Error(`«${p.title}»: цена по коду должна быть меньше обычной (${p.price} смн).`);
      if (n > 0) prices[p.title] = n;
    });
    await db('PATCH', `daily/${form.elements.game.value}`, { prices });
    await saved('Цены промокода дня сохранены');
    viewPromos();
  });
  dailyForm.querySelector('#daily-renew').addEventListener('click', async () => {
    await db('PATCH', `daily/${dailyForm.elements.game.value}`, { day: null });
    await saved('Бот сменит код в течение минуты — обновите страницу');
  });
  const codeForm = app.querySelector('#code');
  // товары выбранной игры; «любой» — скидка в процентах
  const fillProducts = () => {
    const game = gameById(codeForm.elements.game.value);
    const titles = game ? [...game.products.map((p) => p.title), ...Object.values(S.cloud.config.products?.[game.id] ?? {}).map((p) => p.title)] : [];
    codeForm.elements.product.innerHTML = [['', 'Любой — скидка в %'], ...titles.map((t) => [t, t])].map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    syncLabel();
  };
  const syncLabel = () => {
    const product = codeForm.elements.product.value;
    codeForm.querySelector('#code-value').textContent = product ? `Цена «${product}», смн` : 'Скидка, %';
  };
  codeForm.elements.game.addEventListener('change', fillProducts);
  codeForm.elements.product.addEventListener('change', syncLabel);
  fillProducts();
  onSubmit(codeForm, async (form) => {
    const key = codeKey(form.elements.code.value);
    const value = num(form.elements.value.value);
    const product = form.elements.product.value;
    const days = num(form.elements.days.value);
    if (key.length < 3 || !(value > 0) || (!product && !(value < 100))) throw new Error('Нужен код от 3 букв и цена в сомони (или скидка от 1 до 99%).');
    await db('PUT', `codes/${key}`, { game: form.elements.game.value, ...(product ? { product, price: value } : { percent: value }), until: days > 0 ? Date.now() + days * DAY : 0 });
    await saved(`Промокод ${key} создан`);
    viewPromos();
  });
  onSubmit(app.querySelector('#promo'), async (form) => {
    const percent = num(form.elements.percent.value);
    const days = num(form.elements.days.value);
    if (!(percent > 0 && percent < 100) || !(days > 0)) throw new Error('Нужны скидка от 1 до 99% и срок в днях.');
    await db('PUT', `promos/${Date.now().toString(36)}`, { title: form.elements.title.value.trim(), percent, game: form.elements.game.value, until: Date.now() + days * DAY });
    await saved('Акция запущена');
    viewPromos();
  });
}

// Статистика: выручка, заказы, новые клиенты и приглашения за период
async function viewStats(period = 'week') {
  const [orders, users, invites] = await Promise.all([all('orders'), db('GET', 'users'), db('GET', 'invites').catch(() => null)]);
  const since = Date.now() - PERIODS.find(([key]) => key === period)[2];
  const inPeriod = orders.filter((o) => o.createdAt >= since);
  const done = inPeriod.filter((o) => o.status === 'done');
  const revenue = done.reduce((sum, o) => sum + (o.price || 0), 0);
  const people = Object.values(users ?? {});
  const byId = new Map(people.map((u) => [String(u.id), u]));
  const games = Object.entries(done.reduce((acc, o) => ({ ...acc, [o.game]: (acc[o.game] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const inviters = Object.entries(invites ?? {}).map(([id, friends]) => ({ id, count: Object.values(friends).filter((f) => f.at >= since).length }))
    .filter((r) => r.count).sort((a, b) => b.count - a.count);
  const invited = inviters.reduce((sum, r) => sum + r.count, 0);
  app.innerHTML = `${sectionTabs('stats')}
    <div class="chips">${PERIODS.map(([key, name]) => `<button class="chip ${key === period ? 'on' : ''}" data-period="${key}">${name}</button>`).join('')}</div>
    <div class="card stack tight"><h3>💰 Выручка: ${money(revenue)}</h3>${kv([['Выполнено заказов', done.length], ['Ждут решения', inPeriod.filter((o) => o.status === 'new').length], ['Отклонено', inPeriod.filter((o) => o.status === 'rejected').length], ['Средний чек', done.length ? money(Math.round(revenue / done.length)) : '—'], ['Покупателей', new Set(done.map((o) => o.uid)).size]])}</div>
    <div class="card stack tight"><h3>👤 Клиенты</h3>${kv([['Новых за период', people.filter((u) => u.createdAt >= since).length], ['Пришли по приглашению', invited], ['Всего аккаунтов', people.length]])}</div>
    ${games.length ? `<div class="card stack tight"><h3>🎮 Популярные игры</h3>${kv(games.map(([g, n]) => [gameById(g)?.name ?? g, `${n} зак.`]))}</div>` : ''}
    ${inviters.length ? `<div class="card stack tight"><h3>👥 Лучшие по приглашениям</h3>${kv(inviters.slice(0, 10).map((r) => [`${byId.get(r.id)?.name ?? '—'} · ID ${r.id}`, `${r.count} друз.`]))}</div>` : ''}`;
  onClick('period', (key) => viewStats(key));
}

// Журнал команды: кто, когда и что решил; записи нельзя изменить или стереть.
// Поиск — по имени, ID, телефону, коду, сотруднику, дню и времени
const KIND_NAMES = { orders: '🎮 Донат', listings: '🏷 Объявление', sales: '🤝 Продажа', claims: '🎯 Награда' };
const HISTORY_PAGE = 150;
let historyFilter = { text: '', day: '', from: '', to: '' };
const minutesOf = (hhmm) => { const m = String(hhmm).trim().match(/^(\d{1,2})[:.]?(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
function matchHistory(e, f) {
  const at = new Date(e.at);
  // поле даты отдаёт ГГГГ-ММ-ДД
  if (f.day) {
    const [y, mo, d] = f.day.split('-').map(Number);
    if (at.getFullYear() !== y || at.getMonth() + 1 !== mo || at.getDate() !== d) return false;
  }
  const now = at.getHours() * 60 + at.getMinutes();
  const from = minutesOf(f.from), to = minutesOf(f.to);
  if ((from !== null && now < from) || (to !== null && now > to)) return false;
  const where = [e.code, e.title, e.byName, e.note, e.client?.name, e.client?.id, e.client?.phone].filter((v) => v !== undefined && v !== null).join(' ').toLowerCase();
  return f.text.toLowerCase().split(/\s+/).filter(Boolean).every((word) => where.includes(word));
}
const historyCard = (e) => `<div class="card stack tight"><div class="row between"><b>${KIND_NAMES[e.kind] ?? esc(e.kind)} · ${esc(e.code)}</b><span class="badge ${e.status === 'done' ? 'ok' : 'warn'}">${e.status === 'done' ? 'Принято' : 'Отклонено'}</span></div>
      ${kv([['Кто', e.byName || e.by], ['Когда', date(e.at)], ['Что', e.title], ...(e.amount !== undefined ? [['Сумма', amount(e.amount)]] : []), ['Клиент', `${e.client?.name ?? ''} · ID ${e.client?.id ?? ''}${e.client?.phone ? ` · ${e.client.phone}` : ''}`], ...(e.note ? [['Ответ', e.note]] : [])])}</div>`;
async function viewHistory(who = 'all') {
  const entries = list(await db('GET', 'history')).sort((a, b) => b.at - a.at);
  const staff = [...new Map(entries.map((e) => [e.by, e.byName])).entries()];
  const f = historyFilter;
  app.innerHTML = `${sectionTabs('history')}
    <p class="card muted small">Каждое «Подтвердить» и «Отклонить» записывается сюда: кто, когда, какой заказ и на какую сумму. Записи хранятся всегда — их нельзя изменить или удалить из приложения.</p>
    <form class="card stack" id="hfilter" onsubmit="return false">
      <label class="field">Поиск: имя, ID, телефон, код заказа или сотрудник<input type="search" name="text" value="${esc(f.text)}" placeholder="например: 482913" autocomplete="off" autocapitalize="off"></label>
      <label class="field">День<input type="date" name="day" value="${esc(f.day)}"></label>
      <div class="row"><label class="field grow">Время с<input type="time" name="from" value="${esc(f.from)}"></label><label class="field grow">до<input type="time" name="to" value="${esc(f.to)}"></label></div>
      <button type="button" class="btn sm ghost" id="hreset">Сбросить поиск</button>
    </form>
    ${staff.length > 1 ? `<div class="chips">${[['all', 'Все'], ...staff].map(([uid, name]) => `<button class="chip ${uid === who ? 'on' : ''}" data-who="${esc(uid)}">${esc(name || uid)}</button>`).join('')}</div>` : ''}
    <p class="muted small" id="hcount"></p>
    <div class="stack" id="hlist"></div>`;
  const form = app.querySelector('#hfilter');
  let limit = HISTORY_PAGE;
  // при вводе меняется только список — поле не теряет курсор
  const draw = () => {
    const found = entries.filter((e) => (who === 'all' || e.by === who) && matchHistory(e, historyFilter));
    const typed = Object.values(historyFilter).some(Boolean);
    app.querySelector('#hcount').textContent = typed || who !== 'all' ? `Найдено: ${found.length} из ${entries.length}` : `Всего записей: ${entries.length}`;
    app.querySelector('#hreset').hidden = !typed;
    app.querySelector('#hlist').innerHTML = found.slice(0, limit).map(historyCard).join('')
      + (found.length > limit ? `<button type="button" class="btn ghost block" id="hmore">Показать ещё (${found.length - limit})</button>` : '')
      || `<p class="card muted">${entries.length ? 'Ничего не найдено — измените поиск.' : 'Пока пусто — решений ещё не было.'}</p>`;
    app.querySelector('#hmore')?.addEventListener('click', () => { limit += HISTORY_PAGE; draw(); });
  };
  form.addEventListener('input', () => {
    historyFilter = Object.fromEntries(['text', 'day', 'from', 'to'].map((k) => [k, form.elements[k].value.trim()]));
    limit = HISTORY_PAGE;
    draw();
  });
  app.querySelector('#hreset').addEventListener('click', () => { historyFilter = { text: '', day: '', from: '', to: '' }; viewHistory(who); });
  onClick('who', (uid) => viewHistory(uid));
  draw();
}

// Новости: видны на главной у всех, бот рассылает их в Telegram
async function viewNews() {
  await loadCloud();
  app.innerHTML = `${sectionTabs('news')}
    <form class="card stack" id="news"><h3>Новая новость</h3>
      <p class="muted small">Появится на главной в приложении и на сайте у всех клиентов, а бот пришлёт её каждому, кто подключил Telegram. Подойдёт для акций, новых игр и обновлений.</p>
      <label class="field">Текст<textarea name="text" maxlength="800" required minlength="5" placeholder="Например: Сегодня алмазы Free Fire со скидкой 10%!"></textarea></label>
      <button type="submit" class="btn">📢 Опубликовать и разослать</button></form>
    ${S.cloud.news.map((n) => `<div class="card stack tight"><div class="row between"><b>${date(n.at)}</b><span class="badge ${n.sent === undefined ? 'warn' : 'ok'}">${n.sent === undefined ? 'Рассылается…' : `В Telegram: ${n.sent}`}</span></div>
      <p class="pre">${esc(n.text)}${n.by ? `\n— ${esc(n.by)}` : ''}</p><button class="btn danger sm" data-remove="${esc(n.id)}">Удалить</button></div>`).join('')}`;
  onClick('remove', async (id) => { await db('DELETE', `news/${id}`); await viewNews(); });
  onSubmit(app.querySelector('#news'), async (form) => {
    await db('POST', 'news', { text: form.elements.text.value.trim(), by: S.user.name, at: Date.now() });
    toast('Опубликовано. Бот разошлёт новость в Telegram в течение минуты.');
    await viewNews();
  });
}

async function viewTasks() {
  const tasks = list(await db('GET', 'tasks')).sort((a, b) => b.createdAt - a.createdAt);
  const rule = S.cloud.config.referral;
  app.innerHTML = `${sectionTabs('tasks')}
    <form class="card stack" id="referral"><h3>👥 Награда за друзей</h3>
      <p class="muted small">У каждого клиента есть ссылка-приглашение (вкладка «Топ»). Когда по ней зарегистрируется нужное число друзей, клиент нажмёт «Получить» — заявка придёт в «Награды» со списком друзей.</p>
      <label class="field">Сколько друзей нужно<input type="text" name="need" inputmode="numeric" maxlength="3" required value="${esc(rule?.need ?? 5)}"></label>
      <label class="field">Награда<input type="text" name="reward" maxlength="60" required minlength="2" placeholder="Например: 100 алмазов Free Fire" value="${esc(rule?.reward ?? '')}"></label>
      <button type="submit" class="btn sm">${rule ? 'Сохранить' : 'Включить награду'}</button>
      ${rule ? '<button type="button" class="btn danger sm" data-referral="off">Выключить награду</button>' : ''}</form>
    ${tasks.map((t) => `<div class="card stack tight"><b>${esc(t.title)}</b><p class="pre muted small">${esc(t.text)}\n🎁 ${esc(t.reward)} · до ${date(t.until)}</p><button class="btn danger sm" data-remove="${esc(t.id)}">Удалить</button></div>`).join('')}
    <form class="card stack" id="task"><h3>Новое задание</h3>
      <label class="field">Название<input type="text" name="title" maxlength="60" required minlength="3" placeholder="Например: Пригласи друга"></label>
      <label class="field">Что нужно сделать<textarea name="text" maxlength="500"></textarea></label>
      <label class="field">Награда<input type="text" name="reward" maxlength="60" required placeholder="Например: 100 BC или скидка 10%"></label>
      <label class="field">Сколько дней действует<input type="text" name="days" inputmode="decimal" maxlength="4" value="7" required></label>
      <button type="submit" class="btn">Опубликовать задание</button></form>`;
  onClick('remove', async (id) => { await db('DELETE', `tasks/${id}`); await viewTasks(); });
  onSubmit(app.querySelector('#referral'), async (form) => {
    const need = Math.round(num(form.elements.need.value));
    if (!(need >= 1 && need <= 100)) throw new Error('Число друзей — от 1 до 100.');
    await db('PUT', 'config/referral', { need, reward: form.elements.reward.value.trim() });
    await saved('Сохранено');
    await viewTasks();
  });
  onClick('referral', async () => { await db('DELETE', 'config/referral'); await saved('Награда выключена'); await viewTasks(); });
  onSubmit(app.querySelector('#task'), async (form) => {
    const days = num(form.elements.days.value);
    if (!(days > 0)) throw new Error('Укажите срок в днях.');
    await db('PUT', `tasks/${Date.now().toString(36)}`, { title: form.elements.title.value.trim(), text: form.elements.text.value.trim(), reward: form.elements.reward.value.trim(), until: Date.now() + days * DAY, createdAt: Date.now() });
    toast('Задание опубликовано');
    await viewTasks();
  });
}

function viewRates() {
  const foreign = Object.keys(D.currencies).filter((key) => key !== 'TJS');
  app.innerHTML = `${sectionTabs('rates')}
    <form class="card stack" id="rates"><p class="muted small">Цены записаны в сомони. Клиент из другой страны видит их в своей валюте — по этому курсу. Он же действует для цен аккаунтов.</p>
      ${foreign.map((key) => `<label class="field">1 смн = … ${esc(D.currencies[key].sign)} (${esc(D.currencies[key].name)})<input type="text" name="${key}" inputmode="decimal" value="${rateOf(key)}"></label>`).join('')}
      <button type="submit" class="btn">Сохранить курсы</button></form>`;
  onSubmit(app.querySelector('#rates'), async (form) => {
    const rates = Object.fromEntries(foreign.map((key) => [key, num(form.elements[key].value)]));
    if (Object.values(rates).some((rate) => !(rate > 0))) throw new Error('Курс должен быть числом больше нуля.');
    await db('PUT', 'config/rates', rates);
    await saved('Курсы сохранены');
  });
}

// код входа в KovriX A — только у владельца; смена кода выкидывает всех
async function viewTeamCode() {
  const on = !!S.cloud.config.teamOn;
  const code = on ? await db('GET', 'teamCode').catch(() => null) : null;
  app.innerHTML = `${sectionTabs('code')}
    <form class="card stack" id="code"><h3>🔐 Код входа в KovriX A</h3>
      <p class="muted small">${on ? `Сейчас код: <b>${esc(code ?? '—')}</b>. Без него заместители и админы не откроют KovriX A (приложение, сайт и бот команды) — даже с верным паролем. Вам код не нужен.` : 'Код выключен: в KovriX A входят по нику и паролю. Задайте код — и каждый сотрудник введёт его на своём телефоне.'}</p>
      <label class="field">${on ? 'Новый код' : 'Код'} (4–20 символов)<input type="text" name="code" minlength="4" maxlength="20" required autocomplete="off"></label>
      <button type="submit" class="btn">${on ? 'Сменить код' : 'Включить код'}</button>
      ${on ? '<button type="button" class="btn danger" id="off">Выключить код</button>' : ''}</form>`;
  onSubmit(app.querySelector('#code'), async (form) => {
    await db('PUT', 'teamCode', form.elements.code.value.trim());
    await db('PUT', 'config/teamOn', true);
    await saved('Код сохранён. Сообщите его команде.');
    await viewTeamCode();
  });
  app.querySelector('#off')?.addEventListener('click', async () => {
    await db('DELETE', 'config/teamOn');
    await db('DELETE', 'teamCode');
    await saved('Код выключен');
    await viewTeamCode();
  });
}

function viewPay() {
  app.innerHTML = `${sectionTabs('pay')}
    <form class="card stack" id="pay"><p class="muted small">Впишите номер карты или кошелька и имя получателя. Клиент видит только заполненные способы и копирует номер одним нажатием. Пустое поле — способ скрыт.</p>
      ${D.payMethods.map((m) => `<label class="field">${esc(m.name)}${S.cloud.config.pay?.[m.key]?.trim() ? ' ✅' : ' — скрыт'}<textarea name="${m.key}" maxlength="300" placeholder="${esc(m.hint)}">${esc(S.cloud.config.pay?.[m.key] ?? '')}</textarea></label>`).join('')}
      <button type="submit" class="btn">Сохранить реквизиты</button></form>`;
  onSubmit(app.querySelector('#pay'), async (form) => {
    await db('PUT', 'config/pay', { ...S.cloud.config.pay, ...Object.fromEntries(D.payMethods.map((m) => [m.key, form.elements[m.key].value.trim()])) });
    await saved('Реквизиты сохранены');
  });
}

// кому дать доступ админа или заместителя и кого заблокировать
async function viewPeople(query = '', onlineOnly = false) {
  const [users, roles, perms, blocked, seen] = await Promise.all([db('GET', 'users'), db('GET', 'roles'), db('GET', 'perms'), db('GET', 'blocked'), db('GET', 'seen')]);
  // «в сети» — приложение или сайт отмечались за последние 90 секунд
  const now = Date.now();
  const online = (uid) => (seen?.[uid] ?? 0) > now - 90000;
  const people = Object.values(users ?? {});
  const onlineCount = people.filter((u) => online(u.uid)).length;
  // сначала кто в сети, потом команда, потом клиенты — по последнему входу
  const found = people.sort((a, b) => Number(online(b.uid)) - Number(online(a.uid)) || Number(!!roles?.[b.uid]) - Number(!!roles?.[a.uid]) || (seen?.[b.uid] ?? 0) - (seen?.[a.uid] ?? 0) || b.createdAt - a.createdAt)
    .filter((u) => !onlineOnly || online(u.uid))
    .filter((u) => `${u.name} ${u.id} ${u.phone}`.toLowerCase().includes(query.trim().toLowerCase()));
  const admin = isAdmin();
  app.innerHTML = `${sectionTabs('people')}
    ${admin ? `<form class="card stack" id="staff"><h3>＋ Новый сотрудник</h3>
      <label class="field">Ник (латиницей)<input type="text" name="nick" maxlength="20" required pattern="[A-Za-z][A-Za-z0-9_.\-]{2,19}" autocomplete="off" autocapitalize="off"></label>
      <label class="field">Пароль (минимум 6 символов)<input type="text" name="password" maxlength="100" required minlength="6" autocomplete="off"></label>
      <label class="field">Кто он<select name="role"><option value="deputy">Заместитель</option><option value="admin">Админ — всё</option></select></label>
      <span class="muted small">Что разрешено заместителю:</span>${permBoxes(defaultPerms())}
      <button type="button" class="btn ghost sm" id="allperms">★ Отметить все доступы</button>
      <button type="submit" class="btn">Создать и дать доступ</button></form>` : ''}
    <label class="field">Поиск: имя, ID или телефон<input type="text" id="query" value="${esc(query)}" autocomplete="off"></label>
    <div class="chips"><button class="chip ${onlineOnly ? '' : 'on'}" data-online="">Все (${people.length})</button><button class="chip ${onlineOnly ? 'on' : ''}" data-online="1">🟢 В сети (${onlineCount})</button></div>
    ${found.slice(0, 50).map((u) => {
    const role = roles?.[u.uid];
    const isBlocked = !!blocked?.[u.uid];
    return `<div class="card stack tight"><div class="row between"><b>${esc(u.name)}</b>${isBlocked ? '<span class="badge bad">Заблокирован</span>' : role ? `<span class="badge info">${{ admin: 'Админ', deputy: 'Заместитель', bot: 'Бот' }[role]}</span>` : ''}</div>
      ${kv([['ID', u.id], ['Телефон', u.phone || u.login || '—'], ['Регистрация', date(u.createdAt)], ['В сети', online(u.uid) ? '🟢 сейчас' : seen?.[u.uid] ? `был(а) ${date(seen[u.uid])}` : 'ещё не заходил(а)']])}
      ${admin && role === 'deputy' ? `<span class="muted small">Доступы заместителя:</span>${permBoxes(perms?.[u.uid] ?? {}, u.uid)}` : ''}
      ${u.uid === S.user.uid || role === 'bot' ? '' : `<div class="row wrap">
        ${!admin ? '' : `${role !== 'admin' ? `<button class="btn ghost sm" data-role="admin" data-uid="${esc(u.uid)}">Сделать админом</button>` : ''}
        ${role !== 'deputy' ? `<button class="btn ghost sm" data-role="deputy" data-uid="${esc(u.uid)}">Сделать заместителем</button>` : ''}
        ${role ? `<button class="btn ghost sm" data-role="" data-uid="${esc(u.uid)}">Снять доступ</button>` : ''}
        ${role ? `<button class="btn ghost sm" data-pass="${esc(u.uid)}">Сменить пароль</button>` : ''}
        ${role === 'deputy' ? `<button class="btn ghost sm" data-allperms="${esc(u.uid)}">★ Дать все доступы</button>` : ''}
        <button class="btn danger sm" data-wipe="${esc(u.uid)}">Удалить аккаунт</button>`}
        ${!admin && role ? '' : `<button class="btn danger sm" data-block="${isBlocked ? '' : '1'}" data-uid="${esc(u.uid)}">${isBlocked ? 'Разблокировать' : 'Заблокировать'}</button>`}</div>`}</div>`;
  }).join('')}`;
  app.querySelector('#query').addEventListener('change', (event) => viewPeople(event.target.value, onlineOnly));
  onClick('online', (on) => viewPeople(query, !!on));
  onClick('role', async (role, el) => {
    // у нового заместителя сразу обычный набор доступов
    if (role === 'deputy' && !perms?.[el.dataset.uid]) await db('PUT', `perms/${el.dataset.uid}`, defaultPerms());
    await (role ? db('PUT', `roles/${el.dataset.uid}`, role) : db('DELETE', `roles/${el.dataset.uid}`));
    await viewPeople(query, onlineOnly);
  });
  app.querySelectorAll('[data-perm-uid]:not([data-perm-uid=""])').forEach((box) => box.addEventListener('change', async () => {
    const uid = box.dataset.permUid;
    const picked = Object.fromEntries([...app.querySelectorAll(`[data-perm-uid="${uid}"]:checked`)].map((el) => [el.value, true]));
    await db('PUT', `perms/${uid}`, picked).then(() => toast('Доступы сохранены'), (e) => toast(e.message, true));
  }));
  if (admin) {
    app.querySelector('#allperms').addEventListener('click', () => app.querySelectorAll('#staff [name=perm]').forEach((box) => { box.checked = true; }));
    onSubmit(app.querySelector('#staff'), async (form) => {
      const nick = form.elements.nick.value.trim();
      const password = form.elements.password.value;
      const role = form.elements.role.value;
      const picked = Object.fromEntries([...form.querySelectorAll('[name=perm]:checked')].map((el) => [el.value, true]));
      const id = await createStaff(nick, password, role, role === 'admin' ? {} : picked);
      alert(`Сотрудник добавлен\n\nНик: ${nick}\nПароль: ${password}\nID: ${id}\n\nПередайте ему ник и пароль — он входит в KovriX A на любом телефоне или на этом сайте.`);
      await viewPeople(query, onlineOnly);
    });
  }
  onClick('allperms', async (uid) => {
    await db('PUT', `perms/${uid}`, Object.fromEntries(D.perms.map((p) => [p.key, true])));
    await viewPeople(query, onlineOnly);
  });
  // удаление аккаунта со всем, что к нему относится, — как deleteUser в src/shared/api.ts
  onClick('wipe', async (uid) => {
    const u = users[uid];
    if (!confirm(`Удалить ${u.name} (ID ${u.id})?\n\nПропадут его заказы, объявления, фото и место в топе. Вернуть будет нельзя.`)) return;
    const [market, donations] = await Promise.all([db('GET', 'market'), db('GET', 'donations')]);
    const own = (items) => Object.values(items ?? {}).filter((item) => item.uid === uid);
    await Promise.all([
      ...own(market).flatMap((lot) => [db('DELETE', `market/${lot.code}`), db('DELETE', `marketPhotos/${lot.code}`)]),
      ...own(donations).map((d) => db('DELETE', `donations/${d.code}`)),
      ...['orders', 'listings', 'sales', 'claims', 'photos', 'devices', 'seen', 'tg', 'perms', 'roles', 'blocked', 'recovery', 'gameTop', 'gameTops/quiz', 'gameTops/pairs'].map((node) => db('DELETE', `${node}/${uid}`)),
      db('DELETE', `ids/${u.id}`),
    ]);
    await db('DELETE', `users/${uid}`);
    await viewPeople(query, onlineOnly);
  });
  onClick('pass', async (uid) => {
    const password = prompt('Новый пароль сотрудника (минимум 6 символов):');
    if (password === null) return;
    if (password.length < 6) throw new Error('Пароль — минимум 6 символов.');
    await resetPassword(uid, password);
    alert(`Пароль изменён. Передайте его сотруднику: ${password}`);
  });
  onClick('block', async (on, el) => { await (on ? db('PUT', `blocked/${el.dataset.uid}`, true) : db('DELETE', `blocked/${el.dataset.uid}`)); await viewPeople(query, onlineOnly); });
}

const defaultPerms = () => Object.fromEntries(D.perms.filter((p) => p.on).map((p) => [p.key, true]));
const permBoxes = (perms, uid = '') => `<div class="chips">${D.perms.map((p) => `<label class="chip"><input type="checkbox" name="perm" value="${p.key}" data-perm-uid="${esc(uid)}" ${perms[p.key] ? 'checked' : ''}> ${esc(p.name)}</label>`).join('')}</div>`;

// Админ заводит сотрудника сам — как createStaff в src/shared/api.ts.
// Новый аккаунт создаётся отдельным запросом, админ из своего не выходит.
async function createStaff(nick, password, role, perms) {
  const reply = await call(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FB.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailOf(nick), password, returnSecureToken: true }),
  });
  const uid = reply.localId;
  const write = (path, body) => call(`${FB.databaseURL.replace(/\/+$/, '')}/${path}.json?auth=${reply.idToken}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let id = Number(digits(6));
  for (let attempt = 0; ; attempt++) {
    try { await write(`ids/${id}`, uid); break; } catch (e) { if (attempt >= 4) throw e; id = Number(digits(6)); }
  }
  await write(`users/${uid}`, { uid, id, name: nick, phone: '', login: nick, country: 'TJ', createdAt: Date.now() });
  await write(`recovery/${uid}`, reply.refreshToken);
  await db('PUT', `perms/${uid}`, perms);
  await db('PUT', `roles/${uid}`, role);
  return id;
}

// Админ задаёт сотруднику новый пароль — как resetPassword в src/shared/api.ts
async function resetPassword(uid, password) {
  const again = 'Пусть сотрудник один раз войдёт в приложение или на сайт — после этого пароль можно будет сменить.';
  const saved = await db('GET', `recovery/${uid}`);
  if (!saved) throw new Error(`Этот сотрудник ещё не входил в новую версию. ${again}`);
  let reply;
  try {
    const fresh = await call(`https://securetoken.googleapis.com/v1/token?key=${FB.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(saved)}`,
    });
    reply = await authCall('update', { idToken: fresh.id_token, password, returnSecureToken: true });
  } catch (e) {
    throw e.message.startsWith('Вход устарел') ? new Error(`Сохранённый вход сотрудника устарел. ${again}`) : e;
  }
  await db('PUT', `recovery/${uid}`, reply.refreshToken);
}

const MORE = { stats: () => viewStats(), history: () => viewHistory(), news: viewNews, prices: viewPrices, promos: viewPromos, tasks: viewTasks, rates: viewRates, pay: viewPay, people: viewPeople, code: viewTeamCode };
function viewMore(section) {
  const open = openSections().map(([key]) => key);
  const shown = open.includes(section) ? section : open[0];
  if (!shown) throw new Error('Для этого раздела у вас нет доступа.');
  return shown === 'claims' ? viewRequests('claims', sectionTabs('claims')) : MORE[shown]();
}

// числа новых заявок на вкладках
async function counts() {
  const [orders, listings, sales, claims, chats] = await Promise.all([all('orders'), all('listings'), all('sales'), all('claims'), loadChats('staff')]);
  setCount('orders', fresh(orders));
  setCount('listings', fresh(listings) + fresh(sales));
  setCount('more', fresh(claims));
  setCount('chats', chats.filter((chat) => chat.unread).length);
}

start({
  gate: async (render) => {
    if (!S.user) {
      viewAuth({ registration: false, slogan: 'Для админа и заместителей', done: render, name: 'KovriX A' });
      return true;
    }
    if (S.cloud.role && needCode()) {
      app.innerHTML = `<form class="card stack" id="team"><h2>🔐 Код KovriX A</h2>
        <p class="muted">Чтобы открыть сайт команды, впишите код доступа. Его даёт владелец Kovrix. Код нужен в каждом новом браузере и после того, как владелец его сменит.</p>
        <label class="field">Код доступа<input type="password" name="code" maxlength="20" required autocomplete="off"></label>
        <button type="submit" class="btn">Войти</button></form><button class="btn danger block" id="logout">Выйти</button>`;
      onSubmit(app.querySelector('#team'), async (form) => {
        try {
          await db('PUT', `unlock/${S.user.uid}`, form.elements.code.value.trim());
        } catch (e) {
          throw new Error(/доступа/.test(e.message) ? 'Неверный код.' : e.message);
        }
        markTeam();
        await loadCloud();
        render();
      });
      app.querySelector('#logout').addEventListener('click', logout);
      return true;
    }
    if (!isStaff()) {
      app.innerHTML = `<div class="card stack"><h2>Нет доступа</h2>
        <p class="muted">Этот сайт — для админа и его заместителей. Доступ даёт админ: «Ещё» → «Люди» → найти вас по ID ${esc(S.user.id)} и нажать «Сделать заместителем» или «Сделать админом».</p>
        <button class="btn ghost sm" id="retry">Проверить снова</button></div><button class="btn danger block" id="logout">Выйти</button>`;
      app.querySelector('#retry').addEventListener('click', render);
      app.querySelector('#logout').addEventListener('click', logout);
      return true;
    }
    counts().catch(() => {});
    return false;
  },
  tab: (path) => (/^\/(listings|sales)/.test(path) ? 'listings' : /^\/chat/.test(path) ? 'chats' : path.startsWith('/more') ? 'more' : path.startsWith('/profile') ? 'profile' : 'orders'),
  routes: [
    [/^\/listings$/, () => viewRequests('listings', accountTabs('listings'))],
    [/^\/sales$/, () => viewRequests('sales', accountTabs('sales'))],
    [/^\/chats$/, viewChats],
    [/^\/chat\/([\w-]+)$/, (id) => viewChat(id, 'staff')],
    [/^\/more\/(\w+)$/, viewMore],
    [/^\/more$/, () => viewMore('claims')],
    [/^\/profile$/, () => viewProfile()],
    [/^/, () => viewRequests('orders')],
  ],
});
