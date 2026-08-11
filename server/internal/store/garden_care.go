package store

import (
	"context"
	"errors"
	"hash/fnv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Уход за садом: лейка, река, дождь, гербарий и задание дня.
//
// Полив раньше был бесконечным: у бесконечного ресурса нет цены, а значит нет
// и выбора — оставалось прокликивать все грядки каждые шесть часов. Теперь
// воды на три полива в день, и берётся она из реки, которая течёт только
// после занятия. Выбор «какие грядки полить сегодня» и есть механика.

const (
	// Ёмкость лейки и сколько раз в день из реки можно набрать.
	gardenCanCapacity = 3
	gardenFillsPerDay = 3

	// Полив стоит воды, поэтому и даёт вдвое больше прежнего.
	gardenWaterBonus = 1.0

	// Срез возвращает половину цены семени: цветок стоил денег и суток роста,
	// поэтому кругооборот «купил — срезал» всегда в минус и накрутки не даёт.
	gardenCutShare      = 2
	gardenFirstCutBonus = 25

	gardenTaskReward = 15

	GardenWeatherClear = "clear"
	GardenWeatherRain  = "rain"
)

var (
	ErrGardenNoWater     = errors.New("в лейке нет воды")
	ErrGardenRiverDry    = errors.New("река сегодня ещё не проснулась")
	ErrGardenCanFull     = errors.New("лейка полна")
	ErrGardenFillLimit   = errors.New("на сегодня вода в реке кончилась")
	ErrGardenNotBlooming = errors.New("цветок ещё не распустился")
)

type GardenHerbarium struct {
	Species string    `json:"species"`
	Count   int       `json:"count"`
	FirstAt time.Time `json:"firstAt"`
}

type GardenTask struct {
	Kind     string `json:"kind"`
	Target   int    `json:"target"`
	Progress int    `json:"progress"`
	Reward   int    `json:"reward"`
	Done     bool   `json:"done"`
}

type GardenCut struct {
	Species string `json:"species"`
	Coins   int64  `json:"coins"`
	First   bool   `json:"first"`
}

// gardenWeather — погода дня: одна на всех и предсказуемая по дате. Свой
// генератор на каждого игрока означал бы, что у соседа льёт дождь, а у меня
// нет, — объяснить это внутри одного мира нечем.
func gardenWeather(now time.Time) string {
	sum := fnv.New32a()
	_, _ = sum.Write([]byte(now.UTC().Format("2006-01-02")))
	if sum.Sum32()%100 < 22 {
		return GardenWeatherRain
	}
	return GardenWeatherClear
}

// gardenStudiedToday — заработок за сегодня по учебным источникам. Награда за
// задание дня сюда не входит: посадить цветок — не занятие сербским, и река от
// этого проснуться не должна.
func gardenStudiedToday(today map[string]int64) int64 {
	var earned int64
	for _, source := range gardenSources {
		earned += today[source.ID]
	}
	return earned
}

// rainGarden поливает весь сад дождём — один раз за дождливый день. Без
// отметки дня каждое обращение к саду обновляло бы полив заново, и в дождь
// вода не кончалась бы никогда.
func (s *Store) rainGarden(ctx context.Context, userID uuid.UUID, now time.Time) error {
	if gardenWeather(now) != GardenWeatherRain {
		return nil
	}
	day := now.Format("2006-01-02")
	tag, err := s.Pool.Exec(ctx, `
		UPDATE garden_profiles SET rain_day=$2
		 WHERE user_id=$1 AND (rain_day IS NULL OR rain_day <> $2)`, userID, day)
	if err != nil || tag.RowsAffected() == 0 {
		return err
	}
	_, err = s.Pool.Exec(ctx, `
		UPDATE garden_plantings SET watered_at=$2 WHERE user_id=$1`, userID, now)
	return err
}

// FillGardenCan набирает воду из реки. Река течёт в тот день, когда человек
// занимался: вода — награда за занятие, а не кнопка на карте.
func (s *Store) FillGardenCan(ctx context.Context, userID uuid.UUID, now time.Time) (int, error) {
	today, err := s.gardenToday(ctx, userID, now)
	if err != nil {
		return 0, err
	}
	if gardenStudiedToday(today) <= 0 {
		return 0, ErrGardenRiverDry
	}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	day := now.Format("2006-01-02")
	var water, taken int
	var waterDay *string
	if err := tx.QueryRow(ctx, `
		SELECT water, water_taken, to_char(water_day, 'YYYY-MM-DD')
		  FROM garden_profiles WHERE user_id=$1 FOR UPDATE`,
		userID).Scan(&water, &taken, &waterDay); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrGardenNotFound
		}
		return 0, err
	}
	if waterDay == nil || *waterDay != day {
		taken = 0
	}
	if taken >= gardenFillsPerDay {
		return 0, ErrGardenFillLimit
	}
	if water >= gardenCanCapacity {
		return 0, ErrGardenCanFull
	}
	water++
	taken++
	if _, err := tx.Exec(ctx, `
		UPDATE garden_profiles SET water=$2, water_taken=$3, water_day=$4, updated_at=now()
		 WHERE user_id=$1`, userID, water, taken, day); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return water, nil
}

// CutGardenFlower срезает распустившийся цветок в гербарий и освобождает
// грядку. Пока цветок стоял вечно, сад из двенадцати грядок заканчивался за
// неделю: сажать некуда, тратить нечего, в таблице у всех двенадцать.
func (s *Store) CutGardenFlower(
	ctx context.Context, userID uuid.UUID, slot int, now time.Time,
) (GardenCut, error) {
	if slot < 0 || slot >= GardenSlots {
		return GardenCut{}, ErrGardenBadSlot
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return GardenCut{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var speciesID string
	var growth float64
	if err := tx.QueryRow(ctx, `
		SELECT species, growth FROM garden_plantings
		 WHERE user_id=$1 AND slot=$2 FOR UPDATE`, userID, slot).Scan(&speciesID, &growth); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return GardenCut{}, ErrGardenSlotEmpty
		}
		return GardenCut{}, err
	}
	if growth < GardenStages {
		return GardenCut{}, ErrGardenNotBlooming
	}
	species, ok := GardenSpeciesByID(speciesID)
	if !ok {
		return GardenCut{}, ErrGardenBadSpecies
	}

	if _, err := tx.Exec(ctx, `
		DELETE FROM garden_plantings WHERE user_id=$1 AND slot=$2`, userID, slot); err != nil {
		return GardenCut{}, err
	}
	var count int
	if err := tx.QueryRow(ctx, `
		INSERT INTO garden_herbarium (user_id, species, count, first_at, last_at)
		VALUES ($1,$2,1,$3,$3)
		ON CONFLICT (user_id, species) DO UPDATE
		   SET count = garden_herbarium.count + 1, last_at = EXCLUDED.last_at
		RETURNING count`, userID, species.ID, now).Scan(&count); err != nil {
		return GardenCut{}, err
	}

	cut := GardenCut{Species: species.ID, Coins: species.Price / gardenCutShare, First: count == 1}
	if cut.First {
		cut.Coins += gardenFirstCutBonus
	}
	if _, err := tx.Exec(ctx, `
		UPDATE garden_profiles
		   SET coins=coins+$2, earned_total=earned_total+$2, updated_at=now()
		 WHERE user_id=$1`, userID, cut.Coins); err != nil {
		return GardenCut{}, err
	}
	if err := advanceGardenTask(ctx, tx, userID, now, gardenTaskCut); err != nil {
		return GardenCut{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return GardenCut{}, err
	}
	return cut, nil
}

func (s *Store) gardenHerbarium(ctx context.Context, userID uuid.UUID) ([]GardenHerbarium, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT species, count, first_at FROM garden_herbarium
		 WHERE user_id=$1 ORDER BY first_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	collected := make([]GardenHerbarium, 0, len(GardenCatalog))
	for rows.Next() {
		var item GardenHerbarium
		if err := rows.Scan(&item.Species, &item.Count, &item.FirstAt); err != nil {
			return nil, err
		}
		collected = append(collected, item)
	}
	return collected, rows.Err()
}

const (
	gardenTaskWater = "water"
	gardenTaskPlant = "plant"
	gardenTaskCut   = "cut"
	gardenTaskHelp  = "help"
)

type gardenTaskSpec struct {
	Kind   string
	Target int
}

// gardenDailyTask выбирает задание дня из тех, что сегодня выполнимы: полить
// нечего в пустом саду, срезать нечего без распустившегося цветка. Выбор
// зависит от дня и человека, чтобы у всех не было одного и того же задания.
func gardenDailyTask(userID uuid.UUID, day string, growing, blooming, free int) gardenTaskSpec {
	options := []gardenTaskSpec{{gardenTaskHelp, 1}}
	if growing > 0 {
		target := 2
		if growing < 2 {
			target = 1
		}
		options = append(options, gardenTaskSpec{gardenTaskWater, target})
	}
	if free > 0 {
		options = append(options, gardenTaskSpec{gardenTaskPlant, 1})
	}
	if blooming > 0 {
		options = append(options, gardenTaskSpec{gardenTaskCut, 1})
	}
	sum := fnv.New32a()
	_, _ = sum.Write([]byte(day))
	_, _ = sum.Write(userID[:])
	return options[int(sum.Sum32()%uint32(len(options)))]
}

// gardenTask выдаёт задание дня, заводя его при первом заходе. Уже выданное
// задание не переигрывается: набор зависит от состояния сада, и посадка
// последнего семени иначе меняла бы задание на ходу.
func (s *Store) gardenTask(
	ctx context.Context, userID uuid.UUID, now time.Time, plants []GardenPlanting,
) (*GardenTask, error) {
	day := now.Format("2006-01-02")
	task := &GardenTask{}
	var paid bool
	err := s.Pool.QueryRow(ctx, `
		SELECT kind, target, progress, reward, paid FROM garden_tasks
		 WHERE user_id=$1 AND day=$2`, userID, day).Scan(
		&task.Kind, &task.Target, &task.Progress, &task.Reward, &paid)
	if err == nil {
		task.Done = paid
		return task, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	var blooming, free int
	for _, plant := range plants {
		if plant.Blooming {
			blooming++
		}
	}
	free = GardenSlots - len(plants)
	spec := gardenDailyTask(userID, day, len(plants)-blooming, blooming, free)
	if _, err := s.Pool.Exec(ctx, `
		INSERT INTO garden_tasks (user_id, day, kind, target, reward)
		VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
		userID, day, spec.Kind, spec.Target, gardenTaskReward); err != nil {
		return nil, err
	}
	return &GardenTask{Kind: spec.Kind, Target: spec.Target, Reward: gardenTaskReward}, nil
}

// advanceGardenTask двигает задание дня и платит за него ровно один раз.
// Награда и отметка об оплате идут одним оператором: раздельные «проверить» и
// «заплатить» дали бы двойную оплату при двух одновременных запросах.
func advanceGardenTask(
	ctx context.Context, tx pgx.Tx, userID uuid.UUID, now time.Time, kind string,
) error {
	var reward int64
	err := tx.QueryRow(ctx, `
		UPDATE garden_tasks SET progress = progress + 1,
		       paid = (progress + 1 >= target)
		 WHERE user_id=$1 AND day=$2 AND kind=$3 AND NOT paid
		RETURNING CASE WHEN progress >= target THEN reward ELSE 0 END`,
		userID, now.Format("2006-01-02"), kind).Scan(&reward)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if reward <= 0 {
		return nil
	}
	if _, err := tx.Exec(ctx, `
		UPDATE garden_profiles
		   SET coins=coins+$2, earned_total=earned_total+$2, updated_at=now()
		 WHERE user_id=$1`, userID, reward); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO garden_earnings (user_id, day, source, coins) VALUES ($1,$2,'task',$3)
		ON CONFLICT (user_id, day, source) DO UPDATE
		   SET coins = garden_earnings.coins + EXCLUDED.coins`,
		userID, now.Format("2006-01-02"), reward)
	return err
}
