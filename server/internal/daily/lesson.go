// Package daily сочиняет короткий текст с сегодняшними словами и упражнения
// к нему.
//
// Смысл в том, чтобы десять слов не остались списком: слово, встреченное во
// фразе, держится в голове иначе, чем слово из столбика. Поэтому модель просят
// не «объяснить слова», а написать связный текст, где все они стоят на своих
// местах.
package daily

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

var (
	ErrNotConfigured = errors.New("ключ модели не задан")
	ErrBadAnswer     = errors.New("модель ответила не по формату")
	ErrNoWords       = errors.New("нет слов для текста")
)

// Word — слово набора, каким его видит модель.
type Word struct {
	Lemma       string
	Translation string
	Theme       string
}

// Exercise — задание к тексту.
type Exercise struct {
	Kind     string   `json:"kind"`
	Question string   `json:"question"`
	Options  []string `json:"options,omitempty"`
	Answer   string   `json:"answer"`
	Hint     string   `json:"hint,omitempty"`
}

// Lesson — то, что вернула модель.
type Lesson struct {
	Title     string     `json:"title"`
	Text      string     `json:"text"`
	Exercises []Exercise `json:"exercises"`
}

type Generator struct {
	apiKey string
	model  string
	url    string
	client *http.Client
}

func NewGenerator(apiKey, model, url string) *Generator {
	return &Generator{
		apiKey: strings.TrimSpace(apiKey),
		model:  model,
		url:    url,
		// Текст короткий, но модель думает: минуты хватает, две — уже повод
		// показать слова без текста.
		client: &http.Client{Timeout: 60 * time.Second},
	}
}

func (g *Generator) Enabled() bool { return g != nil && g.apiKey != "" }

// maxExercises — больше пяти заданий за раз никто не делает, а окно на каждый
// день не должно выглядеть как контрольная.
const maxExercises = 5

const systemPrompt = `Ты преподаватель сербского языка для русскоязычных.

По списку из десяти сербских слов ты пишешь короткий связный текст на сербском
и упражнения к нему.

Правила:
- текст 60–110 слов, все десять слов набора обязаны в нём встретиться;
- сербский текст кириллицей, уровень не выше указанного;
- текст бытовой и цельный: маленькая сценка, а не набор предложений про каждое слово;
- упражнений ровно 4: два "choice" (вопрос по тексту, 4 варианта, answer — точный текст верного варианта),
  одно "fill" (фраза из текста с пропуском ___, answer — пропущенное слово),
  одно "translate" (короткая русская фраза, answer — её перевод на сербский);
- hint — одна фраза-подсказка, зачем это слово или в чём подвох;
- title — заголовок текста по-сербски, 2–4 слова.

Ответ строго в JSON:
{"title":"...","text":"...","exercises":[{"kind":"choice","question":"...","options":["...","...","...","..."],"answer":"...","hint":"..."}]}`

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model          string        `json:"model"`
	Messages       []chatMessage `json:"messages"`
	Temperature    float64       `json:"temperature"`
	MaxTokens      int           `json:"max_tokens"`
	ResponseFormat struct {
		Type string `json:"type"`
	} `json:"response_format"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// Compose пишет текст с этими словами и упражнения к нему.
func (g *Generator) Compose(ctx context.Context, level string, words []Word) (*Lesson, error) {
	if !g.Enabled() {
		return nil, ErrNotConfigured
	}
	if len(words) == 0 {
		return nil, ErrNoWords
	}

	var list strings.Builder
	for _, word := range words {
		fmt.Fprintf(&list, "- %s — %s", word.Lemma, word.Translation)
		if word.Theme != "" {
			fmt.Fprintf(&list, " (тема: %s)", word.Theme)
		}
		list.WriteString("\n")
	}

	request := chatRequest{
		Model: g.model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: fmt.Sprintf(
				"Уровень: %s.\n\nСЛОВА:\n%s", level, list.String(),
			)},
		},
		// Температура выше, чем у теста: текст должен быть живым, а не
		// пересказом словаря. Но не настолько, чтобы слова уехали из набора.
		Temperature: 0.7,
		MaxTokens:   2000,
	}
	request.ResponseFormat.Type = "json_object"

	body, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+g.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := g.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("модель недоступна: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var parsed chatResponse
		if json.Unmarshal(raw, &parsed) == nil && parsed.Error != nil {
			return nil, fmt.Errorf("модель отказала: %s", parsed.Error.Message)
		}
		return nil, fmt.Errorf("модель ответила кодом %d", resp.StatusCode)
	}

	var parsed chatResponse
	if err := json.Unmarshal(raw, &parsed); err != nil || len(parsed.Choices) == 0 {
		return nil, ErrBadAnswer
	}
	return ParseLesson(parsed.Choices[0].Message.Content)
}

// ParseLesson достаёт урок из ответа модели.
//
// Модель просили отвечать чистым JSON, но она нет-нет да обернёт его в ```json
// или предварит вежливой фразой. Проще вырезать объект по скобкам, чем каждый
// раз терять готовый ответ.
func ParseLesson(content string) (*Lesson, error) {
	text := strings.TrimSpace(content)
	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start < 0 || end <= start {
		return nil, ErrBadAnswer
	}

	var lesson Lesson
	if err := json.Unmarshal([]byte(text[start:end+1]), &lesson); err != nil {
		return nil, ErrBadAnswer
	}
	lesson.Title = trim(lesson.Title, 120)
	lesson.Text = trim(strings.TrimSpace(lesson.Text), 2000)
	if lesson.Text == "" {
		return nil, ErrBadAnswer
	}
	lesson.Exercises = ValidExercises(lesson.Exercises)
	return &lesson, nil
}

// ValidExercises выбрасывает задания, в которых нечего делать.
//
// Задание без ответа хуже отсутствия задания: человек его решает, а проверить
// себя не может.
func ValidExercises(items []Exercise) []Exercise {
	good := make([]Exercise, 0, len(items))
	for _, item := range items {
		question := strings.TrimSpace(item.Question)
		answer := strings.TrimSpace(item.Answer)
		if question == "" || answer == "" {
			continue
		}
		kind := strings.TrimSpace(item.Kind)
		if kind != "choice" && kind != "fill" && kind != "translate" {
			kind = "translate"
		}

		options := make([]string, 0, len(item.Options))
		for _, option := range item.Options {
			option = strings.TrimSpace(option)
			if option != "" {
				options = append(options, trim(option, 200))
			}
		}
		// Выбор без вариантов — не выбор. Такое задание превращается в
		// «переведи», а не выбрасывается: вопрос-то осмысленный.
		if kind == "choice" {
			if len(options) < 2 {
				kind = "translate"
				options = nil
			} else if !contains(options, answer) {
				// Верного варианта нет среди предложенных — модель ошиблась, и
				// проверить ответ будет нечем.
				continue
			}
		}

		good = append(good, Exercise{
			Kind:     kind,
			Question: trim(question, 400),
			Options:  options,
			Answer:   trim(answer, 200),
			Hint:     trim(strings.TrimSpace(item.Hint), 200),
		})
		if len(good) >= maxExercises {
			break
		}
	}
	return good
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if strings.EqualFold(strings.TrimSpace(item), strings.TrimSpace(value)) {
			return true
		}
	}
	return false
}

func trim(text string, limit int) string {
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return string(runes[:limit])
}
