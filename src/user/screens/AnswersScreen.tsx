import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../shared/i18n/Text';
import { chatDrafts, loadChats, mine, openStaffChat } from '../../shared/api';
import { REFRESH_MS } from '../../shared/config';
import { gameById } from '../../shared/games';
import { Nav } from '../../shared/navigation';
import { readable } from '../../shared/platform';
import { showAlert } from '../../shared/platform/alert';
import { useRemote, useStore } from '../../shared/store';
import { R, Theme, useStyles } from '../../shared/theme';
import { Claim, Listing, Order, Sale } from '../../shared/types';
import { Badge, Btn, Card, Chips, Pairs, Row } from '../../shared/ui';
import {
  amount,
  currencyOf,
  fieldPairs,
  errorText,
  formatDate,
  money,
  STATUS,
} from '../../shared/utils';

const CHAT_ICON = { deal: '🤝', support: '🛟', partner: '📣' };

// Всё, на что пользователю отвечают: чаты, заказы доната, его аккаунты
// на продажу, подтверждения продаж и награды. Состояние и ответ ставит
// админ или заместитель — список сам обновляется раз в полминуты.
export default function AnswersScreen({ nav }: { nav: Nav }) {
  const s = useStyles(makeStyles);
  const { user, cloud } = useStore();
  const uid = user?.uid ?? '';
  const { data, error, loading, reload } = useRemote(
    useCallback(async () => {
      const [chats, orders, listings, sales, claims] = await Promise.all([
        loadChats(uid),
        mine<Order>('orders', uid),
        mine<Listing>('listings', uid),
        mine<Sale>('sales', uid),
        mine<Claim>('claims', uid),
      ]);
      return { chats, orders, listings, sales, claims };
    }, [uid]),
    REFRESH_MS,
  );

  const show = (tjs: number) => money(tjs, currencyOf(user), cloud.config);
  // История покупок: какие заказы показать
  const [filter, setFilter] = useState<'all' | 'done' | 'new' | 'rejected'>(
    'all',
  );
  const orders = data?.orders ?? [];
  const paid = orders.filter(order => order.status === 'done');
  const spent = paid.reduce((sum, order) => sum + order.price, 0);
  const shown =
    filter === 'all' ? orders : orders.filter(order => order.status === filter);
  // донат оплачен, а оператор ещё не подтвердил — клиент пишет в поддержку,
  // номер заказа уже набран в поле сообщения
  const [asking, setAsking] = useState('');
  const ask = async (order: Order) => {
    if (!user || asking) {
      return;
    }
    setAsking(order.code);
    try {
      const id = await openStaffChat(user, 'support');
      chatDrafts[
        id
      ] = `Заказ ${order.code} (${order.item}) — оплатил(а), но он ещё не подтверждён. `;
      nav.push({ name: 'chat', id });
    } catch (e) {
      showAlert('Чат не открылся', errorText(e));
    } finally {
      setAsking('');
    }
  };
  const note = (text?: string) =>
    text ? <Text style={s.note}>Ответ: {text}</Text> : null;

  return (
    <ScrollView
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={reload} />
      }
    >
      <View style={readable}>
        <Text style={s.hint}>
          Ваш ID: {user?.id}. Потяните список вниз, чтобы обновить.
        </Text>
        {!!error && <Text style={s.error}>{error}</Text>}

        <Text style={s.section}>Сообщения</Text>
        {data?.chats.length === 0 && (
          <Card>
            <Text style={s.empty}>
              Чатов пока нет. Написать в поддержку можно из профиля, продавцу —
              из объявления.
            </Text>
          </Card>
        )}
        {data?.chats.map(chat => (
          <Row
            key={chat.id}
            testID={`chat-${chat.id}`}
            icon={CHAT_ICON[chat.kind]}
            title={`${chat.a === uid ? chat.bName : chat.aName}`}
            text={chat.last ? chat.last : chat.title}
            mark={chat.unread}
            onPress={() => nav.push({ name: 'chat', id: chat.id })}
          />
        ))}

        <Text style={s.section}>🧾 История покупок</Text>
        {orders.length > 0 && (
          <Card>
            <Pairs
              pairs={[
                ['Зачислено донатов', String(paid.length)],
                ['Потрачено всего', show(spent)],
                [
                  'Ждут проверки',
                  String(orders.filter(o => o.status === 'new').length),
                ],
              ]}
            />
            <Text style={s.date}>
              🔒 «Донат зачислен» ставит только оператор Kovrix после проверки
              оплаты в банке. Никому не сообщайте код из Telegram и пароль —
              сотрудники Kovrix их не спрашивают.
            </Text>
          </Card>
        )}
        {orders.some(o => o.status === 'new') && (
          <View style={s.wait}>
            <Text style={s.waitTitle}>⏳ Заказ ждёт подтверждения</Text>
            <Text style={s.waitText}>
              Подтверждение — в течение дня, обычно быстрее. Как только оплату
              проверят, донат придёт на ваш аккаунт.
            </Text>
            <Btn
              testID="open-game"
              title="🎮 Пока ждёте — мини-игры"
              small
              onPress={() => nav.push({ name: 'games', id: '' })}
              style={s.action}
            />
          </View>
        )}
        {orders.length > 0 && (
          <Chips
            options={[
              ['all', `Все (${orders.length})`],
              ['done', 'Зачислены'],
              ['new', 'Ждут'],
              ['rejected', 'Отклонены'],
            ]}
            value={filter}
            onChange={setFilter}
          />
        )}
        {data?.orders.length === 0 && (
          <Card>
            <Text style={s.empty}>
              Заказов пока нет. Выберите игру на вкладке «Донат».
            </Text>
            <Btn
              title="Выбрать игру"
              variant="soft"
              small
              onPress={() => nav.setTab('donate')}
            />
          </Card>
        )}
        {shown.map(order => {
          const game = gameById(order.game);
          return (
            <Card key={order.code}>
              <View style={s.head}>
                <Text style={s.title}>
                  {order.code} · {game?.name ?? order.game}
                </Text>
                <Badge {...STATUS.orders[order.status]} />
              </View>
              <View style={s.head}>
                <Text style={s.item}>{order.item}</Text>
                <Text style={s.price}>
                  {order.total
                    ? amount(order.total, order.currency)
                    : money(order.price)}
                </Text>
              </View>
              <Pairs
                pairs={[
                  ...fieldPairs(game?.fields ?? [], order.fields),
                  ...(order.pay
                    ? [['Оплата', order.pay] as [string, string]]
                    : []),
                  ...(order.txn
                    ? [['№ операции', order.txn] as [string, string]]
                    : []),
                  ...(order.promo
                    ? [['Акция', order.promo] as [string, string]]
                    : []),
                ]}
              />
              {note(order.note)}
              {order.status === 'new' && (
                <Text style={s.date}>
                  ⏳ Подтвердим в течение дня — затем придёт донат
                </Text>
              )}
              {order.status === 'new' && (
                <Btn
                  testID={`ask-${order.code}`}
                  title="💬 Написать по заказу"
                  variant="soft"
                  small
                  disabled={!!asking}
                  onPress={() => ask(order)}
                  style={s.action}
                />
              )}
              <Text style={s.date}>
                Заказ: {formatDate(order.createdAt)}
                {order.decidedAt
                  ? ` · ${
                      order.status === 'done' ? 'зачислен' : 'проверен'
                    }: ${formatDate(order.decidedAt)}`
                  : ''}
              </Text>
            </Card>
          );
        })}

        <Text style={s.section}>Мои аккаунты на продажу</Text>
        {data?.listings.length === 0 && (
          <Card>
            <Text style={s.empty}>Вы ещё не выставляли аккаунты.</Text>
            <Btn
              testID="sell-button"
              title="＋ Продать аккаунт"
              variant="soft"
              small
              onPress={() => nav.setTab('sell')}
            />
          </Card>
        )}
        {data?.listings.map(item => {
          const sale = data.sales.find(x => x.code === item.code);
          return (
            <Card key={item.code}>
              <View style={s.head}>
                <Text style={s.title}>
                  {item.code} · {gameById(item.game)?.name ?? item.game}
                </Text>
                <Badge {...STATUS.listings[item.status]} />
              </View>
              <View style={s.head}>
                <Text style={s.item} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={s.price}>{show(item.price)}</Text>
              </View>
              {note(item.note)}
              {sale && (
                <View style={s.sale}>
                  <View style={s.head}>
                    <Text style={s.item}>Продажа за {show(sale.price)}</Text>
                    <Badge {...STATUS.sales[sale.status]} />
                  </View>
                  {note(sale.note)}
                </View>
              )}
              {item.status === 'done' &&
                (!sale || sale.status === 'rejected') && (
                  <Btn
                    testID={`sold-${item.code}`}
                    title="✓ Аккаунт продан — приложить чек"
                    variant="soft"
                    small
                    onPress={() => nav.push({ name: 'sold', id: item.code })}
                    style={s.action}
                  />
                )}
              <Text style={s.date}>{formatDate(item.createdAt)}</Text>
            </Card>
          );
        })}

        {!!data?.claims.length && <Text style={s.section}>Задания</Text>}
        {data?.claims.map(claim => (
          <Card key={claim.task}>
            <View style={s.head}>
              <Text style={s.title}>{claim.title}</Text>
              <Badge {...STATUS.claims[claim.status]} />
            </View>
            <Text style={s.item}>Награда: {claim.reward}</Text>
            {note(claim.note)}
            <Text style={s.date}>{formatDate(claim.createdAt)}</Text>
          </Card>
        ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 16, paddingTop: 4, paddingBottom: 28 },
    hint: { color: c.muted, fontSize: 13, lineHeight: 19, marginBottom: 12 },
    error: { color: c.danger, fontSize: 14, marginBottom: 12 },
    section: {
      fontSize: 19,
      fontWeight: '900',
      color: c.text,
      marginBottom: 10,
      marginTop: 4,
    },
    empty: { color: c.muted, fontSize: 14, marginBottom: 12 },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    title: { flex: 1, color: c.text, fontSize: 15, fontWeight: '800' },
    item: { flex: 1, color: c.textSoft, fontSize: 15, paddingRight: 8 },
    price: { color: c.primary, fontSize: 16, fontWeight: '900' },
    note: {
      color: c.text,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 8,
      padding: 10,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      overflow: 'hidden',
    },
    sale: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    action: { marginTop: 10 },
    wait: {
      padding: 14,
      marginBottom: 12,
      borderRadius: R(c),
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.primaryDeep,
    },
    waitTitle: { color: c.text, fontSize: 16, fontWeight: '900' },
    waitText: { color: c.textSoft, fontSize: 14, lineHeight: 20, marginTop: 4 },
    date: { color: c.muted, fontSize: 12, marginTop: 8 },
  });
