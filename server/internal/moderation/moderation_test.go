package moderation

import "testing"

func TestClean(t *testing.T) {
	blocked := []string{
		"ну ты и мудак",
		"Хуёвый перевод",
		"jebem ti sve",
		"Јебо те",
		"what the FUCK",
		"пиздец, а не книга",
	}
	for _, text := range blocked {
		if Clean(text) {
			t.Errorf("пропущено: %q", text)
		}
	}

	fine := []string{
		"Как правильно употреблять падежи?",
		"Hvala, odlična knjiga!",
		"I pick the second answer",
		"Ребята, подскажите про аорист",
		"Корабль, пароход, курица",
		"Što je ovo?",
		"",
	}
	for _, text := range fine {
		if !Clean(text) {
			t.Errorf("заблокировано зря: %q", text)
		}
	}
}
