import { createContext, useContext, useMemo, useState } from 'react';
import {
  LuArrowLeft,
  LuArrowRight,
  LuBookOpen,
  LuCheck,
  LuClock3,
  LuFlag,
  LuGraduationCap,
  LuLightbulb,
  LuRotateCcw,
  LuUndo2,
} from 'react-icons/lu';

import {
  reportLesson,
  submitTeacherLetter,
  type DialogueNode,
  type Lesson,
  type LessonExercise,
} from '../api/lessons';
import { ApiError } from '../api/client';
import { tokenize } from '../lib/tokenize';
import { MarkdownLesson } from './MarkdownLesson';
import { WordReader } from './WordReader';
import { Button } from './ui';

type LessonStage = 'theory' | 'practice' | 'dialogue' | 'complete';

interface LessonPlayerProps {
  lesson: Lesson;
  preview?: boolean;
  previewMode?: 'teacher' | 'moderator';
  onExit?: () => void;
}

export function LessonPlayer({ lesson, preview = false, previewMode, onExit }: LessonPlayerProps) {
  const isPreview = preview || previewMode === 'teacher' || previewMode === 'moderator';
  const isModeration = previewMode === 'moderator';
  const [reportOpen, setReportOpen] = useState(false);
  const [stage, setStage] = useState<LessonStage>('theory');
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const content = lesson.content;
  const exercises = content?.exercises ?? [];

  const openStage = (next: LessonStage, nextExercise = exerciseIndex) => {
    setExerciseIndex(nextExercise);
    setStage(next);
    window.scrollTo(0, 0);
  };

  const afterTheory = () => {
    if (exercises.length > 0) openStage('practice', 0);
    else if (content?.dialogue) openStage('dialogue');
    else openStage('complete');
  };

  const afterExercise = () => {
    if (exerciseIndex < exercises.length - 1) openStage('practice', exerciseIndex + 1);
    else if (content?.dialogue) openStage('dialogue');
    else openStage('complete');
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:py-12">
      <button type="button" onClick={onExit} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)]"><LuArrowLeft />{isModeration ? 'Вернуться в очередь' : isPreview ? 'Вернуться в редактор' : 'Каталог уроков'}</button>
      {isPreview && <div className="mt-5 rounded-md border border-[var(--accent)]/25 bg-[var(--accent)]/8 px-4 py-3 text-sm"><strong>{isModeration ? 'Предпросмотр модератора.' : 'Предпросмотр преподавателя.'}</strong> Урок работает как у ученика, но ответы и письма никуда не отправляются.</div>}
      {stage === 'theory' && lesson.coverUrl && <div className="mt-7 aspect-[16/7] w-full overflow-hidden rounded-md bg-[var(--bg-sunken)]"><img src={lesson.coverUrl} alt="" className="size-full object-cover" /></div>}
      <header className="mt-7 max-w-3xl">
        <div className="flex flex-wrap gap-2 text-xs font-bold uppercase text-[var(--accent)]"><span>{lesson.level}</span><span>·</span><span>{typeLabel(lesson.lessonType)}</span>{lesson.topic && <><span>·</span><span>{lesson.topic}</span></>}</div>
        <h1 className={`mt-3 text-3xl ${stage === 'theory' ? 'sm:text-5xl' : 'sm:text-4xl'}`}>{lesson.title || 'Урок без названия'}</h1>
        {stage === 'theory' && lesson.summary && <p className="mt-4 text-lg leading-8 text-[var(--text-muted)]">{lesson.summary}</p>}
        <div className="mt-5 flex flex-wrap gap-5 text-sm text-[var(--text-muted)]"><span className="inline-flex items-center gap-1.5"><LuGraduationCap />{lesson.authorName}</span><span className="inline-flex items-center gap-1.5"><LuClock3 />{lesson.estimatedMinutes} минут</span></div>
      </header>
      {/*
        Теория лежит на том же «листе», что и книга в читалке.
        Раньше она шла сплошным текстом прямо по фону страницы, отделённая
        одной чертой сверху: на широком экране строка тянулась почти на тысячу
        пикселей, и глаз терял начало следующей. Панель и ограничение длины
        строки решают обе задачи сразу — а поверхность взята не новая, а та же,
        что в читалке (`paper-grain` + `--bg-raised`): урок и книга в Читавуке
        читаются одинаково, и заводить для них разное оформление незачем.
      */}
      {content && stage === 'theory' && <section className="mt-10">
        <div className="paper-grain relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--bg-raised)] px-5 py-8 shadow-[var(--shadow-soft)] sm:px-10 sm:py-12">
          {/* Длина строки ограничена в знаках, а не в пикселях: при крупном
              шрифте у преподавателя строка иначе снова становится длинной. */}
          <MarkdownLesson content={content} className="mx-auto max-w-[62ch]" />
        </div>
        <div className="mt-8 flex justify-end"><Button onClick={afterTheory}><LuBookOpen />{exercises.length > 0 ? 'Перейти к практике' : content.dialogue ? 'Перейти к диалогу' : 'Завершить урок'}<LuArrowRight /></Button></div>
      </section>}
      {content && stage === 'practice' && <section className="mt-10 border-t border-[var(--line)] pt-7">
        <div className="flex items-center justify-between gap-4 text-sm"><button type="button" onClick={() => openStage('theory')} className="font-semibold text-[var(--accent)]">К теории</button><span className="text-[var(--text-muted)]">Задание {exerciseIndex + 1} из {exercises.length}</span></div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--bg-sunken)]"><div className="h-full bg-[var(--accent)]" style={{ width: `${((exerciseIndex + 1) / exercises.length) * 100}%` }} /></div>
        <div className="mt-5 border-y border-[var(--line)]">{exercises.map((exercise, index) => <div key={exercise.id} hidden={index !== exerciseIndex}><Exercise exercise={exercise} index={index} lesson={lesson} preview={isPreview} /></div>)}</div>
        <div className="mt-6 flex items-center justify-between gap-3"><Button variant="secondary" disabled={exerciseIndex === 0} onClick={() => openStage('practice', exerciseIndex - 1)}><LuArrowLeft />Предыдущее</Button><Button onClick={afterExercise}>{exerciseIndex < exercises.length - 1 ? 'Следующее' : content.dialogue ? 'К диалогу' : 'Завершить'}<LuArrowRight /></Button></div>
      </section>}
      {content?.dialogue && stage === 'dialogue' && <section className="mt-10 border-t border-[var(--line)] pt-8"><div className="flex items-center justify-between gap-4"><h2 className="text-2xl">Диалог</h2><button type="button" onClick={() => openStage(exercises.length > 0 ? 'practice' : 'theory', Math.max(0, exercises.length - 1))} className="text-sm font-semibold text-[var(--accent)]">Назад</button></div><Dialogue nodes={content.dialogue.nodes} startId={content.dialogue.startId} /><div className="mt-8 flex justify-end"><Button onClick={() => openStage('complete')}>Завершить урок<LuArrowRight /></Button></div></section>}
      {stage === 'complete' && <section className="mt-10 border-y border-[var(--line)] py-14 text-center"><LuCheck className="mx-auto size-12 text-emerald-700" /><h2 className="mt-4 text-3xl">Урок пройден</h2><p className="mt-2 text-[var(--text-muted)]">Теория прочитана, практика завершена.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Button variant="secondary" onClick={() => openStage('theory')}>Повторить теорию</Button>{exercises.length > 0 && <Button onClick={() => openStage('practice', 0)}>Пройти практику ещё раз</Button>}</div></section>}
      {!isPreview && <><button type="button" onClick={() => setReportOpen((value) => !value)} className="mt-16 inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--accent)]"><LuFlag />Пожаловаться на урок</button>{reportOpen && <ReportForm lessonId={lesson.id} onDone={() => setReportOpen(false)} />}</>}
    </main>
  );
}

export function Exercise({ exercise, index, lesson, preview = false }: { exercise: LessonExercise; index: number; lesson?: Lesson; preview?: boolean }) {
  return <article className="py-8"><p className="text-xs font-bold uppercase text-[var(--accent)]">Задание {index + 1}</p><h3 className="mt-2 text-xl">{exercise.prompt}</h3>{exercise.hint && <p className="mt-2 text-sm text-[var(--text-muted)]"><LuLightbulb className="mr-1 inline" />{exercise.hint}</p>}<div className="mt-5"><ExerciseBody exercise={exercise} lesson={lesson} preview={preview} /></div></article>;
}

function ExerciseBody({ exercise, lesson, preview }: { exercise: LessonExercise; lesson?: Lesson; preview: boolean }) {
  if (exercise.type === 'multiple_choice' && exercise.options?.length) return <ChoiceExercise options={exercise.options} expected={exercise.answer ?? exercise.referenceAnswer ?? ''} />;
  if (exercise.type === 'ending_picker' && exercise.options?.length && (exercise.context || exercise.stem)) return <EndingExercise exercise={exercise} />;
  if (exercise.type === 'sentence_builder' && exercise.tokens?.some(Boolean)) return <TileExercise exercise={exercise} mode="words" />;
  if (exercise.type === 'letter_unscramble' && exercise.answer) return <TileExercise exercise={exercise} mode="letters" />;
  if (exercise.type === 'matching' && exercise.pairs?.length) return <MatchingExercise exercise={exercise} />;
  if (exercise.type === 'fill_blank' && exercise.context?.includes('___')) return <FillBlankExercise exercise={exercise} />;
  if (exercise.type === 'image_description') return <WrittenExercise exercise={exercise} image />;
  if (exercise.type === 'reading_qa' && exercise.questions?.length) return <ReadingExercise exercise={exercise} />;
  if (exercise.type === 'form_hunt' && exercise.context && exercise.targetWords?.length) return <FormHuntExercise exercise={exercise} />;
  if (exercise.type === 'teacher_letter' && lesson) return <TeacherLetter exercise={exercise} lesson={lesson} preview={preview} />;
  if (exercise.type === 'word_drill' && exercise.pairs?.length) return <WordDrill exercise={exercise} />;
  if (exercise.type === 'translator_duel' && exercise.context) return <TranslatorDuel exercise={exercise} />;
  return <WrittenExercise exercise={exercise} />;
}

/**
 * Прогон слов темы: перевод — слева, слово набирается по памяти.
 *
 * Выбором из вариантов это делать нельзя: узнать слово среди четырёх и вспомнить
 * его — разные умения, а словарь дорожной карты проверяет второе.
 */
function WordDrill({ exercise }: { exercise: LessonExercise }) {
  const pairs = useMemo(() => (exercise.pairs ?? []).filter((pair) => pair.left && pair.right), [exercise.pairs]);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(false);
  const [right, setRight] = useState(0);
  const pair = pairs[index];
  if (!pair) return null;
  const correct = normalize(value) === normalize(pair.right);
  const last = index + 1 >= pairs.length;
  return <div>
    <p className="text-sm text-[var(--text-muted)]">{index + 1} из {pairs.length} · верных {right}</p>
    <p className="mt-3 font-display text-2xl">{pair.left}</p>
    <input value={value} onChange={(event) => { setValue(event.target.value); setChecked(false); }} placeholder="Слово по-сербски" className="mt-4 w-full rounded-md border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2.5 outline-none focus:border-[var(--accent)]" />
    <CheckRow disabled={!value.trim()} checked={checked} correct={correct} onCheck={() => { setChecked(true); if (correct) setRight((count) => count + 1); }} />
    {checked && <div className="mt-4 flex items-center gap-4">
      {!correct && <ReferenceAnswer value={pair.right} />}
      {!last && <Button variant="secondary" onClick={() => { setIndex(index + 1); setValue(''); setChecked(false); }}>Дальше</Button>}
      {last && <p className="text-sm font-semibold">Готово: {right} из {pairs.length}.</p>}
    </div>}
  </div>;
}

/**
 * Игра против переводчика: своя версия фразы против машинной.
 *
 * Машинный перевод хранится в самом задании, а не запрашивается на лету. Так
 * упражнение работает без сети и, что важнее, не меняется под ногами: сегодня
 * переводчик выдал одно, завтра другое, и «вы совпали с переводчиком» перестало
 * бы что-либо значить.
 */
function TranslatorDuel({ exercise }: { exercise: LessonExercise }) {
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(false);
  const machine = exercise.referenceAnswer ?? '';
  const accepted = [exercise.answer ?? '', ...(exercise.acceptedAnswers ?? [])].filter(Boolean);
  const matched = accepted.some((variant) => normalize(variant) === normalize(value));
  const sameAsMachine = Boolean(machine) && normalize(machine) === normalize(value);
  return <div>
    <p className="rounded-md bg-[var(--bg-sunken)] px-4 py-3 font-display text-lg">{exercise.context}</p>
    <textarea rows={3} value={value} onChange={(event) => { setValue(event.target.value); setChecked(false); }} placeholder="Ваш перевод на сербский" className="mt-4 w-full rounded-md border border-[var(--line)] bg-[var(--bg-raised)] p-3 outline-none focus:border-[var(--accent)]" />
    <CheckRow disabled={!value.trim()} checked={checked} correct={matched || sameAsMachine} compare={accepted.length === 0} onCheck={() => setChecked(true)} />
    {checked && <div className="mt-4 space-y-3">
      {machine && <div className="rounded-md border border-[var(--line)] p-3"><p className="text-xs font-bold uppercase text-[var(--text-muted)]">Переводчик перевёл так</p><p className="mt-1">{machine}</p></div>}
      {accepted.length > 0 && !matched && <ReferenceAnswer value={accepted[0] ?? ''} />}
      {matched && !sameAsMachine && <p className="text-sm font-semibold text-emerald-700">Ваш вариант принят — и он не такой, как у переводчика.</p>}
    </div>}
  </div>;
}

function ChoiceExercise({ options, expected }: { options: string[]; expected: string }) {
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(false);
  return <div><div className="grid gap-2 sm:grid-cols-2">{options.filter(Boolean).map((option) => <button key={option} type="button" onClick={() => { setValue(option); setChecked(false); }} className={`rounded-md border px-4 py-3 text-left transition-colors ${value === option ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--line)] hover:bg-[var(--bg-sunken)]/50'}`}>{option}</button>)}</div><CheckRow disabled={!value} checked={checked} correct={normalize(value) === normalize(expected)} onCheck={() => setChecked(true)} /></div>;
}

function EndingExercise({ exercise }: { exercise: LessonExercise }) {
  const [ending, setEnding] = useState('');
  const [checked, setChecked] = useState(false);
  const answer = `${exercise.stem ?? ''}${ending}`;
  return <div><p className="mb-4 rounded-md bg-[var(--bg-sunken)] px-4 py-3 font-display text-lg">{(exercise.context ?? '').replace('___', `${exercise.stem ?? ''}___`) || `${exercise.stem ?? ''}___`}</p><div className="flex flex-wrap gap-2">{(exercise.options ?? []).filter(Boolean).map((option) => <button key={option} type="button" onClick={() => { setEnding(option); setChecked(false); }} className={`min-w-14 rounded-md border px-4 py-2.5 text-center font-semibold ${ending === option ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--line)]'}`}>{option}</button>)}</div><p className="mt-4 text-lg"><span className="text-[var(--text-muted)]">Получается:</span> {answer || '…'}</p><CheckRow disabled={!ending} checked={checked} correct={normalize(ending) === normalize(exercise.answer ?? '') || normalize(answer) === normalize(exercise.referenceAnswer ?? '')} onCheck={() => setChecked(true)} /></div>;
}

function TileExercise({ exercise, mode }: { exercise: LessonExercise; mode: 'words' | 'letters' }) {
  const base = mode === 'words' ? [...(exercise.tokens ?? []), ...(exercise.distractors ?? [])] : [...(exercise.answer ?? ''), ...(exercise.distractors ?? [])];
  const tiles = useMemo(() => base.map((value, index) => ({ id: `${index}-${value}`, value })).reverse(), [exercise.answer, exercise.distractors, exercise.tokens, mode]);
  const [selected, setSelected] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const chosen = selected.map((id) => tiles.find((tile) => tile.id === id)?.value ?? '');
  const value = chosen.join(mode === 'words' ? ' ' : '');
  return <div><div className="flex min-h-14 flex-wrap items-center gap-2 rounded-md border-b-2 border-[var(--line)] bg-[var(--bg-sunken)]/35 px-3 py-2">{selected.length === 0 && <span className="text-sm text-[var(--text-muted)]">{mode === 'words' ? 'Соберите предложение' : 'Соберите слово'}</span>}{selected.map((id) => { const tile = tiles.find((item) => item.id === id); return <button key={id} type="button" onClick={() => { setSelected(selected.filter((item) => item !== id)); setChecked(false); }} className="rounded border border-[var(--accent)] bg-[var(--bg-raised)] px-3 py-2 font-semibold">{tile?.value}</button>; })}</div><div className="mt-4 flex flex-wrap gap-2">{tiles.filter((tile) => !selected.includes(tile.id)).map((tile) => <button key={tile.id} type="button" onClick={() => { setSelected([...selected, tile.id]); setChecked(false); }} className="rounded border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2 font-semibold hover:border-[var(--accent)]">{tile.value}</button>)}</div><CheckRow disabled={!selected.length} checked={checked} correct={normalize(value) === normalize(exercise.answer ?? exercise.referenceAnswer ?? '')} onCheck={() => setChecked(true)} onReset={() => { setSelected([]); setChecked(false); }} /></div>;
}

function MatchingExercise({ exercise }: { exercise: LessonExercise }) {
  const pairs = exercise.pairs ?? [];
  const rights = useMemo(() => pairs.map((pair) => pair.right).reverse(), [pairs]);
  const [answers, setAnswers] = useState<string[]>(() => pairs.map(() => ''));
  const [checked, setChecked] = useState(false);
  const correct = pairs.every((pair, index) => normalize(pair.right) === normalize(answers[index] ?? ''));
  return <div className="space-y-2">{pairs.map((pair, index) => <div key={index} className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]"><div className="rounded-md bg-[var(--bg-sunken)] px-4 py-3">{pair.left}</div><span className="hidden text-[var(--text-muted)] sm:block">→</span><select aria-label={`Соответствие для ${pair.left}`} value={answers[index] ?? ''} onChange={(event) => { setAnswers(answers.map((answer, itemIndex) => itemIndex === index ? event.target.value : answer)); setChecked(false); }} className="rounded-md border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-3"><option value="">Выберите пару</option>{rights.map((right) => <option key={right} value={right}>{right}</option>)}</select></div>)}<CheckRow disabled={answers.some((answer) => !answer)} checked={checked} correct={correct} onCheck={() => setChecked(true)} /></div>;
}

function FillBlankExercise({ exercise }: { exercise: LessonExercise }) {
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(false);
  const answers = (exercise.acceptedAnswers?.length ? exercise.acceptedAnswers : [exercise.answer ?? '']).map(normalize);
  const pieces = (exercise.context ?? '___').split('___');
  return <div><div className="rounded-md bg-[var(--bg-sunken)] px-4 py-4 font-display text-lg leading-9">{pieces[0]}<input value={value} onChange={(event) => { setValue(event.target.value); setChecked(false); }} aria-label="Ответ в пропуске" className="mx-2 w-40 border-b-2 border-[var(--accent)] bg-transparent px-2 text-center font-sans outline-none" />{pieces.slice(1).join('___')}</div><CheckRow disabled={!value.trim()} checked={checked} correct={answers.includes(normalize(value))} onCheck={() => setChecked(true)} /></div>;
}

function WrittenExercise({ exercise, image = false }: { exercise: LessonExercise; image?: boolean }) {
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(false);
  const expected = exercise.referenceAnswer ?? exercise.answer ?? '';
  return <div>{image && exercise.imageUrl && <img src={exercise.imageUrl} alt="Материал задания" className="mb-5 max-h-96 w-full rounded-md object-contain" />}{exercise.context && <p className="mb-3 text-lg font-semibold">{exercise.context}</p>}<textarea rows={5} value={value} onChange={(event) => { setValue(event.target.value); setChecked(false); }} placeholder="Ваш ответ" className="w-full rounded-md border border-[var(--line)] bg-[var(--bg-raised)] p-3 outline-none focus:border-[var(--accent)]" /><CheckRow disabled={!value.trim()} checked={checked} correct={normalize(value) === normalize(expected)} compare={!expected || exercise.type === 'explain_word' || exercise.type === 'image_description'} onCheck={() => setChecked(true)} />{checked && expected && <ReferenceAnswer value={expected} />}</div>;
}

function ReadingExercise({ exercise }: { exercise: LessonExercise }) {
  const questions = exercise.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const correct = questions.every((question) => normalize(answers[question.id] ?? '') === normalize(question.answer));
  return <div><div className="rounded-md bg-[var(--bg-sunken)]/55 px-5 py-5"><WordReader paragraphs={(exercise.readingText ?? '').split(/\n\s*\n/).filter(Boolean)} paragraphClassName="font-display text-lg leading-8" /></div><div className="mt-5 space-y-6">{questions.map((question, index) => <div key={question.id}><p className="font-semibold">{index + 1}. {question.prompt}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{question.options.filter(Boolean).map((option) => <button key={option} type="button" onClick={() => { setAnswers({ ...answers, [question.id]: option }); setChecked(false); }} className={`rounded-md border px-3 py-2.5 text-left ${answers[question.id] === option ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--line)]'}`}>{option}</button>)}</div></div>)}</div><CheckRow disabled={questions.some((question) => !answers[question.id])} checked={checked} correct={correct} onCheck={() => setChecked(true)} /></div>;
}

function FormHuntExercise({ exercise }: { exercise: LessonExercise }) {
  const words = useMemo(() => tokenize(exercise.context ?? '').filter((token) => token.isWord), [exercise.context]);
  const [selected, setSelected] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  const target = new Set((exercise.targetWords ?? []).map(normalize));
  const correct = words.every((word, index) => selected.includes(index) === target.has(normalize(word.text)));
  return <div><div className="flex flex-wrap gap-x-1 gap-y-2 rounded-md bg-[var(--bg-sunken)]/55 px-5 py-5 font-display text-lg leading-8">{words.map((word, index) => <button key={`${word.start}-${word.text}`} type="button" onClick={() => { setSelected(selected.includes(index) ? selected.filter((item) => item !== index) : [...selected, index]); setChecked(false); }} className={`rounded px-1.5 ${selected.includes(index) ? 'bg-[var(--accent)] text-white' : 'hover:bg-[var(--bg-raised)]'}`}>{word.text}</button>)}</div><CheckRow disabled={!selected.length} checked={checked} correct={correct} onCheck={() => setChecked(true)} onReset={() => { setSelected([]); setChecked(false); }} /></div>;
}

function TeacherLetter({ exercise, lesson, preview }: { exercise: LessonExercise; lesson: Lesson; preview: boolean }) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');
  const send = async () => {
    if (preview) { setNote('В предпросмотре письмо не отправлено. Поле и кнопка работают как у ученика.'); return; }
    if (!lesson.revisionId) return;
    setSending(true); setNote('');
    try { await submitTeacherLetter(lesson.id, lesson.revisionId, exercise.id, value); setNote('Работа отправлена преподавателю.'); setValue(''); }
    catch (caught) { setNote(messageOf(caught)); } finally { setSending(false); }
  };
  return <div>{exercise.criteria && <p className="mb-4 rounded-md bg-[var(--bg-sunken)] px-4 py-3 text-sm"><strong>Критерии:</strong> {exercise.criteria}</p>}<textarea rows={8} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Напишите текст по-сербски" className="w-full rounded-md border border-[var(--line)] bg-[var(--bg-raised)] p-3 outline-none focus:border-[var(--accent)]" /><div className="mt-4"><Button disabled={!value.trim() || sending} onClick={() => void send()}><LuGraduationCap />{sending ? 'Отправляем…' : preview ? 'Проверить отправку' : 'Отправить преподавателю'}</Button></div>{note && <p className="mt-3 text-sm text-[var(--text-muted)]">{note}</p>}</div>;
}

/**
 * Куда упражнение сообщает исход первой проверки.
 *
 * Нужно дорожной карте: там набор упражнений засчитывается долей верных, а не
 * фактом открытия. Уроки контекст не подставляют — у них исход нигде не
 * учитывается, и приёмник остаётся пустым.
 */
export const ExerciseResultContext = createContext<((correct: boolean) => void) | null>(null);

function CheckRow({ disabled, checked, correct, compare = false, onCheck, onReset }: { disabled: boolean; checked: boolean; correct: boolean; compare?: boolean; onCheck: () => void; onReset?: () => void }) {
  const report = useContext(ExerciseResultContext);
  // Сообщается только первая проверка: иначе доля верных набивалась бы
  // повторными нажатиями по уже показанному ответу.
  const check = () => { if (!checked) report?.(compare ? true : correct); onCheck(); };
  return <div className="mt-5 flex flex-wrap items-center gap-3"><Button disabled={disabled} onClick={check}><LuCheck />Проверить</Button>{onReset && <button type="button" title="Начать заново" aria-label="Начать заново" onClick={onReset} className="grid size-10 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-sunken)]"><LuUndo2 /></button>}{checked && <span className={compare ? 'font-semibold text-[var(--text-muted)]' : correct ? 'font-semibold text-emerald-700' : 'font-semibold text-red-600'}>{compare ? 'Сравните ответ с примером ниже' : correct ? 'Верно' : 'Попробуйте ещё раз'}</span>}</div>;
}

function ReferenceAnswer({ value }: { value: string }) { return <div className="mt-3 rounded-md bg-[var(--bg-sunken)] p-4"><p className="text-sm font-semibold"><LuLightbulb className="mr-1 inline" />Пример ответа</p><p className="mt-2 whitespace-pre-line">{value}</p></div>; }

export function Dialogue({ nodes, startId }: { nodes: DialogueNode[]; startId: string }) {
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const [current, setCurrent] = useState(startId); const [history, setHistory] = useState<string[]>([]);
  const node = byId.get(current); if (!node) return <p>Сценарий диалога повреждён.</p>;
  return <div className="mt-6 max-w-2xl"><div className="rounded-md border border-[var(--line)] bg-[var(--bg-raised)] p-5"><p className="text-sm font-bold text-[var(--accent)]">{node.speaker}</p><div className="mt-3"><WordReader paragraphs={[node.text]} /></div></div><div className="mt-3 grid gap-2">{node.choices?.map((choice) => <button key={`${node.id}-${choice.nextId}`} type="button" onClick={() => { setHistory([...history, current]); setCurrent(choice.nextId); }} className="rounded-md border border-[var(--line)] px-4 py-3 text-left hover:border-[var(--accent)]">{choice.label}</button>)}</div>{history.length > 0 && <button type="button" onClick={() => { setCurrent(startId); setHistory([]); }} className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--text-muted)]"><LuRotateCcw />Начать сначала</button>}</div>;
}

function ReportForm({ lessonId, onDone }: { lessonId: string; onDone: () => void }) {
  const [reason, setReason] = useState('Ошибка в материале'); const [details, setDetails] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const send = async () => { setBusy(true); setError(''); try { await reportLesson(lessonId, reason, details); onDone(); } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); } };
  return <div className="mt-4 max-w-xl rounded-md border border-[var(--line)] p-4"><label className="grid gap-2 text-sm font-semibold">Причина<select value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-md border border-[var(--line)] bg-[var(--bg-raised)] p-2.5"><option>Ошибка в материале</option><option>Нарушение авторских прав</option><option>Неподходящее содержание</option><option>Другое</option></select></label><textarea rows={3} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Подробности" className="mt-3 w-full rounded-md border border-[var(--line)] bg-[var(--bg-raised)] p-3" />{error && <p className="mt-2 text-sm text-red-600">{error}</p>}<div className="mt-3"><Button size="sm" onClick={() => void send()} disabled={busy}>Отправить</Button></div></div>;
}

function normalize(value: string) { return value.trim().toLocaleLowerCase('sr').replace(/[.!?,;:]+$/, ''); }
function typeLabel(type: Lesson['lessonType']) { return ({ lexicon: 'Лексика', grammar: 'Грамматика', speaking: 'Говорение', writing: 'Письмо' } as const)[type]; }
function messageOf(error: unknown) { return error instanceof ApiError || error instanceof Error ? error.message : 'Неизвестная ошибка.'; }
