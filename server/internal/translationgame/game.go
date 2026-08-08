// Package translationgame реализует учебную игру «Ты против переводчика».
package translationgame

import (
	"errors"
	"fmt"
	"strings"
)

var ErrInvalidRound = errors.New("неизвестный уровень или раунд")

// Sentence — одна фраза раунда. Перевод намеренно отсутствует: его каждый раз
// делает выбранный пользователем сервис, иначе это была бы игра против ключа
// в JSON, а не против DeepL или Google.
type Sentence struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

const sentencesPerRound = 5

var sentences = map[string][]string{
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

// Round vraća pet različitih rečenica za jedan od tri раунда.
func Round(level string, round int) ([]Sentence, error) {
	level = strings.ToUpper(strings.TrimSpace(level))
	bank, ok := sentences[level]
	if !ok || round < 1 || round > 3 || len(bank) != 15 {
		return nil, ErrInvalidRound
	}
	start := (round - 1) * sentencesPerRound
	out := make([]Sentence, sentencesPerRound)
	for i, text := range bank[start : start+sentencesPerRound] {
		out[i] = Sentence{
			ID:   fmt.Sprintf("%s-%02d", strings.ToLower(level), start+i+1),
			Text: text,
		}
	}
	return out, nil
}
