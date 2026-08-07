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

//go:embed data/forms.tsv.gz data/dictionary.tsv.gz data/accents.tsv.gz data/verbs.tsv.gz data/frequency.tsv.gz data/wordranks.tsv.gz data/bigforms.tsv.gz
var files embed.FS

// FrequencySource — указание источника, обязательное по лицензии CC BY-SA.
const FrequencySource = "srLex 1.3, ReLDI (CC BY-SA 4.0)"

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
	// rank — лемма → её место в частотном списке, начиная с единицы. Мера
	// редкости слова: по ней оценивается сложность текста и разводятся омонимы.
	// Сам srLex (6,9 млн словоформ) не встраивается — только 8 тысяч самых
	// частых лемм заняли бы в памяти около 180 МБ, а сервер стоит на общей
	// машине. Ранга для обеих задач достаточно.
	rank map[string]int
	// wordRank — то же для КАЖДОЙ словоформы этих лемм: «књигама» получает ранг
	// «књига». Нужен охват, которого у byForm нет и близко (21 тысяча форм
	// против 374 тысяч), иначе оценка сложности считает редким почти всё.
	wordRank *wordRanks
	// big — все формы двенадцати тысяч самых частых лемм из srLex. Свой словарь
	// собран из трибанка и разрежен; этот добирает охват, на котором и держится
	// разбор фразы (см. bigforms.go).
	big *bigForms
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
		rank:    make(map[string]int, 20000),
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

	// Порядок строк и есть ранг: файл отсортирован по убыванию частоты.
	// Повторно встреченная лемма ранг не меняет — первое вхождение самое частое.
	place := 0
	if err := readLines("data/frequency.tsv.gz", func(parts []string) {
		if len(parts) == 0 || parts[0] == "" {
			return
		}
		place++
		key := Normalize(parts[0])
		if _, seen := l.rank[key]; !seen {
			l.rank[key] = place
		}
	}); err != nil {
		return nil, err
	}

	wordRank, err := loadWordRanks()
	if err != nil {
		return nil, err
	}
	l.wordRank = wordRank

	big, err := loadBigForms()
	if err != nil {
		return nil, err
	}
	l.big = big

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
//
// Два источника, и оба нужны. Свой словарь собран из трибанка: он точен, и его
// разборы идут первыми — по ним выбирается самое вероятное прочтение. Но он
// разрежен, и на нём разбор фразы задыхался: у формы, известной одной строкой,
// выбирать между падежами не из чего. Расширенный словарь добирает остальные
// разборы и слова, которых в трибанке нет вовсе.
//
// Совпадающие строки не повторяются: разбор один и тот же, а лишняя строка
// перевесила бы выбор прочтения в сторону того, что просто есть в обоих
// словарях.
func (l *Lexicon) LookupForm(word string) []Form {
	key := Normalize(word)
	own := l.byForm[key]
	if l.big == nil {
		return own
	}
	extra := l.big.Lookup(key)
	if len(extra) == 0 {
		return own
	}
	seen := make(map[Form]bool, len(own))
	out := make([]Form, 0, len(own)+len(extra))
	for _, row := range own {
		seen[Form{Lemma: row.Lemma, UPOS: row.UPOS, Feats: row.Feats}] = true
		out = append(out, row)
	}
	for _, row := range extra {
		if seen[Form{Lemma: row.Lemma, UPOS: row.UPOS, Feats: row.Feats}] {
			continue
		}
		// Форма возвращается в том написании, о котором спросили: сравнивать
		// её потом будут с исходным словом.
		row.Form = key
		out = append(out, row)
	}
	return out
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

// Rank возвращает место леммы в частотном списке, начиная с единицы.
//
// Второе значение — false для слова за пределами списка. Это не «слова не
// существует»: список обрезан двадцатью тысячами лемм, дальше начинается хвост,
// где ранг уже ничего не различает. Для оценки сложности такое слово считается
// редким, и этого достаточно.
func (l *Lexicon) Rank(lemma string) (int, bool) {
	place, ok := l.rank[Normalize(lemma)]
	return place, ok
}

// WordRank возвращает место слова в частотном списке по его начальной форме:
// «књигама» получает ранг «књига».
//
// Работает с любой словоформой, а не только со словарной, и в этом весь смысл:
// начальную форму сначала надо найти, а морфологический словарь знает далеко не
// всё. Второе значение — false для слова за пределами списка.
func (l *Lexicon) WordRank(word string) (int, bool) {
	if l.wordRank == nil {
		return 0, false
	}
	return l.wordRank.lookup(Normalize(word))
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
