import React, { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../shared/i18n/Text';
import {
  chatId,
  loadLot,
  loadLotPhoto,
  openChat,
  removeLot,
  sendMessage,
} from '../../shared/api';
import { gameById } from '../../shared/games';
import { Nav } from '../../shared/navigation';
import { readable } from '../../shared/platform';
import { showAlert } from '../../shared/platform/alert';
import { useRemote, useStore } from '../../shared/store';
import { Theme, useStyles } from '../../shared/theme';
import { Chat } from '../../shared/types';
import { Badge, Btn, Card, Carousel, Empty, Pairs } from '../../shared/ui';
import {
  currencyOf,
  errorText,
  fieldPairs,
  formatDate,
  money,
} from '../../shared/utils';

// Объявление целиком. Покупатель нажимает «Купить» — продавцу уходит
// сообщение, об оплате и передаче договариваются в чате; можно и просто
// написать и поторговаться. Продавец может снять аккаунт или сообщить,
// что продал его.
export default function LotScreen({ id, nav }: { id: string; nav: Nav }) {
  const s = useStyles(makeStyles);
  const { user, cloud } = useStore();
  const [busy, setBusy] = useState(false);
  const { data: lot, loading } = useRemote(
    useCallback(() => loadLot(id), [id]),
  );
  const load = useCallback((index: number) => loadLotPhoto(id, index), [id]);

  if (!lot || !user) {
    return (
      <Empty
        icon="🏷"
        text={loading ? 'Загрузка…' : 'Объявление снято с продажи.'}
      />
    );
  }

  const game = gameById(lot.game);
  const own = lot.uid === user.uid;

  const price = money(lot.price, currencyOf(user), cloud.config);

  // text — первое сообщение продавцу («хочу купить»)
  const write = async (text?: string) => {
    setBusy(true);
    try {
      const chat: Chat = {
        id: chatId.deal(lot.code, user.uid),
        kind: 'deal',
        title: `${lot.code} · ${lot.title}`,
        a: user.uid,
        b: lot.uid,
        aName: user.name,
        bName: lot.seller.name,
        updatedAt: Date.now(),
      };
      await openChat(chat);
      if (text) {
        await sendMessage(chat, user.uid, {
          from: user.uid,
          name: user.name,
          text,
          at: Date.now(),
        });
      }
      nav.push({ name: 'chat', id: chat.id });
    } catch (e) {
      showAlert('Чат не открылся', errorText(e));
    }
    setBusy(false);
  };

  const buy = () =>
    showAlert(
      'Купить аккаунт?',
      `${lot.title} — ${price}.\n\nПродавец получит сообщение, что вы готовы купить. Об оплате и передаче аккаунта договоритесь в чате.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Купить',
          onPress: () =>
            write(
              `Здравствуйте! Хочу купить аккаунт «${lot.title}» (${lot.code}) за ${price}. Как оплатить?`,
            ),
        },
      ],
    );

  const remove = () =>
    showAlert('Снять с продажи?', 'Объявление пропадёт с витрины.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Снять',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeLot(lot.code);
            nav.back();
          } catch (e) {
            showAlert('Не получилось', errorText(e));
          }
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={s.content}>
      <View style={readable}>
        <Carousel id={lot.code} count={lot.photos} load={load} height={280} />
        <Card style={s.card}>
          <View style={s.head}>
            <Text testID="lot-price" style={s.price}>
              {price}
            </Text>
            <Badge
              text={lot.bargain ? 'Торг уместен' : 'Без торга'}
              tone={lot.bargain ? 'ok' : 'info'}
            />
          </View>
          <Text style={s.title}>{lot.title}</Text>
          <Pairs
            pairs={[
              ['Игра', game?.name ?? lot.game],
              ...fieldPairs(game?.accountAttrs ?? [], lot.attrs),
              ['Продавец', `${lot.seller.name} · ID ${lot.seller.id}`],
              ['Объявление', `${lot.code} · ${formatDate(lot.createdAt)}`],
            ]}
          />
          <Text style={s.text}>{lot.description}</Text>
          {!!lot.video && (
            <Btn
              testID="video-button"
              title="▶  Смотреть видео аккаунта"
              variant="soft"
              onPress={() => Linking.openURL(lot.video!).catch(() => {})}
              style={s.second}
            />
          )}
        </Card>

        {own ? (
          <>
            <Btn
              testID="sold-button"
              title="✓ Аккаунт продан"
              onPress={() => nav.push({ name: 'sold', id: lot.code })}
            />
            <Btn
              title="Снять с продажи"
              variant="danger"
              onPress={remove}
              style={s.second}
            />
          </>
        ) : (
          <>
            <Btn
              testID="buy-button"
              title={`🛒  Купить за ${price}`}
              disabled={busy}
              onPress={buy}
            />
            <Btn
              testID="write-button"
              title={
                lot.bargain
                  ? '💬  Написать продавцу и поторговаться'
                  : '💬  Написать продавцу'
              }
              variant="soft"
              disabled={busy}
              onPress={() => write()}
              style={s.second}
            />
            <Text style={s.hint}>
              Не переводите деньги, пока не убедились, что аккаунт настоящий.
              Если сомневаетесь — напишите в поддержку.
            </Text>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 16, paddingTop: 4, paddingBottom: 28 },
    card: { marginTop: 12 },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    price: { color: c.primary, fontSize: 26, fontWeight: '900' },
    title: { color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 8 },
    text: { color: c.textSoft, fontSize: 15, lineHeight: 22, marginTop: 10 },
    second: { marginTop: 10 },
    hint: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 12 },
  });
