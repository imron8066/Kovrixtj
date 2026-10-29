// Правила базы Firebase собираются здесь, чтобы одно и то же условие
// («это админ», «не заблокирован») не переписывать руками в десяти местах.
// Запуск: npm run rules — создаёт firebase/database.rules.json;
// выложить в Firebase: firebase deploy --only database.
const fs = require('fs');
const path = require('path');

const AUTH = 'auth != null';
const IS_OWNER = "root.child('admins').child(auth.uid).val() === true";
// код входа в KovriX A (teamCode) задаёт владелец; пока сотрудник не ввёл
// верный код (unlock/<uid>), его роль в базе не действует. Владельцу код
// не нужен — так он не запрёт сам себя
const UNLOCKED = `(!root.child('teamCode').exists() || ${IS_OWNER} || root.child('unlock').child(auth.uid).val() === root.child('teamCode').val())`;
// роль раздаёт админ в приложении (roles/<uid>); владелец записан ещё
// и в admins — туда пишут только из консоли Firebase
const ADMIN = `${AUTH} && root.child('roles').child(auth.uid).val() === 'admin' && ${UNLOCKED}`;
// бот — тоже в roles, но код ему не нужен
const STAFF = `${AUTH} && root.child('roles').child(auth.uid).exists() && (root.child('roles').child(auth.uid).val() === 'bot' || ${UNLOCKED})`;
const OK = `!root.child('blocked').child(auth.uid).exists()`;
// что разрешено делать: админу — всё, заместителю — то, что админ отметил
// в его списке доступов (perms/<uid>/<доступ>: true)
const can = perm =>
  `${AUTH} && ${UNLOCKED} && (root.child('roles').child(auth.uid).val() === 'admin' || (root.child('roles').child(auth.uid).val() === 'deputy' && root.child('perms').child(auth.uid).child('${perm}').val() === true))`;
const SELF = `${AUTH} && auth.uid === $uid`;
const notOwner = `root.child('admins').child($uid).val() !== true`;
// админ удаляет аккаунт целиком («Ещё» → «Люди» → «Удалить аккаунт»)
const WIPE = `${ADMIN} && ${notOwner} && !newData.exists()`;
const BOT = `${AUTH} && root.child('roles').child(auth.uid).val() === 'bot'`;
// ключ восстановления: у клиента его берёт бот (новый код в Telegram),
// у сотрудника — админ (новый пароль); ключ владельца не хранится вовсе
const inTeam = `root.child('roles').child($uid).exists()`;
const RESET = `${notOwner} && ((${BOT} && !${inTeam}) || (${ADMIN} && ${inTeam}))`;

// время заявки клиента — «сейчас», а не выдуманное (±10 минут на часы телефона)
const FRESH = "newData.child('createdAt').val() > now - 600000 && newData.child('createdAt').val() < now + 600000";

// заявка клиента: создаёт её он сам со статусом «новая», решает тот, у кого
// есть доступ perm; отклонённую можно отправить заново
const request = perm => ({
  '.read': STAFF,
  $uid: {
    '.read': SELF,
    '.write': WIPE,
    $key: {
      '.write': `(${can(perm)}) || (${SELF} && ${OK} && (!data.exists() || data.child('status').val() === 'rejected') && newData.child('status').val() === 'new' && newData.child('uid').val() === $uid && ${FRESH} && !newData.child('decidedAt').exists() && !newData.child('decidedBy').exists())`,
      // сумма — положительное число, номер операции — короткая строка
      price: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() < 1000000' },
      txn: { '.validate': 'newData.isString() && newData.val().length <= 40' },
      // ссылка на видео аккаунта
      video: { '.validate': "newData.isString() && newData.val().length <= 300 && newData.val().matches(/^https?:\\/\\//)" },
      // промокод — только существующий
      // одноразовый код (once) второй раз тем же аккаунтом не принимается
      promoCode: { '.validate': "newData.isString() && root.child('codes').child(newData.val()).exists() && (data.exists() || root.child('codes').child(newData.val()).child('once').val() !== true || !root.child('usedCodes').child($uid).child(newData.val()).exists())" },
    },
  },
});

// только для чтения всем вошедшим; меняет тот, кто указан
const shared = write => ({ '.read': AUTH, '.write': write });

const meta = field =>
  `root.child('chats').child($chat).child('meta').child('${field}').val()`;
const inChat = `(${meta('a')} === auth.uid || ${meta('b')} === auth.uid || (${meta('b')} === 'staff' && (${can('chats')})))`;

const rules = {
  admins: { $uid: { '.read': SELF } },
  // код входа в KovriX A: видит и меняет только владелец
  teamCode: {
    '.read': `${AUTH} && ${IS_OWNER}`,
    '.write': `${AUTH} && ${IS_OWNER}`,
    '.validate': 'newData.isString() && newData.val().length >= 4 && newData.val().length <= 20',
  },
  // сотрудник вписывает код; база принимает только верный
  unlock: {
    $uid: {
      '.read': SELF,
      '.write': `(${SELF}) || (${WIPE})`,
      '.validate': "newData.val() === root.child('teamCode').val()",
    },
  },
  roles: {
    '.read': STAFF,
    $uid: {
      '.read': SELF,
      // себя и владельца разжаловать нельзя
      '.write': `${ADMIN} && auth.uid !== $uid && ${notOwner}`,
      '.validate': "newData.val() === 'admin' || newData.val() === 'deputy'",
    },
  },
  // список доступов заместителя; раздаёт админ
  perms: {
    '.read': STAFF,
    $uid: { '.read': SELF, '.write': ADMIN },
  },
  blocked: {
    '.read': STAFF,
    $uid: {
      '.read': SELF,
      '.write': `(${can('block')}) && auth.uid !== $uid && ${notOwner}`,
    },
  },
  ids: {
    $id: {
      '.write': `(${AUTH} && !data.exists() && newData.val() === auth.uid) || (${ADMIN} && !newData.exists())`,
    },
  },
  users: {
    '.read': STAFF,
    $uid: {
      '.read': SELF,
      '.write': `(${SELF} && ${OK}) || (${WIPE})`,
      '.validate': "newData.child('uid').val() === $uid",
      // кто пригласил — ставится один раз
      ref: { '.validate': "newData.isString() && (!data.exists() || data.val() === newData.val())" },
    },
  },
  // «Пригласи друга»: запись делает новичок (или бот) в первый час после
  // регистрации и только для того ID, который указан у него в ref
  invites: {
    '.read': STAFF,
    $id: {
      '.read': `${AUTH} && root.child('ids').child($id).val() === auth.uid`,
      $friend: {
        '.write': `(${AUTH} && (auth.uid === $friend || root.child('roles').child(auth.uid).val() === 'bot') && !data.exists() && root.child('ids').child($id).exists() && root.child('ids').child($id).val() !== $friend && root.child('users').child($friend).child('ref').val() === $id && root.child('users').child($friend).child('createdAt').val() > now - 3600000) || (${ADMIN} && !newData.exists())`,
        '.validate': "newData.hasChildren(['name', 'at'])",
      },
    },
  },
  orders: request('orders'),
  listings: request('accounts'),
  sales: request('accounts'),
  claims: request('claims'),
  photos: {
    '.read': STAFF,
    $uid: {
      '.read': SELF,
      '.write': WIPE,
      $key: { '.write': `${SELF} && ${OK} && !data.exists()` },
    },
  },
  // витрина: выставляет команда, продавец может только снять своё
  market: {
    '.read': AUTH,
    $code: {
      '.write': `(${can('accounts')}) || (${AUTH} && data.child('uid').val() === auth.uid && !newData.exists())`,
    },
  },
  marketPhotos: shared(can('accounts')),
  // свои фото-обложки игр (KovriX A → «Цены и товары»): видят все, даже без входа
  covers: {
    '.read': true,
    $game: {
      '.write': can('prices'),
      '.validate': "newData.isString() && newData.val().beginsWith('data:image/') && newData.val().length < 600000",
    },
  },
  donations: shared(can('orders')),
  config: {
    '.read': AUTH,
    // цены и свои товары (ваучеры, пропуски)
    prices: { '.write': can('prices') },
    products: { '.write': can('prices') },
    // курсы валют и реквизиты оплаты
    // курсы обновляет и бот — по open.er-api.com каждые 6 часов
    rates: { '.write': `(${can('money')}) || (${BOT})` },
    // последняя версия приложения: её записывает бот, когда в builds/
    // появляется новый APK
    version: { '.write': `(${ADMIN}) || (${BOT})` },
    pay: { '.write': can('money') },
    // награда за приглашённых друзей
    referral: { '.write': can('tasks') },
    // сколько людей скачали и пользуются — пересчитывает бот
    stats: { '.write': `(${ADMIN}) || (${BOT})` },
    // включён ли код входа в KovriX A (сам код — в teamCode)
    teamOn: { '.write': `${AUTH} && ${IS_OWNER}` },
  },
  // новости админа; бот отмечает, скольким чатам разослал
  news: {
    '.read': AUTH,
    '.write': can('promos'),
    $key: { sent: { '.write': BOT } },
  },
  promos: shared(can('promos')),
  // промокоды: список видит команда, клиент читает только код, который ввёл
  codes: {
    '.read': STAFF,
    // бот каждый день заменяет промокод дня
    '.write': `(${can('promos')}) || (${BOT})`,
    $code: { '.read': AUTH },
  },
  // одноразовые промокоды: кто какой уже использовал; отметку не снять
  usedCodes: {
    '.read': STAFF,
    $uid: {
      '.read': SELF,
      '.write': WIPE,
      $code: { '.write': `(${SELF} && !data.exists() && newData.isNumber()) || (${ADMIN})` },
    },
  },
  // промокод дня: цены задаёт админ, код меняет бот (клиенту не видно)
  daily: {
    '.read': STAFF,
    '.write': `(${can('promos')}) || (${BOT})`,
  },
  tasks: shared(can('tasks')),
  chats: {
    $chat: {
      '.read': `${AUTH} && (data.child('meta/a').val() === auth.uid || data.child('meta/b').val() === auth.uid || (${STAFF}))`,
      meta: {
        '.write': `${AUTH} && ${OK} && !data.exists() && newData.child('a').val() === auth.uid`,
        '.validate':
          "newData.hasChildren(['a', 'b', 'kind', 'title']) && (newData.child('b').val() === 'staff' || root.child('users').child(newData.child('b').val()).exists())",
      },
      messages: {
        $message: {
          '.write': `${AUTH} && ${OK} && !data.exists() && newData.child('from').val() === auth.uid && ${inChat}`,
          '.validate':
            "newData.child('text').isString() && newData.child('text').val().length <= 1000",
        },
      },
    },
  },
  // список чатов участника; 'staff' — общий список поддержки
  userChats: {
    // бот читает списки, чтобы сообщать о новых сообщениях в Telegram
    '.read': STAFF,
    $owner: {
      '.read': `${AUTH} && (auth.uid === $owner || ($owner === 'staff' && ${STAFF}))`,
      $chat: {
        '.write': `${AUTH} && ${inChat} && ($owner === ${meta('a')} || $owner === ${meta('b')})`,
      },
    },
  },
  devices: { $uid: { '.read': SELF, '.write': `(${SELF}) || (${WIPE})` } },
  // «в сети»: приложение и сайт, пока открыты, раз в полминуты пишут сюда
  // время сервера; команда видит, кто сейчас в сети и когда был
  seen: {
    '.read': STAFF,
    $uid: {
      '.write': `(${SELF}) || (${WIPE})`,
      '.validate': 'newData.isNumber() && newData.val() <= now + 60000',
    },
  },
  // Telegram привязывает бот; отвязать может и сам клиент
  tg: {
    '.read': STAFF,
    $uid: {
      '.read': SELF,
      '.write': `(${STAFF}) || (${SELF} && !newData.exists())`,
    },
  },
  // ник, выбранный в профиле: читают все (по нему ищут вход до входа),
  // занять можно свободный, менять и освобождать — только свой
  nicks: {
    $nick: {
      '.read': true,
      '.write': `(${AUTH} && ${OK} && (!data.exists() || data.child('uid').val() === auth.uid) && (!newData.exists() || newData.child('uid').val() === auth.uid)) || (${ADMIN} && !newData.exists())`,
      '.validate': "$nick.matches(/^[a-z0-9_.-]{3,20}$/) && newData.hasChildren(['uid', 'email'])",
    },
  },
  recovery: {
    $uid: {
      '.read': RESET,
      '.write': `(${RESET}) || (${SELF} && ${notOwner}) || (${WIPE})`,
      '.validate': 'newData.isString()',
    },
  },
  // Одноразовая ссылка «войти на сайт» из бота: знает её только тот, кому
  // бот её прислал; живёт пять минут, сайт стирает её после входа
  logins: {
    $key: {
      '.read': "data.child('until').val() > now",
      '.write': `(${BOT}) || !newData.exists()`,
    },
  },
  // Журнал команды: кто что решил. Запись только добавляется (от своего
  // имени); изменить и стереть её из приложений нельзя — только в консоли
  history: {
    '.read': `(${can('money')}) || (${can('stats')})`,
    $key: {
      '.write': `${STAFF} && !data.exists() && newData.child('by').val() === auth.uid`,
      '.validate': "newData.hasChildren(['at', 'by', 'kind', 'code', 'status']) && newData.child('at').val() <= now + 60000",
    },
  },
  // топ мини-игры «Алмазный дождь»: каждый пишет только свой рекорд
  gameTop: {
    '.read': AUTH,
    $uid: {
      '.write': `(${SELF} && ${OK}) || (${WIPE}) || (${ADMIN})`,
      '.validate': "newData.hasChildren(['name', 'best', 'at']) && newData.child('best').isNumber() && newData.child('best').val() >= 0 && newData.child('best').val() <= 100000 && newData.child('name').isString() && newData.child('name').val().length <= 40",
    },
  },  // топы остальных мини-игр: викторина и «Найди пару»
  gameTops: {
    '.read': AUTH,
    $game: {
      '.validate': "$game === 'quiz' || $game === 'pairs'",
      $uid: {
        '.write': `(${SELF} && ${OK}) || (${WIPE}) || (${ADMIN})`,
        '.validate': "newData.hasChildren(['name', 'best', 'at']) && newData.child('best').isNumber() && newData.child('best').val() >= 0 && newData.child('best').val() <= 100000 && newData.child('name').isString() && newData.child('name').val().length <= 40",
      },
    },
  },

  // о чём бот уже сообщил
  botSeen: { '.read': STAFF, '.write': STAFF },
};

const out = path.join(__dirname, '../firebase/database.rules.json');
fs.writeFileSync(out, JSON.stringify({ rules }, null, 2) + '\n');
console.log('Готово: firebase/database.rules.json');
