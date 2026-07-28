package store

import (
	"encoding/json"
	"testing"
)

// Спецсимволы собираются из кодов, а не пишутся escape-строками в исходнике:
// U+2028 и нулевой байт невидимы в редакторе, и случайная замена такого символа
// на пробел тихо превратила бы проверку в бессмысленную.
var (
	lineSeparator      = string(rune(0x2028)) // разделитель строк из Word
	paragraphSeparator = string(rune(0x2029))
	nulByte            = string(rune(0))
	formFeed           = string(rune(0x0C)) // разрыв страницы из PDF
)

// contentSHACases — общий с клиентами набор примеров.
//
// Адрес текста считают все три реализации: клиент — чтобы выгрузить книгу,
// сервер — чтобы убедиться, что содержимое соответствует заявленному адресу.
// Любое расхождение делает выгрузку невозможной, причём молча: сервер просто
// отвечает «адрес не совпадает». Поэтому значения зафиксированы одинаковыми
// наборами в трёх местах:
//   - здесь;
//   - frontend/test/services/sync_content_test.dart;
//   - web/src/lib/content.test.ts.
var contentSHACases = []struct {
	name       string
	paragraphs []string
	want       string
}{
	{
		name:       "пустая книга",
		paragraphs: []string{},
		want:       "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
	},
	{
		name:       "кириллица",
		paragraphs: []string{"Ово је прва глава књиге."},
	},
	{
		// Символы разметки: пока адрес считался из JSON, Go экранировал «<»,
		// «>» и «&», а Dart и JavaScript — нет.
		name: "латиница с диакритикой и символы разметки",
		paragraphs: []string{
			"Čitao sam je celu noć.",
			"Услов a < b & c > d важен.",
		},
	},
	{
		name:       "кавычки и обратный слеш",
		paragraphs: []string{`Строка с "кавычками" и \обратным слешем`},
	},
	{
		name:       "эмодзи и перевод строки",
		paragraphs: []string{"Эмодзи \U0001F43A и перевод строки\nвнутри абзаца"},
	},
	{
		// Ровно на этих символах Go расходился с JavaScript и Dart: Go
		// экранирует их всегда, те двое — никогда, и книга с таким символом
		// не выгружалась вовсе.
		name:       "разделители строк из Word",
		paragraphs: []string{"текст" + lineSeparator + "ещё", "и" + paragraphSeparator + "ещё"},
	},
	{
		name:       "перевод страницы и табуляция",
		paragraphs: []string{"Прва глава." + formFeed + "Друга глава.", "с\tтабуляцией"},
	},
}

func TestContentSHAIsStable(t *testing.T) {
	for _, c := range contentSHACases {
		t.Run(c.name, func(t *testing.T) {
			sha, payload, err := ContentSHA(c.paragraphs)
			if err != nil {
				t.Fatal(err)
			}
			if len(sha) != 64 {
				t.Fatalf("длина адреса %d, ожидалось 64", len(sha))
			}
			if c.want != "" && sha != c.want {
				t.Errorf("адрес = %s, ожидался %s", sha, c.want)
			}

			// Содержимое обязано разбираться обратно без потерь: именно этот
			// JSON уходит клиенту при скачивании книги.
			var back []string
			if err := json.Unmarshal(payload, &back); err != nil {
				t.Fatalf("payload не разбирается: %v", err)
			}
			if len(back) != len(c.paragraphs) {
				t.Fatalf("абзацев %d, ожидалось %d", len(back), len(c.paragraphs))
			}
			for i := range back {
				if back[i] != c.paragraphs[i] {
					t.Errorf("абзац %d исказился:\n  %q\n  %q", i, back[i], c.paragraphs[i])
				}
			}
		})
	}
}

// Адрес обязан меняться при любой правке текста, иначе исправленная книга не
// доедет до других устройств: они увидят прежний адрес и решат, что уже всё
// скачали.
func TestContentSHAChangesWithContent(t *testing.T) {
	a, _, _ := ContentSHA([]string{"Први пасус.", "Други пасус."})
	b, _, _ := ContentSHA([]string{"Први пасус.", "Други пасус!"})
	c, _, _ := ContentSHA([]string{"Други пасус.", "Први пасус."})

	if a == b {
		t.Error("изменение символа не поменяло адрес")
	}
	if a == c {
		t.Error("перестановка абзацев не поменяла адрес")
	}
}

// Разбиение на абзацы обязано влиять на адрес при любом содержимом.
//
// Без префикса длины любой символ-разделитель рано или поздно встретится внутри
// абзаца, и два разных набора дадут один адрес — книги перепутаются между собой.
func TestContentSHAFramingIsUnambiguous(t *testing.T) {
	two, _, _ := ContentSHA([]string{"а", "б"})

	// Тот же текст одним абзацем, склеенный любым разделителем — включая тот,
	// которым выглядит сама рамка.
	joins := []string{"", nulByte, "\n", " ", "\t", lineSeparator, "2\n"}
	for _, join := range joins {
		single, _, _ := ContentSHA([]string{"а" + join + "б"})
		if single == two {
			t.Errorf("абзац с разделителем %q совпал по адресу с двумя отдельными", join)
		}
	}

	// И наоборот: разные разбиения одного текста дают разные адреса.
	a, _, _ := ContentSHA([]string{"аб", "вг"})
	b, _, _ := ContentSHA([]string{"а", "бвг"})
	if a == b {
		t.Error("разные разбиения одного текста дали один адрес")
	}
}

// Печатает эталонные значения — их вставляют в дублирующие тесты на Dart и TS.
func TestPrintReferenceSHA(t *testing.T) {
	if !testing.Verbose() {
		t.Skip("запусти с -v, чтобы увидеть эталонные адреса")
	}
	for _, c := range contentSHACases {
		sha, _, _ := ContentSHA(c.paragraphs)
		t.Logf("REF %-42s %s", c.name, sha)
	}
}
