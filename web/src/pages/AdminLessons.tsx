import { useCallback, useEffect, useState } from 'react';
import { LuArrowLeft, LuCheck, LuEye, LuRotateCcw } from 'react-icons/lu';

import {
  getAdminLessonQueue,
  reviewLessonRevision,
  type Lesson,
} from '../api/lessons';
import { LessonPlayer } from '../components/LessonPlayer';
import { Button, ErrorNote, Spinner } from '../components/ui';
import { Link, useRouter } from '../lib/router';
import { useAuth } from '../state/auth';

export function AdminLessons() {
  const { account, loading: authLoading } = useAuth();
  const { navigate } = useRouter();
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !account) navigate('/login');
  }, [account, authLoading, navigate]);

  const load = useCallback(async () => {
    setError('');
    try {
      setLessons(await getAdminLessonQueue());
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, []);

  useEffect(() => {
    if (account?.isAdmin) void load();
  }, [account?.isAdmin, load]);

  const decide = async (status: 'approved' | 'rejected') => {
    if (!selected?.revisionId) return;
    setBusy(true);
    setError('');
    try {
      await reviewLessonRevision(selected.revisionId, status, comment.trim());
      setSelected(null);
      setComment('');
      await load();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || !account) return <PageLoader />;
  if (!account.isAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-20 text-center">
        <h1 className="text-3xl">Доступ закрыт</h1>
        <p className="mt-3 text-[var(--text-muted)]">
          Эта страница доступна только администраторам.
        </p>
      </main>
    );
  }

  if (selected) {
    return (
      <>
        <LessonPlayer
          lesson={selected}
          previewMode="moderator"
          onExit={() => {
            setSelected(null);
            setComment('');
          }}
        />
        <section className="sticky bottom-4 z-20 mx-auto mb-8 w-[calc(100%-2.5rem)] max-w-4xl rounded-lg border border-[var(--line)] bg-[var(--bg-raised)] p-4 shadow-xl">
          {error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}
          <label htmlFor="moderation-comment" className="text-sm font-semibold">
            Комментарий автору
          </label>
          <textarea
            id="moderation-comment"
            rows={2}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Что исправить или почему урок принят"
            className="mt-2 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => void decide('rejected')}>
              <LuRotateCcw />
              Вернуть автору
            </Button>
            <Button disabled={busy} onClick={() => void decide('approved')}>
              {busy ? <Spinner /> : <LuCheck />}
              Опубликовать
            </Button>
          </div>
        </section>
      </>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:py-12">
      <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)]">
        <LuArrowLeft />
        В админ-панель
      </Link>
      <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-6">
        <div>
          <p className="text-sm font-bold uppercase text-[var(--accent)]">Администрирование</p>
          <h1 className="mt-1 text-3xl sm:text-4xl">Модерация уроков</h1>
          <p className="mt-2 text-[var(--text-muted)]">
            Проверьте урок в том же режиме, который увидит ученик, затем опубликуйте или верните его автору.
          </p>
        </div>
        {lessons && (
          <span className="rounded-full bg-[var(--bg-sunken)] px-3 py-1.5 text-sm font-semibold">
            В очереди: {lessons.length}
          </span>
        )}
      </header>

      {error && <div className="mt-6"><ErrorNote>{error}</ErrorNote></div>}
      {!lessons ? (
        <PageLoader />
      ) : lessons.length === 0 ? (
        <div className="py-20 text-center">
          <LuCheck className="mx-auto size-10 text-[var(--accent)]" />
          <h2 className="mt-4 text-2xl">Очередь пуста</h2>
          <p className="mt-2 text-[var(--text-muted)]">Все присланные уроки уже проверены.</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          {lessons.map((lesson) => (
            <article key={lesson.revisionId ?? lesson.id} className="grid gap-4 py-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2 text-xs font-bold uppercase text-[var(--accent)]">
                  <span>{lesson.level}</span>
                  <span>·</span>
                  <span>{lessonTypeLabel(lesson.lessonType)}</span>
                  {lesson.topic && <><span>·</span><span>{lesson.topic}</span></>}
                </div>
                <h2 className="mt-2 text-2xl">{lesson.title}</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Автор: {lesson.authorName}</p>
                {lesson.summary && <p className="mt-3 max-w-3xl leading-7">{lesson.summary}</p>}
              </div>
              <Button variant="secondary" onClick={() => setSelected(lesson)}>
                <LuEye />
                Открыть и проверить
              </Button>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

function PageLoader() {
  return <div className="flex min-h-64 items-center justify-center"><Spinner className="size-7" /></div>;
}

function lessonTypeLabel(value: Lesson['lessonType']) {
  return { lexicon: 'Лексика', grammar: 'Грамматика', speaking: 'Разговор', writing: 'Письмо' }[value];
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос.';
}
