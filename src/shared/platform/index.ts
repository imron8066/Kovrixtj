import { useWindowDimensions, Vibration } from 'react-native';
import platform from './platform';
import { readable, TABLET } from './tablet';
import { DeviceKind } from './types';

export { platform, readable, TABLET };

// дрожь телефона в мини-играх; если телефон её не даёт — просто без неё,
// игра не должна из-за этого закрываться
export function buzz(ms: number) {
  try {
    Vibration.vibrate(ms);
  } catch {}
}
export type { DeviceKind, PlatformStyle } from './types';

export interface Layout {
  device: DeviceKind;
  width: number;
  height: number;
  landscape: boolean;
  // боковое меню вместо нижней панели вкладок
  sidebar: boolean;
  // сколько карточек объявлений в ряд
  columns: number;
  // сколько плиток игр в ряд
  tiles: number;
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  const device: DeviceKind = platform.desktop
    ? 'desktop'
    : Math.min(width, height) >= TABLET.minShortSide
    ? 'tablet'
    : 'phone';
  const sidebar = device !== 'phone' && width >= TABLET.sidebarFrom;
  const contentWidth = width - (sidebar ? TABLET.sidebarWidth : 0);
  const columns =
    device === 'phone'
      ? 2
      : Math.min(
          TABLET.maxColumns,
          Math.max(2, Math.floor(contentWidth / TABLET.minColumnWidth)),
        );
  return {
    device,
    width,
    height,
    landscape: width > height,
    sidebar,
    columns,
    // плитки игр широкие, как превью на YouTube: на телефоне по одной в ряд
    tiles: device === 'phone' ? 1 : Math.max(2, columns - 1),
  };
}
