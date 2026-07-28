package main

import (
	"image"
	"image/color"
	"math"
)

// Manifest описывает собранный atlas для Flutter (master-prompt §11.4).
type Manifest struct {
	ID          string `json:"id"`
	Asset       string `json:"asset"`
	FrameWidth  int    `json:"frameWidth"`
	FrameHeight int    `json:"frameHeight"`
	Columns     int    `json:"columns"`
	Rows        int    `json:"rows"`
	Frames      int    `json:"frames"`
	FPS         int    `json:"fps"`
	Loop        bool   `json:"loop"`
	Anchor      Anchor `json:"anchor"`

	// Контрольная сумма исходной последовательности: позволяет понять, что
	// atlas устарел относительно исходных кадров.
	SourceChecksum string `json:"sourceChecksum"`

	// Состояния маскота, которые отрисовываются этой анимацией.
	States []string `json:"states"`
}

type Anchor struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// ManifestFile — корневой файл манифеста.
type ManifestFile struct {
	Version    int        `json:"version"`
	Animations []Manifest `json:"animations"`
}

// packAtlas раскладывает кадры сеткой. Сетка выбирается как можно ближе к
// квадрату, чтобы не упереться в ограничение размера текстуры.
func packAtlas(frames []*image.RGBA, maxTexture int) (*image.RGBA, int, int) {
	n := len(frames)
	fw := frames[0].Bounds().Dx()
	fh := frames[0].Bounds().Dy()

	columns := int(math.Ceil(math.Sqrt(float64(n))))
	for columns < n && columns*fw > maxTexture {
		columns--
	}
	if columns < 1 {
		columns = 1
	}
	rows := int(math.Ceil(float64(n) / float64(columns)))

	atlas := image.NewRGBA(image.Rect(0, 0, columns*fw, rows*fh))
	for i, frame := range frames {
		ox := (i % columns) * fw
		oy := (i / columns) * fh
		for y := 0; y < fh; y++ {
			for x := 0; x < fw; x++ {
				atlas.SetRGBA(ox+x, oy+y, rgbaAt(frame, x, y))
			}
		}
	}
	return atlas, columns, rows
}

// composite кладёт изображение на сплошной фон — для превью визуальной
// проверки на светлом, тёмном и контрастном фоне.
func composite(img *image.RGBA, bg color.RGBA) *image.RGBA {
	b := img.Bounds()
	out := image.NewRGBA(b)
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			c := rgbaAt(img, x, y)
			a := float64(c.A) / 255
			out.SetRGBA(x, y, color.RGBA{
				R: clamp8(float64(c.R)*a + float64(bg.R)*(1-a)),
				G: clamp8(float64(c.G)*a + float64(bg.G)*(1-a)),
				B: clamp8(float64(c.B)*a + float64(bg.B)*(1-a)),
				A: 255,
			})
		}
	}
	return out
}

// alphaMatte визуализирует альфа-канал: белое — персонаж, чёрное — прозрачно.
func alphaMatte(img *image.RGBA) *image.RGBA {
	b := img.Bounds()
	out := image.NewRGBA(b)
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			a := img.Pix[img.PixOffset(x, y)+3]
			out.SetRGBA(x, y, color.RGBA{a, a, a, 255})
		}
	}
	return out
}

// contactSheet собирает кадры в один лист для визуальной проверки.
func contactSheet(frames []*image.RGBA, thumbHeight int, bg color.RGBA) *image.RGBA {
	if len(frames) == 0 {
		return image.NewRGBA(image.Rect(0, 0, 1, 1))
	}
	thumbs := make([]*image.RGBA, 0, len(frames))
	for _, f := range frames {
		scale := float64(thumbHeight) / float64(f.Bounds().Dy())
		w := int(float64(f.Bounds().Dx()) * scale)
		if w < 1 {
			w = 1
		}
		thumbs = append(thumbs, resize(f, w, thumbHeight))
	}
	const gap = 8
	totalWidth := gap
	for _, t := range thumbs {
		totalWidth += t.Bounds().Dx() + gap
	}
	sheet := image.NewRGBA(image.Rect(0, 0, totalWidth, thumbHeight+2*gap))
	for y := 0; y < sheet.Bounds().Dy(); y++ {
		for x := 0; x < sheet.Bounds().Dx(); x++ {
			sheet.SetRGBA(x, y, bg)
		}
	}
	ox := gap
	for _, t := range thumbs {
		for y := 0; y < t.Bounds().Dy(); y++ {
			for x := 0; x < t.Bounds().Dx(); x++ {
				c := rgbaAt(t, x, y)
				a := float64(c.A) / 255
				sheet.SetRGBA(ox+x, gap+y, color.RGBA{
					R: clamp8(float64(c.R)*a + float64(bg.R)*(1-a)),
					G: clamp8(float64(c.G)*a + float64(bg.G)*(1-a)),
					B: clamp8(float64(c.B)*a + float64(bg.B)*(1-a)),
					A: 255,
				})
			}
		}
		ox += t.Bounds().Dx() + gap
	}
	return sheet
}
