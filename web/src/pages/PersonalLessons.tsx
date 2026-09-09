import { useCallback, useEffect, useRef, useState } from "react";
import {PersonalAudio} from '../components/PersonalAudio';
import {lessonSuit} from '../components/PlayingCardFrame';
import {PersonalPlayingCard} from '../components/PersonalPlayingCard';
import {allowNavigation} from '../lib/router';
import {toggleAnswer} from '../personal/answers';
import {LessonArt, LessonEmblem} from '../components/LessonDecoration';
import {Ornament} from '../components/Ornament';
import {
  LuArrowLeft,
  LuPencil,
  LuThumbsDown,
  LuThumbsUp,
  LuBookOpen,
  LuCalendarDays,
  LuLayers,
  LuSparkles,
} from "react-icons/lu";
import {
  personalApi,
  type PersonalLesson,
  type PersonalPlan,
  type PersonalResult,
  type PersonalState,
  type Question,
} from "../api/personal";
import { Button, Spinner } from "../components/ui";
import { Link } from "../lib/router";
import { useAuth } from "../state/auth";
import { PersonalEditor } from "./PersonalEditor";
import "./personal.css";
import "./personal-lesson.css";

const kinds: Record<string, string> = {
  reading: "Чтение",
  grammar: "Грамматика",
  vocabulary: "Лексика",
  listening: "Понимание речи",
  writing: "Письмо",
};
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Не удалось связаться с сервером.";

export function PersonalLessons() {
  const { account, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!account)
    return (
      <main className="personal">
        <h1>Колода сербского. Ого!</h1>
        <p>Войди, чтобы уроки и серия были с тобой на всех устройствах.</p>
        <Link to="/login">Войти</Link>
      </main>
    );
  return <PersonalHome key={account.id} level={account.serbianLevel || "A1"} />;
}
function PersonalHome({ level }: { level: string }) {
  const [selectedPlan, setSelectedPlan] = useState("");
  const selectedPlanRef = useRef(selectedPlan);
  selectedPlanRef.current = selectedPlan;
  const [state, setState] = useState<PersonalState | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [day, setDay] = useState<number | null>(null),
    [newPlan, setNewPlan] = useState(false),
    [feedback, setFeedback] = useState("");
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await personalApi.latest(signal);
        if (selectedPlan && next.plan?.id !== selectedPlan)
          next.plan = await personalApi.plan(selectedPlan, signal);
        if (!signal?.aborted && selectedPlan === selectedPlanRef.current) {
          setState(next);
          setError("");
        }
      } catch (e) {
        if (!signal?.aborted) setError(message(e));
      }
    },
    [selectedPlan],
  );
  useEffect(() => {
    const c = new AbortController();
    void refresh(c.signal);
    return () => c.abort();
  }, [refresh]);
  useEffect(() => {
    if (!state?.plan || !["queued", "running"].includes(state.plan.status))
      return;
    const c = new AbortController();
    let pending = false;
    const timer = setInterval(() => {
      if (document.hidden || pending) return;
      pending = true;
      void refresh(c.signal).finally(() => {
        pending = false;
      });
    }, 10000);
    return () => {
      clearInterval(timer);
      c.abort();
    };
  }, [state?.plan, refresh]);
  async function act(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (day !== null && state?.plan)
    return (
      <Lesson
        key={`${state.plan.id}:${day}`}
        plan={state.plan}
        day={day}
        back={() => {
          setDay(null);
          void refresh();
        }}
      />
    );
  const p = state?.plan;
  return (
    <main className="personal">
      <header className="personal-heading">
        <div>
          <p className="personal-eyebrow"><LuLayers aria-hidden /> Личные уроки на каждый день</p>
          <h1>Колода сербского. Ого!</h1>
          <p className="personal-intro">Волк Читавук разрисовал игральные карты, и теперь с помощью колоды вы можете самостоятельно создать себе уроки... <em>На каждый день!</em></p>
        </div>
        <img className="personal-heading-seal" src="/personal/decor/ravanica-medallion.png" alt="" />
      </header>
      {!newPlan && (state?.history?.length ?? 0) > 1 && (
        <label>
          Моя колода
          <select
            value={state?.plan?.id ?? ""}
            disabled={busy}
            onChange={(e) => {
              setDay(null);
              setSelectedPlan(e.target.value);
            }}
          >
            {state?.history?.map((h) => (
              <option value={h.id} key={h.id}>
                {new Date(h.startedAt).toLocaleDateString("ru")} ({h.level})
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <div role="alert" className="personal-error">
          {error}{" "}
          <Button variant="secondary" onClick={() => void refresh()}>
            Повторить
          </Button>
        </div>
      )}
      {!state && !error && <Spinner />}
      {state && (!p || newPlan) && (
        <Questionnaire
          questions={state.questions}
          defaultLevel={level}
          disabled={!state.available || busy}
          onCreate={(profile) =>
            act(async () => {
              await personalApi.create(profile);
              setSelectedPlan("");
              setNewPlan(false);
            })
          }
        />
      )}
      {state && !state.available && (
        <p>
          Новые колоды сейчас не составляются. Уже сохранённые уроки доступны.
        </p>
      )}
      {p && !newPlan && (
        <>
          <div className="personal-summary">
            <span><LuBookOpen aria-hidden /><span>Твой уровень <b>{p.profile.level}</b></span></span>
            <span><LuLayers aria-hidden /><span>Пройдено <b>{p.lessons.filter((l) => l.completedAt).length} из 30</b></span></span>
            <span title={`Дни открываются по часовому поясу ${p.profile.timezone}`}><LuCalendarDays aria-hidden /><span>Карта дня <b>{Math.min(p.today, 30)} / 30</b></span></span>
          </div>
          {p.status === "error" && (
            <div role="status" className="personal-generation personal-generation-error">
              <LuBookOpen aria-hidden />
              <div><h2>Колода сохранена, но ещё не готова</h2>
              <p>{p.error}</p>
              <Button
                disabled={busy}
                onClick={() => void act(() => personalApi.retry(p.id))}
              >
                Досоставить колоду
              </Button>
              </div>
            </div>
          )}
          {["queued", "running"].includes(p.status) && (
            <div role="status" className="personal-generation">
              <Spinner className="size-6 shrink-0" />
              <div><h2>{p.outline.length === 0 ? 'Собираем маршрут твоих занятий' : 'Читавук наполняет колоду'}</h2>
              <p>{p.lessons.length === 0 ? 'Сначала план на месяц, затем сами уроки. Это может занять несколько минут.' : `Готово ${p.lessons.length} из 30 уроков. Сегодняшнюю карту уже можно открыть.`}</p>
              <progress aria-label="Готовность колоды" max={30} value={p.lessons.length} />
              <small>Можно уйти со страницы: колода продолжит составляться.</small></div>
            </div>
          )}
          <Deck plan={p} open={setDay} />
          {p.suggestRegeneration && p.status === "ready" && (
            <section className="personal-panel">
              <h2>Сделаем уроки полезнее?</h2>
              <p>
                Расскажи, что не подошло. Пройденные уроки и твои правки
                останутся. Пересоставлений: {p.regenerations} из 3.
              </p>
              <label>
                Что изменить?
                <textarea
                  value={feedback}
                  maxLength={1500}
                  onChange={(e) => setFeedback(e.target.value)}
                />
              </label>
              <Button
                disabled={
                  busy || feedback.trim().length < 5 || p.regenerations >= 3
                }
                onClick={() =>
                  void act(() => personalApi.regenerate(p.id, feedback))
                }
              >
                Пересоставить оставшиеся уроки
              </Button>
            </section>
          )}
          {p.today > 30 && (
            <Button
              disabled={!state?.available}
              onClick={() => setNewPlan(true)}
            >
              Составить следующий месяц
            </Button>
          )}
        </>
      )}
    </main>
  );
}

export function Questionnaire({
  questions,
  defaultLevel,
  disabled,
  onCreate,
}: {
  questions: Question[];
  defaultLevel: string;
  disabled: boolean;
  onCreate: (p: {
    level: string;
    timezone: string;
    answers: Record<string, string>;
  }) => Promise<void>;
}) {
  const [level, setLevel] = useState(defaultLevel),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [step, setStep] = useState(0);
  const q = questions[step];
  const questionTitle = useRef<HTMLLegendElement>(null);
  useEffect(() => { if (step > 0) questionTitle.current?.focus(); }, [step]);
  if (!q) return null;
  return (
    <section className="personal-panel personal-question">
      <div className="personal-question-top"><span className="personal-eyebrow"><LuSparkles aria-hidden /> Настроим твою колоду</span><span aria-live="polite">Вопрос {step + 1} из {questions.length}</span></div>
      <progress aria-label="Прогресс анкеты" max={questions.length} value={step + 1} />
      {step === 0 && (
        <label>
          Твой уровень
          <select disabled={disabled} value={level} onChange={(e) => setLevel(e.target.value)}>
            {["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      )}
      <fieldset key={q.id} disabled={disabled}>
        <legend ref={questionTitle} tabIndex={-1}>{q.title}</legend>
        <p className="personal-question-hint">{q.multiple ? 'Можно выбрать несколько вариантов' : 'Выбери один вариант'}</p>
        <div className="personal-options">
        {q.options.map((o) => (
          <label className="personal-choice" key={o}>
            <input
              type={q.multiple ? 'checkbox' : 'radio'}
              name={q.id}
              checked={(answers[q.id] || '').split('\n').includes(o)}
              onChange={() => setAnswers((a) => ({ ...a, [q.id]: toggleAnswer(q, a[q.id] || '', o) }))}
            />
            <span>{o}</span>
          </label>
        ))}
        </div>
      </fieldset>
      <div className="personal-actions">
        <Button
          variant="secondary"
          disabled={step === 0 || disabled}
          onClick={() => setStep((s) => s - 1)}
        >
          Назад
        </Button>
        {step < questions.length - 1 ? (
          <Button
            disabled={!answers[q.id] || disabled}
            onClick={() => setStep((s) => s + 1)}
          >
            Дальше
          </Button>
        ) : (
          <Button
            disabled={!answers[q.id] || disabled}
            onClick={() =>
              void onCreate({
                level,
                answers,
                timezone:
                  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
              })
            }
          >
            Составить мою колоду
          </Button>
        )}
      </div>
      <small>
        Ответы отправятся модели для составления личных уроков. Не добавляй
        личные данные. Часовой пояс серии закрепляется после первого занятия.
      </small>
    </section>
  );
}

function Deck({plan,open}:{plan:PersonalPlan;open:(day:number)=>void}) {
 return <div className="personal-deck">{Array.from({length:30},(_,i)=>{
  const day=i+1,meta=plan.outline.find(o=>o.day===day),lesson=plan.lessons.find(l=>l.day===day);
  return <PersonalPlayingCard key={day} day={day} month={plan.month}
    kind={meta?.kind||'vocabulary'} title={meta?.title||`Урок ${day}`}
    ready={!!lesson&&day<=plan.today} today={day===plan.today}
    completed={lesson?.completedAt?`${lesson.score}/${lesson.total}`:undefined}
    onOpen={()=>open(day)}/>;
 })}</div>;
}

function Lesson({
  plan,
  day,
  back,
}: {
  plan: PersonalPlan;
  day: number;
  back: () => void;
}) {
  const [lesson, setLesson] = useState<PersonalLesson | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]),
    [result, setResult] = useState<PersonalResult | null>(null);
  const reload = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const l = await personalApi.lesson(plan.id, day, signal);
        if (!signal?.aborted) {
          setLesson(l);
          setAnswers(l.content.exercises.map(() => ""));
          setError("");
        }
      } catch (e) {
        if (!signal?.aborted) setError(message(e));
      }
    },
    [plan.id, day],
  );
  useEffect(() => {
    const c = new AbortController();
    void reload(c.signal);
    return () => c.abort();
  }, [reload]);
  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const c = lesson?.content;
  return (
    <main className="personal personal-lesson">
      <Button variant="ghost" onClick={()=>{if(allowNavigation())back();}}>
        <LuArrowLeft /> К колоде
      </Button>
      {error && (
        <p role="alert" className="personal-error">
          {error}{" "}
          <Button variant="secondary" onClick={() => void reload()}>
            Обновить урок
          </Button>
        </p>
      )}
      {!c && !error && <Spinner />}
      {c &&
        lesson &&
        (edit ? (
          <PersonalEditor
            initial={c}
            busy={busy}
            cancel={() => setEdit(false)}
            save={(content) =>
              act(async () => {
                await personalApi.edit(plan.id, day, lesson.revision, content);
                setEdit(false);
                setResult(null);
                await reload();
              })
            }
          />
        ) : (
          <>
            <header className="lesson-hero">
              <div className="lesson-hero-copy">
              <div className="lesson-identity"><span className="lesson-rank"><span aria-hidden>{lessonSuit(c.kind)}</span> Карта {day}</span><span className="lesson-kind">{kinds[c.kind]}</span></div>
              <h1>{c.title}</h1>
              <p className="lesson-theme">{c.theme}</p>
              <div className="lesson-facts"><span>Уровень <b>{plan.profile.level}</b></span><span>Заданий <b>{c.exercises.length}</b></span><span>Правил <b>{c.rules.length}</b></span></div>
              <Button className="lesson-edit-button" variant="ghost" onClick={() => setEdit(true)}>
                <LuPencil /> Изменить свой урок
              </Button>
              {lesson.edited && <small>С твоими правками</small>}
              </div>
              <LessonEmblem />
              <div className="lesson-kilim"><Ornament animated={false} count={19} /></div>
            </header>
            <nav className="lesson-chapters" aria-label="Разделы урока" onClick={(e) => {
              if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
              const anchor = e.target instanceof Element ? e.target.closest('a') : null;
              const section = anchor && document.getElementById(anchor.hash.slice(1));
              if (!section) return;
              // Прокрутка внутри урока не создаёт записи без индекса нашего
              // роутера: иначе «назад» конфликтует с защитой редактора.
              e.preventDefault();
              section.scrollIntoView({ block: 'start' });
            }}>
              <a href="#lesson-text"><LessonArt name="open-book" /><span><small>01</small>Материал</span></a>
              <a href="#lesson-rules"><LessonArt name="quill-ink" /><span><small>02</small>Правила</span></a>
              <a href="#lesson-scheme"><LessonArt name="cog" /><span><small>03</small>Схема</span></a>
              <a href="#lesson-practice"><LessonArt name="crossed-swords" /><span><small>04</small>Практика</span></a>
            </nav>
            <article className="lesson-manuscript">
              <section className="personal-panel lesson-paper" id="lesson-text" aria-labelledby="lesson-text-heading">
              <header className="lesson-section-heading"><LessonArt name="open-book" /><div><span>Читаем и замечаем</span><h2 id="lesson-text-heading">Материал урока</h2></div></header>
              {c.kind==='listening'&&<PersonalAudio key={`${lesson.revision}:${day}`} text={c.text}/>}
              <div className="personal-prose">{c.text}</div>
              </section>
              <section className="personal-panel lesson-rules-panel" id="lesson-rules" aria-labelledby="lesson-rules-heading">
              <header className="lesson-section-heading"><LessonArt name="quill-ink" /><div><span>На полях тетради</span><h2 id="lesson-rules-heading">Разберёмся</h2></div></header>
              <ol className="lesson-rules-list">
                {c.rules.map((r, i) => (
                  <li key={i}><span className="lesson-rule-number" aria-hidden>{String(i + 1).padStart(2, '0')}</span><p>{r}</p></li>
                ))}
              </ol>
              </section>
              <section className="personal-panel lesson-scheme-panel" id="lesson-scheme" aria-labelledby="lesson-scheme-heading">
              <header className="lesson-section-heading"><LessonArt name="clockwork" /><div><span>Собираем всё вместе</span><h2 id="lesson-scheme-heading">{c.scheme.title}</h2></div></header>
              <div className="personal-table">
                <table aria-labelledby="lesson-scheme-heading">
                  <thead>
                    <tr>
                      {c.scheme.columns.map((v, i) => (
                        <th key={i}>{v}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {c.scheme.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((v, j) => (
                          <td key={j}>{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </section>
            </article>
            <form
              className="personal-panel lesson-practice" id="lesson-practice"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  setResult(
                    await personalApi.complete(
                      plan.id,
                      day,
                      lesson.revision,
                      answers,
                    ),
                  );
                });
              }}
            >
              <header className="lesson-practice-heading"><LessonArt name="crossed-swords" /><div><span>Время применить знания</span><h2>Попробуй сам</h2></div><span className="lesson-answer-count" aria-live="polite">{answers.filter(a => a.trim()).length} / {c.exercises.length}</span></header>
              <progress aria-label="Заполнено заданий" max={c.exercises.length} value={answers.filter(a => a.trim()).length} />
              {c.exercises.map((ex, i) => (
                <fieldset className={`lesson-exercise ${answers[i]?.trim() ? 'has-answer' : ''}`} key={i} disabled={busy || !!result}>
                  <legend>
                    <span className="lesson-exercise-number">{String(i + 1).padStart(2, '0')}</span>{ex.question}
                  </legend>
                  {ex.kind === "choice" ? (
                    ex.options?.map((o) => (
                      <label className="personal-choice" key={o}>
                        <input
                          type="radio"
                          name={`answer-${i}`}
                          value={o}
                          checked={answers[i] === o}
                          onChange={() =>
                            setAnswers((a) =>
                              a.map((v, j) => (i === j ? o : v)),
                            )
                          }
                        />
                        {o}
                      </label>
                    ))
                  ) : (
                    <label>
                      Твой ответ
                      <input
                        required
                        maxLength={1500}
                        value={answers[i] || ""}
                        onChange={(e) =>
                          setAnswers((a) =>
                            a.map((v, j) => (i === j ? e.target.value : v)),
                          )
                        }
                        autoComplete="off"
                      />
                    </label>
                  )}
                  {ex.hint && (
                    <details>
                      <summary>Подсказка</summary>
                      {ex.hint}
                    </details>
                  )}
                  {result && (
                    <p className="lesson-example-answer">
                      Образец ответа: <strong lang="sr">{ex.answer}</strong>
                    </p>
                  )}
                </fieldset>
              ))}
              <div className="lesson-submit-row"><p>{result ? 'Результат сохранён' : 'Ответь на все задания, чтобы завершить урок.'}</p><Button
                disabled={busy || answers.some((a) => !a.trim()) || !!result}
              >
                Завершить урок
              </Button></div>
            </form>
            {(result || lesson.completedAt) && (
              <section className="personal-panel lesson-completed" role="status">
                <LessonArt name="visored-helm" />
                <h2>
                  Урок пройден: {result?.score ?? lesson.score} из{" "}
                  {result?.total ?? lesson.total}
                </h2>
                {result?.study.newDay && (
                  <p>
                    Огонь зажжён! Твоя серия: {result.study.current}. Заморозок
                    осталось: {result.study.freezes}.
                  </p>
                )}
                <p>Урок был полезен?</p>
                <div className="personal-actions">
                  {[1, -1].map((r) => (
                    <Button
                      key={r}
                      variant="secondary"
                      disabled={busy}
                      aria-pressed={lesson.rating === r}
                      onClick={() =>
                        void act(async () => {
                          await personalApi.rate(plan.id, day, r);
                          setLesson({ ...lesson, rating: r });
                        })
                      }
                    >
                      {r === 1 ? <LuThumbsUp /> : <LuThumbsDown />}
                      {r === 1 ? "Да" : "Не очень"}
                    </Button>
                  ))}
                </div>
              </section>
            )}
            <details className="lesson-art-credits"><summary>Художники и детали оформления</summary><p>Мечи, шлем, книга, перо и часовые механизмы: <a href="https://game-icons.net/" target="_blank" rel="noreferrer">Lorc / Game-icons.net</a>, <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>. Цвет и композиция адаптированы для Читавука. Медальон Раваницы: Tadija, Antonu, public domain. Гравированная рамка: johnny_automatic, CC0. <a href="/personal/lesson-art/CREDITS.txt" target="_blank" rel="noreferrer">Все источники</a>.</p></details>
          </>
        ))}
    </main>
  );
}
