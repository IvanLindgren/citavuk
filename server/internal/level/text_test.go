package level

import (
	"strings"
	"testing"

	"github.com/citavuk/server/internal/lexicon"
)

// Опорные тексты: уровень каждого задан не чужой меткой, а тем, из чего текст
// составлен. A1 — первая сотня слов и настоящее время, A2 — бытовой рассказ с
// прошедшим временем, C1 — проза XIX века из публичной библиотеки.
var (
	a1 = []string{
		"Ja sam student. Ovo je moja kuća. Imam brata i sestru.",
		"Danas je lep dan. Idem u školu. Volim da čitam knjige.",
		"Moja majka radi u gradu. Otac je kod kuće. Mi živimo ovde.",
		"Gde je voda? Voda je na stolu. Hvala ti, dobar si.",
		"Ona ima psa. Pas je mali. Deca se igraju u parku.",
		"Kako se zoveš? Zovem se Ana. Drago mi je.",
		"Danas ne radim. Sutra idem na posao. Vreme je lepo.",
		"Hoću kafu i hleb. Koliko košta? Nemam novca.",
	}
	a2 = []string{
		"Prošle nedelje smo putovali na more sa prijateljima iz škole.",
		"Kada sam bio dete, često sam išao kod bake u selo blizu grada.",
		"Voz je kasnio dva sata, pa smo morali da čekamo na stanici.",
		"Kupili smo kartu za pozorište, ali predstava je bila otkazana.",
		"Ako bude lepo vreme, idemo u planinu preko vikenda.",
		"Naučila je da kuva od svoje majke i sada priprema ručak za porodicu.",
		"Posle posla obično šetamo pored reke i razgovaramo o svemu.",
		"Trebalo bi da nazoveš lekara i zakažeš pregled za sledeću nedelju.",
	}
	hard = []string{
		"Мрачајски прото бијаше човјек ситан, сув и жилав, увијек некако намрштен.",
		"Чељад његова живљаху у сталном страху од његове ћудљивости и прегнућа.",
		"Обамрлост и запуштеност разасуше се по авлији, обраслој коровом и чкаљем.",
		"Сељаци шапутаху о његовој тврдичлуку, о зеленаштву и о неисказаној охолости.",
		"Свештеничко достојанство носио је као бреме, а не као благодат.",
		"У сумрак, док се разилажаху, чуло се тек мрмљање и потмуло клепетање.",
		"Његова замишљеност бијаше налик на прикривену злоћу, коју нико не смједе прозборити.",
		"Тако протицаху године, у оскудици духа и у неразмрсивој чамотињи.",
	}
)

func shared(t *testing.T) *lexicon.Lexicon {
	t.Helper()
	lex, err := lexicon.Shared()
	if err != nil {
		t.Fatalf("лексикон: %v", err)
	}
	return lex
}

func TestEstimateAnchors(t *testing.T) {
	lex := shared(t)
	for _, item := range []struct {
		want string
		text []string
	}{
		{"A1", a1},
		{"A2", a2},
	} {
		got := Estimate(lex, item.text)
		if got.Level != item.want {
			t.Errorf("уровень %q, ожидался %q (покрытие %.2f, слов %d)",
				got.Level, item.want, got.Coverage, got.Words)
		}
	}
}

// Шкала обязана быть монотонной: простой текст не может оказаться труднее
// сложного. Это требование слабее точной ступени и держится крепче — на нём и
// стоит предупреждение о тяжёлой книге.
func TestEstimateOrdersTextsByDifficulty(t *testing.T) {
	lex := shared(t)
	levels := []int{}
	for _, text := range [][]string{a1, a2, hard} {
		levels = append(levels, indexOf(Estimate(lex, text).Level))
	}
	for i := 1; i < len(levels); i++ {
		if levels[i] <= levels[i-1] {
			t.Fatalf("порядок сложности нарушен: %v", levels)
		}
	}
}

// Имена собственные текст не усложняют: их в книге сколько угодно, но «Милош»
// читается одинаково на любом уровне. Без этого правила роман с десятком героев
// объявлялся бы непосильным.
func TestEstimateIgnoresNames(t *testing.T) {
	lex := shared(t)
	plain := Estimate(lex, a1)

	withNames := make([]string, len(a1))
	for i, line := range a1 {
		withNames[i] = line + " Miloš, Vukašin i Nemanjić razgovaraju sa Zdravkom."
	}
	got := Estimate(lex, withNames)

	if got.Level != plain.Level {
		t.Errorf("с именами уровень %q, без имён %q", got.Level, plain.Level)
	}
}

// Слишком короткий текст уровня не получает: выдуманная оценка хуже молчания,
// потому что на ней стоит предупреждение, которое человек примет всерьёз.
func TestEstimateStaysSilentOnShortText(t *testing.T) {
	got := Estimate(shared(t), []string{"Dobar dan."})
	if got.Known() {
		t.Errorf("по трём словам выдан уровень %q", got.Level)
	}
}

// Предупреждение срабатывает при разрыве в две ступени, а не в одну: читать на
// ступень выше своего уровня как раз и полезно, и отговаривать от этого значит
// мешать единственному способу вырасти.
func TestTooHardForWarnsOnlyOnRealGap(t *testing.T) {
	for _, item := range []struct {
		text, reader string
		want         bool
	}{
		{"C1", "A2", true},
		{"B2", "A2", true},
		{"B1", "A2", false},
		{"C1", "B2", false},
		{"A1", "C1", false},
		{"C1", "", false}, // уровень читателя неизвестен — предупреждать не о чем
		{"", "A1", false}, // уровень текста не определён
	} {
		got := TextLevel{Level: item.text}.TooHardFor(item.reader)
		if got != item.want {
			t.Errorf("текст %q, читатель %q: %v, ожидалось %v",
				item.text, item.reader, got, item.want)
		}
	}
}

// Редкие слова показываются человеку: «книга трудная» без примеров звучит как
// приговор без объяснения.
func TestEstimateReportsHardWords(t *testing.T) {
	got := Estimate(shared(t), hard)
	if len(got.HardWords) == 0 {
		t.Fatal("трудные слова не собраны")
	}
	for _, word := range got.HardWords {
		if word != strings.ToLower(word) {
			t.Errorf("трудное слово %q не приведено к строчным", word)
		}
	}
}

func indexOf(level string) int {
	for i, band := range bands {
		if band.level == level {
			return i
		}
	}
	return len(bands)
}
