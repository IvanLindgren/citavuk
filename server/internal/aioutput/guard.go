// Package aioutput проверяет то, что модель разрешено показать пользователю.
package aioutput

import (
	"context"
	"errors"
	"net"
	"strings"
	"time"
	"unicode"
)

var ErrTemporary = errors.New("временный отказ модели")

// Russian допускает цитаты сербского материала, но требует русскую речь.
func Russian(text string) bool {
	letters, cyrillic := 0, 0
	for _, r := range text {
		if unicode.Is(unicode.Han, r) || unicode.Is(unicode.Hiragana, r) || unicode.Is(unicode.Katakana, r) {
			return false
		}
		if unicode.IsLetter(r) {
			letters++
			if unicode.Is(unicode.Cyrillic, r) {
				cyrillic++
			}
		}
	}
	return cyrillic > 0 && cyrillic*4 >= letters
}

func ForeignScript(text string) bool {
	for _, r := range text {
		if unicode.Is(unicode.Han, r) || unicode.Is(unicode.Hiragana, r) || unicode.Is(unicode.Katakana, r) {
			return true
		}
	}
	return false
}

// Translation не принимает английское слово за русский перевод. Имена и
// аббревиатуры, которые переводчик оставил без изменения, допустимы.
func Translation(text, source, target string) bool {
	text = strings.NewReplacer("<w>", "", "</w>", "").Replace(text)
	text = strings.TrimSpace(text)
	if text == "" || ForeignScript(text) {
		return false
	}
	if !strings.EqualFold(target, "ru") {
		return true
	}
	if Russian(text) {
		return true
	}
	if text != strings.TrimSpace(source) {
		return false
	}
	letters := 0
	for _, r := range text {
		if unicode.IsLetter(r) {
			letters++
			if !unicode.IsUpper(r) {
				return false
			}
		}
	}
	return letters == 0 || letters > 1
}

// Retry ограничивает число повторов и прекращает их при уходе пользователя.
// Отказ авторизации, пустой материал и бизнес-ошибки повторять нельзя.
func Retry[T any](ctx context.Context, badAnswer error, call func(context.Context) (T, error)) (T, error) {
	var result T
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		if ctx.Err() != nil {
			return result, ctx.Err()
		}
		attemptCtx, cancel := context.WithTimeout(ctx, 40*time.Second)
		result, err = call(attemptCtx)
		cancel()
		if err == nil {
			return result, nil
		}
		var network net.Error
		retry := errors.Is(err, badAnswer) || errors.Is(err, ErrTemporary) || errors.As(err, &network) || errors.Is(err, context.DeadlineExceeded)
		if !retry || ctx.Err() != nil || attempt == 2 {
			return result, err
		}
		timer := time.NewTimer(time.Duration(attempt+1) * 250 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return result, ctx.Err()
		case <-timer.C:
		}
	}
	return result, err
}
