package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/citavuk/server/internal/personal"
	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
)

func personalError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, personal.ErrInvalid):
		writeError(w, 400, codeBadRequest, "Проверь анкету, поля урока и ответы.")
	case errors.Is(err, store.ErrPersonalMissing):
		writeError(w, 404, codeNotFound, "Урок не найден или ещё не составлен.")
	case errors.Is(err, store.ErrPersonalLocked):
		writeError(w, 403, codeForbidden, "Эта карточка откроется в свой день.")
	case errors.Is(err, store.ErrPersonalConflict), errors.Is(err, store.ErrStudyTimezone):
		writeError(w, 409, "conflict", err.Error())
	case errors.Is(err, store.ErrPersonalFeedback), errors.Is(err, store.ErrPersonalLimit):
		writeError(w, 422, "not_available", err.Error())
	default:
		slog.Error("персональные уроки", "err", err)
		writeError(w, 500, codeInternal, "Не удалось сохранить или загрузить урок. Попробуй ещё раз.")
	}
}
func personalPath(r *http.Request) (uuid.UUID, int, error) {
	id, err := uuid.Parse(r.PathValue("plan"))
	if err != nil {
		return id, 0, personal.ErrInvalid
	}
	day := 0
	if r.PathValue("day") != "" {
		day, err = strconv.Atoi(r.PathValue("day"))
		if err != nil || day < 1 || day > 30 {
			return id, 0, personal.ErrInvalid
		}
	}
	return id, day, nil
}
func (s *Server) handlePersonalLatest(w http.ResponseWriter, r *http.Request) {
	p, err := s.store.LatestPersonal(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		personalError(w, err)
		return
	}
	history, err := s.store.PersonalHistory(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		personalError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"available": s.personal.Enabled(), "questions": personal.Questions, "plan": p, "history": history})
}
func (s *Server) handlePersonalCreate(w http.ResponseWriter, r *http.Request) {
	if !s.personal.Enabled() {
		writeError(w, 503, "unavailable", "Составление уроков сейчас недоступно.")
		return
	}
	var p personal.Profile
	if decodeJSON(w, r, &p, 16<<10) != nil {
		personalError(w, personal.ErrInvalid)
		return
	}
	id, err := s.store.CreatePersonal(r.Context(), userFrom(r.Context()).ID, p)
	if err != nil {
		personalError(w, err)
		return
	}
	writeJSON(w, 202, map[string]any{"id": id})
}
func (s *Server) handlePersonalPlan(w http.ResponseWriter, r *http.Request) {
	id, _, err := personalPath(r)
	if err != nil {
		personalError(w, err)
		return
	}
	p, err := s.store.PersonalPlan(r.Context(), userFrom(r.Context()).ID, id)
	if err != nil {
		personalError(w, err)
		return
	}
	writeJSON(w, 200, p)
}
func (s *Server) handlePersonalLesson(w http.ResponseWriter, r *http.Request) {
	id, day, err := personalPath(r)
	if err != nil {
		personalError(w, err)
		return
	}
	l, err := s.store.PersonalLesson(r.Context(), userFrom(r.Context()).ID, id, day)
	if err != nil {
		personalError(w, err)
		return
	}
	writeJSON(w, 200, l)
}
func (s *Server) handlePersonalEdit(w http.ResponseWriter, r *http.Request) {
	id, day, err := personalPath(r)
	if err != nil {
		personalError(w, err)
		return
	}
	var in struct {
		Revision int             `json:"revision"`
		Content  personal.Lesson `json:"content"`
	}
	if decodeJSON(w, r, &in, 128<<10) != nil {
		personalError(w, personal.ErrInvalid)
		return
	}
	if err = s.store.EditPersonal(r.Context(), userFrom(r.Context()).ID, id, day, in.Revision, in.Content); err != nil {
		personalError(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"saved": true})
}
func (s *Server) handlePersonalComplete(w http.ResponseWriter, r *http.Request) {
	id, day, err := personalPath(r)
	if err != nil {
		personalError(w, err)
		return
	}
	var in struct {
		Revision int      `json:"revision"`
		Answers  []string `json:"answers"`
	}
	if decodeJSON(w, r, &in, 32<<10) != nil {
		personalError(w, personal.ErrInvalid)
		return
	}
	result, err := s.store.CompletePersonal(r.Context(), userFrom(r.Context()).ID, id, day, in.Revision, in.Answers)
	if err != nil {
		personalError(w, err)
		return
	}
	writeJSON(w, 200, result)
}
func (s *Server) handlePersonalRate(w http.ResponseWriter, r *http.Request) {
	id, day, err := personalPath(r)
	if err != nil {
		personalError(w, err)
		return
	}
	var in struct {
		Rating int `json:"rating"`
	}
	if decodeJSON(w, r, &in, 1024) != nil {
		personalError(w, personal.ErrInvalid)
		return
	}
	if err = s.store.RatePersonal(r.Context(), userFrom(r.Context()).ID, id, day, in.Rating); err != nil {
		personalError(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"saved": true})
}
func (s *Server) handlePersonalRegenerate(w http.ResponseWriter, r *http.Request) {
	id, _, err := personalPath(r)
	if err != nil {
		personalError(w, err)
		return
	}
	if !s.personal.Enabled() {
		writeError(w, 503, "unavailable", "Составление уроков сейчас недоступно.")
		return
	}
	var in struct {
		Feedback string `json:"feedback"`
	}
	if decodeJSON(w, r, &in, 8<<10) != nil {
		personalError(w, personal.ErrInvalid)
		return
	}
	if err = s.store.RegeneratePersonal(r.Context(), userFrom(r.Context()).ID, id, in.Feedback); err != nil {
		personalError(w, err)
		return
	}
	writeJSON(w, 202, map[string]bool{"saved": true})
}
func (s *Server) handlePersonalRetry(w http.ResponseWriter, r *http.Request) {
	id, _, err := personalPath(r)
	if err != nil {
		personalError(w, err)
		return
	}
	if !s.personal.Enabled() {
		writeError(w, 503, "unavailable", "Составление уроков сейчас недоступно.")
		return
	}
	if err = s.store.RetryPersonal(r.Context(), userFrom(r.Context()).ID, id); err != nil {
		personalError(w, err)
		return
	}
	writeJSON(w, 202, map[string]bool{"saved": true})
}
func (s *Server) handleStudy(w http.ResponseWriter, r *http.Request) {
	zone := ""
	if r.Method == http.MethodPut {
		var in struct {
			Timezone string `json:"timezone"`
		}
		if decodeJSON(w, r, &in, 1024) != nil {
			personalError(w, personal.ErrInvalid)
			return
		}
		zone = in.Timezone
		if zone == "" {
			personalError(w, personal.ErrInvalid)
			return
		}
	}
	view, err := s.store.GetStudy(r.Context(), userFrom(r.Context()).ID, zone)
	if err != nil {
		personalError(w, err)
		return
	}
	writeJSON(w, 200, view)
}

func (s *Server) runPersonalJobs() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		select {
		case <-s.stop:
			cancel()
		case <-ctx.Done():
		}
	}()
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		if !s.personal.Enabled() || s.store == nil || s.store.Pool == nil {
			continue
		}
		job, err := s.store.ClaimPersonal(ctx)
		if err != nil {
			slog.Error("очередь персональных уроков", "err", err)
			continue
		}
		if job == nil {
			continue
		}
		err = s.generatePersonal(ctx, job)
		if ctx.Err() != nil {
			return
		}
		if err != nil && !errors.Is(err, store.ErrPersonalLease) {
			slog.Warn("генерация персональных уроков прервана", "plan", job.ID, "err", err)
		}
		if finishErr := s.store.FinishPersonalJob(ctx, job, err != nil); finishErr != nil && !errors.Is(finishErr, store.ErrPersonalLease) {
			slog.Error("сохранение статуса колоды", "err", finishErr)
		}
	}
}
func (s *Server) generatePersonal(ctx context.Context, job *store.PersonalJob) error {
	ctx, cancel := context.WithCancelCause(ctx)
	done := make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				renewCtx, stop := context.WithTimeout(ctx, 10*time.Second)
				err := s.store.RenewPersonalLease(renewCtx, job)
				stop()
				if err != nil {
					cancel(err)
					return
				}
			}
		}
	}()
	defer func() { cancel(nil); <-done }()
	err := s.generatePersonalContent(ctx, job)
	if cause := context.Cause(ctx); cause != nil {
		return cause
	}
	return err
}

func (s *Server) generatePersonalContent(ctx context.Context, job *store.PersonalJob) error {
	if job.Attempts > 3 {
		return personal.ErrInvalid
	}
	if err := job.Profile.Validate(); err != nil {
		return err
	}
	if len(job.Outline) == 0 {
		outline, err := s.personal.Outline(ctx, job.Profile)
		if err != nil {
			return err
		}
		if err = s.store.SavePersonalOutline(ctx, job, outline); err != nil {
			return err
		}
	}
	days, err := s.store.PersonalJobDays(ctx, job)
	if err != nil {
		return err
	}
	return personal.GenerateDays(ctx, days, func(ctx context.Context, day int) error {
		started := time.Now()
		lesson, err := s.personal.Lesson(ctx, job.Profile, job.Outline, day, job.Feedback)
		if err != nil {
			return err
		}
		if err := s.store.SavePersonalGenerated(ctx, job, day, lesson); err != nil {
			return err
		}
		slog.Info("карта урока сохранена", "plan", job.ID, "day", day, "model", personal.Model, "seconds", int(time.Since(started).Seconds()))
		return nil
	})
}
