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
OUTPUTS = (
    ROOT / "frontend" / "assets" / "course" / "trainer_catalog.json",
    ROOT / "web" / "public" / "course" / "trainer_catalog.json",
)
NAMESPACE = uuid.UUID("6f1f7f9c-3b7e-4f2e-9b7a-0d5c9a1e4b21")

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
            "roadmapItemId": str(uuid.uuid5(NAMESPACE, f"{level}:{title}")),
            "skillIds": SKILLS.get(title, []),
            "supplementalExercises": [],
        }
        if level in {"A1", "A2", "B1", "B2"}:
            topic["supplementalExercises"] = [
                concept_exercise(level, position, title, summary,
                                 other[position:] + other[:position])
            ]
        topics.append(topic)

    payload = {"version": 1, "topics": topics}
    encoded = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    for output in OUTPUTS:
        output.write_text(encoded, encoding="utf-8")
        print(f"{output.relative_to(ROOT)}: {len(topics)} тем")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
