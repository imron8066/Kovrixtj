import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Text } from '../i18n/Text';
import { useStore } from '../store';
import {
  CUSTOM_BG,
  CUSTOM_PRIMARY,
  R,
  Theme,
  useStyles,
  useTheme,
} from '../theme';
import { Btn, Card } from '../ui';

// «Свой стиль»: человек сам выбирает цвет кнопок, фон и свечение фона.
// Выбор лежит в Settings.custom поверх выбранного оформления.
export default function LookCard() {
  const s = useStyles(makeStyles);
  const c = useTheme();
  const { settings, setCustom } = useStore();
  const custom = settings.custom ?? {};

  const row = (
    title: string,
    colors: string[],
    value: string | undefined,
    pick: (color: string) => void,
  ) => (
    <>
      <Text style={s.label}>{title}</Text>
      <View style={s.swatches}>
        {colors.map(color => {
          const on = color === value;
          return (
            <Pressable
              key={color}
              testID={`look-${title}-${color}`}
              accessibilityLabel={color}
              onPress={() => pick(color)}
              style={[s.swatch, on && s.swatchOn]}
            >
              <View style={[s.dot, { backgroundColor: color }]} />
            </Pressable>
          );
        })}
      </View>
    </>
  );

  return (
    <Card>
      <Text style={s.title}>🎨 Свой стиль</Text>
      <Text style={s.hint}>
        Настройте приложение под себя — меняется сразу.
      </Text>
      {row(
        'Цвет кнопок',
        CUSTOM_PRIMARY,
        custom.primary ?? c.primary,
        primary => setCustom({ ...custom, primary }),
      )}
      {row('Фон', CUSTOM_BG, custom.bg ?? c.bg, bg =>
        setCustom({ ...custom, bg }),
      )}
      <View style={s.switchRow}>
        <Text style={s.switchText}>Свечение на фоне</Text>
        <Switch
          value={custom.glow !== false}
          onValueChange={glow => setCustom({ ...custom, glow })}
          trackColor={{ true: c.primary, false: c.border }}
          thumbColor="#ffffff"
        />
      </View>
      {!!settings.custom && (
        <Btn
          title="Вернуть как было"
          variant="outline"
          small
          onPress={() => setCustom(null)}
        />
      )}
    </Card>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    title: { color: c.text, fontSize: 17, fontWeight: '900' },
    hint: { color: c.muted, fontSize: 13, marginTop: 2, marginBottom: 12 },
    label: {
      color: c.muted,
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 8,
    },
    swatches: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 14,
    },
    swatch: {
      width: 40,
      height: 40,
      borderRadius: R(c),
      borderWidth: 2,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchOn: { borderColor: c.text },
    dot: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: c.border,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    switchText: { color: c.text, fontSize: 15, fontWeight: '700' },
  });
