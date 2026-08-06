#!/usr/bin/env python3
"""Ударения и формы глаголов из Викисловаря в lexicon.db.

    python tools/build_wiktionary.py                   # скачать и собрать
    python tools/build_wiktionary.py --dump путь.jsonl # из скачанного дампа

Зачем ударения. Место ударения в сербском по написанию не восстанавливается:
ударений четыре (краткое и долгое, восходящее и нисходящее), и словарь для них
нужен настоящий. Своего у проекта нет, а показывать «ударение где-то не на
последнем слоге» — это рассуждение о произношении, а не произношение.

Зачем формы глаголов. Свой лексикон разрежен: на лемму приходится пара форм, а
целых глаголов вроде «bližiti» в нём нет вовсе. Пока разбор опознавал глагол
только по нему, частица «se» не находила своего глагола в первом же попавшемся
предложении («Bližila se ponoć»), и перевод спрашивался про одно «se». В
Викисловаре у сербских глаголов лежат полные таблицы спряжения — из них и
берётся список словоформ вместе с начальной формой.

Откуда. Английский Викисловарь размечает сербохорватские заголовки ударением
(«knjȉga») и даёт транскрипцию с тоном («/kɲîɡa/»). Машиночитаемая выгрузка —
kaikki.org, проект Тату Юлонена, разбирающий дамп Викисловаря в JSONL.

Лицензия. Текст Викисловаря — CC BY-SA 4.0. Производные данные обязаны нести
указание источника, поэтому оно записывается прямо в таблицу (`accents_meta`) и
показывается в карточке разбора.

Что кладётся в базу. Таблица `accents`: написание без знаков → ударное
написание и транскрипция. Формы берутся и из заголовков статей, и из таблиц
словоизменения — там, где Викисловарь проставил знаки. Ударение сербского
слова меняется по парадигме, поэтому достраивать его правилом нельзя: чего в
словаре нет, то и показывается без ударения.

Таблица `verb_forms`: словоформа → начальная форма глагола. Составные формы
(«bližit ću», «bȕdēm bližio») пропускаются: в тексте это два слова, и как одно
они не ищутся.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEXICON = ROOT / "frontend" / "assets" / "lexicon.db"
DUMP_URL = (
    "https://kaikki.org/dictionary/Serbo-Croatian/"
    "kaikki.org-dictionary-SerboCroatian.jsonl"
)
SOURCE_NOTE = "Викисловарь (en.wiktionary.org), CC BY-SA 4.0, выгрузка kaikki.org"

# Знаки сербского ударения: краткое нисходящее (двойной гравис), долгое
# нисходящее (перевёрнутая бреве), краткое восходящее (гравис), долгое
# восходящее (акут) и долгота (макрон).
ACCENT_MARKS = "̏̑̀́̄"
# Те же тоны в транскрипции МФА.
IPA_MARKS = "̌̂̏̑̀́ː"

# Ударение в сербском стоит на гласном либо на слоговом «r» — и только там знак
# считается ударением. Проверка обязательна: в разложенном виде «ć» — это «c»
# плюс акут, то есть ровно тот же знак, что и долгое восходящее ударение. Без
# неё «kuća» превращалась в «kuca» — другое слово («собачка» против «дома»), —
# и весь словарь ударений оказывался сдвинут на соседние статьи.
ACCENTABLE = set("aeiouraeiouRAEIOU") | set("аеиоуруАЕИОУР")


def _base_of(index: int, chars: list[str]) -> str:
    for position in range(index - 1, -1, -1):
        if not unicodedata.combining(chars[position]):
            return chars[position]
    return ""


def has_accent(text: str, marks: str) -> bool:
    chars = list(unicodedata.normalize("NFD", text))
    for index, char in enumerate(chars):
        if char not in marks:
            continue
        # В транскрипции знаки стоят там же, где в написании, но проверять базу
        # не нужно: букв «ć» в МФА нет.
        if marks is IPA_MARKS or _base_of(index, chars) in ACCENTABLE:
            return True
    return False


def strip_accent(text: str) -> str:
    """Написание без знаков ударения — то, как слово стоит в тексте."""
    chars = list(unicodedata.normalize("NFD", text))
    kept = [
        char
        for index, char in enumerate(chars)
        if not (char in ACCENT_MARKS and _base_of(index, chars) in ACCENTABLE)
    ]
    return unicodedata.normalize("NFC", "".join(kept))


def is_cyrillic(text: str) -> bool:
    return any("Ѐ" <= char <= "ӿ" for char in text)


CYR_TO_LAT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ђ": "đ", "е": "e",
    "ж": "ž", "з": "z", "и": "i", "ј": "j", "к": "k", "л": "l", "љ": "lj",
    "м": "m", "н": "n", "њ": "nj", "о": "o", "п": "p", "р": "r", "с": "s",
    "т": "t", "ћ": "ć", "у": "u", "ф": "f", "х": "h", "ц": "c", "ч": "č",
    "џ": "dž", "ш": "š",
}


def normalize(word: str) -> str:
    """Ключ словаря — тот же, что в lexicon.Normalize и transliteration.dart."""
    lowered = strip_accent(word).strip().lower()
    return "".join(CYR_TO_LAT.get(ch, ch) for ch in lowered)


def download(target: Path) -> None:
    print(f"качаю {DUMP_URL}")
    with urllib.request.urlopen(DUMP_URL, timeout=120) as response:
        with target.open("wb") as out:
            while chunk := response.read(1 << 20):
                out.write(chunk)
    print(f"скачано {target.stat().st_size / 1e6:.0f} МБ")


class Accent:
    """Ударение одной словоформы в обоих алфавитах."""

    __slots__ = ("latin", "cyrillic", "ipa")

    def __init__(self) -> None:
        self.latin = ""
        self.cyrillic = ""
        self.ipa = ""


# Служебные строки таблиц спряжения: разметка шаблона, а не формы языка.
SERVICE_TAGS = {"table-tags", "inflection-template", "error-unrecognized-form"}


def collect(dump: Path) -> tuple[dict[str, Accent], dict[str, str]]:
    """Собирает ударения и словоформы глаголов."""
    accents: dict[str, Accent] = {}
    verbs: dict[str, str] = {}

    def remember_verb(form: str, lemma: str) -> None:
        key = normalize(form)
        if len(key) < 2 or not key.isalpha():
            return
        previous = verbs.get(key)
        # Запись из таблицы спряжения важнее заголовочной: у причастия «ležao»
        # есть своя статья, и по ней начальной формой оказывался он сам.
        if previous is None or (previous == key and lemma != key):
            verbs[key] = lemma

    def shares_stem(token: str, lemma: str) -> bool:
        """Слово из составной формы принадлежит этому же глаголу."""
        size = max(2, min(3, len(lemma) - 2))
        return len(token) >= 2 and token[:size] == lemma[:size]

    def remember(written: str, accented: str, ipa: str) -> None:
        key = normalize(written)
        if not key or not key.isalpha():
            return
        entry = accents.setdefault(key, Accent())
        # Оба алфавита нужны рядом: книга бывает и латинской, и кириллической, а
        # в Вукотоке письмо вообще переключается на ходу. Показать читателю
        # «књи̏га» там, где он читает «knjiga», — значит подсунуть другую азбуку
        # вместо ответа на вопрос об ударении.
        if accented:
            if is_cyrillic(accented):
                self_field = "cyrillic"
            else:
                self_field = "latin"
            # Первая запись выигрывает: статьи идут от употребительных к редким,
            # и для омографа («vȁn» предлог против «vȃn» наречие) чаще нужен
            # первый.
            if not getattr(entry, self_field):
                setattr(entry, self_field, accented)
        if ipa and not entry.ipa:
            entry.ipa = ipa

    with dump.open(encoding="utf-8", errors="ignore") as source:
        for line in source:
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            word = entry.get("word") or ""
            if not word:
                continue

            ipa = ""
            for sound in entry.get("sounds", []):
                value = (sound.get("ipa") or "").strip()
                if value and has_accent(value, IPA_MARKS):
                    ipa = value
                    break

            forms = entry.get("forms", [])
            headwords = [
                text
                for form in forms
                if "canonical" in form.get("tags", [])
                and has_accent(text := (form.get("form") or "").strip(), ACCENT_MARKS)
            ]
            if headwords:
                for headword in headwords:
                    remember(headword, headword, ipa)
            elif ipa:
                remember(word, "", ipa)

            # Формы словоизменения: ударение сербского слова гуляет по парадигме
            # («knjȉga», но «knjȋgā»), поэтому каждая размеченная форма ценна
            # сама по себе. Транскрипции у них нет — только написание.
            is_verb = entry.get("pos") == "verb"
            lemma = normalize(word)
            if is_verb:
                remember_verb(word, lemma)
            for form in forms:
                text = (form.get("form") or "").strip()
                tags = form.get("tags", [])
                if not text or "canonical" in tags:
                    continue
                if has_accent(text, ACCENT_MARKS):
                    remember(text, text, "")
                # Отглагольное существительное («blížēnje») глаголом не является.
                if not is_verb or SERVICE_TAGS.intersection(tags) or "noun-from-verb" in tags:
                    continue
                if " " not in text:
                    remember_verb(text, lemma)
                    continue
                # Составные времена («bȕdēm bližio», «bližio sam») целиком не
                # ищутся — в тексте это два слова. Но причастие на -o/-la/-li
                # живёт ТОЛЬКО в них, и без разбора составных форм самая частая
                # форма прошедшего времени в словарь не попадала вовсе.
                for token in text.split():
                    normalized = normalize(token)
                    if shares_stem(normalized, lemma):
                        remember_verb(token, lemma)

    # Причастие на -o/-la/-lo/-li/-le Викисловарь даёт только в мужском роде: в
    # его таблицах оно встречается лишь внутри составных времён («bȕdēm
    # bližio»), где стоит одна форма из шести. Остальные достраиваются от
    # начальной формы — правило здесь без исключений: основа инфинитива без
    # «-ti» плюс окончание («bližiti» → bližio, bližila, bližilo, bližili,
    # bližile). Глаголы на «-ći» строят причастие от другой основы, поэтому для
    # них отправной точкой служит уже известная форма мужского рода.
    for lemma in sorted(set(verbs.values())):
        if lemma.endswith("ti") and len(lemma) > 3:
            stem = lemma[:-2]
        elif lemma.endswith("ći"):
            masculine = next(
                (f for f, l in verbs.items() if l == lemma and f.endswith("ao")), ""
            )
            if not masculine:
                continue
            stem = masculine[:-2] + "l"
        else:
            continue
        for ending in ("o", "la", "lo", "li", "le"):
            remember_verb(stem + ending, lemma)

    return accents, verbs


def write(accents: dict[str, Accent], verbs: dict[str, str]) -> None:
    db = sqlite3.connect(LEXICON)
    db.execute("DROP TABLE IF EXISTS verb_forms")
    db.execute(
        "CREATE TABLE verb_forms (form TEXT PRIMARY KEY, lemma TEXT NOT NULL)"
    )
    db.executemany(
        "INSERT OR REPLACE INTO verb_forms (form, lemma) VALUES (?,?)",
        verbs.items(),
    )
    db.execute("DROP TABLE IF EXISTS accents")
    db.execute(
        "CREATE TABLE accents ("
        " form TEXT PRIMARY KEY,"
        " latin TEXT NOT NULL,"
        " cyrillic TEXT NOT NULL,"
        " ipa TEXT NOT NULL)"
    )
    db.execute("CREATE TABLE IF NOT EXISTS accents_meta (key TEXT PRIMARY KEY, value TEXT)")
    db.execute(
        "INSERT OR REPLACE INTO accents_meta (key, value) VALUES ('source', ?)",
        (SOURCE_NOTE,),
    )
    db.executemany(
        "INSERT OR REPLACE INTO accents (form, latin, cyrillic, ipa) VALUES (?,?,?,?)",
        (
            (form, entry.latin, entry.cyrillic, entry.ipa)
            for form, entry in accents.items()
            if entry.latin or entry.cyrillic or entry.ipa
        ),
    )
    db.commit()
    db.execute("VACUUM")
    db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dump", type=Path, help="готовый JSONL вместо скачивания")
    args = parser.parse_args()

    if not LEXICON.exists():
        print(f"нет файла {LEXICON}", file=sys.stderr)
        return 1

    dump = args.dump
    if dump is None:
        dump = ROOT / "build" / "kaikki-serbo-croatian.jsonl"
        dump.parent.mkdir(parents=True, exist_ok=True)
        if not dump.exists():
            download(dump)
    if not dump.exists():
        print(f"нет файла {dump}", file=sys.stderr)
        return 1

    accents, verbs = collect(dump)
    with_ipa = sum(1 for entry in accents.values() if entry.ipa)
    with_latin = sum(1 for entry in accents.values() if entry.latin)
    if len(accents) < 10_000 or len(verbs) < 10_000:
        print(
            f"собрано подозрительно мало: ударений {len(accents)}, "
            f"форм глаголов {len(verbs)}",
            file=sys.stderr,
        )
        return 1

    write(accents, verbs)
    print(f"ударений: {len(accents)}, латиницей: {with_latin}, с транскрипцией: {with_ipa}")
    print(f"форм глаголов: {len(verbs)}")
    print(f"источник: {SOURCE_NOTE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
