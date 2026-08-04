// Package feed collects source material and prepares moderated micro-reading
// cards. The model is never allowed to publish: it only produces a validated
// draft with explicit source and licensing metadata.
package feed

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/citavuk/server/internal/lexicon"
	"github.com/citavuk/server/internal/store"
)

var (
	ErrNotConfigured = errors.New("генератор микро-ленты не настроен")
	ErrBadAnswer     = errors.New("модель вернула неразбираемую карточку")
)

// SystemPrompt is kept in code so the exact production contract is versioned
// together with its validator and database schema.
const SystemPrompt = `You are the editorial pipeline for Čitavuk, a Serbian-language reading app.

Transform the supplied source into ONE micro-reading card. Return strict JSON only.

Editorial rules:
1. The card must contain 100-150 Serbian BCHS words, be accurate, self-contained and intriguing without clickbait.
2. Write standard Serbian. Produce equivalent Cyrillic and Latin versions; never mix alphabets inside one version.
3. If the source language is not Serbian, translate and adapt it into natural Serbian. Never transliterate English words as if they were Serbian.
4. For rights_mode=summary_only, write a genuinely new summary. Do not copy more than 8 consecutive source words. Preserve names, dates and facts and do not add facts absent from the source.
5. For rights_mode=reuse, adaptation is allowed but the card still needs source attribution. Do not silently remove uncertainty from the source.
6. For a book_excerpt, do not rewrite the excerpt and do not invent book/chapter coordinates. Book linkage is supplied separately by the server.
7. Classify CEFR as A1, A2, B1, B2 or C1. Prefer A2-B1 wording unless the subject requires more advanced language.
8. Select 3-5 lowercase Serbian tags and exactly 3 genuinely useful difficult Serbian words. For each word provide the lemma, Serbian IPA and a concise Russian translation.
9. Categories: history, culture, science, fiction, society, news.
10. Kinds: news, fact, culture, science, fiction, society, book_excerpt.

JSON schema:
{
  "kind":"fact",
  "category":"culture",
  "title_cyrillic":"...",
  "title_latin":"...",
  "text_cyrillic":"...",
  "text_latin":"...",
  "original_script":"cyrillic|latin|translated",
  "cefr":"B1",
  "tags":["..."],
  "difficult_words":[
    {"word":"...","lemma":"...","transcription":"/.../","translation_ru":"..."}
  ]
}`

type Generator struct {
	apiKey         string
	model          string
	url            string
	embeddingKey   string
	embeddingModel string
	embeddingURL   string
	client         *http.Client
}

func NewGenerator(
	apiKey, model, rawURL string,
	embeddingKey, embeddingModel, embeddingURL string,
) *Generator {
	return &Generator{
		apiKey: strings.TrimSpace(apiKey), model: model, url: rawURL,
		embeddingKey:   strings.TrimSpace(embeddingKey),
		embeddingModel: embeddingModel, embeddingURL: embeddingURL,
		client: &http.Client{Timeout: 3 * time.Minute},
	}
}

func (g *Generator) Enabled() bool { return g != nil && g.apiKey != "" }
func (g *Generator) EmbeddingsEnabled() bool {
	return g != nil && g.embeddingKey != "" && g.embeddingURL != ""
}

type generationResult struct {
	Kind           string                    `json:"kind"`
	Category       string                    `json:"category"`
	TitleCyrillic  string                    `json:"title_cyrillic"`
	TitleLatin     string                    `json:"title_latin"`
	TextCyrillic   string                    `json:"text_cyrillic"`
	TextLatin      string                    `json:"text_latin"`
	OriginalScript string                    `json:"original_script"`
	CEFR           string                    `json:"cefr"`
	Tags           []string                  `json:"tags"`
	DifficultWords []generationDifficultWord `json:"difficult_words"`
}

// The generation prompt uses snake_case, while the public API exposes
// DifficultWord in camelCase. Accept both spellings so changing providers or
// replaying an older response cannot silently discard the translation.
type generationDifficultWord struct {
	Word               string `json:"word"`
	Lemma              string `json:"lemma"`
	Transcription      string `json:"transcription"`
	TranslationRU      string `json:"translation_ru"`
	TranslationRUCamel string `json:"translationRu"`
}

func (word generationDifficultWord) storeValue() store.DifficultWord {
	translation := strings.TrimSpace(word.TranslationRU)
	if translation == "" {
		translation = strings.TrimSpace(word.TranslationRUCamel)
	}
	return store.DifficultWord{
		Word:          strings.TrimSpace(word.Word),
		Lemma:         strings.TrimSpace(word.Lemma),
		Transcription: strings.TrimSpace(word.Transcription),
		TranslationRU: translation,
	}
}

func storeDifficultWords(words []generationDifficultWord) []store.DifficultWord {
	result := make([]store.DifficultWord, 0, len(words))
	for _, word := range words {
		result = append(result, word.storeValue())
	}
	return result
}

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

func (g *Generator) Generate(
	ctx context.Context,
	input *store.MicroFeedImport,
	source *store.MicroFeedSource,
) (*store.MicroFeedItem, error) {
	if !g.Enabled() {
		return nil, ErrNotConfigured
	}
	if input == nil || source == nil || len([]rune(strings.TrimSpace(input.RawText))) < 120 {
		return nil, errors.New("в источнике слишком мало текста")
	}
	userPrompt := fmt.Sprintf(`SOURCE TITLE: %s
SOURCE LANGUAGE: %s
RIGHTS MODE: %s
LICENSE: %s
SOURCE URL: %s

SOURCE TEXT:
%s`, input.Title, source.Language, source.RightsMode, source.LicenseCode,
		input.SourceURL, limitRunes(input.RawText, 24000))
	request := chatRequest{
		Model: g.model,
		Messages: []chatMessage{
			{Role: "system", Content: SystemPrompt},
			{Role: "user", Content: userPrompt},
		},
		Temperature: .25,
		MaxTokens:   2400,
	}
	request.ResponseFormat.Type = "json_object"
	var response chatResponse
	if err := g.postJSON(ctx, g.url, g.apiKey, request, &response); err != nil {
		return nil, err
	}
	if response.Error != nil {
		return nil, fmt.Errorf("модель отказала: %s", response.Error.Message)
	}
	if len(response.Choices) == 0 {
		return nil, ErrBadAnswer
	}
	result, err := parseGeneration(response.Choices[0].Message.Content)
	if err != nil {
		return nil, err
	}
	item := &store.MicroFeedItem{
		Kind: result.Kind, Category: result.Category,
		TitleCyrillic: result.TitleCyrillic, TitleLatin: result.TitleLatin,
		TextCyrillic: result.TextCyrillic, TextLatin: result.TextLatin,
		OriginalLanguage: source.Language, OriginalScript: result.OriginalScript,
		CEFR: result.CEFR, Tags: result.Tags,
		DifficultWords: storeDifficultWords(result.DifficultWords),
		SourceSlug:     source.Slug, SourceTitle: input.Title,
		SourceURL: input.SourceURL, SourcePublishedAt: input.SourcePublishedAt,
		LicenseCode:     source.LicenseCode,
		AttributionText: source.AttributionName,
		SourceImportID:  &input.ID,
	}
	return item, nil
}

func parseGeneration(content string) (*generationResult, error) {
	text := strings.TrimSpace(content)
	if start := strings.Index(text, "{"); start > 0 {
		text = text[start:]
	}
	if end := strings.LastIndex(text, "}"); end >= 0 {
		text = text[:end+1]
	}
	var result generationResult
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return nil, ErrBadAnswer
	}
	result.TitleCyrillic = trim(result.TitleCyrillic, 140)
	result.TitleLatin = trim(result.TitleLatin, 140)
	result.TextCyrillic = cleanText(result.TextCyrillic)
	result.TextLatin = cleanText(result.TextLatin)
	if result.TitleLatin == "" && result.TitleCyrillic != "" {
		result.TitleLatin = lexicon.ToLatin(result.TitleCyrillic)
	}
	if result.TextLatin == "" && result.TextCyrillic != "" {
		result.TextLatin = lexicon.ToLatin(result.TextCyrillic)
	}
	result.Tags = normalizedTags(result.Tags)
	if len(result.DifficultWords) > 3 {
		result.DifficultWords = result.DifficultWords[:3]
	}
	item := &store.MicroFeedItem{
		Kind: result.Kind, Category: result.Category,
		TitleCyrillic: result.TitleCyrillic, TitleLatin: result.TitleLatin,
		TextCyrillic: result.TextCyrillic, TextLatin: result.TextLatin,
		OriginalLanguage: "sr", OriginalScript: result.OriginalScript,
		CEFR: result.CEFR, Tags: result.Tags,
		DifficultWords: storeDifficultWords(result.DifficultWords),
	}
	if err := ValidateItem(item); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrBadAnswer, err)
	}
	return &result, nil
}

var whitespace = regexp.MustCompile(`\s+`)

func ValidateItem(item *store.MicroFeedItem) error {
	if item == nil {
		return errors.New("пустая карточка")
	}
	if !slices.Contains([]string{"news", "fact", "culture", "science", "fiction", "society", "book_excerpt"}, item.Kind) {
		return errors.New("неверный тип карточки")
	}
	if !slices.Contains([]string{"history", "culture", "science", "fiction", "society", "news"}, item.Category) {
		return errors.New("неверная категория")
	}
	if !slices.Contains([]string{"A1", "A2", "B1", "B2", "C1"}, item.CEFR) {
		return errors.New("неверный уровень CEFR")
	}
	if !slices.Contains([]string{"cyrillic", "latin", "translated"}, item.OriginalScript) {
		return errors.New("неверно указан исходный алфавит")
	}
	if strings.TrimSpace(item.TitleCyrillic) == "" || strings.TrimSpace(item.TitleLatin) == "" {
		return errors.New("нужны оба варианта заголовка")
	}
	words := len(strings.Fields(item.TextLatin))
	if words < 70 || words > 190 {
		return fmt.Errorf("текст должен содержать 100–150 слов (допуск 70–190), сейчас %d", words)
	}
	if strings.TrimSpace(item.TextCyrillic) == "" || strings.TrimSpace(item.TextLatin) == "" {
		return errors.New("нужны кириллическая и латинская версии текста")
	}
	if len(item.Tags) < 3 || len(item.Tags) > 5 {
		return errors.New("нужно от 3 до 5 тегов")
	}
	if len(item.DifficultWords) != 3 {
		return errors.New("нужно ровно 3 сложных слова")
	}
	for _, word := range item.DifficultWords {
		if strings.TrimSpace(word.Word) == "" || strings.TrimSpace(word.TranslationRU) == "" {
			return errors.New("у сложного слова нет слова или перевода")
		}
	}
	if item.Kind == "book_excerpt" && item.BookTargetURL == "" {
		return errors.New("у книжного отрывка должна быть ссылка на книгу")
	}
	return nil
}

type embeddingRequest struct {
	Model          string `json:"model"`
	Input          string `json:"input"`
	EncodingFormat string `json:"encoding_format"`
	Dimensions     int    `json:"dimensions"`
}

type embeddingResponse struct {
	Data []struct {
		Embedding []float32 `json:"embedding"`
	} `json:"data"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (g *Generator) Embed(ctx context.Context, item *store.MicroFeedItem) ([]float32, error) {
	if !g.EmbeddingsEnabled() {
		return nil, ErrNotConfigured
	}
	request := embeddingRequest{
		Model: g.embeddingModel, Input: strings.Join([]string{
			item.TitleLatin, item.TextLatin, strings.Join(item.Tags, " "),
		}, "\n"),
		EncodingFormat: "float", Dimensions: 1536,
	}
	var response embeddingResponse
	if err := g.postJSON(ctx, g.embeddingURL, g.embeddingKey, request, &response); err != nil {
		return nil, err
	}
	if response.Error != nil {
		return nil, fmt.Errorf("модель эмбеддингов отказала: %s", response.Error.Message)
	}
	if len(response.Data) == 0 || len(response.Data[0].Embedding) != 1536 {
		return nil, errors.New("модель вернула embedding неверной размерности")
	}
	return response.Data[0].Embedding, nil
}

func (g *Generator) postJSON(ctx context.Context, rawURL, key string, input, output any) error {
	body, err := json.Marshal(input)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, rawURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+key)
	request.Header.Set("Content-Type", "application/json")
	response, err := g.client.Do(request)
	if err != nil {
		return fmt.Errorf("модель недоступна: %w", err)
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("модель ответила кодом %d", response.StatusCode)
	}
	if err := json.Unmarshal(raw, output); err != nil {
		return ErrBadAnswer
	}
	return nil
}

func normalizedTags(values []string) []string {
	result := make([]string, 0, 5)
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.ToLower(trim(value, 32))
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
		if len(result) == 5 {
			break
		}
	}
	return result
}

func trim(value string, limit int) string {
	value = strings.TrimSpace(whitespace.ReplaceAllString(value, " "))
	runes := []rune(value)
	if len(runes) > limit {
		return strings.TrimSpace(string(runes[:limit]))
	}
	return value
}
