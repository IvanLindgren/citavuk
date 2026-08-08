package roadmap

import "testing"

// Пустой раздел — это ноль, а не сто процентов. «Ничего из ничего» не успех, и
// засчитывать его значило бы открывать переход по ненаполненной карте.
func TestRatioEmptySectionIsZero(t *testing.T) {
	progress := Ratio(0, 0)
	if progress.Ratio != 0 || progress.Passed {
		t.Errorf("пустой раздел: ratio=%v passed=%v", progress.Ratio, progress.Passed)
	}
}

func TestRatioPassingThreshold(t *testing.T) {
	for _, item := range []struct {
		done, total int
		passed      bool
	}{
		{8, 10, true},  // ровно порог
		{7, 10, false}, // чуть ниже
		{10, 10, true},
		{0, 10, false},
	} {
		progress := Ratio(item.done, item.total)
		if progress.Passed != item.passed {
			t.Errorf("%d из %d: passed=%v, ожидалось %v",
				item.done, item.total, progress.Passed, item.passed)
		}
	}
}

// Отметок не может быть больше, чем содержимого: пункт, снятый автором с
// публикации, иначе давал бы больше ста процентов.
func TestRatioClampsToTotal(t *testing.T) {
	progress := Ratio(12, 10)
	if progress.Ratio != 1 || progress.Done != 10 {
		t.Errorf("done=%d ratio=%v", progress.Done, progress.Ratio)
	}
}

// Writing ещё не существует, и требовать по нему 80% значило бы закрыть
// переход на всех уровнях сразу.
func TestLevelPassedSkipsPlannedCategory(t *testing.T) {
	byCategory := map[string]Progress{
		CategoryReading:    Ratio(9, 10),
		CategoryGrammar:    Ratio(9, 10),
		CategoryVocabulary: Ratio(9, 10),
		// Writing не заполнен вовсе.
	}
	if !LevelPassed(byCategory) {
		t.Error("уровень не взят, хотя все существующие разделы пройдены")
	}
}

// Ненаполненный уровень не открывает дорогу дальше сам собой.
func TestLevelPassedNeedsContent(t *testing.T) {
	if LevelPassed(map[string]Progress{}) {
		t.Error("пустой уровень засчитан")
	}
	partial := map[string]Progress{
		CategoryReading:    Ratio(9, 10),
		CategoryGrammar:    Ratio(0, 0),
		CategoryVocabulary: Ratio(9, 10),
	}
	if LevelPassed(partial) {
		t.Error("уровень с пустым разделом засчитан")
	}
}

func TestLevelPassedFailsBelowThreshold(t *testing.T) {
	byCategory := map[string]Progress{
		CategoryReading:    Ratio(9, 10),
		CategoryGrammar:    Ratio(5, 10),
		CategoryVocabulary: Ratio(9, 10),
	}
	if LevelPassed(byCategory) {
		t.Error("уровень взят при 50% по грамматике")
	}
}

func TestNormalizeLevel(t *testing.T) {
	for _, item := range []struct{ in, want string }{
		{"b2", "B2"},
		{" C1 ", "C1"},
		{"C2", "C2"},
		{"D9", ""},
		{"", ""},
	} {
		if got := NormalizeLevel(item.in); got != item.want {
			t.Errorf("NormalizeLevel(%q) = %q, ожидалось %q", item.in, got, item.want)
		}
	}
}

func TestNextLevel(t *testing.T) {
	if got := NextLevel("A1"); got != "A2" {
		t.Errorf("после A1: %q", got)
	}
	// С вершины шкалы идти некуда, и предлагать переход нельзя.
	if got := NextLevel("C2"); got != "" {
		t.Errorf("после C2: %q", got)
	}
	if got := NextLevel("чепуха"); got != "" {
		t.Errorf("после мусора: %q", got)
	}
}

// Speaking на карте отсутствует намеренно: через интернет он не развивается, и
// место под него вводило бы в заблуждение.
func TestNoSpeakingCategory(t *testing.T) {
	for _, category := range Categories {
		if category == "speaking" {
			t.Fatal("на карте появился раздел speaking")
		}
	}
	if len(CategoryList) != len(Categories) {
		t.Errorf("описаний %d, разделов %d", len(CategoryList), len(Categories))
	}
}
