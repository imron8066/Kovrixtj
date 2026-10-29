import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../shared/i18n/Text';
import { create, mine } from '../../shared/api';
import { CURRENCIES } from '../../shared/config';
import { Nav } from '../../shared/navigation';
import { readable } from '../../shared/platform';
import { showAlert } from '../../shared/platform/alert';
import { useRemote, useStore } from '../../shared/store';
import { Theme, useStyles } from '../../shared/theme';
import { Listing } from '../../shared/types';
import { Btn, Card, Empty, Field, PhotoPicker } from '../../shared/ui';
import { currencyOf, errorText, toTjs } from '../../shared/utils';

// «Аккаунт продан»: продавец пишет, за сколько продал, и прикладывает
// фото чека. Админ или заместитель подтверждает — объявление уходит
// с витрины и получает отметку «Продан».
export default function SoldScreen({ id, nav }: { id: string; nav: Nav }) {
  const s = useStyles(makeStyles);
  const { user, cloud } = useStore();
  const uid = user?.uid ?? '';
  const [price, setPrice] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const { data: listing } = useRemote(
    useCallback(
      async () =>
        (await mine<Listing>('listings', uid)).find(item => item.code === id),
      [uid, id],
    ),
  );

  if (!user || !listing) {
    return <Empty icon="🏷" text="Объявление не найдено." />;
  }

  const currency = currencyOf(user);
  const amount = Number(price.replace(',', '.'));

  const submit = async () => {
    if (!(amount > 0) || !photos.length) {
      showAlert(
        'Заполните форму',
        'Укажите, за сколько продали, и приложите фото чека.',
      );
      return;
    }
    const createdAt = Date.now();
    setBusy(true);
    try {
      await create(
        'sales',
        {
          code: id,
          uid,
          title: listing.title,
          price: toTjs(amount, currency, cloud.config),
          photo: `${id}-sale-${createdAt}`,
          status: 'new',
          createdAt,
          client: { id: user.id, name: user.name, phone: user.phone },
        },
        photos,
        `${id}-sale-${createdAt}`,
      );
      showAlert(
        'Отправлено',
        'Админ проверит чек и подтвердит продажу. Ответ — на вкладке «Ответы».',
      );
      nav.setTab('answers');
    } catch (e) {
      setBusy(false);
      showAlert('Не отправлено', errorText(e));
    }
  };

  return (
    <ScrollView
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={readable}>
        <Card>
          <Text style={s.title}>
            {listing.code} · {listing.title}
          </Text>
          <Text style={s.text}>
            Подтвердите продажу: за сколько продали аккаунт и фото чека о
            получении денег.
          </Text>
          <Field
            testID="sold-price"
            label={`За сколько продали, ${CURRENCIES[currency].sign} *`}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            maxLength={10}
          />
          <PhotoPicker
            label="Фото чека *"
            max={1}
            photos={photos}
            onChange={setPhotos}
          />
        </Card>
        <Btn
          testID="sold-submit"
          title={busy ? 'Отправляем…' : 'Отправить на подтверждение'}
          disabled={busy}
          onPress={submit}
        />
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 16, paddingTop: 4, paddingBottom: 28 },
    title: { fontSize: 16, fontWeight: '800', color: c.text, marginBottom: 8 },
    text: { color: c.muted, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  });
