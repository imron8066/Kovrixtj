import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../shared/i18n/Text';
import {
  addProduct,
  allInvites,
  can,
  createStaff,
  deleteUser,
  loadBlocked,
  loadPerms,
  loadRoles,
  loadSeen,
  removeProduct,
  resetPassword,
  setPerms,
  loadDaily,
  loadHistory,
  loadTasks,
  renewDaily,
  saveDailyPrices,
  loadTeamCode,
  saveTeamCode,
  postNews,
  removeNews,
  removeCode,
  removePromo,
  removeTask,
  saveCode,
  saveConfig,
  savePromo,
  saveTask,
  setBlocked,
  setRole,
  saveCover,
} from '../../shared/api';
import {
  CURRENCIES,
  ONLINE_MS,
  PAY_METHODS,
  PERMS,
  REFRESH_MS,
} from '../../shared/config';
import { reloadCovers } from '../../shared/covers';
import { gameById, GAMES } from '../../shared/games';
import { readable } from '../../shared/platform';
import { showAlert } from '../../shared/platform/alert';
import { useRemote, useStore } from '../../shared/store';
import { Theme, useStyles } from '../../shared/theme';
import {
  Claim,
  Currency,
  Order,
  Perm,
  Perms,
  Role,
  User,
} from '../../shared/types';
import {
  Badge,
  Btn,
  Card,
  Chips,
  Field,
  Pairs,
  PhotoPicker,
  Select,
} from '../../shared/ui';
import {
  codeKey,
  codeText,
  errorText,
  formatDate,
  HistoryFilter,
  matchHistory,
  money,
  NO_FILTER,
  Period,
  PERIODS,
  priced,
  rateOf,
} from '../../shared/utils';
import RequestsScreen from './RequestsScreen';

type Section =
  | 'claims'
  | 'stats'
  | 'history'
  | 'news'
  | 'prices'
  | 'promos'
  | 'tasks'
  | 'rates'
  | 'pay'
  | 'people'
  | 'code';

// раздел и доступ, который для него нужен («Люди» — админу или тому,
// кому разрешена блокировка)
const SECTIONS: [Section, string, Perm][] = [
  ['claims', 'Награды', 'claims'],
  ['stats', 'Статистика', 'stats'],
  ['history', 'История', 'stats'],
  ['news', 'Новости', 'promos'],
  ['prices', 'Цены и товары', 'prices'],
  ['promos', 'Акции', 'promos'],
  ['tasks', 'Задания', 'tasks'],
  ['rates', 'Курсы', 'money'],
  ['pay', 'Реквизиты', 'money'],
  ['people', 'Люди', 'block'],
];

const num = (text: string) => Number(text.replace(',', '.'));
const DAY = 864e5;

// кнопка «Сохранить» с сообщением об ошибке; done вызывается после успеха
function useAction(done?: () => void) {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await action();
      done?.();
      if (ok) {
        showAlert(ok);
      }
    } catch (e) {
      showAlert('Не сохранено', errorText(e));
    }
    setBusy(false);
  };
  return { busy, run };
}

// Обложка игры на плитке доната и витрины: своё фото (как у Free Fire)
// вместо встроенной картинки. Лучше горизонтальное 16:9, название игры —
// на самой картинке.
function GameCover({ id, name }: { id: string; name: string }) {
  const s = useStyles(makeStyles);
  const [photos, setPhotos] = useState<string[]>([]);
  const { busy, run } = useAction(() => {
    setPhotos([]);
    reloadCovers();
  });
  return (
    <Card>
      <Text style={s.title}>Обложка {name}</Text>
      <Text style={s.text}>
        Своё фото для плитки игры в приложении и на сайте. Лучше горизонтальное
        (16:9) — с логотипом или названием игры.
      </Text>
      <PhotoPicker
        label="Фото обложки"
        max={1}
        photos={photos}
        onChange={setPhotos}
      />
      <Btn
        testID="save-cover"
        title="Сохранить обложку"
        disabled={busy || !photos.length}
        onPress={() =>
          run(() => saveCover(id, photos[0]), `Обложка ${name} сохранена`)
        }
      />
      <Btn
        title="Вернуть стандартную"
        variant="outline"
        small
        disabled={busy}
        onPress={() => run(() => saveCover(id, null), 'Обложка сброшена')}
        style={s.gapTop}
      />
    </Card>
  );
}

// Цены: пакеты и курс «любой суммы» выбранной игры, в сомони
function Prices() {
  const s = useStyles(makeStyles);
  const { cloud, refreshCloud } = useStore();
  const { busy, run } = useAction(refreshCloud);
  const [id, setId] = useState(GAMES[0].id);
  const [edited, setEdited] = useState<Record<string, string>>({});
  // цены меняются у товаров из games.ts; свои товары — отдельным списком
  const game = priced(gameById(id)!, { prices: cloud.config.prices }, true);
  const added = Object.entries(cloud.config.products?.[id] ?? {});
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const value = (key: string, current: number) =>
    edited[`${id}/${key}`] ?? String(current);
  const set = (key: string) => (text: string) =>
    setEdited({ ...edited, [`${id}/${key}`]: text });

  const save = () => {
    const products: Record<string, number> = {};
    game.products.forEach((p, i) => {
      products[i] = num(value(String(i), p.price));
    });
    const rate = game.custom && num(value('rate', game.custom.rate));
    if (
      Object.values(products).some(price => !(price >= 0)) ||
      (game.custom && !(rate! > 0))
    ) {
      showAlert(
        'Проверьте цены',
        'Цена должна быть числом. 0 — товар скрыт от клиентов.',
      );
      return;
    }
    run(
      () => saveConfig(`prices/${id}`, { products, ...(rate && { rate }) }),
      `Цены ${game.name} сохранены`,
    );
  };

  const add = () => {
    if (title.trim().length < 2 || !(num(price) > 0)) {
      showAlert('Проверьте товар', 'Нужны название и цена больше нуля.');
      return;
    }
    run(async () => {
      await addProduct(id, { title: title.trim(), price: num(price) });
      setTitle('');
      setPrice('');
    }, `Товар добавлен в ${game.name}`);
  };

  return (
    <>
      <Card>
        <Select
          label="Игра"
          options={GAMES.map(g => g.id)}
          render={key => gameById(key)!.name}
          value={id}
          onChange={setId}
        />
        {game.custom && (
          <Field
            testID="price-rate"
            label={`Цена за 1 ${game.currency}, смн`}
            value={value('rate', game.custom.rate)}
            onChangeText={set('rate')}
            keyboardType="decimal-pad"
          />
        )}
        {game.products.map((p, i) => (
          <Field
            key={p.title}
            testID={`price-${i}`}
            label={`${p.title}, смн`}
            value={value(String(i), p.price)}
            onChangeText={set(String(i))}
            keyboardType="decimal-pad"
          />
        ))}
        <Text style={s.text}>
          Клиент увидит новую цену в течение полминуты. В другие валюты она
          пересчитывается по курсу из раздела «Курсы». Товар с ценой 0 клиенту
          не показывается.
        </Text>
        <Btn
          testID="save-prices"
          title="Сохранить цены"
          disabled={busy}
          onPress={save}
        />
      </Card>
      <GameCover id={id} name={game.name} />
      <Card>
        <Text style={s.title}>Свои товары в {game.name}</Text>
        <Text style={s.text}>
          Добавьте то, чего нет в списке: ваучер, пропуск, набор. Клиент увидит
          товар рядом с остальными пакетами.
        </Text>
        {added.map(([key, product]) => (
          <View key={key} style={s.head}>
            <Text style={s.title}>
              {product.title} · {product.price} смн
            </Text>
            <Btn
              title="Удалить"
              variant="danger"
              small
              disabled={busy}
              onPress={() => run(() => removeProduct(id, key))}
            />
          </View>
        ))}
        <Field
          testID="product-title"
          label="Название"
          value={title}
          onChangeText={setTitle}
          placeholder="Например: Ваучер на 100 алмазов"
          maxLength={60}
        />
        <Field
          testID="product-price"
          label="Цена, смн"
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          maxLength={8}
        />
        <Btn
          testID="add-product"
          title="＋ Добавить товар"
          variant="soft"
          disabled={busy}
          onPress={add}
        />
      </Card>
    </>
  );
}

// Акции: скидка в процентах на игру или на все игры, на несколько дней
function Promos() {
  const s = useStyles(makeStyles);
  const { cloud, refreshCloud } = useStore();
  const { busy, run } = useAction(refreshCloud);
  const [title, setTitle] = useState('');
  const [percent, setPercent] = useState('');
  const [days, setDays] = useState('3');
  const [game, setGame] = useState('all');

  const add = () => {
    const value = num(percent);
    if (
      title.trim().length < 3 ||
      !(value > 0 && value < 100) ||
      !(num(days) > 0)
    ) {
      showAlert(
        'Проверьте акцию',
        'Нужны название, скидка от 1 до 99% и срок в днях.',
      );
      return;
    }
    run(async () => {
      await savePromo({
        title: title.trim(),
        percent: value,
        game: game === 'all' ? '' : game,
        until: Date.now() + num(days) * DAY,
      });
      setTitle('');
      setPercent('');
    }, 'Акция запущена');
  };

  return (
    <>
      {cloud.promos.map(promo => (
        <Card key={promo.id}>
          <View style={s.head}>
            <Text style={s.title}>
              −{promo.percent}% · {promo.title}
            </Text>
            <Badge
              text={promo.until > Date.now() ? 'Идёт' : 'Закончилась'}
              tone={promo.until > Date.now() ? 'ok' : 'warning'}
            />
          </View>
          <Text style={s.text}>
            {gameById(promo.game)?.name ?? 'Все игры'} · до{' '}
            {formatDate(promo.until)}
          </Text>
          <Btn
            title="Удалить"
            variant="danger"
            small
            disabled={busy}
            onPress={() => run(() => removePromo(promo.id))}
          />
        </Card>
      ))}
      <Card>
        <Text style={s.title}>Новая акция</Text>
        <Field
          testID="promo-title"
          label="Название"
          value={title}
          onChangeText={setTitle}
          placeholder="Например: Выходные со скидкой"
          maxLength={60}
        />
        <Field
          testID="promo-percent"
          label="Скидка, %"
          value={percent}
          onChangeText={setPercent}
          keyboardType="decimal-pad"
          maxLength={4}
        />
        <Field
          label="Сколько дней действует"
          value={days}
          onChangeText={setDays}
          keyboardType="decimal-pad"
          maxLength={4}
        />
        <Select
          label="На что"
          options={['all', ...GAMES.map(g => g.id)]}
          render={key => gameById(key)?.name ?? 'Все игры'}
          value={game}
          onChange={setGame}
        />
        <Btn
          testID="save-promo"
          title="Запустить акцию"
          disabled={busy}
          onPress={add}
        />
      </Card>
    </>
  );
}

// Промокод дня: админ задаёт цены по коду на каждый товар, а бот каждый
// день в полночь (по Душанбе) придумывает новый код и шлёт его команде
function DailyCodeAdmin() {
  const s = useStyles(makeStyles);
  const { cloud, refreshCloud } = useStore();
  const [id, setId] = useState(GAMES.find(g => !g.off)?.id ?? GAMES[0].id);
  const { data, reload } = useRemote(useCallback(() => loadDaily(id), [id]));
  const { busy, run } = useAction(() => {
    reload();
    refreshCloud();
  });
  const [edited, setEdited] = useState<Record<string, string>>({});
  const game = priced(gameById(id)!, cloud.config);
  const value = (title: string) =>
    edited[`${id}/${title}`] ?? String(data?.prices?.[title] ?? '');
  const live = cloud.codes.find(c => c.id === data?.code);

  const save = () => {
    const prices: Record<string, number> = {};
    for (const p of game.products) {
      const n = num(value(p.title));
      if (value(p.title).trim() && !(n > 0 && n < p.price)) {
        showAlert(
          'Проверьте цены',
          `«${p.title}»: цена по коду должна быть меньше обычной (${p.price} смн). Пусто — товар без скидки.`,
        );
        return;
      }
      if (n > 0) {
        prices[p.title] = n;
      }
    }
    run(() => saveDailyPrices(id, prices), 'Цены промокода дня сохранены');
  };

  return (
    <>
      <Text style={s.title}>Промокод дня</Text>
      <Card>
        <Select
          label="Игра"
          options={GAMES.filter(g => !g.off).map(g => g.id)}
          render={key => gameById(key)!.name}
          value={id}
          onChange={setId}
        />
        <Text style={s.text}>
          Каждый день в 00:00 (Душанбе) бот сам меняет код и присылает его
          команде в Telegram. Код действует до конца дня.
        </Text>
        <Text style={s.title} selectable>
          {live ? `Сегодня: ${live.id}` : 'Код ещё не выдан'}
        </Text>
        {game.products.map(p => (
          <Field
            key={p.title}
            label={`${p.title} (обычная ${p.price}), смн`}
            value={value(p.title)}
            onChangeText={text =>
              setEdited({ ...edited, [`${id}/${p.title}`]: text })
            }
            keyboardType="decimal-pad"
            maxLength={7}
          />
        ))}
        <Btn title="Сохранить цены" disabled={busy} onPress={save} />
        <Btn
          title="Новый код прямо сейчас"
          variant="outline"
          small
          disabled={busy || !data?.prices}
          onPress={() =>
            run(
              () => renewDaily(id),
              'Бот сменит код в течение минуты — обновите страницу',
            )
          }
        />
      </Card>
    </>
  );
}

// Промокоды: клиент вводит код при заказе. Своя цена на один товар
// (например, 100 алмазов за 9 смн) или скидка % на всю игру.
function PromoCodes() {
  const s = useStyles(makeStyles);
  const { cloud, refreshCloud } = useStore();
  const { busy, run } = useAction(refreshCloud);
  const [code, setCode] = useState('');
  const [game, setGame] = useState(GAMES[0].id);
  const [product, setProduct] = useState('');
  const [value, setValue] = useState('');
  const [days, setDays] = useState('');
  const base = gameById(game);
  const products = base ? priced(base, cloud.config, true).products : [];

  const add = () => {
    const key = codeKey(code);
    const n = num(value);
    const percent = !product;
    if (key.length < 3 || !(n > 0) || (percent && !(n < 100))) {
      showAlert(
        'Проверьте промокод',
        'Нужен код от 3 букв и цена в сомони (или скидка от 1 до 99%).',
      );
      return;
    }
    run(async () => {
      await saveCode({
        id: key,
        game: game === 'all' ? '' : game,
        ...(percent ? { percent: n } : { product, price: n }),
        until: num(days) > 0 ? Date.now() + num(days) * DAY : 0,
      });
      setCode('');
      setValue('');
    }, `Промокод ${key} создан`);
  };

  return (
    <>
      <Text style={s.title}>Промокоды</Text>
      {cloud.codes.map(c => {
        const live = !c.until || c.until > Date.now();
        return (
          <Card key={c.id}>
            <View style={s.head}>
              <Text style={s.title} selectable>
                {c.id}
              </Text>
              <Badge
                text={live ? 'Действует' : 'Закончился'}
                tone={live ? 'ok' : 'warning'}
              />
            </View>
            <Text style={s.text}>
              {gameById(c.game)?.name ?? 'Все игры'} · {codeText(c)} ·{' '}
              {c.until ? `до ${formatDate(c.until)}` : 'бессрочно'}
            </Text>
            <Btn
              title="Удалить"
              variant="danger"
              small
              disabled={busy}
              onPress={() => run(() => removeCode(c.id))}
            />
          </Card>
        );
      })}
      <Card>
        <Text style={s.title}>Новый промокод</Text>
        <Field
          testID="code-name"
          label="Код"
          value={code}
          onChangeText={setCode}
          placeholder="Например: ILMHONA"
          autoCapitalize="characters"
          maxLength={20}
        />
        <Select
          label="Игра"
          options={['all', ...GAMES.map(g => g.id)]}
          render={key => gameById(key)?.name ?? 'Все игры'}
          value={game}
          onChange={key => {
            setGame(key);
            setProduct('');
          }}
        />
        {game !== 'all' && (
          <Select
            label="Товар"
            options={['', ...products.map(p => p.title)]}
            render={key => key || 'Любой — скидка в %'}
            value={product}
            onChange={setProduct}
          />
        )}
        <Field
          testID="code-value"
          label={product ? `Цена «${product}», смн` : 'Скидка, %'}
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
          maxLength={7}
        />
        <Field
          label="Сколько дней действует (пусто — бессрочно)"
          value={days}
          onChangeText={setDays}
          keyboardType="decimal-pad"
          maxLength={4}
        />
        <Btn
          testID="save-code"
          title="Создать промокод"
          disabled={busy}
          onPress={add}
        />
      </Card>
    </>
  );
}

// Статистика: выручка, заказы, новые клиенты и приглашения за период
function Stats({ orders, users }: { orders: Order[]; users: User[] }) {
  const s = useStyles(makeStyles);
  const { cloud } = useStore();
  const [period, setPeriod] = useState<Period>('week');
  const { data: invites } = useRemote(useCallback(allInvites, []));
  const since = Date.now() - PERIODS.find(p => p.key === period)!.ms;
  const inPeriod = orders.filter(order => order.createdAt >= since);
  const done = inPeriod.filter(order => order.status === 'done');
  const revenue = done.reduce((sum, order) => sum + (order.price || 0), 0);
  const count = (status: string) =>
    inPeriod.filter(order => order.status === status).length;
  const newUsers = users.filter(user => user.createdAt >= since);
  const buyers = new Set(done.map(order => order.uid)).size;

  // игры по числу выполненных заказов
  const games = Object.entries(
    done.reduce<Record<string, number>>((acc, order) => {
      acc[order.game] = (acc[order.game] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // кто больше всех пригласил за период
  const byId = new Map(users.map(user => [String(user.id), user]));
  const inviters = Object.entries(invites ?? {})
    .map(([id, friends]) => ({
      id,
      count: Object.values(friends as Record<string, { at: number }>).filter(
        friend => friend.at >= since,
      ).length,
    }))
    .filter(row => row.count > 0)
    .sort((a, b) => b.count - a.count);
  const invited = inviters.reduce((sum, row) => sum + row.count, 0);

  const tjs = (value: number) => money(value, 'TJS', cloud.config);

  return (
    <>
      <Chips
        options={PERIODS.map(p => [p.key, p.name])}
        value={period}
        onChange={setPeriod}
      />
      <Card>
        <Text style={s.title}>💰 Выручка: {tjs(revenue)}</Text>
        <Pairs
          pairs={[
            ['Выполнено заказов', String(done.length)],
            ['Ждут решения', String(count('new'))],
            ['Отклонено', String(count('rejected'))],
            [
              'Средний чек',
              done.length ? tjs(Math.round(revenue / done.length)) : '—',
            ],
            ['Покупателей', String(buyers)],
          ]}
        />
      </Card>
      <Card>
        <Text style={s.title}>👤 Клиенты</Text>
        <Pairs
          pairs={[
            ['Новых за период', String(newUsers.length)],
            ['Пришли по приглашению', String(invited)],
            ['Всего аккаунтов', String(users.length)],
          ]}
        />
      </Card>
      {!!games.length && (
        <Card>
          <Text style={s.title}>🎮 Популярные игры</Text>
          <Pairs
            pairs={games.map(([game, n]) => [
              gameById(game)?.name ?? game,
              `${n} зак.`,
            ])}
          />
        </Card>
      )}
      {!!inviters.length && (
        <Card>
          <Text style={s.title}>👥 Лучшие по приглашениям</Text>
          <Pairs
            pairs={inviters
              .slice(0, 10)
              .map(row => [
                `${byId.get(row.id)?.name ?? '—'} · ID ${row.id}`,
                `${row.count} друз.`,
              ])}
          />
        </Card>
      )}
    </>
  );
}

const KIND_NAMES = {
  orders: '🎮 Донат',
  listings: '🏷 Объявление',
  sales: '🤝 Продажа',
  claims: '🎯 Награда',
};

// сколько записей журнала показывать за раз
const HISTORY_PAGE = 150;

// Журнал команды: кто, когда и что решил. Записи нельзя изменить или
// стереть из приложений — по ним видно, кто зачислил или отклонил заказ.
// Искать можно по имени, ID, телефону, коду, дню и времени
function History() {
  const s = useStyles(makeStyles);
  const { cloud } = useStore();
  const { data, error } = useRemote(useCallback(loadHistory, []));
  const [who, setWho] = useState('all');
  const [filter, setFilter] = useState<HistoryFilter>(NO_FILTER);
  const [limit, setLimit] = useState(HISTORY_PAGE);
  const entries = data ?? [];
  const staff = [...new Map(entries.map(e => [e.by, e.byName])).entries()];
  const found = entries.filter(
    e => (who === 'all' || e.by === who) && matchHistory(e, filter),
  );
  const shown = found.slice(0, limit);
  const typed = Object.values(filter).some(v => v.trim());
  const searching = typed || who !== 'all';
  const change = (key: keyof HistoryFilter) => (value: string) => {
    setFilter({ ...filter, [key]: value });
    setLimit(HISTORY_PAGE);
  };

  return (
    <>
      <Card>
        <Text style={s.text}>
          Каждое «Подтвердить» и «Отклонить» записывается сюда: кто, когда,
          какой заказ и на какую сумму. Записи хранятся всегда — их нельзя
          изменить или удалить из приложения.
        </Text>
        {!!error && <Text style={s.text}>{error}</Text>}
      </Card>
      <Card>
        <Field
          label="Поиск: имя, ID, телефон, код заказа или сотрудник"
          value={filter.text}
          onChangeText={change('text')}
          placeholder="например: 482913"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Field
          label="День"
          value={filter.day}
          onChangeText={change('day')}
          placeholder="ДД.ММ.ГГГГ или ДД.ММ"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        <View style={s.filters}>
          <View style={s.grow}>
            <Field
              label="Время с"
              value={filter.from}
              onChangeText={change('from')}
              placeholder="ЧЧ:ММ"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </View>
          <View style={s.grow}>
            <Field
              label="до"
              value={filter.to}
              onChangeText={change('to')}
              placeholder="ЧЧ:ММ"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </View>
        </View>
        {data && (
          <Text style={s.text}>
            {searching
              ? `Найдено: ${found.length} из ${entries.length}`
              : `Всего записей: ${entries.length}`}
          </Text>
        )}
        {typed && (
          <Btn
            title="Сбросить поиск"
            variant="outline"
            onPress={() => {
              setFilter(NO_FILTER);
              setLimit(HISTORY_PAGE);
            }}
          />
        )}
      </Card>
      {staff.length > 1 && (
        <Chips
          options={[
            ['all', 'Все'],
            ...staff.map(
              ([uid, name]) => [uid, name || uid] as [string, string],
            ),
          ]}
          value={who}
          onChange={setWho}
        />
      )}
      {data && shown.length === 0 && (
        <Card>
          <Text style={s.text}>
            {entries.length
              ? 'Ничего не найдено — измените поиск.'
              : 'Пока пусто — решений ещё не было.'}
          </Text>
        </Card>
      )}
      {shown.map(entry => (
        <Card key={entry.id}>
          <View style={s.head}>
            <Text style={s.title}>
              {KIND_NAMES[entry.kind] ?? entry.kind} · {entry.code}
            </Text>
            <Badge
              text={entry.status === 'done' ? 'Принято' : 'Отклонено'}
              tone={entry.status === 'done' ? 'ok' : 'warning'}
            />
          </View>
          <Pairs
            pairs={[
              ['Кто', entry.byName || entry.by],
              ['Когда', formatDate(entry.at)],
              ['Что', entry.title],
              ...(entry.amount !== undefined
                ? [
                    ['Сумма', money(entry.amount, 'TJS', cloud.config)] as [
                      string,
                      string,
                    ],
                  ]
                : []),
              [
                'Клиент',
                `${entry.client?.name ?? ''} · ID ${entry.client?.id ?? ''}`,
              ],
              ...(entry.note
                ? [['Ответ', entry.note] as [string, string]]
                : []),
            ]}
          />
        </Card>
      ))}
      {found.length > shown.length && (
        <Btn
          title={`Показать ещё (${found.length - shown.length})`}
          variant="outline"
          onPress={() => setLimit(limit + HISTORY_PAGE)}
        />
      )}
    </>
  );
}

// Новости: видны на главной у всех, бот рассылает их в Telegram
function NewsAdmin() {
  const s = useStyles(makeStyles);
  const { user, cloud, refreshCloud } = useStore();
  const { busy, run } = useAction(refreshCloud);
  const [text, setText] = useState('');

  const send = () => {
    if (text.trim().length < 5) {
      showAlert('Короткая новость', 'Напишите хотя бы пару слов.');
      return;
    }
    run(async () => {
      await postNews(text.trim(), user?.name ?? '');
      setText('');
    }, 'Опубликовано. Бот разошлёт новость в Telegram в течение минуты.');
  };

  return (
    <>
      <Card>
        <Text style={s.title}>Новая новость</Text>
        <Text style={s.text}>
          Появится на главной в приложении и на сайте у всех клиентов, а бот
          пришлёт её каждому, кто подключил Telegram. Подойдёт для акций, новых
          игр и обновлений.
        </Text>
        <Field
          testID="news-text"
          label="Текст"
          value={text}
          onChangeText={setText}
          placeholder="Например: Сегодня алмазы Free Fire со скидкой 10%!"
          multiline
          maxLength={800}
        />
        <Btn
          testID="send-news"
          title="📢 Опубликовать и разослать"
          disabled={busy}
          onPress={send}
        />
      </Card>
      {cloud.news.map(item => (
        <Card key={item.id}>
          <View style={s.head}>
            <Text style={s.title}>{formatDate(item.at)}</Text>
            <Badge
              text={
                item.sent === undefined
                  ? 'Рассылается…'
                  : `В Telegram: ${item.sent}`
              }
              tone={item.sent === undefined ? 'warning' : 'ok'}
            />
          </View>
          <Text style={s.text}>
            {item.text}
            {item.by ? `\n— ${item.by}` : ''}
          </Text>
          <Btn
            title="Удалить"
            variant="danger"
            small
            disabled={busy}
            onPress={() => run(() => removeNews(item.id))}
          />
        </Card>
      ))}
    </>
  );
}

// «Пригласи друга»: сколько друзей нужно и что за это получит клиент
function Referral() {
  const s = useStyles(makeStyles);
  const { cloud, refreshCloud } = useStore();
  const { busy, run } = useAction(refreshCloud);
  const rule = cloud.config.referral;
  const [need, setNeed] = useState(String(rule?.need ?? 5));
  const [reward, setReward] = useState(rule?.reward ?? '');

  const save = () => {
    const value = Math.round(num(need));
    if (!(value >= 1 && value <= 100) || reward.trim().length < 2) {
      showAlert(
        'Проверьте награду',
        'Нужно число друзей от 1 до 100 и награда.',
      );
      return;
    }
    run(
      () => saveConfig('referral', { need: value, reward: reward.trim() }),
      'Сохранено',
    );
  };

  return (
    <Card>
      <Text style={s.title}>👥 Награда за друзей</Text>
      <Text style={s.text}>
        У каждого клиента есть ссылка-приглашение (вкладка «Топ»). Когда по ней
        зарегистрируется нужное число друзей, клиент нажмёт «Получить» — заявка
        придёт в «Награды» со списком друзей.
      </Text>
      <Field
        testID="referral-need"
        label="Сколько друзей нужно"
        value={need}
        onChangeText={setNeed}
        keyboardType="number-pad"
        maxLength={3}
      />
      <Field
        testID="referral-reward"
        label="Награда"
        value={reward}
        onChangeText={setReward}
        placeholder="Например: 100 алмазов Free Fire"
        maxLength={60}
      />
      <Btn
        testID="save-referral"
        title={rule ? 'Сохранить' : 'Включить награду'}
        small
        disabled={busy}
        onPress={save}
      />
      {rule && (
        <>
          <View style={s.gapTop} />
          <Btn
            title="Выключить награду"
            variant="danger"
            small
            disabled={busy}
            onPress={() => run(() => saveConfig('referral', null))}
          />
        </>
      )}
    </Card>
  );
}

// Задания: что сделать и какую награду получит клиент
function Tasks() {
  const s = useStyles(makeStyles);
  const { data, reload } = useRemote(useCallback(loadTasks, []));
  const { busy, run } = useAction(reload);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [reward, setReward] = useState('');
  const [days, setDays] = useState('7');

  const add = () => {
    if (title.trim().length < 3 || !reward.trim() || !(num(days) > 0)) {
      showAlert('Проверьте задание', 'Нужны название, награда и срок в днях.');
      return;
    }
    run(async () => {
      await saveTask({
        title: title.trim(),
        text: text.trim(),
        reward: reward.trim(),
        until: Date.now() + num(days) * DAY,
        createdAt: Date.now(),
      });
      setTitle('');
      setText('');
      setReward('');
    }, 'Задание опубликовано');
  };

  return (
    <>
      <Referral />
      {(data ?? []).map(task => (
        <Card key={task.id}>
          <Text style={s.title}>{task.title}</Text>
          <Text style={s.text}>
            {task.text}
            {'\n'}🎁 {task.reward} · до {formatDate(task.until)}
          </Text>
          <Btn
            title="Удалить"
            variant="danger"
            small
            disabled={busy}
            onPress={() => run(() => removeTask(task.id))}
          />
        </Card>
      ))}
      <Card>
        <Text style={s.title}>Новое задание</Text>
        <Field
          testID="task-title"
          label="Название"
          value={title}
          onChangeText={setTitle}
          placeholder="Например: Пригласи друга"
          maxLength={60}
        />
        <Field
          label="Что нужно сделать"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={500}
        />
        <Field
          testID="task-reward"
          label="Награда"
          value={reward}
          onChangeText={setReward}
          placeholder="Например: 100 BC или скидка 10%"
          maxLength={60}
        />
        <Field
          label="Сколько дней действует"
          value={days}
          onChangeText={setDays}
          keyboardType="decimal-pad"
          maxLength={4}
        />
        <Btn
          testID="save-task"
          title="Опубликовать задание"
          disabled={busy}
          onPress={add}
        />
      </Card>
    </>
  );
}

// Курсы: сколько рублей, тенге и долларов в одном сомони
function Rates() {
  const s = useStyles(makeStyles);
  const { cloud, refreshCloud } = useStore();
  const { busy, run } = useAction(refreshCloud);
  const foreign = (Object.keys(CURRENCIES) as Currency[]).filter(
    key => key !== 'TJS',
  );
  const [edited, setEdited] = useState<Record<string, string>>({});
  const value = (key: Currency) =>
    edited[key] ?? String(rateOf(key, cloud.config));

  const save = () => {
    const rates = Object.fromEntries(
      foreign.map(key => [key, num(value(key))]),
    );
    if (Object.values(rates).some(rate => !(rate > 0))) {
      showAlert('Проверьте курсы', 'Курс должен быть числом больше нуля.');
      return;
    }
    run(() => saveConfig('rates', rates), 'Курсы сохранены');
  };

  return (
    <Card>
      <Text style={s.text}>
        Цены записаны в сомони. Клиент из другой страны видит их в своей валюте
        — по этому курсу. Он же действует для цен аккаунтов.
      </Text>
      {foreign.map(key => (
        <Field
          key={key}
          testID={`rate-${key}`}
          label={`1 смн = … ${CURRENCIES[key].sign} (${CURRENCIES[key].name})`}
          value={value(key)}
          onChangeText={text => setEdited({ ...edited, [key]: text })}
          keyboardType="decimal-pad"
        />
      ))}
      <Btn
        testID="save-rates"
        title="Сохранить курсы"
        disabled={busy}
        onPress={save}
      />
    </Card>
  );
}

// Реквизиты: что клиент видит, когда выбрал способ оплаты
function Pay() {
  const s = useStyles(makeStyles);
  const { cloud, refreshCloud } = useStore();
  const { busy, run } = useAction(refreshCloud);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const value = (key: string) => edited[key] ?? cloud.config.pay?.[key] ?? '';

  return (
    <Card>
      <Text style={s.text}>
        Впишите номер карты или кошелька и имя получателя. Клиент видит только
        заполненные способы и копирует номер одним нажатием. Пустое поле —
        способ скрыт.
      </Text>
      {PAY_METHODS.map(method => (
        <Field
          key={method.key}
          testID={`pay-${method.key}`}
          label={`${method.name}${
            value(method.key).trim() ? ' ✅' : ' — скрыт'
          }`}
          value={value(method.key)}
          onChangeText={text => setEdited({ ...edited, [method.key]: text })}
          placeholder={method.hint}
          multiline
          maxLength={300}
        />
      ))}
      <Btn
        testID="save-pay"
        title="Сохранить реквизиты"
        disabled={busy}
        onPress={() =>
          run(
            () =>
              // реквизиты временно скрытых способов не стираются
              saveConfig('pay', {
                ...cloud.config.pay,
                ...Object.fromEntries(
                  PAY_METHODS.map(m => [m.key, value(m.key).trim()]),
                ),
              }),
            'Реквизиты сохранены',
          )
        }
      />
    </Card>
  );
}

// Код входа в KovriX A — только у владельца. Сотрудник вводит его на
// каждом новом телефоне; смена кода выкидывает всех, пока не введут новый.
function TeamCodeAdmin() {
  const s = useStyles(makeStyles);
  const { cloud, refreshCloud } = useStore();
  const { busy, run } = useAction(refreshCloud);
  const { data: saved, reload } = useRemote(loadTeamCode);
  const [code, setCode] = useState('');
  const on = !!cloud.config.teamOn;

  return (
    <Card>
      <Text style={s.title}>🔐 Код входа в KovriX A</Text>
      <Text style={s.text}>
        {on
          ? `Сейчас код: ${
              saved ?? '…'
            }. Без него заместители и админы не откроют KovriX A (приложение, сайт и бот команды) — даже с верным паролем. Вам код не нужен.`
          : 'Код выключен: в KovriX A входят по нику и паролю. Задайте код — и каждый сотрудник введёт его на своём телефоне.'}
      </Text>
      <Field
        testID="team-code-new"
        label={on ? 'Новый код (4–20 символов)' : 'Код (4–20 символов)'}
        value={code}
        onChangeText={setCode}
        autoCapitalize="none"
        maxLength={20}
      />
      <View style={s.actions}>
        <Btn
          testID="save-team-code"
          title={on ? 'Сменить код' : 'Включить код'}
          small
          disabled={busy || code.trim().length < 4}
          onPress={() =>
            run(async () => {
              await saveTeamCode(code);
              setCode('');
              reload();
            }, 'Код сохранён. Сообщите его команде.')
          }
        />
        {on && (
          <Btn
            title="Выключить код"
            variant="danger"
            small
            disabled={busy}
            onPress={() =>
              run(async () => {
                await saveTeamCode('');
                reload();
              }, 'Код выключен')
            }
          />
        )}
      </View>
    </Card>
  );
}

// галочки доступов заместителя
function PermList({
  value,
  onChange,
  disabled,
}: {
  value: Perms;
  onChange: (perms: Perms) => void;
  disabled?: boolean;
}) {
  const s = useStyles(makeStyles);
  const all = PERMS.every(perm => value[perm.key]);
  return (
    <View style={s.actions}>
      <Btn
        testID="perm-all"
        title={all ? '✕ Снять все доступы' : '★ Дать все доступы'}
        variant="soft"
        small
        disabled={disabled}
        onPress={() =>
          onChange(
            all
              ? {}
              : (Object.fromEntries(PERMS.map(p => [p.key, true])) as Perms),
          )
        }
      />
      {PERMS.map(perm => (
        <Btn
          key={perm.key}
          testID={`perm-${perm.key}`}
          title={`${value[perm.key] ? '✓' : '○'} ${perm.name}`}
          variant={value[perm.key] ? 'primary' : 'outline'}
          small
          disabled={disabled}
          onPress={() => onChange({ ...value, [perm.key]: !value[perm.key] })}
        />
      ))}
    </View>
  );
}

const defaultPerms = () =>
  Object.fromEntries(PERMS.filter(p => p.on).map(p => [p.key, true])) as Perms;

// Новый сотрудник: админ сам придумывает ему ник и пароль
function NewStaff({ onDone }: { onDone: () => void }) {
  const s = useStyles(makeStyles);
  const { busy, run } = useAction(onDone);
  const [nick, setNick] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRoleValue] = useState('deputy');
  const [perms, setPermsValue] = useState(defaultPerms);

  const add = () => {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{2,19}$/.test(nick.trim())) {
      showAlert(
        'Проверьте ник',
        'Ник — от 3 до 20 латинских букв и цифр, начинается с буквы.',
      );
      return;
    }
    if (password.length < 6) {
      showAlert('Короткий пароль', 'Пароль — минимум 6 символов.');
      return;
    }
    run(async () => {
      const user = await createStaff(
        nick.trim(),
        password,
        role as 'admin' | 'deputy',
        role === 'admin' ? {} : perms,
      );
      showAlert(
        'Сотрудник добавлен',
        `Ник: ${user.name}\nПароль: ${password}\nID: ${user.id}\n\nПередайте ему ник и пароль — он входит в приложение KovriX A на любом телефоне или на сайте команды.`,
      );
      setNick('');
      setPassword('');
    });
  };

  return (
    <Card>
      <Text style={s.title}>＋ Новый сотрудник</Text>
      <Field
        testID="staff-nick"
        label="Ник (латиницей)"
        value={nick}
        onChangeText={setNick}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
      />
      <Field
        testID="staff-password"
        label="Пароль (минимум 6 символов)"
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={100}
      />
      <Select
        label="Кто он"
        options={['deputy', 'admin']}
        render={key => (key === 'admin' ? 'Админ — всё' : 'Заместитель')}
        value={role}
        onChange={setRoleValue}
      />
      {role === 'deputy' && (
        <>
          <Text style={s.text}>Что ему разрешено:</Text>
          <PermList value={perms} onChange={setPermsValue} />
        </>
      )}
      <Btn
        testID="staff-create"
        title="Создать и дать доступ"
        disabled={busy}
        onPress={add}
        style={s.gapTop}
      />
    </Card>
  );
}

// Новый пароль сотруднику — если он его забыл
function StaffPassword({ user }: { user: User }) {
  const s = useStyles(makeStyles);
  const [password, setPassword] = useState('');
  const { busy, run } = useAction(() => setPassword(''));
  return (
    <View style={s.gapTop}>
      <Field
        testID={`password-${user.id}`}
        label="Новый пароль сотрудника (минимум 6 символов)"
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={100}
      />
      <Btn
        title="Сменить пароль"
        variant="soft"
        small
        disabled={busy || password.length < 6}
        onPress={() =>
          run(
            () => resetPassword(user.uid, password),
            `Пароль изменён. Передайте его сотруднику: ${password}`,
          )
        }
      />
    </View>
  );
}

const ROLE_NAMES: Record<Role, string> = {
  admin: 'Админ',
  deputy: 'Заместитель',
  bot: 'Бот',
};

// Люди: новый сотрудник, доступы заместителей, блокировка.
// Роли и доступы раздаёт только админ; заместитель с доступом
// «Блокировка» может только блокировать.
function People({
  users,
  reloadUsers,
}: {
  users: User[];
  reloadUsers: () => void;
}) {
  const s = useStyles(makeStyles);
  const { user: me, cloud } = useStore();
  const admin = cloud.role === 'admin';
  const [query, setQuery] = useState('');
  const [onlineOnly, setOnlineOnly] = useState<'all' | 'online'>('all');
  const { data, reload } = useRemote(
    useCallback(async () => {
      const [roles, perms, blocked, seen] = await Promise.all([
        loadRoles(),
        loadPerms(),
        loadBlocked(),
        loadSeen(),
      ]);
      return { roles, perms, blocked, seen, now: Date.now() };
    }, []),
    REFRESH_MS,
  );
  const seenAt = (uid: string) => data?.seen[uid];
  const online = (uid: string) =>
    !!data && (seenAt(uid) ?? 0) > data.now - ONLINE_MS;
  const { busy, run } = useAction(reload);
  const { run: runDelete } = useAction(() => {
    reload();
    reloadUsers();
  });
  const remove = (user: User) =>
    showAlert(
      `Удалить ${user.name}?`,
      `ID ${user.id}. Пропадут его заказы, объявления, фото и место в топе. Вернуть будет нельзя.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => runDelete(() => deleteUser(user), 'Аккаунт удалён'),
        },
      ],
    );
  const text = query.trim().toLowerCase();
  const onlineCount = users.filter(user => online(user.uid)).length;
  // сначала кто в сети, потом команда, потом клиенты — по последнему входу
  const found = users
    .filter(user =>
      `${user.name} ${user.id} ${user.phone}`.toLowerCase().includes(text),
    )
    .filter(user => onlineOnly === 'all' || online(user.uid))
    .sort(
      (a, b) =>
        Number(online(b.uid)) - Number(online(a.uid)) ||
        Number(!!data?.roles[b.uid]) - Number(!!data?.roles[a.uid]) ||
        (seenAt(b.uid) ?? 0) - (seenAt(a.uid) ?? 0) ||
        b.createdAt - a.createdAt,
    );

  return (
    <>
      {admin && (
        <NewStaff
          onDone={() => {
            reload();
            reloadUsers();
          }}
        />
      )}
      <Field
        testID="people-search"
        label="Поиск: имя, ID или телефон"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />
      <Chips
        options={[
          ['all', `Все (${users.length})`],
          ['online', `🟢 В сети (${onlineCount})`],
        ]}
        value={onlineOnly}
        onChange={setOnlineOnly}
      />
      {found.slice(0, 50).map(user => {
        const role = data?.roles[user.uid];
        const blocked = !!data?.blocked[user.uid];
        const self = user.uid === me?.uid;
        return (
          <Card key={user.uid}>
            <View style={s.head}>
              <Text style={s.title}>{user.name}</Text>
              {blocked ? (
                <Badge text="Заблокирован" tone="danger" />
              ) : role ? (
                <Badge text={ROLE_NAMES[role]} tone="info" />
              ) : null}
            </View>
            <Pairs
              pairs={[
                ['ID', String(user.id)],
                [
                  user.phone ? 'Телефон' : 'Ник',
                  user.phone || user.login || '—',
                ],
                ['Регистрация', formatDate(user.createdAt)],
                [
                  'В сети',
                  online(user.uid)
                    ? '🟢 сейчас'
                    : seenAt(user.uid)
                    ? `был(а) ${formatDate(seenAt(user.uid)!)}`
                    : 'ещё не заходил(а)',
                ],
              ]}
            />
            {admin && role === 'deputy' && (
              <>
                <Text style={s.text}>Доступы заместителя:</Text>
                <PermList
                  value={data?.perms[user.uid] ?? {}}
                  disabled={busy}
                  onChange={perms => run(() => setPerms(user.uid, perms))}
                />
              </>
            )}
            {!self && role !== 'bot' && (
              <View style={s.actions}>
                {admin && role !== 'admin' && (
                  <Btn
                    testID={`admin-${user.id}`}
                    title="Сделать админом"
                    variant="soft"
                    small
                    disabled={busy}
                    onPress={() => run(() => setRole(user.uid, 'admin'))}
                  />
                )}
                {admin && role !== 'deputy' && (
                  <Btn
                    testID={`deputy-${user.id}`}
                    title="Сделать заместителем"
                    variant="soft"
                    small
                    disabled={busy}
                    onPress={() =>
                      run(async () => {
                        // у нового заместителя сразу обычный набор доступов
                        if (!data?.perms[user.uid]) {
                          await setPerms(user.uid, defaultPerms());
                        }
                        await setRole(user.uid, 'deputy');
                      })
                    }
                  />
                )}
                {admin && role && (
                  <Btn
                    title="Снять доступ"
                    variant="outline"
                    small
                    disabled={busy}
                    onPress={() => run(() => setRole(user.uid, null))}
                  />
                )}
                {(admin || !role) && (
                  <Btn
                    testID={`block-${user.id}`}
                    title={blocked ? 'Разблокировать' : 'Заблокировать'}
                    variant="danger"
                    small
                    disabled={busy}
                    onPress={() => run(() => setBlocked(user.uid, !blocked))}
                  />
                )}
                {admin && (
                  <Btn
                    testID={`delete-${user.id}`}
                    title="Удалить аккаунт"
                    variant="danger"
                    small
                    disabled={busy}
                    onPress={() => remove(user)}
                  />
                )}
              </View>
            )}
            {admin && !self && (role === 'admin' || role === 'deputy') && (
              <StaffPassword user={user} />
            )}
          </Card>
        );
      })}
    </>
  );
}

// Вкладка «Ещё». Разделы видны по доступам: админу — все, заместителю —
// те, что админ отметил в его списке.
export default function ManageScreen({
  claims,
  orders,
  users,
  loading,
  error,
  reload,
}: {
  claims: Claim[];
  orders: Order[];
  users: User[];
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  const s = useStyles(makeStyles);
  const { cloud } = useStore();
  const open = [
    ...SECTIONS.filter(([, , perm]) => can(cloud, perm)),
    ...(cloud.owner
      ? [['code', 'Код KovriX A', 'block'] as [Section, string, Perm]]
      : []),
  ];
  const [picked, setSection] = useState<Section>('claims');
  const section = open.some(([key]) => key === picked) ? picked : open[0]?.[0];
  const chips =
    open.length > 1 ? (
      <Chips
        options={open.map(([key, name]) => [key, name])}
        value={section}
        onChange={setSection}
      />
    ) : null;

  if (section === 'claims') {
    return (
      <RequestsScreen
        kind="claims"
        items={claims}
        loading={loading}
        error={error}
        reload={reload}
        top={chips}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={reload} />
      }
    >
      <View style={readable}>
        {chips}
        {section === 'stats' ? (
          <Stats orders={orders} users={users} />
        ) : section === 'history' ? (
          <History />
        ) : section === 'news' ? (
          <NewsAdmin />
        ) : section === 'prices' ? (
          <Prices />
        ) : section === 'promos' ? (
          <>
            <Promos />
            <DailyCodeAdmin />
            <PromoCodes />
          </>
        ) : section === 'tasks' ? (
          <Tasks />
        ) : section === 'rates' ? (
          <Rates />
        ) : section === 'pay' ? (
          <Pay />
        ) : section === 'code' ? (
          <TeamCodeAdmin />
        ) : (
          <People users={users} reloadUsers={reload} />
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 14, paddingBottom: 28 },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    title: {
      flex: 1,
      color: c.text,
      fontSize: 16,
      fontWeight: '800',
      marginBottom: 6,
    },
    text: { color: c.muted, fontSize: 13, lineHeight: 19, marginBottom: 12 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    gapTop: { marginTop: 14 },
    filters: { flexDirection: 'row', gap: 10 },
    grow: { flex: 1 },
  });
