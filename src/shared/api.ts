import {
  accountEmail,
  createAccount,
  db,
  publicGet,
  setPasswordWith,
  signIn,
  signUp,
  updatePassword,
} from './firebase';
import {
  Chat,
  Claim,
  Client,
  CloudConfig,
  Device,
  Donation,
  HistoryEntry,
  Listing,
  Lot,
  Invite,
  Message,
  News,
  Order,
  Perm,
  Perms,
  Product,
  DailyCode,
  Promo,
  PromoCode,
  Role,
  Sale,
  Status,
  Task,
  User,
} from './types';
import { APP_NAME } from './config';
import { newUserId } from './utils';

// Что лежит в базе Firebase (кто что может — firebase/database.rules.json):
//   users/<uid>               — клиент: ID, имя, телефон, страна
//   ids/<ID клиента>          — занятые ID, чтобы они не повторялись
//   roles/<uid>               — 'admin' | 'deputy' | 'bot'; раздаёт админ
//   admins/<uid>: true        — владелец: его нельзя разжаловать и заблокировать
//   blocked/<uid>: true       — заблокированные
//   orders/<uid>/<код>        — заказы доната
//   listings/<uid>/<код>      — аккаунты на продажу (заявка продавца)
//   sales/<uid>/<код>         — «аккаунт продан» с чеком
//   claims/<uid>/<задание>    — «задание выполнено»
//   photos/<uid>/<ключ>       — фото к заявкам (отдельно, чтобы списки
//                               загружались быстро)
//   market/<код>              — витрина: принятые аккаунты, видят все
//   marketPhotos/<код>        — фото для витрины
//   donations/<код>           — зачисленные донаты: топ и статистика
//   config, promos, tasks     — цены, курсы, реквизиты, акции, задания
//   chats/<чат>               — meta и messages; userChats/<uid>/<чат> —
//                               список чатов участника ('staff' — поддержка)
//   devices/<uid>/<телефон>   — с каких устройств входили
//   seen/<uid>                — когда последний раз был в приложении
//                               или на сайте («в сети»)
//   tg/<uid>                  — Telegram, подтверждённый ботом
//   nicks/<ник>               — { uid, email }: ник, который человек сам
//                               выбрал в профиле; по нему находится вход
//   invites/<ID>/<uid друга>  — кого пригласил клиент (пишет новичок
//                               при регистрации или бот)
//   news/<ключ>               — новости админа; бот рассылает их в Telegram
//   recovery/<uid>            — ключ восстановления: по нему бот выдаёт
//                               клиенту новый код, а админ меняет пароль
//                               сотруднику

export type RequestKind = 'orders' | 'listings' | 'sales' | 'claims';
type Item = Order | Listing | Sale | Claim;

// ——— вход ———

interface Registration {
  name: string;
  phone: string;
  country: string;
  password: string;
  // ID друга, который пригласил
  ref?: string;
}

// шесть цифр — это ID, который выдал Telegram-бот, а не номер телефона
export const isId = (text: string) => /^\d{6}$/.test(text);

// Firebase входит по почте, а у клиента — номер телефона, ник или ID
// из бота: из них делается служебный адрес. Письма на него не отправляются.
// Настоящая почта (регистрация по Gmail на сайте) — как есть.
export const isEmail = (text: string) =>
  /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(text.trim());
export const emailOf = (login: string) =>
  isEmail(login)
    ? login.trim().toLowerCase()
    : /[a-z]/i.test(login)
    ? `n${login.toLowerCase().replace(/[^a-z0-9_.-]/g, '')}@donix.example.com`
    : isId(login)
    ? `i${login}@donix.example.com`
    : `p${login.replace(/\D/g, '')}@donix.example.com`;

async function createProfile(
  uid: string,
  data: Pick<User, 'name' | 'phone' | 'login' | 'country' | 'ref'>,
): Promise<User> {
  let id = newUserId();
  for (let attempt = 0; ; attempt++) {
    try {
      // правила базы не дают занять чужой ID
      await db('PUT', `ids/${id}`, uid);
      break;
    } catch (e) {
      if (attempt >= 4) {
        throw e;
      }
      id = newUserId();
    }
  }
  const user: User = { uid, id, ...data, createdAt: Date.now() };
  await db('PUT', `users/${uid}`, user);
  return user;
}

export async function register({ password, ref, ...data }: Registration) {
  const friend = ref && isId(ref.trim()) ? ref.trim() : undefined;
  const user = await createProfile(
    await signUp(emailOf(data.phone), password),
    { ...data, login: data.phone, ...(friend ? { ref: friend } : {}) },
  );
  // неверный ID друга регистрации не мешает — приглашение просто не засчитается
  if (friend) {
    await db('PUT', `invites/${friend}/${user.uid}`, {
      name: user.name,
      at: Date.now(),
    }).catch(() => {});
  }
  return user;
}

// ——— пригласи друга ———

// ссылка-приглашение: сайт открывает регистрацию с ID друга
export const inviteLink = (site: string, id: number) =>
  `${site}/user/#/r/${id}`;

export const loadInvites = async (id: number) =>
  Object.entries(
    (await db<Stored<Omit<Invite, 'uid'>>>('GET', `invites/${id}`)) ?? {},
  )
    .map(([uid, invite]) => ({ ...invite, uid }))
    .sort((a, b) => b.at - a.at);

// все приглашения — для статистики админа: ID пригласившего → друзья
export const allInvites = async () =>
  (await db<Record<string, Record<string, unknown>> | null>(
    'GET',
    'invites',
  )) ?? {};

// Ник из профиля: латиница, цифры, точка, _ и -; хотя бы одна буква
export const nickKey = (nick: string) => nick.trim().toLowerCase();
export const nickError = (nick: string) =>
  !/^[a-z0-9_.-]{3,20}$/.test(nickKey(nick))
    ? 'Ник — от 3 до 20 латинских букв и цифр (можно . _ -).'
    : !/[a-z]/.test(nickKey(nick))
    ? 'В нике нужна хотя бы одна латинская буква.'
    : '';

interface NickEntry {
  uid: string;
  email: string;
}

// Вход: сначала как раньше (номер, ID, ник сотрудника), а если не вышло
// и это ник — ищем ник, который человек выбрал себе в профиле
async function signInAny(name: string, password: string) {
  try {
    return await signIn(emailOf(name), password);
  } catch (e) {
    const alias = /[a-z]/i.test(name)
      ? await publicGet<NickEntry | null>(`nicks/${nickKey(name)}`).catch(
          () => null,
        )
      : null;
    if (!alias?.email) {
      throw e;
    }
    return signIn(alias.email, password);
  }
}

// Сменить ник: новый занимается, старый освобождается
export async function changeNick(user: User, nick: string) {
  const problem = nickError(nick);
  if (problem) {
    throw new Error(problem);
  }
  const key = nickKey(nick);
  const taken = await db<NickEntry | null>('GET', `nicks/${key}`);
  if (taken && taken.uid !== user.uid) {
    throw new Error('Этот ник уже занят — выберите другой.');
  }
  await db('PUT', `nicks/${key}`, {
    uid: user.uid,
    email: await accountEmail(),
  });
  if (user.nick && nickKey(user.nick) !== key) {
    await db('DELETE', `nicks/${nickKey(user.nick)}`).catch(() => {});
  }
  await saveProfile(user.uid, { nick: key });
  return key;
}

export async function login(name: string, password: string): Promise<User> {
  const uid = await signInAny(name, password);
  const nick = /[a-z]/i.test(name);
  // анкеты нет, если при регистрации пропал интернет, — создаём её сейчас
  return (
    (await db<User | null>('GET', `users/${uid}`)) ??
    createProfile(uid, { name, phone: nick ? '' : name, login: name })
  );
}

export async function changePassword(current: string, next: string) {
  const email = await accountEmail();
  try {
    await signIn(email, current);
  } catch (e) {
    throw e instanceof Error && e.message.startsWith('Неверный')
      ? new Error('Текущий пароль неверный.')
      : e;
  }
  await updatePassword(next);
}

export const saveProfile = (uid: string, patch: Partial<User>) =>
  db('PATCH', `users/${uid}`, patch);

// Ключ восстановления кладётся при каждом входе и смене пароля.
// Владельцу правила базы его сохранить не дают — его пароль не сбросить.
export const saveRecovery = (uid: string, refreshToken: string) =>
  db('PUT', `recovery/${uid}`, refreshToken);

// ——— доступ, настройки из облака ———

export interface Cloud {
  // false, пока данные ещё не пришли из облака
  loaded: boolean;
  role: Role | null;
  // доступы заместителя; у админа они не проверяются
  perms: Perms;
  blocked: boolean;
  // подключён ли Telegram
  tg: boolean;
  config: CloudConfig;
  promos: Promo[];
  // промокоды — только у команды
  codes: PromoCode[];
  // новости админа, свежие сверху
  news: News[];
  // владелец (admins/<uid>): ему код KovriX A не нужен
  owner: boolean;
  // роль есть, но база её не признаёт — не введён код KovriX A
  locked: boolean;
}

type Stored<T> = Record<string, T> | null;
const list = <T>(stored: Stored<T>) =>
  Object.entries(stored ?? {}).map(([id, value]) => ({ ...value, id }));

// можно ли это делать вошедшему: админу — всё, заместителю — по списку
export const can = (cloud: Pick<Cloud, 'role' | 'perms'>, perm: Perm) =>
  cloud.role === 'admin' || (cloud.role === 'deputy' && !!cloud.perms[perm]);

export const loadPromos = async () =>
  list(await db<Stored<Promo>>('GET', 'promos'));

export const loadNews = async () =>
  list(await db<Stored<Omit<News, 'id'>>>('GET', 'news')).sort(
    (a, b) => b.at - a.at,
  );

export async function loadCloud(uid: string): Promise<Cloud> {
  const [role, perms, blocked, tg, config, promos, news] = await Promise.all([
    db<Role | null>('GET', `roles/${uid}`),
    db<Perms | null>('GET', `perms/${uid}`),
    db<boolean | null>('GET', `blocked/${uid}`),
    db<object | null>('GET', `tg/${uid}`),
    db<CloudConfig | null>('GET', 'config'),
    loadPromos(),
    loadNews().catch(() => []),
  ]);
  const [owner, locked] = role
    ? await Promise.all([
        db<boolean | null>('GET', `admins/${uid}`).catch(() => null),
        teamLocked(),
      ])
    : [null, false];
  const codes = role && !locked ? await loadCodes().catch(() => []) : [];
  return {
    loaded: true,
    role,
    perms: perms ?? {},
    blocked: !!blocked,
    tg: !!tg,
    config: config ?? {},
    promos,
    codes,
    news,
    owner: !!owner,
    locked,
  };
}

// ——— мини-игра «Алмазный дождь»: общий топ ———

export interface GameScore {
  uid: string;
  name: string;
  best: number;
  at: number;
}

export const saveGameScore = (user: User, best: number) =>
  db('PUT', `gameTop/${user.uid}`, {
    name: (user.nick || user.name || `ID ${user.id}`).slice(0, 40),
    best,
    at: Date.now(),
  });

export const loadGameTop = async () =>
  Object.entries(
    (await db<Record<string, Omit<GameScore, 'uid'>> | null>(
      'GET',
      'gameTop',
    )) ?? {},
  )
    .map(([uid, score]) => ({ ...score, uid }))
    .sort((a, b) => b.best - a.best);

// остальные мини-игры: свой топ у каждой (gameTops/<игра>/<uid>)
export const saveTopScore = (game: string, user: User, best: number) =>
  db('PUT', `gameTops/${game}/${user.uid}`, {
    name: (user.nick || user.name || `ID ${user.id}`).slice(0, 40),
    best,
    at: Date.now(),
  });

export const loadTop = async (game: string) =>
  Object.entries(
    (await db<Record<string, Omit<GameScore, 'uid'>> | null>(
      'GET',
      `gameTops/${game}`,
    )) ?? {},
  )
    .map(([uid, score]) => ({ ...score, uid }))
    .sort((a, b) => b.best - a.best);

// ——— код входа в KovriX A ———

// список блокировок читает только команда: отказ базы значит, что код
// не введён или владелец его сменил
const teamLocked = () =>
  db('GET', 'blocked').then(
    () => false,
    (e: Error) => e.message === 'Нет доступа к этим данным.',
  );

// база примет запись, только если код верный
export const unlockTeam = (uid: string, code: string) =>
  db('PUT', `unlock/${uid}`, code.trim());

// владелец задаёт код (пусто — выключить); все сотрудники вводят его заново
export async function saveTeamCode(code: string) {
  const value = code.trim();
  if (value) {
    await db('PUT', 'teamCode', value);
    await db('PUT', 'config/teamOn', true);
  } else {
    await db('DELETE', 'config/teamOn');
    await db('DELETE', 'teamCode');
  }
}

export const loadTeamCode = () => db<string | null>('GET', 'teamCode');

// ——— заявки: донат, аккаунт, продажа, задание ———

// пустые объекты Firebase не хранит — возвращаем их на место
const normalize = <T extends Item>(item: T): T => ({
  ...item,
  fields: (item as Order).fields ?? {},
  attrs: (item as Listing).attrs ?? {},
  note: item.note ?? '',
});

const newestFirst = <T extends Item>(items: T[]) =>
  items.map(normalize).sort((a, b) => b.createdAt - a.createdAt);

// у задания ключ — номер задания, у остальных — код заявки
export const keyOf = (item: Item) => ('task' in item ? item.task : item.code);

// Сначала фото, потом заявка: админ не увидит заказ без чека
export async function create(
  kind: RequestKind,
  item: Item,
  photos: string[],
  photoKey = keyOf(item),
) {
  if (photos.length) {
    await db('PUT', `photos/${item.uid}/${photoKey}`, photos);
  }
  await db('PUT', `${kind}/${item.uid}/${keyOf(item)}`, item);
}

export async function mine<T extends Item>(kind: RequestKind, uid: string) {
  return newestFirst(
    Object.values((await db<Stored<T>>('GET', `${kind}/${uid}`)) ?? {}),
  );
}

export const loadPhotos = async (uid: string, key: string) =>
  (await db<string[] | null>('GET', `photos/${uid}/${key}`)) ?? [];

// ——— витрина аккаунтов ———

const lotOf = (lot: Lot): Lot => ({ ...lot, attrs: lot.attrs ?? {} });

export const loadMarket = async () =>
  Object.values((await db<Stored<Lot>>('GET', 'market')) ?? {})
    .map(lotOf)
    .sort((a, b) => b.createdAt - a.createdAt);

export const loadLot = async (code: string) => {
  const lot = await db<Lot | null>('GET', `market/${code}`);
  return lot && lotOf(lot);
};

// фото витрины грузятся по одному: карточке хватает первого
export const loadLotPhoto = (code: string, index: number) =>
  db<string | null>('GET', `marketPhotos/${code}/${index}`);

// продавец снимает своё объявление с витрины
export const removeLot = (code: string) => db('DELETE', `market/${code}`);

// ——— топ, задания ———

export const loadDonations = async () =>
  Object.values((await db<Stored<Donation>>('GET', 'donations')) ?? {});

export const loadTasks = async () =>
  list(await db<Stored<Task>>('GET', 'tasks')).sort(
    (a, b) => b.createdAt - a.createdAt,
  );

// ——— чаты ———

export const chatId = {
  deal: (code: string, buyer: string) => `${code}_${buyer}`,
  support: (uid: string) => `support_${uid}`,
  partner: (uid: string) => `partner_${uid}`,
};

export const loadChats = async (owner: string) =>
  list(await db<Stored<Chat>>('GET', `userChats/${owner}`)).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

export const loadChat = async (owner: string, id: string) => {
  const chat = await db<Chat | null>('GET', `userChats/${owner}/${id}`);
  return chat && { ...chat, id };
};

// Открывает чат; если его ещё нет — создаёт и кладёт в списки обоих
export async function openChat(chat: Chat) {
  const mine_ = await db<Chat | null>('GET', `userChats/${chat.a}/${chat.id}`);
  if (mine_) {
    return;
  }
  const { a, b, kind, title } = chat;
  try {
    await db('PUT', `chats/${chat.id}/meta`, { a, b, kind, title });
  } catch {
    // чат уже создан, а запись в списке потерялась — восстановим её ниже
  }
  await db('PUT', `userChats/${a}/${chat.id}`, chat);
  await db('PUT', `userChats/${b}/${chat.id}`, chat);
}

// Чат клиента с командой: поддержка или сотрудничество. Создаётся при
// первом открытии; возвращает его номер
export async function openStaffChat(
  user: Pick<User, 'uid' | 'id' | 'name'>,
  kind: 'support' | 'partner',
) {
  const id = chatId[kind](user.uid);
  await openChat({
    id,
    kind,
    title: kind === 'support' ? 'Поддержка' : 'Сотрудничество',
    a: user.uid,
    b: 'staff',
    aName: `${user.name} · ID ${user.id}`,
    bName: `${APP_NAME} · ${
      kind === 'support' ? 'поддержка' : 'сотрудничество'
    }`,
    updatedAt: Date.now(),
  });
  return id;
}

// Текст, который уже набран в поле чата при открытии (например, номер
// заказа, о котором клиент хочет спросить)
export const chatDrafts: Record<string, string> = {};

export const loadMessages = async (id: string) =>
  Object.values(
    (await db<Stored<Message>>('GET', `chats/${id}/messages`)) ?? {},
  ).sort((x, y) => x.at - y.at);

// me — чей это список: uid или 'staff', когда отвечает поддержка
export async function sendMessage(chat: Chat, me: string, message: Message) {
  await db('POST', `chats/${chat.id}/messages`, message);
  const patch = { last: message.text.slice(0, 80), updatedAt: message.at };
  const other = me === chat.a ? chat.b : chat.a;
  await Promise.all([
    db('PATCH', `userChats/${me}/${chat.id}`, { ...patch, unread: false }),
    db('PATCH', `userChats/${other}/${chat.id}`, { ...patch, unread: true }),
  ]);
}

export const markRead = (owner: string, id: string) =>
  db('PATCH', `userChats/${owner}/${id}`, { unread: false });

// ——— устройства ———

export const loadDevices = async (uid: string) =>
  list(await db<Stored<Device>>('GET', `devices/${uid}`)).sort(
    (a, b) => b.at - a.at,
  );

export const touchDevice = (uid: string, id: string, name: string) =>
  db('PUT', `devices/${uid}/${id}`, { name, at: Date.now() });

export const deviceKnown = async (uid: string, id: string) =>
  (await db<Device | null>('GET', `devices/${uid}/${id}`)) !== null;

export const removeDevice = (uid: string, id: string) =>
  db('DELETE', `devices/${uid}/${id}`);

// ——— «в сети» ———

// время ставит сервер, а не телефон: у телефона часы могут врать
export const touchSeen = (uid: string) =>
  db('PUT', `seen/${uid}`, { '.sv': 'timestamp' });

export const loadSeen = async () =>
  (await db<Record<string, number> | null>('GET', 'seen')) ?? {};

export const unlinkTelegram = (uid: string) => db('DELETE', `tg/${uid}`);

// ——— для админа и заместителя ———

export async function all<T extends Item>(kind: RequestKind) {
  const byUser = (await db<Stored<Record<string, T>>>('GET', kind)) ?? {};
  return newestFirst(Object.values(byUser).flatMap(Object.values) as T[]);
}

export const allUsers = async () =>
  Object.values((await db<Stored<User>>('GET', 'users')) ?? {}).sort(
    (a, b) => b.createdAt - a.createdAt,
  );

const setStatus = (
  kind: RequestKind,
  item: Item,
  status: Status,
  note: string,
  by: { uid: string; name: string },
) =>
  db('PATCH', `${kind}/${item.uid}/${keyOf(item)}`, {
    status,
    note,
    decidedAt: Date.now(),
    decidedBy: by.name,
  });

// запись в журнал команды; журнал не должен мешать самому решению
const logDecision = (
  kind: RequestKind,
  item: Item,
  status: Status,
  note: string,
  by: { uid: string; name: string },
) =>
  db('POST', 'history', {
    at: Date.now(),
    by: by.uid,
    byName: by.name,
    kind,
    code: keyOf(item),
    status,
    title:
      'item' in item
        ? `${item.item} · ${item.game}`
        : 'title' in item
        ? item.title
        : keyOf(item),
    ...('price' in item ? { amount: item.price } : {}),
    ...(note ? { note } : {}),
    client: item.client,
  }).catch(() => {});

export const loadHistory = async () =>
  list(await db<Stored<Omit<HistoryEntry, 'id'>>>('GET', 'history')).sort(
    (a, b) => b.at - a.at,
  );

const clientOf = (item: { uid: string; client: Client }) => ({
  uid: item.uid,
  id: item.client.id,
  name: item.client.name,
});

// Решение по заявке. Вместе с ним меняется всё, что от него зависит:
// зачисленный донат попадает в топ, принятый аккаунт — на витрину,
// подтверждённая продажа убирает его с витрины.
export async function decide(
  kind: RequestKind,
  item: Item,
  status: 'done' | 'rejected',
  note: string,
  by: { uid: string; name: string },
) {
  // зачисленный донат потом отклонили — убрать его из топа
  if (status === 'rejected' && kind === 'orders' && item.status === 'done') {
    await db('DELETE', `donations/${(item as Order).code}`);
  }
  if (status === 'done' && kind === 'orders') {
    const order = item as Order;
    await db('PUT', `donations/${order.code}`, {
      ...clientOf(order),
      code: order.code,
      amount: order.price,
      at: Date.now(),
    });
  }
  if (status === 'done' && kind === 'listings') {
    const listing = item as Listing;
    const photos = await loadPhotos(item.uid, listing.code);
    await db('PUT', `marketPhotos/${listing.code}`, photos);
    // на витрину идёт только то, что можно видеть всем, — без телефона
    await db('PUT', `market/${listing.code}`, {
      code: listing.code,
      uid: listing.uid,
      game: listing.game,
      title: listing.title,
      description: listing.description,
      attrs: listing.attrs,
      price: listing.price,
      bargain: !!listing.bargain,
      seller: { id: listing.client.id, name: listing.client.name },
      photos: photos.length,
      ...(listing.video ? { video: listing.video } : {}),
      createdAt: listing.createdAt,
    } satisfies Lot);
  }
  if (status === 'done' && kind === 'sales') {
    const sale = item as Sale;
    await db('DELETE', `market/${sale.code}`);
    await db('DELETE', `marketPhotos/${sale.code}`);
    await db('PATCH', `listings/${sale.uid}/${sale.code}`, { status: 'sold' });
  }
  await setStatus(kind, item, status, note, by);
  await logDecision(kind, item, status, note, by);
}

// ——— только для админа ———

export const loadRoles = async () =>
  (await db<Record<string, Role> | null>('GET', 'roles')) ?? {};

export const loadBlocked = async () =>
  (await db<Record<string, boolean> | null>('GET', 'blocked')) ?? {};

export const loadPerms = async () =>
  (await db<Record<string, Perms> | null>('GET', 'perms')) ?? {};

export const setRole = (uid: string, role: Role | null) =>
  role ? db('PUT', `roles/${uid}`, role) : db('DELETE', `roles/${uid}`);

export const setPerms = (uid: string, perms: Perms) =>
  db('PUT', `perms/${uid}`, perms);

// Админ заводит сотрудника сам: ник, пароль, роль и список доступов.
// Сотрудник потом входит с этим ником и паролем в KovriX A — на любом
// телефоне и на сайте команды.
export async function createStaff(
  nick: string,
  password: string,
  role: 'admin' | 'deputy',
  perms: Perms,
) {
  const account = await createAccount(emailOf(nick), password);
  let id = newUserId();
  for (let attempt = 0; ; attempt++) {
    try {
      await account.write(`ids/${id}`, account.uid);
      break;
    } catch (e) {
      if (attempt >= 4) {
        throw e;
      }
      id = newUserId();
    }
  }
  const user: User = {
    uid: account.uid,
    id,
    name: nick,
    phone: '',
    login: nick,
    country: 'TJ',
    createdAt: Date.now(),
  };
  await account.write(`users/${account.uid}`, user);
  await account.write(`recovery/${account.uid}`, account.refreshToken);
  await setPerms(account.uid, perms);
  await setRole(account.uid, role);
  return user;
}

// Админ задаёт сотруднику новый пароль — например, если тот его забыл
export async function resetPassword(uid: string, password: string) {
  const saved = await db<string | null>('GET', `recovery/${uid}`);
  if (!saved) {
    throw new Error(
      'Этот сотрудник ещё не входил в новую версию приложения. Пусть войдёт один раз — после этого пароль можно будет сменить.',
    );
  }
  let next: string;
  try {
    next = await setPasswordWith(saved, password);
  } catch (e) {
    throw e instanceof Error && e.message.startsWith('Вход устарел')
      ? new Error(
          'Сотрудник сменил пароль в старой версии приложения. Пусть войдёт заново — после этого пароль можно будет сменить.',
        )
      : e;
  }
  await db('PUT', `recovery/${uid}`, next);
}

// Админ удаляет аккаунт со всем, что к нему относится: заказы, объявления,
// фото, донаты в топе. Сам вход в Firebase остаётся — если человек войдёт
// снова, у него будет пустой профиль; чтобы не пускать совсем — блокировка.
export async function deleteUser(user: Pick<User, 'uid' | 'id'>) {
  const { uid } = user;
  const [market, donations] = await Promise.all([
    db<Stored<Lot>>('GET', 'market'),
    db<Stored<Donation>>('GET', 'donations'),
  ]);
  const own = <T extends { uid: string; code: string }>(items: Stored<T>) =>
    Object.values(items ?? {}).filter(item => item.uid === uid);
  await Promise.all([
    ...own(market).flatMap(lot => [
      db('DELETE', `market/${lot.code}`),
      db('DELETE', `marketPhotos/${lot.code}`),
    ]),
    ...own(donations).map(d => db('DELETE', `donations/${d.code}`)),
    ...[
      'orders',
      'listings',
      'sales',
      'claims',
      'photos',
      'devices',
      'seen',
      'tg',
      'perms',
      'roles',
      'blocked',
      'recovery',
      'gameTop',
      'gameTops/quiz',
      'gameTops/pairs',
      'usedCodes',
    ].map(node => db('DELETE', `${node}/${uid}`)),
    db('DELETE', `ids/${user.id}`),
  ]);
  const profile = await db<User | null>('GET', `users/${uid}`);
  if (profile?.nick) {
    await db('DELETE', `nicks/${nickKey(profile.nick)}`).catch(() => {});
  }
  await db('DELETE', `users/${uid}`);
}

// свой товар в игре — например «Ваучер» в Free Fire
export const addProduct = (gameId: string, product: Product) =>
  db('PUT', `config/products/${gameId}/${Date.now().toString(36)}`, product);

export const removeProduct = (gameId: string, id: string) =>
  db('DELETE', `config/products/${gameId}/${id}`);

export const setBlocked = (uid: string, blocked: boolean) =>
  blocked ? db('PUT', `blocked/${uid}`, true) : db('DELETE', `blocked/${uid}`);

// Фото-обложки игр, которые админ поставил сам: covers/<игра> — картинка
// data:image/…; без неё — обложка из src/shared/assets/games
export const loadCovers = () =>
  db<Record<string, string> | null>('GET', 'covers');
export const saveCover = (game: string, photo: string | null) =>
  photo ? db('PUT', `covers/${game}`, photo) : db('DELETE', `covers/${game}`);

export const saveConfig = (path: string, value: unknown) =>
  db('PUT', `config/${path}`, value);

const newId = () => Date.now().toString(36);

export const savePromo = (promo: Omit<Promo, 'id'>) =>
  db('PUT', `promos/${newId()}`, promo);
export const removePromo = (id: string) => db('DELETE', `promos/${id}`);

// промокоды: клиент получает один по коду, команда — весь список
export const getCode = async (code: string) => {
  const found = code
    ? await db<Omit<PromoCode, 'id'> | null>('GET', `codes/${code}`)
    : null;
  return found ? { ...found, id: code } : null;
};
// одноразовый код (once): использовал ли его уже этот аккаунт
export const codeUsed = async (uid: string, code: string) =>
  !!(await db<number | null>('GET', `usedCodes/${uid}/${code}`));
export const markCodeUsed = (uid: string, code: string) =>
  db('PUT', `usedCodes/${uid}/${code}`, Date.now());
export const loadCodes = async () =>
  list(await db<Stored<Omit<PromoCode, 'id'>>>('GET', 'codes'));
export const saveCode = ({ id, ...code }: PromoCode) =>
  db('PUT', `codes/${id}`, code);
export const removeCode = (id: string) => db('DELETE', `codes/${id}`);

// промокод дня (daily/<игра>): админ задаёт цены, бот в полночь меняет код;
// day: null — бот придумает новый код при следующей проверке
export const loadDaily = (game: string) =>
  db<DailyCode | null>('GET', `daily/${game}`);
export const saveDailyPrices = (game: string, prices: Record<string, number>) =>
  db('PATCH', `daily/${game}`, { prices });
export const renewDaily = (game: string) =>
  db('PATCH', `daily/${game}`, { day: null });

export const saveTask = (task: Omit<Task, 'id'>) =>
  db('PUT', `tasks/${newId()}`, task);
export const removeTask = (id: string) => db('DELETE', `tasks/${id}`);

export const postNews = (text: string, by: string) =>
  db('POST', 'news', { text, by, at: Date.now() });
export const removeNews = (id: string) => db('DELETE', `news/${id}`);
