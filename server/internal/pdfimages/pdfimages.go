// Package pdfimages достаёт иллюстрации из PDF вместе с их местом на странице.
//
// Нужен приложению: на сайте картинки вырезает из отрисованной страницы
// pdf.js в браузере, а в приложении отрисовщика PDF нет. Здесь всё на чистом
// Go — без Ghostscript и других внешних программ: разбирать загруженные
// пользователями файлы кодом на C на общей машине не стоит, у них длинная
// история уязвимостей с выполнением кода.
//
// Цена — страницы-схемы целиком здесь не достаются: нарисовать векторную
// графику без отрисовщика нельзя. Только встроенные растровые картинки.
//
// Правила отбора совпадают с web/src/lib/documentImport.ts (planPdfImages):
// мелочь, подложка под текстом и повторяющийся на многих страницах логотип
// картинкой для читателя не являются.
package pdfimages

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"math"
	"sort"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

// Image — картинка и её место. Высота считается от верха страницы вниз, как у
// строк текста в приложении (Syncfusion), а не снизу вверх, как в самом PDF.
type Image struct {
	Page       int     `json:"page"`
	CenterY    float64 `json:"centerY"`
	PageHeight float64 `json:"pageHeight"`
	Data       []byte  `json:"-"`
	MimeType   string  `json:"-"`
}

// Limits — предохранители: файл чужой, и разбор не должен съесть сервер.
type Limits struct {
	MaxPages  int
	MaxImages int
	MaxBytes  int
}

var DefaultLimits = Limits{MaxPages: 800, MaxImages: 60, MaxBytes: 8 << 20}

type matrix [6]float64

func (m matrix) mul(n matrix) matrix {
	// Порядок как у pdf.js: новая матрица применяется раньше текущей.
	return matrix{
		m[0]*n[0] + m[2]*n[1],
		m[1]*n[0] + m[3]*n[1],
		m[0]*n[2] + m[2]*n[3],
		m[1]*n[2] + m[3]*n[3],
		m[0]*n[4] + m[2]*n[5] + m[4],
		m[1]*n[4] + m[3]*n[5] + m[5],
	}
}

type box struct{ x, y, w, h float64 }

func (m matrix) unitSquare() box {
	xs := []float64{m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]}
	ys := []float64{m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]}
	minX, maxX := xs[0], xs[0]
	minY, maxY := ys[0], ys[0]
	for i := 1; i < 4; i++ {
		minX, maxX = math.Min(minX, xs[i]), math.Max(maxX, xs[i])
		minY, maxY = math.Min(minY, ys[i]), math.Max(maxY, ys[i])
	}
	return box{minX, minY, maxX - minX, maxY - minY}
}

func (b box) key() string {
	r := func(v float64) int { return int(math.Round(v / 6)) }
	return fmt.Sprintf("%d:%d:%d:%d", r(b.x), r(b.y), r(b.w), r(b.h))
}

type placement struct {
	page   int
	b      box
	sd     *types.StreamDict
	name   string
	objNr  int
	pageH  float64
	pageY0 float64
	area   float64
}

// Extract разбирает PDF. Паника внутри разборщика превращается в ошибку:
// файл присылает пользователь, и битый PDF не должен ронять сервер.
// Второе значение — число страниц документа.
func Extract(c context.Context, r io.ReadSeeker, lim Limits) (out []Image, pageCount int, err error) {
	defer func() {
		if p := recover(); p != nil {
			out, pageCount, err = nil, 0, fmt.Errorf("pdf: разбор сорвался: %v", p)
		}
	}()

	conf := model.NewDefaultConfiguration()
	conf.ValidationMode = model.ValidationRelaxed
	ctx, err := api.ReadValidateAndOptimize(c, r, conf, nil)
	if err != nil {
		return nil, 0, fmt.Errorf("pdf: %w", err)
	}

	pages := min(ctx.PageCount, lim.MaxPages)
	var found []placement
	seen := map[string]int{}
	for pageNr := 1; pageNr <= pages; pageNr++ {
		if err := c.Err(); err != nil {
			return nil, 0, err
		}
		list, err := pagePlacements(c, ctx, pageNr)
		if err != nil {
			continue // одна битая страница не повод терять остальные
		}
		keys := map[string]bool{}
		for _, p := range list {
			keys[p.b.key()] = true
		}
		for k := range keys {
			seen[k]++
		}
		found = append(found, list...)
	}

	for _, p := range found {
		if len(out) >= lim.MaxImages {
			break
		}
		area := p.b.w * p.b.h
		count := seen[p.b.key()]
		if math.Min(p.b.w, p.b.h) < 36 || area < p.area*0.015 || area > p.area*0.9 ||
			(count >= 3 && float64(count) >= float64(pages)*0.25) {
			continue
		}
		img, err := pdfcpu.ExtractImage(c, ctx, p.sd, false, p.name, p.objNr, false)
		if err != nil || img == nil {
			continue
		}
		mime := map[string]string{"jpg": "image/jpeg", "png": "image/png"}[img.FileType]
		if mime == "" {
			continue // TIFF (CMYK) и прочее: браузер и приложение их не покажут
		}
		var buf bytes.Buffer
		if _, err := io.Copy(&buf, io.LimitReader(img, int64(lim.MaxBytes)+1)); err != nil || buf.Len() > lim.MaxBytes || buf.Len() == 0 {
			continue
		}
		out = append(out, Image{
			Page:       p.page,
			CenterY:    p.pageH - (p.b.y - p.pageY0 + p.b.h/2),
			PageHeight: p.pageH,
			Data:       buf.Bytes(),
			MimeType:   mime,
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Page != out[j].Page {
			return out[i].Page < out[j].Page
		}
		return out[i].CenterY < out[j].CenterY
	})
	return out, ctx.PageCount, nil
}

func pagePlacements(c context.Context, ctx *model.Context, pageNr int) ([]placement, error) {
	d, _, inh, err := ctx.XRefTable.PageDict(c, pageNr, false)
	if err != nil || d == nil {
		return nil, fmt.Errorf("страница %d: %w", pageNr, err)
	}
	content, err := ctx.XRefTable.PageContent(d, pageNr)
	if err != nil {
		return nil, err
	}
	var res types.Dict
	if o, ok := d.Find("Resources"); ok {
		res, _ = ctx.XRefTable.DereferenceDict(o)
	}
	if res == nil && inh != nil {
		res = inh.Resources
	}
	pageH, pageY0, area := 842.0, 0.0, 595.0*842.0
	if inh != nil && inh.MediaBox != nil {
		mb := inh.MediaBox
		pageH, pageY0 = mb.Height(), mb.LL.Y
		area = mb.Width() * mb.Height()
	}
	w := walker{ctx: ctx, page: pageNr, pageH: pageH, pageY0: pageY0, area: area}
	w.walk(content, res, matrix{1, 0, 0, 1, 0, 0}, 0)
	return w.out, nil
}

type walker struct {
	ctx    *model.Context
	page   int
	pageH  float64
	pageY0 float64
	area   float64
	out    []placement
}

// walk проходит по содержимому страницы и запоминает, где нарисованы
// картинки. Формы (вложенное содержимое) проходятся с их матрицей и
// ресурсами; глубина ограничена — форма может ссылаться сама на себя.
func (w *walker) walk(content []byte, res types.Dict, ctm matrix, depth int) {
	if depth > 6 {
		return
	}
	var stack []matrix
	lex := lexer{src: content}
	var nums []float64
	var name string
	for {
		tok, kind := lex.next()
		switch kind {
		case tokEOF:
			return
		case tokNumber:
			nums = append(nums, tok.num)
			continue
		case tokName:
			name = tok.text
			continue
		case tokOther:
			continue
		}
		switch tok.text {
		case "q":
			stack = append(stack, ctm)
		case "Q":
			if n := len(stack); n > 0 {
				ctm, stack = stack[n-1], stack[:n-1]
			}
		case "cm":
			if n := len(nums); n >= 6 {
				var m matrix
				copy(m[:], nums[n-6:])
				ctm = ctm.mul(m)
			}
		case "Do":
			w.draw(name, res, ctm, depth)
		case "BI":
			lex.skipInlineImage()
		}
		nums = nums[:0]
		name = ""
	}
}

func (w *walker) draw(name string, res types.Dict, ctm matrix, depth int) {
	if name == "" || res == nil {
		return
	}
	xo, ok := res.Find("XObject")
	if !ok {
		return
	}
	xobjects, err := w.ctx.XRefTable.DereferenceDict(xo)
	if err != nil || xobjects == nil {
		return
	}
	ref, ok := xobjects.Find(name)
	if !ok {
		return
	}
	objNr := 0
	if ir, ok := ref.(types.IndirectRef); ok {
		objNr = ir.ObjectNumber.Value()
	}
	sd, _, err := w.ctx.XRefTable.DereferenceStreamDict(ref)
	if err != nil || sd == nil {
		return
	}
	switch sub := sd.Subtype(); {
	case sub != nil && *sub == "Image":
		w.out = append(w.out, placement{
			page: w.page, b: ctm.unitSquare(), sd: sd, name: name, objNr: objNr,
			pageH: w.pageH, pageY0: w.pageY0, area: w.area,
		})
	case sub != nil && *sub == "Form":
		if err := sd.Decode(); err != nil {
			return
		}
		inner := ctm
		if arr := sd.ArrayEntry("Matrix"); len(arr) == 6 {
			var m matrix
			for i, o := range arr {
				m[i] = number(o)
			}
			inner = ctm.mul(m)
		}
		formRes := res
		if o, ok := sd.Find("Resources"); ok {
			if d, err := w.ctx.XRefTable.DereferenceDict(o); err == nil && d != nil {
				formRes = d
			}
		}
		w.walk(sd.Content, formRes, inner, depth+1)
	}
}

func number(o types.Object) float64 {
	switch v := o.(type) {
	case types.Integer:
		return float64(v.Value())
	case types.Float:
		return v.Value()
	}
	return 0
}
