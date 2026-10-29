import React, { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../shared/i18n/Text';
import { loadMarket } from '../../shared/api';
import { GAMES } from '../../shared/games';
import { Nav } from '../../shared/navigation';
import { readable, useLayout } from '../../shared/platform';
import { useRemote } from '../../shared/store';
import { R, Theme, useStyles } from '../../shared/theme';
import { Btn, GameBanner } from '../../shared/ui';

const plural = (n: number) =>
  n === 0
    ? 'Пока нет аккаунтов'
    : `${n} ${
        n % 10 === 1 && n % 100 !== 11
          ? 'аккаунт'
          : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
          ? 'аккаунта'
          : 'аккаунтов'
      }`;

type Mode = 'buy' | 'sell';

const CHOICES: { mode: Mode; icon: string; title: string; text: string }[] = [
  {
    mode: 'buy',
    icon: '🛒',
    title: 'Купить аккаунт',
    text: 'Витрина аккаунтов: фото, цена, торг',
  },
  {
    mode: 'sell',
    icon: '💰',
    title: 'Продать аккаунт',
    text: 'Выставьте свой — с фото и ценой',
  },
];

// Вкладка «Аккаунты»: сначала выбор — купить или продать, потом игра.
// Купить → витрина аккаунтов игры (MarketScreen), продать → сразу форма
// объявления (SellFormScreen).
export default function SellScreen({ nav }: { nav: Nav }) {
  const s = useStyles(makeStyles);
  const { tiles } = useLayout();
  const [mode, setMode] = useState<Mode | null>(null);
  const { data, loading, reload } = useRemote(useCallback(loadMarket, []));

  return (
    <ScrollView
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={reload} />
      }
    >
      <View style={readable}>
        {mode === null ? (
          <>
            <Text style={s.heroTitle}>Что хотите сделать?</Text>
            {CHOICES.map(choice => (
              <Pressable
                key={choice.mode}
                testID={`choose-${choice.mode}`}
                onPress={() => setMode(choice.mode)}
                style={({ pressed }) => [s.choice, pressed && s.choicePressed]}
              >
                <Text style={s.choiceIcon}>{choice.icon}</Text>
                <View style={s.flex}>
                  <Text style={s.choiceTitle}>{choice.title}</Text>
                  <Text style={s.heroText}>{choice.text}</Text>
                </View>
                <Text style={s.choiceArrow}>›</Text>
              </Pressable>
            ))}
          </>
        ) : (
          <>
            <View style={s.hero}>
              <Text style={s.heroTitle}>
                {mode === 'buy' ? '🛒 Купить аккаунт' : '💰 Продать аккаунт'}
              </Text>
              <Text style={s.heroText}>
                {mode === 'buy'
                  ? 'Выберите игру — откроется витрина. Понравился аккаунт — нажмите «Купить».'
                  : 'Выберите игру, от которой продаёте аккаунт.'}
              </Text>
              <Btn
                title="← Назад к выбору"
                variant="soft"
                small
                onPress={() => setMode(null)}
                style={s.back}
              />
            </View>
            <View style={s.games}>
              {GAMES.map(game => (
                <GameBanner
                  key={game.id}
                  game={game}
                  wide
                  caption={
                    mode === 'buy'
                      ? plural(
                          (data ?? []).filter(lot => lot.game === game.id)
                            .length,
                        )
                      : 'Выставить свой аккаунт'
                  }
                  style={{
                    width: tiles === 1 ? '100%' : `${100 / tiles - 1.8}%`,
                  }}
                  onPress={() =>
                    nav.push({
                      name: mode === 'buy' ? 'market' : 'sell',
                      id: game.id,
                    })
                  }
                />
              ))}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 16, paddingTop: 4 },
    hero: {
      backgroundColor: c.primarySoft,
      borderRadius: R(c) + 4,
      borderWidth: 1,
      borderColor: c.primaryDeep,
      padding: 20,
      marginBottom: 16,
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: '900',
      color: c.text,
      marginBottom: 4,
    },
    flex: { flex: 1 },
    back: { alignSelf: 'flex-start', marginTop: 12 },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: R(c) + 2,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 26,
      paddingHorizontal: 18,
      marginTop: 14,
    },
    choicePressed: { transform: [{ scale: 0.98 }], opacity: 0.85 },
    choiceIcon: { fontSize: 44, marginRight: 16 },
    choiceTitle: { fontSize: 22, fontWeight: '900', color: c.text },
    choiceArrow: { fontSize: 36, color: c.muted, marginLeft: 8 },
    heroText: { color: c.textSoft, fontSize: 15, marginTop: 6, lineHeight: 21 },
    games: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 12,
    },
  });
