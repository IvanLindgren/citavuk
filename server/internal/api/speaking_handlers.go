package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/citavuk/server/internal/speaking"
	"github.com/citavuk/server/internal/store"
)

// speakingPublicFrom — с этого момента «Говори!» открыта всем. До него — две
// недели раннего доступа для друзей Читавука.
var speakingPublicFrom = time.Date(2026, 10, 13, 0, 0, 0, 0, moscow)

// speakingOpenFor — можно ли этому человеку играть сейчас.
func speakingOpenFor(u *store.User, now time.Time) bool {
	return !now.Before(speakingPublicFrom) || isSupporter(u)
}

const speakingClosedMessage = "До 13 октября «Говори!» открыта только друзьям Читавука."

// speechReviewer — разбор текста нейросетью; в тестах подменяется.
type speechReviewer interface {
	Enabled() bool
	Review(ctx context.Context, topic *speaking.Topic, text, source string) (*speaking.Review, error)
}

type speakingAccess struct {
	Open       bool      `json:"open"`
	PublicFrom time.Time `json:"publicFrom"`
	Supporter  bool      `json:"supporter"`
	SignedIn   bool      `json:"signedIn"`
	// ReviewEnabled — настроен ли разбор ошибок. Без него игра умеет только
	// выдавать тему, и клиент прячет разделы, в которых нечего делать.
	ReviewEnabled bool `json:"reviewEnabled"`
}

func (s *Server) handleSpeakingAccess(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	writeJSON(w, http.StatusOK, speakingAccess{
		Open:          speakingOpenFor(u, time.Now()),
		PublicFrom:    speakingPublicFrom,
		Supporter:     isSupporter(u),
		SignedIn:      u != nil,
		ReviewEnabled: s.speaking != nil && s.speaking.Enabled(),
	})
}

func (s *Server) handleSpeakingTopics(w http.ResponseWriter, r *http.Request) {
	if !speakingOpenFor(userFrom(r.Context()), time.Now()) {
		writeError(w, http.StatusForbidden, codeSupporterOnly, speakingClosedMessage)
		return
	}
	w.Header().Set("Cache-Control", "private, max-age=3600")
	writeJSON(w, http.StatusOK, s.speakingCatalog)
}

type speakingReviewRequest struct {
	SessionID string `json:"sessionId"`
	TopicID   string `json:"topicId"`
	Text      string `json:"text"`
	Source    string `json:"source"`
}

var speakingTopicID = regexp.MustCompile(`^[a-z]{2,20}-\d{2}$`)

type speakingReviewResponse struct {
	// Text — то, что действительно разбиралось (пробелы свёрнуты). Клиент
	// подсвечивает ошибки именно в этой строке.
	Text   string           `json:"text"`
	Review *speaking.Review `json:"review"`
	Study  any              `json:"study,omitempty"`
}

func (s *Server) handleSpeakingReview(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	if !speakingOpenFor(u, time.Now()) {
		writeError(w, http.StatusForbidden, codeSupporterOnly, speakingClosedMessage)
		return
	}
	if s.speaking == nil || !s.speaking.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "review_disabled",
			"Разбор ошибок сейчас недоступен. Попробуй позже.")
		return
	}
	var req speakingReviewRequest
	if err := decodeJSON(w, r, &req, 24<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать текст.")
		return
	}
	sessionID, err := uuid.Parse(req.SessionID)
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Нет идентификатора попытки.")
		return
	}
	if req.Source != speaking.SourceText && req.Source != speaking.SourceVoice {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неизвестный способ ответа.")
		return
	}
	topicID := strings.TrimSpace(req.TopicID)
	var topic *speaking.Topic
	ok := false
	if speakingTopicID.MatchString(topicID) {
		topic, ok = s.speakingCatalog.Topic(topicID)
	}
	if !ok {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Такой темы нет.")
		return
	}
	text, err := speaking.CleanText(req.Text)
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Текст слишком короткий или слишком длинный: нужно от пяти слов до четырёх тысяч знаков.")
		return
	}

	review, err := s.speaking.Review(r.Context(), topic, text, req.Source)
	if err != nil {
		switch {
		case errors.Is(err, speaking.ErrNotSerbian):
			writeError(w, http.StatusUnprocessableEntity, "not_serbian",
				"Похоже, текст не на сербском. Скажи или напиши ответ по-сербски.")
		default:
			slog.Warn("говори: разбор не удался", "err", err)
			writeError(w, http.StatusBadGateway, "review_failed",
				"Не получилось разобрать текст. Попробуй ещё раз — твой ответ сохранён на экране.")
		}
		return
	}

	// Разобранная попытка продлевает серию. Ключ события — id попытки:
	// повторная отправка не зажжёт огонь дважды.
	var study any
	view, studyErr := s.store.RecordStudy(r.Context(), u.ID, "speaking:"+sessionID.String())
	if studyErr != nil {
		slog.Error("говори: серия", "err", studyErr)
	} else {
		study = view
	}
	writeJSON(w, http.StatusOK, speakingReviewResponse{Text: text, Review: review, Study: study})
}
