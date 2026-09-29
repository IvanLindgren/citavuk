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
)

//go:embed topics.json
var topicsJSON []byte

type Genre struct {
	ID   string `json:"id"`
	Icon string `json:"icon"`
	RU   string `json:"ru"`
	SR   string `json:"sr"`
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
