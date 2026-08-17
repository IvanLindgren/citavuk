// Package photoscan вытаскивает сербский текст из снимка.
//
// Читать по-сербски приходится не только книги: объявление в подъезде, вывеска,
// меню, слова, выписанные от руки в тетрадь. Всё это в приложение попасть не
// могло — импорт принимал файл, а не то, что человек видит перед собой.
//
// Распознаёт мультимодальная модель общего назначения. Причина простая: у
// Polza AI, где лежат все остальные ключи проекта, выделенной OCR-модели нет —
// ни отдельной ручки, ни модели в каталоге. Выбор был не «модель против OCR», а
// «мультимодальная модель против второго провайдера с отдельным ключом».
//
// Материал за этот выбор тоже говорит: сербский пишется двумя письмами, и на
// одном плакате они соседствуют; классические распознаватели вроде Tesseract
// путают ć, č, đ, š, ž между собой и с латиницей без диакритики, а рукописную
// тетрадь не берут вовсе. Модель к тому же держит текст, снятый под углом и с
// тенью, — то есть ровно то, как снимают телефоном. Но на печатной вывеске
// хороший специализированный OCR был бы и точнее, и дешевле: если такой
// появится, менять придётся только этот пакет.
//
// Модель здесь переписчик, а не переводчик и не редактор: она обязана отдать то,
// что написано, включая ошибки автора. Исправленный текст врал бы в разборе слов
// и в словаре, а поправить снимок человек всё равно может сам — распознанное
// показывается ему до сохранения.
package photoscan

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ErrNoText — на снимке не нашлось читаемого текста.
var ErrNoText = errors.New("photoscan: текста на снимке нет")

// MaxImageBytes — предел размера кадра.
//
// Снимок телефона после сжатия — около мегабайта; шесть с запасом покрывают
// кадр без сжатия. Больше отправлять незачем: модель всё равно ужимает картинку
// до своей стороны, а платится за неё как за целую.
const MaxImageBytes = 6 << 20

// Scanner ходит к модели. Пустой ключ просто выключает съёмку.
type Scanner struct {
	apiKey string
	model  string
	url    string
	client *http.Client
}

func New(apiKey, model, url string) *Scanner {
	return &Scanner{
		apiKey: strings.TrimSpace(apiKey),
		model:  strings.TrimSpace(model),
		url:    strings.TrimSpace(url),
		// Снимок ждёт человек с телефоном в руках, но разбор целой страницы
		// тетради быстрее минуты и не бывает.
		client: &http.Client{Timeout: 90 * time.Second},
	}
}

func (s *Scanner) Enabled() bool {
	return s != nil && s.apiKey != "" && s.model != "" && s.url != ""
}

const prompt = `Ti si prepisivač teksta sa fotografije.
Prepiši SVE što je na slici napisano, tačno onako kako piše.
Pravila:
- ne prevodi i ne ispravljaj greške autora, prepiši ih kako jesu;
- zadrži pismo kojim je napisano: ćirilicu kao ćirilicu, latinicu kao latinicu;
- zadrži dijakritike: č, ć, đ, š, ž;
- prazan red između odvojenih delova teksta (pasus, natpis, stavka spiska);
- ne dodaji naslove, objašnjenja ni komentare o slici.
Ako na slici nema čitljivog teksta, vrati {"empty": true}.
Odgovori isključivo JSON-om: {"empty": false, "text": "..."}`

type contentPart struct {
	Type     string    `json:"type"`
	Text     string    `json:"text,omitempty"`
	ImageURL *imageURL `json:"image_url,omitempty"`
}

type imageURL struct {
	URL string `json:"url"`
}

type chatMessage struct {
	Role    string        `json:"role"`
	Content []contentPart `json:"content"`
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

type answer struct {
	Empty bool   `json:"empty"`
	Text  string `json:"text"`
}

// Recognize отдаёт текст снимка абзацами.
func (s *Scanner) Recognize(ctx context.Context, image []byte, mime string) ([]string, error) {
	if !s.Enabled() {
		return nil, errors.New("photoscan: распознавание не настроено")
	}
	if len(image) == 0 {
		return nil, ErrNoText
	}
	if len(image) > MaxImageBytes {
		return nil, fmt.Errorf("photoscan: снимок больше %d МБ", MaxImageBytes>>20)
	}

	content, err := s.ask(ctx, image, mime)
	if err != nil {
		return nil, err
	}
	return Paragraphs(content)
}

func (s *Scanner) ask(ctx context.Context, image []byte, mime string) (string, error) {
	data := "data:" + imageMime(mime) + ";base64," +
		base64.StdEncoding.EncodeToString(image)

	request := chatRequest{
		Model: s.model,
		Messages: []chatMessage{{
			Role: "user",
			Content: []contentPart{
				{Type: "text", Text: prompt},
				{Type: "image_url", ImageURL: &imageURL{URL: data}},
			},
		}},
		Temperature: 0,
		// Страница тетради — это тысячи знаков, и обрезанный на середине текст
		// человек унесёт в книгу, не заметив пропажи.
		MaxTokens: 8000,
	}
	request.ResponseFormat.Type = "json_object"

	body, err := json.Marshal(request)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<21))
	if err != nil {
		return "", err
	}
	var parsed chatResponse
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		reason := fmt.Sprintf("код %d", resp.StatusCode)
		if json.Unmarshal(raw, &parsed) == nil && parsed.Error != nil {
			reason = parsed.Error.Message
		}
		return "", fmt.Errorf("photoscan: нейросеть отказала: %s", reason)
	}
	if json.Unmarshal(raw, &parsed) != nil || len(parsed.Choices) == 0 {
		return "", errors.New("photoscan: неразборчивый ответ нейросети")
	}
	return parsed.Choices[0].Message.Content, nil
}

// imageMime приводит тип к тому, что понимает модель.
//
// Телефон отдаёт кадр как image/jpeg, но клиент может и промолчать, и прислать
// «image/jpg», которого в природе нет.
func imageMime(mime string) string {
	switch strings.ToLower(strings.TrimSpace(mime)) {
	case "image/png":
		return "image/png"
	case "image/webp":
		return "image/webp"
	case "image/heic", "image/heif":
		return "image/heic"
	default:
		return "image/jpeg"
	}
}

// Paragraphs разбирает ответ модели в абзацы.
//
// Отдельно от запроса, чтобы разбор проверялся тестами без похода к модели:
// именно тут ломается всё, что модель делает не по просьбе.
func Paragraphs(content string) ([]string, error) {
	text := strings.TrimSpace(content)
	// Модель иногда обрамляет JSON пояснением или ```json — берём то, что между
	// первой скобкой и последней.
	if start := strings.Index(text, "{"); start > 0 {
		text = text[start:]
	}
	if end := strings.LastIndex(text, "}"); end >= 0 {
		text = text[:end+1]
	}

	var out answer
	if json.Unmarshal([]byte(text), &out) != nil {
		return nil, errors.New("photoscan: неразборчивый ответ нейросети")
	}
	if out.Empty {
		return nil, ErrNoText
	}

	paragraphs := splitParagraphs(out.Text)
	if len(paragraphs) == 0 {
		return nil, ErrNoText
	}
	return paragraphs, nil
}

// splitParagraphs режет по пустым строкам, а одиночные переносы оставляет.
//
// Одиночный перенос на плакате — это перенос строки, а не новая мысль: склеив
// их в один абзац, мы потеряли бы разбивку вывески, а разорвав по каждому —
// нарубили бы книгу из обрывков в два слова.
func splitParagraphs(text string) []string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")

	var out []string
	for _, block := range strings.Split(text, "\n\n") {
		var lines []string
		for _, line := range strings.Split(block, "\n") {
			if trimmed := strings.TrimSpace(line); trimmed != "" {
				lines = append(lines, trimmed)
			}
		}
		if len(lines) > 0 {
			out = append(out, strings.Join(lines, "\n"))
		}
	}
	return out
}
