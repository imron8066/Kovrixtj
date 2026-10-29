import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useStore } from './store';
import { CustomLook } from './types';

export interface Theme {
  dark: boolean;
  bg: string;
  card: string;
  text: string;
  textSoft: string;
  muted: string;
  border: string;
  inputBorder: string;
  placeholder: string;
  subtle: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  onPrimaryMuted: string;
  accent: string;
  green: string;
  greenSoft: string;
  danger: string;
  dangerSoft: string;
  dangerBorder: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  // объём: нижняя грань кнопок и карточек, блик сверху
  primaryDeep: string;
  ledge: string;
  shine: string;
  // цветные пятна фона
  glow: [string, string];
  // свечение фона выключено в «Своём стиле»
  noGlow?: boolean;
  // форма: скругление карточек и кнопок (без них — 22 и таблетка),
  // сетка на фоне и кнопки заглавными буквами — у «Кибера»
  radius?: number;
  pill?: number;
  grid?: boolean;
  caps?: boolean;
}

// скругления с запасными значениями для старых стилей
export const R = (c: Theme) => c.radius ?? 22;
export const P = (c: Theme) => c.pill ?? 999;

export type ThemeKey =
  | 'cyber'
  | 'fire'
  | 'royal'
  | 'neon'
  | 'command'
  | 'dark'
  | 'system'
  | 'light'
  | 'green'
  | 'red';

// Основной стиль с версии 3.2 — «Кибер»: чёрный с фиолетовым отливом,
// кислотный лайм как у нового логотипа (scripts/brand.swift), фиолетовые
// акценты, плоские карточки и кнопки-таблетки
const cyber: Theme = {
  dark: true,
  bg: '#07070c',
  card: '#12121c',
  text: '#f5f6ff',
  textSoft: '#d4d6ea',
  muted: '#8a8ca8',
  border: '#23233a',
  inputBorder: '#33334f',
  placeholder: '#5b5d78',
  subtle: '#0c0c14',
  primary: '#b6ff2e',
  primarySoft: '#1a2410',
  onPrimary: '#0b1000',
  onPrimaryMuted: '#dcff9a',
  accent: '#a66bff',
  green: '#2fe39a',
  greenSoft: '#0d2a20',
  danger: '#ff4d6a',
  dangerSoft: '#2b0e17',
  dangerBorder: '#5e1a2c',
  warning: '#ffc94d',
  warningSoft: '#30260b',
  info: '#7aa2ff',
  infoSoft: '#141f3d',
  primaryDeep: '#5f9a00',
  ledge: '#23233a',
  shine: 'rgba(255,255,255,0.06)',
  glow: ['#7c3aed', '#b6ff2e'],
  radius: 16,
  pill: 14,
  grid: true,
  caps: true,
};

// Стиль версии 3.1 после обновления — «Огонь»: почти чёрный фон, огненно-
// оранжевый, как у Free Fire, плоские карточки с тонкой рамкой, кнопки-
// таблетки без ступенек
const fire: Theme = {
  dark: true,
  bg: '#08080a',
  card: '#141418',
  text: '#ffffff',
  textSoft: '#d6d6de',
  muted: '#8b8b98',
  border: '#24242c',
  inputBorder: '#32323c',
  placeholder: '#5f5f6c',
  subtle: '#0f0f13',
  primary: '#ff6a2b',
  primarySoft: '#26150e',
  onPrimary: '#190800',
  onPrimaryMuted: '#ffb592',
  accent: '#ffb23f',
  green: '#2fd68c',
  greenSoft: '#0e2a1e',
  danger: '#ff4d67',
  dangerSoft: '#2b0e15',
  dangerBorder: '#5e1a28',
  warning: '#ffc247',
  warningSoft: '#30240b',
  info: '#5aa8ff',
  infoSoft: '#0f2036',
  primaryDeep: '#c2410c',
  ledge: '#24242c',
  shine: 'rgba(255,255,255,0.06)',
  glow: ['#ff6a2b', '#ff2d55'],
};

// Стиль версии 3.1 — «Королевский»: чёрно-фиолетовый фон,
// золото и сиреневый неон, карточки плоские, объём — только у кнопок
const royal: Theme = {
  dark: true,
  bg: '#0b0614',
  card: '#181026',
  text: '#fbf7ff',
  textSoft: '#ddd2ee',
  muted: '#9c8db8',
  border: '#2f2348',
  inputBorder: '#47366c',
  placeholder: '#6d5e8a',
  subtle: '#120b1f',
  primary: '#ffc533',
  primarySoft: '#2a1a46',
  onPrimary: '#1f1400',
  onPrimaryMuted: '#ffe08a',
  accent: '#d8a6ff',
  green: '#34d399',
  greenSoft: '#0f3a2c',
  danger: '#fb7185',
  dangerSoft: '#3b1022',
  dangerBorder: '#8f1d3f',
  warning: '#fbbf24',
  warningSoft: '#3a2a0c',
  info: '#a78bfa',
  infoSoft: '#2a1d55',
  primaryDeep: '#c47f00',
  ledge: '#2f2348',
  shine: 'rgba(255,255,255,0.12)',
  glow: ['#9333ea', '#f59e0b'],
};

// Прежний основной стиль — ночной синий с золотыми объёмными кнопками,
// как на сайте (web/shared/style.css)
const neon: Theme = {
  dark: true,
  bg: '#070a18',
  card: '#111735',
  text: '#f4f6ff',
  textSoft: '#cdd3ee',
  muted: '#8990b5',
  border: '#263066',
  inputBorder: '#34407f',
  placeholder: '#5f678f',
  subtle: '#0c1129',
  primary: '#ffb81f',
  primarySoft: '#1c2554',
  onPrimary: '#1d1300',
  onPrimaryMuted: '#ffd77a',
  accent: '#2de2ff',
  green: '#3ee6a0',
  greenSoft: '#0e3a30',
  danger: '#ff6b7d',
  dangerSoft: '#3d1526',
  dangerBorder: '#8a2440',
  warning: '#ffc94d',
  warningSoft: '#3a2f0f',
  info: '#6fa8ff',
  infoSoft: '#152a5c',
  primaryDeep: '#b87400',
  ledge: '#060919',
  shine: 'rgba(255,255,255,0.14)',
  glow: ['#3d2bff', '#00c2ff'],
};

// Стиль KovriX A: графит и ледяной голубой — чтобы приложение команды
// с первого взгляда отличалось от приложения клиента
const command: Theme = {
  dark: true,
  bg: '#090b0f',
  card: '#151920',
  text: '#f2f6fa',
  textSoft: '#c7d0db',
  muted: '#8693a3',
  border: '#28303c',
  inputBorder: '#3a4554',
  placeholder: '#5d6978',
  subtle: '#0e1116',
  primary: '#35c8ff',
  primarySoft: '#12303f',
  onPrimary: '#04141c',
  onPrimaryMuted: '#9fe3ff',
  accent: '#ffb81f',
  green: '#3ee6a0',
  greenSoft: '#0e3a30',
  danger: '#ff5d6e',
  dangerSoft: '#3a151c',
  dangerBorder: '#8a2436',
  warning: '#ffc94d',
  warningSoft: '#3a2f0f',
  info: '#7db4ff',
  infoSoft: '#16283f',
  primaryDeep: '#0b7fae',
  ledge: '#040507',
  shine: 'rgba(255,255,255,0.12)',
  glow: ['#0b7fae', '#ff3d57'],
};

const dark: Theme = {
  dark: true,
  bg: '#0d0f16',
  card: '#171a25',
  text: '#eef0f7',
  textSoft: '#c9cee0',
  muted: '#8d93a8',
  border: '#2a2f42',
  inputBorder: '#3a405a',
  placeholder: '#666d85',
  subtle: '#1f2332',
  primary: '#7c5cff',
  primarySoft: '#2a2452',
  onPrimary: '#ffffff',
  onPrimaryMuted: '#b9a8ff',
  accent: '#22d3ee',
  green: '#34d399',
  greenSoft: '#12382d',
  danger: '#f87171',
  dangerSoft: '#3f1d1d',
  dangerBorder: '#7f1d1d',
  warning: '#fbbf24',
  warningSoft: '#3d3110',
  info: '#60a5fa',
  infoSoft: '#172f4f',
  primaryDeep: '#4a32b8',
  ledge: '#07080d',
  shine: 'rgba(255,255,255,0.12)',
  glow: ['#7c5cff', '#22d3ee'],
};

const light: Theme = {
  dark: false,
  bg: '#f4f5fb',
  card: '#ffffff',
  text: '#111827',
  textSoft: '#374151',
  muted: '#6b7280',
  border: '#e5e7eb',
  inputBorder: '#d1d5db',
  placeholder: '#9ca3af',
  subtle: '#f3f4f6',
  primary: '#6d4aff',
  primarySoft: '#ebe6ff',
  onPrimary: '#ffffff',
  onPrimaryMuted: '#ebe6ff',
  accent: '#0891b2',
  green: '#15803d',
  greenSoft: '#dcfce7',
  danger: '#dc2626',
  dangerSoft: '#fef2f2',
  dangerBorder: '#fecaca',
  warning: '#b45309',
  warningSoft: '#fef3c7',
  info: '#1d4ed8',
  infoSoft: '#dbeafe',
  primaryDeep: '#4326c9',
  ledge: '#c9cde0',
  shine: 'rgba(255,255,255,0.7)',
  glow: ['#b9a8ff', '#7dd3fc'],
};

const green: Theme = {
  ...dark,
  bg: '#0b1210',
  card: '#13201b',
  subtle: '#1a2c25',
  border: '#24392f',
  inputBorder: '#335143',
  primary: '#10b981',
  primarySoft: '#123d30',
  onPrimaryMuted: '#a7f3d0',
  accent: '#a3e635',
  primaryDeep: '#07704d',
  ledge: '#050908',
  glow: ['#10b981', '#a3e635'],
};

const red: Theme = {
  ...dark,
  bg: '#120c0d',
  card: '#201416',
  subtle: '#2c1b1e',
  border: '#3d2428',
  inputBorder: '#573238',
  primary: '#ef4444',
  primarySoft: '#451a1e',
  onPrimaryMuted: '#fecaca',
  accent: '#fb923c',
  primaryDeep: '#9b1c1c',
  ledge: '#090506',
  glow: ['#ef4444', '#fb923c'],
};

export const THEMES: { key: ThemeKey; name: string; theme?: Theme }[] = [
  { key: 'cyber', name: 'Кибер', theme: cyber },
  { key: 'fire', name: 'Огонь', theme: fire },
  { key: 'royal', name: 'Королевский', theme: royal },
  { key: 'neon', name: 'Ночной неон', theme: neon },
  { key: 'command', name: 'Командный', theme: command },
  { key: 'dark', name: 'Фиолетовый', theme: dark },
  { key: 'system', name: 'Как в телефоне' },
  { key: 'light', name: 'Светлый', theme: light },
  { key: 'green', name: 'Зелёный', theme: green },
  { key: 'red', name: 'Красный', theme: red },
];

// цвета для «Своего стиля» (Профиль → Свой стиль)
export const CUSTOM_PRIMARY = [
  '#b6ff2e',
  '#ff6a2b',
  '#ffc533',
  '#ff3b5c',
  '#ff4fd8',
  '#a970ff',
  '#4f7bff',
  '#22c7f0',
  '#20d6a0',
  '#7bdc3b',
  '#ffffff',
];
export const CUSTOM_BG = [
  '#07070c',
  '#08080a',
  '#0b0f1f',
  '#120a1f',
  '#071410',
  '#1a0b0b',
  '#16181d',
  '#f4f5fb',
];

// смесь двух цветов #rrggbb: part — доля второго
const mix = (a: string, b: string, part: number) => {
  const ch = (hex: string, i: number) =>
    parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return (
    '#' +
    [0, 1, 2]
      .map(i =>
        Math.round(ch(a, i) * (1 - part) + ch(b, i) * part)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
};
const bright = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

// оформление с цветом кнопок и фоном, которые человек выбрал сам
export function applyCustom(base: Theme, custom?: CustomLook): Theme {
  if (!custom) {
    return base;
  }
  let c = base;
  if (custom.bg) {
    const isDark = bright(custom.bg) < 0.5;
    const toward = isDark ? '#ffffff' : '#000000';
    c = {
      ...(isDark ? c : light),
      primary: c.primary,
      primaryDeep: c.primaryDeep,
      onPrimary: c.onPrimary,
      onPrimaryMuted: c.onPrimaryMuted,
      glow: c.glow,
      bg: custom.bg,
      subtle: mix(custom.bg, toward, 0.03),
      card: isDark ? mix(custom.bg, toward, 0.06) : '#ffffff',
      border: mix(custom.bg, toward, isDark ? 0.13 : 0.1),
      inputBorder: mix(custom.bg, toward, isDark ? 0.19 : 0.16),
      ledge: mix(custom.bg, toward, 0.13),
      primarySoft: mix(custom.bg, c.primary, isDark ? 0.16 : 0.14),
    };
  }
  if (custom.primary) {
    const p = custom.primary;
    c = {
      ...c,
      primary: p,
      primarySoft: mix(c.bg, p, c.dark ? 0.16 : 0.14),
      primaryDeep: mix(p, '#000000', 0.35),
      onPrimary: bright(p) > 0.55 ? '#141414' : '#ffffff',
      onPrimaryMuted: mix(p, '#ffffff', 0.5),
      glow: [p, c.glow[1]],
    };
  }
  return custom.glow === false ? { ...c, noGlow: true } : c;
}

export function resolveTheme(
  key: string,
  scheme: string | null | undefined,
  custom?: CustomLook,
) {
  const base =
    key === 'system'
      ? scheme === 'light'
        ? light
        : cyber
      : THEMES.find(t => t.key === key)?.theme ?? cyber;
  return applyCustom(base, custom);
}

export function useTheme(): Theme {
  const { settings } = useStore();
  const scheme = useColorScheme();
  // новый объект — только когда меняются настройки вида, иначе useStyles
  // пересоздавал бы стили на каждом кадре
  return useMemo(
    () => resolveTheme(settings.theme, scheme, settings.custom),
    [settings.theme, scheme, settings.custom],
  );
}

// factory должна быть объявлена вне компонента, чтобы стили
// пересоздавались только при смене темы
export function useStyles<T>(factory: (c: Theme) => T): T {
  const c = useTheme();
  return useMemo(() => factory(c), [c, factory]);
}
