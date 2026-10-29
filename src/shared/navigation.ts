// Экраны, которые открываются поверх вкладки. id — что именно открыть:
//   game — донат игры, market — витрина аккаунтов игры, sell — форма
//   продажи (id игры); lot — объявление, sold — «аккаунт продан» (код);
//   chat — чат (его номер); games — все мини-игры; play — мини-игра
//   ('' — «Алмазный дождь», quiz — викторина, pairs — «Найди пару»)
//   group — для game: какую группу товаров открыть (gems, voucher, pass)
export type Route = {
  name: 'game' | 'market' | 'sell' | 'lot' | 'sold' | 'chat' | 'games' | 'play';
  id: string;
  group?: string;
};

export interface Nav {
  push: (route: Route) => void;
  back: () => void;
  setTab: (tab: string) => void;
}
