#!/usr/bin/env python3
"""Собирает общий каталог Тренажёрки для web и Flutter.

Темы и уровни берутся из того же TSV, что и дорожная карта. Существующие
упражнения курса подключаются по skill id, а к каждой теме A1-B2 добавляется
короткая проверка понятия. Поэтому тема не исчезает из Тренажёрки только из-за
того, что для неё ещё не написан большой урок. C1-C2 остаются в карте без новых
упражнений, как и договорились.
"""

from __future__ import annotations

import csv
import json
import pathlib
import uuid

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "tools" / "data" / "roadmap_grammar.tsv"
PRACTICE_SOURCE = ROOT / "tools" / "data" / "trainer_practice.json"
ROADMAP_OUTPUT = (
    ROOT / "server" / "internal" / "store" / "migrations"
    / "0032_roadmap_seed_practice.sql"
)
OUTPUTS = (
    ROOT / "frontend" / "assets" / "course" / "trainer_catalog.json",
    ROOT / "web" / "public" / "course" / "trainer_catalog.json",
)
NAMESPACE = uuid.UUID("6f1f7f9c-3b7e-4f2e-9b7a-0d5c9a1e4b21")

LEGACY_ID_TITLES = {
    "Номинатив (именительный падеж)": "Номинатив (Номинатив)",
    "Аккузатив (винительный падеж) без предлогов": "Аккузатив (Акузатив) без предлогов",
    "Локатив (предложный падеж) с предлогами у и на": "Локатив (Локатив) с предлогами у и на",
    "Генитив (родительный падеж) с предлогами из/изван/близу/од": "Генитив (Генитив) с предлогами из/изван/близу/од",
    "Датив (дательный падеж)": "Датив (Датив)",
    "Инструментал (творительный падеж)": "Инструментал (Инструментал)",
    "Вокатив (звательный падеж)": "Вокатив (Вокатив)",
}

# Один skill может поддерживать несколько близких тем. Каталог не копирует
# упражнения: клиенты берут их из уже загруженного course_bundle.json.
SKILLS: dict[str, list[str]] = {
    "Алфавиты сербского языка": ["sk_dve_grafike", "sk_izgovor"],
    "Глагол бити (быть)": ["sk_biti"],
    "Глагол хтети (хотеть) и будущие намерения": ["sk_futur"],
    "Спряжение глаголов в Present (Настоящее время)": ["sk_prezent"],
    "Род и число существительных": ["sk_rod"],
    "Притяжательные и указательные местоимения": ["sk_pokazne", "sk_prisvojni"],
    "Номинатив (Номинатив)": ["sk_nominativ_vokativ"],
    "Аккузатив (Акузатив) без предлогов": ["sk_akuzativ_genitiv"],
    "Локатив (Локатив) с предлогами у и на": ["sk_dativ_lokativ"],
    "Генитив (Генитив) с предлогами из/изван/близу/од": ["sk_akuzativ_genitiv"],
    "Порядок слов в предложении": ["sk_red_reci"],
    "Перфект (Прошло време / Перфекат)": ["sk_perfekat"],
    "Конструкция да + Present": ["sk_prezent"],
    "Вопросительные предложения и частицы": ["sk_pitanja"],
    "Количественные числительные (1–100)": ["sk_brojevi"],
    "Датив (Датив)": ["sk_dativ_lokativ"],
    "Инструментал (Инструментал)": ["sk_instrumental"],
    "Вокатив (Вокатив)": ["sk_nominativ_vokativ"],
    "Падежная система прилагательных": ["sk_pridevi_padezi_1", "sk_pridevi_padezi_2"],
    "Футур I (Футур први)": ["sk_futur"],
    "Вид глагола (Свршени и несвршени глаголи)": ["sk_vid", "sk_vid_2"],
    "Личные местоимения во всех падежах": ["sk_zamenice_padezi"],
    "Степени сравнения прилагательных": ["sk_poredjenje"],
    "Возвратные глаголы и частица се": ["sk_povratni"],
    "Порядковые числительные и даты": ["sk_redni_brojevi"],
    "Предлоги движения и места": ["sk_akuzativ_genitiv", "sk_dativ_lokativ"],
    "Повелительное наклонение (Императив)": ["sk_imperativ"],
    "Порядок энклитик в предложении": ["sk_red_reci_2"],
    "Потенцијал (Сослагательное наклонение)": ["sk_kondicional"],
    "Глагольный причастие настоящего времени (Глаголски прилог садашњи)": ["sk_participi"],
    "Глагольный причастие прошедшего времени (Глаголски прилог прошли)": ["sk_participi"],
    "Пассивный залог (Пасив)": ["sk_pasiv"],
    "Относительные местоимения": ["sk_upitne_odnosne"],
    "Безличные предложения": ["sk_bezlicne"],
    "Определенный и неопределенный вид прилагательных": ["sk_pridevi_osnove"],
    "Особенности использования инфинитива vs. да + Present": ["sk_prezent"],
}


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def concept_exercise(level: str, position: int, title: str, summary: str,
                     distractors: list[str]) -> dict[str, object]:
    topic_id = f"trainer-{level.lower()}-{position:02d}"
    options = [summary, *distractors[:3]]
    # Правильный ответ не должен вечно стоять первым. Поворот детерминирован,
    # чтобы две сборки получили байт-в-байт одинаковый файл.
    shift = position % len(options)
    options = options[shift:] + options[:shift]
    return {
        "id": f"{topic_id}-concept",
        "type": "multiple_choice",
        "unitId": f"trainer_{level.lower()}",
        "skillId": topic_id,
        "lessonId": f"{topic_id}-lesson",
        "learningObjectiveIds": [f"{topic_id}-objective"],
        "difficulty": max(1, min(5, ("A1", "A2", "B1", "B2").index(level) + 1)),
        "prompt": f"Какое описание относится к теме «{title}»?",
        "explanation": summary,
        "hint": "Сопоставьте название конструкции с её функцией в предложении.",
        "instructionLanguage": "ru",
        "serbianScript": "both",
        "contentReviewStatus": "machine_checked",
        "sourceRef": {
            "sourceBook": "Дорожная карта сербского языка Читавука",
            "sourceHeading": title,
            "sourceAnchor": f"roadmap:{level}:{position}",
            "sourceEditionOrFileHash": "roadmap-grammar-v1",
            "contentVersion": "1.0.0",
            "reviewStatus": "machine_checked",
            "reviewedBy": None,
            "supplemental": True,
        },
        "multi": False,
        "options": [
            {"id": f"o{index + 1}", "text": text, "correct": text == summary}
            for index, text in enumerate(options)
        ],
    }


def practice_item_id(topic: dict[str, object]) -> uuid.UUID:
    return uuid.uuid5(
        NAMESPACE,
        f"practice:{topic['domain']}:{topic['level']}:{topic['id']}",
    )


def practice_source(topic: dict[str, object], index: int) -> dict[str, object]:
    return {
        "sourceBook": "Авторские упражнения Читавука",
        "sourceHeading": str(topic["title"]),
        "sourceAnchor": f"trainer:{topic['id']}:{index}",
        "sourceEditionOrFileHash": "trainer-practice-v1",
        "contentVersion": "1.0.0",
        "reviewStatus": "machine_checked",
        "reviewedBy": None,
        "supplemental": True,
    }


def practice_exercise(
    topic: dict[str, object], raw: dict[str, object], index: int
) -> dict[str, object]:
    exercise_id = f"trainer-{topic['id']}-{index:02d}"
    level = str(topic["level"])
    base: dict[str, object] = {
        "id": exercise_id,
        "unitId": f"trainer_{topic['domain']}_{level.lower()}",
        "skillId": str(topic["id"]),
        "lessonId": f"{topic['id']}-lesson",
        "learningObjectiveIds": [f"{topic['id']}-objective"],
        "difficulty": {"A1": 1, "A2": 2, "B1": 3, "B2": 4}[level],
        "prompt": raw.get("prompt", "Прочитайте текст и ответьте на вопросы."),
        "explanation": raw.get("explanation", "Ответ следует прямо из текста."),
        "hint": None,
        "instructionLanguage": "ru",
        "serbianScript": "latin",
        "contentReviewStatus": "machine_checked",
        "sourceRef": practice_source(topic, index),
    }

    if raw["kind"] == "writing":
        base.update({
            "type": "fill_blank",
            "segments": [{"kind": "blank", "id": "b1"}],
            "blanks": [{
                "id": "b1",
                "acceptedAnswers": raw["answers"],
                "caseSensitive": False,
            }],
        })
        return base

    questions: list[dict[str, object]] = []
    for q_index, question in enumerate(raw["questions"], start=1):
        options = list(question["options"])
        shift = (index + q_index) % len(options)
        options = options[shift:] + options[:shift]
        correct = question["options"][0]
        questions.append({
            "id": f"q{q_index}",
            "prompt": question["prompt"],
            "options": [
                {"id": f"o{o_index}", "text": option, "correct": option == correct}
                for o_index, option in enumerate(options, start=1)
            ],
        })
    base.update({
        "type": "reading_qa",
        "text": raw["text"],
        "translation": raw["translation"],
        "questions": questions,
    })
    return base


def write_practice_roadmap(topics: list[dict[str, object]]) -> None:
    positions: dict[tuple[str, str], int] = {}
    values: list[str] = []
    for topic in topics:
        key = (str(topic["level"]), str(topic["domain"]))
        positions[key] = positions.get(key, 0) + 1
        payload = json.dumps(
            {"trainerTopicId": topic["id"]}, ensure_ascii=False,
            separators=(",", ":"),
        )
        values.append(
            "    ('{id}', '{level}', '{domain}', 'text', {title}, {summary}, "
            "{payload}::jsonb, {position}, 'published')".format(
                id=practice_item_id(topic),
                level=topic["level"],
                domain=topic["domain"],
                title=sql_quote(str(topic["title"])),
                summary=sql_quote(str(topic["summary"])),
                payload=sql_quote(payload),
                position=positions[key],
            )
        )

    ROADMAP_OUTPUT.write_text(
        """-- Собственные темы чтения и письма из общего каталога Тренажёрки.
-- Идентификаторы устойчивы; повторная генерация не сбрасывает прогресс.

INSERT INTO roadmap_items
    (id, level, category, kind, title, summary, payload, position, status)
VALUES
{values}
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    payload = EXCLUDED.payload,
    position = EXCLUDED.position,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO roadmap_sections (level, category, intro)
VALUES
    ('A1', 'reading', 'Короткие бытовые тексты: знакомство, вывески и распорядок дня.'),
    ('A1', 'writing', 'Простые фразы о себе и короткие бытовые сообщения.'),
    ('A2', 'reading', 'Практические сообщения о поездках, встречах и планах.'),
    ('A2', 'writing', 'Сообщения о планах и связный рассказ о прошедшем дне.'),
    ('B1', 'reading', 'Связные истории и статьи, где нужно увидеть причину и следствие.'),
    ('B1', 'writing', 'Личные письма, просьбы и последовательный рассказ о событии.'),
    ('B2', 'reading', 'Публицистика: тезис, оговорка и отношение автора.'),
    ('B2', 'writing', 'Аргументированная позиция и официальное обращение.')
ON CONFLICT (level, category) DO UPDATE SET
    intro = EXCLUDED.intro,
    updated_at = now();
""".format(values=",\n".join(values)),
        encoding="utf-8",
    )


def main() -> int:
    with SOURCE.open(encoding="utf-8", newline="") as source:
        rows = list(csv.DictReader(source, delimiter="\t"))

    summaries_by_level: dict[str, list[str]] = {}
    for row in rows:
        summaries_by_level.setdefault(row["level"], []).append(row["summary"])

    positions: dict[str, int] = {}
    topics: list[dict[str, object]] = []
    for row in rows:
        level, title, summary = row["level"], row["title"], row["summary"]
        positions[level] = positions.get(level, 0) + 1
        position = positions[level]
        other = [text for text in summaries_by_level[level] if text != summary]
        topic: dict[str, object] = {
            "id": f"grammar-{level.lower()}-{position:02d}",
            "domain": "grammar",
            "level": level,
            "title": title,
            "summary": summary,
            "roadmapItemId": str(uuid.uuid5(
                NAMESPACE,
                f"{level}:{LEGACY_ID_TITLES.get(title, title)}",
            )),
            "skillIds": SKILLS.get(LEGACY_ID_TITLES.get(title, title), []),
            "supplementalExercises": [],
        }
        if level in {"A1", "A2", "B1", "B2"}:
            topic["supplementalExercises"] = [
                concept_exercise(level, position, title, summary,
                                 other[position:] + other[:position])
            ]
        topics.append(topic)

    practice = json.loads(PRACTICE_SOURCE.read_text(encoding="utf-8"))
    practice_topics = practice.get("topics", [])
    for raw_topic in practice_topics:
        topic = dict(raw_topic)
        topic["roadmapItemId"] = str(practice_item_id(topic))
        topic["skillIds"] = []
        topic["supplementalExercises"] = [
            practice_exercise(topic, exercise, index)
            for index, exercise in enumerate(topic.pop("exercises"), start=1)
        ]
        topics.append(topic)

    write_practice_roadmap(practice_topics)
    payload = {"version": 1, "topics": topics}
    encoded = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    for output in OUTPUTS:
        output.write_text(encoded, encoding="utf-8")
        print(f"{output.relative_to(ROOT)}: {len(topics)} тем")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
