import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../shared/i18n/Text';
import { create } from '../../shared/api';
import { CURRENCIES, MAX_PHOTOS } from '../../shared/config';
import { gameById } from '../../shared/games';
import { Nav } from '../../shared/navigation';
import { readable } from '../../shared/platform';
import { showAlert } from '../../shared/platform/alert';
import { useStore } from '../../shared/store';
import { Theme, useStyles } from '../../shared/theme';
import {
  Btn,
  Card,
  Empty,
  Field,
  GameBanner,
  GameFields,
  PhotoPicker,
  Select,
} from '../../shared/ui';
import {
  checkFields,
  currencyOf,
  errorText,
  money,
  newCode,
  toTjs,
  videoLink,
} from '../../shared/utils';

// Форма продажи аккаунта — устроена как экран доната: плашка игры,
// «Как это работает» и шаги по порядку. Какие характеристики спрашивать,
// решает описание игры (accountAttrs в src/shared/games.ts), там же —
// подсказка, какие скриншоты сделать (sellGuide). Цену продавец пишет
// в своей валюте и выбирает: торг или без торга. После проверки админом
// объявление появляется на витрине.
export default function SellFormScreen({ id, nav }: { id: string; nav: Nav }) {
  const s = useStyles(makeStyles);
  const { user, cloud } = useStore();
  const game = gameById(id);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [attrs, setAttrs] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [video, setVideo] = useState('');
  const [bargain, setBargain] = useState('');
  const [busy, setBusy] = useState(false);

  if (!game || !user) {
    return <Empty icon="🏷" text="Игра не найдена." />;
  }

  const currency = currencyOf(user);
  const amount = Number(price.replace(',', '.'));
  const guide = game.sellGuide ?? [
    'Скриншот профиля: ник, уровень, ранг.',
    'Скриншоты инвентаря, скинов и всего ценного.',
    'Скриншот привязки аккаунта (почта, соцсети).',
  ];

  const submit = async () => {
    const problem =
      title.trim().length < 3
        ? 'Введите заголовок.'
        : checkFields(game.accountAttrs, attrs) ??
          (description.trim().length < 10
            ? 'Опишите аккаунт подробнее (минимум 10 символов).'
            : !photos.length
            ? 'Добавьте хотя бы одно фото аккаунта.'
            : videoLink(video) === null
            ? 'Ссылка на видео должна начинаться с https:// — например, с YouTube или TikTok.'
            : !(amount > 0)
            ? 'Укажите цену.'
            : !bargain
            ? 'Выберите: торг или без торга.'
            : null);
    if (problem) {
      showAlert('Заполните объявление', problem);
      return;
    }
    const code = newCode('A');
    setBusy(true);
    try {
      await create(
        'listings',
        {
          code,
          uid: user.uid,
          game: id,
          title: title.trim(),
          description: description.trim(),
          attrs,
          price: toTjs(amount, currency, cloud.config),
          bargain: bargain === 'yes',
          ...(videoLink(video) ? { video: videoLink(video)! } : {}),
          status: 'new',
          createdAt: Date.now(),
          client: {
            id: user.id,
            name: user.name,
            phone: user.phone,
          },
        },
        photos,
      );
      showAlert(
        `Аккаунт ${code} отправлен`,
        'После проверки объявление появится на витрине. Состояние и сообщения покупателей — на вкладке «Ответы».',
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
        <GameBanner game={game} caption="Продать аккаунт" style={s.banner} />

        <Card>
          <Text style={s.title}>Как это работает</Text>
          {[
            'Расскажите об аккаунте: уровень, скины, привязка.',
            'Добавьте фото: профиль, инвентарь, скины.',
            'Назначьте цену и решите, готовы ли торговаться.',
            'После проверки аккаунт появится на витрине — покупатели напишут вам в чат.',
            'Когда продадите — нажмите «Аккаунт продан» и приложите фото чека.',
          ].map((step, i) => (
            <Text key={step} style={s.step}>
              {i + 1}. {step}
            </Text>
          ))}
        </Card>

        <Card>
          <Text style={s.title}>1. Об аккаунте</Text>
          <Field
            testID="title-input"
            label="Заголовок *"
            value={title}
            onChangeText={setTitle}
            placeholder="Например: 65 уровень, много скинов"
            maxLength={80}
          />
          <GameFields
            defs={game.accountAttrs}
            values={attrs}
            onChange={setAttrs}
          />
          <Field
            testID="description-input"
            label="Описание *"
            value={description}
            onChangeText={setDescription}
            placeholder="Что есть на аккаунте, какая привязка, почему продаёте"
            multiline
            maxLength={1500}
          />
        </Card>

        <Card>
          <Text style={s.title}>2. Фото</Text>
          <PhotoPicker
            label="Фото аккаунта *"
            max={MAX_PHOTOS}
            photos={photos}
            onChange={setPhotos}
          />
          <Field
            testID="video-input"
            label="Видео аккаунта (ссылка)"
            value={video}
            onChangeText={setVideo}
            placeholder="https://youtu.be/… · TikTok · Instagram · Telegram"
            autoCapitalize="none"
            keyboardType="url"
            maxLength={300}
          />
          <Text style={s.hint}>
            Снимите обзор аккаунта, загрузите на YouTube, TikTok или в
            Telegram-канал и вставьте ссылку — покупатель откроет его кнопкой «▶
            Смотреть видео».
          </Text>
          <Text style={s.guide}>Какие фото сделать:</Text>
          {guide.map((line, i) => (
            <Text key={line} style={s.step}>
              {i + 1}. {line}
            </Text>
          ))}
        </Card>

        <Card>
          <Text style={s.title}>3. Цена</Text>
          <Field
            testID="price-input"
            label={`Цена, ${CURRENCIES[currency].sign} *`}
            value={price}
            onChangeText={setPrice}
            placeholder="500"
            keyboardType="decimal-pad"
            maxLength={10}
          />
          <Select
            label="Торг"
            required
            options={['yes', 'no']}
            render={key => (key === 'yes' ? 'Торг уместен' : 'Без торга')}
            value={bargain}
            onChange={setBargain}
          />
          <View style={s.total}>
            <Text style={s.totalLabel}>Цена на витрине</Text>
            <Text testID="total" style={s.totalValue}>
              {amount > 0
                ? money(
                    toTjs(amount, currency, cloud.config),
                    currency,
                    cloud.config,
                  )
                : '—'}
            </Text>
          </View>
        </Card>

        <Btn
          testID="publish-button"
          title={busy ? 'Отправляем…' : 'Выставить аккаунт'}
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
    banner: { marginBottom: 12 },
    title: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 10 },
    step: { color: c.muted, fontSize: 14, lineHeight: 20, marginBottom: 4 },
    guide: { color: c.text, fontSize: 14, fontWeight: '700', marginBottom: 6 },
    hint: {
      color: c.muted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: -6,
      marginBottom: 14,
    },
    total: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
    },
    totalLabel: { color: c.muted, fontSize: 15 },
    totalValue: { color: c.primary, fontSize: 24, fontWeight: '900' },
  });
