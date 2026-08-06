package store

import (
	"context"
	"testing"
)

// Запрос диалогов разбирает JSON урока прямо в SQL (jsonb_array_length по
// content->'dialogue'->'nodes'). Ошибку в таком выражении компилятор не ловит:
// она вылезет только на живой базе и только когда кто-то откроет страницу
// диалогов. Тест ходит в базу и ничего не создаёт — ему достаточно, что запрос
// выполняется и возвращает связный ответ.
func TestListPublicDialoguesRuns(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}

	items, err := s.ListPublicDialogues(ctx, 10)
	if err != nil {
		t.Fatalf("запрос диалогов не выполнился: %v", err)
	}
	if len(items) > 10 {
		t.Errorf("предел не соблюдён: %d записей", len(items))
	}
	for _, item := range items {
		// Урок без реплик в список попадать не должен: карточка «0 реплик»
		// обещает диалог, которого нет.
		if item.Lines <= 0 {
			t.Errorf("урок %q попал в диалоги без реплик", item.Slug)
		}
		if item.Slug == "" {
			t.Error("диалог без адреса урока — по нему некуда перейти")
		}
	}
}
