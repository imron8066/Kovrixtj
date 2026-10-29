import { useEffect, useState } from 'react';
import { ImageSourcePropType } from 'react-native';
import { loadCovers } from './api';

// Обложки игр для плиток 16:9 (1280 × 720, JPG). Новая обложка: положите
// файл в assets/games/<id игры>.jpg и допишите строку сюда, а для сайта —
// тот же файл в web/shared/games/ и id в COVERS в web/shared/core.js.
export const COVERS: Record<string, ImageSourcePropType> = {
  free_fire: require('./assets/games/free_fire.jpg'),
  // остальные нарисованы scripts/art/brand (bash scripts/art.sh brand)
  black_russia: require('./assets/games/black_russia.jpg'),
  pubg_mobile: require('./assets/games/pubg_mobile.jpg'),
  fc_mobile: require('./assets/games/fc_mobile.jpg'),
  efootball: require('./assets/games/efootball.jpg'),
  clash_of_clans: require('./assets/games/clash_of_clans.jpg'),
  clash_royale: require('./assets/games/clash_royale.jpg'),
  standoff2: require('./assets/games/standoff2.jpg'),
};

// Фото, которое админ поставил в KovriX A («Цены и товары» → «Обложка»),
// важнее встроенной обложки. Грузятся один раз за запуск; после смены
// обложки админ вызывает reloadCovers.
let remote: Record<string, string> = {};
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function reloadCovers() {
  loading = loadCovers()
    .then(found => {
      remote = found ?? {};
      listeners.forEach(notify => notify());
    })
    .catch(() => {});
  return loading;
}

export function useCover(id: string): ImageSourcePropType | undefined {
  const [, redraw] = useState(0);
  useEffect(() => {
    const notify = () => redraw(n => n + 1);
    listeners.add(notify);
    if (!loading) {
      reloadCovers();
    }
    return () => {
      listeners.delete(notify);
    };
  }, []);
  return remote[id] ? { uri: remote[id] } : COVERS[id];
}
