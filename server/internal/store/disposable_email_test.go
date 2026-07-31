package store

import "testing"

func TestIsDisposableEmail(t *testing.T) {
	disposable := []string{
		"user@10minutemail.com",
		"user@10minutemail.co.uk",
		"user@mailinator.com",
		"user@yopmail.com",
		"user@guerrillamail.org",
		"user@temp-mail.org",
		"user@sharklasers.com",
		"user@getnada.com",
		"user@mohmal.com",
		"user@throwawaymail.com",
		"user@fakeinbox.com",
		"user@maildrop.cc",
		"user@trashmail.net",
		"user@emailondeck.com",
		// Регистр букв значения не имеет.
		"user@Mailinator.COM",
		"USER@YOPMAIL.com",
	}
	for _, email := range disposable {
		if !IsDisposableEmail(email) {
			t.Errorf("%q должен распознаваться как одноразовый", email)
		}
	}

	regular := []string{
		"user@gmail.com",
		"user@mail.ru",
		"user@yandex.ru",
		"user@outlook.com",
		"",
		"не-адрес",
		"user@",
	}
	for _, email := range regular {
		if IsDisposableEmail(email) {
			t.Errorf("%q не должен распознаваться как одноразовый", email)
		}
	}
}
