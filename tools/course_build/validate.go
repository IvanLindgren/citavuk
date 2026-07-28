package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// validator собирает ошибки и предупреждения с контекстными путями вида
// "units/u_padezi.json → lesson l_padezi_1 → exercise ex_... : описание".
type validator struct {
	errors   []string
	warnings []string

	strict           bool
	allowDraft       bool
	frontendDir      string
	bookLines        int    // 0, если книга не загружена
	bookHash         string // "sha256:<hex>", пусто если книга не загружена
	bookHashMismatch bool   // уже сообщали о mismatch, чтобы не спамить

	// Лексикон для сверки словоформ; nil или незагруженный — проверка
	// пропускается.
	lex *lexicon
	// Формы, которых нет в лексиконе: не ошибка, но список для преподавателя.
	lexMissing   []string
	lexChecked   int
	lexConfirmed int

	seenIDs      map[string]string // id → где встречен (для duplicate check)
	objectiveIDs map[string]bool
	lessonIDs    map[string]bool
	skillIDs     map[string]bool
	skillUnit    map[string]string // skillID → unitID (для покрытия в finalExam)
	// покрытие objectives упражнениями: skillID -> objectiveID -> covered
	objectiveCoverage map[string]map[string]bool
	// граф prerequisites: lessonID -> []lessonID
	prereqGraph map[string][]string
}

func newValidator(strict, allowDraft bool, frontendDir string) *validator {
	return &validator{
		strict:            strict,
		allowDraft:        allowDraft,
		frontendDir:       frontendDir,
		seenIDs:           map[string]string{},
		objectiveIDs:      map[string]bool{},
		lessonIDs:         map[string]bool{},
		skillIDs:          map[string]bool{},
		skillUnit:         map[string]string{},
		objectiveCoverage: map[string]map[string]bool{},
		prereqGraph:       map[string][]string{},
	}
}

func (v *validator) errf(format string, args ...any) {
	v.errors = append(v.errors, fmt.Sprintf(format, args...))
}

func (v *validator) warnf(format string, args ...any) {
	v.warnings = append(v.warnings, fmt.Sprintf(format, args...))
}

// claimID регистрирует глобальный ID (правило 1: duplicate IDs).
func (v *validator) claimID(ctx, kind, id string) bool {
	if id == "" {
		v.errf("%s : пустой %s ID", ctx, kind)
		return false
	}
	if where, dup := v.seenIDs[id]; dup {
		v.errf("%s : duplicate %s ID %q (впервые в %s)", ctx, kind, id, where)
		return false
	}
	v.seenIDs[id] = ctx
	return true
}

// loadBook читает исходный Markdown книги: число строк и sha256.
func (v *validator) loadBook(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		v.warnf("книга %q не найдена (%v): проверки sourceAnchor/sourceEditionOrFileHash пропущены", path, err)
		return
	}
	sum := sha256.Sum256(data)
	v.bookHash = "sha256:" + hex.EncodeToString(sum[:])
	text := strings.ReplaceAll(string(data), "\r\n", "\n")
	v.bookLines = len(strings.Split(text, "\n"))
}

var anchorRe = regexp.MustCompile(`^md:(\d+)-(\d+)$`)

var validReviewStatuses = map[string]bool{
	"draft":            true,
	"machine_checked":  true,
	"teacher_reviewed": true,
}

// checkSourceRef — правило 7 (обязательные поля, anchor в пределах файла)
// и сверка хэша книги (mismatch → warning).
func (v *validator) checkSourceRef(ctx string, sr *SourceRef) {
	if sr == nil {
		v.errf("%s : отсутствует sourceRef (provenance обязателен)", ctx)
		return
	}
	if sr.SourceBook == "" {
		v.errf("%s : sourceRef.sourceBook пуст", ctx)
	}
	if sr.SourceHeading == "" {
		v.errf("%s : sourceRef.sourceHeading пуст", ctx)
	}
	if sr.ContentVersion == "" {
		v.errf("%s : sourceRef.contentVersion пуст", ctx)
	}
	if !validReviewStatuses[sr.ReviewStatus] {
		v.errf("%s : sourceRef.reviewStatus %q не из {draft, machine_checked, teacher_reviewed}", ctx, sr.ReviewStatus)
	}
	// Авторский материал, которого в книге нет (различия сербского и
	// хорватского, порядок слов в вопросе), не может указать на строки книги.
	// Требовать выдуманный диапазон хуже, чем разрешить честное "authored":
	// провенанс тогда остаётся в sourceHeading, а не подделывается.
	if sr.Supplemental && sr.SourceAnchor == "authored" {
		return
	}
	m := anchorRe.FindStringSubmatch(sr.SourceAnchor)
	if m == nil {
		v.errf("%s : sourceRef.sourceAnchor %q не соответствует формату md:<start>-<end>", ctx, sr.SourceAnchor)
	} else {
		var start, end int
		fmt.Sscanf(m[1], "%d", &start)
		fmt.Sscanf(m[2], "%d", &end)
		if start < 1 || end < start {
			v.errf("%s : sourceRef.sourceAnchor %q — некорректный диапазон", ctx, sr.SourceAnchor)
		} else if v.bookLines > 0 && end > v.bookLines {
			v.errf("%s : sourceRef.sourceAnchor %q выходит за пределы книги (%d строк)", ctx, sr.SourceAnchor, v.bookLines)
		}
	}
	if sr.SourceEditionOrFileHash == "" {
		v.errf("%s : sourceRef.sourceEditionOrFileHash пуст", ctx)
	} else if v.bookHash != "" && sr.SourceEditionOrFileHash != v.bookHash && !v.bookHashMismatch {
		v.bookHashMismatch = true
		v.warnf("%s : sourceRef.sourceEditionOrFileHash не совпадает с sha256 книги (%s)", ctx, v.bookHash)
	}
}

// checkDraft — правило 12: draft в production.
func (v *validator) checkDraft(ctx, status, blockedReason string) {
	if status != "draft" || blockedReason != "" {
		return
	}
	if v.strict && !v.allowDraft {
		v.errf("%s : reviewStatus \"draft\" в production (allowDraftContent=false, -strict)", ctx)
	} else {
		v.warnf("%s : reviewStatus \"draft\"", ctx)
	}
}

// validateCourse — базовые проверки course.json.
func (v *validator) validateCourse(c *Course) {
	ctx := "course.json"
	v.claimID(ctx, "course", c.CourseID)
	if c.CourseVersion == "" {
		v.errf("%s : пустой courseVersion", ctx)
	}
	if c.Title == "" {
		v.errf("%s : пустой title", ctx)
	}
	if c.Config.DefaultScript != "latin" && c.Config.DefaultScript != "cyrillic" {
		v.errf("%s : config.defaultScript %q не из {latin, cyrillic}", ctx, c.Config.DefaultScript)
	}
	if c.Config.PassThreshold <= 0 || c.Config.PassThreshold > 1 {
		v.errf("%s : config.passThreshold %v вне (0, 1]", ctx, c.Config.PassThreshold)
	}
	if len(c.Units) == 0 {
		v.errf("%s : список units пуст", ctx)
	}
	seenUnits := map[string]bool{}
	for _, uid := range c.Units {
		if seenUnits[uid] {
			v.errf("%s : unit %q указан дважды", ctx, uid)
		}
		seenUnits[uid] = true
	}
}

// validateUnit — рекурсивная валидация unit-файла. Возвращает false, если
// unit-файл структурно нечитаем (ID не совпал и т.п.).
func (v *validator) validateUnit(u *Unit, expectedID, fileCtx string) {
	if u.ID != expectedID {
		v.errf("%s : id unit %q не совпадает с записью в course.json (%q)", fileCtx, u.ID, expectedID)
	}
	v.claimID(fileCtx, "unit", u.ID)
	if u.Title == "" {
		v.errf("%s : пустой title unit", fileCtx)
	}
	if len(u.Skills) == 0 {
		v.errf("%s : unit без skills", fileCtx)
	}
	for si := range u.Skills {
		v.validateSkill(u, &u.Skills[si], fileCtx)
	}
}

func (v *validator) validateSkill(u *Unit, sk *Skill, fileCtx string) {
	ctx := fileCtx + " → skill " + sk.ID
	if !v.claimID(ctx, "skill", sk.ID) {
		return
	}
	v.skillIDs[sk.ID] = true
	v.skillUnit[sk.ID] = u.ID
	if sk.Title == "" {
		v.errf("%s : пустой title skill", ctx)
	}
	coverage := map[string]bool{}
	for _, obj := range sk.Objectives {
		if v.claimID(ctx, "objective", obj.ID) {
			v.objectiveIDs[obj.ID] = true
			coverage[obj.ID] = false
		}
	}
	v.objectiveCoverage[sk.ID] = coverage
	if len(sk.Lessons) == 0 {
		v.errf("%s : skill без lessons", ctx)
	}
	for li := range sk.Lessons {
		v.validateLesson(u, sk, &sk.Lessons[li], ctx)
	}
}

func (v *validator) validateLesson(u *Unit, sk *Skill, l *Lesson, skillCtx string) {
	ctx := skillCtx + " → lesson " + l.ID
	if !v.claimID(ctx, "lesson", l.ID) {
		return
	}
	v.lessonIDs[l.ID] = true
	v.prereqGraph[l.ID] = append(v.prereqGraph[l.ID], l.Prerequisites...)

	// Правило 3: пустой урок.
	if len(l.Exercises) == 0 {
		v.errf("%s : пустой урок (0 упражнений)", ctx)
	} else if len(l.Exercises) < 6 || len(l.Exercises) > 12 {
		v.warnf("%s : урок содержит %d упражнений (рекомендовано 6–12)", ctx, len(l.Exercises))
	}

	if l.Intro != nil {
		if l.Intro.Text == "" && len(l.Intro.Blocks) == 0 {
			v.errf("%s → intro : нет ни text, ни blocks", ctx)
		}
		v.checkIntroBlocks(ctx+" → intro", l.Intro.Blocks)
		v.checkSourceRef(ctx+" → intro", l.Intro.SourceRef)
		if l.Intro.SourceRef != nil {
			v.checkDraft(ctx+" → intro", l.Intro.SourceRef.ReviewStatus, "")
		}
	}

	for i, raw := range l.Exercises {
		v.validateExercise(u, sk, l, raw, ctx, i)
	}
}

// checkIntroBlocks проверяет структурированное вступление урока.
func (v *validator) checkIntroBlocks(ctx string, blocks []IntroBlock) {
	for i, b := range blocks {
		bctx := fmt.Sprintf("%s → block #%d (%s)", ctx, i, b.Kind)
		if !knownIntroBlockKinds[b.Kind] {
			v.errf("%s : неизвестный вид блока %q (ожидались paragraph, tip, terms, example)", bctx, b.Kind)
			continue
		}
		switch b.Kind {
		case "paragraph", "tip":
			if strings.TrimSpace(b.Text) == "" {
				v.errf("%s : пустой text", bctx)
			}
			// Разметка *сербский термин* должна быть парной, иначе на экране
			// останется висячая звёздочка.
			if strings.Count(b.Text, "*")%2 != 0 {
				v.errf("%s : непарная разметка '*' в тексте", bctx)
			}
		case "terms":
			if len(b.Rows) == 0 {
				v.errf("%s : таблица терминов без строк", bctx)
			}
			seen := map[string]bool{}
			for _, r := range b.Rows {
				if strings.TrimSpace(r.Term) == "" || strings.TrimSpace(r.Gloss) == "" {
					v.errf("%s : строка таблицы с пустым term или gloss", bctx)
					continue
				}
				if seen[r.Term] {
					v.errf("%s : термин %q повторяется", bctx, r.Term)
				}
				seen[r.Term] = true
			}
		case "example":
			if strings.TrimSpace(b.Serbian) == "" {
				v.errf("%s : пример без сербской фразы", bctx)
			}
			if b.Highlight != "" && !strings.Contains(b.Serbian, b.Highlight) {
				v.errf("%s : highlight %q отсутствует в фразе %q", bctx, b.Highlight, b.Serbian)
			}
		}
	}
}

func (v *validator) validateExercise(u *Unit, sk *Skill, l *Lesson, raw json.RawMessage, lessonCtx string, idx int) {
	var base ExerciseBase
	if err := json.Unmarshal(raw, &base); err != nil {
		v.errf("%s → exercise #%d : нечитаемый JSON: %v", lessonCtx, idx, err)
		return
	}
	exID := base.ID
	if exID == "" {
		exID = fmt.Sprintf("#%d", idx)
	}
	ctx := lessonCtx + " → exercise " + exID

	if !v.claimID(ctx, "exercise", base.ID) {
		return
	}

	// Неизвестный тип — правило 8.
	if !knownExerciseTypes[base.Type] {
		v.errf("%s : неизвестный exercise type %q", ctx, base.Type)
		return
	}

	if base.UnitID != "" && base.UnitID != u.ID {
		v.errf("%s : unitId %q не совпадает с enclosing unit %q", ctx, base.UnitID, u.ID)
	}
	if base.SkillID != "" && base.SkillID != sk.ID {
		v.errf("%s : skillId %q не совпадает с enclosing skill %q", ctx, base.SkillID, sk.ID)
	}
	if base.LessonID != "" && base.LessonID != l.ID {
		v.errf("%s : lessonId %q не совпадает с enclosing lesson %q", ctx, base.LessonID, l.ID)
	}
	if base.Difficulty < 1 || base.Difficulty > 5 {
		v.errf("%s : difficulty %d вне 1–5", ctx, base.Difficulty)
	}
	if base.Prompt == "" {
		v.errf("%s : пустой prompt", ctx)
	}

	// Правило 13: письменность.
	switch base.SerbianScript {
	case "latin", "cyrillic":
	case "both":
		if !isScriptLesson(l) {
			v.errf("%s : serbianScript \"both\" вне script-урока", ctx)
		}
	default:
		v.errf("%s : serbianScript %q не из {latin, cyrillic, both}", ctx, base.SerbianScript)
	}

	// Правило 9: ссылки на objectives.
	for _, oid := range base.LearningObjectiveIDs {
		if !v.objectiveIDs[oid] {
			v.errf("%s : learningObjectiveIds ссылается на несуществующий objective %q", ctx, oid)
			continue
		}
		if cov, ok := v.objectiveCoverage[sk.ID]; ok {
			if _, own := cov[oid]; own {
				cov[oid] = true
			}
		}
	}

	v.checkSourceRef(ctx, base.SourceRef)
	status := base.ContentReviewStatus
	if status == "" && base.SourceRef != nil {
		status = base.SourceRef.ReviewStatus
	}
	v.checkDraft(ctx, status, base.BlockedReason)
	if base.SourceRef != nil && base.SourceRef.ReviewStatus == "draft" && status != "draft" {
		v.checkDraft(ctx, base.SourceRef.ReviewStatus, base.BlockedReason)
	}

	if base.BlockedReason != "" {
		v.warnf("%s : blocked (%s) — исключается из bundle", ctx, base.BlockedReason)
	}

	// Сверка словоформ с лексиконом (§29): помощник, а не истина.
	v.checkAgainstLexicon(ctx, raw, &base)

	// Тип-специфичные проверки.
	switch base.Type {
	case "multiple_choice":
		var p MultipleChoice
		if v.unmarshalPayload(ctx, raw, &p) {
			v.checkMultipleChoice(ctx, p.Options, p.Multi)
		}
	case "sentence_builder":
		var p SentenceBuilder
		if v.unmarshalPayload(ctx, raw, &p) {
			v.checkSentenceBuilder(ctx, &p)
		}
	case "ending_picker":
		var p EndingPicker
		if v.unmarshalPayload(ctx, raw, &p) {
			v.checkEndingPicker(ctx, &p)
		}
	case "letter_unscramble":
		var p LetterUnscramble
		if v.unmarshalPayload(ctx, raw, &p) {
			v.checkLetterUnscramble(ctx, &p)
		}
	case "image_description":
		var p ImageDescription
		if v.unmarshalPayload(ctx, raw, &p) {
			v.checkImageDescription(ctx, &base, &p)
		}
	case "matching":
		var p Matching
		if v.unmarshalPayload(ctx, raw, &p) {
			v.checkMatching(ctx, &p)
		}
	case "fill_blank":
		var p FillBlank
		if v.unmarshalPayload(ctx, raw, &p) {
			v.checkFillBlank(ctx, &p)
		}
	case "reading_qa":
		var p ReadingQA
		if v.unmarshalPayload(ctx, raw, &p) {
			v.checkReadingQA(ctx, &p)
		}
	case "form_hunt":
		var p FormHunt
		if v.unmarshalPayload(ctx, raw, &p) {
			v.checkFormHunt(ctx, &p)
		}
	}
}

// isScriptLesson — урок письменности: явный флаг scriptLesson или
// ID урока/skill/unit содержит "pismo" (письмо).
func isScriptLesson(l *Lesson) bool {
	if l.ScriptLesson {
		return true
	}
	return strings.Contains(l.ID, "pismo")
}

func (v *validator) unmarshalPayload(ctx string, raw json.RawMessage, dst any) bool {
	if err := json.Unmarshal(raw, dst); err != nil {
		v.errf("%s : payload не соответствует типу: %v", ctx, err)
		return false
	}
	return true
}

// checkMultipleChoice — ровно один correct (multi=false) / минимум один
// (multi=true); correct и distractor тексты не совпадают (правила 4, 5).
func (v *validator) checkMultipleChoice(ctx string, opts []MCOption, multi bool) {
	if len(opts) < 2 {
		v.errf("%s : multiple_choice должен иметь минимум 2 options", ctx)
	}
	correct := 0
	seenIDs := map[string]bool{}
	textCorrect := map[string]bool{}
	var texts []string
	for _, o := range opts {
		if o.ID == "" {
			v.errf("%s : option с пустым id", ctx)
		} else if seenIDs[o.ID] {
			v.errf("%s : duplicate option id %q", ctx, o.ID)
		}
		seenIDs[o.ID] = true
		if o.Text == "" {
			v.errf("%s : option %q с пустым text", ctx, o.ID)
		}
		if o.Correct {
			correct++
		}
		textCorrect[o.Text] = textCorrect[o.Text] || o.Correct
		texts = append(texts, o.Text)
	}
	if multi {
		if correct < 1 {
			v.errf("%s : multiple_choice (multi=true) без правильного ответа", ctx)
		}
	} else if correct != 1 {
		v.errf("%s : multiple_choice (multi=false) должен иметь ровно один correct, найдено %d", ctx, correct)
	}
	// Одинаковый текст у correct и distractor.
	seen := map[string]bool{}
	for _, o := range opts {
		for prev, wasCorrect := range map[string]bool{} {
			_, _ = prev, wasCorrect
		}
		if seen[o.Text] {
			v.errf("%s : текст ответа %q повторяется (correct и distractor совпадают)", ctx, o.Text)
		}
		seen[o.Text] = true
	}
}

func (v *validator) checkSentenceBuilder(ctx string, p *SentenceBuilder) {
	if len(p.Tokens) == 0 {
		v.errf("%s : sentence_builder без tokens", ctx)
	}
	// Уникальность token IDs (включая distractorTokens).
	ids := map[string]string{} // id → text
	distractor := map[string]bool{}
	for _, t := range p.Tokens {
		if _, dup := ids[t.ID]; dup {
			v.errf("%s : duplicate token id %q", ctx, t.ID)
		}
		if t.Text == "" {
			v.errf("%s : token %q с пустым text", ctx, t.ID)
		}
		ids[t.ID] = t.Text
	}
	for _, t := range p.DistractorTokens {
		if _, dup := ids[t.ID]; dup {
			v.errf("%s : duplicate token id %q (дистрактор совпадает с токеном)", ctx, t.ID)
		}
		if t.Text == "" {
			v.errf("%s : distractor token %q с пустым text", ctx, t.ID)
		}
		ids[t.ID] = t.Text
		distractor[t.ID] = true
	}
	optional := map[string]bool{}
	for _, id := range p.OptionalTokenIDs {
		if distractor[id] {
			v.errf("%s : optionalTokenIds содержит distractor token %q", ctx, id)
		}
		if _, ok := ids[id]; !ok {
			v.errf("%s : optionalTokenIds ссылается на несуществующий token %q", ctx, id)
		}
		optional[id] = true
	}
	// Обязательные токены: не-distractor, не-optional.
	required := map[string]bool{}
	for _, t := range p.Tokens {
		if !distractor[t.ID] && !optional[t.ID] {
			required[t.ID] = true
		}
	}
	// Правило 4: должен быть хотя бы один accepted order.
	if len(p.AcceptedOrders) == 0 {
		v.errf("%s : sentence_builder без acceptedOrders", ctx)
	}
	for oi, order := range p.AcceptedOrders {
		used := map[string]int{}
		for _, id := range order {
			text, ok := ids[id]
			if !ok {
				v.errf("%s : acceptedOrders[%d] ссылается на несуществующий token %q", ctx, oi, id)
				continue
			}
			_ = text
			if distractor[id] {
				v.errf("%s : acceptedOrders[%d] содержит distractor token %q", ctx, oi, id)
			}
			used[id]++
		}
		for id, n := range used {
			if n > 1 {
				v.errf("%s : acceptedOrders[%d] содержит token %q %d раза", ctx, oi, id, n)
			}
		}
		for id := range required {
			if used[id] != 1 {
				v.errf("%s : acceptedOrders[%d] не содержит обязательный token %q ровно один раз", ctx, oi, id)
			}
		}
	}
}

func (v *validator) checkEndingPicker(ctx string, p *EndingPicker) {
	if p.WordClass != "verb" && p.WordClass != "noun" {
		v.errf("%s : ending_picker wordClass %q не из {verb, noun}", ctx, p.WordClass)
	}
	if p.Stem == "" {
		v.errf("%s : ending_picker с пустым stem", ctx)
	}
	if p.FullForm == "" {
		v.errf("%s : ending_picker с пустым fullForm", ctx)
	} else if p.Stem != "" && !strings.HasPrefix(strings.ToLower(p.FullForm), strings.ToLower(p.Stem)) {
		v.errf("%s : fullForm %q не начинается со stem %q", ctx, p.FullForm, p.Stem)
	}
	switch p.WordClass {
	case "noun":
		if p.Target.Case == nil || *p.Target.Case == "" {
			v.errf("%s : ending_picker noun без target.case", ctx)
		}
	case "verb":
		if p.Target.Person == nil {
			v.errf("%s : ending_picker verb без target.person", ctx)
		}
		if p.Target.Number == nil || *p.Target.Number == "" {
			v.errf("%s : ending_picker verb без target.number", ctx)
		}
		if p.Target.Tense == nil || *p.Target.Tense == "" {
			v.errf("%s : ending_picker verb без target.tense", ctx)
		}
	}
	// Ровно один correct option.
	v.checkMultipleChoice(ctx, p.Options, false)
}

// splitLetters разбивает слово на буквы: диакритики (č ć š ž đ) — один
// символ (это отдельные руны), диграфы lj/nj/dž — два символа, если
// digraphsAsUnits=false, иначе одна единица.
func splitLetters(s string, digraphsAsUnits bool) []string {
	runes := []rune(s)
	var out []string
	for i := 0; i < len(runes); {
		if i+1 < len(runes) {
			pair := strings.ToLower(string(runes[i : i+2]))
			if pair == "lj" || pair == "nj" || pair == "dž" {
				if digraphsAsUnits {
					out = append(out, string(runes[i:i+2]))
				} else {
					out = append(out, string(runes[i]), string(runes[i+1]))
				}
				i += 2
				continue
			}
		}
		out = append(out, string(runes[i]))
		i++
	}
	return out
}

func (v *validator) checkLetterUnscramble(ctx string, p *LetterUnscramble) {
	if p.Answer == "" {
		v.errf("%s : letter_unscramble с пустым answer", ctx)
		return
	}
	answerLetters := splitLetters(p.Answer, p.DigraphsAsUnits)
	if len(answerLetters) < 2 {
		v.errf("%s : letter_unscramble answer %q слишком короткий (%d буква)", ctx, p.Answer, len(answerLetters))
	}
	// Multiset букв answer + extraLetters: каждая extraLetter — ровно одна
	// буква (с учётом диграфов), иначе набор для перемешивания невалиден.
	multiset := map[string]int{}
	for _, l := range answerLetters {
		multiset[l]++
	}
	for _, extra := range p.ExtraLetters {
		letters := splitLetters(extra, p.DigraphsAsUnits)
		if len(letters) != 1 {
			v.errf("%s : extraLetters содержит %q — это %d букв, а не одна (диграфы lj/nj/dž считаются за два символа без digraphsAsUnits)", ctx, extra, len(letters))
			continue
		}
		multiset[letters[0]]++
	}
	if p.HighlightStem != "" && !strings.HasPrefix(strings.ToLower(p.Answer), strings.ToLower(p.HighlightStem)) {
		v.warnf("%s : highlightStem %q не является префиксом answer %q", ctx, p.HighlightStem, p.Answer)
	}
}

func (v *validator) checkImageDescription(ctx string, base *ExerciseBase, p *ImageDescription) {
	switch p.Mode {
	case "choose", "build", "fill":
	case "free":
		if len(p.AcceptedAnswers) == 0 {
			v.errf("%s : image_description mode \"free\" без acceptedAnswers", ctx)
		}
		for _, a := range p.AcceptedAnswers {
			if strings.TrimSpace(a) == "" {
				v.errf("%s : image_description acceptedAnswers содержит пустой ответ", ctx)
			}
		}
	default:
		v.errf("%s : image_description mode %q не из {choose, build, fill, free}", ctx, p.Mode)
	}
	if p.Mode == "choose" {
		if len(p.Options) < 2 {
			v.errf("%s : image_description mode \"choose\" требует минимум 2 options", ctx)
		}
		correct := 0
		for _, o := range p.Options {
			if o.Correct {
				correct++
			}
		}
		if correct != 1 {
			v.errf("%s : image_description mode \"choose\" требует ровно один correct option, найдено %d", ctx, correct)
		}
	}
	if p.Image.AssetID == "" {
		v.errf("%s : image_description с пустым image.assetId", ctx)
	}
	if p.Image.Path == "" {
		v.errf("%s : image_description с пустым image.path", ctx)
	} else if base.BlockedReason != "no_asset" {
		// Правило 6: ссылка на отсутствующий asset (путь относительно frontend/).
		full := filepath.Join(v.frontendDir, filepath.FromSlash(p.Image.Path))
		if _, err := os.Stat(full); err != nil {
			v.errf("%s : image asset %q не найден (%s); если ассета ещё нет — пометь blockedReason \"no_asset\"", ctx, p.Image.Path, full)
		}
	}
}

func (v *validator) checkMatching(ctx string, p *Matching) {
	if len(p.Pairs) == 0 {
		v.errf("%s : matching без pairs", ctx)
	}
	seenLeft := map[string]bool{}
	for _, pair := range p.Pairs {
		if pair.Left == "" || pair.Right == "" {
			v.errf("%s : matching пара с пустым left/right (%q → %q)", ctx, pair.Left, pair.Right)
		}
		if seenLeft[pair.Left] {
			v.errf("%s : matching duplicate left %q", ctx, pair.Left)
		}
		seenLeft[pair.Left] = true
	}
}

func (v *validator) checkFillBlank(ctx string, p *FillBlank) {
	if len(p.Segments) == 0 {
		v.errf("%s : fill_blank без segments", ctx)
	}
	segBlanks := map[string]bool{}
	for _, s := range p.Segments {
		switch s.Kind {
		case "text":
		case "blank":
			if s.ID == "" {
				v.errf("%s : fill_blank blank segment с пустым id", ctx)
			} else if segBlanks[s.ID] {
				v.errf("%s : fill_blank duplicate blank segment id %q", ctx, s.ID)
			}
			segBlanks[s.ID] = true
		default:
			v.errf("%s : fill_blank segment kind %q не из {text, blank}", ctx, s.Kind)
		}
	}
	blankDefs := map[string]bool{}
	for _, b := range p.Blanks {
		if blankDefs[b.ID] {
			v.errf("%s : fill_blank duplicate blank id %q", ctx, b.ID)
		}
		blankDefs[b.ID] = true
		if len(b.AcceptedAnswers) == 0 {
			v.errf("%s : fill_blank blank %q без acceptedAnswers", ctx, b.ID)
		}
		for _, a := range b.AcceptedAnswers {
			if a == "" {
				v.errf("%s : fill_blank blank %q содержит пустой acceptedAnswer", ctx, b.ID)
			}
		}
	}
	// Каждый blank id из segments имеет запись в blanks и наоборот.
	for id := range segBlanks {
		if !blankDefs[id] {
			v.errf("%s : fill_blank segment blank %q не имеет записи в blanks", ctx, id)
		}
	}
	for id := range blankDefs {
		if !segBlanks[id] {
			v.errf("%s : fill_blank blank %q не используется ни в одном segment", ctx, id)
		}
	}
}

func (v *validator) checkReadingQA(ctx string, p *ReadingQA) {
	if strings.TrimSpace(p.Text) == "" {
		v.errf("%s : reading_qa без текста", ctx)
	}
	if len(p.Questions) == 0 {
		v.errf("%s : reading_qa без вопросов", ctx)
	} else if len(p.Questions) > 6 {
		v.warnf("%s : reading_qa содержит %d вопросов (больше шести читается тяжело)", ctx, len(p.Questions))
	}
	seen := map[string]bool{}
	for _, q := range p.Questions {
		qctx := fmt.Sprintf("%s → вопрос %s", ctx, q.ID)
		if q.ID == "" {
			v.errf("%s : вопрос с пустым id", ctx)
		} else if seen[q.ID] {
			v.errf("%s : duplicate id вопроса %q", ctx, q.ID)
		}
		seen[q.ID] = true
		if strings.TrimSpace(q.Prompt) == "" {
			v.errf("%s : пустая формулировка вопроса", qctx)
		}
		v.checkMultipleChoice(qctx, q.Options, false)
	}
}

func (v *validator) checkFormHunt(ctx string, p *FormHunt) {
	if strings.TrimSpace(p.TargetLabel) == "" {
		v.errf("%s : form_hunt без targetLabel (что именно искать)", ctx)
	}
	if len(p.Tokens) < 4 {
		v.errf("%s : form_hunt содержит %d токенов — искать не в чем", ctx, len(p.Tokens))
	}
	seen := map[string]bool{}
	correct := 0
	for _, t := range p.Tokens {
		if t.ID == "" {
			v.errf("%s : токен с пустым id", ctx)
		} else if seen[t.ID] {
			v.errf("%s : duplicate id токена %q", ctx, t.ID)
		}
		seen[t.ID] = true
		if strings.TrimSpace(t.Text) == "" {
			v.errf("%s : токен %q с пустым text", ctx, t.ID)
		}
		if t.Correct {
			correct++
		}
	}
	// Задание без искомых форм проверяет не грамматику, а доверчивость.
	if correct == 0 {
		v.errf("%s : form_hunt без единой искомой формы", ctx)
	}
	if correct == len(p.Tokens) {
		v.errf("%s : в form_hunt отмечены все токены — выбирать не из чего", ctx)
	}
}

// validatePrereqs — правило 2: missing prerequisite и циклы (DFS).
func (v *validator) validatePrereqs() {
	const ctx = "course"
	for lesson, prereqs := range v.prereqGraph {
		for _, p := range prereqs {
			if !v.lessonIDs[p] {
				v.errf("%s : lesson %q prerequisite ссылается на несуществующий lesson %q", ctx, lesson, p)
			}
		}
	}
	// Цикл: DFS с цветами (0=white, 1=gray, 2=black).
	color := map[string]int{}
	var stack []string
	var visit func(id string) bool
	visit = func(id string) bool {
		color[id] = 1
		stack = append(stack, id)
		for _, next := range v.prereqGraph[id] {
			if !v.lessonIDs[next] {
				continue
			}
			if color[next] == 1 {
				// нашли цикл — вырезаем его из стека
				cycle := []string{}
				for i := len(stack) - 1; i >= 0; i-- {
					cycle = append([]string{stack[i]}, cycle...)
					if stack[i] == next {
						break
					}
				}
				v.errf("%s : цикл prerequisites: %s → %s", ctx, strings.Join(cycle, " → "), next)
				stack = stack[:len(stack)-1]
				color[id] = 2
				return true
			}
			if color[next] == 0 {
				if visit(next) {
					stack = stack[:len(stack)-1]
					color[id] = 2
					return true
				}
			}
		}
		stack = stack[:len(stack)-1]
		color[id] = 2
		return false
	}
	ids := make([]string, 0, len(v.lessonIDs))
	for id := range v.lessonIDs {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		if color[id] == 0 {
			visit(id)
		}
	}
}

// validateObjectiveCoverage — правило 10: каждый objective skill покрыт
// хотя бы одним упражнением.
func (v *validator) validateObjectiveCoverage() {
	skills := make([]string, 0, len(v.objectiveCoverage))
	for sk := range v.objectiveCoverage {
		skills = append(skills, sk)
	}
	sort.Strings(skills)
	for _, sk := range skills {
		for obj, covered := range v.objectiveCoverage[sk] {
			if !covered {
				v.errf("skill %s : objective %q не покрыт ни одним упражнением", sk, obj)
			}
		}
	}
}

// validateFinalExam — правило 11.
func (v *validator) validateFinalExam(c *Course, loadedUnits []string) {
	if c.FinalExam == nil {
		return
	}
	ctx := "course.json → finalExam"
	ex := c.FinalExam
	if ex.ID == "" {
		v.errf("%s : пустой id", ctx)
	}
	if len(ex.Blueprint) == 0 {
		v.warnf("%s : blueprint пуст (финальная контрольная ещё не собрана)", ctx)
		return
	}
	coveredUnits := map[string]bool{}
	for _, b := range ex.Blueprint {
		if !v.skillIDs[b.SkillID] {
			v.errf("%s : blueprint ссылается на несуществующий skill %q", ctx, b.SkillID)
			continue
		}
		if b.Count <= 0 {
			v.errf("%s : blueprint skill %q с count %d", ctx, b.SkillID, b.Count)
		}
		coveredUnits[v.skillUnit[b.SkillID]] = true
	}
	for _, t := range ex.RequiredExerciseTypes {
		if !knownExerciseTypes[t] {
			v.errf("%s : requiredExerciseTypes содержит неизвестный тип %q", ctx, t)
		}
	}
	// Правило 11: контрольная обязана покрывать каждый загруженный unit.
	for _, uid := range loadedUnits {
		if !coveredUnits[uid] {
			v.errf("%s : unit %q не покрыт ни одной записью blueprint", ctx, uid)
		}
	}
}
