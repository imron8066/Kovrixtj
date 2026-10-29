import { Alert } from 'react-native';
import { t } from '../i18n';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

// Android, iOS, macOS, Windows — системное окно сообщения; текст
// переводится на язык приложения
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
) {
  Alert.alert(
    t(title),
    message && t(message),
    buttons?.map(button => ({ ...button, text: t(button.text) })),
  );
}
