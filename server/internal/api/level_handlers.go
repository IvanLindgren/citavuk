package api

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/citavuk/server/internal/level"
	"github.com/citavuk/server/internal/lexicon"
	"github.com/citavuk/server/internal/store"
)

// Уровень сербского у аккаунта.
//
// Спрашивается один раз при первом входе и живёт на аккаунте, а не в разделе.
// До этого уровень знал только Вукоток и хранил его при устройстве — поэтому
// один человек отвечал на один вопрос в браузере, в телефоне и после чистки
// хранилища, а остальные разделы о его уровне не знали вовсе.

func (s *Server) handleSerbianLevel(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	current, err := s.store.GetSerbianLevel(r.Context(), user.ID)
	if err != nil {
		slog.Error("handleSerbianLevel", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось прочитать уровень.")
		return
	}
	writeJSON(w, http.StatusOK, current)
}

type serbianLevelRequest struct {
	Level string `json:"level"`
	// Source — «declared» или «test». Чужое значение приводится к «declared»:
	// выдать заявленный уровень за пройденный тест клиент не должен.
	Source string `json:"source"`
}

func (s *Server) handleSetSerbianLevel(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	var request serbianLevelRequest
	if err := decodeJSON(w, r, &request, 4<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать уровень.")
		return
	}
	saved, err := s.store.SetSerbianLevel(r.Context(), user.ID, request.Level, request.Source)
	if errors.Is(err, store.ErrUnknownSerbianLevel) {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Неизвестный уровень.")
		return
	}
	if err != nil {
		slog.Error("handleSetSerbianLevel", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить уровень.")
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

// handleLevelTest отдаёт вопросы теста.
//
// Вход не требуется: тест можно пройти и до регистрации — например на странице
// «О языке». Записывается результат только вошедшему, и это решает уже
// handleSetSerbianLevel.
func (s *Server) handleLevelTest(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"questions": level.Questions()})
}

type levelTestRequest struct {
	// Answers — выбранный вариант по идентификатору вопроса.
	Answers map[string]int `json:"answers"`
	// Save — записать полученный уровень в аккаунт. Отдельным флагом, потому
	// что тест можно пройти и просто из любопытства.
	Save bool `json:"save"`
}

// handleGradeLevelTest считает уровень по ответам.
//
// Проверка на сервере, а не на клиенте: отдай мы верные ответы браузеру, тест
// перестал бы что-либо измерять — они лежали бы в исходниках страницы.
func (s *Server) handleGradeLevelTest(w http.ResponseWriter, r *http.Request) {
	var request levelTestRequest
	if err := decodeJSON(w, r, &request, 8<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать ответы.")
		return
	}
	if len(request.Answers) > level.Count() {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Слишком много ответов.")
		return
	}
	result := level.Grade(request.Answers)

	if request.Save {
		if user := userFrom(r.Context()); user != nil {
			if _, err := s.store.SetSerbianLevel(
				r.Context(), user.ID, result.Level, store.LevelSourceTest,
			); err != nil {
				// Уровень посчитан и показан; не сохранился — человек увидит
				// вопрос ещё раз, но результат терять из-за этого нельзя.
				slog.Error("handleGradeLevelTest save", "err", err)
			}
		}
	}
	writeJSON(w, http.StatusOK, result)
}

type textLevelRequest struct {
	// Paragraphs — выборка из книги, а не книга целиком. Оценщик всё равно
	// смотрит не больше 1200 слов, отобранных по всему тексту, и гнать через
	// сеть роман ради этого незачем. Отбирает клиент — он и так держит книгу
	// в памяти, чтобы её показать.
	Paragraphs []string `json:"paragraphs"`
}

// handleTextLevel оценивает, на какой уровень рассчитан текст.
//
// Вход не требуется: книгу открывают и не входя, а предупреждение полезно и
// тогда. Уровень читателя приходит от клиента вместе с ответом сервера — здесь
// считается только сложность текста.
func (s *Server) handleTextLevel(w http.ResponseWriter, r *http.Request) {
	var request textLevelRequest
	// Мегабайт: выборка из книги, а не книга. Больше — почти наверняка клиент,
	// который шлёт весь текст, и принимать такое молча не стоит.
	if err := decodeJSON(w, r, &request, 1<<20); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать текст.")
		return
	}
	lex, err := lexicon.Shared()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, codeInternal, "Словарь недоступен.")
		return
	}
	writeJSON(w, http.StatusOK, level.Estimate(lex, request.Paragraphs))
}
