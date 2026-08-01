#!/usr/bin/env python3
"""Собирает компактный английский лексикон для детектора и разбора слов.

Зачем он нужен. Читавук — про сербский, но в сербских учебниках английский
живёт как язык-посредник, и по английскому слову тоже нажимают. Чтобы отличить
английское слово от сербского и разобрать его форму, нужен список лемм с
частями речи и таблица неправильных форм.

Почему генератор, а не список руками. Ровно по той же причине, что и
`build_lexicon.py` для сербского: список, набранный вручную, невозможно
проверить и воспроизвести. Здесь источники такие:

* **Princeton WordNet 3.0** — леммы существительных, глаголов, прилагательных и
  наречий, а также файлы исключений (`*.exc`) с неправильными формами. Это и
  есть авторитетная таблица «ran → run», «children → child».
* **Brown Corpus** (universal tagset) — частотность и служебные части речи.
  В WordNet нет ни артиклей, ни предлогов, ни местоимений, ни союзов: он
  описывает только знаменательные слова. Из корпуса берутся ТОЛЬКО счётчики и
  метки частей речи, сам текст никуда не попадает.

Результат — один JSON, который кладётся в два места: ассеты Flutter и каталог
`go:embed` сервера. Единый файл важен: расходись эти две копии, сайт и
приложение разбирали бы одно и то же слово по-разному.

Запуск (nltk и корпуса ставятся один раз):

    pip install nltk regex
    python -c "import nltk; [nltk.download(p) for p in ('wordnet','brown','universal_tagset')]"
    python tools/build_english_lexicon.py

⚠️ Запускать из каталога ВНЕ репозитория нельзя только в одном случае: если
venv лежит внутри дерева проекта, защитный хук nltk блокирует собственные
импорты. Скрипт переходит в каталог со скриптом сам, поэтому обычно это не
мешает; при ошибке «Blocked import … from current working directory» запусти
интерпретатор из каталога вне проекта.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile

from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Куда кладём результат. Обе копии обязаны совпадать байт в байт.
TARGETS = [
    ROOT / "frontend" / "assets" / "english" / "english_lexicon.json",
    ROOT / "server" / "internal" / "english" / "data" / "english_lexicon.json",
]

# Однобуквенные коды частей речи. Короткие — потому что этот файл едет в
# мобильный бандл, и «NOUN» вместо «n» стоил бы лишних сотни килобайт.
CODES = {
    "n": "NOUN",
    "v": "VERB",
    "a": "ADJ",
    "r": "ADV",
    "p": "PRON",
    "d": "DET",
    "i": "ADP",
    "c": "CONJ",
    "t": "PART",
    "m": "NUM",
}

WORDNET_POS = {"n": "n", "v": "v", "a": "a", "s": "a", "r": "r"}

# Universal tagset → наши коды. Знаменательные части речи берутся из WordNet,
# поэтому здесь только служебные.
BROWN_CLOSED = {
    "DET": "d",
    "ADP": "i",
    "PRON": "p",
    "CONJ": "c",
    "PRT": "t",
    "NUM": "m",
}

# Открытые классы, которых может не быть в WordNet. Оттуда берутся модальные
# глаголы («would», «does») и неопределённые местоимения («everyone»,
# «everything»): корпус метит их существительными, а WordNet не описывает вовсе.
BROWN_OPEN = {
    "VERB": "v",
    "NOUN": "n",
    "ADJ": "a",
    "ADV": "r",
}


SOURCES = [
    {
        "name": "Princeton WordNet 3.0",
        "url": "https://wordnet.princeton.edu/",
        "license": "WordNet 3.0 License (BSD-подобная, с указанием авторства)",
        "used": "леммы знаменательных частей речи и файлы исключений (*.exc)",
    },
    {
        "name": "Brown Corpus (NLTK, universal tagset)",
        "url": "https://www.nltk.org/nltk_data/",
        "license": "Free for research/teaching use (Brown University)",
        "used": "частотность слов и метки служебных частей речи; текст не переносится",
    },
]


def load_wordnet_lemmas(wn) -> dict[str, set[str]]:
    """Лемма → множество кодов частей речи."""
    out: dict[str, set[str]] = defaultdict(set)
    for wn_pos, code in (("n", "n"), ("v", "v"), ("a", "a"), ("r", "r")):
        for name in wn.all_lemma_names(pos=wn_pos):
            if not usable(name):
                continue
            out[name].add(code)
    return out


def usable(word: str) -> bool:
    """Годится ли слово для бандла.

    Составные («ice_cream»), с дефисом и с цифрами выбрасываются: токенизатор
    читалки всё равно отдаёт по одному слову. Однобуквенные — тоже, кроме «a»
    и «i»: они добавляются отдельно как служебные.
    """
    return word.isascii() and word.isalpha() and word.islower() and 2 <= len(word) <= 24


def load_exceptions(wn) -> dict[str, dict[str, str]]:
    """Неправильные формы из WordNet: код части речи → {форма: лемма}.

    Файлы `*.exc` — готовая таблица исключений английской морфологии, ради неё
    WordNet здесь и нужен в первую очередь. Читаем их через разобранную
    корпусом карту, а не по путям: корпус может лежать и распакованным
    каталогом, и zip-архивом, и разбирать оба случая руками незачем.
    """
    wn.ensure_loaded()
    out: dict[str, dict[str, str]] = {code: {} for code in ("n", "v", "a", "r")}
    for wn_pos, table in wn._exception_map.items():
        # 's' — прилагательные-сателлиты, у них та же таблица, что у 'a'.
        code = WORDNET_POS.get(wn_pos)
        if code is None:
            continue
        for form, candidates in table.items():
            if not usable(form) or not candidates:
                continue
            # Строка формата «форма лемма [лемма…]». Берём первую лемму —
            # остальные это редкие омонимичные разборы.
            lemma = candidates[0]
            if usable(lemma):
                out[code].setdefault(form, lemma)
    return out


def load_brown(brown) -> tuple[Counter, dict[str, str], dict[str, str]]:
    """Частотность слов, служебные части речи и глагольные метки.

    Возвращает счётчики, карту служебных слов и отдельно карту слов, которые
    корпус считает глаголами. Вторая нужна для модальных и вспомогательных
    (`would`, `should`, `does`): WordNet описывает только знаменательные слова
    и таких форм не знает вовсе, а без них не разобрать ни одного составного
    времени.
    """
    counts: Counter = Counter()
    tags: dict[str, Counter] = defaultdict(Counter)
    for word, tag in brown.tagged_words(tagset="universal"):
        low = word.lower()
        if not low.isascii() or not low.isalpha():
            continue
        counts[low] += 1
        tags[low][tag] += 1

    closed: dict[str, str] = {}
    open_class: dict[str, str] = {}
    for word, tag_counts in tags.items():
        tag, _ = tag_counts.most_common(1)[0]
        if tag in BROWN_CLOSED:
            closed[word] = BROWN_CLOSED[tag]
        elif tag in BROWN_OPEN:
            open_class[word] = BROWN_OPEN[tag]
    return counts, closed, open_class


def resolvable(word: str, words: dict[str, set[str]]) -> bool:
    """Разложит ли движок это слово в уже известную лемму.

    Повторяет правила `english_engine.dart` и `internal/english/english.go` — не
    целиком, а только ту их часть, которая отвечает на вопрос «это форма
    известного слова?». Если да, слово не должно попасть в словарь отдельной
    леммой: иначе «states» перестало бы быть множественным от «state».
    """

    def known(candidate: str) -> bool:
        return len(candidate) >= 2 and candidate in words

    def stems(stem: str) -> set[str]:
        out = {stem, stem + "e"}
        if len(stem) >= 2:
            if stem[-1] == stem[-2] and stem[-1] not in "aeiou":
                out.add(stem[:-1])
            if stem.endswith("i"):
                out.add(stem[:-1] + "y")
        return out

    if word.endswith("s") and not word.endswith("ss") and len(word) > 2:
        stem = word[:-1]
        candidates = {stem}
        if stem.endswith("ie"):
            candidates.add(stem[:-2] + "y")
        if stem.endswith("e") and stem[:-1].endswith(("s", "x", "z", "ch", "sh")):
            candidates.add(stem[:-1])
        if stem.endswith("ve"):
            candidates.update({stem[:-2] + "f", stem[:-2] + "fe"})
        if any(known(c) for c in candidates):
            return True

    for suffix in ("ing", "est", "ed", "er", "ly"):
        if len(word) > len(suffix) + 1 and word.endswith(suffix):
            if any(known(c) for c in stems(word[: -len(suffix)])):
                return True

    return False


def build(top: int, min_closed: int, min_missing: int) -> dict:
    from nltk.corpus import brown
    from nltk.corpus import wordnet as wn


    lemmas = load_wordnet_lemmas(wn)
    exceptions = load_exceptions(wn)
    counts, closed, brown_open = load_brown(brown)

    words: dict[str, set[str]] = defaultdict(set)

    # 1. Служебные слова. Их мало, они самые частые, и без них детектор не
    #    опознал бы ни одной живой фразы: в «the book is on the table» четыре
    #    слова из шести — служебные.
    for word, code in closed.items():
        if counts[word] >= min_closed and (len(word) >= 2 or word in {"a", "i"}):
            words[word].add(code)
    for word in ("a", "i"):
        if word in closed:
            words[word].add(closed[word])

    # 2. Знаменательные слова: леммы WordNet, отсортированные по частоте Brown.
    #    Полный WordNet — 117 тысяч лемм, включая биологические таксоны; в
    #    бандл нужен обиходный слой, а редкое слово всё равно опознается по
    #    орфографии, невозможной в сербской латинице.
    ranked = sorted(lemmas, key=lambda w: (-counts.get(w, 0), w))
    for word in ranked[:top]:
        words[word] |= lemmas[word]

    # 2a. Частые слова, которых WordNet не знает вовсе: модальные глаголы
    #     («would», «does») и неопределённые местоимения («everyone»,
    #     «everything»). Без этого шага не разобралось бы ни одно составное
    #     время, а «everyone» не считалось бы английским словом.
    #
    #     Но добавлять всё подряд нельзя: корпус метит существительными и
    #     формы («states», «members»), а они обязаны разбираться как
    #     множественное число, а не становиться отдельными леммами.
    for word, code in brown_open.items():
        if counts[word] < min_missing or word in lemmas:
            continue
        # Короткие обрывки — это шум оцифровки корпуса, а не слова.
        if not usable(word) or len(word) < 3:
            continue
        if resolvable(word, words):
            continue
        words[word].add(code)

    # 3. Леммы, на которые ссылаются неправильные формы. Без этого «children»
    #    разложилось бы в «child», которого нет в списке, и слово осталось бы
    #    неопознанным.
    irregular: dict[str, str] = {}
    for code, table in exceptions.items():
        for form, lemma in table.items():
            if lemma not in lemmas or code not in lemmas[lemma]:
                # Форма ссылается на лемму, которой WordNet не знает в этой
                # части речи, — такой строке доверять нельзя.
                continue
            words[lemma] |= lemmas[lemma]
            # Форма, совпадающая с леммой, ничего не даёт.
            if form != lemma:
                irregular.setdefault(form, f"{lemma}/{code}")

    # Омонимы вроде «saw» (прошедшее от «see» и существительное «пила»)
    # остаются в обеих таблицах намеренно: движок покажет разбор формы, но
    # отметит, что слово бывает и самостоятельной леммой. Выкидывать такую
    # строку здесь значило бы потерять самый частый разбор.
    encoded = {word: "".join(sorted(codes)) for word, codes in words.items() if codes}

    return {
        "version": 1,
        "generated": date.today().isoformat(),
        "sources": SOURCES,
        "codes": CODES,
        "counts": {"words": len(encoded), "irregular": len(irregular)},
        "words": dict(sorted(encoded.items())),
        "irregular": dict(sorted(irregular.items())),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--top",
        type=int,
        default=16000,
        help="сколько знаменательных лемм брать (по частоте Brown)",
    )
    parser.add_argument(
        "--min-closed",
        type=int,
        default=3,
        help="минимальная частота служебного слова в Brown",
    )
    parser.add_argument(
        "--min-missing",
        type=int,
        default=20,
        help="минимальная частота слова, которого нет в WordNet",
    )
    args = parser.parse_args()

    # Защитный хук nltk блокирует свои же импорты, если модуль резолвится
    # внутри текущего каталога. venv проекта лежит в дереве репозитория,
    # поэтому из `C:\citavuk` (и из любого его предка, включая корень диска)
    # блокируется вообще всё, вплоть до `subprocess`. Уходим во временный
    # каталог: он венву не предок, и проверка проходит.
    os.chdir(tempfile.gettempdir())

    data = build(args.top, args.min_closed, args.min_missing)

    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    for target in TARGETS:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(payload, encoding="utf-8")
        print(f"{target.relative_to(ROOT)}: {len(payload) / 1024:.0f} КиБ")

    print(f"слов: {data['counts']['words']}, неправильных форм: {data['counts']['irregular']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
