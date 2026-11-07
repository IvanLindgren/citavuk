package translate

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

// LLM — запасной переводчик через OpenAI-совместимую модель (Polza AI).
//
// Включается последним: когда у DeepL кончилась месячная квота, а Google
// отвечает «подождите». Раньше в этот момент человек видел ошибку вместо
// перевода. Модель получает слово вместе с предложением и выбирает значение
// по контексту — то, чего Google на одиночном слове не умеет.
type LLM struct {
	key    string
	model  string
	url    string
	client *http.Client
}

// NewLLM собирает переводчик. Без ключа, модели или адреса возвращает nil:
// сервис тогда работает как раньше, без третьего уровня.
func NewLLM(key, model, url string) *LLM {
	if strings.TrimSpace(key) == "" || strings.TrimSpace(model) == "" || strings.TrimSpace(url) == "" {
		return nil
	}
	// Перевод ждут под пальцем: дольше нескольких секунд человек ждать не станет.
	return &LLM{key: key, model: model, url: url, client: &http.Client{Timeout: 15 * time.Second}}
}

// Name — имя провайдера для кеша и отладки.
func (l *LLM) Name() string { return "llm" }

var languageNames = map[string]string{
	"sr": "сербского", "ru": "русский", "en": "английский", "hr": "хорватского", "bs": "боснийского",
}

func languageName(code, fallback string) string {
	if name, ok := languageNames[strings.ToLower(code)]; ok {
		return name
	}
	return fallback
}

const llmPrompt = `Ты точный переводчик для изучающих язык. Переводи с %s на %s.
Ответь строго JSON-объектом без пояснений: {"translation":"...","sentence":"..."}.
translation — перевод фрагмента именно в том значении, в каком он стоит в предложении.
Для одного слова дай словарный перевод из одного-трёх слов, без комментариев.
sentence — естественный перевод всего предложения; если предложения нет, оставь пустым.
Имена собственные транслитерируй. Ничего не выдумывай.`

type llmRequest struct {
	Model          string            `json:"model"`
	Messages       []llmMessage      `json:"messages"`
	Temperature    float64           `json:"temperature"`
	MaxTokens      int               `json:"max_tokens"`
	Reasoning      map[string]string `json:"reasoning"`
	ResponseFormat map[string]string `json:"response_format"`
}

type llmMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// TranslateInContext переводит фрагмент text; sentence — предложение, в котором
// он стоит (может быть пустым). Возвращает перевод фрагмента и предложения.
func (l *LLM) TranslateInContext(ctx context.Context, text, sentence, source, target string) (string, string, error) {
	if l == nil {
		return "", "", ErrNoProvider
	}
	text = strings.TrimSpace(text)
	sentence = strings.TrimSpace(sentence)
	if text == "" {
		return "", "", ErrEmptyText
	}
	user := "Фрагмент: " + text
	if sentence != "" && sentence != text {
		user += "\nПредложение: " + sentence
	}
	body, err := json.Marshal(llmRequest{
		Model: l.model,
		Messages: []llmMessage{
			{Role: "system", Content: fmt.Sprintf(llmPrompt, languageName(source, "исходного языка"), languageName(target, "целевой язык"))},
			{Role: "user", Content: user},
		},
		MaxTokens:      600,
		Reasoning:      map[string]string{"effort": "none"},
		ResponseFormat: map[string]string{"type": "json_object"},
	})
	if err != nil {
		return "", "", err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, l.url, bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	request.Header.Set("Authorization", "Bearer "+l.key)
	request.Header.Set("Content-Type", "application/json")
	response, err := l.client.Do(request)
	if err != nil {
		return "", "", err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 256<<10))
	if err != nil {
		return "", "", err
	}
	switch {
	case response.StatusCode == http.StatusTooManyRequests:
		return "", "", ErrRateLimited
	case response.StatusCode == http.StatusPaymentRequired:
		return "", "", ErrQuota
	case response.StatusCode < 200 || response.StatusCode >= 300:
		return "", "", fmt.Errorf("запасной переводчик ответил кодом %d", response.StatusCode)
	}
	return parseLLMAnswer(raw)
}

var errLLMAnswer = errors.New("запасной переводчик ответил неразборчиво")

func parseLLMAnswer(raw []byte) (string, string, error) {
	var envelope struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if json.Unmarshal(raw, &envelope) != nil || len(envelope.Choices) == 0 {
		return "", "", errLLMAnswer
	}
	content := strings.TrimSpace(envelope.Choices[0].Message.Content)
	if start := strings.Index(content, "{"); start >= 0 {
		content = content[start:]
	}
	if end := strings.LastIndex(content, "}"); end >= 0 {
		content = content[:end+1]
	}
	var answer struct {
		Translation string `json:"translation"`
		Sentence    string `json:"sentence"`
	}
	if json.Unmarshal([]byte(content), &answer) != nil {
		return "", "", errLLMAnswer
	}
	answer.Translation = strings.Trim(strings.TrimSpace(answer.Translation), `"«»`)
	if answer.Translation == "" || len([]rune(answer.Translation)) > 400 {
		return "", "", errLLMAnswer
	}
	return answer.Translation, strings.TrimSpace(answer.Sentence), nil
}
