/**
 * Разделы админки про состояние сервиса: ключи и квоты, живая игра, ошибки и
 * статистика.
 *
 * Смысл один: то, за чем раньше ходили по ssh, должно быть видно с экрана.
 * Остаток квоты DeepL смотрели curl'ом, «кто сейчас играет» не смотрели никак,
 * а причину ошибки искали в текстовом логе.
 *
 * Оформление — те же панели, что на сайте. Админка не отдельный продукт: чем
 * меньше в ней своих правил, тем меньше её нужно поддерживать.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuBot, LuCheck, LuClock, LuRefreshCw, LuSearch, LuUsers, LuX } from 'react-icons/lu';

import {
  getAdminHealth, getAdminStats, getIncidents, getLiveDuel, getRecentErrors,
  resolveIncident, resolveIncidentsBySource,
  type AdminHealth, type AdminStats, type DailyPoint, type ErrorEvent, type ErrorPath,
  type Incident, type IncidentFacet, type LiveDuel, type LiveRoom, type StatsWindow,
} from '../api/admin';
import { ApiError } from '../api/client';
import { Button, Card, ErrorNote, Spinner } from './ui';

const NUMBER = new Intl.NumberFormat('ru-RU');

/** Как часто сама обновляется живая панель. */
const LIVE_MS = 5000;

// ─── Ключи и лимиты ──────────────────────────────────────────────────────────

export function AdminKeysPanel() {
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setHealth(await getAdminHealth());
      setError('');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!health) return <PanelLoader />;

  const { quota } = health;
  const monthLeft = Math.max(0, quota.limit - quota.used);
  const monthPart = quota.limit > 0 ? quota.used / quota.limit : 0;
  const dayPart = quota.dailyBudget > 0 ? 1 - quota.dailyRemaining / quota.dailyBudget : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-muted)]">
          Версия {health.version} · сервер живёт {duration(health.uptime)}
        </p>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void load()}>
          <LuRefreshCw className={busy ? 'animate-spin' : ''} /> Обновить
        </Button>
      </div>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl">Квота DeepL</h2>
          {quota.error ? (
            <span className="text-sm text-[var(--accent)]">{quota.error}</span>
          ) : (
            <span className="text-sm text-[var(--text-muted)]">
              осталось {NUMBER.format(monthLeft)} знаков до конца периода
            </span>
          )}
        </div>

        {!quota.error && (
          <>
            <Meter part={monthPart} className="mt-4" />
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Потрачено {NUMBER.format(quota.used)} из {NUMBER.format(quota.limit)}
              {' '}({Math.round(monthPart * 100)}%)
            </p>
          </>
        )}

        <div className="mt-6 border-t border-[var(--line)] pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-bold">Суточный бюджет знаков</h3>
            <span className="text-sm text-[var(--text-muted)]">
              {quota.budgetEnabled
                ? `осталось ${NUMBER.format(quota.dailyRemaining)} из ${NUMBER.format(quota.dailyBudget)}`
                : 'выключен'}
            </span>
          </div>
          {quota.budgetEnabled && <Meter part={dayPart} className="mt-3" />}
          {/* Своя защита месячной квоты: когда суточная доля кончилась, перевод
              продолжает работать, но уходит к запасному провайдеру. */}
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Когда бюджет исчерпан, перевод идёт запасным провайдером — качество падает, но сайт работает.
          </p>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-xl">Ключи и службы</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {health.keys.map((key) => (
            <div
              key={key.name}
              className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)] px-4 py-3"
            >
              <span
                className={[
                  'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full',
                  key.ready ? 'bg-[var(--success)]/15 text-[var(--success)]' : 'bg-[var(--accent)]/12 text-[var(--accent)]',
                ].join(' ')}
              >
                {key.ready ? <LuCheck className="size-3.5" /> : <LuX className="size-3.5" />}
              </span>
              <div className="min-w-0">
                <p className="font-semibold">{key.title}</p>
                <p className="truncate text-xs text-[var(--text-muted)]">
                  {key.ready ? key.note || 'настроен' : 'не настроен'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Кто сейчас играет ───────────────────────────────────────────────────────

export function AdminLivePanel() {
  const [live, setLive] = useState<LiveDuel | null>(null);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      // Скрытая вкладка не опрашивает сервер: панель обновляется каждые пять
      // секунд, и фоновая вкладка иначе стучалась бы весь день.
      if (document.hidden) return;
      try {
        const next = await getLiveDuel();
        if (!alive) return;
        setLive(next);
        setUpdated(Date.now());
        setError('');
      } catch (caught) {
        if (alive) setError(messageOf(caught));
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), LIVE_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  if (error && !live) return <ErrorNote>{error}</ErrorNote>;
  if (!live) return <PanelLoader />;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile title="Людей за столами" value={live.people} icon={<LuUsers className="size-4" />} />
        <Tile title="Живых комнат" value={live.rooms.length} icon={<LuBot className="size-4" />} />
        <Tile title="Матчей за сутки" value={live.roomsToday} icon={<LuClock className="size-4" />} />
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        Обновляется само каждые {LIVE_MS / 1000} с{updated ? ` · последний ответ в ${clock(updated)}` : ''}
      </p>

      <section>
        <h2 className="text-xl">Комнаты</h2>
        {live.rooms.length === 0 ? (
          <Card className="mt-3 p-8 text-center text-[var(--text-muted)]">
            Сейчас никто не играет.
          </Card>
        ) : (
          <div className="mt-3 space-y-3">
            {live.rooms.map((room) => <RoomCard key={room.code} room={room} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl">Очередь подбора</h2>
        {live.queue.length === 0 ? (
          <Card className="mt-3 p-6 text-center text-[var(--text-muted)]">
            Очередь пуста.
          </Card>
        ) : (
          <Card className="mt-3 divide-y divide-[var(--line)]">
            {live.queue.map((item) => (
              <div key={`${item.name}-${item.since}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                <b>{item.name}</b>
                <span className="text-[var(--text-muted)]">
                  {item.level} · {item.direction === 'ru-sr' ? 'ру→ср' : 'ср→ру'} · мест {item.seats}
                </span>
                <span className="ml-auto text-[var(--text-muted)]">
                  ждёт {duration((Date.now() - new Date(item.since).getTime()) / 1000)}
                </span>
                {item.room && <span className="text-[var(--success)]">позван в {item.room}</span>}
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

const PHASES: Record<string, string> = {
  lobby: 'Сбор',
  translate: 'Раунд',
  judging: 'Судья',
  vote: 'Голосование',
  result: 'Разбор',
  finished: 'Матч окончен',
};

function RoomCard({ room }: { room: LiveRoom }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <b className="font-display text-lg">{room.code}</b>
        <span className="rounded-full bg-[var(--accent)]/12 px-2.5 py-0.5 text-xs font-bold text-[var(--accent)]">
          {PHASES[room.phase] ?? room.phase}
        </span>
        <span className="text-sm text-[var(--text-muted)]">
          {room.level} · {room.direction === 'ru-sr' ? 'ру→ср' : 'ср→ру'} · раунд {room.round || 0} из 3
          {' · '}{room.people} чел.{room.machines > 0 ? ` + ${room.machines} маш.` : ''} из {room.seats}
        </span>
        <span className="ml-auto text-xs text-[var(--text-muted)]">
          {room.matched ? 'подбор' : room.open ? 'открытая' : 'по ссылке'}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {room.players.map((player) => (
          <div
            key={player.name + player.machine}
            className={[
              'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm',
              player.left ? 'border-[var(--line)] opacity-50' : 'border-[var(--line)]',
            ].join(' ')}
          >
            {player.machine ? <LuBot className="size-4 text-[var(--machine)]" /> : <LuUsers className="size-4 text-[var(--accent)]" />}
            <span className="truncate font-semibold">{player.name}</span>
            {player.host && <span className="text-xs text-[var(--text-muted)]">хозяин</span>}
            {player.account && <span className="text-xs text-[var(--text-muted)]">аккаунт</span>}
            <span className="ml-auto shrink-0 tabular-nums">
              {player.left ? 'ушёл' : player.ready ? 'сдал' : `${player.answers}/${room.sentences || 5}`}
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums text-[var(--text-muted)]">{player.score}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Ошибки ──────────────────────────────────────────────────────────────────

type ErrorsTab = 'journal' | 'live';

export function AdminErrorsPanel() {
  const [tab, setTab] = useState<ErrorsTab>('journal');
  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Toggle active={tab === 'journal'} onClick={() => setTab('journal')}>Журнал аварий</Toggle>
        <Toggle active={tab === 'live'} onClick={() => setTab('live')}>Свежие отказы</Toggle>
      </div>
      {tab === 'journal' ? <IncidentJournal /> : <LiveErrors />}
    </div>
  );
}

function IncidentJournal() {
  const [items, setItems] = useState<Incident[] | null>(null);
  const [facets, setFacets] = useState<Record<string, IncidentFacet[]>>({});
  const [all, setAll] = useState(false);
  const [source, setSource] = useState('');
  const [severity, setSeverity] = useState('');
  const [hours, setHours] = useState(0);
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const answer = await getIncidents({ all, source, severity, hours, query: applied });
      setItems(answer.items ?? []);
      setFacets(answer.facets ?? {});
      setError('');
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, [all, applied, hours, severity, source]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => { event.preventDefault(); setApplied(query); }}
        >
          <label className="relative min-w-48 flex-1">
            <LuSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Искать по тексту ошибки, ручке или полям"
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
          <select
            value={hours}
            onChange={(event) => setHours(Number(event.target.value))}
            className="rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)] px-3 py-2.5 text-sm"
          >
            <option value={0}>За всё время</option>
            <option value={1}>За час</option>
            <option value={24}>За сутки</option>
            <option value={24 * 7}>За неделю</option>
          </select>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={all}
              onChange={(event) => setAll(event.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            С закрытыми
          </label>
          <Button size="sm" variant="secondary" type="submit">Найти</Button>
        </form>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip active={!source && !severity} onClick={() => { setSource(''); setSeverity(''); }}>
            Все открытые
          </Chip>
          {(facets.severity ?? []).map((facet) => (
            <Chip
              key={facet.value}
              active={severity === facet.value}
              onClick={() => setSeverity(severity === facet.value ? '' : facet.value)}
            >
              {facet.value} · {facet.count}
            </Chip>
          ))}
          {(facets.source ?? []).map((facet) => (
            <Chip
              key={facet.value}
              active={source === facet.value}
              onClick={() => setSource(source === facet.value ? '' : facet.value)}
            >
              {facet.value} · {facet.count}
            </Chip>
          ))}
        </div>
      </Card>

      {error && <ErrorNote>{error}</ErrorNote>}

      {source && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy === 'source'}
          onClick={async () => {
            setBusy('source');
            try { await resolveIncidentsBySource(source); await load(); }
            catch (caught) { setError(messageOf(caught)); }
            finally { setBusy(''); }
          }}
        >
          Закрыть все открытые записи источника «{source}»
        </Button>
      )}

      {!items ? (
        <PanelLoader />
      ) : items.length === 0 ? (
        <Card className="p-10 text-center text-[var(--text-muted)]">Ничего не нашлось.</Card>
      ) : (
        <div className="space-y-2">
          {items.map((incident) => (
            <IncidentRow
              key={incident.id}
              incident={incident}
              busy={busy === incident.id}
              onResolve={async () => {
                setBusy(incident.id);
                try { await resolveIncident(incident.id); await load(); }
                catch (caught) { setError(messageOf(caught)); }
                finally { setBusy(''); }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IncidentRow({
  incident,
  busy,
  onResolve,
}: {
  incident: Incident;
  busy: boolean;
  onResolve: () => void;
}) {
  const [open, setOpen] = useState(false);
  const details = incident.details ?? {};
  const hasDetails = Object.keys(details).length > 0;

  return (
    <Card className={incident.resolvedAt ? 'p-4 opacity-60' : 'p-4'}>
      <div className="flex flex-wrap items-start gap-3">
        <Severity value={incident.severity} />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="min-w-0 flex-1 text-left"
        >
          <p className="break-words font-semibold">{incident.message}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {incident.source} · {incident.occurrences} раз · последний {when(incident.lastSeen)}
            {incident.resolvedAt ? ' · закрыт' : ''}
          </p>
        </button>
        {!incident.resolvedAt && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={onResolve}>
            {busy ? <Spinner /> : 'Закрыть'}
          </Button>
        )}
      </div>
      {open && hasDetails && (
        <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-[var(--bg-sunken)] p-3 text-xs leading-5">
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
      {open && !hasDetails && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">Подробностей у записи нет.</p>
      )}
    </Card>
  );
}

function LiveErrors() {
  const [items, setItems] = useState<ErrorEvent[] | null>(null);
  const [paths, setPaths] = useState<ErrorPath[]>([]);
  const [error, setError] = useState('');
  const timer = useRef(0);

  const load = useCallback(async () => {
    try {
      const answer = await getRecentErrors();
      setItems(answer.items ?? []);
      setPaths(answer.paths ?? []);
      setError('');
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, []);

  useEffect(() => {
    void load();
    timer.current = window.setInterval(() => { if (!document.hidden) void load(); }, 10000);
    return () => window.clearInterval(timer.current);
  }, [load]);

  if (error && !items) return <ErrorNote>{error}</ErrorNote>;
  if (!items) return <PanelLoader />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        Последние ответы с ошибкой, включая отказы клиенту: 401 значит «сломан вход»,
        429 — «ограничитель слишком тугой». В журнал аварий такие не попадают.
      </p>

      {paths.length > 0 && (
        <Card className="p-4">
          <h3 className="font-bold">Где сыплется чаще всего</h3>
          <div className="mt-3 space-y-1.5">
            {paths.slice(0, 8).map((item) => (
              <div key={item.method + item.path} className="flex items-center gap-3 text-sm">
                <span className="w-12 shrink-0 text-xs font-bold text-[var(--text-muted)]">{item.method}</span>
                <span className="min-w-0 flex-1 truncate">{item.path}</span>
                <span className={`shrink-0 tabular-nums ${item.worst >= 500 ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                  {item.worst}
                </span>
                <b className="w-10 shrink-0 text-right tabular-nums">{item.count}</b>
              </div>
            ))}
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="p-10 text-center text-[var(--text-muted)]">
          С запуска сервера ошибок не было.
        </Card>
      ) : (
        <Card className="divide-y divide-[var(--line)]">
          {items.map((event, index) => (
            <div key={`${event.at}-${index}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span className={`w-10 shrink-0 font-bold tabular-nums ${event.status >= 500 ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                {event.status}
              </span>
              <span className="text-xs font-bold text-[var(--text-muted)]">{event.method}</span>
              <span className="min-w-0 flex-1 truncate">{event.path}</span>
              {event.message && <span className="min-w-0 basis-full truncate text-xs text-[var(--text-muted)] sm:basis-auto">{event.message}</span>}
              {event.user && <span className="text-xs text-[var(--text-muted)]">{event.user}</span>}
              <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">
                {event.ms} мс · {clock(new Date(event.at).getTime())}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ─── Статистика ──────────────────────────────────────────────────────────────

export function AdminStatsPanel() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminStats().then(setStats).catch((caught) => setError(messageOf(caught)));
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!stats) return <PanelLoader />;

  const rows: Array<[string, StatsWindow, string]> = [
    ['Пользователи', stats.users, 'завели аккаунт'],
    ['Активные', stats.active, 'заходили'],
    ['Книги', stats.books, 'открывали или меняли'],
    ['Слова в словарях', stats.vocabulary, 'добавляли или повторяли'],
    ['Матчи перевода', stats.duels, 'комнат создано'],
    ['Уроки преподавателей', stats.lessons, 'продвинулись'],
    ['Тесты', stats.quizzes, 'попыток'],
    ['Перевод документов', stats.documents, 'заявок'],
  ];

  return (
    <div className="space-y-5">
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--bg-sunken)] text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-3 font-semibold">Что</th>
              <th className="px-4 py-3 text-right font-semibold">Сутки</th>
              <th className="px-4 py-3 text-right font-semibold">Неделя</th>
              <th className="px-4 py-3 text-right font-semibold">Месяц</th>
              <th className="px-4 py-3 text-right font-semibold">Всего</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([title, window, hint]) => (
              <tr key={title} className="border-b border-[var(--line)] last:border-0">
                <td className="px-4 py-3">
                  <b>{title}</b>
                  <span className="ml-2 text-xs text-[var(--text-muted)]">{hint}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{NUMBER.format(window.day)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{NUMBER.format(window.week)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{NUMBER.format(window.month)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-[var(--text-muted)]">{NUMBER.format(window.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Chart title="Новые пользователи" hint="за 14 дней" points={stats.newUsers} />
        <Chart title="Заходили в день" hint="за 14 дней" points={stats.activeByDay} color="var(--machine)" />
      </div>

      <Card className="p-5">
        <h2 className="text-xl">Разделы за неделю</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Сколько разных людей заходило в каждый раздел.
        </p>
        <div className="mt-4 space-y-2">
          {stats.sections.map((section) => {
            const best = Math.max(1, ...stats.sections.map((item) => item.people));
            return (
              <div key={section.section} className="flex items-center gap-3">
                <span className="w-44 shrink-0 truncate text-sm">{section.title}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${Math.max(2, (section.people / best) * 100)}%` }}
                  />
                </div>
                <b className="w-12 shrink-0 text-right tabular-nums">{section.people}</b>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile title="Знаков переведено за сутки" value={stats.documentChars.day} />
        <Tile title="Строк в кеше перевода" value={stats.translationCache} />
        <Tile title="Открытых аварий" value={stats.openIncidents} />
      </div>
    </div>
  );
}

function Chart({
  title,
  hint,
  points,
  color = 'var(--accent)',
}: {
  title: string;
  hint: string;
  points: DailyPoint[];
  color?: string;
}) {
  const best = useMemo(() => Math.max(1, ...points.map((point) => point.count)), [points]);
  return (
    <Card className="p-5">
      <h2 className="text-xl">{title}</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{hint}</p>
      <div className="mt-5 flex h-36 items-end gap-1.5">
        {points.map((point) => (
          <div
            key={point.date}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
            title={`${point.date}: ${point.count}`}
          >
            <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{point.count || ''}</span>
            <div
              className="w-full rounded-t-md transition-[height]"
              style={{
                height: `${Math.max(3, (point.count / best) * 104)}px`,
                background: color,
                opacity: point.count ? 1 : 0.25,
              }}
            />
            <span className="hidden text-[10px] text-[var(--text-muted)] sm:block">{point.date.slice(8)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Мелочи ──────────────────────────────────────────────────────────────────

function Meter({ part, className = '' }: { part: number; className?: string }) {
  const share = Math.max(0, Math.min(1, part));
  // Цвет по остатку: пока квоты много — обычная линия, под конец красная.
  const color = share > 0.9 ? 'var(--accent)' : share > 0.7 ? 'var(--color-gold)' : 'var(--success)';
  return (
    <div className={`h-2.5 overflow-hidden rounded-full bg-[var(--bg-sunken)] ${className}`}>
      <div className="h-full rounded-full transition-[width]" style={{ width: `${share * 100}%`, background: color }} />
    </div>
  );
}

function Tile({ title, value, icon }: { title: string; value: number; icon?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
        {icon}
        {title}
      </p>
      <p className="mt-1.5 font-display text-2xl font-bold tabular-nums">{NUMBER.format(value)}</p>
    </Card>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
        active ? 'bg-[var(--accent)] text-parchment' : 'bg-[var(--bg-sunken)] text-[var(--text-muted)] hover:text-[var(--text)]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
        active
          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
          : 'border-[var(--line)] text-[var(--text-muted)] hover:border-[var(--accent)]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Severity({ value }: { value: Incident['severity'] }) {
  const classes: Record<Incident['severity'], string> = {
    info: 'bg-blue-600/10 text-blue-700',
    warning: 'bg-amber-600/12 text-amber-700',
    error: 'bg-[var(--accent)]/12 text-[var(--accent)]',
    critical: 'bg-[var(--accent)] text-parchment',
  };
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${classes[value]}`}>
      {value}
    </span>
  );
}

function PanelLoader() {
  return (
    <div className="flex min-h-40 items-center justify-center text-[var(--text-muted)]">
      <Spinner className="size-6" />
    </div>
  );
}

/** «2 ч 15 мин» — так время читается без пересчёта в уме. */
function duration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days} д ${hours} ч`;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  if (minutes > 0) return `${minutes} мин`;
  return `${total} с`;
}

function clock(at: number): string {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(at);
}

function when(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Не удалось выполнить запрос.';
}
