package api

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/citavuk/server/internal/store"
)

const codeSupporterOnly = "supporter_only"

// Аудио грузится частями: nginx пропускает тела до 52 МБ, а подкаст бывает
// длиннее. Часть до 24 МБ, файл целиком — до 600 МБ.
const (
	libraryChunkLimit = 24 << 20
	libraryAudioLimit = 600 << 20
)

var libraryAudioTypes = map[string]string{
	"audio/mpeg":  ".mp3",
	"audio/mp4":   ".m4a",
	"audio/x-m4a": ".m4a",
	"audio/aac":   ".aac",
	"audio/ogg":   ".ogg",
	"audio/webm":  ".webm",
	"audio/wav":   ".wav",
	"audio/x-wav": ".wav",
	"audio/flac":  ".flac",
}

// isSupporter — друг Читавука (сумма поддержки от порога) или администратор.
func isSupporter(u *store.User) bool {
	return u != nil && (u.SupporterSince != nil || u.IsAdmin)
}

// requireSupporter пускает только друзей Читавука. Граница доступа — здесь, а
// не в интерфейсе: текст книги отдаётся только после этой проверки.
func (s *Server) requireSupporter(next http.HandlerFunc) http.HandlerFunc {
	return s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		if !isSupporter(userFrom(r.Context())) {
			writeError(w, http.StatusForbidden, codeSupporterOnly,
				"Закрытая библиотека открыта друзьям Читавука — тем, кто поддержал проект от 200 ₽.")
			return
		}
		next(w, r)
	})
}

func (s *Server) handleSupporterLibrary(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.LibraryItems(r.Context(), false)
	if err != nil {
		slog.Error("закрытая библиотека: список", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить библиотеку.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) libraryItemFromPath(w http.ResponseWriter, r *http.Request, allowDraft bool) (*store.LibraryItem, bool) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Такой записи нет.")
		return nil, false
	}
	item, err := s.store.LibraryItem(r.Context(), id)
	if errors.Is(err, store.ErrLibraryItemNotFound) || (err == nil && !item.Published && !allowDraft) {
		writeError(w, http.StatusNotFound, codeNotFound, "Такой записи нет.")
		return nil, false
	}
	if err != nil {
		slog.Error("закрытая библиотека: запись", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось открыть запись.")
		return nil, false
	}
	return item, true
}

func (s *Server) handleSupporterLibraryItem(w http.ResponseWriter, r *http.Request) {
	item, ok := s.libraryItemFromPath(w, r, userFrom(r.Context()).IsAdmin)
	if !ok {
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) libraryAudioPath(file string) string {
	return filepath.Join(s.cfg.SupporterMediaDir, filepath.Base(file))
}

// handleSupporterLibraryAudio отдаёт аудио с поддержкой Range: перемотка в
// плеере работает без скачивания файла целиком.
func (s *Server) handleSupporterLibraryAudio(w http.ResponseWriter, r *http.Request) {
	item, ok := s.libraryItemFromPath(w, r, userFrom(r.Context()).IsAdmin)
	if !ok {
		return
	}
	if item.AudioFile == "" {
		writeError(w, http.StatusNotFound, codeNotFound, "У этой записи нет аудио.")
		return
	}
	f, err := os.Open(s.libraryAudioPath(item.AudioFile))
	if err != nil {
		slog.Error("закрытая библиотека: аудиофайл", "err", err, "item", item.ID)
		writeError(w, http.StatusNotFound, codeNotFound, "Аудиофайл не найден.")
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось прочитать аудио.")
		return
	}
	w.Header().Set("Content-Type", item.AudioMime)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeContent(w, r, item.AudioFile, info.ModTime(), f)
}

func (s *Server) handleAdminSupporterLibrary(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.LibraryItems(r.Context(), true)
	if err != nil {
		slog.Error("закрытая библиотека: список админки", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить библиотеку.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) decodeLibraryInput(w http.ResponseWriter, r *http.Request) (store.LibraryItemInput, bool) {
	var in store.LibraryItemInput
	if err := decodeJSON(w, r, &in, 9<<20); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запись.")
		return in, false
	}
	if err := in.Normalize(); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error())
		return in, false
	}
	return in, true
}

func (s *Server) handleAdminCreateLibraryItem(w http.ResponseWriter, r *http.Request) {
	in, ok := s.decodeLibraryInput(w, r)
	if !ok {
		return
	}
	item, err := s.store.CreateLibraryItem(r.Context(), in)
	if err != nil {
		slog.Error("закрытая библиотека: создание", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить запись.")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) handleAdminUpdateLibraryItem(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Такой записи нет.")
		return
	}
	in, ok := s.decodeLibraryInput(w, r)
	if !ok {
		return
	}
	item, err := s.store.UpdateLibraryItem(r.Context(), id, in)
	if errors.Is(err, store.ErrLibraryItemNotFound) {
		writeError(w, http.StatusNotFound, codeNotFound, "Такой записи нет.")
		return
	}
	if err != nil {
		slog.Error("закрытая библиотека: правка", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить запись.")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) handleAdminDeleteLibraryItem(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Такой записи нет.")
		return
	}
	file, err := s.store.DeleteLibraryItem(r.Context(), id)
	if errors.Is(err, store.ErrLibraryItemNotFound) {
		writeError(w, http.StatusNotFound, codeNotFound, "Такой записи нет.")
		return
	}
	if err != nil {
		slog.Error("закрытая библиотека: удаление", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось удалить запись.")
		return
	}
	if file != "" {
		_ = os.Remove(s.libraryAudioPath(file))
	}
	_ = os.Remove(s.libraryAudioPath(id.String() + ".part"))
	w.WriteHeader(http.StatusNoContent)
}

// handleAdminLibraryAudioChunk принимает очередную часть аудио.
//
// offset обязан совпасть с уже принятым размером: так обрыв посередине
// продолжается с места обрыва, а не склеивает куски вразнобой. На последней
// части (final=1) файл получает постоянное имя и записывается в базу.
func (s *Server) handleAdminLibraryAudioChunk(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Такой записи нет.")
		return
	}
	mime := strings.TrimSpace(strings.Split(r.Header.Get("Content-Type"), ";")[0])
	ext, ok := libraryAudioTypes[mime]
	if !ok {
		writeError(w, http.StatusUnsupportedMediaType, codeBadRequest,
			"Подходят MP3, M4A, AAC, OGG, WEBM, WAV и FLAC.")
		return
	}
	offset, err := strconv.ParseInt(r.URL.Query().Get("offset"), 10, 64)
	if err != nil || offset < 0 {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неверное смещение части.")
		return
	}
	item, err := s.store.LibraryItem(r.Context(), id)
	if errors.Is(err, store.ErrLibraryItemNotFound) {
		writeError(w, http.StatusNotFound, codeNotFound, "Такой записи нет.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось найти запись.")
		return
	}
	if err := os.MkdirAll(s.cfg.SupporterMediaDir, 0o750); err != nil {
		slog.Error("закрытая библиотека: каталог аудио", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить аудио.")
		return
	}

	partPath := s.libraryAudioPath(id.String() + ".part")
	flags := os.O_WRONLY | os.O_CREATE | os.O_APPEND
	if offset == 0 {
		flags |= os.O_TRUNC
	} else if info, statErr := os.Stat(partPath); statErr != nil || info.Size() != offset {
		have := int64(0)
		if statErr == nil {
			have = info.Size()
		}
		writeJSON(w, http.StatusConflict, map[string]any{
			"code": codeConflict, "message": "Часть не совпала с уже принятым.", "received": have,
		})
		return
	}
	f, err := os.OpenFile(partPath, flags, 0o640)
	if err != nil {
		slog.Error("закрытая библиотека: запись части", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить аудио.")
		return
	}
	written, copyErr := io.Copy(f, http.MaxBytesReader(w, r.Body, libraryChunkLimit))
	closeErr := f.Close()
	if copyErr != nil || closeErr != nil {
		// Недописанную часть откатываем, чтобы повтор начался с прежнего смещения.
		_ = os.Truncate(partPath, offset)
		writeError(w, http.StatusBadRequest, codeBadRequest, "Часть не дошла целиком, повтори.")
		return
	}
	total := offset + written
	if total > libraryAudioLimit {
		_ = os.Remove(partPath)
		writeError(w, http.StatusRequestEntityTooLarge, codeTooLarge, "Аудио длиннее 600 МБ.")
		return
	}
	if r.URL.Query().Get("final") != "1" {
		writeJSON(w, http.StatusOK, map[string]any{"received": total})
		return
	}

	name := fmt.Sprintf("%s-%d%s", id, time.Now().Unix(), ext)
	if err := os.Rename(partPath, s.libraryAudioPath(name)); err != nil {
		slog.Error("закрытая библиотека: переименование аудио", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить аудио.")
		return
	}
	if err := s.store.SetLibraryAudio(r.Context(), id, name, mime, total); err != nil {
		_ = os.Remove(s.libraryAudioPath(name))
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить аудио.")
		return
	}
	if item.AudioFile != "" && item.AudioFile != name {
		_ = os.Remove(s.libraryAudioPath(item.AudioFile))
	}
	writeJSON(w, http.StatusOK, map[string]any{"received": total, "done": true})
}
