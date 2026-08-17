package api

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/citavuk/server/internal/photoscan"
)

type fakeScanner struct {
	enabled    bool
	paragraphs []string
	err        error
	gotBytes   int
	gotMime    string
}

func (f *fakeScanner) Enabled() bool { return f.enabled }

func (f *fakeScanner) Recognize(_ context.Context, image []byte, mime string) ([]string, error) {
	f.gotBytes = len(image)
	f.gotMime = mime
	return f.paragraphs, f.err
}

func photoRequest(t *testing.T, field, filename string, body []byte, mime string) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	header := make(map[string][]string)
	header["Content-Disposition"] = []string{
		`form-data; name="` + field + `"; filename="` + filename + `"`,
	}
	if mime != "" {
		header["Content-Type"] = []string{mime}
	}
	part, err := writer.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(body); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/photo/scan", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
}

func TestPhotoScanReturnsParagraphs(t *testing.T) {
	scanner := &fakeScanner{enabled: true, paragraphs: []string{"Прво.", "Друго."}}
	s := &Server{photoScan: scanner, errors: newRecentErrors(10)}

	rec := httptest.NewRecorder()
	s.handlePhotoScan(rec, photoRequest(t, "photo", "kadar.jpg", []byte("bajtovi"), "image/jpeg"))

	if rec.Code != http.StatusOK {
		t.Fatalf("код %d, ждали 200: %s", rec.Code, rec.Body.String())
	}
	var resp photoScanResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("ответ не разобрался: %v", err)
	}
	if len(resp.Paragraphs) != 2 || resp.Paragraphs[0] != "Прво." {
		t.Errorf("абзацы %q", resp.Paragraphs)
	}
	if scanner.gotBytes != len("bajtovi") {
		t.Errorf("до распознавания дошло %d байт", scanner.gotBytes)
	}
	if scanner.gotMime != "image/jpeg" {
		t.Errorf("тип кадра %q", scanner.gotMime)
	}
}

// Снимок стены без текста — обычное дело, и «внутренняя ошибка» в ответ на
// него врёт человеку: чинить нечего, надо переснять.
func TestPhotoScanEmptyIsNotAFailure(t *testing.T) {
	s := &Server{
		photoScan: &fakeScanner{enabled: true, err: photoscan.ErrNoText},
		errors:    newRecentErrors(10),
	}
	rec := httptest.NewRecorder()
	s.handlePhotoScan(rec, photoRequest(t, "photo", "zid.jpg", []byte("x"), "image/jpeg"))

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("код %d, ждали 422: %s", rec.Code, rec.Body.String())
	}
}

func TestPhotoScanDisabled(t *testing.T) {
	s := &Server{photoScan: &fakeScanner{}, errors: newRecentErrors(10)}
	rec := httptest.NewRecorder()
	s.handlePhotoScan(rec, photoRequest(t, "photo", "k.jpg", []byte("x"), "image/jpeg"))

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("код %d, ждали 503", rec.Code)
	}
}

func TestPhotoScanWithoutFile(t *testing.T) {
	s := &Server{
		photoScan: &fakeScanner{enabled: true, paragraphs: []string{"x"}},
		errors:    newRecentErrors(10),
	}
	rec := httptest.NewRecorder()
	// Поле названо не так — снимка в запросе фактически нет.
	s.handlePhotoScan(rec, photoRequest(t, "kadar", "k.jpg", []byte("x"), "image/jpeg"))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("код %d, ждали 400", rec.Code)
	}
}

func TestPhotoScanTooLarge(t *testing.T) {
	s := &Server{
		photoScan: &fakeScanner{enabled: true, paragraphs: []string{"x"}},
		errors:    newRecentErrors(10),
	}
	big := bytes.Repeat([]byte{7}, photoscan.MaxImageBytes+1024)
	rec := httptest.NewRecorder()
	s.handlePhotoScan(rec, photoRequest(t, "photo", "k.jpg", big, "image/jpeg"))

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("код %d, ждали 413: %s", rec.Code, rec.Body.String())
	}
}

func TestPhotoTitle(t *testing.T) {
	cases := []struct {
		name string
		in   []string
		want string
	}{
		{"первая строка", []string{"OBAVEŠTENJE\nSutra nema vode", "Hvala"}, "OBAVEŠTENJE"},
		{"пустой абзац пропускается", []string{"   ", "Radno vreme"}, "Radno vreme"},
		{"нечего взять", nil, "Снимок"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := photoTitle(c.in, "Снимок"); got != c.want {
				t.Errorf("photoTitle = %q, ждали %q", got, c.want)
			}
		})
	}
}
