// Package formhint спрашивает у нейросети начальную форму словоформы, которой
// нет в лексиконе.
//
// Лексикон разрежен: на лемму в нём приходится пара форм, и «kućicama»,
// «pozorišnom», «prehlađenih» в нём просто нет. Правило `resolveByRule`
// достраивает парадигмы известных лемм, но если самой леммы в словаре тоже нет,
// достраивать не от чего — и читатель получал перевод без разбора.
//
// Отсюда приходит только гипотеза: начальная форма, часть речи и род. Падеж,
// число и лицо считает грамматический движок, а гипотеза принимается, лишь
// когда парадигма от неё даёт ровно ту форму, которую разбирают. Модель тут не
// источник грамматики, а подсказчик словарной статьи, которой у нас нет:
// грамматику модели врут охотнее всего, а проверить их своим кодом мы можем.
package formhint

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

// ErrNoHint — модель не смогла или не захотела разбирать это слово.
var ErrNoHint = errors.New("formhint: подсказки нет")

// Hint — гипотеза о слове. Ничего, кроме этих трёх полей, у модели не берётся.
type Hint struct {
	Lemma  string `json:"lemma"`
	UPOS   string `json:"upos"`
	Gender string `json:"gender,omitempty"`
}

// knownUPOS — части речи, которые мы умеем проверить своим движком. Всё
// остальное отбрасывается: непроверенный разбор показывать нельзя.
var knownUPOS = map[string]bool{
	"NOUN": true, "PROPN": true, "ADJ": true,
	"VERB": true, "AUX": true, "ADV": true,
}

var knownGender = map[string]bool{"Masc": true, "Fem": true, "Neut": true}

type Hinter struct {
	apiKey string
	model  string
	url    string
	effort string
	client *http.Client
}

func New(apiKey, model, url, effort string) *Hinter {
	return &Hinter{
		apiKey: strings.TrimSpace(apiKey),
		model:  strings.TrimSpace(model),
		url:    strings.TrimSpace(url),
		effort: strings.TrimSpace(effort),
		// Разбор ждёт читатель, нажавший слово: лучше отдать карточку без
		// разбора, чем держать её полминуты.
		client: &http.Client{Timeout: 20 * time.Second},
	}
}

func (h *Hinter) Enabled() bool {
	return h != nil && h.apiKey != "" && h.model != "" && h.url != ""
}

const prompt = `Ti si morfološki analizator srpskog jezika.
Za datu reč vrati samo osnovni oblik i vrstu reči, ništa više.
Osnovni oblik: imenica — nominativ jednine; pridev — muški rod, nominativ
jednine, neodređeni vid; glagol — infinitiv.
Vrsta reči (upos): NOUN, PROPN, ADJ, VERB, AUX, ADV.
Za imenice obavezno navedi rod: Masc, Fem ili Neut.
Ako takva reč ne postoji u srpskom jeziku ili je to druga vrsta reči, vrati
{"exists": false}. Nikada ne izmišljaj reč.
Odgovori isključivo JSON-om, bez razmišljanja naglas:
{"exists":true,"lemma":"kućica","upos":"NOUN","gender":"Fem"}`

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type reasoningOption struct {
	Effort string `json:"effort"`
}

type chatRequest struct {
	Model          string        `json:"model"`
	Messages       []chatMessage `json:"messages"`
	Temperature    float64       `json:"temperature"`
	MaxTokens      int           `json:"max_tokens"`
	ResponseFormat struct {
		Type string `json:"type"`
	} `json:"response_format"`
	Reasoning *reasoningOption `json:"reasoning,omitempty"`
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

type answer struct {
	Exists *bool  `json:"exists"`
	Lemma  string `json:"lemma"`
	UPOS   string `json:"upos"`
	Gender string `json:"gender"`
}

// Guess просит гипотезу о словоформе.
func (h *Hinter) Guess(ctx context.Context, form string) (*Hint, error) {
	form = strings.TrimSpace(form)
	if !h.Enabled() || form == "" {
		return nil, ErrNoHint
	}
	content, err := h.ask(ctx, form)
	if err != nil {
		return nil, err
	}
	return parse(content)
}

func (h *Hinter) ask(ctx context.Context, form string) (string, error) {
	request := chatRequest{
		Model: h.model,
		Messages: []chatMessage{
			{Role: "system", Content: prompt},
			{Role: "user", Content: "Reč: " + form},
		},
		Temperature: 0,
		// Ответ — три коротких поля, и запас нужен только на случай, если модель
		// начнёт рассуждать вслух вопреки просьбе.
		MaxTokens: 300,
	}
	request.ResponseFormat.Type = "json_object"
	if h.effort != "" {
		request.Reasoning = &reasoningOption{Effort: h.effort}
	}
	body, err := json.Marshal(request)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+h.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<19))
	if err != nil {
		return "", err
	}
	var parsed chatResponse
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		reason := fmt.Sprintf("код %d", resp.StatusCode)
		if json.Unmarshal(raw, &parsed) == nil && parsed.Error != nil {
			reason = parsed.Error.Message
		}
		return "", fmt.Errorf("formhint: нейросеть отказала: %s", reason)
	}
	if json.Unmarshal(raw, &parsed) != nil || len(parsed.Choices) == 0 {
		return "", fmt.Errorf("formhint: неразборчивый ответ нейросети")
	}
	return parsed.Choices[0].Message.Content, nil
}

func parse(content string) (*Hint, error) {
	text := strings.TrimSpace(content)
	if start := strings.Index(text, "{"); start > 0 {
		text = text[start:]
	}
	if end := strings.LastIndex(text, "}"); end >= 0 {
		text = text[:end+1]
	}
	var out answer
	if json.Unmarshal([]byte(text), &out) != nil {
		return nil, ErrNoHint
	}
	if out.Exists != nil && !*out.Exists {
		return nil, ErrNoHint
	}
	lemma := strings.ToLower(strings.TrimSpace(out.Lemma))
	upos := strings.ToUpper(strings.TrimSpace(out.UPOS))
	// Слишком длинная «лемма» — это словосочетание или пояснение: разбирать по
	// нему нечего, а проверку оно всё равно не пройдёт.
	if lemma == "" || len([]rune(lemma)) > 40 || strings.ContainsAny(lemma, " \t\n") {
		return nil, ErrNoHint
	}
	if !knownUPOS[upos] {
		return nil, ErrNoHint
	}
	hint := &Hint{Lemma: lemma, UPOS: upos}
	if gender := strings.TrimSpace(out.Gender); knownGender[gender] {
		hint.Gender = gender
	}
	return hint, nil
}
