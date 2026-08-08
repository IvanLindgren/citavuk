#!/usr/bin/env python3
"""Собирает список тем грамматики в миграцию.

Темы — авторские, взяты как есть из списка (tools/data/roadmap_grammar.tsv).
Каждая тема связана с одноимённым разделом Тренажёрки через trainerTopicId.
Идеальное прохождение отмечает этот пункт карты на сервере.

Уровни C1 и C2 в исходном списке шли одним разделом «Продвинутый и уровень
носителя». Здесь они разведены: карта показывает шесть ступеней, и общая
пятнадцатка тем на двух верхних означала бы, что C2 либо повторяет C1, либо
пуст. Академическая норма и стилистика отнесены к C1, диалектология, пуризм и
фразеосинтаксис — к C2.
"""

from __future__ import annotations

import pathlib
import uuid

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = pathlib.Path(__file__).resolve().parent / "data" / "roadmap_grammar.tsv"
OUT = ROOT / "server" / "internal" / "store" / "migrations" / "0027_roadmap_seed_grammar.sql"

NAMESPACE = uuid.UUID("6f1f7f9c-3b7e-4f2e-9b7a-0d5c9a1e4b21")

# Публичные названия стали понятнее, но UUID уже лежат в прогрессе пользователей.
# Для этих семи тем идентификатор по-прежнему считается от прежнего названия.
LEGACY_ID_TITLES = {
    "Номинатив (именительный падеж)": "Номинатив (Номинатив)",
    "Аккузатив (винительный падеж) без предлогов": "Аккузатив (Акузатив) без предлогов",
    "Локатив (предложный падеж) с предлогами у и на": "Локатив (Локатив) с предлогами у и на",
    "Генитив (родительный падеж) с предлогами из/изван/близу/од": "Генитив (Генитив) с предлогами из/изван/близу/од",
    "Датив (дательный падеж)": "Датив (Датив)",
    "Инструментал (творительный падеж)": "Инструментал (Инструментал)",
    "Вокатив (звательный падеж)": "Вокатив (Вокатив)",
}

# Вводный текст раздела: чем занят уровень целиком.
INTROS = {
    "A1": "Базовые конструкции, знакомство, описание предметов и простых "
          "действий в настоящем и прошедшем времени.",
    "A2": "Завершение работы со всеми падежами, расширение временных форм и "
          "работа с глагольной аспектностью.",
    "B1": "Сложный синтаксис, сослагательное наклонение, глубокая работа с "
          "энклитиками и глагольными формами.",
    "B2": "Книжные временные формы, стилистическая гибкость, сложные союзы и "
          "нюансы словообразования.",
    "C1": "Академическая норма, тонкие стилистические и синтаксические нюансы.",
    "C2": "Уровень носителя: архаизмы, диалектология, пуризм и синтаксис, не "
          "поддающийся стандартному разбору.",
}


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> int:
    rows: list[dict[str, object]] = []
    position: dict[str, int] = {}

    for line in DATA.read_text(encoding="utf-8").splitlines()[1:]:
        if not line.strip():
            continue
        parts = line.split("\t")
        while len(parts) < 3:
            parts.append("")
        level, title, summary = (part.strip() for part in parts[:3])
        if not level or not title:
            continue
        position[level] = position.get(level, 0) + 1
        rows.append({
            "id": uuid.uuid5(
                NAMESPACE, f"{level}:{LEGACY_ID_TITLES.get(title, title)}"
            ),
            "level": level,
            "title": title,
            "summary": summary,
            "position": position[level],
            "trainer_id": (
                f"grammar-{level.lower()}-{position[level]:02d}"
                if level in {"A1", "A2", "B1", "B2"} else ""
            ),
        })

    values = ",\n".join(
        "    ('{id}', '{level}', 'grammar', 'grammar_topic', {title}, "
        "{summary}, {payload}::jsonb, {position}, 'published')".format(
            id=row["id"],
            level=row["level"],
            title=sql_quote(str(row["title"])),
            summary=sql_quote(str(row["summary"])),
            payload=sql_quote(
                '{"trainerTopicId":"' + str(row["trainer_id"]) + '"}'
                if row["trainer_id"] else '{}'
            ),
            position=row["position"],
        )
        for row in rows
    )

    intros = ",\n".join(
        "    ('{level}', 'grammar', {intro})".format(
            level=level, intro=sql_quote(text)
        )
        for level, text in INTROS.items()
    )

    OUT.write_text(
        f"""-- Темы грамматики по уровням: {len(rows)} тем.
--
-- Список авторский, перенесён как есть. Темы связаны с Тренажёркой через
-- payload.trainerTopicId; идеальное прохождение отмечает пункт карты.
--
-- Идентификаторы устойчивы (uuid5 от уровня и названия), поэтому повторное
-- применение ничего не задвоит.

INSERT INTO roadmap_items
    (id, level, category, kind, title, summary, payload, position, status)
VALUES
{values}
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    payload = EXCLUDED.payload,
    position = EXCLUDED.position,
    updated_at = now();

INSERT INTO roadmap_sections (level, category, intro)
VALUES
{intros}
ON CONFLICT (level, category) DO UPDATE SET
    intro = EXCLUDED.intro,
    updated_at = now();
""",
        encoding="utf-8",
    )

    print(f"{OUT.name}: {len(rows)} тем")
    for level in ["A1", "A2", "B1", "B2", "C1", "C2"]:
        print(f"  {level}: {sum(1 for row in rows if row['level'] == level)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
