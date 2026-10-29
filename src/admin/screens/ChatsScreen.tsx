import React from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../shared/i18n/Text';
import { Nav } from '../../shared/navigation';
import { readable } from '../../shared/platform';
import { Theme, useStyles } from '../../shared/theme';
import { Chat } from '../../shared/types';
import { Empty, Row } from '../../shared/ui';
import { formatDate } from '../../shared/utils';

// Обращения в поддержку и предложения о сотрудничестве. Отвечает админ
// или заместитель — клиент видит ответ от имени Kovrix.
export default function ChatsScreen({
  chats,
  loading,
  reload,
  nav,
}: {
  chats: Chat[];
  loading: boolean;
  reload: () => void;
  nav: Nav;
}) {
  const s = useStyles(makeStyles);
  return (
    <ScrollView
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={reload} />
      }
    >
      <View style={readable}>
        {chats.length === 0 && !loading && (
          <Empty icon="💬" text="Обращений пока нет." />
        )}
        {chats.map(chat => (
          <View key={chat.id}>
            <Row
              testID={`chat-${chat.id}`}
              icon={chat.kind === 'partner' ? '🤝' : '🛟'}
              title={chat.aName}
              text={`${chat.title}: ${chat.last ?? 'нет сообщений'}`}
              mark={chat.unread}
              onPress={() => nav.push({ name: 'chat', id: chat.id })}
            />
            <Text style={s.date}>{formatDate(chat.updatedAt)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 14, paddingBottom: 28 },
    date: {
      color: c.muted,
      fontSize: 11,
      textAlign: 'right',
      marginTop: -8,
      marginBottom: 8,
    },
  });
