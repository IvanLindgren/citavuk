package api

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/citavuk/server/internal/dictionary"
)

// definitionLookup — то, что нужно серверу от словаря. Интерфейс, а не
// *dictionary.Client, чтобы обработчик проверялся без похода в чужую сеть.
type definitionLookup interface {
	Lookup(ctx context.Context, word string) (*dictionary.Entry, error)
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
	if errors.Is(err, dictionary.ErrNotFound) {
		// 404 — обычный ответ: толковый словарь знает далеко не каждое слово,
		// и для клиента это «карточку не показываем», а не сбой.
		writeError(w, http.StatusNotFound, "not_found", "слова нет в словаре")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_error", "словарь недоступен")
		return
	}

	writeJSON(w, http.StatusOK, entry)
}
