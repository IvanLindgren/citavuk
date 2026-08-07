package lexicon

import (
	"bytes"
	"sort"
	"strconv"
)

// Ранги словоформ — мера редкости слова.
//
// Отдельно от byForm, потому что задача другая: byForm отвечает «какой это
// разбор», а здесь нужно «насколько это слово редкое», и для этого нужен охват,
// а не подробность. Свой морфологический словарь знает 21 тысячу форм — в живом
// тексте их на порядок больше, и оценка сложности по нему считала редким почти
// каждое слово.
//
// Хранение не картой, а одним куском памяти с двоичным поиском. Миллион с
// лишним ключей в map[string]int32 стоил бы около 60 МБ на одни только
// накладные расходы, а сервер стоит на общей машине; так выходит вчетверо
// дешевле. Цена — поиск за логарифм вместо константы, но ищется тут не в
// горячем цикле: раз на слово при оценке книги.
type wordRanks struct {
	// blob — формы подряд, без разделителей, в порядке возрастания.
	blob []byte
	// offsets — начало каждой формы; последний элемент равен длине blob.
	offsets []int32
	ranks   []int32
}

func (w *wordRanks) add(form string, rank int) {
	w.offsets = append(w.offsets, int32(len(w.blob)))
	w.blob = append(w.blob, form...)
	w.ranks = append(w.ranks, int32(rank))
}

// seal дописывает границу последней формы. Без неё у неё не было бы конца.
func (w *wordRanks) seal() {
	w.offsets = append(w.offsets, int32(len(w.blob)))
}

func (w *wordRanks) at(i int) []byte {
	return w.blob[w.offsets[i]:w.offsets[i+1]]
}

// lookup ищет форму двоичным поиском.
//
// Файл отсортирован по возрастанию кодовых точек, а порядок байтов UTF-8
// совпадает с порядком кодовых точек — поэтому сравнение байтами и есть тот же
// порядок, в котором данные записаны.
func (w *wordRanks) lookup(form string) (int, bool) {
	count := len(w.ranks)
	if count == 0 {
		return 0, false
	}
	key := []byte(form)
	i := sort.Search(count, func(i int) bool { return bytes.Compare(w.at(i), key) >= 0 })
	if i < count && bytes.Equal(w.at(i), key) {
		return int(w.ranks[i]), true
	}
	return 0, false
}

func loadWordRanks() (*wordRanks, error) {
	// Ёмкость под известный объём данных: без неё срез переезжает два десятка
	// раз и на пике держит вдвое больше нужного.
	ranks := &wordRanks{
		blob:    make([]byte, 0, 12<<20),
		offsets: make([]int32, 0, 1<<20),
		ranks:   make([]int32, 0, 1<<20),
	}
	err := readLines("data/wordranks.tsv.gz", func(parts []string) {
		if len(parts) < 2 || parts[0] == "" {
			return
		}
		rank, err := strconv.Atoi(parts[1])
		if err != nil || rank <= 0 {
			return
		}
		ranks.add(parts[0], rank)
	})
	if err != nil {
		return nil, err
	}
	ranks.seal()
	return ranks, nil
}
