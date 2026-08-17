"""Указатель слов для словаря: темы, места и частотность.

Словарь читателя копится из книг и выглядит одной кучей. Метки вида, части речи
и хода запоминания выводятся из самой записи, а три вещи вывести неоткуда — их и
собирает этот скрипт, один раз, в исходники обеих платформ.

**Тема** и **место** берутся из Путешествия: там уже 66 видов мест и почти
тысяча слов, разложенных по ним человеком — в пекаре хлеб и бурек, в аптеке
рецепт. Заводить второй список тем значило бы развести его с первым. Виды мест
сводятся в десяток тем: 66 меток в словаре — это снова куча, только из меток.

**Частотность** берётся из `server/internal/lexicon/data/frequency.tsv.gz` —
двадцать тысяч лемм по убыванию частоты, тот же файл, по которому сервер
оценивает сложность книги. В клиенты уезжает первая пятитысяча: она и отделяет
слова, которые действительно нужны, от случайного слова из сказки.

Ключ везде — латиница в нижнем регистре: сохранить слово можно из книги на любом
из двух писем, и «хлеб» с «hleb» обязаны попасть в одну строку указателя.

    python tools/build_word_index.py
"""

from __future__ import annotations

import gzip
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRAVEL = ROOT / "frontend" / "assets" / "travel"
FREQUENCY = ROOT / "server" / "internal" / "lexicon" / "data" / "frequency.tsv.gz"

WEB_OUT = ROOT / "web" / "src" / "lib" / "wordIndex.ts"
FLUTTER_OUT = ROOT / "frontend" / "lib" / "services" / "word_index.dart"

# Вид места -> тема. `anywhere` намеренно не участвует: слова «в любом месте»
# общие по определению, и любая тема от них становится мусорной.
TOPICS: dict[str, tuple[str, ...]] = {
    "еда": ("bakery", "cafe", "restaurant", "pastry", "grocery", "market",
            "butcher", "bar", "wine"),
    "здоровье": ("pharmacy", "clinic", "dentist", "optician"),
    "деньги": ("exchange",),
    "дорога": ("gas_station", "bus_station", "train_station", "airport",
               "bridge", "street", "square", "bus_stop", "crossing",
               "taxi_stand", "parking", "underpass", "car_repair",
               "car_rental"),
    "город": ("park", "quay", "lake", "fountain", "artwork", "playground",
              "landmark", "toilets", "sport_field"),
    "покупки": ("kiosk", "bookstore", "clothing", "jewelry", "chemist",
                "florist", "electronics", "pet", "souvenir"),
    "учёба": ("school", "kindergarten", "university", "library"),
    "отдых": ("museum", "cinema", "theatre", "gym", "pool"),
    "услуги": ("hairdresser", "hotel", "post", "travel_agency", "information",
               "laundry"),
    "документы": ("police", "embassy"),
    "вера": ("synagogue", "church"),
}

# Слово больше чем в стольких темах считается общим и метки не получает.
MAX_TOPICS = 2

# Сколько самых частых лемм уезжает в клиенты и где проходит граница «ядра».
FREQUENT = 5000
CORE = 1000

CYR_TO_LAT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ђ": "đ", "е": "e",
    "ж": "ž", "з": "z", "и": "i", "ј": "j", "к": "k", "л": "l", "љ": "lj",
    "м": "m", "н": "n", "њ": "nj", "о": "o", "п": "p", "р": "r", "с": "s",
    "т": "t", "ћ": "ć", "у": "u", "ф": "f", "х": "h", "ц": "c", "ч": "č",
    "џ": "dž", "ш": "š",
}


def key_of(word: str) -> str:
    """Ключ слова: латиница, нижний регистр, без хвостовых знаков."""
    text = word.strip().lower().strip(".,!?;:()«»\"'")
    return "".join(CYR_TO_LAT.get(char, char) for char in text)


def collect_travel() -> tuple[dict[str, list[str]], dict[str, str], dict[str, dict[str, str]]]:
    """Темы слова, самое подходящее место и названия мест."""
    kinds = json.loads((TRAVEL / "kinds.json").read_text(encoding="utf-8"))["kinds"]
    names = {k["id"]: {"sr": k["sr"], "ru": k["ru"]} for k in kinds}
    kind_topic = {kind: topic for topic, kinds_ in TOPICS.items() for kind in kinds_}

    topics: dict[str, set[str]] = defaultdict(set)
    places: dict[str, list[tuple[int, str]]] = defaultdict(list)

    for path in sorted((TRAVEL / "places").glob("*.json")):
        topic = kind_topic.get(path.stem)
        if topic is None:
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        words = data.get("words", [])
        for item in words:
            word = (item.get("sr") or "").strip()
            # Фразы из words не берём: метка темы вешается на слово, а фраза
            # получает свою метку по пробелу и без всякого указателя.
            if not word or " " in word:
                continue
            key = key_of(word)
            topics[key].add(topic)
            # Размер словника места — мера его «специфичности»: слово из места с
            # пятнадцатью словами говорит о нём больше, чем из места с сорока.
            places[key].append((len(words), path.stem))

    kept = {word: sorted(found) for word, found in sorted(topics.items())
            if len(found) <= MAX_TOPICS}
    best_place = {
        word: min(entries)[1]
        for word, entries in sorted(places.items())
        if word in kept
    }
    used = {kind for kind in best_place.values()}
    return kept, best_place, {k: v for k, v in names.items() if k in used}


def collect_frequency() -> dict[str, int]:
    """Лемма -> 1 (первая тысяча) или 2 (частое)."""
    ranks: dict[str, int] = {}
    with gzip.open(FREQUENCY, "rt", encoding="utf-8") as handle:
        for position, line in enumerate(handle):
            if position >= FREQUENT:
                break
            lemma = key_of(line.split("\t")[0])
            if lemma and lemma not in ranks:
                ranks[lemma] = 1 if position < CORE else 2
    return dict(sorted(ranks.items()))


HEADER = """Указатель слов словаря: темы, места и частотность.
Сгенерировано tools/build_word_index.py.

Правится не здесь: темы и места — в frontend/assets/travel, частотность — в
server/internal/lexicon/data/frequency.tsv.gz."""


def write_ts(topics, places, names, freq) -> None:
    comment = "\n".join(f" * {line}".rstrip() for line in HEADER.split("\n"))
    out = [f"/**\n{comment}\n */\n"]

    out.append("export const WORD_TOPICS: Record<string, string[]> = {")
    for word, found in topics.items():
        out.append(f"  '{word}': [{', '.join(chr(39) + t + chr(39) for t in found)}],")
    out.append("};\n")

    out.append("export const WORD_PLACE: Record<string, string> = {")
    for word, place in places.items():
        out.append(f"  '{word}': '{place}',")
    out.append("};\n")

    out.append("export const PLACE_NAMES: Record<string, { sr: string; ru: string }> = {")
    for place, name in sorted(names.items()):
        out.append(f"  {place}: {{ sr: '{name['sr']}', ru: '{name['ru']}' }},")
    out.append("};\n")

    out.append("/** 1 — первая тысяча, 2 — частое. Остального в указателе нет. */")
    out.append("export const WORD_FREQ: Record<string, number> = {")
    for lemma, bucket in freq.items():
        out.append(f"  '{lemma}': {bucket},")
    out.append("};\n")

    WEB_OUT.write_text("\n".join(out), encoding="utf-8")


def write_dart(topics, places, names, freq) -> None:
    out = ["/// " + HEADER.replace("\n", "\n/// "), "library;\n"]

    out.append("const Map<String, List<String>> kWordTopics = {")
    for word, found in topics.items():
        out.append(f"  '{word}': [{', '.join(chr(39) + t + chr(39) for t in found)}],")
    out.append("};\n")

    out.append("const Map<String, String> kWordPlace = {")
    for word, place in places.items():
        out.append(f"  '{word}': '{place}',")
    out.append("};\n")

    out.append("const Map<String, List<String>> kPlaceNames = {")
    for place, name in sorted(names.items()):
        out.append(f"  '{place}': ['{name['sr']}', '{name['ru']}'],")
    out.append("};\n")

    out.append("/// 1 — первая тысяча, 2 — частое. Остального в указателе нет.")
    out.append("const Map<String, int> kWordFreq = {")
    for lemma, bucket in freq.items():
        out.append(f"  '{lemma}': {bucket},")
    out.append("};\n")

    FLUTTER_OUT.write_text("\n".join(out), encoding="utf-8")


def main() -> None:
    topics, places, names = collect_travel()
    freq = collect_frequency()

    write_ts(topics, places, names, freq)
    write_dart(topics, places, names, freq)

    counts: dict[str, int] = defaultdict(int)
    for found in topics.values():
        for topic in found:
            counts[topic] += 1
    print(f"слов с темой: {len(topics)}, из них с местом: {len(places)}")
    for topic, count in sorted(counts.items(), key=lambda pair: -pair[1]):
        print(f"  {topic:>10}: {count}")
    core = sum(1 for bucket in freq.values() if bucket == 1)
    print(f"частотность: {len(freq)} лемм, из них ядро {core}")
    print(f"\n{WEB_OUT.relative_to(ROOT)}\n{FLUTTER_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
