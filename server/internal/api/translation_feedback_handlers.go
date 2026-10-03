package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/citavuk/server/internal/store"
	"github.com/citavuk/server/internal/translate"
	"github.com/google/uuid"
)

// Жалобы на перевод слова и исправления, которые сервер отдаёт вместо DeepL и
// Google. Как устроено — docs/agents/server.md, раздел про перевод.

type translationFeedbackRequest struct {
	Source     string `json:"source"`
	Target     string `json:"target"`
	Sentence   string `json:"sentence"`
	Start      int    `json:"start"`
	End        int    `json:"end"`
	Shown      string `json:"shown"`
	Provider   string `json:"provider"`
	Suggestion string `json:"suggestion"`
	Comment    string `json:"comment"`
	Scope      string `json:"scope"`
}

func (s *Server) runFeedbackBot() {
	if s.feedbackBot == nil {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		<-s.stop
		cancel()
	}()
	s.feedbackBot.Run(ctx)
}

// validSpan — границы слова лежат внутри предложения и по краям символов.
func validSpan(sentence string, start, end int) bool {
	return start >= 0 && end <= len(sentence) && start < end &&
		utf8.ValidString(sentence) && utf8.RuneStart(sentence[start]) &&
		(end == len(sentence) || utf8.RuneStart(sentence[end]))
}

func (s *Server) handleCreateTranslationFeedback(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	var req translationFeedbackRequest
	if err := decodeJSON(w, r, &req, 32<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	source, target := langs(req.Source, req.Target)
	req.Suggestion = strings.TrimSpace(req.Suggestion)
	req.Comment = strings.TrimSpace(req.Comment)
	switch {
	case req.Scope != store.FeedbackScopeSentence && req.Scope != store.FeedbackScopeForm:
		writeError(w, http.StatusBadRequest, codeBadRequest, "Непонятно, где исправлять перевод.")
		return
	case strings.TrimSpace(req.Sentence) == "" || len(req.Sentence) > 4000 || !validSpan(req.Sentence, req.Start, req.End):
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось найти слово в предложении.")
		return
	case utf8.RuneCountInString(req.Suggestion) > 200 || utf8.RuneCountInString(req.Comment) > 1000 || utf8.RuneCountInString(req.Shown) > 500:
		writeError(w, http.StatusBadRequest, codeBadRequest, "Слишком длинный текст.")
		return
	case req.Suggestion == "" && req.Comment == "":
		writeError(w, http.StatusBadRequest, codeBadRequest, "Напиши, как правильно, или что не так с переводом.")
		return
	}
	// Те же границы, что и при переводе: иначе ключ исправления для «zove se»
	// не совпал бы с ключом, по которому его потом ищут.
	start, end := withSeParticle(req.Sentence, req.Start, req.End, source)

	f, err := s.store.CreateTranslationFeedback(r.Context(), store.FeedbackInput{
		UserID: user.ID, Source: source, Target: target,
		Word: req.Sentence[start:end], Sentence: req.Sentence, Start: start, End: end,
		Shown: strings.TrimSpace(req.Shown), Provider: req.Provider,
		Suggestion: req.Suggestion, Comment: req.Comment, Scope: req.Scope,
	})
	if err != nil {
		slog.Error("жалоба на перевод", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось отправить.")
		return
	}

	// Редактор правит сразу, без модерации, — если знает, как правильно.
	applied := false
	if req.Suggestion != "" {
		editor := user.IsAdmin
		if !editor {
			editor, err = s.store.IsTranslationEditor(r.Context(), user.ID)
			if err != nil {
				slog.Warn("проверка редактора переводов", "err", err)
			}
		}
		if editor {
			if decided, err := s.store.DecideTranslationFeedback(r.Context(), f.ID, user.ID, true, req.Suggestion); err == nil {
				f, applied = decided, true
			} else {
				slog.Warn("исправление редактора", "err", err)
			}
		}
	}
	s.feedbackBot.Announce(f)
	writeJSON(w, http.StatusCreated, map[string]any{"applied": applied})
}

func (s *Server) handleAdminTranslationFeedback(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	if status != "" && status != "pending" && status != "accepted" && status != "rejected" {
		status = "pending"
	}
	list, err := s.store.ListTranslationFeedback(r.Context(), status, 200)
	if err != nil {
		slog.Error("список жалоб на перевод", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить жалобы.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"feedback": list})
}

func (s *Server) handleAdminDecideTranslationFeedback(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Жалоба не найдена.")
		return
	}
	var req struct {
		Accept      bool   `json:"accept"`
		Translation string `json:"translation"`
	}
	if err := decodeJSON(w, r, &req, 8<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	f, err := s.store.DecideTranslationFeedback(r.Context(), id, userFrom(r.Context()).ID, req.Accept, req.Translation)
	switch {
	case errors.Is(err, store.ErrFeedbackNotFound):
		writeError(w, http.StatusNotFound, codeNotFound, "Жалоба не найдена.")
		return
	case errors.Is(err, store.ErrFeedbackDecided):
		writeError(w, http.StatusConflict, codeConflict, "По этой жалобе уже приняли решение.")
		return
	case err != nil:
		writeError(w, http.StatusBadRequest, codeBadRequest, "Чтобы принять, впиши верный перевод.")
		return
	}
	s.feedbackBot.Refresh(f)
	writeJSON(w, http.StatusOK, f)
}

func (s *Server) handleAdminTranslationEditors(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListTranslationEditors(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить редакторов.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"editors": list})
}

func (s *Server) handleAdminAddTranslationEditor(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := decodeJSON(w, r, &req, 4<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	u, err := s.store.UserByEmail(r.Context(), strings.TrimSpace(req.Email))
	if err != nil || u == nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Аккаунт с такой почтой не найден.")
		return
	}
	if err := s.store.SetTranslationEditor(r.Context(), u.ID, userFrom(r.Context()).ID, true); err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось выдать право.")
		return
	}
	s.handleAdminTranslationEditors(w, r)
}

func (s *Server) handleAdminRemoveTranslationEditor(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Редактор не найден.")
		return
	}
	if err := s.store.SetTranslationEditor(r.Context(), id, uuid.Nil, false); err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось забрать право.")
		return
	}
	s.handleAdminTranslationEditors(w, r)
}

// verifiedTranslation — исправление, если оно есть. Ошибка базы перевод не
// ломает: читатель получит обычный ответ DeepL.
func (s *Server) verifiedTranslation(ctx context.Context, source, target, sentence string, start, end int) (*translate.Result, bool) {
	text, ok, err := s.store.TranslationOverride(ctx, source, target, sentence[start:end], sentence, start, end)
	if err != nil {
		slog.Warn("поиск исправления перевода", "err", err)
		return nil, false
	}
	if !ok {
		return nil, false
	}
	return &translate.Result{Text: text, Provider: translate.ProviderCitavuk, Aligned: true, Verified: true}, true
}
