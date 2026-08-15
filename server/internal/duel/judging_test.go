package duel

import (
	"testing"

	"github.com/citavuk/server/internal/translationgame"
)

func TestJudgeAskHidesAuthorsAndSettlesTheObvious(t *testing.T) {
	r := playing(t, 3, "gost", "tretiy")
	r.Answer("host", "a2-01", "Перевод хозяина", start)
	r.Answer("gost", "a2-01", "Перевод гостя", start)
	// Вторую фразу успел только один.
	r.Answer("tretiy", "a2-02", "Перевод третьего", start)

	ask := r.JudgeAsk()
	if len(ask.Entries) != 1 || len(ask.Sentences) != 1 {
		t.Fatalf("судье уходит %d фраз, ожидалась одна", len(ask.Entries))
	}
	if ask.Sentences[0] != "a2-01" {
		t.Fatalf("судье ушла фраза %q", ask.Sentences[0])
	}
	for _, answer := range ask.Entries[0].Answers {
		if answer.Ref == "host" || answer.Ref == "gost" {
			t.Fatalf("метка выдаёт автора: %q", answer.Ref)
		}
	}
	if len(ask.Settled) != 1 || len(ask.Settled[0].Winners) != 1 ||
		ask.Settled[0].Winners[0] != "tretiy" {
		t.Fatalf("единственный перевод не взял фразу: %+v", ask.Settled)
	}
}

func TestJudgeAskLeavesUntranslatedSentenceWithoutWinner(t *testing.T) {
	r := playing(t, 2, "gost")
	ask := r.JudgeAsk()
	if len(ask.Entries) != 0 {
		t.Fatalf("судью спросили о фразах, которых никто не перевёл: %+v", ask.Entries)
	}
	if len(ask.Settled) != len(r.Sentences) {
		t.Fatalf("решено %d фраз из %d", len(ask.Settled), len(r.Sentences))
	}
	for _, verdict := range ask.Settled {
		if len(verdict.Winners) != 0 {
			t.Fatalf("у непереведённой фразы нашёлся победитель: %+v", verdict)
		}
	}
}

func TestVerdictsReturnAuthorsBack(t *testing.T) {
	r := playing(t, 2, "gost")
	r.Answer("host", "a2-01", "Перевод хозяина", start)
	r.Answer("gost", "a2-01", "Перевод гостя", start)
	ask := r.JudgeAsk()

	best := r.Alias("a2-01", "gost")
	verdicts := ask.Verdicts(&translationgame.MatchResult{Verdicts: []translationgame.MatchVerdict{{
		Index: 0, Best: []string{best},
		Scores:   map[string]float64{best: 9, r.Alias("a2-01", "host"): 6, "chuzhaya": 10},
		Feedback: "У гостя живее.",
	}}})

	var judged *Verdict
	for i := range verdicts {
		if verdicts[i].SentenceID == "a2-01" {
			judged = &verdicts[i]
		}
	}
	if judged == nil {
		t.Fatalf("оценённой фразы нет в итоге: %+v", verdicts)
	}
	if len(judged.Winners) != 1 || judged.Winners[0] != "gost" {
		t.Fatalf("победитель разобран неверно: %+v", judged)
	}
	if judged.Scores["host"] != 6 || judged.Scores["gost"] != 9 {
		t.Fatalf("оценки не разложились по игрокам: %+v", judged.Scores)
	}
	// Метка, которой в этой фразе не было, очков не приносит никому.
	if len(judged.Scores) != 2 {
		t.Fatalf("чужая метка попала в оценки: %+v", judged.Scores)
	}
	// Непереведённая вторая фраза остаётся в итоге без победителя.
	if len(verdicts) != len(r.Sentences) {
		t.Fatalf("в итоге %d фраз из %d", len(verdicts), len(r.Sentences))
	}
}

func TestVerdictsSurviveSilentJudge(t *testing.T) {
	r := playing(t, 2, "gost")
	r.Answer("host", "a2-01", "Перевод хозяина", start)
	ask := r.JudgeAsk()
	verdicts := ask.Verdicts(nil)
	if len(verdicts) != len(r.Sentences) {
		t.Fatalf("без судьи потерялись решённые фразы: %+v", verdicts)
	}
}
