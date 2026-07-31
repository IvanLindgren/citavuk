package store

import (
	_ "embed"
	"strings"
)

// Список зафиксирован на commit b9e26ce8199519d6cd38a46fe1088c24f978d39e:
// https://github.com/disposable-email-domains/disposable-email-domains
// Данные переданы в public domain по CC0 1.0. Обновлять список нужно вместе с
// тестами, а не скачивать в runtime: регистрация обязана работать без GitHub.
//
//go:embed disposable_email_blocklist.conf
var disposableEmailBlocklist string

var disposableEmailDomains = func() map[string]struct{} {
	domains := make(map[string]struct{}, 9000)
	for _, line := range strings.Split(disposableEmailBlocklist, "\n") {
		if domain := strings.ToLower(strings.TrimSpace(line)); domain != "" {
			domains[domain] = struct{}{}
		}
	}
	return domains
}()

// IsDisposableEmail сообщает, относится ли адрес к одноразовой почте.
// Поддомены тоже блокируются: foo.mailinator.com не должен обходить запись
// mailinator.com в списке.
func IsDisposableEmail(email string) bool {
	at := strings.LastIndex(email, "@")
	if at < 0 || at == len(email)-1 {
		return false
	}
	domain := strings.ToLower(strings.TrimSpace(email[at+1:]))
	for domain != "" {
		if _, found := disposableEmailDomains[domain]; found {
			return true
		}
		dot := strings.IndexByte(domain, '.')
		if dot < 0 {
			return false
		}
		domain = domain[dot+1:]
	}
	return false
}
