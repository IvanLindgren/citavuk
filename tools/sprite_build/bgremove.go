package main

import (
	"fmt"
	"image"
	"image/color"
	"math"
	"sort"
)

// Исходные кадры Читавука отрисованы поверх «шахматки прозрачности»:
// два чередующихся светлых тона, запечённых в RGB. Поэтому фон описывается
// палитрой из нескольких тонов, а не одним цветом.
type bgPalette struct {
	tones []color.RGBA
}

// distance возвращает расстояние до ближайшего тона фона.
func (p bgPalette) distance(c color.RGBA) float64 {
	best := math.MaxFloat64
	for _, t := range p.tones {
		dr := float64(c.R) - float64(t.R)
		dg := float64(c.G) - float64(t.G)
		db := float64(c.B) - float64(t.B)
		d := math.Sqrt(dr*dr + dg*dg + db*db)
		if d < best {
			best = d
		}
	}
	return best
}

// nearest возвращает ближайший тон фона — нужен для снятия ореола.
func (p bgPalette) nearest(c color.RGBA) color.RGBA {
	best := math.MaxFloat64
	out := p.tones[0]
	for _, t := range p.tones {
		dr := float64(c.R) - float64(t.R)
		dg := float64(c.G) - float64(t.G)
		db := float64(c.B) - float64(t.B)
		d := math.Sqrt(dr*dr + dg*dg + db*db)
		if d < best {
			best = d
			out = t
		}
	}
	return out
}

// estimatePalette собирает палитру фона по рамке кадра.
//
// Берутся только приграничные пиксели: персонаж их не касается. Похожие
// оттенки (шум генератора) сливаются в один тон.
func estimatePalette(img *image.RGBA, borderWidth int, mergeDistance float64) (bgPalette, error) {
	b := img.Bounds()
	counts := map[color.RGBA]int{}
	add := func(x, y int) {
		c := rgbaAt(img, x, y)
		counts[color.RGBA{c.R, c.G, c.B, 255}]++
	}
	for x := b.Min.X; x < b.Max.X; x++ {
		for i := 0; i < borderWidth; i++ {
			add(x, b.Min.Y+i)
			add(x, b.Max.Y-1-i)
		}
	}
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for i := 0; i < borderWidth; i++ {
			add(b.Min.X+i, y)
			add(b.Max.X-1-i, y)
		}
	}
	if len(counts) == 0 {
		return bgPalette{}, fmt.Errorf("не удалось прочитать рамку кадра")
	}

	type entry struct {
		c color.RGBA
		n int
	}
	entries := make([]entry, 0, len(counts))
	total := 0
	for c, n := range counts {
		entries = append(entries, entry{c, n})
		total += n
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].n > entries[j].n })

	var palette bgPalette
	covered := 0
	for _, e := range entries {
		// Тон уже представлен близким соседом — просто засчитываем покрытие.
		if len(palette.tones) > 0 && palette.distance(e.c) <= mergeDistance {
			covered += e.n
			continue
		}
		// Значимым считаем тон, занимающий заметную долю рамки.
		if float64(e.n)/float64(total) < 0.02 {
			continue
		}
		palette.tones = append(palette.tones, e.c)
		covered += e.n
		if len(palette.tones) >= 4 {
			break
		}
	}
	if len(palette.tones) == 0 {
		return bgPalette{}, fmt.Errorf("не найден доминирующий тон фона")
	}
	if ratio := float64(covered) / float64(total); ratio < 0.8 {
		return bgPalette{}, fmt.Errorf(
			"палитра фона покрывает лишь %.0f%% рамки — фон неоднороден, "+
				"автоматическая обработка ненадёжна", ratio*100)
	}
	return palette, nil
}

// removalResult — результат удаления фона одного кадра.
type removalResult struct {
	rgba *image.RGBA

	// Доля пикселей, признанных персонажем.
	foregroundRatio float64

	// true, если персонаж касается границы кадра (риск обрезанных ушей/лап).
	touchesBorder bool
}

// removeBackground делает фон прозрачным заливкой от границ кадра.
//
// Заливается только фон, связанный с границей: светлые области внутри
// персонажа (рубаха, белки глаз, страницы книги) окружены тёмным контуром и
// поэтому остаются непрозрачными. Глобальная замена «убрать всё белое»
// вырезала бы их (master-prompt §11.2).
func removeBackground(src *image.RGBA, palette bgPalette, threshold float64, feather int) removalResult {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()

	// isBg[i] — пиксель отнесён к фону заливкой от границы.
	isBg := make([]bool, w*h)
	queue := make([]int, 0, w*2+h*2)

	matches := func(i int) bool {
		x := b.Min.X + i%w
		y := b.Min.Y + i/w
		return palette.distance(rgbaAt(src, x, y)) <= threshold
	}

	push := func(i int) {
		if isBg[i] || !matches(i) {
			return
		}
		isBg[i] = true
		queue = append(queue, i)
	}

	for x := 0; x < w; x++ {
		push(x)
		push((h-1)*w + x)
	}
	for y := 0; y < h; y++ {
		push(y * w)
		push(y*w + w - 1)
	}

	// BFS по 4-связности.
	for head := 0; head < len(queue); head++ {
		i := queue[head]
		x, y := i%w, i/w
		if x > 0 {
			push(i - 1)
		}
		if x < w-1 {
			push(i + 1)
		}
		if y > 0 {
			push(i - w)
		}
		if y < h-1 {
			push(i + w)
		}
	}

	out := image.NewRGBA(image.Rect(0, 0, w, h))
	foreground := 0
	touches := false

	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			i := y*w + x
			src := rgbaAt(src, b.Min.X+x, b.Min.Y+y)
			if isBg[i] {
				out.SetRGBA(x, y, color.RGBA{})
				continue
			}
			foreground++
			if x == 0 || y == 0 || x == w-1 || y == h-1 {
				touches = true
			}
			out.SetRGBA(x, y, color.RGBA{src.R, src.G, src.B, 255})
		}
	}

	if feather > 0 {
		featherEdges(out, isBg, w, h, palette, feather)
	}

	return removalResult{
		rgba:            out,
		foregroundRatio: float64(foreground) / float64(w*h),
		touchesBorder:   touches,
	}
}

// featherEdges делает край мягким и снимает цветовой ореол.
//
// Пиксель на границе с фоном получает частичную альфу, а его цвет
// «размешивается обратно»: из наблюдаемого цвета вычитается вклад фона.
// Без этого по контуру остаётся светлая кайма от шахматки.
func featherEdges(img *image.RGBA, isBg []bool, w, h int, palette bgPalette, radius int) {
	type update struct {
		x, y int
		c    color.RGBA
	}
	var updates []update

	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			if isBg[y*w+x] {
				continue
			}
			// Сколько соседей в радиусе — фон.
			bgNeighbours, total := 0, 0
			for dy := -radius; dy <= radius; dy++ {
				for dx := -radius; dx <= radius; dx++ {
					nx, ny := x+dx, y+dy
					if nx < 0 || ny < 0 || nx >= w || ny >= h {
						continue
					}
					total++
					if isBg[ny*w+nx] {
						bgNeighbours++
					}
				}
			}
			if bgNeighbours == 0 || total == 0 {
				continue
			}

			c := rgbaAt(img, x, y)
			// Доля фона вокруг задаёт прозрачность края.
			coverage := 1.0 - float64(bgNeighbours)/float64(total)
			alpha := 0.35 + 0.65*coverage // край не исчезает полностью
			if alpha > 1 {
				alpha = 1
			}

			// Снятие ореола: C_fg = (C - (1-a)*C_bg) / a.
			bg := palette.nearest(c)
			unmix := func(observed, background uint8) uint8 {
				v := (float64(observed) - (1-alpha)*float64(background)) / alpha
				if v < 0 {
					v = 0
				}
				if v > 255 {
					v = 255
				}
				return uint8(v)
			}
			updates = append(updates, update{x, y, color.RGBA{
				R: unmix(c.R, bg.R),
				G: unmix(c.G, bg.G),
				B: unmix(c.B, bg.B),
				A: uint8(alpha * 255),
			}})
		}
	}

	for _, u := range updates {
		img.SetRGBA(u.x, u.y, u.c)
	}
}

func rgbaAt(img *image.RGBA, x, y int) color.RGBA {
	i := img.PixOffset(x, y)
	return color.RGBA{img.Pix[i], img.Pix[i+1], img.Pix[i+2], img.Pix[i+3]}
}
