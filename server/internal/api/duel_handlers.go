package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/citavuk/server/internal/duel"
	"github.com/citavuk/server/internal/store"
	"github.com/citavuk/server/internal/translationgame"
)

// Матч на несколько человек.
//
// Живого канала у Читавука нет ни одного, и заводить его ради игры не стоит:
// вебсокет пришлось бы пускать через nginx общей машины. Комната опрашивается
// обычным GET раз в пару секунд, а всё, что должно случиться само (кончился
// раунд, никто не пришёл, пора судить), случается в момент опроса — Tick
// доводит комнату до текущего времени.

// Столько раз повторяется действие, если комнату успел изменить другой игрок.
const duelRetries = 4

type duelActor struct {
	ID     string
	UserID string
	Name   string
	// Непусто, если гостю только что выдали подпись: клиент обязан её сохранить.
	Token string
}

func (a duelActor) player() duel.Player {
	return duel.Player{ID: a.ID, UserID: a.UserID, Name: a.Name}
}

// duelWho узнаёт участника: вошедшего — по аккаунту, гостя — по подписи.
// Новых подписей не выдаёт: неизвестный гость участником не является.
func (s *Server) duelWho(r *http.Request) duelActor {
	if user := userFrom(r.Context()); user != nil {
		return duelActor{ID: user.ID.String(), UserID: user.ID.String(), Name: accountName(user)}
	}
	id, err := s.parseDuelToken(r.Header.Get("X-Duel-Player"))
	if err != nil {
		return duelActor{}
	}
	return duelActor{ID: id}
}

// duelEnter — то же, но гостю, пришедшему впервые, выдаётся подпись.
func (s *Server) duelEnter(r *http.Request, name string) (duelActor, error) {
	actor := s.duelWho(r)
	if actor.UserID != "" {
		return actor, nil
	}
	clean, err := duel.CleanName(name)
	if err != nil {
		return duelActor{}, err
	}
	actor.Name = clean
	if actor.ID == "" {
		actor.Token = s.issueDuelToken()
		id, err := s.parseDuelToken(actor.Token)
		if err != nil {
			return duelActor{}, err
		}
		actor.ID = id
	}
	return actor, nil
}

// accountName — как вошедший подписан за столом. Своё имя он менять не может:
// иначе в комнате появится второй «Аня» и голосование станет гаданием.
func accountName(user *store.User) string {
	if name := strings.TrimSpace(user.DisplayName); name != "" {
		return name
	}
	if at := strings.Index(user.Email, "@"); at > 0 {
		return user.Email[:at]
	}
	return "Игрок"
}

type duelRoomResponse struct {
	Room  duel.RoomView `json:"room"`
	Token string        `json:"token,omitempty"`
}

func (s *Server) writeDuelRoom(w http.ResponseWriter, room *duel.Room, actor duelActor, now time.Time) {
	view := room.View(actor.ID, now)
	if room.Find(actor.ID) == nil {
		// Посторонний видит комнату ровно настолько, чтобы решить, входить ли:
		// ни фраз, ни чужих переводов ему не полагается.
		view.Sentences, view.Ballot, view.Reveal, view.Answers, view.Votes = nil, nil, nil, nil, nil
	}
	writeJSON(w, http.StatusOK, duelRoomResponse{Room: view, Token: actor.Token})
}

func writeDuelError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrDuelNotFound):
		writeError(w, http.StatusNotFound, codeNotFound, "Такой комнаты нет. Проверьте код или попросите ссылку заново.")
	case errors.Is(err, duel.ErrFull):
		writeError(w, http.StatusConflict, codeConflict, "В комнате нет свободных мест.")
	case errors.Is(err, duel.ErrPhase):
		writeError(w, http.StatusConflict, codeConflict, "Матч уже идёт.")
	case errors.Is(err, duel.ErrNotPlayer):
		writeError(w, http.StatusForbidden, codeForbidden, "Вы не за этим столом.")
	case errors.Is(err, duel.ErrNotHost):
		writeError(w, http.StatusForbidden, codeForbidden, "Начать матч может только хозяин комнаты.")
	case errors.Is(err, duel.ErrFewPlayers):
		writeError(w, http.StatusConflict, codeConflict, "Для матча нужны хотя бы двое: позовите друга или посадите за стол переводчик.")
	case errors.Is(err, duel.ErrName):
		writeError(w, http.StatusBadRequest, codeBadRequest, "Имя нужно от одного до двадцати четырёх знаков.")
	case errors.Is(err, duel.ErrSeats):
		writeError(w, http.StatusBadRequest, codeBadRequest, "В комнате от двух до шести мест.")
	case errors.Is(err, duel.ErrLevel), errors.Is(err, duel.ErrDirection):
		writeError(w, http.StatusBadRequest, codeBadRequest, "Выберите уровень A1–C2 и направление перевода.")
	case errors.Is(err, duel.ErrMachine):
		writeError(w, http.StatusBadRequest, codeBadRequest, "За стол можно посадить DeepL или Google Translate.")
	case errors.Is(err, duel.ErrVoteSelf):
		writeError(w, http.StatusBadRequest, codeBadRequest, "За свой перевод голосовать нельзя.")
	case errors.Is(err, duel.ErrVoteTarget), errors.Is(err, duel.ErrSentence):
		writeError(w, http.StatusBadRequest, codeBadRequest, "Этот перевод уже не в игре — обновите страницу.")
	default:
		slog.Error("матч переводчиков", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Матч не отвечает. Попробуйте ещё раз.")
	}
}

type duelCreateRequest struct {
	Level     string `json:"level"`
	Direction string `json:"direction"`
	Seats     int    `json:"seats"`
	Name      string `json:"name"`
	// Комнату видно в подборе: тогда в неё подсаживают незнакомых.
	Open bool `json:"open"`
}

func (s *Server) handleDuelCreate(w http.ResponseWriter, r *http.Request) {
	var req duelCreateRequest
	if err := decodeJSON(w, r, &req, 2<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	actor, err := s.duelEnter(r, req.Name)
	if err != nil {
		writeDuelError(w, err)
		return
	}
	now := time.Now().UTC()
	var room *duel.Room
	for attempt := range duelRetries {
		room, err = duel.NewRoom(duel.NewCode(), req.Level, req.Direction, req.Seats, actor.player(), now)
		if err != nil {
			writeDuelError(w, err)
			return
		}
		room.Open = req.Open
		err = s.store.CreateDuelRoom(r.Context(), room)
		if err == nil {
			break
		}
		if attempt == duelRetries-1 {
			writeDuelError(w, err)
			return
		}
	}
	s.writeDuelRoom(w, room, actor, now)
}

func (s *Server) handleDuelJoin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(w, r, &req, 1<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	actor, err := s.duelEnter(r, req.Name)
	if err != nil {
		writeDuelError(w, err)
		return
	}
	s.duelChange(w, r, actor, func(room *duel.Room, now time.Time) error {
		return room.Join(actor.player(), now)
	})
}

func (s *Server) handleDuelRoom(w http.ResponseWriter, r *http.Request) {
	s.duelChange(w, r, s.duelWho(r), nil)
}

func (s *Server) handleDuelLeave(w http.ResponseWriter, r *http.Request) {
	actor := s.duelWho(r)
	s.duelChange(w, r, actor, func(room *duel.Room, now time.Time) error {
		room.Leave(actor.ID, now)
		return nil
	})
}

func (s *Server) handleDuelMachine(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Provider string `json:"provider"`
	}
	if err := decodeJSON(w, r, &req, 1<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	actor := s.duelWho(r)
	s.duelChange(w, r, actor, func(room *duel.Room, now time.Time) error {
		if err := requireDuelHost(room, actor.ID); err != nil {
			return err
		}
		return room.AddMachine(duel.NewCode(), strings.ToLower(strings.TrimSpace(req.Provider)), now)
	})
}

func (s *Server) handleDuelStart(w http.ResponseWriter, r *http.Request) {
	actor := s.duelWho(r)
	s.duelChange(w, r, actor, func(room *duel.Room, now time.Time) error {
		if err := requireDuelHost(room, actor.ID); err != nil {
			return err
		}
		return startDuelRound(room, now)
	})
}

func (s *Server) handleDuelAnswer(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SentenceID string `json:"sentenceId"`
		Text       string `json:"text"`
	}
	if err := decodeJSON(w, r, &req, 4<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	actor := s.duelWho(r)
	s.duelChange(w, r, actor, func(room *duel.Room, now time.Time) error {
		return room.Answer(actor.ID, req.SentenceID, req.Text, now)
	})
}

// handleDuelAnswers — черновик всего раунда разом. Страница шлёт его сама, пока
// человек печатает: раньше переводы уходили только по кнопке «Сдать», и тот,
// кто не успел нажать до звонка, терял всё написанное.
func (s *Server) handleDuelAnswers(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Answers map[string]string `json:"answers"`
	}
	if err := decodeJSON(w, r, &req, 16<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	actor := s.duelWho(r)
	s.duelChange(w, r, actor, func(room *duel.Room, now time.Time) error {
		return room.AnswerMany(actor.ID, req.Answers, now)
	})
}

func (s *Server) handleDuelReady(w http.ResponseWriter, r *http.Request) {
	actor := s.duelWho(r)
	s.duelChange(w, r, actor, func(room *duel.Room, now time.Time) error {
		return room.Ready(actor.ID, now)
	})
}

func (s *Server) handleDuelVote(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SentenceID string `json:"sentenceId"`
		Alias      string `json:"alias"`
	}
	if err := decodeJSON(w, r, &req, 1<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	actor := s.duelWho(r)
	s.duelChange(w, r, actor, func(room *duel.Room, now time.Time) error {
		return room.Vote(actor.ID, req.SentenceID, req.Alias, now)
	})
}

func requireDuelHost(room *duel.Room, id string) error {
	seat := room.Find(id)
	if seat == nil {
		return duel.ErrNotPlayer
	}
	if !seat.Host {
		return duel.ErrNotHost
	}
	return nil
}

// duelChange — общий ход любого действия над комнатой: прочитать, довести до
// текущего времени, изменить, записать. Запись сверяется с версией: комнату
// опрашивают все игроки разом, и ответ одного не должен затирать ход другого.
//
// Опрос, который ничего не сдвинул, остаётся чтением: до шести человек
// спрашивают комнату каждые пару секунд, и запись на каждый такой запрос
// сталкивала бы их друг с другом на ровном месте.
func (s *Server) duelChange(
	w http.ResponseWriter, r *http.Request, actor duelActor,
	change func(room *duel.Room, now time.Time) error,
) {
	code, ok := duel.CleanCode(r.PathValue("code"))
	if !ok {
		writeError(w, http.StatusNotFound, codeNotFound, "Такой комнаты нет. Проверьте код.")
		return
	}
	for attempt := range duelRetries {
		room, version, err := s.store.DuelRoom(r.Context(), code)
		if err != nil {
			writeDuelError(w, err)
			return
		}
		now := time.Now().UTC()
		before := room.UpdatedAt
		room.Tick(now)
		room.Touch(actor.ID, now)
		if change != nil {
			if err := change(room, now); err != nil {
				writeDuelError(w, err)
				return
			}
		}
		jobs := s.advanceDuel(room, now)
		if room.UpdatedAt.Equal(before) {
			s.writeDuelRoom(w, room, actor, now)
			return
		}
		switch err := s.store.SaveDuelRoom(r.Context(), room, version); {
		case err == nil:
			// Работа в сеть начинается только после записи: до неё комната ещё
			// может достаться соседу, и поход к судье оказался бы напрасным.
			for _, job := range jobs {
				go job()
			}
			s.writeDuelRoom(w, room, actor, now)
			return
		case errors.Is(err, store.ErrDuelConflict):
			if attempt == duelRetries-1 {
				// Комнату всё время переписывают соседи: показываем то, что есть.
				fresh, _, err := s.store.DuelRoom(r.Context(), code)
				if err != nil {
					writeDuelError(w, err)
					return
				}
				s.writeDuelRoom(w, fresh, actor, now)
				return
			}
		default:
			writeDuelError(w, err)
			return
		}
	}
}

// advanceDuel делает то, чего никто не нажимает: начинает раунд собранной
// комнате, зовёт переводчиков за машинные места и отправляет закрытый раунд к
// судье.
//
// Возвращает работу, которую надо начать уже после записи комнаты: и судья, и
// переводчики ходят в сеть на секунды, а опрос комнаты обязан вернуться сразу.
func (s *Server) advanceDuel(room *duel.Room, now time.Time) []func() {
	if room.NeedsStart(now) {
		if err := startDuelRound(room, now); err != nil && !errors.Is(err, duel.ErrFewPlayers) {
			slog.Warn("раунд матча не начался", "code", room.Code, "err", err)
		}
	}
	var jobs []func()
	code := room.Code
	if room.ClaimMachines(now) {
		round, sentences := room.Round, room.Sentences
		jobs = append(jobs, func() { s.translateForMachines(code, round, sentences) })
	}
	if room.Phase == duel.PhaseJudging && room.ClaimJudge(now) {
		jobs = append(jobs, func() { s.judgeDuelRound(code) })
	}
	return jobs
}

// startDuelRound берёт фразы очередного раунда. Перевод для машин за столом
// сюда не входит: он идёт отдельно и после записи.
func startDuelRound(room *duel.Room, now time.Time) error {
	sentences, err := translationgame.Round(room.Level, room.Round+1, room.Direction)
	if err != nil {
		return err
	}
	return room.Start(sentences, now)
}

// translateForMachines добывает переводы машинам за столом и кладёт их в
// комнату. Работает в своей горутине: раунд уже идёт, и люди пишут.
func (s *Server) translateForMachines(code string, round int, sentences []duel.Sentence) {
	ctx, cancel := context.WithTimeout(context.Background(), duel.MachineLimit)
	defer cancel()

	room, _, err := s.store.DuelRoom(ctx, code)
	if err != nil || room.Round != round || room.Phase != duel.PhaseTranslate {
		return
	}
	sources := make([]string, len(sentences))
	for i := range sentences {
		sources[i] = sentences[i].Text
	}
	source, target := translationgame.Languages(room.Direction)

	ready := map[string]map[string]string{}
	for _, id := range room.MachinesWaiting() {
		seat := room.Find(id)
		if seat == nil {
			continue
		}
		translated, err := s.translator.Paragraphs(ctx, sources, source, target, seat.Machine)
		if err != nil {
			// Место за столом остаётся пустым: переводчик промолчал этот раунд,
			// а матч из-за него не отменяется.
			slog.Warn("переводчик не ответил в матче", "provider", seat.Machine, "err", err)
			continue
		}
		answers := make(map[string]string, len(sentences))
		for i := range sentences {
			answers[sentences[i].ID] = translated[i]
		}
		ready[id] = answers
	}
	if len(ready) == 0 {
		return
	}

	for attempt := range duelRetries {
		room, version, err := s.store.DuelRoom(ctx, code)
		if err != nil || room.Round != round || room.Phase != duel.PhaseTranslate {
			return
		}
		now := time.Now().UTC()
		for id, answers := range ready {
			if err := room.MachineAnswers(id, answers, now); err != nil {
				slog.Warn("перевод машины не лёг в комнату", "code", code, "err", err)
			}
		}
		switch err := s.store.SaveDuelRoom(ctx, room, version); {
		case err == nil:
			return
		case errors.Is(err, store.ErrDuelConflict):
			if attempt == duelRetries-1 {
				slog.Warn("перевод машины не записан: комнату всё время меняют", "code", code)
			}
		default:
			slog.Warn("перевод машины не записан", "code", code, "err", err)
			return
		}
	}
}

// judgeDuelRound спрашивает судью и закрывает раунд. Работает в своей горутине
// и со своим сроком: игрок, чей опрос выпал на этот момент, мог давно уйти со
// страницы, а раунд закрыть всё равно надо.
func (s *Server) judgeDuelRound(code string) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	room, _, err := s.store.DuelRoom(ctx, code)
	if err != nil {
		slog.Warn("не удалось прочитать комнату для разбора", "code", code, "err", err)
		return
	}
	ask := room.JudgeAsk()
	var result *translationgame.MatchResult
	if len(ask.Entries) > 0 && s.translationGame.Enabled() {
		result, err = s.translationGame.EvaluateMatch(ctx, ask.Entries, room.Direction)
		if err != nil {
			slog.Warn("судья матча не ответил", "code", code, "err", err)
			result = nil
		}
	}
	summary := ""
	if result != nil {
		summary = result.Summary
	}

	for attempt := range duelRetries {
		room, version, err := s.store.DuelRoom(ctx, code)
		if err != nil {
			slog.Warn("комната исчезла до разбора", "code", code, "err", err)
			return
		}
		if room.Phase != duel.PhaseJudging {
			return
		}
		now := time.Now().UTC()
		if result == nil && len(ask.Entries) > 0 {
			// Судья молчит — победителя выбирают сами игроки.
			err = room.StartVote(now)
		} else {
			err = room.ApplyVerdicts(ask.Verdicts(result), summary, now)
		}
		if err != nil {
			slog.Warn("разбор раунда не применился", "code", code, "err", err)
			return
		}
		switch err := s.store.SaveDuelRoom(ctx, room, version); {
		case err == nil:
			return
		case errors.Is(err, store.ErrDuelConflict):
			if attempt == duelRetries-1 {
				slog.Warn("разбор раунда не записан: комнату всё время меняют", "code", code)
			}
		default:
			slog.Warn("разбор раунда не записан", "code", code, "err", err)
			return
		}
	}
}
