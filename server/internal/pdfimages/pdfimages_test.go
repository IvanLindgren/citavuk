package pdfimages

import (
	"bytes"
	"context"
	"os"
	"testing"
)

// В testdata/illustrated.pdf пять страниц: на первой и четвёртой иллюстрация
// посреди текста и мелкий значок, на всех — логотип в углу, третья почти
// пустая. Достаться должны ровно две иллюстрации.
func TestExtractKeepsIllustrationsOnly(t *testing.T) {
	data, err := os.ReadFile("testdata/illustrated.pdf")
	if err != nil {
		t.Fatal(err)
	}
	images, pages, err := Extract(context.Background(), bytes.NewReader(data), DefaultLimits)
	if err != nil {
		t.Fatal(err)
	}
	if pages != 5 {
		t.Fatalf("страниц %d, ждали 5", pages)
	}
	if len(images) != 2 {
		t.Fatalf("ждали 2 иллюстрации, получили %d: %+v", len(images), images)
	}
	for i, page := range []int{1, 4} {
		img := images[i]
		if img.Page != page {
			t.Errorf("картинка %d на странице %d, ждали %d", i, img.Page, page)
		}
		// Рамка 340..576 сверху: середина около 458.
		if img.CenterY < 440 || img.CenterY > 475 {
			t.Errorf("середина картинки на %.0f, ждали около 458", img.CenterY)
		}
		if img.MimeType != "image/jpeg" || len(img.Data) == 0 {
			t.Errorf("картинка %d: %s, %d байт", i, img.MimeType, len(img.Data))
		}
	}
}

func TestExtractRejectsGarbage(t *testing.T) {
	if _, _, err := Extract(context.Background(), bytes.NewReader([]byte("%PDF-1.7 мусор")), DefaultLimits); err == nil {
		t.Fatal("мусор разобрался как PDF")
	}
}

func TestLexerSkipsStringsWithParens(t *testing.T) {
	l := lexer{src: []byte(`q (a (b) \) c) Tj [(x) 1 (y)] TJ 1 0 0 1 5 6 cm /Im1 Do Q`)}
	var ops []string
	for {
		tok, kind := l.next()
		if kind == tokEOF {
			break
		}
		if kind == tokOperator {
			ops = append(ops, tok.text)
		}
	}
	want := []string{"q", "Tj", "TJ", "cm", "Do", "Q"}
	if len(ops) != len(want) {
		t.Fatalf("операторы %v, ждали %v", ops, want)
	}
	for i := range want {
		if ops[i] != want[i] {
			t.Fatalf("операторы %v, ждали %v", ops, want)
		}
	}
}
