import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LuArchive,
  LuBot,
  LuCloudDownload,
  LuPlus,
  LuSave,
  LuSend,
  LuTrash2,
  LuX,
} from 'react-icons/lu';

import {
  archiveMicroFeedItem,
  createMicroFeedItem,
  deleteMicroFeedItem,
  generateMicroFeedItem,
  getAdminMicroFeedImports,
  getAdminMicroFeedItems,
  getAdminMicroFeedSources,
  publishMicroFeedItem,
  rejectMicroFeedImport,
  syncMicroFeedSource,
  updateMicroFeedItem,
  type DifficultWord,
  type MicroFeedImport,
  type MicroFeedItem,
  type MicroFeedItemDraft,
  type MicroFeedSource,
} from '../api/microFeed';
import { WordReader } from './WordReader';
import { Button, ErrorNote, Spinner } from './ui';

type FeedAdminView = 'queue' | 'cards';

const EMPTY_WORDS: DifficultWord[] = [0, 1, 2].map(() => ({
  word: '', lemma: '', transcription: '', translationRu: '',
}));

const EMPTY: MicroFeedItemDraft = {
  kind: 'fact', category: 'culture', titleCyrillic: '', titleLatin: '',
  textCyrillic: '', textLatin: '', originalLanguage: 'sr', originalScript: 'latin',
  cefr: 'B1', tags: [], difficultWords: EMPTY_WORDS, imageUrl: '', audioUrl: '',
  sourceSlug: '', sourceTitle: '', sourceUrl: '', licenseCode: '', attributionText: '',
  bookId: '', chapterId: '', startPositionChar: 0, bookTargetUrl: '',
};

export function AdminMicroFeedPanel() {
  const [sources, setSources] = useState<MicroFeedSource[] | null>(null);
  const [imports, setImports] = useState<MicroFeedImport[] | null>(null);
  const [items, setItems] = useState<MicroFeedItem[] | null>(null);
  const [view, setView] = useState<FeedAdminView>('queue');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MicroFeedItemDraft>(EMPTY);
  const [generatorEnabled, setGeneratorEnabled] = useState(false);
  const [embeddingsEnabled, setEmbeddingsEnabled] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [sourceResponse, nextImports, nextItems] = await Promise.all([
        getAdminMicroFeedSources(), getAdminMicroFeedImports(), getAdminMicroFeedItems(),
      ]);
      setSources(sourceResponse.items);
      setGeneratorEnabled(sourceResponse.generatorEnabled);
      setEmbeddingsEnabled(sourceResponse.embeddingsEnabled);
      setImports(nextImports);
      setItems(nextItems);
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(
    () => items?.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  async function syncSource(source: MicroFeedSource) {
    setBusy(`source:${source.slug}`); setError(''); setMessage('');
    try {
      const result = await syncMicroFeedSource(source.slug);
      setMessage(`${source.title}: найдено ${result.found}, новых заготовок ${result.saved}.`);
      await load();
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(''); }
  }

  async function generate(input: MicroFeedImport) {
    setBusy(`import:${input.id}`); setError(''); setMessage('');
    try {
      const created = await generateMicroFeedItem(input.id);
      await load();
      setSelectedId(created.id); setDraft(toDraft(created)); setView('cards');
      setMessage('Черновик подготовлен. Проверьте текст и источник перед публикацией.');
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(''); }
  }

  async function reject(input: MicroFeedImport) {
    if (!confirm(`Убрать «${input.title}» из очереди?`)) return;
    setBusy(`import:${input.id}`); setError('');
    try { await rejectMicroFeedImport(input.id, 'Не подходит для Вукотока'); await load(); }
    catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(''); }
  }

  function choose(item: MicroFeedItem) {
    setSelectedId(item.id); setDraft(toDraft(item)); setError(''); setMessage('');
  }

  function startNew() {
    setSelectedId(null); setDraft({ ...EMPTY, difficultWords: EMPTY_WORDS.map((word) => ({ ...word })) });
    setError(''); setMessage('');
  }

  async function save() {
    setBusy('save'); setError(''); setMessage('');
    try {
      const saved = selectedId
        ? await updateMicroFeedItem(selectedId, draft)
        : await createMicroFeedItem(draft);
      await load(); setSelectedId(saved.id); setDraft(toDraft(saved));
      setMessage('Черновик сохранён.');
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(''); }
  }

  async function publish() {
    if (!selectedId || !confirm('Опубликовать карточку в Вукотоке?')) return;
    setBusy('publish'); setError('');
    try {
      const published = await publishMicroFeedItem(selectedId);
      await load(); setDraft(toDraft(published));
      setMessage('Карточка опубликована.');
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(''); }
  }

  async function archive() {
    if (!selectedId) return;
    setBusy('archive'); setError('');
    try { await archiveMicroFeedItem(selectedId); await load(); setMessage('Карточка убрана из ленты.'); }
    catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(''); }
  }

  async function remove() {
    if (!selectedId || !confirm('Удалить карточку без возможности восстановления?')) return;
    setBusy('delete'); setError('');
    try { await deleteMicroFeedItem(selectedId); setSelectedId(null); setDraft(EMPTY); await load(); }
    catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(''); }
  }

  if (!sources || !imports || !items) {
    return <div className="grid min-h-64 place-items-center"><Spinner className="size-6" /></div>;
  }

  return (
    <div className="space-y-7">
      <section className="border-b border-[var(--line)] pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl">Источники</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Генератор: {generatorEnabled ? 'включён' : 'не настроен'} · векторы: {embeddingsEnabled ? 'включены' : 'резервный режим'}
            </p>
          </div>
          <div className="flex rounded-lg border border-[var(--line)] p-1" role="tablist">
            <AdminSwitch active={view === 'queue'} onClick={() => setView('queue')}>Очередь · {imports.length}</AdminSwitch>
            <AdminSwitch active={view === 'cards'} onClick={() => setView('cards')}>Карточки · {items.length}</AdminSwitch>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {sources.map((source) => (
            <div key={source.slug} className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--line)] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{source.title}</p>
                <p className="truncate text-xs text-[var(--text-muted)]">{rightsLabel(source.rightsMode)} · {source.licenseCode}</p>
              </div>
              {source.enabled && source.sourceKind !== 'manual' && (
                <button type="button" title="Загрузить свежие материалы" onClick={() => void syncSource(source)} disabled={Boolean(busy)} className="grid size-9 shrink-0 place-items-center rounded-md border border-[var(--line)] hover:border-[var(--accent)] disabled:opacity-50">
                  {busy === `source:${source.slug}` ? <Spinner /> : <LuCloudDownload />}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {error && <ErrorNote>{error}</ErrorNote>}
      {message && <p className="rounded-lg bg-emerald-600/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}

      {view === 'queue' ? (
        <section>
          <h2 className="text-2xl">Новые заготовки</h2>
          <div className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {imports.length === 0 && <p className="py-8 text-center text-[var(--text-muted)]">Очередь пуста. Обновите один из источников.</p>}
            {imports.map((input) => (
              <article key={input.id} className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase text-[var(--text-muted)]"><span>{input.sourceTitle}</span><span>·</span><span>{input.sourcePublishedAt ? new Date(input.sourcePublishedAt).toLocaleDateString('ru') : 'без даты'}</span></div>
                  <h3 className="mt-2 text-lg font-semibold">{input.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--text-muted)]">{input.rawText}</p>
                  <a href={input.sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-2 inline-block text-xs text-[var(--accent)] underline">Открыть первоисточник</a>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={Boolean(busy) || !generatorEnabled} onClick={() => void generate(input)}>{busy === `import:${input.id}` ? <Spinner /> : <LuBot />} Подготовить</Button>
                  <button type="button" title="Отклонить" disabled={Boolean(busy)} onClick={() => void reject(input)} className="grid size-10 place-items-center rounded-lg border border-[var(--line)] hover:border-[var(--accent)]"><LuX /></button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="min-w-0 xl:border-r xl:border-[var(--line)] xl:pr-5">
            <Button size="sm" className="w-full" onClick={startNew}><LuPlus /> Новая карточка</Button>
            <div className="mt-3 max-h-[70dvh] space-y-1 overflow-y-auto pr-1">
              {items.map((item) => (
                <button key={item.id} type="button" onClick={() => choose(item)} className={`w-full rounded-lg border px-3 py-2.5 text-left ${selectedId === item.id ? 'border-[var(--accent)] bg-[var(--accent)]/8' : 'border-transparent hover:bg-[var(--bg-sunken)]'}`}>
                  <span className="block truncate text-sm font-semibold">{item.titleCyrillic}</span>
                  <span className="mt-1 flex justify-between text-xs text-[var(--text-muted)]"><span>{statusLabel(item.status)}</span><span>{item.cefr}</span></span>
                </button>
              ))}
            </div>
          </aside>

          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm font-bold uppercase text-[var(--accent)]">Редактор ленты</p><h2 className="text-2xl">{selected?.titleCyrillic || 'Новая карточка'}</h2></div>
              {selected && <span className="rounded-md bg-[var(--bg-sunken)] px-2.5 py-1 text-xs font-semibold">{statusLabel(selected.status)}</span>}
            </div>

            <fieldset disabled={Boolean(busy) || Boolean(selected && selected.status !== 'draft')} className="grid gap-4 disabled:opacity-70">
              <div className="grid gap-4 sm:grid-cols-3"><Field label="Тип"><select className={inputClass} value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as MicroFeedItemDraft['kind'] })}>{kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Категория"><select className={inputClass} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as MicroFeedItemDraft['category'] })}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="CEFR"><select className={inputClass} value={draft.cefr} onChange={(event) => setDraft({ ...draft, cefr: event.target.value as MicroFeedItemDraft['cefr'] })}>{['A1','A2','B1','B2','C1'].map((value) => <option key={value}>{value}</option>)}</select></Field></div>
              <div className="grid gap-4 md:grid-cols-2"><Field label="Заголовок · кириллица"><input className={inputClass} value={draft.titleCyrillic} onChange={(event) => setDraft({ ...draft, titleCyrillic: event.target.value })} /></Field><Field label="Заголовок · латиница"><input className={inputClass} value={draft.titleLatin} onChange={(event) => setDraft({ ...draft, titleLatin: event.target.value })} /></Field></div>
              <div className="grid gap-4 md:grid-cols-2"><Field label={`Текст · кириллица (${wordCount(draft.textCyrillic)} слов)`}><textarea rows={10} className={inputClass} value={draft.textCyrillic} onChange={(event) => setDraft({ ...draft, textCyrillic: event.target.value })} /></Field><Field label={`Текст · латиница (${wordCount(draft.textLatin)} слов)`}><textarea rows={10} className={inputClass} value={draft.textLatin} onChange={(event) => setDraft({ ...draft, textLatin: event.target.value })} /></Field></div>
              <div className="grid gap-4 md:grid-cols-3"><Field label="Исходный язык"><input className={inputClass} value={draft.originalLanguage} onChange={(event) => setDraft({ ...draft, originalLanguage: event.target.value })} /></Field><Field label="Исходный алфавит"><select className={inputClass} value={draft.originalScript} onChange={(event) => setDraft({ ...draft, originalScript: event.target.value as MicroFeedItemDraft['originalScript'] })}><option value="cyrillic">Кириллица</option><option value="latin">Латиница</option><option value="translated">Перевод</option></select></Field><Field label="Теги через запятую"><input className={inputClass} value={draft.tags.join(', ')} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} /></Field></div>

              <div><p className="text-sm font-semibold">Сложные слова</p><div className="mt-2 space-y-2">{draft.difficultWords.map((word, index) => <div key={index} className="grid gap-2 sm:grid-cols-4"><input aria-label={`Слово ${index + 1}`} placeholder="слово" className={inputClass} value={word.word} onChange={(event) => updateWord(index, 'word', event.target.value, draft, setDraft)} /><input aria-label={`Лемма ${index + 1}`} placeholder="лемма" className={inputClass} value={word.lemma} onChange={(event) => updateWord(index, 'lemma', event.target.value, draft, setDraft)} /><input aria-label={`Транскрипция ${index + 1}`} placeholder="/IPA/" className={inputClass} value={word.transcription} onChange={(event) => updateWord(index, 'transcription', event.target.value, draft, setDraft)} /><input aria-label={`Перевод ${index + 1}`} placeholder="перевод" className={inputClass} value={word.translationRu} onChange={(event) => updateWord(index, 'translationRu', event.target.value, draft, setDraft)} /></div>)}</div></div>

              <div className="grid gap-4 md:grid-cols-2"><Field label="Изображение (HTTPS)"><input type="url" className={inputClass} value={draft.imageUrl} onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })} /></Field><Field label="Готовое аудио (необязательно)"><input type="url" className={inputClass} value={draft.audioUrl} onChange={(event) => setDraft({ ...draft, audioUrl: event.target.value })} /></Field></div>
              <div className="grid gap-4 md:grid-cols-2"><Field label="Название источника"><input className={inputClass} value={draft.sourceTitle} onChange={(event) => setDraft({ ...draft, sourceTitle: event.target.value })} /></Field><Field label="Ссылка источника"><input type="url" className={inputClass} value={draft.sourceUrl} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} /></Field><Field label="Атрибуция"><input className={inputClass} value={draft.attributionText} onChange={(event) => setDraft({ ...draft, attributionText: event.target.value })} /></Field><Field label="Лицензия"><input className={inputClass} value={draft.licenseCode} onChange={(event) => setDraft({ ...draft, licenseCode: event.target.value })} /></Field></div>
              <div className="grid gap-4 md:grid-cols-3"><Field label="ID книги"><input className={inputClass} value={draft.bookId} onChange={(event) => setDraft({ ...draft, bookId: event.target.value })} /></Field><Field label="Глава"><input className={inputClass} value={draft.chapterId} onChange={(event) => setDraft({ ...draft, chapterId: event.target.value })} /></Field><Field label="Позиция символа"><input type="number" min={0} className={inputClass} value={draft.startPositionChar} onChange={(event) => setDraft({ ...draft, startPositionChar: Number(event.target.value) || 0 })} /></Field></div>
              <Field label="Ссылка «Продолжить чтение»"><input className={inputClass} value={draft.bookTargetUrl} onChange={(event) => setDraft({ ...draft, bookTargetUrl: event.target.value })} /></Field>
            </fieldset>

            <div className="mt-6 flex flex-wrap gap-2">
              {(!selected || selected.status === 'draft') && <Button disabled={Boolean(busy)} onClick={() => void save()}>{busy === 'save' ? <Spinner /> : <LuSave />} Сохранить</Button>}
              {selected?.status === 'draft' && <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void publish()}>{busy === 'publish' ? <Spinner /> : <LuSend />} Опубликовать</Button>}
              {selected?.status === 'published' && <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void archive()}><LuArchive /> Убрать из ленты</Button>}
              {selected && <button type="button" title="Удалить" disabled={Boolean(busy)} onClick={() => void remove()} className="grid size-11 place-items-center rounded-lg border border-red-500/35 text-red-700 hover:bg-red-500/10 dark:text-red-300"><LuTrash2 /></button>}
            </div>

            {draft.textCyrillic && <div className="mt-8 border-t border-[var(--line)] pt-6"><p className="text-xs font-bold uppercase text-[var(--text-muted)]">Предпросмотр · кириллица</p><h3 className="mt-3 font-display text-2xl font-bold">{draft.titleCyrillic}</h3><WordReader paragraphs={[draft.textCyrillic]} className="mt-4" paragraphClassName="font-display text-lg leading-8" /></div>}
          </div>
        </section>
      )}
    </div>
  );
}

function AdminSwitch({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`rounded-md px-3 py-2 text-sm font-semibold ${active ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)]'}`}>{children}</button>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-sm font-semibold">{label}{children}</label>; }
const inputClass = 'mt-1.5 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-[var(--text)] outline-none focus:border-[var(--accent)]';
const kinds: Array<[MicroFeedItemDraft['kind'], string]> = [['news','Новость'],['fact','Факт'],['culture','Культура'],['science','Наука'],['fiction','Литература'],['society','Общество'],['book_excerpt','Отрывок из книги']];
const categories: Array<[MicroFeedItemDraft['category'], string]> = [['history','История'],['culture','Культура'],['science','Наука'],['fiction','Литература'],['society','Общество'],['news','Новости']];
function rightsLabel(value: MicroFeedSource['rightsMode']) { return value === 'reuse' ? 'можно адаптировать' : value === 'summary_only' ? 'только пересказ' : 'ручная проверка'; }
function statusLabel(value: MicroFeedItem['status']) { return value === 'draft' ? 'Черновик' : value === 'published' ? 'Опубликовано' : 'Архив'; }
function wordCount(value: string) { return value.trim() ? value.trim().split(/\s+/).length : 0; }
function toDraft(item: MicroFeedItem): MicroFeedItemDraft { return { kind: item.kind, category: item.category, titleCyrillic: item.titleCyrillic, titleLatin: item.titleLatin, textCyrillic: item.textCyrillic, textLatin: item.textLatin, originalLanguage: item.originalLanguage, originalScript: item.originalScript, cefr: item.cefr, tags: item.tags, difficultWords: item.difficultWords.length === 3 ? item.difficultWords : EMPTY_WORDS.map((word) => ({ ...word })), imageUrl: item.imageUrl, audioUrl: item.audioUrl, sourceSlug: item.sourceSlug, sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl, licenseCode: item.licenseCode, attributionText: item.attributionText, bookId: item.bookId, chapterId: item.chapterId, startPositionChar: item.startPositionChar, bookTargetUrl: item.bookTargetUrl }; }
function updateWord(index: number, field: keyof DifficultWord, value: string, draft: MicroFeedItemDraft, setDraft: (value: MicroFeedItemDraft) => void) { const words = draft.difficultWords.map((word, current) => current === index ? { ...word, [field]: value } : word); setDraft({ ...draft, difficultWords: words }); }
function messageOf(caught: unknown) { return caught instanceof Error ? caught.message : 'Не удалось выполнить запрос.'; }
