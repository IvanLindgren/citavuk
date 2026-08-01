import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createCourseRelease,
  getAdminOverview,
  getAdminUsers,
  getCourseRelease,
  getCourseReleases,
  getIncidents,
  publishCourseRelease,
  resolveIncident,
  updateCourseRelease,
  type AdminOverview,
  type AdminUser,
  type CourseRelease,
  type Incident,
} from '../api/admin';
import { ApiError } from '../api/client';
import {
  getAdminLessonReports,
  getAdminTeacherApplications,
  reviewLessonReport,
  reviewTeacherApplication,
  type LessonReport,
  type TeacherApplication,
} from '../api/lessons';
import { Button, Card, ErrorNote, Spinner } from '../components/ui';
import type { CourseBundle } from '../course/types';
import { Link, useRouter } from '../lib/router';
import { useAuth } from '../state/auth';

type AdminTab = 'overview' | 'users' | 'incidents' | 'courses' | 'teachers';

const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: 'overview', label: 'Обзор' },
  { id: 'users', label: 'Пользователи' },
  { id: 'incidents', label: 'Инциденты' },
  { id: 'courses', label: 'Курсы' },
  { id: 'teachers', label: 'Преподаватели' },
];

export function Admin() {
  const { account, loading: authLoading } = useAuth();
  const { navigate } = useRouter();
  const [tab, setTab] = useState<AdminTab>('overview');

  useEffect(() => {
    if (!authLoading && !account) navigate('/login');
  }, [account, authLoading, navigate]);

  if (authLoading || !account) return <AdminLoader />;
  if (!account.isAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-20 text-center">
        <h1 className="text-3xl">Доступ закрыт</h1>
        <p className="mt-3 text-[var(--text-muted)]">
          У этого аккаунта нет прав администратора.
        </p>
      </main>
    );
  }

  return (
    <main className="px-5 py-8 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase text-[var(--accent)]">
              Управление Citavuk
            </p>
            <h1 className="mt-1 text-3xl sm:text-4xl">Админ-панель</h1>
          </div>
          <p className="text-sm text-[var(--text-muted)]">{account.email}</p>
        </div>

        <div
          className="mb-7 grid grid-cols-2 gap-1 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] p-1 sm:grid-cols-5"
          role="tablist"
        >
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={[
                'rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                tab === item.id
                  ? 'bg-[var(--accent)] text-parchment'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewPanel />}
        {tab === 'users' && <UsersPanel />}
        {tab === 'incidents' && <IncidentsPanel />}
        {tab === 'courses' && <CoursesPanel />}
        {tab === 'teachers' && <TeacherModerationPanel />}
      </div>
    </main>
  );
}

function TeacherModerationPanel() {
  const [applications, setApplications] = useState<TeacherApplication[] | null>(null);
  const [reports, setReports] = useState<LessonReport[] | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      const [nextApplications, nextReports] = await Promise.all([
        getAdminTeacherApplications(), getAdminLessonReports(),
      ]);
      setApplications(nextApplications); setReports(nextReports);
    } catch (caught) { setError(messageOf(caught)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const decideApplication = async (item: TeacherApplication, status: 'approved' | 'rejected') => {
    if (!item.userId) return;
    try { await reviewTeacherApplication(item.userId, status, comments[item.userId] ?? ''); await load(); }
    catch (caught) { setError(messageOf(caught)); }
  };
  if (!applications || !reports) return <PanelLoader />;
  const pending = applications.filter((item) => item.status === 'pending');
  return <div className="space-y-10">
    {error && <ErrorNote>{error}</ErrorNote>}
    <section><h2 className="text-2xl">Заявки преподавателей</h2><div className="mt-4 space-y-3">{pending.length === 0 ? <p className="text-[var(--text-muted)]">Очередь пуста.</p> : pending.map((item) => <div key={item.userId} className="rounded-lg border border-[var(--line)] bg-[var(--bg-raised)] p-5"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-lg">{item.displayName || item.email}</h3><p className="mt-1 text-sm text-[var(--text-muted)]">{item.email} · сербский {item.serbianLevel}</p></div><span className="text-sm">{item.nativeSpeaker ? 'Носитель' : `Русский ${item.russianLevel || 'не указан'}`}</span></div><p className="mt-4 whitespace-pre-wrap text-sm">{item.teachingExperience}</p>{item.certificates && <p className="mt-2 text-sm text-[var(--text-muted)]">Образование: {item.certificates}</p>}<textarea className={`${inputClass('')} mt-4`} rows={2} placeholder="Комментарий автору" value={comments[item.userId ?? ''] ?? ''} onChange={(event) => item.userId && setComments({ ...comments, [item.userId]: event.target.value })} /><div className="mt-3 flex gap-2"><Button size="sm" onClick={() => void decideApplication(item, 'approved')}>Одобрить</Button><Button size="sm" variant="secondary" onClick={() => void decideApplication(item, 'rejected')}>Отклонить</Button></div></div>)}</div></section>
    <section className="border-t border-[var(--line)] pt-8"><h2 className="text-2xl">Уроки на модерации</h2><p className="mt-2 text-[var(--text-muted)]">Очередь уроков вынесена в отдельный экран с полным ученическим предпросмотром.</p><Link to="/admin/lessons" className="mt-4 inline-flex rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white">Открыть модерацию уроков</Link></section>
    <section className="border-t border-[var(--line)] pt-8"><h2 className="text-2xl">Жалобы на уроки</h2><div className="mt-4 space-y-3">{reports.length === 0 ? <p className="text-[var(--text-muted)]">Открытых жалоб нет.</p> : reports.map((item) => <div key={item.id} className="rounded-lg border border-[var(--line)] bg-[var(--bg-raised)] p-5"><h3 className="text-lg">{item.lessonTitle}</h3><p className="mt-2 font-semibold">{item.reason}</p>{item.details && <p className="mt-2 text-sm text-[var(--text-muted)]">{item.details}</p>}<div className="mt-3 flex gap-2"><Button size="sm" onClick={async () => { await reviewLessonReport(item.id, 'resolved'); await load(); }}>Решено</Button><Button size="sm" variant="secondary" onClick={async () => { await reviewLessonReport(item.id, 'dismissed'); await load(); }}>Отклонить</Button></div></div>)}</div></section>
  </div>;
}

function OverviewPanel() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOverview(await getAdminOverview());
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!overview) return <PanelLoader />;

  const cards = [
    ['Сейчас онлайн', overview.onlineNow],
    ['Активны за сутки', overview.active24Hours],
    ['Пользователи', overview.users],
    ['Книги', overview.books],
    ['Слова в словарях', overview.vocabulary],
    ['Учатся на курсах', overview.courseLearners],
    ['Опубликовано курсов', overview.publishedCourses],
    ['Открытые инциденты', overview.openIncidents],
  ] as const;
  const maxDaily = Math.max(1, ...overview.newUsers.map((point) => point.count));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label} className="p-5">
            <p className="text-sm text-[var(--text-muted)]">{label}</p>
            <p className="mt-2 font-display text-3xl font-bold">{value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5 sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl">Новые пользователи</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Последние 14 дней
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Обновить
          </Button>
        </div>
        <div className="mt-6 flex h-44 items-end gap-2" aria-label="График регистраций">
          {overview.newUsers.map((point) => (
            <div
              key={point.date}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
              title={`${formatDate(point.date)}: ${point.count}`}
            >
              <span className="text-xs font-semibold">{point.count || ''}</span>
              <div
                className="w-full max-w-10 rounded-t-md bg-[var(--accent)] transition-[height]"
                style={{
                  height: `${Math.max(4, (point.count / maxDaily) * 120)}px`,
                  opacity: point.count ? 1 : 0.2,
                }}
              />
              <span className="hidden text-[10px] text-[var(--text-muted)] sm:block">
                {point.date.slice(5)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (search = '') => {
    setError(null);
    try {
      setUsers((await getAdminUsers(search)).items ?? []);
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void load(query);
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Почта или имя"
          className={inputClass('flex-1')}
        />
        <Button type="submit" variant="secondary">
          Найти
        </Button>
      </form>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!users ? (
        <PanelLoader />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[var(--line)] bg-[var(--bg-sunken)] text-[var(--text-muted)]">
              <tr>
                <Th>Пользователь</Th>
                <Th>Последняя активность</Th>
                <Th>Книги</Th>
                <Th>Слова</Th>
                <Th>Курсы</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-[var(--line)] last:border-0">
                  <Td>
                    <div className="font-semibold">
                      {user.displayName || 'Без имени'}
                      {user.isAdmin && (
                        <span className="ml-2 rounded-full bg-[var(--accent)]/12 px-2 py-0.5 text-[10px] uppercase text-[var(--accent)]">
                          admin
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {user.email}
                    </div>
                  </Td>
                  <Td>
                    {user.lastSeenAt ? formatDateTime(user.lastSeenAt) : 'Не входил'}
                  </Td>
                  <Td>{user.books}</Td>
                  <Td>{user.vocabulary}</Td>
                  <Td>{user.coursesStarted}</Td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <Td colSpan={5}>Ничего не найдено.</Td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function IncidentsPanel() {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setIncidents((await getIncidents(showAll)).items ?? []);
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, [showAll]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={showAll}
          onChange={(event) => setShowAll(event.target.checked)}
          className="size-4 accent-[var(--accent)]"
        />
        Показать закрытые
      </label>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!incidents ? (
        <PanelLoader />
      ) : incidents.length === 0 ? (
        <Card className="p-10 text-center text-[var(--text-muted)]">
          Открытых инцидентов нет.
        </Card>
      ) : (
        <div className="space-y-3">
          {incidents.map((incident) => (
            <Card key={incident.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Severity value={incident.severity} />
                    <span className="text-xs text-[var(--text-muted)]">
                      {incident.source} · {incident.occurrences} раз
                    </span>
                  </div>
                  <h3 className="mt-2 break-words text-lg">{incident.message}</h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Последний: {formatDateTime(incident.lastSeen)}
                  </p>
                  {Object.keys(incident.details ?? {}).length > 0 && (
                    <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-[var(--bg-sunken)] p-3 text-xs">
                      {JSON.stringify(incident.details, null, 2)}
                    </pre>
                  )}
                </div>
                {!incident.resolvedAt && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === incident.id}
                    onClick={async () => {
                      setBusy(incident.id);
                      try {
                        await resolveIncident(incident.id);
                        await load();
                      } catch (caught) {
                        setError(messageOf(caught));
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    {busy === incident.id ? <Spinner /> : 'Закрыть'}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CoursesPanel() {
  const [releases, setReleases] = useState<CourseRelease[] | null>(null);
  const [selected, setSelected] = useState<CourseRelease | null>(null);
  const [editor, setEditor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [skillPath, setSkillPath] = useState('');

  const loadList = useCallback(async () => {
    setReleases((await getCourseReleases()).items ?? []);
  }, []);

  useEffect(() => {
    loadList().catch((caught) => setError(messageOf(caught)));
  }, [loadList]);

  const parsed = useMemo(() => parseCourse(editor), [editor]);
  const skills = useMemo(
    () =>
      parsed?.units.flatMap((unit) =>
        unit.skills.map((skill) => ({
          key: `${unit.id}/${skill.id}`,
          label: `${unit.title} / ${skill.title}`,
        })),
      ) ?? [],
    [parsed],
  );

  useEffect(() => {
    if (!skillPath && skills[0]) setSkillPath(skills[0].key);
  }, [skillPath, skills]);

  const openRelease = async (release: CourseRelease) => {
    setError(null);
    setNotice(null);
    try {
      const full = await getCourseRelease(release.id);
      setSelected(full);
      setEditor(JSON.stringify(full.bundle, null, 2));
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const save = async () => {
    const bundle = parseCourse(editor);
    if (!bundle) {
      setError('В редакторе некорректный JSON курса.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const release =
        selected?.status === 'draft'
          ? await updateCourseRelease(selected.id, bundle)
          : await createCourseRelease(bundle);
      setSelected(release);
      setEditor(JSON.stringify(release.bundle, null, 2));
      setNotice('Черновик сохранён.');
      await loadList();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const addLesson = () => {
    const bundle = parseCourse(editor);
    const [unitId, skillId] = skillPath.split('/');
    const unit = bundle?.units.find((item) => item.id === unitId);
    const skill = unit?.skills.find((item) => item.id === skillId);
    if (!bundle || !skill || !lessonId.trim() || !lessonTitle.trim()) {
      setError('Выберите тему и укажите ID и название урока.');
      return;
    }
    if (
      bundle.units.some((item) =>
        item.skills.some((entry) =>
          entry.lessons.some((lesson) => lesson.id === lessonId.trim()),
        ),
      )
    ) {
      setError('Урок с таким ID уже есть.');
      return;
    }
    skill.lessons.push({
      id: lessonId.trim(),
      title: lessonTitle.trim(),
      prerequisites: [],
      isCheckpoint: false,
      intro: { text: '', blocks: [] },
      exercises: [],
    });
    setEditor(JSON.stringify(bundle, null, 2));
    setLessonId('');
    setLessonTitle('');
    setError(null);
    setNotice('Урок добавлен в черновик. Добавьте упражнения в JSON и сохраните.');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="space-y-4">
        {error && !editor && <ErrorNote>{error}</ErrorNote>}
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => {
              setSelected(null);
              setEditor(JSON.stringify(newCourseTemplate(), null, 2));
              setNotice(null);
              setError(null);
            }}
          >
            Новый курс
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                const response = await fetch('/course/course_bundle.json');
                const bundle = (await response.json()) as CourseBundle;
                bundle.courseVersion = nextDraftVersion(bundle.courseVersion);
                setSelected(null);
                setEditor(JSON.stringify(bundle, null, 2));
                setNotice('Текущий встроенный курс загружен как новый черновик.');
              } catch {
                setError('Не удалось загрузить встроенный курс.');
              }
            }}
          >
            Импорт
          </Button>
        </div>

        <Card className="divide-y divide-[var(--line)]">
          {!releases ? (
            <PanelLoader />
          ) : releases.length === 0 ? (
            <p className="p-5 text-sm text-[var(--text-muted)]">
              Серверных версий пока нет.
            </p>
          ) : (
            releases.map((release) => (
              <button
                key={release.id}
                type="button"
                onClick={() => void openRelease(release)}
                className={[
                  'block w-full px-4 py-3 text-left transition-colors hover:bg-[var(--bg-sunken)]',
                  selected?.id === release.id ? 'bg-[var(--bg-sunken)]' : '',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="line-clamp-1 font-semibold">{release.title}</span>
                  <ReleaseStatus value={release.status} />
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {release.courseId} · {release.version}
                </p>
              </button>
            ))
          )}
        </Card>
      </div>

      <div className="min-w-0 space-y-4">
        {!editor ? (
          <Card className="p-10 text-center text-[var(--text-muted)]">
            Выберите версию курса или создайте новый черновик.
          </Card>
        ) : (
          <>
            {error && <ErrorNote>{error}</ErrorNote>}
            {notice && (
              <div className="rounded-2xl border border-green-700/25 bg-green-700/10 px-4 py-3 text-sm">
                {notice}
              </div>
            )}

            <Card className="p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <select
                  value={skillPath}
                  onChange={(event) => setSkillPath(event.target.value)}
                  className={inputClass('sm:col-span-3')}
                >
                  {skills.map((skill) => (
                    <option key={skill.key} value={skill.key}>
                      {skill.label}
                    </option>
                  ))}
                </select>
                <input
                  value={lessonId}
                  onChange={(event) => setLessonId(event.target.value)}
                  placeholder="ID урока, например l_aorist_1"
                  className={inputClass()}
                />
                <input
                  value={lessonTitle}
                  onChange={(event) => setLessonTitle(event.target.value)}
                  placeholder="Название урока"
                  className={inputClass()}
                />
                <Button variant="secondary" onClick={addLesson}>
                  Добавить урок
                </Button>
              </div>
            </Card>

            <Card className="p-4">
              <label
                htmlFor="course-json"
                className="mb-2 block text-sm font-semibold text-[var(--text-muted)]"
              >
                JSON курса
              </label>
              <textarea
                id="course-json"
                value={editor}
                onChange={(event) => setEditor(event.target.value)}
                spellCheck={false}
                className="min-h-[560px] w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--bg)] p-4 font-mono text-[13px] leading-relaxed outline-none focus:border-[var(--accent)]"
              />
            </Card>

            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="secondary" disabled={busy} onClick={() => void save()}>
                {busy ? <Spinner /> : null}
                {selected?.status === 'draft'
                  ? 'Сохранить черновик'
                  : 'Сохранить как новый черновик'}
              </Button>
              <Button
                disabled={busy || selected?.status !== 'draft'}
                onClick={async () => {
                  if (!selected) return;
                  setBusy(true);
                  setError(null);
                  try {
                    const published = await publishCourseRelease(selected.id);
                    setSelected(published);
                    setNotice('Курс опубликован и доступен ученикам.');
                    await loadList();
                  } catch (caught) {
                    setError(messageOf(caught));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Опубликовать
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function newCourseTemplate(): CourseBundle {
  const suffix = Date.now().toString(36);
  return {
    courseId: `sr_course_${suffix}`,
    courseVersion: '0.1.0',
    title: 'Новый курс сербского',
    contentChecksum: '',
    config: {
      passThreshold: 0.8,
      acceptBothScripts: false,
    },
    units: [
      {
        id: 'u_1',
        title: 'Раздел 1',
        description: '',
        skills: [
          {
            id: 'sk_1',
            title: 'Тема 1',
            objectives: [],
            lessons: [],
          },
        ],
      },
    ],
  };
}

function parseCourse(value: string): CourseBundle | null {
  try {
    const parsed = JSON.parse(value) as CourseBundle;
    return parsed?.courseId && Array.isArray(parsed.units) ? parsed : null;
  } catch {
    return null;
  }
}

function nextDraftVersion(version: string): string {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return `${version}-draft-${Date.now()}`;
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function Severity({ value }: { value: Incident['severity'] }) {
  const classes = {
    info: 'bg-blue-600/10 text-blue-700',
    warning: 'bg-amber-600/12 text-amber-700',
    error: 'bg-serb-red/12 text-serb-red',
    critical: 'bg-serb-red text-white',
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${classes[value]}`}>
      {value}
    </span>
  );
}

function ReleaseStatus({ value }: { value: CourseRelease['status'] }) {
  const labels = {
    draft: 'Черновик',
    published: 'В эфире',
    archived: 'Архив',
  };
  const classes = {
    draft: 'bg-amber-600/12 text-amber-700',
    published: 'bg-green-700/12 text-green-700',
    archived: 'bg-[var(--bg-sunken)] text-[var(--text-muted)]',
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${classes[value]}`}>
      {labels[value]}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}

function Td({
  children,
  colSpan,
}: {
  children: React.ReactNode;
  colSpan?: number;
}) {
  return (
    <td className="px-4 py-3" colSpan={colSpan}>
      {children}
    </td>
  );
}

function inputClass(extra = '') {
  return [
    'min-w-0 rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-3',
    'text-sm outline-none transition-colors placeholder:text-[var(--text-muted)]',
    'focus:border-[var(--accent)]',
    extra,
  ].join(' ');
}

function AdminLoader() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center">
      <Spinner className="size-7" />
    </main>
  );
}

function PanelLoader() {
  return (
    <div className="flex min-h-40 items-center justify-center text-[var(--text-muted)]">
      <Spinner className="size-6" />
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Не удалось выполнить запрос.';
}
