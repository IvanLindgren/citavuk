package store

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const (
	GardenSlots      = 12
	GardenStages     = 5
	gardenStageHours = 4.0
	gardenStartCoins = 50

	gardenWaterWindow  = 6 * time.Hour
	gardenDroughtAfter = 24 * time.Hour
	gardenActivityFull = 60.0
	gardenVisitsPerDay = 5
	gardenVisitReward  = 2
)

var (
	ErrGardenSlotTaken   = errors.New("грядка занята")
	ErrGardenSlotEmpty   = errors.New("грядка пуста")
	ErrGardenNoCoins     = errors.New("не хватает динаров")
	ErrGardenBadSpecies  = errors.New("такого семени нет")
	ErrGardenBadDecor    = errors.New("такого украшения нет")
	ErrGardenBadSlot     = errors.New("такой грядки нет")
	ErrGardenNickTaken   = errors.New("никнейм занят")
	ErrGardenNickBad     = errors.New("никнейм не подходит")
	ErrGardenNotFound    = errors.New("сад не найден")
	ErrGardenWateredTwce = errors.New("этот сад сегодня уже полит")
	ErrGardenVisitLimit  = errors.New("на сегодня помощь соседям закончилась")
	ErrGardenSelfVisit   = errors.New("свой сад поливают со своей страницы")
)

type GardenDecoration struct {
	ID      string `json:"id"`
	Serbian string `json:"serbian"`
	Russian string `json:"russian"`
	Price   int64  `json:"price"`
}

var GardenDecorationCatalog = []GardenDecoration{
	{ID: "berry-bushes", Serbian: "жбуње са бобицама", Russian: "ягодные кусты", Price: 35},
}

func GardenDecorationByID(id string) (GardenDecoration, bool) {
	for _, decoration := range GardenDecorationCatalog {
		if decoration.ID == id {
			return decoration, true
		}
	}
	return GardenDecoration{}, false
}

// GardenSpecies — вид цветка. Тема связывает цветок с Тренажёркой: распустился
// — предлагает заняться своей темой.
type GardenSpecies struct {
	ID      string `json:"id"`
	Serbian string `json:"serbian"`
	Russian string `json:"russian"`
	Price   int64  `json:"price"`
	Topic   string `json:"topic"`
	Theme   string `json:"theme"`
	Phrase  string `json:"phrase"`
}

var GardenCatalog = []GardenSpecies{
	{
		ID: "suncokret", Serbian: "сунцокрет", Russian: "подсолнух", Price: 20,
		Topic: "grammar-a1-08", Theme: "винительный падеж",
		Phrase: "Волим сунцокрет. Видиш ли и ти сунцокрет?",
	},
	{
		ID: "krasuljak", Serbian: "красуљак", Russian: "ромашка", Price: 30,
		Topic: "grammar-a1-04", Theme: "настоящее время",
		Phrase: "Ја растем, ти растеш, ми растемо.",
	},
	{
		ID: "koleus", Serbian: "колеус", Russian: "колеус", Price: 45,
		Topic: "grammar-a1-10", Theme: "родительный падеж",
		Phrase: "Ово је лист колеуса, боја из баште.",
	},
	{
		ID: "cuvarkuca", Serbian: "чуваркућа", Russian: "молодило", Price: 60,
		Topic: "grammar-a1-15", Theme: "числительные",
		Phrase: "Један лист, два листа, пет листова.",
	},
}

func GardenSpeciesByID(id string) (GardenSpecies, bool) {
	for _, species := range GardenCatalog {
		if species.ID == id {
			return species, true
		}
	}
	return GardenSpecies{}, false
}

type gardenSource struct {
	ID       string
	Title    string
	PerUnit  int64
	UnitsPer int64
	DailyCap int64
}

var gardenSources = []gardenSource{
	{"reading", "Чтение книг", 1, 10, 30},
	{"reviews", "Повторение слов", 1, 5, 20},
	{"learned", "Выученные слова", 3, 1, 30},
	{"duel", "Дуэль переводов", 5, 1, 25},
	{"roadmap", "Тренажёрка и карта", 10, 1, 40},
	{"course", "Уроки курса", 8, 1, 32},
}

type GardenPlanting struct {
	Slot      int        `json:"slot"`
	Species   string     `json:"species"`
	Stage     int        `json:"stage"`
	Growth    float64    `json:"growth"`
	Blooming  bool       `json:"blooming"`
	Speed     float64    `json:"speed"`
	PlantedAt time.Time  `json:"plantedAt"`
	WateredAt *time.Time `json:"wateredAt,omitempty"`
}

type GardenEarning struct {
	Source string `json:"source"`
	Title  string `json:"title"`
	Today  int64  `json:"today"`
	Cap    int64  `json:"cap"`
}

type GardenState struct {
	Nickname    string           `json:"nickname"`
	Public      bool             `json:"public"`
	Coins       int64            `json:"coins"`
	EarnedTotal int64            `json:"earnedTotal"`
	Slots       int              `json:"slots"`
	Plants      []GardenPlanting `json:"plants"`
	Decorations []string         `json:"decorations"`
	Bloomed     int              `json:"bloomed"`
	Earnings    []GardenEarning  `json:"earnings"`
	TodayCoins  int64            `json:"todayCoins"`
	Speed       float64          `json:"speed"`
	HelpedToday int              `json:"helpedToday"`
	HelpLimit   int              `json:"helpLimit"`
}

type GardenBoardRow struct {
	Nickname string   `json:"nickname"`
	Bloomed  int      `json:"bloomed"`
	Plants   int      `json:"plants"`
	Species  int      `json:"species"`
	Growing  []string `json:"growing,omitempty"`
}

type PublicGarden struct {
	Nickname    string           `json:"nickname"`
	Slots       int              `json:"slots"`
	Plants      []GardenPlanting `json:"plants"`
	Decorations []string         `json:"decorations"`
	Bloomed     int              `json:"bloomed"`
	CanWater    bool             `json:"canWater"`
	WateredAt   *time.Time       `json:"wateredAt,omitempty"`
}

// Garden возвращает сад, предварительно начислив заработанное и дорастив цветы.
func (s *Store) Garden(ctx context.Context, userID uuid.UUID) (GardenState, error) {
	now := time.Now().UTC()
	if err := s.ensureGarden(ctx, userID, now); err != nil {
		return GardenState{}, err
	}
	if err := s.accrueGarden(ctx, userID, now); err != nil {
		return GardenState{}, err
	}

	var state GardenState
	state.Slots = GardenSlots
	state.HelpLimit = gardenVisitsPerDay
	if err := s.Pool.QueryRow(ctx, `
		SELECT nickname, public, coins, earned_total
		  FROM garden_profiles WHERE user_id=$1`, userID).Scan(
		&state.Nickname, &state.Public, &state.Coins, &state.EarnedTotal); err != nil {
		return GardenState{}, err
	}

	today, err := s.gardenToday(ctx, userID, now)
	if err != nil {
		return GardenState{}, err
	}
	for _, source := range gardenSources {
		state.Earnings = append(state.Earnings, GardenEarning{
			Source: source.ID, Title: source.Title,
			Today: today[source.ID], Cap: source.DailyCap,
		})
		state.TodayCoins += today[source.ID]
	}
	state.Speed = 1 + gardenActivityBonus(state.TodayCoins)

	plants, err := s.growGarden(ctx, userID, state.TodayCoins, now)
	if err != nil {
		return GardenState{}, err
	}
	state.Plants = plants
	state.Decorations, err = s.gardenDecorations(ctx, userID)
	if err != nil {
		return GardenState{}, err
	}
	for _, plant := range plants {
		if plant.Blooming {
			state.Bloomed++
		}
	}

	if err := s.Pool.QueryRow(ctx, `
		SELECT count(*) FROM garden_visits WHERE user_id=$1 AND day=$2`,
		userID, now.Format("2006-01-02")).Scan(&state.HelpedToday); err != nil {
		return GardenState{}, err
	}
	return state, nil
}

func (s *Store) gardenDecorations(ctx context.Context, userID uuid.UUID) ([]string, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT decoration FROM garden_decorations
		 WHERE user_id=$1 ORDER BY purchased_at, decoration`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	decorations := make([]string, 0, len(GardenDecorationCatalog))
	for rows.Next() {
		var decoration string
		if err := rows.Scan(&decoration); err != nil {
			return nil, err
		}
		decorations = append(decorations, decoration)
	}
	return decorations, rows.Err()
}

// ensureGarden заводит сад при первом заходе. Счётчики сразу ставятся на
// текущие значения: прошлое не оплачивается, иначе ветеран открыл бы сад с
// тысячами динаров и лидерборд показывал бы стаж, а не игру.
func (s *Store) ensureGarden(ctx context.Context, userID uuid.UUID, now time.Time) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var created uuid.UUID
	err = tx.QueryRow(ctx, `
		INSERT INTO garden_profiles (user_id, coins, earned_total)
		VALUES ($1,$2,$2) ON CONFLICT DO NOTHING RETURNING user_id`,
		userID, gardenStartCoins).Scan(&created)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	totals, err := gardenTotals(ctx, tx, userID)
	if err != nil {
		return err
	}
	for _, source := range gardenSources {
		if _, err := tx.Exec(ctx, `
			INSERT INTO garden_accruals (user_id, source, counted) VALUES ($1,$2,$3)
			ON CONFLICT (user_id, source) DO NOTHING`,
			userID, source.ID, totals[source.ID]); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) accrueGarden(ctx context.Context, userID uuid.UUID, now time.Time) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	totals, err := gardenTotals(ctx, tx, userID)
	if err != nil {
		return err
	}
	day := now.Format("2006-01-02")
	var minted int64
	for _, source := range gardenSources {
		var counted int64
		err := tx.QueryRow(ctx, `
			SELECT counted FROM garden_accruals
			 WHERE user_id=$1 AND source=$2 FOR UPDATE`, userID, source.ID).Scan(&counted)
		if errors.Is(err, pgx.ErrNoRows) {
			counted = 0
			if _, err := tx.Exec(ctx, `
				INSERT INTO garden_accruals (user_id, source, counted) VALUES ($1,$2,0)
				ON CONFLICT DO NOTHING`, userID, source.ID); err != nil {
				return err
			}
		} else if err != nil {
			return err
		}

		var spentToday int64
		if err := tx.QueryRow(ctx, `
			SELECT coalesce(coins,0) FROM garden_earnings
			 WHERE user_id=$1 AND day=$2 AND source=$3`,
			userID, day, source.ID).Scan(&spentToday); err != nil &&
			!errors.Is(err, pgx.ErrNoRows) {
			return err
		}

		coins, paidUnits := gardenPayout(totals[source.ID]-counted, source, spentToday)
		if coins <= 0 {
			continue
		}
		if _, err := tx.Exec(ctx, `
			UPDATE garden_accruals SET counted=counted+$3
			 WHERE user_id=$1 AND source=$2`, userID, source.ID, paidUnits); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO garden_earnings (user_id, day, source, coins) VALUES ($1,$2,$3,$4)
			ON CONFLICT (user_id, day, source) DO UPDATE
			   SET coins = garden_earnings.coins + EXCLUDED.coins`,
			userID, day, source.ID, coins); err != nil {
			return err
		}
		minted += coins
	}
	if minted > 0 {
		if _, err := tx.Exec(ctx, `
			UPDATE garden_profiles
			   SET coins=coins+$2, earned_total=earned_total+$2, updated_at=now()
			 WHERE user_id=$1`, userID, minted); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// gardenPayout считает выплату и сколько единиц она оплатила. Недоплаченный
// из-за потолка остаток не сгорает: счётчик двигается только на оплаченное.
func gardenPayout(delta int64, source gardenSource, spentToday int64) (coins, units int64) {
	if delta <= 0 {
		return 0, 0
	}
	allowed := source.DailyCap - spentToday
	if allowed <= 0 {
		return 0, 0
	}
	coins = delta / source.UnitsPer * source.PerUnit
	if coins > allowed {
		coins = allowed / source.PerUnit * source.PerUnit
	}
	return coins, coins / source.PerUnit * source.UnitsPer
}

type gardenQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func gardenTotals(ctx context.Context, q gardenQuerier, userID uuid.UUID) (map[string]int64, error) {
	totals := map[string]int64{}
	var reading, reviews, learned, roadmap, duel, course int64
	err := q.QueryRow(ctx, `
		SELECT
		  (SELECT coalesce(sum(least(last_para, greatest(para_count,0))),0)
		     FROM books WHERE user_id=$1 AND NOT deleted),
		  (SELECT coalesce(sum(reps),0) FROM reviews
		     WHERE user_id=$1 AND NOT deleted),
		  (SELECT count(*) FROM reviews r JOIN vocabulary v ON v.id=r.vocab_id
		     WHERE r.user_id=$1 AND NOT r.deleted AND NOT v.deleted
		       AND r.reps>=3 AND r.interval_days>=7),
		  (SELECT count(*) FROM roadmap_completions WHERE user_id=$1),
		  (SELECT count(*) FROM garden_events WHERE user_id=$1 AND kind='duel'),
		  (SELECT count(*) FROM garden_events WHERE user_id=$1 AND kind='course')`,
		userID).Scan(&reading, &reviews, &learned, &roadmap, &duel, &course)
	if err != nil {
		return nil, err
	}
	totals["reading"] = reading
	totals["reviews"] = reviews
	totals["learned"] = learned
	totals["roadmap"] = roadmap
	totals["duel"] = duel
	totals["course"] = course
	return totals, nil
}

func (s *Store) gardenToday(ctx context.Context, userID uuid.UUID, now time.Time) (map[string]int64, error) {
	today := map[string]int64{}
	rows, err := s.Pool.Query(ctx, `
		SELECT source, coins FROM garden_earnings WHERE user_id=$1 AND day=$2`,
		userID, now.Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var source string
		var coins int64
		if err := rows.Scan(&source, &coins); err != nil {
			return nil, err
		}
		today[source] = coins
	}
	return today, rows.Err()
}

func gardenActivityBonus(todayCoins int64) float64 {
	return math.Min(1, float64(todayCoins)/gardenActivityFull)
}

func gardenSpeed(activity float64, planted time.Time, watered *time.Time, now time.Time) float64 {
	speed := 1 + activity
	last := planted
	if watered != nil {
		last = *watered
	}
	since := now.Sub(last)
	switch {
	case watered != nil && since <= gardenWaterWindow:
		speed += 0.5
	case since > gardenDroughtAfter:
		speed *= 0.5
	}
	return speed
}

// growGarden дорастает цветы лениво: при обращении к саду добавляется рост за
// прошедшее время. Пока человека нет, множитель активности к нему не
// применяется — сад не растёт быстрее от того, что вкладку не закрыли.
func (s *Store) growGarden(
	ctx context.Context, userID uuid.UUID, todayCoins int64, now time.Time,
) ([]GardenPlanting, error) {
	activity := gardenActivityBonus(todayCoins)
	rows, err := s.Pool.Query(ctx, `
		SELECT slot, species, growth, planted_at, grown_at, watered_at
		  FROM garden_plantings WHERE user_id=$1 ORDER BY slot`, userID)
	if err != nil {
		return nil, err
	}
	plants := make([]GardenPlanting, 0, GardenSlots)
	type update struct {
		slot   int
		growth float64
	}
	var updates []update
	for rows.Next() {
		var plant GardenPlanting
		var grownAt time.Time
		if err := rows.Scan(&plant.Slot, &plant.Species, &plant.Growth,
			&plant.PlantedAt, &grownAt, &plant.WateredAt); err != nil {
			rows.Close()
			return nil, err
		}
		plant.Speed = gardenSpeed(activity, plant.PlantedAt, plant.WateredAt, now)
		if plant.Growth < GardenStages {
			hours := now.Sub(grownAt).Hours()
			if hours > 0 {
				plant.Growth = math.Min(GardenStages,
					plant.Growth+hours/gardenStageHours*plant.Speed)
			}
			updates = append(updates, update{plant.Slot, plant.Growth})
		}
		plant.Stage = int(math.Floor(plant.Growth))
		if plant.Stage >= GardenStages {
			plant.Stage = GardenStages - 1
			plant.Blooming = true
		}
		plants = append(plants, plant)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, item := range updates {
		if _, err := s.Pool.Exec(ctx, `
			UPDATE garden_plantings SET growth=$3, grown_at=$4
			 WHERE user_id=$1 AND slot=$2`, userID, item.slot, item.growth, now); err != nil {
			return nil, err
		}
	}
	return plants, nil
}

func (s *Store) PlantGarden(ctx context.Context, userID uuid.UUID, slot int, speciesID string) error {
	if slot < 0 || slot >= GardenSlots {
		return ErrGardenBadSlot
	}
	species, ok := GardenSpeciesByID(speciesID)
	if !ok {
		return ErrGardenBadSpecies
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var coins int64
	if err := tx.QueryRow(ctx, `
		SELECT coins FROM garden_profiles WHERE user_id=$1 FOR UPDATE`,
		userID).Scan(&coins); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrGardenNotFound
		}
		return err
	}
	if coins < species.Price {
		return ErrGardenNoCoins
	}
	tag, err := tx.Exec(ctx, `
		INSERT INTO garden_plantings (user_id, slot, species)
		VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, userID, slot, species.ID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrGardenSlotTaken
	}
	if _, err := tx.Exec(ctx, `
		UPDATE garden_profiles SET coins=coins-$2, updated_at=now() WHERE user_id=$1`,
		userID, species.Price); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) BuyGardenDecoration(ctx context.Context, userID uuid.UUID, decorationID string) error {
	decoration, ok := GardenDecorationByID(decorationID)
	if !ok {
		return ErrGardenBadDecor
	}
	if err := s.ensureGarden(ctx, userID, time.Now().UTC()); err != nil {
		return err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var coins int64
	var owned bool
	if err := tx.QueryRow(ctx, `
		SELECT p.coins, EXISTS(SELECT 1 FROM garden_decorations d
		 WHERE d.user_id=p.user_id AND d.decoration=$2)
		 FROM garden_profiles p WHERE p.user_id=$1 FOR UPDATE`,
		userID, decoration.ID).Scan(&coins, &owned); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrGardenNotFound
		}
		return err
	}
	if owned {
		return tx.Commit(ctx)
	}
	if coins < decoration.Price {
		return ErrGardenNoCoins
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO garden_decorations (user_id, decoration) VALUES ($1,$2)`,
		userID, decoration.ID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE garden_profiles SET coins=coins-$2, updated_at=now() WHERE user_id=$1`,
		userID, decoration.Price); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) WaterGarden(ctx context.Context, userID uuid.UUID, slot int) error {
	tag, err := s.Pool.Exec(ctx, `
		UPDATE garden_plantings SET watered_at=now() WHERE user_id=$1 AND slot=$2`,
		userID, slot)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrGardenSlotEmpty
	}
	return nil
}

func (s *Store) SetGardenProfile(
	ctx context.Context, userID uuid.UUID, nickname string, public bool,
) error {
	nickname = strings.TrimSpace(nickname)
	if nickname != "" && !validGardenNickname(nickname) {
		return ErrGardenNickBad
	}
	if nickname == "" && public {
		return ErrGardenNickBad
	}
	_, err := s.Pool.Exec(ctx, `
		UPDATE garden_profiles SET nickname=$2, public=$3, updated_at=now()
		 WHERE user_id=$1`, userID, nickname, public)
	if err != nil && strings.Contains(err.Error(), "garden_nickname_idx") {
		return ErrGardenNickTaken
	}
	return err
}

func validGardenNickname(nickname string) bool {
	runes := []rune(nickname)
	if len(runes) < 2 || len(runes) > 24 {
		return false
	}
	for _, r := range runes {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z',
			r >= '0' && r <= '9', r == '-', r == '_':
		case r >= 0x0400 && r <= 0x04FF:
		default:
			return false
		}
	}
	return true
}

func (s *Store) GardenLeaderboard(ctx context.Context, limit int) ([]GardenBoardRow, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT p.nickname,
		       count(*) FILTER (WHERE g.growth >= $1),
		       count(g.slot),
		       count(DISTINCT g.species)
		  FROM garden_profiles p
		  LEFT JOIN garden_plantings g ON g.user_id = p.user_id
		 WHERE p.public AND p.nickname <> ''
		 GROUP BY p.user_id, p.nickname
		 ORDER BY 2 DESC, 4 DESC, 3 DESC, p.nickname
		 LIMIT $2`, GardenStages, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	board := make([]GardenBoardRow, 0, limit)
	for rows.Next() {
		var row GardenBoardRow
		if err := rows.Scan(&row.Nickname, &row.Bloomed, &row.Plants, &row.Species); err != nil {
			return nil, err
		}
		board = append(board, row)
	}
	return board, rows.Err()
}

// SearchGardeners ищет садоводов по имени и по тому, что у них растёт.
//
// Имя аккаунта в поиск не попадает: человек соглашался показать сад под
// выбранным именем садовода, а не связать его со своим настоящим.
func (s *Store) SearchGardeners(
	ctx context.Context, query, species string, limit int,
) ([]GardenBoardRow, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	query = strings.TrimSpace(query)
	if len([]rune(query)) > 24 {
		return nil, ErrGardenNickBad
	}
	if species != "" {
		if _, ok := GardenSpeciesByID(species); !ok {
			return nil, ErrGardenBadSpecies
		}
	}

	rows, err := s.Pool.Query(ctx, `
		SELECT p.nickname,
		       count(*) FILTER (WHERE g.growth >= $1),
		       count(g.slot),
		       count(DISTINCT g.species),
		       coalesce(array_agg(DISTINCT g.species)
		                FILTER (WHERE g.species IS NOT NULL), '{}')
		  FROM garden_profiles p
		  LEFT JOIN garden_plantings g ON g.user_id = p.user_id
		 WHERE p.public AND p.nickname <> ''
		   AND ($2 = '' OR p.nickname ILIKE '%' || $2 || '%')
		   AND ($3 = '' OR EXISTS (SELECT 1 FROM garden_plantings f
		        WHERE f.user_id = p.user_id AND f.species = $3))
		 GROUP BY p.user_id, p.nickname
		 ORDER BY 2 DESC, 3 DESC, p.nickname
		 LIMIT $4`, GardenStages, query, species, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	found := make([]GardenBoardRow, 0, limit)
	for rows.Next() {
		var row GardenBoardRow
		if err := rows.Scan(&row.Nickname, &row.Bloomed, &row.Plants,
			&row.Species, &row.Growing); err != nil {
			return nil, err
		}
		found = append(found, row)
	}
	return found, rows.Err()
}

// PublicGardenByNickname отдаёт чужой сад. Рост здесь не пересчитывается:
// заходы гостей не должны двигать чужие цветы, это делает сам хозяин.
func (s *Store) PublicGardenByNickname(
	ctx context.Context, nickname string, viewer uuid.UUID, now time.Time,
) (PublicGarden, error) {
	var hostID uuid.UUID
	var garden PublicGarden
	err := s.Pool.QueryRow(ctx, `
		SELECT user_id, nickname FROM garden_profiles
		 WHERE public AND lower(nickname)=lower($1)`, nickname).Scan(&hostID, &garden.Nickname)
	if errors.Is(err, pgx.ErrNoRows) {
		return PublicGarden{}, ErrGardenNotFound
	}
	if err != nil {
		return PublicGarden{}, err
	}
	garden.Slots = GardenSlots

	rows, err := s.Pool.Query(ctx, `
		SELECT slot, species, growth, planted_at, watered_at
		  FROM garden_plantings WHERE user_id=$1 ORDER BY slot`, hostID)
	if err != nil {
		return PublicGarden{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var plant GardenPlanting
		if err := rows.Scan(&plant.Slot, &plant.Species, &plant.Growth,
			&plant.PlantedAt, &plant.WateredAt); err != nil {
			return PublicGarden{}, err
		}
		plant.Stage = int(math.Floor(plant.Growth))
		if plant.Stage >= GardenStages {
			plant.Stage = GardenStages - 1
			plant.Blooming = true
			garden.Bloomed++
		}
		garden.Plants = append(garden.Plants, plant)
	}
	if err := rows.Err(); err != nil {
		return PublicGarden{}, err
	}
	garden.Decorations, err = s.gardenDecorations(ctx, hostID)
	if err != nil {
		return PublicGarden{}, err
	}

	if viewer != uuid.Nil && viewer != hostID {
		var watered bool
		if err := s.Pool.QueryRow(ctx, `
			SELECT EXISTS(SELECT 1 FROM garden_visits
			 WHERE user_id=$1 AND host_id=$2 AND day=$3)`,
			viewer, hostID, now.Format("2006-01-02")).Scan(&watered); err != nil {
			return PublicGarden{}, err
		}
		garden.CanWater = !watered && len(garden.Plants) > 0
	}
	return garden, nil
}

// HelpGarden — полив соседа. Один сад в сутки и пять садов в день: иначе двумя
// своими аккаунтами можно было бы поливать друг друга бесконечно.
func (s *Store) HelpGarden(
	ctx context.Context, userID uuid.UUID, nickname string, now time.Time,
) (int64, error) {
	var hostID uuid.UUID
	err := s.Pool.QueryRow(ctx, `
		SELECT user_id FROM garden_profiles
		 WHERE public AND lower(nickname)=lower($1)`, nickname).Scan(&hostID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrGardenNotFound
	}
	if err != nil {
		return 0, err
	}
	if hostID == userID {
		return 0, ErrGardenSelfVisit
	}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	day := now.Format("2006-01-02")
	var helped int
	if err := tx.QueryRow(ctx, `
		SELECT count(*) FROM garden_visits WHERE user_id=$1 AND day=$2`,
		userID, day).Scan(&helped); err != nil {
		return 0, err
	}
	if helped >= gardenVisitsPerDay {
		return 0, ErrGardenVisitLimit
	}
	tag, err := tx.Exec(ctx, `
		INSERT INTO garden_visits (user_id, host_id, day) VALUES ($1,$2,$3)
		ON CONFLICT DO NOTHING`, userID, hostID, day)
	if err != nil {
		return 0, err
	}
	if tag.RowsAffected() == 0 {
		return 0, ErrGardenWateredTwce
	}
	if _, err := tx.Exec(ctx, `
		UPDATE garden_plantings SET watered_at=$2 WHERE user_id=$1`, hostID, now); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE garden_profiles
		   SET coins=coins+$2, earned_total=earned_total+$2, updated_at=now()
		 WHERE user_id=$1`, userID, gardenVisitReward); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return gardenVisitReward, nil
}

// RecordGardenEvent отмечает то, чего сервер не видит в синхронизированных
// таблицах: выигранный раунд дуэли и пройденный урок курса. Ключ держит
// повторную отправку от двойной оплаты.
func (s *Store) RecordGardenEvent(ctx context.Context, userID uuid.UUID, kind, key string) error {
	if kind != "duel" && kind != "course" {
		return fmt.Errorf("неизвестный вид события: %s", kind)
	}
	if key == "" {
		return errors.New("пустой ключ события")
	}
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO garden_events (user_id, kind, key) VALUES ($1,$2,$3)
		ON CONFLICT DO NOTHING`, userID, kind, key)
	return err
}

// GardenCourseSync выравнивает число оплаченных уроков курса с тем, что
// прислал клиент. Прогресс курса — клиентский блоб, проверить его сервер не
// может, поэтому событий за раз добавляется не больше дневного потолка.
func (s *Store) GardenCourseSync(
	ctx context.Context, userID uuid.UUID, courseID string, completed int,
) error {
	if completed <= 0 {
		return nil
	}
	var known int
	if err := s.Pool.QueryRow(ctx, `
		SELECT count(*) FROM garden_events
		 WHERE user_id=$1 AND kind='course' AND key LIKE $2`,
		userID, courseID+":%").Scan(&known); err != nil {
		return err
	}
	for i := known; i < completed; i++ {
		if err := s.RecordGardenEvent(ctx, userID, "course",
			fmt.Sprintf("%s:%d", courseID, i)); err != nil {
			return err
		}
	}
	return nil
}
