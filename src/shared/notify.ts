import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { FIREBASE, VERSION } from './config';

// Уведомления на телефоне (android/app/src/main/java/com/donix/Notify.kt):
// телефон сам проверяет базу раз в 15 минут и сразу, пока приложение
// открыто, — и сообщает о донатах, покупке аккаунта, сообщениях
// и новой версии. На iOS и в браузере ничего не делает.
const native: {
  // сохраняет, кто вошёл, и сразу проверяет базу
  configure(config: object): void;
  clear(): void;
} | null = Platform.OS === 'android' ? NativeModules.DonixNotify ?? null : null;

let asked = false;

// Android 13+ спрашивает разрешение на уведомления — один раз за запуск
async function permission() {
  if (asked || Platform.OS !== 'android' || Number(Platform.Version) < 33) {
    return;
  }
  asked = true;
  await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  ).catch(() => {});
}

// кто вошёл; staff — приложение команды: ей приходят новые заявки клиентов
export function watch(
  uid: string,
  refreshToken: string,
  staff: boolean,
  texts: Record<string, string> = {},
) {
  if (!native) {
    return;
  }
  permission();
  native.configure({
    uid,
    refreshToken,
    staff,
    texts,
    apiKey: FIREBASE.apiKey,
    databaseURL: FIREBASE.databaseURL,
    version: VERSION.code,
  });
}

export const stopWatching = () => native?.clear();
