import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../shared/i18n/Text';
import { loadTop, saveTopScore } from '../../shared/api';
import { Nav } from '../../shared/navigation';
import { readable } from '../../shared/platform';
import { useRemote, useStore } from '../../shared/store';
import { R, Theme, useStyles } from '../../shared/theme';
import { Card } from '../../shared/ui';

// Мини-игры Kovrix. id — что открыть в маршруте play: '' — «Алмазный
// дождь» (его рекорд в Settings.gameBest), остальные — в Settings.gameBests
export const MINI_GAMES = [
  {
    id: '',
    icon: '💎',
    name: 'Алмазный дождь',
    text: 'Ловите алмазы, не трогайте бомбы',
  },
  {
    id: 'quiz',
    icon: '🧠',
    name: 'Знаток Free Fire',
    text: 'Викторина: 10 вопросов на время',
  },
  {
    id: 'pairs',
    icon: '🃏',
    name: 'Найди пару',
    text: 'Уровни на время: запомни и найди пары',
  },
];

export const titleOf = (id: string) =>
  MINI_GAMES.find(g => g.id === id)?.name ?? 'Мини-игра';

// рекорд игры на этом телефоне
export function useBest(id: string) {
  const { settings } = useStore();
  return (id ? settings.gameBests?.[id] : settings.gameBest) ?? 0;
}

// конец партии: новый рекорд сохраняется на телефоне и в общем топе;
// submit возвращает true, если это рекорд
export function useRecord(game: string) {
  const { user, settings, saveBest } = useStore();
  const [reloadKey, setReloadKey] = useState(0);
  const submit = (score: number) => {
    if (score <= (settings.gameBests?.[game] ?? 0)) {
      return false;
    }
    saveBest(game, score);
    if (user) {
      saveTopScore(game, user, score)
        .then(() => setReloadKey(k => k + 1))
        .catch(() => {});
    }
    return true;
  };
  return { submit, reloadKey };
}

// плитки мини-игр — на главной и в хабе «Мини-игры»
export function MiniGameTiles({ nav }: { nav: Nav }) {
  const s = useStyles(makeStyles);
  const { settings } = useStore();
  return (
    <View style={s.tiles}>
      {MINI_GAMES.map(g => {
        const best = g.id ? settings.gameBests?.[g.id] : settings.gameBest;
        return (
          <Pressable
            key={g.id || 'rain'}
            testID={`mini-${g.id || 'rain'}`}
            onPress={() => nav.push({ name: 'play', id: g.id })}
            style={({ pressed }) => [s.tile, pressed && s.pressed]}
          >
            <Text style={s.tileIcon}>{g.icon}</Text>
            <Text style={s.tileName} numberOfLines={2}>
              {g.name}
            </Text>
            <Text style={s.tileBest}>{best ? `🏆 ${best}` : 'Играть'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// общий топ игры (для викторины и «Найди пару»); reloadKey — перечитать
// после нового рекорда
export function GameTop({
  game,
  reloadKey,
}: {
  game: string;
  reloadKey: number;
}) {
  const s = useStyles(makeStyles);
  const { user } = useStore();
  const { data } = useRemote(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useCallback(() => loadTop(game), [game, reloadKey]),
  );
  const players = (data ?? []).slice(0, 10);
  return (
    <Card>
      <Text style={s.topTitle}>🏆 Топ игроков Kovrix</Text>
      {players.length === 0 && (
        <Text style={s.hint}>Пока никого — станьте первым!</Text>
      )}
      {players.map((p, i) => (
        <View key={p.uid} style={s.topRow}>
          <Text style={[s.topName, p.uid === user?.uid && s.me]}>
            {`${i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`} ${p.name}`}
          </Text>
          <Text style={s.topScore}>{p.best}</Text>
        </View>
      ))}
    </Card>
  );
}

// хаб «Мини-игры»: все игры и рекорды
export default function GamesScreen({ nav }: { nav: Nav }) {
  const s = useStyles(makeStyles);
  return (
    <ScrollView contentContainerStyle={s.content}>
      <View style={readable}>
        <Text style={s.lead}>
          Играйте, ставьте рекорды и попадайте в топ Kovrix. У каждой игры свой
          топ игроков.
        </Text>
        <MiniGameTiles nav={nav} />
        <Text style={s.hint}>
          Ждёте заказ? Подтверждение — в течение дня, обычно быстрее. Ответ
          появится на вкладке «Ответы».
        </Text>
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 16, paddingTop: 4, paddingBottom: 28 },
    lead: { color: c.textSoft, fontSize: 15, lineHeight: 21, marginBottom: 12 },
    tiles: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    tile: {
      width: '31.5%',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 6,
      borderRadius: R(c),
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    pressed: { transform: [{ scale: 0.96 }], opacity: 0.85 },
    tileIcon: { fontSize: 38, marginBottom: 6 },
    tileName: {
      color: c.text,
      fontSize: 13,
      fontWeight: '900',
      textAlign: 'center',
      minHeight: 34,
    },
    tileBest: {
      color: c.primary,
      fontSize: 13,
      fontWeight: '900',
      marginTop: 4,
    },
    topTitle: {
      color: c.text,
      fontSize: 17,
      fontWeight: '900',
      marginBottom: 8,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    topName: { color: c.textSoft, fontSize: 15, flex: 1 },
    me: { color: c.primary, fontWeight: '900' },
    topScore: { color: c.text, fontSize: 15, fontWeight: '900' },
    hint: {
      color: c.muted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
      marginTop: 4,
    },
  });
