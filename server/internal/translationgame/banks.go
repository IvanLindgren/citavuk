package translationgame

import (
	"embed"
	"fmt"
	"strings"
)

// Первые 15 строк каждого файла сохраняют старые идентификаторы. Новые фразы
// дописываются в конец; файлы входят в бинарник, чтения диска в запросах нет.
//
//go:embed phrases/*/*.txt
var phraseFiles embed.FS

var serbianSentences = loadBank(DirectionSrRu)
var russianSentences = loadBank(DirectionRuSr)

func loadBank(direction string) map[string][]string {
	banks := make(map[string][]string, len(Levels))
	for _, level := range Levels {
		raw, err := phraseFiles.ReadFile("phrases/" + direction + "/" + level + ".txt")
		if err != nil {
			panic(fmt.Sprintf("банк фраз %s/%s: %v", direction, level, err))
		}
		seen := map[string]bool{}
		for _, line := range strings.Split(string(raw), "\n") {
			text := strings.TrimSpace(line)
			if text == "" {
				continue
			}
			key := strings.ToLower(text)
			if seen[key] {
				panic(fmt.Sprintf("повтор фразы %s/%s: %s", direction, level, text))
			}
			seen[key] = true
			banks[level] = append(banks[level], text)
		}
		if len(banks[level]) < 15 {
			panic("в банке фраз меньше трёх раундов: " + direction + "/" + level)
		}
	}
	return banks
}
