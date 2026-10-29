// Мини-игры на сайте — те же, что в приложении (src/user/screens):
// «Алмазный дождь», «Знаток Free Fire» и «Найди пару». Правила и очки
// одинаковые, рекорды попадают в общие топы (gameTop, gameTops/<игра>).
// Вопросы и карточки — из src/shared/minigames.ts (через data.js).

const PLAY_GAMES = [
  { id: 'rain', icon: '💎', name: 'Алмазный дождь', text: 'Лови алмазы, не трогай бомбы' },
  { id: 'quiz', icon: '🧠', name: 'Знаток Free Fire', text: '10 вопросов на скорость' },
  { id: 'pairs', icon: '🃏', name: 'Найди пару', text: 'Запомни и открой пары на время' },
];

// таймеры и кадры текущей игры — останавливаются при уходе со страницы
const play = { timers: new Set(), frame: 0 };
function stopPlay() {
  play.timers.forEach((t) => clearTimeout(t));
  play.timers.clear();
  cancelAnimationFrame(play.frame);
}
window.addEventListener('hashchange', stopPlay);
const later = (fn, ms) => { const t = setTimeout(() => { play.timers.delete(t); fn(); }, ms); play.timers.add(t); return t; };

// рекорды: «Алмазный дождь» — gameTop/<uid>, остальные — gameTops/<игра>/<uid>
const topPath = (game) => (game === 'rain' ? 'gameTop' : `gameTops/${game}`);
const localBest = (game) => { try { return Number(localStorage.getItem(`kovrix:best:${game}`)) || 0; } catch { return 0; } };
async function saveBest(game, score) {
  const before = Math.max(localBest(game), (await db('GET', `${topPath(game)}/${S.user.uid}`).catch(() => null))?.best ?? 0);
  if (score <= before) return false;
  try { localStorage.setItem(`kovrix:best:${game}`, String(score)); } catch { /* браузер не даёт сохранить */ }
  await db('PUT', `${topPath(game)}/${S.user.uid}`, { name: (S.user.nick || S.user.name || `ID ${S.user.id}`).slice(0, 40), best: score, at: Date.now() }).catch(() => {});
  return true;
}
async function topHtml(game) {
  const rows = Object.entries((await db('GET', topPath(game)).catch(() => null)) ?? {})
    .map(([uid, r]) => ({ ...r, uid })).sort((a, b) => b.best - a.best).slice(0, 10);
  return `<div class="card stack tight"><h3>Топ игроков Kovrix</h3>${rows.length
    ? rows.map((r, i) => `<div class="row between top-row${r.uid === S.user.uid ? ' me' : ''}"><span>${i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`} ${esc(r.name)}</span><b>${r.best}</b></div>`).join('')
    : '<p class="muted small">Пока никого — станьте первым!</p>'}</div>`;
}
const statsHtml = (items) => `<div class="game-stats">${items.map(([label, value, tone]) => `<div class="gstat ${tone ?? ''}"><small>${label}</small><b>${value}</b></div>`).join('')}</div>`;
const arena = (inner, cls = '') => `<div class="arena ${cls}"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>${inner}</div>`;
const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch { /* нет вибрации */ } };

async function viewPlay(game) {
  stopPlay();
  // без игры роутер передаёт строку 'undefined' — тогда список игр
  const run = { rain: playRain, quiz: playQuiz, pairs: playPairs }[game];
  if (!run) {
    app.innerHTML = `<h2>🕹️ Мини-игры</h2>
      <p class="muted">Играйте, пока ждёте заказ. Рекорды — в общем топе Kovrix.</p>
      <div class="play-list">${PLAY_GAMES.map((g) => `<a class="card link play-card" href="#/play/${g.id}"><i>${g.icon}</i><span class="grow"><b>${g.name}</b><br><span class="muted small">${g.text} · рекорд ${localBest(g.id)}</span></span><u>›</u></a>`).join('')}</div>`;
    return;
  }
  run();
}

// ——— «Алмазный дождь»: ловите 💎 нажатием, 👑 — +5, ❤️ — жизнь, 💣 — минус жизнь ———
async function playRain() {
  const FIELD_H = 440, SIZE = 56, LIVES = 3, MAX_LIVES = 5;
  const ICON = { gem: '💎', crown: '👑', bomb: '💣', heart: '❤️' };
  const levelOf = (score) => 1 + Math.floor(score / 15);
  const multOf = (combo) => Math.min(5, 1 + Math.floor(combo / 5));
  const g = { score: 0, lives: LIVES, combo: 0, on: false, drops: [], next: 0 };
  app.innerHTML = `<a class="back" href="#/play">‹ Мини-игры</a><div id="hud"></div>
    ${arena('<div class="field" id="field"></div><div class="overlay" id="over"></div>', 'rain')}
    <div id="top"></div><p class="muted small center">Подтверждение заказа — в течение дня, обычно быстрее.</p>`;
  const field = app.querySelector('#field'), over = app.querySelector('#over'), hud = app.querySelector('#hud');
  const drawHud = () => {
    const mult = multOf(g.combo);
    hud.innerHTML = statsHtml([['Счёт', g.score, 'main'], ['Уровень', mult > 1 ? `${levelOf(g.score)} ×${mult}` : levelOf(g.score)], ['Рекорд', Math.max(localBest('rain'), g.score)], ['Жизни', '❤️'.repeat(Math.max(g.lives, 0)) || '💀', g.lives <= 1 ? 'hot' : '']]);
  };
  const pop = (x, y, text, good) => {
    const el = document.createElement('b');
    el.className = `pop ${good ? 'good' : 'bad'}`;
    el.textContent = text;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    field.appendChild(el);
    later(() => el.remove(), 700);
  };
  const hurt = () => {
    g.lives -= 1; g.combo = 0; buzz(60);
    field.parentElement.classList.remove('shake'); void field.offsetWidth; field.parentElement.classList.add('shake');
    if (g.lives <= 0) finish();
    drawHud();
  };
  const finish = async () => {
    if (!g.on) return;
    g.on = false; stopPlay();
    g.drops.forEach((d) => d.el.remove()); g.drops = [];
    const record = await saveBest('rain', g.score);
    over.innerHTML = `<h2>${record ? '🎉 Новый рекорд!' : 'Игра окончена'}</h2><p class="result">${g.score}</p><button class="btn" id="go">🔁 Ещё раз</button>`;
    over.hidden = false;
    over.querySelector('#go').onclick = start;
    app.querySelector('#top').innerHTML = await topHtml('rain');
  };
  const spawn = () => {
    if (!g.on) return;
    const roll = Math.random();
    const kind = roll < 0.06 ? 'crown' : roll < 0.09 && g.lives < MAX_LIVES ? 'heart' : roll < 0.25 ? 'bomb' : 'gem';
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'drop'; el.textContent = ICON[kind];
    const drop = { id: g.next++, kind, el, x: Math.random() * Math.max(field.clientWidth - SIZE, 0), y: -SIZE, speed: (FIELD_H + SIZE) / (Math.max(1300, 3300 - levelOf(g.score) * 220) * (0.85 + Math.random() * 0.3)) };
    el.style.left = `${drop.x}px`;
    el.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (!g.on || !g.drops.includes(drop)) return;
      g.drops = g.drops.filter((d) => d !== drop); el.remove();
      if (kind === 'bomb') { pop(drop.x, drop.y, '💥', false); hurt(); return; }
      if (kind === 'heart') { g.lives = Math.min(MAX_LIVES, g.lives + 1); pop(drop.x, drop.y, '+❤️', true); drawHud(); return; }
      g.combo += 1;
      const before = levelOf(g.score);
      const points = (kind === 'crown' ? 5 : 1) * multOf(g.combo);
      g.score += points;
      pop(drop.x, drop.y, `+${points}`, true);
      if (levelOf(g.score) > before) pop(field.clientWidth / 2 - 60, FIELD_H / 2 - 20, `Уровень ${levelOf(g.score)}!`, true);
      drawHud();
    });
    field.appendChild(el);
    g.drops.push(drop);
    later(spawn, Math.max(330, 950 - levelOf(g.score) * 70));
  };
  let last = 0;
  const tick = (now) => {
    const dt = last ? now - last : 16;
    last = now;
    for (const d of [...g.drops]) {
      d.y += d.speed * dt;
      d.el.style.transform = `translateY(${d.y}px) rotate(${Math.sin((now + d.id * 300) / 400) * 15}deg)`;
      if (d.y > FIELD_H) {
        g.drops = g.drops.filter((x) => x !== d); d.el.remove();
        if (d.kind === 'gem' || d.kind === 'crown') { pop(d.x, FIELD_H - SIZE - 10, '💔', false); hurt(); }
      }
    }
    if (g.on) play.frame = requestAnimationFrame(tick);
  };
  const start = () => {
    Object.assign(g, { score: 0, lives: LIVES, combo: 0, on: true });
    g.drops.forEach((d) => d.el.remove()); g.drops = [];
    over.hidden = true; last = 0;
    drawHud(); spawn();
    play.frame = requestAnimationFrame(tick);
  };
  drawHud();
  over.innerHTML = `<h2>💎 Алмазный дождь</h2><p class="muted">Ловите 💎 нажатием, пока не упали. 👑 — +5 очков, ❤️ — жизнь, 💣 не трогайте! Серия без промахов даёт множитель до ×5.</p><button class="btn" id="go">▶ Играть</button>`;
  over.querySelector('#go').onclick = start;
  app.querySelector('#top').innerHTML = await topHtml('rain');
}

// ——— «Знаток Free Fire»: 10 вопросов по 12 секунд ———
async function playQuiz() {
  const ROUND = 10, SECONDS = 12;
  const shuffle = (list) => { const out = [...list]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };
  const q = { round: [], index: 0, score: 0, right: 0, streak: 0, left: SECONDS, picked: null };
  app.innerHTML = `<a class="back" href="#/play">‹ Мини-игры</a><div id="quiz"></div><div id="top"></div>`;
  const box = app.querySelector('#quiz');
  const ready = () => {
    box.innerHTML = arena(`<div class="center stack"><p class="big">🧠</p><h2>Знаток Free Fire</h2><p class="muted">${ROUND} вопросов о Free Fire и Kovrix, на каждый ${SECONDS} секунд. Отвечайте быстрее — получите больше очков, серия верных ответов даёт бонус.</p>${localBest('quiz') ? `<p class="gold"><b>Ваш рекорд: ${localBest('quiz')}</b></p>` : ''}<button class="btn" id="go">Начать</button></div>`, 'pad');
    box.querySelector('#go').onclick = startQuiz;
  };
  const startQuiz = () => {
    Object.assign(q, { round: shuffle(D.quiz).slice(0, ROUND).map((x) => ({ ...x, right: x.answers[0], answers: shuffle(x.answers) })), index: 0, score: 0, right: 0, streak: 0 });
    ask();
  };
  const ask = () => {
    q.left = SECONDS; q.picked = null;
    draw();
    const tick = () => {
      if (q.picked !== null) return;
      q.left -= 1;
      if (q.left <= 0) { q.picked = ''; q.streak = 0; buzz(60); }
      draw();
      if (q.picked === null) later(tick, 1000);
    };
    later(tick, 1000);
  };
  const draw = () => {
    const item = q.round[q.index];
    const done = q.picked !== null;
    box.innerHTML = arena(`${statsHtml([['Вопрос', `${q.index + 1}/${q.round.length}`], ['Очки', q.score, 'main'], ['Время', Math.max(q.left, 0), q.left <= 3 ? 'hot' : '']])}
      <div class="track"><i style="width:${(Math.max(q.left, 0) / SECONDS) * 100}%" class="${q.left <= 3 ? 'low' : ''}"></i></div>
      <h3 class="question">${esc(item.q)}</h3>
      <div class="answers">${item.answers.map((a, i) => {
        const cls = done && a === item.right ? 'right' : done && a === q.picked ? 'wrong' : '';
        return `<button class="answer ${cls}" data-i="${i}" ${done ? 'disabled' : ''}><span>${'ABCD'[i]}</span>${cls === 'right' ? '✅ ' : cls === 'wrong' ? '❌ ' : ''}${esc(a)}</button>`;
      }).join('')}</div>
      ${done ? `<p class="muted">${q.picked === '' ? `⏰ Время вышло. ${esc(item.why)}` : q.picked === item.right ? `🔥 Верно!${q.streak > 1 ? ` Серия ×${q.streak}.` : ''} ${esc(item.why)}` : `Неверно. ${esc(item.why)}`}</p>
        <button class="btn block" id="next">${q.index + 1 < q.round.length ? 'Дальше' : 'Результат'}</button>` : ''}`, 'pad');
    box.querySelectorAll('.answer').forEach((el) => { el.onclick = () => pick(item.answers[Number(el.dataset.i)]); });
    box.querySelector('#next')?.addEventListener('click', next);
  };
  const pick = (text) => {
    if (q.picked !== null) return;
    q.picked = text;
    const item = q.round[q.index];
    if (text === item.right) { q.score += 100 + q.left * 10 + q.streak * 20; q.right += 1; q.streak += 1; } else { q.streak = 0; buzz(60); }
    draw();
  };
  const next = async () => {
    if (q.index + 1 < q.round.length) { q.index += 1; ask(); return; }
    const record = await saveBest('quiz', q.score);
    box.innerHTML = arena(`<div class="center stack"><p class="big">${q.right >= 8 ? '🏆' : q.right >= 5 ? '👍' : '📚'}</p><h2>${record ? 'Новый рекорд!' : 'Игра окончена'}</h2><p class="result">${q.score}</p><p class="muted">Верных ответов: ${q.right} из ${q.round.length}${q.right === q.round.length ? ' — настоящий знаток!' : ''}</p><button class="btn" id="go">Ещё раз</button></div>`, 'pad');
    box.querySelector('#go').onclick = startQuiz;
    app.querySelector('#top').innerHTML = await topHtml('quiz');
  };
  ready();
  app.querySelector('#top').innerHTML = await topHtml('quiz');
}

// ——— «Найди пару»: уровни, время, +2 с за пару, серия — множитель до ×3 ———
async function playPairs() {
  const ICONS = D.pairIcons;
  const levelOf = (level) => { const pairs = Math.min(ICONS.length, 4 + level * 2); return { pairs, time: Math.max(18, pairs * 5 + 6 - Math.max(0, level - 4) * 4) }; };
  const p = { level: 1, score: 0, combo: 0, left: 0, tiles: [], phase: 'ready', lock: false, flash: '' };
  app.innerHTML = `<a class="back" href="#/play">‹ Мини-игры</a><div id="hud"></div><div class="track"><i id="bar"></i></div><p class="flash" id="flash"> </p><div id="board"></div><div id="top"></div>`;
  const hud = app.querySelector('#hud'), board = app.querySelector('#board');
  const drawHud = () => {
    const { pairs, time } = levelOf(p.level);
    const found = p.tiles.filter((t) => t.found).length / 2;
    const hurry = p.phase === 'play' && p.left <= 5;
    hud.innerHTML = statsHtml([['Счёт', p.score, 'main'], ['Уровень', p.level], ['Пары', `${found}/${pairs}`], ['Время', `⏱ ${Math.max(p.left, 0)}`, hurry ? 'hot' : '']]);
    const bar = app.querySelector('#bar');
    bar.style.width = `${Math.min(100, (Math.max(p.left, 0) / time) * 100)}%`;
    bar.className = hurry ? 'low' : '';
    app.querySelector('#flash').textContent = p.phase === 'preview' ? '👀 Запоминайте!' : p.flash || ' ';
  };
  const drawBoard = () => {
    board.innerHTML = arena(`<div class="pairs">${p.tiles.map((t, i) => `<button class="tile ${t.open || t.found ? 'open' : ''} ${t.found ? 'found' : ''}" data-i="${i}"><span class="back">K</span><span class="face">${t.icon}</span></button>`).join('')}</div>`, 'pad');
    board.querySelectorAll('.tile').forEach((el) => { el.onclick = () => tap(Number(el.dataset.i)); });
  };
  const begin = (level) => {
    const { pairs, time } = levelOf(level);
    const icons = ICONS.slice(0, pairs);
    p.level = level; p.left = time; p.combo = 0; p.flash = '';
    p.tiles = [...icons, ...icons].map((icon) => ({ icon, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ icon }) => ({ icon, open: true, found: false }));
    p.phase = 'preview'; p.lock = true;
    drawBoard(); drawHud();
    later(() => {
      p.tiles.forEach((t) => { t.open = false; });
      p.phase = 'play'; p.lock = false;
      drawBoard(); drawHud();
      const tick = () => {
        if (p.phase !== 'play') return;
        p.left -= 1;
        drawHud();
        if (p.left <= 0) { over(); return; }
        later(tick, 1000);
      };
      later(tick, 1000);
    }, 1500);
  };
  const tap = (i) => {
    const tile = p.tiles[i];
    if (p.lock || tile.open || tile.found || p.phase !== 'play') return;
    const opened = p.tiles.filter((t) => t.open && !t.found);
    tile.open = true;
    if (!opened.length) { drawBoard(); return; }
    const first = opened[0];
    if (first.icon === tile.icon) {
      first.found = tile.found = true;
      p.combo += 1;
      const mult = Math.min(3, p.combo);
      p.left += 2;
      let gained = 100 * mult;
      if (p.tiles.every((t) => t.found)) {
        gained += p.left * 10;
        p.flash = `Уровень ${p.level} пройден! +${p.left * 10}`;
        p.phase = 'clear'; p.lock = true;
        later(() => begin(p.level + 1), 900);
      } else {
        p.flash = mult > 1 ? `+${gained}  ×${mult}` : `+${gained}`;
      }
      p.score += gained;
      drawBoard(); drawHud();
      return;
    }
    p.combo = 0; p.lock = true; buzz(40);
    drawBoard();
    later(() => { first.open = false; tile.open = false; p.lock = false; drawBoard(); }, 650);
  };
  const over = async () => {
    p.phase = 'over'; stopPlay();
    const record = await saveBest('pairs', p.score);
    board.innerHTML = arena(`<div class="center stack"><p class="big">⌛</p><h2>${record ? '🎉 Новый рекорд!' : 'Время вышло'}</h2><p class="result">${p.score}</p><p class="muted">Вы дошли до уровня ${p.level}</p><button class="btn" id="go">🔁 Ещё раз</button></div>`, 'pad');
    board.querySelector('#go').onclick = startPairs;
    drawHud();
    app.querySelector('#top').innerHTML = await topHtml('pairs');
  };
  const startPairs = () => { p.score = 0; begin(1); };
  board.innerHTML = arena(`<div class="center stack"><p class="big">🃏</p><h2>Найди пару</h2><p class="muted">Запомните карточки, пока они открыты, и находите пары на время. Пара — +2 секунды, пары подряд — множитель до ×3. С каждым уровнем карточек больше.</p><button class="btn" id="go">▶ Играть</button></div>`, 'pad');
  board.querySelector('#go').onclick = startPairs;
  p.left = levelOf(1).time;
  drawHud();
  app.querySelector('#top').innerHTML = await topHtml('pairs');
}
