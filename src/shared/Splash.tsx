import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { APP_NAME, brandCut, MOTTO } from './config';
import { Text } from './i18n/Text';
import { Theme, useStyles, useTheme } from './theme';

// Заставка при входе: кольцо света расходится, логотип выпрыгивает,
// следом название и девиз, потом всё плавно исчезает. Около 2 секунд.
export function Splash({ onDone }: { onDone: () => void }) {
  const c = useTheme();
  const s = useStyles(makeStyles);
  const logo = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.parallel([
        Animated.spring(logo, {
          toValue: 1,
          friction: 5,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(ring, {
          toValue: 1,
          duration: 1100,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(words, {
          toValue: 1,
          duration: 500,
          delay: 350,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(450),
      Animated.timing(out, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
    ]);
    anim.start(() => onDone());
    return () => anim.stop();
  }, [logo, ring, words, out, onDone]);

  return (
    <Animated.View style={[s.root, { opacity: out }]}>
      <View style={s.center}>
        <Animated.View
          style={[
            s.ring,
            { borderColor: c.primary },
            {
              opacity: ring.interpolate({
                inputRange: [0, 0.2, 1],
                outputRange: [0, 0.9, 0],
              }),
              transform: [
                {
                  scale: ring.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.4, 2.4],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={{
            opacity: logo,
            transform: [
              {
                scale: logo.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 1],
                }),
              },
              {
                rotate: logo.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['-25deg', '0deg'],
                }),
              },
            ],
          }}
        >
          <Image source={require('./assets/logo.png')} style={s.logo} />
        </Animated.View>
      </View>
      <Animated.View
        style={{
          opacity: words,
          transform: [
            {
              translateY: words.interpolate({
                inputRange: [0, 1],
                outputRange: [24, 0],
              }),
            },
          ],
        }}
      >
        <Text style={s.brand}>
          {APP_NAME.slice(0, brandCut(APP_NAME)).toUpperCase()}
          <Text style={s.brandAccent}>{APP_NAME.slice(brandCut(APP_NAME)).toUpperCase()}</Text>
        </Text>
        <Text style={s.motto}>{MOTTO}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFill,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      elevation: 100,
    },
    center: {
      width: 160,
      height: 160,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    ring: {
      position: 'absolute',
      width: 160,
      height: 160,
      borderRadius: 80,
      borderWidth: 4,
    },
    logo: { width: 150, height: 150, borderRadius: 75 },
    brand: {
      color: c.text,
      fontSize: 44,
      fontWeight: '900',
      letterSpacing: 4,
      textAlign: 'center',
      textShadowColor: c.primary,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 18,
    },
    brandAccent: { color: c.primary },
    motto: {
      color: c.accent,
      fontSize: 15,
      fontWeight: '800',
      textAlign: 'center',
      marginTop: 6,
    },
  });
