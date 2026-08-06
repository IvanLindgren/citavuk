package translate

import (
	"sync"
	"time"
)

// Суточный бюджет знаков DeepL.
//
// Ограничение частоты считает ЗАПРОСЫ, а провайдер берёт деньги за ЗНАКИ, и
// разница здесь не академическая. Общий safety bucket пропускает 60 переводов
// в минуту, длина одного фрагмента — MaxTextRunes, то есть 60 000 знаков в
// минуту. Месячная квота free-плана — 500 000 знаков, и она выносилась за
// девять минут: никакого счётчика знаков на пути к DeepL не было вовсе.
//
// Бюджет — обычное «дырявое ведро», но по знакам и с суточным пополнением.
// Ёмкость равна суточной норме, поэтому нормальный всплеск (человек читает
// вечер подряд) проходит целиком, а исчерпать можно не больше суточной доли.
// Худшее, чего добьётся атакующий, — сутки на запасном провайдере вместо
// месяца без перевода вообще.
//
// Пустой (nil) бюджет разрешает всё: сервер без DeepL-ключа или тест не должны
// зависеть от этой механики.
type Budget struct {
	mu     sync.Mutex
	perDay float64
	tokens float64
	last   time.Time
	now    func() time.Time
}

// DefaultRunesPerDay — суточная доля месячной квоты free-плана. Делим на 31,
// а не на 30: в короткий месяц лучше недобрать, чем упереться в квоту за день
// до её обновления.
const DefaultRunesPerDay = 500_000 / 31

// NewBudget создаёт бюджет. Значение <= 0 выключает ограничение.
func NewBudget(perDay int) *Budget {
	if perDay <= 0 {
		return nil
	}
	return &Budget{
		perDay: float64(perDay),
		tokens: float64(perDay),
		now:    time.Now,
	}
}

func (b *Budget) refill() {
	now := b.now()
	if b.last.IsZero() {
		b.last = now
		return
	}
	b.tokens += now.Sub(b.last).Seconds() * b.perDay / 86400
	if b.tokens > b.perDay {
		b.tokens = b.perDay
	}
	b.last = now
}

// Allow списывает n знаков, если они есть. Отказ означает «переводи запасным»,
// а не «ошибка»: перевод обязан продолжать работать.
func (b *Budget) Allow(n int) bool {
	if b == nil || n <= 0 {
		return true
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.refill()
	if b.tokens < float64(n) {
		return false
	}
	b.tokens -= float64(n)
	return true
}

// Spend списывает знаки безусловно, позволяя уйти в минус.
//
// Нужен там, где провайдера сменить уже нельзя. Перевод книги выбирает
// переводчика ОДИН раз (переводчики по-разному передают имена, и смена посреди
// книги видна невооружённым глазом), поэтому начатый документ дочитывается тем
// же DeepL. Уход в минус честнее, чем незаметный перерасход: следующий читатель
// увидит пустой бюджет и уйдёт на запасного.
func (b *Budget) Spend(n int) {
	if b == nil || n <= 0 {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.refill()
	b.tokens -= float64(n)
}

// Refund возвращает знаки, списанные авансом под запрос, который не состоялся.
// Без возврата отказ провайдера стоил бы бюджета дважды: сначала списанием,
// потом повтором.
func (b *Budget) Refund(n int) {
	if b == nil || n <= 0 {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.refill()
	b.tokens += float64(n)
	if b.tokens > b.perDay {
		b.tokens = b.perDay
	}
}

// Available сообщает остаток. Отрицательный остаток отдаётся нулём: наружу
// важно только «есть или нет».
func (b *Budget) Available() int {
	if b == nil {
		return 0
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.refill()
	if b.tokens < 0 {
		return 0
	}
	return int(b.tokens)
}

// PerDay возвращает суточную норму — она нужна отчёту в админке.
func (b *Budget) PerDay() int {
	if b == nil {
		return 0
	}
	return int(b.perDay)
}
