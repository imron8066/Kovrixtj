import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { t } from '../../shared/i18n';
import { Text } from '../../shared/i18n/Text';
import { loadGameTop, saveGameScore } from '../../shared/api';
import { buzz, readable } from '../../shared/platform';
import { useRemote, useStore } from '../../shared/store';
import { Theme, useStyles } from '../../shared/theme';
import { Btn, Card } from '../../shared/ui';
import { Arena, Stats } from './Arena';

// Мини-игра «Алмазный дождь», пока заказ ждёт подтверждения. Сверху падают
// алмазы — ловите их нажатием, пока не упали. Пропущенный 💎 или пойманная
// 💣 — минус жизнь. Серия попаданий подряд даёт множитель до ×5, каждые
// 15 очков — новый уровень: падает быстрее и чаще. Рекорд хранится на
// телефоне и попадает в общий топ игроков Kovrix.
const SIZE = 56;
const FIELD_H = 440;
const LIVES = 3;
const MAX_LIVES = 5;

type Kind = 'gem' | 'crown' | 'bomb' | 'heart';
const ICON: Record<Kind, string> = {
  gem: '💎',
  crown: '👑',
  bomb: '💣',
  heart: '❤️',
};

interface Drop {
  id: number;
  x: number;
  kind: Kind;
  y: Animated.Value;
  spin: Animated.Value;
}
interface Pop {
  id: number;
  x: number;
  y: number;
  text: string;
  good: boolean;
  t: Animated.Value;
}

const pickKind = (lives: number): Kind => {
  const roll = Math.random();
  if (roll < 0.06) {
    return 'crown';
  }
  if (roll < 0.09 && lives < MAX_LIVES) {
    return 'heart';
  }
  return roll < 0.25 ? 'bomb' : 'gem';
};

const levelOf = (score: number) => 1 + Math.floor(score / 15);
const multOf = (combo: number) => Math.min(5, 1 + Math.floor(combo / 5));

export default function WaitGameScreen() {
  const s = useStyles(makeStyles);
  const { user, settings, saveGameBest } = useStore();
  const best = settings.gameBest ?? 0;
  const top = useRemote(loadGameTop);

  const [width, setWidth] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'play' | 'over'>('ready');
  const [drops, setDrops] = useState<Drop[]>([]);
  const [pops, setPops] = useState<Pop[]>([]);
  const [hud, setHud] = useState({ score: 0, lives: LIVES, combo: 0 });
  const [record, setRecord] = useState(false);
  // всё, что читают таймеры и анимации, — в ref, чтобы не ловить старые
  // значения; best — для конца игры
  const game = useRef({ score: 0, lives: LIVES, combo: 0, next: 0, on: false });
  const bestRef = useRef(best);
  bestRef.current = best;
  const shake = useRef(new Animated.Value(0)).current;

  const sync = () => {
    const { score, lives, combo } = game.current;
    setHud({ score, lives, combo });
  };

  const pop = (x: number, y: number, text: string, good: boolean) => {
    const item = {
      id: game.current.next++,
      x,
      y,
      text,
      good,
      t: new Animated.Value(0),
    };
    setPops(list => [...list, item]);
    Animated.timing(item.t, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start(() => setPops(list => list.filter(p => p.id !== item.id)));
  };

  const finish = () => {
    const g = game.current;
    if (!g.on) {
      return;
    }
    g.on = false;
    setPhase('over');
    setDrops(list => {
      list.forEach(d => d.y.stopAnimation());
      return [];
    });
    if (g.score > bestRef.current) {
      setRecord(true);
      saveGameBest(g.score);
      if (user) {
        saveGameScore(user, g.score)
          .then(top.reload)
          .catch(() => {});
      }
    }
  };

  const hurt = () => {
    const g = game.current;
    g.lives -= 1;
    g.combo = 0;
    buzz(60);
    Animated.sequence(
      [10, -10, 6, -6, 0].map(toValue =>
        Animated.timing(shake, {
          toValue,
          duration: 45,
          useNativeDriver: true,
        }),
      ),
    ).start();
    sync();
    if (g.lives <= 0) {
      finish();
    }
  };

  // новый падающий предмет; уровень ускоряет падение
  const spawn = useCallback(() => {
    const g = game.current;
    if (!g.on || !width) {
      return;
    }
    const drop: Drop = {
      id: g.next++,
      x: Math.random() * Math.max(width - SIZE, 0),
      kind: pickKind(g.lives),
      y: new Animated.Value(-SIZE),
      spin: new Animated.Value(0),
    };
    setDrops(list => [...list, drop]);
    Animated.timing(drop.spin, {
      toValue: 1,
      duration: 2400,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
    const fall = Math.max(1300, 3300 - levelOf(g.score) * 220);
    Animated.timing(drop.y, {
      toValue: FIELD_H,
      duration: fall * (0.85 + Math.random() * 0.3),
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }
      setDrops(list => list.filter(d => d.id !== drop.id));
      // упустили алмаз или корону — минус жизнь; бомба и сердце — не беда
      if (game.current.on && (drop.kind === 'gem' || drop.kind === 'crown')) {
        pop(drop.x, FIELD_H - SIZE - 10, '💔', false);
        hurt();
      }
    });
    // pop и hurt читают только ref — пересоздавать spawn ради них не нужно
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  // волны: чем выше уровень, тем чаще падает
  useEffect(() => {
    if (phase !== 'play') {
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      spawn();
      timer = setTimeout(
        loop,
        Math.max(330, 950 - levelOf(game.current.score) * 70),
      );
    };
    loop();
    return () => clearTimeout(timer);
  }, [phase, spawn]);

  // ушли с экрана — игра останавливается
  useEffect(
    () => () => {
      game.current.on = false;
    },
    [],
  );

  const start = () => {
    game.current = {
      score: 0,
      lives: LIVES,
      combo: 0,
      next: game.current.next,
      on: true,
    };
    setRecord(false);
    setDrops([]);
    setPops([]);
    sync();
    setPhase('play');
  };

  const tap = (drop: Drop) => {
    const g = game.current;
    if (!g.on) {
      return;
    }
    drop.y.stopAnimation(y => {
      setDrops(list => list.filter(d => d.id !== drop.id));
      if (drop.kind === 'bomb') {
        pop(drop.x, y, '💥', false);
        hurt();
        return;
      }
      if (drop.kind === 'heart') {
        g.lives = Math.min(MAX_LIVES, g.lives + 1);
        pop(drop.x, y, '+❤️', true);
        sync();
        return;
      }
      g.combo += 1;
      const points = (drop.kind === 'crown' ? 5 : 1) * multOf(g.combo);
      const before = levelOf(g.score);
      g.score += points;
      pop(drop.x, y, `+${points}`, true);
      if (levelOf(g.score) > before) {
        pop(
          width / 2 - 60,
          FIELD_H / 2 - 20,
          t(`Уровень ${levelOf(g.score)}!`),
          true,
        );
      }
      sync();
    });
  };

  const level = levelOf(hud.score);
  const mult = multOf(hud.combo);
  const players = (top.data ?? []).slice(0, 10);

  return (
    <ScrollView
      contentContainerStyle={s.content}
      scrollEnabled={phase !== 'play'}
    >
      <View style={readable}>
        <Stats
          items={[
            { label: 'Счёт', value: hud.score, tone: 'main' },
            { label: 'Уровень', value: mult > 1 ? `${level} ×${mult}` : level },
            { label: 'Рекорд', value: Math.max(best, hud.score) },
            {
              label: 'Жизни',
              value: '❤️'.repeat(Math.max(hud.lives, 0)) || '💀',
              tone: hud.lives <= 1 ? 'hot' : undefined,
            },
          ]}
        />

        <Arena
          style={[s.field, { transform: [{ translateX: shake }] }]}
          onLayout={e => setWidth(e.nativeEvent.layout.width)}
        >
          {phase === 'play' &&
            drops.map(drop => (
              <Animated.View
                key={drop.id}
                style={[
                  s.drop,
                  {
                    left: drop.x,
                    transform: [
                      { translateY: drop.y },
                      {
                        rotate: drop.spin.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['-15deg', '15deg'],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Pressable
                  testID={`drop-${drop.kind}`}
                  onPressIn={() => tap(drop)}
                  hitSlop={10}
                  style={s.dropHit}
                >
                  <Text style={s.icon}>{ICON[drop.kind]}</Text>
                </Pressable>
              </Animated.View>
            ))}
          {pops.map(p => (
            <Animated.Text
              key={p.id}
              pointerEvents="none"
              style={[
                s.pop,
                p.good ? s.popGood : s.popBad,
                {
                  left: p.x,
                  top: p.y,
                  opacity: p.t.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0],
                  }),
                  transform: [
                    {
                      translateY: p.t.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -50],
                      }),
                    },
                    {
                      scale: p.t.interpolate({
                        inputRange: [0, 0.2, 1],
                        outputRange: [0.6, 1.3, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              {p.text}
            </Animated.Text>
          ))}
          {phase !== 'play' && (
            <View style={s.center}>
              <Text style={s.title}>
                {phase === 'ready'
                  ? '💎 Алмазный дождь'
                  : record
                  ? '🎉 Новый рекорд!'
                  : 'Игра окончена'}
              </Text>
              {phase === 'over' ? (
                <Text style={s.result}>{hud.score}</Text>
              ) : (
                <Text style={s.rules}>
                  Ловите 💎 нажатием, пока не упали. 👑 — +5 очков, ❤️ — жизнь,
                  💣 не трогайте! Серия без промахов даёт множитель до ×5.
                </Text>
              )}
              <Btn
                testID="game-start"
                title={phase === 'over' ? '🔁 Ещё раз' : '▶ Играть'}
                onPress={start}
                disabled={!width}
              />
            </View>
          )}
        </Arena>

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

        <Text style={s.hint}>
          Подтверждение заказа — в течение дня, обычно быстрее. Ответ появится
          на вкладке «Ответы».
        </Text>
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 16, paddingTop: 4, paddingBottom: 28 },
    field: { height: FIELD_H },
    drop: { position: 'absolute', top: 0, width: SIZE, height: SIZE },
    dropHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    icon: { fontSize: 40 },
    pop: { position: 'absolute', fontSize: 22, fontWeight: '900' },
    popGood: { color: c.primary },
    popBad: { color: c.danger },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 22,
    },
    title: {
      color: c.text,
      fontSize: 24,
      fontWeight: '900',
      marginBottom: 10,
      textAlign: 'center',
      letterSpacing: c.caps ? 1 : 0,
      textTransform: c.caps ? 'uppercase' : 'none',
    },
    rules: {
      color: c.textSoft,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      marginBottom: 18,
    },
    result: {
      color: c.primary,
      fontSize: 56,
      fontWeight: '900',
      marginBottom: 16,
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
