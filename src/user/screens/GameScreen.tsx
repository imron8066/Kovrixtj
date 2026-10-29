import React, { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../../shared/i18n/Text';
import { CURRENCIES, PAY_EMPTY, RECEIPT } from '../../shared/config';
import { gameById } from '../../shared/games';
import { codeUsed, create, getCode, markCodeUsed } from '../../shared/api';
import { checkAccount, LookupResult } from '../../shared/lookup';
import { Nav } from '../../shared/navigation';
import { readable } from '../../shared/platform';
import { showAlert } from '../../shared/platform/alert';
import { useStore } from '../../shared/store';
import { fingerprint, txnKey } from '../../shared/guard';
import { P, Theme, useStyles } from '../../shared/theme';
import { Currency, PromoCode } from '../../shared/types';
import {
  Btn,
  Card,
  Empty,
  Field,
  GameBanner,
  GameFields,
  Pairs,
  PhotoPicker,
  Select,
} from '../../shared/ui';
import {
  checkFields,
  codeKey,
  codePrice,
  codeText,
  currencyOf,
  discounted,
  errorText,
  money,
  payMethods,
  payNumber,
  newCode,
  priced,
  productGroups,
  promoFor,
  rateOf,
} from '../../shared/utils';

// Экран доната. Что именно спрашивать у клиента — пакеты или любая сумма,
// ник и сервер или Player ID, нужен ли скриншот лота — решает описание
// игры (src/shared/games.ts), поэтому у каждой игры свой способ. Готовый
// заказ вместе с чеком уходит админу.
// Цены записаны в сомони; клиент выбирает валюту и способ оплаты, сумма
// пересчитывается по курсу, а действующая акция или промокод сразу
// снижают цену (берётся меньшая).
// Если для игры есть автопроверка (game.lookup), перед заказом приложение
// узнаёт, существует ли аккаунт, и показывает его ник. Проверка только
// подсказывает: сервис знает не все регионы игры, поэтому заказ можно
// оформить, даже если он ID не нашёл, — тогда ID сверит оператор.
// group — какую группу товаров показать сразу (кнопки «💎 Алмазы» и т. п.
// на главной); вкладками над пакетами её можно сменить
export default function GameScreen({
  id,
  group: startGroup,
  nav,
}: {
  id: string;
  group?: string;
  nav: Nav;
}) {
  const s = useStyles(makeStyles);
  const { user, settings, cloud, rememberFields } = useStore();
  const base = gameById(id);
  // цены и курс мог поменять админ
  const game = base && priced(base, cloud.config);
  const [currency, setCurrency] = useState<Currency>(currencyOf(user));
  const [pay, setPay] = useState('');
  // номер операции из чека банка — защита от повторных и чужих чеков
  const [txn, setTxn] = useState('');
  // номер выбранного пакета в game.products
  const [picked, setPicked] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [shown, setShown] = useState(startGroup ?? 'all');
  // данные с прошлого заказа подставляются сами
  const [fields, setFields] = useState<Record<string, string>>(
    settings.saved[id] ?? {},
  );
  const [images, setImages] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  // результат проверки аккаунта и ID, для которого он получен
  const [check, setCheck] = useState<{
    id: string;
    result: LookupResult;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  // промокод: что ввёл клиент и что нашлось в базе
  const [codeInput, setCodeInput] = useState('');
  const [code, setCode] = useState<PromoCode | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);

  if (!game || !user) {
    return <Empty icon="🎮" text="Игра не найдена." />;
  }

  const { custom } = game;
  const product = picked === null ? undefined : game.products[picked];
  const count = Math.floor(Number(amount));
  const promo = promoFor(cloud.promos, id);
  const full = product
    ? product.price
    : custom && count >= custom.min && count <= custom.max
    ? Math.round(count * custom.rate * 100) / 100
    : null;
  const item = product ? product.title : `${count} ${game.currency}`;
  // цена с лучшей скидкой: акция или промокод; byCode — сработал ли код
  const best = (title: string, value: number) => {
    const sale = discounted(value, promo);
    const coded = codePrice(code, id, title, value);
    return coded !== null && coded < sale
      ? { value: coded, byCode: true }
      : { value: sale, byCode: false };
  };
  const deal = full === null ? null : best(item, full);
  const price = deal && deal.value;

  const applyCode = async () => {
    const key = codeKey(codeInput);
    if (!key) {
      setCode(null);
      return;
    }
    setCodeBusy(true);
    try {
      const found = await getCode(key);
      const used = !!found?.once && (await codeUsed(user.uid, key));
      const fits =
        found &&
        !used &&
        (!found.until || found.until > Date.now()) &&
        (!found.game || found.game === id);
      setCode(fits ? found : null);
      showAlert(
        fits ? `Промокод ${key}` : 'Промокод не подходит',
        fits
          ? `${codeText(found, game.name)}. Цена уже пересчитана.${
              found.once ? ' Код действует один раз.' : ''
            }`
          : used
          ? 'Вы уже использовали этот промокод — он действует один раз.'
          : found
          ? 'Срок кода закончился или он для другой игры.'
          : 'Такого промокода нет — проверьте буквы.',
      );
    } catch (e) {
      showAlert('Промокод не проверен', errorText(e));
    } finally {
      setCodeBusy(false);
    }
  };
  const show = (tjs: number) => money(tjs, currency, cloud.config);
  const methods = payMethods(cloud.config.pay);
  const method = methods.find(m => m.key === pay);
  const requisites = method ? cloud.config.pay?.[method.key] ?? '' : '';
  const imageDefs = [...game.images, RECEIPT];
  const { lookup } = game;
  const lookupId = lookup ? (fields[lookup.field] ?? '').trim() : '';
  // если ID после проверки изменили, старый результат не считается
  const checked = check && check.id === lookupId ? check.result : null;

  const runCheck = async () => {
    const problem = checkFields(
      game.fields.filter(def => def.key === lookup?.field),
      fields,
    );
    if (problem) {
      showAlert('Данные аккаунта', problem);
      return null;
    }
    setChecking(true);
    const result = await checkAccount(game, fields);
    setChecking(false);
    setCheck({ id: lookupId, result });
    return result;
  };

  const pickAmount = (value: string) => {
    setAmount(value.replace(/\D/g, ''));
    setPicked(null);
  };

  const submit = async () => {
    if (price === null) {
      showAlert(
        'Что покупаем?',
        custom
          ? `Укажите количество — от ${custom.min} до ${custom.max} ${game.currency}.`
          : 'Выберите пакет.',
      );
      return;
    }
    const problem = checkFields(game.fields, fields);
    if (problem) {
      showAlert('Данные аккаунта', problem);
      return;
    }
    if (!method) {
      showAlert('Способ оплаты', 'Выберите, как будете платить.');
      return;
    }
    const missing = imageDefs.find(def => !images[def.key]?.length);
    if (missing) {
      showAlert('Нужно фото', `Прикрепите: ${missing.label}.`);
      return;
    }
    if (txnKey(txn).length < 4) {
      showAlert(
        'Номер операции',
        'Впишите номер операции (транзакции) из чека банка — без него заказ не проверить.',
      );
      return;
    }
    if (!lookup) {
      place(price, null);
      return;
    }
    const result = checked ?? (await runCheck());
    if (!result) {
      return;
    }
    if (result.status === 'missing') {
      showAlert(
        'Аккаунт не найден проверкой',
        `Сервис проверки не знает такой ID в ${game.name}. Так бывает и с настоящим ID — если аккаунт из другого региона. Сверьте цифры с профилем в игре.`,
        [
          { text: 'Исправить ID', style: 'cancel' },
          { text: 'ID верный, оформить', onPress: () => place(price, result) },
        ],
      );
    } else if (result.status === 'found' && !checked) {
      // ник клиент ещё не видел — пусть подтвердит, что аккаунт его
      showAlert('Это ваш аккаунт?', `Ник в игре: ${result.nick}`, [
        { text: 'Нет', style: 'cancel' },
        { text: 'Да, оформить', onPress: () => place(price, result) },
      ]);
    } else {
      place(price, result);
    }
  };

  const place = async (total: number, result: LookupResult | null) => {
    const orderCode = newCode('D');
    const { uid, id: clientId, name, phone } = user;
    setBusy(true);
    try {
      await create(
        'orders',
        {
          code: orderCode,
          uid,
          game: id,
          item,
          method: game.method,
          price: total,
          currency,
          total: Math.round(total * rateOf(currency, cloud.config) * 100) / 100,
          pay: method?.name ?? '',
          txn: txn.trim(),
          receipt: fingerprint(images[RECEIPT.key][0]),
          ...(code && deal?.byCode
            ? {
                promo: `${code.id}: ${codeText(code, game.name)}`,
                promoCode: code.id,
              }
            : promo && { promo: `${promo.title} −${promo.percent}%` }),
          fields,
          ...(result && {
            check:
              result.status === 'found'
                ? `найден, ник ${result.nick}`
                : result.status === 'exists'
                ? 'аккаунт существует (другой регион, ник неизвестен)'
                : result.status === 'missing'
                ? 'проверка такой ID не нашла — сверьте вручную'
                : 'не удалась — сверьте ID вручную',
          }),
          status: 'new',
          createdAt: Date.now(),
          client: { id: clientId, name, phone },
        },
        imageDefs.map(def => images[def.key][0]),
      );
      rememberFields(id, fields);
      if (code?.once && deal?.byCode) {
        markCodeUsed(uid, code.id).catch(() => {});
      }
      showAlert(
        `Заказ ${orderCode} оформлен`,
        'Подтверждение — в течение дня (обычно быстрее): мы проверим оплату, и сразу после этого донат придёт на ваш аккаунт. Ответ — на вкладке «Ответы», а пока ждёте, можно сыграть в мини-игру.',
      );
      nav.setTab('answers');
    } catch (e) {
      setBusy(false);
      showAlert('Заказ не оформлен', errorText(e));
    }
  };

  return (
    <ScrollView
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={readable}>
        <GameBanner
          game={game}
          style={s.banner}
          badge={promo ? `−${promo.percent}%` : undefined}
        />
        {promo && (
          <Text style={s.promo}>
            🔥 {promo.title}: скидка {promo.percent}% уже в цене
          </Text>
        )}

        <Card>
          <Text style={s.title}>1. Что покупаем</Text>
          {productGroups(game.products).length > 1 && (
            <View style={s.tabs}>
              {[
                { key: 'all', name: 'Все' },
                ...productGroups(game.products),
              ].map(g => (
                <TouchableOpacity
                  key={g.key}
                  testID={`group-${g.key}`}
                  activeOpacity={0.8}
                  style={[s.tab, shown === g.key && s.tabOn]}
                  onPress={() => setShown(g.key)}
                >
                  <Text style={[s.tabText, shown === g.key && s.tabTextOn]}>
                    {g.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {productGroups(game.products)
            .filter(g => shown === 'all' || g.key === shown)
            .map((group, _, all) => (
              <View key={group.key}>
                {all.length > 1 && <Text style={s.group}>{group.name}</Text>}
                <View style={s.packs}>
                  {group.items.map(({ p, i }) => {
                    const on = i === picked;
                    return (
                      <TouchableOpacity
                        key={p.title}
                        testID={`pack-${i}`}
                        activeOpacity={0.8}
                        style={[s.pack, on && s.packOn]}
                        onPress={() => {
                          setPicked(i);
                          setAmount('');
                        }}
                      >
                        <Text style={s.packTitle}>{p.title}</Text>
                        <Text style={s.packPrice}>
                          {show(best(p.title, p.price).value)}
                        </Text>
                        {best(p.title, p.price).value < p.price && (
                          <Text style={s.packOld}>{show(p.price)}</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          {custom && (
            <>
              <Field
                testID="amount-input"
                label={`Количество (${game.currency}), от ${custom.min}`}
                value={amount}
                onChangeText={pickAmount}
                placeholder={String(custom.min)}
                keyboardType="number-pad"
                maxLength={6}
              />
              <View style={s.quick}>
                {custom.quick.map(q => (
                  <TouchableOpacity
                    key={q}
                    testID={`quick-${q}`}
                    style={[s.chip, amount === String(q) && s.chipOn]}
                    onPress={() => pickAmount(String(q))}
                  >
                    <Text
                      style={[s.chipText, amount === String(q) && s.chipTextOn]}
                    >
                      {q}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </Card>

        <Card>
          <Text style={s.title}>2. Данные аккаунта</Text>
          <GameFields defs={game.fields} values={fields} onChange={setFields} />
          {lookup ? (
            <>
              <Btn
                testID="check-button"
                title={checking ? 'Проверяем…' : 'Проверить аккаунт'}
                variant="soft"
                small
                disabled={checking}
                onPress={runCheck}
              />
              {checked && (
                <Text
                  testID="check-result"
                  style={[
                    s.check,
                    (checked.status === 'found' ||
                      checked.status === 'exists') &&
                      s.checkOk,
                    checked.status === 'missing' && s.checkBad,
                  ]}
                >
                  {checked.status === 'found'
                    ? `✓ Аккаунт найден: ${checked.nick}`
                    : checked.status === 'exists'
                    ? '✓ Аккаунт с таким ID существует. Ник показать не можем — сверьте цифры с профилем в игре.'
                    : checked.status === 'missing'
                    ? '✕ Проверка не нашла такой ID. Сверьте цифры с профилем в игре. Если ID верный (аккаунт из другого региона), заказ можно оформить — ID сверит оператор.'
                    : `Не удалось проверить. ${checked.reason} Заказ можно оформить — ID сверит оператор.`}
                </Text>
              )}
            </>
          ) : (
            <Text style={s.check}>
              Автопроверки для этой игры нет — аккаунт сверит оператор.
            </Text>
          )}
        </Card>

        <Card>
          <Text style={s.title}>3. Оплата</Text>
          <Select
            label="Валюта"
            options={Object.keys(CURRENCIES)}
            render={key => CURRENCIES[key as Currency].name}
            value={currency}
            onChange={value => setCurrency(value as Currency)}
          />
          <View style={s.codeRow}>
            <View style={s.codeField}>
              <Field
                testID="promo-code"
                label="Промокод"
                value={codeInput}
                onChangeText={setCodeInput}
                placeholder="Если есть"
                autoCapitalize="characters"
                maxLength={20}
              />
            </View>
            <Btn
              title={codeBusy ? '…' : 'Применить'}
              variant="outline"
              small
              disabled={codeBusy}
              onPress={applyCode}
              style={s.codeBtn}
            />
          </View>
          {code && (
            <Text style={s.codeOk}>
              ✅ {code.id}: {codeText(code, game.name)}
              {deal && !deal.byCode && full !== null
                ? ' — к этому товару не подходит'
                : ''}
            </Text>
          )}
          <View style={s.total}>
            <Text style={s.totalLabel}>К оплате</Text>
            <Text testID="total" style={s.totalValue}>
              {price === null ? '—' : show(price)}
            </Text>
          </View>
          <Select
            label="Способ оплаты"
            required
            options={methods.map(m => m.key)}
            render={key => methods.find(m => m.key === key)!.name}
            value={pay}
            onChange={setPay}
          />
          {method && !!payNumber(requisites) && (
            <Pairs copy pairs={[[method.name, payNumber(requisites)]]} />
          )}
          {method && (
            <Text style={s.pay} selectable>
              {requisites || PAY_EMPTY}
              {'\n'}Переведите ровно {price === null ? '—' : show(price)}. После
              оплаты впишите номер операции из чека и приложите скриншот.
            </Text>
          )}
          <Field
            testID="txn-input"
            label="Номер операции из чека *"
            value={txn}
            onChangeText={setTxn}
            placeholder="Например: 1234567890"
            maxLength={40}
            autoCapitalize="none"
          />
          {imageDefs.map(def => (
            <PhotoPicker
              key={def.key}
              label={`${def.label} *`}
              max={1}
              photos={images[def.key] ?? []}
              onChange={photos => setImages({ ...images, [def.key]: photos })}
            />
          ))}
        </Card>

        <Text style={s.wait}>
          ⏳ Подтверждение — в течение дня, обычно быстрее. После проверки
          оплаты донат придёт на ваш аккаунт.
        </Text>
        <Btn
          testID="order-button"
          title={busy ? 'Отправляем…' : 'Оформить заказ'}
          disabled={busy}
          onPress={submit}
        />

        <Card>
          <Text style={s.title}>Как это работает</Text>
          {game.steps.map((step, i) => (
            <Text key={step} style={s.step}>
              {i + 1}. {step}
            </Text>
          ))}
        </Card>
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 16, paddingTop: 4, paddingBottom: 28 },
    banner: { marginBottom: 14 },
    wait: {
      color: c.textSoft,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
      marginBottom: 10,
    },
    title: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 10 },
    step: { color: c.muted, fontSize: 14, lineHeight: 20, marginBottom: 4 },
    check: { color: c.muted, fontSize: 14, lineHeight: 20, marginTop: 10 },
    checkOk: { color: c.green, fontWeight: '700' },
    checkBad: { color: c.danger, fontWeight: '700' },
    group: {
      color: c.text,
      fontSize: 16,
      fontWeight: '900',
      marginTop: 6,
      marginBottom: 8,
    },
    tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    tab: {
      paddingVertical: 9,
      paddingHorizontal: 16,
      borderRadius: P(c),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.subtle,
    },
    tabOn: { borderColor: c.primary, backgroundColor: c.primary },
    tabText: { color: c.textSoft, fontSize: 14, fontWeight: '800' },
    tabTextOn: { color: c.onPrimary },
    packs: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    pack: {
      width: '48.4%',
      paddingVertical: 14,
      paddingHorizontal: 14,
      marginBottom: 10,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.subtle,
    },
    packOn: { borderColor: c.primary, backgroundColor: c.primarySoft },
    packTitle: { color: c.text, fontSize: 15, fontWeight: '800' },
    packPrice: {
      color: c.primary,
      fontSize: 16,
      fontWeight: '900',
      marginTop: 4,
    },
    packOld: {
      color: c.muted,
      fontSize: 12,
      textDecorationLine: 'line-through',
    },
    promo: {
      color: c.warning,
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 12,
    },
    quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: P(c),
      borderWidth: 1,
      borderColor: c.inputBorder,
      backgroundColor: c.subtle,
    },
    chipOn: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { color: c.text, fontSize: 13 },
    chipTextOn: { color: c.onPrimary, fontWeight: '700' },
    total: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 12,
    },
    totalLabel: { color: c.muted, fontSize: 15 },
    codeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    codeField: { flex: 1 },
    codeBtn: { marginBottom: 14 },
    codeOk: { color: c.green, fontWeight: '700', marginBottom: 12 },
    totalValue: { color: c.primary, fontSize: 26, fontWeight: '900' },
    pay: {
      color: c.textSoft,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 12,
    },
  });
