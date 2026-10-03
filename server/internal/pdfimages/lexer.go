package pdfimages

import (
	"bytes"
	"strconv"
)

// Лексер содержимого страницы. Полный разбор операторов не нужен: важны
// q/Q/cm/Do и числа с именами перед ними. Строки, массивы и словари только
// пропускаются — но аккуратно, со вложенностью и экранированием, иначе
// скобка в тексте сбила бы весь подсчёт матриц.

type tokKind int

const (
	tokEOF tokKind = iota
	tokNumber
	tokName
	tokOperator
	tokOther
)

type token struct {
	text string
	num  float64
}

type lexer struct {
	src []byte
	pos int
}

func isSpace(b byte) bool {
	return b == ' ' || b == '\n' || b == '\r' || b == '\t' || b == '\f' || b == 0
}

func isDelim(b byte) bool {
	return bytes.IndexByte([]byte("()<>[]{}/%"), b) >= 0
}

func (l *lexer) next() (token, tokKind) {
	for l.pos < len(l.src) {
		b := l.src[l.pos]
		switch {
		case isSpace(b):
			l.pos++
		case b == '%':
			for l.pos < len(l.src) && l.src[l.pos] != '\n' && l.src[l.pos] != '\r' {
				l.pos++
			}
		case b == '/':
			start := l.pos + 1
			l.pos++
			for l.pos < len(l.src) && !isSpace(l.src[l.pos]) && !isDelim(l.src[l.pos]) {
				l.pos++
			}
			return token{text: string(l.src[start:l.pos])}, tokName
		case b == '(':
			l.skipString()
			return token{}, tokOther
		case b == '<':
			if l.pos+1 < len(l.src) && l.src[l.pos+1] == '<' {
				l.skipBalanced('<', '>', 2)
			} else {
				for l.pos < len(l.src) && l.src[l.pos] != '>' {
					l.pos++
				}
				l.pos++
			}
			return token{}, tokOther
		case b == '[':
			l.skipArray()
			return token{}, tokOther
		case b == ']' || b == '>' || b == ')' || b == '{' || b == '}':
			l.pos++
		default:
			start := l.pos
			for l.pos < len(l.src) && !isSpace(l.src[l.pos]) && !isDelim(l.src[l.pos]) {
				l.pos++
			}
			word := string(l.src[start:l.pos])
			if word == "" {
				l.pos++
				continue
			}
			if n, err := strconv.ParseFloat(word, 64); err == nil {
				return token{num: n}, tokNumber
			}
			return token{text: word}, tokOperator
		}
	}
	return token{}, tokEOF
}

// skipString пропускает (строку) с вложенными скобками и экранированием.
func (l *lexer) skipString() {
	depth := 0
	for l.pos < len(l.src) {
		switch l.src[l.pos] {
		case '\\':
			l.pos++
		case '(':
			depth++
		case ')':
			depth--
			if depth == 0 {
				l.pos++
				return
			}
		}
		l.pos++
	}
}

// skipArray пропускает [массив], внутри которого бывают строки со скобками.
func (l *lexer) skipArray() {
	depth := 0
	for l.pos < len(l.src) {
		switch l.src[l.pos] {
		case '(':
			l.skipString()
			continue
		case '[':
			depth++
		case ']':
			depth--
			if depth == 0 {
				l.pos++
				return
			}
		}
		l.pos++
	}
}

// skipBalanced пропускает <<словарь>> с вложенными словарями.
func (l *lexer) skipBalanced(open, close byte, width int) {
	depth := 0
	for l.pos < len(l.src) {
		if l.src[l.pos] == '(' {
			l.skipString()
			continue
		}
		if l.pos+width <= len(l.src) && bytes.Equal(l.src[l.pos:l.pos+width], bytes.Repeat([]byte{open}, width)) {
			depth++
			l.pos += width
			continue
		}
		if l.pos+width <= len(l.src) && bytes.Equal(l.src[l.pos:l.pos+width], bytes.Repeat([]byte{close}, width)) {
			depth--
			l.pos += width
			if depth == 0 {
				return
			}
			continue
		}
		l.pos++
	}
}

// skipInlineImage пропускает встроенную картинку BI … ID <двоичные данные> EI.
// Данные двоичные, и «EI» внутри них встречается: конец признаём, только если
// вокруг пробелы.
func (l *lexer) skipInlineImage() {
	id := bytes.Index(l.src[l.pos:], []byte("ID"))
	if id < 0 {
		l.pos = len(l.src)
		return
	}
	l.pos += id + 3
	for l.pos+2 < len(l.src) {
		if l.src[l.pos] == 'E' && l.src[l.pos+1] == 'I' &&
			isSpace(l.src[l.pos-1]) && (l.pos+2 == len(l.src) || isSpace(l.src[l.pos+2])) {
			l.pos += 2
			return
		}
		l.pos++
	}
	l.pos = len(l.src)
}
