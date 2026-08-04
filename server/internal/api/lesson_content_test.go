package api

import (
	"encoding/json"
	"strings"
	"testing"
)

// Содержимое урока приходит от преподавателя и показывается ученикам, поэтому
// проверяется на сервере, а не только в редакторе: редактор можно обойти.

func theory(text string) string {
	return `"theory":[{"type":"paragraph","text":"` + text + `"}]`
}

func normalize(t *testing.T, body string) (map[string]any, error) {
	t.Helper()
	out, err := normalizeLessonContent(json.RawMessage("{" + body + "}"))
	if err != nil {
		return nil, err
	}
	var parsed map[string]any
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("результат не разбирается: %v", err)
	}
	return parsed, nil
}

func TestExerciseImageMustBeHTTPS(t *testing.T) {
	cases := map[string]bool{
		"https://example.org/a.png": true,
		"http://example.org/a.png":  false,
		"javascript:alert(1)":       false,
		"//example.org/a.png":       false,
		"":                          true, // картинка необязательна
	}
	for link, valid := range cases {
		body := theory("текст") + `,"exercises":[{"type":"image_description","imageUrl":"` + link + `"}]`
		_, err := normalize(t, body)
		if valid && err != nil {
			t.Errorf("%q: отклонена корректная ссылка (%v)", link, err)
		}
		if !valid && err == nil {
			t.Errorf("%q: принята небезопасная ссылка", link)
		}
	}
}

func TestLessonCoverMustBeHTTPS(t *testing.T) {
	req := lessonRequest{
		Title: "Урок", Summary: "", CoverURL: "javascript:alert(1)",
		Level: "A1", LessonType: "lexicon", Topic: "слова",
		EstimatedMinutes: 10, Script: "both",
		Content: json.RawMessage(`{"theory":[{"type":"paragraph","text":"текст"}]}`),
	}
	if err := validateLessonRequest(&req); err == nil || !strings.Contains(err.Error(), "обложка") {
		t.Fatalf("небезопасная обложка принята: %v", err)
	}
	req.CoverURL = "https://cdn.example/lesson.webp"
	if err := validateLessonRequest(&req); err != nil {
		t.Fatalf("корректная обложка отклонена: %v", err)
	}
}

func TestDialogueStartMustExist(t *testing.T) {
	// Висячий startId раньше проходил проверку, и ученик видел пустой экран:
	// плееру было неоткуда начать диалог.
	body := theory("текст") + `,"dialogue":{"startId":"нет-такой","nodes":[{"id":"a","text":"привет"}]}`
	if _, err := normalize(t, body); err == nil {
		t.Fatal("принят диалог с несуществующей начальной репликой")
	}

	body = theory("текст") + `,"dialogue":{"startId":"a","nodes":[{"id":"a","text":"привет"}]}`
	if _, err := normalize(t, body); err != nil {
		t.Fatalf("отклонён корректный диалог: %v", err)
	}
}

func TestDialogueRejectsEmptyAndBrokenNodes(t *testing.T) {
	cases := map[string]string{
		"пустой список реплик":  `{"startId":"a","nodes":[]}`,
		"реплика без id":        `{"startId":"a","nodes":[{"text":"привет"}]}`,
		"повторяющиеся id":      `{"startId":"a","nodes":[{"id":"a"},{"id":"a"}]}`,
		"нет начальной реплики": `{"nodes":[{"id":"a"}]}`,
	}
	for name, dialogue := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := normalize(t, theory("текст")+`,"dialogue":`+dialogue); err == nil {
				t.Error("повреждённый диалог принят")
			}
		})
	}
}

func TestDialogueDropsDanglingChoice(t *testing.T) {
	// Ссылка на удалённую реплику заводит ученика в тупик — обнуляем её,
	// превращая в законный конец ветки, а не отклоняем урок целиком.
	body := theory("текст") + `,"dialogue":{"startId":"a","nodes":[
        {"id":"a","choices":[{"label":"да","nextId":"b"},{"label":"нет","nextId":"удалена"}]},
        {"id":"b"}]}`
	parsed, err := normalize(t, body)
	if err != nil {
		t.Fatalf("корректный диалог отклонён: %v", err)
	}

	dialogue := parsed["dialogue"].(map[string]any)
	nodes := dialogue["nodes"].([]any)
	choices := nodes[0].(map[string]any)["choices"].([]any)
	if got := choices[0].(map[string]any)["nextId"]; got != "b" {
		t.Errorf("живой переход изменён: %v", got)
	}
	if got := choices[1].(map[string]any)["nextId"]; got != "" {
		t.Errorf("переход на удалённую реплику сохранён: %v", got)
	}
}

func TestTheoryImageAndVideoStillChecked(t *testing.T) {
	// Проверки теории существовали раньше — правки упражнений не должны были
	// их задеть.
	if _, err := normalize(t, `"theory":[{"type":"image","url":"http://example.org/a.png"}]`); err == nil {
		t.Error("принята картинка теории по http")
	}
	if _, err := normalize(t, `"theory":[{"type":"video","url":"https://example.org/watch?v=abc"}]`); err == nil {
		t.Error("принято видео с неподдерживаемой площадки")
	}
	parsed, err := normalize(t, `"theory":[{"type":"video","url":"https://youtu.be/abcdefg"}]`)
	if err != nil {
		t.Fatalf("отклонено видео YouTube: %v", err)
	}
	block := parsed["theory"].([]any)[0].(map[string]any)
	if embed, _ := block["embedUrl"].(string); !strings.HasPrefix(embed, "https://www.youtube-nocookie.com/embed/") {
		t.Errorf("ссылка для встраивания не подставлена: %v", block["embedUrl"])
	}
}
