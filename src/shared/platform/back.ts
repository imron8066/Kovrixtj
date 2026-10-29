import { useEffect } from 'react';
import { BackHandler } from 'react-native';

// Android: системная кнопка «Назад» возвращает на предыдущий экран
// (на iOS, macOS и Windows такого события нет — подписка ничего не делает)
export function useHardwareBack(enabled: boolean, goBack: () => void) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [enabled, goBack]);
}
