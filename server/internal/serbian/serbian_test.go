package serbian

import "testing"

func TestAcceptsSerbian(t *testing.T) {
	ok := []string{
		"Ovo je jako lepa priča, mislim da je najbolja glava u knjizi.",
		"Zdravo svima! Da li ste razumeli ovu stranu?",
		"Ова страна ми је била тешка, али сам разумео.",
		// С ошибками — так и пишет тот, кто учит язык.
		"Ja ne razumem ovo rec, ali knjiga je dobra",
		// Короткое, зато с сербскими буквами.
		"Baš lepo",
	}
	for _, text := range ok {
		if verdict := Check(text); !verdict.OK {
			t.Errorf("сербский текст отклонён: %q — %s", text, verdict.Reason)
		}
	}
}

func TestRejectsRussian(t *testing.T) {
	bad := []string{
		"Это очень интересная книга, мне понравилось.",
		"Что здесь написано? Я не понял эту страницу.",
		// Русский латиницей — чужих букв нет, ловится по словам.
		"Eto ochen interesnaya kniga, spasibo",
	}
	for _, text := range bad {
		if verdict := Check(text); verdict.OK {
			t.Errorf("русский текст пропущен: %q", text)
		}
	}
}

func TestRejectsEnglish(t *testing.T) {
	bad := []string{
		"This is a very interesting book, thanks for sharing.",
		"What does this page mean? I could not understand the chapter.",
	}
	for _, text := range bad {
		if verdict := Check(text); verdict.OK {
			t.Errorf("английский текст пропущен: %q", text)
		}
	}
}

func TestRejectsEmptyAndTooShort(t *testing.T) {
	if Check("   ").OK {
		t.Error("пустое сообщение должно отклоняться")
	}
	if Check("123 456").OK {
		t.Error("сообщение без слов должно отклоняться")
	}
	if Check("ok").OK {
		t.Error("двух слов без сербских признаков недостаточно")
	}
}

func TestReasonIsAlwaysExplained(t *testing.T) {
	// Человеку нужно понять, что исправить: отказ без причины бесполезен.
	for _, text := range []string{"", "hello there my friend", "привет как дела"} {
		verdict := Check(text)
		if !verdict.OK && verdict.Reason == "" {
			t.Errorf("отказ без объяснения для %q", text)
		}
	}
}
