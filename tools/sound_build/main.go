// Command sound_build синтезирует короткие звуки обратной связи курса.
//
// Звуки генерируются, а не берутся из внешних библиотек: так у них понятная
// лицензия, предсказуемая громкость и воспроизводимый результат. Файлы
// намеренно тихие и короткие — сигнал не должен раздражать при частых ответах
// (master-prompt §19).
//
// Запуск из корня репозитория:
//
//	go run ./tools/sound_build
package main

import (
	"bytes"
	"encoding/binary"
	"flag"
	"fmt"
	"math"
	"os"
	"path/filepath"
)

const (
	sampleRate = 44100
	bitDepth   = 16
	channels   = 1
)

// note — одна нота: частота в герцах и длительность в миллисекундах.
type note struct {
	freq float64
	ms   int
}

// sound — описание генерируемого файла.
type sound struct {
	name      string
	notes     []note
	amplitude float64
	comment   string
}

// Ноты равномерного строя, A4 = 440 Гц.
const (
	f3 = 174.61
	a3 = 220.00
	c5 = 523.25
	e5 = 659.25
	g5 = 783.99
	a5 = 880.00
	c6 = 1046.50
)

var sounds = []sound{
	{
		name:      "correct.wav",
		notes:     []note{{e5, 90}, {a5, 130}},
		amplitude: 0.22,
		comment:   "восходящая пара — правильный ответ",
	},
	{
		name: "incorrect.wav",
		// Низкая нисходящая пара: слышно, что не получилось, но без резкости.
		// Звук не должен звучать как наказание.
		notes:     []note{{a3, 110}, {f3, 160}},
		amplitude: 0.18,
		comment:   "низкая нисходящая пара — ошибка",
	},
	{
		name:      "lesson_complete.wav",
		notes:     []note{{c5, 95}, {e5, 95}, {g5, 95}, {c6, 220}},
		amplitude: 0.22,
		comment:   "короткий арпеджио — урок завершён",
	},
}

func main() {
	out := flag.String("out", "frontend/assets/sounds", "каталог для звуков")
	flag.Parse()

	root, err := findRepoRoot()
	if err != nil {
		fmt.Fprintf(os.Stderr, "sound_build: %v\n", err)
		os.Exit(1)
	}
	dir := *out
	if !filepath.IsAbs(dir) {
		dir = filepath.Join(root, dir)
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "sound_build: %v\n", err)
		os.Exit(1)
	}

	for _, s := range sounds {
		data := renderWAV(s)
		path := filepath.Join(dir, s.name)
		if err := os.WriteFile(path, data, 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "sound_build: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("%-22s %5.1f КБ  %s\n", s.name, float64(len(data))/1024, s.comment)
	}
}

// renderWAV синтезирует последовательность нот в WAV-файл.
func renderWAV(s sound) []byte {
	var samples []int16
	for _, n := range s.notes {
		samples = append(samples, renderNote(n, s.amplitude)...)
	}

	var buf bytes.Buffer
	dataBytes := len(samples) * 2
	byteRate := sampleRate * channels * bitDepth / 8

	buf.WriteString("RIFF")
	binary.Write(&buf, binary.LittleEndian, uint32(36+dataBytes))
	buf.WriteString("WAVE")

	buf.WriteString("fmt ")
	binary.Write(&buf, binary.LittleEndian, uint32(16)) // размер fmt-блока
	binary.Write(&buf, binary.LittleEndian, uint16(1))  // PCM
	binary.Write(&buf, binary.LittleEndian, uint16(channels))
	binary.Write(&buf, binary.LittleEndian, uint32(sampleRate))
	binary.Write(&buf, binary.LittleEndian, uint32(byteRate))
	binary.Write(&buf, binary.LittleEndian, uint16(channels*bitDepth/8))
	binary.Write(&buf, binary.LittleEndian, uint16(bitDepth))

	buf.WriteString("data")
	binary.Write(&buf, binary.LittleEndian, uint32(dataBytes))
	for _, v := range samples {
		binary.Write(&buf, binary.LittleEndian, v)
	}
	return buf.Bytes()
}

// renderNote синтезирует одну ноту с мягкой атакой и затуханием.
//
// Без огибающей на стыках нот слышны щелчки, поэтому края обязательно
// сглаживаются.
func renderNote(n note, amplitude float64) []int16 {
	count := sampleRate * n.ms / 1000
	out := make([]int16, count)
	attack := float64(sampleRate) * 0.008 // 8 мс

	for i := 0; i < count; i++ {
		t := float64(i) / float64(sampleRate)

		// Основной тон плюс тихая октава — звук становится менее «пищащим».
		wave := math.Sin(2*math.Pi*n.freq*t) + 0.25*math.Sin(4*math.Pi*n.freq*t)
		wave /= 1.25

		env := 1.0
		if float64(i) < attack {
			env = float64(i) / attack
		}
		// Экспоненциальное затухание до конца ноты.
		env *= math.Exp(-3.2 * float64(i) / float64(count))

		v := wave * env * amplitude
		out[i] = int16(math.Max(-1, math.Min(1, v)) * math.MaxInt16)
	}
	return out
}

func findRepoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "frontend", "pubspec.yaml")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("не найден корень репозитория (frontend/pubspec.yaml)")
		}
		dir = parent
	}
}
