package personal

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/citavuk/server/internal/daily"
	"github.com/citavuk/server/internal/lexicon"
)

// SharedWord comes only from the published roadmap, never from another
// reader's private profile or generated lessons.
type SharedWord struct {
	Lemma              string
	Translation        string
	Example            string
	ExampleTranslation string
}

// BuildSharedLesson turns reviewed roadmap examples into a reusable lesson.
// Each plan receives its own copy, so edits and progress remain private.
func BuildSharedLesson(level, theme, kind string, words []SharedWord) (Lesson, error) {
	if len(words) < 4 || len(words) > 8 || (kind != "vocabulary" && kind != "reading" && kind != "writing") {
		return Lesson{}, ErrInvalid
	}
	clean := make([]SharedWord, 0, len(words))
	markedForms := make([]string, 0, len(words))
	seenLemma, seenTranslation := map[string]bool{}, map[string]bool{}
	for _, word := range words {
		word.Lemma = strings.TrimSpace(word.Lemma)
		word.Translation = strings.TrimSpace(word.Translation)
		marked := ""
		if _, rest, ok := strings.Cut(word.Example, "*"); ok {
			marked, _, _ = strings.Cut(rest, "*")
		}
		word.Example = strings.TrimSpace(strings.ReplaceAll(word.Example, "*", ""))
		word.ExampleTranslation = strings.TrimSpace(strings.ReplaceAll(word.ExampleTranslation, "*", ""))
		if word.Lemma == "" || word.Translation == "" || word.Example == "" ||
			seenLemma[word.Lemma] || seenTranslation[word.Translation] {
			continue
		}
		seenLemma[word.Lemma], seenTranslation[word.Translation] = true, true
		clean = append(clean, word)
		markedForms = append(markedForms, strings.TrimSpace(marked))
	}
	if len(clean) < 4 {
		return Lesson{}, ErrInvalid
	}
	title := fmt.Sprintf("%s: %s и %s", theme, clean[0].Lemma, clean[1].Lemma)
	if utf8.RuneCountInString(title) > 120 {
		title = theme
	}
	lines := make([]string, 0, len(clean)+1)
	lines = append(lines, "Прочитай сербские фразы и найди в них слова из таблицы.")
	rows := make([][]string, 0, len(clean))
	for _, word := range clean {
		lines = append(lines, word.Example)
		rows = append(rows, []string{word.Lemma, word.Translation})
	}
	lesson := Lesson{
		Title: title,
		Kind:  kind,
		Theme: fmt.Sprintf("%s (%s)", theme, level),
		Text:  strings.Join(lines, "\n"),
		Rules: []string{
			"Сначала пойми фразу целиком, затем сравни слово с переводом в таблице.",
			"В предложении форма слова может отличаться от словарной. Запоминай слово вместе с примером.",
		},
		Scheme: Scheme{Title: "Слова урока", Columns: []string{"По-сербски", "По-русски"}, Rows: rows},
	}
	// Четыре проверяемых вопроса без языковой модели. Варианты берутся из
	// других слов этой же темы, поэтому ответ всегда есть в материале.
	for i := 0; i < min(6, len(clean)); i++ {
		word := clean[i]
		if kind == "writing" {
			exercise := daily.Exercise{
				Kind:     "translate",
				Question: "Напиши по-сербски: «" + word.Translation + "»",
				Answer:   word.Lemma,
				Hint:     word.Example,
			}
			if i < 2 && markedForms[i] != "" {
				exercise.Kind = "fill"
				exercise.Question = strings.Replace(word.Example, markedForms[i], "___", 1)
				exercise.Answer = markedForms[i]
			}
			lesson.Exercises = append(lesson.Exercises, exercise)
			continue
		}
		options := make([]string, 0, 4)
		for j := 0; j < 4; j++ {
			options = append(options, clean[(i+j)%len(clean)].Translation)
		}
		question := "Что означает «" + word.Lemma + "»?"
		if kind == "reading" {
			question = "Прочитай: «" + word.Example + "». Что здесь означает «" + word.Lemma + "»?"
		}
		lesson.Exercises = append(lesson.Exercises, daily.Exercise{
			Kind:     "choice",
			Question: question,
			Options:  options,
			Answer:   word.Translation,
			Hint:     word.Example,
		})
	}
	if err := lesson.Validate(); err != nil {
		return Lesson{}, err
	}
	return lesson, nil
}

// AdaptSharedLesson makes a private snapshot match the reader's script and
// available time. The common source remains unchanged for other readers.
func AdaptSharedLesson(source Lesson, profile Profile, day int) (Lesson, error) {
	raw, err := json.Marshal(source)
	if err != nil {
		return Lesson{}, err
	}
	var lesson Lesson
	if err = json.Unmarshal(raw, &lesson); err != nil {
		return Lesson{}, err
	}
	count := 4
	switch profile.Answers["minutes"] {
	case "10 минут":
		count = 5
	case "20 минут":
		count = 6
	}
	if len(lesson.Exercises) > count {
		lesson.Exercises = lesson.Exercises[:count]
	}
	script := profile.Answers["script"]
	if script == "Кириллица" || (script == "Обе" && day%2 == 0) {
		lesson.Title = lexicon.ToCyrillic(lesson.Title)
		lesson.Text = lexicon.ToCyrillic(lesson.Text)
		for i := range lesson.Rules {
			lesson.Rules[i] = lexicon.ToCyrillic(lesson.Rules[i])
		}
		for i := range lesson.Scheme.Rows {
			lesson.Scheme.Rows[i][0] = lexicon.ToCyrillic(lesson.Scheme.Rows[i][0])
		}
		for i := range lesson.Exercises {
			exercise := &lesson.Exercises[i]
			exercise.Question = lexicon.ToCyrillic(exercise.Question)
			exercise.Answer = lexicon.ToCyrillic(exercise.Answer)
			exercise.Hint = lexicon.ToCyrillic(exercise.Hint)
			for j := range exercise.Options {
				exercise.Options[j] = lexicon.ToCyrillic(exercise.Options[j])
			}
			for j := range exercise.AcceptedAnswers {
				exercise.AcceptedAnswers[j] = lexicon.ToCyrillic(exercise.AcceptedAnswers[j])
			}
		}
	}
	return lesson, lesson.Validate()
}
