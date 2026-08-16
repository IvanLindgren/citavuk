package dictionary

// Толкование от нейросети — запасной вариант, когда словаря не хватило.
//
// «Речник српскохрватскога књижевног језика» вышел в прошлом веке: заимствований,
// разговорных слов и глаголов вроде «изгуглати» в нём нет, а читателю значение
// нужно всё равно. Модель эти пробелы закрывает, но отвечает по памяти, а не по
// источнику, поэтому карточка обязана называть себя объяснением нейросети:
// выдать сочинённый текст за статью Матицы српске нельзя.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// GeneratedSource — что показывается вместо названия словаря.
const GeneratedSource = "Объяснение составлено нейросетью"

const (
	// Больше шести значений читателю на карточке не нужно, а модель, если её
	// не остановить, уходит в редкие и устаревшие.
	maxGeneratedSenses     = 6
	maxGeneratedDefinition = 400
	maxGeneratedExample    = 300
)

// Explainer просит нейросеть объяснить слово. Протокол OpenAI-совместимый,
// поэтому провайдер и модель меняются переменными окружения.
type Explainer struct {
	apiKey string
	model  string
	url    string
	// effort — сколько модели позволено размышлять перед ответом. Пустая
	// строка не отправляет параметр вовсе: его понимают не все модели.
	effort string
	client *http.Client
}

func NewExplainer(apiKey, model, url, effort string) *Explainer {
	return &Explainer{
		apiKey: strings.TrimSpace(apiKey),
		model:  strings.TrimSpace(model),
		url:    strings.TrimSpace(url),
		effort: strings.TrimSpace(effort),
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (e *Explainer) Enabled() bool {
	return e != nil && e.apiKey != "" && e.model != "" && e.url != ""
}

// Промпт по-сербски и ответ по-сербски: объяснение на изучаемом языке точнее
// перевода, а от требования «не выдумывай» напрямую зависит, увидит ли человек
// толкование несуществующего слова. Слабые модели его всё равно нарушают —
// поэтому модель выбирается проверкой на заведомо выдуманных словах.
const explainPrompt = `Ti si srpski jednojezični rečnik za strance koji uče srpski.
Objasni značenje reči NA SRPSKOM jeziku, jednostavnim jezikom nivoa B1.
Ako reč ne postoji u srpskom jeziku, vrati {"exists": false} i ništa više.
Nikada ne izmišljaj značenje nepostojeće reči.
Reč postoji samo ako si je zaista sreo u srpskim tekstovima. Reč sastavljena od
poznatog korena i nastavka nije dokaz da postoji: ako nisi siguran, vrati
{"exists": false}.
Navedi sva česta značenja, ne samo prvo, uključujući razgovorna.
Odgovori isključivo JSON-om, bez razmišljanja naglas:
{"exists":true,"headword":"reč sa akcentom ako znaš","grammar":"gramatička odrednica",
"senses":[{"definition":"objašnjenje na srpskom","example":"rečenica sa tom rečju"}]}`

type explainRequest struct {
	Model          string        `json:"model"`
	Messages       []chatMessage `json:"messages"`
	Temperature    float64       `json:"temperature"`
	MaxTokens      int           `json:"max_tokens"`
	ResponseFormat struct {
		Type string `json:"type"`
	} `json:"response_format"`
	Reasoning *reasoningOption `json:"reasoning,omitempty"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type reasoningOption struct {
	Effort string `json:"effort"`
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

type generatedEntry struct {
	// Указатель, чтобы отличить «модель сказала: слова нет» от «поля нет».
	Exists   *bool  `json:"exists"`
	Headword string `json:"headword"`
	Grammar  string `json:"grammar"`
	Senses   []struct {
		Definition string `json:"definition"`
		Example    string `json:"example"`
	} `json:"senses"`
}

// Explain объясняет слово. ErrNotFound — модель такого слова не знает; это
// обычный исход, а не сбой.
func (e *Explainer) Explain(ctx context.Context, word string) (*Entry, error) {
	word = strings.TrimSpace(word)
	if !e.Enabled() || word == "" {
		return nil, ErrNotFound
	}
	content, err := e.ask(ctx, word)
	if err != nil {
		return nil, err
	}
	return parseGenerated(content, word)
}

func (e *Explainer) ask(ctx context.Context, word string) (string, error) {
	request := explainRequest{
		Model: e.model,
		Messages: []chatMessage{
			{Role: "system", Content: explainPrompt},
			{Role: "user", Content: "Reč: " + word},
		},
		Temperature: 0.1,
		MaxTokens:   1500,
	}
	request.ResponseFormat.Type = "json_object"
	if e.effort != "" {
		request.Reasoning = &reasoningOption{Effort: e.effort}
	}
	body, err := json.Marshal(request)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, e.url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+e.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := e.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	var parsed chatResponse
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		reason := fmt.Sprintf("код %d", resp.StatusCode)
		if json.Unmarshal(raw, &parsed) == nil && parsed.Error != nil {
			reason = parsed.Error.Message
		}
		return "", fmt.Errorf("dictionary: нейросеть отказала: %s", reason)
	}
	if json.Unmarshal(raw, &parsed) != nil || len(parsed.Choices) == 0 {
		return "", fmt.Errorf("dictionary: неразборчивый ответ нейросети")
	}
	return parsed.Choices[0].Message.Content, nil
}

func parseGenerated(content, word string) (*Entry, error) {
	text := strings.TrimSpace(content)
	if start := strings.Index(text, "{"); start > 0 {
		text = text[start:]
	}
	if end := strings.LastIndex(text, "}"); end >= 0 {
		text = text[:end+1]
	}
	var answer generatedEntry
	if json.Unmarshal([]byte(text), &answer) != nil {
		return nil, fmt.Errorf("dictionary: неразборчивый ответ нейросети")
	}
	if answer.Exists != nil && !*answer.Exists {
		return nil, ErrNotFound
	}

	entry := &Entry{
		Headword:    firstNonEmpty(cut(answer.Headword, 80), word),
		Grammar:     cut(answer.Grammar, 60),
		SourceTitle: GeneratedSource,
		Generated:   true,
	}
	for _, sense := range answer.Senses {
		definition := cut(sense.Definition, maxGeneratedDefinition)
		// Толкование в один-два знака ничего не объясняет: модель так отвечает,
		// когда сама не знает слова.
		if len([]rune(definition)) < 3 {
			continue
		}
		out := Sense{Definition: definition}
		if example := cut(sense.Example, maxGeneratedExample); example != "" {
			out.Examples = []Example{{Text: example}}
		}
		entry.Senses = append(entry.Senses, out)
		if len(entry.Senses) == maxGeneratedSenses {
			break
		}
	}
	// Модель ответила «слово есть», но объяснить не смогла — показывать нечего.
	if len(entry.Senses) == 0 {
		return nil, ErrNotFound
	}
	return entry, nil
}

func cut(value string, limit int) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) > limit {
		runes = runes[:limit]
	}
	return string(runes)
}
