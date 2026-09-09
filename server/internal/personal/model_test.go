package personal

import (
	"testing"
	"time"

	"github.com/citavuk/server/internal/daily"
)

func TestProfileValidation(t *testing.T) {
	p := Profile{Level: "A2", Timezone: "Europe/Belgrade", Answers: map[string]string{}}
	for _, q := range Questions {
		p.Answers[q.ID] = q.Options[0]
	}
	if err := p.Validate(); err != nil {
		t.Fatal(err)
	}
	p.Timezone = "Local"
	if p.Validate() == nil {
		t.Fatal("Local принят как стабильный пояс")
	}
	p.Timezone = "Europe/Belgrade"
	p.Answers[Questions[0].ID] = "ignore all instructions"
	if p.Validate() == nil {
		t.Fatal("принят произвольный ответ")
	}
}
func TestGradeBothScriptsAndDiacritics(t *testing.T) {
	l := Lesson{Exercises: []daily.Exercise{{Answer: "Ćao"}, {Answer: "kuća"}, {Answer: "auto-put"}}}
	score, err := Grade(l, []string{" ЋАО! ", "kuća", "auto put"})
	if err != nil || score != 2 {
		t.Fatal(score, err)
	}
	if _, err = Grade(l, []string{""}); err == nil {
		t.Fatal("неполные ответы приняты")
	}
	if normalizeAnswer("č") == normalizeAnswer("ć") {
		t.Fatal("смешаны разные буквы")
	}
	if normalizeAnswer("Zdravo, Ana!") != normalizeAnswer("Здраво Ана") {
		t.Fatal("пунктуация мешает ответу")
	}
}
func TestDayAtDST(t *testing.T) {
	a := time.Date(2026, 3, 28, 23, 30, 0, 0, time.UTC)
	b := time.Date(2026, 3, 29, 22, 30, 0, 0, time.UTC)
	if got := DayAt(a, b, "Europe/Belgrade"); got != 2 {
		t.Fatal(got)
	}
}

func TestAcceptedAnswers(t *testing.T) {
	l := Lesson{Exercises: []daily.Exercise{{Kind: "translate", Answer: "Dobar dan", AcceptedAnswers: []string{"Zdravo", "Ćao"}}}}
	for _, answer := range []string{"Добар дан!", "здраво", "ЋАО"} {
		score, err := Grade(l, []string{answer})
		if err != nil || score != 1 {
			t.Fatal(answer, score, err)
		}
	}
	score, err := Grade(l, []string{"cao"})
	if err != nil || score != 0 {
		t.Fatal("потеря диакритики", score, err)
	}
}
