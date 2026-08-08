package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// Регистрация маршрутов не должна ронять процесс.
//
// ServeMux с Go 1.22 паникует на конфликтующих образцах — например, если два
// шаблона совпадают по длине и ни один не строже другого. Такая паника
// случается при запуске, то есть выкатка просто не поднимется, и заметить это
// на работающем сервере уже поздно. Здесь пары вроде
// «/v1/roadmap/{level}/{category}» и «/v1/roadmap/{level}/comments» проверяются
// заранее: второй строже первого, и порядок разрешается однозначно.
func TestRoutesRegisterWithoutConflicts(t *testing.T) {
	mux := http.NewServeMux()
	handler := func(w http.ResponseWriter, r *http.Request) {}

	patterns := []string{
		"GET /v1/roadmap",
		"GET /v1/roadmap/{level}/{category}",
		"POST /v1/roadmap/progress",
		"GET /v1/roadmap/target",
		"PUT /v1/roadmap/target",
		"GET /v1/roadmap/{level}/comments",
		"POST /v1/roadmap/{level}/comments",
		"DELETE /v1/roadmap/comments/{commentId}",
		"GET /v1/profile/stats",
		"GET /v1/admin/roadmap/{level}/{category}",
		"PUT /v1/admin/roadmap/{level}/{category}/intro",
		"POST /v1/admin/roadmap/items",
		"DELETE /v1/admin/roadmap/items/{id}",
		"POST /v1/admin/roadmap/exercises",
		"DELETE /v1/admin/roadmap/exercises/{id}",
		"POST /v1/admin/roadmap/words",
		"DELETE /v1/admin/roadmap/words/{id}",
		"POST /v1/admin/roadmap/words/{level}/publish",
	}
	for _, pattern := range patterns {
		mux.HandleFunc(pattern, handler)
	}

	// Строгий образец должен выигрывать у общего, иначе обсуждение уровня
	// уехало бы в обработчик раздела с category = "comments".
	for _, item := range []struct{ path, want string }{
		{"/v1/roadmap/B1/comments", "GET /v1/roadmap/{level}/comments"},
		{"/v1/roadmap/B1/reading", "GET /v1/roadmap/{level}/{category}"},
		{"/v1/roadmap/target", "GET /v1/roadmap/target"},
	} {
		request := httptest.NewRequest(http.MethodGet, item.path, nil)
		_, pattern := mux.Handler(request)
		if pattern != item.want {
			t.Errorf("%s → %q, ожидался %q", item.path, pattern, item.want)
		}
	}
}
