#!/usr/bin/env python3
"""Собирает начальный словарь дорожной карты в миграцию.

Уровень слова и его тема берутся из разных источников, и это не небрежность,
а следствие того, чем наши данные являются. Частота по корпусу отвечает на
вопрос «насколько слово редкое» и потому годится для уровня; на вопрос «о чём
это слово» она не отвечает вовсе. Хуже того, верх нашего частотного списка —
новостной корпус: «predsednik», «dinar», «opština», «skupština» стоят в первой
трёхстах, а «mačka» и «kašika» — далеко за ними. Отбирать по нему темы для
начинающего значило бы учить человека читать протоколы скупщины раньше, чем
он назовёт кошку.

Поэтому состав и темы заданы вручную (tools/data/roadmap_words_*.tsv), а
частота используется наоборот — как проверка: скрипт находит ранг каждого
слова и сообщает о тех, чей уровень заметно расходится с частотной полосой.
Расхождение не ошибка (у бытовой лексики ранг в новостном корпусе всегда хуже
её настоящей употребительности), но посмотреть на список стоит.
"""

from __future__ import annotations

import gzip
import pathlib
import sys
import uuid

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = pathlib.Path(__file__).resolve().parent / "data"
LEXICON = ROOT / "server" / "internal" / "lexicon" / "data"
OUT = ROOT / "server" / "internal" / "store" / "migrations" / "0026_roadmap_seed_words.sql"

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

# Те же полосы, по которым оценивается сложность книги (internal/level/text.go).
BANDS = [("A1", 1500), ("A2", 3000), ("B1", 6000), ("B2", 12000)]

# Пространство имён для устойчивых идентификаторов: повторный запуск скрипта
# должен давать те же id, иначе миграция, применённая дважды, наплодит дубли.
NAMESPACE = uuid.UUID("6f1f7f9c-3b7e-4f2e-9b7a-0d5c9a1e4b20")


def load_ranks() -> dict[str, int]:
    """Ранг леммы по частоте: строка N файла — N-я по частоте лемма."""
    ranks: dict[str, int] = {}
    with gzip.open(LEXICON / "frequency.tsv.gz", "rt", encoding="utf-8") as handle:
        for index, line in enumerate(handle, start=1):
            lemma = line.strip()
            if lemma and lemma not in ranks:
                ranks[lemma] = index
    return ranks


def load_known_forms() -> set[str]:
    """Все формы большого словника: по ним видно, что слово вообще существует."""
    forms: set[str] = set()
    with gzip.open(LEXICON / "wordranks.tsv.gz", "rt", encoding="utf-8") as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t")
            if parts and parts[0]:
                forms.add(parts[0])
    return forms


def band_of(rank: int) -> str:
    for level, limit in BANDS:
        if rank <= limit:
            return level
    return "C1"


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> int:
    ranks = load_ranks()
    known = load_known_forms()

    rows: list[dict[str, object]] = []
    unknown: list[tuple[str, str]] = []
    mismatch: list[tuple[str, str, str, int]] = []
    seen: set[tuple[str, str]] = set()
    # Слово принадлежит одному уровню. Выучив его на A1, человек не должен
    # встретить его снова как новое на B1 — база этого не запрещает (ограничение
    # стоит на паре уровень-лемма), поэтому проверяем здесь.
    across: dict[str, str] = {}

    for level in LEVELS:
        path = DATA / f"roadmap_words_{level.lower()}.tsv"
        if not path.exists():
            continue
        lines = path.read_text(encoding="utf-8").splitlines()
        position = 0
        for line in lines[1:]:
            if not line.strip():
                continue
            parts = line.split("\t")
            while len(parts) < 5:
                parts.append("")
            theme, lemma, translation, pos, note = (part.strip() for part in parts[:5])
            if not theme or not lemma:
                continue

            key = (level, lemma)
            if key in seen:
                print(f"повтор внутри уровня: {level} {lemma}", file=sys.stderr)
                continue
            if lemma in across:
                print(f"повтор между уровнями: {lemma} — {across[lemma]} и {level}",
                      file=sys.stderr)
                continue
            seen.add(key)
            across[lemma] = level

            rank = ranks.get(lemma, 0)
            if lemma not in known and lemma.lower() not in known:
                unknown.append((level, lemma))
            if rank and band_of(rank) != level:
                mismatch.append((level, lemma, band_of(rank), rank))

            position += 1
            rows.append({
                "id": uuid.uuid5(NAMESPACE, f"{level}:{lemma}"),
                "level": level,
                "theme": theme,
                "lemma": lemma,
                "translation": translation,
                "pos": pos,
                "note": note,
                "rank": rank,
                "position": position,
            })

    # Не ошибка, а справка: слово реже двадцатитысячного по корпусу. Для C1–C2
    # это ожидаемо, для A1–A2 — повод посмотреть, не опечатка ли и нет ли более
    # обиходного синонима, который морфология точно узнает.
    if unknown:
        print(f"\nвне частотного словника ({len(unknown)}):", file=sys.stderr)
        for level, lemma in unknown:
            print(f"  {level} {lemma}", file=sys.stderr)
    if mismatch:
        print(f"\nуровень расходится с частотной полосой ({len(mismatch)}):", file=sys.stderr)
        for level, lemma, band, rank in mismatch[:40]:
            print(f"  {level} {lemma}: полоса {band}, ранг {rank}", file=sys.stderr)
        if len(mismatch) > 40:
            print(f"  … и ещё {len(mismatch) - 40}", file=sys.stderr)

    header = f"""-- Начальный словарь дорожной карты: {len(rows)} слов по темам.
--
-- Темы и состав подобраны вручную, уровень проверен по частоте корпуса
-- (tools/build_roadmap_words.py). Частотный список сам по себе для этого не
-- годится: его верх — новостной корпус, где «skupština» встречается чаще, чем
-- «kašika», а начинающему нужно обратное.
--
-- Слова выкладываются сразу опубликованными: раздел, открывшийся пустым,
-- ничем не лучше отсутствующего. Править и снимать их можно в админке.
-- Идентификаторы устойчивы (uuid5 от уровня и леммы), поэтому повторное
-- применение ничего не задвоит.

INSERT INTO roadmap_words
    (id, level, theme, lemma, translation, pos, note, rank, position, status)
VALUES
"""

    values = []
    for row in rows:
        values.append(
            "    ('{id}', '{level}', {theme}, {lemma}, {translation}, "
            "{pos}, {note}, {rank}, {position}, 'published')".format(
                id=row["id"],
                level=row["level"],
                theme=sql_quote(str(row["theme"])),
                lemma=sql_quote(str(row["lemma"])),
                translation=sql_quote(str(row["translation"])),
                pos=sql_quote(str(row["pos"])),
                note=sql_quote(str(row["note"])),
                rank=row["rank"],
                position=row["position"],
            )
        )

    body = ",\n".join(values)
    tail = """
ON CONFLICT (level, lemma) DO UPDATE SET
    theme = EXCLUDED.theme,
    translation = EXCLUDED.translation,
    pos = EXCLUDED.pos,
    note = EXCLUDED.note,
    rank = EXCLUDED.rank,
    position = EXCLUDED.position,
    updated_at = now();
"""

    OUT.write_text(header + body + tail, encoding="utf-8")
    print(f"\n{OUT.name}: {len(rows)} слов")
    for level in LEVELS:
        count = sum(1 for row in rows if row["level"] == level)
        themes = len({row["theme"] for row in rows if row["level"] == level})
        print(f"  {level}: {count} слов, {themes} тем")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
