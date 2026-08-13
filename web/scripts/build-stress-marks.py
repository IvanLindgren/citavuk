#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Собирает таблицу ударений для читалки сайта.

Место ударения в сербском по написанию не восстанавливается, и словарь нужен
целиком. Приложение носит его с собой, сайт — нет, поэтому здесь из лексикона
сервера (`server/internal/lexicon/data/accents.tsv.gz`, данные Викисловаря,
CC BY-SA 4.0) делается лёгкая таблица «словоформа → номер ударного слога».

Хранится именно номер слога, а не ударное написание: номер одинаково годится
и для латиницы, и для кириллицы, и весит один байт вместо слова с диакритикой.

Строки, где ударение и так предсказуемо, в файл не попадают: в одно- и
двусложном слове ударение стоит на первом слоге (в сербском оно никогда не
падает на последний), это правило читалка применяет сама. А вот двусложные
исключения из него — заимствования вроде «bàzen» — в таблице остаются, иначе
правило поставило бы им ударение не туда.

Запуск из каталога web/::

    python scripts/build-stress-marks.py
"""

from __future__ import annotations

import gzip
import os
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(ROOT)
SOURCE = os.path.join(REPO, "server", "internal", "lexicon", "data", "accents.tsv.gz")
OUT = os.path.join(ROOT, "public", "reader", "stress.txt")

# Знаки сербского ударения: краткое и долгое нисходящее, краткое и долгое
# восходящее. Макрон сюда не входит — он обозначает долготу безударного слога.
MARKS = "̏̑̀́"

VOWELS = set("aeiouаеиоуAEIOUАЕИОУ")
RHOTIC = set("rрRР")


def nuclei(letters: list[str]) -> list[int]:
    """Индексы слоговых вершин: гласные и слоговое «r» между согласными."""
    out = []
    for index, letter in enumerate(letters):
        if letter in VOWELS:
            out.append(index)
            continue
        if letter not in RHOTIC:
            continue
        before = letters[index - 1] if index else ""
        after = letters[index + 1] if index + 1 < len(letters) else ""
        if before not in VOWELS and after not in VOWELS:
            out.append(index)
    return out


def stressed_syllable(written: str) -> tuple[int, int]:
    """Номер ударного слога и всего слогов. Ноль — знака ударения нет."""
    letters: list[str] = []
    mark_at = -1
    for char in unicodedata.normalize("NFD", written):
        if unicodedata.combining(char):
            # Знак приходит после своей буквы. Проверка, что буква гласная,
            # обязательна: в разложенном виде «ć» — это «c» плюс акут, то есть
            # ровно тот же знак, что и долгое восходящее ударение.
            if (
                char in MARKS
                and mark_at < 0
                and letters
                and (letters[-1] in VOWELS or letters[-1] in RHOTIC)
            ):
                mark_at = len(letters) - 1
            continue
        letters.append(char)

    points = nuclei(letters)
    if mark_at < 0 or mark_at not in points:
        return 0, len(points)
    return points.index(mark_at) + 1, len(points)


def main() -> None:
    rows: list[str] = []
    skipped = 0
    with gzip.open(SOURCE, "rt", encoding="utf-8") as source:
        for line in source:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3 or not parts[0]:
                continue
            # Ударное написание: латиница, а если её нет — кириллица. Номер
            # слога из любой из них получается один и тот же.
            written = parts[1] or parts[2]
            if not written:
                continue
            at, total = stressed_syllable(written)
            if at == 0:
                continue
            if total <= 2 and at == 1:
                skipped += 1
                continue
            rows.append(f"{parts[0]}\t{at}")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as out:
        out.write("\n".join(rows))
        out.write("\n")

    size = os.path.getsize(OUT) / 1024
    print(f"Ударения: {len(rows)} форм ({size:.0f} КБ), {skipped} взяты правилом.")


if __name__ == "__main__":
    main()
