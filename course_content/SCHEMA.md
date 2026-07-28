# Course content schema v1

Источник истины для учебного контента курса грамматики Citavuk.
Контент хранится в редактируемых JSON-файлах (один unit = один файл),
компилируется валидатором `tools/course_build` в единый bundle
`frontend/assets/course/course_bundle.json`.

## Файловая структура

```
course_content/
  course.json            # индекс курса: id, версия, config, порядок units
  units/u_<id>.json      # один файл на unit
```

## course.json

```json
{
  "courseId": "sr_grammar_prosvirina",
  "courseVersion": "1.0.0",
  "title": "Сербская грамматика по Просвириной",
  "config": {
    "defaultScript": "latin",
    "acceptBothScripts": false,
    "showTransliterationHint": true,
    "passThreshold": 0.8,
    "allowDraftContent": false
  },
  "units": ["u_pismo", "u_rod_mnozina", "..."]
}
```

- `defaultScript`: `latin` | `cyrillic` — основная письменность курса.
- `acceptBothScripts`: принимать ли ответ в другой письменности.
- `passThreshold`: порог итоговой контрольной (explicit config, не magic number).
- `allowDraftContent`: если false, валидатор падает на `reviewStatus: draft`
  в production bundle.

## unit-файл

```json
{
  "id": "u_padezi",
  "title": "Падежи",
  "description": "Система семи падежей: вопросы, функции, управление.",
  "skills": [ ... ]
}
```

### skill

```json
{
  "id": "sk_padezi_intro",
  "title": "Семь падежей",
  "objectives": [
    {"id": "obj_padezi_names", "title": "Назвать 7 падежей и их вопросы"}
  ],
  "lessons": [ ... ]
}
```

### lesson

```json
{
  "id": "l_padezi_1",
  "title": "Знакомство с падежами",
  "prerequisites": [],
  "intro": {
    "text": "Короткое авторское объяснение (НЕ дословная копия книги).",
    "sourceRef": { ... }
  },
  "exercises": [ ... ]
}
```

- `prerequisites`: lesson IDs, которые должны быть completed. Циклы запрещены.
- Урок: 6–12 упражнений, одна микроконцепция.

## sourceRef (provenance, обязателен)

```json
{
  "sourceBook": "Просвирина О.А. и др. Сербский язык. Практическая грамматика. 2018",
  "sourceHeading": "5.2.3. Падежи • Padeži",
  "sourceAnchor": "md:838-922",
  "sourceEditionOrFileHash": "sha256:<hash исходного md>",
  "contentVersion": "1.0.0",
  "reviewStatus": "machine_checked",
  "reviewedBy": null,
  "supplemental": false
}
```

- `sourceAnchor`: диапазон строк исходного Markdown (`md:<start>-<end>`).
  Для авторского материала, которого в книге нет (различия сербского и
  хорватского, порядок слов в вопросе), допустимо `"authored"` — но только
  вместе с `supplemental: true`. Требовать выдуманный диапазон хуже: провенанс
  тогда подделывается вместо того, чтобы остаться в `sourceHeading`.
- `reviewStatus`: `draft` | `machine_checked` | `teacher_reviewed`.
- `supplemental: true` — контент, которого нет в книге (требует отдельного
  проверяемого источника в `sourceHeading`).

## Краткая запись: что можно не писать

Валидатор работает с полными объектами, но исходный файл разрешено писать
кратко — недостающее дописывает `tools/course_build/normalize.go` до
валидации. Это не отдельный формат, а те же поля со значениями по умолчанию.

| поле | откуда берётся, если не указано |
|------|----------------------------------|
| `id` упражнения | `ex_<lesson без l_>_<номер по порядку>` |
| `unitId`, `skillId`, `lessonId` | из положения в дереве |
| `instructionLanguage` | `"ru"` |
| `serbianScript` | `config.defaultScript` |
| `difficulty` | `2` |
| `contentReviewStatus` | `sourceRef.reviewStatus` |
| `sourceRef` | у урока → у skill → у unit |
| `learningObjectiveIds` | `lesson.objectives`, иначе единственная цель skill |

Два уточнения, которые легко принять за произвол:

- цель обучения подставляется от skill **только если она там одна**. При
  нескольких целях молчаливая подстановка закрыла бы правило 10 («каждая цель
  покрыта упражнением»), поэтому там автор перечисляет цели в `lesson.objectives`;
- ID упражнения зависит от позиции. Переставили задание — сменился ID, но
  прогресс хранится по урокам и целям обучения, а не по номерам заданий.

Никогда не выводятся автоматически: правильный ответ, `explanation`,
`difficulty` выше базовой. Это содержательные решения, и дефолт здесь скрыл бы
недоработку вместо того, чтобы её показать.

## exercise (базовые поля всех типов)

```json
{
  "id": "ex_padezi_1_mc1",
  "type": "multiple_choice",
  "unitId": "u_padezi",
  "skillId": "sk_padezi_intro",
  "lessonId": "l_padezi_1",
  "learningObjectiveIds": ["obj_padezi_names"],
  "difficulty": 1,
  "prompt": "...",
  "instructionLanguage": "ru",
  "serbianScript": "latin",
  "explanation": "Объяснение после ответа.",
  "hint": "Необязательная подсказка.",
  "sourceRef": { ... },
  "contentReviewStatus": "machine_checked"
}
```

- `difficulty`: 1–5.
- `serbianScript`: `latin` | `cyrillic` | `both` (только для script-уроков).
- ID стабильны и уникальны глобально.

## Типы упражнений (payload после базовых полей)

### multiple_choice
```json
{
  "type": "multiple_choice",
  "multi": false,
  "options": [
    {"id": "o1", "text": "genitiv", "correct": true,
     "misconceptionId": null, "feedbackKey": null},
    {"id": "o2", "text": "akuzativ", "correct": false,
     "misconceptionId": "misc_cases_confuse_gen_acc", "feedbackKey": "fb_gen_vs_acc"}
  ]
}
```

### sentence_builder
```json
{
  "type": "sentence_builder",
  "tokens": [
    {"id": "t1", "text": "Juče"},
    {"id": "t2", "text": "sam"},
    {"id": "t3", "text": "video"},
    {"id": "t4", "text": "Marka"},
    {"id": "t5", "text": "."}
  ],
  "distractorTokens": [{"id": "d1", "text": "Marko"}],
  "acceptedOrders": [["t1", "t2", "t3", "t4", "t5"]],
  "optionalTokenIds": []
}
```
- token IDs уникальны (повторные слова = разные ID).
- каждый accepted order должен использовать ровно не-distractor токены
  (минус optional), валидный порядок не обязан совпадать с исходным.

### ending_picker (глаголы и существительные)
```json
{
  "type": "ending_picker",
  "wordClass": "verb",
  "contextSentence": "Mi ___ svaki dan.",
  "stem": "rad",
  "target": {
    "lemma": "raditi",
    "person": 1, "number": "plur", "tense": "pres",
    "case": null, "gender": null, "animacy": null
  },
  "fullForm": "radimo",
  "options": [
    {"id": "e1", "text": "im", "correct": false, "misconceptionId": "misc_person_1sg_1pl", "feedbackKey": "fb_person"},
    {"id": "e2", "text": "imo", "correct": true, "misconceptionId": null, "feedbackKey": null}
  ],
  "preposition": null
}
```
- `wordClass`: `verb` | `noun`. Для noun заполняются case/number/gender/animacy,
  для verb — person/number/tense (+aspect где релевантно).
- `fullForm` — проверенная словарная форма (сверяется с лексиконом tooling'ом).

### letter_unscramble
```json
{
  "type": "letter_unscramble",
  "context": "Разговариваем с другом.",
  "lemma": "prijatelj",
  "targetFeats": "Case=Ins|Number=Sing",
  "answer": "prijateljem",
  "extraLetters": [],
  "showLemma": true,
  "highlightStem": "prijatelj"
}
```
- диакритики č/ć/š/ž/đ — единые буквы; диграфы lj/nj/dž — два символа,
  если урок явно не учит их как единицу (`digraphsAsUnits: true`).

### image_description
```json
{
  "type": "image_description",
  "mode": "choose",
  "image": {
    "assetId": "img_kitchen_1",
    "path": "assets/course/images/kitchen_1.webp",
    "altText": "...",
    "license": "user-provided",
    "entities": ["sto", "stolica", "prozor"],
    "focalPoint": {"x": 0.5, "y": 0.4}
  },
  "options": [ ...multiple_choice options... ]
}
```
- `mode`: `choose` | `build` | `fill` | `free`.
- `free`: `acceptedAnswers: ["...", "..."]` — нормализация регистра/пробелов/
  терминальной пунктуации; не является единственным судьёй грамматичности.
- Пока реальных изображений нет, item помечается
  `"contentReviewStatus": "draft"` + `"blockedReason": "no_asset"` и не входит
  в обязательную траекторию.

### reading_qa
```json
{
  "type": "reading_qa",
  "text": "Marko je iz Kragujevca. Posle posla ide kod brata.",
  "translation": "Марко из Крагуеваца. После работы он идёт к брату.",
  "questions": [
    {"id": "q1", "prompt": "Odakle je Marko?",
     "options": [{"id": "a", "text": "Iz Kragujevca", "correct": true},
                 {"id": "b", "text": "Iz Beograda"}]}
  ]
}
```
- варианты принадлежат вопросу, а не заданию: общий список превратил бы
  чтение в подбор пар;
- задание засчитывается целиком — половина верных ответов о тексте это не
  половина понимания, а угаданное место;
- перевод спрятан за кнопку: открытый, он превратил бы упражнение в чтение
  по-русски.

### form_hunt
```json
{
  "type": "form_hunt",
  "targetLabel": "существительные в винительном падеже",
  "translation": "Ана читает книгу.",
  "tokens": [
    {"id": "t1", "text": "Ana"},
    {"id": "t2", "text": "čita"},
    {"id": "t3", "text": "knjigu", "correct": true, "tail": "."}
  ]
}
```
- текст задаётся списком токенов, а не строкой: делить сербский текст на слова
  пришлось бы одинаково в Go, Dart и TypeScript, и любое расхождение
  (апостроф, дефис, đ) разошлось бы с проверкой ответа;
- `tail` — знаки препинания после слова, нажимается только слово;
- искомых форм должно быть больше нуля и меньше, чем всех токенов.

### matching
```json
{
  "type": "matching",
  "leftLabel": "Предлог",
  "rightLabel": "Падеж",
  "pairs": [
    {"left": "bez", "right": "genitiv"},
    {"left": "sa", "right": "instrumental"}
  ],
  "distractorsRight": ["akuzativ"]
}
```

### fill_blank
```json
{
  "type": "fill_blank",
  "segments": [
    {"kind": "text", "text": "Idem u "},
    {"kind": "blank", "id": "b1"},
    {"kind": "text", "text": "."}
  ],
  "blanks": [
    {"id": "b1", "acceptedAnswers": ["školu"], "caseSensitive": false}
  ]
}
```

## checkpoint и final exam

Unit может завершаться checkpoint-уроком (`"isCheckpoint": true` в lesson).
Финальная контрольная описывается в `course.json`:

```json
"finalExam": {
  "id": "exam_final",
  "blueprint": [
    {"skillId": "sk_padezi_intro", "count": 2},
    {"skillId": "sk_prezent", "count": 3}
  ],
  "requiredExerciseTypes": ["sentence_builder", "ending_picker", "letter_unscramble"],
  "cooldownHours": 24
}
```

Пул экзамена — отдельные exercise-файлы `course_content/exam/ex_*.json`
(новые примеры, не копии уроков). Ответы экзамена оцениваются на сервере.

## Состав курса: 8 частей, 48 уроков

| # | unit | часть программы | уроки |
|---|------|------------------|-------|
| 1 | `u_pismo` | Урок 1. Сербский алфавит (+ необязательный урок о BCMS) | 4 |
| 2 | `u_recenice` | Часть 1. Местоимения и предложение | 2–5 |
| 3 | `u_glagoli` | Часть 2. Глаголы | 6–8 |
| 4 | `u_imenice` | Часть 3. Существительные, все семь падежей | 9–16 |
| 5 | `u_pridevi` | Часть 4. Прилагательные, числительные, быт и еда | 17–25 |
| 6 | `u_vremena` | Часть 5. Времена глаголов | 26–31 |
| 7 | `u_zamenice` | Часть 6. Прилагательные и местоимения: углубление | 32–37 |
| 8 | `u_nacini` | Часть 7. Наклонения и причастия | 38–45 |

Урок `l_bcms` помечен `"optional": true`: его можно пройти, можно пропустить,
он ни у кого не стоит в `prerequisites`.

Все восемь units написаны и проходят валидатор. Порядок в `course.json`
задаёт педагогическую последовательность: каждый урок стоит в
`prerequisites` у следующего, поэтому цепочка линейная от `l_pismo_1` до
`l_45`.

## Качество источника: OCR

Исходный Markdown — OCR скана печатного учебника, а не выверенный текст.
Систематические дефекты, подтверждённые при аудите:

- обрезан левый край строк: `твительные` вместо `Существительные`;
- искажены сербские формы: `sfudepf—sfudenti` вместо `student—studenti`,
  `Stolovi` вместо `stolovi`, `ригеућ` вместо `putevi`;
- кириллическая колонка таблицы алфавита нечитаема (`7.7 жут = ŽUT`);
- заголовки некоторых разделов уничтожены (5.6.5 «Перфект», 5.7, 5.8),
  их границы определяются по содержанию;
- таблицы спряжения местами перемешаны построчно.

Отсюда рабочее правило, соответствующее §29 master-prompt:

1. Книга — источник того, **какие правила существуют**, их формулировки и
   педагогической последовательности. Отсюда же `sourceAnchor`.
2. Конкретная сербская словоформа берётся **не из OCR**, а проверяется по
   `lexicon.db` / `GrammarEngine`. Расхождение фиксируется, а не разрешается
   молча.
3. Максимальный статус автоматически созданного контента —
   `machine_checked`. `teacher_reviewed` ставит только человек.

### Автоматическая сверка с лексиконом

Валидатор читает `lexicon.db` (около 18 тысяч словоформ) и сверяет с ним
`ending_picker.fullForm` и `letter_unscramble.answer`:

- **конфликт леммы или признаков** — предупреждение с требованием ручной
  проверки; автоматически контент не переписывается;
- **формы нет в лексиконе** — не ошибка: словарь неполон. Такие формы
  выводятся отдельным списком, чтобы преподаватель проверил их глазами.

Так подтверждены чередования, восстановленные из повреждённого OCR:
`radnik → radnici` (k→c), `geolog → geolozi` (g→z), `uspeh → uspesi` (h→s),
`čitalac → čitaoci` (l→o), `građanin → građani`, а также род слов
`sudija` (мужской), `doba` (средний), `kost` (женский).

## Правила валидации (падает билд)

1. Duplicate course/unit/skill/lesson/exercise/objective IDs.
2. Missing prerequisite или цикл prerequisites.
3. Пустой урок (0 упражнений).
4. Отсутствие правильного ответа / accepted answer вне token set.
5. Одинаковый correct и distractor.
6. Ссылка на отсутствующий asset (image/sprite).
7. Неверный sourceRef (пустые обязательные поля, anchor вне файла).
8. Неизвестный exercise type.
9. learningObjectiveIds ссылаются на несуществующий objective.
10. Skill без покрытия всех своих objectives хотя бы одним упражнением.
11. Final exam blueprint ссылается на несуществующий skill или не покрывает
    все обязательные units.
12. `reviewStatus: draft` в production (`allowDraftContent: false`),
    кроме `blockedReason` items, которые исключаются из bundle с warning.
13. Нарушение полей письменности: `serbianScript: both` вне script-урока.
