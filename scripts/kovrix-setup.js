// Первая настройка нового проекта Firebase (kovrixtj): правила базы и сайт,
// аккаунт бота (из bot/.env) и владельца Imron, перезапуск бота.
// Перед запуском: Firebase → Authentication → Get started → Email/Password.
// Запуск: node scripts/kovrix-setup.js
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROJECT = 'kovrixtj';
const config = fs.readFileSync(path.join(ROOT, 'src/shared/config.ts'), 'utf8');
const pick = name => config.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`))[1];
const KEY = pick('FIREBASE_API_KEY');
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, 'bot/.env'), 'utf8')
    .split('\n')
    .filter(l => /^\w+=/.test(l))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);

const firebase = (...args) =>
  execFileSync('firebase', [...args, '--project', PROJECT], {
    cwd: ROOT,
    stdio: 'inherit',
  });

// аккаунт: вход, а если его нет — регистрация
async function account(email, password) {
  for (const action of ['signInWithPassword', 'signUp']) {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
    const reply = await res.json();
    if (res.ok) return reply.localId;
    const code = reply.error?.message ?? '';
    if (
      code.startsWith('CONFIGURATION_NOT_FOUND') ||
      code.startsWith('OPERATION_NOT_ALLOWED')
    ) {
      throw new Error(
        'Включите Authentication → Email/Password в консоли Firebase и запустите снова.',
      );
    }
    if (action === 'signUp') throw new Error(`${email}: ${code}`);
  }
}

async function main() {
  console.log('1) Правила базы и сайт');
  execFileSync('node', ['scripts/web-data.js'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  firebase('deploy', '--only', 'database,hosting');

  console.log('2) Аккаунт бота');
  const bot = await account(env.BOT_EMAIL, env.BOT_PASSWORD);

  console.log('3) Владелец Imron');
  const ownerFile = path.join(ROOT, 'bot/owner.txt');
  const password = fs.existsSync(ownerFile)
    ? fs.readFileSync(ownerFile, 'utf8').trim().split(' ')[1]
    : String(crypto.randomInt(10000000, 99999999));
  const email = 'nimron@donix.example.com';
  const owner = await account(email, password);
  fs.writeFileSync(ownerFile, `Imron ${password}\n`, { mode: 0o600 });
  const id = 100000 + crypto.randomInt(900000);

  const data = {
    [`roles/${bot}`]: 'bot',
    [`roles/${owner}`]: 'admin',
    [`admins/${owner}`]: true,
    [`ids/${id}`]: owner,
    [`users/${owner}`]: {
      uid: owner,
      id,
      name: 'Imron',
      phone: '',
      country: 'TJ',
      login: 'Imron',
      nick: 'Imron',
      createdAt: Date.now(),
    },
    'nicks/imron': { uid: owner, email },
  };
  const file = path.join(os.tmpdir(), 'kovrix-setup.json');
  fs.writeFileSync(file, JSON.stringify(data));
  firebase('database:update', '/', file, '--force');
  fs.rmSync(file);

  console.log('4) Перезапуск бота');
  execFileSync('launchctl', [
    'kickstart',
    '-k',
    `gui/${os.userInfo().uid}/tj.donix.bot`,
  ]);

  console.log(`\nГОТОВО. Сайт: https://${PROJECT}.web.app`);
  console.log(
    `Вход владельца: ник Imron, пароль ${password} (сохранён в bot/owner.txt)`,
  );
}

main().catch(e => {
  console.error('Ошибка:', e.message);
  process.exit(1);
});
