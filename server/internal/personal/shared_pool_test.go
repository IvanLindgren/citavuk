package personal

import "testing"

func TestBuildSharedLesson(t *testing.T) {
	words := []SharedWord{
		{"porodica", "семья", "Naša *porodica* živi u Beogradu.", "Наша семья живёт в Белграде."},
		{"majka", "мать", "*Majka* kuva ručak.", "Мать готовит обед."},
		{"otac", "отец", "Moj *otac* radi.", "Мой отец работает."},
		{"sin", "сын", "Njihov *sin* ide u školu.", "Их сын ходит в школу."},
		{"ćerka", "дочь", "Moja *ćerka* čita.", "Моя дочь читает."},
		{"brat", "брат", "Moj *brat* uči.", "Мой брат учится."},
	}
	for _, kind := range []string{"vocabulary", "reading", "writing"} {
		lesson, err := BuildSharedLesson("A1", "Семья", kind, words)
		if err != nil {
			t.Fatalf("%s: %v", kind, err)
		}
		if len(lesson.Exercises) != 6 || len(lesson.Scheme.Rows) != len(words) {
			t.Fatalf("%s: неполный урок: %+v", kind, lesson)
		}
		if kind == "writing" {
			if lesson.Exercises[0].Kind != "fill" || lesson.Exercises[0].Answer != "porodica" ||
				lesson.Exercises[2].Kind != "translate" {
				t.Fatalf("%s: письменные задания не собраны", kind)
			}
		} else if lesson.Exercises[0].Answer != "семья" || lesson.Exercises[0].Options[0] != "семья" {
			t.Fatalf("%s: ответ не совпал с вариантом", kind)
		}
		if lesson.Text == "" || lesson.Kind != kind {
			t.Fatalf("%s: материал не сохранён", kind)
		}
		short, err := AdaptSharedLesson(lesson, Profile{Answers: map[string]string{
			"minutes": "5 минут", "script": "Кириллица",
		}}, 1)
		if err != nil || len(short.Exercises) != 4 || short.Scheme.Rows[0][0] != "породица" {
			t.Fatalf("%s: короткая кириллическая карта: %+v %v", kind, short, err)
		}
		long, err := AdaptSharedLesson(lesson, Profile{Answers: map[string]string{
			"minutes": "20 минут", "script": "Латиница",
		}}, 1)
		if err != nil || len(long.Exercises) != 6 || long.Scheme.Rows[0][0] != "porodica" {
			t.Fatalf("%s: длинная латинская карта: %+v %v", kind, long, err)
		}
	}
}
