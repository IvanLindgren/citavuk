package lexicon

import (
	"slices"
	"testing"
)

func TestToCyrillic(t *testing.T) {
	cases := map[string]string{
		"nihilizam": "нихилизам",
		"ljubav":    "љубав",
		"njegov":    "његов",
		"džep":      "џеп",
		"đak":       "ђак",
		"čaša":      "чаша",
		"ćirilica":  "ћирилица",
		"Ljubav":    "Љубав",
		"LJUBAV":    "ЉУБАВ",
		"Njegoš":    "Његош",
		"knjiga":    "књига",
		// Цифры и знаки препинания проходят насквозь.
		"broj 7, tačka.": "број 7, тачка.",
	}
	for latin, want := range cases {
		if got := ToCyrillic(latin); got != want {
			t.Errorf("ToCyrillic(%q) = %q, ожидалось %q", latin, got, want)
		}
	}
}

// Кириллица через ToCyrillic проходит без изменений: слово могло прийти уже в
// нужном письме, и второй проход не должен его портить.
func TestToCyrillicKeepsCyrillic(t *testing.T) {
	const word = "нихилизам"
	if got := ToCyrillic(word); got != word {
		t.Errorf("ToCyrillic(%q) = %q", word, got)
	}
}

func TestToCyrillicRoundTrip(t *testing.T) {
	for _, word := range []string{"љубав", "његош", "џеп", "ђак", "књига", "чаша"} {
		if got := ToCyrillic(ToLatin(word)); got != word {
			t.Errorf("кругом %q дало %q", word, got)
		}
	}
}

// «nadživeti» — приставка «nad» и корень «živeti», а не диграф «dž». Жадное
// чтение здесь ошибается, поэтому нужен и второй вариант.
func TestCyrillicVariantsSplitsAmbiguousDigraph(t *testing.T) {
	got := CyrillicVariants("nadživeti")
	want := []string{"наџивети", "надживети"}
	if !slices.Equal(got, want) {
		t.Errorf("CyrillicVariants = %q, ожидалось %q", got, want)
	}
}

func TestCyrillicVariantsSingleWhenUnambiguous(t *testing.T) {
	got := CyrillicVariants("nihilizam")
	if len(got) != 1 || got[0] != "нихилизам" {
		t.Errorf("CyrillicVariants = %q, ожидался один вариант", got)
	}
}
