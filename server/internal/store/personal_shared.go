package store

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"

	"github.com/citavuk/server/internal/personal"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type sharedPersonalCard struct {
	ID          uuid.UUID
	Level       string
	Kind        string
	Theme       string
	SourceGroup string
	Content     personal.Lesson
}

var personalLevels = []string{"A1", "A2", "B1", "B2", "C1", "C2"}
var sharedKeyPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,79}$`)

// SharedPersonalImport is the reviewed, level-tagged format for growing the
// pool in batches. Imports start inactive unless the operator explicitly
// activates them after checking the Serbian and the answer keys.
type SharedPersonalImport struct {
	Key     string          `json:"key"`
	Level   string          `json:"level"`
	Theme   string          `json:"theme"`
	Content personal.Lesson `json:"content"`
}

func (s *Store) ImportSharedPersonalBatch(ctx context.Context, entries []SharedPersonalImport, activate bool) (int, error) {
	if len(entries) < 1 || len(entries) > 20 {
		return 0, personal.ErrInvalid
	}
	seen := map[string]bool{}
	for _, entry := range entries {
		if !sharedKeyPattern.MatchString(entry.Key) || len(levelsThrough(entry.Level)) == 0 ||
			strings.TrimSpace(entry.Theme) == "" || len([]rune(entry.Theme)) > 80 ||
			seen[entry.Key] || entry.Content.Validate() != nil {
			return 0, personal.ErrInvalid
		}
		seen[entry.Key] = true
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	changed := 0
	for _, entry := range entries {
		content, _ := json.Marshal(entry.Content)
		hash := sha256.Sum256(content)
		sourceKey := "curated-v1:" + entry.Key
		tag, insertErr := tx.Exec(ctx, `INSERT INTO personal_shared_lessons
 (source_key,source_group,level,kind,theme,content,content_hash,active)
 VALUES($1,$1,$2,$3,$4,$5,$6,$7)
 ON CONFLICT(source_key) DO UPDATE SET level=EXCLUDED.level,kind=EXCLUDED.kind,
 theme=EXCLUDED.theme,content=EXCLUDED.content,content_hash=EXCLUDED.content_hash,
 active=EXCLUDED.active`, sourceKey, entry.Level, entry.Content.Kind,
			entry.Theme, content, hex.EncodeToString(hash[:]), activate)
		if insertErr != nil {
			return 0, insertErr
		}
		changed += int(tag.RowsAffected())
	}
	return changed, tx.Commit(ctx)
}

func levelsThrough(level string) []string {
	for i, candidate := range personalLevels {
		if candidate == level {
			return personalLevels[:i+1]
		}
	}
	return nil
}

// SeedPersonalSharedFromRoadmap creates a shared, reusable snapshot of
// published roadmap material. No private plan, answer or generated lesson is
// ever promoted into this pool.
func (s *Store) SeedPersonalSharedFromRoadmap(ctx context.Context) (int, error) {
	rows, err := s.Pool.Query(ctx, `SELECT level,theme,lemma,translation,example,example_translation
 FROM roadmap_words WHERE status='published' AND btrim(translation)<>'' AND btrim(example)<>''
 ORDER BY level,theme,position,lemma`)
	if err != nil {
		return 0, err
	}
	type wordGroup struct {
		level, theme string
		words        []personal.SharedWord
	}
	groups := []*wordGroup{}
	byKey := map[string]*wordGroup{}
	for rows.Next() {
		var level, theme string
		var word personal.SharedWord
		if err = rows.Scan(&level, &theme, &word.Lemma, &word.Translation,
			&word.Example, &word.ExampleTranslation); err != nil {
			rows.Close()
			return 0, err
		}
		key := level + ":" + theme
		group := byKey[key]
		if group == nil {
			group = &wordGroup{level: level, theme: theme}
			byKey[key] = group
			groups = append(groups, group)
		}
		group.words = append(group.words, word)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return 0, err
	}
	if len(groups) == 0 {
		return 0, errors.New("нет опубликованных слов для общей колоды")
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	added := 0
	for _, group := range groups {
		for start, index := 0, 0; start < len(group.words); index++ {
			remaining := len(group.words) - start
			end := start + 6
			if remaining <= 8 {
				end = len(group.words)
			} else if remaining-6 < 4 {
				end = len(group.words) - 4
			}
			if end-start < 4 {
				break
			}
			sourceGroup := fmt.Sprintf("roadmap-v1:%s:%s:%d", group.level, group.theme, index)
			for _, kind := range []string{"vocabulary", "reading", "writing"} {
				lesson, buildErr := personal.BuildSharedLesson(group.level, group.theme, kind, group.words[start:end])
				if buildErr != nil {
					slog.Warn("общая карта пропущена", "level", group.level,
						"theme", group.theme, "group", index, "err", buildErr)
					continue
				}
				content, _ := json.Marshal(lesson)
				hash := sha256.Sum256(content)
				tag, insertErr := tx.Exec(ctx, `INSERT INTO personal_shared_lessons
 (source_key,source_group,level,kind,theme,content,content_hash)
 VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(source_key) DO UPDATE SET
 content=EXCLUDED.content,content_hash=EXCLUDED.content_hash
 WHERE personal_shared_lessons.content_hash<>EXCLUDED.content_hash`,
					sourceGroup+":"+kind, sourceGroup, group.level, kind, group.theme,
					content, hex.EncodeToString(hash[:]))
				if insertErr != nil {
					return 0, insertErr
				}
				added += int(tag.RowsAffected())
			}
			start = end
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return 0, err
	}
	return added, nil
}

// SharedPersonalAvailable reports whether an entire month can be assembled
// without calling a paid model. More advanced users may review lower levels.
func (s *Store) SharedPersonalAvailable(ctx context.Context, level string) (bool, error) {
	levels := levelsThrough(level)
	if len(levels) == 0 {
		return false, personal.ErrInvalid
	}
	var count int
	err := s.Pool.QueryRow(ctx, `SELECT count(DISTINCT source_group) FROM personal_shared_lessons
 WHERE active AND level=ANY($1)`, levels).Scan(&count)
	return count >= personal.Days, err
}

// RequeueIncompletePersonal revives exhausted plans after the shared pool is
// ready. Completed and edited cards are untouched by the subsequent fill.
func (s *Store) RequeueIncompletePersonal(ctx context.Context) (int64, error) {
	tag, err := s.Pool.Exec(ctx, `UPDATE personal_plans p SET
 status='queued',attempts=0,retries=0,error='',lease_until=NULL,lease_token=NULL,updated_at=now()
 WHERE status IN ('error','ready') AND
 (SELECT count(*) FROM personal_lessons l WHERE l.plan_id=p.id)<30`)
	if err != nil {
		return 0, err
	}
	_, err = s.Pool.Exec(ctx, `UPDATE personal_plans p SET status='ready',error='',updated_at=now()
 WHERE status='error' AND (SELECT count(*) FROM personal_lessons l WHERE l.plan_id=p.id)=30`)
	return tag.RowsAffected(), err
}

func sharedPersonalCards(ctx context.Context, tx pgx.Tx, level string) ([]sharedPersonalCard, error) {
	rows, err := tx.Query(ctx, `SELECT id,level,kind,theme,source_group,content
 FROM personal_shared_lessons WHERE active AND level=ANY($1)`, levelsThrough(level))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cards := []sharedPersonalCard{}
	for rows.Next() {
		var card sharedPersonalCard
		var raw []byte
		if err = rows.Scan(&card.ID, &card.Level, &card.Kind, &card.Theme,
			&card.SourceGroup, &raw); err != nil {
			return nil, err
		}
		if err = json.Unmarshal(raw, &card.Content); err != nil {
			return nil, err
		}
		cards = append(cards, card)
	}
	return cards, rows.Err()
}

func sharedTopicScore(topics, theme string) int {
	topics, theme = strings.ToLower(topics), strings.ToLower(theme)
	if strings.Contains(topics, theme) {
		return 35
	}
	for _, pair := range [][2]string{
		{"еда и путешествия", "кухня"}, {"еда и путешествия", "транспорт"},
		{"еда и путешествия", "город"}, {"повседневная жизнь", "дом"},
		{"повседневная жизнь", "семья"}, {"история и культура", "литература"},
		{"работа и технологии", "техника"}, {"работа и технологии", "профессии"},
		{"юмор и разговорная речь", "общение"}, {"новости и политика", "общество"},
	} {
		if strings.Contains(topics, pair[0]) && strings.Contains(theme, pair[1]) {
			return 25
		}
	}
	return 0
}

func pickSharedPersonalCards(planID uuid.UUID, generation int, profile personal.Profile,
	cards []sharedPersonalCard, count int, usedGroups map[string]bool) []sharedPersonalCard {
	selected := make([]sharedPersonalCard, 0, count)
	themeUses, kindUses := map[string]int{}, map[string]int{}
	levelIndex := len(levelsThrough(profile.Level)) - 1
	for len(selected) < count {
		best, bestScore := -1, -1<<30
		for i, card := range cards {
			if usedGroups[card.SourceGroup] {
				continue
			}
			cardLevelIndex := len(levelsThrough(card.Level)) - 1
			if cardLevelIndex < 0 || cardLevelIndex > levelIndex {
				continue
			}
			seed := sha256.Sum256([]byte(fmt.Sprintf("%s:%d:%s", planID, generation, card.ID)))
			levelPenalty := 35
			switch profile.Answers["pace"] {
			case "Спокойный":
				levelPenalty = 25
			case "Интенсивный":
				levelPenalty = 50
			}
			score := 200 - (levelIndex-cardLevelIndex)*levelPenalty + int(binary.BigEndian.Uint16(seed[:2])%30)
			score += sharedTopicScore(profile.Answers["topics"], card.Theme)
			focus := profile.Answers["focus"]
			if (card.Kind == "reading" && strings.Contains(focus, "Чтение")) ||
				(card.Kind == "writing" && strings.Contains(focus, "Письмо")) ||
				(card.Kind == "vocabulary" && strings.Contains(focus, "Лексика")) {
				score += 22
			}
			score -= themeUses[card.Theme] * 16
			score -= kindUses[card.Kind] * 6
			if score > bestScore {
				best, bestScore = i, score
			}
		}
		if best < 0 {
			break
		}
		card := cards[best]
		selected = append(selected, card)
		usedGroups[card.SourceGroup] = true
		themeUses[card.Theme]++
		kindUses[card.Kind]++
	}
	return selected
}

// FillPersonalFromShared copies selected shared cards into one user's plan.
// Existing completed/edited cards remain immutable. The plan row and all new
// cards commit together, so the visible outline never points at absent cards.
func (s *Store) FillPersonalFromShared(ctx context.Context, job *PersonalJob) error {
	if job == nil || len(levelsThrough(job.Profile.Level)) == 0 {
		return personal.ErrInvalid
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var outlineRaw []byte
	err = tx.QueryRow(ctx, `UPDATE personal_plans SET lease_until=now()+interval '2 minutes'
 WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>now()
 RETURNING outline`, job.ID, job.Token).Scan(&outlineRaw)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrPersonalLease
	}
	if err != nil {
		return err
	}
	type existingCard struct {
		generatedFor int
		edited       bool
		completed    bool
		content      personal.Lesson
	}
	existing := map[int]existingCard{}
	rows, err := tx.Query(ctx, `SELECT day,generated_for,edited,completed_at IS NOT NULL,content
 FROM personal_lessons WHERE plan_id=$1`, job.ID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var day int
		var card existingCard
		var raw []byte
		if err = rows.Scan(&day, &card.generatedFor, &card.edited, &card.completed, &raw); err != nil {
			rows.Close()
			return err
		}
		if err = json.Unmarshal(raw, &card.content); err != nil {
			rows.Close()
			return err
		}
		existing[day] = card
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	missing := make([]int, 0, personal.Days)
	for day := 1; day <= personal.Days; day++ {
		card, found := existing[day]
		if !found || (!card.edited && !card.completed && card.generatedFor < job.Generation) {
			missing = append(missing, day)
		}
	}
	if len(missing) == 0 {
		return tx.Commit(ctx)
	}
	usedGroups := map[string]bool{}
	rows, err = tx.Query(ctx, `SELECT DISTINCT p.source_group FROM personal_lessons l
 JOIN personal_shared_lessons p ON p.id=l.shared_lesson_id
 WHERE l.plan_id=$1 AND (l.edited OR l.completed_at IS NOT NULL OR l.generated_for>=$2)`, job.ID, job.Generation)
	if err != nil {
		return err
	}
	for rows.Next() {
		var group string
		if err = rows.Scan(&group); err != nil {
			rows.Close()
			return err
		}
		usedGroups[group] = true
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	cards, err := sharedPersonalCards(ctx, tx, job.Profile.Level)
	if err != nil {
		return err
	}
	selected := pickSharedPersonalCards(job.ID, job.Generation, job.Profile,
		cards, len(missing), usedGroups)
	if len(selected) != len(missing) {
		return fmt.Errorf("общей коллекции недостаточно для уровня %s: %d из %d",
			job.Profile.Level, len(selected), len(missing))
	}
	var outline []personal.Outline
	if len(outlineRaw) > 0 {
		if err = json.Unmarshal(outlineRaw, &outline); err != nil {
			return err
		}
	}
	if len(outline) != personal.Days {
		outline = make([]personal.Outline, personal.Days)
		for i := range outline {
			outline[i] = personal.Outline{
				Day: i + 1, Title: "Повторение слов", Kind: "vocabulary", Goal: "Прочитать фразы и закрепить слова",
			}
		}
		for day, card := range existing {
			if day >= 1 && day <= personal.Days {
				outline[day-1].Title = card.content.Title
				outline[day-1].Kind = card.content.Kind
			}
		}
	}
	for i, day := range missing {
		card := selected[i]
		content, adaptErr := personal.AdaptSharedLesson(card.Content, job.Profile, day)
		if adaptErr != nil {
			return adaptErr
		}
		outline[day-1] = personal.Outline{
			Day:   day,
			Title: content.Title,
			Kind:  card.Kind,
			Goal:  "Прочитать примеры и закрепить слова темы «" + card.Theme + "»",
		}
	}
	if err = personal.ValidateOutline(outline); err != nil {
		return err
	}
	encodedOutline, _ := json.Marshal(outline)
	if _, err = tx.Exec(ctx, `UPDATE personal_plans SET outline=$3,updated_at=now()
 WHERE id=$1 AND lease_token=$2`, job.ID, job.Token, encodedOutline); err != nil {
		return err
	}
	for i, day := range missing {
		card := selected[i]
		adapted, adaptErr := personal.AdaptSharedLesson(card.Content, job.Profile, day)
		if adaptErr != nil {
			return adaptErr
		}
		content, _ := json.Marshal(adapted)
		_, err = tx.Exec(ctx, `INSERT INTO personal_lessons(plan_id,day,content,generated_for,shared_lesson_id)
 VALUES($1,$2,$3,$4,$5) ON CONFLICT(plan_id,day) DO UPDATE SET
 content=EXCLUDED.content,revision=personal_lessons.revision+1,
 generated_for=EXCLUDED.generated_for,shared_lesson_id=EXCLUDED.shared_lesson_id,
 rating=0,updated_at=now()
 WHERE NOT personal_lessons.edited AND personal_lessons.completed_at IS NULL
 AND personal_lessons.generated_for<EXCLUDED.generated_for`,
			job.ID, day, content, job.Generation, card.ID)
		if err != nil {
			return err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	job.Outline = outline
	return nil
}
