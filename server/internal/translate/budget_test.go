package translate

import (
	"context"
	"strings"
	"testing"
	"time"
)

func newTestBudget(perDay int, clock *time.Time) *Budget {
	b := NewBudget(perDay)
	b.now = func() time.Time { return *clock }
	return b
}

func TestBudgetSpendsAndRefills(t *testing.T) {
	clock := time.Unix(1_700_000_000, 0)
	b := newTestBudget(1000, &clock)

	if !b.Allow(600) {
		t.Fatal("первое списание должно пройти")
	}
	if b.Allow(600) {
		t.Fatal("второе списание превысило суточную норму, но прошло")
	}
	if got := b.Available(); got != 400 {
		t.Fatalf("остаток %d, ожидалось 400", got)
	}

	// Половина суток — половина суточной нормы.
	clock = clock.Add(12 * time.Hour)
	if got := b.Available(); got != 900 {
		t.Fatalf("после пополнения остаток %d, ожидалось 900", got)
	}

	// Пополнение не может превысить ёмкость: иначе за неделю простоя
	// накопился бы недельный запас и вся защита теряла бы смысл.
	clock = clock.Add(7 * 24 * time.Hour)
	if got := b.Available(); got != 1000 {
		t.Fatalf("остаток %d вырос выше суточной нормы", got)
	}
}

func TestBudgetRefundReturnsUnusedRunes(t *testing.T) {
	clock := time.Unix(1_700_000_000, 0)
	b := newTestBudget(1000, &clock)

	b.Allow(1000)
	if b.Allow(1) {
		t.Fatal("бюджет исчерпан, но списание прошло")
	}
	b.Refund(1000)
	if !b.Allow(1000) {
		t.Fatal("возврат не вернул знаки")
	}
}

// Начатый документ дочитывается тем же провайдером, поэтому списание уходит в
// минус, а не отказывает. Иначе книга оборвалась бы на половине.
func TestBudgetSpendGoesNegative(t *testing.T) {
	clock := time.Unix(1_700_000_000, 0)
	b := newTestBudget(1000, &clock)

	b.Spend(5000)
	if got := b.Available(); got != 0 {
		t.Fatalf("остаток %d, наружу отрицательный бюджет отдавать нельзя", got)
	}
	if b.Allow(1) {
		t.Fatal("перерасход должен закрывать бюджет для новых запросов")
	}
	// Долг гасится пополнением, а не обнуляется.
	clock = clock.Add(24 * time.Hour)
	if got := b.Available(); got != 0 {
		t.Fatalf("сутки не должны покрыть долг в пять суточных норм: остаток %d", got)
	}
}

func TestNilBudgetAllowsEverything(t *testing.T) {
	var b *Budget
	if !b.Allow(1_000_000) {
		t.Fatal("выключенный бюджет обязан пропускать всё")
	}
	b.Spend(1)
	b.Refund(1)
	if got := b.Available(); got != 0 {
		t.Fatalf("остаток выключенного бюджета %d", got)
	}
}

func TestNewBudgetDisabledByZero(t *testing.T) {
	if NewBudget(0) != nil || NewBudget(-5) != nil {
		t.Fatal("ноль и отрицательное значение обязаны выключать бюджет")
	}
}

// Главный сценарий: квота кончилась, но перевод продолжает работать.
func TestInContextFallsBackWhenBudgetIsSpent(t *testing.T) {
	clock := time.Unix(1_700_000_000, 0)
	fake := newFake()
	service := NewService(NewDeepL("test-key:fx"), fake, nil).
		WithBudget(newTestBudget(1, &clock))

	// Единственного знака не хватит на помеченное предложение, поэтому DeepL
	// не вызывается вовсе — сетевого запроса в тесте и не будет.
	sentence := "Ovo je velika kuća."
	start := strings.Index(sentence, "kuća")
	res, err := service.InContext(
		context.Background(), sentence, start, start+len("kuća"), "sr", "ru")
	if err != nil {
		t.Fatalf("перевод при исчерпанном бюджете не удался: %v", err)
	}
	if res.Provider != fake.Name() {
		t.Fatalf("провайдер %q, ожидался запасной %q", res.Provider, fake.Name())
	}
	if res.Aligned {
		t.Fatal("перевод без DeepL не может быть выровненным")
	}
}

// Без запасного провайдера бюджет не спрашивается: отказ означал бы «перевода
// нет вовсе», а это хуже перерасхода.
func TestDocumentProviderIgnoresBudgetWithoutFallback(t *testing.T) {
	clock := time.Unix(1_700_000_000, 0)
	onlyDeepL := NewService(NewDeepL("test-key:fx"), nil, nil).
		WithBudget(newTestBudget(1, &clock))
	if got := onlyDeepL.PickProvider(10_000); got != ProviderDeepL {
		t.Fatalf("провайдер %q, ожидался %q", got, ProviderDeepL)
	}
}

// А с запасным — короткий документ уходит ему, когда бюджета не хватает.
func TestDocumentProviderFallsBackWhenBudgetIsShort(t *testing.T) {
	clock := time.Unix(1_700_000_000, 0)
	service := NewService(NewDeepL("test-key:fx"), newFake(), nil).
		WithBudget(newTestBudget(5_000, &clock))

	if got := service.PickProvider(1_000); got != ProviderDeepL {
		t.Fatalf("маленький документ: провайдер %q, ожидался %q", got, ProviderDeepL)
	}
	// 10 000 знаков всё ещё «короткий документ» по DeepLDocumentRunes, но
	// суточного бюджета на него не хватает.
	if got := service.PickProvider(10_000); got != ProviderGoogle {
		t.Fatalf("документ больше бюджета: провайдер %q, ожидался %q", got, ProviderGoogle)
	}
}
