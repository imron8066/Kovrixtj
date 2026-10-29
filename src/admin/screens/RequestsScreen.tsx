import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '../../shared/i18n/Text';
import { decide, keyOf, loadPhotos, RequestKind } from '../../shared/api';
import { gameById } from '../../shared/games';
import { fingerprint, orderWarnings } from '../../shared/guard';
import { useStore } from '../../shared/store';
import { readable } from '../../shared/platform';
import { showAlert } from '../../shared/platform/alert';
import { Theme, useStyles } from '../../shared/theme';
import { Claim, Listing, Order, Sale } from '../../shared/types';
import {
  Badge,
  Btn,
  Card,
  Chips,
  Empty,
  Field,
  Pairs,
  PhotoStrip,
} from '../../shared/ui';
import {
  amount,
  errorText,
  fieldPairs,
  formatDate,
  money,
  STATUS,
} from '../../shared/utils';

type Item = Order | Listing | Sale | Claim;
type Pair = [string, string];

const SWAPPED =
  'Скриншот чека отличается от того, что клиент приложил при заказе — фото подменили.';

// что написано на кнопках и где лежат фото — у каждого вида заявок своё
const KINDS: Record<
  RequestKind,
  { done: string; photos: string; icon: string }
> = {
  orders: {
    done: '✓ Подтвердить донат',
    photos: '🖼  Показать чек',
    icon: '🎮',
  },
  listings: { done: '✓ На витрину', photos: '🖼  Показать фото', icon: '🏷' },
  sales: {
    done: '✓ Подтвердить продажу',
    photos: '🖼  Показать чек',
    icon: '🤝',
  },
  claims: { done: '✓ Выдал награду', photos: '', icon: '🎯' },
};

// Одна заявка: что заказали или продают, кто клиент, фото и решение.
// Заказ доната админ или заместитель сначала выполняет в игре (все данные
// и чек — здесь), потом нажимает «Подтвердить донат» — клиент видит «Донат
// зачислен», а сумма попадает в топ. Принятый аккаунт появляется на
// витрине, подтверждённая продажа убирает его оттуда.
function RequestCard({
  kind,
  item,
  warnings,
  onChanged,
}: {
  kind: RequestKind;
  item: Item;
  // что насторожило проверку оплаты (src/shared/guard.ts)
  warnings: string[];
  onChanged: () => void;
}) {
  const s = useStyles(makeStyles);
  const { user } = useStore();
  // чек на экране не совпал с тем, что клиент отправил при заказе
  const [swapped, setSwapped] = useState(false);
  const [photos, setPhotos] = useState<string[] | null>(null);
  const [note, setNote] = useState(item.note ?? '');
  const [busy, setBusy] = useState(false);
  const game = 'game' in item ? gameById(item.game) : undefined;
  const key = keyOf(item);

  // фото тяжёлые — загружаются только по кнопке
  const showPhotos = async () => {
    setBusy(true);
    try {
      const loaded = await loadPhotos(
        item.uid,
        kind === 'sales' ? (item as Sale).photo : key,
      );
      setPhotos(loaded);
      // чек — последнее фото заказа
      const receipt = (item as Order).receipt;
      if (kind === 'orders' && receipt && loaded.length) {
        setSwapped(fingerprint(loaded[loaded.length - 1]) !== receipt);
      }
    } catch (e) {
      showAlert('Фото не загружены', errorText(e));
    }
    setBusy(false);
  };

  const save = async (status: 'done' | 'rejected') => {
    setBusy(true);
    try {
      await decide(kind, item, status, note.trim(), {
        uid: user?.uid ?? '',
        name: user?.name ?? '',
      });
      onChanged();
    } catch (e) {
      showAlert('Не сохранено', errorText(e));
    }
    setBusy(false);
  };

  // Зачисление доната — в два шага: сначала сверить деньги в банке
  const confirmDone = () => {
    if (kind !== 'orders') {
      save('done');
      return;
    }
    const order = item as Order;
    const sum =
      order.total && order.currency && order.currency !== 'TJS'
        ? amount(order.total, order.currency)
        : money(order.price);
    const alarms = [...warnings, ...(swapped ? [SWAPPED] : [])];
    showAlert(
      alarms.length ? '⚠️ Проверьте ещё раз' : 'Деньги пришли?',
      `${
        alarms.length ? `${alarms.join('\n\n')}\n\n` : ''
      }Зачислять только если в банке есть перевод на ${sum}${
        order.txn ? ` с номером операции ${order.txn}` : ''
      }. Отменить зачисление потом можно только кнопкой «Отклонить».`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Да, деньги пришли', onPress: () => save('done') },
      ],
    );
  };

  let title = key;
  let price = '';
  let details: Pair[];
  // ID игрока, ник, сервер — крупно, копируются нажатием
  let ids: Pair[] = [];
  if (kind === 'orders') {
    const order = item as Order;
    title = `${order.code} · ${game?.name ?? order.game}`;
    // клиент платил в своей валюте — рядом показана сумма в сомони
    ids = fieldPairs(game?.fields ?? [], order.fields);
    price =
      order.total && order.currency && order.currency !== 'TJS'
        ? `${amount(order.total, order.currency)} · ${money(order.price)}`
        : money(order.price);
    details = [
      ['Донат', order.item],
      ['Способ', order.method],
      ...(order.check ? [['Проверка ID', order.check] as Pair] : []),
      ...(order.pay ? [['Оплата', order.pay] as Pair] : []),
      ...(order.txn ? [['№ операции', order.txn] as Pair] : []),
      ...(order.promo
        ? [[order.promoCode ? 'Промокод' : 'Акция', order.promo] as Pair]
        : []),
    ];
  } else if (kind === 'listings') {
    const listing = item as Listing;
    title = `${listing.code} · ${game?.name ?? listing.game}`;
    price = money(listing.price);
    details = [
      ['Заголовок', listing.title],
      ['Торг', listing.bargain ? 'да' : 'нет'],
      ...fieldPairs(game?.accountAttrs ?? [], listing.attrs),
      ['Описание', listing.description],
      ...(listing.video
        ? ([['Видео', listing.video]] as [string, string][])
        : []),
    ];
  } else if (kind === 'sales') {
    const sale = item as Sale;
    title = `Продан ${sale.code}`;
    price = money(sale.price);
    details = [['Аккаунт', sale.title]];
  } else {
    const claim = item as Claim;
    title = claim.title;
    details = [
      ['Награда', claim.reward],
      ['Как выполнил', claim.proof],
    ];
  }

  return (
    <Card style={readable}>
      <View style={s.head}>
        <Text style={s.title}>{title}</Text>
        <Badge {...STATUS[kind][item.status]} />
      </View>
      {!!price && <Text style={s.price}>{price}</Text>}
      {[...warnings, ...(swapped ? [SWAPPED] : [])].map(text => (
        <Text key={text} style={s.warning}>
          ⚠️ {text}
        </Text>
      ))}
      {ids.length > 0 && <Pairs pairs={ids} copy />}
      <Pairs pairs={details} />

      <Text style={s.label}>Клиент · нажмите, чтобы скопировать</Text>
      <Pairs
        copy
        pairs={[
          ['ID', String(item.client.id)],
          ['Телефон', item.client.phone],
        ]}
      />
      <Pairs pairs={[['Имя', item.client.name]]} />

      {!!KINDS[kind].photos && (
        <View style={s.photos}>
          {photos === null ? (
            <Btn
              testID={`photos-${key}`}
              title={KINDS[kind].photos}
              variant="soft"
              small
              disabled={busy}
              onPress={showPhotos}
            />
          ) : photos.length ? (
            <PhotoStrip photos={photos} />
          ) : (
            <Text style={s.date}>Фото нет.</Text>
          )}
        </View>
      )}

      {item.status !== 'sold' && (
        <>
          <Field
            label="Ответ клиенту (необязательно)"
            value={note}
            onChangeText={setNote}
            placeholder="Например: донат зачислен"
            maxLength={300}
          />
          <View style={s.actions}>
            <Btn
              testID={`done-${key}`}
              title={KINDS[kind].done}
              small
              disabled={busy}
              onPress={confirmDone}
              style={s.flex}
            />
            <View style={s.gap} />
            <Btn
              testID={`reject-${key}`}
              title="✕ Отклонить"
              variant="danger"
              small
              disabled={busy}
              onPress={() => save('rejected')}
              style={s.flex}
            />
          </View>
        </>
      )}
      <Text style={s.date}>
        {formatDate(item.createdAt)}
        {item.decidedAt
          ? ` · решение ${formatDate(item.decidedAt)}${
              item.decidedBy ? `, ${item.decidedBy}` : ''
            }`
          : ''}
      </Text>
    </Card>
  );
}

// Список заявок админа: заказы доната или аккаунты на продажу.
// Сверху — переключатель «Новые / Все».
export default function RequestsScreen({
  kind,
  items,
  loading,
  error,
  reload,
  top,
}: {
  kind: RequestKind;
  items: Item[];
  loading: boolean;
  error: string;
  reload: () => void;
  // переключатель над списком — например «Объявления / Продажи»
  top?: React.ReactNode;
}) {
  const s = useStyles(makeStyles);
  const { cloud } = useStore();
  const [onlyNew, setOnlyNew] = useState(true);
  const fresh = items.filter(item => item.status === 'new');
  const warn = (item: Item) =>
    kind === 'orders'
      ? orderWarnings(
          item as Order,
          items as Order[],
          cloud.config,
          cloud.codes,
        )
      : [];

  return (
    <FlatList
      data={onlyNew ? fresh : items}
      keyExtractor={item => `${item.uid}/${keyOf(item)}`}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={reload} />
      }
      ListHeaderComponent={
        <View style={readable}>
          {top}
          <Chips
            options={[
              ['new', `Новые (${fresh.length})`],
              ['all', `Все (${items.length})`],
            ]}
            value={onlyNew ? 'new' : 'all'}
            onChange={value => setOnlyNew(value === 'new')}
          />
          {!!error && <Text style={s.error}>{error}</Text>}
        </View>
      }
      ListEmptyComponent={
        loading ? undefined : (
          <Empty
            icon={KINDS[kind].icon}
            text={
              onlyNew
                ? 'Новых заявок нет. Список обновляется сам, можно потянуть вниз.'
                : 'Пока ничего нет.'
            }
          />
        )
      }
      renderItem={({ item }) => (
        <RequestCard
          kind={kind}
          item={item}
          warnings={warn(item)}
          onChanged={reload}
        />
      )}
    />
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 14, paddingBottom: 28 },
    flex: { flex: 1 },
    gap: { width: 8 },
    error: { color: c.danger, fontSize: 14, marginBottom: 12 },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    title: { flex: 1, color: c.text, fontSize: 15, fontWeight: '700' },
    price: {
      color: c.primary,
      fontSize: 20,
      fontWeight: '900',
      marginBottom: 6,
    },
    label: {
      color: c.muted,
      fontSize: 13,
      fontWeight: '700',
      marginTop: 10,
      marginBottom: 2,
    },
    photos: { marginVertical: 12 },
    warning: {
      color: c.danger,
      backgroundColor: c.dangerSoft,
      borderRadius: 10,
      padding: 8,
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 8,
    },
    actions: { flexDirection: 'row' },
    date: { color: c.muted, fontSize: 12, marginTop: 8 },
  });
