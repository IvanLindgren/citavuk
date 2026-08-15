// Package translationgame реализует учебную игру «Ты против переводчика».
package translationgame

import (
	"errors"
	"fmt"
	"strings"
)

var ErrInvalidRound = errors.New("неизвестный уровень или раунд")

// Направление перевода. Пустая строка означает сербский→русский: так игра
// работала до появления второго направления, и старые клиенты поля не шлют.
const (
	DirectionSrRu = "sr-ru"
	DirectionRuSr = "ru-sr"
)

// NormalizeDirection приводит значение к известному, пустое — к sr-ru.
func NormalizeDirection(value string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", DirectionSrRu:
		return DirectionSrRu, true
	case DirectionRuSr:
		return DirectionRuSr, true
	}
	return "", false
}

// Languages возвращает коды исходного и целевого языка для направления.
func Languages(direction string) (source, target string) {
	if direction == DirectionRuSr {
		return "ru", "sr"
	}
	return "sr", "ru"
}

// Levels — уровни, на которых в игре есть фразы.
var Levels = []string{"A1", "A2", "B1", "B2", "C1", "C2"}

// KnownLevel проверяет уровень до похода за фразами.
func KnownLevel(level string) bool {
	level = strings.ToUpper(strings.TrimSpace(level))
	for _, known := range Levels {
		if known == level {
			return true
		}
	}
	return false
}

// Sentence — одна фраза раунда. Перевод намеренно отсутствует: его каждый раз
// делает выбранный пользователем сервис, иначе это была бы игра против ключа
// в JSON, а не против DeepL или Google.
type Sentence struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

const sentencesPerRound = 5

var serbianSentences = map[string][]string{
	"A1": {
		"Ja živim u malom gradu.",
		"Moja sestra pije kafu svako jutro.",
		"Danas je hladno, ali sunčano.",
		"Knjiga je na stolu pored prozora.",
		"Mi učimo srpski zajedno.",
		"Autobus dolazi u osam sati.",
		"U frižideru nema mleka.",
		"Petar ima dva psa i jednu mačku.",
		"Molim vas, gde je železnička stanica?",
		"Subotom idem na pijacu.",
		"Ona sada čita kratku priču.",
		"Naša škola je blizu parka.",
		"Hoću čaj bez šećera.",
		"Deca se igraju ispred kuće.",
		"Večeras gledamo novi film.",
	},
	"A2": {
		"Juče sam zakasnio jer autobus nije došao na vreme.",
		"Ako sutra bude lepo vreme, šetaćemo pored reke.",
		"Ana mi je poslala poruku čim je stigla kući.",
		"Treba da kupimo karte pre nego što krenemo.",
		"Ovaj restoran je skuplji, ali je hrana mnogo bolja.",
		"Dok sam čekala prijateljicu, pročitala sam novine.",
		"Možeš li da mi objasniš kako da stignem do muzeja?",
		"Na odmoru smo svakog dana plivali i vozili bicikle.",
		"Nisam poneo kišobran, zato sam se potpuno pokvasio.",
		"Lekar mi je rekao da nekoliko dana ostanem kod kuće.",
		"Kada završiš posao, pozovi me da se dogovorimo.",
		"Stan koji smo pogledali ima veliku terasu.",
		"Volela bih da naučim da kuvam srpska jela.",
		"Paket će stići između ponedeljka i srede.",
		"Iako je bio umoran, završio je sve obaveze.",
	},
	"B1": {
		"Kada sam se preselio u Beograd, trebalo mi je vremena da se naviknem na gradski prevoz.",
		"Mada se nismo unapred dogovorili, svi smo se pojavili gotovo u isto vreme.",
		"Direktorka je objasnila da će rezultati biti objavljeni čim komisija završi rad.",
		"Što više čitam na srpskom, to lakše prepoznajem izraze u svakodnevnom govoru.",
		"Nismo odustali od izleta uprkos tome što je prognoza bila prilično loša.",
		"Knjiga koju mi je preporučila bibliotekarka pokazala se zanimljivijom nego što sam očekivao.",
		"Da sam ranije znao za promenu reda vožnje, krenuo bih drugim putem.",
		"Mnogi stanari podržavaju obnovu dvorišta, pod uslovom da se sačuvaju stara stabla.",
		"Pošto nije dobila odgovor na poruku, odlučila je da lično ode u kancelariju.",
		"Predavanje je bilo namenjeno ljudima koji tek počinju da se bave programiranjem.",
		"Iako se njihova mišljenja razlikuju, uspeli su da pronađu rešenje prihvatljivo za sve.",
		"Novinar je proverio podatke pre nego što je objavio tekst na sajtu.",
		"Umesto da kupimo novi sto, popravili smo onaj koji smo već imali.",
		"Film govori o porodici koja pokušava da sačuva mali hotel na obali.",
		"Važno je da greške posmatramo kao deo učenja, a ne kao dokaz neuspeha.",
	},
	"B2": {
		"Premda se digitalne usluge ubrzano razvijaju, deo građana i dalje teško dolazi do pouzdanih informacija.",
		"Predlog bi bio ubedljiviji kada bi autori jasnije objasnili na kojim podacima zasnivaju zaključke.",
		"Grad je obnovio trg ne samo da bi privukao turiste već i da bi stanovnicima vratio javni prostor.",
		"Činjenica da se broj posetilaca povećao ne znači nužno da je program postao kvalitetniji.",
		"Sagovornik je izbegao da odgovori neposredno, pozivajući se na postupak koji je još u toku.",
		"Koliko god nam nova tehnologija olakšavala posao, ona ne može da zameni odgovornost onoga ko je koristi.",
		"Izložba preispituje način na koji se porodična sećanja pretvaraju u zvaničnu istoriju.",
		"Ukoliko se mere budu sprovodile bez javne rasprave, teško će steći poverenje građana.",
		"Autor ne poriče korist reforme, ali upozorava na posledice koje su njeni zagovornici zanemarili.",
		"Nakon što su objavljeni svi dokumenti, prvobitno tumačenje događaja više nije bilo održivo.",
		"Ono što na prvi pogled deluje kao sitna jezička razlika može potpuno promeniti ton poruke.",
		"Komisija je prihvatila primedbu, uz napomenu da će konačna odluka zavisiti od raspoloživih sredstava.",
		"Roman istovremeno prati ličnu dramu junaka i šire društvene promene koje je ona razotkrila.",
		"Rasprava se nije vodila oko toga da li je promena potrebna, već oko načina na koji treba da bude sprovedena.",
		"Čak i kada su činjenice tačne, njihov pažljiv izbor može navesti čitaoca na pogrešan zaključak.",
	},
	"C1": {
		"Pitanje nije toliko u tome da li institucije raspolažu podacima koliko u tome umeju li da ih protumače bez unapred zadatog zaključka.",
		"Iako se odluka formalno može braniti, način na koji je doneta ostavlja utisak da je javna rasprava poslužila tek kao ukras.",
		"Tek kada se sporni pojam sagleda u istorijskom kontekstu postaje jasno zašto njegov današnji smisao izaziva nesporazume.",
		"Sagovornica je, ne osporavajući rezultate istraživanja, dovela u pitanje pretpostavke na kojima počiva njihovo tumačenje.",
		"U meri u kojoj književnost odbija da ponudi jednostavan odgovor, ona čitaoca primorava da preuzme deo odgovornosti za značenje.",
		"Ma koliko tvrdnja zvučala samorazumljivo, njena uverljivost zavisi od toga šta se prećutno podrazumeva pod napretkom.",
		"Nije sporno da je reforma donela izvesna poboljšanja; sporno je kome su ona dostupna i po koju cenu.",
		"Izveštaj ostavlja po strani upravo one slučajeve koji bi mogli da naruše urednu sliku predstavljenu u zaključku.",
		"Da se rasprava nije svela na međusobne optužbe, možda bi se pokazalo da su suprotstavljene strane polazile od sličnih briga.",
		"Pisac se služi nepouzdanim pripovedačem kako bi čitaoca naveo da naknadno preispita ono što je već prihvatio kao činjenicu.",
		"Zakonodavac je ostavio dovoljno široku formulaciju da se norma može prilagoditi okolnostima, ali i zloupotrebiti.",
		"Uprkos prividnoj spontanosti, govor je bio pažljivo sastavljen tako da nijedna obaveza ne bude izrečena sasvim određeno.",
		"Razlika između ova dva pristupa nije samo metodološka nego zadire u pitanje šta uopšte smatramo relevantnim dokazom.",
		"Mogućnost da se delo čita na više načina ne oslobađa tumača obaveze da svoje čitanje potkrepi tekstom.",
		"Budući da su posledice dugoročne, trenutna popularnost mere ne bi smela da bude jedino merilo njene opravdanosti.",
	},
	"C2": {
		"Ne odričući se ironije, autor je usmerava i prema sopstvenoj poziciji, čime čitaocu uskraćuje udobnost konačnog suda.",
		"Utoliko je paradoks veći što se pozivanje na tradiciju, navodno u njenu odbranu, završava njenim svođenjem na nepomičan obrazac.",
		"Da zaključak nije formulisan s tolikom izvesnošću, možda bi njegova nedorečenost delovala kao poziv na dijalog, a ne kao previd.",
		"Tekst podriva sopstvenu argumentaciju upravo onda kada pokušava da joj pribavi autoritet neutralnog, bezličnog iskaza.",
		"Ono prećutano ne funkcioniše kao praznina, već kao okvir unutar kojeg izrečeno dobija političku težinu.",
		"Koliko god prevod nastojao da očuva višeznačnost izvornika, sam izbor sintakse neminovno raspoređuje naglaske drugačije.",
		"Prividna arhaičnost izraza nije puka stilska poza, nego sredstvo kojim se sadašnjost meri prema jeziku izgubljenog sveta.",
		"Ni najdoslednija rekonstrukcija konteksta ne može sasvim ukinuti razmak između iskustva savremenika i našeg naknadnog znanja.",
		"Argument je zavodljiv manje zbog onoga što dokazuje nego zbog načina na koji unapred određuje šta bi se uopšte računalo kao prigovor.",
		"U času kada pripovedač priznaje sopstvenu nepouzdanost, njegovo svedočenje postaje istovremeno sumnjivije i ljudski uverljivije.",
		"Nije posredi tek spor oko termina: svaka od ponuđenih reči podrazumeva drukčiju raspodelu odgovornosti.",
		"Retorička uzdržanost rečenice prikriva oštrinu suda koji bi, izrečen neposredno, zvučao gotovo optužujuće.",
		"Čim se izuzetak proglasi potvrdom pravila, pravilo postaje otporno na iskustvo koje je trebalo da ga proverava.",
		"Upravo odsustvo jasnog raspleta omogućava da se moralna nelagoda priče ne zatvori zajedno s njenom radnjom.",
		"Prevesti ovu dosetku znači izabrati koji će se njen sloj sačuvati, a koji će neminovno ostati samo objašnjen.",
	},
}

// Русские фразы для обратного направления написаны заново, а не переведены с
// сербских: возьми мы те же предложения, игрок, прошедший оба направления,
// получил бы второй раз тот же материал, а машине досталась бы задача вернуть
// текст, из которого он и сделан.
var russianSentences = map[string][]string{
	"A1": {
		"Я живу рядом со школой.",
		"Мой брат читает газету каждое утро.",
		"На улице идёт снег.",
		"Телефон лежит в кармане куртки.",
		"Мы вместе готовим ужин.",
		"Урок начинается после обеда.",
		"У меня нет мелких денег.",
		"Она пьёт чай без сахара.",
		"Наша собака спит под столом.",
		"Я не понимаю это слово.",
		"Дети играют во дворе.",
		"Кафе работает до девяти.",
		"Мама работает в больнице.",
		"Это моя первая книга на сербском.",
		"Завтра у нас нет занятий.",
	},
	"A2": {
		"Вчера мы гуляли по старому городу и фотографировали дома.",
		"Я забыл зонт дома, поэтому промок под дождём.",
		"Она позвонила сразу, как только освободилась.",
		"Прошлым летом мы много ходили пешком.",
		"Мне нужно купить билеты до конца недели.",
		"Он не пришёл, потому что заболел.",
		"Мы искали это кафе почти полчаса.",
		"Соседи переехали в другой район прошлой весной.",
		"Я хотел бы научиться играть на гитаре.",
		"Он забыл, где оставил телефон.",
		"Врач сказал, что надо больше отдыхать.",
		"Мы договорились встретиться у входа в парк.",
		"После обеда я обычно немного сплю.",
		"Она рассказала смешную историю про своего кота.",
		"Этот фильм понравился мне больше, чем книга.",
	},
	"B1": {
		"Чем дольше живёшь в городе, тем меньше замечаешь его особенности.",
		"Если бы мы вышли раньше, успели бы на последний паром.",
		"Квартира, которую нам показали, оказалась меньше, чем на фотографиях.",
		"Поскольку ремонт затянулся, встречу перенесли в другое место.",
		"Мы остались дома, хотя погода к вечеру наладилась.",
		"Он делает вид, что всё понимает, но переспрашивает каждое слово.",
		"Мне кажется, что этот маршрут длиннее, чем показывает карта.",
		"Прежде чем подписывать договор, стоит прочитать мелкий шрифт.",
		"Она говорит по-сербски так, будто выросла в Белграде.",
		"Никто не предупредил нас, что музей закрыт по понедельникам.",
		"Чтобы получить справку, нужно записаться заранее.",
		"Я так и не понял, почему он обиделся.",
		"Работа заняла больше времени, чем мы планировали.",
		"Пока мы ждали автобус, начался сильный дождь.",
		"Он согласился помочь при условии, что мы закончим до вечера.",
	},
	"B2": {
		"Привычка откладывать решения обходится дороже самой ошибки.",
		"Спор быстро перешёл с существа дела на выбор формулировок.",
		"Опыт, который нельзя пересказать, редко удаётся передать инструкцией.",
		"Редакция сняла материал, не объяснив причин ни автору, ни читателям.",
		"Чем строже правило, тем изобретательнее способы его обойти.",
		"Он умеет соглашаться так, что собеседник понимает отказ.",
		"Публика приняла спектакль сдержанно, хотя критики писали о нём восторженно.",
		"Решение выглядит взвешенным ровно до того момента, как узнаёшь о его сроках.",
		"Переход на новую систему отложили, не назначив новой даты.",
		"Молчание в этом разговоре значило больше любого ответа.",
		"Проект поддержали все, кроме тех, кому предстояло его выполнять.",
		"Ошибку заметили быстро, но исправляли её почти год.",
		"Совет звучал разумно, пока не выяснилось, кто его дал.",
		"Она говорит о работе так, будто речь идёт о чужой жизни.",
		"Отчёт написан подробно, но там, где нужны цифры, стоят общие слова.",
	},
	"C1": {
		"Ссылка на традицию здесь заменяет довод, а не подкрепляет его.",
		"Автор описывает неудачу так подробно, что подробность сама становится оправданием.",
		"Различие, которое теория проводит уверенно, в живой речи держится на одной интонации.",
		"Требование быть кратким чаще всего предъявляют тем, кому есть что сказать.",
		"Понятие сохраняет силу ровно до тех пор, пока его не пытаются определить.",
		"Свидетельство ценно не точностью деталей, а самим фактом того, что оно было записано.",
		"Уступка, сделанная вовремя, читается как расчёт, а сделанная поздно — как слабость.",
		"Спор о названии почти всегда оказывается спором о том, кому принадлежит право называть.",
		"Внимание к форме здесь не украшение, а единственный доступный способ быть точным.",
		"Обещание, повторённое трижды, начинает работать против того, кто его даёт.",
		"Правило, которое никто не нарушает, перестаёт быть заметным и потому кажется естественным.",
		"Историк вынужден выбирать между связностью рассказа и верностью источникам.",
		"Ирония в этом тексте направлена не на героя, а на читателя, готового ему поверить.",
		"Опыт, полученный слишком рано, редко успевает стать знанием.",
		"Замечание сформулировано так, чтобы его можно было принять, не признавая правоты.",
	},
	"C2": {
		"Всякая попытка описать умолчание рискует превратить его в высказывание и тем самым уничтожить предмет описания.",
		"Чем убедительнее выстроена аргументация, тем труднее заметить посылку, которую она не проверяет.",
		"Различие между наблюдением и толкованием исчезает в тот момент, когда наблюдатель начинает отбирать, что достойно записи.",
		"Язык сопротивляется точности не по бедности, а потому что обязан обслуживать говорящих с несовпадающим опытом.",
		"Канон складывается не из лучших книг, а из тех, о которых удобнее говорить дальше.",
		"То, что в одну эпоху считается ясностью, в другую прочитывается как непозволительное упрощение.",
		"Отказ от вывода бывает честнее вывода, но лишь если он не служит способом уклониться от ответственности.",
		"Перевод стареет быстрее оригинала именно потому, что вынужден быть современным своему читателю.",
		"Учреждение, созданное ради исключений, со временем начинает производить правила, чтобы оправдать своё существование.",
		"Признание собственной пристрастности не отменяет её, но меняет условия, на которых с текстом можно спорить.",
		"Метафора, повторённая достаточно часто, перестаёт объяснять и начинает подменять объяснение.",
		"Требование говорить просто о сложном нередко скрывает нежелание допустить, что сложность реальна.",
		"Свидетель, уверенный в своей памяти, опаснее для истины, чем тот, кто признаёт её пробелы.",
		"Всякая периодизация задним числом наделяет современников замыслом, которого у них не было.",
		"Точность датировки важна здесь не сама по себе, а потому что от неё зависит, кто у кого заимствовал.",
	},
}

// Round возвращает пять фраз одного из трёх раундов выбранного направления.
func Round(level string, round int, direction string) ([]Sentence, error) {
	level = strings.ToUpper(strings.TrimSpace(level))
	direction, ok := NormalizeDirection(direction)
	if !ok {
		return nil, ErrInvalidRound
	}
	banks := serbianSentences
	if direction == DirectionRuSr {
		banks = russianSentences
	}
	bank, ok := banks[level]
	if !ok || round < 1 || round > 3 || len(bank) != 15 {
		return nil, ErrInvalidRound
	}
	start := (round - 1) * sentencesPerRound
	out := make([]Sentence, sentencesPerRound)
	for i, text := range bank[start : start+sentencesPerRound] {
		// Идентификаторы сербского направления не меняются: они уже разошлись
		// по клиентам. Обратное направление получает свой префикс, иначе одна
		// и та же строка означала бы две разные фразы.
		id := fmt.Sprintf("%s-%02d", strings.ToLower(level), start+i+1)
		if direction == DirectionRuSr {
			id = "ru-" + id
		}
		out[i] = Sentence{ID: id, Text: text}
	}
	return out, nil
}
