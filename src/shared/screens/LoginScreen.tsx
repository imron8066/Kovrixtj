import React, { useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../i18n/Text';
import { isId } from '../api';
import { brandCut, COUNTRIES, MOTTO } from '../config';
import { readable } from '../platform';
import { showAlert } from '../platform/alert';
import { Lang, LANGS } from '../i18n';
import { useStore } from '../store';
import { Theme, useStyles } from '../theme';
import { Btn, Card, Field, Select } from '../ui';
import { errorText, randomName } from '../utils';

// Без входа в приложение не попасть: ID клиента указан в каждом заказе.
// Аккаунт хранится в облаке — войти можно с любого телефона и с сайта.
// Номер собирается из кода страны и остальных цифр; вместо номера можно
// ввести ник — так входит админ — или ID из шести цифр.
export default function LoginScreen({
  name: brand,
  slogan,
  registration,
  onBack,
}: {
  name: string;
  slogan: string;
  registration: boolean;
  onBack?: () => void;
}) {
  const s = useStyles(makeStyles);
  const { login, register, settings, setLanguage } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [choosing, setChoosing] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);

  const registering = registration && mode === 'register';
  // буквы в поле — это ник, код страны к нему не нужен
  const nick = !registering && /[a-z]/i.test(phone);

  const submit = async () => {
    const typed = phone.replace(/[\s()-]/g, '');
    const id = !registering && isId(typed);
    const number = typed.startsWith('+')
      ? typed
      : country.dial + typed.replace(/^0+/, '');
    if (registering && name.trim().length < 2) {
      showAlert('Введите имя', 'Или нажмите 🎲 — приложение придумает ник.');
      return;
    }
    if (!nick && !id && !/^\+\d{9,15}$/.test(number)) {
      showAlert(
        'Проверьте номер',
        `Выберите страну и введите номер без кода, например ${country.dial} 900000000.`,
      );
      return;
    }
    if (password.length < 6) {
      showAlert('Короткий пароль', 'Пароль — минимум 6 символов.');
      return;
    }
    setBusy(true);
    try {
      if (registering) {
        const user = await register({
          name: name.trim(),
          phone: number,
          country: country.key,
          password,
          ref,
        });
        showAlert(
          'Добро пожаловать!',
          `Ваш ID в Kovrix: ${user.id}.\nПодтвердите номер в Telegram — кнопка в профиле: туда будут приходить сообщения о заказах.`,
        );
      } else {
        await login(nick || id ? typed : number, password);
      }
    } catch (e) {
      setBusy(false);
      showAlert('Не получилось', errorText(e));
    }
  };

  return (
    <ScrollView
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={readable}>
        <Image
          source={require('../assets/logo.png')}
          style={s.logo}
          accessibilityIgnoresInvertColors
        />
        <Text style={s.brand}>
          {brand.slice(0, brandCut(brand)).toUpperCase()}
          <Text style={s.brandAccent}>{brand.slice(brandCut(brand)).toUpperCase()}</Text>
        </Text>
        <Text style={s.motto}>{MOTTO}</Text>
        <Text style={s.slogan}>{slogan}</Text>

        <Card>
          {registration && (
            <View style={s.modes}>
              <Btn
                testID="mode-login"
                title="Вход"
                small
                variant={registering ? 'outline' : 'primary'}
                onPress={() => setMode('login')}
                style={s.flex}
              />
              <View style={s.gap} />
              <Btn
                testID="mode-register"
                title="Регистрация"
                small
                variant={registering ? 'primary' : 'outline'}
                onPress={() => setMode('register')}
                style={s.flex}
              />
            </View>
          )}
          {registering && (
            <View style={s.line}>
              <View style={s.flex}>
                <Field
                  testID="name-input"
                  label="Имя или ник"
                  value={name}
                  onChangeText={setName}
                  maxLength={40}
                  // телефон не должен «исправлять» имя
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="none"
                />
              </View>
              <Btn
                testID="random-name"
                title="🎲"
                variant="soft"
                onPress={() => setName(randomName())}
                style={s.dice}
              />
            </View>
          )}

          <Text style={s.label}>
            {registering ? 'Телефон' : 'ID, телефон, ник или почта'}
          </Text>
          <View style={s.line}>
            {!nick && (
              <TouchableOpacity
                testID="country-button"
                style={s.country}
                onPress={() => setChoosing(!choosing)}
              >
                <Text style={s.countryText}>
                  {country.flag} {country.dial} ▾
                </Text>
              </TouchableOpacity>
            )}
            <View style={s.flex}>
              <Field
                testID="phone-input"
                label=""
                value={phone}
                onChangeText={setPhone}
                placeholder={registering ? '900000000' : 'ID, номер или ник'}
                keyboardType={registering ? 'phone-pad' : 'default'}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={24}
              />
            </View>
          </View>
          {choosing && (
            <View style={s.countries}>
              {COUNTRIES.map(item => (
                <TouchableOpacity
                  key={item.key}
                  testID={`country-${item.key}`}
                  style={[s.option, item.key === country.key && s.optionOn]}
                  onPress={() => {
                    setCountry(item);
                    setChoosing(false);
                  }}
                >
                  <Text style={s.optionText}>
                    {item.flag} {item.name}
                  </Text>
                  <Text style={s.optionDial}>{item.dial}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {registering && (
            <Field
              testID="ref-input"
              label="ID друга, который пригласил (если есть)"
              value={ref}
              onChangeText={text => setRef(text.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="6 цифр"
              maxLength={6}
            />
          )}
          <Field
            testID="password-input"
            label={
              registering ? 'Пароль (минимум 6 символов)' : 'Пароль или код'
            }
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            maxLength={100}
            onSubmitEditing={submit}
          />
          <Btn
            testID="submit-button"
            title={
              busy ? 'Подождите…' : registering ? 'Зарегистрироваться' : 'Войти'
            }
            disabled={busy}
            onPress={submit}
          />
        </Card>
        <Card>
          <Select
            label="Язык / Забон / Language"
            options={LANGS.map(l => l.key)}
            render={key => LANGS.find(l => l.key === key)!.name}
            value={settings.lang ?? 'ru'}
            onChange={key => setLanguage(key as Lang)}
          />
        </Card>
        {onBack && (
          <Btn
            title="← Вернуться в аккаунт"
            variant="outline"
            onPress={onBack}
          />
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 16, paddingTop: 24 },
    flex: { flex: 1 },
    gap: { width: 8 },
    logo: {
      width: 132,
      height: 132,
      alignSelf: 'center',
      marginBottom: 10,
    },
    brand: {
      fontSize: 48,
      fontWeight: '900',
      letterSpacing: 3,
      color: c.text,
      textAlign: 'center',
      textShadowColor: c.primary,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 18,
    },
    brandAccent: { color: c.primary },
    motto: {
      color: c.accent,
      fontSize: 16,
      fontWeight: '800',
      textAlign: 'center',
      marginTop: 6,
    },
    slogan: {
      color: c.muted,
      fontSize: 14,
      textAlign: 'center',
      marginTop: 4,
      marginBottom: 22,
    },
    modes: { flexDirection: 'row', marginBottom: 16 },
    line: { flexDirection: 'row', alignItems: 'flex-end' },
    dice: { marginLeft: 8, marginBottom: 14, paddingHorizontal: 14 },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textSoft,
      marginBottom: 6,
    },
    country: {
      marginRight: 8,
      marginBottom: 14,
      paddingHorizontal: 12,
      height: 50,
      justifyContent: 'center',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    countryText: { color: c.text, fontSize: 15, fontWeight: '700' },
    countries: { marginBottom: 14 },
    option: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
    },
    optionOn: { backgroundColor: c.primarySoft },
    optionText: { color: c.text, fontSize: 15 },
    optionDial: { color: c.accent, fontSize: 15, fontWeight: '700' },
  });
