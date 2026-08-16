package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/citavuk/server/internal/dictionary"
)

// definitionLookup — то, что нужно серверу от словаря. Интерфейс, а не
// *dictionary.Client, чтобы обработчик проверялся без похода в чужую сеть.
type definitionLookup interface {
	Lookup(ctx context.Context, word string) (*dictionary.Entry, error)
}

// wordExplainer — запасное толкование от нейросети.
type wordExplainer interface {
	Enabled() bool
	Explain(ctx context.Context, word string) (*dictionary.Entry, error)
}

// definitionCache — сочинённые толкования, сохранённые в базе.
type definitionCache interface {
	CachedDefinition(ctx context.Context, word string) ([]byte, bool, error)
	SaveDefinition(ctx context.Context, word string, entry []byte, model string) error
}

// handleDefinition отдаёт толкование слова на сербском.
//
// Перевод отвечает на вопрос «что это по-русски», толкование — «что это
// значит»: у «reč» и «слово» разные границы, и на уровне выше начального
// объяснение на изучаемом языке точнее любого перевода.
//
// Спрашивать надо начальную форму: словарь ведётся по заглавным словам, и
// «нихилизму» в нём нет. Форму приводит клиент — у него уже есть разбор.
func (s *Server) handleDefinition(w http.ResponseWriter, r *http.Request) {
	word := strings.TrimSpace(r.URL.Query().Get("word"))
	if word == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "не указано слово")
		return
	}
	// Ограничение длины: в словарь ходят за одним словом, а не за предложением.
	if len([]rune(word)) > 64 {
		writeError(w, http.StatusBadRequest, "invalid_request", "слишком длинный запрос")
		return
	}

	entry, err := s.dictionary.Lookup(r.Context(), word)
	if err == nil {
		writeJSON(w, http.StatusOK, entry)
		return
	}
	missing := errors.Is(err, dictionary.ErrNotFound)
	if !missing {
		// Причину сбоя видно только здесь: наружу уходит голый 502, и без
		// записи в журнале не отличить таймаут чужого сайта от его поломки.
		slog.Warn("словарь не ответил", "слово", word, "err", err)
	}

	// Словарь вышел в прошлом веке и не знает ни заимствований, ни разговорной
	// речи, а лежащий словарь не знает вообще ничего. В обоих случаях слово
	// объясняет нейросеть — с честной подписью в карточке.
	generated, genErr := s.explainWord(r.Context(), word)
	if genErr == nil {
		writeJSON(w, http.StatusOK, generated)
		return
	}
	if missing || errors.Is(genErr, dictionary.ErrNotFound) {
		// Слова не знает никто — это обычный ответ, а не сбой: клиент по нему
		// просто не показывает карточку.
		writeError(w, http.StatusNotFound, "not_found", "слова нет в словаре")
		return
	}
	writeError(w, http.StatusBadGateway, "upstream_error", "словарь недоступен")
}

// explainWord берёт толкование у нейросети, заглядывая сначала в базу.
func (s *Server) explainWord(ctx context.Context, word string) (*dictionary.Entry, error) {
	if s.explainer == nil || !s.explainer.Enabled() {
		return nil, dictionary.ErrNotFound
	}
	if entry, known := s.cachedDefinition(ctx, word); known {
		if entry == nil {
			return nil, dictionary.ErrNotFound
		}
		return entry, nil
	}

	entry, err := s.explainer.Explain(ctx, word)
	if err != nil && !errors.Is(err, dictionary.ErrNotFound) {
		slog.Warn("нейросеть не объяснила слово", "слово", word, "err", err)
		return nil, err
	}
	s.saveDefinition(ctx, word, entry)
	if err != nil {
		return nil, err
	}
	return entry, nil
}

func (s *Server) cachedDefinition(ctx context.Context, word string) (*dictionary.Entry, bool) {
	if s.definitions == nil {
		return nil, false
	}
	raw, known, err := s.definitions.CachedDefinition(ctx, word)
	if err != nil {
		slog.Warn("чтение кеша толкований", "слово", word, "err", err)
		return nil, false
	}
	if !known {
		return nil, false
	}
	// Пустая запись — модель уже сказала, что такого слова нет.
	if len(raw) == 0 {
		return nil, true
	}
	var entry dictionary.Entry
	if err := json.Unmarshal(raw, &entry); err != nil {
		slog.Warn("разбор кеша толкований", "слово", word, "err", err)
		return nil, false
	}
	return &entry, true
}

// saveDefinition запоминает ответ модели, в том числе отказ: за каждое слово
// провайдеру платится один раз.
func (s *Server) saveDefinition(ctx context.Context, word string, entry *dictionary.Entry) {
	if s.definitions == nil {
		return
	}
	var raw []byte
	if entry != nil {
		encoded, err := json.Marshal(entry)
		if err != nil {
			return
		}
		raw = encoded
	}
	// Ответ уже оплачен, и терять его из-за закрытой вкладки обидно, поэтому
	// запись переживает отмену запроса.
	saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := s.definitions.SaveDefinition(saveCtx, word, raw, s.cfg.DefinitionAIModel); err != nil {
		slog.Warn("запись кеша толкований", "слово", word, "err", err)
	}
}
