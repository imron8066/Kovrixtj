import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../shared/i18n/Text';
import { buzz, readable } from '../../shared/platform';
import { P, Theme, useStyles } from '../../shared/theme';
import { Btn } from '../../shared/ui';
import { Arena, Stats } from './Arena';
import { QUESTIONS } from '../../shared/minigames';
import { GameTop, useBest, useRecord } from './GamesScreen';

// Викторина «Знаток Free Fire»: 10 случайных вопросов, на каждый 12 секунд.
// Верный ответ — 100 очков плюс 10 за каждую оставшуюся секунду, серия
// верных ответов подряд даёт ещё +20 за каждый ответ в серии.

const ROUND = 10;
const SECONDS = 12;

const shuffle = <T,>(list: T[]) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

interface Asked {
  q: string;
  why: string;
  right: string;
  answers: string[];
}

const newRound = (): Asked[] =>
  shuffle(QUESTIONS)
    .slice(0, ROUND)
    .map(({ q, why, answers }) => ({
      q,
      why,
      right: answers[0],
      answers: shuffle(answers),
    }));

export default function QuizScreen() {
  const s = useStyles(makeStyles);
  const best = useBest('quiz');
  const { submit, reloadKey } = useRecord('quiz');
  const [phase, setPhase] = useState<'ready' | 'play' | 'over'>('ready');
  const [round, setRound] = useState<Asked[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [left, setLeft] = useState(SECONDS);
  const [score, setScore] = useState(0);
  const [right, setRight] = useState(0);
  const [streak, setStreak] = useState(0);
  const [record, setRecord] = useState(false);
  const bar = useRef(new Animated.Value(1)).current;
  const question = round[index];

  const start = () => {
    setRound(newRound());
    setIndex(0);
    setPicked(null);
    setScore(0);
    setRight(0);
    setStreak(0);
    setRecord(false);
    setLeft(SECONDS);
    setPhase('play');
  };

  // таймер вопроса: полоска тает, по нулям — ответ не засчитан
  useEffect(() => {
    if (phase !== 'play' || picked !== null) {
      return;
    }
    bar.setValue(left / SECONDS);
    Animated.timing(bar, {
      toValue: 0,
      duration: left * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
    const timer = setInterval(() => setLeft(sec => Math.max(sec - 1, 0)), 1000);
    return () => {
      clearInterval(timer);
      bar.stopAnimation();
    };
    // таймер перезапускается только с новым вопросом
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index, picked === null]);

  // время вышло — ответ не засчитан
  useEffect(() => {
    if (phase === 'play' && picked === null && left === 0) {
      setPicked('');
      setStreak(0);
      buzz(60);
    }
  }, [phase, picked, left]);

  const answer = (text: string) => {
    if (picked !== null) {
      return;
    }
    setPicked(text);
    if (text === question.right) {
      setScore(sc => sc + 100 + left * 10 + streak * 20);
      setRight(n => n + 1);
      setStreak(n => n + 1);
    } else {
      setStreak(0);
      buzz(60);
    }
  };

  const next = () => {
    if (index + 1 < round.length) {
      setIndex(index + 1);
      setPicked(null);
      setLeft(SECONDS);
      return;
    }
    setPhase('over');
    setRecord(submit(score));
  };

  return (
    <ScrollView contentContainerStyle={s.content}>
      <View style={readable}>
        {phase === 'ready' && (
          <Arena style={s.pad}>
            <Text style={s.big}>🧠</Text>
            <Text style={s.title}>Знаток Free Fire</Text>
            <Text style={s.rules}>
              {`${ROUND} вопросов о Free Fire и Kovrix, на каждый ${SECONDS} секунд. Отвечайте быстрее — получите больше очков, серия верных ответов даёт бонус.`}
            </Text>
            {!!best && <Text style={s.best}>{`Ваш рекорд: ${best}`}</Text>}
            <Btn testID="quiz-start" title="Начать" onPress={start} />
          </Arena>
        )}

        {phase === 'play' && question && (
          <Arena style={s.pad}>
            <Stats
              items={[
                { label: 'Вопрос', value: `${index + 1}/${round.length}` },
                { label: 'Очки', value: score, tone: 'main' },
                {
                  label: 'Время',
                  value: Math.max(left, 0),
                  tone: left <= 3 ? 'hot' : undefined,
                },
              ]}
            />
            <View style={s.track}>
              <Animated.View
                style={[
                  s.fill,
                  left <= 3 && s.fillLow,
                  {
                    width: bar.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
            <Text style={s.question}>{question.q}</Text>
            {question.answers.map((text, i) => {
              const done = picked !== null;
              const isRight = done && text === question.right;
              const isWrong = done && text === picked && !isRight;
              return (
                <Pressable
                  key={text}
                  testID="quiz-answer"
                  disabled={done}
                  onPress={() => answer(text)}
                  style={({ pressed }) => [
                    s.answer,
                    isRight && s.answerRight,
                    isWrong && s.answerWrong,
                    pressed && s.pressed,
                  ]}
                >
                  <Text style={s.letter}>{'ABCD'[i]}</Text>
                  <Text style={s.answerText}>
                    {`${isRight ? '✅ ' : isWrong ? '❌ ' : ''}${text}`}
                  </Text>
                </Pressable>
              );
            })}
            {picked !== null && (
              <>
                <Text style={s.why}>
                  {picked === ''
                    ? `⏰ Время вышло. ${question.why}`
                    : picked === question.right
                    ? `🔥 Верно!${streak > 1 ? ` Серия ×${streak}.` : ''} ${
                        question.why
                      }`
                    : `Неверно. ${question.why}`}
                </Text>
                <Btn
                  testID="quiz-next"
                  title={index + 1 < round.length ? 'Дальше' : 'Результат'}
                  onPress={next}
                />
              </>
            )}
          </Arena>
        )}

        {phase === 'over' && (
          <Arena style={s.pad}>
            <Text style={s.big}>
              {right >= 8 ? '🏆' : right >= 5 ? '👍' : '📚'}
            </Text>
            <Text style={s.title}>
              {record ? 'Новый рекорд!' : 'Игра окончена'}
            </Text>
            <Text style={s.result}>{score}</Text>
            <Text style={s.rules}>
              {`Верных ответов: ${right} из ${round.length}${
                right === round.length ? ' — настоящий знаток!' : ''
              }`}
            </Text>
            <Btn testID="quiz-again" title="Ещё раз" onPress={start} />
          </Arena>
        )}

        <GameTop game="quiz" reloadKey={reloadKey} />
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 16, paddingTop: 4, paddingBottom: 28 },
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
    rules: {
      color: c.textSoft,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      marginBottom: 16,
    },
    best: {
      color: c.primary,
      fontSize: 16,
      fontWeight: '900',
      textAlign: 'center',
      marginBottom: 12,
    },
    pad: { padding: 18 },
    track: {
      height: 8,
      borderRadius: 4,
      backgroundColor: c.subtle,
      overflow: 'hidden',
      marginBottom: 14,
    },
    fill: { height: 8, backgroundColor: c.primary },
    fillLow: { backgroundColor: c.danger },
    question: {
      color: c.text,
      fontSize: 19,
      fontWeight: '900',
      lineHeight: 26,
      marginBottom: 14,
    },
    answer: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      marginBottom: 10,
      borderRadius: P(c),
      paddingHorizontal: 20,
      backgroundColor: c.card,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    answerRight: { backgroundColor: c.greenSoft, borderColor: c.green },
    answerWrong: { backgroundColor: c.dangerSoft, borderColor: c.danger },
    pressed: { transform: [{ scale: 0.98 }], opacity: 0.85 },
    answerText: { flex: 1, color: c.text, fontSize: 16, fontWeight: '800' },
    // буква варианта в квадратике, как в игровых викторинах
    letter: {
      width: 28,
      height: 28,
      marginRight: 12,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: c.primarySoft,
      color: c.primary,
      fontSize: 14,
      fontWeight: '900',
      lineHeight: 28,
      textAlign: 'center',
    },
    why: {
      color: c.textSoft,
      fontSize: 14,
      lineHeight: 20,
      marginVertical: 10,
    },
    result: {
      color: c.primary,
      fontSize: 56,
      fontWeight: '900',
      textAlign: 'center',
      marginBottom: 6,
    },
  });
