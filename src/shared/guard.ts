import { gameById } from './games';
import { CloudConfig, Order, PromoCode } from './types';
import { amount, codePrice, priced } from './utils';

// Защита оплаты: что проверить админу, прежде чем зачислить донат.
// Такая же проверка на сайте админа — orderWarnings в web/shared/core.js.

// Короткий отпечаток текста (FNV-1a + длина): один и тот же скриншот чека
// в двух заказах даёт один отпечаток
export function fingerprint(text: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}${text.length.toString(
    16,
  )}`;
}

// номер операции без пробелов, тире и регистра — «12 34-56» = «123456»
export const txnKey = (text: string) =>
  text.replace(/[^0-9a-zа-яё]/gi, '').toLowerCase();

// сколько должен стоить заказ по нынешнему прайсу (null — посчитать нельзя)
export function expectedPrice(
  order: Order,
  config: CloudConfig,
  codes: PromoCode[] = [],
) {
  const base = gameById(order.game);
  if (!base) {
    return null;
  }
  const game = priced(base, config, true);
  const product = game.products.find(p => p.title === order.item);
  let full: number | null = product ? product.price : null;
  if (full === null && game.custom) {
    const count = Number(order.item.split(' ')[0]);
    full = count > 0 ? Math.round(count * game.custom.rate * 100) / 100 : null;
  }
  if (full === null) {
    return null;
  }
  if (order.promoCode) {
    // код могли удалить — тогда сверить не с чем
    const code = codes.find(c => c.id === order.promoCode);
    return code
      ? codePrice(code, order.game, order.item, full, order.createdAt)
      : null;
  }
  const percent = Number(
    order.promo?.match(/−(\d+(?:[.,]\d+)?)%/)?.[1]?.replace(',', '.') ?? 0,
  );
  return percent ? Math.round(full * (100 - percent)) / 100 : full;
}

// Предупреждения к заказу: повторный номер операции, повторный чек,
// цена не как в прайсе, заказ без номера операции
export function orderWarnings(
  order: Order,
  orders: Order[],
  config: CloudConfig,
  codes: PromoCode[] = [],
): string[] {
  const out: string[] = [];
  const others = orders.filter(o => o.code !== order.code);
  const key = order.txn ? txnKey(order.txn) : '';
  if (!key) {
    out.push('Клиент не указал номер операции — сверьте чек с выпиской банка.');
  } else {
    const same = others.find(o => o.txn && txnKey(o.txn) === key);
    if (same) {
      out.push(
        `Номер операции уже был в заказе ${same.code} (${
          same.client?.name ?? ''
        }, ${statusWord(same.status)}). Возможен повторный чек!`,
      );
    }
  }
  if (order.receipt) {
    const same = others.find(o => o.receipt === order.receipt);
    if (same) {
      out.push(
        `Этот же скриншот чека уже был в заказе ${same.code} (${
          same.client?.name ?? ''
        }, ${statusWord(same.status)}).`,
      );
    }
  }
  const expected = expectedPrice(order, config, codes);
  if (expected !== null && Math.abs(expected - order.price) > 0.5) {
    out.push(
      `Цена ${amount(order.price)} не совпадает с прайсом: сейчас ${amount(
        expected,
      )}. Проверьте сумму в чеке.`,
    );
  }
  return out;
}

const statusWord = (status: string) =>
  status === 'done' ? 'зачислен' : status === 'rejected' ? 'отклонён' : 'ждёт';
