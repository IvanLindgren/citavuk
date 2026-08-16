package api

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/citavuk/server/internal/daily"
	"github.com/citavuk/server/internal/store"
)

// «На каждый день»: десять слов, текст с ними и упражнения.
//
// Порядок такой: сначала окно спрашивает про темы и уровень (если ещё не
// спрашивало), потом каждый день собирает набор. Слова отдаются сразу, а текст
// догоняет отдельным запросом — модель думает секунды, а слова человек хочет
// видеть сейчас.

// maxDailyThemes — сколько тем можно выбрать. Больше двадцати — это «всё
// подряд», для которого есть пустой список.
const maxDailyThemes = 20

type dailySettingsRequest struct {
	Themes  []string `json:"themes"`
	Enabled *bool    `json:"enabled"`
	Level   string   `json:"level"`
}

// handleDailySettings отдаёт выбор человека и список тем на его уровне.
func (s *Server) handleDailySettings(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	settings, chosen, err := s.store.DailySettingsOf(r.Context(), user.ID)
	if err != nil {
		slog.Error("настройки окна дня", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось прочитать настройки.")
		return
	}

	level, err := s.store.GetSerbianLevel(r.Context(), user.ID)
	if err != nil {
		slog.Error("уровень для окна дня", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось прочитать уровень.")
		return
	}

	themes, err := s.store.DailyThemes(r.Context(), level.Level)
	if err != nil {
		slog.Error("темы окна дня", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось прочитать темы.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"themes":  settings.Themes,
		"enabled": settings.Enabled,
		"level":   level.Level,
		// configured — окно уже настроено. Пустой список тем при этом значит
		// «всё подряд», а не «человек ничего не выбрал»: различить их иначе
		// нельзя, и окно спрашивало бы про темы каждый день.
		"configured": chosen,
		"available":  themes,
	})
}

// handleSaveDailySettings сохраняет темы, уровень и сам выключатель окна.
func (s *Server) handleSaveDailySettings(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	var request dailySettingsRequest
	if err := decodeJSON(w, r, &request, 4<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}

	themes := make([]string, 0, len(request.Themes))
	seen := map[string]bool{}
	for _, theme := range request.Themes {
		theme = strings.TrimSpace(theme)
		if theme == "" || seen[theme] || len(themes) >= maxDailyThemes {
			continue
		}
		seen[theme] = true
		themes = append(themes, theme)
	}

	enabled := true
	if request.Enabled != nil {
		enabled = *request.Enabled
	}

	if err := s.store.SaveDailySettings(r.Context(), user.ID, store.DailySettings{
		Themes:  themes,
		Enabled: enabled,
	}); err != nil {
		slog.Error("сохранение настроек окна дня", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось сохранить настройки.")
		return
	}

	// Уровень живёт на аккаунте, а не в окне: по нему меряется и сложность
	// книги, и подбор слов. Окно только помогает его назвать.
	if level := store.NormalizeSerbianLevel(request.Level); level != "" {
		if _, err := s.store.SetSerbianLevel(r.Context(), user.ID, level, ""); err != nil {
			slog.Error("уровень из окна дня", "err", err)
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"themes": themes, "enabled": enabled})
}

// handleDailySet отдаёт набор на сегодня, собирая его при первом заходе.
func (s *Server) handleDailySet(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	now := time.Now()

	set, err := s.store.TodayDailySet(r.Context(), user.ID, now)
	if err != nil {
		slog.Error("набор дня", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось открыть набор дня.")
		return
	}

	settings, configured, err := s.store.DailySettingsOf(r.Context(), user.ID)
	if err != nil {
		slog.Error("настройки при наборе дня", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось открыть набор дня.")
		return
	}

	level, err := s.store.GetSerbianLevel(r.Context(), user.ID)
	if err != nil {
		slog.Error("уровень при наборе дня", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось открыть набор дня.")
		return
	}

	// Пока уровень не назван, набор не собирается: слова уровня C1 новичку
	// покажутся набором букв, а спросить уровень окно умеет само.
	if set == nil && level.Known() {
		words, err := s.store.PickDailyWords(
			r.Context(), user.ID, level.Level, settings.Themes, store.DailyWordCount)
		if err != nil {
			slog.Error("подбор слов дня", "err", err)
			writeError(w, http.StatusInternalServerError, codeInternal,
				"Не удалось подобрать слова.")
			return
		}
		if len(words) > 0 {
			set, err = s.store.SaveDailySet(r.Context(), user.ID, now, level.Level, words)
			if err != nil {
				slog.Error("сохранение набора дня", "err", err)
				writeError(w, http.StatusInternalServerError, codeInternal,
					"Не удалось собрать набор.")
				return
			}
		}
	}

	progress, err := s.store.DailyProgressOf(r.Context(), user.ID, now)
	if err != nil {
		// Сводка — приятное дополнение, а не условие показа слов.
		slog.Error("сводка дня", "err", err)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"set":         set,
		"level":       level.Level,
		"themes":      settings.Themes,
		"enabled":     settings.Enabled,
		"configured":  configured,
		"progress":    progress,
		"lessonReady": set != nil && set.Lesson != nil,
		"canCompose":  s.daily.Enabled(),
	})
}

// handleDailyLesson просит Gemma написать текст с сегодняшними словами.
func (s *Server) handleDailyLesson(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	now := time.Now()

	set, err := s.store.TodayDailySet(r.Context(), user.ID, now)
	if err != nil || set == nil {
		if err != nil {
			slog.Error("набор дня для текста", "err", err)
		}
		writeError(w, http.StatusNotFound, codeNotFound, "Набор дня ещё не собран.")
		return
	}
	// Текст пишется один раз за день: второй запрос отдаёт готовый.
	if set.Lesson != nil {
		writeJSON(w, http.StatusOK, map[string]any{"lesson": set.Lesson})
		return
	}
	if !s.daily.Enabled() {
		writeError(w, http.StatusServiceUnavailable, codeUpstream,
			"Текст сегодня не составить.")
		return
	}

	words := make([]daily.Word, 0, len(set.Words))
	for _, word := range set.Words {
		words = append(words, daily.Word{
			Lemma:       word.Lemma,
			Translation: word.Translation,
			Theme:       word.Theme,
		})
	}

	ctx, cancel := context.WithTimeout(r.Context(), 70*time.Second)
	defer cancel()

	lesson, err := s.daily.Compose(ctx, set.Level, words)
	if err != nil {
		slog.Error("текст дня", "err", err)
		writeError(w, http.StatusBadGateway, codeUpstream,
			"Текст не получился. Слова остаются на месте — попробуй позже.")
		return
	}

	saved := store.DailyLesson{Title: lesson.Title, Text: lesson.Text}
	for _, item := range lesson.Exercises {
		saved.Exercises = append(saved.Exercises, store.DailyExercise{
			Kind:     item.Kind,
			Question: item.Question,
			Options:  item.Options,
			Answer:   item.Answer,
			Hint:     item.Hint,
		})
	}
	if err := s.store.SaveDailyLesson(r.Context(), set.ID, saved); err != nil {
		slog.Error("сохранение текста дня", "err", err)
	}

	writeJSON(w, http.StatusOK, map[string]any{"lesson": saved})
}

type dailyLearnRequest struct {
	Lemma string `json:"lemma"`
}

// handleDailyLearn отмечает слово выученным.
func (s *Server) handleDailyLearn(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	var request dailyLearnRequest
	if err := decodeJSON(w, r, &request, 1<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	lemma := strings.TrimSpace(request.Lemma)
	if lemma == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не указано слово.")
		return
	}

	set, err := s.store.TodayDailySet(r.Context(), user.ID, time.Now())
	if err != nil || set == nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Набор дня ещё не собран.")
		return
	}

	learned, err := s.store.MarkDailyLearned(r.Context(), set.ID, lemma)
	if err != nil {
		slog.Error("отметка выученного слова", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось отметить слово.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"learned": learned})
}

// handleDailyProgress — сводка для виджета: что повторено и что пора вспомнить.
func (s *Server) handleDailyProgress(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	now := time.Now()

	progress, err := s.store.DailyProgressOf(r.Context(), user.ID, now)
	if err != nil {
		slog.Error("сводка повторений", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось посчитать сводку.")
		return
	}

	set, err := s.store.TodayDailySet(r.Context(), user.ID, now)
	if err != nil {
		slog.Error("набор дня для сводки", "err", err)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"progress": progress,
		"set":      set,
	})
}
