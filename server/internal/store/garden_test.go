package store

import (
	"context"
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
	if speed := gardenSpeed(0, planted, &fresh, now); speed != 1.5 {
		t.Fatalf("после полива: %v, ожидалось 1.5", speed)
	}
	// Без полива дольше суток рост замедляется вдвое, но цветок не гибнет.
	if speed := gardenSpeed(0, stale, nil, now); speed != 0.5 {
		t.Fatalf("засуха: %v, ожидалось 0.5", speed)
	}
	if speed := gardenSpeed(1, stale, &stale, now); speed != 1 {
		t.Fatalf("засуха при активности: %v, ожидалось 1", speed)
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
	if state.Coins != gardenStartCoins-20 {
		t.Fatalf("после покупки семени: %d динаров", state.Coins)
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
	if state.Coins != gardenStartCoins-20 || len(state.Plants) != 1 {
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
