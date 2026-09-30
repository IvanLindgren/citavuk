package aioutput

import "testing"

func TestScreenshotResponsesAreRejected(t *testing.T) {
	for _, text := range []string{"source", "两种译文均正确且自然", "Машинный перевод лучше. 用户完全错误"} {
		if Russian(text) {
			t.Fatalf("принят нерусский ответ: %s", text)
		}
	}
	if !Russian("Оба варианта точно передают смысл фразы Nosim torbu u levoj ruci.") {
		t.Fatal("отклонён русский разбор с цитатой")
	}
	if Translation("source", "izvora", "ru") {
		t.Fatal("английский перевод принят")
	}
	if !Translation("источника", "izvora", "ru") {
		t.Fatal("русский перевод отклонён")
	}
	if !Translation("USB", "USB", "ru") {
		t.Fatal("аббревиатура отклонена")
	}
}
