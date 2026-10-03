import { useCallback, useEffect, useState } from 'react';

import { ApiError, request } from '../api/client';
import { Button, Card, ErrorNote, Spinner } from './ui';

interface Feedback {
  id: string;
  userEmail?: string;
  word: string;
  sentence: string;
  start: number;
  end: number;
  shown: string;
  provider: string;
  suggestion: string;
  comment: string;
  scope: 'sentence' | 'form';
  status: 'pending' | 'accepted' | 'rejected';
  final?: string;
  createdAt: string;
}

interface Editor { userId: string; email: string; displayName: string; grantedAt: string }

type Status = 'pending' | 'accepted' | 'rejected';
const STATUS_LABELS: Record<Status, string> = { pending: 'Ждут решения', accepted: 'Приняты', rejected: 'Отклонены' };
const PROVIDERS: Record<string, string> = { deepl: 'DeepL', google: 'Google', citavuk: 'редактор' };

/** Смещения с сервера — байты UTF-8, а строка JavaScript считает в UTF-16. */
function byteSlice(text: string, start: number, end: number): [string, string, string] {
  const bytes = new TextEncoder().encode(text);
  const decode = (b: Uint8Array) => new TextDecoder().decode(b);
  return [decode(bytes.slice(0, start)), decode(bytes.slice(start, end)), decode(bytes.slice(end))];
}

/** Жалобы на перевод слова и те, кто может исправлять сразу. */
export function AdminTranslationsPanel() {
  const [status, setStatus] = useState<Status>('pending');
  const [items, setItems] = useState<Feedback[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setItems(null);
    setError('');
    try {
      const res = await request<{ feedback: Feedback[] }>(`/v1/admin/translation-feedback?status=${status}`);
      setItems(res.feedback);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить жалобы.');
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
          <Button key={s} size="sm" variant={s === status ? 'primary' : 'secondary'} onClick={() => setStatus(s)}>
            {STATUS_LABELS[s]}
          </Button>
        ))}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!items && !error && <Spinner />}
      {items?.length === 0 && <p className="text-[var(--text-muted)]">Здесь пусто.</p>}
      {items?.map((item) => <FeedbackCard key={item.id} item={item} onDecided={load} />)}
      <EditorsCard />
    </div>
  );
}

function FeedbackCard({ item, onDecided }: { item: Feedback; onDecided: () => void }) {
  const [translation, setTranslation] = useState(item.suggestion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [before, word, after] = byteSlice(item.sentence, item.start, item.end);

  const decide = async (accept: boolean) => {
    setBusy(true);
    setError('');
    try {
      await request(`/v1/admin/translation-feedback/${item.id}/decision`, { method: 'POST', body: { accept, translation } });
      onDecided();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не получилось.');
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 p-5">
      <p className="text-lg leading-relaxed">
        {before}<mark className="rounded bg-gold/30 px-0.5 font-semibold">{word}</mark>{after}
      </p>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-[var(--text-muted)]">Показали</dt>
        <dd>{item.shown || '—'}<span className="text-[var(--text-muted)]">, перевёл {PROVIDERS[item.provider] ?? item.provider}</span></dd>
        <dt className="text-[var(--text-muted)]">Где</dt>
        <dd>{item.scope === 'form' ? `«${word}» везде` : 'только в этом предложении'}</dd>
        {item.comment && (<><dt className="text-[var(--text-muted)]">Комментарий</dt><dd className="whitespace-pre-wrap">{item.comment}</dd></>)}
        {item.userEmail && (<><dt className="text-[var(--text-muted)]">От</dt><dd>{item.userEmail}</dd></>)}
        {item.final && (<><dt className="text-[var(--text-muted)]">Итог</dt><dd className="font-semibold">{item.final}</dd></>)}
      </dl>
      {item.status === 'pending' && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
            placeholder="Верный перевод"
            maxLength={200}
            className="min-w-48 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          />
          <Button size="sm" disabled={busy || !translation.trim()} onClick={() => decide(true)}>Принять</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => decide(false)}>Отклонить</Button>
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </Card>
  );
}

/** Редакторы переводов: их исправления применяются без модерации. */
function EditorsCard() {
  const [editors, setEditors] = useState<Editor[] | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const call = async (promise: Promise<{ editors: Editor[] }>) => {
    setError('');
    try {
      setEditors((await promise).editors);
      setEmail('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не получилось.');
    }
  };

  useEffect(() => { void call(request('/v1/admin/translation-editors')); }, []);

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-xl">Редакторы переводов</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Их исправления сразу видят все, без твоего одобрения.</p>
      </div>
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => { e.preventDefault(); void call(request('/v1/admin/translation-editors', { method: 'POST', body: { email } })); }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Почта аккаунта"
          className="min-w-48 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
        <Button size="sm" type="submit">Дать право</Button>
      </form>
      {error && <ErrorNote>{error}</ErrorNote>}
      <ul className="divide-y divide-[var(--border)]">
        {editors?.map((e) => (
          <li key={e.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>{e.displayName || e.email} <span className="text-[var(--text-muted)]">{e.email}</span></span>
            <Button size="sm" variant="ghost" onClick={() => void call(request(`/v1/admin/translation-editors/${e.userId}`, { method: 'DELETE' }))}>
              Забрать
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
