// Package roadmap описывает каркас дорожной карты сербского языка.
//
// Каркас — шесть уровней CEFR и четыре раздела — задан здесь, а не в базе: он
// не меняется от правки к правке, а хранение шести строк ради этого потребовало
// бы миграции на каждое уточнение формулировки.
package roadmap

import "strings"

// Levels — шкала в порядке возрастания. Та же, что у уровня аккаунта.
var Levels = []string{"A1", "A2", "B1", "B2", "C1", "C2"}

// Разделы освоения языка. Speaking отсутствует намеренно: через интернет он не
// развивается, и место под него на карте вводило бы в заблуждение.
const (
	CategoryReading    = "reading"
	CategoryGrammar    = "grammar"
	CategoryVocabulary = "vocabulary"
	CategoryWriting    = "writing"
)

// Categories — порядок разделов на карте.
var Categories = []string{
	CategoryReading, CategoryGrammar, CategoryVocabulary, CategoryWriting,
}

// PassingScore — доля, с которой раздел считается взятым.
const PassingScore = 0.8

// Category — описание раздела для страницы.
type Category struct {
	Key   string `json:"key"`
	Title string `json:"title"`
	Local string `json:"local"`
	About string `json:"about"`
	// Раздел, которого ещё нет. В зачёт уровня не идёт: требовать 80% от
	// того, чего не существует, значит запереть переход навсегда.
	Planned bool `json:"planned"`
}

// CategoryList — описания в порядке показа.
var CategoryList = []Category{
	{
		Key:   CategoryReading,
		Title: "Reading",
		Local: "Čitanje",
		About: "Внимательное чтение и пассивное изучение слов и грамматических " +
			"конструкций, используемых в текстах разного уровня и жанра. Главная " +
			"цель этой категории — научиться осмысленно читать текст на изучаемом " +
			"языке, уметь его пересказать и кратко изложить.",
	},
	{
		Key:   CategoryGrammar,
		Title: "Grammar",
		Local: "Gramatika",
		About: "Способность понимать и воспроизводить в речи всяческие " +
			"грамматические конструкции изучаемого языка, а также умение находить " +
			"их в чужих текстах и речи.",
	},
	{
		Key:   CategoryVocabulary,
		Title: "Vocabulary",
		Local: "Vokabular",
		About: "Словарный запас изучаемого языка, количество слов и выражений, " +
			"которые вы знаете на изучаемом языке.",
	},
	{
		Key:     CategoryWriting,
		Title:   "Writing",
		Local:   "Pisanje",
		Planned: true,
		About: "Умение грамотно и понятно писать сообщения, тексты; умение писать " +
			"в любом стиле на изучаемом языке.",
	},
}

// ValidLevel сообщает, есть ли такая ступень.
func ValidLevel(level string) bool {
	for _, name := range Levels {
		if name == level {
			return true
		}
	}
	return false
}

// NormalizeLevel приводит «b2» к «B2» и отбрасывает всё прочее.
func NormalizeLevel(level string) string {
	upper := strings.ToUpper(strings.TrimSpace(level))
	if ValidLevel(upper) {
		return upper
	}
	return ""
}

// ValidCategory сообщает, есть ли такой раздел.
func ValidCategory(category string) bool {
	for _, name := range Categories {
		if name == category {
			return true
		}
	}
	return false
}

// Planned сообщает, что раздел ещё только планируется.
func Planned(category string) bool {
	for _, item := range CategoryList {
		if item.Key == category {
			return item.Planned
		}
	}
	return false
}

// LevelIndex — место ступени на шкале, -1 для неизвестной.
func LevelIndex(level string) int {
	for i, name := range Levels {
		if name == level {
			return i
		}
	}
	return -1
}

// NextLevel — следующая ступень. Пусто, если дальше некуда.
func NextLevel(level string) string {
	index := LevelIndex(level)
	if index < 0 || index+1 >= len(Levels) {
		return ""
	}
	return Levels[index+1]
}

// Progress — сколько сделано в одном разделе одного уровня.
type Progress struct {
	Done  int `json:"done"`
	Total int `json:"total"`
	// Доля 0..1. Считается на сервере: и веб, и приложения показывают её
	// одинаково, а два независимых деления рано или поздно разойдутся.
	Ratio float64 `json:"ratio"`
	// Раздел взят: доля не ниже порога, и в нём вообще есть что делать.
	Passed bool `json:"passed"`
}

// Ratio считает долю выполненного.
//
// Пустой раздел даёт ноль, а не единицу: «ничего из ничего» — это не успех, и
// засчитывать его значило бы открывать переход по ненаполненной карте.
func Ratio(done, total int) Progress {
	progress := Progress{Done: done, Total: total}
	if total <= 0 {
		return progress
	}
	if done > total {
		done = total
		progress.Done = done
	}
	progress.Ratio = float64(done) / float64(total)
	progress.Passed = progress.Ratio >= PassingScore
	return progress
}

// LevelPassed сообщает, взят ли уровень целиком.
//
// Планируемые разделы пропускаются: Writing ещё не существует, и требовать по
// нему 80% значило бы закрыть переход на всех уровнях сразу. Уровень, где не
// набралось ни одного считаемого раздела, не взят — иначе пустая ступень
// открывала бы дорогу дальше сама собой.
func LevelPassed(byCategory map[string]Progress) bool {
	counted := 0
	for _, category := range Categories {
		if Planned(category) {
			continue
		}
		progress, ok := byCategory[category]
		if !ok || progress.Total == 0 {
			return false
		}
		if !progress.Passed {
			return false
		}
		counted++
	}
	return counted > 0
}
