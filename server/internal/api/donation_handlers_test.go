package api

import (
	"testing"

	"github.com/citavuk/server/internal/config"
	"github.com/citavuk/server/internal/store"
	"github.com/citavuk/server/internal/yookassa"
)

func TestPaymentsOpenForTestShopOnlyAdmins(t *testing.T) {
	admin := &store.User{IsAdmin: true}
	reader := &store.User{}

	s := &Server{yookassa: yookassa.New("", "")}
	if s.paymentsOpenFor(admin) {
		t.Error("без ключей оплата закрыта для всех")
	}

	s.yookassa = yookassa.New("123", "test_secret")
	if !s.paymentsOpenFor(admin) {
		t.Error("тестовый магазин открыт администратору")
	}
	if s.paymentsOpenFor(reader) || s.paymentsOpenFor(nil) {
		t.Error("тестовый магазин закрыт для остальных: тестовые карты общеизвестны")
	}

	s.cfg = &config.Config{YooKassaTestPayers: []string{"Review@Example.com"}}
	if !s.paymentsOpenFor(&store.User{Email: "review@example.com"}) {
		t.Error("тестовый магазин открыт проверяющему ЮKassa")
	}
	if s.paymentsOpenFor(reader) {
		t.Error("список проверяющих не открывает магазин остальным")
	}

	s.yookassa = yookassa.New("123", "live_secret")
	if !s.paymentsOpenFor(reader) || !s.paymentsOpenFor(nil) {
		t.Error("боевой магазин открыт всем")
	}
}
