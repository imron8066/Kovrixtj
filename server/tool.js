// Служебные команды для запущенного сервера (только на том же компьютере):
//   node server/tool.js owner <ник> <пароль>   — владелец (админ, как Imron)
//   node server/tool.js bot                    — аккаунт бота из bot/.env
//   node server/tool.js user <почта> <пароль>  — аккаунт или новый пароль
//   node server/tool.js get <путь>             — прочитать из базы
//   node server/tool.js set <путь> <json>      — записать в базу (мимо правил)
//   node server/tool.js accounts               — все аккаунты
//   node server/tool.js import <файл.json>     — база из выгрузки Firebase
const fs = require('fs');
const path = require('path');

const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const PORT = Number(process.env.PORT || 8080);
const secret = JSON.parse(fs.readFileSync(path.join(DATA, 'secret.json'), 'utf8'));

async function admin(body) {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, secret }),
  });
  const reply = await res.json();
  if (!res.ok) throw new Error(reply.error ?? res.status);
  return reply;
}

// анкета в базе — как её заводит приложение
async function profile(uid, name, nick, role) {
  const id = 100000 + Math.floor(Math.random() * 900000);
  const now = Date.now();
  await admin({ op: 'set', path: `ids/${id}`, value: uid });
  await admin({ op: 'set', path: `users/${uid}`, value: { uid, id, name, phone: '', country: 'TJ', login: nick, nick, createdAt: now } });
  if (nick) await admin({ op: 'set', path: `nicks/${nick.toLowerCase()}`, value: { uid, email: `n${nick.toLowerCase()}@donix.example.com` } });
  if (role) await admin({ op: 'set', path: `roles/${uid}`, value: role });
  return id;
}

function env() {
  const file = path.join(__dirname, '../bot/.env');
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8').split('\n')
      .filter((l) => /^\w+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  switch (cmd) {
    case 'owner': {
      if (!a || !b) throw new Error('node server/tool.js owner <ник> <пароль>');
      const nick = a.toLowerCase();
      const { uid } = await admin({ op: 'user', email: `n${nick}@donix.example.com`, password: b });
      const id = await profile(uid, a, a, 'admin');
      await admin({ op: 'set', path: `admins/${uid}`, value: true });
      console.log(`Владелец ${a}: uid ${uid}, ID ${id}. Вход — ник ${a} и пароль.`);
      break;
    }
    case 'bot': {
      const e = env();
      const { uid } = await admin({ op: 'user', email: e.BOT_EMAIL, password: e.BOT_PASSWORD });
      await admin({ op: 'set', path: `roles/${uid}`, value: 'bot' });
      console.log(`Бот: uid ${uid}`);
      break;
    }
    case 'user':
      console.log(await admin({ op: 'user', email: a, password: b }));
      break;
    case 'get':
      console.log(JSON.stringify(await admin({ op: 'get', path: a ?? '' }), null, 2));
      break;
    case 'set':
      console.log(await admin({ op: 'set', path: a, value: JSON.parse(b) }));
      break;
    case 'accounts':
      console.log(await admin({ op: 'accounts' }));
      break;
    case 'import':
      console.log(await admin({ op: 'import', db: JSON.parse(fs.readFileSync(a, 'utf8')) }));
      break;
    default:
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 8).join('\n'));
  }
}

main().catch((e) => {
  console.error('Ошибка:', e.message);
  process.exit(1);
});
