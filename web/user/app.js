'use strict';
// Сайт клиента: донат, витрина и продажа аккаунтов, ответы и чаты, топ
// и задания. Те же шаги, что в приложении Kovrix (src/user). Общие
// функции — ../shared/core.js. Автопроверки ID на сайте нет: браузер
// не пускает запросы к чужим магазинам, поэтому ID сверяет оператор.

// что выбрано на экране и переживает перерисовку (фильтр истории покупок)
const A = { history: 'all' };

const select = (name, options, value) => `<select name="${name}">${options.map(([key, label]) => `<option value="${esc(key)}" ${key === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;

// Баннер «Скачайте приложение»: на Android — APK из бота, на iPhone —
// значок на экране «Домой». Кто закрыл — больше не видит.
const BANNER_KEY = 'donix:appBanner';
// как payMethods/payNumber в src/shared/utils.ts: клиенту — только способы
// с реквизитами, номер копируется нажатием
const payMethods = () => {
  const ready = D.payMethods.filter((m) => S.cloud.config.pay?.[m.key]?.trim());
  return ready.length ? ready : D.payMethods;
};
const payNumber = (text) => (text.match(/\+?\d[\d -]{7,}\d/)?.[0] ?? '').replace(/[ -]/g, '');
document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-copy]');
  if (!el) return;
  navigator.clipboard.writeText(el.dataset.copy).then(() => toast(`Скопировано: ${el.dataset.copy}`), () => toast('Не удалось скопировать', true));
});
function appBanner() {
  try { if (localStorage.getItem(BANNER_KEY)) return ''; } catch { /* ничего */ }
  const ua = navigator.userAgent;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return '';
  const android = /Android/i.test(ua);
  const iphone = /iPhone|iPad|iPod/i.test(ua);
  if (!android && !iphone) return '';
  return `<div class="card stack tight" id="app-banner" style="border-color:var(--gold)">
    <div class="row between"><h3>📲 ${android ? 'Приложение Kovrix для Android' : 'Kovrix на экране «Домой»'}</h3><button class="btn sm ghost" data-banner="close" aria-label="Закрыть">✕</button></div>
    <p class="muted small">${android ? 'Быстрее сайта, сообщения о заказах приходят сразу на телефон. Скачайте файл, откройте его и установите.' : 'Нажмите «Поделиться» внизу Safari → «На экран „Домой“» — Kovrix откроется как приложение.'}</p>
    ${android ? '<a class="btn block" href="/download/">⬇️ Скачать приложение</a>' : ''}
  </div>`;
}

const newsCards = () => (S.cloud.news ?? []).filter((n) => n.at > Date.now() - 7 * 864e5).slice(0, 3)
  .map((n) => `<div class="card stack tight"><span class="gold small"><b>📢 Новости · ${date(n.at)}</b></span><p class="pre">${esc(n.text)}</p></div>`).join('');

// быстрый выбор, как в приложении и Telegram-боте: сразу нужная группа товаров
const QUICK = [['gems', '💎', 'Алмазы'], ['voucher', '🎟️', 'Ваучеры'], ['pass', '🎫', 'Пропуск']];
function quickTiles() {
  const base = GAMES.find((g) => !g.off);
  if (!base) return '';
  const groups = productGroups(priced(base).products);
  return `<div class="quick">${QUICK.map(([key, icon, name]) => {
    const prices = groups.find((g) => g.key === key)?.items.map(({ p }) => p.price) ?? [];
    return `<a href="#/game/${base.id}/${key}"><i>${icon}</i><b>${name}</b><small>${prices.length ? `от ${Math.min(...prices)} смн` : '—'}</small></a>`;
  }).join('')}</div>`;
}

function viewHome() {
  const reward = S.cloud.config.referral?.reward;
  const stats = S.cloud.config.stats;
  app.innerHTML = `
    <section class="hero"><span class="motto">${esc(D.motto)}</span><h1>Привет, ${esc(S.user.name)}!</h1>
      <p class="muted">Что покупаем сегодня?</p>
      ${stats?.users ? `<p class="gold"><b>📲 Kovrix скачали уже ${Math.max(stats.users, stats.downloads ?? 0)} человек</b></p>` : ''}</section>
    ${quickTiles()}
    ${appBanner()}
    ${activePromos().map((p) => `<div class="promo"><b>−${p.percent}%</b><span><b>${esc(p.title)}</b><br><span class="small">${esc(gameById(p.game)?.name ?? 'На все игры')} · до ${date(p.until)}</span></span></div>`).join('')}
    <h2>Пополнить игру</h2>
    <div class="games">${GAMES.map((g) => gameCard(g, `#/game/${g.id}`, null, promoFor(g.id) && `−${promoFor(g.id).percent}%`)).join('')}</div>
    ${newsCards()}
    <a class="card link play-card" href="#/play"><i>🕹️</i><span class="grow"><b>Мини-игры</b><br><span class="muted small">Алмазный дождь, Знаток Free Fire, Найди пару — рекорды в общем топе</span></span><u>›</u></a>
    <a class="card link" href="#/sell"><i>🏷</i><span class="grow"><b>Аккаунты: купить или продать</b><br><span class="muted small">Витрина аккаунтов и ваше объявление</span></span><u>›</u></a>
    <a class="card link" href="#/rewards"><i>👥</i><span class="grow"><b>Пригласи друга</b><br><span class="muted small">${reward ? `Награда: ${esc(reward)}` : 'Ваша ссылка-приглашение и друзья'}</span></span><u>›</u></a>
    <a class="card link" href="#/rewards"><i>🏆</i><span class="grow"><b>Топ и задания</b><br><span class="muted small">Кто больше задонатил и награды от админа</span></span><u>›</u></a>`;
  onClick('banner', () => {
    try { localStorage.setItem(BANNER_KEY, '1'); } catch { /* ничего */ }
    document.getElementById('app-banner')?.remove();
  });
}

// pack — номер пакета, выбранного заранее (кнопка пакета в Telegram-боте)
function viewGame(id, pack) {
  const game = gameById(id) && priced(gameById(id));
  if (!game) throw new Error('Игра не найдена.');
  const { custom } = game;
  const promo = promoFor(id);
  const imageDefs = [...game.images, D.receipt];
  const images = Object.fromEntries(imageDefs.map((d) => [d.key, []]));
  let currency = myCurrency();

  app.innerHTML = `
    <a class="back" href="#/">‹ Все игры</a>
    ${gameCard(game, '', null, promo && `−${promo.percent}%`).replace('class="game"', 'class="game banner"')}
    ${promo ? `<p class="gold">🔥 ${esc(promo.title)}: скидка ${promo.percent}% уже в цене</p>` : ''}
    <form class="stack" id="order">
      <div class="card stack"><h3>1. Что покупаем</h3>
        ${productGroups(game.products).length > 1 ? `<div class="chips group-tabs">${[{ key: 'all', name: 'Все' }, ...productGroups(game.products)].map((g) => `<button type="button" class="chip" data-show="${g.key}">${g.name}</button>`).join('')}</div>` : ''}
        ${productGroups(game.products).map((g, _, all) => `<div data-group="${g.key}">${all.length > 1 ? `<h4 class="pack-group">${g.name}</h4>` : ''}<div class="packs">${g.items.map(({ p, i }) => `<label class="pack"><input type="radio" name="pack" value="${i}"><span><b>${esc(p.title)}</b><em data-pack="${i}"></em><s data-old="${i}"></s></span></label>`).join('')}</div></div>`).join('')}
        ${custom ? `<label class="field">Количество (${esc(game.currency)}), от ${custom.min}<input type="text" name="amount" inputmode="numeric" maxlength="6" placeholder="${custom.min}"></label>
          <div class="chips">${custom.quick.map((q) => `<button type="button" class="chip" data-quick="${q}">${q}</button>`).join('')}</div>` : ''}
      </div>
      <div class="card stack"><h3>2. Данные аккаунта</h3>
        ${game.fields.map((d) => fieldHtml(d, 'f_')).join('')}
        <p class="muted small">ID сверит оператор перед зачислением.</p>
      </div>
      <div class="card stack"><h3>3. Оплата</h3>
        <label class="field">Валюта${select('currency', Object.entries(D.currencies).map(([key, c]) => [key, c.name]), currency)}</label>
        <div class="row" style="align-items:flex-end"><label class="field grow">Промокод<input type="text" name="promo" maxlength="20" autocomplete="off" placeholder="Если есть" style="text-transform:uppercase"></label><button type="button" class="btn ghost sm" id="apply-code">Применить</button></div>
        <p class="ok small" id="code-ok" hidden></p>
        <div class="total"><span class="muted">К оплате</span><b id="total">—</b></div>
        <label class="field">Способ оплаты *${select('pay', [['', '— выберите —'], ...payMethods().map((m) => [m.key, m.name])], '')}</label>
        <button type="button" class="copy" id="pay-copy" hidden><span></span><b></b><i>📋</i></button>
        <p class="pre note" id="requisites" hidden></p>
        <label class="field">Номер операции из чека *<input type="text" name="txn" maxlength="40" autocomplete="off" placeholder="Например: 1234567890"></label>
        ${imageDefs.map((d) => `<div class="stack tight"><span class="muted small">${esc(d.label)} *</span><div data-image="${d.key}"></div></div>`).join('')}
      </div>
      <p class="muted small center">⏳ Подтверждение — в течение дня, обычно быстрее. После проверки оплаты донат придёт на ваш аккаунт.</p>
      <button type="submit" class="btn block">Оформить заказ</button>
    </form>
    <div class="card stack tight"><h3>Как это работает</h3><ol class="steps">${game.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>`;

  const form = app.querySelector('#order');
  imageDefs.forEach((d) => photoPicker(form.querySelector(`[data-image="${d.key}"]`), images[d.key], 1));

  // введённый промокод (codes/<КОД>), если он подошёл
  let code = null;
  // лучшая цена: акция или промокод
  const best = (item, full) => {
    const sale = discounted(full, promo);
    const coded = codePrice(code, id, item, full);
    return coded !== null && coded < sale ? { item, price: coded, byCode: true } : { item, price: sale, byCode: false };
  };
  // что выбрано: готовый пакет или своя сумма по курсу; цена в сомони
  const chosen = () => {
    const pack = game.products[form.elements.pack?.value];
    const count = Math.floor(Number(form.elements.amount?.value));
    if (pack) return best(pack.title, pack.price);
    if (custom && count >= custom.min && count <= custom.max) {
      return best(`${count} ${game.currency}`, Math.round(count * custom.rate * 100) / 100);
    }
    return null;
  };
  form.querySelector('#apply-code').addEventListener('click', async () => {
    const key = codeKey(form.elements.promo.value);
    const box = form.querySelector('#code-ok');
    try {
      const found = key ? await db('GET', `codes/${key}`) : null;
      // одноразовый код (once) — один раз на аккаунт, как в приложении
      const used = !!found?.once && !!(await db('GET', `usedCodes/${S.user.uid}/${key}`));
      const fits = found && !used && (!found.until || found.until > Date.now()) && (!found.game || found.game === id);
      code = fits ? { ...found, id: key } : null;
      box.hidden = !code;
      if (code) box.textContent = `✅ ${key}: ${codeText(code, game.name)}${code.once ? ' · один раз' : ''}`;
      toast(code ? `Промокод ${key} применён` : used ? 'Вы уже использовали этот промокод — он действует один раз.' : found ? 'Срок кода закончился или он для другой игры.' : 'Такого промокода нет — проверьте буквы.', !code);
    } catch (e) {
      toast(e.message, true);
    }
    refresh();
  });
  const refresh = () => {
    currency = form.elements.currency.value;
    const pick = chosen();
    game.products.forEach((p, i) => {
      const now = best(p.title, p.price).price;
      form.querySelector(`[data-pack="${i}"]`).textContent = money(now, currency);
      form.querySelector(`[data-old="${i}"]`).textContent = now < p.price ? money(p.price, currency) : '';
    });
    form.querySelector('#total').textContent = pick ? money(pick.price, currency) : '—';
    const method = form.elements.pay.value;
    const box = form.querySelector('#requisites');
    box.hidden = !method;
    const requisites = S.cloud.config.pay?.[method] ?? '';
    const copyBtn = form.querySelector('#pay-copy');
    copyBtn.hidden = !method || !payNumber(requisites);
    copyBtn.dataset.copy = payNumber(requisites);
    copyBtn.querySelector('span').textContent = D.payMethods.find((m) => m.key === method)?.name ?? '';
    copyBtn.querySelector('b').textContent = payNumber(requisites);
    box.textContent = `${requisites || D.payEmpty}\nПереведите ровно ${pick ? money(pick.price, currency) : '—'}. После оплаты впишите номер операции из чека и приложите скриншот.`;
  };
  form.addEventListener('input', (event) => {
    if (event.target.name === 'amount') {
      event.target.value = event.target.value.replace(/\D/g, '');
      form.querySelectorAll('[name=pack]').forEach((el) => { el.checked = false; });
    } else if (event.target.name === 'pack' && form.elements.amount) {
      form.elements.amount.value = '';
    }
    refresh();
  });
  form.querySelectorAll('[data-quick]').forEach((el) => el.addEventListener('click', () => {
    form.elements.amount.value = el.dataset.quick;
    form.querySelectorAll('[name=pack]').forEach((p) => { p.checked = false; });
    refresh();
  }));
  // вкладки групп: «Все», «💎 Алмазы», …; кнопка на главной открывает нужную
  const showGroup = (key) => {
    form.querySelectorAll('[data-group]').forEach((el) => { el.hidden = key !== 'all' && el.dataset.group !== key; });
    form.querySelectorAll('[data-show]').forEach((el) => el.classList.toggle('on', el.dataset.show === key));
  };
  form.querySelectorAll('[data-show]').forEach((el) => el.addEventListener('click', () => showGroup(el.dataset.show)));
  showGroup(/^(gems|voucher|pass)$/.test(pack ?? '') && form.querySelector(`[data-group="${pack}"]`) ? pack : 'all');
  const wanted = /^\d+$/.test(pack ?? '') ? pack : new URLSearchParams(location.search).get('pack');
  const preset = /^\d+$/.test(wanted ?? '') && form.querySelector(`[name=pack][value="${wanted}"]`);
  if (preset) {
    preset.checked = true;
    // пакет уже выбран — сразу к данным аккаунта
    setTimeout(() => form.querySelector('.card:nth-child(2)')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }
  refresh();

  onSubmit(form, async () => {
    const pick = chosen();
    if (!pick) throw new Error(custom ? `Укажите количество — от ${custom.min} до ${custom.max} ${game.currency}.` : 'Выберите пакет.');
    const fields = readFields(form, game.fields, 'f_');
    const problem = checkFields(game.fields, fields);
    if (problem) throw new Error(problem);
    const method = payMethods().find((m) => m.key === form.elements.pay.value);
    if (!method) throw new Error('Выберите способ оплаты.');
    const missing = imageDefs.find((d) => !images[d.key].length);
    if (missing) throw new Error(`Прикрепите: ${missing.label}.`);
    const txn = form.elements.txn.value.trim();
    if (txnKey(txn).length < 4) throw new Error('Впишите номер операции (транзакции) из чека банка — без него заказ не проверить.');
    const orderCode = newCode('D');
    await createRequest('orders', {
      code: orderCode, uid: S.user.uid, game: id, item: pick.item, method: game.method, price: pick.price,
      currency, total: Math.round(pick.price * rateOf(currency) * 100) / 100, pay: method.name,
      txn, receipt: fingerprint(images[D.receipt.key][0]),
      ...(pick.byCode ? { promo: `${code.id}: ${codeText(code, game.name)}`, promoCode: code.id } : promo && { promo: `${promo.title} −${promo.percent}%` }),
      fields, status: 'new', createdAt: Date.now(), client: client(),
    }, imageDefs.map((d) => images[d.key][0]));
    if (pick.byCode && code.once) db('PUT', `usedCodes/${S.user.uid}/${code.id}`, Date.now()).catch(() => {});
    toast(`Заказ ${orderCode} оформлен. Подтверждение — в течение дня, затем придёт донат`);
    go('/answers');
  });
}

const lotCount = (n) => (n ? `Аккаунтов: ${n}` : 'Пока нет аккаунтов');

// Вкладка «Аккаунты»: сначала выбор — купить или продать, потом игра.
// Купить → витрина игры, продать → сразу форма объявления.
function viewSell() {
  app.innerHTML = `
    <section class="hero"><h1>Что хотите сделать?</h1></section>
    <a class="card link choice" href="#/sell/buy"><i>🛒</i><span class="grow"><b>Купить аккаунт</b><br><span class="muted small">Витрина аккаунтов: фото, цена, торг</span></span><u>›</u></a>
    <a class="card link choice" href="#/sell/new"><i>💰</i><span class="grow"><b>Продать аккаунт</b><br><span class="muted small">Выставьте свой — с фото и ценой</span></span><u>›</u></a>`;
}

async function viewSellGames(mode) {
  const buy = mode === 'buy';
  const lots = buy ? await loadMarket() : [];
  app.innerHTML = `
    <a class="back" href="#/sell">‹ Назад к выбору</a>
    <section class="hero"><h1>${buy ? '🛒 Купить аккаунт' : '💰 Продать аккаунт'}</h1>
      <p class="muted">${buy ? 'Выберите игру — откроется витрина. Понравился аккаунт — нажмите «Купить».' : 'Выберите игру, от которой продаёте аккаунт.'}</p></section>
    <div class="games">${GAMES.map((g) => (buy
    ? gameCard(g, `#/market/${g.id}`, lotCount(lots.filter((l) => l.game === g.id).length))
    : gameCard(g, `#/sell/${g.id}`, 'Выставить свой аккаунт'))).join('')}</div>`;
}

const bargainBadge = (lot) => `<span class="badge ${lot.bargain ? 'ok' : 'info'}">${lot.bargain ? 'Торг' : 'Без торга'}</span>`;

async function viewMarket(id) {
  const game = gameById(id);
  if (!game) throw new Error('Игра не найдена.');
  const lots = (await loadMarket()).filter((lot) => lot.game === id);
  app.innerHTML = `
    <a class="back" href="#/sell/buy">‹ Все игры</a>
    <a class="btn block" href="#/sell/${id}">＋ Продать свой аккаунт ${esc(game.name)}</a>
    ${lots.length ? `<div class="lots">${lots.map((lot) => `<div class="card lot">
      <div class="carousel" data-code="${esc(lot.code)}" data-count="${Number(lot.photos) || 0}"></div>
      <a href="#/lot/${esc(lot.code)}"><span class="row between"><span class="price">${mine$(lot.price)}</span>${bargainBadge(lot)}</span>
        <b>${esc(lot.title)}</b><span class="muted small">Продавец: ${esc(lot.seller.name)}</span></a>
      <a class="btn sm" href="#/lot/${esc(lot.code)}">🛒 Купить · подробнее</a></div>`).join('')}</div>`
    : `<p class="card muted center">Аккаунтов ${esc(game.name)} на витрине пока нет. Выставьте первый!</p>`}`;
  app.querySelectorAll('.carousel').forEach(carousel);
}

async function viewLot(code) {
  const lot = await db('GET', `market/${code}`);
  if (!lot) throw new Error('Объявление снято с продажи.');
  const game = gameById(lot.game);
  const own = lot.uid === S.user.uid;
  app.innerHTML = `
    <a class="back" href="#/market/${esc(lot.game)}">‹ Витрина</a>
    <div class="carousel big" data-code="${esc(code)}" data-count="${Number(lot.photos) || 0}"></div>
    <div class="card stack tight"><div class="row between"><span class="price">${mine$(lot.price)}</span>${bargainBadge(lot)}</div>
      <h2>${esc(lot.title)}</h2>
      ${kv([['Игра', game?.name ?? lot.game], ...fieldPairs(game?.accountAttrs ?? [], lot.attrs ?? {}), ['Продавец', `${lot.seller.name} · ID ${lot.seller.id}`], ['Объявление', `${lot.code} · ${date(lot.createdAt)}`]])}
      <p class="pre">${esc(lot.description)}</p>
      ${/^https?:\/\//i.test(lot.video ?? '') ? `<a class="btn ghost block" target="_blank" rel="noopener" href="${esc(lot.video)}">▶ Смотреть видео аккаунта</a>` : ''}</div>
    ${own
    ? `<a class="btn block" href="#/sold/${esc(code)}">✓ Аккаунт продан</a><button class="btn danger block" data-remove="1">Снять с продажи</button>`
    : `<button class="btn block" data-buy="1">🛒 Купить за ${mine$(lot.price)}</button>
       <button class="btn ghost block" data-write="1">💬 Написать продавцу${lot.bargain ? ' и поторговаться' : ''}</button>
       <p class="muted small">Не переводите деньги, пока не убедились, что аккаунт настоящий. Если сомневаетесь — напишите в поддержку.</p>`}`;
  app.querySelectorAll('.carousel').forEach(carousel);
  const chat = {
    id: `${code}_${S.user.uid}`, kind: 'deal', title: `${code} · ${lot.title}`,
    a: S.user.uid, b: lot.uid, aName: S.user.name, bName: lot.seller.name, updatedAt: Date.now(),
  };
  onClick('write', () => openChat(chat));
  // «Купить»: продавцу уходит первое сообщение, дальше — чат
  onClick('buy', async () => {
    if (!confirm(`Купить «${lot.title}» за ${mine$(lot.price)}?\n\nПродавец получит сообщение, что вы готовы купить. Об оплате и передаче аккаунта договоритесь в чате.`)) return;
    await openChat(chat);
    const at = Date.now();
    const text = `Здравствуйте! Хочу купить аккаунт «${lot.title}» (${code}) за ${mine$(lot.price)}. Как оплатить?`;
    await db('POST', `chats/${chat.id}/messages`, { from: S.user.uid, name: S.user.name, text, at });
    const patch = { last: text.slice(0, 80), updatedAt: at };
    await db('PATCH', `userChats/${chat.a}/${chat.id}`, { ...patch, unread: false });
    await db('PATCH', `userChats/${chat.b}/${chat.id}`, { ...patch, unread: true });
    window.dispatchEvent(new Event('hashchange'));
  });
  onClick('remove', async () => {
    if (!confirm('Снять объявление с витрины?')) return;
    await db('DELETE', `market/${code}`);
    go(`/market/${lot.game}`);
  });
}

function viewSellForm(id) {
  const game = gameById(id);
  if (!game) throw new Error('Игра не найдена.');
  const photos = [];
  const currency = myCurrency();
  const guide = game.sellGuide ?? ['Скриншот профиля: ник, уровень, ранг.', 'Скриншоты инвентаря, скинов и всего ценного.', 'Скриншот привязки аккаунта (почта, соцсети).'];

  app.innerHTML = `
    <a class="back" href="#/market/${id}">‹ Витрина</a>
    ${gameCard(game, '', 'Продать аккаунт').replace('class="game"', 'class="game banner"')}
    <div class="card stack tight"><h3>Как это работает</h3><ol class="steps">
      <li>Расскажите об аккаунте и добавьте фото.</li><li>Назначьте цену и решите, готовы ли торговаться.</li>
      <li>После проверки аккаунт появится на витрине — покупатели напишут вам в чат.</li>
      <li>Когда продадите — нажмите «Аккаунт продан» и приложите фото чека.</li></ol></div>
    <form class="stack" id="sell">
      <div class="card stack"><h3>1. Об аккаунте</h3>
        <label class="field">Заголовок *<input type="text" name="title" maxlength="80" placeholder="Например: 65 уровень, много скинов"></label>
        ${game.accountAttrs.map((d) => fieldHtml(d, 'a_')).join('')}
        <label class="field">Описание *<textarea name="description" maxlength="1500" placeholder="Что есть на аккаунте, какая привязка, почему продаёте"></textarea></label>
      </div>
      <div class="card stack"><h3>2. Фото и видео</h3><div id="photos"></div>
        <label class="field">Видео аккаунта (ссылка)<input type="url" name="video" maxlength="300" autocapitalize="none" placeholder="https://youtu.be/… · TikTok · Instagram · Telegram"></label>
        <p class="muted small">Снимите обзор аккаунта, загрузите на YouTube, TikTok или в Telegram-канал и вставьте ссылку — покупатель откроет его кнопкой «▶ Смотреть видео».</p>
        <b class="small">Какие фото сделать:</b><ol class="steps small">${guide.map((line) => `<li>${esc(line)}</li>`).join('')}</ol></div>
      <div class="card stack"><h3>3. Цена</h3>
        <label class="field">Цена, ${esc(D.currencies[currency].sign)} *<input type="text" name="price" inputmode="decimal" maxlength="10" placeholder="500"></label>
        <label class="field">Торг *${select('bargain', [['', '— выберите —'], ['yes', 'Торг уместен'], ['no', 'Без торга']], '')}</label>
      </div>
      <button type="submit" class="btn block">Выставить аккаунт</button>
    </form>`;

  const form = app.querySelector('#sell');
  photoPicker(form.querySelector('#photos'), photos, D.maxPhotos);

  onSubmit(form, async () => {
    const title = form.elements.title.value.trim();
    const description = form.elements.description.value.trim();
    const attrs = readFields(form, game.accountAttrs, 'a_');
    const price = num(form.elements.price.value);
    const bargain = form.elements.bargain.value;
    // как videoLink в src/shared/utils.ts
    const video = form.elements.video.value.trim();
    const problem = title.length < 3 ? 'Введите заголовок.'
      : checkFields(game.accountAttrs, attrs)
      ?? (description.length < 10 ? 'Опишите аккаунт подробнее (минимум 10 символов).'
        : !photos.length ? 'Добавьте хотя бы одно фото аккаунта.'
        : video && !/^https?:\/\/[^\s]{4,300}$/i.test(video) ? 'Ссылка на видео должна начинаться с https:// — например, с YouTube или TikTok.'
        : !(price > 0) ? 'Укажите цену.'
        : !bargain ? 'Выберите: торг или без торга.' : null);
    if (problem) throw new Error(problem);
    const code = newCode('A');
    await createRequest('listings', {
      code, uid: S.user.uid, game: id, title, description, attrs, price: toTjs(price, currency),
      bargain: bargain === 'yes', ...(video ? { video } : {}), status: 'new', createdAt: Date.now(), client: client(),
    }, photos);
    toast(`Аккаунт ${code} отправлен на проверку`);
    go('/answers');
  });
}

// «Аккаунт продан»: за сколько и фото чека — подтверждает админ
async function viewSold(code) {
  const listing = (await mine('listings')).find((item) => item.code === code);
  if (!listing) throw new Error('Объявление не найдено.');
  const photos = [];
  const currency = myCurrency();
  app.innerHTML = `
    <a class="back" href="#/answers">‹ Ответы</a>
    <form class="card stack" id="sold"><h3>${esc(code)} · ${esc(listing.title)}</h3>
      <p class="muted small">Подтвердите продажу: за сколько продали аккаунт и фото чека о получении денег.</p>
      <label class="field">За сколько продали, ${esc(D.currencies[currency].sign)} *<input type="text" name="price" inputmode="decimal" maxlength="10"></label>
      <div id="photos"></div>
      <button type="submit" class="btn block">Отправить на подтверждение</button></form>`;
  const form = app.querySelector('#sold');
  photoPicker(form.querySelector('#photos'), photos, 1);
  onSubmit(form, async () => {
    const price = num(form.elements.price.value);
    if (!(price > 0) || !photos.length) throw new Error('Укажите, за сколько продали, и приложите фото чека.');
    const createdAt = Date.now();
    const photo = `${code}-sale-${createdAt}`;
    await createRequest('sales', { code, uid: S.user.uid, title: listing.title, price: toTjs(price, currency), photo, status: 'new', createdAt, client: client() }, photos, photo);
    toast('Отправлено — админ проверит чек');
    go('/answers');
  });
}

// Всё, на что пользователю отвечают: чаты, заказы, его аккаунты, награды
async function viewAnswers() {
  const draw = async () => {
    const [chats, orders, listings, sales, claims] = await Promise.all([loadChats(S.user.uid), mine('orders'), mine('listings'), mine('sales'), mine('claims')]);
    app.innerHTML = `
      <p class="muted small">Ваш ID: ${esc(S.user.id)}. Список обновляется сам.</p>
      <h2>Сообщения</h2>
      ${chats.map((chat) => chatRow(chat, S.user.uid)).join('') || '<p class="card muted">Чатов пока нет. Написать в поддержку можно из профиля, продавцу — из объявления.</p>'}
      <h2>🧾 История покупок</h2>
      ${orders.length ? `<div class="card stack tight">${kv([['Зачислено донатов', orders.filter((o) => o.status === 'done').length], ['Потрачено всего', mine$(orders.filter((o) => o.status === 'done').reduce((sum, o) => sum + o.price, 0))], ['Ждут проверки', orders.filter((o) => o.status === 'new').length]])}
        <span class="muted small">🔒 «Донат зачислен» ставит только оператор Kovrix после проверки оплаты в банке. Никому не сообщайте код из Telegram и пароль — сотрудники Kovrix их не спрашивают.</span></div>
        <div class="chips">${[['all', `Все (${orders.length})`], ['done', 'Зачислены'], ['new', 'Ждут'], ['rejected', 'Отклонены']].map(([key, name]) => `<button class="chip ${key === A.history ? 'on' : ''}" data-history="${key}">${name}</button>`).join('')}</div>` : ''}
      ${orders.length ? orders.filter((o) => A.history === 'all' || o.status === A.history).map((o) => `<div class="card stack tight">
        <div class="row between"><b>${esc(o.code)} · ${esc(gameById(o.game)?.name ?? o.game)}</b>${badge('orders', o.status)}</div>
        <div class="row between"><span>${esc(o.item)}</span><span class="price">${o.total ? amount(o.total, o.currency) : money(o.price)}</span></div>
        ${kv([...fieldPairs(gameById(o.game)?.fields ?? [], o.fields), ...(o.pay ? [['Оплата', o.pay]] : []), ...(o.txn ? [['№ операции', o.txn]] : []), ...(o.promo ? [[o.promoCode ? 'Промокод' : 'Акция', o.promo]] : [])])}${note(o.note)}
        ${o.status === 'new' ? '<span class="muted small">⏳ Подтвердим в течение дня — затем придёт донат</span>' : ''}
        ${o.status === 'new' ? `<button class="btn ghost sm" data-ask="${esc(o.code)}">💬 Написать по заказу</button>` : ''}
        <span class="muted small">Заказ: ${date(o.createdAt)}${o.decidedAt ? ` · ${o.status === 'done' ? 'зачислен' : 'проверен'}: ${date(o.decidedAt)}` : ''}</span></div>`).join('')
    : '<div class="card stack tight"><p class="muted">Заказов пока нет.</p><a class="btn ghost sm" href="#/">Выбрать игру</a></div>'}
      <h2>Мои аккаунты на продажу</h2>
      ${listings.length ? listings.map((l) => {
    const sale = sales.find((x) => x.code === l.code);
    return `<div class="card stack tight">
        <div class="row between"><b>${esc(l.code)} · ${esc(gameById(l.game)?.name ?? l.game)}</b>${badge('listings', l.status)}</div>
        <div class="row between"><span>${esc(l.title)}</span><span class="price">${mine$(l.price)}</span></div>${note(l.note)}
        ${sale ? `<div class="row between"><span>Продажа за ${mine$(sale.price)}</span>${badge('sales', sale.status)}</div>${note(sale.note)}` : ''}
        ${l.status === 'done' && (!sale || sale.status === 'rejected') ? `<a class="btn ghost sm" href="#/sold/${esc(l.code)}">✓ Аккаунт продан — приложить чек</a>` : ''}
        <span class="muted small">${date(l.createdAt)}</span></div>`;
  }).join('')
    : '<div class="card stack tight"><p class="muted">Вы ещё не выставляли аккаунты.</p><a class="btn ghost sm" href="#/sell">＋ Продать аккаунт</a></div>'}
      ${claims.length ? `<h2>Задания</h2>${claims.map((c) => `<div class="card stack tight">
        <div class="row between"><b>${esc(c.title)}</b>${badge('claims', c.status)}</div><span>Награда: ${esc(c.reward)}</span>${note(c.note)}</div>`).join('')}` : ''}`;
    app.querySelectorAll('[data-history]').forEach((el) => el.addEventListener('click', () => { A.history = el.dataset.history; draw(); }));
    // донат оплачен, а оператор ещё не подтвердил — в поддержку, номер заказа уже набран
    onClick('ask', (code) => {
      const o = orders.find((x) => x.code === code);
      S.draft = { id: `support_${S.user.uid}`, text: `Заказ ${code} (${o?.item ?? ''}) — оплатил(а), но он ещё не подтверждён. ` };
      return talk('support');
    });
  };
  await draw();
  start.timer = setInterval(() => draw().catch(() => {}), D.refreshMs);
}

// «Пригласи друга»: ссылка, сколько друзей пришло, награда за каждые need
function inviteCard(invites, claims) {
  const rule = S.cloud.config.referral;
  const need = rule?.need > 0 ? rule.need : 0;
  const earned = need ? Math.floor(invites.length / need) : 0;
  let level = 0;
  for (let l = 1; l <= earned; l++) {
    const claim = claims.find((c) => c.task === `invite${l}`);
    if (!claim || claim.status === 'rejected') { level = l; break; }
  }
  const waiting = claims.some((c) => c.task.startsWith('invite') && c.status === 'new');
  const left = need ? need - (invites.length % need) : 0;
  const names = invites.slice(0, 5).map((f) => esc(f.name)).join(', ') + (invites.length > 5 ? ` и ещё ${invites.length - 5}` : '');
  return { level, need, html: `<div class="card stack tight"><h3>👥 Пригласи друга</h3>
    <p class="muted small">${need ? `За каждые ${need} друзей, которые зарегистрируются по вашей ссылке, — ${esc(rule.reward)}.` : 'Отправьте друзьям ссылку — бот зарегистрирует их и засчитает вам.'}</p>
    <p class="muted small">Друг может и сам указать ваш ID ${S.user.id} при регистрации.</p>
    <b class="gold">Приглашено: ${invites.length}${need && !level ? ` · до награды ещё ${left}` : ''}</b>
    ${invites.length ? `<span class="muted small">${names}</span>` : ''}
    ${waiting ? '<p class="muted small">⏳ Заявка на награду у админа.</p>' : ''}
    ${level ? `<button class="btn sm" data-invite="claim">🎁 Получить: ${esc(rule.reward)}</button>` : ''}
    <button class="btn sm ${level ? 'ghost' : ''}" data-invite="share">📣 Пригласить друзей</button></div>` };
}

// Топ донатеров за день, неделю, месяц и всё время и задания от админа
async function viewRewards() {
  const [donations, tasks, claims, invites] = await Promise.all([
    db('GET', 'donations'), db('GET', 'tasks'), mine('claims'),
    db('GET', `invites/${S.user.id}`).catch(() => null),
  ]);
  const friends = Object.entries(invites ?? {}).map(([uid, f]) => ({ ...f, uid })).sort((a, b) => b.at - a.at);
  const invite = inviteCard(friends, claims);
  let period = 'month';
  const open = list(tasks).filter((t) => t.until > Date.now()).sort((a, b) => b.createdAt - a.createdAt);
  const draw = () => {
    const top = ranking(Object.values(donations ?? {}), period);
    const me = top.find((row) => row.uid === S.user.uid);
    app.innerHTML = `
      ${invite.html}
      <h2>🏆 Топ донатеров</h2>
      <div class="chips">${PERIODS.map(([key, name]) => `<button class="chip ${key === period ? 'on' : ''}" data-period="${key}">${name}</button>`).join('')}</div>
      <div class="card stack tight"><b style="color:var(--cyan)">${me ? `Вы на ${me.place} месте — ${mine$(me.total)}` : 'За этот период у вас нет зачисленных донатов.'}</b>
        ${top.slice(0, 20).map((row) => `<div class="rank ${row.uid === S.user.uid ? 'me' : ''}"><i>${['🥇', '🥈', '🥉'][row.place - 1] ?? row.place}</i><b class="grow">${esc(row.name)}</b><b>${mine$(row.total)}</b></div>`).join('') || '<p class="muted">Пока никого — станьте первым!</p>'}</div>
      <h2>🎯 Задания</h2>
      ${open.map((task) => {
    const claim = claims.find((c) => c.task === task.id);
    return `<form class="card stack tight" data-task="${esc(task.id)}">
        <div class="row between"><h3>${esc(task.title)}</h3>${claim ? badge('claims', claim.status) : ''}</div>
        <p class="pre">${esc(task.text)}</p><b class="gold">🎁 Награда: ${esc(task.reward)}</b><span class="muted small">До ${date(task.until)}</span>${note(claim?.note)}
        ${!claim || claim.status === 'rejected' ? `<label class="field">Как выполнили (ник в игре, ссылка, комментарий)<input type="text" name="proof" maxlength="300" required minlength="3"></label>
          <button type="submit" class="btn sm">Я выполнил — получить награду</button>` : ''}</form>`;
  }).join('') || '<p class="card muted">Сейчас заданий нет. Загляните позже — админ добавляет новые.</p>'}`;
    app.querySelectorAll('[data-period]').forEach((el) => el.addEventListener('click', () => { period = el.dataset.period; draw(); }));
    onClick('invite', async (what) => {
      if (what === 'share') {
        const link = `${location.origin}/user/#/r/${S.user.id}`;
        const text = `Заходи в Kovrix — донат в игры быстро и дёшево, покупка и продажа аккаунтов. Регистрируйся по моей ссылке: ${link}\nИли укажи мой ID при регистрации: ${S.user.id}`;
        if (navigator.share) await navigator.share({ text }).catch(() => {});
        else { await navigator.clipboard.writeText(text); toast('Приглашение скопировано — отправьте его друзьям'); }
        return;
      }
      const { level, need } = invite;
      await createRequest('claims', { task: `invite${level}`, title: `Пригласил ${level * need} друзей`, reward: S.cloud.config.referral.reward, uid: S.user.uid, proof: friends.slice(0, level * need).map((f) => f.name).join(', '), status: 'new', createdAt: Date.now(), client: client() }, []);
      toast('Заявка отправлена — админ проверит друзей и выдаст награду');
      viewRewards();
    });
    app.querySelectorAll('form[data-task]').forEach((form) => form.querySelector('[type=submit]') && onSubmit(form, async () => {
      const task = open.find((t) => t.id === form.dataset.task);
      await createRequest('claims', { task: task.id, title: task.title, reward: task.reward, uid: S.user.uid, proof: form.elements.proof.value.trim(), status: 'new', createdAt: Date.now(), client: client() }, []);
      toast('Отправлено — ждите награду');
      go('/answers');
    }));
  };
  draw();
}

// число на вкладке «Ответы» — чаты с непрочитанными сообщениями
async function countUnread() {
  const unread = (await loadChats(S.user.uid).catch(() => [])).filter((chat) => chat.unread).length;
  const el = document.getElementById('count-answers');
  el.hidden = !unread;
  el.textContent = unread;
}

start({
  gate: async (render) => {
    if (S.user) {
      countUnread();
      return false;
    }
    viewAuth({ registration: true, slogan: 'Донат в игры и продажа аккаунтов', done: render });
    return true;
  },
  tab: (path) => (/^\/(sell|market|lot|sold)/.test(path) ? 'sell' : /^\/(answers|chat)/.test(path) ? 'answers' : path.startsWith('/rewards') ? 'rewards' : path.startsWith('/profile') ? 'profile' : 'donate'),
  routes: [
    [/^\/game\/([\w-]+)(?:\/(\d+|gems|voucher|pass))?$/, viewGame],
    [/^\/market\/([\w-]+)$/, viewMarket],
    [/^\/lot\/([\w-]+)$/, viewLot],
    [/^\/sell\/(buy|new)$/, viewSellGames],
    [/^\/sell\/([\w-]+)$/, viewSellForm],
    [/^\/sold\/([\w-]+)$/, viewSold],
    [/^\/sell$/, viewSell],
    [/^\/answers$/, viewAnswers],
    [/^\/chat\/([\w-]+)$/, (id) => viewChat(id, S.user.uid)],
    [/^\/rewards$/, viewRewards],
    [/^\/play(?:\/(rain|quiz|pairs))?$/, viewPlay],
    [/^\/profile$/, () => viewProfile({ client: true })],
    [/^/, viewHome],
  ],
});
