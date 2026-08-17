"""Скрипт генерации 9 новых авторских уроков с игровыми диалогами и историей сербского языка для B1-B2."""

import json
from pathlib import Path

OUT_DIR = Path("tools/content_upload/generated_lessons_batch2")
OUT_DIR.mkdir(parents=True, exist_ok=True)

LESSONS = [
    # 1. Granicna kontrola
    {
        "slug": "granicna-kontrola-razgovor",
        "title": "Разговор на границе с пограничником",
        "summary": "Учимся общаться на паспортном контроле и таможне при въезде в Сербию на автомобиле или автобусе.",
        "level": "A2",
        "lessonType": "speaking",
        "topic": "На границе",
        "tags": ["диалог", "граница", "путешествия", "разговорник"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Как проходит пограничный контроль"},
                {"id": "t2", "type": "paragraph", "text": "При пересечении границы пограничный полицейский (granični policajac) проверяет паспорт (pasoš), регистрацию автомобиля (saobraćajna dozvola) и цель визита (cilj posete). Ответы должны быть четкими и вежливыми."},
                {"id": "t3", "type": "table", "rows": [
                    ["Сербская фраза", "Русский перевод", "Когда используется"],
                    ["Vaša dokumenta molim", "Ваши документы пожалуйста", "Просьба офицера предъявить паспорт"],
                    ["Putujem turistički", "Еду как турист", "Указание цели поездки"],
                    ["Idem u posetu prijateljima", "Еду в гости к друзьям", "Частный визит к знакомым"],
                    ["Nemam ništa za carinjenje", "Мне нечего декларировать", "Отсутствие товаров под пошлину"],
                    ["Srećan put", "Счастливого пути", "Пожелание приятной дороги"]
                ]},
                {"id": "t4", "type": "heading", "text": "Полезные слова на таможне"},
                {"id": "t5", "type": "paragraph", "text": "Слово prtljag означает багаж, roba означает товары или груз, а boravak означает пребывание в стране."},
                {"id": "t6", "type": "quote", "text": "При въезде на машине всегда держите наготове зеленое страховое свидетельство и права."}
            ],
            "markdown": "## Как проходит пограничный контроль\n\nПри пересечении границы пограничный полицейский (granični policajac) проверяет паспорт (pasoš), регистрацию автомобиля (saobraćajna dozvola) и цель визита (cilj posete). Ответы должны быть четкими и вежливыми.\n\n| Сербская фраза | Русский перевод | Когда используется |\n| --- | --- | --- |\n| Vaša dokumenta molim | Ваши документы пожалуйста | Просьба офицера предъявить паспорт |\n| Putujem turistički | Еду как турист | Указание цели поездки |\n| Idem u posetu prijateljima | Еду в гости к друзьям | Частный визит к знакомым |\n| Nemam ništa za carinjenje | Мне нечего декларировать | Отсутствие товаров под пошлину |\n| Srećan put | Счастливого пути | Пожелание приятной дороги |\n\n## Полезные слова на таможне\n\nСлово prtljag означает багаж, roba означает товары или груз, а boravak означает пребывание в стране.\n\n> При въезде на машине всегда держите наготове зеленое страховое свидетельство и права.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Как по-сербски называется заграничный паспорт", "options": ["pasoš", "dozvola", "karta", "knjižica"], "answer": "pasoš", "explanation": "Слово pasoš означает паспорт"},
                {"id": "e2", "type": "fill_blank", "prompt": "Вставьте пропущенное слово во фразу пограничника «Vaša ___ molim»", "context": "Vaša ___ molim vas.", "answer": "dokumenta", "acceptedAnswers": ["dokumenta", "pasose", "pasoše"], "explanation": "Документы во множественном числе среднего рода звучат dokumenta"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Мы едем в гости к друзьям в Белград»", "tokens": ["Idemo", "u", "posetu", "prijateljima", "u", "Beograd"], "answer": "Idemo u posetu prijateljima u Beograd", "explanation": "Слово prijateljima стоит в форме датива адресата"},
                {"id": "e4", "type": "matching", "prompt": "Соедините сербское дорожное понятие с русским переводом", "pairs": [
                    {"left": "granični prelaz", "right": "пограничный переход"},
                    {"left": "lični prtljag", "right": "личный багаж"},
                    {"left": "saobraćajna dozvola", "right": "документы на автомобиль"},
                    {"left": "cilj posete", "right": "цель визита"}
                ], "explanation": "Эти термины необходимы при прохождении контроля"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский «У меня нет ничего для декларации»", "context": "У меня нет ничего для декларации.", "answer": "Nemam ništa za carinjenje.", "referenceAnswer": "Nemam ništa za carinjenje.", "acceptedAnswers": ["Nemam ništa za carinjenje.", "Nemam nista za prijavu."], "explanation": "Фраза выражает отсутствие товаров подлежащих пошлине"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {
                        "id": "d1",
                        "speaker": "Granični policajac",
                        "avatar": "man",
                        "text": "Dobar dan, molim vas vaše pasoše i saobraćajnu dozvolu.",
                        "choices": [
                            {"label": "Dobar dan, izvolite naša dokumenta.", "nextId": "d2"},
                            {"label": "Izvolite, putujemo kolima za Beograd.", "nextId": "d2"}
                        ]
                    },
                    {
                        "id": "d2",
                        "speaker": "Granični policajac",
                        "avatar": "man",
                        "text": "Hvala. Koji je cilj vaše posete Srbiji i koliko ostajete?",
                        "choices": [
                            {"label": "Putujemo turistički, ostajemo deset dana.", "nextId": "d3"},
                            {"label": "Idemo u posetu rodbini za praznike.", "nextId": "d3"}
                        ]
                    },
                    {
                        "id": "d3",
                        "speaker": "Granični policajac",
                        "avatar": "man",
                        "text": "Imate li nešto od robe da prijavite carini?",
                        "choices": [
                            {"label": "Ne, imamo samo lični prtljag i garderobu.", "nextId": "d4"},
                            {"label": "Nemamo ništa, samo par sitnih poklona.", "nextId": "d4"}
                        ]
                    },
                    {
                        "id": "d4",
                        "speaker": "Granični policajac",
                        "avatar": "man",
                        "text": "Sve je u najboljem redu. Srećan put i prijatan boravak u Srbiji!",
                        "choices": []
                    }
                ]
            }
        }
    },

    # 2. Protesti u Beogradu
    {
        "slug": "protesti-na-ulicama-beograda",
        "title": "Протесты на улицах Белграда и гражданская позиция",
        "summary": "Разбираем лексику гражданского активизма, митингов и обсуждения общественно-политических событий в Сербии.",
        "level": "B1",
        "lessonType": "speaking",
        "topic": "Гражданское общество",
        "tags": ["политика", "общество", "диалог", "белград"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1569098644584-210bcd375b59?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Лексика протестов и митингов в Сербии"},
                {"id": "t2", "type": "paragraph", "text": "Уличные митинги и студенческие шествия важная часть общественной жизни Белграда. Люди выходят на улицы чтобы выразить несогласие с произволом властей, защитить свободные медиа и требовать справедливых выборов."},
                {"id": "t3", "type": "table", "rows": [
                    ["Сербское слово", "Русский перевод", "Контекст употребления"],
                    ["protest / demonstracije", "протест, демонстрация", "Ulični protest u centru"],
                    ["transparent", "плакат, баннер", "Nositi transparente sa porukama"],
                    ["pištaljka", "свисток", "Simbol građanskog otpora"],
                    ["sloboda medija", "свобода средств информации", "Ključni zahtev građana"],
                    ["pravo na izbor", "право выбора", "Demokratsko pravo svakog građanina"]
                ]},
                {"id": "t4", "type": "heading", "text": "Как обсуждать общественные события"},
                {"id": "t5", "type": "paragraph", "text": "Для выражения мнения используются обороты Smatram da (Считаю что), Ne slažem se sa (Не согласен с), Važno je da (Важно чтобы)."},
                {"id": "t6", "type": "quote", "text": "Слово građanin означает гражданин, а građansko društvo переводится как гражданское общество."}
            ],
            "markdown": "## Лексика протестов и митингов в Сербии\n\nУличные митинги и студенческие шествия важная часть общественной жизни Белграда. Люди выходят на улицы чтобы выразить несогласие с произволом властей, защитить свободные медиа и требовать справедливых выборов.\n\n| Сербское слово | Русский перевод | Контекст употребления |\n| --- | --- | --- |\n| protest / demonstracije | протест, демонстрация | Ulični protest u centru |\n| transparent | плакат, баннер | Nositi transparente sa porukama |\n| pištaljka | свисток | Simbol građanskog otpora |\n| sloboda medija | свобода средств информации | Ključni zahtev građana |\n| pravo na izbor | право выбора | Demokratsko pravo svakog građanina |\n\n## Как обсуждать общественные события\n\nДля выражения мнения используются обороты Smatram da (Считаю что), Ne slažem se sa (Не согласен с), Važno je da (Важно чтобы).\n\n> Слово građanin означает гражданин, а građansko društvo переводится как гражданское общество.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Что означает сербское слово transparent", "options": ["плакат или баннер", "прозрачное стекло", "городской транспорт", "билет на поезд"], "answer": "плакат или баннер", "explanation": "Transparent на митинге это плакат с лозунгом"},
                {"id": "e2", "type": "fill_blank", "prompt": "Вставьте слово в лозунг «Tražimo slobodu ___»", "context": "Građani zahtevaju slobodu ___ i govora.", "answer": "medija", "acceptedAnswers": ["medija", "štampe"], "explanation": "Слово medija означает средства массовой информации"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Тысячи людей вышли сегодня на улицы»", "tokens": ["Hiljade", "ljudi", "je", "izašlo", "na", "ulice"], "answer": "Hiljade ljudi je izašlo na ulice", "explanation": "Фраза выражает массовое участие в демонстрации"},
                {"id": "e4", "type": "matching", "prompt": "Соедините сербские выражения гражданской тематики с переводом", "pairs": [
                    {"left": "građanska prava", "right": "гражданские права"},
                    {"left": "mirni protest", "right": "мирный протест"},
                    {"left": "zahtevi naroda", "right": "требования народа"},
                    {"left": "borba protiv korupcije", "right": "борьба против коррупции"}
                ], "explanation": "Эти термины часто звучат в независимых новостях"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский «Люди требуют справедливости и честных законов»", "context": "Люди требуют справедливости и честных законов.", "answer": "Ljudi traže pravdu i poštene zakone.", "referenceAnswer": "Ljudi traže pravdu i poštene zakone.", "acceptedAnswers": ["Ljudi traže pravdu i poštene zakone.", "Ljudi zahtevaju pravdu i poštene zakone."], "explanation": "Глагол tražiti или zahtevati управляет аккузативом"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {
                        "id": "d1",
                        "speaker": "Nina",
                        "avatar": "woman",
                        "text": "Pogledaj koliko je naroda izašlo večeras ispred Narodne skupštine!",
                        "choices": [
                            {"label": "Neverovatna energija, ljudi mirno traže slobodu i pravdu.", "nextId": "d2"},
                            {"label": "Građani žele da se zaustavi samovlašće i bezakonje.", "nextId": "d3"}
                        ]
                    },
                    {
                        "id": "d2",
                        "speaker": "Nina",
                        "avatar": "woman",
                        "text": "Svi nose pištaljke i transparente, atmosfera je puna nade i solidarnosti.",
                        "choices": [
                            {"label": "Važno je da se glas naroda čuje glasno i dostojanstveno.", "nextId": "d4"}
                        ]
                    },
                    {
                        "id": "d3",
                        "speaker": "Nina",
                        "avatar": "woman",
                        "text": "Studenti i profesori stoje u prvim redovima za budućnost zemlje.",
                        "choices": [
                            {"label": "Podrška mladima je najvažnija za stvarne promene.", "nextId": "d4"}
                        ]
                    },
                    {
                        "id": "d4",
                        "speaker": "Nina",
                        "avatar": "woman",
                        "text": "Ovo je zaista istorijski trenutak buđenja građanskog društva u Srbiji.",
                        "choices": []
                    }
                ]
            }
        }
    },

    # 3. U kafani / restoranu
    {
        "slug": "u-restoranu-narucivanje-hrane",
        "title": "Официант и заказ в сербской кафане",
        "summary": "Учимся заказывать традиционные сербские блюда, общаться с официантом и просить счет.",
        "level": "A2",
        "lessonType": "speaking",
        "topic": "В ресторане",
        "tags": ["кафе", "еда", "диалог", "кафана"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Традиции сербского застолья"},
                {"id": "t2", "type": "paragraph", "text": "Сербская кафана это не просто ресторан, а центр дружеского общения. Официант (konobar) всегда подскажет свежие блюда с гриля (roštilj) и домашние салаты."},
                {"id": "t3", "type": "table", "rows": [
                    ["Сербское блюдо или напиток", "Описание", "Как заказать"],
                    ["ćevapi", "жареные мясные колбаски", "Deset ćevapa u somunu molim"],
                    ["šopska salata", "салат с огурцами, томатами и сыром", "Jednu šopsku salatu"],
                    ["kajmak", "традиционные домашние сливки", "Dodajte i malo kajmaka"],
                    ["domaća kafa", "сваренный по-восточному кофе", "Dve domaće kafe sa šećerom"],
                    ["račun", "счет за ужин", "Može li račun molim vas"]
                ]},
                {"id": "t4", "type": "heading", "text": "Вежливые формулы заказа"},
                {"id": "t5", "type": "paragraph", "text": "Вместо прямого «хочу» принято говорить Ja bih želeo (Я бы хотел) или Donesite nam molim vas (Принесите нам пожалуйста)."},
                {"id": "t6", "type": "quote", "text": "Чтобы попросить счет, достаточно сказать Može li račun или Račun molim vas."}
            ],
            "markdown": "## Традиции сербского застолья\n\nСербская кафана это не просто ресторан, а центр дружеского общения. Официант (konobar) всегда подскажет свежие блюда с гриля (roštilj) и домашние салаты.\n\n| Сербское блюдо или напиток | Описание | Как заказать |\n| --- | --- | --- |\n| ćevapi | жареные мясные колбаски | Deset ćevapa u somunu molim |\n| šopska salata | салат с огурцами, томатами и сыром | Jednu šopsku salatu |\n| kajmak | традиционные домашние сливки | Dodajte i malo kajmaka |\n| domaća kafa | сваренный по-восточному кофе | Dve domaće kafe sa šećerom |\n| račun | счет за ужин | Može li račun molim vas |\n\n## Вежливые формулы заказа\n\nВместо прямого «хочу» принято говорить Ja bih želeo (Я бы хотел) или Donesite nam molim vas (Принесите нам пожалуйста).\n\n> Чтобы попросить счет, достаточно сказать Može li račun или Račun molim vas.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Как вежливо попросить счет в кафе", "options": ["Može li račun molim vas", "Daj mi pare", "Gde je novac", "Koliko ja koštam"], "answer": "Može li račun molim vas", "explanation": "Формула Može li račun общепринята во всех заведениях"},
                {"id": "e2", "type": "fill_blank", "prompt": "Вставьте форму вежливого заказа «Ja ___ želeo pljeskavicu»", "context": "Ja ___ želeo jednu pljeskavicu sa lukom.", "answer": "bih", "acceptedAnswers": ["bih"], "explanation": "Для местоимения первого лица ja частица звучит bih"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Принесите нам две минеральные воды пожалуйста»", "tokens": ["Donesite", "nam", "dve", "kisele", "vode", "molim"], "answer": "Donesite nam dve kisele vode molim", "explanation": "Сербское kisela voda означает газированную минеральную воду"},
                {"id": "e4", "type": "matching", "prompt": "Соедините сербские кулинарные слова с переводом", "pairs": [
                    {"left": "roštilj", "right": "мясо на гриле"},
                    {"left": "somun", "right": "традиционная лепешка"},
                    {"left": "kisela voda", "right": "минеральная газированная вода"},
                    {"left": "napojnica", "right": "чаевые официанту"}
                ], "explanation": "Эти слова постоянно встречаются в меню ресторанов"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский «Что вы можете нам порекомендовать»", "context": "Что вы можете нам порекомендовать?", "answer": "Šta možete da nam preporučite?", "referenceAnswer": "Šta možete da nam preporučite?", "acceptedAnswers": ["Šta možete da nam preporučite?", "Sta mozete da nam preporucite?"], "explanation": "Конструкция с da + Present естественна при заказе"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {
                        "id": "d1",
                        "speaker": "Konobar",
                        "avatar": "man",
                        "text": "Dobro veče i dobrodošli! Jeste li spremni da poručite?",
                        "choices": [
                            {"label": "Jesmo, šta nam preporučujete od roštilja?", "nextId": "d2"},
                            {"label": "Donesite nam za početak šopsku salatu i rakiju.", "nextId": "d3"}
                        ]
                    },
                    {
                        "id": "d2",
                        "speaker": "Konobar",
                        "avatar": "man",
                        "text": "Domaća pljeskavica na kajmaku i ćevapi su nam danas odlični.",
                        "choices": [
                            {"label": "Uzećemo jednu porciju ćevapa u toplom somunu.", "nextId": "d4"}
                        ]
                    },
                    {
                        "id": "d3",
                        "speaker": "Konobar",
                        "avatar": "man",
                        "text": "Stiže hladna dunjevača i sveža salata sa domaćim sirom.",
                        "choices": [
                            {"label": "Odlično, a posle toga ćemo poručiti i glavno jelo.", "nextId": "d4"}
                        ]
                    },
                    {
                        "id": "d4",
                        "speaker": "Konobar",
                        "avatar": "man",
                        "text": "Sve stiže za desetak minuta, uživajte u prijatnoj večeri!",
                        "choices": []
                    }
                ]
            }
        }
    },

    # 4. Sastanak u basti
    {
        "slug": "sastanak-u-botanickoj-basti",
        "title": "Свидание в ботаническом саду",
        "summary": "Разбираем романтическую лексику, комплименты и прогулку по ботаническому саду Jevremovac.",
        "level": "A2",
        "lessonType": "speaking",
        "topic": "Свидание",
        "tags": ["диалог", "свидание", "природа", "эмоции"],
        "estimatedMinutes": 15,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Романтическая прогулка по саду"},
                {"id": "t2", "type": "paragraph", "text": "Ботанический сад Jevremovac в центре Белграда любимое место для свиданий (sastanak). Здесь приятно не спеша гулять по аллеям, пить кофе и говорить о жизни."},
                {"id": "t3", "type": "table", "rows": [
                    ["Сербская фраза", "Русский перевод", "Когда сказать"],
                    ["Izgledaš prelepo", "Ты выглядишь прекрасно", "Искренний комплимент при встрече"],
                    ["Drago mi je što smo se videli", "Рад что мы увиделись", "Теплые слова во время прогулки"],
                    ["Da li ti prija ova šetnja", "Нравится ли тебе эта прогулка", "Вопрос о самочувствии спутника"],
                    ["Možemo da sednemo na klupu", "Мы можем присесть на скамейку", "Предложение отдохнуть в тени"],
                    ["Hvala na divnom danu", "Спасибо за чудесный день", "Благодарность в конце встречи"]
                ]},
                {"id": "t4", "type": "heading", "text": "Выражение симпатии и эмоций"},
                {"id": "t5", "type": "paragraph", "text": "Фраза Sviđaš mi se означает «ты мне нравишься», а Uživala sam / Uživao sam переводится как «я получил огромное удовольствие»."},
                {"id": "t6", "type": "quote", "text": "Слово sastanak означает как деловую встречу, так и романтическое свидание."}
            ],
            "markdown": "## Романтическая прогулка по саду\n\nБотанический сад Jevremovac в центре Белграда любимое место для свиданий (sastanak). Здесь приятно не спеша гулять по аллеям, пить кофе и говорить о жизни.\n\n| Сербская фраза | Русский перевод | Когда сказать |\n| --- | --- | --- |\n| Izgledaš prelepo | Ты выглядишь прекрасно | Искренний комплимент при встрече |\n| Drago mi je što smo se videli | Рад что мы увиделись | Теплые слова во время прогулки |\n| Da li ti prija ova šetnja | Нравится ли тебе эта прогулка | Вопрос о самочувствии спутника |\n| Možemo da sednemo na klupu | Мы можем присесть на скамейку | Предложение отдохнуть в тени |\n| Hvala na divnom danu | Спасибо за чудесный день | Благодарность в конце встречи |\n\n## Выражение симпатии и эмоций\n\nФраза Sviđaš mi se означает «ты мне нравишься», а Uživala sam / Uživao sam переводится как «я получил огромное удовольствие».\n\n> Слово sastanak означает как деловую встречу, так и романтическое свидание.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Как сказать «Ты мне очень нравишься»", "options": ["Mnogo mi se sviđaš", "Mnogo mi se radiš", "Mnogo mi se gledaš", "Mnogo mi se ideš"], "answer": "Mnogo mi se sviđaš", "explanation": "Возвратный глагол sviđati se выражает симпатию"},
                {"id": "e2", "type": "fill_blank", "prompt": "Вставьте слово в комплимент «Izgledaš ___ danas»", "context": "Izgledaš ___ u toj zelenoj haljini.", "answer": "prelepo", "acceptedAnswers": ["prelepo", "divno", "lepo"], "explanation": "Слово prelepo выражает высшую степень красоты"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Давай посидим немного на этой удобной скамейке»", "tokens": ["Hajde", "da", "sednemo", "na", "ovu", "klupu"], "answer": "Hajde da sednemo na ovu klupu", "explanation": "Конструкция hajde da выражает мягкое совместное предложение"},
                {"id": "e4", "type": "matching", "prompt": "Соедините фразы свидания с их значением", "pairs": [
                    {"left": "divna šetnja", "right": "чудесная прогулка"},
                    {"left": "japanski vrt", "right": "японский сад"},
                    {"left": "topla kafa", "right": "теплый кофе"},
                    {"left": "lep razgovor", "right": "приятная беседа"}
                ], "explanation": "Эти словосочетания помогают описать приятное времяпрепровождение"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский «Спасибо тебе за незабываемый вечер»", "context": "Спасибо тебе за незабываемый вечер.", "answer": "Hvala ti na nezaboravnoj večeri.", "referenceAnswer": "Hvala ti na nezaboravnoj večeri.", "acceptedAnswers": ["Hvala ti na nezaboravnoj večeri.", "Hvala ti za nezaboravno vece."], "explanation": "Слово veče в локативе после na принимает форму večeri"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {
                        "id": "d1",
                        "speaker": "Elena",
                        "avatar": "woman",
                        "text": "Kako je divno i mirno ovde u botaničkoj bašti Jevremovac.",
                        "choices": [
                            {"label": "Drago mi je što ti se sviđa, ovo je moj omiljeni kutak u gradu.", "nextId": "d2"},
                            {"label": "Uzeo sam dve tople kafe da šetamo polako stazama.", "nextId": "d3"}
                        ]
                    },
                    {
                        "id": "d2",
                        "speaker": "Elena",
                        "avatar": "woman",
                        "text": "Pogledaj onaj staklenik sa tropskim biljkama, izgleda potpuno magično.",
                        "choices": [
                            {"label": "Hajde da uđemo unutra i napravimo nekoliko lepih slika.", "nextId": "d4"}
                        ]
                    },
                    {
                        "id": "d3",
                        "speaker": "Elena",
                        "avatar": "woman",
                        "text": "Baš ti hvala na pažnji, kafa miriše predivno na ovom svežem vazduhu.",
                        "choices": [
                            {"label": "Možemo sesti na onu drvenu klupu pored japanskog vrta.", "nextId": "d4"}
                        ]
                    },
                    {
                        "id": "d4",
                        "speaker": "Elena",
                        "avatar": "woman",
                        "text": "Ovo je zaista prelep sastanak, hvala ti na divnom i opuštenom popodnevu.",
                        "choices": []
                    }
                ]
            }
        }
    },

    # 5. Istraga ubistva
    {
        "slug": "detektivska-istraga-u-beogradu",
        "title": "Расследование загадочного преступления",
        "summary": "Детективный диалог, опрос свидетелей, проверка алиби и поиск улик на месте происшествия.",
        "level": "B1",
        "lessonType": "speaking",
        "topic": "Детектив и расследование",
        "tags": ["детектив", "расследование", "диалог", "криминалистика"],
        "estimatedMinutes": 20,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1453873531674-215110116643?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Криминальная и детективная лексика"},
                {"id": "t2", "type": "paragraph", "text": "В детективных историях инспектор полиции (policijski inspektor) проводит расследование (istraga), опрашивает свидетелей (svedoci) и проверяет алиби (alibi)."},
                {"id": "t3", "type": "table", "rows": [
                    ["Сербский термин", "Русский перевод", "Пример в контексте"],
                    ["mesto zločina", "место преступления", "Obezbediti mesto zločina"],
                    ["dokaz / trag", "улика, доказательство, след", "Pronašli smo važne tragove"],
                    ["osumnjičeni", "подозреваемый", "Saslušati osumnjičenog"],
                    ["izjava svedoka", "показания свидетеля", "Zapisati izjavu svedoka"],
                    ["rešiti slučaj", "раскрыть дело", "Inspektor će uskoro rešiti slučaj"]
                ]},
                {"id": "t4", "type": "heading", "text": "Вопросы во время допроса"},
                {"id": "t5", "type": "paragraph", "text": "Следователь задает вопросы о времени и местонахождении: Gde ste bili u trenutku ubistva? (Где вы были в момент убийства?), Da li ste videli nekoga sumnjivog? (Видели ли вы кого-то подозрительного?)."},
                {"id": "t6", "type": "quote", "text": "Слово svedok означает свидетель, а očevidac это свидетель очевидец."}
            ],
            "markdown": "## Криминальная и детективная лексика\n\nВ детективных историях инспектор полиции (policijski inspektor) проводит расследование (istraga), опрашивает свидетелей (svedoci) и проверяет алиби (alibi).\n\n| Сербский термин | Русский перевод | Пример в контексте |\n| --- | --- | --- |\n| mesto zločina | место преступления | Obezbediti mesto zločina |\n| dokaz / trag | улика, доказательство, след | Pronašli smo važne tragove |\n| osumnjičeni | подозреваемый | Saslušati osumnjičenog |\n| izjava svedoka | показания свидетеля | Zapisati izjavu svedoka |\n| rešiti slučaj | раскрыть дело | Inspektor će uskoro rešiti slučaj |\n\n## Вопросы во время допроса\n\nСледователь задает вопросы о времени и местонахождении: Gde ste bili u trenutku ubistva? (Где вы были в момент убийства?), Da li ste videli nekoga sumnjivog? (Видели ли вы кого-то подозрительного?).\n\n> Слово svedok означает свидетель, а očevidac это свидетель очевидец.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Как по-сербски называется улика или след на месте преступления", "options": ["trag", "put", "korak", "znak"], "answer": "trag", "explanation": "Слово trag означает след или вещественное доказательство"},
                {"id": "e2", "type": "fill_blank", "prompt": "Вставьте слово во фразу инспектора «Gde je vaše ___ za sinoć»", "context": "Imate li čvrsto ___ za vreme ubistva?", "answer": "alibi", "acceptedAnswers": ["alibi"], "explanation": "Слово alibi означает доказательство непричастности к преступлению"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Соберите фразу «Полиция нашла отпечатки пальцев на двери»", "tokens": ["Policija", "je", "pronašla", "otiske", "prstiju", "na", "vratima"], "answer": "Policija je pronašla otiske prstiju na vratima", "explanation": "Термин otisci prstiju означает отпечатки пальцев"},
                {"id": "e4", "type": "matching", "prompt": "Соедините детективные понятия с русским переводом", "pairs": [
                    {"left": "ubistvo", "right": "убийство"},
                    {"left": "istraga", "right": "расследование"},
                    {"left": "oružje", "right": "оружие"},
                    {"left": "optužnica", "right": "обвинительное заключение"}
                ], "explanation": "Специальная лексика криминального расследования"},
                {"id": "e5", "type": "translator_duel", "prompt": "Переведите на сербский «Свидетель утверждает что слышал выстрел»", "context": "Свидетель утверждает что слышал выстрел.", "answer": "Svedok tvrdi da je čuo pucanj.", "referenceAnswer": "Svedok tvrdi da je čuo pucanj.", "acceptedAnswers": ["Svedok tvrdi da je čuo pucanj.", "Svedok tvrdi da je cuo pucanj."], "explanation": "Слово pucanj означает выстрел"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {
                        "id": "d1",
                        "speaker": "Inspektor Pavlović",
                        "avatar": "man",
                        "text": "Dobar dan, inspektor Pavlović. Vodim zvaničnu istragu o sinoćnjem ubistvu u vili.",
                        "choices": [
                            {"label": "Dobar dan inspektore, ja sam komšija, video sam sumnjiv automobil.", "nextId": "d2"},
                            {"label": "Bio sam u svojoj kući preko puta, ali nisam čuo nikakve pucnje.", "nextId": "d3"}
                        ]
                    },
                    {
                        "id": "d2",
                        "speaker": "Inspektor Pavlović",
                        "avatar": "man",
                        "text": "To je vrlo važan podatak. Možete li opisati model i tačno vreme kada je auto prošao?",
                        "choices": [
                            {"label": "Bio je to crni sedan bez upaljenih svetala, tačno oko ponoći.", "nextId": "d4"}
                        ]
                    },
                    {
                        "id": "d3",
                        "speaker": "Inspektor Pavlović",
                        "avatar": "man",
                        "text": "Da li možete potvrditi svoje alibi u periodu između jedanaest i jedan sat?",
                        "choices": [
                            {"label": "Naravno, bio sam sa celom porodicom i gledali smo film.", "nextId": "d4"}
                        ]
                    },
                    {
                        "id": "d4",
                        "speaker": "Inspektor Pavlović",
                        "avatar": "man",
                        "text": "Hvala vam na saradnji sa policijom, ove informacije su ključne za zatvaranje slučaja.",
                        "choices": []
                    }
                ]
            }
        }
    },

    # 6. Vuk Karadzic (B1-B2 in Serbian)
    {
        "slug": "vuk-karadzic-i-reforma-jezika",
        "title": "Vuk Karadžić i reforma srpskog jezika",
        "summary": "Učimo o istorijskoj reformi srpskog književnog jezika, uvođenju fonetskog pravopisa i Vukovoj azbuci.",
        "level": "B1",
        "lessonType": "grammar",
        "topic": "Istorija jezika",
        "tags": ["istorija", "vuk karadzic", "azbuka", "gramatika"],
        "estimatedMinutes": 20,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Vuk Stefanović Karadžić i narodni jezik"},
                {"id": "t2", "type": "paragraph", "text": "Početkom devetnaestog veka srpski pisci su koristili slavenosrpski jezik, koji je bio mešavina ruskoslovenskog, crkvenoslovenskog i narodnog govora. Vuk Karadžić je doneo revolucionarnu odluku da osnov književnog jezika mora biti živi narodni govor."},
                {"id": "t3", "type": "table", "rows": [
                    ["Godina", "Delo Vuka Karadžića", "Značaj za kulturu"],
                    ["1814", "Pismenica serbskoga jezika", "Prva gramatika srpskog narodnog jezika"],
                    ["1818", "Srpski rječnik", "Prvi rečnik narodnog jezika sa gramatičkim opisom"],
                    ["1847", "Godina pobede Vukove reforme", "Štampani Gorski vijenac i Pesme Branka Radičevića"],
                    ["1868", "Zvanično priznanje", "Srpska država zvanično usvaja Vukov pravopis"]
                ]},
                {"id": "t4", "type": "heading", "text": "Glavno načelo fonetskog pravopisa"},
                {"id": "t5", "type": "paragraph", "text": "Vuk je uveo čuveno pravilo Piši kao što govoriš, a čitaj kao što je napisano. Izbacio je nepotrebna stara slova i stvorio savršenu azbuku u kojoj svakom glasu odgovara tačno jedno slovo."},
                {"id": "t6", "type": "quote", "text": "Vuk je dodao nova slova j, lj, nj, ć, đ i dž, čime je stvorena jedna od najsavršenijih fonetskih azbuka na svetu."}
            ],
            "markdown": "## Vuk Stefanović Karadžić i narodni jezik\n\nPočetkom devetnaestog veka srpski pisci su koristili slavenosrpski jezik, koji je bio mešavina ruskoslovenskog, crkvenoslovenskog i narodnog govora. Vuk Karadžić je doneo revolucionarnu odluku da osnov književnog jezika mora biti živi narodni govor.\n\n| Godina | Delo Vuka Karadžića | Značaj za kulturu |\n| --- | --- | --- |\n| 1814 | Pismenica serbskoga jezika | Prva gramatika srpskog narodnog jezika |\n| 1818 | Srpski rječnik | Prvi rečnik narodnog jezika sa gramatičkim opisom |\n| 1847 | Godina pobede Vukove reforme | Štampani Gorski vijenac i Pesme Branka Radičevića |\n| 1868 | Zvanično priznanje | Srpska država zvanično usvaja Vukov pravopis |\n\n## Glavno načelo fonetskog pravopisa\n\nVuk je uveo čuveno pravilo Piši kao što govoriš, a čitaj kao što je napisano. Izbacio je nepotrebna stara slova i stvorio savršenu azbuku u kojoj svakom glasu odgovara tačno jedno slovo.\n\n> Vuk je dodao nova slova j, lj, nj, ć, đ i dž, čime je stvorena jedna od najsavršenijih fonetskih azbuka na svetu.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Koje je glavno načelo Vukove pravopisne reforme", "options": ["Piši kao što govoriš, a čitaj kao što je napisano", "Piši prema etimologiji starih reči", "Koristi samo crkvenoslovenska slova", "Preuzimaj pravila iz latinskog jezika"], "answer": "Piši kao što govoriš, a čitaj kao što je napisano", "explanation": "Vukovo načelo nalaže da svakom glasu odgovara jedno slovo"},
                {"id": "e2", "type": "fill_blank", "prompt": "Upišite godinu izlaska prvog Srpskog rječnika Vuka Karadžića", "context": "Prvi Srpski rječnik objavljen je u Beču ___ godine.", "answer": "1818", "acceptedAnswers": ["1818"], "explanation": "Vukov rečnik je objavljen 1818 godine sa prevodom na nemački i latinski"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Složite rečenicu o značaju narodnog jezika", "tokens": ["Vuk", "je", "uveo", "narodni", "jezik", "u", "književnost"], "answer": "Vuk je uveo narodni jezik u književnost", "explanation": "Reforma je uzdigla narodni govor na nivo književnog jezika"},
                {"id": "e4", "type": "matching", "prompt": "Povežite slova koja je Vuk uveo ili preuredio u azbuci", "pairs": [
                    {"left": "slovo j", "right": "preuzeto iz latinice"},
                    {"left": "slova lj i nj", "right": "spajanje l i n sa mekim znakom"},
                    {"left": "slovo dž", "right": "preuzeto iz starih rukopisa za glas dž"},
                    {"left": "slovo đ", "right": "oblikovao Lukijan Mušicki za Vuka"}
                ], "explanation": "Ova slova čine temelj savremene srpske azbuke"},
                {"id": "e5", "type": "translator_duel", "prompt": "Prevedite na ruski rečenicu «Vukova reforma je temelj savremene srpske kulture»", "context": "Vukova reforma je temelj savremene srpske kulture.", "answer": "Реформа Вука является фундаментом современной сербской культуры.", "referenceAnswer": "Реформа Вука является фундаментом современной сербской культуры.", "acceptedAnswers": ["Реформа Вука является фундаментом современной сербской культуры.", "Реформа Вука это основа современной сербской культуры."], "explanation": "Reč temelj znači temelj, osnova"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {
                        "id": "d1",
                        "speaker": "Profesor Jovanović",
                        "avatar": "teacher",
                        "text": "Dobar dan studentkinjo, da li znate zašto je 1847. godina presudna za srpski jezik?",
                        "choices": [
                            {"label": "Tada su izašla velika dela na narodnom jeziku.", "nextId": "d2"},
                            {"label": "Tada je Vuk izdao svoju prvu gramatiku.", "nextId": "d3"}
                        ]
                    },
                    {
                        "id": "d2",
                        "speaker": "Profesor Jovanović",
                        "avatar": "teacher",
                        "text": "Tako je, te godine su objavljeni Gorski vijenac, Vukov prevod Novog zavjeta i pesme Branka Radičevića.",
                        "choices": [
                            {"label": "To je bio konačni dokaz snage narodnog jezika u poeziji.", "nextId": "d4"}
                        ]
                    },
                    {
                        "id": "d3",
                        "speaker": "Profesor Jovanović",
                        "avatar": "teacher",
                        "text": "Prva gramatika je izašla ranije, 1814. godine, a 1847. je donela trijumf u književnoj praksi.",
                        "choices": [
                            {"label": "Razumem, pesnici su pokazali lepotu narodnog jezika.", "nextId": "d4"}
                        ]
                    },
                    {
                        "id": "d4",
                        "speaker": "Profesor Jovanović",
                        "avatar": "teacher",
                        "text": "Upravo tako, jezik je postao pristupačan celom narodu i stvorena je moderna kultura.",
                        "choices": []
                    }
                ]
            }
        }
    },

    # 7. Miroslavljevo jevandjelje i stara pismenost
    {
        "slug": "miroslavljevo-jevandjelje-i-stara-pismenost",
        "title": "Miroslavljevo jevanđelje i stara srpska pismenost",
        "summary": "Istražujemo najstariji sačuvani ćirilički spomenik srpske pismenosti iz dvanaestog veka i prelaz sa glagoljice na ćirilicu.",
        "level": "B2",
        "lessonType": "grammar",
        "topic": "Srednjovekovna pismenost",
        "tags": ["istorija", "spomenici", "jevanđelje", "ćirilica"],
        "estimatedMinutes": 20,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Najstariji srpski ćirilički spomenik"},
                {"id": "t2", "type": "paragraph", "text": "Miroslavljevo jevanđelje je nastalo oko 1185. godine po narudžbini humskog kneza Miroslava, brata Stefana Nemanje. Pisano je na pergamentu na srpskoslovenskom jeziku, gde se u staroslovensku osnovu već unose osobine narodnog govora."},
                {"id": "t3", "type": "table", "rows": [
                    ["Karakteristika", "Opis", "Značaj"],
                    ["Pismo", "Ustavna ćirilica", "Rukopis izuzetne kaligrafske lepote"],
                    ["Ukras", "296 minijatura i inicijala", "Vrhunac srednjovekovne iluminacije"],
                    ["Pisari", "Dijak Gligorije i još jedan pisar", "Prikaz visoke pismenosti doba Nemanjića"],
                    ["UNESCO baština", "Upisano u registar Pamćenje sveta", "Spomenik od svetskog kulturnog značaja"]
                ]},
                {"id": "t4", "type": "heading", "text": "Od glagoljice ka ćirilici"},
                {"id": "t5", "type": "paragraph", "text": "Slovenska pismenost je počela misijom Ćirila i Metodija u devetom veku. Prvo pismo bila je glagoljica, ali se krajem devetog i tokom desetog veka na južnoslovenskom prostoru razvila ćirilica, koja je bila jednostavnija za pisanje i bliska grčkom pismu."},
                {"id": "t6", "type": "quote", "text": "Miroslavljevo jevanđelje se danas čuva u Narodnom muzeju u Beogradu kao najveća nacionalna relikvija."}
            ],
            "markdown": "## Najstariji srpski ćirilički spomenik\n\nMiroslavljevo jevanđelje je nastalo oko 1185. godine po narudžbini humskog kneza Miroslava, brata Stefana Nemanje. Pisano je na pergamentu na srpskoslovenskom jeziku, gde se u staroslovensku osnovu već unose osobine narodnog govora.\n\n| Karakteristika | Opis | Značaj |\n| --- | --- | --- |\n| Pismo | Ustavna ćirilica | Rukopis izuzetne kaligrafske lepote |\n| Ukras | 296 minijatura i inicijala | Vrhunac srednjovekovne iluminacije |\n| Pisari | Dijak Gligorije i još jedan pisar | Prikaz visoke pismenosti doba Nemanjića |\n| UNESCO baština | Upisano u registar Pamćenje sveta | Spomenik od svetskog kulturnog značaja |\n\n## Od glagoljice ka ćirilici\n\nSlovenska pismenost je počela misijom Ćirila i Metodija u devetom veku. Prvo pismo bila je glagoljica, ali se krajem devetog i tokom desetog veka na južnoslovenskom prostoru razvila ćirilica, koja je bila jednostavnija za pisanje i bliska grčkom pismu.\n\n> Miroslavljevo jevanđelje se danas čuva u Narodnom muzeju u Beogradu kao najveća nacionalna relikvija.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "U kom veku je nastalo Miroslavljevo jevanđelje", "options": ["U dvanaestom veku", "U devetom veku", "U šesnaestom veku", "U dvadesetom veku"], "answer": "U dvanaestom veku", "explanation": "Rukopis potiče iz druge polovine dvanaestog veka oko 1185 godine"},
                {"id": "e2", "type": "fill_blank", "prompt": "Upišite ime pisara koji se potpisao na kraju rukopisa", "context": "Na kraju jevanđelja ostavio je svoj zapis dijak ___.", "answer": "Gligorije", "acceptedAnswers": ["Gligorije"], "explanation": "Dijak Gligorije je jedan od pisara koji je iluminirao rukopis"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Složite rečenicu o međunarodnom priznanju ovog spomenika", "tokens": ["Rukopis", "je", "upisan", "u", "registar", "svetske", "baštine"], "answer": "Rukopis je upisan u registar svetske baštine", "explanation": "UNESCO je uvrstio Miroslavljevo jevanđelje u Pamćenje sveta"},
                {"id": "e4", "type": "matching", "prompt": "Povežite termine stare pismenosti sa opisom", "pairs": [
                    {"left": "pergament", "right": "posebno obrađena životinjska koža"},
                    {"left": "inicijal", "right": "raskošno ukrašeno početno slovo"},
                    {"left": "srpskoslovenski jezik", "right": "srpska redakcija staroslovenskog jezika"},
                    {"left": "glagoljica", "right": "prvo slovensko pismo solunske braće"}
                ], "explanation": "Ovi pojmovi su temelj razumevanja srednjovekovnih rukopisa"},
                {"id": "e5", "type": "translator_duel", "prompt": "Prevedite na ruski rečenicu «Rukopis sadrži izuzetne minijature i zlatne ukrase»", "context": "Rukopis sadrži izuzetne minijature i zlatne ukrase.", "answer": "Рукопись содержит исключительные миниатюры и золотые украшения.", "referenceAnswer": "Рукопись содержит исключительные миниатюры и золотые украшения.", "acceptedAnswers": ["Рукопись содержит исключительные миниатюры и золотые украшения.", "Рукопись содержит великолепные миниатюры и золотые украшения."], "explanation": "Reč sadrži znači sadrži, obuhvata"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {
                        "id": "d1",
                        "speaker": "Kustos Muzeja",
                        "avatar": "teacher",
                        "text": "Dobrodošli u odeljenje srednjovekovne kulture. Pred vama su stranice najstarijeg rukopisa.",
                        "choices": [
                            {"label": "Neverovatno je kako su boje i zlato sačuvani posle osam vekova.", "nextId": "d2"},
                            {"label": "Kojim tačno jezikom je pisan ovaj spomenik?", "nextId": "d3"}
                        ]
                    },
                    {
                        "id": "d2",
                        "speaker": "Kustos Muzeja",
                        "avatar": "teacher",
                        "text": "Pergament i prirodni pigmenti na bazi minerala i zlata omogućili su ovakvu trajnost.",
                        "choices": [
                            {"label": "To svedoči o vrhunskoj umetnosti naših prepisivača.", "nextId": "d4"}
                        ]
                    },
                    {
                        "id": "d3",
                        "speaker": "Kustos Muzeja",
                        "avatar": "teacher",
                        "text": "Pisan je srpskoslovenskim jezikom, to je staroslovenski sa elementima srpske fonetike.",
                        "choices": [
                            {"label": "Tu se već vide začeci narodnog govora u pismu.", "nextId": "d4"}
                        ]
                    },
                    {
                        "id": "d4",
                        "speaker": "Kustos Muzeja",
                        "avatar": "teacher",
                        "text": "Tako je, to je neprocenjivo svedočanstvo našeg kulturnog identiteta i pismenosti.",
                        "choices": []
                    }
                ]
            }
        }
    },

    # 8. Stokavsko narecje
    {
        "slug": "stokavsko-narecje-i-standardni-srpski",
        "title": "Štokavsko narečje i osnova standardnog jezika",
        "summary": "Razmatramo dijalekatsku podelu srpskog jezika, razliku između ekavice i ijekavice i normu standardnog govora.",
        "level": "B2",
        "lessonType": "grammar",
        "topic": "Dijalektologija",
        "tags": ["dijalekti", "štokavski", "ekavica", "ijekavica"],
        "estimatedMinutes": 20,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Štokavsko narečje kao temelj standarda"},
                {"id": "t2", "type": "paragraph", "text": "Južnoslovenski govori se prema upitnoj zamenici šta ili što dele na štokavsko, čakavsko i kajkavsko narečje. Standardni srpski jezik zasniva se na novoštokavskim govorima, pre svega na istočnohercegovačkom i šumadijsko-vojvođanskom dijalektu."},
                {"id": "t3", "type": "table", "rows": [
                    ["Izgovor starog glasa jat", "Ekavski izgovor", "Ijekavski izgovor", "Primer reči"],
                    ["Kratak slog", "mleko, pesma", "mlijeko, pjesma", "dete / dijete, deca / djeca"],
                    ["Dug slog", "reka, vreme", "rijeka, vrijeme", "vreme / vrijeme"],
                    ["Ispred glasa o", "video, voleo", "vidio, volio", "hteo / htio"]
                ]},
                {"id": "t4", "type": "heading", "text": "Ravnopravnost ekavice i ijekavice"},
                {"id": "t5", "type": "paragraph", "text": "U srpskom književnom standardu i ekavski i ijekavski izgovor su potpuno ravnopravni. Ekavica preovladava u Srbiji, dok je ijekavica uobičajena u Republici Srpskoj i Crnoj Gori."},
                {"id": "t6", "type": "quote", "text": "Važno pravilo u tekstu je doslednost, ne treba mešati ekavske i ijekavske oblike unutar istog teksta."}
            ],
            "markdown": "## Štokavsko narečje kao temelj standarda\n\nJužnoslovenski govori se prema upitnoj zamenici šta ili što dele na štokavsko, čakavsko i kajkavsko narečje. Standardni srpski jezik zasniva se na novoštokavskim govorima, pre svega na istočnohercegovačkom i šumadijsko-vojvođanskom dijalektu.\n\n| Izgovor starog glasa jat | Ekavski izgovor | Ijekavski izgovor | Primer reči |\n| --- | --- | --- | --- |\n| Kratak slog | mleko, pesma | mlijeko, pjesma | dete / dijete, deca / djeca |\n| Dug slog | reka, vreme | rijeka, vrijeme | vreme / vrijeme |\n| Ispred glasa o | video, voleo | vidio, volio | hteo / htio |\n\n## Ravnopravnost ekavice i ijekavice\n\nU srpskom književnom standardu i ekavski i ijekavski izgovor su potpuno ravnopravni. Ekavica preovladava u Srbiji, dok je ijekavica uobičajena u Republici Srpskoj i Crnoj Gori.\n\n> Važno pravilo u tekstu je doslednost, ne treba mešati ekavske i ijekavske oblike unutar istog teksta.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Koje narečje je uzeto za osnovu savremenog srpskog književnog jezika", "options": ["Štokavsko narečje", "Kajkavsko narečje", "Čakavsko narečje", "Torlačko narečje"], "answer": "Štokavsko narečje", "explanation": "Novoštokavski dijalekti čine temelj standardnog jezika"},
                {"id": "e2", "type": "fill_blank", "prompt": "Prebacite reč mleko u ijekavski izgovor", "context": "Kupio sam sveže ___ u prodavnici.", "answer": "mlijeko", "acceptedAnswers": ["mlijeko"], "explanation": "Dugi glas jat u ijekavici daje -ije- pa reč glasi mlijeko"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Složite rečenicu o ravnopravnosti izgovora", "tokens": ["Ekavica", "i", "ijekavica", "su", "ravnopravne", "u", "standardu"], "answer": "Ekavica i ijekavica su ravnopravne u standardu", "explanation": "Oba izgovora su potpuno priznata u srpskoj normi"},
                {"id": "e4", "type": "matching", "prompt": "Povežite ekavske oblike sa njihovim ijekavskim parnjacima", "pairs": [
                    {"left": "lepo", "right": "lijepo"},
                    {"left": "vetar", "right": "vjetar"},
                    {"left": "zvezda", "right": "zvijezda"},
                    {"left": "čovek", "right": "čovjek"}
                ], "explanation": "U zavisnosti od dužine sloga javlja se je ili ije"},
                {"id": "e5", "type": "translator_duel", "prompt": "Prevedite na ruski rečenicu «Doslednost u izgovoru je osnovna norma standardnog jezika»", "context": "Doslednost u izgovoru je osnovna norma standardnog jezika.", "answer": "Последовательность в произношении является базовой нормой литературного языка.", "referenceAnswer": "Последовательность в произношении является базовой нормой литературного языка.", "acceptedAnswers": ["Последовательность в произношении является базовой нормой литературного языка.", "Последовательность в произношении это основная норма литературного языка."], "explanation": "Reč doslednost znači posledovatelnost"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {
                        "id": "d1",
                        "speaker": "Milica",
                        "avatar": "woman",
                        "text": "Primetila sam da u Banjaluci govore mlijeko a u Beogradu mleko.",
                        "choices": [
                            {"label": "Da, to je razlika između ijekavice i ekavice.", "nextId": "d2"},
                            {"label": "Da li su oba oblika gramatički pravilna?", "nextId": "d3"}
                        ]
                    },
                    {
                        "id": "d2",
                        "speaker": "Milica",
                        "avatar": "woman",
                        "text": "Fascinantno je kako se govornici savršeno razumeju bez ikakvih prepreka.",
                        "choices": [
                            {"label": "Razlike su samo u zameni starog glasa jat.", "nextId": "d4"}
                        ]
                    },
                    {
                        "id": "d3",
                        "speaker": "Milica",
                        "avatar": "woman",
                        "text": "Potpuno su ravnopravni u srpskom književnom jeziku i medijima.",
                        "choices": [
                            {"label": "To obogaćuje naš jezik i književnost.", "nextId": "d4"}
                        ]
                    },
                    {
                        "id": "d4",
                        "speaker": "Milica",
                        "avatar": "woman",
                        "text": "Bogatstvo dijalekata i izgovora svedoči o dugoj i živoj istoriji jezika.",
                        "choices": []
                    }
                ]
            }
        }
    },

    # 9. Razvoj i istorija gramatike
    {
        "slug": "razvoj-i-istorija-srpske-gramatike",
        "title": "Razvoj i istorija srpske gramatike",
        "summary": "Analiziramo kako su se kroz vekove menjali padeži, glagolski oblici i kako je nestao dual u srpskom jeziku.",
        "level": "B2",
        "lessonType": "grammar",
        "topic": "Istorijska gramatika",
        "tags": ["gramatika", "istorija", "padezi", "glagoli"],
        "estimatedMinutes": 20,
        "script": "latin",
        "coverUrl": "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=800&q=80",
        "content": {
            "theory": [
                {"id": "t1", "type": "heading", "text": "Kako se menjala gramatička struktura"},
                {"id": "t2", "type": "paragraph", "text": "Srpski jezik je zadržao bogat sistem od sedam padeža, ali je tokom vekova pojednostavio neke arhaične kategorije. Tako je nestao dual (dvojina), a ostaci dvojine vide se i danas iza brojeva dva, tri i četiri."},
                {"id": "t3", "type": "table", "rows": [
                    ["Pojava", "Arhaično stanje", "Savremeno stanje", "Primer"],
                    ["Dvojina (dual)", "Posebni oblici za dva predmeta", "Paukalni oblici iza 2, 3, 4", "dva grada, tri žene"],
                    ["Glagolska vremena", "Česta upotreba aorista i imperfekta", "Dominacija perfekta", "uradio sam umesto uradih"],
                    ["Infinitiv", "Široka upotreba infinitiva", "Konstrukcija da + prezent", "hoću da radim umesto hoću raditi"]
                ]},
                {"id": "t4", "type": "heading", "text": "Spajanje oblika dativa i lokativa"},
                {"id": "t5", "type": "paragraph", "text": "U savremenom srpskom jeziku oblici dativa i lokativa su se u potpunosti izjednačili i u jednini i u množini. Razlika među njima ostala je samo u predloškom upravljanju i značenju."},
                {"id": "t6", "type": "quote", "text": "Nestanak posebnih nastavaka za lokativ pojednostavio je učenje padeža bez gubitka preciznosti u govoru."}
            ],
            "markdown": "## Kako se menjala gramatička struktura\n\nSrpski jezik je zadržao bogat sistem od sedam padeža, ali je tokom vekova pojednostavio neke arhaične kategorije. Tako je nestao dual (dvojina), a ostaci dvojine vide se i danas iza brojeva dva, tri i četiri.\n\n| Pojava | Arhaično stanje | Savremeno stanje | Primer |\n| --- | --- | --- | --- |\n| Dvojina (dual) | Posebni oblici za dva predmeta | Paukalni oblici iza 2, 3, 4 | dva grada, tri žene |\n| Glagolska vremena | Česta upotreba aorista i imperfekta | Dominacija perfekta | uradio sam umesto uradih |\n| Infinitiv | Široka upotreba infinitiva | Konstrukcija da + prezent | hoću da radim umesto hoću raditi |\n\n## Spajanje oblika dativa i lokativa\n\nU savremenom srpskom jeziku oblici dativa i lokativa su se u potpunosti izjednačili i u jednini i u množini. Razlika među njima ostala je samo u predloškom upravljanju i značenju.\n\n> Nestanak posebnih nastavaka za lokativ pojednostavio je učenje padeža bez gubitka preciznosti u govoru.",
            "exercises": [
                {"id": "e1", "type": "multiple_choice", "prompt": "Gde se u savremenom jeziku vide ostaci starog duala (dvojine)", "options": ["U oblicima iza brojeva dva, tri i četiri", "U oblicima za množinu preko pet", "U imperfektu i aoristu", "U vokativu jednine"], "answer": "U oblicima iza brojeva dva, tri i četiri", "explanation": "Oblici dva grada ili tri sela predstavljaju nekadašnju dvojinu"},
                {"id": "e2", "type": "fill_blank", "prompt": "Koji padež se po nastavcima potpuno izjednačio sa dativom", "context": "U savremenom jeziku dativ ima iste nastavke kao i ___.", "answer": "lokativ", "acceptedAnswers": ["lokativ"], "explanation": "Dativ i lokativ imaju identične završetke u svim rodovima"},
                {"id": "e3", "type": "sentence_builder", "prompt": "Složite rečenicu o razvoju glagolskog sistema", "tokens": ["Perfekat", "je", "postao", "glavno", "prošlo", "vreme", "u", "govoru"], "answer": "Perfekat je postao glavno prošlo vreme u govoru", "explanation": "Perfekat je potisnuo aorist i imperfekat u svakodnevnom govoru"},
                {"id": "e4", "type": "matching", "prompt": "Povežite istorijske gramatičke pojave sa objašnjenjem", "pairs": [
                    {"left": "paukal", "right": "oblik za malu količinu iza 2, 3, 4"},
                    {"left": "aorist", "right": "momenatno svršeno prošlo vreme"},
                    {"left": "imperfekat", "right": "nekadašnje nesvršeno prošlo vreme"},
                    {"left": "sinteza dativa i lokativa", "right": "spajanje nastavaka dva padeža"}
                ], "explanation": "Ovi procesi su oblikovali moderni srpski jezik"},
                {"id": "e5", "type": "translator_duel", "prompt": "Prevedite na ruski «Srpski jezik je sačuvao sedam padeža uz jasnu sintaksu»", "context": "Srpski jezik je sačuvao sedam padeža uz jasnu sintaksu.", "answer": "Сербский язык сохранил семь падежей с ясным синтаксисом.", "referenceAnswer": "Сербский язык сохранил семь падежей с ясным синтаксисом.", "acceptedAnswers": ["Сербский язык сохранил семь падежей с ясным синтаксисом.", "Сербский язык сохранил семь падежей вместе с ясным синтаксисом."], "explanation": "Reč sačuvao znači sohranil"}
            ],
            "dialogue": {
                "startId": "d1",
                "nodes": [
                    {
                        "id": "d1",
                        "speaker": "Profesor Lingvistike",
                        "avatar": "teacher",
                        "text": "Dobar dan kolege, danas govorimo o tome kako se menjao srpski padežni sistem.",
                        "choices": [
                            {"label": "Fascinantno je kako je jezik sačuvao svih sedam padeža.", "nextId": "d2"},
                            {"label": "Zašto su se dativ i lokativ morfološki izjednačili?", "nextId": "d3"}
                        ]
                    },
                    {
                        "id": "d2",
                        "speaker": "Profesor Lingvistike",
                        "avatar": "teacher",
                        "text": "Da, za razliku od bugarskog ili makedonskog, srpski je očuvao punu deklinaciju.",
                        "choices": [
                            {"label": "To daje izuzetnu preciznost u izražavanju misli.", "nextId": "d4"}
                        ]
                    },
                    {
                        "id": "d3",
                        "speaker": "Profesor Lingvistike",
                        "avatar": "teacher",
                        "text": "To je prirodan proces jezičke ekonomije gde predlozi jasno nose razliku u značenju.",
                        "choices": [
                            {"label": "Ipak je funkcija ostala potpuno jasna i razgraničena.", "nextId": "d4"}
                        ]
                    },
                    {
                        "id": "d4",
                        "speaker": "Profesor Lingvistike",
                        "avatar": "teacher",
                        "text": "Upravo tako, istorijska gramatika nam otkriva logiku i lepotu savremenog jezika.",
                        "choices": []
                    }
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
