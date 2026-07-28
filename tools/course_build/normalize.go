package main

import (
	"encoding/json"
	"fmt"
)

// Нормализация исходного контента перед валидацией.
//
// Зачем она нужна
// ---------------
// Схема v1 требовала у каждого упражнения полный набор служебных полей:
// unitId, skillId, lessonId, sourceRef из восьми полей, instructionLanguage,
// serbianScript, contentReviewStatus. На три десятка упражнений это терпимо.
// В курсе на сорок шесть уроков служебная обвязка занимала бы больше места,
// чем сами задания, и каждая опечатка в skillId становилась бы ошибкой сборки,
// которую пишет человек, а проверяет валидатор.
//
// Поэтому файл контента разрешено писать кратко: положение упражнения в
// дереве уже говорит, к какому unit, skill и уроку оно относится, а провенанс
// у всех уроков раздела обычно один и тот же. Нормализатор дописывает
// пропущенное, после чего валидатор работает с полными объектами и все
// прежние правила остаются в силе.
//
// Что НЕ выводится автоматически: правильные ответы, difficulty выше базовой,
// объяснение. Это содержательные решения автора, и молчаливый дефолт здесь
// скрыл бы недоработку вместо того, чтобы её показать.

// normalizeUnit дописывает унаследованные и выводимые поля по всему unit.
// Возвращает ошибку, только если упражнение — нечитаемый JSON; всё
// остальное остаётся на совести валидатора.
func normalizeUnit(u *Unit, cfg Config) error {
	for si := range u.Skills {
		sk := &u.Skills[si]
		skillRef := firstRef(sk.SourceRef, u.SourceRef)
		for li := range sk.Lessons {
			l := &sk.Lessons[li]
			lessonRef := firstRef(l.SourceRef, skillRef)

			if l.Intro != nil && l.Intro.SourceRef == nil {
				l.Intro.SourceRef = lessonRef
			}
			// Урок письменности определяется по содержанию, а не по флагу:
			// автору не нужно помнить про scriptLesson, когда он пишет урок
			// про две азбуки.
			for ei := range l.Exercises {
				raw, err := normalizeExercise(l.Exercises[ei], u, sk, l, lessonRef, cfg, ei)
				if err != nil {
					return fmt.Errorf("%s → %s → упражнение #%d: %w", u.ID, l.ID, ei, err)
				}
				l.Exercises[ei] = raw
			}
		}
	}
	return nil
}

func firstRef(refs ...*SourceRef) *SourceRef {
	for _, r := range refs {
		if r != nil {
			return r
		}
	}
	return nil
}

func normalizeExercise(
	raw json.RawMessage,
	u *Unit,
	sk *Skill,
	l *Lesson,
	inherited *SourceRef,
	cfg Config,
	idx int,
) (json.RawMessage, error) {
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, err
	}

	// ID выводится из урока и позиции. Он стабилен, пока упражнение не
	// переставили; переставили — это и есть другое упражнение, а прогресс
	// хранится по урокам и целям обучения, не по номерам заданий.
	setIfEmpty(m, "id", fmt.Sprintf("ex_%s_%d", trimLessonPrefix(l.ID), idx+1))
	setIfEmpty(m, "unitId", u.ID)
	setIfEmpty(m, "skillId", sk.ID)
	setIfEmpty(m, "lessonId", l.ID)
	setIfEmpty(m, "instructionLanguage", "ru")
	setIfEmpty(m, "serbianScript", cfg.DefaultScript)
	if _, ok := m["difficulty"]; !ok {
		m["difficulty"] = 2
	}
	if _, ok := m["learningObjectiveIds"]; !ok {
		// Цель обучения берётся у урока, а если он её не назвал — у раздела,
		// но только когда цель там ровно одна. При нескольких целях слепая
		// подстановка молча закрыла бы правило 10 («каждая цель покрыта
		// упражнением»), поэтому там автор указывает цель сам.
		switch {
		case len(l.Objectives) > 0:
			m["learningObjectiveIds"] = l.Objectives
		case len(sk.Objectives) == 1:
			m["learningObjectiveIds"] = []string{sk.Objectives[0].ID}
		default:
			m["learningObjectiveIds"] = []string{}
		}
	}

	ref := inherited
	if own, ok := m["sourceRef"]; ok && own != nil {
		var parsed SourceRef
		if b, err := json.Marshal(own); err == nil {
			if json.Unmarshal(b, &parsed) == nil {
				ref = &parsed
			}
		}
	}
	if ref != nil {
		m["sourceRef"] = ref
		setIfEmpty(m, "contentReviewStatus", ref.ReviewStatus)
	}

	return json.Marshal(m)
}

// trimLessonPrefix убирает ведущее "l_", чтобы ID упражнения читался как
// ex_pismo_1_3, а не ex_l_pismo_1_3.
func trimLessonPrefix(id string) string {
	if len(id) > 2 && id[:2] == "l_" {
		return id[2:]
	}
	return id
}

func setIfEmpty(m map[string]any, key, value string) {
	if value == "" {
		return
	}
	if cur, ok := m[key]; ok {
		if s, isStr := cur.(string); !isStr || s != "" {
			return
		}
	}
	m[key] = value
}
