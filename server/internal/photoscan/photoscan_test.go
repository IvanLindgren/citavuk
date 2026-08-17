package photoscan

import (
	"errors"
	"testing"
)

func TestParagraphs(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{
			name: "пустые строки делят на абзацы",
			in:   `{"empty":false,"text":"Прво.\n\nДруго."}`,
			want: []string{"Прво.", "Друго."},
		},
		{
			// Перенос на вывеске — это перенос строки, а не новая мысль.
			name: "одиночный перенос остаётся внутри абзаца",
			in:   `{"empty":false,"text":"RADNO VREME\n08–20"}`,
			want: []string{"RADNO VREME\n08–20"},
		},
		{
			name: "лишние пустые строки и пробелы не дают пустых абзацев",
			in:   "{\"empty\":false,\"text\":\"  Прво.  \\n\\n\\n\\n   \\n\\n Друго. \"}",
			want: []string{"Прво.", "Друго."},
		},
		{
			// Модели любят обрамлять ответ ```json и пояснением.
			name: "JSON достаётся из обрамления",
			in:   "Evo teksta:\n```json\n{\"empty\":false,\"text\":\"Kuća\"}\n```",
			want: []string{"Kuća"},
		},
		{
			name: "перенос строки Windows не плодит пустые строки",
			in:   `{"empty":false,"text":"Прво.\r\n\r\nДруго."}`,
			want: []string{"Прво.", "Друго."},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := Paragraphs(c.in)
			if err != nil {
				t.Fatalf("не ожидали ошибки: %v", err)
			}
			if len(got) != len(c.want) {
				t.Fatalf("абзацев %d, ждали %d: %q", len(got), len(c.want), got)
			}
			for i := range got {
				if got[i] != c.want[i] {
					t.Errorf("абзац %d: %q, ждали %q", i, got[i], c.want[i])
				}
			}
		})
	}
}

func TestParagraphsNoText(t *testing.T) {
	// Снимок стены без текста — обычное дело, и это не поломка.
	for _, in := range []string{
		`{"empty":true}`,
		`{"empty":false,"text":"   \n\n  "}`,
	} {
		if _, err := Paragraphs(in); !errors.Is(err, ErrNoText) {
			t.Errorf("на %q ждали ErrNoText, получили %v", in, err)
		}
	}
}

func TestParagraphsBroken(t *testing.T) {
	for _, in := range []string{"", "совсем не json"} {
		if _, err := Paragraphs(in); err == nil {
			t.Errorf("на %q ждали ошибку", in)
		}
	}
}

func TestImageMime(t *testing.T) {
	cases := map[string]string{
		"image/png":  "image/png",
		"image/webp": "image/webp",
		"IMAGE/HEIC": "image/heic",
		// Такого типа нет, но телефоны и браузеры его присылают.
		"image/jpg": "image/jpeg",
		"":          "image/jpeg",
	}
	for in, want := range cases {
		if got := imageMime(in); got != want {
			t.Errorf("imageMime(%q) = %q, ждали %q", in, got, want)
		}
	}
}

func TestDisabledScanner(t *testing.T) {
	// Пустой ключ просто выключает раздел, а не роняет сервер.
	if New("", "model", "url").Enabled() {
		t.Error("без ключа распознавание должно быть выключено")
	}
	if !New("k", "m", "u").Enabled() {
		t.Error("с ключом, моделью и адресом должно быть включено")
	}
}
