import { expectedPrice, fingerprint, orderWarnings, txnKey } from '../src/shared/guard';
import { Order } from '../src/shared/types';

const order = (code: string, extra: Partial<Order> = {}): Order => ({
  code,
  uid: 'u1',
  game: 'free_fire',
  item: '100 алмазов',
  method: 'По Player ID',
  price: 11,
  fields: {},
  status: 'new',
  createdAt: 1,
  client: { id: 123456, name: 'Иван', phone: '+992900000000' },
  ...extra,
});

test('один и тот же чек даёт один отпечаток', () => {
  expect(fingerprint('data:image/jpeg;base64,AAAA')).toBe(fingerprint('data:image/jpeg;base64,AAAA'));
  expect(fingerprint('data:image/jpeg;base64,AAAA')).not.toBe(fingerprint('data:image/jpeg;base64,AAAB'));
});

test('номер операции сравнивается без пробелов и тире', () => {
  expect(txnKey('12 34-56')).toBe(txnKey('123456'));
});

test('повторный номер операции и повторный чек — предупреждение', () => {
  const first = order('D-1', { txn: '777 888', receipt: 'abc', status: 'done' });
  const second = order('D-2', { txn: '777888', receipt: 'abc' });
  const warnings = orderWarnings(second, [first, second], {});
  expect(warnings.some(w => w.includes('D-1') && w.includes('Номер операции'))).toBe(true);
  expect(warnings.some(w => w.includes('скриншот'))).toBe(true);
});

test('заказ без номера операции — предупреждение', () => {
  expect(orderWarnings(order('D-3'), [], {})[0]).toContain('номер операции');
});

test('цена не как в прайсе — предупреждение', () => {
  const real = expectedPrice(order('D-4'), {});
  if (real === null) {
    return;
  }
  const cheap = order('D-4', { txn: '1', price: real / 10 });
  expect(orderWarnings(cheap, [], {}).some(w => w.includes('прайсом'))).toBe(true);
  expect(orderWarnings(order('D-5', { txn: '2', price: real }), [], {})).toEqual([]);
});
