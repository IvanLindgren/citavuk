package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/citavuk/server/internal/formhint"
	"github.com/citavuk/server/internal/grammar"
	"github.com/citavuk/server/internal/lexicon"
)

// Разбор словоформы, которой нет в лексиконе.
//
// Нейросеть отвечает на единственный вопрос: какая у этого слова начальная
// форма и часть речи. Всё остальное — падеж, число, лицо, таблицы склонения —
// считает грамматический движок, а сама подсказка принимается, только если
// парадигма от неё даёт ровно ту форму, которую разбирают. Модель тут не
// авторитет по грамматике (грамматику модели врут охотнее всего), а замена
// словарной статьи, которой у нас нет.

// formHinter — источник подсказки.
type formHinter interface {
	Enabled() bool
	Guess(ctx context.Context, form string) (*formhint.Hint, error)
}

// formHintCache — проверенные разборы, сохранённые в базе.
type formHintCache interface {
	CachedFormHint(ctx context.Context, form string) ([]byte, bool, error)
	SaveFormHint(ctx context.Context, form string, reading []byte, model string) error
}

// storedReading — то, что кладётся в базу: уже проверенный разбор, а не ответ
// модели. Перепроверять его при каждом чтении незачем.
type storedReading struct {
	Lemma string            `json:"lemma"`
	UPOS  string            `json:"upos"`
	Feats map[string]string `json:"feats"`
}

// applyFormHint дополняет разбор подсказкой. Возвращает, получилось ли.
func (s *Server) applyFormHint(
	r *http.Request, lex *lexicon.Lexicon, res *analyzeResponse, word string,
) bool {
	if s.formHint == nil || !s.formHint.Enabled() {
		return false
	}
	form := lexicon.Normalize(word)
	if !looksLikeWord(form) {
		return false
	}
	ctx := r.Context()

	reading, known := s.cachedFormHint(ctx, form)
	if !known {
		// К модели ходят только живые читатели: разбор открыт без входа, и
		// перебор случайных строк не должен обходиться нам в деньги. Отказы
		// тоже кешируются, поэтому один и тот же мусор платным не бывает.
		if s.hintLimit != nil && !s.hintLimit.allow(ctx, clientIP(r, s.cfg.TrustProxy)) {
			return false
		}
		reading = s.askFormHint(ctx, form)
	}
	if reading == nil {
		return false
	}

	res.Known = true
	res.Generated = true
	res.Lemma = reading.Lemma
	res.UPOS = reading.UPOS
	res.Feats = reading.Feats
	describeReading(lex, res, form)
	return true
}

// askFormHint спрашивает модель и проверяет ответ движком.
func (s *Server) askFormHint(ctx context.Context, form string) *storedReading {
	hint, err := s.formHint.Guess(ctx, form)
	if err != nil && !errors.Is(err, formhint.ErrNoHint) {
		slog.Warn("подсказка о форме не получена", "форма", form, "err", err)
		// Сбой связи не кешируется: он проходит сам, а запомненный отказ
		// остался бы навсегда.
		return nil
	}
	var reading *storedReading
	if hint != nil {
		reading = verifyHint(hint, form)
	}
	s.saveFormHint(ctx, form, reading)
	return reading
}

// verifyHint проверяет догадку своим движком: парадигма от предложенной
// начальной формы обязана давать разбираемую форму. Не сошлось — разбора нет.
//
// Признаки берутся из проверки, а не из ответа модели. Модель может назвать
// верную начальную форму и при этом ошибиться в падеже — а движок, раз форма
// сошлась, знает падеж точно.
func verifyHint(hint *formhint.Hint, form string) *storedReading {
	lemma := lexicon.Normalize(hint.Lemma)
	if lemma == "" {
		return nil
	}
	reading := &storedReading{Lemma: lemma, UPOS: hint.UPOS}

	switch hint.UPOS {
	case "NOUN", "PROPN":
		gender := hint.Gender
		if gender == "" {
			gender = grammar.GuessGender(lemma, nil)
		}
		feats, ok := grammar.MatchNoun(lemma, gender, form)
		if !ok {
			return nil
		}
		reading.Feats = feats
	case "VERB", "AUX":
		feats, ok := grammar.MatchVerb(lemma, form)
		if !ok {
			return nil
		}
		reading.Feats = feats
	case "ADJ":
		feats, ok := grammar.MatchAdjective(lemma, form)
		if !ok {
			return nil
		}
		reading.Feats = feats
	case "ADV":
		// Наречие не склоняется, и проверять парадигмой нечего: единственное
		// доказательство — что начальная форма совпала с разбираемой.
		if lemma != form {
			return nil
		}
		reading.Feats = map[string]string{}
	default:
		return nil
	}
	return reading
}

// looksLikeWord отсекает то, что разбирать бессмысленно: цифры, знаки,
// слишком короткое и слишком длинное.
func looksLikeWord(form string) bool {
	runes := []rune(form)
	if len(runes) < 2 || len(runes) > 30 {
		return false
	}
	for _, r := range runes {
		if !isWordRune(r) {
			return false
		}
	}
	return true
}

func isWordRune(r rune) bool {
	switch {
	case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z':
		return true
	case r == '-' || r == '\'':
		return true
	}
	// Сербская латиница с диакритикой: č, ć, đ, š, ž.
	return r > 127 && r < 0x2000
}

func (s *Server) cachedFormHint(ctx context.Context, form string) (*storedReading, bool) {
	if s.formHints == nil {
		return nil, false
	}
	raw, known, err := s.formHints.CachedFormHint(ctx, form)
	if err != nil {
		slog.Warn("чтение кеша разборов", "форма", form, "err", err)
		return nil, false
	}
	if !known {
		return nil, false
	}
	// Пустая запись — модель уже не смогла разобрать это слово.
	if len(raw) == 0 {
		return nil, true
	}
	var reading storedReading
	if err := json.Unmarshal(raw, &reading); err != nil {
		slog.Warn("разбор кеша разборов", "форма", form, "err", err)
		return nil, false
	}
	return &reading, true
}

func (s *Server) saveFormHint(ctx context.Context, form string, reading *storedReading) {
	if s.formHints == nil {
		return
	}
	var raw []byte
	if reading != nil {
		encoded, err := json.Marshal(reading)
		if err != nil {
			return
		}
		raw = encoded
	}
	// Ответ уже оплачен: терять его из-за того, что читатель закрыл вкладку,
	// незачем.
	saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := s.formHints.SaveFormHint(saveCtx, form, raw, s.cfg.FormHintAIModel); err != nil {
		slog.Warn("запись кеша разборов", "форма", form, "err", err)
	}
}
