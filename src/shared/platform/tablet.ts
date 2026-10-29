// Настройки для планшетов (iPad, Android-планшеты) и больших окон
// на компьютере. Планшетом считаем экран, у которого короткая
// сторона не меньше minShortSide.
export const TABLET = {
  minShortSide: 600,
  // с какой ширины вместо нижних вкладок показываем боковое меню
  sidebarFrom: 900,
  sidebarWidth: 240,
  // карточки объявлений не уже этого значения
  minColumnWidth: 220,
  maxColumns: 4,
  // формы не растягиваем на весь широкий экран
  maxReadableWidth: 760,
};

// Для форм, профиля и объявления: на телефоне — вся
// ширина, на планшете и компьютере — колонка по центру
export const readable = {
  width: '100%',
  maxWidth: TABLET.maxReadableWidth,
  alignSelf: 'center',
} as const;
