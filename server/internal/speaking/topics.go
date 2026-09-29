// Package speaking — игра «Говори!»: тема выпадает на барабане, человек пишет
// или наговаривает текст, нейросеть разбирает ошибки.
//
// Каталог тем лежит здесь один: клиенты получают его с сервера, а сервер по
// идентификатору сам подставляет формулировку в запрос к модели. Текст темы от
// клиента в промпт не попадает.
package speaking

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
)

//go:embed topics.json
var topicsJSON []byte

type Genre struct {
	ID string `json:"id"`
	// Icon — эмодзи для приложений 1.22.0; новые клиенты рисуют Art.
	Icon string `json:"icon"`
	// Art — содержимое рисованного значка 24×24 без обёртки <svg>. Клиенты
	// вставляют его как разметку, поэтому Load пропускает только простые фигуры.
	Art string `json:"art"`
	RU  string `json:"ru"`
	SR  string `json:"sr"`
}

var (
	artElement = regexp.MustCompile(`<\s*/?\s*([a-zA-Z]+)`)
	artAttr    = regexp.MustCompile(`[\s"'/]([a-zA-Z:-]+)\s*=`)
	artTags    = map[string]bool{"path": true, "circle": true, "rect": true, "ellipse": true, "line": true, "polyline": true}
	artAttrs   = map[string]bool{
		"d": true, "cx": true, "cy": true, "r": true, "rx": true, "ry": true,
		"x": true, "y": true, "x1": true, "y1": true, "x2": true, "y2": true,
		"width": true, "height": true, "points": true, "transform": true,
	}
)

// validArt отсекает всё, кроме фигур и их геометрии: ни скриптов, ни ссылок,
// ни обработчиков событий в значке оказаться не может.
func validArt(art string) error {
	if art == "" {
		return fmt.Errorf("пустой значок")
	}
	for _, m := range artElement.FindAllStringSubmatch(art, -1) {
		if !artTags[m[1]] {
			return fmt.Errorf("недопустимый элемент %q", m[1])
		}
	}
	for _, m := range artAttr.FindAllStringSubmatch(art, -1) {
		if !artAttrs[m[1]] {
			return fmt.Errorf("недопустимый атрибут %q", m[1])
		}
	}
	return nil
}

type Word struct {
	SR string `json:"sr"`
	RU string `json:"ru"`
}

type Topic struct {
	ID    string `json:"id"`
	Genre string `json:"genre"`
	SR    string `json:"sr"`
	RU    string `json:"ru"`
	Words []Word `json:"words"`
}

type Catalog struct {
	Genres []Genre `json:"genres"`
	Topics []Topic `json:"topics"`

	byID map[string]*Topic
}

// Load разбирает встроенный каталог и проверяет, что темы ссылаются на
// существующие жанры и не повторяются.
func Load() (*Catalog, error) {
	var c Catalog
	if err := json.Unmarshal(topicsJSON, &c); err != nil {
		return nil, fmt.Errorf("speaking: каталог тем: %w", err)
	}
	genres := make(map[string]bool, len(c.Genres))
	for _, g := range c.Genres {
		if err := validArt(g.Art); err != nil {
			return nil, fmt.Errorf("speaking: жанр %q: %w", g.ID, err)
		}
		genres[g.ID] = true
	}
	c.byID = make(map[string]*Topic, len(c.Topics))
	for i := range c.Topics {
		t := &c.Topics[i]
		if !genres[t.Genre] {
			return nil, fmt.Errorf("speaking: тема %q: неизвестный жанр %q", t.ID, t.Genre)
		}
		if t.ID == "" || t.SR == "" || t.RU == "" || c.byID[t.ID] != nil {
			return nil, fmt.Errorf("speaking: тема %q пуста или повторяется", t.ID)
		}
		c.byID[t.ID] = t
	}
	return &c, nil
}

// Topic возвращает тему по идентификатору.
func (c *Catalog) Topic(id string) (*Topic, bool) {
	t, ok := c.byID[id]
	return t, ok
}
