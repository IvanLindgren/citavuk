// Command sprite_build превращает исходные PNG-кадры Читавука в прозрачные
// sprite atlas + manifest для Flutter.
//
// Исходники не изменяются и не удаляются: инструмент только читает
// animations/source/<анимация>/*.png и пишет производные ассеты
// (master-prompt §11).
//
// Запуск из корня репозитория:
//
//	go run ./tools/sprite_build            # обработка + QA-листы
//	go run ./tools/sprite_build -check     # только проверка актуальности atlas
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// animationSpec описывает, как обрабатывать одну последовательность и какие
// состояния маскота она обслуживает (§11.5).
type animationSpec struct {
	ID     string
	Source string
	FPS    int
	Loop   bool
	States []string
}

var animations = []animationSpec{
	{
		ID:     "citavuk_learning",
		Source: "learning_citavuk",
		FPS:    8,
		Loop:   true,
		// Вариаций меньше, чем состояний, поэтому переиспользуем ближайшие
		// по смыслу: спокойный «читающий» Читавук годится и для подсказки,
		// и для разбора ошибки (§11.5).
		States: []string{"idle", "thinking", "hint", "incorrect", "encourage"},
	},
	{
		ID:     "citavuk_surprise",
		Source: "surprise_citavuk",
		FPS:    12,
		Loop:   false,
		States: []string{"correct", "lessonComplete", "checkpoint", "finalCelebration"},
	},
}

func main() {
	var (
		sourceDir   = flag.String("source", "animations/source", "каталог исходных кадров")
		outDir      = flag.String("out", "frontend/assets/animations/generated", "каталог сгенерированных ассетов")
		qaDir       = flag.String("qa", "animations/qa", "каталог листов визуальной проверки")
		frameHeight = flag.Int("frame-height", 512, "высота кадра в atlas")
		maxTexture  = flag.Int("max-texture", 2048, "максимальный размер текстуры")
		threshold   = flag.Float64("threshold", 22, "порог цветового расстояния до фона")
		feather     = flag.Int("feather", 1, "радиус смягчения края в пикселях")
		padding     = flag.Int("padding", 8, "отступ вокруг персонажа")
		minFg       = flag.Float64("min-foreground", 0.10, "минимальная доля персонажа в кадре")
		maxFg       = flag.Float64("max-foreground", 0.92, "максимальная доля персонажа в кадре")
		check       = flag.Bool("check", false, "только проверить актуальность manifest")
	)
	flag.Parse()

	root, err := findRepoRoot()
	if err != nil {
		fail(err)
	}
	resolve := func(p string) string {
		if filepath.IsAbs(p) {
			return p
		}
		return filepath.Join(root, p)
	}

	cfg := pipelineConfig{
		sourceDir:   resolve(*sourceDir),
		outDir:      resolve(*outDir),
		qaDir:       resolve(*qaDir),
		frameHeight: *frameHeight,
		maxTexture:  *maxTexture,
		threshold:   *threshold,
		feather:     *feather,
		padding:     *padding,
		minFg:       *minFg,
		maxFg:       *maxFg,
	}

	if *check {
		if err := checkManifest(cfg); err != nil {
			fail(err)
		}
		fmt.Println("manifest актуален")
		return
	}
	if err := run(cfg); err != nil {
		fail(err)
	}
}

func fail(err error) {
	fmt.Fprintf(os.Stderr, "sprite_build: %v\n", err)
	os.Exit(1)
}

type pipelineConfig struct {
	sourceDir   string
	outDir      string
	qaDir       string
	frameHeight int
	maxTexture  int
	threshold   float64
	feather     int
	padding     int
	minFg       float64
	maxFg       float64
}

func run(cfg pipelineConfig) error {
	if err := os.MkdirAll(cfg.outDir, 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(cfg.qaDir, 0o755); err != nil {
		return err
	}

	manifest := ManifestFile{Version: 1}
	for _, spec := range animations {
		m, err := processAnimation(cfg, spec)
		if err != nil {
			return fmt.Errorf("%s: %w", spec.ID, err)
		}
		manifest.Animations = append(manifest.Animations, m)
	}

	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(cfg.outDir, "manifest.json")
	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		return err
	}
	fmt.Printf("manifest: %s\n", filepath.ToSlash(path))
	return nil
}

func processAnimation(cfg pipelineConfig, spec animationSpec) (Manifest, error) {
	dir := filepath.Join(cfg.sourceDir, spec.Source)
	paths, err := listFrames(dir)
	if err != nil {
		return Manifest{}, err
	}
	if len(paths) == 0 {
		return Manifest{}, fmt.Errorf("в %s нет PNG-кадров", filepath.ToSlash(dir))
	}
	fmt.Printf("\n%s — %d кадров из %s\n", spec.ID, len(paths), filepath.ToSlash(dir))

	checksum, err := sequenceChecksum(paths)
	if err != nil {
		return Manifest{}, err
	}

	originals := make([]*image.RGBA, 0, len(paths))
	cleaned := make([]*image.RGBA, 0, len(paths))
	var canvas image.Rectangle

	for i, p := range paths {
		img, err := loadRGBA(p)
		if err != nil {
			return Manifest{}, fmt.Errorf("кадр %s: %w", filepath.Base(p), err)
		}
		// Одинаковый canvas у всей последовательности — иначе кадры нельзя
		// стабилизировать общей обрезкой.
		if i == 0 {
			canvas = img.Bounds()
		} else if img.Bounds() != canvas {
			return Manifest{}, fmt.Errorf(
				"кадр %s имеет размер %v, а первый — %v: последовательность неоднородна",
				filepath.Base(p), img.Bounds().Size(), canvas.Size())
		}

		palette, err := estimatePalette(img, 12, 8)
		if err != nil {
			return Manifest{}, fmt.Errorf("кадр %s: %w", filepath.Base(p), err)
		}
		result := removeBackground(img, palette, cfg.threshold, cfg.feather)

		// Защита от «съеденного» персонажа и от нетронутого фона.
		if result.foregroundRatio < cfg.minFg {
			return Manifest{}, fmt.Errorf(
				"кадр %s: после удаления фона осталось лишь %.1f%% пикселей — "+
					"вероятно, вырезана часть персонажа (порог -threshold=%.0f)",
				filepath.Base(p), result.foregroundRatio*100, cfg.threshold)
		}
		if result.foregroundRatio > cfg.maxFg {
			return Manifest{}, fmt.Errorf(
				"кадр %s: непрозрачными остались %.1f%% пикселей — фон почти не удалён",
				filepath.Base(p), result.foregroundRatio*100)
		}
		if result.touchesBorder {
			fmt.Printf("  ВНИМАНИЕ %s: персонаж касается границы кадра\n", filepath.Base(p))
		}
		fmt.Printf("  %-52s персонаж %.1f%%\n",
			truncate(filepath.Base(p), 52), result.foregroundRatio*100)

		originals = append(originals, img)
		cleaned = append(cleaned, result.rgba)
	}

	// Диагностика стабильности: если bbox персонажа заметно гуляет между
	// кадрами, при воспроизведении будет виден скачок размера. Это свойство
	// исходников, а не обработки, поэтому только сообщаем (§11.1, §11.7).
	reportFrameStability(paths, cleaned)

	// Общая обрезка для всей последовательности — без дрожания.
	crop := commonCrop(cleaned, cfg.padding, 8)
	frames := make([]*image.RGBA, 0, len(cleaned))
	scale := float64(cfg.frameHeight) / float64(crop.Dy())
	frameWidth := int(float64(crop.Dx()) * scale)
	for _, c := range cleaned {
		frames = append(frames, resize(cropTo(c, crop), frameWidth, cfg.frameHeight))
	}
	fmt.Printf("  обрезка %dx%d → кадр %dx%d\n",
		crop.Dx(), crop.Dy(), frameWidth, cfg.frameHeight)

	atlas, columns, rows := packAtlas(frames, cfg.maxTexture)
	if atlas.Bounds().Dx() > cfg.maxTexture || atlas.Bounds().Dy() > cfg.maxTexture {
		return Manifest{}, fmt.Errorf(
			"atlas %dx%d превышает лимит текстуры %d: уменьши -frame-height",
			atlas.Bounds().Dx(), atlas.Bounds().Dy(), cfg.maxTexture)
	}

	assetName := spec.ID + ".png"
	if err := savePNG(filepath.Join(cfg.outDir, assetName), atlas); err != nil {
		return Manifest{}, err
	}
	fmt.Printf("  atlas %dx%d (%d×%d)\n",
		atlas.Bounds().Dx(), atlas.Bounds().Dy(), columns, rows)

	if err := writeQA(cfg, spec, originals, frames); err != nil {
		return Manifest{}, err
	}

	return Manifest{
		ID:             spec.ID,
		Asset:          "assets/animations/generated/" + assetName,
		FrameWidth:     frameWidth,
		FrameHeight:    cfg.frameHeight,
		Columns:        columns,
		Rows:           rows,
		Frames:         len(frames),
		FPS:            spec.FPS,
		Loop:           spec.Loop,
		Anchor:         Anchor{X: 0.5, Y: 1.0},
		SourceChecksum: checksum,
		States:         spec.States,
	}, nil
}

// reportFrameStability печатает размеры силуэта по кадрам и предупреждает,
// если разброс велик.
func reportFrameStability(paths []string, frames []*image.RGBA) {
	minW, minH := 1<<30, 1<<30
	maxW, maxH := 0, 0
	for i, f := range frames {
		r := alphaBounds(f, 8)
		fmt.Printf("  bbox %-2d %4dx%-4d при (%d,%d)   %s\n",
			i+1, r.Dx(), r.Dy(), r.Min.X, r.Min.Y, truncate(filepath.Base(paths[i]), 40))
		minW, maxW = min(minW, r.Dx()), max(maxW, r.Dx())
		minH, maxH = min(minH, r.Dy()), max(maxH, r.Dy())
	}
	if maxH == 0 {
		return
	}
	spread := float64(maxH-minH) / float64(maxH)
	if spread > 0.10 {
		fmt.Printf("  ВНИМАНИЕ разброс высоты силуэта %.0f%% (%d…%d px): исходные кадры\n"+
			"           нарисованы в разном масштабе, при проигрывании будет скачок размера\n",
			spread*100, minH, maxH)
	}
}

// writeQA формирует листы визуальной проверки (master-prompt §11.7).
func writeQA(cfg pipelineConfig, spec animationSpec, originals, frames []*image.RGBA) error {
	dir := filepath.Join(cfg.qaDir, spec.ID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	white := color.RGBA{255, 255, 255, 255}
	dark := color.RGBA{22, 19, 16, 255} // SerbColors.nightBg
	red := color.RGBA{158, 43, 37, 255} // SerbColors.serbRed

	sheets := map[string]*image.RGBA{
		"01_before.png":      contactSheet(originals, 180, white),
		"02_after_light.png": contactSheet(frames, 180, white),
		"03_after_dark.png":  contactSheet(frames, 180, dark),
		"04_after_red.png":   contactSheet(frames, 180, red),
		"05_alpha_matte.png": contactSheet(mattes(frames), 180, color.RGBA{0, 0, 0, 255}),
		"06_frame_light.png": composite(frames[0], white),
		"07_frame_dark.png":  composite(frames[0], dark),
	}
	for name, img := range sheets {
		if err := savePNG(filepath.Join(dir, name), img); err != nil {
			return err
		}
	}
	fmt.Printf("  QA: %s\n", filepath.ToSlash(dir))
	return nil
}

func mattes(frames []*image.RGBA) []*image.RGBA {
	out := make([]*image.RGBA, 0, len(frames))
	for _, f := range frames {
		out = append(out, alphaMatte(f))
	}
	return out
}

// checkManifest сверяет контрольные суммы исходников с записанными в manifest.
func checkManifest(cfg pipelineConfig) error {
	raw, err := os.ReadFile(filepath.Join(cfg.outDir, "manifest.json"))
	if err != nil {
		return fmt.Errorf("manifest не найден: %w", err)
	}
	var mf ManifestFile
	if err := json.Unmarshal(raw, &mf); err != nil {
		return err
	}
	byID := map[string]Manifest{}
	for _, m := range mf.Animations {
		byID[m.ID] = m
	}
	for _, spec := range animations {
		m, ok := byID[spec.ID]
		if !ok {
			return fmt.Errorf("в manifest нет анимации %q", spec.ID)
		}
		paths, err := listFrames(filepath.Join(cfg.sourceDir, spec.Source))
		if err != nil {
			return err
		}
		sum, err := sequenceChecksum(paths)
		if err != nil {
			return err
		}
		if sum != m.SourceChecksum {
			return fmt.Errorf(
				"%s: исходные кадры изменились — atlas устарел, пересобери sprite_build",
				spec.ID)
		}
	}
	return nil
}

var trailingNumber = regexp.MustCompile(`(\d+)(?:\D*)$`)

// listFrames возвращает PNG-кадры в естественном числовом порядке.
//
// Лексикографическая сортировка здесь неверна: «(10)» встало бы перед «(2)».
func listFrames(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	type frame struct {
		path string
		num  int
	}
	var frames []frame
	for _, e := range entries {
		if e.IsDir() || !strings.EqualFold(filepath.Ext(e.Name()), ".png") {
			continue
		}
		num := 0
		if m := trailingNumber.FindStringSubmatch(strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))); m != nil {
			num, _ = strconv.Atoi(m[1])
		}
		frames = append(frames, frame{filepath.Join(dir, e.Name()), num})
	}
	sort.SliceStable(frames, func(i, j int) bool {
		if frames[i].num != frames[j].num {
			return frames[i].num < frames[j].num
		}
		return frames[i].path < frames[j].path
	})
	out := make([]string, 0, len(frames))
	for _, f := range frames {
		out = append(out, f.path)
	}
	return out, nil
}

func sequenceChecksum(paths []string) (string, error) {
	h := sha256.New()
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			return "", err
		}
		h.Write([]byte(filepath.Base(p)))
		h.Write(data)
	}
	return "sha256:" + hex.EncodeToString(h.Sum(nil)), nil
}

func loadRGBA(path string) (*image.RGBA, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	img, err := png.Decode(f)
	if err != nil {
		return nil, err
	}
	b := img.Bounds()
	out := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	for y := 0; y < b.Dy(); y++ {
		for x := 0; x < b.Dx(); x++ {
			r, g, bl, a := img.At(b.Min.X+x, b.Min.Y+y).RGBA()
			out.SetRGBA(x, y, color.RGBA{
				uint8(r >> 8), uint8(g >> 8), uint8(bl >> 8), uint8(a >> 8),
			})
		}
	}
	return out, nil
}

func savePNG(path string, img image.Image) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return png.Encode(f, img)
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}

func findRepoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "animations", "source")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("не найден корень репозитория (animations/source)")
		}
		dir = parent
	}
}
