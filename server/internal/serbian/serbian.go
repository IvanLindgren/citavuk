// Package serbian проверяет, что текст написан по-сербски.
//
// Нужен для обсуждения книг: правило раздела — писать только на сербском, и
// проверять его должен сервер. Клиент проверять нельзя вовсе: правило,
// проверяемое только в интерфейсе, обходится одним запросом мимо него.
//
// Проверка нарочно снисходительная. Задача — отсечь сообщения, написанные
// целиком по-русски или по-английски, а не судить о грамотности. Человек,
// который учит язык, пишет с ошибками — это и есть смысл упражнения, и ошибки
// не повод отклонять сообщение. Поэтому решение принимается по совокупности
// признаков, а не по одному слову.
package serbian

import (
	"regexp"
	"strings"
	"unicode"

	"github.com/citavuk/server/internal/lexicon"
)

// Verdict — исход проверки.
type Verdict struct {
	OK bool
	// Reason — что сказать человеку. Пусто, если всё в порядке.
	Reason string
}

// Буквы, которых в сербском нет ни в одной графике. Их присутствие — верный
// признак русского (или украинского) текста: сербская кириллица обходится
// тридцатью буквами без ы, э, ъ, ё, щ, й, ю, я.
var foreignCyrillic = []rune("ыэъёщйюяєіїґ")

// Русские служебные слова, которых в сербском не бывает. По ним русский текст
// узнаётся даже без чужих букв — например, если писать латиницей.
var russianWords = map[string]bool{
	"это": true, "что": true, "как": true, "или": true, "если": true,
	"когда": true, "потому": true, "очень": true, "здесь": true, "там": true,
	"меня": true, "тебя": true, "него": true, "нее": true, "него́": true,
	"всё": true, "все": true, "надо": true, "нужно": true, "спасибо": true,
	"привет": true, "книга": true, "книгу": true, "страница": true,
	"eto": true, "chto": true, "kak": true, "ochen": true, "spasibo": true,
	"privet": true, "kniga": true, "nuzhno": true,
}

// Английские служебные слова. Ловят сообщения, написанные по-английски.
var englishWords = map[string]bool{
	"the": true, "this": true, "that": true, "with": true, "have": true,
	"what": true, "when": true, "where": true, "because": true, "about": true,
	"very": true, "really": true, "would": true, "could": true, "should": true,
	"thanks": true, "thank": true, "hello": true, "book": true, "page": true,
	"chapter": true, "please": true, "guys": true, "yeah": true,
}

// Сербские служебные слова. Совпадение с этим списком — самый надёжный
// положительный признак: такие слова есть почти в любой фразе.
var serbianWords = map[string]bool{
	"je": true, "su": true, "da": true, "se": true, "na": true, "za": true,
	"sa": true, "od": true, "do": true, "po": true, "iz": true, "kod": true,
	"ali": true, "ili": true, "kao": true, "ovo": true, "to": true, "ta": true,
	"taj": true, "ovaj": true, "koji": true, "koja": true, "koje": true,
	"nije": true, "nisam": true, "jesam": true, "bio": true, "bila": true,
	"sam": true, "smo": true, "ste": true, "ću": true, "ćemo": true,
	"jako": true, "veoma": true, "ovde": true, "tamo": true, "sada": true,
	"kada": true, "zato": true, "zašto": true, "hvala": true, "zdravo": true,
	"knjiga": true, "knjigu": true, "knjizi": true, "strana": true,
	"strani": true, "glava": true, "priča": true, "mislim": true,
	"razumem": true, "volim": true, "lepo": true, "dobro": true,
}

// Буквы, которые есть только в сербской (и соседних) латинице.
var serbianLetters = regexp.MustCompile(`[čćžšđČĆŽŠĐ]`)

// Сербская кириллица: буквы, которых нет в русском алфавите.
var serbianCyrillic = regexp.MustCompile(`[ђјљњћџЂЈЉЊЋЏ]`)

var words = regexp.MustCompile(`[\p{L}\p{M}']+`)

// MinWords — короче этого сообщение не проверить: по двум словам язык не виден.
// Такие сообщения пропускаются, только если в них есть сербские буквы.
const MinWords = 3

// Check решает, годится ли сообщение для обсуждения на сербском.
func Check(text string) Verdict {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return Verdict{Reason: "Сообщение пустое."}
	}

	found := words.FindAllString(strings.ToLower(trimmed), -1)
	if len(found) == 0 {
		return Verdict{Reason: "В сообщении нет слов."}
	}

	hasSerbianLetters := serbianLetters.MatchString(trimmed) ||
		serbianCyrillic.MatchString(trimmed)

	// Чужие буквы кириллицы — приговор сразу: ни в одной сербской графике их нет.
	for _, r := range trimmed {
		for _, bad := range foreignCyrillic {
			if unicode.ToLower(r) == bad {
				return Verdict{
					Reason: "Здесь пишут только по-сербски. В сообщении есть буквы, " +
						"которых в сербском нет.",
				}
			}
		}
	}

	russian, english, serbianHits := 0, 0, 0
	known := 0
	shared, err := lexicon.Shared()
	for _, word := range found {
		switch {
		case russianWords[word]:
			russian++
		case englishWords[word]:
			english++
		}
		if serbianWords[word] {
			serbianHits++
		}
		// Словарь знает 21 тысячу сербских форм — по нему видно сербские слова,
		// которых нет в коротком списке служебных.
		if err == nil && len(shared.LookupForm(word)) > 0 {
			known++
		}
	}

	serbianScore := serbianHits + known
	if serbianScore == 0 && hasSerbianLetters {
		// Букв достаточно: «Čitam đačku knjigu» может целиком не попасть в
		// словарь, но по буквам это точно не русский и не английский.
		serbianScore = 1
	}

	if len(found) < MinWords && serbianScore == 0 {
		return Verdict{
			Reason: "Напишите чуть подробнее — по двум словам не понять, " +
				"на каком языке сообщение.",
		}
	}

	foreign := russian + english
	if foreign > 0 && foreign >= serbianScore {
		if english > russian {
			return Verdict{Reason: "Здесь пишут только по-сербски, не по-английски."}
		}
		return Verdict{Reason: "Здесь пишут только по-сербски, не по-русски."}
	}
	if serbianScore == 0 {
		return Verdict{
			Reason: "Не похоже на сербский. Здесь можно писать только по-сербски — " +
				"в этом и смысл раздела.",
		}
	}
	return Verdict{OK: true}
}
