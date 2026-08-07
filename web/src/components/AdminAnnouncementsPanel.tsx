import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuArchive, LuMegaphone, LuPlus, LuSave, LuSend } from 'react-icons/lu';

import {
  archiveAnnouncement,
  createAnnouncement,
  getAdminAnnouncements,
  publishAnnouncement,
  updateAnnouncement,
  type Announcement,
  type AnnouncementDraft,
} from '../api/announcements';
import { Button, ErrorNote, Spinner } from './ui';

const EMPTY: AnnouncementDraft = {
  kind: 'news', title: '', body: '', bannerText: '', imageUrl: '',
  actionLabel: '', actionUrl: '', startsAt: null, endsAt: null,
  bannerEnabled: true, notifyUsers: true, shareRequired: false,
  shareText: '', rewardKey: '', rewardAssetUrl: '',
};

export function AdminAnnouncementsPanel() {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AnnouncementDraft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Чаще всего нужно просто разослать уведомление, а полей у объявления
  // полтора десятка: баннер, картинка, кнопка, сроки показа, награда за
  // репост. Всё это прячется, пока не понадобится.
  const [advanced, setAdvanced] = useState(false);
  const chosenOnce = useRef(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const next = await getAdminAnnouncements();
      setItems(next);
      // Свежее объявление подставляется только при первом открытии панели.
      //
      // Раньше это делалось после каждой загрузки, а загрузка запускалась в том
      // числе нажатием «Новое объявление»: оно сбрасывало выбор, из-за чего
      // менялся сам `load`, эффект срабатывал заново — и пустая форма тут же
      // затиралась существующим объявлением. Опубликованное вдобавок блокирует
      // поля, поэтому со стороны выглядело так, будто форма не открывается.
      if (!chosenOnce.current && next[0]) {
        chosenOnce.current = true;
        setSelectedId(next[0].id);
        setDraft(toDraft(next[0]));
      }
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const selected = useMemo(() => items?.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  function choose(item: Announcement) {
    setSelectedId(item.id);
    setDraft(toDraft(item));
    setError(''); setMessage('');
  }

  function startNew() {
    setSelectedId(null); setDraft(EMPTY); setError(''); setMessage('');
  }

  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      // Короткий текст баннера в простом режиме не спрашивается: без него на
      // баннере остался бы один заголовок. Берём начало основного текста.
      const payload: AnnouncementDraft = {
        ...draft,
        bannerText: draft.bannerText.trim() || draft.body.trim().slice(0, 140),
      };
      const saved = selectedId
        ? await updateAnnouncement(selectedId, payload)
        : await createAnnouncement(payload);
      setSelectedId(saved.id);
      setMessage('Черновик сохранён.');
      await load();
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function publish() {
    if (!selectedId || !confirm('Разослать объявление пользователям и показать баннер?')) return;
    setBusy(true); setError('');
    try { await publishAnnouncement(selectedId); setMessage('Объявление опубликовано.'); await load(); }
    catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function archive() {
    if (!selectedId || !confirm('Убрать объявление из показа?')) return;
    setBusy(true); setError('');
    try { await archiveAnnouncement(selectedId); setMessage('Объявление отправлено в архив.'); await load(); }
    catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  if (!items) return <div className="grid min-h-52 place-items-center"><Spinner className="size-6" /></div>;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="border-r-0 border-[var(--line)] lg:border-r lg:pr-5">
        <Button size="sm" className="w-full" onClick={startNew}><LuPlus className="size-4" /> Новое объявление</Button>
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <button key={item.id} type="button" onClick={() => choose(item)}
              className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${selectedId === item.id ? 'border-[var(--accent)] bg-[var(--accent)]/8' : 'border-[var(--line)] hover:bg-[var(--bg-sunken)]'}`}>
              <span className="block truncate font-semibold">{item.title}</span>
              <span className="mt-1 flex justify-between text-xs text-[var(--text-muted)]">
                <span>{statusLabel(item.status)}</span><span>наград: {item.claimCount ?? 0}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-bold uppercase text-[var(--accent)]">Рассылка и баннер</p><h2 className="text-2xl">{selected ? selected.title : 'Новое объявление'}</h2></div>
          {selected && <span className="rounded-full bg-[var(--bg-sunken)] px-3 py-1 text-xs font-semibold">{statusLabel(selected.status)}</span>}
        </div>
        {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}
        {message && <p className="mb-4 rounded-lg bg-emerald-600/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}

        <fieldset disabled={busy || Boolean(selected && selected.status !== 'draft')} className="grid gap-4 disabled:opacity-70">
          <Field label="Заголовок"><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputClass} /></Field>
          <Field label="Текст"><textarea rows={5} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className={inputClass} /></Field>
          {/* Две галочки — это ответ на вопрос «куда оно уйдёт», и он нужен
              всегда, даже когда остальное свёрнуто. */}
          <div className="flex flex-wrap gap-5"><Check label="Показать баннер на сайте" checked={draft.bannerEnabled} onChange={(value) => setDraft({ ...draft, bannerEnabled: value })} /><Check label="Прислать уведомление" checked={draft.notifyUsers} onChange={(value) => setDraft({ ...draft, notifyUsers: value })} /></div>

          {advanced && (
            <>
              <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                <Field label="Тип"><select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as AnnouncementDraft['kind'] })} className={inputClass}><option value="news">Новость</option><option value="campaign">Акция</option><option value="maintenance">Техническое</option></select></Field>
                <Field label="Короткий текст баннера"><input value={draft.bannerText} onChange={(e) => setDraft({ ...draft, bannerText: e.target.value })} placeholder="по умолчанию — начало текста" className={inputClass} /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2"><Field label="Иллюстрация (HTTPS)"><input type="url" value={draft.imageUrl} onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })} className={inputClass} /></Field><Field label="Ссылка действия"><input value={draft.actionUrl} onChange={(e) => setDraft({ ...draft, actionUrl: e.target.value })} className={inputClass} /></Field></div>
              <div className="grid gap-4 sm:grid-cols-3"><Field label="Подпись кнопки"><input value={draft.actionLabel} onChange={(e) => setDraft({ ...draft, actionLabel: e.target.value })} className={inputClass} /></Field><Field label="Начало"><input type="datetime-local" value={fromISO(draft.startsAt)} onChange={(e) => setDraft({ ...draft, startsAt: toISO(e.target.value) })} className={inputClass} /></Field><Field label="Окончание"><input type="datetime-local" value={fromISO(draft.endsAt)} onChange={(e) => setDraft({ ...draft, endsAt: toISO(e.target.value) })} className={inputClass} /></Field></div>
              <Check label="Награда за публикацию в соцсетях" checked={draft.shareRequired} onChange={(value) => setDraft({ ...draft, shareRequired: value })} />
              {draft.shareRequired && <div className="grid gap-4 rounded-lg border border-[var(--line)] p-4"><Field label="Готовый текст для соцсетей"><textarea rows={4} value={draft.shareText} onChange={(e) => setDraft({ ...draft, shareText: e.target.value })} className={inputClass} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Ключ награды"><input value={draft.rewardKey} onChange={(e) => setDraft({ ...draft, rewardKey: e.target.value })} className={inputClass} /></Field><Field label="Файл фона (HTTPS)"><input type="url" value={draft.rewardAssetUrl} onChange={(e) => setDraft({ ...draft, rewardAssetUrl: e.target.value })} className={inputClass} /></Field></div></div>}
            </>
          )}
        </fieldset>

        {/* Кнопка вне fieldset: у опубликованного объявления поля заблокированы,
            а посмотреть, что в нём настроено, всё равно нужно. */}
        <button type="button" onClick={() => setAdvanced((value) => !value)} className="mt-3 text-sm font-semibold text-[var(--accent)] underline-offset-2 hover:underline">
          {advanced ? 'Свернуть' : 'Баннер, картинка, кнопка, сроки, награда'}
        </button>

        <div className="mt-6 flex flex-wrap gap-2">
          {(!selected || selected.status === 'draft') && <Button disabled={busy} onClick={() => void save()}><LuSave className="size-4" /> Сохранить</Button>}
          {selected?.status === 'draft' && <Button disabled={busy} variant="secondary" onClick={() => void publish()}><LuSend className="size-4" /> Опубликовать и разослать</Button>}
          {selected?.status === 'published' && <Button disabled={busy} variant="secondary" onClick={() => void archive()}><LuArchive className="size-4" /> Завершить показ</Button>}
        </div>

        {draft.title && <div className="mt-8 border-t border-[var(--line)] pt-6"><p className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-[var(--text-muted)]"><LuMegaphone className="size-4" /> Предпросмотр баннера</p><div className="flex items-center gap-3 border-y border-[var(--accent)]/25 bg-[var(--bg-raised)] px-4 py-3">{draft.imageUrl && <img src={draft.imageUrl} alt="" className="size-12 object-contain" />}<div><strong>{draft.title}</strong><p className="text-sm text-[var(--text-muted)]">{draft.bannerText}</p></div></div></div>}
      </section>
    </div>
  );
}

const inputClass = 'mt-1.5 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-[var(--text)] outline-none focus:border-[var(--accent)]';
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-sm font-semibold">{label}{children}</label>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--accent)]" />{label}</label>; }
function statusLabel(status: Announcement['status']) { return status === 'draft' ? 'Черновик' : status === 'published' ? 'Опубликовано' : 'Архив'; }
function toDraft(item: Announcement): AnnouncementDraft { return { kind: item.kind, title: item.title, body: item.body, bannerText: item.bannerText, imageUrl: item.imageUrl, actionLabel: item.actionLabel, actionUrl: item.actionUrl, startsAt: item.startsAt, endsAt: item.endsAt, bannerEnabled: item.bannerEnabled, notifyUsers: item.notifyUsers, shareRequired: item.shareRequired, shareText: item.shareText, rewardKey: item.rewardKey, rewardAssetUrl: item.rewardAssetUrl }; }
function fromISO(value: string | null) { if (!value) return ''; const date = new Date(value); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }
function toISO(value: string) { return value ? new Date(value).toISOString() : null; }
function messageOf(caught: unknown) { return caught instanceof Error ? caught.message : 'Не удалось выполнить запрос.'; }
