import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../shared/i18n/Text';
import { buzz, readable } from '../../shared/platform';
import { Theme, useStyles } from '../../shared/theme';
import { Btn } from '../../shared/ui';
import { Arena, Stats } from './Arena';
import { PAIR_ICONS as ICONS } from '../../shared/minigames';
import { GameTop, useBest, useRecord } from './GamesScreen';

// «Найди пару» с уровнями. В начале уровня карточки на секунду открыты —
// запомните их. Дальше открывайте по две: одинаковые остаются. Время идёт
// вниз, каждая пара даёт +2 секунды, пары подряд без ошибок — множитель
// до ×3. Успели — следующий уровень, карточек больше. Время вышло —
// игра окончена, очки идут в рекорд и общий топ.
const PREVIEW_MS = 1500;
const GAP = 10;

// уровень: сколько пар и сколько секунд
const levelOf = (level: number) => {
  const pairs = Math.min(ICONS.length, 4 + level * 2);
  const time = Math.max(18, pairs * 5 + 6 - Math.max(0, level - 4) * 4);
  return { pairs, time };
};

interface Tile {
  id: number;
  icon: string;
  open: boolean;
  found: boolean;
  flip: Animated.Value;
}

const deal = (pairs: number): Tile[] => {
  const icons = ICONS.slice(0, pairs);
  return [...icons, ...icons]
    .map(icon => ({ icon, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ icon }, id) => ({
      id,
      icon,
      open: false,
      found: false,
      flip: new Animated.Value(0),
    }));
};

export default function PairsScreen() {
  const s = useStyles(makeStyles);
  const best = useBest('pairs');
  const { submit, reloadKey } = useRecord('pairs');
  const [phase, setPhase] = useState<
    'ready' | 'preview' | 'play' | 'clear' | 'over'
  >('ready');
  const [level, setLevel] = useState(1);
  const [tiles, setTiles] = useState<Tile[]>(() => deal(levelOf(1).pairs));
  const [left, setLeft] = useState(levelOf(1).time);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [record, setRecord] = useState(false);
  const [flash, setFlash] = useState('');
  // две открытые карточки ждут, пока их закроют, — нажатия не принимаются
  const locked = useRef(false);
  const scoreRef = useRef(0);
  scoreRef.current = score;
  const pulse = useRef(new Animated.Value(1)).current;
  // ширина поля: клетки считаются в точках — проценты с aspectRatio
  // в перенесённом ряду схлопываются в полоски
  const [gridWidth, setGridWidth] = useState(0);
  const cellW = gridWidth ? (gridWidth - 3 * GAP) / 4 : 0;

  const turn = (tile: Tile, open: boolean) =>
    Animated.spring(tile.flip, {
      toValue: open ? 1 : 0,
      friction: 7,
      useNativeDriver: true,
    }).start();

  // уровень: раздать, показать на секунду, закрыть и пустить время
  const begin = (next: number) => {
    const { pairs, time } = levelOf(next);
    const dealt = deal(pairs);
    locked.current = true;
    setLevel(next);
    setTiles(dealt.map(t => ({ ...t, open: true })));
    dealt.forEach(t => turn(t, true));
    setLeft(time);
    setCombo(0);
    setPhase('preview');
    setTimeout(() => {
      dealt.forEach(t => turn(t, false));
      setTiles(list => list.map(t => ({ ...t, open: false })));
      locked.current = false;
      setPhase('play');
    }, PREVIEW_MS);
  };

  const start = () => {
    setScore(0);
    setRecord(false);
    begin(1);
  };

  // время идёт только во время игры
  useEffect(() => {
    if (phase !== 'play') {
      return;
    }
    const timer = setInterval(() => setLeft(sec => sec - 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // время вышло — конец игры
  useEffect(() => {
    if (phase === 'play' && left <= 0) {
      locked.current = true;
      buzz(120);
      setPhase('over');
      setRecord(submit(scoreRef.current));
    }
    // submit читает свежий рекорд при каждом вызове
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, phase]);

  const show = (text: string) => {
    setFlash(text);
    pulse.setValue(1.4);
    Animated.spring(pulse, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();
  };

  const tap = (tile: Tile) => {
    if (locked.current || tile.open || tile.found || phase !== 'play') {
      return;
    }
    turn(tile, true);
    const opened = tiles.filter(t => t.open && !t.found);
    const next = tiles.map(t => (t.id === tile.id ? { ...t, open: true } : t));
    if (opened.length === 0) {
      setTiles(next);
      return;
    }
    // вторая карточка: пара или нет
    const first = opened[0];
    if (first.icon === tile.icon) {
      const made = combo + 1;
      const mult = Math.min(3, made);
      const done = next.map(t =>
        t.id === tile.id || t.id === first.id ? { ...t, found: true } : t,
      );
      setTiles(done);
      setCombo(made);
      setLeft(sec => sec + 2);
      let gained = 100 * mult;
      if (done.every(t => t.found)) {
        // остаток времени — бонус, и сразу следующий уровень
        gained += left * 10;
        show(`Уровень ${level} пройден! +${left * 10}`);
        locked.current = true;
        // пока поздравляем, время стоит
        setPhase('clear');
        setTimeout(() => begin(level + 1), 900);
      } else {
        show(mult > 1 ? `+${gained}  ×${mult}` : `+${gained}`);
      }
      setScore(sc => sc + gained);
      return;
    }
    setTiles(next);
    setCombo(0);
    locked.current = true;
    buzz(40);
    setTimeout(() => {
      turn(first, false);
      turn(tile, false);
      setTiles(list =>
        list.map(t =>
          t.id === tile.id || t.id === first.id ? { ...t, open: false } : t,
        ),
      );
      locked.current = false;
    }, 650);
  };

  const { pairs, time } = levelOf(level);
  const found = tiles.filter(t => t.found).length / 2;
  const hurry = phase === 'play' && left <= 5;

  return (
    <ScrollView contentContainerStyle={s.content}>
      <View style={readable}>
        <Stats
          items={[
            { label: 'Счёт', value: score, tone: 'main' },
            { label: 'Уровень', value: level },
            { label: 'Пары', value: `${found}/${pairs}` },
            {
              label: 'Время',
              value: `⏱ ${Math.max(left, 0)}`,
              tone: hurry ? 'hot' : undefined,
            },
          ]}
        />
        {/* полоска оставшегося времени */}
        <View style={s.bar}>
          <View
            style={[
              s.barFill,
              hurry && s.barHurry,
              { width: `${Math.min(100, (Math.max(left, 0) / time) * 100)}%` },
            ]}
          />
        </View>
        <Animated.Text style={[s.flash, { transform: [{ scale: pulse }] }]}>
          {phase === 'preview' ? '👀 Запоминайте!' : flash || ' '}
        </Animated.Text>

        {phase === 'preview' || phase === 'play' || phase === 'clear' ? (
          <Arena style={s.pad}>
            <View
              style={s.grid}
              onLayout={e => setGridWidth(e.nativeEvent.layout.width)}
            >
              {tiles.map(tile => {
                const front = tile.flip.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['180deg', '360deg'],
                });
                const back = tile.flip.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '180deg'],
                });
                return (
                  <Pressable
                    key={`${level}-${tile.id}`}
                    testID="pair-tile"
                    onPress={() => tap(tile)}
                    style={{ width: cellW, height: cellW * 1.1 }}
                  >
                    <Animated.View
                      style={[
                        s.face,
                        s.back,
                        { transform: [{ rotateY: back }] },
                      ]}
                    >
                      <Text style={s.backText}>K</Text>
                    </Animated.View>
                    <Animated.View
                      style={[
                        s.face,
                        s.front,
                        tile.found && s.found,
                        { transform: [{ rotateY: front }] },
                      ]}
                    >
                      <Text style={s.icon}>{tile.icon}</Text>
                    </Animated.View>
                  </Pressable>
                );
              })}
            </View>
          </Arena>
        ) : (
          <Arena style={s.pad}>
            <Text style={s.big}>{phase === 'over' ? '⌛' : '🃏'}</Text>
            <Text style={s.title}>
              {phase === 'ready'
                ? 'Найди пару'
                : record
                ? '🎉 Новый рекорд!'
                : 'Время вышло'}
            </Text>
            {phase === 'over' ? (
              <>
                <Text style={s.result}>{score}</Text>
                <Text style={s.rules}>{`Вы дошли до уровня ${level}`}</Text>
              </>
            ) : (
              <Text style={s.rules}>
                Запомните карточки, пока они открыты, и находите пары на время.
                Пара — +2 секунды, пары подряд — множитель до ×3. С каждым
                уровнем карточек больше.
              </Text>
            )}
            <Btn
              testID="pairs-again"
              title={phase === 'over' ? '🔁 Ещё раз' : '▶ Играть'}
              onPress={start}
            />
          </Arena>
        )}

        <Text style={s.hint}>
          {best ? `Ваш рекорд: ${best}` : 'Поставьте первый рекорд!'}
        </Text>
        <GameTop game="pairs" reloadKey={reloadKey} />
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 16, paddingTop: 4, paddingBottom: 28 },
    pad: { padding: 16 },
    bar: {
      height: 8,
      borderRadius: 4,
      backgroundColor: c.card,
      overflow: 'hidden',
    },
    barFill: { height: '100%', borderRadius: 4, backgroundColor: c.primary },
    barHurry: { backgroundColor: c.danger },
    flash: {
      color: c.accent,
      fontSize: 17,
      fontWeight: '900',
      textAlign: 'center',
      marginVertical: 10,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: GAP,
    },
    face: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: c.radius ? 12 : 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      backfaceVisibility: 'hidden',
    },
    // рубашка: у «Кибера» тёмная с лаймовой K в рамке, как логотип
    back: c.grid
      ? {
          backgroundColor: c.primarySoft,
          borderColor: c.primary,
          borderWidth: 1.5,
        }
      : { backgroundColor: c.primary, borderColor: c.primary },
    backText: {
      color: c.grid ? c.primary : c.onPrimary,
      fontSize: 28,
      fontWeight: '900',
    },
    front: {
      backgroundColor: c.card,
      borderColor: c.border,
    },
    found: { backgroundColor: c.greenSoft, borderColor: c.green },
    icon: { fontSize: 34 },
    big: { fontSize: 56, textAlign: 'center', marginBottom: 6 },
    title: {
      color: c.text,
      fontSize: 24,
      fontWeight: '900',
      marginBottom: 10,
      textAlign: 'center',
      letterSpacing: c.caps ? 1 : 0,
      textTransform: c.caps ? 'uppercase' : 'none',
    },
    result: {
      color: c.primary,
      fontSize: 56,
      fontWeight: '900',
      textAlign: 'center',
      marginBottom: 6,
    },
    rules: {
      color: c.textSoft,
      fontSize: 15,
      textAlign: 'center',
      marginBottom: 16,
    },
    hint: {
      color: c.muted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
      marginBottom: 12,
    },
  });
