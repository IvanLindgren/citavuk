package main

// Сверка сербских форм курса со встроенным лексиконом (master-prompt §29).
//
// Лексикон — помощник, а не истина в последней инстанции: он покрывает лишь
// часть словаря, поэтому отсутствие формы ничего не доказывает и ошибкой не
// является. Ошибкой считается только явное расхождение: форма есть, но
// принадлежит другой лемме или другому роду/числу/падежу, чем заявлено
// в контенте. Такой конфликт фиксируется, а не разрешается автоматически.
//
// Читается lexicon.db напрямую, без SQLite-драйвера: нужен один
// последовательный проход по таблице, а тянуть CGO-зависимость в инструмент
// сборки ради этого не стоит. Разбор — минимальный ридер формата SQLite 3.

import (
	"encoding/binary"
	"fmt"
	"os"
	"sort"
	"strings"
)

// lexEntry — одна словоформа лексикона.
type lexEntry struct {
	lemma string
	upos  string
	feats string
}

// lexicon: форма (в нижнем регистре) → все её разборы.
type lexicon struct {
	byForm map[string][]lexEntry
	loaded bool
}

func (l *lexicon) lookup(form string) []lexEntry {
	if !l.loaded {
		return nil
	}
	return l.byForm[strings.ToLower(form)]
}

// loadLexicon читает таблицу lexicon(form, lemma, upos, feats, msd) из файла
// SQLite. При любой проблеме возвращает незагруженный лексикон: проверка
// просто пропускается.
func loadLexicon(path string) (*lexicon, error) {
	lex := &lexicon{byForm: map[string][]lexEntry{}}
	data, err := os.ReadFile(path)
	if err != nil {
		return lex, err
	}
	if len(data) < 100 || string(data[:15]) != "SQLite format 3" {
		return lex, fmt.Errorf("%s не похож на базу SQLite", path)
	}
	pageSize := int(binary.BigEndian.Uint16(data[16:18]))
	if pageSize == 1 {
		pageSize = 65536
	}
	if pageSize < 512 || len(data)%pageSize != 0 {
		return lex, fmt.Errorf("некорректный размер страницы %d", pageSize)
	}

	root, columns, err := findTableRoot(data, pageSize, "lexicon")
	if err != nil {
		return lex, err
	}
	rows := 0
	visited := map[int]bool{}
	err = walkTable(data, pageSize, root, visited, func(values []sqliteValue) {
		if len(values) < columns {
			return
		}
		form := values[0].text()
		if form == "" {
			return
		}
		key := strings.ToLower(form)
		lex.byForm[key] = append(lex.byForm[key], lexEntry{
			lemma: values[1].text(),
			upos:  values[2].text(),
			feats: values[3].text(),
		})
		rows++
	})
	if err != nil {
		return lex, err
	}
	if rows == 0 {
		return lex, fmt.Errorf("в таблице lexicon нет строк")
	}
	lex.loaded = true
	return lex, nil
}

// checkAgainstLexicon сверяет формы упражнений с лексиконом.
func (v *validator) checkAgainstLexicon(ctx string, raw []byte, base *ExerciseBase) {
	if v.lex == nil || !v.lex.loaded {
		return
	}
	switch base.Type {
	case "ending_picker":
		var p EndingPicker
		if !v.unmarshalPayload(ctx, raw, &p) {
			return
		}
		v.verifyForm(ctx, p.FullForm, p.Target.Lemma, p.Target.Case, p.Target.Number, p.Target.Gender)
	case "letter_unscramble":
		var p LetterUnscramble
		if !v.unmarshalPayload(ctx, raw, &p) {
			return
		}
		v.verifyForm(ctx, p.Answer, p.Lemma, nil, nil, nil)
	}
}

// udCase переводит короткий код падежа контента в значение UD.
var udCase = map[string]string{
	"nom": "Nom", "gen": "Gen", "dat": "Dat", "acc": "Acc",
	"voc": "Voc", "ins": "Ins", "loc": "Loc",
}

var udNumber = map[string]string{"sing": "Sing", "plur": "Plur"}
var udGender = map[string]string{"masc": "Masc", "fem": "Fem", "neut": "Neut"}

// verifyForm ищет форму в лексиконе и сравнивает лемму и признаки.
func (v *validator) verifyForm(ctx, form, lemma string, kase, number, gender *string) {
	if form == "" {
		return
	}
	v.lexChecked++
	entries := v.lex.lookup(form)
	if len(entries) == 0 {
		// Лексикон неполон: это не ошибка, но повод для ручной проверки.
		v.lexMissing = append(v.lexMissing, fmt.Sprintf("%s : %q", ctx, form))
		return
	}
	v.lexConfirmed++

	// Лемма: расхождение со всеми разборами — конфликт.
	if lemma != "" {
		match := false
		var seen []string
		for _, e := range entries {
			seen = append(seen, e.lemma)
			if strings.EqualFold(e.lemma, lemma) {
				match = true
				break
			}
		}
		if !match {
			v.warnf("%s : форма %q в лексиконе относится к лемме %s, а в контенте указана %q — "+
				"проверьте вручную", ctx, form, strings.Join(unique(seen), "/"), lemma)
			return
		}
	}

	// Признаки сверяем только у разборов нужной леммы.
	want := map[string]string{}
	if kase != nil {
		if v, ok := udCase[strings.ToLower(*kase)]; ok {
			want["Case"] = v
		}
	}
	if number != nil {
		if v, ok := udNumber[strings.ToLower(*number)]; ok {
			want["Number"] = v
		}
	}
	if gender != nil {
		if v, ok := udGender[strings.ToLower(*gender)]; ok {
			want["Gender"] = v
		}
	}
	if len(want) == 0 {
		return
	}

	for _, e := range entries {
		if lemma != "" && !strings.EqualFold(e.lemma, lemma) {
			continue
		}
		if featsMatch(e.feats, want) {
			return // подтверждено
		}
	}

	keys := make([]string, 0, len(want))
	for k := range want {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var parts []string
	for _, k := range keys {
		parts = append(parts, k+"="+want[k])
	}
	var got []string
	for _, e := range entries {
		if lemma == "" || strings.EqualFold(e.lemma, lemma) {
			got = append(got, e.feats)
		}
	}
	v.warnf("%s : у формы %q контент заявляет %s, а лексикон даёт %s — конфликт, "+
		"нужна проверка преподавателем",
		ctx, form, strings.Join(parts, "|"), strings.Join(unique(got), " ; "))
}

// featsMatch проверяет, что строка UD-признаков содержит все ожидаемые пары.
func featsMatch(feats string, want map[string]string) bool {
	have := map[string]string{}
	for _, pair := range strings.Split(feats, "|") {
		kv := strings.SplitN(pair, "=", 2)
		if len(kv) == 2 {
			have[kv[0]] = kv[1]
		}
	}
	for k, expected := range want {
		if have[k] != expected {
			return false
		}
	}
	return true
}

func unique(items []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(items))
	for _, s := range items {
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}
