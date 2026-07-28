package api

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// errNotLoopback — адрес возврата не ведёт на локальный сокет.
var errNotLoopback = errors.New("адрес возврата должен вести на 127.0.0.1")

// loopbackHosts — единственные допустимые имена в адресе возврата.
//
// «localhost» разрешён, потому что его требует часть OAuth-провайдеров, но
// доверия к нему меньше: имя разрешается через hosts и DNS и в принципе может
// указывать наружу. 127.0.0.1 и ::1 такому не подвержены.
var loopbackHosts = map[string]bool{
	"127.0.0.1": true,
	"localhost": true,
	"::1":       true,
}

// parseLoopbackURL проверяет адрес, на который настольное приложение просит
// вернуть результат входа.
//
// Проверка обязательна. Адрес приходит от клиента и потом используется как
// цель перенаправления вместе с одноразовым кодом входа; без проверки эндпойнт
// начала авторизации превратился бы в открытый редиректор, уводящий код входа
// на чужой сайт.
//
// Возвращается адрес без строки запроса: параметры дописывает сервер, и
// затащить туда свои значения (например, подменить error) клиент не должен.
func parseLoopbackURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("%w: адрес не указан", errNotLoopback)
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("%w: %v", errNotLoopback, err)
	}

	// Только http: сертификата для 127.0.0.1 у приложения быть не может, а
	// прочие схемы (file, javascript, произвольный deep link) здесь не нужны.
	if parsed.Scheme != "http" {
		return "", fmt.Errorf("%w: схема %q не разрешена", errNotLoopback, parsed.Scheme)
	}
	if parsed.User != nil {
		return "", fmt.Errorf("%w: адрес с учётными данными", errNotLoopback)
	}
	if !loopbackHosts[parsed.Hostname()] {
		return "", fmt.Errorf("%w: узел %q", errNotLoopback, parsed.Hostname())
	}

	port := parsed.Port()
	if port == "" {
		return "", fmt.Errorf("%w: не указан порт", errNotLoopback)
	}
	// Порт приложение получает от системы, привязавшись к нулевому. Значения
	// ниже 1024 требуют прав администратора и на такой адрес прийти не могут —
	// значит, их указали намеренно.
	var number int
	if _, err := fmt.Sscanf(port, "%d", &number); err != nil || number < 1024 || number > 65535 {
		return "", fmt.Errorf("%w: недопустимый порт %q", errNotLoopback, port)
	}

	path := parsed.EscapedPath()
	if path == "" {
		path = "/"
	}
	if !strings.HasPrefix(path, "/") {
		return "", fmt.Errorf("%w: путь %q", errNotLoopback, path)
	}

	clean := url.URL{Scheme: "http", Host: parsed.Host, Path: parsed.Path}
	return clean.String(), nil
}
