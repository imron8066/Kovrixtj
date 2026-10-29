import { GAMES } from '../src/shared/games';
import { Donation, Promo } from '../src/shared/types';
import {
  codePrice,
  discounted,
  money,
  priced,
  productGroups,
  promoFor,
  ranking,
  toTjs,
} from '../src/shared/utils';

jest.mock('@react-native-async-storage/async-storage', () => ({}));

const DAY = 864e5;

test('цена в валюте клиента: курс админа важнее курса по умолчанию', () => {
  expect(money(100)).toBe('100 смн');
  expect(money(12.5)).toBe('12,50 смн');
  expect(money(100, 'RUB')).toBe('875 ₽');
  expect(money(100, 'RUB', { rates: { RUB: 9 } })).toBe('900 ₽');
  expect(toTjs(900, 'RUB', { rates: { RUB: 9 } })).toBe(100);
});

test('цены админа заменяют цены из games.ts', () => {
  const game = GAMES.find(g => g.id === 'free_fire')!;
  const own = priced(game, {
    prices: { free_fire: { products: { 0: 15 } } },
  });
  expect(own.products[0].price).toBe(15);
  expect(own.products[1].price).toBe(game.products[1].price);
  expect(priced(game, {})).toBe(game);
});

test('акция: берётся самая большая действующая скидка на игру', () => {
  const now = 1000;
  const promos: Promo[] = [
    { id: 'a', title: 'Все игры', percent: 5, game: '', until: now + 1 },
    { id: 'b', title: 'FF', percent: 20, game: 'free_fire', until: now + 1 },
    { id: 'c', title: 'Прошла', percent: 50, game: '', until: now - 1 },
  ];
  expect(promoFor(promos, 'free_fire', now)?.id).toBe('b');
  expect(promoFor(promos, 'pubg_mobile', now)?.id).toBe('a');
  expect(discounted(200, promos[1])).toBe(160);
  expect(discounted(200)).toBe(200);
});

test('топ: суммы по людям за период и места', () => {
  const now = 100 * DAY;
  const row = (uid: string, amount: number, daysAgo: number): Donation => ({
    code: `${uid}-${daysAgo}`,
    uid,
    id: 1,
    name: uid,
    amount,
    at: now - daysAgo * DAY - 1000,
  });
  const donations = [
    row('a', 50, 0),
    row('b', 30, 0),
    row('b', 40, 3),
    row('c', 500, 20),
  ];
  expect(ranking(donations, 'day', now).map(r => r.uid)).toEqual(['a', 'b']);
  expect(ranking(donations, 'week', now)[0]).toMatchObject({
    uid: 'b',
    total: 70,
    place: 1,
  });
  expect(ranking(donations, 'all', now)[0].uid).toBe('c');
});

test('промокод с прайсом: своя цена у каждого товара, остальные без скидки', () => {
  const code = {
    id: 'FFAB12',
    game: 'free_fire',
    prices: { '110 алмазов': 9, '341 алмаз': 27 },
    until: 0,
  };
  expect(codePrice(code, 'free_fire', '110 алмазов', 10)).toBe(9);
  expect(codePrice(code, 'free_fire', '6160 алмазов', 405)).toBeNull();
  expect(codePrice(code, 'black_russia', '110 алмазов', 10)).toBeNull();
});

test('товары делятся на алмазы, ваучеры и пропуск в порядке прайса', () => {
  const groups = productGroups([
    { title: 'Ваучер на неделю' },
    { title: '110 алмазов' },
    { title: 'Пропуск прокачки 6 LVL' },
    { title: 'Ваучер на 100 алмазов' },
  ]);
  expect(groups.map(g => [g.key, g.items.map(x => x.i)])).toEqual([
    ['gems', [1]],
    ['voucher', [0, 3]],
    ['pass', [2]],
  ]);
});
