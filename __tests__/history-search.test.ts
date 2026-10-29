import { matchHistory, NO_FILTER } from '../src/shared/utils';
const at = new Date(2026, 9, 22, 14, 35).getTime();
const e = { at, code: 'D-48213', title: 'Алмазы 100 · Free Fire', byName: 'Jahon', client: { id: 482913, name: 'Мирин', phone: '+992900112233' } };
test('history search', () => {
  expect(matchHistory(e, NO_FILTER)).toBe(true);
  expect(matchHistory(e, { ...NO_FILTER, text: '482913' })).toBe(true);
  expect(matchHistory(e, { ...NO_FILTER, text: 'мирин jahon' })).toBe(true);
  expect(matchHistory(e, { ...NO_FILTER, text: '900112' })).toBe(true);
  expect(matchHistory(e, { ...NO_FILTER, text: 'imron' })).toBe(false);
  expect(matchHistory(e, { ...NO_FILTER, day: '22.10' })).toBe(true);
  expect(matchHistory(e, { ...NO_FILTER, day: '22.10.2026' })).toBe(true);
  expect(matchHistory(e, { ...NO_FILTER, day: '23.10' })).toBe(false);
  expect(matchHistory(e, { ...NO_FILTER, from: '14:00', to: '15:00' })).toBe(true);
  expect(matchHistory(e, { ...NO_FILTER, from: '14:36' })).toBe(false);
  expect(matchHistory(e, { ...NO_FILTER, to: '9:00' })).toBe(false);
});
