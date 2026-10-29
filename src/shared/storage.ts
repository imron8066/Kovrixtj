import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultSettings, Settings } from './types';

// Заказы, аккаунты и клиенты лежат в облаке Firebase. На телефоне —
// только настройки и вход (чтобы не вводить пароль при каждом запуске).
const SETTINGS_KEY = 'donix:settings';
const SESSION_KEY = 'donix:session';

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

const write = (key: string, value: unknown) =>
  AsyncStorage.setItem(key, JSON.stringify(value));

export const loadSettings = async (): Promise<Settings> => ({
  ...defaultSettings,
  ...(await read<Partial<Settings>>(SETTINGS_KEY, {})),
});
export const saveSettings = (settings: Settings) =>
  write(SETTINGS_KEY, settings);

export const loadSession = <T>() => read<T | null>(SESSION_KEY, null);
export const saveSession = (session: unknown) => write(SESSION_KEY, session);
