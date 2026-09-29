# -*- coding: utf-8 -*-
"""Собирает topics.json из таблицы ниже. Запуск: python gen_topics.py"""
import json
import pathlib
import re

GENRES = [
    ("politika", "🏛️", "Политика и общество", "Politika i društvo"),
    ("nauka", "🔬", "Наука", "Nauka"),
    ("moda", "👗", "Мода", "Moda"),
    ("umetnost", "🎨", "Искусство", "Umetnost"),
    ("tehnologija", "💻", "Технологии", "Tehnologija"),
    ("sport", "⚽", "Спорт", "Sport"),
    ("hrana", "🍲", "Еда", "Hrana"),
    ("putovanja", "✈️", "Путешествия", "Putovanja"),
    ("zdravlje", "🩺", "Здоровье", "Zdravlje"),
    ("istorija", "🏰", "История", "Istorija"),
    ("priroda", "🌿", "Природа", "Priroda"),
    ("obrazovanje", "🎓", "Образование", "Obrazovanje"),
    ("porodica", "👨‍👩‍👧", "Семья и отношения", "Porodica i odnosi"),
    ("film", "🎬", "Кино и музыка", "Film i muzika"),
    ("posao", "💼", "Работа и деньги", "Posao i novac"),
]

# (сербская формулировка, русская, [(слово, перевод) × 3])
T = {
    "politika": [
        ("Da li glasanje treba da bude obavezno?", "Должно ли голосование быть обязательным?", [("glasanje", "голосование"), ("obavezan", "обязательный"), ("izbori", "выборы")]),
        ("Kakav treba da bude dobar političar?", "Каким должен быть хороший политик?", [("političar", "политик"), ("poštenje", "честность"), ("obećanje", "обещание")]),
        ("Treba li sniziti starosnu granicu za glasanje na šesnaest godina?", "Стоит ли снизить возраст голосования до шестнадцати лет?", [("glasati", "голосовать"), ("mladi", "молодёжь"), ("pravo", "право")]),
        ("Kakva bi bila tvoja idealna država?", "Какой была бы твоя идеальная страна?", [("država", "государство"), ("zakon", "закон"), ("sloboda", "свобода")]),
        ("Da li je Evropska unija dobra za male zemlje?", "Полезен ли Евросоюз для маленьких стран?", [("članica", "страна-участница"), ("granica", "граница"), ("saradnja", "сотрудничество")]),
        ("Koliko su mediji objektivni?", "Насколько объективны СМИ?", [("mediji", "СМИ"), ("vest", "новость"), ("istina", "правда")]),
        ("Treba li građani češće da odlučuju na referendumu?", "Стоит ли гражданам чаще решать вопросы на референдуме?", [("referendum", "референдум"), ("odluka", "решение"), ("građanin", "гражданин")]),
        ("Kako bi trebalo rešiti problem korupcije?", "Как нужно решать проблему коррупции?", [("korupcija", "коррупция"), ("mito", "взятка"), ("kazna", "наказание")]),
        ("Šta znači biti dobar građanin?", "Что значит быть хорошим гражданином?", [("dužnost", "долг"), ("poštovati", "уважать"), ("zajednica", "сообщество")]),
        ("Da li protesti mogu da promene društvo?", "Могут ли протесты изменить общество?", [("protest", "протест"), ("promena", "перемена"), ("društvo", "общество")]),
    ],
    "nauka": [
        ("Da li postoji život na drugim planetama?", "Существует ли жизнь на других планетах?", [("planeta", "планета"), ("život", "жизнь"), ("svemir", "космос")]),
        ("Koje otkriće je najviše promenilo svet?", "Какое открытие сильнее всего изменило мир?", [("otkriće", "открытие"), ("izum", "изобретение"), ("naučnik", "учёный")]),
        ("Treba li više novca ulagati u istraživanje svemira?", "Стоит ли вкладывать больше денег в исследование космоса?", [("ulagati", "вкладывать"), ("istraživanje", "исследование"), ("raketa", "ракета")]),
        ("Kako bi izgledao tvoj idealan naučni eksperiment?", "Как выглядел бы твой идеальный научный эксперимент?", [("eksperiment", "эксперимент"), ("hipoteza", "гипотеза"), ("rezultat", "результат")]),
        ("Da li veštačka inteligencija može da bude kreativna?", "Может ли искусственный интеллект быть творческим?", [("veštačka inteligencija", "искусственный интеллект"), ("kreativan", "творческий"), ("mašina", "машина")]),
        ("Šta je Nikola Tesla dao svetu?", "Что Никола Тесла дал миру?", [("struja", "электричество"), ("pronalazač", "изобретатель"), ("patent", "патент")]),
        ("Da li je klimatska promena najveći problem današnjice?", "Является ли изменение климата главной проблемой сегодняшнего дня?", [("klima", "климат"), ("zagrevanje", "потепление"), ("posledica", "последствие")]),
        ("Zašto je važno učiti matematiku?", "Почему важно учить математику?", [("matematika", "математика"), ("zadatak", "задача"), ("logika", "логика")]),
        ("Koliko verujemo naučnicima?", "Насколько мы доверяем учёным?", [("verovati", "верить"), ("dokaz", "доказательство"), ("stručnjak", "специалист")]),
        ("Kako bi izgledao život bez struje?", "Как выглядела бы жизнь без электричества?", [("struja", "электричество"), ("svetlo", "свет"), ("navika", "привычка")]),
    ],
    "moda": [
        ("Da li je moda važna za tebe?", "Важна ли для тебя мода?", [("moda", "мода"), ("stil", "стиль"), ("odeća", "одежда")]),
        ("Koju odeću najradije nosiš i zašto?", "Какую одежду ты носишь охотнее всего и почему?", [("nositi", "носить"), ("udobno", "удобно"), ("boja", "цвет")]),
        ("Da li brendovi vrede svoje cene?", "Стоят ли бренды своих денег?", [("marka", "марка, бренд"), ("skup", "дорогой"), ("kvalitet", "качество")]),
        ("Treba li u školi nositi uniformu?", "Нужно ли носить в школе форму?", [("uniforma", "форма"), ("razlika", "различие"), ("škola", "школа")]),
        ("Kako se moda menjala kroz istoriju?", "Как менялась мода на протяжении истории?", [("trend", "тренд"), ("vek", "век"), ("promena", "перемена")]),
        ("Da li je polovna odeća dobra ideja?", "Хорошая ли идея — покупать одежду с рук?", [("polovan", "подержанный"), ("štedeti", "экономить"), ("ekološki", "экологичный")]),
        ("Kako se oblačiš za posao ili razgovor za posao?", "Как ты одеваешься на работу или на собеседование?", [("odelo", "костюм"), ("utisak", "впечатление"), ("oblačiti se", "одеваться")]),
        ("Šta misliš o brzoj modi i bacanju odeće?", "Что ты думаешь о быстрой моде и выбрасывании одежды?", [("bacati", "выбрасывать"), ("otpad", "отходы"), ("proizvodnja", "производство")]),
        ("Opiši svoj omiljeni komad odeće.", "Опиши свою любимую вещь из одежды.", [("omiljen", "любимый"), ("materijal", "материал"), ("veličina", "размер")]),
        ("Da li izgled utiče na to kako nas drugi vide?", "Влияет ли внешность на то, как нас видят другие?", [("izgled", "внешность"), ("utisak", "впечатление"), ("predrasuda", "предрассудок")]),
    ],
    "umetnost": [
        ("Šta je za tebe prava umetnost?", "Что для тебя настоящее искусство?", [("umetnost", "искусство"), ("slika", "картина"), ("izložba", "выставка")]),
        ("Zašto bi trebalo ići u muzeje?", "Зачем ходить в музеи?", [("muzej", "музей"), ("eksponat", "экспонат"), ("ulaznica", "входной билет")]),
        ("Koji umetnik ti je najdraži i zašto?", "Какой художник или артист тебе ближе всех и почему?", [("umetnik", "художник, артист"), ("delo", "произведение"), ("stil", "стиль")]),
        ("Da li umetnost mora da bude lepa?", "Обязано ли искусство быть красивым?", [("lep", "красивый"), ("poruka", "посыл"), ("osećanje", "чувство")]),
        ("Koju knjigu bi svako trebalo da pročita?", "Какую книгу стоило бы прочитать каждому?", [("knjiga", "книга"), ("pisac", "писатель"), ("roman", "роман")]),
        ("Da li su grafiti umetnost ili vandalizam?", "Граффити — это искусство или вандализм?", [("grafit", "граффити"), ("zid", "стена"), ("zabraniti", "запретить")]),
        ("Opiši sliku ili skulpturu koja ti se svidela.", "Опиши картину или скульптуру, которая тебе понравилась.", [("skulptura", "скульптура"), ("boja", "цвет"), ("izraz", "выражение")]),
        ("Zašto je poezija važna?", "Почему поэзия важна?", [("pesma", "стихотворение"), ("stih", "строка"), ("rima", "рифма")]),
        ("Da li država treba da finansira umetnost?", "Должно ли государство финансировать искусство?", [("finansirati", "финансировать"), ("kultura", "культура"), ("pozorište", "театр")]),
        ("Da li ti je bliže slikanje, pisanje ili gluma?", "Что тебе ближе — рисование, писательство или актёрство?", [("slikati", "рисовать"), ("glumiti", "играть роль"), ("talenat", "талант")]),
    ],
    "tehnologija": [
        ("Koliko vremena dnevno provodiš na telefonu?", "Сколько времени в день ты проводишь в телефоне?", [("telefon", "телефон"), ("ekran", "экран"), ("aplikacija", "приложение")]),
        ("Da li društvene mreže zbližavaju ili udaljavaju ljude?", "Сближают ли соцсети людей или отдаляют их?", [("društvene mreže", "соцсети"), ("zbližavati", "сближать"), ("udaljavati", "отдалять")]),
        ("Treba li deci zabraniti telefone u školi?", "Нужно ли запретить детям телефоны в школе?", [("zabraniti", "запретить"), ("dete", "ребёнок"), ("pažnja", "внимание")]),
        ("Da li će roboti ljudima oduzeti posao?", "Отнимут ли роботы у людей работу?", [("robot", "робот"), ("oduzeti", "отнять"), ("posao", "работа")]),
        ("Kako bi izgledao dan bez interneta?", "Как выглядел бы день без интернета?", [("internet", "интернет"), ("veza", "связь"), ("dosada", "скука")]),
        ("Da li je bezbedno čuvati lične podatke na mreži?", "Безопасно ли хранить личные данные в сети?", [("lozinka", "пароль"), ("podaci", "данные"), ("bezbednost", "безопасность")]),
        ("Kako izgleda automobil budućnosti?", "Как выглядит автомобиль будущего?", [("automobil", "автомобиль"), ("električni", "электрический"), ("samovozeći", "беспилотный")]),
        ("Da li je bolje čitati papirnu ili elektronsku knjigu?", "Что лучше читать — бумажную или электронную книгу?", [("papir", "бумага"), ("čitač", "читалка"), ("polica", "полка")]),
        ("Koji izum ti je najkorisniji u domu?", "Какое изобретение самое полезное в твоём доме?", [("izum", "изобретение"), ("uređaj", "устройство"), ("koristan", "полезный")]),
        ("Da li ljudi previše zavise od tehnologije?", "Слишком ли сильно люди зависят от технологий?", [("zavisiti", "зависеть"), ("navika", "привычка"), ("ravnoteža", "баланс")]),
    ],
    "sport": [
        ("Koji sport voliš da gledaš, a koji da igraš?", "Какой спорт ты любишь смотреть, а каким — заниматься?", [("sport", "спорт"), ("gledati", "смотреть"), ("igrati", "играть")]),
        ("Zašto je Novak Đoković toliko uspešan?", "Почему Новак Джокович так успешен?", [("teniser", "теннисист"), ("pobeda", "победа"), ("trening", "тренировка")]),
        ("Da li je fudbal postao previše komercijalan?", "Стал ли футбол слишком коммерческим?", [("fudbal", "футбол"), ("klub", "клуб"), ("novac", "деньги")]),
        ("Treba li fizičko vaspitanje da bude obavezno u školi?", "Должна ли физкультура быть обязательной в школе?", [("vežbati", "заниматься физически"), ("zdravlje", "здоровье"), ("čas", "урок")]),
        ("Opiši utakmicu koja ti je ostala u sećanju.", "Опиши матч, который тебе запомнился.", [("utakmica", "матч"), ("navijač", "болельщик"), ("rezultat", "результат")]),
        ("Da li sportisti zarađuju previše?", "Не слишком ли много зарабатывают спортсмены?", [("sportista", "спортсмен"), ("plata", "зарплата"), ("ugovor", "контракт")]),
        ("Šta misliš o ekstremnim sportovima?", "Что ты думаешь об экстремальных видах спорта?", [("ekstreman", "экстремальный"), ("rizik", "риск"), ("adrenalin", "адреналин")]),
        ("Kako da počnemo da se bavimo rekreacijom?", "Как начать заниматься спортом для себя?", [("rekreacija", "активный отдых"), ("kondicija", "форма"), ("redovno", "регулярно")]),
        ("Zašto su Olimpijske igre važne?", "Почему Олимпийские игры важны?", [("medalja", "медаль"), ("takmičenje", "соревнование"), ("zemlja", "страна")]),
        ("Da li je timski sport bolji od pojedinačnog?", "Командный спорт лучше индивидуального?", [("tim", "команда"), ("pojedinačni", "индивидуальный"), ("saradnja", "сотрудничество")]),
    ],
    "hrana": [
        ("Šta je tvoje omiljeno jelo i kako se sprema?", "Какое твоё любимое блюдо и как его готовят?", [("jelo", "блюдо"), ("spremati", "готовить"), ("sastojak", "ингредиент")]),
        ("Da li je domaća hrana zdravija od restoranske?", "Полезнее ли домашняя еда ресторанной?", [("domaći", "домашний"), ("restoran", "ресторан"), ("zdrav", "здоровый")]),
        ("Šta znaš o srpskoj kuhinji?", "Что ты знаешь о сербской кухне?", [("ćevapi", "чевапчичи"), ("sarma", "голубцы"), ("rakija", "ракия")]),
        ("Da li treba postati vegetarijanac?", "Стоит ли становиться вегетарианцем?", [("vegetarijanac", "вегетарианец"), ("meso", "мясо"), ("povrće", "овощи")]),
        ("Kako izgleda idealan doručak?", "Как выглядит идеальный завтрак?", [("doručak", "завтрак"), ("jaje", "яйцо"), ("kafa", "кофе")]),
        ("Da li je brza hrana nezdrava?", "Вредна ли быстрая еда?", [("brza hrana", "фастфуд"), ("masno", "жирный"), ("porcija", "порция")]),
        ("Kako se ponašamo za stolom kad smo u gostima?", "Как мы ведём себя за столом в гостях?", [("gost", "гость"), ("sto", "стол"), ("ljubazan", "вежливый")]),
        ("Voliš li da kuvaš ili više voliš da jedeš?", "Ты любишь готовить или больше любишь есть?", [("kuvati", "варить, готовить"), ("recept", "рецепт"), ("kuhinja", "кухня")]),
        ("Kako bismo mogli da bacamo manje hrane?", "Как нам выбрасывать меньше еды?", [("bacati", "выбрасывать"), ("ostaci", "остатки"), ("planirati", "планировать")]),
        ("Opiši najbolji obrok u životu.", "Опиши лучший приём пищи в твоей жизни.", [("obrok", "приём пищи"), ("ukus", "вкус"), ("društvo", "компания")]),
    ],
    "putovanja": [
        ("Opiši idealan odmor.", "Опиши идеальный отпуск.", [("odmor", "отдых"), ("more", "море"), ("plaža", "пляж")]),
        ("Da li je bolje putovati sam ili u grupi?", "Лучше путешествовать одному или в компании?", [("sam", "один"), ("grupa", "группа"), ("iskustvo", "опыт")]),
        ("Koju zemlju želiš da posetiš i zašto?", "В какую страну ты хочешь поехать и почему?", [("zemlja", "страна"), ("posetiti", "посетить"), ("kultura", "культура")]),
        ("Zašto bi turisti trebalo da posete Beograd?", "Почему туристам стоит посетить Белград?", [("grad", "город"), ("tvrđava", "крепость"), ("reka", "река")]),
        ("Da li je bolje leteti avionom ili putovati vozom?", "Что лучше — лететь самолётом или ехать поездом?", [("avion", "самолёт"), ("voz", "поезд"), ("karta", "билет")]),
        ("Kako se pripremaš za put?", "Как ты готовишься к поездке?", [("kofer", "чемодан"), ("pasoš", "паспорт"), ("rezervacija", "бронь")]),
        ("Šta ti je bilo najneobičnije na nekom putovanju?", "Что было самым необычным в какой-нибудь поездке?", [("neobičan", "необычный"), ("sećanje", "воспоминание"), ("putovanje", "путешествие")]),
        ("Da li je turizam dobar ili loš za mali grad?", "Туризм хорош или плох для маленького города?", [("turista", "турист"), ("zarada", "доход"), ("gužva", "толпа")]),
        ("Kako se sporazumevamo u zemlji čiji jezik ne znamo?", "Как мы общаемся в стране, языка которой не знаем?", [("jezik", "язык"), ("sporazumeti se", "объясниться"), ("gest", "жест")]),
        ("Šta ćeš poneti na usamljeno ostrvo?", "Что ты возьмёшь с собой на необитаемый остров?", [("ostrvo", "остров"), ("poneti", "взять с собой"), ("preživeti", "выжить")]),
    ],
    "zdravlje": [
        ("Kako se čuvaš od bolesti?", "Как ты бережёшься от болезней?", [("bolest", "болезнь"), ("vitamin", "витамин"), ("prehlada", "простуда")]),
        ("Koliko sati sna ti je potrebno?", "Сколько часов сна тебе нужно?", [("san", "сон"), ("umor", "усталость"), ("spavati", "спать")]),
        ("Kako se nosiš sa stresom?", "Как ты справляешься со стрессом?", [("stres", "стресс"), ("opustiti se", "расслабиться"), ("šetnja", "прогулка")]),
        ("Treba li redovno ići kod lekara?", "Нужно ли регулярно ходить к врачу?", [("lekar", "врач"), ("pregled", "осмотр"), ("prevencija", "профилактика")]),
        ("Da li je zdrava ishrana skupa?", "Дорого ли здоровое питание?", [("ishrana", "питание"), ("voće", "фрукты"), ("cena", "цена")]),
        ("Da li je mentalno zdravlje važno kao fizičko?", "Психическое здоровье так же важно, как физическое?", [("mentalno zdravlje", "психическое здоровье"), ("psiholog", "психолог"), ("razgovor", "разговор")]),
        ("Šta misliš o alternativnoj medicini?", "Что ты думаешь об альтернативной медицине?", [("alternativan", "альтернативный"), ("lek", "лекарство"), ("lečenje", "лечение")]),
        ("Kako izgleda tvoj zdrav dan?", "Как выглядит твой здоровый день?", [("vežbanje", "упражнения"), ("voda", "вода"), ("navika", "привычка")]),
        ("Kako izgleda poseta lekaru u tvojoj zemlji?", "Как проходит визит к врачу в твоей стране?", [("zakazati", "записаться"), ("čekanje", "ожидание"), ("recept", "рецепт")]),
        ("Zašto ljudima teško pada da prestanu da puše?", "Почему людям трудно бросить курить?", [("pušiti", "курить"), ("navika", "привычка"), ("zavisnost", "зависимость")]),
    ],
    "istorija": [
        ("Koji istorijski događaj ti je najzanimljiviji?", "Какое историческое событие тебе интереснее всего?", [("događaj", "событие"), ("vek", "век"), ("rat", "война")]),
        ("Da postoji vremeplov, u koje doba želiš da otputuješ?", "Если бы существовала машина времени, в какую эпоху ты хочешь отправиться?", [("vremeplov", "машина времени"), ("prošlost", "прошлое"), ("budućnost", "будущее")]),
        ("Koja istorijska ličnost te najviše inspiriše?", "Какая историческая личность вдохновляет тебя больше всех?", [("ličnost", "личность"), ("vladar", "правитель"), ("inspirisati", "вдохновлять")]),
        ("Zašto učimo istoriju?", "Зачем мы учим историю?", [("greška", "ошибка"), ("pouka", "урок, вывод"), ("pamćenje", "память")]),
        ("Šta znaš o istoriji svoje zemlje?", "Что ты знаешь об истории своей страны?", [("carstvo", "империя"), ("nezavisnost", "независимость"), ("granica", "граница")]),
        ("Kako je izgledao život pre sto godina?", "Как выглядела жизнь сто лет назад?", [("svakodnevica", "повседневность"), ("selo", "деревня"), ("zanat", "ремесло")]),
        ("Da li su spomenici važni za pamćenje?", "Важны ли памятники для памяти?", [("spomenik", "памятник"), ("sećanje", "воспоминание"), ("sačuvati", "сохранить")]),
        ("Kako su ratovi menjali Evropu?", "Как войны меняли Европу?", [("rat", "война"), ("mir", "мир"), ("granica", "граница")]),
        ("Kakav je bio život u srednjem veku?", "Какой была жизнь в Средние века?", [("srednji vek", "Средневековье"), ("tvrđava", "крепость"), ("vitez", "рыцарь")]),
        ("Da li istoriju piše pobednik?", "Правда ли, что историю пишет победитель?", [("pobednik", "победитель"), ("istina", "правда"), ("udžbenik", "учебник")]),
    ],
    "priroda": [
        ("Kako možemo da zaštitimo životnu sredinu?", "Как мы можем защитить окружающую среду?", [("životna sredina", "окружающая среда"), ("reciklirati", "перерабатывать"), ("otpad", "отходы")]),
        ("Voliš li više planinu ili more?", "Что тебе больше нравится — горы или море?", [("planina", "гора"), ("more", "море"), ("vazduh", "воздух")]),
        ("Koje godišnje doba ti je najdraže?", "Какое время года тебе нравится больше всего?", [("godišnje doba", "время года"), ("sneg", "снег"), ("leto", "лето")]),
        ("Treba li zabraniti plastične kese?", "Нужно ли запретить пластиковые пакеты?", [("plastika", "пластик"), ("kesa", "пакет"), ("zabrana", "запрет")]),
        ("Koju životinju želiš da imaš kao ljubimca?", "Какое животное ты хочешь завести дома?", [("životinja", "животное"), ("ljubimac", "питомец"), ("pas", "собака")]),
        ("Zašto su šume važne?", "Почему леса важны?", [("šuma", "лес"), ("drvo", "дерево"), ("kiseonik", "кислород")]),
        ("Kako izgleda tvoja idealna šetnja u prirodi?", "Как выглядит твоя идеальная прогулка на природе?", [("šetnja", "прогулка"), ("potok", "ручей"), ("cvet", "цветок")]),
        ("Da li je bolje živeti u gradu ili na selu?", "Где лучше жить — в городе или в деревне?", [("selo", "деревня"), ("grad", "город"), ("mir", "покой")]),
        ("Šta misliš o nacionalnim parkovima?", "Что ты думаешь о национальных парках?", [("park", "парк"), ("zaštićen", "охраняемый"), ("divlji", "дикий")]),
        ("Kako vreme utiče na tvoje raspoloženje?", "Как погода влияет на твоё настроение?", [("vreme", "погода"), ("kiša", "дождь"), ("raspoloženje", "настроение")]),
    ],
    "obrazovanje": [
        ("Kakav treba da bude dobar nastavnik?", "Каким должен быть хороший учитель?", [("nastavnik", "учитель"), ("strpljenje", "терпение"), ("objasniti", "объяснить")]),
        ("Imaju li domaći zadaci smisla?", "Есть ли смысл в домашних заданиях?", [("domaći zadatak", "домашнее задание"), ("smisao", "смысл"), ("opterećenje", "нагрузка")]),
        ("Kako najlakše učiš strani jezik?", "Как тебе легче всего учить иностранный язык?", [("strani jezik", "иностранный язык"), ("reč", "слово"), ("vežbati", "упражняться")]),
        ("Da li fakultet garantuje dobar posao?", "Гарантирует ли университет хорошую работу?", [("fakultet", "факультет"), ("diploma", "диплом"), ("posao", "работа")]),
        ("Da li je bolje učiti od kuće ili u školi?", "Лучше учиться дома или в школе?", [("učionica", "класс"), ("na daljinu", "дистанционно"), ("drugovi", "друзья, одноклассники")]),
        ("Koji školski predmet ti je bio najdraži?", "Какой школьный предмет тебе нравился больше всего?", [("predmet", "предмет"), ("ocena", "оценка"), ("čas", "урок")]),
        ("Treba li ukinuti ocene u školi?", "Нужно ли отменить школьные оценки?", [("ocena", "оценка"), ("motivacija", "мотивация"), ("ispit", "экзамен")]),
        ("Šta bi promenio u obrazovnom sistemu?", "Что бы ты изменил в системе образования?", [("sistem", "система"), ("program", "программа"), ("promeniti", "изменить")]),
        ("Zašto je čitanje važno?", "Почему чтение важно?", [("čitati", "читать"), ("mašta", "воображение"), ("rečnik", "словарь")]),
        ("Kako možemo da učimo celog života?", "Как мы можем учиться всю жизнь?", [("celog života", "всю жизнь"), ("iskustvo", "опыт"), ("kurs", "курс")]),
    ],
    "porodica": [
        ("Opiši svoju porodicu.", "Расскажи о своей семье.", [("porodica", "семья"), ("roditelji", "родители"), ("brat", "брат")]),
        ("Šta znači dobro prijateljstvo?", "Что такое хорошая дружба?", [("prijatelj", "друг"), ("poverenje", "доверие"), ("podrška", "поддержка")]),
        ("Kako rešavaš svađu sa bliskom osobom?", "Как ты решаешь ссору с близким человеком?", [("svađa", "ссора"), ("izvinjenje", "извинение"), ("razumeti", "понимать")]),
        ("Da li je bolje imati veliku ili malu porodicu?", "Лучше иметь большую или маленькую семью?", [("veliki", "большой"), ("deca", "дети"), ("slavlje", "праздник")]),
        ("Kako provodite praznike u porodici?", "Как вы проводите праздники в семье?", [("praznik", "праздник"), ("ručak", "обед"), ("tradicija", "традиция")]),
        ("Šta su te roditelji naučili što ti je najvažnije?", "Чему тебя научили родители — что для тебя важнее всего?", [("naučiti", "научить"), ("savet", "совет"), ("vrednost", "ценность")]),
        ("Kakav je idealan komšija?", "Каким должен быть идеальный сосед?", [("komšija", "сосед"), ("buka", "шум"), ("pomoć", "помощь")]),
        ("Treba li deca da pomažu u kućnim poslovima?", "Должны ли дети помогать по дому?", [("kućni poslovi", "домашние дела"), ("odgovornost", "ответственность"), ("pomagati", "помогать")]),
        ("Kako upoznati nove ljude u novom gradu?", "Как знакомиться с новыми людьми в новом городе?", [("upoznati", "познакомиться"), ("društvo", "компания"), ("komšiluk", "соседство")]),
        ("Kako se nosimo sa usamljenošću?", "Как нам справляться с одиночеством?", [("usamljenost", "одиночество"), ("prijatelji", "друзья"), ("razgovor", "разговор")]),
    ],
    "film": [
        ("Koji film možeš da gledaš iznova?", "Какой фильм ты можешь смотреть снова и снова?", [("film", "фильм"), ("scena", "сцена"), ("junak", "герой")]),
        ("Da li je knjiga uvek bolja od filma?", "Книга всегда лучше фильма?", [("ekranizacija", "экранизация"), ("knjiga", "книга"), ("zaplet", "сюжет")]),
        ("Kakvu muziku voliš i kada je slušaš?", "Какую музыку ты любишь и когда её слушаешь?", [("muzika", "музыка"), ("pesma", "песня"), ("koncert", "концерт")]),
        ("Šta znaš o srpskim filmovima ili pesmama?", "Что ты знаешь о сербских фильмах или песнях?", [("reditelj", "режиссёр"), ("glumac", "актёр"), ("pesma", "песня")]),
        ("Da li je bolje ići u bioskop ili gledati film kod kuće?", "Лучше ходить в кино или смотреть фильм дома?", [("bioskop", "кинотеатр"), ("karta", "билет"), ("kauč", "диван")]),
        ("Da li pevaš, sviraš ili želiš da naučiš?", "Ты поёшь, играешь на инструменте или хочешь научиться?", [("pevati", "петь"), ("svirati", "играть на инструменте"), ("gitara", "гитара")]),
        ("Koja ti se serija poslednja svidela?", "Какой сериал тебе понравился последним?", [("serija", "сериал"), ("epizoda", "серия"), ("zaplet", "сюжет")]),
        ("Kako muzika utiče na raspoloženje?", "Как музыка влияет на настроение?", [("raspoloženje", "настроение"), ("ritam", "ритм"), ("tekst", "текст песни")]),
        ("Ko je najbolji glumac ili glumica?", "Кто лучший актёр или актриса?", [("glumac", "актёр"), ("uloga", "роль"), ("nagrada", "награда")]),
        ("Da li su festivali dobra zabava?", "Хорошее ли развлечение — фестивали?", [("festival", "фестиваль"), ("publika", "публика"), ("atmosfera", "атмосфера")]),
    ],
    "posao": [
        ("Kakav posao želiš da radiš?", "Какую работу ты хочешь делать?", [("posao", "работа"), ("zanimanje", "профессия"), ("plata", "зарплата")]),
        ("Da li je novac najvažniji za sreću?", "Деньги — самое важное для счастья?", [("novac", "деньги"), ("sreća", "счастье"), ("bogatstvo", "богатство")]),
        ("Kako izgleda tvoj radni dan?", "Как выглядит твой рабочий день?", [("radno vreme", "рабочее время"), ("kolega", "коллега"), ("pauza", "перерыв")]),
        ("Da li je bolje raditi od kuće ili u kancelariji?", "Лучше работать из дома или в офисе?", [("kancelarija", "офис"), ("od kuće", "из дома"), ("produktivnost", "продуктивность")]),
        ("Kako bi trebalo štedeti novac?", "Как стоит копить деньги?", [("štedeti", "экономить, копить"), ("račun", "счёт"), ("trošak", "расход")]),
        ("Želiš li da pokreneš sopstveni biznis?", "Хочешь ли ты открыть собственное дело?", [("pokrenuti", "запустить"), ("preduzeće", "предприятие"), ("rizik", "риск")]),
        ("Šta je važnije: plata ili zadovoljstvo poslom?", "Что важнее: зарплата или удовольствие от работы?", [("zadovoljstvo", "удовлетворение"), ("plata", "зарплата"), ("šef", "начальник")]),
        ("Kako se pripremiti za razgovor za posao?", "Как подготовиться к собеседованию?", [("razgovor za posao", "собеседование"), ("biografija", "резюме"), ("iskustvo", "опыт")]),
        ("Treba li raditi četiri dana nedeljno?", "Нужно ли работать четыре дня в неделю?", [("skraćeno radno vreme", "сокращённый рабочий день"), ("odmor", "отдых"), ("efikasnost", "эффективность")]),
        ("Kako da se izborimo sa poslom koji ne volimo?", "Как справиться с работой, которую не любишь?", [("izboriti se", "справиться"), ("motivacija", "мотивация"), ("promena", "перемена")]),
    ],
}

HERE = pathlib.Path(__file__).parent


def art(genre):
    """Рисованный значок жанра без обёртки <svg>: рамку добавляет клиент."""
    raw = (HERE / "genres" / f"{genre}.svg").read_text(encoding="utf-8")
    body = re.search(r"<svg[^>]*>(.*)</svg>", raw, re.S).group(1)
    return " ".join(line.strip() for line in body.strip().splitlines())


# icon — эмодзи для приложений 1.22.0, новые клиенты рисуют art.
genres = [{"id": g, "icon": i, "art": art(g), "ru": r, "sr": s} for g, i, r, s in GENRES]
topics = []
for g, *_ in GENRES:
    assert len(T[g]) == 10, g
    for n, (sr, ru, words) in enumerate(T[g], 1):
        assert len(words) == 3, (g, n)
        topics.append({"id": f"{g}-{n:02d}", "genre": g, "sr": sr, "ru": ru,
                       "words": [{"sr": a, "ru": b} for a, b in words]})
assert len(topics) == 150, len(topics)
out = HERE / "topics.json"
out.write_text(json.dumps({"genres": genres, "topics": topics}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print("ok", len(topics))
