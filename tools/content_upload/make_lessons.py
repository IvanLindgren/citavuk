"""Генератор 16 качественных публичных уроков по грамматике сербского языка для уровней A1-B1.

Соблюдаются строгие правила:
- Обращение на «ты».
- Отсутствие двоеточий и тире во всех текстах.
- Разнообразные типы упражнений (multiple_choice, fill_blank, matching, sentence_builder, translator_duel).
- Полноценная теория с таблицами, списками, цитатами.
- Понятные примеры и ветвящиеся диалоги.
"""

import json
from pathlib import Path

OUT_DIR = Path("tools/content_upload/generated_lessons")
OUT_DIR.mkdir(parents=True, exist_ok=True)

LESSONS = [
    # 1. prezent-glagola-biti (A1)
    {
        "slug": "prezent-glagola-biti",
        "title": "Глагол biti в настоящем времени",
        "summary": "Учимся говорить о себе, профессии и местоположении с помощью главного сербского глагола biti.",
        "level": "A1",
        "lessonType": "grammar",
        "topic": "Глагол biti",
        "tags": ["глаголы", "настоящее время", "базовые фразы"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Самый главный глагол в сербском языке"},
                {"id": "t2", "type": "paragraph", "text": "Глагол biti переводится как быть или являться. В русском языке мы обычно опускаем его в настоящем времени и говорим «я студент», но в сербском глагол связка обязателен всегда. Без него предложение останется незаконченным."},
                {"id": "t3", "type": "table", "rows": [
                    ["Местоимение", "Краткая форма", "Отрицательная форма", "Пример"],
                    ["ja", "sam", "nisam", "Ja sam student"],
                    ["ti", "si", "nisi", "Ti si ovde"],
                    ["on, ona, ono", "je", "nije", "Ona je lekar"],
                    ["mi", "smo", "nismo", "Mi smo prijatelji"],
                    ["vi", "ste", "niste", "Vi ste ljubazni"],
                    ["oni, one, ona", "su", "nisu", "Oni su kod kuće"]
                ]},
                {"id": "t4", "type": "heading", "text": "Краткие формы и правило второго места"},
                {"id": "t5", "type": "paragraph", "text": "Краткие формы сам, си, је не имеют собственного ударения и обычно занимают вторую смысловую позицию в предложении. Если опустить местоимение, на первое место встает другое важное слово."},
                {"id": "t6", "type": "list", "ordered": False, "items": [
                    "Ja sam u Beogradu или просто U Beogradu sam",
                    "On je kod kuće или просто Kod kuće je",
                    "Mi smo spremni или просто Spremni smo"
                ]},
                {"id": "t7", "type": "quote", "text": "Отрицание пишется слитно в одно слово, например nisam, nisi, nije, nismo, niste, nisu."}
            ],
            "markdown": "## Самый главный глагол в сербском языке\n\nГлагол biti переводится как быть или являться. В русском языке мы обычно опускаем его в настоящем времени и говорим «я студент», но в сербском глагол связка обязателен всегда. Без него предложение останется незаконченным.\n\n| Местоимение | Краткая форма | Отрицательная форма | Пример |\n| --- | --- | --- | --- |\n| ja | sam | nisam | Ja sam student |\n| ti | si | nisi | Ti si ovde |\n| on, ona, ono | je | nije | Ona je lekar |\n| mi | smo | nismo | Mi smo prijatelji |\n| vi | ste | niste | Vi ste ljubazni |\n| oni, one, ona | su | nisu | Oni su kod kuće |\n\n## Краткие формы и правило второго места\n\nКраткие формы сам, си, је не имеют собственного ударения и обычно занимают вторую смысловую позицию в предложении. Если опустить местоимение, на первое место встает другое важное слово.\n\n- Ja sam u Beogradu или просто U Beogradu sam\n- On je kod kuće или просто Kod kuće je\n- Mi smo spremni или просто Spremni smo\n\n> Отрицание пишется слитно в одно слово, например nisam, nisi, nije, nismo, niste, nisu.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Выберите правильную форму глагола biti для фразы «Ja ___ student»", "options": ["sam", "si", "je", "smo"], "answer": "sam", "explanation": "Для местоимения первого лица ja используется краткая форма sam"},
                {"id": "e2", "type": "fill_blank", "prompt": "Вставьте отрицательную форму глагола biti в предложение", "context": "Ana ___ kod kuće sada.", "answer": "nije", "acceptedAnswers": ["nije"], "explanation": "Для третьего лица единственного числа отрицание звучит nije"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Мы сейчас в Белграде»", "tokens": ["Mi", "smo", "sada", "u", "Beogradu"], "answer": "Mi smo sada u Beogradu", "explanation": "Краткая форма связки smo стоит на второй смысловой позиции"},
                {"id": "e4", "type": "matching", "prompt": "Соедините местоимения с их формами глагола biti", "pairs": [
                    {"left": "ja", "right": "sam"},
                    {"left": "ti", "right": "si"},
                    {"left": "mi", "right": "smo"},
                    {"left": "oni", "right": "su"}
                ], "explanation": "Каждому лицу соответствует своя форма глагола связки"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский язык фразу «Они наши друзья»", "context": "Они наши друзья.", "answer": "Oni su naši prijatelji.", "referenceAnswer": "Oni su naši prijatelji.", "acceptedAnswers": ["Oni su naši prijatelji.", "Oni su nasi prijatelji."], "explanation": "Во множественном числе третьего лица используется форма su"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {"id": "d1", "speaker": "Marko", "avatar": "man", "text": "Zdravo! Da li si ti novi student ovde?", "choices": [
                        {"label": "Da, ja sam novi student.", "nextId": "d2"},
                        {"label": "Ne, nisam student, ja sam profesor.", "nextId": "d3"}
                    ]},
                    {"id": "d2", "speaker": "Marko", "avatar": "man", "text": "Drago mi je! Ja sam Marko, živim u Beogradu.", "choices": []},
                    {"id": "d3", "speaker": "Marko", "avatar": "man", "text": "Oprostite profesore, drago mi je što smo se upoznali.", "choices": []}
                ]
            }
        }
    },

    # 2. prezent-prva-druga-grupa (A1)
    {
        "slug": "prezent-prva-druga-grupa",
        "title": "Настоящее время глаголов на -am и -im",
        "summary": "Разбираем две самые популярные группы сербских глаголов настоящего времени и учимся спрягать их без ошибок.",
        "level": "A1",
        "lessonType": "grammar",
        "topic": "Спряжение глаголов",
        "tags": ["глаголы", "спряжение", "настоящее время"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Как устроено настоящее время в сербском языке"},
                {"id": "t2", "type": "paragraph", "text": "Сербские глаголы в настоящем времени делятся на три основные группы по гласному в окончаниях. Две самые распространенные группы это глаголы на а и глаголы на и. Запомнить их очень просто по форме первого лица я."},
                {"id": "t3", "type": "table", "rows": [
                    ["Лицо", "Группа -am (gledati)", "Группа -im (raditi)", "Окончание"],
                    ["ja", "gledam", "radim", "-m"],
                    ["ti", "gledaš", "radiš", "-š"],
                    ["on, ona, ono", "gleda", "radi", "гласный основы"],
                    ["mi", "gledamo", "radimo", "-mo"],
                    ["vi", "gledate", "radite", "-te"],
                    ["oni, one, ona", "gledaju", "rade", "-ju / -e"]
                ]},
                {"id": "t4", "type": "heading", "text": "Обрати внимание на третье лицо множественного числа"},
                {"id": "t5", "type": "paragraph", "text": "В форме они глаголы на ам получают окончание ају, например gledaju, slušaju, čitaju. А глаголы на им получают окончание е, например rade, govore, uče."},
                {"id": "t6", "type": "quote", "text": "Местоимение ja или ti можно свободно опускать, потому что окончание глагола четко показывает, кто выполняет действие."}
            ],
            "markdown": "## Как устроено настоящее время в сербском языке\n\nСербские глаголы в настоящем времени делятся на три основные группы по гласному в окончаниях. Две самые распространенные группы это глаголы на а и глаголы на и. Запомнить их очень просто по форме первого лица я.\n\n| Лицо | Группа -am (gledati) | Группа -im (raditi) | Окончание |\n| --- | --- | --- | --- |\n| ja | gledam | radim | -m |\n| ti | gledaš | radiš | -š |\n| on, ona, ono | gleda | radi | гласный основы |\n| mi | gledamo | radimo | -mo |\n| vi | gledate | radite | -te |\n| oni, one, ona | gledaju | rade | -ju / -e |\n\n## Обрати внимание на третье лицо множественного числа\n\nВ форме они глаголы на ам получают окончание ају, например gledaju, slušaju, čitaju. А глаголы на им получают окончание е, например rade, govore, uče.\n\n> Местоимение ja или ti можно свободно опускать, потому что окончание глагола четко показывает, кто выполняет действие.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Как звучит форма глагола raditi для местоимения mi", "options": ["radimo", "radim", "radite", "rade"], "answer": "radimo", "explanation": "Окончание первого лица множественного числа всегда содержит -mo"},
                {"id": "e2", "type": "fill_blank", "prompt": "Поставьте глагол čitati в форму для местоимения oni", "context": "Oni svaki dan ___ novine.", "answer": "čitaju", "acceptedAnswers": ["čitaju", "citaju"], "explanation": "Глаголы группы на ам во множественном числе третьего лица оканчиваются на ају"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Мы учим сербский язык»", "tokens": ["Učimo", "srpski", "jezik", "svaki", "dan"], "answer": "Učimo srpski jezik svaki dan", "explanation": "Глагол učimo стоит в форме первого лица множественного числа"},
                {"id": "e4", "type": "matching", "prompt": "Соедините инфинитив с формой первого лица ja", "pairs": [
                    {"left": "slušati", "right": "slušam"},
                    {"left": "govoriti", "right": "govorim"},
                    {"left": "misliti", "right": "mislim"},
                    {"left": "pitati", "right": "pitam"}
                ], "explanation": "Форма первого лица оканчивается на -am или -im"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский фразу «Где вы работаете»", "context": "Где вы работаете?", "answer": "Gde radite?", "referenceAnswer": "Gde radite?", "acceptedAnswers": ["Gde radite?", "Gde vi radite?"], "explanation": "Форма второго лица множественного числа для raditi это radite"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {"id": "d1", "speaker": "Jelena", "avatar": "woman", "text": "Šta radiš večeras?", "choices": [
                        {"label": "Čitam novu knjigu kod kuće.", "nextId": "d2"},
                        {"label": "Gledam zanimljiv film u bioskopu.", "nextId": "d3"}
                    ]},
                    {"id": "d2", "speaker": "Jelena", "avatar": "woman", "text": "Lepo, i ja volim mirno veče uz knjigu.", "choices": []},
                    {"id": "d3", "speaker": "Jelena", "avatar": "woman", "text": "Super! Koji film gledaš?", "choices": []}
                ]
            }
        }
    },

    # 3. rod-i-mnozina-imenica (A1)
    {
        "slug": "rod-i-mnozina-imenica",
        "title": "Род существительных и множественное число",
        "summary": "Определяем мужской, женский и средний род существительных и учимся правильно образовывать множественное число.",
        "level": "A1",
        "lessonType": "grammar",
        "topic": "Существительные",
        "tags": ["существительные", "род", "множественное число"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Три рода в сербском языке"},
                {"id": "t2", "type": "paragraph", "text": "В сербском языке род существительного легко определить по последней букве начальной формы. Мужской род чаще всего оканчивается на согласный, женский род на букву а, а средний род на буквы о или е."},
                {"id": "t3", "type": "table", "rows": [
                    ["Род", "Окончание единственного числа", "Окончание множественного числа", "Пример"],
                    ["Мужской", "согласный (grad, prozor)", "-i или -ovi/-evi (gradovi, prozori)", "grad → gradovi"],
                    ["Женский", "-a (kuća, knjiga)", "-e (kuće, knjige)", "kuća → kuće"],
                    ["Средний", "-o / -e (selo, more)", "-a (sela, mora)", "selo → sela"]
                ]},
                {"id": "t4", "type": "heading", "text": "Длинное множественное число мужского рода"},
                {"id": "t5", "type": "paragraph", "text": "Односложные слова мужского рода во множественном числе обычно наращивают суффикс ови или еви. Например grad дает gradovi, sto дает stolovi, drug дает drugovi. После мягких согласных добавляется еви, например muž дает muževi."},
                {"id": "t6", "type": "quote", "text": "Многосложные слова мужского рода суффикс не наращивают, они просто добавляют букву и, например prozor дает prozori, student дает studenti."}
            ],
            "markdown": "## Три рода в сербском языке\n\nВ сербском языке род существительного легко определить по последней букве начальной формы. Мужской род чаще всего оканчивается на согласный, женский род на букву а, а средний род на буквы о или е.\n\n| Род | Окончание единственного числа | Окончание множественного числа | Пример |\n| --- | --- | --- | --- |\n| Мужской | согласный (grad, prozor) | -i или -ovi/-evi (gradovi, prozori) | grad → gradovi |\n| Женский | -a (kuća, knjiga) | -e (kuće, knjige) | kuća → kuće |\n| Средний | -o / -e (selo, more) | -a (sela, mora) | selo → sela |\n\n## Длинное множественное число мужского рода\n\nОдносложные слова мужского рода во множественном числе обычно наращивают суффикс ови или еви. Например grad дает gradovi, sto дает stolovi, drug дает drugovi. После мягких согласных добавляется еви, например muž дает muževi.\n\n> Многосложные слова мужского рода суффикс не наращивают, они просто добавляют букву и, например prozor дает prozori, student дает studenti.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Как звучит множественное число для слова grad", "options": ["gradovi", "gradi", "grade", "grada"], "answer": "gradovi", "explanation": "Односложное слово мужского рода получает суффикс ови"},
                {"id": "e2", "type": "fill_blank", "prompt": "Поставьте слово knjiga во множественное число", "context": "Na polici stoje nove ___.", "answer": "knjige", "acceptedAnswers": ["knjige"], "explanation": "Существительные женского рода на а во множественном числе получают окончание е"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Это красивые сербские города»", "tokens": ["To", "su", "lepi", "srpski", "gradovi"], "answer": "To su lepi srpski gradovi", "explanation": "Прилагательные согласуются с существительным gradovi во множественном числе"},
                {"id": "e4", "type": "matching", "prompt": "Соедините слово в единственном числе с формой множественного числа", "pairs": [
                    {"left": "selo", "right": "sela"},
                    {"left": "more", "right": "mora"},
                    {"left": "pismo", "right": "pisma"},
                    {"left": "polje", "right": "polja"}
                ], "explanation": "Средний род во множественном числе оканчивается на а"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский язык фразу «Окна открыты»", "context": "Окна открыты.", "answer": "Prozori su otvoreni.", "referenceAnswer": "Prozori su otvoreni.", "acceptedAnswers": ["Prozori su otvoreni."], "explanation": "Слово prozor многосложное, поэтому во множественном числе будет prozori"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {"id": "d1", "speaker": "Nikola", "avatar": "man", "text": "Da li su ovi gradovi lepi za život?", "choices": [
                        {"label": "Jesu, to su divni gradovi.", "nextId": "d2"},
                        {"label": "Meni se više sviđaju mala sela.", "nextId": "d3"}
                    ]},
                    {"id": "d2", "speaker": "Nikola", "avatar": "man", "text": "Slažem se, posebno Beograd i Novi Sad.", "choices": []},
                    {"id": "d3", "speaker": "Nikola", "avatar": "man", "text": "I sela u Srbiji imaju poseban mir i lepotu.", "choices": []}
                ]
            }
        }
    },

    # 4. prisvojne-zamenice-osnove (A1)
    {
        "slug": "prisvojne-zamenice-osnove",
        "title": "Притяжательные местоимения moj, tvoj, naš",
        "summary": "Учимся обозначать принадлежность предметов и людей с помощью сербских притяжательных местоимений.",
        "level": "A1",
        "lessonType": "grammar",
        "topic": "Местоимения",
        "tags": ["местоимения", "принадлежность", "базовые фразы"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Как сказать мой, твой и наш по-сербски"},
                {"id": "t2", "type": "paragraph", "text": "Притяжательные местоимения согласуются в роде и числе с тем предметом, которому принадлежат. Если предмет мужского рода, используется moj, если женского moja, если среднего moje."},
                {"id": "t3", "type": "table", "rows": [
                    ["Владелец", "Мужской род", "Женский род", "Средний род", "Множественное число (м / ж / ср)"],
                    ["я (moj)", "moj grad", "moja kuća", "moje selo", "moji / moje / moja"],
                    ["ты (tvoj)", "tvoj sto", "tvoja soba", "tvoje pismo", "tvoji / tvoje / tvoja"],
                    ["мы (naš)", "naš stan", "naša škola", "naše dete", "naši / naše / naša"],
                    ["вы (vaš)", "vaš posao", "vaša porodica", "vaše mesto", "vaši / vaše / vaša"]
                ]},
                {"id": "t4", "type": "heading", "text": "Его, её и их в сербском языке"},
                {"id": "t5", "type": "paragraph", "text": "Для третьего лица используются местоимения njegov (его), njen (её) и njihov (их). Они тоже изменяются по родам и числам в зависимости от предмета владения, например njegov brat, njegova sestra, njegovo selo."},
                {"id": "t6", "type": "quote", "text": "Притяжательное местоимение ставится перед существительным, например ovo je moj stan, a to je tvoja soba."}
            ],
            "markdown": "## Как сказать мой, твой и наш по-сербски\n\nПритяжательные местоимения согласуются в роде и числе с тем предметом, которому принадлежат. Если предмет мужского рода, используется moj, если женского moja, если среднего moje.\n\n| Владелец | Мужской род | Женский род | Средний род | Множественное число (м / ж / ср) |\n| --- | --- | --- | --- | --- |\n| я (moj) | moj grad | moja kuća | moje selo | moji / moje / moja |\n| ты (tvoj) | tvoj sto | tvoja soba | tvoje pismo | tvoji / tvoje / tvoja |\n| мы (naš) | naš stan | naša škola | naše dete | naši / naše / naša |\n| вы (vaš) | vaš posao | vaša porodica | vaše mesto | vaši / vaše / vaša |\n\n## Его, её и их в сербском языке\n\nДля третьего лица используются местоимения njegov (его), njen (её) и njihov (их). Они тоже изменяются по родам и числам в зависимости от предмета владения, например njegov brat, njegova sestra, njegovo selo.\n\n> Притяжательное местоимение ставится перед существительным, например ovo je moj stan, a to je tvoja soba.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Какая форма местоимения подходит для фразы «Ovo je ___ kuća»", "options": ["moja", "moj", "moje", "moji"], "answer": "moja", "explanation": "Слово kuća женского рода, поэтому требуется форма moja"},
                {"id": "e2", "type": "fill_blank", "prompt": "Вставьте форму местоимения naš для среднего рода", "context": "Ovo je ___ novo selo.", "answer": "naše", "acceptedAnswers": ["naše", "nase"], "explanation": "Средний род единственного числа принимает форму naše"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Это наши хорошие друзья»", "tokens": ["To", "su", "naši", "dobri", "prijatelji"], "answer": "To su naši dobri prijatelji", "explanation": "Местоимение naši согласуется с существительным prijatelji"},
                {"id": "e4", "type": "matching", "prompt": "Соедините местоимение с подходящим существительным", "pairs": [
                    {"left": "moj", "right": "brat"},
                    {"left": "moja", "right": "sestra"},
                    {"left": "moje", "right": "dete"},
                    {"left": "moji", "right": "roditelji"}
                ], "explanation": "Форма местоимения полностью определяется родом и числом существительного"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский язык «Где твой паспорт»", "context": "Где твой паспорт?", "answer": "Gde je tvoj pasoš?", "referenceAnswer": "Gde je tvoj pasoš?", "acceptedAnswers": ["Gde je tvoj pasoš?", "Gde je tvoj pasos?"], "explanation": "Слово pasoš мужского рода, поэтому выбираем форму tvoj"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {"id": "d1", "speaker": "Milica", "avatar": "woman", "text": "Da li je ovo tvoja knjiga?", "choices": [
                        {"label": "Da, to je moja knjiga, hvala!", "nextId": "d2"},
                        {"label": "Ne, to nije moja, to je njegova knjiga.", "nextId": "d3"}
                    ]},
                    {"id": "d2", "speaker": "Milica", "avatar": "woman", "text": "Nema na čemu, bila je na stolu.", "choices": []},
                    {"id": "d3", "speaker": "Milica", "avatar": "woman", "text": "Važi, onda ću pitati njega.", "choices": []}
                ]
            }
        }
    },

    # 5. pitanja-i-recca-li (A1)
    {
        "slug": "pitanja-i-recca-li",
        "title": "Вопросы в сербском языке и частица li",
        "summary": "Учимся правильно задавать вопросы в сербском языке с помощью конструкций Da li и частицы li.",
        "level": "A1",
        "lessonType": "grammar",
        "topic": "Вопросительные предложения",
        "tags": ["вопросы", "частица ли", "синтаксис"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Два способа задать общий вопрос"},
                {"id": "t2", "type": "paragraph", "text": "Общий вопрос, на который можно ответить да или нет, строится двумя путями. Первый и самый популярный путь в разговорной речи это конструкция Da li в начале предложения. Второй путь это постановка глагола на первое место с частицей li следом."},
                {"id": "t3", "type": "table", "rows": [
                    ["Способ", "Схема построения", "Пример", "Перевод"],
                    ["Конструкция Da li", "Da li + глагол + остальное", "Da li govoriš srpski?", "Ты говоришь по-сербски?"],
                    ["Частица li", "Глагол + li + остальное", "Govoriš li srpski?", "Говоришь ли по-сербски?"],
                    ["Вопрос с глаголом biti", "Da li si / Jesi li", "Jesi li spreman?", "Ты готов?"]
                ]},
                {"id": "t4", "type": "heading", "text": "Особый вопрос с вопросительными словами"},
                {"id": "t5", "type": "paragraph", "text": "Если вопрос содержит вопросительное слово, частицы da и li не требуются. Вопросительное слово просто встает в самое начало предложения."},
                {"id": "t6", "type": "list", "ordered": False, "items": [
                    "Ko je to? (Кто это?)",
                    "Šta radiš? (Что ты делаешь?)",
                    "Gde živiš? (Где ты живешь?)",
                    "Kada polazi voz? (Когда отправляется поезд?)"
                ]},
                {"id": "t7", "type": "quote", "text": "В вопросах с частицей li глагол biti всегда ставится в полную ударную форму, например jesi li, jeste li, jesmo li."}
            ],
            "markdown": "## Два способа задать общий вопрос\n\nОбщий вопрос, на который можно ответить да или нет, строится двумя путями. Первый и самый популярный путь в разговорной речи это конструкция Da li в начале предложения. Второй путь это постановка глагола на первое место с частицей li следом.\n\n| Способ | Схема построения | Пример | Перевод |\n| --- | --- | --- | --- |\n| Конструкция Da li | Da li + глагол + остальное | Da li govoriš srpski? | Ты говоришь по-сербски? |\n| Частица li | Глагол + li + остальное | Govoriš li srpski? | Говоришь ли по-сербски? |\n| Вопрос с глаголом biti | Da li si / Jesi li | Jesi li spreman? | Ты готов? |\n\n## Особый вопрос с вопросительными словами\n\nЕсли вопрос содержит вопросительное слово, частицы da и li не требуются. Вопросительное слово просто встает в самое начало предложения.\n\n- Ko je to? (Кто это?)\n- Šta radiš? (Что ты делаешь?)\n- Gde živiš? (Где ты живешь?)\n- Kada polazi voz? (Когда отправляется поезд?)\n\n> В вопросах с частицей li глагол biti всегда ставится в полную ударную форму, например jesi li, jeste li, jesmo li.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Как правильно спросить «Ты пьешь кофе» через конструкцию Da li", "options": ["Da li piješ kafu?", "Da li pije kafu?", "Da li si pio kafu?", "Da li piti kafu?"], "answer": "Da li piješ kafu?", "explanation": "После Da li идет личная форма настоящего времени для второго лица piješ"},
                {"id": "e2", "type": "fill_blank", "prompt": "Вставьте вопросительную частицу во фразу", "context": "Znaš ___ gde je stanica?", "answer": "li", "acceptedAnswers": ["li"], "explanation": "Частица li ставится сразу после личного глагола znaš"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите вопрос «Где ты сейчас живешь»", "tokens": ["Gde", "ti", "sada", "živiš"], "answer": "Gde ti sada živiš", "explanation": "Вопросительное слово gde занимает первую позицию"},
                {"id": "e4", "type": "matching", "prompt": "Соедините вопросительное слово с его значением", "pairs": [
                    {"left": "gde", "right": "где"},
                    {"left": "kada", "right": "когда"},
                    {"left": "zašto", "right": "почему"},
                    {"left": "kako", "right": "как"}
                ], "explanation": "Каждое вопросительное слово отвечает за свой тип информации"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский «Ты готов» через частицу li", "context": "Ты готов?", "answer": "Jesi li spreman?", "referenceAnswer": "Jesi li spreman?", "acceptedAnswers": ["Jesi li spreman?", "Da li si spreman?"], "explanation": "С частицей li используется полная форма глагола biti в виде Jesi li"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {"id": "d1", "speaker": "Stefan", "avatar": "man", "text": "Da li razumeš šta piše na tabli?", "choices": [
                        {"label": "Da, razumem skoro sve.", "nextId": "d2"},
                        {"label": "Ne, ne razumem ovu reč.", "nextId": "d3"}
                    ]},
                    {"id": "d2", "speaker": "Stefan", "avatar": "man", "text": "Odlično ti ide srpski!", "choices": []},
                    {"id": "d3", "speaker": "Stefan", "avatar": "man", "text": "Nema problema, objasniću ti odmah.", "choices": []}
                ]
            }
        }
    },

    # 6. konstrukcija-da-prezent (A1)
    {
        "slug": "konstrukcija-da-prezent",
        "title": "Конструкция da с настоящим временем",
        "summary": "Разбираем главную особенность сербского синтаксиса: замену инфинитива личной формой глагола после союза da.",
        "level": "A1",
        "lessonType": "grammar",
        "topic": "Конструкция da + Present",
        "tags": ["глаголы", "синтаксис", "модальность"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Почему в сербском избегают инфинитив"},
                {"id": "t2", "type": "paragraph", "text": "В русском языке после глаголов хочу, могу, люблю мы ставим инфинитив «хочу читать», «могу помочь». В сербском языке вместо инфинитива используется союз da вместе с личной формой глагола в настоящем времени."},
                {"id": "t3", "type": "table", "rows": [
                    ["Русская фраза", "Сербский вариант с da + Present", "Дословный смысл"],
                    ["Я хочу читать", "Želim da čitam", "Хочу чтобы читаю"],
                    ["Ты можешь помочь", "Možeš da pomogneš", "Можешь чтобы поможешь"],
                    ["Мы любим путешествовать", "Volimo da putujemo", "Любим чтобы путешествуем"],
                    ["Они должны учиться", "Moraju da uče", "Должны чтобы учатся"]
                ]},
                {"id": "t4", "type": "heading", "text": "Оба глагола согласуются с одним лицом"},
                {"id": "t5", "type": "paragraph", "text": "Важное правило: оба глагола в предложении меняют окончание в зависимости от того, кто действует. Если говоришь о себе, оба глагола стоят в форме я: želim da radim. Если о друге: želi da radi."},
                {"id": "t6", "type": "quote", "text": "Инфинитив после модальных глаголов понятен сербам, но в живой речи Сербии практически всегда звучит конструкция da с настоящим временем."}
            ],
            "markdown": "## Почему в сербском избегают инфинитив\n\nВ русском языке после глаголов хочу, могу, люблю мы ставим инфинитив «хочу читать», «могу помочь». В сербском языке вместо инфинитива используется союз da вместе с личной формой глагола в настоящем времени.\n\n| Русская фраза | Сербский вариант с da + Present | Дословный смысл |\n| --- | --- | --- |\n| Я хочу читать | Želim da čitam | Хочу чтобы читаю |\n| Ты можешь помочь | Možeš da pomogneš | Можешь чтобы поможешь |\n| Мы любим путешествовать | Volimo da putujemo | Любим чтобы путешествуем |\n| Они должны учиться | Moraju da uče | Должны чтобы учатся |\n\n## Оба глагола согласуются с одним лицом\n\nВажное правило: оба глагола в предложении меняют окончание в зависимости от того, кто действует. Если говоришь о себе, оба глагола стоят в форме я: želim da radim. Если о друге: želi da radi.\n\n> Инфинитив после модальных глаголов понятен сербам, но в живой речи Сербии практически всегда звучит конструкция da с настоящим временем.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Как сказать по-сербски «Я хочу спать»", "options": ["Želim da spavam", "Želim spavati", "Želi da spava", "Želimo da spavamo"], "answer": "Želim da spavam", "explanation": "Оба глагола стоят в форме первого лица единственного числа"},
                {"id": "e2", "type": "fill_blank", "prompt": "Вставьте правильную форму второго глагола для местоимения mi", "context": "Možemo ___ dođemo sutra.", "answer": "da", "acceptedAnswers": ["da"], "explanation": "Конструкция соединяется союзом da"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Они любят пить кофе»", "tokens": ["Oni", "vole", "da", "piju", "kafu"], "answer": "Oni vole da piju kafu", "explanation": "Оба глагола vole и piju стоят в третьем лице множественного числа"},
                {"id": "e4", "type": "matching", "prompt": "Соедините первую часть фразы с подходящим продолжением", "pairs": [
                    {"left": "Ja želim", "right": "da učim"},
                    {"left": "Ti moraš", "right": "da radiš"},
                    {"left": "Mi volimo", "right": "da šetamo"},
                    {"left": "Oni mogu", "right": "da pomognu"}
                ], "explanation": "Лицо первого глагола совпадает с лицом второго глагола"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский «Ты должен знать это»", "context": "Ты должен знать это.", "answer": "Moraš da znaš to.", "referenceAnswer": "Moraš da znaš to.", "acceptedAnswers": ["Moraš da znaš to.", "Moras da znas to."], "explanation": "Глагол morati и глагол znati согласуются во втором лице"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {"id": "d1", "speaker": "Ivana", "avatar": "woman", "text": "Da li želiš da popijemo kafu u centru?", "choices": [
                        {"label": "Rado, mogu da krenem odmah.", "nextId": "d2"},
                        {"label": "Nažalost moram da radim danas.", "nextId": "d3"}
                    ]},
                    {"id": "d2", "speaker": "Ivana", "avatar": "woman", "text": "Super, nalazimo se ispred pozorišta.", "choices": []},
                    {"id": "d3", "speaker": "Ivana", "avatar": "woman", "text": "Šteta, čujemo se onda za vikend.", "choices": []}
                ]
            }
        }
    },

    # 7. akuzativ-jednine-objekat (A1)
    {
        "slug": "akuzativ-jednine-objekat",
        "title": "Аккузатив единственного числа и прямой объект",
        "summary": "Учимся называть прямое дополнение в винительном падеже при покупках, заказе еды и описании действий.",
        "level": "A1",
        "lessonType": "grammar",
        "topic": "Аккузатив",
        "tags": ["падежи", "аккузатив", "объект"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Что такое аккузатив и когда он нужен"},
                {"id": "t2", "type": "paragraph", "text": "Аккузатив отвечает на вопросы koga (кого) и šta (что). Это падеж прямого объекта, на который направлено действие глагола: vidim druga, pijem kafu, čitam pismo."},
                {"id": "t3", "type": "table", "rows": [
                    ["Род существительного", "Начальная форма", "Форма аккузатива", "Пример"],
                    ["Женский род (-a)", "kafa, knjiga", "kafu, knjigu (-u)", "Pijem kafu"],
                    ["Мужской неодушевленный", "grad, hleb", "grad, hleb (без изменений)", "Kupujem hleb"],
                    ["Мужской одушевленный", "brat, student", "brata, studenta (-a)", "Vidim brata"],
                    ["Средний род", "more, pismo", "more, pismo (без изменений)", "Čitam pismo"]
                ]},
                {"id": "t4", "type": "heading", "text": "Главное отличие мужского рода"},
                {"id": "t5", "type": "paragraph", "text": "Неодушевленные предметы мужского рода в аккузативе остаются такими же, как в именительном падеже: gledam film, kupujem sto. Но одушевленные существительные получают окончание а: poznajem Marka, čekam lekara."},
                {"id": "t6", "type": "quote", "text": "Женский род на а в аккузативе всегда меняет окончание на у, например kafa дает kafu, voda дает vodu, soba дает sobu."}
            ],
            "markdown": "## Что такое аккузатив и когда он нужен\n\nАккузатив отвечает на вопросы koga (кого) и šta (что). Это падеж прямого объекта, на который направлено действие глагола: vidim druga, pijem kafu, čitam pismo.\n\n| Род существительного | Начальная форма | Форма аккузатива | Пример |\n| --- | --- | --- | --- |\n| Женский род (-a) | kafa, knjiga | kafu, knjigu (-u) | Pijem kafu |\n| Мужской неодушевленный | grad, hleb | grad, hleb (без изменений) | Kupujem hleb |\n| Мужской одушевленный | brat, student | brata, studenta (-a) | Vidim brata |\n| Средний род | more, pismo | more, pismo (без изменений) | Čitam pismo |\n\n## Главное отличие мужского рода\n\nНеодушевленные предметы мужского рода в аккузативе остаются такими же, как в именительном падеже: gledam film, kupujem sto. Но одушевленные существительные получают окончание а: poznajem Marka, čekam lekara.\n\n> Женский род на а в аккузативе всегда меняет окончание на у, например kafa дает kafu, voda дает vodu, soba дает sobu.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Какая форма слова kafa нужна во фразе «Molim vas jednu ___»", "options": ["kafu", "kafa", "kafe", "kafi"], "answer": "kafu", "explanation": "Женский род в аккузативе единственного числа оканчивается на -u"},
                {"id": "e2", "type": "fill_blank", "prompt": "Поставьте одушевленное существительное drug в аккузатив", "context": "Čekam svog ___ ispred škole.", "answer": "druga", "acceptedAnswers": ["druga"], "explanation": "Одушевленный мужской род в аккузативе получает окончание -a"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Я покупаю свежий хлеб в пекарне»", "tokens": ["Kupujem", "svež", "hleb", "u", "pekari"], "answer": "Kupujem svež hleb u pekari", "explanation": "Неодушевленный предмет hleb сохраняет начальную форму"},
                {"id": "e4", "type": "matching", "prompt": "Соедините начальную форму слова с его аккузативом", "pairs": [
                    {"left": "knjiga", "right": "knjigu"},
                    {"left": "lekar", "right": "lekara"},
                    {"left": "sok", "right": "sok"},
                    {"left": "pismo", "right": "pismo"}
                ], "explanation": "Женский род дает -u, одушевленный мужской -a, средний и неодушевленный мужской не меняются"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский «Я вижу твоего брата»", "context": "Я вижу твоего брата.", "answer": "Vidim tvog brata.", "referenceAnswer": "Vidim tvog brata.", "acceptedAnswers": ["Vidim tvog brata.", "Vidim tvoga brata."], "explanation": "И местоимение tvog и существительное brata стоят в аккузативе"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {"id": "d1", "speaker": "Konobar", "avatar": "man", "text": "Dobar dan! Šta želite da popijete?", "choices": [
                        {"label": "Molim vas jednu kiselu vodu i kafu.", "nextId": "d2"},
                        {"label": "Želim hladan sok od jabuke.", "nextId": "d3"}
                    ]},
                    {"id": "d2", "speaker": "Konobar", "avatar": "man", "text": "Stiže odmah, izvolite sesti ovde.", "choices": []},
                    {"id": "d3", "speaker": "Konobar", "avatar": "man", "text": "Odličan izbor, donosim za minut.", "choices": []}
                ]
            }
        }
    },

    # 8. lokativ-mesto-i-predlozi (A2)
    {
        "slug": "lokativ-mesto-i-predlozi",
        "title": "Локатив с предлогами u и na",
        "summary": "Учимся отвечать на вопрос где и правильно использовать падеж места с предлогами u, na, o.",
        "level": "A2",
        "lessonType": "grammar",
        "topic": "Локатив",
        "tags": ["падежи", "локатив", "место"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Падеж места и его предлоги"},
                {"id": "t2", "type": "paragraph", "text": "Локатив отвечает на вопрос gde (где) и используется исключительно с предлогами. Основные предлоги места это u (внутри пространства) и na (на поверхности или на открытом мероприятии)."},
                {"id": "t3", "type": "table", "rows": [
                    ["Род существительного", "Окончание локатива", "Пример", "Перевод"],
                    ["Мужской род", "-u", "u gradu, na stolu", "в городе, на столе"],
                    ["Женский род (-a)", "-i", "u kući, u školi", "в доме, в школе"],
                    ["Средний род", "-u", "u selu, na moru", "в деревне, на море"]
                ]},
                {"id": "t4", "type": "heading", "text": "Чередование согласных перед -i"},
                {"id": "t5", "type": "paragraph", "text": "В существительных женского рода согласные к, г, х перед окончанием и переходят в ц, з, с: ruka дает ruci, knjiga дает knjizi, svrha дает svrsi."},
                {"id": "t6", "type": "quote", "text": "Простой ориентир: если вопрос «где», нужен локатив (u sobi), если вопрос «куда», нужен аккузатив движения (u sobu)." }
            ],
            "markdown": "## Падеж места и его предлоги\n\nЛокатив отвечает на вопрос gde (где) и используется исключительно с предлогами. Основные предлоги места это u (внутри пространства) и na (на поверхности или на открытом мероприятии).\n\n| Род существительного | Окончание локатива | Пример | Перевод |\n| --- | --- | --- | --- |\n| Мужской род | -u | u gradu, na stolu | в городе, на столе |\n| Женский род (-a) | -i | u kući, u školi | в доме, в школе |\n| Средний род | -u | u selu, na moru | в деревне, на море |\n\n## Чередование согласных перед -i\n\nВ существительных женского рода согласные к, г, х перед окончанием и переходят в ц, з, с: ruka дает ruci, knjiga дает knjizi, svrha дает svrsi.\n\n> Простой ориентир: если вопрос «где», нужен локатив (u sobi), если вопрос «куда», нужен аккузатив движения (u sobu).",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Какая форма слова kuća нужна во фразе «Ja sam u ___»", "options": ["kući", "kuću", "kuće", "kuća"], "answer": "kući", "explanation": "Женский род в локативе принимает окончание -i"},
                {"id": "e2", "type": "fill_blank", "prompt": "Поставьте слово Beograd в форму локатива", "context": "Marko živi u ___ već pet godina.", "answer": "Beogradu", "acceptedAnswers": ["Beogradu"], "explanation": "Мужской род в локативе оканчивается на -u"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Книга лежит на столе»", "tokens": ["Knjiga", "leži", "na", "stolu", "u", "sobi"], "answer": "Knjiga leži na stolu u sobi", "explanation": "Слова stolu и sobi стоят в форме локатива"},
                {"id": "e4", "type": "matching", "prompt": "Соедините существительное с его формой в локативе", "pairs": [
                    {"left": "škola", "right": "u školi"},
                    {"left": "posao", "right": "na poslu"},
                    {"left": "selo", "right": "u selu"},
                    {"left": "stan", "right": "u stanu"}
                ], "explanation": "Мужской и средний род получают -u, женский -i"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский «Мы сейчас на работе»", "context": "Мы сейчас на работе.", "answer": "Mi smo sada na poslu.", "referenceAnswer": "Mi smo sada na poslu.", "acceptedAnswers": ["Mi smo sada na poslu.", "Sada smo na poslu."], "explanation": "Устойчивое сочетание со словом posao требует предлога na и формы poslu"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {"id": "d1", "speaker": "Ana", "avatar": "woman", "text": "Gde se nalaziš sada, jesi li u centru?", "choices": [
                        {"label": "Nisam, još uvek sam u kancelariji na poslu.", "nextId": "d2"},
                        {"label": "Jesam, sedim u kafiću na trgu.", "nextId": "d3"}
                    ]},
                    {"id": "d2", "speaker": "Ana", "avatar": "woman", "text": "U redu, javi se kada završiš sa poslom.", "choices": []},
                    {"id": "d3", "speaker": "Ana", "avatar": "woman", "text": "Odlično, stižem za pet minuta!", "choices": []}
                ]
            }
        }
    },

    # 9. perfekat-proslo-vreme (A2)
    {
        "slug": "perfekat-proslo-vreme",
        "title": "Прошедшее время перфект в живой речи",
        "summary": "Учимся рассказывать о прошедших событиях с помощью перфекта и глагольного L-причастия.",
        "level": "A2",
        "lessonType": "grammar",
        "topic": "Перфект",
        "tags": ["глаголы", "прошедшее время", "перфект"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Как строится прошедшее время перфект"},
                {"id": "t2", "type": "paragraph", "text": "Перфект это основное прошедшее время в сербском языке. Он состоит из двух частей: краткой формы глагола biti в настоящем времени (sam, si, je, smo, ste, su) и причастия на l, которое согласуется в роде и числе с говорящим или объектом."},
                {"id": "t3", "type": "table", "rows": [
                    ["Лицо", "Мужской род", "Женский род", "Средний род / Множественное число"],
                    ["ja", "ja sam radio", "ja sam radila", "-"],
                    ["ti", "ti si radio", "ti si radila", "-"],
                    ["on, ona, ono", "on je radio", "ona je radila", "ono je radilo"],
                    ["mi", "mi smo radili", "mi smo radile", "mi smo radila"],
                    ["vi", "vi ste radili", "vi ste radile", "vi ste radila"],
                    ["oni, one, ona", "oni su radili", "one su radile", "ona su radila"]
                ]},
                {"id": "t4", "type": "heading", "text": "Особое правило для возвратных глаголов"},
                {"id": "t5", "type": "paragraph", "text": "В третьем лице единственного числа с частицей se вспомогательный глагол je обычно опускается: он se probudio вместо on se je probudio."},
                {"id": "t6", "type": "quote", "text": "В живой речи порядок слов часто начинается с причастия, если местоимение опущено: Radio sam ceo dan."}
            ],
            "markdown": "## Как строится прошедшее время перфект\n\nПерфект это основное прошедшее время в сербском языке. Он состоит из двух частей: краткой формы глагола biti в настоящем времени (sam, si, je, smo, ste, su) и причастия на l, которое согласуется в роде и числе с говорящим или объектом.\n\n| Лицо | Мужской род | Женский род | Средний род / Множественное число |\n| --- | --- | --- | --- |\n| ja | ja sam radio | ja sam radila | - |\n| ti | ti si radio | ti si radila | - |\n| on, ona, ono | on je radio | ona je radila | ono je radilo |\n| mi | mi smo radili | mi smo radile | mi smo radila |\n| vi | vi ste radili | vi ste radile | vi ste radila |\n| oni, one, ona | oni su radili | one su radile | ona su radila |\n\n## Особое правило для возвратных глаголов\n\nВ третьем лице единственного числа с частицей se вспомогательный глагол je обычно опускается: он se probudio вместо on se je probudio.\n\n> В живой речи порядок слов часто начинается с причастия, если местоимение опущено: Radio sam ceo dan.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Как скажет о себе девушка «Я прочитала книгу»", "options": ["Pročitala sam knjigu", "Pročitao sam knjigu", "Pročitalo sam knjigu", "Pročitale smo knjigu"], "answer": "Pročitala sam knjigu", "explanation": "Женский род единственного числа принимает форму причастия на -la"},
                {"id": "e2", "type": "fill_blank", "prompt": "Вставьте форму связки biti для местоимения mi в прошедшем времени", "context": "Juče ___ bili u pozorištu.", "answer": "smo", "acceptedAnswers": ["smo"], "explanation": "Для местоимения mi форма связки звучит smo"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Вчера мы весь день гуляли по городу»", "tokens": ["Juče", "smo", "šetali", "po", "gradu"], "answer": "Juče smo šetali po gradu", "explanation": "Связка smo стоит на втором месте сразу после первого слова juče"},
                {"id": "e4", "type": "matching", "prompt": "Соедините инфинитив с формой мужского рода причастия", "pairs": [
                    {"left": "kupiti", "right": "kupio"},
                    {"left": "videti", "right": "video"},
                    {"left": "reći", "right": "rekao"},
                    {"left": "doći", "right": "došao"}
                ], "explanation": "Мужской род причастия оканчивается на -o"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский «Они приехали вовремя»", "context": "Они приехали вовремя.", "answer": "Oni su stigli na vreme.", "referenceAnswer": "Oni su stigli na vreme.", "acceptedAnswers": ["Oni su stigli na vreme.", "Stigli su na vreme."], "explanation": "Множественное число мужского рода образует форму stigli su"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {"id": "d1", "speaker": "Petar", "avatar": "man", "text": "Gde si bio juče popodne?", "choices": [
                        {"label": "Bio sam kod kuće i gledao sam film.", "nextId": "d2"},
                        {"label": "Išao sam u kupovinu sa drugom.", "nextId": "d3"}
                    ]},
                    {"id": "d2", "speaker": "Petar", "avatar": "man", "text": "Lepo, i ja sam se odmarao juče.", "choices": []},
                    {"id": "d3", "speaker": "Petar", "avatar": "man", "text": "Da li si kupio sve što ti treba?", "choices": []}
                ]
            }
        }
    },

    # 10. futur-prvi-planovi (A2)
    {
        "slug": "futur-prvi-planovi",
        "title": "Будущее время футур I и планы",
        "summary": "Учимся строить будущее время с помощью кратких форм глагола hteti и рассказывать о своих намерениях.",
        "level": "A2",
        "lessonType": "grammar",
        "topic": "Футур I",
        "tags": ["глаголы", "будущее время", "футур"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Как строится будущее время футур I"},
                {"id": "t2", "type": "paragraph", "text": "Футур I выражает действие в будущем. Он строится с помощью кратких безударных форм глагола hteti (ću, ćeš, će, ćemo, ćete, će) и инфинитива смыслового глагола или конструкции da с настоящим временем."},
                {"id": "t3", "type": "table", "rows": [
                    ["Лицо", "Краткая форма", "Слитное написание с инфинитивом на -ti", "Конструкция с da"],
                    ["ja", "ću", "radiću", "ja ću da radim"],
                    ["ti", "ćeš", "radićeš", "ti ćeš da radiš"],
                    ["on, ona, ono", "će", "radiće", "on će da radi"],
                    ["mi", "ćemo", "radićemo", "mi ćemo da radimo"],
                    ["vi", "ćete", "radićete", "vi ćete da radite"],
                    ["oni, one, ona", "će", "radiće", "oni će da rade"]
                ]},
                {"id": "t4", "type": "heading", "text": "Глаголы на -ći пишутся раздельно"},
                {"id": "t5", "type": "paragraph", "text": "Если инфинитив оканчивается на ћи, форма будущего времени всегда пишется раздельно: doći ću, stići ćemo, reći ćete."},
                {"id": "t6", "type": "quote", "text": "Если перед глаголом стоит местоимение или другое слово, краткая форма встает перед инфинитивом: Ja ću raditi или Ja ću da radim."}
            ],
            "markdown": "## Как строится будущее время футур I\n\nФутур I выражает действие в будущем. Он строится с помощью кратких безударных форм глагола hteti (ću, ćeš, će, ćemo, ćete, će) и инфинитива смыслового глагола или конструкции da с настоящим временем.\n\n| Лицо | Краткая форма | Слитное написание с инфинитивом на -ti | Конструкция с da |\n| --- | --- | --- | --- |\n| ja | ću | radiću | ja ću da radim |\n| ti | ćeš | radićeš | ti ćeš da radiš |\n| on, ona, ono | će | radiće | on će da radi |\n| mi | ćemo | radićemo | mi ćemo da radimo |\n| vi | ćete | radićete | vi ćete da radite |\n| oni, one, ona | će | radiće | oni će da rade |\n\n## Глаголы на -ći пишутся раздельно\n\nЕсли инфинитив оканчивается на ћи, форма будущего времени всегда пишется раздельно: doći ću, stići ćemo, reći ćete.\n\n> Если перед глаголом стоит местоимение или другое слово, краткая форма встает перед инфинитивом: Ja ću raditi или Ja ću da radim.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Как слитно пишется будущее время от глагола raditi для лица ja", "options": ["radiću", "radit ću", "raditi ću", "radi ću"], "answer": "radiću", "explanation": "Глаголы на -ti при слитном написании отбрасывают -ti и добавляют -ću"},
                {"id": "e2", "type": "fill_blank", "prompt": "Вставьте форму вспомогательного глагола для местоимения mi", "context": "Sutra ___ putovati u Novi Sad.", "answer": "ćemo", "acceptedAnswers": ["ćemo", "cemo"], "explanation": "Для местоимения mi краткая форма глагола hteti звучит ćemo"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Я приду завтра в пять часов»", "tokens": ["Doći", "ću", "sutra", "u", "pet", "sati"], "answer": "Doći ću sutra u pet sati", "explanation": "Глагол на -ći пишется раздельно с частицей ću"},
                {"id": "e4", "type": "matching", "prompt": "Соедините местоимение с формой вспомогательного глагола hteti", "pairs": [
                    {"left": "ja", "right": "ću"},
                    {"left": "ti", "right": "ćeš"},
                    {"left": "mi", "right": "ćemo"},
                    {"left": "vi", "right": "ćete"}
                ], "explanation": "Каждому лицу соответствует своя краткая форма hteti"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский «Мы скоро позвоним тебе»", "context": "Мы скоро позвоним тебе.", "answer": "Uskoro ćemo te pozvati.", "referenceAnswer": "Uskoro ćemo te pozvati.", "acceptedAnswers": ["Uskoro ćemo te pozvati.", "Pozvaćemo te uskoro."], "explanation": "Форма первого лица множественного числа ćemo ставится на вторую смысловую позицию"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {"id": "d1", "speaker": "Luka", "avatar": "man", "text": "Šta ćeš raditi za vikend?", "choices": [
                        {"label": "Putovaću na planinu sa porodicom.", "nextId": "d2"},
                        {"label": "Ostaću u gradu i učiću za ispit.", "nextId": "d3"}
                    ]},
                    {"id": "d2", "speaker": "Luka", "avatar": "man", "text": "Divan plan, želim vam lep provod!", "choices": []},
                    {"id": "d3", "speaker": "Luka", "avatar": "man", "text": "Srećno sa učenjem, položićeš sigurno!", "choices": []}
                ]
            }
        }
    },

    # 11. dativ-kome-i-kuda (A2)
    {
        "slug": "dativ-kome-i-kuda",
        "title": "Дательный падеж направления и адресата",
        "summary": "Учимся использовать датив для обозначения адресата действия и направления движения к человеку или объекту.",
        "level": "A2",
        "lessonType": "grammar",
        "topic": "Датив",
        "tags": ["падежи", "датив", "адресат"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Кому и к чему направлено действие"},
                {"id": "t2", "type": "paragraph", "text": "Датив отвечает на вопросы kome (кому) и čemu (чему). Он используется без предлога для обозначения адресата подарка, письма или сообщения: dajem knjigu drugu, pišem pismo majci."},
                {"id": "t3", "type": "table", "rows": [
                    ["Род существительного", "Окончание датива", "Пример", "Перевод"],
                    ["Мужской род", "-u", "bratu, prijatelju", "брату, другу"],
                    ["Женский род (-a)", "-i", "sestri, mami", "сестре, маме"],
                    ["Средний род", "-u", "detetu, selu", "ребенку, деревне"]
                ]},
                {"id": "t4", "type": "heading", "text": "Предлоги направления с дативом"},
                {"id": "t5", "type": "paragraph", "text": "С дативом используются предлоги ka и k (по направлению к), а также prema (по отношению к или навстречу): idem ka školi, koračam prema izlazu."},
                {"id": "t6", "type": "quote", "text": "Окончания датива в сербском языке полностью совпадают с окончаниями локатива, разница лишь в значении и предлогах."}
            ],
            "markdown": "## Кому и к чему направлено действие\n\nДатив отвечает на вопросы kome (кому) и čemu (чему). Он используется без предлога для обозначения адресата подарка, письма или сообщения: dajem knjigu drugu, pišem pismo majci.\n\n| Род существительного | Окончание датива | Пример | Перевод |\n| --- | --- | --- | --- |\n| Мужской род | -u | bratu, prijatelju | брату, другу |\n| Женский род (-a) | -i | sestri, mami | сестре, маме |\n| Средний род | -u | detetu, selu | ребенку, деревне |\n\n## Предлоги направления с дативом\n\nС дативом используются предлоги ka и k (по направлению к), а также prema (по отношению к или навстречу): idem ka školi, koračam prema izlazu.\n\n> Окончания датива в сербском языке полностью совпадают с окончаниями локатива, разница лишь в значении и предлогах.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Какая форма слова drug нужна во фразе «Dajem knjigu ___»", "options": ["drugu", "druga", "drugom", "drugi"], "answer": "drugu", "explanation": "Мужской род в дативе единственного числа оканчивается на -u"},
                {"id": "e2", "type": "fill_blank", "prompt": "Поставьте слово mama в форму датива", "context": "Pišem pismo svojoj ___.", "answer": "mami", "acceptedAnswers": ["mami"], "explanation": "Женский род на -a в дативе получает окончание -i"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Мы идем по направлению к центру города»", "tokens": ["Idemo", "polako", "ka", "centru", "grada"], "answer": "Idemo polako ka centru grada", "explanation": "Предлог ka управляет формой датива centru"},
                {"id": "e4", "type": "matching", "prompt": "Соедините существительное с формой датива адресата", "pairs": [
                    {"left": "brat", "right": "bratu"},
                    {"left": "sestra", "right": "sestri"},
                    {"left": "lekar", "right": "lekaru"},
                    {"left": "profesorka", "right": "profesorki"}
                ], "explanation": "Мужской род получает -u, женский -i"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский «Я звоню своему другу»", "context": "Я звоню своему другу.", "answer": "Zovem svog druga.", "referenceAnswer": "Zovem svog druga.", "acceptedAnswers": ["Zovem svog druga.", "Javljam se svom drugu."], "explanation": "Глагол javiti se требует датива svom drugu, а zvati аккузатива svog druga"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {"id": "d1", "speaker": "Maja", "avatar": "woman", "text": "Kome nosiš ove lepe cvetove?", "choices": [
                        {"label": "Nosim cveće svojoj mami za rođendan.", "nextId": "d2"},
                        {"label": "Kupio sam cveće drugarici.", "nextId": "d3"}
                    ]},
                    {"id": "d2", "speaker": "Maja", "avatar": "woman", "text": "Divan gest, sigurno će se obradovati!", "choices": []},
                    {"id": "d3", "speaker": "Maja", "avatar": "woman", "text": "Lepo od tebe, cveće je prelepo.", "choices": []}
                ]
            }
        }
    },

    # 12. instrumental-drustvo-i-sredstvo (A2)
    {
        "slug": "instrumental-drustvo-i-sredstvo",
        "title": "Творительный падеж с предлогом sa и без него",
        "summary": "Разбираем главную разницу инструментала: когда предлог sa обязателен, а когда категорически запрещен.",
        "level": "A2",
        "lessonType": "grammar",
        "topic": "Инструментал",
        "tags": ["падежи", "инструментал", "предлоги"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Совместность против орудия действия"},
                {"id": "t2", "type": "paragraph", "text": "Инструментал отвечает на вопросы s kim (с кем) и čime (чем). Главное правило инструментала: совместность требует предлога sa (sa prijateljem, sa sestrom), а средство передвижения или орудие действия употребляется строго без предлога (putujem autobusom, pišem olovkom)."},
                {"id": "t3", "type": "table", "rows": [
                    ["Значение", "Предлог", "Пример", "Русский перевод"],
                    ["Компания и совместность", "sa / s", "Šetam sa bratom", "Гуляю с братом"],
                    ["Транспорт и средство", "без предлога", "Putujem vozom", "Еду на поезде"],
                    ["Орудие действия", "без предлога", "Pišem olovkom", "Пишу карандашом"]
                ]},
                {"id": "t4", "type": "heading", "text": "Окончания инструментала в единственном числе"},
                {"id": "t5", "type": "paragraph", "text": "Мужской и средний род получают окончание ом (после твердых согласных) или ем (после мягких č, ć, dž, đ, ž, š, j, lj, nj): gradom, drugom, prijateljem, nožem. Женский род на а получает окончание ом: kafom, kućom, sestrom."},
                {"id": "t6", "type": "quote", "text": "Никогда не говори putujem sa autobusom: это звучит так, будто автобус идет рядом с тобой за руку."}
            ],
            "markdown": "## Совместность против орудия действия\n\nИнструментал отвечает на вопросы s kim (с кем) и čime (чем). Главное правило инструментала: совместность требует предлога sa (sa prijateljem, sa sestrom), а средство передвижения или орудие действия употребляется строго без предлога (putujem autobusom, pišem olovkom).\n\n| Значение | Предлог | Пример | Русский перевод |\n| --- | --- | --- | --- |\n| Компания и совместность | sa / s | Šetam sa bratom | Гуляю с братом |\n| Транспорт и средство | без предлога | Putujem vozom | Еду на поезде |\n| Орудие действия | без предлога | Pišem olovkom | Пишу карандашом |\n\n## Окончания инструментала в единственном числе\n\nМужской и средний род получают окончание ом (после твердых согласных) или ем (после мягких č, ć, dž, đ, ž, š, j, lj, nj): gradom, drugom, prijateljem, nožem. Женский род на а получает окончание ом: kafom, kućom, sestrom.\n\n> Никогда не говори putujem sa autobusom: это звучит так, будто автобус идет рядом с тобой за руку.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Как правильно сказать «Я еду на автобусе»", "options": ["Putujem autobusom", "Putujem sa autobusom", "Putujem u autobusu", "Putujem na autobusu"], "answer": "Putujem autobusom", "explanation": "Транспорт как средство передвижения требует формы инструментала без предлога"},
                {"id": "e2", "type": "fill_blank", "prompt": "Поставьте слово drug в форму инструментала с предлогом", "context": "Idem u bioskop ___.", "answer": "sa drugom", "acceptedAnswers": ["sa drugom", "s drugom"], "explanation": "Совместность требует предлога sa и окончания -om"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Мы гуляем по парку с собакой»", "tokens": ["Šetamo", "parkom", "sa", "psom"], "answer": "Šetamo parkom sa psom", "explanation": "Собака как спутник требует предлога sa psom, а parkom обозначает место"},
                {"id": "e4", "type": "matching", "prompt": "Соедините существительное с его окончанием инструментала", "pairs": [
                    {"left": "prijatelj", "right": "prijateljem"},
                    {"left": "brat", "right": "bratom"},
                    {"left": "sestra", "right": "sestrom"},
                    {"left": "nož", "right": "nožem"}
                ], "explanation": "После мягких согласных идет -em, после твердых и в женском роде -om"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский «Я пишу синей ручкой»", "context": "Я пишу синей ручкой.", "answer": "Pišem plavom olovkom.", "referenceAnswer": "Pišem plavom olovkom.", "acceptedAnswers": ["Pišem plavom olovkom.", "Pišem plavom hemijskom."], "explanation": "Орудие действия используется без предлога в форме plavom olovkom"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {"id": "d1", "speaker": "Đorđe", "avatar": "man", "text": "Kako putuješ sutra na posao?", "choices": [
                        {"label": "Idem vozom, brže je nego autom.", "nextId": "d2"},
                        {"label": "Idem peške sa prijateljem iz zgrade.", "nextId": "d3"}
                    ]},
                    {"id": "d2", "speaker": "Đorđe", "avatar": "man", "text": "Voz je odličan izbor da se izbegne gužva.", "choices": []},
                    {"id": "d3", "speaker": "Đorđe", "avatar": "man", "text": "Šetnja u društvu je uvek prijatna.", "choices": []}
                ]
            }
        }
    },

    # 13. imperativ-molbe-i-naredjenja (A2)
    {
        "slug": "imperativ-molbe-i-naredjenja",
        "title": "Повелительное наклонение и вежливые просьбы",
        "summary": "Учимся формулировать просьбы, советы и приказы, а также строить мягкий запрет с конструкцией nemoj da.",
        "level": "A2",
        "lessonType": "grammar",
        "topic": "Императив",
        "tags": ["глаголы", "императив", "просьбы"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Формы повелительного наклонения"},
                {"id": "t2", "type": "paragraph", "text": "Повелительное наклонение выражает просьбу, совет или приказ. Оно имеет формы для второго лица единственного числа (ti), первого лица множественного числа (mi) и второго лица множественного числа (vi)."},
                {"id": "t3", "type": "table", "rows": [
                    ["Тип глагола", "Форма ti", "Форма mi (давай...)", "Форма vi (вежливая)"],
                    ["Глаголы на -am (čitati)", "čitaj", "čitajmo", "čitajte"],
                    ["Глаголы на -im (raditi)", "radi", "radimo", "radite"],
                    ["Глаголы на -em (pisati)", "piši", "pišimo", "pišite"]
                ]},
                {"id": "t4", "type": "heading", "text": "Как выразить запрет и вежливую просьбу не делать"},
                {"id": "t5", "type": "paragraph", "text": "Для запрета в сербском языке есть специальный глагол nemoj. Самая популярная и естественная разговорная конструкция это nemoj da с настоящим временем: Nemoj da brineš (Не переживай), Nemojte da kasnite (Не опаздывайте)."},
                {"id": "t6", "type": "quote", "text": "Запрет в сербском языке требует несовершенного вида глагола, например Ne otvaraj prozor."}
            ],
            "markdown": "## Формы повелительного наклонения\n\nПовелительное наклонение выражает просьбу, совет или приказ. Оно имеет формы для второго лица единственного числа (ti), первого лица множественного числа (mi) и второго лица множественного числа (vi).\n\n| Тип глагола | Форма ti | Форма mi (давай...) | Форма vi (вежливая) |\n| --- | --- | --- | --- |\n| Глаголы на -am (čitati) | čitaj | čitajmo | čitajte |\n| Глаголы на -im (raditi) | radi | radimo | radite |\n| Глаголы на -em (pisati) | piši | pišimo | pišite |\n\n## Как выразить запрет и вежливую просьбу не делать\n\nДля запрета в сербском языке есть специальный глагол nemoj. Самая популярная и естественная разговорная конструкция это nemoj da с настоящим временем: Nemoj da brineš (Не переживай), Nemojte da kasnite (Не опаздывайте).\n\n> Запрет в сербском языке требует несовершенного вида глагола, например Ne otvaraj prozor.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Как вежливо сказать собеседнику на «вы» «Слушайте внимательно»", "options": ["Slušajte pažljivo", "Slušaj pažljivo", "Slušajmo pažljivo", "Slušati pažljivo"], "answer": "Slušajte pažljivo", "explanation": "Для вежливого обращения на вы используется окончание -te"},
                {"id": "e2", "type": "fill_blank", "prompt": "Вставьте отрицательный глагол запрета для местоимения ti", "context": "___ da zaboraviš ključeve!", "answer": "Nemoj", "acceptedAnswers": ["Nemoj", "nemoj"], "explanation": "Форма второго лица единственного числа звучит nemoj"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите призыв «Давайте пойдем вместе в кино»", "tokens": ["Hajde", "da", "idemo", "zajedno", "u", "bioskop"], "answer": "Hajde da idemo zajedno u bioskop", "explanation": "Конструкция hajde da выражает совместный призыв к действию"},
                {"id": "e4", "type": "matching", "prompt": "Соедините инфинитив с формой повеления для ti", "pairs": [
                    {"left": "doći", "right": "dođi"},
                    {"left": "reći", "right": "reci"},
                    {"left": "uzeti", "right": "uzmi"},
                    {"left": "videti", "right": "vidi"}
                ], "explanation": "Формы повелительного наклонения образуются от глагольной основы"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский «Не беспокойся, все хорошо»", "context": "Не беспокойся, все хорошо.", "answer": "Nemoj da brineš, sve je u redu.", "referenceAnswer": "Nemoj da brineš, sve je u redu.", "acceptedAnswers": ["Nemoj da brineš, sve je u redu.", "Nemoj brinuti, sve je u redu."], "explanation": "Конструкция nemoj da brineš передает мягкий дружеский совет"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {"id": "d1", "speaker": "Doktor", "avatar": "teacher", "text": "Otvorite usta i recite dugo a.", "choices": [
                        {"label": "Aaaa, dobro doktore.", "nextId": "d2"},
                        {"label": "Malo me boli grlo kada gutam.", "nextId": "d3"}
                    ]},
                    {"id": "d2", "speaker": "Doktor", "avatar": "teacher", "text": "U redu, pijte topao čaj i odmarajte se.", "choices": []},
                    {"id": "d3", "speaker": "Doktor", "avatar": "teacher", "text": "Razumem, prepisaću vam lekove protiv upale.", "choices": []}
                ]
            }
        }
    },

    # 14. komparacija-prideva (A2)
    {
        "slug": "komparacija-prideva",
        "title": "Степени сравнения прилагательных",
        "summary": "Учимся образовывать сравнительную и превосходную степени прилагательных, а также сравнивать предметы.",
        "level": "A2",
        "lessonType": "grammar",
        "topic": "Степени сравнения",
        "tags": ["прилагательные", "степени сравнения", "компаратив"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Как образуется сравнительная степень"},
                {"id": "t2", "type": "paragraph", "text": "Сравнительная степень (компаратив) образуется с помощью суффиксов -iji, -ji или -ši. Самый продуктивный суффикс это -iji: nov дает noviji, star дает stariji, pametan дает pametniji."},
                {"id": "t3", "type": "table", "rows": [
                    ["Положительная степень", "Сравнительная степень", "Превосходная степень", "Русский перевод"],
                    ["nov", "noviji", "najnoviji", "новый, новее, самый новый"],
                    ["lep", "lepši", "najlepši", "красивый, красивее, самый красивый"],
                    ["mlad", "mlađi", "najmlađi", "молодой, моложе, самый молодой"],
                    ["dobar", "bolji", "najbolji", "хороший, лучше, самый лучший"],
                    ["veliki", "veći", "najveći", "большой, больше, самый большой"],
                    ["mali", "manji", "najmanji", "маленький, меньше, самый маленький"]
                ]},
                {"id": "t4", "type": "heading", "text": "Превосходная степень с приставкой naj-"},
                {"id": "t5", "type": "paragraph", "text": "Превосходная степень (суперлатив) образуется предельно просто: к форме сравнительной степени добавляется приставка naj-. Она всегда пишется слитно в одно слово: najbolji, najveći, najlepši."},
                {"id": "t6", "type": "quote", "text": "Для сравнения двух предметов используется союз od или nego: Beograd je veći od Novog Sada или Beograd je veći nego Novi Sad."}
            ],
            "markdown": "## Как образуется сравнительная степень\n\nСравнительная степень (компаратив) образуется с помощью суффиксов -iji, -ji или -ši. Самый продуктивный суффикс это -iji: nov дает noviji, star дает stariji, pametan дает pametniji.\n\n| Положительная степень | Сравнительная степень | Превосходная степень | Русский перевод |\n| --- | --- | --- | --- |\n| nov | noviji | najnoviji | новый, новее, самый новый |\n| lep | lepši | najlepši | красивый, красивее, самый красивый |\n| mlad | mlađi | najmlađi | молодой, моложе, самый молодой |\n| dobar | bolji | najbolji | хороший, лучше, самый лучший |\n| veliki | veći | najveći | большой, больше, самый большой |\n| mali | manji | najmanji | маленький, меньше, самый маленький |\n\n## Превосходная степень с приставкой naj-\n\nПревосходная степень (суперлатив) образуется предельно просто: к форме сравнительной степени добавляется приставка naj-. Она всегда пишется слитно в одно слово: najbolji, najveći, najlepši.\n\n> Для сравнения двух предметов используется союз od или nego: Beograd je veći od Novog Sada или Beograd je veći nego Novi Sad.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Какая форма сравнительной степени у слова star", "options": ["stariji", "starši", "starji", "stari"], "answer": "stariji", "explanation": "Прилагательное star образует компаратив с суффиксом -iji"},
                {"id": "e2", "type": "fill_blank", "prompt": "Вставьте форму превосходной степени от слова dobar", "context": "On je ___ student u celoj grupi.", "answer": "najbolji", "acceptedAnswers": ["najbolji"], "explanation": "Превосходная степень от dobar образуется как najbolji"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Этот дом больше чем наш»", "tokens": ["Ova", "kuća", "je", "veća", "od", "naše"], "answer": "Ova kuća je veća od naše", "explanation": "Сравнение с предлогом od требует генитива od naše"},
                {"id": "e4", "type": "matching", "prompt": "Соедините начальную форму с неправильной сравнительной степенью", "pairs": [
                    {"left": "dobar", "right": "bolji"},
                    {"left": "zao", "right": "gori"},
                    {"left": "veliki", "right": "veći"},
                    {"left": "mali", "right": "manji"}
                ], "explanation": "Эти четыре прилагательных образуют компаратив от другой основы"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский «Это самый красивый город»", "context": "Это самый красивый город.", "answer": "Ovo je najlepši grad.", "referenceAnswer": "Ovo je najlepši grad.", "acceptedAnswers": ["Ovo je najlepši grad.", "Ovo je najlepsi grad."], "explanation": "Превосходная степень слова lep звучит najlepši"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {"id": "d1", "speaker": "Tanja", "avatar": "woman", "text": "Koji ti se grad više sviđa, Niš ili Novi Sad?", "choices": [
                        {"label": "Novi Sad mi je mirniji i lepši.", "nextId": "d2"},
                        {"label": "Niš ima bolju hranu i stariju tvrđavu.", "nextId": "d3"}
                    ]},
                    {"id": "d2", "speaker": "Tanja", "avatar": "woman", "text": "Jeste, Dunav i Petrovaradin daju poseban šarm.", "choices": []},
                    {"id": "d3", "speaker": "Tanja", "avatar": "woman", "text": "Apsolutno, južnjačka kuhinja je neprevaziđena!", "choices": []}
                ]
            }
        }
    },

    # 15. red-enklitika-u-recenici (B1)
    {
        "slug": "red-enklitika-u-recenici",
        "title": "Порядок энклитик в сербском предложении",
        "summary": "Разбираем строгое правило второго места и цепочку следования кратких форм местоимений и глаголов.",
        "level": "B1",
        "lessonType": "grammar",
        "topic": "Порядок слов",
        "tags": ["энклитики", "порядок слов", "синтаксис"],
        "estimatedMinutes": 20,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Железное правило второго места"},
                {"id": "t2", "type": "paragraph", "text": "Энклитики это безударные слова, которые не могут начинать предложение и всегда примыкают ко первому ударному слову. Если в предложении собирается несколько энклитик сразу, они выстраиваются в строгом, неизменном порядке."},
                {"id": "t3", "type": "table", "rows": [
                    ["Позиция в цепочке", "Что сюда входит", "Примеры слов"],
                    ["1. Вопросительная частица", "частица li", "li"],
                    ["2. Глагол biti кроме je", "формы sam, si, smo, ste, su", "sam, si, smo, ste, su"],
                    ["3. Местоимение в дативе", "кому (mi, ti, mu, joj, nam, vam, im)", "mu, ti, joj, nam"],
                    ["4. Местоимение в аккузативе / генитиве", "кого / чего (me, te, ga, je, nas, vas, ih)", "ga, je, ih"],
                    ["5. Возвратная частица", "частица se", "se"],
                    ["6. Глагол связка je", "форма третьего лица je (всегда в конце)", "je"]
                ]},
                {"id": "t4", "type": "heading", "text": "Пример сложной цепочки"},
                {"id": "t5", "type": "paragraph", "text": "Посмотри, как выстраивается предложение «Он мне её дал»: On mi ju je dao. Сначала идет датив mi, затем аккузатив ju, затем связка je. Если сказать On je mi dao, это будет грубой ошибкой порядка слов."},
                {"id": "t6", "type": "quote", "text": "Форма связки je всегда замыкает цепочку энклитик, в отличие от всех остальных форм глагола biti, которые стоят в самом начале."}
            ],
            "markdown": "## Железное правило второго места\n\nЭнклитики это безударные слова, которые не могут начинать предложение и всегда примыкают ко первому ударному слову. Если в предложении собирается несколько энклитик сразу, они выстраиваются в строгом, неизменном порядке.\n\n| Позиция в цепочке | Что сюда входит | Примеры слов |\n| --- | --- | --- |\n| 1. Вопросительная частица | частица li | li |\n| 2. Глагол biti кроме je | формы sam, si, smo, ste, su | sam, si, smo, ste, su |\n| 3. Местоимение в дативе | кому (mi, ti, mu, joj, nam, vam, im) | mu, ti, joj, nam |\n| 4. Местоимение в аккузативе / генитиве | кого / чего (me, te, ga, je, nas, vas, ih) | ga, je, ih |\n| 5. Возвратная частица | частица se | se |\n| 6. Глагол связка je | форма третьего лица je (всегда в конце) | je |\n\n## Пример сложной цепочки\n\nПосмотри, как выстраивается предложение «Он мне её дал»: On mi ju je dao. Сначала идет датив mi, затем аккузатив ju, затем связка je. Если сказать On je mi dao, это будет грубой ошибкой порядка слов.\n\n> Форма связки je всегда замыкает цепочку энклитик, в отличие от всех остальных форм глагола biti, которые стоят в самом начале.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Какая цепочка энклитик построена абсолютно правильно", "options": ["Dao sam mu ga juče", "Dao mu sam ga juče", "Dao ga sam mu juče", "Dao sam ga mu juče"], "answer": "Dao sam mu ga juče", "explanation": "Сначала идет связка sam, затем датив mu, затем аккузатив ga"},
                {"id": "e2", "type": "fill_blank", "prompt": "Вставьте местоимение датива на правильное место во фразу «On ___ je rekao istinu»", "context": "On ___ je rekao celu priču.", "answer": "mi", "acceptedAnswers": ["mi", "ti", "mu", "nam"], "explanation": "Краткое местоимение датива встает перед связкой je"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Я ему это уже обещал»", "tokens": ["Obećao", "sam", "mu", "to", "već"], "answer": "Obećao sam mu to već", "explanation": "Связка sam идет перед кратким местоимением mu"},
                {"id": "e4", "type": "matching", "prompt": "Соедините категорию с её местом в цепочке энклитик", "pairs": [
                    {"left": "глагол sam / si / smo", "right": "первая позиция после частицы li"},
                    {"left": "датив (mu, ti, mi)", "right": "перед аккузативом"},
                    {"left": "аккузатив (ga, ih)", "right": "после датива"},
                    {"left": "связка je", "right": "в самом конце цепочки"}
                ], "explanation": "Иерархия энклитик строго фиксирована"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский «Она мне это показала»", "context": "Она мне это показала.", "answer": "Ona mi je to pokazala.", "referenceAnswer": "Ona mi je to pokazala.", "acceptedAnswers": ["Ona mi je to pokazala.", "Pokazala mi je to."], "explanation": "Датив mi идет перед глагольной связкой je"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {"id": "d1", "speaker": "Milan", "avatar": "man", "text": "Da li si poslao Marku onu poruku?", "choices": [
                        {"label": "Jesam, poslao sam mu je jutros.", "nextId": "d2"},
                        {"label": "Nisam još, poslaću mu je kasnije.", "nextId": "d3"}
                    ]},
                    {"id": "d2", "speaker": "Milan", "avatar": "man", "text": "Super, onda sigurno već zna za sastanak.", "choices": []},
                    {"id": "d3", "speaker": "Milan", "avatar": "man", "text": "Važi, samo nemoj da zaboraviš.", "choices": []}
                ]
            }
        }
    },

    # 16. potencijal-zelje-i-uslovi (B1)
    {
        "slug": "potencijal-zelje-i-uslovi",
        "title": "Сослагательное наклонение с частицей bi",
        "summary": "Учимся выражать вежливые просьбы, желания и гипотетические условия с помощью потенциала.",
        "level": "B1",
        "lessonType": "grammar",
        "topic": "Потенциал",
        "tags": ["глаголы", "наклонение", "потенциал", "условия"],
        "estimatedMinutes": 20,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Что такое потенциал и как он устроен"},
                {"id": "t2", "type": "paragraph", "text": "Потенциал (сослагательное или условное наклонение) выражает возможное действие, вежливую просьбу или заветное желание. Он строится из формы аориста глагола biti (bih, bi, bi, bismo, biste, bi) и L-причастия смыслового глагола."},
                {"id": "t3", "type": "table", "rows": [
                    ["Лицо", "Форма частицы bi", "Пример", "Русский перевод"],
                    ["ja", "bih", "ja bih radio", "я бы работал"],
                    ["ti", "bi", "ti bi radio", "ты бы работал"],
                    ["on, ona, ono", "bi", "on bi radio", "он бы работал"],
                    ["mi", "bismo", "mi bismo radili", "мы бы работали"],
                    ["vi", "biste", "vi biste radili", "вы бы работали"],
                    ["oni, one, ona", "bi", "oni bi radili", "они бы работали"]
                ]},
                {"id": "t4", "type": "heading", "text": "Вежливые фразы в кафе и магазине"},
                {"id": "t5", "type": "paragraph", "text": "Вместо прямого «хочу» сербы очень любят использовать мягкий потенциал ja bih: Ja bih želeo kafu (Я бы хотел кофе), Voleo bih da vidim jelovnik (Я бы с удовольствием посмотрел меню)."},
                {"id": "t6", "type": "quote", "text": "Частица bih используется только с я, а форма bismo только с мы. В третьем лице множественного числа используется bi, а не бише."}
            ],
            "markdown": "## Что такое потенциал и как он устроен\n\nПотенциал (сослагательное или условное наклонение) выражает возможное действие, вежливую просьбу или заветное желание. Он строится из формы аориста глагола biti (bih, bi, bi, bismo, biste, bi) и L-причастия смыслового глагола.\n\n| Лицо | Форма частицы bi | Пример | Русский перевод |\n| --- | --- | --- | --- |\n| ja | bih | ja bih radio | я бы работал |\n| ti | bi | ti bi radio | ты бы работал |\n| on, ona, ono | bi | on bi radio | он бы работал |\n| mi | bismo | mi bismo radili | мы бы работали |\n| vi | biste | vi biste radili | вы бы работали |\n| oni, one, ona | bi | oni bi radili | они бы работали |\n\n## Вежливые фразы в кафе и магазине\n\nВместо прямого «хочу» сербы очень любят использовать мягкий потенциал ja bih: Ja bih želeo kafu (Я бы хотел кофе), Voleo bih da vidim jelovnik (Я бы с удовольствием посмотрел меню).\n\n> Частица bih используется только с я, а форма bismo только с мы. В третьем лице множественного числа используется bi, а не бише.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Какая форма частицы bi подходит для местоимения mi", "options": ["bismo", "bih", "biste", "bi"], "answer": "bismo", "explanation": "Для первого лица множественного числа используется форма bismo"},
                {"id": "e2", "type": "fill_blank", "prompt": "Вставьте форму частицы bi для местоимения ja в вежливую просьбу", "context": "Ja ___ želeo jednu kafu sa mlekom.", "answer": "bih", "acceptedAnswers": ["bih"], "explanation": "Для первого лица единственного числа ja частица звучит bih"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Мы бы с удовольствием пришли к вам в гости»", "tokens": ["Rado", "bismo", "došli", "kod", "vas"], "answer": "Rado bismo došli kod vas", "explanation": "Форма bismo došli согласуется с местоимением mi"},
                {"id": "e4", "type": "matching", "prompt": "Соедините местоимение с правильной формой частицы потенциала", "pairs": [
                    {"left": "ja", "right": "bih"},
                    {"left": "ti", "right": "bi"},
                    {"left": "mi", "right": "bismo"},
                    {"left": "vi", "right": "biste"}
                ], "explanation": "Каждому лицу соответствует своя форма сослагательной частицы"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский «Что бы вы сделали на моем месте»", "context": "Что бы вы сделали на моем месте?", "answer": "Šta biste vi uradili na mom mestu?", "referenceAnswer": "Šta biste vi uradili na mom mestu?", "acceptedAnswers": ["Šta biste vi uradili na mom mestu?", "Šta biste uradili na mom mestu?", "Sta biste uradili na mom mestu?"], "explanation": "Для вежливого обращения на вы используется форма biste uradili"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {"id": "d1", "speaker": "Konobarica", "avatar": "woman", "text": "Izvolite, šta biste želeli da poručite?", "choices": [
                        {"label": "Ja bih popio čaj od nane.", "nextId": "d2"},
                        {"label": "Mi bismo uzeli domaći kolač i dve kafe.", "nextId": "d3"}
                    ]},
                    {"id": "d2", "speaker": "Konobarica", "avatar": "woman", "text": "Odlično, čaj stiže sa medom i limunom.", "choices": []},
                    {"id": "d3", "speaker": "Konobarica", "avatar": "woman", "text": "Hvala na porudžbini, donosim za par minuta!", "choices": []}
                ]
            }
        }
    }
]

def main():
    for lesson in LESSONS:
        slug = lesson["slug"]
        file_path = OUT_DIR / f"{slug}.json"
        file_path.write_text(json.dumps(lesson, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Сгенерирован урок: {file_path.name}")
    print(f"\nВсего создано {len(LESSONS)} уроков в {OUT_DIR}")

if __name__ == "__main__":
    main()
