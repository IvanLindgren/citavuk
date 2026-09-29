// Package translationgame реализует учебную игру «Ты против переводчика».
package translationgame

import (
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"math/rand/v2"
	"strings"
)

var ErrInvalidRound = errors.New("неизвестный уровень или раунд")

// Направление перевода. Пустая строка означает сербский→русский: так игра
// работала до появления второго направления, и старые клиенты поля не шлют.
const (
	DirectionSrRu = "sr-ru"
	DirectionRuSr = "ru-sr"
)

// NormalizeDirection приводит значение к известному, пустое — к sr-ru.
func NormalizeDirection(value string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", DirectionSrRu:
		return DirectionSrRu, true
	case DirectionRuSr:
		return DirectionRuSr, true
	}
	return "", false
}

// Languages возвращает коды исходного и целевого языка для направления.
func Languages(direction string) (source, target string) {
	if direction == DirectionRuSr {
		return "ru", "sr"
	}
	return "sr", "ru"
}

// Levels — уровни, на которых в игре есть фразы.
var Levels = []string{"A1", "A2", "B1", "B2", "C1", "C2"}

// KnownLevel проверяет уровень до похода за фразами.
func KnownLevel(level string) bool {
	level = strings.ToUpper(strings.TrimSpace(level))
	for _, known := range Levels {
		if known == level {
			return true
		}
	}
	return false
}

// Sentence — одна фраза раунда. Перевод намеренно отсутствует: его каждый раз
// делает выбранный пользователем сервис, иначе это была бы игра против ключа
// в JSON, а не против DeepL или Google.
type Sentence struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

const sentencesPerRound = 5

// Round возвращает пять фраз одного из трёх раундов выбранного направления.
func Round(level string, round int, direction string) ([]Sentence, error) {
	// Старые клиенты не передают идентификатор партии. У каждого раунда своя
	// непересекающаяся часть банка, но выбор и порядок меняются каждый запрос.
	return selectRound(level, round, direction, nil)
}

// RoundWithSeed задаёт единую перемешанную колоду для общей комнаты.
// Один seed даёт те же задания при повторе запроса и не повторяет их в матче.
func RoundWithSeed(level string, round int, direction, seed string) ([]Sentence, error) {
	level = strings.ToUpper(strings.TrimSpace(level))
	if normalized, ok := NormalizeDirection(direction); ok {
		direction = normalized
	}
	hash := sha256.Sum256([]byte(seed + "|" + level + "|" + direction))
	rng := rand.New(rand.NewPCG(binary.LittleEndian.Uint64(hash[:8]), binary.LittleEndian.Uint64(hash[8:16])))
	return selectRound(level, round, direction, rng)
}

func selectRound(level string, round int, direction string, rng *rand.Rand) ([]Sentence, error) {
	level = strings.ToUpper(strings.TrimSpace(level))
	direction, ok := NormalizeDirection(direction)
	if !ok {
		return nil, ErrInvalidRound
	}
	banks := serbianSentences
	if direction == DirectionRuSr {
		banks = russianSentences
	}
	bank, ok := banks[level]
	if !ok || round < 1 || round > 3 || len(bank) < 15 {
		return nil, ErrInvalidRound
	}
	indices := make([]int, 0, len(bank))
	for i := range bank {
		if rng != nil || i%3 == round-1 {
			indices = append(indices, i)
		}
	}
	start := 0
	if rng != nil {
		rng.Shuffle(len(indices), func(i, j int) { indices[i], indices[j] = indices[j], indices[i] })
		start = (round - 1) * sentencesPerRound
	} else {
		rand.Shuffle(len(indices), func(i, j int) { indices[i], indices[j] = indices[j], indices[i] })
	}
	out := make([]Sentence, sentencesPerRound)
	for i, index := range indices[start : start+sentencesPerRound] {
		// Идентификаторы сербского направления не меняются: они уже разошлись
		// по клиентам. Обратное направление получает свой префикс, иначе одна
		// и та же строка означала бы две разные фразы.
		id := fmt.Sprintf("%s-%02d", strings.ToLower(level), index+1)
		if direction == DirectionRuSr {
			id = "ru-" + id
		}
		out[i] = Sentence{ID: id, Text: bank[index]}
	}
	return out, nil
}
