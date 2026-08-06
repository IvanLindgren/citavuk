// Package lexicon держит сербский морфологический словарь в памяти.
//
// Данные встроены в бинарник (см. tools/lexicon_export.py): при 21 тысяче форм
// это около 300 КБ в сжатом виде и примерно 8 МБ в памяти, зато серверу не
// нужен ни драйвер SQLite, ни отдельный файл рядом с ним.
package lexicon

import (
	"bufio"
	"compress/gzip"
	"embed"
	"fmt"
	"strings"
	"sync"
)

//go:embed data/forms.tsv.gz data/dictionary.tsv.gz data/accents.tsv.gz data/verbs.tsv.gz
var files embed.FS

// Form — одна строка парадигмы.
type Form struct {
	Form  string `json:"form"`
	Lemma string `json:"lemma"`
	UPOS  string `json:"upos"`
	Feats string `json:"feats"`
}

// Accent — ударение словоформы.
//
// Место ударения в сербском по написанию не восстанавливается: ударений четыре
// (краткое и долгое, восходящее и нисходящее), и нужен настоящий словарь.
// Данные собраны из Викисловаря (CC BY-SA 4.0) — см. tools/build_accents.py.
type Accent struct {
	// Latin, Cyrillic — ударное написание в своём алфавите: читатель видит
	// текст в одном из них, и подменять азбуку в ответе нельзя.
	Latin    string `json:"latin,omitempty"`
	Cyrillic string `json:"cyrillic,omitempty"`
	// IPA — транскрипция с тоном: «/kɲîɡa/».
	IPA string `json:"ipa,omitempty"`
}

// AccentSource — указание источника, обязательное по лицензии CC BY-SA.
const AccentSource = "Викисловарь (CC BY-SA 4.0)"

// Lexicon — словарь форм, переводов лемм и ударений.
type Lexicon struct {
	byForm  map[string][]Form
	byLemma map[string][]Form
	words   map[string]string
	accents map[string]Accent
	// verbs — словоформа глагола → начальная форма. Свой лексикон разрежен, и
	// целых глаголов вроде «bližiti» в нём нет вовсе; без этого списка частица
	// «se» не находила своего глагола в первом же попавшемся предложении.
	verbs map[string]string
}

var (
	once   sync.Once
	shared *Lexicon
	loeErr error
)

// Shared загружает словарь один раз на процесс.
func Shared() (*Lexicon, error) {
	once.Do(func() { shared, loeErr = load() })
	return shared, loeErr
}

func load() (*Lexicon, error) {
	l := &Lexicon{
		byForm:  make(map[string][]Form, 24000),
		byLemma: make(map[string][]Form, 12000),
		words:   make(map[string]string, 9000),
		accents: make(map[string]Accent, 60000),
		verbs:   make(map[string]string, 130000),
	}

	if err := readLines("data/forms.tsv.gz", func(parts []string) {
		if len(parts) < 4 {
			return
		}
		f := Form{Form: parts[0], Lemma: parts[1], UPOS: parts[2], Feats: parts[3]}
		key := Normalize(f.Form)
		l.byForm[key] = append(l.byForm[key], f)
		lemmaKey := Normalize(f.Lemma)
		l.byLemma[lemmaKey] = append(l.byLemma[lemmaKey], f)
	}); err != nil {
		return nil, err
	}

	if err := readLines("data/dictionary.tsv.gz", func(parts []string) {
		if len(parts) < 2 || parts[1] == "" {
			return
		}
		l.words[Normalize(parts[0])] = parts[1]
	}); err != nil {
		return nil, err
	}

	if err := readLines("data/accents.tsv.gz", func(parts []string) {
		if len(parts) < 4 || parts[0] == "" {
			return
		}
		if parts[1] == "" && parts[2] == "" && parts[3] == "" {
			return
		}
		l.accents[parts[0]] = Accent{Latin: parts[1], Cyrillic: parts[2], IPA: parts[3]}
	}); err != nil {
		return nil, err
	}

	if err := readLines("data/verbs.tsv.gz", func(parts []string) {
		if len(parts) < 2 || parts[0] == "" || parts[1] == "" {
			return
		}
		l.verbs[parts[0]] = parts[1]
	}); err != nil {
		return nil, err
	}

	return l, nil
}

func readLines(name string, fn func([]string)) error {
	file, err := files.Open(name)
	if err != nil {
		return fmt.Errorf("лексикон %s: %w", name, err)
	}
	defer file.Close()

	zr, err := gzip.NewReader(file)
	if err != nil {
		return fmt.Errorf("лексикон %s: %w", name, err)
	}
	defer zr.Close()

	scanner := bufio.NewScanner(zr)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		fn(strings.Split(line, "\t"))
	}
	return scanner.Err()
}

// LookupForm возвращает разборы словоформы.
func (l *Lexicon) LookupForm(word string) []Form {
	return l.byForm[Normalize(word)]
}

// Paradigm возвращает все известные формы леммы.
func (l *Lexicon) Paradigm(lemma string) []Form {
	return l.byLemma[Normalize(lemma)]
}

// Translate возвращает словарный перевод леммы или пустую строку.
func (l *Lexicon) Translate(word string) string {
	return l.words[Normalize(word)]
}

// Accent возвращает ударение словоформы. Второе значение — false, если этой
// формы в словаре ударений нет: достраивать ударение правилом нельзя, оно
// гуляет по парадигме («knjȉga», но «knjȋgā»).
func (l *Lexicon) Accent(word string) (Accent, bool) {
	accent, ok := l.accents[Normalize(word)]
	return accent, ok
}

// VerbLemma возвращает начальную форму, если словоформа известна как глагольная.
func (l *Lexicon) VerbLemma(word string) (string, bool) {
	lemma, ok := l.verbs[Normalize(word)]
	return lemma, ok
}

// Size сообщает объём словаря — используется в /v1/health.
func (l *Lexicon) Size() (forms, lemmas, words int) {
	return len(l.byForm), len(l.byLemma), len(l.words)
}
