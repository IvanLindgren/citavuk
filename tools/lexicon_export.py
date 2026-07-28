#!/usr/bin/env python3
"""Экспорт lexicon.db в сжатый TSV, встраиваемый в бинарник сервера.

    python tools/lexicon_export.py

Сервер держит лексикон в памяти, а не читает SQLite: так не нужен ни драйвер
SQLite для Go, ни отдельный файл на машине. Источник истины остаётся один —
frontend/assets/lexicon.db.
"""

from __future__ import annotations

import gzip
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "frontend" / "assets" / "lexicon.db"
OUT_DIR = ROOT / "server" / "internal" / "lexicon" / "data"


def clean(value: str) -> str:
    return value.replace("\t", " ").replace("\n", " ").strip()


def main() -> int:
    if not SOURCE.exists():
        print(f"нет файла {SOURCE}", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(SOURCE)

    forms = OUT_DIR / "forms.tsv.gz"
    rows = 0
    with gzip.open(forms, "wt", encoding="utf-8", newline="\n") as out:
        for form, lemma, upos, feats in db.execute(
            "SELECT form, lemma, upos, feats FROM lexicon"
        ):
            out.write(
                f"{clean(form)}\t{clean(lemma)}\t{clean(upos)}\t{clean(feats)}\n"
            )
            rows += 1

    words = OUT_DIR / "dictionary.tsv.gz"
    entries = 0
    with gzip.open(words, "wt", encoding="utf-8", newline="\n") as out:
        for word, translation in db.execute(
            "SELECT word, translation FROM dictionary"
        ):
            out.write(f"{clean(word)}\t{clean(translation)}\n")
            entries += 1

    db.close()
    print(f"{forms.name}: {rows} форм, {forms.stat().st_size // 1024} КБ")
    print(f"{words.name}: {entries} статей, {words.stat().st_size // 1024} КБ")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
