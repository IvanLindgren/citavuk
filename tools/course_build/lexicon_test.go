package main

import (
	"path/filepath"
	"testing"
)

// Путь к реальному лексикону относительно каталога модуля.
const testLexiconPath = "../../lexicon.db"

func loadTestLexicon(t *testing.T) *lexicon {
	t.Helper()
	lex, err := loadLexicon(filepath.FromSlash(testLexiconPath))
	if err != nil {
		t.Skipf("лексикон недоступен: %v", err)
	}
	return lex
}

// Проверяет самописный ридер SQLite на настоящем файле.
func TestLoadLexicon(t *testing.T) {
	lex := loadTestLexicon(t)
	if !lex.loaded {
		t.Fatal("лексикон не помечен загруженным")
	}
	if len(lex.byForm) < 10000 {
		t.Fatalf("подозрительно мало форм: %d", len(lex.byForm))
	}

	cases := []struct {
		form  string
		lemma string
	}{
		{"student", "student"},
		{"gradovi", "grad"},
		{"radnici", "radnik"},
		{"geolozi", "geolog"},
		{"uspesi", "uspeh"},
		{"čitaoci", "čitalac"},
		{"građani", "građanin"},
	}
	for _, c := range cases {
		entries := lex.lookup(c.form)
		if len(entries) == 0 {
			t.Errorf("форма %q не найдена в лексиконе", c.form)
			continue
		}
		found := false
		for _, e := range entries {
			if e.lemma == c.lemma {
				found = true
			}
		}
		if !found {
			t.Errorf("форма %q: ожидалась лемма %q, получено %+v", c.form, c.lemma, entries)
		}
	}
}

// Диакритика не должна теряться при чтении UTF-8 из базы.
func TestLexiconKeepsDiacritics(t *testing.T) {
	lex := loadTestLexicon(t)
	if len(lex.lookup("čitaoci")) == 0 {
		t.Error("форма с č не найдена — возможно, повреждена кодировка")
	}
	if len(lex.lookup("citaoci")) != 0 {
		t.Error("форма без диакритики не должна совпадать с čitaoci")
	}
}

func TestFeatsMatch(t *testing.T) {
	const feats = "Case=Nom|Gender=Masc|Number=Plur"

	if !featsMatch(feats, map[string]string{"Case": "Nom"}) {
		t.Error("совпадающий падеж не распознан")
	}
	if !featsMatch(feats, map[string]string{"Case": "Nom", "Number": "Plur"}) {
		t.Error("совпадение по двум признакам не распознано")
	}
	if featsMatch(feats, map[string]string{"Number": "Sing"}) {
		t.Error("несовпадение числа должно давать false")
	}
	if featsMatch(feats, map[string]string{"Case": "Gen"}) {
		t.Error("несовпадение падежа должно давать false")
	}
	if featsMatch("", map[string]string{"Case": "Nom"}) {
		t.Error("пустые признаки не должны совпадать ни с чем")
	}
}

// Конфликт признаков обязан попадать в warnings, иначе проверка бесполезна.
func TestVerifyFormReportsFeatureConflict(t *testing.T) {
	lex := loadTestLexicon(t)
	v := newValidator(false, false, "")
	v.lex = lex

	sing := "sing"
	// gradovi — форма множественного числа; заявляем единственное.
	v.verifyForm("тест", "gradovi", "grad", nil, &sing, nil)

	if len(v.warnings) == 0 {
		t.Fatal("конфликт числа не попал в warnings")
	}
}

func TestVerifyFormReportsLemmaConflict(t *testing.T) {
	lex := loadTestLexicon(t)
	v := newValidator(false, false, "")
	v.lex = lex

	v.verifyForm("тест", "gradovi", "autobus", nil, nil, nil)

	if len(v.warnings) == 0 {
		t.Fatal("конфликт леммы не попал в warnings")
	}
}

// Согласованная форма не должна порождать шум.
func TestVerifyFormAcceptsCorrectForm(t *testing.T) {
	lex := loadTestLexicon(t)
	v := newValidator(false, false, "")
	v.lex = lex

	plur := "plur"
	nom := "nom"
	v.verifyForm("тест", "gradovi", "grad", &nom, &plur, nil)

	if len(v.warnings) != 0 {
		t.Fatalf("верная форма дала предупреждения: %v", v.warnings)
	}
	if v.lexConfirmed != 1 {
		t.Fatalf("форма не засчитана подтверждённой: %d", v.lexConfirmed)
	}
}

// Отсутствие формы — не ошибка: лексикон покрывает лишь часть словаря.
func TestVerifyFormMissingIsNotError(t *testing.T) {
	lex := loadTestLexicon(t)
	v := newValidator(false, false, "")
	v.lex = lex

	v.verifyForm("тест", "нетакойформы", "лемма", nil, nil, nil)

	if len(v.errors) != 0 {
		t.Errorf("отсутствие формы стало ошибкой: %v", v.errors)
	}
	if len(v.lexMissing) != 1 {
		t.Errorf("форма не попала в список отсутствующих: %v", v.lexMissing)
	}
}
