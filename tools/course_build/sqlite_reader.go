package main

// Минимальный читатель файлов SQLite 3: последовательный обход таблицы.
//
// Нужен ровно один сценарий — прочитать таблицу lexicon целиком. Полноценный
// драйвер сюда тянуть незачем: он потребовал бы CGO либо внешней зависимости
// в инструменте сборки. Поддерживается чтение table b-tree (внутренние и
// листовые страницы) и записей с переполнением.
//
// Формат: https://www.sqlite.org/fileformat2.html

import (
	"encoding/binary"
	"fmt"
	"math"
)

// sqliteValue — значение колонки записи.
type sqliteValue struct {
	isNull bool
	i      int64
	f      float64
	b      []byte
	isText bool
}

func (v sqliteValue) text() string {
	if v.isText {
		return string(v.b)
	}
	return ""
}

// readVarint читает big-endian varint SQLite (до 9 байт).
func readVarint(data []byte) (int64, int) {
	var result uint64
	for i := 0; i < 8; i++ {
		if i >= len(data) {
			return 0, 0
		}
		b := data[i]
		result = result<<7 | uint64(b&0x7f)
		if b&0x80 == 0 {
			return int64(result), i + 1
		}
	}
	if len(data) < 9 {
		return 0, 0
	}
	result = result<<8 | uint64(data[8])
	return int64(result), 9
}

// pageAt возвращает страницу по номеру (нумерация с единицы).
func pageAt(data []byte, pageSize, number int) ([]byte, error) {
	if number < 1 {
		return nil, fmt.Errorf("некорректный номер страницы %d", number)
	}
	start := (number - 1) * pageSize
	if start+pageSize > len(data) {
		return nil, fmt.Errorf("страница %d выходит за пределы файла", number)
	}
	return data[start : start+pageSize], nil
}

// usableSize — размер страницы за вычетом зарезервированного хвоста.
func usableSize(data []byte, pageSize int) int {
	return pageSize - int(data[20])
}

// walkTable обходит table b-tree, начиная с корневой страницы, и вызывает
// visit для каждой записи. visited защищает от зацикливания на битом файле.
func walkTable(
	data []byte,
	pageSize, root int,
	visited map[int]bool,
	visit func(values []sqliteValue),
) error {
	if visited[root] {
		return fmt.Errorf("цикл страниц на %d", root)
	}
	visited[root] = true

	page, err := pageAt(data, pageSize, root)
	if err != nil {
		return err
	}
	// На первой странице b-tree начинается после 100-байтового заголовка файла.
	offset := 0
	if root == 1 {
		offset = 100
	}
	if offset >= len(page) {
		return fmt.Errorf("пустая страница %d", root)
	}

	pageType := page[offset]
	cellCount := int(binary.BigEndian.Uint16(page[offset+3 : offset+5]))

	switch pageType {
	case 0x0d: // листовая страница таблицы
		headerLen := 8
		for i := 0; i < cellCount; i++ {
			p := offset + headerLen + i*2
			if p+2 > len(page) {
				return fmt.Errorf("обрезанный указатель ячейки на странице %d", root)
			}
			cellStart := int(binary.BigEndian.Uint16(page[p : p+2]))
			if cellStart >= len(page) {
				return fmt.Errorf("ячейка за пределами страницы %d", root)
			}
			payload, err := readLeafCell(data, pageSize, page[cellStart:])
			if err != nil {
				return err
			}
			values, err := decodeRecord(payload)
			if err != nil {
				return err
			}
			visit(values)
		}
		return nil

	case 0x05: // внутренняя страница таблицы
		headerLen := 12
		for i := 0; i < cellCount; i++ {
			p := offset + headerLen + i*2
			if p+2 > len(page) {
				return fmt.Errorf("обрезанный указатель ячейки на странице %d", root)
			}
			cellStart := int(binary.BigEndian.Uint16(page[p : p+2]))
			if cellStart+4 > len(page) {
				return fmt.Errorf("ячейка за пределами страницы %d", root)
			}
			child := int(binary.BigEndian.Uint32(page[cellStart : cellStart+4]))
			if err := walkTable(data, pageSize, child, visited, visit); err != nil {
				return err
			}
		}
		// Самый правый потомок.
		rightMost := int(binary.BigEndian.Uint32(page[offset+8 : offset+12]))
		return walkTable(data, pageSize, rightMost, visited, visit)

	default:
		return fmt.Errorf("страница %d не является table b-tree (тип 0x%02x)", root, pageType)
	}
}

// readLeafCell собирает payload листовой ячейки, дочитывая страницы
// переполнения, если запись не поместилась целиком.
func readLeafCell(data []byte, pageSize int, cell []byte) ([]byte, error) {
	payloadSize, n1 := readVarint(cell)
	if n1 == 0 {
		return nil, fmt.Errorf("не читается размер payload")
	}
	_, n2 := readVarint(cell[n1:]) // rowid, не нужен
	if n2 == 0 {
		return nil, fmt.Errorf("не читается rowid")
	}
	body := cell[n1+n2:]

	usable := usableSize(data, pageSize)
	maxLocal := usable - 35
	if int(payloadSize) <= maxLocal {
		if int(payloadSize) > len(body) {
			return nil, fmt.Errorf("payload обрезан")
		}
		return body[:payloadSize], nil
	}

	minLocal := ((usable-12)*32)/255 - 23
	localSize := minLocal + (int(payloadSize)-minLocal)%(usable-4)
	if localSize > maxLocal {
		localSize = minLocal
	}
	if localSize+4 > len(body) {
		return nil, fmt.Errorf("payload с переполнением обрезан")
	}

	out := make([]byte, 0, payloadSize)
	out = append(out, body[:localSize]...)
	next := int(binary.BigEndian.Uint32(body[localSize : localSize+4]))

	for next != 0 && len(out) < int(payloadSize) {
		page, err := pageAt(data, pageSize, next)
		if err != nil {
			return nil, err
		}
		next = int(binary.BigEndian.Uint32(page[:4]))
		chunk := page[4:usable]
		need := int(payloadSize) - len(out)
		if need < len(chunk) {
			chunk = chunk[:need]
		}
		out = append(out, chunk...)
	}
	if len(out) != int(payloadSize) {
		return nil, fmt.Errorf("цепочка переполнения оборвалась")
	}
	return out, nil
}

// decodeRecord разбирает запись SQLite в набор значений колонок.
func decodeRecord(payload []byte) ([]sqliteValue, error) {
	headerSize, n := readVarint(payload)
	if n == 0 || int(headerSize) > len(payload) {
		return nil, fmt.Errorf("некорректный заголовок записи")
	}
	var serialTypes []int64
	pos := n
	for pos < int(headerSize) {
		st, m := readVarint(payload[pos:])
		if m == 0 {
			return nil, fmt.Errorf("некорректный serial type")
		}
		serialTypes = append(serialTypes, st)
		pos += m
	}

	values := make([]sqliteValue, 0, len(serialTypes))
	body := int(headerSize)
	readInt := func(size int) (int64, error) {
		if body+size > len(payload) {
			return 0, fmt.Errorf("значение выходит за пределы записи")
		}
		var v int64
		for i := 0; i < size; i++ {
			v = v<<8 | int64(payload[body+i])
		}
		// Знаковое расширение.
		shift := uint(64 - 8*size)
		v = (v << shift) >> shift
		body += size
		return v, nil
	}

	for _, st := range serialTypes {
		switch {
		case st == 0:
			values = append(values, sqliteValue{isNull: true})
		case st >= 1 && st <= 4:
			v, err := readInt(int(st))
			if err != nil {
				return nil, err
			}
			values = append(values, sqliteValue{i: v})
		case st == 5:
			v, err := readInt(6)
			if err != nil {
				return nil, err
			}
			values = append(values, sqliteValue{i: v})
		case st == 6:
			v, err := readInt(8)
			if err != nil {
				return nil, err
			}
			values = append(values, sqliteValue{i: v})
		case st == 7:
			if body+8 > len(payload) {
				return nil, fmt.Errorf("float выходит за пределы записи")
			}
			bits := binary.BigEndian.Uint64(payload[body : body+8])
			body += 8
			values = append(values, sqliteValue{f: math.Float64frombits(bits)})
		case st == 8:
			values = append(values, sqliteValue{i: 0})
		case st == 9:
			values = append(values, sqliteValue{i: 1})
		case st >= 12 && st%2 == 0:
			size := int((st - 12) / 2)
			if body+size > len(payload) {
				return nil, fmt.Errorf("blob выходит за пределы записи")
			}
			values = append(values, sqliteValue{b: payload[body : body+size]})
			body += size
		case st >= 13 && st%2 == 1:
			size := int((st - 13) / 2)
			if body+size > len(payload) {
				return nil, fmt.Errorf("текст выходит за пределы записи")
			}
			values = append(values, sqliteValue{b: payload[body : body+size], isText: true})
			body += size
		default:
			return nil, fmt.Errorf("неизвестный serial type %d", st)
		}
	}
	return values, nil
}

// findTableRoot ищет в sqlite_master корневую страницу таблицы по имени.
//
// sqlite_master: (type, name, tbl_name, rootpage, sql).
func findTableRoot(data []byte, pageSize int, table string) (int, int, error) {
	root := 0
	visited := map[int]bool{}
	err := walkTable(data, pageSize, 1, visited, func(values []sqliteValue) {
		if root != 0 || len(values) < 4 {
			return
		}
		if values[0].text() != "table" || values[1].text() != table {
			return
		}
		root = int(values[3].i)
	})
	if err != nil {
		return 0, 0, err
	}
	if root == 0 {
		return 0, 0, fmt.Errorf("таблица %q не найдена", table)
	}
	// Колонок в lexicon пять; проверяем по факту не меньше четырёх нужных.
	return root, 4, nil
}
