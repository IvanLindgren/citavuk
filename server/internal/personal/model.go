// Package personal описывает персональную колоду уроков. Контракт общий для
// React и Flutter; произвольный HTML или исполняемые схемы модель не выдаёт.
package personal

import (
	"errors"
	"fmt"
	"strings"
	"time"
	_ "time/tzdata"
	"unicode"

	"github.com/citavuk/server/internal/daily"
	"github.com/citavuk/server/internal/lexicon"
	"github.com/citavuk/server/internal/study"
	"golang.org/x/text/unicode/norm"
)

const Days = 30
const Model = "deepseek/deepseek-v4-flash-0731"

var ErrInvalid = errors.New("некорректный урок или анкета")

type Question struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Options   []string `json:"options"`
	Multiple  bool     `json:"multiple,omitempty"`
	Exclusive string   `json:"exclusive,omitempty"`
}

var Questions = []Question{
	{"goal", "Для чего тебе сербский?", []string{"Жизнь в Сербии", "Работа", "Путешествия", "Учёба и экзамены", "Семья и общение", "Культура"}, true, ""},
	{"focus", "На что сделать упор?", []string{"Понемногу на всё", "Чтение", "Грамматика", "Лексика", "Понимание речи", "Письмо"}, true, "Понемногу на всё"},
	{"minutes", "Сколько времени в день удобно заниматься?", []string{"5 минут", "10 минут", "20 минут"}, false, ""},
	{"pace", "Какой темп тебе подходит?", []string{"Спокойный", "Сбалансированный", "Интенсивный"}, false, ""},
	{"script", "Какую письменность будем использовать?", []string{"Латиница", "Кириллица", "Обе"}, false, ""},
	{"explanation", "Какие объяснения тебе помогают?", []string{"Коротко и по делу", "Подробно с примерами", "Схемы и сравнения с русским"}, true, ""},
	{"difficulty", "Что пока труднее всего?", []string{"Падежи", "Глаголы и времена", "Не хватает слов", "Понимать живую речь", "Строить предложения"}, true, ""},
	{"practice", "Какие задания тебе ближе?", []string{"Выбирать ответ", "Писать самому", "Чередовать разные задания"}, true, "Чередовать разные задания"},
	{"topics", "Какие темы тебе интереснее?", []string{"Повседневная жизнь", "Еда и путешествия", "История и культура", "Новости и политика", "Работа и технологии", "Юмор и разговорная речь"}, true, ""},
	{"result", "Какого результата ждёшь через месяц?", []string{"Меньше бояться общения", "Лучше читать", "Разобраться в грамматике", "Расширить словарь", "Закрепить привычку"}, true, ""},
}

type Profile struct {
	Level    string            `json:"level"`
	Timezone string            `json:"timezone"`
	Answers  map[string]string `json:"answers"`
}

func (p Profile) Validate() error {
	if !strings.Contains("|A1|A2|B1|B2|C1|C2|", "|"+p.Level+"|") || p.Level == "" {
		return ErrInvalid
	}
	if !study.ValidTimezone(p.Timezone) {
		return ErrInvalid
	}
	if len(p.Answers) != len(Questions) {
		return ErrInvalid
	}
	for _, q := range Questions {
		// Строка сохранена для совместимости с выпущенными клиентами и БД.
		// Несколько проверенных вариантов разделяются переводом строки.
		values := strings.Split(p.Answers[q.ID], "\n")
		if len(values) > len(q.Options) || (!q.Multiple && len(values) != 1) {
			return fmt.Errorf("%w: %s", ErrInvalid, q.ID)
		}
		seen := map[string]bool{}
		for _, v := range values {
			ok := false
			for _, o := range q.Options {
				if v == o {
					ok = true
				}
			}
			if !ok || seen[v] || (len(values) > 1 && v == q.Exclusive) {
				return fmt.Errorf("%w: %s", ErrInvalid, q.ID)
			}
			seen[v] = true
		}
	}
	return nil
}

type Outline struct {
	Day   int    `json:"day"`
	Title string `json:"title"`
	Kind  string `json:"kind"`
	Goal  string `json:"goal"`
}
type Scheme struct {
	Title   string     `json:"title"`
	Columns []string   `json:"columns"`
	Rows    [][]string `json:"rows"`
}
type Lesson struct {
	Title     string           `json:"title"`
	Kind      string           `json:"kind"`
	Theme     string           `json:"theme"`
	Text      string           `json:"text"`
	Rules     []string         `json:"rules"`
	Scheme    Scheme           `json:"scheme"`
	Exercises []daily.Exercise `json:"exercises"`
}

func validText(s string, limit int) bool {
	return strings.TrimSpace(s) != "" && len([]rune(s)) <= limit
}
func ValidKind(s string) bool {
	switch s {
	case "reading", "grammar", "vocabulary", "listening", "writing":
		return true
	}
	return false
}
func (l Lesson) Validate() error {
	if !validText(l.Title, 120) || !ValidKind(l.Kind) || !validText(l.Theme, 120) || !validText(l.Text, 12000) || len(l.Rules) < 1 || len(l.Rules) > 8 {
		return ErrInvalid
	}
	for _, r := range l.Rules {
		if !validText(r, 1500) {
			return ErrInvalid
		}
	}
	if !validText(l.Scheme.Title, 160) || len(l.Scheme.Columns) < 2 || len(l.Scheme.Columns) > 4 || len(l.Scheme.Rows) < 1 || len(l.Scheme.Rows) > 8 {
		return ErrInvalid
	}
	for _, c := range l.Scheme.Columns {
		if !validText(c, 100) {
			return ErrInvalid
		}
	}
	for _, row := range l.Scheme.Rows {
		if len(row) != len(l.Scheme.Columns) {
			return ErrInvalid
		}
		for _, c := range row {
			if !validText(c, 500) {
				return ErrInvalid
			}
		}
	}
	if len(l.Exercises) < 4 || len(l.Exercises) > 8 {
		return ErrInvalid
	}
	for _, e := range l.Exercises {
		if len(e.AcceptedAnswers) > 8 {
			return ErrInvalid
		}
		for _, a := range e.AcceptedAnswers {
			if !validText(a, 1200) || normalizeAnswer(a) == "" {
				return ErrInvalid
			}
		}
		if !validText(e.Question, 1200) || !validText(e.Answer, 1200) || normalizeAnswer(e.Answer) == "" || len(e.Hint) > 2000 {
			return ErrInvalid
		}
		if e.Kind != "choice" && e.Kind != "fill" && e.Kind != "translate" {
			return ErrInvalid
		}
		if e.Kind == "choice" {
			if len(e.AcceptedAnswers) > 0 {
				return ErrInvalid
			}
			if len(e.Options) < 2 || len(e.Options) > 6 {
				return ErrInvalid
			}
			found := false
			seen := map[string]bool{}
			for _, o := range e.Options {
				if !validText(o, 500) || seen[normalizeAnswer(o)] {
					return ErrInvalid
				}
				seen[normalizeAnswer(o)] = true
				found = found || o == e.Answer
			}
			if !found {
				return ErrInvalid
			}
		}
	}
	return nil
}
func ValidateOutline(o []Outline) error {
	if len(o) != Days {
		return ErrInvalid
	}
	for i, d := range o {
		if d.Day != i+1 || !validText(d.Title, 120) || !ValidKind(d.Kind) || !validText(d.Goal, 500) {
			return ErrInvalid
		}
	}
	return nil
}

// Календарные дни, а не интервалы по 24 часа: DST не сдвигает раскрытие.
func DayAt(start time.Time, now time.Time, timezone string) int {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		loc = time.UTC
	}
	y, m, d := start.In(loc).Date()
	a := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	y, m, d = now.In(loc).Date()
	b := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	return int(b.Sub(a).Hours()/24) + 1
}
func normalizeAnswer(s string) string {
	s = norm.NFC.String(lexicon.ToLatin(strings.ToLower(strings.TrimSpace(s))))
	// Обе графики равноправны, но č/ć/c не смешиваются. Пунктуация разделяет
	// слова, а внутрисловный дефис/апостроф остаётся значимой частью ответа.
	runes := []rune(s)
	var out strings.Builder
	for i, r := range runes {
		inside := (r == '-' || r == '\'') && i > 0 && i+1 < len(runes) && unicode.IsLetter(runes[i-1]) && unicode.IsLetter(runes[i+1])
		if unicode.IsPunct(r) && !inside {
			out.WriteRune(' ')
		} else {
			out.WriteRune(r)
		}
	}
	return strings.Join(strings.Fields(out.String()), " ")
}
func Grade(l Lesson, answers []string) (int, error) {
	if len(answers) != len(l.Exercises) {
		return 0, ErrInvalid
	}
	score := 0
	for i, e := range l.Exercises {
		if !validText(answers[i], 1500) || normalizeAnswer(answers[i]) == "" {
			return 0, ErrInvalid
		}
		matched := normalizeAnswer(answers[i]) == normalizeAnswer(e.Answer)
		for _, alternative := range e.AcceptedAnswers {
			matched = matched || normalizeAnswer(answers[i]) == normalizeAnswer(alternative)
		}
		if matched {
			score++
		}
	}
	return score, nil
}
