package api

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

// statusClientClosed — «клиент закрыл соединение»: код nginx, ставший общим.
// Ответ всё равно никто не прочитает, важен только сам код в журнале.
const statusClientClosed = 499

// isClientGone отличает уход клиента от настоящей аварии.
func isClientGone(r *http.Request, err error) bool {
	if r.Context().Err() != nil {
		return true
	}
	return errors.Is(err, context.Canceled)
}

// newUpstreamProxy строит обратный прокси к прежнему Python-бэкенду.
//
// Go пока не умеет то, ради чего существует Python-часть: разбор CLASSLA,
// новости, извлечение статей и синтез речи. Вместо того чтобы переписывать всё
// сразу и надолго оставить приложение без этих разделов, неизвестные Go пути
// уходят наверх. Так переход выполняется по частям, а клиент всё время видит
// один адрес сервера.
func newUpstreamProxy(rawURL string) (*httputil.ReverseProxy, error) {
	target, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}

	proxy := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(target)
			// Host должен соответствовать целевому сервису: Hugging Face
			// маршрутизирует Space именно по нему.
			pr.Out.Host = target.Host
			// Заголовок авторизации Citavuk наверх не уходит: там он не нужен,
			// а утечка токена сессии на сторонний сервис недопустима.
			pr.Out.Header.Del("Authorization")
			pr.Out.Header.Del("Cookie")
		},
		Transport: &http.Transport{
			DialContext: (&net.Dialer{
				Timeout:   10 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			TLSHandshakeTimeout: 10 * time.Second,
			MaxIdleConns:        16,
			IdleConnTimeout:     90 * time.Second,
			// Аудио отдаётся потоком, поэтому ответ не буферизуется целиком.
			// OCR сканированного PDF на бесплатном CPU Space может занимать
			// несколько минут. Для остальных путей это только верхняя граница,
			// соединение всё равно завершится сразу после получения заголовков.
			ResponseHeaderTimeout: 6 * time.Minute,
		},
		ModifyResponse: func(response *http.Response) error {
			// CORS задаёт внешний Go-сервер после проверки origin. Если
			// пропустить заголовки Space как есть, браузер увидит два
			// Access-Control-Allow-Origin и заблокирует даже успешный ответ.
			for name := range response.Header {
				if strings.HasPrefix(http.CanonicalHeaderKey(name), "Access-Control-") {
					response.Header.Del(name)
				}
			}
			return nil
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			// Ушедший клиент — не поломка сервиса. Браузер отменяет запрос,
			// когда посетитель уходит со страницы раздела, и прежний код
			// отвечал таким отменённым запросам 502, засоряя журнал инцидентов
			// авариями, которых не было.
			if isClientGone(r, err) {
				slog.Debug("клиент отменил запрос", "path", r.URL.Path)
				writeError(w, statusClientClosed, codeUpstream, "Запрос отменён.")
				return
			}
			slog.Warn("верхний сервис недоступен", "path", r.URL.Path, "err", err)
			writeError(w, http.StatusBadGateway, codeUpstream,
				"Сервис временно недоступен. Попробуйте позже.")
		},
		FlushInterval: 200 * time.Millisecond,
	}
	return proxy, nil
}

// legacyPaths — пути прежнего бэкенда, которые пока обслуживает Python.
//
// Список явный, а не «всё неизвестное наверх»: открытый прокси превратил бы
// сервер в средство обхода ограничений чужой сети.
var legacyPaths = []string{
	"/analyze",
	"/news",
	"/article",
	"/img",
	"/audio/",
	"/documents/",
}

func isLegacyPath(path string) bool {
	for _, p := range legacyPaths {
		if path == strings.TrimSuffix(p, "/") || strings.HasPrefix(path, p) {
			return true
		}
	}
	return false
}
