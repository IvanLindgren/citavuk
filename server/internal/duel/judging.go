package duel

import (
	"strings"

	"github.com/citavuk/server/internal/translationgame"
)

// Что спрашивать у судьи и что решено без него.
//
// Судья видит только тексты под метками: ни имён, ни того, что один из
// переводов машинный. Иначе DeepL получал бы фору за репутацию или штраф за
// машинность.
type Ask struct {
	Entries []translationgame.MatchEntry
	// Фраза каждого вопроса: индекс в Entries → идентификатор фразы.
	Sentences []string
	// Метка → игрок, по каждому вопросу.
	Authors []map[string]string
	// Фразы, решённые без судьи: сравнивать было не с чем.
	Settled []Verdict
}

// JudgeAsk собирает вопрос к судье по закрытому раунду.
func (r *Room) JudgeAsk() Ask {
	ask := Ask{}
	for _, sentence := range r.Sentences {
		answers := make([]translationgame.MatchAnswer, 0, len(r.Players))
		authors := map[string]string{}
		for _, player := range r.Players {
			text := strings.TrimSpace(player.Answers[sentence.ID])
			if text == "" {
				continue
			}
			alias := r.Alias(sentence.ID, player.ID)
			answers = append(answers, translationgame.MatchAnswer{Ref: alias, Text: text})
			authors[alias] = player.ID
		}
		switch len(answers) {
		case 0:
			// Фразу не перевёл никто: победителя нет и спрашивать не о чем.
			ask.Settled = append(ask.Settled, Verdict{SentenceID: sentence.ID})
		case 1:
			// Единственный перевод берёт фразу без разбора.
			ask.Settled = append(ask.Settled, Verdict{
				SentenceID: sentence.ID,
				Winners:    []string{authors[answers[0].Ref]},
				Feedback:   "Перевод оказался единственным.",
			})
		default:
			ask.Entries = append(ask.Entries, translationgame.MatchEntry{
				Source: sentence.Text, Answers: answers,
			})
			ask.Sentences = append(ask.Sentences, sentence.ID)
			ask.Authors = append(ask.Authors, authors)
		}
	}
	return ask
}

// Verdicts переводит ответ судьи обратно в очки игроков.
func (ask Ask) Verdicts(result *translationgame.MatchResult) []Verdict {
	verdicts := make([]Verdict, 0, len(ask.Sentences)+len(ask.Settled))
	verdicts = append(verdicts, ask.Settled...)
	if result == nil {
		return verdicts
	}
	for _, verdict := range result.Verdicts {
		if verdict.Index < 0 || verdict.Index >= len(ask.Sentences) {
			continue
		}
		authors := ask.Authors[verdict.Index]
		winners := make([]string, 0, len(verdict.Best))
		for _, ref := range verdict.Best {
			if id, ok := authors[ref]; ok {
				winners = append(winners, id)
			}
		}
		scores := make(map[string]float64, len(verdict.Scores))
		for ref, score := range verdict.Scores {
			if id, ok := authors[ref]; ok {
				scores[id] = score
			}
		}
		verdicts = append(verdicts, Verdict{
			SentenceID: ask.Sentences[verdict.Index],
			Winners:    winners,
			Scores:     scores,
			Feedback:   verdict.Feedback,
		})
	}
	return verdicts
}
