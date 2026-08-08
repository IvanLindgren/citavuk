package api

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/citavuk/server/internal/translate"
	"github.com/citavuk/server/internal/translationgame"
)

type translationGameRoundRequest struct {
	Level      string `json:"level"`
	Round      int    `json:"round"`
	Translator string `json:"translator"`
}

type translationGameSentence struct {
	ID                    string `json:"id"`
	Text                  string `json:"text"`
	TranslatorTranslation string `json:"translatorTranslation"`
}

type translationGameRoundResponse struct {
	Level        string                    `json:"level"`
	Round        int                       `json:"round"`
	Translator   string                    `json:"translator"`
	Sentences    []translationGameSentence `json:"sentences"`
	JudgeEnabled bool                      `json:"judgeEnabled"`
}

func (s *Server) handleTranslationGameRound(w http.ResponseWriter, r *http.Request) {
	var req translationGameRoundRequest
	if err := decodeJSON(w, r, &req, 2<<10); err != nil {
		return
	}
	level := strings.ToUpper(strings.TrimSpace(req.Level))
	provider := strings.ToLower(strings.TrimSpace(req.Translator))
	if provider != translate.ProviderDeepL && provider != translate.ProviderGoogle {
		writeError(w, http.StatusBadRequest, "invalid_translator", "Выберите DeepL или Google Translate.")
		return
	}
	items, err := translationgame.Round(level, req.Round)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_round", "Выберите уровень A1–C2 и раунд от 1 до 3.")
		return
	}
	sources := make([]string, len(items))
	for i := range items {
		sources[i] = items[i].Text
	}
	translated, err := s.translator.Paragraphs(r.Context(), sources, "sr", "ru", provider)
	if err != nil {
		slog.Warn("translation game provider failed", "provider", provider, "err", err)
		writeTranslateError(w, err)
		return
	}
	response := translationGameRoundResponse{
		Level: level, Round: req.Round, Translator: provider,
		Sentences:    make([]translationGameSentence, len(items)),
		JudgeEnabled: s.translationGame.Enabled(),
	}
	for i := range items {
		response.Sentences[i] = translationGameSentence{
			ID: items[i].ID, Text: items[i].Text,
			TranslatorTranslation: translated[i],
		}
	}
	writeJSON(w, http.StatusOK, response)
}

type translationGameJudgeRequest struct {
	Entries []translationgame.Entry `json:"entries"`
}

func (s *Server) handleTranslationGameJudge(w http.ResponseWriter, r *http.Request) {
	if !s.translationGame.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "judge_disabled", "Оценка Gemma 4 сейчас недоступна. Можно оценить раунд самостоятельно.")
		return
	}
	var req translationGameJudgeRequest
	if err := decodeJSON(w, r, &req, 24<<10); err != nil {
		return
	}
	result, err := s.translationGame.Evaluate(r.Context(), req.Entries)
	if err != nil {
		slog.Warn("translation game judge failed", "err", err)
		switch {
		case errors.Is(err, translationgame.ErrInvalidEntries):
			writeError(w, http.StatusBadRequest, "invalid_entries", "Заполните все пять переводов перед оценкой.")
		case errors.Is(err, translationgame.ErrBadAnswer):
			writeError(w, http.StatusBadGateway, "judge_bad_answer", "Gemma 4 не смогла оценить этот раунд. Попробуйте ещё раз или оцените сами.")
		default:
			writeError(w, http.StatusBadGateway, "judge_failed", "Gemma 4 сейчас не ответила. Попробуйте ещё раз или оцените сами.")
		}
		return
	}
	writeJSON(w, http.StatusOK, result)
}
