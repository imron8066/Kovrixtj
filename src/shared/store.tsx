import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import * as api from './api';
import { REFRESH_MS } from './config';
import {
  currentSession,
  restoreSession,
  signOut as dropSession,
  switchSession,
} from './firebase';
import { Lang, setLang, t } from './i18n';
import { stopWatching, watch } from './notify';
import { loadSettings, saveSettings } from './storage';
import { CustomLook, defaultSettings, Settings, User } from './types';
import { errorText } from './utils';

interface Store {
  ready: boolean;
  settings: Settings;
  user: User | null;
  // роль, блокировка, цены, курсы и акции — обновляются раз в полминуты
  cloud: api.Cloud;
  refreshCloud: () => void;
  register: (data: Parameters<typeof api.register>[0]) => Promise<User>;
  login: (name: string, password: string) => Promise<User>;
  signOut: () => void;
  changePassword: (current: string, next: string) => Promise<void>;
  updateProfile: (patch: Partial<User>) => Promise<void>;
  changeNick: (nick: string) => Promise<void>;
  setTheme: (theme: string) => void;
  // свой цвет кнопок и фон; null — вернуть как в оформлении
  setCustom: (custom: CustomLook | null) => void;
  setLanguage: (lang: Lang) => void;
  rememberFields: (gameId: string, fields: Record<string, string>) => void;
  // рекорд мини-игры, пока ждёте заказ
  saveGameBest: (best: number) => void;
  // рекорд викторины, «Найди пару» и других мини-игр
  saveBest: (game: string, best: number) => void;
  // на этом телефоне сотрудник ввёл код KovriX A
  markTeamUnlocked: (uid: string) => void;
  // вход во второй аккаунт: пока adding, показан экран входа
  adding: boolean;
  setAdding: (adding: boolean) => void;
  switchAccount: (uid: string) => void;
}

const StoreContext = createContext<Store | null>(null);

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error('useStore: нет StoreProvider');
  }
  return store;
}

const noCloud: api.Cloud = {
  loaded: false,
  role: null,
  perms: {},
  blocked: false,
  tg: false,
  config: {},
  promos: [],
  codes: [],
  news: [],
  owner: false,
  locked: false,
};

const deviceName = () => {
  const { Brand, Model } = Platform.constants as {
    Brand?: string;
    Model?: string;
  };
  return Platform.OS === 'android'
    ? `${Brand ?? 'Android'} ${Model ?? ''}`.trim()
    : Platform.OS === 'ios'
    ? 'iPhone'
    : Platform.OS;
};

// Кто вошёл, настройки телефона и то, что админ меняет в облаке.
// Заказы и аккаунты экраны берут сами — через useRemote.
export function StoreProvider({
  children,
  theme: look = defaultSettings.theme,
  team = false,
}: {
  children: React.ReactNode;
  // оформление по умолчанию: у приложения админа оно своё
  theme?: string;
  team?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState(defaultSettings);
  const [cloud, setCloud] = useState(noCloud);
  const [adding, setAdding] = useState(false);
  // действия читают свежие настройки отсюда, не дожидаясь перерисовки
  const current = useRef(settings);
  // какой ключ восстановления уже лежит в базе
  const recovery = useRef('');

  const update = useCallback((patch: Partial<Settings>) => {
    const next = { ...current.current, ...patch };
    current.current = next;
    setSettings(next);
    saveSettings(next).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const saved = await loadSettings();
      // вход мог не сохраниться — тогда и анкета не считается
      const uid = await restoreSession();
      // приложению сменили оформление — один раз включаем новое
      const restyled = saved.look !== look;
      current.current = {
        ...saved,
        user: saved.user && saved.user.uid !== uid ? null : saved.user,
        device: saved.device || Math.random().toString(36).slice(2, 12),
        // после обновления со старой версии включается новое оформление
        theme: saved.device && !restyled ? saved.theme : look,
        look,
      };
      setSettings(current.current);
      saveSettings(current.current).catch(() => {});
      setReady(true);
    })();
  }, [look]);

  // вошедший аккаунт запоминается вместе с пропуском
  const enter = useCallback(
    (user: User) => {
      const session = currentSession();
      update({
        user,
        accounts: [
          ...current.current.accounts.filter(a => a.user.uid !== user.uid),
          ...(session ? [{ user, session }] : []),
        ],
      });
      setAdding(false);
      return user;
    },
    [update],
  );

  const signOut = useCallback(() => {
    const { user, accounts, device } = current.current;
    if (user) {
      api.removeDevice(user.uid, device).catch(() => {});
    }
    const rest = accounts.filter(a => a.user.uid !== user?.uid);
    // остался другой аккаунт — переходим в него
    if (rest[0]) {
      switchSession(rest[0].session);
    } else {
      dropSession();
      stopWatching();
    }
    setCloud(noCloud);
    update({ user: rest[0]?.user ?? null, accounts: rest });
  }, [update]);

  const uid = settings.user?.uid;
  const refreshCloud = useCallback(async () => {
    if (!uid) {
      return;
    }
    try {
      const next = await api.loadCloud(uid);
      setCloud(next);
      // после входа и смены пароля ключ восстановления новый
      const key = currentSession()?.refreshToken;
      if (key) {
        watch(uid, key, team && !!next.role && next.role !== 'bot', notifyTexts());
      }
      if (key && key !== recovery.current) {
        recovery.current = key;
        api.saveRecovery(uid, key).catch(() => {});
      }
      const { accounts, device } = current.current;
      const account = accounts.find(a => a.user.uid === uid);
      // телефон убрали из списка устройств с другого телефона
      if (account?.linked && !(await api.deviceKnown(uid, device))) {
        signOut();
        return;
      }
      await api.touchDevice(uid, device, deviceName());
      // «в сети» — только пока приложение на экране
      if (AppState.currentState === 'active') {
        api.touchSeen(uid).catch(() => {});
      }
      if (account && !account.linked) {
        update({
          accounts: current.current.accounts.map(a =>
            a.user.uid === uid ? { ...a, linked: true } : a,
          ),
        });
      }
    } catch {
      // нет связи — остаются прежние данные
    }
  }, [uid, signOut, update, team]);

  useEffect(() => {
    refreshCloud();
    const timer = setInterval(refreshCloud, REFRESH_MS);
    // вернулся в приложение — сразу «в сети» и свежие данные
    const back = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refreshCloud();
      }
    });
    return () => {
      clearInterval(timer);
      back.remove();
    };
  }, [refreshCloud]);

  const store = useMemo<Store>(
    () => ({
      ready,
      settings,
      user: settings.user,
      cloud,
      refreshCloud,
      register: async data => enter(await api.register(data)),
      login: async (name, password) => enter(await api.login(name, password)),
      signOut,
      changePassword: async (currentPassword, next) => {
        const { user } = current.current;
        if (user) {
          await api.changePassword(currentPassword, next);
          enter(user);
        }
      },
      updateProfile: async patch => {
        const { user } = current.current;
        if (user) {
          await api.saveProfile(user.uid, patch);
          enter({ ...user, ...patch });
        }
      },
      changeNick: async nick => {
        const { user } = current.current;
        if (user) {
          enter({ ...user, nick: await api.changeNick(user, nick) });
        }
      },
      setTheme: theme => update({ theme }),
      setCustom: custom => update({ custom: custom ?? undefined }),
      setLanguage: lang => update({ lang }),
      saveGameBest: gameBest => update({ gameBest }),
      saveBest: (game, best) =>
        update({
          gameBests: { ...current.current.gameBests, [game]: best },
        }),
      markTeamUnlocked: uid =>
        update({
          teamUnlocked: [
            ...(current.current.teamUnlocked ?? []).filter(x => x !== uid),
            uid,
          ],
        }),
      rememberFields: (gameId, fields) =>
        update({ saved: { ...current.current.saved, [gameId]: fields } }),
      adding,
      setAdding,
      switchAccount: target => {
        const { user, accounts } = current.current;
        const session = currentSession();
        const next = accounts.find(a => a.user.uid === target);
        if (!next) {
          return;
        }
        switchSession(next.session);
        setCloud(noCloud);
        update({
          user: next.user,
          // у аккаунта, из которого уходим, сохраняем свежий пропуск
          accounts: accounts.map(a =>
            a.user.uid === user?.uid && session ? { ...a, session } : a,
          ),
        });
      },
    }),
    [ready, settings, cloud, refreshCloud, enter, signOut, update, adding],
  );

  // язык ставится до отрисовки экранов; при смене — экраны рисуются заново
  setLang(settings.lang ?? 'ru');
  return (
    <StoreContext.Provider value={store}>
      <React.Fragment key={settings.lang ?? 'ru'}>{children}</React.Fragment>
    </StoreContext.Provider>
  );
}

// заголовки уведомлений (Notify.kt) на языке приложения
const notifyTexts = () =>
  Object.fromEntries(
    (
      [
        ['orders.done', '✅ Донат зачислен'],
        ['orders.rejected', '❌ Заказ отклонён'],
        ['listings.done', '✅ Аккаунт на витрине'],
        ['listings.rejected', '❌ Объявление отклонено'],
        ['listings.sold', '💰 Аккаунт продан'],
        ['sales.done', '✅ Продажа подтверждена'],
        ['sales.rejected', '❌ Продажа не подтверждена'],
        ['claims.done', '🏆 Награда за задание'],
        ['claims.rejected', '❌ Задание не засчитано'],
        ['orders.staff', '🆕 Новый донат'],
        ['listings.staff', '🆕 Аккаунт на проверку'],
        ['sales.staff', '🆕 Продажа на подтверждение'],
        ['claims.staff', '🆕 Задание выполнено'],
        ['chat.buy', '🛒 Ваш аккаунт хотят купить'],
        ['version', '🔄 Вышло обновление Kovrix'],
        ['version.text', 'Откройте приложение → Профиль → Обновить.'],
      ] as const
    ).map(([key, text]) => [key, t(text)]),
  );

// Данные из облака: загружает их при открытии экрана, а если задан every —
// обновляет сам раз в столько миллисекунд. load должен быть обёрнут
// в useCallback, иначе загрузка начнётся заново при каждой перерисовке.
export function useRemote<T>(load: () => Promise<T>, every = 0) {
  const [state, setState] = useState<{
    data: T | null;
    error: string;
    loading: boolean;
  }>({ data: null, error: '', loading: true });

  const reload = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));
    try {
      const data = await load();
      setState({ data, error: '', loading: false });
    } catch (e) {
      setState(prev => ({ ...prev, error: errorText(e), loading: false }));
    }
  }, [load]);

  useEffect(() => {
    reload();
    if (!every) {
      return;
    }
    const timer = setInterval(reload, every);
    return () => clearInterval(timer);
  }, [reload, every]);

  return { ...state, reload };
}
