"""Строит расширенный морфологический словарь сербского из srLex.

Зачем. Свой словарь форм собран из трибанка и знает 21 тысячу словоформ. Этого
хватало на разбор отдельного слова — не нашлось в словаре, достроим парадигмой
от похожей леммы, — но не хватает на разбор фразы: там нужны ВСЕ разборы формы,
чтобы предлог рядом мог выбрать из них падеж. На «Pišem olovkom o ljubavi»
прежний словарь не опознавал ни «pišem», ни «olovkom» вовсе.

Берутся все формы двенадцати тысяч самых частых лемм. Не все 168 тысяч лемм
srLex: это 6,9 млн строк и около полутора гигабайт в памяти, а сервер стоит на
общей машине. Двенадцать тысяч — это уже далеко за пределами того, что
встречается в книге, которую кто-то станет читать на сербском.

    python tools/build_forms.py srLex_v1.3.gz

Результат: server/internal/lexicon/data/bigforms.tsv.gz, отсортированный по
форме — сервер читает его двоичным поиском прямо из общего куска памяти.
"""

import collections
import gzip
import os
import sys

KEEP_LEMMAS = 12000

SKIP_POS = {"PUNCT", "X", "SYM"}

OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "server", "internal", "lexicon", "data", "bigforms.tsv.gz",
)


def main(source: str) -> None:
    freq: collections.Counter[str] = collections.Counter()
    rows: dict[str, set[tuple[str, str, str]]] = collections.defaultdict(set)

    with gzip.open(source, "rt", encoding="utf-8") as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 8:
                continue
            form, lemma, _msd, _msdf, upos, feats, absolute, _rel = parts[:8]
            if upos in SKIP_POS or not form:
                continue
            key = lemma.lower()
            try:
                freq[key] += int(absolute)
            except ValueError:
                continue
            # Признаки хранятся строкой UD, как в собственном словаре: их
            # разбирает та же ParseFeats, и второго формата заводить незачем.
            rows[key].add((form.lower(), upos, "" if feats == "_" else feats))

    keep = [lemma for lemma, _ in freq.most_common(KEEP_LEMMAS)]

    # Одна и та же форма принадлежит разным леммам («sam» — и «biti», и «sam»),
    # и все такие разборы нужны: выбирает между ними уже фраза.
    table: dict[str, set[tuple[str, str, str]]] = collections.defaultdict(set)
    for lemma in keep:
        for form, upos, feats in rows[lemma]:
            table[form].add((lemma, upos, feats))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    written = 0
    with gzip.open(OUT, "wt", encoding="utf-8", newline="\n") as out:
        for form in sorted(table):
            for lemma, upos, feats in sorted(table[form]):
                out.write(f"{form}\t{lemma}\t{upos}\t{feats}\n")
                written += 1

    print(f"{len(keep)} лемм, {len(table)} форм, {written} строк")
    print(f"-> {OUT} ({os.path.getsize(OUT)} байт)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
