import React, { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  ToastAndroid,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { t } from './i18n';
import { Text } from './i18n/Text';
import {
  ImagePickerResponse,
  launchCamera,
  launchImageLibrary,
} from 'react-native-image-picker';
import { useCover } from './covers';
import { platform } from './platform';
import { showAlert } from './platform/alert';
import { P, R, Theme, useStyles, useTheme } from './theme';
import { FieldDef, Game } from './types';

// Фото сжимаются и уходят в облако вместе с заказом (base64), поэтому
// не пропадают, даже если оригинал удалили из галереи.
const PICK_OPTIONS = {
  mediaType: 'photo' as const,
  includeBase64: true,
  maxWidth: 1000,
  maxHeight: 1000,
  quality: 0.6 as const,
};

function toPhotos(res: ImagePickerResponse): string[] {
  if (res.didCancel) {
    return [];
  }
  if (res.errorCode) {
    const message =
      res.errorCode === 'camera_unavailable'
        ? 'Камера недоступна. Выберите фото из галереи.'
        : res.errorCode === 'permission'
        ? 'Нет доступа. Разрешите доступ к фото и камере в настройках телефона.'
        : res.errorMessage || 'Не удалось получить фото.';
    showAlert('Фото не добавлено', message);
    return [];
  }
  return (res.assets ?? [])
    .filter(a => a.base64)
    .map(a => `data:${a.type ?? 'image/jpeg'};base64,${a.base64}`);
}

async function pickPhotos(source: 'gallery' | 'camera', limit: number) {
  try {
    const res =
      source === 'camera'
        ? await launchCamera({ ...PICK_OPTIONS, saveToPhotos: false })
        : await launchImageLibrary({ ...PICK_OPTIONS, selectionLimit: limit });
    return toPhotos(res);
  } catch (e) {
    showAlert(
      'Фото не добавлено',
      'Не удалось открыть ' +
        (source === 'camera' ? 'камеру' : 'галерею') +
        '. ' +
        (e instanceof Error ? e.message : ''),
    );
    return [];
  }
}

interface BtnProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'danger' | 'soft';
  small?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Btn({
  title,
  onPress,
  variant = 'primary',
  small,
  disabled,
  style,
  testID,
}: BtnProps) {
  const c = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      // Android не перерисовывает надпись, когда у кнопки меняется рамка
      // (вид «Вход / Регистрация»), — при смене вида кнопка создаётся заново
      key={variant}
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      // Android — волна Material, остальные — затемнение при нажатии
      android_ripple={
        platform.ripple
          ? {
              color: variant === 'primary' ? c.onPrimaryMuted : c.primarySoft,
            }
          : undefined
      }
      // кнопка-таблетка: при нажатии чуть сжимается
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        variant === 'primary' && styles.btnPrimary,
        variant === 'outline' && styles.btnOutline,
        variant === 'danger' && styles.btnDanger,
        variant === 'soft' && styles.btnSoft,
        disabled && styles.btnDisabled,
        pressed && styles.btnPressed,
        style,
      ]}
    >
      <Text
        style={[
          styles.btnText,
          small && styles.btnTextSmall,
          (variant === 'outline' || variant === 'soft') && styles.btnTextDark,
          variant === 'danger' && styles.btnTextDanger,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const c = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.field}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        placeholderTextColor={c.placeholder}
        {...props}
        placeholder={props.placeholder && t(props.placeholder)}
        style={[
          styles.input,
          props.multiline && styles.inputMulti,
          props.style,
        ]}
        textAlignVertical={props.multiline ? 'top' : 'center'}
      />
    </View>
  );
}

// Выбор одного готового ответа (игра, платформа, тема…).
// Пока ничего не выбрано, рядом с названием горит знак «● выберите».
export function Select({
  label,
  options,
  value,
  onChange,
  required,
  render,
}: {
  label: string;
  options: string[];
  value?: string;
  onChange: (value: string) => void;
  required?: boolean;
  render?: (option: string) => string;
}) {
  const styles = useStyles(makeStyles);
  // плитки во всю ширину: до трёх вариантов — в один ряд, больше — по два
  const basis = options.length <= 3 ? `${100 / options.length - 2}%` : '48.5%';
  return (
    <View style={styles.field}>
      <View style={styles.row}>
        <Text style={styles.label}>
          {label}
          {required ? ' *' : ''}
        </Text>
        {required && !value && <Text style={styles.mark}> ● выберите</Text>}
      </View>
      <View style={styles.options}>
        {options.map(option => {
          const on = option === value;
          return (
            <TouchableOpacity
              key={option}
              testID={`option-${label}-${option}`}
              activeOpacity={0.8}
              onPress={() => onChange(option)}
              style={[
                styles.option,
                { flexBasis: basis },
                on && styles.optionOn,
              ]}
            >
              <Text
                style={[styles.optionText, on && styles.optionTextOn]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {render ? render(option) : option}
              </Text>
              {/* в узком ряду из трёх галочка не влезает — хватает рамки */}
              {on && options.length > 3 && (
                <Text style={styles.optionCheck}>✓</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Поля игры: данные заказа или характеристики аккаунта.
// У каждой игры они свои (src/shared/games.ts).
export function GameFields({
  defs,
  values,
  onChange,
}: {
  defs: FieldDef[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  return (
    <>
      {defs.map(def =>
        def.options ? (
          <Select
            key={def.key}
            label={def.label}
            options={def.options}
            value={values[def.key]}
            required={def.required}
            onChange={value => onChange({ ...values, [def.key]: value })}
          />
        ) : (
          <Field
            key={def.key}
            testID={`field-${def.key}`}
            label={def.label + (def.required ? ' *' : '')}
            value={values[def.key] ?? ''}
            onChangeText={value => onChange({ ...values, [def.key]: value })}
            placeholder={def.placeholder}
            maxLength={200}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={
              def.inputmode === 'numeric'
                ? 'number-pad'
                : def.inputmode === 'decimal'
                ? 'decimal-pad'
                : 'default'
            }
          />
        ),
      )}
    </>
  );
}

export function PhotoPicker({
  photos,
  onChange,
  max = 5,
  label = 'Фото',
}: {
  photos: string[];
  onChange: (photos: string[]) => void;
  max?: number;
  label?: string;
}) {
  const styles = useStyles(makeStyles);
  const left = max - photos.length;

  const add = async (source: 'gallery' | 'camera') => {
    if (left <= 0) {
      showAlert(
        'Слишком много фото',
        max === 1
          ? 'Сначала уберите выбранное фото — нажмите × на нём.'
          : `Можно добавить не больше ${max}.`,
      );
      return;
    }
    const picked = await pickPhotos(source, left);
    if (picked.length) {
      onChange([...photos, ...picked].slice(0, max));
    }
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label} ({photos.length}/{max})
      </Text>
      <View style={styles.row}>
        <Btn
          testID="add-photo-button"
          title="🖼  Из галереи"
          variant="soft"
          small
          onPress={() => add('gallery')}
          style={styles.flex}
        />
        <View style={styles.gap} />
        <Btn
          title="📷  Камера"
          variant="soft"
          small
          onPress={() => add('camera')}
          style={styles.flex}
        />
      </View>
      {photos.length > 0 && (
        <View style={styles.thumbs}>
          {photos.map((uri, i) => (
            <View key={`${i}-${uri.length}`}>
              <Image source={{ uri }} style={styles.thumb} />
              <TouchableOpacity
                style={styles.remove}
                hitSlop={8}
                onPress={() => onChange(photos.filter((_, j) => j !== i))}
              >
                <Text style={styles.removeText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// Лента фото: нажатие открывает фото на весь экран
export function PhotoStrip({
  photos,
  size = 84,
}: {
  photos: string[];
  size?: number;
}) {
  const styles = useStyles(makeStyles);
  const [open, setOpen] = useState<string | null>(null);
  if (!photos.length) {
    return null;
  }
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {photos.map((uri, i) => (
          <Pressable key={`${i}-${uri.length}`} onPress={() => setOpen(uri)}>
            <Image
              source={{ uri }}
              style={[styles.stripImg, { width: size, height: size }]}
            />
          </Pressable>
        ))}
      </ScrollView>
      <Modal
        visible={!!open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(null)}
      >
        <Pressable style={styles.viewer} onPress={() => setOpen(null)}>
          {open && (
            <Image
              source={{ uri: open }}
              style={styles.viewerImg}
              resizeMode="contain"
            />
          )}
          <Text style={styles.viewerHint}>Нажмите, чтобы закрыть</Text>
        </Pressable>
      </Modal>
    </>
  );
}

// Плитка игры. wide — большая 16:9, как превью на YouTube (списки игр доната и продажи),
// иначе — широкая шапка экрана. caption — подпись вместо способа доната,
// badge — метка в углу, например «−10%».
export function GameBanner({
  game,
  onPress,
  style,
  caption,
  wide,
  badge,
}: {
  game: Game;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  caption?: string;
  // плитка 16:9, как превью на YouTube
  wide?: boolean;
  badge?: string;
}) {
  const styles = useStyles(makeStyles);
  const [c1, c2] = game.colors;
  const cover = useCover(game.id);
  const open = game.off
    ? () =>
        showAlert(
          'Пока не работает',
          `${game.name} скоро заработает. Сейчас доступен Free Fire.`,
        )
    : onPress;
  return (
    <Pressable
      testID={`game-${game.id}`}
      accessibilityLabel={game.name}
      disabled={!onPress}
      onPress={open}
      style={({ pressed }) => [
        styles.banner,
        wide && styles.bannerWide,
        { backgroundColor: c2, borderColor: c1, borderBottomColor: c1 },
        // фото — ровно 16:9 на всю плитку: без рамки и ступеньки снизу
        !!cover && styles.bannerCoverTile,
        pressed && (cover ? styles.bannerCoverPressed : styles.bannerPressed),
        game.off && styles.bannerOff,
        style,
      ]}
    >
      {cover ? (
        <>
          <View style={styles.bannerCover}>
            <Image source={cover} style={styles.fill} resizeMode="cover" />
          </View>
          {/* тень снизу, чтобы название читалось на любой картинке */}
          <View style={styles.bannerCoverShade} />
        </>
      ) : (
        <>
          <View style={[styles.bannerGlow, { backgroundColor: c1 }]} />
          <View style={[styles.bannerGlowSmall, { backgroundColor: c1 }]} />
          <View style={styles.bannerShine} />
          <Text
            style={[styles.bannerTag, wide && styles.bannerTagWide]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {game.tag}
          </Text>
        </>
      )}
      {game.off ? (
        <View style={[styles.bannerBadge, styles.bannerBadgeOff]}>
          <Text style={styles.bannerBadgeText}>Не работает</Text>
        </View>
      ) : (
        !!badge && (
          <View style={styles.bannerBadge}>
            <Text style={styles.bannerBadgeText}>{badge}</Text>
          </View>
        )
      )}
      {/* на обложке название игры уже нарисовано */}
      {!cover && (
        <Text
          style={[styles.bannerName, wide && styles.bannerNameWide]}
          numberOfLines={2}
        >
          {game.name}
        </Text>
      )}
      <Text
        style={[styles.bannerMethod, wide && styles.bannerMethodWide]}
        numberOfLines={1}
      >
        {caption ?? game.method}
      </Text>
    </Pressable>
  );
}

// загруженные фото витрины — чтобы не качать их заново при возврате
const photoCache = new Map<string, string>();

// Фото объявления по одному: стрелки листают, точки показывают, какое
// открыто. Фото подгружается, когда до него долистали.
export function Carousel({
  id,
  count,
  load,
  height = 200,
}: {
  id: string;
  count: number;
  load: (index: number) => Promise<string | null>;
  height?: number;
}) {
  const styles = useStyles(makeStyles);
  const [index, setIndex] = useState(0);
  const [, redraw] = useState(0);
  const [open, setOpen] = useState(false);
  const key = `${id}/${index}`;
  const uri = photoCache.get(key);

  useEffect(() => {
    let alive = true;
    if (count > 0 && !photoCache.has(key)) {
      load(index)
        .then(photo => {
          photoCache.set(key, photo ?? '');
          if (alive) {
            redraw(n => n + 1);
          }
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [key, count, index, load]);

  const turn = (step: number) => setIndex((index + step + count) % count);

  return (
    <View style={[styles.carousel, { height }]}>
      {uri ? (
        <Pressable style={styles.fill} onPress={() => setOpen(true)}>
          <Image source={{ uri }} style={styles.fill} resizeMode="cover" />
        </Pressable>
      ) : (
        <Text style={styles.carouselEmpty}>
          {count === 0 || uri === '' ? 'Нет фото' : 'Загрузка фото…'}
        </Text>
      )}
      {count > 1 && (
        <>
          <TouchableOpacity
            style={[styles.arrow, styles.arrowLeft]}
            hitSlop={10}
            onPress={() => turn(-1)}
          >
            <Text style={styles.arrowText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID={`next-photo-${id}`}
            style={[styles.arrow, styles.arrowRight]}
            hitSlop={10}
            onPress={() => turn(1)}
          >
            <Text style={styles.arrowText}>›</Text>
          </TouchableOpacity>
          <View style={styles.dots} pointerEvents="none">
            {Array.from({ length: count }, (_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
            ))}
          </View>
        </>
      )}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.viewer} onPress={() => setOpen(false)}>
          {!!uri && (
            <Image
              source={{ uri }}
              style={styles.viewerImg}
              resizeMode="contain"
            />
          )}
          <Text style={styles.viewerHint}>Нажмите, чтобы закрыть</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

// Переключатель: «Новые / Все», разделы админа, период топа
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: [T, string][];
  value: T;
  onChange: (value: T) => void;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.chips}>
      {options.map(([key, label]) => (
        <TouchableOpacity
          key={key}
          testID={`chip-${key}`}
          style={[styles.chip, value === key && styles.chipOn]}
          onPress={() => onChange(key)}
        >
          <Text style={[styles.chipText, value === key && styles.chipTextOn]}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Строка-ссылка: значок, название, пояснение и стрелка
export function Row({
  icon,
  title,
  text,
  onPress,
  mark,
  testID,
}: {
  icon: string;
  title: string;
  text?: string;
  onPress: () => void;
  // красная точка — есть непрочитанное
  mark?: boolean;
  testID?: string;
}) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        styles.rowCard,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.rowIconBox}>
        <Text style={styles.rowIcon}>{icon}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!text && (
          <Text style={styles.rowText} numberOfLines={2}>
            {text}
          </Text>
        )}
      </View>
      {mark ? <View style={styles.rowMark} /> : null}
      <Text style={styles.rowArrow}>›</Text>
    </Pressable>
  );
}

// Фон всех экранов: цветные пятна света поверх тёмной подложки
export function Backdrop() {
  const c = useTheme();
  const styles = useStyles(makeStyles);
  const spot = (color: string, size: number, opacity: number) => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    // круги разного размера с общим центром дают мягкое свечение
    left: -size / 2,
    top: -size / 2,
    backgroundColor: color,
    opacity,
  });
  if (c.noGlow) {
    return null;
  }
  return (
    <View style={styles.backdrop} pointerEvents="none">
      {c.grid && <Grid color={c.border} />}
      <View style={styles.spotA}>
        {[420, 300, 190].map(size => (
          <View
            key={size}
            style={[styles.spot, spot(c.glow[0], size, c.dark ? 0.07 : 0.16)]}
          />
        ))}
      </View>
      <View style={styles.spotB}>
        {[380, 260, 150].map(size => (
          <View
            key={size}
            style={[styles.spot, spot(c.glow[1], size, c.dark ? 0.06 : 0.14)]}
          />
        ))}
      </View>
    </View>
  );
}

// тонкая сетка «экрана» под свечением — у стиля «Кибер», как на логотипе
const GRID_STEP = 34;
const GRID_LINES = Array.from({ length: 40 }, (_, i) => i * GRID_STEP);
export function Grid({ color }: { color: string }) {
  const styles = useStyles(makeStyles);
  const tint = { backgroundColor: color };
  return (
    <>
      {GRID_LINES.map(x => (
        <View key={`v${x}`} style={[styles.gridV, tint, { left: x }]} />
      ))}
      {GRID_LINES.map(y => (
        <View key={`h${y}`} style={[styles.gridH, tint, { top: y }]} />
      ))}
    </>
  );
}

export function Badge({
  text,
  tone,
}: {
  text: string;
  tone: 'warning' | 'info' | 'ok' | 'danger';
}) {
  const c = useTheme();
  const styles = useStyles(makeStyles);
  const colors = {
    warning: [c.warningSoft, c.warning],
    info: [c.infoSoft, c.info],
    ok: [c.greenSoft, c.green],
    danger: [c.dangerSoft, c.danger],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors[0] }]}>
      <Text style={[styles.badgeText, { color: colors[1] }]}>{text}</Text>
    </View>
  );
}

// Строки «название — значение»: данные заказа, характеристики аккаунта
// Clipboard ещё живёт в ядре React Native; прямой путь — без предупреждения
// «вынесен из ядра» и без новой библиотеки (типов у этого пути нет)
const Clipboard: { setString: (text: string) => void } =
  require('react-native/Libraries/Components/Clipboard/Clipboard').default;

// copy — значения крупные и копируются нажатием (ID игрока, телефон)
export function Pairs({
  pairs,
  copy,
}: {
  pairs: [string, string][];
  copy?: boolean;
}) {
  const styles = useStyles(makeStyles);
  const copyValue = (key: string, value: string) => {
    Clipboard.setString(value);
    if (Platform.OS === 'android') {
      ToastAndroid.show(`${key} скопирован: ${value}`, ToastAndroid.SHORT);
    } else {
      showAlert('Скопировано', `${key}: ${value}`);
    }
  };
  return (
    <View>
      {pairs.map(([key, value]) =>
        copy && value ? (
          <Pressable
            key={key}
            style={styles.copyPair}
            onPress={() => copyValue(key, value)}
          >
            <Text style={styles.pairKey}>{key}</Text>
            <Text style={styles.copyValue}>{value}</Text>
            <Text style={styles.copyHint}>📋</Text>
          </Pressable>
        ) : (
          <View key={key} style={styles.pair}>
            <Text style={styles.pairKey}>{key}</Text>
            <Text style={styles.pairValue} selectable>
              {value}
            </Text>
          </View>
        ),
      )}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles(makeStyles);
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Empty({ icon, text }: { icon: string; text: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    row: { flexDirection: 'row', alignItems: 'center' },
    gap: { width: 8 },
    btn: {
      minHeight: 52,
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderRadius: P(c),
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    btnSmall: { minHeight: 40, paddingVertical: 9, paddingHorizontal: 14 },
    btnPressed: { transform: [{ scale: 0.97 }], opacity: 0.88 },
    // главная кнопка светится своим цветом
    btnPrimary: {
      backgroundColor: c.primary,
      elevation: 6,
      shadowColor: c.primary,
      shadowOpacity: 0.45,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    btnOutline: {
      borderWidth: 1.5,
      borderColor: c.inputBorder,
      backgroundColor: 'transparent',
    },
    btnDanger: {
      borderWidth: 1,
      borderColor: c.dangerBorder,
      backgroundColor: c.dangerSoft,
    },
    btnSoft: { backgroundColor: c.primarySoft },
    btnDisabled: { opacity: 0.45, elevation: 0, shadowOpacity: 0 },
    btnText: {
      color: c.onPrimary,
      fontWeight: '900',
      fontSize: c.caps ? 15 : 16,
      letterSpacing: c.caps ? 1 : 0.2,
      textTransform: c.caps ? 'uppercase' : 'none',
      textAlign: 'center',
      fontFamily: platform.fontFamily,
    },
    btnTextSmall: { fontSize: 14 },
    btnTextDark: { color: c.dark ? c.text : c.primary },
    btnTextDanger: { color: c.danger },
    field: { marginBottom: 14 },
    label: {
      fontSize: 13,
      fontWeight: '700',
      color: c.muted,
      marginBottom: 6,
      marginLeft: 4,
    },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Math.min(16, R(c)),
      paddingHorizontal: 14,
      paddingVertical: 13,
      backgroundColor: c.card,
      fontSize: 16,
      color: c.text,
    },
    inputMulti: { minHeight: 100 },
    thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    thumb: {
      width: 76,
      height: 76,
      borderRadius: 10,
      backgroundColor: c.border,
    },
    remove: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeText: {
      color: '#ffffff',
      fontSize: 16,
      lineHeight: 18,
      fontWeight: '700',
    },
    stripImg: {
      borderRadius: 10,
      marginRight: 8,
      backgroundColor: c.border,
    },
    viewer: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.92)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewerImg: { width: '100%', height: '80%' },
    viewerHint: { color: '#d1d5db', marginTop: 12 },
    mark: { fontSize: 12, color: c.warning, marginBottom: 6 },
    markDone: { color: c.green, fontWeight: '700' },
    options: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 8,
    },
    // вариант — плитка: выбранный в рамке цвета темы с галочкой
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: Math.min(R(c), 14),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    optionOn: {
      backgroundColor: c.primarySoft,
      borderColor: c.primary,
      borderWidth: 1.5,
    },
    optionText: {
      flexShrink: 1,
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
    },
    optionTextOn: { color: c.primary, fontWeight: '900' },
    optionCheck: {
      marginLeft: 8,
      color: c.primary,
      fontSize: 15,
      fontWeight: '900',
    },
    banner: {
      borderRadius: R(c),
      borderWidth: 1,
      padding: 14,
      minHeight: 124,
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    bannerWide: { aspectRatio: 16 / 9, minHeight: 0, padding: 18 },
    bannerPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
    bannerGlow: {
      position: 'absolute',
      right: -50,
      top: -50,
      width: 190,
      height: 190,
      borderRadius: 95,
      opacity: 0.28,
    },
    bannerGlowSmall: {
      position: 'absolute',
      right: -10,
      top: -10,
      width: 100,
      height: 100,
      borderRadius: 50,
      opacity: 0.32,
    },
    bannerShine: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: '38%',
      backgroundColor: 'rgba(255,255,255,0.07)',
    },
    bannerTag: {
      position: 'absolute',
      right: 12,
      left: 12,
      top: 6,
      textAlign: 'right',
      fontSize: 44,
      fontWeight: '900',
      color: '#ffffff',
      opacity: 0.9,
      textShadowColor: 'rgba(0,0,0,0.55)',
      textShadowOffset: { width: 0, height: 4 },
      textShadowRadius: 1,
    },
    bannerTagWide: { fontSize: 76, top: 14, right: 18 },
    bannerBadge: {
      position: 'absolute',
      left: 10,
      top: 10,
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: c.primary,
    },
    bannerBadgeText: { color: c.onPrimary, fontWeight: '900', fontSize: 13 },
    bannerName: {
      color: '#ffffff',
      fontSize: 18,
      fontWeight: '900',
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 2,
    },
    bannerMethod: { color: '#ffffff', opacity: 0.85, fontSize: 13 },
    bannerNameWide: { fontSize: 26 },
    bannerCoverTile: { borderWidth: 0, borderRadius: R(c) },
    bannerCoverPressed: { transform: [{ scale: 0.98 }], opacity: 0.85 },
    bannerOff: { opacity: 0.55 },
    bannerBadgeOff: { backgroundColor: '#4a4a55' },
    // рамка под фото на всю плитку; само фото внутри — 100% × 100%
    bannerCover: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
    bannerCoverShade: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '34%',
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    bannerMethodWide: { fontSize: 15 },
    fill: { width: '100%', height: '100%' },
    carousel: {
      borderRadius: R(c) - 2,
      overflow: 'hidden',
      backgroundColor: c.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    carouselEmpty: { color: c.muted, fontSize: 14 },
    arrow: {
      position: 'absolute',
      top: '50%',
      marginTop: -19,
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    arrowLeft: { left: 8 },
    arrowRight: { right: 8 },
    arrowText: {
      color: '#ffffff',
      fontSize: 26,
      lineHeight: 28,
      fontWeight: '700',
    },
    dots: {
      position: 'absolute',
      bottom: 8,
      flexDirection: 'row',
      gap: 5,
      alignSelf: 'center',
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: 'rgba(255,255,255,0.45)',
    },
    dotOn: { backgroundColor: '#ffffff', width: 16 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: P(c),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    chipOn: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { color: c.textSoft, fontSize: 13, fontWeight: '700' },
    chipTextOn: { color: c.onPrimary, fontWeight: '800' },
    rowCard: { flexDirection: 'row', alignItems: 'center' },
    rowPressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
    // значок строки — в круглой подложке
    rowIconBox: {
      width: 44,
      height: 44,
      borderRadius: c.radius ? 12 : 22,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    rowIcon: { fontSize: 22 },
    rowTitle: { color: c.text, fontSize: 16, fontWeight: '800' },
    rowText: { color: c.muted, fontSize: 13, marginTop: 2 },
    rowMark: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: c.danger,
      marginRight: 8,
    },
    rowArrow: { color: c.muted, fontSize: 26, marginLeft: 6 },
    backdrop: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
    // тёплое зарево сверху справа и слабое — снизу слева
    spotA: { position: 'absolute', top: -20, right: -40 },
    spotB: { position: 'absolute', bottom: 120, left: -30 },
    spot: { position: 'absolute' },
    gridV: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: StyleSheet.hairlineWidth,
      opacity: 0.35,
    },
    gridH: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: StyleSheet.hairlineWidth,
      opacity: 0.35,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 999,
      alignSelf: 'flex-start',
    },
    badgeText: { fontSize: 12, fontWeight: '700' },
    pair: { flexDirection: 'row', paddingVertical: 3 },
    pairKey: { width: '42%', color: c.muted, fontSize: 14, paddingRight: 8 },
    pairValue: { flex: 1, color: c.text, fontSize: 14 },
    copyPair: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginVertical: 4,
      borderRadius: 16,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
    },
    copyValue: {
      flex: 1,
      color: c.text,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    copyHint: { fontSize: 18, marginLeft: 8 },
    // плоская карточка с тонкой рамкой, без тени и ступеньки
    card: {
      backgroundColor: c.card,
      borderRadius: R(c),
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
    emptyIcon: { fontSize: 52, marginBottom: 10 },
    emptyText: { color: c.muted, fontSize: 15, textAlign: 'center' },
  });
