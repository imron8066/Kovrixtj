// Android: Material — заголовок слева, стрелка назад, elevation, ripple
import { PlatformStyle } from './types';

const android: PlatformStyle = {
  name: 'Android',
  desktop: false,
  // при edge-to-edge (Android 15+) окно не сжимается само,
  // поэтому отступ под клавиатуру добавляем сами
  keyboardBehavior: 'padding',
  headerHeight: 56,
  headerTitleAlign: 'left',
  headerTitleSize: 20,
  backLabel: '←',
  radius: 12,
  cardShadow: { elevation: 2 },
  ripple: true,
};

export default android;
