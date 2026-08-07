package lexicon

import (
	"bytes"
	"sort"
)

// Расширенный словарь словоформ: все формы двенадцати тысяч самых частых лемм.
//
// Свой словарь собран из трибанка и знает 21 тысячу форм. Разбору одного слова
// этого хватало: не нашлось — достроим парадигмой от похожей леммы. Разбору
// фразы не хватает совсем: там нужны ВСЕ разборы формы, чтобы предлог рядом мог
// выбрать из них падеж, а достроенная парадигма даёт разборы только у слов,
// чью лемму словарь всё-таки знает. На «Pišem olovkom o ljubavi» прежний
// словарь не опознавал ни «pišem», ни «olovkom».
//
// Хранение не картой, а одним куском памяти с двоичным поиском: 700 тысяч строк
// в map[string][]Form стоили бы около 200 МБ, а сервер стоит на общей машине.
// Так выходит примерно 15 МБ. Цена — поиск за логарифм; ищется тут не в горячем
// цикле, а раз на слово.

// bigRow — одна строка расширенного словаря. Ссылки, а не строки: лемм двенадцать
// тысяч, а наборов признаков и того меньше — хранить их по копии на строку
// значит хранить одно и то же семьсот тысяч раз.
type bigRow struct {
	lemma uint16
	upos  uint8
	feats uint16
}

type bigForms struct {
	// blob — уникальные формы подряд, по возрастанию; offsets — их границы.
	blob    []byte
	offsets []int32
	// first[i] — номер первой строки формы i в rows. Длина на единицу больше
	// числа форм, поэтому строки формы i — это rows[first[i]:first[i+1]].
	first []int32
	rows  []bigRow

	lemmas []string
	poses  []string
	feats  []string
}

func (b *bigForms) at(i int) []byte {
	return b.blob[b.offsets[i]:b.offsets[i+1]]
}

// Lookup возвращает все разборы формы.
func (b *bigForms) Lookup(form string) []Form {
	count := len(b.first) - 1
	if count <= 0 {
		return nil
	}
	key := []byte(form)
	i := sort.Search(count, func(i int) bool { return bytes.Compare(b.at(i), key) >= 0 })
	if i >= count || !bytes.Equal(b.at(i), key) {
		return nil
	}
	rows := b.rows[b.first[i]:b.first[i+1]]
	out := make([]Form, 0, len(rows))
	for _, row := range rows {
		out = append(out, Form{
			Form:  form,
			Lemma: b.lemmas[row.lemma],
			UPOS:  b.poses[row.upos],
			Feats: b.feats[row.feats],
		})
	}
	return out
}

// interner выдаёт номер строке, храня каждое значение по одному разу.
type interner struct {
	index  map[string]int
	values []string
}

func newInterner() *interner {
	return &interner{index: make(map[string]int, 4096)}
}

func (in *interner) id(value string) int {
	if id, ok := in.index[value]; ok {
		return id
	}
	id := len(in.values)
	in.index[value] = id
	in.values = append(in.values, value)
	return id
}

func loadBigForms() (*bigForms, error) {
	big := &bigForms{
		blob:    make([]byte, 0, 6<<20),
		offsets: make([]int32, 0, 1<<19),
		first:   make([]int32, 0, 1<<19),
		rows:    make([]bigRow, 0, 1<<20),
	}
	lemmas, poses, feats := newInterner(), newInterner(), newInterner()
	previous := ""

	err := readLines("data/bigforms.tsv.gz", func(parts []string) {
		if len(parts) < 3 || parts[0] == "" {
			return
		}
		form, lemma, upos := parts[0], parts[1], parts[2]
		raw := ""
		if len(parts) > 3 {
			raw = parts[3]
		}
		// Файл отсортирован по форме, поэтому новая форма начинается ровно
		// тогда, когда она отличается от предыдущей.
		if len(big.first) == 0 || form != previous {
			big.offsets = append(big.offsets, int32(len(big.blob)))
			big.blob = append(big.blob, form...)
			big.first = append(big.first, int32(len(big.rows)))
			previous = form
		}
		lemmaID, featsID := lemmas.id(lemma), feats.id(raw)
		// Номера не влезли в отведённую ширину — строку пропускаем, а не
		// портим чужой ссылкой. Случиться это может только если данные
		// пересобрали с другими границами, и тогда чинить нужно сборку.
		if lemmaID > 0xFFFF || featsID > 0xFFFF {
			return
		}
		big.rows = append(big.rows, bigRow{
			lemma: uint16(lemmaID),
			upos:  uint8(poses.id(upos)),
			feats: uint16(featsID),
		})
	})
	if err != nil {
		return nil, err
	}
	// Границы последней формы и последней группы строк.
	big.offsets = append(big.offsets, int32(len(big.blob)))
	big.first = append(big.first, int32(len(big.rows)))

	big.lemmas, big.poses, big.feats = lemmas.values, poses.values, feats.values
	return big, nil
}
