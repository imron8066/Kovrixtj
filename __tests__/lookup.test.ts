import { gameById } from '../src/shared/games';
import { checkAccount, normalizeTag } from '../src/shared/lookup';

jest.mock('../src/shared/config', () => ({
  SUPERCELL_KEYS: { coc: 'key', cr: '' },
}));

// ответы сервисов подставляются по очереди, в сеть тесты не ходят
function mockFetch(...replies: { status: number; body: unknown }[]) {
  const calls: string[] = [];
  globalThis.fetch = jest.fn(async (url: string) => {
    calls.push(url);
    const reply = replies.shift();
    if (!reply) {
      throw new Error('Network request failed');
    }
    return {
      status: reply.status,
      ok: reply.status >= 200 && reply.status < 300,
      text: async () => JSON.stringify(reply.body),
    };
  }) as unknown as typeof fetch;
  return calls;
}

const ff = gameById('free_fire')!;
const pubg = gameById('pubg_mobile')!;
const coc = gameById('clash_of_clans')!;

test('ник найден в GoPay Games', async () => {
  mockFetch({ status: 200, body: { data: { username: 'Ivan' } } });
  expect(await checkAccount(ff, { player_id: '123456789' })).toEqual({
    status: 'found',
    nick: 'Ivan',
  });
});

test('GoPay недоступен — ник берётся из Codashop', async () => {
  const calls = mockFetch(
    { status: 500, body: {} },
    {
      status: 200,
      body: { confirmationFields: { roles: [{ role: 'Ivan+%E2%9C%93' }] } },
    },
  );
  expect(await checkAccount(ff, { player_id: '123456789' })).toEqual({
    status: 'found',
    nick: 'Ivan ✓',
  });
  expect(calls).toHaveLength(2);
});

test('несуществующий ID', async () => {
  // GoPay знает не все регионы — окончательное «нет» говорит Codashop
  mockFetch(
    { status: 404, body: { message: 'Unknown User' } },
    { status: 200, body: { errorCode: 12, errorMsg: 'Wrong player id' } },
  );
  expect(await checkAccount(ff, { player_id: '1' })).toEqual({
    status: 'missing',
  });
  // у PUBG запасного магазина нет — там «нет» от GoPay окончательное
  mockFetch({ status: 404, body: { message: 'Unknown User' } });
  expect(await checkAccount(pubg, { player_id: '1' })).toEqual({
    status: 'missing',
  });
  mockFetch(
    { status: 500, body: {} },
    { status: 200, body: { errorCode: -100, errorMsg: 'Invalid user ID' } },
  );
  expect(await checkAccount(ff, { player_id: '1' })).toEqual({
    status: 'missing',
  });
});

test('аккаунт из другого региона: GoPay не знает, Codashop подтверждает', async () => {
  mockFetch(
    { status: 404, body: { message: 'Unknown User' } },
    {
      status: 200,
      body: { errorCode: 24, errorMsg: 'Topup region blocked for player' },
    },
  );
  expect(await checkAccount(ff, { player_id: '123456789' })).toEqual({
    status: 'exists',
  });
  // Codashop не ответил — это «не удалось проверить», а не «аккаунта нет»
  mockFetch({ status: 404, body: { message: 'Unknown User' } });
  expect((await checkAccount(ff, { player_id: '123456789' })).status).toBe(
    'unknown',
  );
});

test('неизвестный код товара — пробуется следующий', async () => {
  const calls = mockFetch(
    { status: 400, body: { message: 'Unknown product' } },
    { status: 200, body: { data: { username: 'Pro' } } },
  );
  expect(await checkAccount(pubg, { player_id: '5123456789' })).toEqual({
    status: 'found',
    nick: 'Pro',
  });
  expect(calls).toHaveLength(2);
});

test('нет интернета — «не удалось проверить», а не «аккаунта нет»', async () => {
  mockFetch();
  expect((await checkAccount(ff, { player_id: '123456789' })).status).toBe(
    'unknown',
  );
});

test('Supercell: тег, 404 и игра без ключа', async () => {
  expect(normalizeTag(' #2ppoLYQ8 ')).toBe('2PP0LYQ8');
  const calls = mockFetch({ status: 200, body: { name: 'Chief' } });
  expect(await checkAccount(coc, { tag: '#2ppolyq8' })).toEqual({
    status: 'found',
    nick: 'Chief',
  });
  expect(calls[0]).toBe(
    'https://cocproxy.royaleapi.dev/v1/players/%232PP0LYQ8',
  );
  mockFetch({ status: 404, body: { reason: 'notFound' } });
  expect(await checkAccount(coc, { tag: '#2PP' })).toEqual({
    status: 'missing',
  });
  const cr = gameById('clash_royale')!;
  expect((await checkAccount(cr, { tag: '#2PP' })).status).toBe('unknown');
});

test('игра без автопроверки', async () => {
  const br = gameById('black_russia')!;
  expect((await checkAccount(br, { nick: 'Ivan_Ivanov' })).status).toBe(
    'unknown',
  );
});
