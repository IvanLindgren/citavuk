"""Строит частотные данные сербского для оценки сложности текста.

Источник — srLex v1.3 (ReLDI, CC BY-SA 4.0): 6,9 млн словоформ с абсолютной
частотой по корпусу. Сам srLex в сервер не встраивается: он держит и разбор
каждой формы, а это на восьми тысячах самых частых лемм уже около 180 МБ в
памяти, и сервер стоит на общей машине. Встраивается ровно то, чего не хватало.

Файлов два, потому что задачи две:

  frequency.tsv.gz  — двадцать тысяч самых частых ЛЕММ по порядку. Ранг в нём
                      разводит омонимы: «da» как союз стоит четвёртым, а глагол
                      «dati» — далеко за ним.

  wordranks.tsv.gz  — КАЖДАЯ словоформа этих лемм с рангом своей леммы. Без неё
                      оценка сложности не работала вовсе: свой морфологический
                      словарь знает 21 тысячу форм, а в живом тексте их на
                      порядок больше, и почти каждое слово считалось редким.
                      Ранг именно леммы, а не формы: «књигама» не труднее
                      «књига», это одно слово в другом падеже.

Имена собственные выброшены: в книге их сколько угодно, но труднее она от них
не становится — «Милош» читается одинаково на любом уровне.

    python tools/build_frequency.py srLex_v1.3.gz
"""

import collections
import gzip
import os
import sys

# Сколько лемм оставить. Двадцать тысяч покрывают то, что вообще встречается в
# живом тексте; дальше идёт хвост, где ранг уже ничего не различает.
KEEP = 20000

SKIP_POS = {"PUNCT", "X", "SYM", "PROPN"}

DATA = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "server", "internal", "lexicon", "data",
)


def main(source: str) -> None:
    freq: collections.Counter[str] = collections.Counter()
    forms: dict[str, set[str]] = collections.defaultdict(set)

    with gzip.open(source, "rt", encoding="utf-8") as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 8:
                continue
            form, lemma, _msd, _msdf, upos, _udf, absolute, _rel = parts[:8]
            if upos in SKIP_POS:
                continue
            lemma = lemma.lower()
            try:
                freq[lemma] += int(absolute)
            except ValueError:
                continue
            forms[lemma].add(form.lower())

    ranked = [lemma for lemma, _ in freq.most_common(KEEP)]
    os.makedirs(DATA, exist_ok=True)

    lemmas_path = os.path.join(DATA, "frequency.tsv.gz")
    with gzip.open(lemmas_path, "wt", encoding="utf-8", newline="\n") as out:
        for lemma in ranked:
            out.write(lemma + "\n")

    # Форма может принадлежать нескольким леммам («sam» — и «biti», и «sam»).
    # Берётся меньший ранг, то есть самое частое прочтение: при чтении узнаётся
    # именно оно, и считать такую форму редкой было бы неверно.
    best: dict[str, int] = {}
    for rank, lemma in enumerate(ranked, start=1):
        for form in forms[lemma]:
            if form and (form not in best or rank < best[form]):
                best[form] = rank

    ranks_path = os.path.join(DATA, "wordranks.tsv.gz")
    with gzip.open(ranks_path, "wt", encoding="utf-8", newline="\n") as out:
        for form in sorted(best):
            out.write(f"{form}\t{best[form]}\n")

    print(f"{len(ranked)} лемм -> {lemmas_path} ({os.path.getsize(lemmas_path)} байт)")
    print(f"{len(best)} форм  -> {ranks_path} ({os.path.getsize(ranks_path)} байт)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
