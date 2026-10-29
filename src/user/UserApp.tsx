import React, { useCallback } from 'react';
import { loadChats } from '../shared/api';
import { APP_NAME, REFRESH_MS } from '../shared/config';
import { gameById } from '../shared/games';
import ChatScreen from '../shared/screens/ChatScreen';
import ProfileScreen from '../shared/screens/ProfileScreen';
import { AppRoot, Shell, TabItem } from '../shared/Shell';
import { useRemote, useStore } from '../shared/store';
import AnswersScreen from './screens/AnswersScreen';
import GameScreen from './screens/GameScreen';
import HomeScreen from './screens/HomeScreen';
import LotScreen from './screens/LotScreen';
import MarketScreen from './screens/MarketScreen';
import RewardsScreen from './screens/RewardsScreen';
import SellFormScreen from './screens/SellFormScreen';
import SellScreen from './screens/SellScreen';
import SoldScreen from './screens/SoldScreen';
import GamesScreen, { titleOf } from './screens/GamesScreen';
import PairsScreen from './screens/PairsScreen';
import QuizScreen from './screens/QuizScreen';
import WaitGameScreen from './screens/WaitGameScreen';

function Main() {
  const { user } = useStore();
  const uid = user?.uid ?? '';
  // число на вкладке «Ответы» — чаты с непрочитанными сообщениями
  const { data: chats } = useRemote(
    useCallback(async () => (uid ? loadChats(uid) : []), [uid]),
    REFRESH_MS,
  );

  const tabs: TabItem[] = [
    { tab: 'donate', icon: '💎', label: 'Донат', title: APP_NAME },
    { tab: 'sell', icon: '🏷', label: 'Аккаунты', title: 'Купить и продать' },
    {
      tab: 'answers',
      icon: '💬',
      label: 'Ответы',
      title: 'Ответы',
      badge: (chats ?? []).filter(chat => chat.unread).length,
    },
    { tab: 'rewards', icon: '🏆', label: 'Топ', title: 'Топ и задания' },
    { tab: 'profile', icon: '👤', label: 'Профиль', title: 'Профиль' },
  ];

  return (
    <Shell
      tabs={tabs}
      slogan="Донат в игры и продажа аккаунтов"
      registration
      // джойстик в шапке — сразу к мини-играм
      actions={[
        {
          icon: '🕹️',
          testID: 'header-games',
          onPress: nav => nav.push({ name: 'games', id: '' }),
        },
      ]}
      render={(tab, route, nav) => {
        if (route) {
          const { name, id } = route;
          const game = gameById(id)?.name;
          return name === 'game'
            ? {
                title: game,
                screen: (
                  <GameScreen key={id} id={id} group={route.group} nav={nav} />
                ),
              }
            : name === 'market'
            ? {
                title: `Аккаунты ${game ?? ''}`,
                screen: <MarketScreen key={id} id={id} nav={nav} />,
              }
            : name === 'sell'
            ? {
                title: 'Продать аккаунт',
                screen: <SellFormScreen key={id} id={id} nav={nav} />,
              }
            : name === 'lot'
            ? {
                title: `Объявление ${id}`,
                screen: <LotScreen key={id} id={id} nav={nav} />,
              }
            : name === 'sold'
            ? {
                title: 'Аккаунт продан',
                screen: <SoldScreen key={id} id={id} nav={nav} />,
              }
            : name === 'games'
            ? { title: 'Мини-игры', screen: <GamesScreen nav={nav} /> }
            : name === 'play'
            ? {
                title: titleOf(id),
                screen:
                  id === 'quiz' ? (
                    <QuizScreen key={id} />
                  ) : id === 'pairs' ? (
                    <PairsScreen key={id} />
                  ) : (
                    <WaitGameScreen key={id} />
                  ),
              }
            : { title: 'Чат', screen: <ChatScreen key={id} id={id} owner={uid} /> };
        }
        return {
          screen:
            tab === 'sell' ? (
              <SellScreen nav={nav} />
            ) : tab === 'answers' ? (
              <AnswersScreen nav={nav} />
            ) : tab === 'rewards' ? (
              <RewardsScreen />
            ) : tab === 'profile' ? (
              <ProfileScreen nav={nav} />
            ) : (
              <HomeScreen nav={nav} />
            ),
        };
      }}
    />
  );
}

// Приложение клиента (Kovrix): донат, витрина и продажа аккаунтов, ответы
// и чаты, топ и задания. Приложение админа — src/admin/AdminApp.tsx.
export default function UserApp() {
  return (
    <AppRoot>
      <Main />
    </AppRoot>
  );
}
