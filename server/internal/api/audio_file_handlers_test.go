package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"testing"
)

func TestAudioFileTranscribeRewritesOnlyTheInternalPath(t *testing.T) {
	var path string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"language_code":"srp","segments":[]}`))
	}))
	defer upstream.Close()

	proxy, err := newUpstreamProxy(upstream.URL, "secret", false)
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{proxy: proxy}
	request := httptest.NewRequest(http.MethodPost, "/v1/audio/transcribe", bytes.NewBufferString("--boundary--"))
	request.Header.Set("Content-Type", "multipart/form-data; boundary=boundary")
	recorder := httptest.NewRecorder()

	server.handleAudioFileTranscribe(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("неожиданный статус: %d %s", recorder.Code, recorder.Body.String())
	}
	if path != "/audio/transcribe-file" {
		t.Fatalf("upstream получил неверный путь: %q", path)
	}
}

func TestAudioFileTranscribeUsesDedicatedWorker(t *testing.T) {
	var called bool
	worker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if r.URL.Path != "/audio/transcribe-file" || r.Header.Get("X-Citavuk-Proxy-Secret") != "internal-secret" {
			t.Error("неверная маршрутизация или подпись")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"language_code":"srp","provider":"polza"}`))
	}))
	defer worker.Close()
	proxy, err := newUpstreamProxy(worker.URL, "internal-secret", false)
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{audioProxy: proxy, proxy: &httputil.ReverseProxy{}}
	r := httptest.NewRequest(http.MethodPost, "/v1/audio/transcribe", bytes.NewBufferString("--boundary--"))
	r.Header.Set("Content-Type", "multipart/form-data; boundary=boundary")
	w := httptest.NewRecorder()
	server.handleAudioFileTranscribe(w, r)
	if !called || w.Code != http.StatusOK {
		t.Fatalf("STT-worker не вызван: %d", w.Code)
	}
}

func TestInternalTranscriptionCannotBeReachedThroughLegacyProxy(t *testing.T) {
	server := &Server{proxy: &httputil.ReverseProxy{}}
	for _, path := range []string{"/audio/transcribe-file", "/audio/transcribe-file/"} {
		w := httptest.NewRecorder()
		server.handleFallback(w, httptest.NewRequest(http.MethodPost, path, nil))
		if w.Code != http.StatusNotFound {
			t.Fatalf("внутренний путь открыт: %s, %d", path, w.Code)
		}
	}
}

func TestAudioFileTranscribeRejectsWrongContentType(t *testing.T) {
	server := &Server{proxy: &httputil.ReverseProxy{}}
	request := httptest.NewRequest(http.MethodPost, "/v1/audio/transcribe", bytes.NewBufferString("not multipart"))
	recorder := httptest.NewRecorder()
	server.handleAudioFileTranscribe(recorder, request)
	if recorder.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("неожиданный статус: %d", recorder.Code)
	}
}

func TestAudioFileTranscribeRejectsOversizedBodyBeforeProxy(t *testing.T) {
	called := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))
	defer upstream.Close()
	proxy, err := newUpstreamProxy(upstream.URL, "secret", false)
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{proxy: proxy}
	request := httptest.NewRequest(http.MethodPost, "/v1/audio/transcribe", bytes.NewBufferString("small"))
	request.Header.Set("Content-Type", "multipart/form-data; boundary=boundary")
	request.ContentLength = maxAudioTranscriptionBody + 1
	recorder := httptest.NewRecorder()

	server.handleAudioFileTranscribe(recorder, request)
	if recorder.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("неожиданный статус: %d", recorder.Code)
	}
	if called {
		t.Fatal("слишком большой файл дошёл до upstream")
	}
}
