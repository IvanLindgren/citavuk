// Command course_build валидирует учебный контент курса грамматики и собирает
// его в компактный versioned bundle для Flutter.
//
// Запуск из корня репозитория:
//
//	go run ./tools/course_build                 # только валидация
//	go run ./tools/course_build -strict         # production-строгость
//	go run ./tools/course_build -out frontend/assets/course/course_bundle.json
//
// Сборка bundle всегда выполняется в strict-режиме: повреждённый контент не
// должен попасть в production (SCHEMA.md, master-prompt §27).
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

func main() {
	var (
		contentDir  = flag.String("content", "course_content", "каталог исходного контента курса")
		frontendDir = flag.String("frontend", "frontend", "каталог Flutter-приложения (для проверки ассетов)")
		bookPath    = flag.String("book", "Просвирина. Сборник упражнений (1).md", "исходный Markdown книги")
		lexiconPath = flag.String("lexicon", "lexicon.db", "словарь для сверки словоформ")
		outPath     = flag.String("out", "", "путь для сборки bundle (пусто — только валидация)")
		strict      = flag.Bool("strict", false, "строгий режим: warnings по draft-контенту становятся ошибками")
		allowDraft  = flag.Bool("allow-draft", false, "разрешить draft-контент даже в strict (override course config)")
	)
	flag.Parse()

	// Модуль живёт в tools/course_build, поэтому `go run` стартует не из корня
	// репозитория. Относительные пути разрешаем от корня, найденного по маркеру.
	root, err := findRepoRoot()
	if err != nil {
		fmt.Fprintf(os.Stderr, "course_build: %v\n", err)
		os.Exit(1)
	}
	resolve := func(p string) string {
		if p == "" || filepath.IsAbs(p) {
			return p
		}
		return filepath.Join(root, p)
	}

	if err := run(resolve(*contentDir), resolve(*frontendDir), resolve(*bookPath),
		resolve(*lexiconPath), resolve(*outPath), *strict, *allowDraft); err != nil {
		fmt.Fprintf(os.Stderr, "course_build: %v\n", err)
		os.Exit(1)
	}
}

// findRepoRoot поднимается от рабочего каталога до каталога, содержащего
// course_content/course.json.
func findRepoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "course_content", "course.json")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("не найден корень репозитория (course_content/course.json) вверх от рабочего каталога")
		}
		dir = parent
	}
}

func run(contentDir, frontendDir, bookPath, lexiconPath, outPath string, strict, allowDraftFlag bool) error {
	coursePath := filepath.Join(contentDir, "course.json")
	course, err := readCourse(coursePath)
	if err != nil {
		return err
	}

	// Сборка bundle — всегда production-строгость.
	if outPath != "" {
		strict = true
	}
	// allowDraftContent берётся из course config; флаг -allow-draft переопределяет.
	allowDraft := course.Config.AllowDraftContent || allowDraftFlag

	v := newValidator(strict, allowDraft, frontendDir)
	v.loadBook(bookPath)
	if lex, err := loadLexicon(lexiconPath); err != nil {
		v.warnf("лексикон %s не прочитан (%v): сверка словоформ пропущена",
			filepath.ToSlash(lexiconPath), err)
	} else {
		v.lex = lex
	}
	v.validateCourse(course)

	units := make([]*Unit, 0, len(course.Units))
	loaded := make([]string, 0, len(course.Units))
	for _, unitID := range course.Units {
		path := filepath.Join(contentDir, "units", unitID+".json")
		u, err := readUnit(path)
		if err != nil {
			v.errf("course.json : unit %q — %v", unitID, err)
			continue
		}
		// Краткая запись разворачивается в полную до валидации, чтобы все
		// правила проверяли ровно то, что попадёт в bundle.
		if err := normalizeUnit(u, course.Config); err != nil {
			v.errf("course.json : unit %q — %v", unitID, err)
			continue
		}
		v.validateUnit(u, unitID, filepath.ToSlash(path))
		units = append(units, u)
		loaded = append(loaded, unitID)
	}

	v.validatePrereqs()
	v.validateObjectiveCoverage()
	v.validateFinalExam(course, loaded)

	report(v, len(units), len(course.Units))

	if len(v.errors) > 0 {
		return fmt.Errorf("валидация не пройдена: %d ошибок", len(v.errors))
	}

	if outPath != "" {
		n, err := writeBundle(outPath, course, units)
		if err != nil {
			return fmt.Errorf("сборка bundle: %w", err)
		}
		fmt.Printf("bundle: %s (%d упражнений, %.1f КБ)\n", filepath.ToSlash(outPath), n.exercises, float64(n.bytes)/1024)
	}
	return nil
}

func readCourse(path string) (*Course, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("чтение %s: %w", filepath.ToSlash(path), err)
	}
	var c Course
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("%s: нечитаемый JSON: %w", filepath.ToSlash(path), err)
	}
	return &c, nil
}

func readUnit(path string) (*Unit, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("файл %s не найден", filepath.ToSlash(path))
		}
		return nil, err
	}
	var u Unit
	if err := json.Unmarshal(data, &u); err != nil {
		return nil, fmt.Errorf("нечитаемый JSON (%s): %w", filepath.ToSlash(path), err)
	}
	return &u, nil
}

// report печатает предупреждения и ошибки. Каждая строка уже содержит путь до
// конкретного элемента (master-prompt §27).
func report(v *validator, loadedUnits, declaredUnits int) {
	warnings := append([]string(nil), v.warnings...)
	sort.Strings(warnings)
	for _, w := range warnings {
		fmt.Printf("WARN  %s\n", w)
	}
	errs := append([]string(nil), v.errors...)
	sort.Strings(errs)
	for _, e := range errs {
		fmt.Fprintf(os.Stderr, "ERROR %s\n", e)
	}
	// Сверка с лексиконом: отсутствие формы не ошибка (лексикон неполон), но
	// список нужен преподавателю для ручной проверки (§29).
	if v.lex != nil && v.lex.loaded {
		fmt.Printf("лексикон: %d форм в базе, проверено %d, подтверждено %d, не найдено %d\n",
			len(v.lex.byForm), v.lexChecked, v.lexConfirmed, len(v.lexMissing))
		missing := append([]string(nil), v.lexMissing...)
		sort.Strings(missing)
		for _, m := range missing {
			fmt.Printf("  нет в лексиконе — %s\n", m)
		}
	}

	fmt.Printf("units: %d/%d загружено, lessons: %d, objectives: %d | warnings: %d, errors: %d\n",
		loadedUnits, declaredUnits, len(v.lessonIDs), len(v.objectiveIDs), len(v.warnings), len(v.errors))
}

// bundle — компактный versioned формат, который читает Flutter.
type bundle struct {
	CourseID        string     `json:"courseId"`
	CourseVersion   string     `json:"courseVersion"`
	Title           string     `json:"title"`
	Config          Config     `json:"config"`
	Units           []*Unit    `json:"units"`
	FinalExam       *FinalExam `json:"finalExam"`
	ContentChecksum string     `json:"contentChecksum"`
}

type bundleStats struct {
	exercises int
	bytes     int
}

// writeBundle собирает units в один JSON. Упражнения с blockedReason
// исключаются: они не должны показываться пользователю.
//
// Вывод детерминирован — никаких timestamps, чтобы пересборка без изменений
// контента давала побайтово тот же файл.
func writeBundle(path string, course *Course, units []*Unit) (bundleStats, error) {
	var stats bundleStats
	out := make([]*Unit, 0, len(units))
	for _, u := range units {
		cu := *u
		cu.Skills = make([]Skill, 0, len(u.Skills))
		for _, sk := range u.Skills {
			csk := sk
			csk.Lessons = make([]Lesson, 0, len(sk.Lessons))
			for _, l := range sk.Lessons {
				cl := l
				cl.Exercises = make([]json.RawMessage, 0, len(l.Exercises))
				for _, raw := range l.Exercises {
					var probe struct {
						BlockedReason string `json:"blockedReason"`
					}
					if err := json.Unmarshal(raw, &probe); err == nil && probe.BlockedReason != "" {
						continue
					}
					cl.Exercises = append(cl.Exercises, raw)
					stats.exercises++
				}
				csk.Lessons = append(csk.Lessons, cl)
			}
			cu.Skills = append(cu.Skills, csk)
		}
		out = append(out, &cu)
	}

	b := bundle{
		CourseID:      course.CourseID,
		CourseVersion: course.CourseVersion,
		Title:         course.Title,
		Config:        course.Config,
		Units:         out,
		FinalExam:     course.FinalExam,
	}
	// Checksum считается по содержимому без самого поля checksum.
	payload, err := json.Marshal(b)
	if err != nil {
		return stats, err
	}
	sum := sha256.Sum256(payload)
	b.ContentChecksum = "sha256:" + hex.EncodeToString(sum[:])

	data, err := json.Marshal(b)
	if err != nil {
		return stats, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return stats, err
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return stats, err
	}
	stats.bytes = len(data)
	return stats, nil
}
