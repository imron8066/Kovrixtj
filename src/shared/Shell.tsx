import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  StatusBar,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from './i18n/Text';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { APP_NAME, BOT_NAME, VERSION } from './config';
import { configured } from './firebase';
import { Nav, Route } from './navigation';
import { platform, TABLET, useLayout } from './platform';
import { useHardwareBack } from './platform/back';
import LoginScreen from './screens/LoginScreen';
import { STORE } from './build';
import { Splash } from './Splash';
import { StoreProvider, useStore } from './store';
import { P, R, Theme, useStyles, useTheme } from './theme';
import { Backdrop, Btn, Empty } from './ui';

export interface TabItem {
  tab: string;
  icon: string;
  label: string;
  // заголовок в шапке
  title: string;
  // красный кружок с числом на вкладке
  badge?: number;
}

interface ShellProps {
  tabs: TabItem[];
  // название на экране входа и в боковом меню
  name?: string;
  // подпись под названием на экране входа
  slogan: string;
  // метка в шапке, по которой приложения отличают друг от друга
  mark?: string;
  // можно ли зарегистрироваться (в приложении админа — только вход)
  registration: boolean;
  // экран вместо вкладок — например «нет доступа» в приложении админа
  locked?: React.ReactNode;
  // круглые кнопки справа в шапке, например 🕹️ — мини-игры
  actions?: { icon: string; testID: string; onPress: (nav: Nav) => void }[];
  // какой экран показать: route — открытый поверх вкладки экран, если есть
  render: (
    tab: string,
    route: Route | undefined,
    nav: Nav,
  ) => { title?: string; screen: React.ReactNode };
}

// Бот присылает файл новой версии: клиенту — Kovrix, команде — KovriX A.
// Версия из Google Play обновляется только через Play Маркет.
const PLAY_ID = 'com.donix';
export const openUpdate = (staff: boolean) =>
  STORE === 'play' && !staff
    ? Linking.openURL(`market://details?id=${PLAY_ID}`).catch(() =>
        Linking.openURL(
          `https://play.google.com/store/apps/details?id=${PLAY_ID}`,
        ).catch(() => {}),
      )
    : Linking.openURL(
        `https://t.me/${BOT_NAME}?start=${staff ? 'updateA' : 'update'}`,
      ).catch(() => {});

// Открыта ли клавиатура — пока пишут, панель вкладок прячется. Если уйти
// из приложения с открытой клавиатурой (выбор фото, свернули), Android не
// присылает «клавиатура закрылась» — тогда вкладки пропадали насовсем.
// Поэтому при возврате в приложение проверяем заново, а вкладки прячем,
// только когда поле ввода действительно в фокусе.
function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () =>
      setVisible(true),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () =>
      setVisible(false),
    );
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') {
        setVisible(Keyboard.isVisible());
      }
    });
    return () => {
      show.remove();
      hide.remove();
      app.remove();
    };
  }, []);
  return visible && !!TextInput.State.currentlyFocusedInput();
}

// Каркас приложения: шапка, вкладки, переходы и вход. Какие вкладки
// и экраны показывать, решает само приложение — src/user/UserApp.tsx
// или src/admin/AdminApp.tsx.
export function Shell({
  tabs,
  name = APP_NAME,
  slogan,
  mark,
  registration,
  locked,
  actions,
  render,
}: ShellProps) {
  const c = useTheme();
  const s = useStyles(makeStyles);
  // insets учитывают вырез камеры, статус-бар и нижнюю панель
  // навигации — контент под них не заезжает
  const insets = useSafeAreaInsets();
  const { ready, user, adding, setAdding, cloud, signOut } = useStore();
  const keyboardVisible = useKeyboardVisible();
  const layout = useLayout();
  const [tab, setTab] = useState(tabs[0].tab);
  const [stack, setStack] = useState<Route[]>([]);
  // заставка при каждом запуске приложения; key="intro" сохраняет её, когда
  // данные загрузились и вокруг появился весь экран, — анимация не начинается заново
  const [intro, setIntro] = useState(true);
  const endIntro = useCallback(() => setIntro(false), []);

  const firstTab = tabs[0].tab;
  useEffect(() => {
    setStack([]);
    setTab(firstTab);
  }, [user?.uid, firstTab]);

  const nav = useMemo<Nav>(
    () => ({
      push: route => setStack(prev => [...prev, route]),
      back: () => setStack(prev => prev.slice(0, -1)),
      setTab: next => {
        setStack([]);
        setTab(next);
      },
    }),
    [],
  );

  useHardwareBack(stack.length > 0, nav.back);

  if (!ready) {
    return (
      <View style={[s.root, s.center]}>
        {intro ? (
          <Splash key="intro" onDone={endIntro} />
        ) : (
          <ActivityIndicator size="large" color={c.primary} />
        )}
      </View>
    );
  }

  // вкладки видны только вошедшему, у которого есть доступ
  const open = configured && !!user && !locked && !adding && !cloud.blocked;
  const route = stack[stack.length - 1];
  let title = tabs.find(item => item.tab === tab)?.title ?? APP_NAME;
  let screen: React.ReactNode;

  if (!configured) {
    screen = (
      <Empty
        icon="☁️"
        text="Приложение ещё не подключено к Firebase. Впишите apiKey и databaseURL в src/shared/config.ts и пересоберите — см. README.md."
      />
    );
  } else if (!user || adding) {
    screen = (
      <LoginScreen
        name={name}
        slogan={slogan}
        registration={registration}
        // вход во второй аккаунт можно отменить
        onBack={user ? () => setAdding(false) : undefined}
      />
    );
  } else if (cloud.blocked) {
    screen = (
      <View style={s.blocked}>
        <Empty
          icon="⛔"
          text="Аккаунт заблокирован администратором. Если это ошибка — напишите нам в Telegram."
        />
        <Btn title="Выйти" variant="danger" onPress={signOut} />
      </View>
    );
  } else if (locked) {
    screen = locked;
  } else {
    const shown = render(tab, route, nav);
    title = shown.title ?? title;
    screen = shown.screen;
  }

  const latest = cloud.config.version;
  // в Google Play новая версия появляется после проверки — сам Play и сообщит
  const outdated =
    STORE !== 'play' && open && !!latest && latest.code > VERSION.code;

  const contentInsetLeft = layout.sidebar && open ? 0 : insets.left;

  const sidebar = open && layout.sidebar && (
    <View style={[s.sidebar, { paddingLeft: insets.left }]}>
      <Text style={s.sidebarBrand}>{name}</Text>
      {tabs.map(item => {
        const active = tab === item.tab && stack.length === 0;
        return (
          <TouchableOpacity
            key={item.tab}
            testID={`tab-${item.tab}`}
            style={[s.sideItem, active && s.sideItemOn]}
            onPress={() => nav.setTab(item.tab)}
          >
            <Text style={s.sideIcon}>{item.icon}</Text>
            <Text style={[s.sideLabel, active && s.sideLabelOn]}>
              {item.label}
            </Text>
            {!!item.badge && (
              <View style={s.sideBadge}>
                <Text style={s.tabBadgeText}>{item.badge}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={c.dark ? 'light-content' : 'dark-content'} />
      <Backdrop />
      {open && (
        <View
          style={[
            s.header,
            { paddingLeft: 12 + insets.left, paddingRight: 12 + insets.right },
          ]}
        >
          {stack.length > 0 ? (
            <TouchableOpacity
              testID="back-button"
              onPress={nav.back}
              hitSlop={10}
              style={s.back}
            >
              <Text style={s.backText}>{platform.backLabel}</Text>
            </TouchableOpacity>
          ) : null}
          <Text
            style={[s.headerTitle, { textAlign: platform.headerTitleAlign }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {!!mark && <Text style={s.mark}>{mark}</Text>}
          {actions?.map(action => (
            <TouchableOpacity
              key={action.testID}
              testID={action.testID}
              hitSlop={8}
              activeOpacity={0.75}
              style={s.action}
              onPress={() => action.onPress(nav)}
            >
              <Text style={s.actionIcon}>{action.icon}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {outdated && (
        <TouchableOpacity
          testID="update-bar"
          style={s.update}
          onPress={() => openUpdate(name !== APP_NAME)}
        >
          <Text style={s.updateText} numberOfLines={1}>
            🔄 Вышло обновление {latest.name} — нажмите, чтобы обновить
          </Text>
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView
        style={s.flex}
        behavior={platform.keyboardBehavior}
        enabled={!!platform.keyboardBehavior}
      >
        <View style={[s.flex, s.row]}>
          {sidebar}
          <View
            style={[
              s.flex,
              // слева отступ под вырез уже даёт боковое меню
              { paddingLeft: contentInsetLeft, paddingRight: insets.right },
            ]}
          >
            {screen}
          </View>
        </View>

        {/* плавающая панель вкладок: открытая вкладка — в светящейся
            подложке */}
        {open && !layout.sidebar && !keyboardVisible && (
          <View
            style={[s.tabDock, { paddingBottom: Math.max(insets.bottom, 8) }]}
          >
            <View style={s.tabBar}>
              {tabs.map(item => {
                const active = tab === item.tab && stack.length === 0;
                return (
                  <TouchableOpacity
                    key={item.tab}
                    testID={`tab-${item.tab}`}
                    activeOpacity={0.8}
                    style={s.tabItem}
                    onPress={() => nav.setTab(item.tab)}
                  >
                    <View style={[s.tabPill, active && s.tabPillOn]}>
                      <Text style={[s.tabIcon, !active && s.tabIconOff]}>
                        {item.icon}
                      </Text>
                      {!!item.badge && (
                        <View style={s.tabBadge}>
                          <Text style={s.tabBadgeText}>{item.badge}</Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={[s.tabLabel, active && s.tabLabelOn]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
        {!open && !keyboardVisible && (
          <View style={{ height: insets.bottom }} />
        )}
      </KeyboardAvoidingView>
      {intro && <Splash key="intro" onDone={endIntro} />}
    </View>
  );
}

// Обёртка любого из двух приложений: безопасные отступы и данные входа
export function AppRoot({
  children,
  theme,
  team,
}: {
  children: React.ReactNode;
  theme?: string;
  // приложение команды (KovriX A): уведомления о новых заявках клиентов
  team?: boolean;
}) {
  return (
    <SafeAreaProvider>
      <StoreProvider theme={theme} team={team}>
        {children}
      </StoreProvider>
    </SafeAreaProvider>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    row: { flexDirection: 'row' },
    center: { alignItems: 'center', justifyContent: 'center' },
    flex: { flex: 1 },
    // шапка без плашки: крупный заголовок прямо на фоне
    header: {
      height: platform.headerHeight + 6,
      flexDirection: 'row',
      alignItems: 'center',
      zIndex: 2,
    },
    blocked: { padding: 16 },
    update: {
      marginHorizontal: 12,
      marginBottom: 6,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: P(c),
      backgroundColor: c.green,
    },
    updateText: {
      color: '#04140d',
      fontSize: 14,
      fontWeight: '800',
      textAlign: 'center',
    },
    // «назад» — круглая кнопка (у «Кибера» — квадратная со скруглением)
    back: {
      minWidth: 40,
      height: 40,
      paddingHorizontal: 10,
      borderRadius: c.radius ? 12 : 20,
      marginRight: 10,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backText: { color: c.text, fontSize: 18, fontWeight: '700' },
    action: {
      width: 42,
      height: 42,
      borderRadius: c.radius ? 12 : 21,
      marginLeft: 8,
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.primaryDeep,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionIcon: { fontSize: 21 },
    headerTitle: {
      flex: 1,
      fontSize: platform.headerTitleSize + (c.caps ? 1 : 4),
      fontWeight: '900',
      letterSpacing: c.caps ? 1.5 : 0.4,
      textTransform: c.caps ? 'uppercase' : 'none',
      color: c.text,
      fontFamily: platform.fontFamily,
    },
    mark: {
      marginLeft: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: c.danger,
      color: '#ffffff',
      fontSize: 11,
      fontWeight: '800',
    },
    tabDock: { paddingHorizontal: 12, paddingTop: 4 },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: c.radius ? R(c) + 4 : 28,
      paddingVertical: 8,
      paddingHorizontal: 4,
      elevation: 12,
      shadowColor: '#000000',
      shadowOpacity: 0.5,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
    tabItem: { flex: 1, alignItems: 'center' },
    tabPill: {
      width: 56,
      height: 34,
      borderRadius: c.radius ? 10 : 17,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    // у «Кибера» выбранная вкладка — в светящейся рамке
    tabPillOn: c.grid
      ? {
          backgroundColor: c.primarySoft,
          borderWidth: 1,
          borderColor: c.primary,
        }
      : { backgroundColor: c.primarySoft },
    tabIcon: { fontSize: 21, textAlign: 'center', color: c.text },
    tabIconOff: { opacity: 0.45 },
    tabBadge: {
      position: 'absolute',
      top: -2,
      right: 2,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: c.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabBadgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
    sideBadge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 5,
      backgroundColor: c.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabLabel: { fontSize: 11, color: c.muted, marginTop: 3, fontWeight: '600' },
    tabLabelOn: { color: c.primary, fontWeight: '900' },
    sidebar: {
      width: TABLET.sidebarWidth,
      backgroundColor: c.card,
      borderRightWidth: 1,
      borderRightColor: c.border,
      paddingTop: 12,
    },
    sidebarBrand: {
      fontSize: 22,
      fontWeight: '900',
      color: c.primary,
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    sideItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 10,
      marginBottom: 4,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderRadius: platform.radius,
    },
    sideItemOn: { backgroundColor: c.primarySoft, borderRadius: P(c) },
    sideIcon: { fontSize: 18, width: 30, color: c.text },
    sideLabel: { flex: 1, fontSize: 15, color: c.textSoft },
    sideLabelOn: { color: c.text, fontWeight: '700' },
  });
