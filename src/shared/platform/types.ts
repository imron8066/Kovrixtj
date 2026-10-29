import { ViewStyle } from 'react-native';

export type DeviceKind = 'phone' | 'tablet' | 'desktop';

// Всё, чем внешний вид и поведение отличаются между платформами.
// Каждый файл platform.<ос>.ts возвращает такой объект.
export interface PlatformStyle {
  name: string;
  // macOS и Windows — окно с мышью и клавиатурой, а не телефон
  desktop: boolean;
  // как KeyboardAvoidingView поднимает экран над клавиатурой
  keyboardBehavior?: 'padding' | 'height';
  headerHeight: number;
  headerTitleAlign: 'left' | 'center';
  headerTitleSize: number;
  backLabel: string;
  radius: number;
  cardShadow: ViewStyle;
  // Android: «волна» при нажатии на кнопку
  ripple: boolean;
  fontFamily?: string;
}
