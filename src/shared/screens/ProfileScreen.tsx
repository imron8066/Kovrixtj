import { STORE } from '../build';
import React, { useCallback, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Text } from '../i18n/Text';
import {
  isId,
  loadDevices,
  loadDonations,
  nickError,
  openStaffChat,
  removeDevice,
  unlinkTelegram,
} from '../api';
import {
  APP_NAME,
  BOT_NAME,
  COUNTRIES,
  MOTTO,
  SHARE_URL,
  VERSION,
} from '../config';
import { Lang, LANGS } from '../i18n';
import { Nav } from '../navigation';
import { readable } from '../platform';
import { showAlert } from '../platform/alert';
import { openUpdate } from '../Shell';
import { useRemote, useStore } from '../store';
import { Theme, THEMES, useStyles } from '../theme';
import LookCard from './LookCard';
import { Badge, Btn, Card, Field, Pairs, Row, Select } from '../ui';
import {
  currencyOf,
  errorText,
  formatDate,
  money,
  PERIODS,
  ranking,
} from '../utils';

const ROLES = { admin: 'Админ', deputy: 'Заместитель админа', bot: 'Бот' };

// Профиль: кто вошёл, сколько задонатил и на каком он месте, Telegram,
// поддержка, аккаунты и устройства, оформление, пароль.
// nav есть только в приложении клиента — там профиль открывает чаты
// и показывает «Мои донаты»; команде статистика донатов не нужна.
export default function ProfileScreen({ nav }: { nav?: Nav }) {
  const s = useStyles(makeStyles);
  const {
    user,
    settings,
    cloud,
    refreshCloud,
    setTheme,
    setLanguage,
    changePassword,
    updateProfile,
    changeNick,
    signOut,
    setAdding,
    switchAccount,
  } = useStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [nameDraft, setName] = useState<string | null>(null);
  const [nickDraft, setNick] = useState<string | null>(null);
  const uid = user?.uid ?? '';

  const { data, reload } = useRemote(
    useCallback(
      async () => ({
        donations: nav ? await loadDonations() : [],
        devices: await loadDevices(uid),
      }),
      [uid, nav],
    ),
  );

  if (!user) {
    return null;
  }

  const currency = currencyOf(user);
  const donations = data?.donations ?? [];
  const stats = PERIODS.map(({ key, name }) => {
    const row = ranking(donations, key).find(r => r.uid === uid);
    return { name, total: row?.total ?? 0, place: row?.place };
  });

  const run = async (action: () => Promise<unknown>, failed: string) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      showAlert(failed, errorText(e));
    }
    setBusy(false);
  };

  const savePassword = () =>
    run(async () => {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      showAlert('Пароль изменён');
    }, 'Пароль не изменён');

  // имя и ник: черновик null, пока поле не начали править
  const newName = (nameDraft ?? user.name).trim();
  const newNick = (nickDraft ?? user.nick ?? '').trim();
  const nameChanged = nameDraft !== null && newName !== user.name;
  const nickChanged =
    nickDraft !== null && newNick.toLowerCase() !== (user.nick ?? '');
  const saveNames = () =>
    run(async () => {
      if (nameChanged) {
        if (newName.length < 2) {
          throw new Error('Имя — минимум 2 буквы.');
        }
        await updateProfile({ name: newName });
      }
      if (nickChanged) {
        await changeNick(newNick);
      }
      setName(null);
      setNick(null);
      showAlert('Сохранено');
    }, 'Не сохранено');

  const talk = (kind: 'support' | 'partner') =>
    run(async () => {
      const id = await openStaffChat(user, kind);
      nav?.push({ name: 'chat', id });
    }, 'Чат не открылся');

  const share = () =>
    Share.share({
      message: `${APP_NAME} — ${MOTTO}. Донат в игры и продажа аккаунтов: ${SHARE_URL}`,
    }).catch(() => {});

  const exit = () =>
    showAlert('Выйти из аккаунта?', 'Заказы сохранены — они не пропадут.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: signOut },
    ]);

  const others = settings.accounts.filter(a => a.user.uid !== uid);

  return (
    <ScrollView
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={readable}>
        <Card>
          {/* шапка: буква имени в светящемся круге, имя, роль, ID */}
          <View style={s.head}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>
                {(user.name || '?').trim().slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={s.who}>
              <Text style={s.name} numberOfLines={1}>
                {user.name}
              </Text>
              {cloud.role && <Badge text={ROLES[cloud.role]} tone="info" />}
            </View>
          </View>
          <Pairs
            pairs={[
              ['Ваш ID', String(user.id)],
              [user.phone ? 'Телефон' : 'Ник', user.phone || user.login || ''],
              ...(user.nick && user.nick !== user.login
                ? [['Ваш ник', user.nick] as [string, string]]
                : []),
              // вход по ID и коду из Telegram-бота
              ...(isId(user.login ?? '')
                ? [['Вход', `ID ${user.login} и пароль`] as [string, string]]
                : []),
            ]}
          />
        </Card>

        <Card>
          <Text style={s.title}>Страна и валюта</Text>
          <Text style={s.text}>Цены будут показаны в валюте вашей страны.</Text>
          <Select
            label="Страна"
            options={COUNTRIES.map(c => c.key)}
            render={key => {
              const c = COUNTRIES.find(item => item.key === key)!;
              return `${c.flag} ${c.name}`;
            }}
            value={user.country ?? 'TJ'}
            onChange={country =>
              run(() => updateProfile({ country }), 'Не сохранено')
            }
          />
        </Card>

        <Card>
          <Text style={s.title}>Имя и ник</Text>
          <Field
            testID="profile-name"
            label="Имя"
            value={nameDraft ?? user.name}
            onChangeText={setName}
            maxLength={30}
          />
          <Field
            testID="profile-nick"
            label="Ник для входа (латиницей)"
            value={nickDraft ?? user.nick ?? ''}
            onChangeText={setNick}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="например: imron_tj"
            maxLength={20}
          />
          <Text style={s.text}>
            {nickChanged && newNick && nickError(newNick)
              ? nickError(newNick)
              : 'С ником можно входить вместо номера или ID — пароль тот же.'}
          </Text>
          <Btn
            testID="save-names"
            title="Сохранить"
            disabled={
              busy ||
              (!nameChanged && !nickChanged) ||
              (nickChanged && (!newNick || !!nickError(newNick)))
            }
            onPress={saveNames}
          />
        </Card>

        {nav && (
          <Card>
            <Text style={s.title}>Мои донаты</Text>
            <View style={s.stats}>
              {stats.map(stat => (
                <View key={stat.name} style={s.stat}>
                  <Text style={s.statName}>{stat.name}</Text>
                  <Text style={s.statValue}>
                    {money(stat.total, currency, cloud.config)}
                  </Text>
                  <Text style={s.statPlace}>
                    {stat.place ? `${stat.place} место` : '—'}
                  </Text>
                </View>
              ))}
            </View>
            <Btn
              title="🏆  Топ донатеров и задания"
              variant="soft"
              small
              onPress={() => nav.setTab('rewards')}
            />
          </Card>
        )}

        <Card>
          <Text style={s.title}>Telegram</Text>
          <Text style={s.text}>
            {cloud.tg
              ? '✓ Номер подтверждён. Сообщения о заказах и ответы приходят в Telegram.'
              : `Откройте бота @${BOT_NAME}, нажмите «Старт» и отправьте свой номер — бот подтвердит регистрацию и будет присылать сообщения о заказах.`}
          </Text>
          {cloud.tg ? (
            <Btn
              title="Отключить Telegram"
              variant="outline"
              small
              disabled={busy}
              onPress={() =>
                run(async () => {
                  await unlinkTelegram(uid);
                  refreshCloud();
                }, 'Не отключено')
              }
            />
          ) : (
            <View style={s.line}>
              <Btn
                testID="telegram-button"
                title="✈️  Подтвердить в Telegram"
                small
                style={s.flex}
                onPress={() =>
                  Linking.openURL(
                    `https://t.me/${BOT_NAME}?start=${uid}`,
                  ).catch(() =>
                    showAlert('Telegram не открылся', `Найдите @${BOT_NAME}.`),
                  )
                }
              />
              <View style={s.gap} />
              <Btn
                title="Проверить"
                variant="soft"
                small
                onPress={refreshCloud}
              />
            </View>
          )}
        </Card>

        {nav && (
          <>
            <Row
              testID="support-button"
              icon="🛟"
              title="Поддержка"
              text="Вопрос по заказу, оплате или аккаунту"
              onPress={() => talk('support')}
            />
            <Row
              icon="🤝"
              title="Сотрудничество"
              text="Реклама, оптовые заказы, предложения"
              onPress={() => talk('partner')}
            />
          </>
        )}
        <Row
          icon="🔒"
          title="Политика конфиденциальности"
          text="Какие данные мы храним и зачем"
          onPress={() =>
            Linking.openURL(`${SHARE_URL}/privacy.html`).catch(() =>
              showAlert('Не открылось', `${SHARE_URL}/privacy.html`),
            )
          }
        />
        <Row
          testID="update-button"
          icon="🔄"
          title={
            STORE !== 'play' && (cloud.config.version?.code ?? 0) > VERSION.code
              ? `Обновить до версии ${cloud.config.version!.name}`
              : 'Обновить приложение'
          }
          text={`Установлена версия ${VERSION.name}. ${
            STORE === 'play'
              ? 'Обновления — в Google Play'
              : 'Новую пришлёт бот в Telegram'
          }`}
          mark={
            STORE !== 'play' && (cloud.config.version?.code ?? 0) > VERSION.code
          }
          onPress={() => openUpdate(!nav)}
        />
        <Row
          icon="📣"
          title="Поделиться приложением"
          text="Отправьте ссылку другу"
          onPress={share}
        />

        <Card>
          <Text style={s.title}>Аккаунты на этом телефоне</Text>
          {others.map(({ user: other }) => (
            <View key={other.uid} style={s.item}>
              <View style={s.flex}>
                <Text style={s.itemTitle}>{other.name}</Text>
                <Text style={s.text}>ID {other.id}</Text>
              </View>
              <Btn
                title="Войти"
                variant="soft"
                small
                onPress={() => switchAccount(other.uid)}
              />
            </View>
          ))}
          <Btn
            testID="add-account"
            title="＋ Добавить аккаунт"
            variant="outline"
            small
            onPress={() => setAdding(true)}
          />
        </Card>

        <Card>
          <Text style={s.title}>Мои устройства</Text>
          {(data?.devices ?? []).map(device => (
            <View key={device.id} style={s.item}>
              <View style={s.flex}>
                <Text style={s.itemTitle}>
                  {device.name}
                  {device.id === settings.device ? ' · этот телефон' : ''}
                </Text>
                <Text style={s.text}>Был в сети: {formatDate(device.at)}</Text>
              </View>
              {device.id !== settings.device && (
                <Btn
                  title="Отключить"
                  variant="danger"
                  small
                  disabled={busy}
                  onPress={() =>
                    run(async () => {
                      await removeDevice(uid, device.id);
                      reload();
                    }, 'Не отключено')
                  }
                />
              )}
            </View>
          ))}
          <Text style={s.text}>
            Чтобы добавить устройство, войдите на нём с тем же номером, ником
            или ID и паролем — аккаунт работает на любом телефоне и на сайте.
            Отключённое устройство выйдет из аккаунта само.
          </Text>
        </Card>

        <Card>
          <Select
            label="Язык / Забон / Language"
            options={LANGS.map(l => l.key)}
            render={key => LANGS.find(l => l.key === key)!.name}
            value={settings.lang ?? 'ru'}
            onChange={key => setLanguage(key as Lang)}
          />
        </Card>

        <Card>
          <Select
            label="Оформление"
            options={THEMES.map(t => t.key)}
            render={key => THEMES.find(t => t.key === key)!.name}
            value={settings.theme}
            onChange={setTheme}
          />
        </Card>

        <LookCard />

        <Card>
          <Text style={s.title}>Сменить пароль</Text>
          <Field
            label="Текущий пароль"
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            maxLength={100}
          />
          <Field
            label="Новый пароль"
            placeholder="минимум 6 символов"
            value={next}
            onChangeText={setNext}
            secureTextEntry
            maxLength={100}
          />
          <Btn
            title="Сохранить пароль"
            disabled={busy || !current || next.length < 6}
            onPress={savePassword}
          />
        </Card>

        <Btn
          testID="logout-button"
          title="Выйти"
          variant="danger"
          onPress={exit}
        />
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 16, paddingTop: 4, paddingBottom: 28 },
    flex: { flex: 1 },
    gap: { width: 8 },
    line: { flexDirection: 'row' },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginBottom: 14,
    },
    who: { flex: 1, gap: 6, alignItems: 'flex-start' },
    avatar: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: c.primary,
      borderWidth: 3,
      borderColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.primary,
      shadowOpacity: 0.6,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 0 },
      elevation: 8,
    },
    avatarText: { color: c.onPrimary, fontSize: 30, fontWeight: '900' },
    name: { color: c.text, fontSize: 22, fontWeight: '900' },
    // заголовок блока: заглавными, с цветной чертой слева
    title: {
      fontSize: 14,
      fontWeight: '900',
      color: c.text,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: 12,
      paddingLeft: 10,
      borderLeftWidth: 4,
      borderLeftColor: c.primary,
    },
    text: { color: c.muted, fontSize: 13, lineHeight: 19, marginBottom: 14 },
    stats: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    stat: {
      width: '48.4%',
      padding: 10,
      marginBottom: 10,
      borderRadius: 18,
      backgroundColor: c.subtle,
      borderWidth: 1,
      borderColor: c.border,
    },
    statName: { color: c.muted, fontSize: 12 },
    statValue: { color: c.primary, fontSize: 18, fontWeight: '900' },
    statPlace: { color: c.accent, fontSize: 12, fontWeight: '700' },
    item: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    itemTitle: { color: c.text, fontSize: 15, fontWeight: '700' },
  });
