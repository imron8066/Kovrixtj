import { FIREBASE } from './config';
import { loadSession, saveSession } from './storage';
import { Session } from './types';

// Связь с сервером (server/) обычными запросами fetch — без отдельной
// библиотеки: вход и регистрация и база данных. Сервер говорит на языке
// Firebase (Auth REST и Realtime Database REST). Кому что можно читать
// и менять, решают правила базы — firebase/database.rules.json.

// пока в src/shared/config.ts не вписан адрес сервера, приложение показывает подсказку
export const configured = /^https?:\/\//.test(FIREBASE.databaseURL);

const ERRORS: [RegExp, string][] = [
  [/EMAIL_EXISTS/, 'Такой номер или ник уже зарегистрирован — нажмите «Вход».'],
  [
    /INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|INVALID_PASSWORD|INVALID_EMAIL/,
    'Неверный номер, ник, ID или пароль.',
  ],
  [/USER_DISABLED/, 'Аккаунт заблокирован.'],
  [/WEAK_PASSWORD/, 'Пароль — минимум 6 символов.'],
  [/TOO_MANY_ATTEMPTS/, 'Слишком много попыток. Подождите пару минут.'],
  [
    /TOKEN_EXPIRED|USER_NOT_FOUND|INVALID_REFRESH_TOKEN|INVALID_ID_TOKEN|CREDENTIAL_TOO_OLD/,
    'Вход устарел. Выйдите из аккаунта и войдите снова.',
  ],
  [/Permission denied|^401$|^403$/, 'Нет доступа к этим данным.'],
];

// Запрос не ждёт дольше NET_MS: при плохой связи fetch мог висеть
// бесконечно, и экран крутил загрузку без конца. Чтение (GET) при обрыве
// повторяется один раз.
const NET_MS = 15000;

async function fetchWithin(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NET_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function call(url: string, init?: RequestInit) {
  let res: Response;
  try {
    res = await fetchWithin(url, init);
  } catch {
    const read = !init?.method || init.method === 'GET';
    try {
      if (!read) {
        throw new Error();
      }
      res = await fetchWithin(url, init);
    } catch {
      throw new Error('Нет связи с сервером. Проверьте интернет.');
    }
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ответ не JSON — ниже это станет ошибкой с кодом ответа
  }
  if (res.ok) {
    return json;
  }
  // вход отвечает { error: { message } }, база — { error: 'текст' }
  const code: string =
    typeof json?.error === 'string'
      ? json.error
      : json?.error?.message ?? String(res.status);
  throw new Error(
    ERRORS.find(([pattern]) => pattern.test(code))?.[1] ??
      `Ошибка сервера: ${code}`,
  );
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

let session: Session | null = null;

function keep(next: Session | null) {
  session = next;
  saveSession(next).catch(() => {});
  return next;
}

// вызывается один раз при запуске; возвращает uid, если вход сохранён
export async function restoreSession() {
  session = await loadSession<Session>();
  return session?.uid ?? null;
}

export const signOut = () => {
  keep(null);
};

// переключение между сохранёнными аккаунтами (src/shared/store.tsx)
export const currentSession = () => session;
export const switchSession = (next: Session) => {
  keep(next);
};

async function authorize(
  action: 'signUp' | 'signInWithPassword' | 'update',
  body: Record<string, unknown>,
) {
  const reply = await call(
    `${FIREBASE.authURL}/accounts:${action}?key=${FIREBASE.apiKey}`,
    post({ ...body, returnSecureToken: true }),
  );
  return keep({
    uid: reply.localId,
    idToken: reply.idToken,
    refreshToken: reply.refreshToken,
    expiresAt: Date.now() + Number(reply.expiresIn) * 1000,
  })!.uid;
}

// Новый аккаунт, не выходя из своего: так админ заводит заместителя.
// write — запись в базу от имени нового аккаунта (его анкета).
export async function createAccount(email: string, password: string) {
  const reply = await call(
    `${FIREBASE.authURL}/accounts:signUp?key=${FIREBASE.apiKey}`,
    post({ email, password, returnSecureToken: true }),
  );
  const base = FIREBASE.databaseURL.replace(/\/+$/, '');
  return {
    uid: reply.localId as string,
    refreshToken: reply.refreshToken as string,
    write: (path: string, body: unknown) =>
      call(`${base}/${path}.json?auth=${reply.idToken}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
  };
}

export const signUp = (email: string, password: string) =>
  authorize('signUp', { email, password });

export const signIn = (email: string, password: string) =>
  authorize('signInWithPassword', { email, password });

export const updatePassword = async (password: string) =>
  authorize('update', { idToken: await token(), password });

// Адрес, под которым вошедший записан в Firebase. Надёжнее, чем собирать
// его заново из анкеты: анкета на телефоне могла устареть.
export const accountEmail = async () =>
  (
    await call(
      `${FIREBASE.authURL}/accounts:lookup?key=${FIREBASE.apiKey}`,
      post({ idToken: await token() }),
    )
  ).users[0].email as string;

const refresh = (refreshToken: string) =>
  call(`${FIREBASE.tokenURL}?key=${FIREBASE.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(
      refreshToken,
    )}`,
  });

// Новый пароль чужому аккаунту по его ключу восстановления
// (recovery/<uid>). Возвращает новый ключ: старый после смены не действует.
export async function setPasswordWith(refreshToken: string, password: string) {
  const { id_token } = await refresh(refreshToken);
  const reply = await call(
    `${FIREBASE.authURL}/accounts:update?key=${FIREBASE.apiKey}`,
    post({ idToken: id_token, password, returnSecureToken: true }),
  );
  return reply.refreshToken as string;
}

// обновление пропуска уже идёт — второй запрос ждёт его же
let refreshing: Promise<string> | null = null;

// Пропуск живёт час; за минуту до конца телефон получает новый
async function token() {
  if (!session) {
    throw new Error('Войдите в аккаунт.');
  }
  if (session.expiresAt - Date.now() > 60000) {
    return session.idToken;
  }
  const { refreshToken } = session;
  refreshing ??= refresh(refreshToken)
    .then(reply => {
      // пока шёл запрос, могли выйти из аккаунта
      if (session?.refreshToken === refreshToken) {
        keep({
          uid: reply.user_id,
          idToken: reply.id_token,
          refreshToken: reply.refresh_token,
          expiresAt: Date.now() + Number(reply.expires_in) * 1000,
        });
      }
      return reply.id_token as string;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// Чтение и запись в базу. path — например orders/<uid>/<код заказа>
export async function db<T>(
  method: 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const base = FIREBASE.databaseURL.replace(/\/+$/, '');
  return call(`${base}/${path}.json?auth=${await token()}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Чтение без входа — только то, что правила открывают всем
// (nicks/<ник>: по нику находится аккаунт до входа)
export function publicGet<T>(path: string): Promise<T> {
  const base = FIREBASE.databaseURL.replace(/\/+$/, '');
  return call(`${base}/${path}.json`);
}
