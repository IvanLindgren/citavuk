package duel

import (
	"testing"
	"time"
)

var start = time.Date(2026, 8, 15, 12, 0, 0, 0, time.UTC)

func phrases() []Sentence {
	return []Sentence{
		{ID: "a2-01", Text: "Prva rečenica."},
		{ID: "a2-02", Text: "Druga rečenica."},
	}
}

// room собирает комнату с хозяином и указанным числом гостей.
func room(t *testing.T, seats int, guests ...string) *Room {
	t.Helper()
	r, err := NewRoom("ABCDEF", "A2", "sr-ru", seats, Player{ID: "host", Name: "Хозяин"}, start)
	if err != nil {
		t.Fatalf("комната не создалась: %v", err)
	}
	for _, id := range guests {
		if err := r.Join(Player{ID: id, Name: "Гость " + id}, start); err != nil {
			t.Fatalf("гость %s не вошёл: %v", id, err)
		}
	}
	return r
}

// playing доводит комнату до фазы перевода.
func playing(t *testing.T, seats int, guests ...string) *Room {
	t.Helper()
	r := room(t, seats, guests...)
	if err := r.Start(phrases(), start); err != nil {
		t.Fatalf("раунд не начался: %v", err)
	}
	return r
}

func TestNewRoomChecksSettings(t *testing.T) {
	cases := []struct {
		name      string
		seats     int
		level     string
		direction string
		player    string
	}{
		{"мест меньше двух", 1, "A2", "sr-ru", "Аня"},
		{"мест больше шести", 7, "A2", "sr-ru", "Аня"},
		{"неизвестный уровень", 2, "B7", "sr-ru", "Аня"},
		{"неизвестное направление", 2, "A2", "sr-en", "Аня"},
		{"пустое имя", 2, "A2", "sr-ru", "   "},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			_, err := NewRoom("ABCDEF", item.level, item.direction, item.seats,
				Player{ID: "host", Name: item.player}, start)
			if err == nil {
				t.Fatal("комната создалась с негодными настройками")
			}
		})
	}
}

func TestJoinFillsSeatsOnce(t *testing.T) {
	r := room(t, 2)
	if err := r.Join(Player{ID: "gost", Name: "Гость"}, start); err != nil {
		t.Fatalf("гость не вошёл: %v", err)
	}
	if err := r.Join(Player{ID: "tretiy", Name: "Третий"}, start); err != ErrFull {
		t.Fatalf("третий вошёл в комнату на двоих: %v", err)
	}

	// Перезагрузка страницы — это тот же участник, а не второе место.
	if err := r.Join(Player{ID: "gost", Name: "Гость"}, start.Add(time.Second)); err != nil {
		t.Fatalf("возврат не прошёл: %v", err)
	}
	if r.Taken() != 2 {
		t.Fatalf("мест занято %d, ожидалось 2", r.Taken())
	}
}

func TestJoinKeepsSeatOfSameAccount(t *testing.T) {
	r := room(t, 3)
	if err := r.Join(Player{ID: "first", UserID: "user-1", Name: "Аня"}, start); err != nil {
		t.Fatalf("вход: %v", err)
	}
	if err := r.Join(Player{ID: "second", UserID: "user-1", Name: "Аня"}, start.Add(time.Minute)); err != nil {
		t.Fatalf("повторный вход того же аккаунта: %v", err)
	}
	if r.Taken() != 2 {
		t.Fatalf("один аккаунт занял %d мест", r.Taken())
	}
	// Идентификатор не переписывается: на него ссылаются уже отданные голоса.
	if r.Find("first") == nil {
		t.Fatal("место потеряло идентификатор участника")
	}
}

func TestMachineTakesSeatOnceEach(t *testing.T) {
	r := room(t, 3)
	if err := r.AddMachine("m1", "deepl", start); err != nil {
		t.Fatalf("DeepL не сел за стол: %v", err)
	}
	if err := r.AddMachine("m2", "deepl", start); err != ErrFull {
		t.Fatalf("второй DeepL сел за стол: %v", err)
	}
	if err := r.AddMachine("m3", "yandex", start); err != ErrMachine {
		t.Fatalf("неизвестный переводчик принят: %v", err)
	}
	if err := r.AddMachine("m4", "google", start); err != nil {
		t.Fatalf("Google не сел за стол: %v", err)
	}
	if r.Taken() != 3 || r.Humans() != 1 {
		t.Fatalf("за столом %d участников и %d людей, ожидалось 3 и 1", r.Taken(), r.Humans())
	}
	if err := r.AddMachine("m5", "deepl", start); err != ErrFull {
		t.Fatalf("машина села в полную комнату: %v", err)
	}
}

func TestStartNeedsCompany(t *testing.T) {
	alone := room(t, 2)
	if err := alone.Start(phrases(), start); err != ErrFewPlayers {
		t.Fatalf("матч начался в одиночку: %v", err)
	}

	// Матч человека с машиной — это по-прежнему матч.
	if err := alone.AddMachine("m1", "deepl", start); err != nil {
		t.Fatalf("DeepL не сел: %v", err)
	}
	if err := alone.Start(phrases(), start); err != nil {
		t.Fatalf("матч с DeepL не начался: %v", err)
	}
	if alone.Phase != PhaseTranslate || alone.Round != 1 {
		t.Fatalf("после начала фаза %q, раунд %d", alone.Phase, alone.Round)
	}
	if !alone.Deadline.Equal(start.Add(RoundLimit)) {
		t.Fatalf("часы раунда стоят на %v", alone.Deadline)
	}
}

func TestJoinAfterStartRefused(t *testing.T) {
	r := playing(t, 3, "gost")
	if err := r.Join(Player{ID: "opozdal", Name: "Опоздавший"}, start); err != ErrPhase {
		t.Fatalf("в идущий матч вошёл посторонний: %v", err)
	}
	// А свой возвращается: связь рвётся чаще, чем кажется.
	if err := r.Join(Player{ID: "gost", Name: "Гость"}, start.Add(time.Second)); err != nil {
		t.Fatalf("свой не вернулся в комнату: %v", err)
	}
}

func TestAnswersStayPrivateUntilRoundEnds(t *testing.T) {
	r := playing(t, 2, "gost")
	if err := r.Answer("host", "a2-01", "Первое предложение.", start); err != nil {
		t.Fatalf("ответ хозяина: %v", err)
	}
	if err := r.Answer("gost", "a2-01", "Ответ гостя.", start); err != nil {
		t.Fatalf("ответ гостя: %v", err)
	}

	view := r.View("host", start)
	if view.Answers["a2-01"] != "Первое предложение." {
		t.Fatalf("свой перевод не виден: %+v", view.Answers)
	}
	if len(view.Reveal) != 0 || len(view.Ballot) != 0 {
		t.Fatal("во время раунда видны чужие переводы")
	}
	// Ни одно поле вида не должно содержать чужой текст.
	for _, answer := range view.Answers {
		if answer == "Ответ гостя." {
			t.Fatal("чужой перевод попал в ответ на опрос")
		}
	}
}

func TestViewDoesNotSeatGuestFromAnotherRoom(t *testing.T) {
	r := room(t, 3, "gost")
	view := r.View("token-iz-drugoy-komnaty", start)
	if view.You != "" {
		t.Fatalf("посторонний токен принят за участника: %q", view.You)
	}
	for _, player := range view.Players {
		if player.You {
			t.Fatalf("постороннему назначено чужое место: %+v", player)
		}
	}
}

func TestAnswerRefusesUnknownSentenceAndTrimsLongText(t *testing.T) {
	r := playing(t, 2, "gost")
	if err := r.Answer("host", "a2-99", "мимо", start); err != ErrSentence {
		t.Fatalf("принят перевод несуществующей фразы: %v", err)
	}
	long := make([]rune, MaxAnswer+40)
	for i := range long {
		long[i] = 'а'
	}
	if err := r.Answer("host", "a2-01", string(long), start); err != nil {
		t.Fatalf("длинный ответ: %v", err)
	}
	if got := len([]rune(r.Find("host").Answers["a2-01"])); got != MaxAnswer {
		t.Fatalf("ответ обрезан до %d знаков, ожидалось %d", got, MaxAnswer)
	}
	if err := r.Answer("chuzhoy", "a2-01", "мимо", start); err != ErrNotPlayer {
		t.Fatalf("посторонний ответил в чужой комнате: %v", err)
	}
}

func TestRoundEndsWhenEveryoneIsReady(t *testing.T) {
	r := playing(t, 2, "gost")
	if err := r.Ready("host", start.Add(time.Minute)); err != nil {
		t.Fatalf("готовность хозяина: %v", err)
	}
	if r.Phase != PhaseTranslate {
		t.Fatal("раунд кончился, хотя гость ещё пишет")
	}
	if err := r.Ready("gost", start.Add(90*time.Second)); err != nil {
		t.Fatalf("готовность гостя: %v", err)
	}
	if r.Phase != PhaseJudging {
		t.Fatalf("после готовности всех фаза %q", r.Phase)
	}
	if !r.Deadline.IsZero() {
		t.Fatal("на суде остались часы раунда")
	}
}

func TestRoundEndsByClock(t *testing.T) {
	r := playing(t, 2, "gost")
	r.Touch("host", start.Add(RoundLimit))
	r.Touch("gost", start.Add(RoundLimit))
	r.Tick(start.Add(RoundLimit))
	if r.Phase != PhaseJudging {
		t.Fatalf("часы вышли, а фаза %q", r.Phase)
	}
}

func TestClosedTabDoesNotHoldTheRound(t *testing.T) {
	r := playing(t, 3, "gost", "molchun")
	r.Ready("host", start.Add(10*time.Second))
	r.Ready("gost", start.Add(10*time.Second))
	// Третий закрыл вкладку сразу после начала.
	r.Touch("host", start.Add(2*time.Minute))
	r.Touch("gost", start.Add(2*time.Minute))
	r.Tick(start.Add(2 * time.Minute))

	if !r.Find("molchun").Left {
		t.Fatal("молчащий игрок остался в комнате")
	}
	if r.Phase != PhaseJudging {
		t.Fatalf("раунд ждёт ушедшего: фаза %q", r.Phase)
	}
}

func TestHostPassesWhenHostLeaves(t *testing.T) {
	r := room(t, 3, "gost")
	r.Leave("host", start.Add(time.Minute))
	if r.Find("host").Host {
		t.Fatal("ушедший остался хозяином")
	}
	if !r.Find("gost").Host {
		t.Fatal("комната осталась без хозяина")
	}
}

func TestEmptyRoomCloses(t *testing.T) {
	r := room(t, 2, "gost")
	r.AddMachine("m1", "deepl", start)
	r.Leave("host", start)
	r.Leave("gost", start)
	r.Tick(start)
	if r.Phase != PhaseFinished {
		t.Fatalf("комната без людей осталась в фазе %q", r.Phase)
	}
}

func TestJudgeIsAskedOnce(t *testing.T) {
	r := playing(t, 2, "gost")
	r.Ready("host", start)
	r.Ready("gost", start)

	if !r.ClaimJudge(start) {
		t.Fatal("первый запрос не получил права спросить судью")
	}
	if r.ClaimJudge(start.Add(time.Second)) {
		t.Fatal("второй запрос тоже пошёл к судье")
	}
	// Если судья завис, через своё время попытку можно повторить.
	if !r.ClaimJudge(start.Add(JudgeLimit + time.Second)) {
		t.Fatal("зависший запрос никто не переспросил")
	}
}

func TestVerdictsGiveScore(t *testing.T) {
	r := playing(t, 2, "gost")
	r.Ready("host", start)
	r.Ready("gost", start)
	verdicts := []Verdict{
		{SentenceID: "a2-01", Winners: []string{"gost"}, Feedback: "Точнее по смыслу."},
		{SentenceID: "a2-02", Winners: []string{"host", "gost"}},
	}
	if err := r.ApplyVerdicts(verdicts, "Итог раунда", start.Add(time.Minute)); err != nil {
		t.Fatalf("вердикты не применились: %v", err)
	}
	if r.Find("gost").Score != 2 || r.Find("host").Score != 1 {
		t.Fatalf("счёт %d : %d, ожидался 1 : 2", r.Find("host").Score, r.Find("gost").Score)
	}
	if r.Phase != PhaseResult {
		t.Fatalf("после вердиктов фаза %q", r.Phase)
	}
	if err := r.ApplyVerdicts(verdicts, "ещё раз", start.Add(time.Minute)); err != ErrPhase {
		t.Fatalf("вердикты применились дважды: %v", err)
	}
}

func TestVoteIsBlind(t *testing.T) {
	r := playing(t, 3, "gost", "tretiy")
	r.Answer("host", "a2-01", "Перевод хозяина", start)
	r.Answer("gost", "a2-01", "Перевод гостя", start)
	r.Answer("tretiy", "a2-01", "Перевод третьего", start)
	r.Ready("host", start)
	r.Ready("gost", start)
	r.Ready("tretiy", start)
	if err := r.StartVote(start); err != nil {
		t.Fatalf("голосование не началось: %v", err)
	}

	view := r.View("host", start)
	if len(view.Ballot) != len(r.Sentences) {
		t.Fatalf("на голосовании %d фраз из %d", len(view.Ballot), len(r.Sentences))
	}
	first := view.Ballot[0]
	if len(first.Options) != 2 {
		t.Fatalf("в бюллетене %d переводов, ожидалось 2 чужих", len(first.Options))
	}
	for _, option := range first.Options {
		if option.Text == "Перевод хозяина" {
			t.Fatal("свой перевод попал в бюллетень")
		}
		if option.Alias == "gost" || option.Alias == "tretiy" {
			t.Fatal("метка перевода выдаёт автора")
		}
	}
}

func TestVoteRules(t *testing.T) {
	r := playing(t, 3, "gost", "tretiy")
	for _, id := range []string{"host", "gost", "tretiy"} {
		r.Answer(id, "a2-01", "Перевод "+id, start)
		r.Ready(id, start)
	}
	r.StartVote(start)

	mine := r.Alias("a2-01", "host")
	if err := r.Vote("host", "a2-01", mine, start); err != ErrVoteSelf {
		t.Fatalf("голос за себя принят: %v", err)
	}
	if err := r.Vote("host", "a2-01", "0000dead", start); err != ErrVoteTarget {
		t.Fatalf("голос за несуществующий перевод принят: %v", err)
	}
	if err := r.Vote("chuzhoy", "a2-01", r.Alias("a2-01", "gost"), start); err != ErrNotPlayer {
		t.Fatalf("проголосовал посторонний: %v", err)
	}
}

func TestTwoPlayersChooseFromBothTranslations(t *testing.T) {
	// Вдвоём выбирать не из чего: убери свой перевод — и каждый обязан отдать
	// голос сопернику, а раунд всегда кончается ничьей.
	r := playing(t, 2, "gost")
	r.Answer("host", "a2-01", "Перевод хозяина", start)
	r.Answer("gost", "a2-01", "Перевод гостя", start)
	r.Ready("host", start)
	r.Ready("gost", start)
	r.StartVote(start)

	view := r.View("host", start)
	if len(view.Ballot[0].Options) != 2 {
		t.Fatalf("в бюллетене на двоих %d вариантов", len(view.Ballot[0].Options))
	}
	// Оба сошлись на переводе гостя — он и берёт фразу.
	if err := r.Vote("host", "a2-01", r.Alias("a2-01", "gost"), start); err != nil {
		t.Fatalf("голос хозяина: %v", err)
	}
	if err := r.Vote("gost", "a2-01", r.Alias("a2-01", "gost"), start); err != nil {
		t.Fatalf("голос гостя за свой перевод: %v", err)
	}
	r.Tick(start.Add(VoteLimit))
	if r.Find("gost").Score != 1 || r.Find("host").Score != 0 {
		t.Fatalf("счёт %d : %d, ожидался 0 : 1", r.Find("host").Score, r.Find("gost").Score)
	}
}

func TestVoteCountsAndClosesRound(t *testing.T) {
	r := playing(t, 3, "gost", "tretiy")
	for _, id := range []string{"host", "gost", "tretiy"} {
		r.Answer(id, "a2-01", "Перевод "+id, start)
		r.Answer(id, "a2-02", "Перевод "+id, start)
		r.Ready(id, start)
	}
	r.StartVote(start)

	// За перевод гостя двое, за перевод хозяина один.
	r.Vote("host", "a2-01", r.Alias("a2-01", "gost"), start)
	r.Vote("tretiy", "a2-01", r.Alias("a2-01", "gost"), start)
	r.Vote("gost", "a2-01", r.Alias("a2-01", "host"), start)
	if r.Phase != PhaseVote {
		t.Fatal("голосование кончилось на первой фразе")
	}

	// Вторую фразу все отдают третьему.
	r.Vote("host", "a2-02", r.Alias("a2-02", "tretiy"), start)
	r.Vote("gost", "a2-02", r.Alias("a2-02", "tretiy"), start)
	r.Vote("tretiy", "a2-02", r.Alias("a2-02", "host"), start)

	if r.Phase != PhaseResult {
		t.Fatalf("после всех голосов фаза %q", r.Phase)
	}
	if got := r.Find("gost").Score; got != 1 {
		t.Fatalf("гость набрал %d, ожидалось 1", got)
	}
	if got := r.Find("tretiy").Score; got != 1 {
		t.Fatalf("третий набрал %d, ожидалось 1", got)
	}
	if got := r.Find("host").Score; got != 0 {
		t.Fatalf("хозяин набрал %d, ожидалось 0", got)
	}
}

func TestVoteSplitLeavesEveryoneWinning(t *testing.T) {
	r := playing(t, 2, "gost")
	r.Answer("host", "a2-01", "Перевод хозяина", start)
	r.Answer("gost", "a2-01", "Перевод гостя", start)
	r.Ready("host", start)
	r.Ready("gost", start)
	r.StartVote(start)

	// Каждый отдал голос сопернику: поровну.
	r.Vote("host", "a2-01", r.Alias("a2-01", "gost"), start)
	r.Vote("gost", "a2-01", r.Alias("a2-01", "host"), start)
	r.Tick(start.Add(VoteLimit))

	verdict := r.Verdicts[0]
	if len(verdict.Winners) != 2 {
		t.Fatalf("при равных голосах победителей %d, ожидалось 2", len(verdict.Winners))
	}
	if r.Find("host").Score != 1 || r.Find("gost").Score != 1 {
		t.Fatal("ничья не засчитана обоим")
	}
}

func TestVoteClosesByClockWithWhatThereIs(t *testing.T) {
	r := playing(t, 2, "gost")
	r.Answer("host", "a2-01", "Перевод хозяина", start)
	r.Answer("gost", "a2-01", "Перевод гостя", start)
	r.Ready("host", start)
	r.Ready("gost", start)
	r.StartVote(start)
	r.Vote("host", "a2-01", r.Alias("a2-01", "gost"), start)

	r.Touch("host", start.Add(VoteLimit))
	r.Touch("gost", start.Add(VoteLimit))
	r.Tick(start.Add(VoteLimit))
	if r.Phase != PhaseResult {
		t.Fatalf("часы голосования вышли, а фаза %q", r.Phase)
	}
	if r.Find("gost").Score != 1 {
		t.Fatal("единственный голос не засчитан")
	}
	// Фраза, за которую никто не голосовал, остаётся без победителя.
	if len(r.Verdicts[1].Winners) != 0 {
		t.Fatalf("у фразы без голосов есть победитель: %+v", r.Verdicts[1])
	}
}

func TestMachineDoesNotVoteButCanWin(t *testing.T) {
	r := room(t, 2)
	r.AddMachine("deepl", "deepl", start)
	if err := r.Start(phrases(), start); err != nil {
		t.Fatalf("матч с машиной не начался: %v", err)
	}
	r.Answer("host", "a2-01", "Перевод хозяина", start)
	r.MachineAnswers("deepl", map[string]string{"a2-01": "Машинный перевод"}, start)
	r.Ready("host", start)
	r.StartVote(start)

	r.Vote("host", "a2-01", r.Alias("a2-01", "deepl"), start)
	// Голос человека единственный: машина не голосует и голосования не держит.
	if r.Phase != PhaseResult {
		t.Fatalf("голосование ждёт машину: фаза %q", r.Phase)
	}
	if r.Find("deepl").Score != 1 {
		t.Fatal("машина не получила очко за выигранную фразу")
	}
}

func TestMatchedRoomStartsItself(t *testing.T) {
	r := room(t, 2)
	r.Players = append(r.Players, Player{ID: "gost", Name: "Гость"})
	r.Gather(start)

	if r.NeedsStart(start) {
		t.Fatal("комната начала матч, не дождавшись приглашённого")
	}
	if err := r.Join(Player{ID: "gost", Name: "Гость"}, start.Add(time.Second)); err != nil {
		t.Fatalf("приглашённый не вошёл: %v", err)
	}
	if !r.NeedsStart(start.Add(time.Second)) {
		t.Fatal("собранная комната не начинает матч")
	}
}

func TestUnconfirmedSeatIsFreedByClock(t *testing.T) {
	r := room(t, 3)
	r.Players = append(r.Players,
		Player{ID: "gost", Name: "Гость"},
		Player{ID: "prizrak", Name: "Призрак"},
	)
	r.Gather(start)
	r.Join(Player{ID: "gost", Name: "Гость"}, start.Add(time.Second))

	late := start.Add(GatherLimit)
	r.Tick(late)
	if !r.Find("prizrak").Left {
		t.Fatal("не подтвердивший участие остался в комнате")
	}
	if !r.NeedsStart(late) {
		t.Fatal("оставшиеся вдвоём не начинают матч")
	}
}

func TestMatchedRoomDiesWithoutCompany(t *testing.T) {
	r := room(t, 2)
	r.Players = append(r.Players, Player{ID: "prizrak", Name: "Призрак"})
	r.Gather(start)
	r.Tick(start.Add(GatherLimit))

	if !r.Find("prizrak").Left {
		t.Fatal("призрак остался за столом")
	}
	if r.NeedsStart(start.Add(GatherLimit)) {
		t.Fatal("матч начался в одиночку")
	}
}

func TestMatchGoesThroughThreeRounds(t *testing.T) {
	r := playing(t, 2, "gost")
	now := start
	for round := 1; round <= Rounds; round++ {
		if r.Round != round {
			t.Fatalf("идёт раунд %d, ожидался %d", r.Round, round)
		}
		r.Ready("host", now)
		r.Ready("gost", now)
		if err := r.ApplyVerdicts([]Verdict{{SentenceID: "a2-01", Winners: []string{"host"}}}, "", now); err != nil {
			t.Fatalf("раунд %d: %v", round, err)
		}
		now = now.Add(ResultLimit)
		if round < Rounds {
			if !r.NeedsStart(now) {
				t.Fatalf("после раунда %d следующий не начинается", round)
			}
			if err := r.Start(phrases(), now); err != nil {
				t.Fatalf("раунд %d не начался: %v", round+1, err)
			}
			continue
		}
		r.Tick(now)
	}
	if r.Phase != PhaseFinished {
		t.Fatalf("после трёх раундов фаза %q", r.Phase)
	}
	if err := r.Start(phrases(), now); err != ErrPhase {
		t.Fatalf("начался четвёртый раунд: %v", err)
	}
	if r.Find("host").Score != Rounds {
		t.Fatalf("счёт хозяина %d, ожидалось %d", r.Find("host").Score, Rounds)
	}
}

func TestNewRoundForgetsOldAnswers(t *testing.T) {
	r := playing(t, 2, "gost")
	r.Answer("host", "a2-01", "Старый перевод", start)
	r.Ready("host", start)
	r.Ready("gost", start)
	r.ApplyVerdicts([]Verdict{{SentenceID: "a2-01", Winners: []string{"host"}}}, "", start)
	if err := r.Start(phrases(), start.Add(ResultLimit)); err != nil {
		t.Fatalf("второй раунд: %v", err)
	}
	host := r.Find("host")
	if len(host.Answers) != 0 || host.Ready {
		t.Fatalf("в новый раунд переехали ответы: %+v", host.Answers)
	}
	if host.Score != 1 {
		t.Fatal("счёт матча обнулился вместе с раундом")
	}
	if len(r.Verdicts) != 0 || r.Summary != "" {
		t.Fatal("разбор прошлого раунда остался на экране")
	}
}

func TestRevealShowsEveryoneAfterRound(t *testing.T) {
	r := playing(t, 2, "gost")
	r.Answer("host", "a2-01", "Перевод хозяина", start)
	r.Answer("gost", "a2-01", "Перевод гостя", start)
	r.Ready("host", start)
	r.Ready("gost", start)
	r.ApplyVerdicts([]Verdict{{
		SentenceID: "a2-01", Winners: []string{"gost"},
		Scores: map[string]float64{"gost": 9, "host": 7}, Feedback: "У гостя живее.",
	}}, "Итог", start)

	view := r.View("host", start)
	if len(view.Reveal) != len(r.Sentences) {
		t.Fatalf("в разборе %d фраз из %d", len(view.Reveal), len(r.Sentences))
	}
	first := view.Reveal[0]
	if len(first.Answers) != 2 {
		t.Fatalf("в разборе %d переводов, ожидалось 2", len(first.Answers))
	}
	var found bool
	for _, answer := range first.Answers {
		if answer.PlayerID == "gost" {
			found = answer.Text == "Перевод гостя" && answer.Won && answer.Score == 9
		}
	}
	if !found {
		t.Fatalf("чужой перевод не показан в разборе: %+v", first.Answers)
	}
	if first.Feedback != "У гостя живее." {
		t.Fatal("объяснение судьи потерялось")
	}
	// Пустой ответ второй фразы не показывается вовсе.
	if len(view.Reveal[1].Answers) != 0 {
		t.Fatalf("показаны пустые переводы: %+v", view.Reveal[1].Answers)
	}
}

func TestStandingsSharePlaceOnEqualScore(t *testing.T) {
	r := room(t, 3, "gost", "tretiy")
	r.Find("host").Score = 5
	r.Find("gost").Score = 5
	r.Find("tretiy").Score = 2

	rows := r.Standings()
	if rows[0].Place != 1 || rows[1].Place != 1 {
		t.Fatalf("равные очки получили разные места: %+v", rows)
	}
	if rows[2].Place != 3 || rows[2].ID != "tretiy" {
		t.Fatalf("третий не на третьем месте: %+v", rows[2])
	}
}

func TestCleanCodeForgivesTypos(t *testing.T) {
	code, ok := CleanCode(" abc-def ")
	if !ok || code != "ABCDEF" {
		t.Fatalf("код разобран как %q (%v)", code, ok)
	}
	// Похожих знаков в алфавите нет вовсе, поэтому исправлять «0» на «O»
	// не во что: такой код просто негодный.
	for _, bad := range []string{"", "ABC", "ABCDEFG", "ABCDE!", "ABCD0E", "ABCD1E", "ABCDLE"} {
		if _, ok := CleanCode(bad); ok {
			t.Fatalf("принят негодный код %q", bad)
		}
	}
}

func TestNewCodeUsesSafeAlphabet(t *testing.T) {
	seen := map[string]bool{}
	for range 200 {
		code := NewCode()
		if len(code) != CodeLength {
			t.Fatalf("код %q длиной %d", code, len(code))
		}
		if _, ok := CleanCode(code); !ok {
			t.Fatalf("свой же код не разбирается: %q", code)
		}
		seen[code] = true
	}
	if len(seen) < 190 {
		t.Fatalf("двести кодов дали только %d разных", len(seen))
	}
}

// Опрос комнаты не должен её переписывать: до шести человек спрашивают её
// каждые пару секунд, и запись на каждый такой запрос сталкивала бы игроков
// друг с другом на ровном месте.
func TestQuietPollLeavesRoomAlone(t *testing.T) {
	r := playing(t, 2, "gost")
	r.Answer("host", "a2-01", "Первая.", start)
	quiet := r.UpdatedAt

	for i := range 4 {
		now := start.Add(time.Duration(i+1) * 2 * time.Second)
		r.Tick(now)
		r.Touch("host", now)
	}
	if !r.UpdatedAt.Equal(quiet) {
		t.Fatalf("опрос сдвинул комнату: было %v, стало %v", quiet, r.UpdatedAt)
	}

	// Но присутствие всё-таки запоминается — иначе игрок вылетел бы как ушедший.
	late := start.Add(SeenStep + time.Second)
	r.Touch("host", late)
	if !r.UpdatedAt.Equal(late) {
		t.Fatal("присутствие не запомнилось после SeenStep")
	}
	if seen := r.Find("host").Seen; !seen.Equal(late) {
		t.Fatalf("отметка присутствия осталась на %v", seen)
	}
}

// В лобби срок ухода длиннее: хозяин уходит в мессенджер отправить ссылку, а
// фоновой вкладке браузер сам режет таймеры.
func TestLobbyWaitsLongerThanRound(t *testing.T) {
	r := room(t, 2, "gost")
	r.Tick(start.Add(AwayAfter + time.Second))
	if r.Taken() != 2 {
		t.Fatal("в лобби игрока выкинуло по сроку раунда")
	}
	r.Tick(start.Add(LobbyAwayAfter + time.Second))
	if r.Humans() != 0 {
		t.Fatal("брошенное лобби не закрылось")
	}
	if r.Phase != PhaseFinished {
		t.Fatalf("пустая комната осталась в фазе %s", r.Phase)
	}
}

// Черновик уходит целиком, пока человек печатает. Фраза не из этого раунда
// молча пропускается: черновик мог уйти в момент смены раунда, и ронять из-за
// неё всё сохранение нельзя.
func TestDraftSavesEverythingKnown(t *testing.T) {
	r := playing(t, 2, "gost")
	err := r.AnswerMany("host", map[string]string{
		"a2-01": "Первая.",
		"a2-02": "Вторая.",
		"b1-09": "Фраза из другого раунда.",
	}, start)
	if err != nil {
		t.Fatalf("черновик не сохранился: %v", err)
	}
	seat := r.Find("host")
	if seat.Answers["a2-01"] != "Первая." || seat.Answers["a2-02"] != "Вторая." {
		t.Fatalf("переводы не легли: %v", seat.Answers)
	}
	if _, ok := seat.Answers["b1-09"]; ok {
		t.Fatal("чужая фраза попала в ответы")
	}
	if r.Find("gost").Ready {
		t.Fatal("черновик закрыл чужой ход")
	}
	if seat.Ready {
		t.Fatal("черновик сдал раунд за игрока")
	}
}

// К переводчикам ходят один раз на раунд, а не на каждый опрос: комнату
// спрашивают все игроки разом, а квота DeepL общая на весь сайт.
func TestMachinesAreAskedOnce(t *testing.T) {
	r := room(t, 3, "gost")
	if err := r.AddMachine("bot", "deepl", start); err != nil {
		t.Fatalf("переводчик не сел за стол: %v", err)
	}
	if err := r.Start(phrases(), start); err != nil {
		t.Fatalf("раунд не начался: %v", err)
	}
	if !r.ClaimMachines(start) {
		t.Fatal("первый запрос не получил права сходить к переводчикам")
	}
	if r.ClaimMachines(start.Add(time.Second)) {
		t.Fatal("соседний опрос сходил к переводчикам второй раз")
	}
	// Провайдер молчит дольше срока — можно позвать заново.
	if !r.ClaimMachines(start.Add(MachineLimit + time.Second)) {
		t.Fatal("после срока переводчиков не позвали заново")
	}

	r.MachineAnswers("bot", map[string]string{"a2-01": "Prva.", "a2-02": "Druga."}, start)
	if r.ClaimMachines(start.Add(2 * MachineLimit)) {
		t.Fatal("переводчика позвали, хотя перевод уже есть")
	}
}
