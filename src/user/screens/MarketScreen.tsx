import React, { useCallback } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../shared/i18n/Text';
import { loadLotPhoto, loadMarket } from '../../shared/api';
import { gameById } from '../../shared/games';
import { Nav } from '../../shared/navigation';
import { readable } from '../../shared/platform';
import { useRemote, useStore } from '../../shared/store';
import { Theme, useStyles } from '../../shared/theme';
import { Lot } from '../../shared/types';
import { Badge, Btn, Card, Carousel, Empty } from '../../shared/ui';
import { currencyOf, money } from '../../shared/utils';

// Карточка объявления: фото листаются стрелками прямо в списке
export function LotCard({ lot, onPress }: { lot: Lot; onPress: () => void }) {
  const s = useStyles(makeStyles);
  const { user, cloud } = useStore();
  const load = useCallback(
    (index: number) => loadLotPhoto(lot.code, index),
    [lot.code],
  );
  return (
    <Card style={s.lot}>
      <Carousel id={lot.code} count={lot.photos} load={load} height={210} />
      <Pressable testID={`lot-${lot.code}`} onPress={onPress} style={s.body}>
        <View style={s.head}>
          <Text style={s.price}>
            {money(lot.price, currencyOf(user), cloud.config)}
          </Text>
          <Badge
            text={lot.bargain ? 'Торг' : 'Без торга'}
            tone={lot.bargain ? 'ok' : 'info'}
          />
        </View>
        <Text style={s.title} numberOfLines={2}>
          {lot.title}
        </Text>
        <Text style={s.seller}>Продавец: {lot.seller.name}</Text>
      </Pressable>
      <Btn title="🛒  Купить · подробнее" small onPress={onPress} />
    </Card>
  );
}

// Витрина аккаунтов одной игры и кнопка «Продать свой аккаунт»
export default function MarketScreen({ id, nav }: { id: string; nav: Nav }) {
  const s = useStyles(makeStyles);
  const game = gameById(id);
  const { data, error, loading, reload } = useRemote(
    useCallback(
      async () => (await loadMarket()).filter(lot => lot.game === id),
      [id],
    ),
  );

  if (!game) {
    return <Empty icon="🏷" text="Игра не найдена." />;
  }

  return (
    <ScrollView
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={reload} />
      }
    >
      <View style={readable}>
        <Btn
          testID="sell-button"
          title={`＋ Продать свой аккаунт ${game.name}`}
          onPress={() => nav.push({ name: 'sell', id })}
          style={s.sell}
        />
        {!!error && <Text style={s.error}>{error}</Text>}
        {data?.length === 0 && (
          <Empty
            icon="🏷"
            text={`Аккаунтов ${game.name} на продажу пока нет. Выставьте первый!`}
          />
        )}
        {data?.map(lot => (
          <LotCard
            key={lot.code}
            lot={lot}
            onPress={() => nav.push({ name: 'lot', id: lot.code })}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 16, paddingTop: 4, paddingBottom: 28 },
    sell: { marginBottom: 14 },
    error: { color: c.danger, fontSize: 14, marginBottom: 12 },
    lot: { padding: 8 },
    body: { padding: 6, paddingTop: 10 },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    price: { color: c.primary, fontSize: 22, fontWeight: '900' },
    title: { color: c.text, fontSize: 16, fontWeight: '700' },
    seller: { color: c.muted, fontSize: 13, marginTop: 4 },
  });
