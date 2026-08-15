package duel

import (
	"strings"
	"time"
)

// Комнату опрашивают раз в пару секунд, и в ответе на опрос лежал бы готовый
// перевод соседа. Поэтому наружу уходит не комната, а вид на неё глазами
// одного участника: чужие переводы появляются только после того, как раунд
// закрыт, а на голосовании они без имён.

type PlayerView struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Machine string `json:"machine,omitempty"`
	Host    bool   `json:"host"`
	Joined  bool   `json:"joined"`
	Ready   bool   `json:"ready"`
	Left    bool   `json:"left"`
	Score   int    `json:"score"`
	You     bool   `json:"you,omitempty"`
	// Сколько фраз раунда переведено. Текста тут нет — только число: азарт
	// игры в том и состоит, чтобы видеть, что сосед уже дописывает.
	Progress int `json:"progress,omitempty"`
	// Отдал все свои голоса. По нему видно, кого ждёт голосование.
	Voted bool `json:"voted,omitempty"`
}

// BallotOption — перевод на голосовании, без автора.
type BallotOption struct {
	Alias string `json:"alias"`
	Text  string `json:"text"`
}

type BallotSentence struct {
	SentenceID string         `json:"sentenceId"`
	Text       string         `json:"text"`
	Options    []BallotOption `json:"options"`
}

// RevealAnswer — чужой перевод после разбора: уже с именем и оценкой.
type RevealAnswer struct {
	PlayerID string  `json:"playerId"`
	Name     string  `json:"name"`
	Machine  string  `json:"machine,omitempty"`
	Text     string  `json:"text"`
	Score    float64 `json:"score,omitempty"`
	Won      bool    `json:"won"`
	You      bool    `json:"you,omitempty"`
}

type RevealSentence struct {
	SentenceID string         `json:"sentenceId"`
	Text       string         `json:"text"`
	Answers    []RevealAnswer `json:"answers"`
	Feedback   string         `json:"feedback,omitempty"`
}

type RoomView struct {
	Code      string `json:"code"`
	Level     string `json:"level"`
	Direction string `json:"direction"`
	Seats     int    `json:"seats"`
	Open      bool   `json:"open"`
	Matched   bool   `json:"matched"`
	Phase     Phase  `json:"phase"`
	Round     int    `json:"round"`
	Rounds    int    `json:"rounds"`

	You  string `json:"you"`
	Host bool   `json:"host"`

	Players   []PlayerView `json:"players"`
	Sentences []Sentence   `json:"sentences,omitempty"`
	// Свои переводы и свои голоса. Чужие в этих полях не бывают никогда.
	Answers map[string]string `json:"answers,omitempty"`
	Votes   map[string]string `json:"votes,omitempty"`

	Ballot    []BallotSentence `json:"ballot,omitempty"`
	Reveal    []RevealSentence `json:"reveal,omitempty"`
	Summary   string           `json:"summary,omitempty"`
	Standings []Standing       `json:"standings,omitempty"`

	Deadline time.Time `json:"deadline,omitzero"`
	// Часы сервера. Остаток времени клиент считает от этой точки: свои часы у
	// него могут врать на минуты, а раунд идёт три с половиной.
	Now time.Time `json:"now"`
}

// View — что видит этот участник.
func (r *Room) View(playerID string, now time.Time) RoomView {
	view := RoomView{
		Code: r.Code, Level: r.Level, Direction: r.Direction, Seats: r.Seats,
		Open: r.Open, Matched: r.Matched, Phase: r.Phase, Round: r.Round, Rounds: Rounds,
		Sentences: r.Sentences, Summary: r.Summary,
		Deadline: r.Deadline, Now: now,
	}
	me := r.at(playerID)
	if me != nil {
		view.You = playerID
		view.Host = me.Host
		view.Answers = me.Answers
		if len(me.Votes) > 0 {
			view.Votes = map[string]string{}
			for sentenceID, choice := range me.Votes {
				view.Votes[sentenceID] = r.Alias(sentenceID, choice)
			}
		}
	}
	for _, player := range r.Players {
		view.Players = append(view.Players, PlayerView{
			ID: player.ID, Name: player.Name, Machine: player.Machine,
			Host: player.Host, Joined: player.Joined, Ready: player.Ready,
			Left: player.Left, Score: player.Score, You: player.ID == playerID,
			Progress: r.progress(player), Voted: r.hasVoted(player),
		})
	}
	switch r.Phase {
	case PhaseVote:
		for _, sentence := range r.Sentences {
			options := make([]BallotOption, 0, len(r.Players))
			for _, author := range r.ballot(sentence.ID, playerID) {
				options = append(options, BallotOption{
					Alias: r.Alias(sentence.ID, author.ID),
					Text:  author.Answers[sentence.ID],
				})
			}
			view.Ballot = append(view.Ballot, BallotSentence{
				SentenceID: sentence.ID, Text: sentence.Text, Options: options,
			})
		}
	case PhaseResult, PhaseFinished:
		view.Reveal = r.reveal(playerID)
		view.Standings = r.Standings()
	}
	return view
}

// progress — сколько фраз раунда игрок перевёл. Наружу уходит только число.
func (r *Room) progress(p Player) int {
	count := 0
	for _, sentence := range r.Sentences {
		if strings.TrimSpace(p.Answers[sentence.ID]) != "" {
			count++
		}
	}
	return count
}

// hasVoted — отдал ли игрок все голоса, какие мог отдать.
func (r *Room) hasVoted(p Player) bool {
	if r.Phase != PhaseVote || p.Machine != "" {
		return false
	}
	for _, sentence := range r.Sentences {
		if len(r.ballot(sentence.ID, p.ID)) == 0 {
			continue
		}
		if _, ok := p.Votes[sentence.ID]; !ok {
			return false
		}
	}
	return true
}

func (r *Room) reveal(playerID string) []RevealSentence {
	verdicts := make(map[string]Verdict, len(r.Verdicts))
	for _, verdict := range r.Verdicts {
		verdicts[verdict.SentenceID] = verdict
	}
	out := make([]RevealSentence, 0, len(r.Sentences))
	for _, sentence := range r.Sentences {
		verdict := verdicts[sentence.ID]
		won := make(map[string]bool, len(verdict.Winners))
		for _, id := range verdict.Winners {
			won[id] = true
		}
		answers := make([]RevealAnswer, 0, len(r.Players))
		for _, player := range r.Players {
			text := player.Answers[sentence.ID]
			if text == "" {
				// Пустая строка — это «не успел» у человека и «провайдер
				// промолчал» у машины. Показывать нечего ни в том, ни в другом.
				continue
			}
			answers = append(answers, RevealAnswer{
				PlayerID: player.ID, Name: player.Name, Machine: player.Machine,
				Text: text, Score: verdict.Scores[player.ID], Won: won[player.ID],
				You: player.ID == playerID,
			})
		}
		out = append(out, RevealSentence{
			SentenceID: sentence.ID, Text: sentence.Text,
			Answers: answers, Feedback: verdict.Feedback,
		})
	}
	return out
}
