package store

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestGardenPayoutRespectsDailyCap(t *testing.T) {
	reading := gardenSource{"reading", "Чтение", 1, 10, 30}

	// Недоплаченный из-за потолка остаток не сгорает: счётчик двигается только
	// на оплаченные единицы.
	coins, units := gardenPayout(1000, reading, 25)
	if coins != 5 || units != 50 {
		t.Fatalf("у потолка: coins=%d units=%d, ожидалось 5 и 50", coins, units)
	}
	if coins, units := gardenPayout(1000, reading, 30); coins != 0 || units != 0 {
		t.Fatalf("потолок выбран: coins=%d units=%d, ожидалось 0 и 0", coins, units)
	}

	// Неполная единица не оплачивается и остаётся ждать следующего абзаца.
	if coins, units := gardenPayout(9, reading, 0); coins != 0 || units != 0 {
		t.Fatalf("неполная единица: coins=%d units=%d, ожидалось 0 и 0", coins, units)
	}
	if coins, units := gardenPayout(25, reading, 0); coins != 2 || units != 20 {
		t.Fatalf("две единицы: coins=%d units=%d, ожидалось 2 и 20", coins, units)
	}

	// Откат назад — перечитанная книга, забытое слово — не отнимает динары.
	if coins, _ := gardenPayout(-40, reading, 0); coins != 0 {
		t.Fatalf("отрицательная дельта дала %d динаров", coins)
	}
}

func TestGardenPayoutRoundsToWholeUnits(t *testing.T) {
	// Пункт карты стоит 10 динаров, потолок 40, уже начислено 35: выплата
	// обязана округлиться вниз до целого пункта, а не выдать пять динаров за
	// половину пункта.
	roadmap := gardenSource{"roadmap", "Карта", 10, 1, 40}
	coins, units := gardenPayout(4, roadmap, 35)
	if coins != 0 || units != 0 {
		t.Fatalf("coins=%d units=%d, ожидалось 0 и 0", coins, units)
	}
	if coins, units := gardenPayout(4, roadmap, 20); coins != 20 || units != 2 {
		t.Fatalf("coins=%d units=%d, ожидалось 20 и 2", coins, units)
	}
}

func TestGardenSpeed(t *testing.T) {
	now := time.Date(2026, 8, 11, 12, 0, 0, 0, time.UTC)
	planted := now.Add(-2 * time.Hour)
	fresh := now.Add(-1 * time.Hour)
	stale := now.Add(-30 * time.Hour)

	if speed := gardenSpeed(0, planted, nil, now); speed != 1 {
		t.Fatalf("свежая посадка без активности: %v, ожидалась 1", speed)
	}
	if speed := gardenSpeed(1, planted, nil, now); speed != 2 {
		t.Fatalf("полная активность: %v, ожидалось 2", speed)
	}
	// Вода конечна, поэтому полив стоит дороже прежнего: он удваивает рост.
	if speed := gardenSpeed(0, planted, &fresh, now); speed != 2 {
		t.Fatalf("после полива: %v, ожидалось 2", speed)
	}
	// Без полива дольше суток рост замедляется вдвое, но цветок не гибнет.
	if speed := gardenSpeed(0, stale, nil, now); speed != 0.5 {
		t.Fatalf("засуха: %v, ожидалось 0.5", speed)
	}
	if speed := gardenSpeed(1, stale, &stale, now); speed != 1 {
		t.Fatalf("засуха при активности: %v, ожидалось 1", speed)
	}
}

func TestGardenWeatherIsSameForEveryoneAndStableWithinDay(t *testing.T) {
	morning := time.Date(2026, 8, 11, 6, 0, 0, 0, time.UTC)
	evening := time.Date(2026, 8, 11, 23, 0, 0, 0, time.UTC)
	if gardenWeather(morning) != gardenWeather(evening) {
		t.Fatal("погода поменялась в течение дня")
	}

	// Дождь обязан случаться, но не каждый день: иначе лейка теряет смысл.
	var rainy int
	for day := 0; day < 60; day++ {
		if gardenWeather(morning.AddDate(0, 0, day)) == GardenWeatherRain {
			rainy++
		}
	}
	if rainy == 0 || rainy > 30 {
		t.Fatalf("дождливых дней за два месяца: %d", rainy)
	}
}

func TestGardenDailyTaskIsAlwaysDoable(t *testing.T) {
	user := uuid.MustParse("11111111-2222-3333-4444-555555555555")

	// В пустом саду поливать и срезать нечего, остаются посадка и соседи.
	for day := 1; day <= 31; day++ {
		date := fmt.Sprintf("2026-08-%02d", day)
		switch task := gardenDailyTask(user, date, 0, 0, GardenSlots); task.Kind {
		case gardenTaskPlant, gardenTaskHelp:
		default:
			t.Fatalf("%s: невыполнимое задание %q для пустого сада", date, task.Kind)
		}
	}

	// В полном саду без цветущих остаются полив и соседи.
	for day := 1; day <= 31; day++ {
		date := fmt.Sprintf("2026-08-%02d", day)
		task := gardenDailyTask(user, date, GardenSlots, 0, 0)
		switch task.Kind {
		case gardenTaskWater, gardenTaskHelp:
		default:
			t.Fatalf("%s: невыполнимое задание %q для полного сада", date, task.Kind)
		}
		if task.Kind == gardenTaskWater && task.Target > gardenCanCapacity {
			t.Fatalf("%s: задание требует %d поливов, а в лейке %d",
				date, task.Target, gardenCanCapacity)
		}
	}

	// Задание дня не переигрывается между вызовами.
	first := gardenDailyTask(user, "2026-08-11", 3, 1, 2)
	if second := gardenDailyTask(user, "2026-08-11", 3, 1, 2); first != second {
		t.Fatalf("задание поменялось: %v против %v", first, second)
	}
}

func TestGardenActivityBonusIsCapped(t *testing.T) {
	if bonus := gardenActivityBonus(0); bonus != 0 {
		t.Fatalf("без заработка: %v", bonus)
	}
	if bonus := gardenActivityBonus(30); bonus != 0.5 {
		t.Fatalf("половина: %v", bonus)
	}
	// Открытая на ночь вкладка не должна давать больше, чем час занятий.
	if bonus := gardenActivityBonus(1000); bonus != 1 {
		t.Fatalf("сверх нормы: %v, ожидалось 1", bonus)
	}
}

func TestValidGardenNickname(t *testing.T) {
	for _, good := range []string{"vuk", "Читавук", "denis-2", "цвет_59"} {
		if !validGardenNickname(good) {
			t.Errorf("никнейм %q отклонён", good)
		}
	}
	for _, bad := range []string{"a", "", "имя с пробелом", "drop;table", "e" + string(make([]rune, 30))} {
		if validGardenNickname(bad) {
			t.Errorf("никнейм %q принят", bad)
		}
	}
}

func TestGardenCatalogIsConsistent(t *testing.T) {
	seen := map[string]bool{}
	for _, species := range GardenCatalog {
		if seen[species.ID] {
			t.Fatalf("повторяющийся вид: %s", species.ID)
		}
		seen[species.ID] = true
		if species.Price <= 0 || species.Serbian == "" || species.Topic == "" {
			t.Fatalf("неполный вид: %+v", species)
		}
	}
	if _, ok := GardenSpeciesByID("нет-такого"); ok {
		t.Fatal("несуществующий вид найден")
	}
	for _, decoration := range GardenDecorationCatalog {
		if decoration.ID == "" || decoration.Serbian == "" || decoration.Price <= 0 {
			t.Fatalf("неполное украшение: %+v", decoration)
		}
	}
	if _, ok := GardenDecorationByID("нет-такого"); ok {
		t.Fatal("несуществующее украшение найдено")
	}
}

func TestGardenDecorationPurchaseIsPersistentAndIdempotent(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	user, err := s.CreateUser(ctx, "garden-decor-"+uuid.NewString()+"@example.test", "", "Садовод", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, user.ID)
	})
	if _, err := s.Garden(ctx, user.ID); err != nil {
		t.Fatal(err)
	}
	decoration := GardenDecorationCatalog[0]
	if err := s.BuyGardenDecoration(ctx, user.ID, decoration.ID); err != nil {
		t.Fatalf("BuyGardenDecoration: %v", err)
	}
	if err := s.BuyGardenDecoration(ctx, user.ID, decoration.ID); err != nil {
		t.Fatalf("повторная покупка: %v", err)
	}
	state, err := s.Garden(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if state.Coins != gardenStartCoins-decoration.Price {
		t.Fatalf("после покупки: %d динаров", state.Coins)
	}
	if len(state.Decorations) != 1 || state.Decorations[0] != decoration.ID {
		t.Fatalf("украшения: %+v", state.Decorations)
	}
}

func TestGardenFlowOnMigratedDatabase(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	user, err := s.CreateUser(ctx, "garden-"+uuid.NewString()+"@example.test", "", "Садовод", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, user.ID)
	})

	state, err := s.Garden(ctx, user.ID)
	if err != nil {
		t.Fatalf("Garden: %v", err)
	}
	if state.Coins != gardenStartCoins {
		t.Fatalf("подарок при первом заходе: %d, ожидалось %d", state.Coins, gardenStartCoins)
	}
	if len(state.Earnings) != len(gardenSources) {
		t.Fatalf("источников в ответе: %d", len(state.Earnings))
	}
	// Задание дня выдаётся при первом заходе и может быть оплачено прямо этой
	// посадкой — тогда динаров окажется больше, чем осталось после покупки.
	task := state.Task
	if task == nil {
		t.Fatal("задание дня не выдано")
	}

	if err := s.PlantGarden(ctx, user.ID, 0, "suncokret"); err != nil {
		t.Fatalf("PlantGarden: %v", err)
	}
	if err := s.PlantGarden(ctx, user.ID, 0, "krasuljak"); err != ErrGardenSlotTaken {
		t.Fatalf("повторная посадка: %v, ожидалась ErrGardenSlotTaken", err)
	}
	if err := s.PlantGarden(ctx, user.ID, 99, "suncokret"); err != ErrGardenBadSlot {
		t.Fatalf("несуществующая грядка: %v", err)
	}

	state, err = s.Garden(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	expected := int64(gardenStartCoins - 20)
	if task.Kind == gardenTaskPlant && task.Target == 1 {
		expected += gardenTaskReward
	}
	if state.Coins != expected {
		t.Fatalf("после покупки семени: %d динаров, ожидалось %d", state.Coins, expected)
	}
	if len(state.Plants) != 1 || state.Plants[0].Species != "suncokret" {
		t.Fatalf("грядки: %+v", state.Plants)
	}

	// Дорогое семя не по карману: списание и посадка должны откатиться вместе.
	if err := s.PlantGarden(ctx, user.ID, 1, "cuvarkuca"); err != ErrGardenNoCoins {
		t.Fatalf("покупка не по карману: %v", err)
	}
	state, err = s.Garden(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if state.Coins != expected || len(state.Plants) != 1 {
		t.Fatalf("неудачная покупка изменила сад: %d динаров, %d грядок",
			state.Coins, len(state.Plants))
	}
}

func TestGardenPublicOnlyByConsent(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	user, err := s.CreateUser(ctx, "garden-pub-"+uuid.NewString()+"@example.test", "", "Садовод", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, user.ID)
	})
	if _, err := s.Garden(ctx, user.ID); err != nil {
		t.Fatal(err)
	}

	nickname := "vrt" + uuid.NewString()[:8]
	if err := s.SetGardenProfile(ctx, user.ID, nickname, false); err != nil {
		t.Fatalf("SetGardenProfile: %v", err)
	}
	// Имя есть, согласия нет — сад по ссылке не отдаётся.
	if _, err := s.PublicGardenByNickname(ctx, nickname, uuid.Nil, time.Now().UTC()); err != ErrGardenNotFound {
		t.Fatalf("закрытый сад отдан: %v", err)
	}
	// Публичный сад без имени невозможен.
	if err := s.SetGardenProfile(ctx, user.ID, "", true); err != ErrGardenNickBad {
		t.Fatalf("публичный сад без имени: %v", err)
	}

	if err := s.SetGardenProfile(ctx, user.ID, nickname, true); err != nil {
		t.Fatal(err)
	}
	garden, err := s.PublicGardenByNickname(ctx, nickname, uuid.Nil, time.Now().UTC())
	if err != nil {
		t.Fatalf("PublicGardenByNickname: %v", err)
	}
	if garden.Nickname != nickname {
		t.Fatalf("имя сада: %q", garden.Nickname)
	}
	if garden.CanWater {
		t.Fatal("гостю без входа предложен полив")
	}
}

func TestSearchGardenersFindsByNameAndCrop(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	user, err := s.CreateUser(ctx, "garden-find-"+uuid.NewString()+"@example.test", "", "Садовод", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, user.ID)
	})
	if _, err := s.Garden(ctx, user.ID); err != nil {
		t.Fatal(err)
	}
	nickname := "Cvetko" + uuid.NewString()[:6]
	if err := s.SetGardenProfile(ctx, user.ID, nickname, true); err != nil {
		t.Fatal(err)
	}
	if err := s.PlantGarden(ctx, user.ID, 0, "suncokret"); err != nil {
		t.Fatal(err)
	}

	has := func(rows []GardenBoardRow) bool {
		for _, row := range rows {
			if row.Nickname == nickname {
				return true
			}
		}
		return false
	}

	// Кусок имени, а не точное совпадение: адрес сада знать необязательно.
	found, err := s.SearchGardeners(ctx, nickname[2:8], "", 30)
	if err != nil {
		t.Fatalf("SearchGardeners: %v", err)
	}
	if !has(found) {
		t.Fatal("садовод не найден по части имени")
	}

	// Поиск по тому, что растёт.
	found, err = s.SearchGardeners(ctx, "", "suncokret", 30)
	if err != nil {
		t.Fatal(err)
	}
	if !has(found) {
		t.Fatal("садовод не найден по посаженному виду")
	}
	for _, row := range found {
		if row.Nickname == nickname && len(row.Growing) == 0 {
			t.Fatal("не сказано, что растёт в найденном саду")
		}
	}

	found, err = s.SearchGardeners(ctx, "", "krasuljak", 30)
	if err != nil {
		t.Fatal(err)
	}
	if has(found) {
		t.Fatal("садовод найден по виду, которого у него нет")
	}

	// Закрытый сад из поиска пропадает.
	if err := s.SetGardenProfile(ctx, user.ID, nickname, false); err != nil {
		t.Fatal(err)
	}
	found, err = s.SearchGardeners(ctx, nickname, "", 30)
	if err != nil {
		t.Fatal(err)
	}
	if has(found) {
		t.Fatal("закрытый сад отдан поиском")
	}

	if _, err := s.SearchGardeners(ctx, "", "нет-такого-вида", 30); err != ErrGardenBadSpecies {
		t.Fatalf("несуществующий вид: %v", err)
	}
}

// Полив без воды не проходит, вода без занятий не наливается, а срезанный
// цветок освобождает грядку и остаётся в гербарии.
func TestGardenWateringSpendsWaterFromRiver(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	user, err := s.CreateUser(ctx, "garden-water-"+uuid.NewString()+"@example.test", "", "Садовод", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, user.ID)
	})

	now := time.Now().UTC()
	if _, err := s.Garden(ctx, user.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.PlantGarden(ctx, user.ID, 0, "suncokret"); err != nil {
		t.Fatal(err)
	}

	// Лейка новичка полная: без неё первый полив был бы недоступен до первого
	// же занятия, а сад открывают раньше.
	state, err := s.Garden(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if state.Water != gardenCanCapacity {
		t.Fatalf("вода при первом заходе: %d, ожидалось %d", state.Water, gardenCanCapacity)
	}

	for i := 0; i < gardenCanCapacity; i++ {
		if err := s.WaterGarden(ctx, user.ID, 0, now); err != nil {
			t.Fatalf("полив %d: %v", i+1, err)
		}
	}
	if err := s.WaterGarden(ctx, user.ID, 0, now); err != ErrGardenNoWater {
		t.Fatalf("полив пустой лейкой: %v, ожидалась ErrGardenNoWater", err)
	}

	// Река течёт только в тот день, когда что-то заработано.
	if _, err := s.FillGardenCan(ctx, user.ID, now); err != ErrGardenRiverDry {
		t.Fatalf("набор воды без занятий: %v, ожидалась ErrGardenRiverDry", err)
	}
	if _, err := s.Pool.Exec(ctx, `
		INSERT INTO garden_earnings (user_id, day, source, coins) VALUES ($1,$2,'reviews',5)
		ON CONFLICT (user_id, day, source) DO UPDATE SET coins=EXCLUDED.coins`,
		user.ID, now.Format("2006-01-02")); err != nil {
		t.Fatal(err)
	}
	for i := 1; i <= gardenFillsPerDay; i++ {
		water, err := s.FillGardenCan(ctx, user.ID, now)
		if err != nil {
			t.Fatalf("набор %d: %v", i, err)
		}
		if water != i {
			t.Fatalf("после набора %d в лейке %d", i, water)
		}
	}
	if _, err := s.FillGardenCan(ctx, user.ID, now); err != ErrGardenFillLimit {
		t.Fatalf("четвёртый набор за день: %v, ожидалась ErrGardenFillLimit", err)
	}
}

func TestGardenCutMovesFlowerToHerbarium(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	user, err := s.CreateUser(ctx, "garden-cut-"+uuid.NewString()+"@example.test", "", "Садовод", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, user.ID)
	})

	now := time.Now().UTC()
	if _, err := s.Garden(ctx, user.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.PlantGarden(ctx, user.ID, 0, "suncokret"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CutGardenFlower(ctx, user.ID, 0, now); err != ErrGardenNotBlooming {
		t.Fatal("срезали нераспустившийся цветок")
	}

	if _, err := s.Pool.Exec(ctx, `
		UPDATE garden_plantings SET growth=$2 WHERE user_id=$1 AND slot=0`,
		user.ID, GardenStages); err != nil {
		t.Fatal(err)
	}
	before, err := s.Garden(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	cut, err := s.CutGardenFlower(ctx, user.ID, 0, now)
	if err != nil {
		t.Fatalf("CutGardenFlower: %v", err)
	}
	if !cut.First || cut.Coins <= 0 {
		t.Fatalf("первый срез: %+v", cut)
	}

	after, err := s.Garden(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(after.Plants) != 0 {
		t.Fatalf("грядка не освободилась: %+v", after.Plants)
	}
	if len(after.Herbarium) != 1 || after.Herbarium[0].Count != 1 {
		t.Fatalf("гербарий: %+v", after.Herbarium)
	}
	// Собранный цветок продолжает считаться распустившимся: иначе срез
	// откатывал бы таблицу назад и срезать становилось бы невыгодно.
	if after.Bloomed != before.Bloomed {
		t.Fatalf("процветало до среза %d, после %d", before.Bloomed, after.Bloomed)
	}
	if after.Coins <= before.Coins {
		t.Fatalf("срез не оплачен: было %d, стало %d", before.Coins, after.Coins)
	}
}
