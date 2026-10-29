import React from 'react';
import {
  Animated,
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Text } from '../../shared/i18n/Text';
import { R, Theme, useStyles, useTheme } from '../../shared/theme';
import { Grid } from '../../shared/ui';

// Общий вид мини-игр: поле-«арена» в светящейся рамке цвета темы, с сеткой
// и уголками прицела, и строка счётчиков над ним (СЧЁТ, УРОВЕНЬ…)
export function Arena({
  children,
  style,
  onLayout,
}: {
  children: React.ReactNode;
  // Animated — чтобы «Алмазный дождь» мог трясти поле
  style?:
    | StyleProp<ViewStyle>
    | Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const c = useTheme();
  const s = useStyles(makeStyles);
  return (
    <Animated.View style={[s.arena, style]} onLayout={onLayout}>
      <View style={s.under} pointerEvents="none">
        <Grid color={c.border} />
        <View style={s.shine} />
      </View>
      {children}
      <View style={[s.corner, s.tl]} pointerEvents="none" />
      <View style={[s.corner, s.tr]} pointerEvents="none" />
      <View style={[s.corner, s.bl]} pointerEvents="none" />
      <View style={[s.corner, s.br]} pointerEvents="none" />
    </Animated.View>
  );
}

export interface StatItem {
  label: string;
  value: string | number;
  // main — крупно цветом темы, hot — красным (мало времени, жизней)
  tone?: 'main' | 'hot';
}

export function Stats({ items }: { items: StatItem[] }) {
  const s = useStyles(makeStyles);
  return (
    <View style={s.stats}>
      {items.map(item => (
        <View
          key={item.label}
          style={[
            s.stat,
            item.tone === 'main' && s.statMain,
            item.tone === 'hot' && s.statHot,
          ]}
        >
          <Text style={s.statLabel}>{item.label}</Text>
          <Text
            style={[
              s.statValue,
              item.tone === 'main' && s.statValueMain,
              item.tone === 'hot' && s.statValueHot,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {String(item.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const CORNER = 18;

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    arena: {
      borderRadius: R(c) + 4,
      borderWidth: 1.5,
      borderColor: c.primaryDeep,
      backgroundColor: c.card,
      overflow: 'hidden',
      marginBottom: 14,
      elevation: 8,
      shadowColor: c.primary,
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 0 },
    },
    under: { ...StyleSheet.absoluteFill },
    // светлая полоса сверху — как свет над ареной
    shine: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 90,
      backgroundColor: c.primary,
      opacity: 0.05,
    },
    corner: {
      position: 'absolute',
      width: CORNER,
      height: CORNER,
      borderColor: c.primary,
    },
    tl: { top: 8, left: 8, borderTopWidth: 3, borderLeftWidth: 3 },
    tr: { top: 8, right: 8, borderTopWidth: 3, borderRightWidth: 3 },
    bl: { bottom: 8, left: 8, borderBottomWidth: 3, borderLeftWidth: 3 },
    br: { bottom: 8, right: 8, borderBottomWidth: 3, borderRightWidth: 3 },
    stats: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    stat: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: Math.min(R(c), 14),
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    statMain: { borderColor: c.primaryDeep, backgroundColor: c.primarySoft },
    statHot: { borderColor: c.dangerBorder, backgroundColor: c.dangerSoft },
    statLabel: {
      color: c.muted,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    statValue: { color: c.text, fontSize: 18, fontWeight: '900', marginTop: 2 },
    statValueMain: { color: c.primary, fontSize: 22 },
    statValueHot: { color: c.danger },
  });
