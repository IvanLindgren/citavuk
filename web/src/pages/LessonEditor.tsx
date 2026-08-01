import { useEffect, useMemo, useState } from 'react';
import {
  LuChevronDown,
  LuChevronUp,
  LuEye,
  LuLink,
  LuMessageCircle,
  LuPlus,
  LuSave,
  LuSend,
  LuSettings2,
  LuTrash2,
  LuUpload,
} from 'react-icons/lu';

import {
  createTeacherLesson,
  getTeacherLessons,
  publishUnlistedLesson,
  submitPublicLesson,
  updateTeacherLesson,
  type DialogueNode,
  type Lesson,
  type LessonContent,
  type LessonDraft,
} from '../api/lessons';
import { ApiError } from '../api/client';
import { LessonExerciseEditor } from '../components/LessonExerciseEditor';
import { LessonMarkdownEditor } from '../components/LessonMarkdownEditor';
import { LessonPlayer } from '../components/LessonPlayer';
import { ErrorNote, Spinner } from '../components/ui';
import {
  DEFAULT_DOCUMENT_STYLE,
  markdownFromContent,
  markdownToTheory,
} from '../lib/lessonMarkdown';
import { Link, useParams, useRouter } from '../lib/router';

const field = 'w-full rounded-md border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2.5 outline-none focus:border-[var(--accent)]';

const emptyContent = (): LessonContent => ({
  theory: [{ id: crypto.randomUUID(), type: 'paragraph', text: '' }],
  exercises: [],
  markdown: '',
  documentStyle: { ...DEFAULT_DOCUMENT_STYLE },
});

const emptyDraft = (): LessonDraft => ({
  title: '',
  summary: '',
  level: 'A1',
  lessonType: 'lexicon',
  topic: '',
  tags: [],
  estimatedMinutes: 15,
  script: 'both',
  content: emptyContent(),
});

export function LessonEditor() {
  const { id = 'new' } = useParams();
  const { navigate } = useRouter();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [draft, setDraft] = useState<LessonDraft>(() => emptyDraft());
  const [tagsText, setTagsText] = useState('');
  const [loading, setLoading] = useState(id !== 'new');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (id === 'new') return;
    getTeacherLessons().then((items) => {
      const found = items.find((item) => item.id === id);
      if (!found) throw new Error('Урок не найден.');
      const content = normalizeContent(found.content);
      setLesson(found);
      setTagsText(found.tags.join(', '));
      setDraft({
        title: found.title,
        summary: found.summary,
        level: found.level,
        lessonType: found.lessonType,
        topic: found.topic,
        tags: found.tags,
        estimatedMinutes: found.estimatedMinutes,
        script: found.script,
        content,
      });
    }).catch((caught) => setError(messageOf(caught))).finally(() => setLoading(false));
  }, [id]);

  const setContent = (content: LessonContent) => setDraft((old) => ({ ...old, content }));
  const markdown = markdownFromContent(draft.content);

  const save = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const content = { ...draft.content, markdown, theory: markdownToTheory(markdown) };
      const body = { ...draft, content, tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean) };
      const saved = lesson ? await updateTeacherLesson(lesson.id, body) : await createTeacherLesson(body);
      setLesson(saved);
      setDraft((old) => ({ ...old, tags: saved.tags, content: normalizeContent(saved.content ?? content) }));
      setMessage('Черновик сохранён.');
      if (id === 'new') navigate(`/teachers/lessons/${saved.id}`, { replace: true });
      return saved;
    } catch (caught) {
      setError(messageOf(caught));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const publish = async (visibility: 'public' | 'unlisted') => {
    const saved = await save();
    if (!saved?.revisionId) return;
    setBusy(true); setError('');
    try {
      if (visibility === 'public') {
        await submitPublicLesson(saved.id, saved.revisionId);
        setMessage('Версия отправлена администратору на модерацию.');
      } else {
        await publishUnlistedLesson(saved.id, saved.revisionId);
        setMessage('Урок опубликован по закрытой ссылке.');
      }
      setLesson({ ...saved, revisionStatus: visibility === 'public' ? 'pending' : 'published', visibility: visibility === 'public' ? saved.visibility : 'unlisted' });
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const previewLesson = useMemo<Lesson>(() => ({
    id: lesson?.id ?? 'preview',
    authorId: lesson?.authorId ?? 'preview',
    authorName: lesson?.authorName ?? 'Вы',
    authorAvatar: lesson?.authorAvatar,
    slug: lesson?.slug ?? 'preview',
    title: draft.title,
    summary: draft.summary,
    level: draft.level,
    lessonType: draft.lessonType,
    topic: draft.topic,
    tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
    estimatedMinutes: draft.estimatedMinutes,
    script: draft.script,
    visibility: 'draft',
    revisionId: lesson?.revisionId,
    revisionStatus: 'draft',
    content: draft.content,
    updatedAt: new Date().toISOString(),
  }), [draft, lesson, tagsText]);

  if (loading) return <main className="grid min-h-[60vh] place-items-center"><Spinner className="size-6" /></main>;
  if (preview) return <LessonPlayer lesson={previewLesson} preview onExit={() => setPreview(false)} />;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="sticky top-16 z-30 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--bg)]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="min-w-0"><Link to="/teachers" className="text-sm font-semibold text-[var(--accent)]">← Мои уроки</Link><p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{lesson ? 'Черновик урока' : 'Новый урок'}</p></div>
        <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
          <ActionButton title="Пройти урок" onClick={() => setPreview(true)}><LuEye /><span className="hidden sm:inline">Пройти урок</span></ActionButton>
          <ActionButton title="Сохранить" onClick={() => void save()} disabled={busy}><LuSave /><span className="hidden sm:inline">Сохранить</span></ActionButton>
          <ActionButton title="Опубликовать по ссылке" onClick={() => void publish('unlisted')} disabled={busy}><LuUpload /><span className="hidden lg:inline">По ссылке</span></ActionButton>
          <button type="button" title="Отправить в каталог" aria-label="Отправить в каталог" onClick={() => void publish('public')} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--accent)] px-4 font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"><LuSend /><span className="hidden sm:inline">В каталог</span></button>
        </div>
      </div>

      {message && <p role="status" className="mt-5 rounded-md bg-emerald-700/10 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p>}
      {error && <div className="mt-5"><ErrorNote>{error}</ErrorNote></div>}
      {lesson?.visibility === 'unlisted' && lesson.shareToken && <p className="mt-4 flex items-center gap-2 text-sm"><LuLink className="text-[var(--accent)]" /><Link className="text-[var(--accent)] underline" to={`/lesson/link/${lesson.shareToken}`}>{location.origin}/lesson/link/{lesson.shareToken}</Link></p>}

      <div className="mx-auto mt-10 max-w-5xl">
        <textarea rows={2} maxLength={160} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Название урока" className="w-full resize-none bg-transparent font-display text-3xl font-bold leading-tight outline-none placeholder:text-[var(--text-muted)]/45 sm:text-5xl" />
        <textarea rows={2} maxLength={500} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} placeholder="Короткое описание" className="mt-3 w-full resize-none bg-transparent text-lg leading-8 text-[var(--text-muted)] outline-none placeholder:text-[var(--text-muted)]/45" />

        <section className="mt-6 border-y border-[var(--line)] py-3">
          <button type="button" onClick={() => setPropertiesOpen((open) => !open)} className="flex w-full items-center gap-2 py-1 text-left text-sm font-semibold"><LuSettings2 className="text-[var(--accent)]" />Свойства урока<span className="ml-auto text-[var(--text-muted)]">{propertiesOpen ? <LuChevronUp /> : <LuChevronDown />}</span></button>
          {propertiesOpen && <div className="mt-4 grid gap-4 pb-2 sm:grid-cols-2 lg:grid-cols-4">
            <Property label="Уровень"><select className={field} value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value })}>{['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => <option key={level}>{level}</option>)}</select></Property>
            <Property label="Тип"><select className={field} value={draft.lessonType} onChange={(event) => setDraft({ ...draft, lessonType: event.target.value as LessonDraft['lessonType'] })}><option value="lexicon">Лексика</option><option value="grammar">Грамматика</option><option value="speaking">Говорение</option><option value="writing">Письмо</option></select></Property>
            <Property label="Тема"><input className={field} value={draft.topic} onChange={(event) => setDraft({ ...draft, topic: event.target.value })} /></Property>
            <Property label="Минуты"><input type="number" min={1} max={240} className={field} value={draft.estimatedMinutes} onChange={(event) => setDraft({ ...draft, estimatedMinutes: Number(event.target.value) })} /></Property>
            <Property label="Теги"><input className={field} value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="путешествия, глаголы" /></Property>
            <Property label="Письменность"><select className={field} value={draft.script} onChange={(event) => setDraft({ ...draft, script: event.target.value as LessonDraft['script'] })}><option value="both">Обе</option><option value="latin">Латиница</option><option value="cyrillic">Кириллица</option></select></Property>
          </div>}
        </section>

        <LessonMarkdownEditor
          value={markdown}
          documentStyle={draft.content.documentStyle ?? DEFAULT_DOCUMENT_STYLE}
          onChange={(value) => setContent({ ...draft.content, markdown: value, theory: markdownToTheory(value) })}
          onStyleChange={(documentStyle) => setContent({ ...draft.content, documentStyle })}
        />
        <LessonExerciseEditor exercises={draft.content.exercises} onChange={(exercises) => setContent({ ...draft.content, exercises })} />
        <DialogueEditor content={draft.content} onChange={setContent} />
      </div>
    </main>
  );
}

function DialogueEditor({ content, onChange }: { content: LessonContent; onChange: (content: LessonContent) => void }) {
  const nodes = content.dialogue?.nodes ?? [];
  const enabled = Boolean(content.dialogue);
  const addNode = () => {
    const id = `replica-${crypto.randomUUID().slice(0, 8)}`;
    const node: DialogueNode = { id, speaker: 'Преподаватель', avatar: 'teacher', text: '', choices: [] };
    onChange({ ...content, dialogue: { startId: content.dialogue?.startId ?? id, nodes: [...nodes, node] } });
  };
  const toggle = () => {
    if (enabled) onChange({ ...content, dialogue: undefined });
    else {
      const node: DialogueNode = { id: 'start', speaker: 'Преподаватель', avatar: 'teacher', text: '', choices: [] };
      onChange({ ...content, dialogue: { startId: node.id, nodes: [node] } });
    }
  };
  const updateNode = (index: number, node: DialogueNode) => {
    if (!content.dialogue) return;
    onChange({ ...content, dialogue: { ...content.dialogue, nodes: nodes.map((item, itemIndex) => itemIndex === index ? node : item) } });
  };
  const deleteNode = (id: string) => {
    if (!content.dialogue || nodes.length <= 1) return;
    const next = nodes.filter((node) => node.id !== id).map((node) => ({ ...node, choices: node.choices?.filter((choice) => choice.nextId !== id) }));
    onChange({ ...content, dialogue: { startId: content.dialogue.startId === id ? next[0]!.id : content.dialogue.startId, nodes: next } });
  };
  return <section className="mt-12 border-t border-[var(--line)] pt-8"><div className="flex items-center justify-between gap-4"><div><h2 className="text-2xl">Диалог</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Необязательный ветвящийся сценарий</p></div><button type="button" role="switch" aria-checked={enabled} onClick={toggle} className={`relative h-7 w-12 rounded-full transition-colors ${enabled ? 'bg-[var(--accent)]' : 'bg-[var(--line)]'}`}><span className={`absolute top-1 size-5 rounded-full bg-white transition-transform ${enabled ? 'left-6' : 'left-1'}`} /></button></div>{enabled && <div className="mt-6 space-y-4">{nodes.map((node, index) => <DialogueNodeEditor key={node.id} node={node} index={index} nodes={nodes} isStart={content.dialogue?.startId === node.id} onStart={() => content.dialogue && onChange({ ...content, dialogue: { ...content.dialogue, startId: node.id } })} onChange={(value) => updateNode(index, value)} onDelete={() => deleteNode(node.id)} />)}<button type="button" onClick={addNode} className="inline-flex items-center gap-2 rounded-md px-3 py-2 font-semibold text-[var(--accent)] hover:bg-[var(--bg-sunken)]"><LuPlus />Добавить реплику</button></div>}</section>;
}

function DialogueNodeEditor({ node, index, nodes, isStart, onStart, onChange, onDelete }: { node: DialogueNode; index: number; nodes: DialogueNode[]; isStart: boolean; onStart: () => void; onChange: (node: DialogueNode) => void; onDelete: () => void }) {
  const choices = node.choices ?? [];
  return <div className="rounded-md border border-[var(--line)] bg-[var(--bg-raised)]"><div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3"><LuMessageCircle className="text-[var(--accent)]" /><span className="text-sm font-semibold">Реплика {index + 1}</span><label className="ml-auto flex items-center gap-2 text-xs text-[var(--text-muted)]"><input type="radio" name="dialogue-start" checked={isStart} onChange={onStart} />Начало</label><button type="button" title="Удалить реплику" aria-label="Удалить реплику" disabled={nodes.length <= 1} onClick={onDelete} className="grid size-8 place-items-center rounded text-[var(--text-muted)] hover:text-red-600 disabled:opacity-30"><LuTrash2 /></button></div><div className="grid gap-4 p-4 sm:grid-cols-3"><Property label="Говорящий"><input className={field} value={node.speaker} onChange={(event) => onChange({ ...node, speaker: event.target.value })} /></Property><Property label="Персонаж"><select className={field} value={node.avatar} onChange={(event) => onChange({ ...node, avatar: event.target.value as DialogueNode['avatar'] })}><option value="teacher">Преподаватель</option><option value="student">Ученик</option><option value="woman">Женщина</option><option value="man">Мужчина</option></select></Property><label className="grid gap-2 text-sm font-semibold sm:col-span-3">Текст<textarea rows={3} className={field} value={node.text} onChange={(event) => onChange({ ...node, text: event.target.value })} /></label><div className="sm:col-span-3"><p className="text-sm font-semibold">Варианты ответа</p><div className="mt-2 space-y-2">{choices.map((choice, choiceIndex) => <div key={choiceIndex} className="grid grid-cols-[1fr_1fr_auto] gap-2"><input aria-label={`Ответ ${choiceIndex + 1}`} className={field} value={choice.label} onChange={(event) => onChange({ ...node, choices: choices.map((item, itemIndex) => itemIndex === choiceIndex ? { ...item, label: event.target.value } : item) })} placeholder="Текст ответа" /><select aria-label={`Следующая реплика ${choiceIndex + 1}`} className={field} value={choice.nextId} onChange={(event) => onChange({ ...node, choices: choices.map((item, itemIndex) => itemIndex === choiceIndex ? { ...item, nextId: event.target.value } : item) })}><option value="">Завершить</option>{nodes.filter((item) => item.id !== node.id).map((item, itemIndex) => <option key={item.id} value={item.id}>Реплика {itemIndex + 1}: {item.speaker}</option>)}</select><button type="button" title="Удалить вариант" aria-label="Удалить вариант" onClick={() => onChange({ ...node, choices: choices.filter((_, itemIndex) => itemIndex !== choiceIndex) })} className="grid size-10 place-items-center rounded text-[var(--text-muted)] hover:text-red-600"><LuTrash2 /></button></div>)}</div><button type="button" onClick={() => onChange({ ...node, choices: [...choices, { label: '', nextId: '' }] })} className="mt-2 inline-flex items-center gap-1.5 rounded px-2 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--bg-sunken)]"><LuPlus />Вариант ответа</button></div></div></div>;
}

function Property({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-xs font-bold uppercase text-[var(--text-muted)]">{label}<div className="font-normal normal-case text-[var(--text)]">{children}</div></label>; }
function ActionButton({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) { return <button type="button" title={title} disabled={disabled} onClick={onClick} className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--bg-raised)] px-3 font-semibold hover:border-[var(--accent)] disabled:opacity-50">{children}</button>; }

function normalizeContent(content?: LessonContent): LessonContent {
  const value = content ?? emptyContent();
  return {
    ...value,
    theory: value.theory?.length ? value.theory : emptyContent().theory,
    exercises: value.exercises ?? [],
    markdown: markdownFromContent(value),
    documentStyle: value.documentStyle ?? { ...DEFAULT_DOCUMENT_STYLE },
  };
}

function messageOf(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : 'Неизвестная ошибка.';
}
