package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/citavuk/server/internal/quiz"
	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
)

// maxQuizSourceBytes ограничивает материал: 1 МБ текста — это уже целый
// учебник, а модель всё равно читает только начало.
const maxQuizSourceBytes = 1 << 20

// excerptRunes — сколько символов материала показывается в списке.
const excerptRunes = 220

type generateQuizRequest struct {
	Text      string `json:"text"`
	Title     string `json:"title"`
	Questions int    `json:"questions"`
}

type quizResponse struct {
	Quiz  quizBody `json:"quiz"`
	Fresh bool     `json:"fresh"`
}

type quizBody struct {
	ID        uuid.UUID       `json:"id"`
	Title     string          `json:"title"`
	Subject   string          `json:"subject"`
	Excerpt   string          `json:"excerpt"`
	Questions json.RawMessage `json:"questions"`
	CreatedAt time.Time       `json:"createdAt"`
}

func toQuizBody(q *store.Quiz) quizBody {
	return quizBody{
		ID: q.ID, Title: q.Title, Subject: q.Subject,
		Excerpt: q.Excerpt, Questions: q.Questions, CreatedAt: q.CreatedAt,
	}
}

// handleGenerateQuiz создаёт тест по материалу или отдаёт готовый.
//
// Проверка кеша идёт до всякой работы с моделью: тот же конспект у соседа по
// группе не должен стоить ещё одного вызова. Поэтому же тест сразу общий.
func (s *Server) handleGenerateQuiz(w http.ResponseWriter, r *http.Request) {
	if !s.quiz.Enabled() {
		writeError(w, http.StatusServiceUnavailable, codeUpstream,
			"Тренажёр пока не настроен.")
		return
	}

	var req generateQuizRequest
	if err := decodeJSON(w, r, &req, maxQuizSourceBytes); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать материал.")
		return
	}
	if quiz.CountRunes(req.Text) < 400 {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Материала слишком мало: нужен хотя бы абзац-другой, примерно 400 знаков.")
		return
	}

	user := userFrom(r.Context())
	sha := quiz.SourceSHA(req.Text)

	if existing, err := s.store.FindQuizBySource(r.Context(), sha); err == nil {
		writeJSON(w, http.StatusOK, quizResponse{Quiz: toQuizBody(existing), Fresh: false})
		return
	} else if !errors.Is(err, store.ErrQuizNotFound) {
		writeError(w, http.StatusInternalServerError, codeInternal, "База недоступна.")
		return
	}

	result, err := s.quiz.Generate(r.Context(), req.Text, req.Questions)
	if err != nil {
		if isClientGone(r, err) {
			writeError(w, statusClientClosed, codeUpstream, "Запрос отменён.")
			return
		}
		switch {
		case errors.Is(err, quiz.ErrTooShort):
			writeError(w, http.StatusBadRequest, codeBadRequest,
				"Материала слишком мало для теста.")
		case errors.Is(err, quiz.ErrBadAnswer):
			writeError(w, http.StatusFailedDependency, codeUpstream,
				"Модель не смогла составить тест по этому материалу. Попробуйте другой фрагмент.")
		default:
			slog.Warn("генерация теста не удалась", "err", err)
			writeError(w, http.StatusFailedDependency, codeUpstream,
				"Модель сейчас не отвечает. Попробуйте позже.")
		}
		return
	}

	title := result.Title
	if custom := trimQuizTitle(req.Title); custom != "" {
		title = custom
	}
	questions, err := json.Marshal(result.Questions)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить тест.")
		return
	}

	saved, err := s.store.SaveQuiz(
		r.Context(), sha, title, result.Subject,
		quiz.Excerpt(req.Text, excerptRunes), questions, user.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить тест.")
		return
	}
	writeJSON(w, http.StatusCreated, quizResponse{Quiz: toQuizBody(saved), Fresh: true})
}

func trimQuizTitle(value string) string {
	runes := []rune(value)
	if len(runes) > 120 {
		runes = runes[:120]
	}
	return string(runes)
}

// handleGetQuiz отдаёт тест целиком.
func (s *Server) handleGetQuiz(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Некорректный адрес теста.")
		return
	}
	found, err := s.store.GetQuiz(r.Context(), id)
	if errors.Is(err, store.ErrQuizNotFound) {
		writeError(w, http.StatusNotFound, codeNotFound, "Такого теста нет.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "База недоступна.")
		return
	}
	writeJSON(w, http.StatusOK, quizResponse{Quiz: toQuizBody(found), Fresh: false})
}

// handleListQuizzes отдаёт общий список тестов.
func (s *Server) handleListQuizzes(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	list, err := s.store.ListQuizzes(r.Context(), user.ID, 60)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "База недоступна.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": list})
}

type attemptRequest struct {
	// Answers — выбранный вариант на каждый вопрос, -1 если пропущен.
	Answers []int `json:"answers"`
}

type attemptResponse struct {
	Correct int   `json:"correct"`
	Total   int   `json:"total"`
	Wrong   []int `json:"wrong"`
}

// handleSaveAttempt проверяет ответы и записывает попытку.
//
// Считает сервер, а не браузер: иначе статистика — это то, что клиент захотел о
// себе сообщить, и «какие тесты повторить» перестаёт что-либо значить.
func (s *Server) handleSaveAttempt(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Некорректный адрес теста.")
		return
	}
	var req attemptRequest
	if err := decodeJSON(w, r, &req, 64<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать ответы.")
		return
	}

	found, err := s.store.GetQuiz(r.Context(), id)
	if errors.Is(err, store.ErrQuizNotFound) {
		writeError(w, http.StatusNotFound, codeNotFound, "Такого теста нет.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "База недоступна.")
		return
	}

	var questions []quiz.Question
	if err := json.Unmarshal(found.Questions, &questions); err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Тест повреждён.")
		return
	}

	correct := 0
	wrong := make([]int, 0, len(questions))
	for i, question := range questions {
		given := -1
		if i < len(req.Answers) {
			given = req.Answers[i]
		}
		if given == question.Answer {
			correct++
		} else {
			wrong = append(wrong, i)
		}
	}

	user := userFrom(r.Context())
	if err := s.store.SaveAttempt(
		r.Context(), id, user.ID, correct, len(questions), wrong,
	); err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось записать попытку.")
		return
	}
	writeJSON(w, http.StatusOK, attemptResponse{
		Correct: correct, Total: len(questions), Wrong: wrong,
	})
}

// quizStats — сводка по тренажёру.
type quizStats struct {
	Solved   int                 `json:"solved"`
	Attempts int                 `json:"attempts"`
	Accuracy int                 `json:"accuracy"`
	DueNow   int                 `json:"dueNow"`
	Repeat   []repeatItem        `json:"repeat"`
	Recent   []store.QuizAttempt `json:"recent"`
}

type repeatItem struct {
	QuizID   uuid.UUID `json:"quizId"`
	Title    string    `json:"title"`
	Score    int       `json:"score"`
	Due      time.Time `json:"due"`
	Overdue  bool      `json:"overdue"`
	Attempts int       `json:"attempts"`
}

// repeatDelay — когда возвращаться к тесту.
//
// Шкала та же по смыслу, что у карточек: чем хуже результат, тем скорее нужен
// повтор. Отдельного алгоритма SM-2 здесь нет намеренно — у теста нет оценки
// «легко/трудно», есть только доля верных ответов.
func repeatDelay(score int) time.Duration {
	switch {
	case score < 60:
		return 24 * time.Hour
	case score < 80:
		return 3 * 24 * time.Hour
	case score < 100:
		return 7 * 24 * time.Hour
	default:
		return 21 * 24 * time.Hour
	}
}

// handleQuizStats собирает статистику и список на повторение.
func (s *Server) handleQuizStats(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	attempts, err := s.store.ListAttempts(r.Context(), user.ID, 200)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "База недоступна.")
		return
	}

	stats := quizStats{Attempts: len(attempts), Repeat: []repeatItem{}, Recent: []store.QuizAttempt{}}
	if len(attempts) == 0 {
		writeJSON(w, http.StatusOK, stats)
		return
	}

	// Попытки приходят от новых к старым, поэтому первая встреченная по тесту —
	// последняя по времени.
	type latest struct {
		attempt store.QuizAttempt
		count   int
	}
	byQuiz := make(map[uuid.UUID]*latest, len(attempts))
	order := make([]uuid.UUID, 0, len(attempts))
	totalCorrect, totalQuestions := 0, 0

	for _, attempt := range attempts {
		totalCorrect += attempt.Correct
		totalQuestions += attempt.Total
		if seen, ok := byQuiz[attempt.QuizID]; ok {
			seen.count++
			continue
		}
		byQuiz[attempt.QuizID] = &latest{attempt: attempt, count: 1}
		order = append(order, attempt.QuizID)
	}

	now := time.Now()
	for _, id := range order {
		entry := byQuiz[id]
		score := 0
		if entry.attempt.Total > 0 {
			score = entry.attempt.Correct * 100 / entry.attempt.Total
		}
		due := entry.attempt.CreatedAt.Add(repeatDelay(score))
		overdue := !due.After(now)
		if overdue {
			stats.DueNow++
		}
		stats.Repeat = append(stats.Repeat, repeatItem{
			QuizID: id, Title: entry.attempt.Title, Score: score,
			Due: due, Overdue: overdue, Attempts: entry.count,
		})
	}

	// Сначала просроченные, среди них — с худшим результатом.
	sortRepeat(stats.Repeat)

	stats.Solved = len(order)
	if totalQuestions > 0 {
		stats.Accuracy = totalCorrect * 100 / totalQuestions
	}
	if len(attempts) > 10 {
		stats.Recent = attempts[:10]
	} else {
		stats.Recent = attempts
	}
	writeJSON(w, http.StatusOK, stats)
}

func sortRepeat(items []repeatItem) {
	for i := 1; i < len(items); i++ {
		for j := i; j > 0 && lessRepeat(items[j], items[j-1]); j-- {
			items[j], items[j-1] = items[j-1], items[j]
		}
	}
}

func lessRepeat(a, b repeatItem) bool {
	if a.Overdue != b.Overdue {
		return a.Overdue
	}
	if a.Score != b.Score {
		return a.Score < b.Score
	}
	return a.Due.Before(b.Due)
}
