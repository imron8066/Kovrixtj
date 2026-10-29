// Свой сервер вместо Firebase: вход и регистрация, база с теми же правилами
// доступа (firebase/database.rules.json) и сайт из папки web/.
// Говорит на том же языке, что Firebase (Auth REST и Realtime Database
// REST), поэтому приложениям, сайту и боту достаточно сменить адрес.
// Без библиотек — только Node. Запуск: node server/server.js
// (порт — PORT, по умолчанию 8080; данные — server/data/).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const WEB = path.join(ROOT, 'web');
const RULES_FILE = path.join(ROOT, 'firebase/database.rules.json');
const PORT = Number(process.env.PORT || 8080);
const HOUR = 3600;

fs.mkdirSync(path.join(DATA, 'backups'), { recursive: true });

const log = (...args) => console.log(new Date().toLocaleString('ru-RU'), ...args);

// ——— хранение ———

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));
  } catch {
    return fallback;
  }
}

let db = readJson('db.json', null);
let accounts = readJson('accounts.json', {});
let secret = readJson('secret.json', null);
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(path.join(DATA, 'secret.json'), JSON.stringify(secret), { mode: 0o600 });
}
let byEmail = new Map(Object.entries(accounts).map(([uid, a]) => [a.email, uid]));

function writeAtomic(file, value) {
  const target = path.join(DATA, file);
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(`${target}.tmp`, target);
}

// запись на диск — не чаще раза в полсекунды
let dirty = false;
function save() {
  if (dirty) return;
  dirty = true;
  setTimeout(flush, 500);
}
function flush() {
  if (!dirty) return;
  dirty = false;
  writeAtomic('db.json', db);
  writeAtomic('accounts.json', accounts);
}

// Копия базы и аккаунтов раз в сутки; хранятся последние 30
function backup() {
  flush();
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(DATA, 'backups', `${day}.json`);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ db, accounts }), { mode: 0o600 });
    log('копия базы:', path.relative(ROOT, file));
  }
  const old = fs.readdirSync(path.join(DATA, 'backups')).filter((f) => f.endsWith('.json')).sort();
  for (const f of old.slice(0, -30)) fs.unlinkSync(path.join(DATA, 'backups', f));
}

// ——— дерево данных ———

const split = (p) => String(p ?? '').split('/').filter(Boolean);

function getAt(tree, parts) {
  let node = tree;
  for (const part of parts) {
    if (node === null || typeof node !== 'object') return null;
    node = node[part] ?? null;
  }
  return node;
}

// пустые объекты и null в Firebase не хранятся
function clean(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    const c = clean(child);
    if (c !== null) out[key] = c;
  }
  return Object.keys(out).length ? out : null;
}

// новое дерево с заменой по пути; старое не меняется
function setAt(tree, parts, value) {
  if (!parts.length) return clean(value);
  const [head, ...rest] = parts;
  const base = tree !== null && typeof tree === 'object' ? tree : {};
  const next = { ...base, [head]: setAt(base[head] ?? null, rest, value) };
  if (next[head] === null) delete next[head];
  return Object.keys(next).length ? next : null;
}

// ключ записи как у Firebase: идут по времени
const PUSH = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
let lastPush = 0;
let lastRand = [];
function pushKey() {
  let now = Date.now();
  const same = now === lastPush;
  lastPush = now;
  let time = '';
  for (let i = 0; i < 8; i++) {
    time = PUSH[now % 64] + time;
    now = Math.floor(now / 64);
  }
  if (!same) {
    lastRand = Array.from({ length: 12 }, () => crypto.randomInt(64));
  } else {
    let i = 11;
    while (i >= 0 && lastRand[i] === 63) lastRand[i--] = 0;
    if (i >= 0) lastRand[i]++;
  }
  return time + lastRand.map((n) => PUSH[n]).join('');
}

// ——— правила доступа ———

// методы строк из языка правил Firebase
for (const [name, fn] of Object.entries({
  matches(re) { return re.test(this); },
  contains(s) { return this.includes(s); },
  beginsWith(s) { return this.startsWith(s); },
})) {
  Object.defineProperty(String.prototype, name, { value: fn, configurable: true, writable: true });
}

class Snap {
  constructor(tree, parts) {
    this.tree = tree;
    this.parts = parts;
  }
  val() {
    return getAt(this.tree, this.parts);
  }
  child(p) {
    return new Snap(this.tree, [...this.parts, ...split(p)]);
  }
  parent() {
    return new Snap(this.tree, this.parts.slice(0, -1));
  }
  exists() {
    return this.val() !== null;
  }
  hasChild(p) {
    return this.child(p).exists();
  }
  hasChildren(list) {
    const v = this.val();
    if (v === null || typeof v !== 'object') return false;
    return (list ?? []).every((k) => this.child(k).exists());
  }
  isNumber() {
    return typeof this.val() === 'number';
  }
  isString() {
    return typeof this.val() === 'string';
  }
  isBoolean() {
    return typeof this.val() === 'boolean';
  }
}

let rules = {};
function loadRules() {
  rules = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8')).rules;
  compiled.clear();
}
const compiled = new Map();

function check(rule, scope) {
  if (typeof rule === 'boolean') return rule;
  if (typeof rule !== 'string') return false;
  const names = Object.keys(scope);
  const id = `${names.join(',')}|${rule}`;
  let fn = compiled.get(id);
  if (!fn) {
    // eslint-disable-next-line no-new-func
    fn = new Function(...names, `return (${rule});`);
    compiled.set(id, fn);
  }
  try {
    return fn(...names.map((n) => scope[n])) === true;
  } catch {
    return false;
  }
}

// узел правил для части пути: точное имя или $переменная
function step(node, part, vars) {
  if (!node || typeof node !== 'object') return null;
  if (node[part]) return node[part];
  const wild = Object.keys(node).find((k) => k.startsWith('$'));
  if (!wild) return null;
  vars[wild] = part;
  return node[wild];
}

function scopeFor(auth, oldTree, newTree, parts, vars) {
  return {
    auth,
    now: Date.now(),
    root: new Snap(oldTree, []),
    data: new Snap(oldTree, parts),
    newData: new Snap(newTree, parts),
    ...vars,
  };
}

// разрешение (.read/.write) где-то от корня до места — значит можно
function allowed(kind, auth, parts, oldTree, newTree) {
  const vars = {};
  let node = rules;
  for (let i = 0; ; i++) {
    if (node && node[kind] !== undefined && check(node[kind], scopeFor(auth, oldTree, newTree, parts.slice(0, i), vars))) {
      return true;
    }
    if (i === parts.length) return false;
    node = step(node, parts[i], vars);
    if (!node) return false;
  }
}

// .validate: у всех узлов выше места и у каждого узла новых данных
function valid(auth, parts, oldTree, newTree) {
  const vars = {};
  let node = rules;
  const ok = (n, at, v) => {
    if (!n || n['.validate'] === undefined) return true;
    if (getAt(newTree, at) === null) return true;
    return check(n['.validate'], scopeFor(auth, oldTree, newTree, at, v));
  };
  for (let i = 0; i < parts.length; i++) {
    if (!ok(node, parts.slice(0, i), vars)) return false;
    node = step(node, parts[i], vars);
    if (!node) return true;
  }
  const deep = (n, at, v) => {
    if (!ok(n, at, v)) return false;
    const value = getAt(newTree, at);
    if (value === null || typeof value !== 'object') return true;
    return Object.keys(value).every((key) => {
      const childVars = { ...v };
      const c = step(n, key, childVars);
      return !c || deep(c, [...at, key], childVars);
    });
  };
  return deep(node, parts, vars);
}

// ——— аккаунты и пропуска ———

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (body) => crypto.createHmac('sha256', secret).update(body).digest('base64url');

function issue(uid) {
  const a = accounts[uid];
  const idBody = b64(JSON.stringify({ uid, email: a.email, exp: Date.now() + HOUR * 1000 }));
  // ключ входа живёт, пока не сменят пароль (gen растёт при смене)
  const refreshBody = b64(JSON.stringify({ uid, gen: a.gen, r: crypto.randomBytes(9).toString('base64url') }));
  return {
    localId: uid,
    email: a.email,
    idToken: `${idBody}.${sign(idBody)}`,
    refreshToken: `${refreshBody}.${sign(refreshBody)}`,
    expiresIn: String(HOUR),
  };
}

function verify(token) {
  const [body, mac] = String(token ?? '').split('.');
  if (!body || !mac) return null;
  const expected = sign(body);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
}

function userOfIdToken(token) {
  const t = verify(token);
  if (!t || !t.exp || t.exp < Date.now() || !accounts[t.uid]) return null;
  return t.uid;
}

function hash(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString('hex');
}

class Fail extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// попытки входа с одного адреса: не больше 30 неудачных за 10 минут
const attempts = new Map();
function tooMany(ip) {
  const list = (attempts.get(ip) ?? []).filter((t) => t > Date.now() - 600000);
  attempts.set(ip, list);
  return list.length >= 30;
}

function createUser(email, password) {
  email = String(email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new Fail(400, 'INVALID_EMAIL');
  if (String(password ?? '').length < 6) throw new Fail(400, 'WEAK_PASSWORD : Password should be at least 6 characters');
  if (byEmail.has(email)) throw new Fail(400, 'EMAIL_EXISTS');
  let uid;
  do uid = crypto.randomBytes(21).toString('base64url').replace(/[-_]/g, '').slice(0, 28); while (accounts[uid]);
  const salt = crypto.randomBytes(16).toString('hex');
  accounts[uid] = { email, salt, hash: hash(password, salt), gen: 1, createdAt: Date.now() };
  byEmail.set(email, uid);
  save();
  return uid;
}

function setPassword(uid, password) {
  if (String(password ?? '').length < 6) throw new Fail(400, 'WEAK_PASSWORD : Password should be at least 6 characters');
  const a = accounts[uid];
  a.salt = crypto.randomBytes(16).toString('hex');
  a.hash = hash(password, a.salt);
  a.gen += 1;
  save();
}

function authAction(action, body, ip) {
  switch (action) {
    case 'signUp':
      return issue(createUser(body.email, body.password));
    case 'signInWithPassword': {
      if (tooMany(ip)) throw new Fail(400, 'TOO_MANY_ATTEMPTS_TRY_LATER');
      const uid = byEmail.get(String(body.email ?? '').trim().toLowerCase());
      const a = uid && accounts[uid];
      const given = a ? hash(body.password ?? '', a.salt) : '';
      if (!a || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(a.hash))) {
        attempts.get(ip).push(Date.now());
        throw new Fail(400, 'INVALID_LOGIN_CREDENTIALS');
      }
      return issue(uid);
    }
    case 'lookup': {
      const uid = userOfIdToken(body.idToken);
      if (!uid) throw new Fail(400, 'INVALID_ID_TOKEN');
      return { users: [{ localId: uid, email: accounts[uid].email, createdAt: String(accounts[uid].createdAt) }] };
    }
    case 'update': {
      const uid = userOfIdToken(body.idToken);
      if (!uid) throw new Fail(400, 'INVALID_ID_TOKEN');
      if (body.password !== undefined) setPassword(uid, body.password);
      return issue(uid);
    }
    case 'delete': {
      const uid = userOfIdToken(body.idToken);
      if (!uid) throw new Fail(400, 'INVALID_ID_TOKEN');
      byEmail.delete(accounts[uid].email);
      delete accounts[uid];
      save();
      return {};
    }
    default:
      throw new Fail(404, 'NOT_FOUND');
  }
}

function refresh(form) {
  const t = verify(form.get('refresh_token'));
  const a = t && accounts[t.uid];
  if (!a || a.gen !== t.gen) throw new Fail(400, 'INVALID_REFRESH_TOKEN');
  const next = issue(t.uid);
  return {
    access_token: next.idToken,
    id_token: next.idToken,
    refresh_token: next.refreshToken,
    expires_in: String(HOUR),
    token_type: 'Bearer',
    user_id: t.uid,
  };
}

// ——— база ———

function dbRequest(method, parts, query, body) {
  const token = query.get('auth');
  let auth = null;
  if (token) {
    const uid = userOfIdToken(token);
    if (!uid) throw new Fail(401, 'Auth token is expired');
    auth = { uid, token: { email: accounts[uid].email } };
  }
  if (method === 'GET') {
    if (!allowed('.read', auth, parts, db, db)) throw new Fail(401, 'Permission denied');
    return getAt(db, parts);
  }
  // записи: [путь, значение]; PATCH — несколько сразу, проверяются вместе
  let writes;
  let reply;
  if (method === 'PUT') {
    writes = [[parts, body]];
    reply = body;
  } else if (method === 'DELETE') {
    writes = [[parts, null]];
    reply = null;
  } else if (method === 'POST') {
    const name = pushKey();
    writes = [[[...parts, name], body]];
    reply = { name };
  } else if (method === 'PATCH') {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Fail(400, 'Invalid data; couldn\'t parse JSON object.');
    writes = Object.entries(body).map(([key, value]) => [[...parts, ...split(key)], value]);
    reply = body;
  } else {
    throw new Fail(405, 'Method not allowed');
  }
  let next = db;
  for (const [at, value] of writes) next = setAt(next, at, value);
  for (const [at] of writes) {
    if (!allowed('.write', auth, at, db, next) || !valid(auth, at, db, next)) throw new Fail(401, 'Permission denied');
  }
  db = next;
  save();
  return reply;
}

// ——— служебное (только с этого же компьютера, по секрету) ———

function adminAction(body) {
  switch (body.op) {
    case 'user': {
      const email = String(body.email).toLowerCase();
      const uid = byEmail.get(email) ?? createUser(email, body.password);
      if (body.password) setPassword(uid, body.password);
      return { uid };
    }
    case 'get':
      return getAt(db, split(body.path));
    case 'set':
      db = setAt(db, split(body.path), body.value);
      save();
      return { ok: true };
    case 'accounts':
      return Object.fromEntries(Object.entries(accounts).map(([uid, a]) => [uid, a.email]));
    case 'rules':
      loadRules();
      return { ok: true };
    case 'import': {
      // перенос из выгрузки Firebase: { db, accounts? }
      db = clean(body.db);
      save();
      return { ok: true };
    }
    default:
      throw new Fail(400, 'unknown op');
  }
}

// ——— сайт ———

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function serveFile(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    rel = '/';
  }
  if (rel.split('/').some((p) => p.startsWith('.'))) return notFound(res);
  let file = path.join(WEB, rel);
  if (!file.startsWith(WEB)) return notFound(res);
  let stat = fs.statSync(file, { throwIfNoEntry: false });
  if (stat?.isDirectory()) {
    if (!pathname.endsWith('/')) {
      res.writeHead(301, { Location: `${pathname}/` });
      return res.end();
    }
    file = path.join(file, 'index.html');
    stat = fs.statSync(file, { throwIfNoEntry: false });
  }
  if (!stat?.isFile()) return notFound(res);
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': file.endsWith('.html') || file.endsWith('.js') ? 'no-cache' : 'public, max-age=3600',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>404</h1><p>Страница не найдена.</p>');
}

// ——— HTTP ———

const MAX_BODY = 20 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Fail(413, 'Payload too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, value) {
  const text = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, PATCH, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  const url = new URL(req.url, 'http://x');
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',')[0].trim();
  const p = url.pathname;
  const isAuth = p.startsWith('/api/auth/');
  try {
    if (isAuth) {
      if (req.method !== 'POST') throw new Fail(405, 'Method not allowed');
      const raw = await readBody(req);
      if (p === '/api/auth/token') {
        return send(res, 200, refresh(new URLSearchParams(raw)));
      }
      const action = p.match(/^\/api\/auth\/accounts:(\w+)$/)?.[1];
      let body = {};
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        throw new Fail(400, 'INVALID_JSON');
      }
      return send(res, 200, authAction(action, body, ip));
    }
    if (p.startsWith('/api/db')) {
      const m = p.match(/^\/api\/db(\/.*)?\.json$/);
      if (!m) throw new Fail(404, 'Not found');
      const parts = split(decodeURIComponent(m[1] ?? ''));
      let body;
      if (req.method !== 'GET' && req.method !== 'DELETE') {
        const raw = await readBody(req);
        try {
          body = JSON.parse(raw);
        } catch {
          throw new Fail(400, 'Invalid data; couldn\'t parse JSON object.');
        }
      }
      return send(res, 200, dbRequest(req.method, parts, url.searchParams, body));
    }
    if (p === '/api/admin') {
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && !req.headers['x-forwarded-for'];
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!local || body.secret !== secret) throw new Fail(403, 'Forbidden');
      return send(res, 200, adminAction(body));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new Fail(405, 'Method not allowed');
    return serveFile(req, res, p);
  } catch (e) {
    const status = e instanceof Fail ? e.status : 500;
    if (status === 500) log('ошибка:', req.method, p, e);
    // вход отвечает { error: { message } }, база — { error: 'текст' }
    return send(res, status, isAuth ? { error: { code: status, message: e.message } } : { error: e.message });
  }
});

loadRules();
fs.watchFile(RULES_FILE, { interval: 2000 }, () => {
  try {
    loadRules();
    log('правила базы обновлены');
  } catch (e) {
    log('правила не прочитаны:', e.message);
  }
});
backup();
setInterval(backup, HOUR * 1000);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    flush();
    process.exit(0);
  });
}

server.listen(PORT, () => log(`сервер Donix: http://localhost:${PORT} (данные — ${path.relative(ROOT, DATA) || DATA})`));
