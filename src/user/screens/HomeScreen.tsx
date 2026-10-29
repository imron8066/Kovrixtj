import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../../shared/i18n/Text';
import { MOTTO } from '../../shared/config';
import { gameById, GAMES } from '../../shared/games';
import { Nav } from '../../shared/navigation';
import { readable, useLayout } from '../../shared/platform';
import { useStore } from '../../shared/store';
import { P, R, Theme, useStyles, useTheme } from '../../shared/theme';
import { GameBanner, Row } from '../../shared/ui';
import {
  formatDate,
  priced,
  productGroups,
  promoFor,
} from '../../shared/utils';
import { MiniGameTiles } from './GamesScreen';

const QUICK = [
  { group: 'gems', icon: '💎', name: 'Алмазы' },
  { group: 'voucher', icon: '🎟️', name: 'Ваучеры' },
  { group: 'pass', icon: '🎫', name: 'Пропуск' },
];

// Главная: приветствие, быстрый выбор товара (алмазы, ваучеры, пропуск),
// акции, плитки игр, новости, мини-игры и остальное
export default function HomeScreen({ nav }: { nav: Nav }) {
  const s = useStyles(makeStyles);
  const c = useTheme();
  const { user, cloud } = useStore();
  const { tiles } = useLayout();
  const now = Date.now();
  const promos = cloud.promos.filter(p => p.until > now);
  // новости админа за последнюю неделю
  const news = cloud.news.filter(n => n.at > now - 7 * 864e5).slice(0, 3);
  const stats = cloud.config.stats;
  // первая работающая игра — для быстрых кнопок «Алмазы / Ваучеры / Пропуск»
  const base = GAMES.find(g => !g.off);
  const shop = base && priced(base, cloud.config);
  const groups = shop ? productGroups(shop.products) : [];
  const from = (group: string) => {
    const prices = groups
      .find(g => g.key === group)
      ?.items.map(({ p }) => p.price);
    return prices?.length ? Math.min(...prices) : null;
  };

  return (
    <ScrollView contentContainerStyle={s.content}>
      <View style={readable}>
        {/* баннер: приветствие и сразу кнопка покупки алмазов; у «Кибера» —
            тёмный в светящейся рамке, с логотипом вместо алмаза */}
        <View style={s.hero}>
          <View style={[s.heroRing, s.heroRingBig]} />
          <View style={[s.heroRing, s.heroRingSmall]} />
          {c.grid ? (
            <Image source={LOGO} style={s.heroLogo} />
          ) : (
            <Text style={s.heroGem}>💎</Text>
          )}
          <Text style={s.motto}>{MOTTO}</Text>
          <Text style={s.heroTitle} numberOfLines={2}>
            Привет, {user?.name}!
          </Text>
          <Text style={s.heroText}>Что покупаем сегодня?</Text>
          {!!shop && (
            <TouchableOpacity
              testID="hero-buy"
              activeOpacity={0.85}
              style={s.heroBtn}
              onPress={() =>
                nav.push({ name: 'game', id: shop.id, group: 'gems' })
              }
            >
              <Text style={s.heroBtnText}>Купить алмазы →</Text>
            </TouchableOpacity>
          )}
        </View>
        {!!stats?.users && (
          <Text style={s.count}>
            {`📲 Kovrix скачали уже ${Math.max(
              stats.users,
              stats.downloads ?? 0,
            )} человек`}
          </Text>
        )}

        {promos.map(promo => (
          <View key={promo.id} style={s.promo}>
            <Text style={s.promoPercent}>−{promo.percent}%</Text>
            <View style={s.flex}>
              <Text style={s.promoTitle}>{promo.title}</Text>
              <Text style={s.promoText}>
                {gameById(promo.game)?.name ?? 'На все игры'} · до{' '}
                {formatDate(promo.until)}
              </Text>
            </View>
          </View>
        ))}

        {/* быстрый выбор, как в Telegram-боте: сразу нужная группа товаров */}
        {!!shop && (
          <View style={s.quick}>
            {QUICK.map(q => (
              <TouchableOpacity
                key={q.group}
                testID={`quick-${q.group}`}
                activeOpacity={0.85}
                style={s.quickTile}
                onPress={() =>
                  nav.push({ name: 'game', id: shop.id, group: q.group })
                }
              >
                <View style={s.quickIconBox}>
                  <Text style={s.quickIcon}>{q.icon}</Text>
                </View>
                <Text style={s.quickName}>{q.name}</Text>
                <Text style={s.quickFrom}>
                  {from(q.group) === null ? '—' : `от ${from(q.group)} смн`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={s.section}>Пополнить игру</Text>
        <View style={s.games}>
          {GAMES.map(game => {
            const promo = promoFor(promos, game.id);
            return (
              <GameBanner
                key={game.id}
                game={game}
                wide
                badge={promo ? `−${promo.percent}%` : undefined}
                style={{
                  width: tiles === 1 ? '100%' : `${100 / tiles - 1.8}%`,
                }}
                onPress={() => nav.push({ name: 'game', id: game.id })}
              />
            );
          })}
        </View>

        {news.map(item => (
          <View key={item.id} style={s.news}>
            <Text style={s.newsHead}>📢 Новости · {formatDate(item.at)}</Text>
            <Text style={s.newsText}>{item.text}</Text>
          </View>
        ))}

        <View style={s.sectionRow}>
          <Text style={s.section}>Мини-игры</Text>
          <Text
            testID="open-games"
            style={s.more}
            onPress={() => nav.push({ name: 'games', id: '' })}
          >
            Все и топ ›
          </Text>
        </View>
        <MiniGameTiles nav={nav} />

        <Row
          testID="open-sell"
          icon="🏷"
          title="Аккаунты: купить или продать"
          text="Витрина аккаунтов и ваше объявление"
          onPress={() => nav.setTab('sell')}
        />
        <Row
          testID="open-invite"
          icon="👥"
          title="Пригласи друга"
          text={
            cloud.config.referral?.reward
              ? `Награда: ${cloud.config.referral.reward}`
              : 'Ваша ссылка-приглашение и друзья'
          }
          onPress={() => nav.setTab('rewards')}
        />
        <Row
          icon="🏆"
          title="Топ и задания"
          text="Кто больше задонатил и награды от админа"
          onPress={() => nav.setTab('rewards')}
        />
      </View>
    </ScrollView>
  );
}

const LOGO = require('../../shared/assets/logo.png');

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 16, paddingTop: 4 },
    flex: { flex: 1 },
    // баннер цвета темы; круги справа — свечение без градиентов
    hero: {
      backgroundColor: c.grid ? c.card : c.primary,
      borderWidth: c.grid ? 1.5 : 0,
      borderColor: c.primary,
      borderRadius: c.radius ? R(c) + 4 : 28,
      paddingVertical: 20,
      paddingHorizontal: 20,
      marginBottom: 10,
      overflow: 'hidden',
    },
    heroRing: {
      position: 'absolute',
      backgroundColor: c.grid ? c.primary : '#ffffff',
    },
    heroRingBig: {
      width: 220,
      height: 220,
      borderRadius: 110,
      right: -70,
      top: -60,
      opacity: 0.12,
    },
    heroRingSmall: {
      width: 120,
      height: 120,
      borderRadius: 60,
      right: -10,
      top: 20,
      opacity: 0.14,
    },
    heroLogo: {
      position: 'absolute',
      right: 14,
      top: 16,
      width: 74,
      height: 74,
      borderRadius: 37,
    },
    heroGem: {
      position: 'absolute',
      right: 18,
      top: 22,
      fontSize: 54,
    },
    quick: { flexDirection: 'row', gap: 10, marginBottom: 22 },
    quickTile: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 16,
      borderRadius: R(c),
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    quickIconBox: {
      width: 52,
      height: 52,
      borderRadius: c.radius ? 14 : 26,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickIcon: { fontSize: 26 },
    quickName: { color: c.text, fontSize: 14, fontWeight: '900', marginTop: 8 },
    quickFrom: {
      color: c.primary,
      fontSize: 12,
      fontWeight: '800',
      marginTop: 2,
    },
    motto: {
      color: c.grid ? c.primary : c.onPrimary,
      opacity: 0.7,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: 8,
      marginRight: 70,
    },
    heroTitle: {
      fontSize: 26,
      fontWeight: '900',
      color: c.grid ? c.text : c.onPrimary,
      marginRight: 70,
    },
    heroText: {
      color: c.grid ? c.textSoft : c.onPrimary,
      opacity: 0.8,
      fontSize: 15,
      fontWeight: '600',
      marginTop: 4,
    },
    heroBtn: {
      alignSelf: 'flex-start',
      marginTop: 16,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: P(c),
      backgroundColor: c.grid ? c.primary : c.onPrimary,
    },
    heroBtnText: {
      color: c.grid ? c.onPrimary : c.primary,
      fontSize: 15,
      fontWeight: '900',
      textTransform: c.caps ? 'uppercase' : 'none',
    },
    count: {
      color: c.muted,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 14,
    },
    promo: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      marginBottom: 12,
      borderRadius: R(c),
      backgroundColor: c.dangerSoft,
      borderWidth: 1,
      borderColor: c.dangerBorder,
    },
    promoPercent: {
      color: c.danger,
      fontSize: 26,
      fontWeight: '900',
      marginRight: 12,
    },
    news: {
      padding: 16,
      marginBottom: 12,
      borderRadius: R(c),
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderLeftWidth: 4,
      borderLeftColor: c.primary,
    },
    newsHead: {
      color: c.primary,
      fontSize: 12,
      fontWeight: '900',
      marginBottom: 6,
    },
    newsText: { color: c.text, fontSize: 15, lineHeight: 21 },
    promoTitle: { color: c.text, fontSize: 16, fontWeight: '800' },
    promoText: { color: c.textSoft, fontSize: 13, marginTop: 2 },
    section: {
      fontSize: c.caps ? 18 : 21,
      fontWeight: '900',
      color: c.text,
      marginBottom: 12,
      letterSpacing: c.caps ? 1.2 : 0.2,
      textTransform: c.caps ? 'uppercase' : 'none',
    },
    sectionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
    },
    more: { color: c.primary, fontSize: 14, fontWeight: '900' },
    games: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 12,
      marginBottom: 16,
    },
  });
