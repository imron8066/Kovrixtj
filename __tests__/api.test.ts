import {
  all,
  create,
  decide,
  emailOf,
  login,
  register,
} from '../src/shared/api';
import { Order } from '../src/shared/types';

jest.mock('../src/shared/config', () => ({
  FIREBASE: { apiKey: 'KEY', databaseURL: 'https://db.test/' },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
}));

// ответы Firebase подставляются по очереди, в сеть тесты не ходят
function mockFetch(...replies: { status?: number; body: unknown }[]) {
  const calls: { url: string; method: string; body: any }[] = [];
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const { status = 200, body } = replies.shift() ?? { status: 500, body: {} };
    return {
      status,
      ok: status < 300,
      text: async () => JSON.stringify(body),
    };
  }) as unknown as typeof fetch;
  return calls;
}

const signedIn = {
  body: { localId: 'u1', idToken: 'T', refreshToken: 'R', expiresIn: '3600' },
};

const ADMIN = { uid: 'a1', name: 'Imron' };

const order = (code: string, createdAt: number): Order => ({
  code,
  uid: 'u1',
  game: 'free_fire',
  item: '100 алмазов',
  method: 'По Player ID',
  price: 11,
  fields: { player_id: '123456789' },
  status: 'new',
  createdAt,
  client: { id: 123456, name: 'Иван', phone: '+992900000000' },
});

test('регистрация: аккаунт, свободный ID клиента и анкета', async () => {
  const calls = mockFetch(
    signedIn,
    { status: 401, body: { error: 'Permission denied' } }, // ID занят
    { body: 'u1' },
    { body: {} },
  );
  const user = await register({
    name: 'Иван',
    phone: '+992900000000',
    country: 'TJ',
    password: 'secret1',
  });
  expect(calls[0].url).toContain('accounts:signUp?key=KEY');
  expect(calls[0].body.email).toBe('p992900000000@donix.example.com');
  expect(calls[2].url).toBe(`https://db.test/ids/${user.id}.json?auth=T`);
  expect(calls[3]).toMatchObject({
    url: 'https://db.test/users/u1.json?auth=T',
    method: 'PUT',
    body: { uid: 'u1', name: 'Иван', id: user.id, country: 'TJ' },
  });
});

test('вход: неверный пароль и понятная ошибка', async () => {
  mockFetch({
    status: 400,
    body: { error: { message: 'INVALID_LOGIN_CREDENTIALS' } },
  });
  await expect(login('+992900000000', 'wrong')).rejects.toThrow(
    'Неверный номер, ник, ID или пароль.',
  );
});

test('заказ: сначала фото, потом сам заказ', async () => {
  mockFetch(signedIn, { body: { uid: 'u1', id: 123456 } });
  await login('+992900000000', 'secret1');
  const calls = mockFetch({ body: {} }, { body: {} });
  await create('orders', order('D-10000', 1), ['data:image/jpeg;base64,AA']);
  expect(calls.map(c => c.url)).toEqual([
    'https://db.test/photos/u1/D-10000.json?auth=T',
    'https://db.test/orders/u1/D-10000.json?auth=T',
  ]);
});

test('админ: заказы всех клиентов одним списком, новые сверху', async () => {
  const { fields, ...noFields } = order('D-3', 3);
  mockFetch({
    body: {
      u1: { 'D-1': order('D-1', 1), 'D-3': noFields },
      u2: { 'D-2': { ...order('D-2', 2), uid: 'u2' } },
    },
  });
  const list = await all<Order>('orders');
  expect(list.map(o => o.code)).toEqual(['D-3', 'D-2', 'D-1']);
  // пустые поля Firebase не хранит — они возвращаются пустым объектом
  expect(list[0].fields).toEqual({});
  expect(fields).toBeDefined();
});

test('вход по нику: служебный адрес из ника, а не из номера', () => {
  expect(emailOf('Imron')).toBe('nimron@donix.example.com');
  expect(emailOf('+992 900 00 00 00')).toBe('p992900000000@donix.example.com');
  // шесть цифр — ID, который выдал Telegram-бот
  expect(emailOf('123456')).toBe('i123456@donix.example.com');
});

test('подтверждённый донат попадает в топ', async () => {
  const calls = mockFetch({ body: {} }, { body: {} });
  await decide('orders', order('D-7', 7), 'done', 'зачислен', ADMIN);
  expect(calls[0]).toMatchObject({
    url: 'https://db.test/donations/D-7.json?auth=T',
    body: { uid: 'u1', id: 123456, name: 'Иван', amount: 11 },
  });
  expect(calls[1]).toMatchObject({
    url: 'https://db.test/orders/u1/D-7.json?auth=T',
    method: 'PATCH',
    body: { status: 'done', note: 'зачислен', decidedBy: 'Imron' },
  });
  // решение попадает в журнал команды
  expect(calls[2]).toMatchObject({
    url: 'https://db.test/history.json?auth=T',
    method: 'POST',
    body: { by: 'a1', byName: 'Imron', kind: 'orders', code: 'D-7', status: 'done', amount: 11 },
  });
});

test('отклонение зачисленного доната убирает его из топа', async () => {
  const calls = mockFetch({ body: {} }, { body: {} }, { body: {} });
  await decide('orders', { ...order('D-8', 8), status: 'done' }, 'rejected', 'чек поддельный', ADMIN);
  expect(calls[0]).toMatchObject({ url: 'https://db.test/donations/D-8.json?auth=T', method: 'DELETE' });
  expect(calls[1].body).toMatchObject({ status: 'rejected' });
});

test('принятый аккаунт выходит на витрину вместе с фото', async () => {
  const calls = mockFetch(
    { body: ['data:image/jpeg;base64,AA', 'data:image/jpeg;base64,BB'] },
    { body: {} },
    { body: {} },
    { body: {} },
  );
  await decide(
    'listings',
    {
      code: 'A-1',
      uid: 'u1',
      game: 'free_fire',
      title: '65 уровень',
      description: 'много скинов',
      attrs: {},
      price: 500,
      bargain: true,
      status: 'new',
      createdAt: 1,
      client: { id: 123456, name: 'Иван', phone: '+992900000000' },
    },
    'done',
    '',
    ADMIN,
  );
  expect(calls[1].url).toContain('/marketPhotos/A-1.json');
  expect(calls[2].url).toContain('/market/A-1.json');
  expect(calls[2].body).toMatchObject({
    photos: 2,
    bargain: true,
    seller: { id: 123456, name: 'Иван' },
  });
  // телефон продавца на витрину не попадает
  expect(JSON.stringify(calls[2].body)).not.toContain('992900000000');
});

test('нет интернета', async () => {
  globalThis.fetch = jest.fn(async () => {
    throw new Error('Network request failed');
  }) as unknown as typeof fetch;
  await expect(all('orders')).rejects.toThrow('Нет связи с сервером');
});
