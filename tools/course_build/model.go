package main

import "encoding/json"

// Типизированные модели схемы курса (course_content/SCHEMA.md, schema v1).

type Config struct {
	DefaultScript           string  `json:"defaultScript"`
	AcceptBothScripts       bool    `json:"acceptBothScripts"`
	ShowTransliterationHint bool    `json:"showTransliterationHint"`
	PassThreshold           float64 `json:"passThreshold"`
	AllowDraftContent       bool    `json:"allowDraftContent"`
}

type Course struct {
	CourseID      string     `json:"courseId"`
	CourseVersion string     `json:"courseVersion"`
	Title         string     `json:"title"`
	Config        Config     `json:"config"`
	Units         []string   `json:"units"`
	FinalExam     *FinalExam `json:"finalExam"`
}

type FinalExam struct {
	ID                    string           `json:"id"`
	Blueprint             []BlueprintEntry `json:"blueprint"`
	RequiredExerciseTypes []string         `json:"requiredExerciseTypes"`
	CooldownHours         int              `json:"cooldownHours"`
}

type BlueprintEntry struct {
	SkillID string `json:"skillId"`
	Count   int    `json:"count"`
}

type Unit struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Skills      []Skill `json:"skills"`

	// SourceRef на уровне unit наследуется всеми уроками и упражнениями
	// внутри, если те не объявили свой. См. normalize.go.
	SourceRef *SourceRef `json:"sourceRef,omitempty"`
}

type Skill struct {
	ID         string      `json:"id"`
	Title      string      `json:"title"`
	Objectives []Objective `json:"objectives"`
	Lessons    []Lesson    `json:"lessons"`
	SourceRef  *SourceRef  `json:"sourceRef,omitempty"`
}

type Objective struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type Lesson struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Prerequisites []string `json:"prerequisites"`
	IsCheckpoint  bool     `json:"isCheckpoint"`
	// Optional — урок по желанию: можно пройти, можно пропустить.
	Optional     bool              `json:"optional"`
	ScriptLesson bool              `json:"scriptLesson"`
	Intro        *Intro            `json:"intro"`
	Exercises    []json.RawMessage `json:"exercises"`
	// Objectives — цели обучения этого урока. Наследуются упражнениями,
	// которые не объявили свои (см. normalize.go).
	Objectives []string   `json:"objectives"`
	SourceRef  *SourceRef `json:"sourceRef,omitempty"`
}

type Intro struct {
	// Text — плоское вступление (схема v1). Оставлен для обратной
	// совместимости; предпочтителен Blocks.
	Text string `json:"text"`

	// Blocks — структурированное вступление: абзацы, подсказки, таблицы
	// терминов и примеры. Позволяет отрисовать урок карточками, а не
	// сплошным текстом.
	Blocks    []IntroBlock `json:"blocks"`
	SourceRef *SourceRef   `json:"sourceRef"`
}

// IntroBlock — один блок вступления.
//
// В зависимости от Kind значимы разные поля:
//   - paragraph, tip: Text
//   - terms:          Title, Rows
//   - example:        Serbian, Russian, Highlight
type IntroBlock struct {
	Kind      string    `json:"kind"`
	Text      string    `json:"text"`
	Title     string    `json:"title"`
	Rows      []TermRow `json:"rows"`
	Serbian   string    `json:"serbian"`
	Russian   string    `json:"russian"`
	Highlight string    `json:"highlight"`
}

// TermRow — строка таблицы терминов, например «genitiv → koga, čega».
type TermRow struct {
	Term  string `json:"term"`
	Gloss string `json:"gloss"`
	Note  string `json:"note"`
}

var knownIntroBlockKinds = map[string]bool{
	"paragraph": true,
	"tip":       true,
	"terms":     true,
	"example":   true,
}

type SourceRef struct {
	SourceBook              string  `json:"sourceBook"`
	SourceHeading           string  `json:"sourceHeading"`
	SourceAnchor            string  `json:"sourceAnchor"`
	SourceEditionOrFileHash string  `json:"sourceEditionOrFileHash"`
	ContentVersion          string  `json:"contentVersion"`
	ReviewStatus            string  `json:"reviewStatus"`
	ReviewedBy              *string `json:"reviewedBy"`
	Supplemental            bool    `json:"supplemental"`
}

// ExerciseBase — общие поля всех типов упражнений.
type ExerciseBase struct {
	ID                   string     `json:"id"`
	Type                 string     `json:"type"`
	UnitID               string     `json:"unitId"`
	SkillID              string     `json:"skillId"`
	LessonID             string     `json:"lessonId"`
	LearningObjectiveIDs []string   `json:"learningObjectiveIds"`
	Difficulty           int        `json:"difficulty"`
	Prompt               string     `json:"prompt"`
	InstructionLanguage  string     `json:"instructionLanguage"`
	SerbianScript        string     `json:"serbianScript"`
	Explanation          string     `json:"explanation"`
	Hint                 string     `json:"hint"`
	SourceRef            *SourceRef `json:"sourceRef"`
	ContentReviewStatus  string     `json:"contentReviewStatus"`
	BlockedReason        string     `json:"blockedReason"`
}

type MCOption struct {
	ID              string  `json:"id"`
	Text            string  `json:"text"`
	Correct         bool    `json:"correct"`
	MisconceptionID *string `json:"misconceptionId"`
	FeedbackKey     *string `json:"feedbackKey"`
}

type MultipleChoice struct {
	Multi   bool       `json:"multi"`
	Options []MCOption `json:"options"`
}

type Token struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

type SentenceBuilder struct {
	Tokens           []Token    `json:"tokens"`
	DistractorTokens []Token    `json:"distractorTokens"`
	AcceptedOrders   [][]string `json:"acceptedOrders"`
	OptionalTokenIDs []string   `json:"optionalTokenIds"`
}

type EndingTarget struct {
	Lemma   string  `json:"lemma"`
	Person  *int    `json:"person"`
	Number  *string `json:"number"`
	Tense   *string `json:"tense"`
	Case    *string `json:"case"`
	Gender  *string `json:"gender"`
	Animacy *string `json:"animacy"`
}

type EndingPicker struct {
	WordClass       string       `json:"wordClass"`
	ContextSentence string       `json:"contextSentence"`
	Stem            string       `json:"stem"`
	Target          EndingTarget `json:"target"`
	FullForm        string       `json:"fullForm"`
	Options         []MCOption   `json:"options"`
	Preposition     *string      `json:"preposition"`
}

type LetterUnscramble struct {
	Context         string   `json:"context"`
	Lemma           string   `json:"lemma"`
	TargetFeats     string   `json:"targetFeats"`
	Answer          string   `json:"answer"`
	ExtraLetters    []string `json:"extraLetters"`
	ShowLemma       bool     `json:"showLemma"`
	HighlightStem   string   `json:"highlightStem"`
	DigraphsAsUnits bool     `json:"digraphsAsUnits"`
}

type FocalPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type ImageInfo struct {
	AssetID    string      `json:"assetId"`
	Path       string      `json:"path"`
	AltText    string      `json:"altText"`
	License    string      `json:"license"`
	Entities   []string    `json:"entities"`
	FocalPoint *FocalPoint `json:"focalPoint"`
}

type ImageDescription struct {
	Mode            string     `json:"mode"`
	Image           ImageInfo  `json:"image"`
	Options         []MCOption `json:"options"`
	AcceptedAnswers []string   `json:"acceptedAnswers"`
}

type MatchPair struct {
	Left  string `json:"left"`
	Right string `json:"right"`
}

type Matching struct {
	LeftLabel        string      `json:"leftLabel"`
	RightLabel       string      `json:"rightLabel"`
	Pairs            []MatchPair `json:"pairs"`
	DistractorsRight []string    `json:"distractorsRight"`
}

type Segment struct {
	Kind string `json:"kind"`
	Text string `json:"text"`
	ID   string `json:"id"`
}

type Blank struct {
	ID              string   `json:"id"`
	AcceptedAnswers []string `json:"acceptedAnswers"`
	CaseSensitive   bool     `json:"caseSensitive"`
}

type FillBlank struct {
	Segments []Segment `json:"segments"`
	Blanks   []Blank   `json:"blanks"`
}

// ReadingQuestion — один вопрос к тексту. Варианты ответа свои у каждого
// вопроса: общий список превратил бы задание в подбор пар, а не в чтение.
type ReadingQuestion struct {
	ID      string     `json:"id"`
	Prompt  string     `json:"prompt"`
	Options []MCOption `json:"options"`
}

// ReadingQA — связный текст и вопросы к нему.
//
// Отличие от нескольких multiple_choice подряд в том, что текст остаётся
// перед глазами: ученик перечитывает его, а не отвечает по памяти.
type ReadingQA struct {
	Text        string            `json:"text"`
	Translation string            `json:"translation"`
	Questions   []ReadingQuestion `json:"questions"`
}

// HuntToken — слово текста в задании «найди форму».
//
// Текст задаётся списком токенов, а не строкой с разметкой: разбивать
// сербский текст на слова пришлось бы одинаково в Go, Dart и TypeScript,
// и любое расхождение (апостроф, дефис, đ) ломало бы проверку ответа.
type HuntToken struct {
	ID      string `json:"id"`
	Text    string `json:"text"`
	Correct bool   `json:"correct"`
	// Tail — знаки препинания после слова. Нажимается только слово.
	Tail string `json:"tail"`
}

// FormHunt — найти в тексте все формы заданного признака.
type FormHunt struct {
	TargetLabel string      `json:"targetLabel"`
	Translation string      `json:"translation"`
	Tokens      []HuntToken `json:"tokens"`
}

// knownExerciseTypes — все поддерживаемые типы упражнений.
var knownExerciseTypes = map[string]bool{
	"multiple_choice":   true,
	"sentence_builder":  true,
	"ending_picker":     true,
	"letter_unscramble": true,
	"image_description": true,
	"matching":          true,
	"fill_blank":        true,
	"reading_qa":        true,
	"form_hunt":         true,
}
