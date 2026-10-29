import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../i18n/Text';
import {
  chatDrafts,
  loadChat,
  loadMessages,
  markRead,
  sendMessage,
} from '../api';
import { CHAT_MS } from '../config';
import { readable } from '../platform';
import { showAlert } from '../platform/alert';
import { useRemote, useStore } from '../store';
import { Theme, useStyles, useTheme } from '../theme';
import { Btn, Empty } from '../ui';
import { errorText, formatDate, isOwnMessage } from '../utils';

// Переписка: торг с продавцом, поддержка, сотрудничество. Новые сообщения
// подтягиваются сами раз в несколько секунд. owner — чей это список чатов:
// uid клиента или 'staff', когда отвечает админ или заместитель.
export default function ChatScreen({
  id,
  owner,
}: {
  id: string;
  owner: string;
}) {
  const s = useStyles(makeStyles);
  const c = useTheme();
  const { user } = useStore();
  const [text, setText] = useState(() => {
    const draft = chatDrafts[id] ?? '';
    delete chatDrafts[id];
    return draft;
  });
  const [busy, setBusy] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const { data, error, reload } = useRemote(
    useCallback(
      async () => ({
        chat: await loadChat(owner, id),
        messages: await loadMessages(id),
      }),
      [id, owner],
    ),
    CHAT_MS,
  );

  const chat = data?.chat;
  const count = data?.messages.length ?? 0;
  const unread = !!chat?.unread;

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [count]);

  useEffect(() => {
    if (unread) {
      markRead(owner, id).catch(() => {});
    }
  }, [unread, owner, id]);

  if (!user || (data && !chat)) {
    return <Empty icon="💬" text="Чат не найден." />;
  }

  const send = async () => {
    const message = text.trim();
    if (!message || !chat) {
      return;
    }
    setBusy(true);
    try {
      await sendMessage(chat, owner, {
        from: user.uid,
        name: owner === 'staff' ? 'Kovrix' : user.name,
        text: message,
        at: Date.now(),
        ...(owner === 'staff' ? { staff: true } : {}),
      });
      setText('');
      reload();
    } catch (e) {
      showAlert('Не отправлено', errorText(e));
    }
    setBusy(false);
  };

  return (
    <View style={s.root}>
      <ScrollView ref={scroll} contentContainerStyle={s.content}>
        <View style={readable}>
          {chat && (
            <Text style={s.about}>
              {chat.title} · {owner === chat.a ? chat.bName : chat.aName}
            </Text>
          )}
          {!!error && <Text style={s.error}>{error}</Text>}
          {data && count === 0 && (
            <Empty icon="💬" text="Напишите первое сообщение." />
          )}
          {data?.messages.map(message => {
            // для поддержки «свои» — все ответы команды
            const own = !!chat && isOwnMessage(message, chat, owner, user.uid);
            return (
              <View
                key={`${message.at}-${message.from}`}
                style={[s.bubble, own ? s.own : s.their]}
              >
                {!own && <Text style={s.author}>{message.name}</Text>}
                <Text style={[s.text, own && s.ownText]} selectable>
                  {message.text}
                </Text>
                <Text style={[s.time, own && s.ownText]}>
                  {formatDate(message.at)}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View style={s.bar}>
        <TextInput
          testID="message-input"
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Сообщение"
          placeholderTextColor={c.placeholder}
          multiline
          maxLength={1000}
        />
        <Btn
          testID="send-button"
          title="➤"
          small
          disabled={busy || !text.trim() || !chat}
          onPress={send}
          style={s.send}
        />
      </View>
    </View>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    root: { flex: 1 },
    content: { padding: 14 },
    about: {
      color: c.muted,
      fontSize: 13,
      textAlign: 'center',
      marginBottom: 12,
    },
    error: { color: c.danger, fontSize: 14, marginBottom: 12 },
    bubble: {
      maxWidth: '82%',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      marginBottom: 8,
    },
    own: {
      alignSelf: 'flex-end',
      backgroundColor: c.primary,
      borderBottomRightRadius: 6,
    },
    their: {
      alignSelf: 'flex-start',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderBottomLeftRadius: 6,
    },
    author: { color: c.accent, fontSize: 12, fontWeight: '700' },
    text: { color: c.text, fontSize: 15, lineHeight: 21 },
    ownText: { color: c.onPrimary },
    time: { color: c.muted, fontSize: 10, marginTop: 2, textAlign: 'right' },
    bar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: 8,
      backgroundColor: c.card,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    input: {
      flex: 1,
      maxHeight: 110,
      borderWidth: 1,
      borderColor: c.inputBorder,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: c.subtle,
      fontSize: 16,
      color: c.text,
    },
    send: { marginLeft: 8, paddingHorizontal: 16 },
  });
