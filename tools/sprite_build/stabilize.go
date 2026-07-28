package main

import (
	"image"
	"image/color"
)

// alphaBounds — прямоугольник непрозрачных пикселей.
func alphaBounds(img *image.RGBA, minAlpha uint8) image.Rectangle {
	b := img.Bounds()
	minX, minY := b.Max.X, b.Max.Y
	maxX, maxY := b.Min.X, b.Min.Y
	found := false
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if img.Pix[img.PixOffset(x, y)+3] < minAlpha {
				continue
			}
			found = true
			if x < minX {
				minX = x
			}
			if y < minY {
				minY = y
			}
			if x > maxX {
				maxX = x
			}
			if y > maxY {
				maxY = y
			}
		}
	}
	if !found {
		return image.Rectangle{}
	}
	return image.Rect(minX, minY, maxX+1, maxY+1)
}

// commonCrop вычисляет один прямоугольник обрезки для всей последовательности.
//
// Все кадры режутся одинаково, поэтому персонаж не «прыгает» между кадрами, а
// собственное движение анимации сохраняется (master-prompt §11.3). Обрезка по
// каждому кадру отдельно как раз и создала бы дрожание.
func commonCrop(frames []*image.RGBA, padding int, minAlpha uint8) image.Rectangle {
	var union image.Rectangle
	for _, f := range frames {
		r := alphaBounds(f, minAlpha)
		if r.Empty() {
			continue
		}
		if union.Empty() {
			union = r
			continue
		}
		union = union.Union(r)
	}
	if union.Empty() {
		return frames[0].Bounds()
	}
	union = union.Inset(-padding)
	return union.Intersect(frames[0].Bounds())
}

// cropTo вырезает область без изменения пропорций.
func cropTo(img *image.RGBA, r image.Rectangle) *image.RGBA {
	out := image.NewRGBA(image.Rect(0, 0, r.Dx(), r.Dy()))
	for y := 0; y < r.Dy(); y++ {
		for x := 0; x < r.Dx(); x++ {
			out.SetRGBA(x, y, rgbaAt(img, r.Min.X+x, r.Min.Y+y))
		}
	}
	return out
}

// resize уменьшает изображение усреднением по площади.
//
// Работа ведётся в premultiplied-пространстве: иначе полупрозрачные краевые
// пиксели затянут в результат цвет несуществующего фона и появится кайма.
func resize(img *image.RGBA, width, height int) *image.RGBA {
	src := img.Bounds()
	if width == src.Dx() && height == src.Dy() {
		return img
	}
	out := image.NewRGBA(image.Rect(0, 0, width, height))
	xRatio := float64(src.Dx()) / float64(width)
	yRatio := float64(src.Dy()) / float64(height)

	for y := 0; y < height; y++ {
		y0 := int(float64(y) * yRatio)
		y1 := int(float64(y+1) * yRatio)
		if y1 <= y0 {
			y1 = y0 + 1
		}
		for x := 0; x < width; x++ {
			x0 := int(float64(x) * xRatio)
			x1 := int(float64(x+1) * xRatio)
			if x1 <= x0 {
				x1 = x0 + 1
			}
			var sr, sg, sb, sa, n float64
			for sy := y0; sy < y1 && sy < src.Dy(); sy++ {
				for sx := x0; sx < x1 && sx < src.Dx(); sx++ {
					c := rgbaAt(img, src.Min.X+sx, src.Min.Y+sy)
					a := float64(c.A) / 255
					sr += float64(c.R) * a
					sg += float64(c.G) * a
					sb += float64(c.B) * a
					sa += float64(c.A)
					n++
				}
			}
			if n == 0 {
				continue
			}
			alpha := sa / n
			if alpha < 0.5 {
				out.SetRGBA(x, y, color.RGBA{})
				continue
			}
			// Обратно из premultiplied.
			k := n * (alpha / 255)
			out.SetRGBA(x, y, color.RGBA{
				R: clamp8(sr / k),
				G: clamp8(sg / k),
				B: clamp8(sb / k),
				A: clamp8(alpha),
			})
		}
	}
	return out
}

func clamp8(v float64) uint8 {
	if v < 0 {
		return 0
	}
	if v > 255 {
		return 255
	}
	return uint8(v + 0.5)
}
