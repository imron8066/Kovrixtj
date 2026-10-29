import React, { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../shared/i18n/Text';
import {
  create,
  inviteLink,
  loadDonations,
  loadInvites,
  loadTasks,
  mine,
} from '../../shared/api';
import { APP_NAME, SHARE_URL } from '../../shared/config';
import { readable } from '../../shared/platform';
import { showAlert } from '../../shared/platform/alert';
import { useRemote, useStore } from '../../shared/store';
import { Theme, useStyles } from '../../shared/theme';
import { Claim, Invite, Task } from '../../shared/types';
import { Badge, Btn, Card, Chips, Field } from '../../shared/ui';
import {
  currencyOf,
  errorText,
  formatDate,
  money,
  Period,
  PERIODS,
  ranking,
  STATUS,
} from '../../shared/utils';

const MEDALS = ['🥇', '🥈', '🥉'];

// Задание: что сделать, награда и поле «как выполнил»
function TaskCard({
  task,
  claim,
  onSent,
}: {
  task: Task;
  claim?: Claim;
  onSent: () => void;
}) {
  const s = useStyles(makeStyles);
  const { user } = useStore();
  const [proof, setProof] = useState('');
  const [busy, setBusy] = useState(false);
  // после отказа задание можно отправить ещё раз
  const open = !claim || claim.status === 'rejected';

  const send = async () => {
    if (!user) {
      return;
    }
    setBusy(true);
    try {
      await create(
        'claims',
        {
          task: task.id,
          title: task.title,
          reward: task.reward,
          uid: user.uid,
          proof: proof.trim(),
          status: 'new',
          createdAt: Date.now(),
          client: { id: user.id, name: user.name, phone: user.phone },
        },
        [],
      );
      onSent();
    } catch (e) {
      showAlert('Не отправлено', errorText(e));
    }
    setBusy(false);
  };

  return (
    <Card>
      <View style={s.head}>
        <Text style={s.title}>{task.title}</Text>
        {claim && <Badge {...STATUS.claims[claim.status]} />}
      </View>
      <Text style={s.text}>{task.text}</Text>
      <Text style={s.reward}>🎁 Награда: {task.reward}</Text>
      <Text style={s.date}>До {formatDate(task.until)}</Text>
      {!!claim?.note && <Text style={s.text}>Ответ: {claim.note}</Text>}
      {open && (
        <>
          <Field
            testID={`proof-${task.id}`}
            label="Как выполнили (ник в игре, ссылка, комментарий)"
            value={proof}
            onChangeText={setProof}
            maxLength={300}
          />
          <Btn
            testID={`claim-${task.id}`}
            title="Я выполнил — получить награду"
            small
            disabled={busy || proof.trim().length < 3}
            onPress={send}
          />
        </>
      )}
    </Card>
  );
}

// «Пригласи друга»: личная ссылка, сколько друзей пришло и награда
// за каждые need друзей (условие задаёт админ в «Задания»)
function InviteCard({
  invites,
  claims,
  onSent,
}: {
  invites: Invite[];
  claims: Claim[];
  onSent: () => void;
}) {
  const s = useStyles(makeStyles);
  const { user, cloud } = useStore();
  const [busy, setBusy] = useState(false);
  if (!user) {
    return null;
  }
  const link = inviteLink(SHARE_URL, user.id);
  const rule = cloud.config.referral;
  const need = rule && rule.need > 0 ? rule.need : 0;
  const earned = need ? Math.floor(invites.length / need) : 0;
  const claimOf = (level: number) =>
    claims.find(claim => claim.task === `invite${level}`);
  // первая заработанная, но ещё не полученная награда
  let level = 0;
  for (let l = 1; l <= earned; l++) {
    const claim = claimOf(l);
    if (!claim || claim.status === 'rejected') {
      level = l;
      break;
    }
  }
  const waiting = claims.filter(
    claim => claim.task.startsWith('invite') && claim.status === 'new',
  ).length;
  const left = need ? need - (invites.length % need) : 0;

  const share = () =>
    Share.share({
      message: `Заходи в ${APP_NAME} — донат в игры быстро и дёшево, покупка и продажа аккаунтов. Регистрируйся по моей ссылке: ${link}\nИли укажи мой ID при регистрации: ${user.id}`,
    }).catch(() => {});

  const claim = async () => {
    setBusy(true);
    try {
      await create(
        'claims',
        {
          task: `invite${level}`,
          title: `Пригласил ${level * need} друзей`,
          reward: rule!.reward,
          uid: user.uid,
          proof: invites
            .slice(0, level * need)
            .map(friend => friend.name)
            .join(', '),
          status: 'new',
          createdAt: Date.now(),
          client: { id: user.id, name: user.name, phone: user.phone },
        },
        [],
      );
      showAlert('Заявка отправлена', 'Админ проверит друзей и выдаст награду.');
      onSent();
    } catch (e) {
      showAlert('Не отправлено', errorText(e));
    }
    setBusy(false);
  };

  return (
    <Card>
      <Text style={s.title}>👥 Пригласи друга</Text>
      <Text style={s.text}>
        {need
          ? `За каждые ${need} друзей, которые зарегистрируются по вашей ссылке, — ${
              rule!.reward
            }.`
          : 'Отправьте друзьям ссылку — бот зарегистрирует их и засчитает вам.'}
      </Text>
      <Text style={s.text}>
        Друг может и сам указать ваш ID {user.id} при регистрации.
      </Text>
      <Text style={s.reward}>
        Приглашено: {invites.length}
        {need && !level ? ` · до награды ещё ${left}` : ''}
      </Text>
      {!!invites.length && (
        <Text style={s.date}>
          {invites
            .slice(0, 5)
            .map(friend => friend.name)
            .join(', ')}
          {invites.length > 5 ? ` и ещё ${invites.length - 5}` : ''}
        </Text>
      )}
      {!!waiting && <Text style={s.text}>⏳ Заявка на награду у админа.</Text>}
      {level > 0 && (
        <Btn
          testID="invite-claim"
          title={`🎁 Получить: ${rule!.reward}`}
          small
          disabled={busy}
          onPress={claim}
        />
      )}
      <View style={s.gap} />
      <Btn
        testID="invite-share"
        title="📣 Пригласить друзей"
        small
        variant={level > 0 ? 'soft' : 'primary'}
        onPress={share}
      />
    </Card>
  );
}

// Топ донатеров за день, неделю, месяц и всё время и задания от админа
export default function RewardsScreen() {
  const s = useStyles(makeStyles);
  const { user, cloud } = useStore();
  const uid = user?.uid ?? '';
  const [period, setPeriod] = useState<Period>('month');
  const { data, error, loading, reload } = useRemote(
    useCallback(async () => {
      const [donations, tasks, claims, invites] = await Promise.all([
        loadDonations(),
        loadTasks(),
        mine<Claim>('claims', uid),
        user ? loadInvites(user.id).catch(() => []) : [],
      ]);
      return { donations, tasks, claims, invites };
    }, [uid, user]),
  );

  const top = ranking(data?.donations ?? [], period);
  const me = top.find(row => row.uid === uid);
  const show = (tjs: number) => money(tjs, currencyOf(user), cloud.config);
  const tasks = (data?.tasks ?? []).filter(task => task.until > Date.now());

  return (
    <ScrollView
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={reload} />
      }
    >
      <View style={readable}>
        {!!error && <Text style={s.error}>{error}</Text>}

        {data && (
          <InviteCard
            invites={data.invites}
            claims={data.claims}
            onSent={reload}
          />
        )}

        <Text style={s.section}>🏆 Топ донатеров</Text>
        <Chips
          options={PERIODS.map(p => [p.key, p.name])}
          value={period}
          onChange={setPeriod}
        />
        <Card>
          <Text style={s.mine}>
            {me
              ? `Вы на ${me.place} месте — ${show(me.total)}`
              : 'За этот период у вас нет зачисленных донатов.'}
          </Text>
          {top.slice(0, 20).map(row => (
            <View key={row.uid} style={[s.row, row.uid === uid && s.rowMine]}>
              <Text style={s.place}>{MEDALS[row.place - 1] ?? row.place}</Text>
              <Text style={s.name} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={s.total}>{show(row.total)}</Text>
            </View>
          ))}
          {data && top.length === 0 && (
            <Text style={s.text}>Пока никого — станьте первым!</Text>
          )}
        </Card>

        <Text style={s.section}>🎯 Задания</Text>
        {data && tasks.length === 0 && (
          <Card>
            <Text style={s.text}>
              Сейчас заданий нет. Загляните позже — админ добавляет новые.
            </Text>
          </Card>
        )}
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            claim={data?.claims.find(claim => claim.task === task.id)}
            onSent={reload}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Theme) =>
  StyleSheet.create({
    content: { padding: 16, paddingTop: 4, paddingBottom: 28 },
    error: { color: c.danger, fontSize: 14, marginBottom: 12 },
    section: {
      fontSize: 19,
      fontWeight: '900',
      color: c.text,
      marginBottom: 10,
      marginTop: 4,
    },
    mine: {
      color: c.accent,
      fontSize: 15,
      fontWeight: '800',
      marginBottom: 10,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderRadius: 12,
    },
    rowMine: { backgroundColor: c.primarySoft },
    place: {
      width: 36,
      color: c.text,
      fontSize: 17,
      fontWeight: '900',
      textAlign: 'center',
    },
    name: { flex: 1, color: c.text, fontSize: 15, fontWeight: '700' },
    total: { color: c.primary, fontSize: 15, fontWeight: '900' },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    title: { flex: 1, color: c.text, fontSize: 16, fontWeight: '800' },
    text: { color: c.textSoft, fontSize: 14, lineHeight: 20, marginBottom: 8 },
    reward: { color: c.primary, fontSize: 15, fontWeight: '800' },
    date: { color: c.muted, fontSize: 12, marginTop: 4, marginBottom: 10 },
    gap: { height: 8 },
  });
