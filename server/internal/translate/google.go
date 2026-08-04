package translate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

// Google — запасной провайдер для одиночных слов.
//
// Он используется именно там, где DeepL непригоден. Замеры на тех же словах,
// на которых DeepL ошибается:
//
//	kuća   -> дом      (DeepL: собака)
//	kola   -> машина   (DeepL: торт / круглый)
//	raditi -> работать (DeepL: на работу)
//
// Это тот же публичный endpoint, которым уже пользуется Python-бэкенд проекта,
// поэтому переход на Go не меняет ни качество, ни зависимости. Официальной
// гарантии доступности у него нет — отсюда таймаут, ограничение размера ответа
// и обязательная деградация вызывающего кода при ошибке.
type Google struct {
	client *http.Client
}

// NewGoogle создаёт запасной провайдер.
func NewGoogle() *Google {
	return &Google{client: &http.Client{Timeout: 12 * time.Second}}
}

// Name возвращает идентификатор провайдера.
func (g *Google) Name() string { return "google" }

// TranslateWord переводит одно слово или короткий фрагмент.
func (g *Google) TranslateWord(ctx context.Context, text, source, target string) (string, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return "", ErrEmptyText
	}
	if source == "" {
		source = "sr"
	}
	if target == "" {
		target = "ru"
	}

	req, err := g.request(ctx, text, source, target)
	if err != nil {
		return "", err
	}
	resp, err := g.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("запасной переводчик недоступен: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("запасной переводчик вернул %s", resp.Status)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	return parseGoogleResponse(body)
}

// getLimitRunes — до какой длины запрос уходит обычным GET.
//
// Кириллица в адресе кодируется тремя байтами на букву, поэтому строка из
// тысячи знаков даёт адрес длиной шесть килобайт — такой запрос отвергают и
// прокси, и сам Google. Слово и предложение в предел укладываются с большим
// запасом, и путь для них остаётся прежним; длинный текст уходит телом POST.
const getLimitRunes = 400

func (g *Google) request(ctx context.Context, text, source, target string) (*http.Request, error) {
	params := url.Values{
		"client": {"gtx"},
		"sl":     {strings.ToLower(source)},
		"tl":     {strings.ToLower(target)},
		"dt":     {"t"},
	}

	if utf8.RuneCountInString(text) <= getLimitRunes {
		params.Set("q", text)
		return http.NewRequestWithContext(ctx, http.MethodGet,
			"https://translate.googleapis.com/translate_a/single?"+params.Encode(), nil)
	}

	body := url.Values{"q": {text}}.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://translate.googleapis.com/translate_a/single?"+params.Encode(),
		strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return req, nil
}

// parseGoogleResponse достаёт перевод из вложенных массивов ответа.
//
// Формат: [[[перевод, оригинал, ...], ...], ...]. Перевод длинного текста
// приходит разбитым на сегменты, которые нужно склеить в исходном порядке.
func parseGoogleResponse(body []byte) (string, error) {
	var outer []json.RawMessage
	if err := json.Unmarshal(body, &outer); err != nil || len(outer) == 0 {
		return "", errors.New("запасной переводчик: неразбираемый ответ")
	}
	var segments [][]json.RawMessage
	if err := json.Unmarshal(outer[0], &segments); err != nil {
		return "", errors.New("запасной переводчик: неожиданная структура ответа")
	}

	var b strings.Builder
	for _, seg := range segments {
		if len(seg) == 0 {
			continue
		}
		var part string
		if err := json.Unmarshal(seg[0], &part); err != nil {
			continue
		}
		b.WriteString(part)
	}
	out := strings.TrimSpace(b.String())
	if out == "" {
		return "", errors.New("запасной переводчик вернул пустой перевод")
	}
	return out, nil
}
