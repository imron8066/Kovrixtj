import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../shared/i18n/Text';
import { all, allUsers, can, loadChats, unlockTeam } from '../shared/api';
import { ADMIN_APP_NAME, REFRESH_MS } from '../shared/config';
import { readable } from '../shared/platform';
import ChatScreen from '../shared/screens/ChatScreen';
import ProfileScreen from '../shared/screens/ProfileScreen';
import { AppRoot, Shell, TabItem } from '../shared/Shell';
import { useRemote, useStore } from '../shared/store';
import { Theme, useStyles } from '../shared/theme';
import { Claim, Listing, Order, Perm, Sale } from '../shared/types';
import { Btn, Card, Chips, Empty, Field } from '../shared/ui';
import { errorText } from '../shared/utils';
import ChatsScreen from './screens/ChatsScreen';
import ManageScreen from './screens/ManageScreen';
import RequestsScreen from './screens/RequestsScreen';

// Вошёл не админ и не заместитель
function NoAccess() {
  const s = useStyles(makeStyles);
  const { user, refreshCloud, signOut } = useStore();
  return (
    <ScrollView contentContainerStyle={s.content}>
      <View style={readable}>
        <Card>
          <Text style={s.title}>Нет доступа</Text>
          <Text style={s.text}>
            Это приложение для админа и его заместителей. Доступ даёт админ: в
            своём приложении → «Ещё» → «Люди» → найти вас по ID {user?.id} и
            нажать «Сделать заместителем» или «Сделать админом».
          </Text>
          <Btn
            title="Проверить снова"
            variant="soft"
            small
            onPress={refreshCloud}
          />
        </Card>
        <Btn title="Выйти" variant="danger" onPress={signOut} />
      </View>
    </ScrollView>
  );
}

// Сотрудник вошёл, но на этом телефоне ещё не ввёл код KovriX A (или
// владелец код сменил). Неверный код база не принимает.
function TeamCode() {
  const s = useStyles(makeStyles);
  const { user, refreshCloud, signOut, markTeamUnlocked } = useStore();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const enter = async () => {
    if (!user || !code.trim()) {
      return;
    }
    setBusy(true);
    setProblem('');
    try {
      await unlockTeam(user.uid, code);
      markTeamUnlocked(user.uid);
      refreshCloud();
    } catch (e) {
      const text = errorText(e);
      setProblem(
        text === 'Нет доступа к этим данным.' ? 'Неверный код.' : text,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={readable}>
        <Card>
          <Text style={s.title}>🔐 Код KovriX A</Text>
          <Text style={s.text}>
            Чтобы открыть приложение команды, впишите код доступа. Его даёт
            владелец Kovrix. Код нужен на каждом новом телефоне и после того,
            как владелец его сменит.
          </Text>
          <Field
            testID="team-code"
            label="Код доступа"
            value={code}
            onChangeText={setCode}
            secureTextEntry
            autoCapitalize="none"
            maxLength={20}
            onSubmitEditing={enter}
          />
          {!!problem && <Text style={s.error}>{problem}</Text>}
          <Btn
            testID="team-code-enter"
            title={busy ? 'Проверяем…' : 'Войти'}
            disabled={busy || !code.trim()}
            onPress={enter}
          />
        </Card>
        <Btn title="Выйти" variant="danger" onPress={signOut} />
      </View>
    </ScrollView>
  );
}

const fresh = (items: { status: string }[]) =>
  items.filter(item => item.status === 'new').length;

function Main() {
  const { user, cloud, settings } = useStore();
  const admin = cloud.role === 'admin';
  // код KovriX A: база не признаёт роль, или на этом телефоне его не вводили
  const needCode =
    !cloud.owner &&
    (cloud.locked ||
      (!!cloud.config.teamOn &&
        !(settings.teamUnlocked ?? []).includes(user?.uid ?? '')));
  const staff = (admin || cloud.role === 'deputy') && !needCode;
  // вкладка «Аккаунты»: новые объявления или подтверждения продаж
  const [accounts, setAccounts] = useState<'listings' | 'sales'>('listings');

  // всё, что видит команда; обновляется само раз в полминуты
  const { data, error, loading, reload } = useRemote(
    useCallback(async () => {
      if (!staff) {
        return null;
      }
      const [orders, listings, sales, claims, chats, users] = await Promise.all(
        [
          all<Order>('orders'),
          all<Listing>('listings'),
          all<Sale>('sales'),
          all<Claim>('claims'),
          loadChats('staff'),
          allUsers(),
        ],
      );
      return { orders, listings, sales, claims, chats, users };
    }, [staff]),
    REFRESH_MS,
  );

  const orders = data?.orders ?? [];
  const listings = data?.listings ?? [];
  const sales = data?.sales ?? [];
  const claims = data?.claims ?? [];
  const chats = data?.chats ?? [];

  // вкладка видна, если есть хотя бы один из её доступов
  const all_: (TabItem & { perms?: Perm[] })[] = [
    {
      perms: ['orders'],
      tab: 'orders',
      icon: '🎮',
      label: 'Донат',
      title: 'Сообщения о донате',
      badge: fresh(orders),
    },
    {
      perms: ['accounts'],
      tab: 'listings',
      icon: '🏷',
      label: 'Аккаунты',
      title: 'Аккаунты на продажу',
      badge: fresh(listings) + fresh(sales),
    },
    {
      perms: ['chats'],
      tab: 'chats',
      icon: '💬',
      label: 'Чаты',
      title: 'Поддержка и сотрудничество',
      badge: chats.filter(chat => chat.unread).length,
    },
    {
      perms: ['claims', 'prices', 'promos', 'tasks', 'money', 'stats', 'block'],
      tab: 'more',
      icon: '🛠',
      label: 'Ещё',
      title: 'Управление',
      badge: fresh(claims),
    },
    { tab: 'profile', icon: '👤', label: 'Профиль', title: 'Профиль' },
  ];
  const tabs: TabItem[] = all_
    .filter(tab => !tab.perms || tab.perms.some(perm => can(cloud, perm)))
    .map(({ perms: _perms, ...tab }) => tab);

  return (
    <Shell
      tabs={tabs}
      name={ADMIN_APP_NAME}
      slogan="Для админа и заместителей"
      mark={admin ? 'АДМИН' : 'ЗАМ'}
      registration={false}
      locked={
        !user || staff ? undefined : cloud.loaded ? (
          needCode && cloud.role ? (
            <TeamCode />
          ) : (
            <NoAccess />
          )
        ) : (
          <Empty icon="⏳" text="Проверяем доступ…" />
        )
      }
      render={(tab, route, nav) => {
        if (route) {
          return {
            title: 'Чат',
            screen: <ChatScreen key={route.id} id={route.id} owner="staff" />,
          };
        }
        return {
          screen:
            tab === 'profile' ? (
              <ProfileScreen />
            ) : tab === 'chats' ? (
              <ChatsScreen
                chats={chats}
                loading={loading}
                reload={reload}
                nav={nav}
              />
            ) : tab === 'more' ? (
              <ManageScreen
                claims={claims}
                orders={orders}
                users={data?.users ?? []}
                loading={loading}
                error={error}
                reload={reload}
              />
            ) : tab === 'listings' ? (
              <RequestsScreen
                key={accounts}
                kind={accounts}
                items={accounts === 'sales' ? sales : listings}
                loading={loading}
                error={error}
                reload={reload}
                top={
                  <Chips
                    options={[
                      ['listings', `Объявления (${fresh(listings)})`],
                      ['sales', `Продажи с чеком (${fresh(sales)})`],
                    ]}
                    value={accounts}
                    onChange={setAccounts}
                  />
                }
              />
            ) : tab === 'orders' ? (
              <RequestsScreen
                key="orders"
                kind="orders"
                items={orders}
                loading={loading}
                error={error}
                reload={reload}
              />
            ) : (
              <ProfileScreen />
            ),
        };
      }}
    />
  );
}

// Приложение админа и заместителей (KovriX A): донаты, аккаунты
// и подтверждение продаж, чаты поддержки, награды. Админу — ещё цены,
// акции, задания, курсы, реквизиты, доступы и блокировка.
// Приложение клиента — отдельное: src/user/UserApp.tsx.
export default function AdminApp() {
  return (
    <AppRoot theme="command" team>
      <Main />
    </AppRoot>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 16, paddingTop: 36 },
    title: { color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 8 },
    error: { color: c.danger, fontSize: 14, marginBottom: 10 },
    text: {
      color: c.textSoft,
      fontSize: 14,
      lineHeight: 21,
      marginBottom: 12,
    },
  });
