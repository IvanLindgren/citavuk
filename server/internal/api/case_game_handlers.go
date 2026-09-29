package api

import (
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/citavuk/server/internal/store"
)

// caseGamePublicFrom — с этого момента игра «Уничтожь эти падежи» открыта
// всем. До него — две недели раннего доступа для друзей Читавука.
var caseGamePublicFrom = time.Date(2026, 10, 12, 0, 0, 0, 0, moscow)

var caseGameScope = regexp.MustCompile(`^[a-z0-9:_-]{1,40}$`)

// caseGameOpenFor — можно ли этому человеку играть сейчас.
func caseGameOpenFor(u *store.User, now time.Time) bool {
	return !now.Before(caseGamePublicFrom) || isSupporter(u)
}

type caseGameAccess struct {
	Open       bool      `json:"open"`
	PublicFrom time.Time `json:"publicFrom"`
	Supporter  bool      `json:"supporter"`
	SignedIn   bool      `json:"signedIn"`
}

func (s *Server) handleCaseGameAccess(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	writeJSON(w, http.StatusOK, caseGameAccess{
		Open:       caseGameOpenFor(u, time.Now()),
		PublicFrom: caseGamePublicFrom,
		Supporter:  isSupporter(u),
		SignedIn:   u != nil,
	})
}

// validateCaseGameResult отсекает невозможные итоги: результат виден в
// профиле, и подделанная цифра там не нужна.
func validateCaseGameResult(in *store.CaseGameResult) error {
	switch {
	case in.ID == uuid.Nil:
		return errors.New("нет идентификатора партии")
	case !caseGameScope.MatchString(in.Scope):
		return errors.New("неизвестный набор заданий")
	case in.LimitSeconds != 0 && in.LimitSeconds != 60 && in.LimitSeconds != 300 && in.LimitSeconds != 900:
		return errors.New("неизвестная длительность")
	case in.ElapsedSeconds < 1 || in.ElapsedSeconds > 86400:
		return errors.New("неверное время партии")
	case in.LimitSeconds > 0 && in.ElapsedSeconds > in.LimitSeconds+30:
		return errors.New("партия длиннее выбранного времени")
	case in.Words < 0 || in.Words > 5000 || in.Correct < 0 || in.Wrong < 0 || in.Correct+in.Wrong > in.Words:
		return errors.New("неверное число слов")
	case in.DiacriticSlips < 0 || in.DiacriticSlips > in.Words || in.Chars < 0 || in.Chars > 200000:
		return errors.New("неверная статистика набора")
	case in.CPM < 0 || in.CPM > 1500 || in.Accuracy < 0 || in.Accuracy > 100:
		return errors.New("неверная скорость или точность")
	case len(in.Weak) > 12:
		return errors.New("слишком много слабых мест")
	}
	for i := range in.Weak {
		in.Weak[i].Label = strings.TrimSpace(in.Weak[i].Label)
		if in.Weak[i].Label == "" || utf8.RuneCountInString(in.Weak[i].Label) > 60 ||
			in.Weak[i].Wrong < 0 || in.Weak[i].Total < in.Weak[i].Wrong || in.Weak[i].Total > 5000 {
			return errors.New("неверное слабое место")
		}
	}
	return nil
}

func (s *Server) handleSaveCaseGameResult(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	if !caseGameOpenFor(u, time.Now()) {
		writeError(w, http.StatusForbidden, codeSupporterOnly,
			"До 12 октября игра открыта только друзьям Читавука.")
		return
	}
	var in store.CaseGameResult
	if err := decodeJSON(w, r, &in, 16<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать результат.")
		return
	}
	if in.Weak == nil {
		in.Weak = []store.CaseGameWeak{}
	}
	if err := validateCaseGameResult(&in); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error())
		return
	}
	err := s.store.SaveCaseGameResult(r.Context(), u.ID, &in)
	if err != nil && !errors.Is(err, store.ErrDuplicateResult) {
		slog.Error("игра на падежи: сохранение", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить результат.")
		return
	}
	// Партия с хотя бы одним верным словом продлевает серию. Ключ события —
	// id партии: повторная отправка не зажжёт огонь дважды.
	var study any
	if in.Correct > 0 {
		view, studyErr := s.store.RecordStudy(r.Context(), u.ID, "cases-game:"+in.ID.String())
		if studyErr != nil {
			slog.Error("игра на падежи: серия", "err", studyErr)
		} else {
			study = view
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": in, "study": study})
}

func (s *Server) handleCaseGameResults(w http.ResponseWriter, r *http.Request) {
	results, err := s.store.CaseGameResults(r.Context(), userFrom(r.Context()).ID, 50)
	if err != nil {
		slog.Error("игра на падежи: история", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить результаты.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}
