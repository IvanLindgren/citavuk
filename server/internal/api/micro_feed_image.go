package api

import (
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/citavuk/server/internal/feed"
	"github.com/citavuk/server/internal/store"
)

// Картинка карточки микро-ленты.
//
// Картинка живёт на чужом сайте, и прямая ссылка в вёрстке рассказала бы этому
// сайту, кто именно из наших читателей открыл карточку: браузер отправил бы
// туда IP-адрес, Referer и содержимое своих cookie для того домена. Ради
// иллюстрации в ленте выдавать такое третьей стороне не за что.
//
// Поэтому картинку забирает сервер. Наружу отдаётся не адрес источника, а
// идентификатор карточки: адрес сервер берёт из своей же базы, куда записал его
// при выборке из источника. Ручка, принимающая адрес от браузера, была бы
// открытым прокси — через неё можно постучаться и во внутреннюю сеть, и в
// облачные метаданные.

const (
	// maxFeedImageBytes — верхняя граница картинки. Больше мегабайта для
	// иллюстрации высотой в треть экрана не нужно никогда, а вот отдать
	// читателю на мобильном интернете чужой файл на двадцать мегабайт — вполне
	// достижимая неприятность.
	maxFeedImageBytes = 3 << 20
	// feedImageTimeout — сколько ждём чужой сервер. Ждать дольше незачем:
	// карточка прекрасно читается и без картинки.
	feedImageTimeout = 10 * time.Second
)

var feedImageClient = &http.Client{
	Timeout: feedImageTimeout,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 3 {
			return errors.New("слишком много перенаправлений")
		}
		// Перенаправление проверяется наравне с исходным адресом: иначе
		// разрешённый хост увёл бы нас куда угодно одним ответом 302.
		if !feed.AllowedImageURL(req.URL.String()) {
			return errors.New("перенаправление за пределы списка")
		}
		return nil
	},
}

// handleMicroFeedImage отдаёт картинку карточки.
//
// Неудача — не ошибка приложения: карточка без иллюстрации остаётся читаемой,
// поэтому во всех спорных случаях отвечаем 404, а клиент просто не показывает
// картинку.
func (s *Server) handleMicroFeedImage(w http.ResponseWriter, r *http.Request) {
	id, ok := microFeedID(w, r)
	if !ok {
		return
	}

	source, err := s.store.MicroFeedImageURL(r.Context(), id)
	if errors.Is(err, store.ErrMicroFeedNotFound) || strings.TrimSpace(source) == "" {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		slog.Error("handleMicroFeedImage: чтение адреса", "err", err)
		http.NotFound(w, r)
		return
	}
	if !feed.AllowedImageURL(source) {
		// Адрес записан до того, как список хостов сузили. Молча не показываем.
		http.NotFound(w, r)
		return
	}

	request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, source, nil)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	request.Header.Set("Accept", "image/avif,image/webp,image/jpeg,image/png,*/*;q=0.5")
	request.Header.Set("User-Agent", "CitavukMicroFeed/1.0 (+https://citavuk.ru/about)")

	response, err := feedImageClient.Do(request)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer response.Body.Close()

	contentType := response.Header.Get("Content-Type")
	if response.StatusCode != http.StatusOK ||
		!strings.HasPrefix(strings.ToLower(contentType), "image/") {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", contentType)
	// Картинка привязана к карточке и не меняется: карточка с другой картинкой
	// была бы другой карточкой с другим идентификатором.
	w.Header().Set("Cache-Control", "public, max-age=604800, immutable")
	// Тип определяет сервер по ответу источника; догадки браузера здесь только
	// вредят — подсунутый под видом картинки HTML исполнился бы как страница.
	w.Header().Set("X-Content-Type-Options", "nosniff")

	if _, err := io.Copy(w, io.LimitReader(response.Body, maxFeedImageBytes)); err != nil {
		// Заголовки уже ушли, сказать об ошибке нечем. Обрыв на середине —
		// обычно ушедший читатель, а не поломка.
		slog.Debug("handleMicroFeedImage: обрыв передачи", "err", err)
	}
}
