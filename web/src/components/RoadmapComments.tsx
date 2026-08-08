import { useEffect, useMemo, useState } from 'react';
import { LuCornerDownRight, LuTrash2 } from 'react-icons/lu';

import {
  addRoadmapComment,
  deleteRoadmapComment,
  loadRoadmapComments,
  type RoadmapComment,
} from '../api/roadmap';
import { useRouter } from '../lib/router';
import { useAuth } from '../state/auth';
import { Button, ErrorNote, Spinner } from './ui';

/**
 * Обсуждение уровня карты.
 *
 * Своя ветка на каждую ступень, а не одна на всю страницу: «что читать на A2»
 * не должно тонуть в спорах про C1. Ветка на клетку (уровень × раздел) была бы
 * ещё точнее, но при нынешней посещаемости большинство из двадцати четырёх
 * осталось бы пустыми, а пустая ветка отбивает желание писать первым.
 *
 * Глубина ответов — одна. Дерево произвольной глубины на телефоне упирается в
 * ширину экрана, и ответ на ответ цепляется к корню ветки (это делает сервер).
 */
export function RoadmapComments({ level }: { level: string }) {
  const { account } = useAuth();
  const { navigate } = useRouter();
  const [comments, setComments] = useState<RoadmapComment[] | null>(null);
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setComments(null);
    setError('');
    setReplyTo('');
    loadRoadmapComments(level, controller.signal)
      .then(setComments)
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : 'Обсуждение не загрузилось.');
      });
    return () => controller.abort();
  }, [level]);

  const threads = useMemo(() => {
    const roots = (comments ?? []).filter((comment) => !comment.parentId);
    const replies = new Map<string, RoadmapComment[]>();
    for (const comment of comments ?? []) {
      if (!comment.parentId) continue;
      const list = replies.get(comment.parentId) ?? [];
      list.push(comment);
      replies.set(comment.parentId, list);
    }
    return roots.map((root) => ({ root, replies: replies.get(root.id) ?? [] }));
  }, [comments]);

  const append = (comment: RoadmapComment) => {
    setComments((previous) => [...(previous ?? []), comment]);
    setReplyTo('');
  };

  const remove = async (id: string) => {
    await deleteRoadmapComment(id);
    setComments((previous) => (previous ?? []).filter((comment) => comment.id !== id));
  };

  return (
    <section className="mt-16 border-t border-[var(--line)] pt-10">
      <h2 className="font-display text-2xl">Обсуждение уровня {level}</h2>
      <p className="mt-2 max-w-3xl text-[var(--text-muted)]">
        Любая дорожная карта требует обсуждений и дополнений, которые мог не
        учесть автор. Что добавить в этот уровень, что убрать, где вы застряли?
      </p>

      {account ? (
        <CommentForm level={level} onAdded={append} />
      ) : (
        <p className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)]/50 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="font-semibold text-[var(--accent)]"
          >
            Войдите
          </button>
          , чтобы участвовать в обсуждении. Читать его можно и без входа.
        </p>
      )}

      {error && <div className="mt-5"><ErrorNote>{error}</ErrorNote></div>}
      {!comments && !error && <div className="py-8 text-center"><Spinner /></div>}

      {comments && comments.length === 0 && (
        <p className="mt-6 text-[var(--text-muted)]">
          Пока никто не высказался. Будьте первым.
        </p>
      )}

      <ol className="mt-6 grid gap-5">
        {threads.map(({ root, replies }) => (
          <li key={root.id} className="rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] p-4">
            <CommentBody comment={root} onDelete={remove} />
            {replies.length > 0 && (
              <ol className="mt-4 grid gap-4 border-l-2 border-[var(--line)] pl-4">
                {replies.map((reply) => (
                  <li key={reply.id}>
                    <CommentBody comment={reply} onDelete={remove} />
                  </li>
                ))}
              </ol>
            )}
            {account && (
              <div className="mt-3">
                {replyTo === root.id ? (
                  <CommentForm
                    level={level}
                    parentId={root.id}
                    onAdded={append}
                    onCancel={() => setReplyTo('')}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setReplyTo(root.id)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]"
                  >
                    <LuCornerDownRight />
                    Ответить
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function CommentBody({
  comment,
  onDelete,
}: {
  comment: RoadmapComment;
  onDelete: (id: string) => Promise<void>;
}) {
  const { account } = useAuth();
  const [busy, setBusy] = useState(false);
  const canDelete = comment.mine || Boolean(account?.isAdmin);

  return (
    <article>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">{comment.author}</p>
        <div className="flex items-center gap-3">
          <time className="text-xs text-[var(--text-muted)]" dateTime={comment.createdAt}>
            {new Date(comment.createdAt).toLocaleDateString('ru')}
          </time>
          {canDelete && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDelete(comment.id);
                } finally {
                  setBusy(false);
                }
              }}
              title="Удалить"
              aria-label="Удалить комментарий"
              className="text-[var(--text-muted)] hover:text-red-600 disabled:opacity-60"
            >
              <LuTrash2 />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 whitespace-pre-line leading-7">{comment.body}</p>
    </article>
  );
}

function CommentForm({
  level,
  parentId,
  onAdded,
  onCancel,
}: {
  level: string;
  parentId?: string;
  onAdded: (comment: RoadmapComment) => void;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      onAdded(await addRoadmapComment(level, body, parentId));
      setBody('');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={parentId ? '' : 'mt-5'}>
      <textarea
        rows={parentId ? 2 : 3}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={parentId ? 'Ваш ответ' : 'Что добавить в этот уровень?'}
        className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] p-3 outline-none focus:border-[var(--accent)]"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button onClick={send} disabled={busy || !body.trim()}>
          {busy ? 'Отправляем…' : 'Отправить'}
        </Button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-[var(--text-muted)]"
          >
            Отмена
          </button>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
