#!/usr/bin/env python3
"""Собирает примеры к словам дорожной карты в миграцию.

Фразы написаны вручную (tools/data/roadmap_examples_*.tsv), и это осознанный
выбор, а не лень поискать готовое. Оба доступных источника проверены и не
подошли:

* Публичная библиотека — сатира и реализм XIX века. Из 1221 слова корпус
  покрывает 583, и покрывает так: «sunce te nebesko spržilo», «zaslužio je
  ljubav narodnu». Для словаря начинающего это хуже, чем ничего.
* Словарь СANU (`internal/dictionary`) — примеры литературные, с тильдами
  вместо заглавного слова и пометами источника («кукурузни ~ … Лаз. Л.»),
  и без перевода на русский.

Слово помечено звёздочками в обеих фразах. Скрипт проверяет разметку и — по
большому словнику форм — что помеченное сербское слово действительно сводится
к нужной лемме. Это ловит подмену: фразу, где вместо «kupiti» помечено
«kupovina», глаз пропустит, а словник нет.
"""

from __future__ import annotations

import gzip
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = pathlib.Path(__file__).resolve().parent / "data"
LEXICON = ROOT / "server" / "internal" / "lexicon" / "data"
OUT = ROOT / "server" / "internal" / "store" / "migrations" / "0035_roadmap_seed_examples.sql"

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

MARK = re.compile(r"\*([^*]+)\*")
WORD = re.compile(r"[^\W\d_]+", re.UNICODE)


def load_forms() -> dict[str, set[str]]:
    """Форма -> множество лемм. Одна форма нередко принадлежит нескольким."""
    forms: dict[str, set[str]] = {}
    with gzip.open(LEXICON / "bigforms.tsv.gz", "rt", encoding="utf-8") as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 2:
                forms.setdefault(parts[0], set()).add(parts[1])
    return forms


def load_words() -> dict[str, str]:
    """Лемма -> уровень. Ключ примера — лемма, уровень нужен для UPDATE."""
    words: dict[str, str] = {}
    for level in LEVELS:
        path = DATA / f"roadmap_words_{level.lower()}.tsv"
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines()[1:]:
            if line.strip():
                words[line.split("\t")[1].strip()] = level
    return words


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> int:
    forms = load_forms()
    words = load_words()

    rows: list[tuple[str, str, str, str]] = []
    problems: list[str] = []
    seen: set[str] = set()

    for level in LEVELS:
        path = DATA / f"roadmap_examples_{level.lower()}.tsv"
        if not path.exists():
            continue
        for number, line in enumerate(
            path.read_text(encoding="utf-8").splitlines()[1:], start=2
        ):
            if not line.strip():
                continue
            parts = line.split("\t")
            if len(parts) < 3:
                problems.append(f"{path.name}:{number} — меньше трёх колонок")
                continue
            lemma, example, translation = (part.strip() for part in parts[:3])

            if lemma not in words:
                problems.append(f"{path.name}:{number} — слова «{lemma}» нет в словаре карты")
                continue
            if words[lemma] != level:
                problems.append(
                    f"{path.name}:{number} — «{lemma}» лежит на уровне {words[lemma]}"
                )
                continue
            if lemma in seen:
                problems.append(f"{path.name}:{number} — повтор «{lemma}»")
                continue
            seen.add(lemma)

            marks_sr = MARK.findall(example)
            marks_ru = MARK.findall(translation)
            if len(marks_sr) != 1:
                problems.append(
                    f"{path.name}:{number} «{lemma}» — в сербской фразе помечено "
                    f"{len(marks_sr)} слов, нужно ровно одно"
                )
                continue
            if len(marks_ru) != 1:
                problems.append(
                    f"{path.name}:{number} «{lemma}» — в переводе помечено "
                    f"{len(marks_ru)} слов, нужно ровно одно"
                )
                continue

            # Помеченное сербское слово должно сводиться к нужной лемме. Форма
            # может быть любой — падеж и лицо здесь как раз и показываются.
            tokens = WORD.findall(marks_sr[0].lower())
            resolved = any(lemma in forms.get(token, set()) for token in tokens)
            base = lemma.lower().split()[0]
            if not resolved:
                # Словник знает не всё (в нём леммы из первых 20 000 по
                # частоте), поэтому запасная проверка — общее начало формы.
                # Основа берётся короткой: у «opovrgnuti» причастие «opovrgla»
                # теряет сразу четыре буквы, и строгий префикс дал бы ложную
                # тревогу на совершенно верной форме.
                stem = base[: max(4, len(base) - 4)]
                resolved = any(token.startswith(stem) for token in tokens)
            if not resolved:
                problems.append(
                    f"{path.name}:{number} «{lemma}» — помечено «{marks_sr[0]}», "
                    f"а это не форма нужного слова"
                )
                continue

            rows.append((level, lemma, example, translation))

    if problems:
        print(f"проблем: {len(problems)}", file=sys.stderr)
        for problem in problems:
            print("  " + problem, file=sys.stderr)

    if not rows:
        print("нечего записывать", file=sys.stderr)
        return 1

    values = ",\n".join(
        "    ('{level}', {lemma}, {example}, {translation})".format(
            level=level,
            lemma=sql_quote(lemma),
            example=sql_quote(example),
            translation=sql_quote(translation),
        )
        for level, lemma, example, translation in rows
    )

    OUT.write_text(
        f"""-- Примеры к словам дорожной карты: {len(rows)} фраз с переводом.
--
-- Фразы написаны вручную: корпус публичной библиотеки покрывает меньше
-- половины слов и отвечает сатирой XIX века, а словарь СANU даёт литературные
-- цитаты с тильдами и без перевода (подробности — tools/build_roadmap_examples.py).
--
-- Слово помечено звёздочками в обеих фразах. Разметка, а не отдельная колонка
-- с формой: в предложении слово стоит в падеже, и искать его сопоставлением с
-- начальной формой значило бы решать морфологическую задачу там, где ответ
-- известен заранее. В русском переводе без пометки его вообще не найти —
-- русской морфологии у нас нет.

UPDATE roadmap_words AS w
   SET example = v.example,
       example_translation = v.translation,
       updated_at = now()
  FROM (VALUES
{values}
       ) AS v (level, lemma, example, translation)
 WHERE w.level = v.level AND w.lemma = v.lemma;
""",
        encoding="utf-8",
    )

    print(f"{OUT.name}: {len(rows)} примеров")
    for level in LEVELS:
        total = sum(1 for row in rows if row[0] == level)
        if total:
            print(f"  {level}: {total}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
