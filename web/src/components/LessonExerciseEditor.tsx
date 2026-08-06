import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ComponentType } from 'react';
import {
  LuBetweenHorizontalStart,
  LuBookOpenCheck,
  LuChevronDown,
  LuCircleDot,
  LuGitCompareArrows,
  LuImage,
  LuImagePlus,
  LuLetterText,
  LuListChecks,
  LuListPlus,
  LuMail,
  LuMessageSquareText,
  LuPlus,
  LuPuzzle,
  LuScanText,
  LuTextCursorInput,
  LuTrash2,
  LuX,
} from 'react-icons/lu';

import { uploadLessonImage, type LessonExercise, type LessonReadingQuestion } from '../api/lessons';
import { BULK_FORMATS, parseBulk, type BulkType } from '../lib/exerciseBulk';
import { Spinner } from './ui';

type ExerciseType = LessonExercise['type'];
type ExerciseIcon = ComponentType<{ className?: string }>;

const field = 'w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 outline-none focus:border-[var(--accent)]';

const exerciseTypes: Array<{ type: ExerciseType; label: string; detail: string; icon: ExerciseIcon }> = [
  { type: 'multiple_choice', label: 'Выбор ответа', detail: 'Один вариант из списка', icon: LuCircleDot },
  { type: 'ending_picker', label: 'Выбор окончания', detail: 'Основа слова и окончания', icon: LuBetweenHorizontalStart },
  { type: 'sentence_builder', label: 'Собрать предложение', detail: 'Плитки со словами', icon: LuPuzzle },
  { type: 'letter_unscramble', label: 'Собрать слово', detail: 'Буквы в случайном порядке', icon: LuLetterText },
  { type: 'matching', label: 'Соответствия', detail: 'Пары в двух колонках', icon: LuGitCompareArrows },
  { type: 'fill_blank', label: 'Заполнить пропуск', detail: 'Предложение с пустым местом', icon: LuTextCursorInput },
  { type: 'image_description', label: 'Описание изображения', detail: 'Картинка и свободный ответ', icon: LuImage },
  { type: 'reading_qa', label: 'Текст и вопросы', detail: 'Чтение с мини-тестом', icon: LuBookOpenCheck },
  { type: 'form_hunt', label: 'Найти формы', detail: 'Отметить слова в тексте', icon: LuScanText },
  { type: 'explain_word', label: 'Объяснить слово', detail: 'Свободный ответ по-сербски', icon: LuMessageSquareText },
  { type: 'teacher_letter', label: 'Письмо преподавателю', detail: 'Ручная проверка работы', icon: LuMail },
];

export function LessonExerciseEditor({ exercises, onChange }: { exercises: LessonExercise[]; onChange: (items: LessonExercise[]) => void }) {
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const update = (index: number, value: LessonExercise) => onChange(exercises.map((exercise, itemIndex) => itemIndex === index ? value : exercise));

  return (
    <section className="mt-12 border-t border-[var(--line)] pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="text-2xl">Практика</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Задания, которые увидит ученик после материала</p></div>
        <div className="relative">
          <button type="button" onClick={() => setAddOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-2.5 font-semibold shadow-sm hover:border-[var(--accent)]"><LuPlus />Добавить задание<LuChevronDown className="text-sm" /></button>
          <button type="button" onClick={() => { setBulkOpen((open) => !open); setAddOpen(false); }} className="ml-2 inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-2.5 font-semibold shadow-sm hover:border-[var(--accent)]"><LuListPlus />Добавить набор</button>
          {addOpen && (
            <div className="absolute right-0 z-30 mt-2 grid w-[min(38rem,calc(100vw-2rem))] gap-1 rounded-md border border-[var(--line)] bg-[var(--bg-raised)] p-2 shadow-[var(--shadow-lift)] sm:grid-cols-2">
              {exerciseTypes.map(({ type, label, detail, icon: Icon }) => <button key={type} type="button" onClick={() => { onChange([...exercises, createExercise(type)]); setAddOpen(false); }} className="flex items-start gap-3 rounded px-3 py-3 text-left hover:bg-[var(--bg-sunken)]"><Icon className="mt-0.5 shrink-0 text-xl text-[var(--accent)]" /><span><span className="block font-semibold">{label}</span><span className="mt-0.5 block text-xs text-[var(--text-muted)]">{detail}</span></span></button>)}
            </div>
          )}
        </div>
      </div>

      {bulkOpen && (
        <BulkAdd
          onAdd={(created) => { onChange([...exercises, ...created]); setBulkOpen(false); }}
          onClose={() => setBulkOpen(false)}
        />
      )}

      {exercises.length === 0
        ? <div className="mt-6 border-y border-dashed border-[var(--line)] py-12 text-center text-sm text-[var(--text-muted)]"><LuListChecks className="mx-auto mb-2 text-2xl" />В уроке пока нет заданий</div>
        : <div className="mt-6 space-y-4">{exercises.map((exercise, index) => <ExerciseCard key={exercise.id} exercise={exercise} index={index} onChange={(value) => update(index, value)} onDelete={() => onChange(exercises.filter((_, itemIndex) => itemIndex !== index))} />)}</div>}
    </section>
  );
}

/**
 * Набор однотипных заданий из списка строк.
 *
 * Десять слов на один и тот же приём — обычная работа, и делать ради них
 * десять заходов «добавить задание → выбрать тип → заполнить поля» незачем:
 * отличается в них одна строка.
 *
 * Разбор живёт в lib/exerciseBulk: он один и тот же для всех типов, у него
 * есть верные и неверные ответы, и проверяется он тестами, а не глазами.
 */
function BulkAdd({ onAdd, onClose }: { onAdd: (items: LessonExercise[]) => void; onClose: () => void }) {
  const [type, setType] = useState<BulkType>('fill_blank');
  const [text, setText] = useState('');
  const format = BULK_FORMATS.find((item) => item.type === type)!;
  const result = useMemo(() => parseBulk(type, text), [type, text]);

  return (
    <div className="mt-6 rounded-md border border-[var(--line)] bg-[var(--bg-sunken)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold">
          Тип заданий{' '}
          <select
            value={type}
            onChange={(event) => setType(event.target.value as BulkType)}
            className="ml-1 rounded-md border border-[var(--line)] bg-[var(--bg-raised)] px-2.5 py-2 font-normal"
          >
            {BULK_FORMATS.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={onClose} className="ml-auto text-sm text-[var(--text-muted)] hover:text-[var(--text)]">Свернуть</button>
      </div>

      <p className="mt-3 text-sm text-[var(--text-muted)]">{format.hint}</p>
      <textarea
        rows={8}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={format.example}
        aria-label="Строки набора"
        className={`${field} mt-2 font-mono text-sm`}
      />

      {result.problems.length > 0 && (
        <ul className="mt-3 grid gap-1 text-sm text-red-600">
          {result.problems.map((problem) => (
            <li key={problem.line}>Строка {problem.line}: {problem.message}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={result.exercises.length === 0}
          onClick={() => { onAdd(result.exercises); setText(''); }}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2.5 font-semibold text-white disabled:opacity-40"
        >
          <LuPlus />Добавить {countLabel(result.exercises.length)}
        </button>
        {/* Число видно до нажатия: набор из десяти строк, давший восемь
            заданий, — повод перечитать список, а не сюрприз после. */}
        <span className="text-sm text-[var(--text-muted)]">
          {result.exercises.length === 0 ? 'Пока нечего добавить' : `Готово к добавлению: ${result.exercises.length}`}
        </span>
      </div>
    </div>
  );
}

function countLabel(count: number): string {
  if (count === 0) return 'задания';
  const word = count % 100 >= 11 && count % 100 <= 14 ? 'заданий'
    : count % 10 === 1 ? 'задание'
    : count % 10 >= 2 && count % 10 <= 4 ? 'задания'
    : 'заданий';
  return `${count} ${word}`;
}

function ExerciseCard({ exercise, index, onChange, onDelete }: { exercise: LessonExercise; index: number; onChange: (value: LessonExercise) => void; onDelete: () => void }) {
  const definition = exerciseTypes.find((item) => item.type === exercise.type) ?? exerciseTypes[0]!;
  const Icon = definition.icon;
  return (
    <article className="rounded-md border border-[var(--line)] bg-[var(--bg-raised)]">
      <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded bg-[var(--bg-sunken)] text-lg text-[var(--accent)]"><Icon /></span>
        <span className="text-xs font-bold text-[var(--text-muted)]">{index + 1}</span>
        <select value={exercise.type} onChange={(event) => onChange(createExercise(event.target.value as ExerciseType, exercise.prompt))} aria-label="Тип задания" className="min-w-0 flex-1 bg-transparent font-semibold outline-none">{exerciseTypes.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}</select>
        <button type="button" title="Удалить задание" aria-label="Удалить задание" onClick={onDelete} className="grid size-9 place-items-center rounded text-[var(--text-muted)] hover:bg-red-600/10 hover:text-red-600"><LuTrash2 /></button>
      </div>
      <div className="p-4 sm:p-5">
        <label className="grid gap-2 text-sm font-semibold">Формулировка<textarea rows={2} className={field} value={exercise.prompt} onChange={(event) => onChange({ ...exercise, prompt: event.target.value })} placeholder={promptPlaceholder(exercise.type)} /></label>
        <div className="mt-5"><ExerciseFields exercise={exercise} onChange={onChange} /></div>
        {exercise.type !== 'teacher_letter' && <label className="mt-5 grid gap-2 text-sm font-semibold">Подсказка <span className="font-normal text-[var(--text-muted)]">необязательно</span><input className={field} value={exercise.hint ?? ''} onChange={(event) => onChange({ ...exercise, hint: event.target.value })} /></label>}
      </div>
    </article>
  );
}

function ExerciseFields({ exercise, onChange }: { exercise: LessonExercise; onChange: (value: LessonExercise) => void }) {
  if (exercise.type === 'multiple_choice') {
    return <OptionList label="Варианты ответа" options={exercise.options ?? []} correct={exercise.answer ?? ''} onChange={(options, answer) => onChange({ ...exercise, options, answer, referenceAnswer: answer })} />;
  }
  if (exercise.type === 'ending_picker') {
    return <div className="grid gap-4 sm:grid-cols-2"><Labeled label="Предложение или контекст"><input className={field} value={exercise.context ?? ''} onChange={(event) => onChange({ ...exercise, context: event.target.value })} placeholder="Ja svakog dana rad___" /></Labeled><Labeled label="Основа слова"><input className={field} value={exercise.stem ?? ''} onChange={(event) => onChange({ ...exercise, stem: event.target.value })} placeholder="rad" /></Labeled><div className="sm:col-span-2"><OptionList label="Окончания" options={exercise.options ?? []} correct={exercise.answer ?? ''} onChange={(options, answer) => onChange({ ...exercise, options, answer, referenceAnswer: `${exercise.stem ?? ''}${answer}` })} compact /></div></div>;
  }
  if (exercise.type === 'sentence_builder') {
    return <div className="space-y-4"><Labeled label="Правильный порядок слов"><StringItems items={exercise.tokens ?? []} onChange={(tokens) => onChange({ ...exercise, tokens, answer: tokens.join(' '), referenceAnswer: tokens.join(' ') })} addLabel="Слово" /></Labeled><Labeled label="Лишние слова"><StringItems items={exercise.distractors ?? []} onChange={(distractors) => onChange({ ...exercise, distractors })} addLabel="Лишнее слово" /></Labeled></div>;
  }
  if (exercise.type === 'letter_unscramble') {
    return <div className="grid gap-4 sm:grid-cols-2"><Labeled label="Контекст"><input className={field} value={exercise.context ?? ''} onChange={(event) => onChange({ ...exercise, context: event.target.value })} placeholder="Дом по-сербски" /></Labeled><Labeled label="Правильное слово"><input className={field} value={exercise.answer ?? ''} onChange={(event) => onChange({ ...exercise, answer: event.target.value, referenceAnswer: event.target.value, tokens: [...event.target.value] })} placeholder="kuća" /></Labeled><Labeled label="Лишние буквы"><input className={field} value={(exercise.distractors ?? []).join('')} onChange={(event) => onChange({ ...exercise, distractors: [...event.target.value] })} /></Labeled></div>;
  }
  if (exercise.type === 'matching') {
    const pairs = exercise.pairs ?? [];
    return <Labeled label="Пары"><div className="space-y-2">{pairs.map((pair, index) => <div key={index} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2"><input aria-label={`Левая часть пары ${index + 1}`} className={field} value={pair.left} onChange={(event) => onChange({ ...exercise, pairs: pairs.map((item, itemIndex) => itemIndex === index ? { ...item, left: event.target.value } : item) })} /><LuGitCompareArrows className="text-[var(--text-muted)]" /><input aria-label={`Правая часть пары ${index + 1}`} className={field} value={pair.right} onChange={(event) => onChange({ ...exercise, pairs: pairs.map((item, itemIndex) => itemIndex === index ? { ...item, right: event.target.value } : item) })} /><RemoveButton onClick={() => onChange({ ...exercise, pairs: pairs.filter((_, itemIndex) => itemIndex !== index) })} /></div>)}<AddRow label="Добавить пару" onClick={() => onChange({ ...exercise, pairs: [...pairs, { left: '', right: '' }] })} /></div></Labeled>;
  }
  if (exercise.type === 'fill_blank') {
    return <div className="grid gap-4 sm:grid-cols-[2fr_1fr]"><Labeled label="Предложение с ___ на месте ответа"><input className={field} value={exercise.context ?? ''} onChange={(event) => onChange({ ...exercise, context: event.target.value })} placeholder="Ona ___ srpski svaki dan." /></Labeled><Labeled label="Допустимые ответы"><StringItems items={exercise.acceptedAnswers ?? []} onChange={(acceptedAnswers) => onChange({ ...exercise, acceptedAnswers, answer: acceptedAnswers[0] ?? '', referenceAnswer: acceptedAnswers[0] ?? '' })} addLabel="Ответ" /></Labeled></div>;
  }
  if (exercise.type === 'image_description') {
    return <ImageExerciseFields exercise={exercise} onChange={onChange} />;
  }
  if (exercise.type === 'reading_qa') {
    return <ReadingEditor exercise={exercise} onChange={onChange} />;
  }
  if (exercise.type === 'form_hunt') {
    return <div className="grid gap-4"><Labeled label="Текст для поиска"><textarea rows={5} className={field} value={exercise.context ?? ''} onChange={(event) => onChange({ ...exercise, context: event.target.value })} /></Labeled><Labeled label="Слова, которые нужно найти"><StringItems items={exercise.targetWords ?? []} onChange={(targetWords) => onChange({ ...exercise, targetWords, answer: targetWords.join(', '), referenceAnswer: targetWords.join(', ') })} addLabel="Форма" /></Labeled></div>;
  }
  if (exercise.type === 'explain_word') {
    return <div className="grid gap-4 sm:grid-cols-2"><Labeled label="Слово"><input className={field} value={exercise.context ?? ''} onChange={(event) => onChange({ ...exercise, context: event.target.value })} /></Labeled><Labeled label="Пример хорошего объяснения"><textarea rows={4} className={field} value={exercise.referenceAnswer ?? ''} onChange={(event) => onChange({ ...exercise, referenceAnswer: event.target.value, answer: event.target.value })} /></Labeled></div>;
  }
  return <Labeled label="Критерии ручной проверки"><textarea rows={5} className={field} value={exercise.criteria ?? exercise.referenceAnswer ?? ''} onChange={(event) => onChange({ ...exercise, criteria: event.target.value, referenceAnswer: event.target.value })} placeholder="Что обязательно должно быть в работе ученика" /></Labeled>;
}

/**
 * Список вариантов ответа с отметкой правильного.
 *
 * Здесь было две поломки, и обе выглядели как «лагает и ничего нельзя выбрать».
 *
 * Правильный вариант отмечался сравнением ТЕКСТА (`correct === option`), а
 * новое задание начинается с двух ПУСТЫХ вариантов. Пустые тексты неразличимы,
 * поэтому отметка на них была запрещена явным `option !== ''` — то есть до тех
 * пор, пока преподаватель не наберёт текст, нажатие на точку не делало ничего
 * вообще. Два одинаковых варианта зажигали обе точки разом.
 *
 * И группа радиокнопок называлась по подписи списка. В задании «текст и
 * вопросы» у каждого вопроса свой список с одной и той же подписью «Ответы»,
 * поэтому все вопросы урока оказывались ОДНОЙ группой: отметив ответ во втором
 * вопросе, преподаватель снимал отметку в первом.
 *
 * Теперь правильный вариант держится за НОМЕРОМ, а наружу по-прежнему отдаётся
 * текст — формат задания не меняется. Имя группы уникально для каждого списка.
 */
function OptionList({ label, options, correct, onChange, compact = false }: { label: string; options: string[]; correct: string; onChange: (options: string[], answer: string) => void; compact?: boolean }) {
  const group = useId();
  // Номер отмеченного варианта. Держать его в состоянии обязательно: пустой
  // вариант по тексту не найти, а отметить его нужно уметь.
  const [correctIndex, setCorrectIndex] = useState(() => options.indexOf(correct));

  // Список могли заменить снаружи — сменой типа задания или загрузкой урока.
  // Тогда номер восстанавливается по тексту, иначе отметка указывала бы на
  // чужой вариант.
  useEffect(() => {
    setCorrectIndex((current) => (options[current] === correct && correct !== '' ? current : options.indexOf(correct)));
  }, [options, correct]);

  const choose = (index: number) => {
    setCorrectIndex(index);
    onChange(options, options[index] ?? '');
  };

  const editOption = (index: number, value: string) => {
    const next = options.map((item, itemIndex) => (itemIndex === index ? value : item));
    onChange(next, index === correctIndex ? value : (next[correctIndex] ?? ''));
  };

  const removeOption = (index: number) => {
    const next = options.filter((_, itemIndex) => itemIndex !== index);
    const nextIndex = index === correctIndex ? -1 : index < correctIndex ? correctIndex - 1 : correctIndex;
    setCorrectIndex(nextIndex);
    onChange(next, nextIndex >= 0 ? (next[nextIndex] ?? '') : '');
  };

  return (
    <Labeled label={label}>
      <p className="mb-2 text-xs font-normal normal-case text-[var(--text-muted)]">
        Точкой слева отмечается правильный вариант.
      </p>
      <div className={compact ? 'grid gap-2 sm:grid-cols-2' : 'space-y-2'}>
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="radio"
              name={group}
              checked={index === correctIndex}
              onChange={() => choose(index)}
              aria-label={`Правильный вариант ${index + 1}`}
              className="size-4 shrink-0 accent-[var(--accent)]"
            />
            <input
              className={field}
              value={option}
              onChange={(event) => editOption(index, event.target.value)}
              placeholder={`Вариант ${index + 1}`}
            />
            {index === correctIndex && (
              <span className="shrink-0 rounded bg-[var(--accent)]/12 px-2 py-1 text-xs font-bold text-[var(--accent)]">
                верный
              </span>
            )}
            <RemoveButton onClick={() => removeOption(index)} />
          </div>
        ))}
        <AddRow label="Добавить вариант" onClick={() => onChange([...options, ''], correct)} />
      </div>
    </Labeled>
  );
}

function StringItems({ items, onChange, addLabel }: { items: string[]; onChange: (items: string[]) => void; addLabel: string }) {
  return <div className="flex flex-wrap gap-2">{items.map((item, index) => <label key={index} className="flex items-center rounded border border-[var(--line)] bg-[var(--bg)]"><input aria-label={`${addLabel} ${index + 1}`} value={item} onChange={(event) => onChange(items.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} className="min-w-16 max-w-40 bg-transparent px-2.5 py-2 outline-none" style={{ width: `${Math.max(5, item.length + 1)}ch` }} /><button type="button" title="Удалить" aria-label="Удалить" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} className="grid size-8 place-items-center text-[var(--text-muted)] hover:text-red-600"><LuX /></button></label>)}<AddRow label={`Добавить: ${addLabel.toLocaleLowerCase('ru')}`} onClick={() => onChange([...items, ''])} /></div>;
}

function ImageExerciseFields({ exercise, onChange }: { exercise: LessonExercise; onChange: (value: LessonExercise) => void }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true); setError('');
    try { onChange({ ...exercise, imageUrl: await uploadLessonImage(file) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось загрузить изображение.'); }
    finally { setUploading(false); event.target.value = ''; }
  };
  return <div className="grid gap-4 sm:grid-cols-2"><div><Labeled label="Изображение"><div className="flex gap-2"><input className={field} value={exercise.imageUrl ?? ''} onChange={(event) => onChange({ ...exercise, imageUrl: event.target.value })} placeholder="HTTPS-ссылка" /><button type="button" title="Загрузить изображение" aria-label="Загрузить изображение" disabled={uploading} onClick={() => input.current?.click()} className="grid size-11 shrink-0 place-items-center rounded-md border border-[var(--line)] hover:border-[var(--accent)]">{uploading ? <Spinner /> : <LuImagePlus />}</button><input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => void upload(event)} /></div></Labeled>{exercise.imageUrl && <img src={exercise.imageUrl} alt="" className="mt-3 max-h-56 w-full rounded object-contain" />}{error && <p className="mt-2 text-sm text-red-600">{error}</p>}</div><Labeled label="Пример подходящего описания"><textarea rows={5} className={field} value={exercise.referenceAnswer ?? ''} onChange={(event) => onChange({ ...exercise, referenceAnswer: event.target.value, answer: event.target.value })} /></Labeled></div>;
}

function ReadingEditor({ exercise, onChange }: { exercise: LessonExercise; onChange: (value: LessonExercise) => void }) {
  const questions = exercise.questions ?? [];
  const updateQuestion = (index: number, value: LessonReadingQuestion) => onChange({ ...exercise, questions: questions.map((question, itemIndex) => itemIndex === index ? value : question) });
  return <div className="space-y-5"><Labeled label="Текст для чтения"><textarea rows={7} className={field} value={exercise.readingText ?? ''} onChange={(event) => onChange({ ...exercise, readingText: event.target.value })} /></Labeled><div><p className="text-sm font-semibold">Вопросы</p><div className="mt-3 divide-y divide-[var(--line)] border-y border-[var(--line)]">{questions.map((question, index) => <div key={question.id} className="py-4"><div className="flex gap-2"><input className={field} value={question.prompt} onChange={(event) => updateQuestion(index, { ...question, prompt: event.target.value })} placeholder={`Вопрос ${index + 1}`} /><RemoveButton onClick={() => onChange({ ...exercise, questions: questions.filter((_, itemIndex) => itemIndex !== index) })} /></div><div className="mt-3"><OptionList label="Ответы" compact options={question.options} correct={question.answer} onChange={(options, answer) => updateQuestion(index, { ...question, options, answer })} /></div></div>)}</div><AddRow label="Добавить вопрос" onClick={() => onChange({ ...exercise, questions: [...questions, { id: crypto.randomUUID(), prompt: '', options: ['', ''], answer: '' }] })} /></div></div>;
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-2 text-sm font-semibold">{label}<div className="font-normal">{children}</div></label>; }
function RemoveButton({ onClick }: { onClick: () => void }) { return <button type="button" title="Удалить" aria-label="Удалить" onClick={onClick} className="grid size-10 shrink-0 place-items-center rounded text-[var(--text-muted)] hover:bg-red-600/10 hover:text-red-600"><LuX /></button>; }
function AddRow({ label, onClick }: { label: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded px-2 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--bg-sunken)]"><LuPlus />{label}</button>; }

function createExercise(type: ExerciseType, prompt = ''): LessonExercise {
  const base = { id: crypto.randomUUID(), type, prompt } as LessonExercise;
  if (type === 'multiple_choice') return { ...base, options: ['', ''], answer: '' };
  if (type === 'ending_picker') return { ...base, context: '', stem: '', options: ['', ''], answer: '' };
  if (type === 'sentence_builder') return { ...base, tokens: ['', '', ''], distractors: [], answer: '' };
  if (type === 'letter_unscramble') return { ...base, context: '', tokens: [], distractors: [], answer: '' };
  if (type === 'matching') return { ...base, pairs: [{ left: '', right: '' }, { left: '', right: '' }] };
  if (type === 'fill_blank') return { ...base, context: '', acceptedAnswers: [''], answer: '' };
  if (type === 'image_description') return { ...base, imageUrl: '', referenceAnswer: '' };
  if (type === 'reading_qa') return { ...base, readingText: '', questions: [{ id: crypto.randomUUID(), prompt: '', options: ['', ''], answer: '' }] };
  if (type === 'form_hunt') return { ...base, context: '', targetWords: [] };
  if (type === 'explain_word') return { ...base, context: '', referenceAnswer: '' };
  return { ...base, criteria: '' };
}

function promptPlaceholder(type: ExerciseType): string {
  if (type === 'teacher_letter') return 'Напишите письмо о своём обычном дне';
  if (type === 'form_hunt') return 'Найдите в тексте формы локатива';
  if (type === 'reading_qa') return 'Прочитайте текст и ответьте на вопросы';
  if (type === 'matching') return 'Соедините слова с переводами';
  return 'Что должен сделать ученик?';
}
