// Запасной вариант для остальных платформ.
// Metro сам выбирает platform.ios.ts / platform.android.ts, если такой файл есть.
import { PlatformStyle } from './types';

const fallback: PlatformStyle = {
  name: 'Другая',
  desktop: true,
  headerHeight: 52,
  headerTitleAlign: 'left',
  headerTitleSize: 20,
  backLabel: '← Назад',
  radius: 12,
  cardShadow: {},
  ripple: false,
};

export default fallback;
