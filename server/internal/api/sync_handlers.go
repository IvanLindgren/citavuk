package api

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/citavuk/server/internal/store"
)

// handlePull отдаёт изменения новее курсора клиента.
func (s *Server) handlePull(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())

	since, err := strconv.ParseInt(r.URL.Query().Get("since"), 10, 64)
	if err != nil {
		since = 0
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

	res, err := s.store.Pull(r.Context(), user.ID, since, limit)
	if err != nil {
		slog.Error("выдача изменений", "err", err, "user", user.ID)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось получить изменения.")
		return
	}
	writeJSON(w, http.StatusOK, res)
}

type pushResponse struct {
	Rev int64 `json:"rev"`
}

// handlePush принимает изменения клиента.
func (s *Server) handlePush(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())

	var changes store.Changes
	if err := decodeJSON(w, r, &changes, 8<<20); err != nil {
		if errors.Is(err, errTooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge, codeTooLarge,
				"Слишком большая посылка изменений.")
			return
		}
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать изменения.")
		return
	}

	rev, err := s.store.Push(r.Context(), user.ID, &changes)
	if errors.Is(err, store.ErrTooManyRecords) {
		writeError(w, http.StatusRequestEntityTooLarge, codeTooLarge, err.Error())
		return
	}
	if err != nil {
		slog.Error("приём изменений", "err", err, "user", user.ID)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось сохранить изменения.")
		return
	}
	writeJSON(w, http.StatusOK, pushResponse{Rev: rev})
}

type contentCheckRequest struct {
	SHAs []string `json:"shas"`
}

// handleContentCheck сообщает, какие тексты уже есть на сервере.
//
// Позволяет клиенту выгружать только недостающие книги: тексты весят мегабайты,
// и проверять их по одному отдельными запросами было бы расточительно.
func (s *Server) handleContentCheck(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())

	var req contentCheckRequest
	if err := decodeJSON(w, r, &req, 256<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	if len(req.SHAs) > 1000 {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Слишком много адресов в запросе.")
		return
	}

	present, err := s.store.HasContent(r.Context(), user.ID, req.SHAs)
	if err != nil {
		slog.Error("проверка текстов", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось проверить тексты.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"present": present})
}

// handlePutContent принимает текст книги.
//
// Тело — JSON-массив абзацев. Адрес в пути обязан совпасть с sha256 тела: это
// проверяет store.PutContent, иначе устройство могло бы записать один текст под
// адресом другого и подменить книгу на остальных устройствах.
func (s *Server) handlePutContent(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	sha := r.PathValue("sha")
	if len(sha) != 64 {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Некорректный адрес текста.")
		return
	}

	var paragraphs []string
	if err := decodeJSON(w, r, &paragraphs, s.cfg.MaxBookBytes); err != nil {
		if errors.Is(err, errTooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge, codeTooLarge,
				"Книга слишком велика для синхронизации.")
			return
		}
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать текст книги.")
		return
	}

	// Адрес пересчитывается внутри PutContent: клиент не должен иметь
	// возможности записать один текст под адресом другого.
	existed, err := s.store.PutContent(r.Context(), user.ID, sha, paragraphs)
	if err != nil {
		if strings.Contains(err.Error(), "не совпадает") {
			writeError(w, http.StatusBadRequest, codeBadRequest,
				"Адрес текста не совпадает с содержимым.")
			return
		}
		slog.Error("сохранение текста", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить текст.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"stored": true, "existed": existed})
}

// handleGetContent отдаёт текст книги.
func (s *Server) handleGetContent(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	sha := r.PathValue("sha")

	payload, err := s.store.GetContent(r.Context(), user.ID, sha)
	if errors.Is(err, store.ErrContentNotFound) {
		writeError(w, http.StatusNotFound, codeNotFound, "Текст книги не найден на сервере.")
		return
	}
	if err != nil {
		slog.Error("чтение текста", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось прочитать текст.")
		return
	}

	// Тело уже является корректным JSON-массивом строк — отдаём как есть, не
	// разбирая и не пересобирая: лишний цикл разбора на мегабайтах текста
	// заметно нагрузил бы одноядерный сервер.
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	w.Header().Set("ETag", `"`+sha+`"`)
	if match := r.Header.Get("If-None-Match"); match == `"`+sha+`"` {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(payload)
}

// handlePurgeContent удаляет тексты удалённых книг.
func (s *Server) handlePurgeContent(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())

	removed, err := s.store.PurgeOrphanContent(r.Context(), user.ID)
	if err != nil {
		slog.Error("очистка текстов", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось очистить тексты.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]int64{"removed": removed})
}
