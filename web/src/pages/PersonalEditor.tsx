import { useEffect, useState } from "react";
import type { LessonContent } from "../api/personal";
import { Button } from "../components/ui";

export function PersonalEditor({
  initial,
  busy,
  cancel,
  save,
}: {
  initial: LessonContent;
  busy: boolean;
  cancel: () => void;
  save: (c: LessonContent) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useEffect(() => {
    const guard = (event: Event) => { if ((dirty || busy) && !window.confirm(busy ? 'Сохранение ещё идёт. Уйти со страницы?' : 'Уйти без сохранения правок?')) event.preventDefault(); };
    const unload = (event: BeforeUnloadEvent) => { if (dirty || busy) {event.preventDefault(); event.returnValue='';} };
    window.addEventListener('citavuk-before-navigate', guard);
    window.addEventListener('beforeunload', unload);
    return () => {window.removeEventListener('citavuk-before-navigate', guard);window.removeEventListener('beforeunload', unload);};
  }, [dirty,busy]);
  const field = (
    key: "title" | "theme" | "text",
    label: string,
    max: number,
  ) => (
    <label>
      {label}
      <textarea
        maxLength={max}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <form
      className="personal-panel"
      onSubmit={(e) => {
        e.preventDefault();
        void save(draft);
      }}
    >
      <fieldset disabled={busy}>
      <h1>Твой вариант урока</h1>
      <p>
        Изменения видишь только ты. Сохранённый результат прохождения не
        меняется.
      </p>
      {field("title", "Название", 120)}
      {field("theme", "Тема", 120)}
      {field("text", "Материал урока", 12000)}
      <h2>Правила</h2>
      {draft.rules.map((r, i) => (
        <label key={i}>
          Правило {i + 1}
          <textarea
            value={r}
            maxLength={1500}
            onChange={(e) =>
              setDraft({
                ...draft,
                rules: draft.rules.map((v, j) =>
                  i === j ? e.target.value : v,
                ),
              })
            }
          />
          <button type="button" disabled={draft.rules.length<=1} onClick={()=>setDraft({...draft,rules:draft.rules.filter((_,j)=>j!==i)})}>Удалить правило</button>
        </label>
      ))}
      <button type="button" disabled={draft.rules.length>=8} onClick={()=>setDraft({...draft,rules:[...draft.rules,'']})}>Добавить правило</button>
      <h2>Схема</h2>
      <label>
        Название схемы
        <input
          value={draft.scheme.title}
          maxLength={160}
          onChange={(e) =>
            setDraft({
              ...draft,
              scheme: { ...draft.scheme, title: e.target.value },
            })
          }
        />
      </label>
      {draft.scheme.columns.map((v, i) => (
        <label key={i}>
          Столбец {i + 1}
          <input
            value={v}
            maxLength={100}
            onChange={(e) =>
              setDraft({
                ...draft,
                scheme: {
                  ...draft.scheme,
                  columns: draft.scheme.columns.map((x, j) =>
                    i === j ? e.target.value : x,
                  ),
                },
              })
            }
          />
        </label>
      ))}
      {draft.scheme.rows.map((row, i) => (
        <div key={i} className="personal-actions">
          {row.map((v, j) => (
            <label key={j}>
              Строка {i + 1}: {draft.scheme.columns[j]}
              <input
                value={v}
                maxLength={500}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    scheme: {
                      ...draft.scheme,
                      rows: draft.scheme.rows.map((r, k) =>
                        k === i
                          ? r.map((x, n) => (n === j ? e.target.value : x))
                          : r,
                      ),
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      ))}
      <h2>Упражнения</h2>
      {draft.exercises.map((ex, i) => (
        <fieldset key={i}>
          <legend>Задание {i + 1}</legend>
          <label>Тип задания<select value={ex.kind} onChange={e=>setDraft({...draft,exercises:draft.exercises.map((v,j)=>i===j?{...v,kind:e.target.value as typeof ex.kind,options:e.target.value==='choice'?['','']:[],acceptedAnswers:[]}:v)})}><option value="choice">Выбор ответа</option><option value="fill">Вставить слово</option><option value="translate">Перевод</option></select></label>
          {(["question", "answer", "hint"] as const).map((k) => (
            <label key={k}>
              {
                {
                  question: "Вопрос",
                  answer: "Образец ответа",
                  hint: "Подсказка",
                }[k]
              }
              <textarea
                maxLength={1200}
                value={ex[k] || ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    exercises: draft.exercises.map((v, j) =>
                      i === j ? { ...v, [k]: e.target.value } : v,
                    ),
                  })
                }
              />
            </label>
          ))}
          {ex.options?.map((o, j) => (
            <label key={j}>
              Вариант {j + 1}
              <input
                maxLength={500}
                value={o}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    exercises: draft.exercises.map((v, k) =>
                      i === k
                        ? {
                            ...v,
                            options: v.options?.map((x, n) =>
                              n === j ? e.target.value : x,
                            ),
                          }
                        : v,
                    ),
                  })
                }
              />
            </label>
          ))}
          {ex.kind!=='choice'&&<label>Другие допустимые ответы (каждый с новой строки)<textarea value={(ex.acceptedAnswers??[]).join('\n')} maxLength={9608} onChange={e=>setDraft({...draft,exercises:draft.exercises.map((v,j)=>i===j?{...v,acceptedAnswers:e.target.value.split('\n').slice(0,8)}:v)})}/></label>}
          <button type="button" disabled={draft.exercises.length<=4} onClick={()=>setDraft({...draft,exercises:draft.exercises.filter((_,j)=>i!==j)})}>Удалить задание</button>
        </fieldset>
      ))}
      <button type="button" disabled={draft.exercises.length>=8} onClick={()=>setDraft({...draft,exercises:[...draft.exercises,{kind:'translate',question:'',answer:'',hint:'',options:[],acceptedAnswers:[]}]})}>Добавить задание</button>
      <div className="personal-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={()=>{if(!dirty || window.confirm('Уйти без сохранения правок?'))cancel();}}
        >
          Отмена
        </Button>
        <Button disabled={busy}>Сохранить</Button>
      </div>
      </fieldset>
    </form>
  );
}
