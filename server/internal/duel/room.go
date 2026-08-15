// Package duel — матч «Ты против переводчика» на несколько человек: комната,
// её состояния и подбор соперников.
//
// Пакет намеренно не знает ни о базе, ни о HTTP. Матч живёт по времени: раунд
// кончается по часам, неподтверждённый игрок вылетает по часам, голосование
// закрывается по часам. Проверить такое можно только подставленными часами, и
// ради этого всё состояние комнаты — обычная структура, а каждое действие —
// функция от неё и момента времени.
package duel

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/citavuk/server/internal/translate"
	"github.com/citavuk/server/internal/translationgame"
)

type Phase string

const (
	PhaseLobby     Phase = "lobby"
	PhaseTranslate Phase = "translate"
	PhaseJudging   Phase = "judging"
	PhaseVote      Phase = "vote"
	PhaseResult    Phase = "result"
	PhaseFinished  Phase = "finished"
)

const (
	MinSeats = 2
	MaxSeats = 6
	Rounds   = 3

	// Столько же секунд на фразу, сколько в одиночной игре, но время общее на
	// раунд: с одиночными часами быстрый игрок всё равно ждёт медленного, а так
	// он вправе потратить сэкономленное на трудную фразу.
	SentenceSeconds = 40

	RoundLimit  = 5 * SentenceSeconds * time.Second
	VoteLimit   = 90 * time.Second
	ResultLimit = 45 * time.Second

	// Сколько комната ждёт подтверждения от людей, сведённых подбором.
	GatherLimit = 60 * time.Second

	// Через столько молчания игрок считается ушедшим. Закрытая вкладка не
	// должна держать остальных до конца раунда.
	AwayAfter = 75 * time.Second

	// В лобби срок длиннее: хозяин уходит в мессенджер отправить ссылку, а
	// фоновой вкладке браузер сам режет таймеры до одного раза в минуту.
	LobbyAwayAfter = 4 * time.Minute

	// С такой точностью запоминается присутствие. Опрос идёт раз в пару
	// секунд, и писать каждый из них в базу незачем: до AwayAfter далеко, а
	// комнату переписывают все игроки разом — лишняя запись рождает только
	// столкновение версий.
	SeenStep = 10 * time.Second

	// Столько ждём ответа судьи, прежде чем разрешить сходить к нему заново.
	JudgeLimit = 100 * time.Second

	// Столько ждём переводчиков, прежде чем позвать их заново. Меньше срока
	// судьи: раунд идёт, и место машины за столом пустует всё это время.
	MachineLimit = 45 * time.Second

	MaxAnswer = 600
	MaxName   = 24
)

var (
	ErrPhase      = errors.New("сейчас так нельзя")
	ErrFull       = errors.New("в комнате нет свободных мест")
	ErrNotHost    = errors.New("это может только хозяин комнаты")
	ErrNotPlayer  = errors.New("вы не в этой комнате")
	ErrFewPlayers = errors.New("для матча нужны хотя бы двое")
	ErrSeats      = errors.New("в комнате от двух до шести мест")
	ErrLevel      = errors.New("неизвестный уровень")
	ErrDirection  = errors.New("неизвестное направление")
	ErrSentence   = errors.New("такой фразы в раунде нет")
	ErrVoteSelf   = errors.New("за свой перевод голосовать нельзя")
	ErrVoteTarget = errors.New("такого перевода в раунде нет")
	ErrName       = errors.New("имя не подходит")
	ErrMachine    = errors.New("такого переводчика нет")
)

type Sentence = translationgame.Sentence

// Player — участник комнаты. Машина тоже участник: «пригласить DeepL» не
// отдельный режим, а обычное место за столом, только ответы на нём появляются
// сразу и целиком.
type Player struct {
	ID     string `json:"id"`
	UserID string `json:"userId,omitempty"`
	Name   string `json:"name"`
	// Пусто у человека, иначе deepl или google.
	Machine string `json:"machine,omitempty"`
	Host    bool   `json:"host"`
	// Подтвердил участие. У приглашённых подбором сначала false: они ещё
	// не открыли комнату.
	Joined bool      `json:"joined"`
	Ready  bool      `json:"ready"`
	Left   bool      `json:"left"`
	Seen   time.Time `json:"seen"`
	Score  int       `json:"score"`

	Answers map[string]string `json:"answers,omitempty"`
	// Голоса раунда: фраза → игрок, чей перевод назван лучшим.
	Votes map[string]string `json:"votes,omitempty"`
}

// Verdict — итог одной фразы. Победителей может быть несколько: голоса делятся
// поровну чаще, чем кажется, а объявлять ничью проигрышем всех — обидно и
// неверно.
type Verdict struct {
	SentenceID string             `json:"sentenceId"`
	Winners    []string           `json:"winners"`
	Scores     map[string]float64 `json:"scores,omitempty"`
	Feedback   string             `json:"feedback,omitempty"`
}

type Room struct {
	Code      string `json:"code"`
	Level     string `json:"level"`
	Direction string `json:"direction"`
	Seats     int    `json:"seats"`
	// Комнату показывает подбор. У созданной по ссылке — false.
	Open bool `json:"open"`
	// Комнату собрал подбор. Такая начинает матч сама: незнакомые люди не
	// станут ждать, пока один из них догадается нажать «начать».
	Matched bool `json:"matched"`

	Phase Phase `json:"phase"`
	Round int   `json:"round"`

	Players   []Player   `json:"players"`
	Sentences []Sentence `json:"sentences,omitempty"`
	Verdicts  []Verdict  `json:"verdicts,omitempty"`
	Summary   string     `json:"summary,omitempty"`

	// Конец текущей фазы. Ноль означает «ждём человека, а не часы».
	Deadline time.Time `json:"deadline,omitzero"`
	// Когда запрос ушёл к судье. Защита от шести одинаковых запросов подряд.
	Judging time.Time `json:"judging,omitzero"`
	// Когда запрос ушёл к переводчикам. Защита та же, что у судьи: комнату
	// опрашивают все игроки разом, а квота DeepL общая на весь сайт.
	Translating time.Time `json:"translating,omitzero"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// CleanName приводит имя к показываемому виду.
func CleanName(name string) (string, error) {
	name = strings.Join(strings.Fields(name), " ")
	if name == "" || utf8.RuneCountInString(name) > MaxName {
		return "", ErrName
	}
	return name, nil
}

// NewRoom создаёт комнату с хозяином внутри.
func NewRoom(code, level, direction string, seats int, host Player, now time.Time) (*Room, error) {
	if seats < MinSeats || seats > MaxSeats {
		return nil, ErrSeats
	}
	level = strings.ToUpper(strings.TrimSpace(level))
	if !translationgame.KnownLevel(level) {
		return nil, ErrLevel
	}
	direction, ok := translationgame.NormalizeDirection(direction)
	if !ok {
		return nil, ErrDirection
	}
	name, err := CleanName(host.Name)
	if err != nil {
		return nil, err
	}
	host.Name = name
	host.Host = true
	host.Joined = true
	host.Seen = now
	return &Room{
		Code: code, Level: level, Direction: direction, Seats: seats,
		Phase: PhaseLobby, Players: []Player{host},
		CreatedAt: now, UpdatedAt: now,
	}, nil
}

func (r *Room) at(id string) *Player {
	for i := range r.Players {
		if r.Players[i].ID == id {
			return &r.Players[i]
		}
	}
	return nil
}

// Find возвращает участника комнаты по идентификатору.
func (r *Room) Find(id string) *Player {
	return r.at(id)
}

// ByUser ищет участника по аккаунту: вернувшийся после перезагрузки страницы
// должен попасть на своё место, а не занять второе.
func (r *Room) ByUser(userID string) *Player {
	if userID == "" {
		return nil
	}
	for i := range r.Players {
		if r.Players[i].UserID == userID {
			return &r.Players[i]
		}
	}
	return nil
}

func (r *Room) active() []*Player {
	out := make([]*Player, 0, len(r.Players))
	for i := range r.Players {
		if !r.Players[i].Left {
			out = append(out, &r.Players[i])
		}
	}
	return out
}

// Humans — люди, которые сейчас в комнате.
func (r *Room) Humans() int {
	count := 0
	for _, player := range r.active() {
		if player.Machine == "" {
			count++
		}
	}
	return count
}

// Taken — сколько мест занято.
func (r *Room) Taken() int {
	return len(r.active())
}

// Join сажает человека за стол. Повторный вход тем же участником — это
// подтверждение приглашения, а не второе место.
func (r *Room) Join(p Player, now time.Time) error {
	if seat := r.at(p.ID); seat != nil {
		seat.Joined = true
		seat.Left = false
		seat.Seen = now
		r.UpdatedAt = now
		return nil
	}
	// Идентификатор участника у вошедшего выводится из аккаунта, поэтому сюда
	// попадают только совсем странные случаи. Место возвращается, но
	// идентификатор не переписывается: на него ссылаются уже отданные голоса.
	if seat := r.ByUser(p.UserID); seat != nil {
		seat.Joined = true
		seat.Left = false
		seat.Seen = now
		r.UpdatedAt = now
		return nil
	}
	if r.Phase != PhaseLobby {
		return ErrPhase
	}
	if r.Taken() >= r.Seats {
		return ErrFull
	}
	name, err := CleanName(p.Name)
	if err != nil {
		return err
	}
	p.Name = name
	p.Joined = true
	p.Seen = now
	p.Host = false
	r.Players = append(r.Players, p)
	r.UpdatedAt = now
	return nil
}

// AddMachine сажает за стол переводчик.
func (r *Room) AddMachine(id, provider string, now time.Time) error {
	if r.Phase != PhaseLobby {
		return ErrPhase
	}
	if provider != translate.ProviderDeepL && provider != translate.ProviderGoogle {
		return ErrMachine
	}
	if r.Taken() >= r.Seats {
		return ErrFull
	}
	for _, player := range r.active() {
		if player.Machine == provider {
			return ErrFull
		}
	}
	r.Players = append(r.Players, Player{
		ID: id, Name: MachineName(provider), Machine: provider,
		Joined: true, Seen: now,
	})
	r.UpdatedAt = now
	return nil
}

// MachineName — как переводчик подписан за столом.
func MachineName(provider string) string {
	if provider == translate.ProviderGoogle {
		return "Google Translate"
	}
	return "DeepL"
}

// Leave убирает участника. Место освобождается, ответы остаются: раунд,
// который человек успел сыграть, судится вместе со всеми.
func (r *Room) Leave(id string, now time.Time) {
	seat := r.at(id)
	if seat == nil {
		return
	}
	seat.Left = true
	seat.Ready = true
	if seat.Host {
		seat.Host = false
		r.passHost()
	}
	r.UpdatedAt = now
}

// passHost отдаёт комнату первому оставшемуся человеку.
func (r *Room) passHost() {
	for _, player := range r.active() {
		if player.Machine == "" {
			player.Host = true
			return
		}
	}
}

// Touch отмечает, что участник на связи — но не чаще, чем раз в SeenStep:
// иначе каждый опрос переписывал бы комнату целиком.
func (r *Room) Touch(id string, now time.Time) {
	seat := r.at(id)
	if seat == nil || seat.Left || now.Sub(seat.Seen) < SeenStep {
		return
	}
	seat.Seen = now
	r.UpdatedAt = now
}

// Gather ставит срок, к которому сведённые подбором люди должны подтвердить
// участие.
func (r *Room) Gather(now time.Time) {
	r.Matched = true
	r.Deadline = now.Add(GatherLimit)
	r.UpdatedAt = now
}

// Ready сообщает, что участник сдал раунд.
func (r *Room) Ready(id string, now time.Time) error {
	if r.Phase != PhaseTranslate {
		return ErrPhase
	}
	seat := r.at(id)
	if seat == nil || seat.Left {
		return ErrNotPlayer
	}
	seat.Ready = true
	seat.Seen = now
	r.UpdatedAt = now
	r.Tick(now)
	return nil
}

// Answer сохраняет перевод одной фразы. Переписывать ответ можно до конца
// раунда: фразы идут по одной, но вернуться к предыдущей человек вправе.
func (r *Room) Answer(id, sentenceID, text string, now time.Time) error {
	if r.Phase != PhaseTranslate {
		return ErrPhase
	}
	seat := r.at(id)
	if seat == nil || seat.Left {
		return ErrNotPlayer
	}
	if !r.hasSentence(sentenceID) {
		return ErrSentence
	}
	text = strings.TrimSpace(text)
	if utf8.RuneCountInString(text) > MaxAnswer {
		text = string([]rune(text)[:MaxAnswer])
	}
	if seat.Answers == nil {
		seat.Answers = map[string]string{}
	}
	seat.Answers[sentenceID] = text
	seat.Seen = now
	r.UpdatedAt = now
	return nil
}

// AnswerMany сохраняет все переводы разом — так страница откладывает черновик,
// пока человек печатает.
//
// Фразы не из этого раунда молча пропускаются: черновик мог уйти в тот момент,
// когда раунд уже сменился, и ронять из-за этого сохранение нельзя — иначе
// пропадёт всё написанное.
func (r *Room) AnswerMany(id string, answers map[string]string, now time.Time) error {
	if r.Phase != PhaseTranslate {
		return ErrPhase
	}
	if r.at(id) == nil {
		return ErrNotPlayer
	}
	for sentenceID, text := range answers {
		if !r.hasSentence(sentenceID) {
			continue
		}
		if err := r.Answer(id, sentenceID, text, now); err != nil {
			return err
		}
	}
	return nil
}

// MachinesWaiting — есть ли за столом переводчик без перевода этого раунда.
func (r *Room) MachinesWaiting() []string {
	var out []string
	for _, player := range r.active() {
		if player.Machine != "" && len(player.Answers) == 0 {
			out = append(out, player.ID)
		}
	}
	return out
}

// ClaimMachines отдаёт право сходить к переводчикам одному запросу — так же,
// как ClaimJudge отдаёт право сходить к судье.
//
// Перевод для машин идёт не в запросе, а после него: DeepL отвечает секунды, а
// комната обязана открыться сразу, иначе часы раунда уже тикают, а фраз на
// экране ещё нет.
func (r *Room) ClaimMachines(now time.Time) bool {
	if r.Phase != PhaseTranslate || len(r.MachinesWaiting()) == 0 {
		return false
	}
	if !r.Translating.IsZero() && now.Sub(r.Translating) < MachineLimit {
		return false
	}
	r.Translating = now
	r.UpdatedAt = now
	return true
}

// MachineAnswers кладёт готовый перевод машины и закрывает её ход.
func (r *Room) MachineAnswers(id string, answers map[string]string, now time.Time) error {
	seat := r.at(id)
	if seat == nil || seat.Machine == "" {
		return ErrNotPlayer
	}
	seat.Answers = answers
	seat.Ready = true
	seat.Seen = now
	r.UpdatedAt = now
	return nil
}

func (r *Room) hasSentence(id string) bool {
	for _, sentence := range r.Sentences {
		if sentence.ID == id {
			return true
		}
	}
	return false
}

// Start начинает раунд: и первый из лобби, и следующий после разбора.
func (r *Room) Start(sentences []Sentence, now time.Time) error {
	switch r.Phase {
	case PhaseLobby:
		if r.Round != 0 {
			return ErrPhase
		}
	case PhaseResult:
		if r.Round >= Rounds {
			return ErrPhase
		}
	default:
		return ErrPhase
	}
	if len(sentences) == 0 {
		return ErrSentence
	}
	if r.Taken() < MinSeats || r.Humans() == 0 {
		return ErrFewPlayers
	}
	// Не подтвердившие приглашение места освобождаются: матч начинается с теми,
	// кто пришёл.
	r.drop(func(p *Player) bool { return !p.Joined })

	r.Round++
	r.Phase = PhaseTranslate
	r.Sentences = sentences
	r.Verdicts = nil
	r.Summary = ""
	r.Judging = time.Time{}
	r.Translating = time.Time{}
	r.Deadline = now.Add(RoundLimit)
	for i := range r.Players {
		r.Players[i].Ready = false
		r.Players[i].Answers = nil
		r.Players[i].Votes = nil
	}
	r.UpdatedAt = now
	return nil
}

// NeedsStart говорит, что комната ждёт только фраз.
//
// Так начинают раунд там, где ждать нажатия не от кого: комнату собрал подбор,
// либо разбор прошлого раунда дочитан по часам.
func (r *Room) NeedsStart(now time.Time) bool {
	switch r.Phase {
	case PhaseLobby:
		if !r.Matched || r.Round != 0 {
			return false
		}
		if r.Taken() < MinSeats || r.Humans() == 0 {
			return false
		}
		return r.everyoneJoined() || r.expired(now)
	case PhaseResult:
		return r.Round < Rounds && r.expired(now)
	}
	return false
}

func (r *Room) expired(now time.Time) bool {
	return !r.Deadline.IsZero() && !now.Before(r.Deadline)
}

func (r *Room) everyoneJoined() bool {
	for _, player := range r.active() {
		if !player.Joined {
			return false
		}
	}
	return r.Taken() == r.Seats
}

// Tick доводит комнату до текущего времени: срабатывают дедлайны, вылетают
// закрытые вкладки. Вызывается перед каждым действием и перед каждым показом —
// иначе комната двигалась бы только тогда, когда кто-то что-то нажал.
//
// UpdatedAt меняется, только если что-то и правда изменилось: по нему потом
// решают, надо ли переписывать комнату в базе. Опрос, который ничего не
// сдвинул, обязан остаться чтением.
func (r *Room) Tick(now time.Time) {
	changed := false
	switch r.Phase {
	case PhaseLobby:
		changed = r.dropAway(now, LobbyAwayAfter)
		if r.Matched && r.expired(now) {
			// Срок сбора не стирается: по нему видно, что ждать больше некого
			// и матч пора начинать с теми, кто пришёл.
			changed = r.drop(func(p *Player) bool { return !p.Joined }) || changed
		}
	case PhaseTranslate:
		changed = r.dropAway(now, AwayAfter)
		if r.everyoneReady() || r.expired(now) {
			r.Phase = PhaseJudging
			r.Deadline = time.Time{}
			for i := range r.Players {
				r.Players[i].Ready = true
			}
			changed = true
		}
	case PhaseVote:
		changed = r.dropAway(now, AwayAfter)
		if r.everyoneVoted() || r.expired(now) {
			r.apply(Tally(r), "Победителя выбрали сами игроки.", now)
			changed = true
		}
	case PhaseResult:
		if r.Round >= Rounds && r.expired(now) {
			r.Phase = PhaseFinished
			r.Deadline = time.Time{}
			changed = true
		}
	}
	// Пустая комната закрывается: держать её ради машин смысла нет.
	if r.Phase != PhaseFinished && r.Humans() == 0 {
		r.Phase = PhaseFinished
		r.Deadline = time.Time{}
		changed = true
	}
	if changed {
		r.UpdatedAt = now
	}
}

func (r *Room) drop(gone func(*Player) bool) bool {
	dropped := false
	for i := range r.Players {
		if !r.Players[i].Left && gone(&r.Players[i]) {
			r.Players[i].Left = true
			dropped = true
			if r.Players[i].Host {
				r.Players[i].Host = false
				r.passHost()
			}
		}
	}
	return dropped
}

func (r *Room) dropAway(now time.Time, after time.Duration) bool {
	return r.drop(func(p *Player) bool {
		return p.Machine == "" && !p.Seen.IsZero() && now.Sub(p.Seen) > after
	})
}

// everyoneReady смотрит только на людей: машина, которой не досталось перевода
// (провайдер не ответил), не должна держать раунд до конца часов.
func (r *Room) everyoneReady() bool {
	for _, player := range r.active() {
		if player.Machine == "" && !player.Ready {
			return false
		}
	}
	return true
}

// ClaimJudge отдаёт право сходить к судье одному запросу: комнату опрашивают
// все игроки разом, и без этого Gemma получила бы шесть одинаковых запросов на
// один раунд.
func (r *Room) ClaimJudge(now time.Time) bool {
	if r.Phase != PhaseJudging {
		return false
	}
	if !r.Judging.IsZero() && now.Sub(r.Judging) < JudgeLimit {
		return false
	}
	r.Judging = now
	r.UpdatedAt = now
	return true
}

// ApplyVerdicts закрывает раунд оценкой судьи.
func (r *Room) ApplyVerdicts(verdicts []Verdict, summary string, now time.Time) error {
	if r.Phase != PhaseJudging {
		return ErrPhase
	}
	r.apply(verdicts, summary, now)
	return nil
}

// StartVote переводит раунд на голосование игроков — судья не ответил.
func (r *Room) StartVote(now time.Time) error {
	if r.Phase != PhaseJudging {
		return ErrPhase
	}
	r.Phase = PhaseVote
	r.Judging = time.Time{}
	r.Deadline = now.Add(VoteLimit)
	r.UpdatedAt = now
	r.Tick(now)
	return nil
}

func (r *Room) apply(verdicts []Verdict, summary string, now time.Time) {
	for _, verdict := range verdicts {
		for _, id := range verdict.Winners {
			if seat := r.at(id); seat != nil {
				seat.Score++
			}
		}
	}
	r.Verdicts = verdicts
	r.Summary = summary
	r.Phase = PhaseResult
	r.Judging = time.Time{}
	r.Deadline = now.Add(ResultLimit)
	r.UpdatedAt = now
}

// Vote отдаёт голос за перевод, помеченный меткой alias.
func (r *Room) Vote(id, sentenceID, alias string, now time.Time) error {
	if r.Phase != PhaseVote {
		return ErrPhase
	}
	seat := r.at(id)
	if seat == nil || seat.Left {
		return ErrNotPlayer
	}
	if !r.hasSentence(sentenceID) {
		return ErrSentence
	}
	target, ok := r.pick(sentenceID, id, alias)
	if !ok {
		if hidden, exists := r.byAlias(sentenceID, alias); exists && hidden == id {
			return ErrVoteSelf
		}
		return ErrVoteTarget
	}
	if seat.Votes == nil {
		seat.Votes = map[string]string{}
	}
	seat.Votes[sentenceID] = target
	seat.Seen = now
	r.UpdatedAt = now
	r.Tick(now)
	return nil
}

func (r *Room) everyoneVoted() bool {
	for _, player := range r.active() {
		if player.Machine != "" {
			continue
		}
		for _, sentence := range r.Sentences {
			// Голосовать не за кого, если своё — единственное написанное.
			if len(r.ballot(sentence.ID, player.ID)) == 0 {
				continue
			}
			if _, ok := player.Votes[sentence.ID]; !ok {
				return false
			}
		}
	}
	return true
}

// Alias — метка перевода в слепом голосовании.
//
// Имена авторов на голосовании не показываются: иначе голосуют за друга или
// против машины, а не за перевод. Метка выводится из кода комнаты, фразы и
// игрока, поэтому обратный ход есть только у сервера.
func (r *Room) Alias(sentenceID, playerID string) string {
	sum := sha256.Sum256([]byte(r.Code + "\x00" + sentenceID + "\x00" + playerID))
	return hex.EncodeToString(sum[:4])
}

func (r *Room) byAlias(sentenceID, alias string) (string, bool) {
	for _, player := range r.Players {
		if r.Alias(sentenceID, player.ID) == alias {
			return player.ID, true
		}
	}
	return "", false
}

// pick находит игрока по метке в бюллетене этого голосующего.
func (r *Room) pick(sentenceID, voterID, alias string) (string, bool) {
	for _, option := range r.ballot(sentenceID, voterID) {
		if r.Alias(sentenceID, option.ID) == alias {
			return option.ID, true
		}
	}
	return "", false
}

// ballot — переводы фразы, за которые может голосовать этот игрок.
//
// Свой перевод из бюллетеня убирается — но только если есть из чего выбирать.
// За столом на двоих иначе остаётся ровно один вариант, каждый обязан отдать
// голос сопернику, и любой раунд кончается ничьей. Имена всё равно скрыты, а
// согласие двоих о том, чей перевод лучше, — уже решение.
func (r *Room) ballot(sentenceID, voterID string) []Player {
	out := make([]Player, 0, len(r.Players))
	answered := 0
	for _, player := range r.Players {
		if strings.TrimSpace(player.Answers[sentenceID]) != "" {
			answered++
		}
	}
	for _, player := range r.Players {
		if player.ID == voterID && answered > 2 {
			continue
		}
		if strings.TrimSpace(player.Answers[sentenceID]) == "" {
			continue
		}
		out = append(out, player)
	}
	sort.Slice(out, func(i, j int) bool {
		return r.Alias(sentenceID, out[i].ID) < r.Alias(sentenceID, out[j].ID)
	})
	return out
}

// Tally считает голоса. Ничья оставляет победителями всех, кто её разделил:
// голоса делятся поровну чаще, чем кажется.
func Tally(r *Room) []Verdict {
	verdicts := make([]Verdict, 0, len(r.Sentences))
	for _, sentence := range r.Sentences {
		votes := map[string]float64{}
		for _, player := range r.Players {
			if choice, ok := player.Votes[sentence.ID]; ok {
				votes[choice]++
			}
		}
		best := 0.0
		for _, count := range votes {
			if count > best {
				best = count
			}
		}
		winners := make([]string, 0, 2)
		if best > 0 {
			for _, player := range r.Players {
				if votes[player.ID] == best {
					winners = append(winners, player.ID)
				}
			}
		}
		verdicts = append(verdicts, Verdict{
			SentenceID: sentence.ID, Winners: winners, Scores: votes,
		})
	}
	return verdicts
}

// Standing — строка итоговой таблицы.
type Standing struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Score int    `json:"score"`
	// Место с учётом равных очков: у двоих с одинаковым счётом место одно.
	Place   int    `json:"place"`
	Machine string `json:"machine,omitempty"`
}

// Standings — кто где по очкам.
func (r *Room) Standings() []Standing {
	rows := make([]Standing, 0, len(r.Players))
	for _, player := range r.Players {
		rows = append(rows, Standing{
			ID: player.ID, Name: player.Name, Score: player.Score, Machine: player.Machine,
		})
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].Score > rows[j].Score })
	place := 0
	previous := -1
	for i := range rows {
		if rows[i].Score != previous {
			place = i + 1
			previous = rows[i].Score
		}
		rows[i].Place = place
	}
	return rows
}
