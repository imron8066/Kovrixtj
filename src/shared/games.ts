import { Game } from './types';

// Все игры, способы доната и цены. Чтобы поменять цену, поле или добавить
// игру — правьте этот файл, затем npm run web (сайт) и npm run apk (приложения).
// Цены в сомони. products — готовые пакеты, custom — любая сумма по курсу.
// Админ может поменять цены и курс прямо из приложения (config/prices в базе) —
// здесь записаны цены по умолчанию.
export const GAMES: Game[] = [
  {
    id: 'free_fire',
    name: 'Free Fire',
    tag: 'FF',
    colors: ['#ff9f1a', '#8a3b00'],
    currency: 'алмазов',
    method: 'По Player ID',
    steps: [
      'Откройте профиль в игре и скопируйте Player ID (цифры под ником).',
      'Выберите пакет алмазов или пропуск и оплатите заказ.',
      'Алмазы зачисляются прямо на аккаунт — пароль не нужен.',
    ],
    products: [
      // обычные цены; админ меняет их в «Цены и товары» (0 — товар скрыт),
      // цены по промокоду дня — в «Акции» → «Промокод дня»
      { title: '110 алмазов', price: 10 },
      { title: '341 алмаз', price: 30 },
      { title: '572 алмаза', price: 44 },
      { title: '1166 алмазов', price: 82 },
      { title: '2398 алмазов', price: 203 },
      { title: '6160 алмазов', price: 405 },
      { title: 'Пропуск прокачки 6 LVL', price: 7 },
      { title: 'Пропуск прокачки 10 LVL', price: 10 },
      { title: 'Пропуск прокачки 15 LVL', price: 12 },
      { title: 'Пропуск прокачки 20 LVL', price: 12 },
      { title: 'Пропуск прокачки 25 LVL', price: 15 },
      { title: 'Пропуск прокачки 30 LVL', price: 17 },
      { title: 'Ваучер на неделю Лайт', price: 8 },
      { title: 'Ваучер на неделю', price: 22 },
      { title: 'Ваучер на месяц', price: 58 },
    ],
    fields: [
      {
        key: 'player_id',
        label: 'Player ID',
        placeholder: '123456789',
        required: true,
        inputmode: 'numeric',
        pattern: '^\\d{6,12}$',
        hint: 'Player ID — от 6 до 12 цифр',
      },
      {
        key: 'nick',
        label: 'Ник (для проверки)',
        placeholder: 'необязательно',
      },
    ],
    images: [],
    accountAttrs: [
      { key: 'level', label: 'Уровень', inputmode: 'numeric' },
      { key: 'rank', label: 'Ранг' },
      { key: 'skins', label: 'Редкие скины / оружие' },
      { key: 'bind', label: 'Привязка (Google, Facebook, VK)' },
    ],
    lookup: {
      via: 'shop',
      field: 'player_id',
      gopay: ['FREEFIRE'],
      coda: { vppId: 270288, price: '200000.0000', type: 'FREEFIRE' },
    },
  },
  {
    id: 'black_russia',
    // пока не работает: плитка с пометкой, заказать нельзя
    off: true,
    name: 'Black Russia',
    tag: 'BR',
    colors: ['#ff4d4d', '#5c0a0a'],
    currency: 'BC',
    method: 'По нику и серверу',
    steps: [
      'Укажите сервер и ник персонажа точно как в игре (например Ivan_Ivanov).',
      'Введите, сколько Black Coins нужно, и оплатите заказ.',
      'BC придут на аккаунт после проверки оплаты — обычно 5–30 минут.',
    ],
    products: [],
    custom: {
      min: 50,
      max: 100000,
      quick: [100, 300, 500, 1000, 3000, 5000],
      rate: 0.13,
    },
    fields: [
      {
        key: 'server',
        label: 'Сервер',
        placeholder: 'например: RED',
        required: true,
      },
      {
        key: 'nick',
        label: 'Ник в игре',
        placeholder: 'Ivan_Ivanov',
        required: true,
        pattern: '^[A-Za-z]+_[A-Za-z]+$',
        hint: 'Ник должен быть в формате Имя_Фамилия латиницей',
      },
    ],
    // открытой проверки ника у игры нет — оператор сверяет по скриншоту
    images: [{ key: 'profile', label: 'Скриншот статистики персонажа' }],
    accountAttrs: [
      { key: 'server', label: 'Сервер', required: true },
      { key: 'level', label: 'Уровень', inputmode: 'numeric' },
      { key: 'money', label: 'Деньги в игре' },
      { key: 'property', label: 'Имущество (дом, авто, бизнес)' },
    ],
    sellGuide: [
      'Введите в чате /mm → «Статистика» и сделайте скриншот.',
      'Скриншот баланса: сколько Black Coins на аккаунте.',
      'Если есть бизнес — скриншот, сколько игровых рублей он приносит в день.',
      'Введите /time — на скриншоте будут время и дата в игре.',
      'Скриншот гаража: сколько авто и какие.',
      'Скриншот доната: сколько рублей задоначено на аккаунт.',
    ],
  },
  {
    id: 'pubg_mobile',
    // пока не работает: плитка с пометкой, заказать нельзя
    off: true,
    name: 'PUBG Mobile',
    tag: 'PUBG',
    colors: ['#f2c230', '#6b4a00'],
    currency: 'UC',
    method: 'По ID персонажа',
    steps: [
      'В игре нажмите на аватар — ID персонажа указан под ником.',
      'Выберите пакет UC и оплатите заказ.',
      'UC придут на аккаунт после проверки оплаты. Вход в аккаунт не требуется.',
    ],
    products: [
      { title: '60 UC', price: 11 },
      { title: '325 UC', price: 55 },
      { title: '660 UC', price: 108 },
      { title: '1800 UC', price: 270 },
      { title: '3850 UC', price: 540 },
      { title: '8100 UC', price: 1070 },
    ],
    fields: [
      {
        key: 'player_id',
        label: 'ID персонажа',
        placeholder: '5123456789',
        required: true,
        inputmode: 'numeric',
        pattern: '^\\d{8,12}$',
        hint: 'ID персонажа — от 8 до 12 цифр',
      },
      {
        key: 'nick',
        label: 'Ник (для проверки)',
        placeholder: 'необязательно',
      },
    ],
    images: [],
    accountAttrs: [
      { key: 'level', label: 'Уровень', inputmode: 'numeric' },
      { key: 'rank', label: 'Ранг (например Ace)' },
      { key: 'skins', label: 'Скины, сеты, прокачанное оружие' },
      { key: 'bind', label: 'Привязка (почта, Facebook, Twitter)' },
    ],
    lookup: { via: 'shop', field: 'player_id', gopay: ['PUBGM', 'PUBG_ID'] },
  },
  {
    id: 'fc_mobile',
    // пока не работает: плитка с пометкой, заказать нельзя
    off: true,
    name: 'FC Mobile',
    tag: 'FC',
    colors: ['#3ddc84', '#0b3d24'],
    currency: 'FC Points',
    method: 'По ID игрока',
    steps: [
      'В игре откройте Настройки → Аккаунт и скопируйте ID игрока (UID).',
      'Выберите пакет FC Points и оплатите заказ.',
      'FC Points придут на аккаунт после проверки оплаты.',
    ],
    // ЦЕНЫ-ПРИМЕРЫ: поставьте свои
    products: [
      { title: '100 FC Points', price: 12 },
      { title: '520 FC Points', price: 58 },
      { title: '1070 FC Points', price: 115 },
      { title: '2200 FC Points', price: 230 },
      { title: '5750 FC Points', price: 570 },
    ],
    fields: [
      {
        key: 'player_id',
        label: 'ID игрока (UID)',
        placeholder: '1234567890',
        required: true,
        inputmode: 'numeric',
        pattern: '^\\d{6,20}$',
        hint: 'ID игрока — только цифры, от 6 до 20',
      },
      {
        key: 'nick',
        label: 'Ник (для проверки)',
        placeholder: 'необязательно',
      },
    ],
    images: [],
    accountAttrs: [
      { key: 'ovr', label: 'OVR команды', inputmode: 'numeric' },
      { key: 'players', label: 'Лучшие игроки' },
      { key: 'bind', label: 'Привязка (EA, Google, Facebook)' },
    ],
    lookup: { via: 'shop', field: 'player_id', gopay: ['FC_MOBILE'] },
  },
  {
    id: 'efootball',
    // пока не работает: плитка с пометкой, заказать нельзя
    off: true,
    name: 'eFootball',
    tag: 'eF',
    colors: ['#4d7cff', '#0c1d5c'],
    currency: 'монет',
    method: 'Через оператора',
    steps: [
      'В игре откройте Extras → User Information и перепишите ID пользователя.',
      'Выберите пакет монет, оплатите заказ и приложите скриншот профиля.',
      'Оператор сверит аккаунт, напишет вам и зачислит монеты.',
    ],
    // ЦЕНЫ-ПРИМЕРЫ: поставьте свои
    products: [
      { title: '130 монет', price: 14 },
      { title: '300 монет', price: 30 },
      { title: '550 монет', price: 55 },
      { title: '1040 монет', price: 105 },
      { title: '2130 монет', price: 210 },
    ],
    fields: [
      {
        key: 'player_id',
        label: 'ID пользователя',
        placeholder: 'ID из User Information',
        required: true,
      },
      { key: 'nick', label: 'Ник в игре', required: true },
    ],
    // открытой проверки ID у игры нет — оператор сверяет по скриншоту
    images: [{ key: 'profile', label: 'Скриншот профиля (User Information)' }],
    accountAttrs: [
      { key: 'strength', label: 'Сила команды', inputmode: 'numeric' },
      { key: 'players', label: 'Лучшие игроки' },
      { key: 'coins', label: 'Монеты и GP на аккаунте' },
      { key: 'bind', label: 'Привязка (Konami ID, Google)' },
    ],
  },
  {
    id: 'clash_of_clans',
    // пока не работает: плитка с пометкой, заказать нельзя
    off: true,
    name: 'Clash of Clans',
    tag: 'CoC',
    colors: ['#ffc83d', '#6b3a00'],
    currency: 'гемов',
    method: 'Через оператора (Supercell ID)',
    steps: [
      'Откройте профиль в игре и скопируйте тег игрока (начинается с #).',
      'Выберите пакет, оплатите заказ и приложите чек.',
      'Оператор напишет вам и зачислит покупку через Supercell ID.',
    ],
    // ЦЕНЫ-ПРИМЕРЫ: поставьте свои
    products: [
      { title: '80 гемов', price: 12 },
      { title: '500 гемов', price: 58 },
      { title: '1200 гемов', price: 115 },
      { title: '2500 гемов', price: 230 },
      { title: 'Золотой пропуск', price: 80 },
    ],
    fields: [
      {
        key: 'tag',
        label: 'Тег игрока',
        placeholder: '#2PP0LYQ8',
        required: true,
        pattern: '^\\s*#?[0289PYLQGRJCUVOpylqgrjcuvo]{3,12}\\s*$',
        hint: 'Тег — как в профиле игры, например #2PP0LYQ8',
      },
      {
        key: 'nick',
        label: 'Ник (для проверки)',
        placeholder: 'необязательно',
      },
    ],
    images: [],
    accountAttrs: [
      { key: 'th', label: 'Уровень ратуши', inputmode: 'numeric' },
      { key: 'heroes', label: 'Герои и их уровни' },
      { key: 'gems', label: 'Гемы на аккаунте' },
    ],
    lookup: {
      via: 'supercell',
      field: 'tag',
      host: 'cocproxy.royaleapi.dev',
      key: 'coc',
    },
  },
  {
    id: 'clash_royale',
    // пока не работает: плитка с пометкой, заказать нельзя
    off: true,
    name: 'Clash Royale',
    tag: 'CR',
    colors: ['#3fa9ff', '#0a2f66'],
    currency: 'гемов',
    method: 'Через оператора (Supercell ID)',
    steps: [
      'Откройте профиль в игре и скопируйте тег игрока (начинается с #).',
      'Выберите пакет, оплатите заказ и приложите чек.',
      'Оператор напишет вам и зачислит покупку через Supercell ID.',
    ],
    // ЦЕНЫ-ПРИМЕРЫ: поставьте свои
    products: [
      { title: '80 гемов', price: 12 },
      { title: '500 гемов', price: 58 },
      { title: '1200 гемов', price: 115 },
      { title: '2500 гемов', price: 230 },
      { title: 'Pass Royale', price: 140 },
    ],
    fields: [
      {
        key: 'tag',
        label: 'Тег игрока',
        placeholder: '#2PP0LYQ8',
        required: true,
        pattern: '^\\s*#?[0289PYLQGRJCUVOpylqgrjcuvo]{3,12}\\s*$',
        hint: 'Тег — как в профиле игры, например #2PP0LYQ8',
      },
      {
        key: 'nick',
        label: 'Ник (для проверки)',
        placeholder: 'необязательно',
      },
    ],
    images: [],
    accountAttrs: [
      { key: 'level', label: 'Уровень короля', inputmode: 'numeric' },
      { key: 'trophies', label: 'Кубки', inputmode: 'numeric' },
      { key: 'cards', label: 'Карты и их уровни' },
    ],
    lookup: {
      via: 'supercell',
      field: 'tag',
      host: 'proxy.royaleapi.dev',
      key: 'cr',
    },
  },
  {
    id: 'standoff2',
    // пока не работает: плитка с пометкой, заказать нельзя
    off: true,
    name: 'Standoff 2',
    tag: 'SO2',
    colors: ['#5b8cff', '#14235e'],
    currency: 'голды',
    method: 'Через рынок (выкуп скина)',
    steps: [
      'Введите, сколько голды хотите получить.',
      'Выставьте любой скин на рынок в игре — так, чтобы после комиссии рынка вышла нужная сумма.',
      'Впишите название скина, цену лота и приложите скриншот лота.',
      'После оплаты мы выкупим ваш скин — голда придёт на аккаунт.',
    ],
    products: [],
    custom: {
      min: 100,
      max: 100000,
      quick: [100, 500, 1000, 3000, 5000, 10000],
      rate: 0.12,
    },
    fields: [
      {
        key: 'game_id',
        label: 'ID в игре',
        placeholder: '12345678',
        required: true,
        inputmode: 'numeric',
        pattern: '^\\d{5,12}$',
        hint: 'ID в игре — от 5 до 12 цифр',
      },
      {
        key: 'skin',
        label: 'Название скина на рынке',
        placeholder: 'например: AKR "Carbon"',
        required: true,
      },
      {
        key: 'lot_price',
        label: 'Цена лота на рынке (G)',
        placeholder: '125.00',
        required: true,
        inputmode: 'decimal',
        pattern: '^\\d+([.,]\\d{1,2})?$',
        hint: 'Цена лота — число, например 125.00',
      },
    ],
    images: [{ key: 'lot', label: 'Скриншот лота на рынке' }],
    accountAttrs: [
      { key: 'level', label: 'Уровень', inputmode: 'numeric' },
      { key: 'rank', label: 'Звание' },
      { key: 'gold', label: 'Голда на аккаунте' },
      { key: 'skins', label: 'Скины, ножи, перчатки' },
    ],
  },
];

export const gameById = (id: string) => GAMES.find(g => g.id === id);
