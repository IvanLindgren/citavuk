// Package quiz собирает тесты по учебному материалу силами языковой модели.
//
// Модель нужна ровно в одном месте: превратить конспект в набор вопросов с
// правильным ответом и объяснением. Всё остальное — проверка, статистика,
// расписание повторений — считается на сервере, потому что арифметику незачем
// доверять модели, а платить за неё тем более незачем.
package quiz

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode"
)

// ErrNotConfigured возвращается, когда ключ модели не задан.
var ErrNotConfigured = errors.New("генератор тестов не настроен")

// ErrTooShort — материала не хватает на осмысленный тест.
var ErrTooShort = errors.New("материал слишком короткий")

// ErrBadAnswer — модель ответила не тем, что её просили.
var ErrBadAnswer = errors.New("модель вернула неразборчивый ответ")

const (
	// minSourceRunes — ниже этого объёма вопросы вырождаются в пересказ
	// одного предложения.
	minSourceRunes = 400

	// maxSourceRunes ограничивает запрос к модели. Длинные конспекты режутся:
	// на вход уходит начало, которого хватает на десяток вопросов, а полный
	// текст стоил бы дороже без выигрыша в качестве.
	maxSourceRunes = 24000

	// maxQuestions — верхняя граница набора.
	maxQuestions = 12

	// optionsPerQuestion — вариантов ответа у вопроса.
	optionsPerQuestion = 4
)

// Question — вопрос теста.
type Question struct {
	Question string   `json:"question"`
	Options  []string `json:"options"`
	// Answer — номер правильного варианта в Options.
	Answer int `json:"answer"`
	// Explanation объясняет, почему верен правильный вариант.
	Explanation string `json:"explanation"`
	// WrongHint объясняет, чем плохи остальные: без этого разбор ошибки
	// сводится к «просто неверно», а это ничему не учит.
	WrongHint string `json:"wrongHint"`
}

// Result — то, что модель вернула по материалу.
type Result struct {
	Title     string     `json:"title"`
	Subject   string     `json:"subject"`
	Questions []Question `json:"questions"`
}

// Generator обращается к модели по OpenAI-совместимому протоколу.
type Generator struct {
	apiKey string
	model  string
	url    string
	client *http.Client
}

// NewGenerator собирает генератор. Пустой ключ выключает раздел целиком —
// сервер продолжает работать, а сайт показывает, что тренажёр недоступен.
func NewGenerator(apiKey, model, url string) *Generator {
	return &Generator{
		apiKey: strings.TrimSpace(apiKey),
		model:  model,
		url:    url,
		// Модель на 31B думает над длинным конспектом десятки секунд, изредка
		// дольше минуты.
		client: &http.Client{Timeout: 3 * time.Minute},
	}
}

// Enabled сообщает, настроен ли генератор.
func (g *Generator) Enabled() bool { return g != nil && g.apiKey != "" }

var whitespace = regexp.MustCompile(`\s+`)

// SourceSHA — адрес материала.
//
// Хешируется нормализованный текст, а не файл: тот же конспект, скопированный
// из PDF и из вордовского документа, отличается переносами и неразрывными
// пробелами, но это один и тот же материал и один и тот же тест.
func SourceSHA(text string) string {
	normalized := whitespace.ReplaceAllString(strings.ToLower(strings.TrimSpace(text)), " ")
	sum := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(sum[:])
}

// Excerpt — начало материала для списка тестов.
func Excerpt(text string, limit int) string {
	clean := strings.TrimSpace(whitespace.ReplaceAllString(text, " "))
	runes := []rune(clean)
	if len(runes) <= limit {
		return clean
	}
	return strings.TrimSpace(string(runes[:limit])) + "…"
}

// CountRunes считает длину материала в символах.
func CountRunes(text string) int { return len([]rune(text)) }

const systemPrompt = `Ты преподаватель. По присланному учебному материалу ты составляешь проверочный тест.

Правила:
- вопросы только по содержанию материала, ничего от себя;
- каждый вопрос с ровно 4 вариантами ответа, верный ровно один;
- варианты правдоподобные: неверные должны быть ошибками по существу, а не отпиской;
- поле explanation объясняет, почему верный вариант верен, со ссылкой на материал;
- поле wrongHint одной фразой объясняет, в чём ошибаются те, кто выбрал другие варианты;
- язык вопросов и объяснений — тот же, на котором написан материал;
- title — короткое название темы, subject — учебный предмет одним-двумя словами.

Ответ строго в JSON:
{"title":"...","subject":"...","questions":[{"question":"...","options":["...","...","...","..."],"answer":0,"explanation":"...","wrongHint":"..."}]}`

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
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// Generate составляет тест по материалу.
func (g *Generator) Generate(ctx context.Context, source string, want int) (*Result, error) {
	if !g.Enabled() {
		return nil, ErrNotConfigured
	}
	if CountRunes(strings.TrimSpace(source)) < minSourceRunes {
		return nil, ErrTooShort
	}
	if want <= 0 || want > maxQuestions {
		want = maxQuestions
	}

	runes := []rune(source)
	if len(runes) > maxSourceRunes {
		runes = runes[:maxSourceRunes]
	}

	request := chatRequest{
		Model: g.model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: fmt.Sprintf(
				"Составь %d вопросов по материалу.\n\nМАТЕРИАЛ:\n%s",
				want, string(runes),
			)},
		},
		// Низкая температура: тест должен проверять материал, а не фантазию.
		Temperature: 0.25,
		MaxTokens:   4000,
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
	return parseResult(parsed.Choices[0].Message.Content)
}

// parseResult достаёт тест из ответа модели.
//
// Модель просили отвечать чистым JSON, но она нет-нет да обернёт его в ```json
// или предварит вежливой фразой. Проще вырезать объект по скобкам, чем каждый
// раз терять готовый ответ.
func parseResult(content string) (*Result, error) {
	text := strings.TrimSpace(content)
	if start := strings.Index(text, "{"); start > 0 {
		text = text[start:]
	}
	if end := strings.LastIndex(text, "}"); end >= 0 && end < len(text)-1 {
		text = text[:end+1]
	}

	var result Result
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return nil, ErrBadAnswer
	}

	result.Questions = validQuestions(result.Questions)
	if len(result.Questions) == 0 {
		return nil, ErrBadAnswer
	}
	result.Title = trimField(result.Title, 120)
	result.Subject = trimField(result.Subject, 60)
	return &result, nil
}

// validQuestions выбрасывает вопросы, которые нельзя показать человеку.
//
// Модель ошибается предсказуемо: то трёх вариантов вместо четырёх, то answer
// вне диапазона, то два одинаковых варианта. Такой вопрос лучше молча выкинуть,
// чем показать тест, где правильного ответа нет вовсе.
func validQuestions(questions []Question) []Question {
	valid := make([]Question, 0, len(questions))
	for _, q := range questions {
		q.Question = trimField(q.Question, 500)
		if q.Question == "" {
			continue
		}
		if len(q.Options) != optionsPerQuestion {
			continue
		}
		if q.Answer < 0 || q.Answer >= len(q.Options) {
			continue
		}

		seen := make(map[string]bool, optionsPerQuestion)
		ok := true
		for i, option := range q.Options {
			option = trimField(option, 300)
			if option == "" || seen[strings.ToLower(option)] {
				ok = false
				break
			}
			seen[strings.ToLower(option)] = true
			q.Options[i] = option
		}
		if !ok {
			continue
		}

		q.Explanation = trimField(q.Explanation, 800)
		q.WrongHint = trimField(q.WrongHint, 500)
		valid = append(valid, q)
		if len(valid) == maxQuestions {
			break
		}
	}
	return valid
}

func trimField(value string, limit int) string {
	clean := strings.TrimSpace(whitespace.ReplaceAllString(value, " "))
	clean = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, clean)
	runes := []rune(clean)
	if len(runes) > limit {
		return string(runes[:limit])
	}
	return clean
}
