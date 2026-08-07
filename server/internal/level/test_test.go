package level

import (
	"testing"

	"github.com/citavuk/server/internal/store"
)

// answersUpTo отвечает верно на всё до указанной ступени включительно, а на
// вопросы выше молчит. Так выглядит человек, дошедший до своего потолка.
func answersUpTo(highest string) map[string]int {
	out := map[string]int{}
	for _, question := range questions {
		if store.SerbianLevelIndex(question.Level) <= store.SerbianLevelIndex(highest) {
			out[question.ID] = question.answer
		}
	}
	return out
}

func TestGradeFollowsHighestPassedStep(t *testing.T) {
	for _, want := range []string{"A1", "A2", "B1", "B2", "C1"} {
		if got := Grade(answersUpTo(want)); got.Level != want {
			t.Errorf("дошёл до %s, получил %s (верных %d)", want, got.Level, got.Correct)
		}
	}
}

// Ни одного верного ответа — всё равно A1, а не пустота: тест пройден, ответ
// дан, и спрашивать снова не за что.
func TestGradeGivesA1ToEmptyAnswers(t *testing.T) {
	got := Grade(map[string]int{})
	if got.Level != "A1" || got.Correct != 0 {
		t.Errorf("пустые ответы дали %q, верных %d", got.Level, got.Correct)
	}
}

// Угаданный вопрос C1 не поднимает через головы пропущенных ступеней: севший на
// A1 знает язык на A1, сколько бы ему ни повезло дальше.
func TestGradeDoesNotJumpOverFailedSteps(t *testing.T) {
	answers := map[string]int{}
	for _, question := range questions {
		if question.Level == "C1" {
			answers[question.ID] = question.answer
		}
	}
	if got := Grade(answers); got.Level != "A1" {
		t.Errorf("одни лишь верные C1 дали уровень %q", got.Level)
	}
}

// Верный ответ не должен стоять всегда первым: иначе тест мерил бы не язык, а
// готовность нажать на верхнюю кнопку.
func TestAnswersAreNotAlwaysFirst(t *testing.T) {
	positions := map[int]bool{}
	for _, question := range questions {
		if question.answer < 0 || question.answer >= len(question.Options) {
			t.Fatalf("вопрос %s: верный ответ вне списка вариантов", question.ID)
		}
		positions[question.answer] = true
	}
	if len(positions) < 3 {
		t.Errorf("верные ответы стоят всего на %d разных местах", len(positions))
	}
}

// Наружу верный ответ не уходит: он неэкспортируемый и в JSON не попадает.
// Проверяется здесь, потому что достаточно одного тега `json:"answer"`, чтобы
// тест перестал что-либо измерять, и заметить это иначе негде.
func TestQuestionsCarryNoAnswers(t *testing.T) {
	for _, question := range Questions() {
		if len(question.Options) < 2 {
			t.Errorf("вопрос %s: вариантов меньше двух", question.ID)
		}
	}
	if Count() != len(questions) {
		t.Errorf("Count = %d, вопросов %d", Count(), len(questions))
	}
}

// Каждая ступень шкалы должна быть покрыта вопросами, иначе лесенка рвётся и
// подъём останавливается на пустом месте.
func TestEveryStepHasQuestions(t *testing.T) {
	for _, name := range []string{"A1", "A2", "B1", "B2", "C1"} {
		if countAll(name) < 2 {
			t.Errorf("на ступени %s меньше двух вопросов", name)
		}
	}
}

func countAll(level string) int {
	n := 0
	for _, question := range questions {
		if question.Level == level {
			n++
		}
	}
	return n
}
