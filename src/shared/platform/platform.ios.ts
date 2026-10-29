// iPhone и iPad: заголовок по центру, «‹ Назад», мягкие тени
import { PlatformStyle } from './types';

const ios: PlatformStyle = {
  name: 'iOS',
  desktop: false,
  keyboardBehavior: 'padding',
  headerHeight: 48,
  headerTitleAlign: 'center',
  headerTitleSize: 17,
  backLabel: '‹ Назад',
  radius: 14,
  cardShadow: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  ripple: false,
};

export default ios;
