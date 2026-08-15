package duel

import (
	"crypto/rand"
	"strings"
)

// Код комнаты диктуют вслух и переписывают с экрана, поэтому в алфавите нет ни
// нуля с буквой O, ни единицы с I и L. Шесть знаков из тридцати одного — это
// около девятисот миллионов комбинаций: подобрать чужую комнату перебором
// нельзя, а продиктовать свою можно.
const (
	codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
	CodeLength   = 6
)

// NewCode придумывает код комнаты.
func NewCode() string {
	raw := make([]byte, CodeLength)
	if _, err := rand.Read(raw); err != nil {
		// crypto/rand на живой системе не отказывает; если отказал, играть
		// всё равно нельзя.
		panic(err)
	}
	out := make([]byte, CodeLength)
	for i, value := range raw {
		out[i] = codeAlphabet[int(value)%len(codeAlphabet)]
	}
	return string(out)
}

// CleanCode приводит введённый код к каноническому виду. Пробелы и дефисы
// прощаются: код переписывают с чужого экрана и разбивают на части как удобно.
func CleanCode(code string) (string, bool) {
	code = strings.ToUpper(strings.TrimSpace(code))
	code = strings.NewReplacer(" ", "", "-", "").Replace(code)
	if len(code) != CodeLength {
		return "", false
	}
	for _, letter := range code {
		if !strings.ContainsRune(codeAlphabet, letter) {
			return "", false
		}
	}
	return code, true
}
