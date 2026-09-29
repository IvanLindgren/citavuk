"""Собирает слова для игры «Уничтожь эти падежи с Читавуком!».

Откуда что:

- слова и переводы — списки дорожной карты (tools/data/roadmap_words_*.tsv):
  их вычитывали вручную, у каждого есть уровень;
- формы — srLex 1.3 (CLARIN.SI, CC BY-SA 4.0): полный морфологический словарь
  сербского с частотами. Формы не генерируются правилами: в игре эталон
  обязан быть верным, иначе правильный ответ засчитается ошибкой.

Верной считается самая частая форма ячейки и все варианты не реже 2% от неё:
так `ju`/`nju` и `njom`/`njome` засчитываются, а архаичное `nj` — нет.

    python tools/build_case_game.py [output/srlex/srLex_v1.3.gz]

Результат — две одинаковые копии: web/public/games/cases.json и
frontend/assets/games/cases.json. Если исходника нет, он скачивается.
"""

import collections
import csv
import gzip
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SOURCE = os.path.join(ROOT, "output", "srlex", "srLex_v1.3.gz")
SRLEX_URL = "https://www.clarin.si/repository/xmlui/bitstream/handle/11356/1233/srLex_v1.3.gz?sequence=3&isAllowed=y"
OUTPUTS = [
    os.path.join(ROOT, "web", "public", "games", "cases.json"),
    os.path.join(ROOT, "frontend", "assets", "games", "cases.json"),
]
LEVELS = ["a1", "a2", "b1", "b2", "c1", "c2"]
ALTERNATIVE_SHARE = 0.02
PLAIN = re.compile(r"^[a-zčćđšž ]+$")

NOUN_MSD = re.compile(r"^Nc([mfn])([sp])([ngdavil])(.*)$")
CASES = "ngdavil"

# Местоимения: ключ формы в игре → префикс MSD в srLex.
PRONOUNS = [
    ("ja", "я", "Pp1-s"),
    ("ti", "ты", "Pp2-s"),
    ("on", "он", "Pp3ms"),
    ("ona", "она", "Pp3fs"),
    ("ono", "оно", "Pp3ns"),
    ("mi", "мы", "Pp1-p"),
    ("vi", "вы", "Pp2-p"),
    ("oni", "они", "Pp3-p"),
    ("sebe", "себя", "Px--s"),
]
PRONOUN_CASES = "gdail"


def ensure_source(path: str) -> str:
    if os.path.exists(path):
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    print(f"скачиваю srLex → {path}")
    urllib.request.urlretrieve(SRLEX_URL, path)
    return path


def read_roadmap() -> tuple[dict, dict]:
    nouns: dict[str, dict] = {}
    verbs: dict[str, dict] = {}
    for level in LEVELS:
        path = os.path.join(ROOT, "tools", "data", f"roadmap_words_{level}.tsv")
        with open(path, encoding="utf-8") as handle:
            for row in csv.DictReader(handle, delimiter="\t"):
                lemma = row["lemma"].strip()
                if not PLAIN.match(lemma) or " " in lemma:
                    continue
                entry = {"lemma": lemma, "translation": row["translation"].strip(), "level": level.upper()}
                target = nouns if row["pos"] == "NOUN" else verbs if row["pos"] == "VERB" else None
                # Слово из нескольких уровней остаётся на самом раннем.
                if target is not None and lemma not in target:
                    target[lemma] = entry
    return nouns, verbs


def ekavian_first(forms: list[str]) -> list[str]:
    """Эталон — экавский, как везде в Читавуке; иекавский вариант тоже верен."""
    present = set(forms)

    def ijekavian(form: str) -> bool:
        # vrijeme → vreme, djeca → deca, vidio → video.
        candidates = {form.replace("ije", "e").replace("je", "e")}
        if form.endswith("io"):
            candidates.add(form[:-2] + "eo")
        return any(c != form and c in present for c in candidates)

    return sorted(forms, key=lambda form: (ijekavian(form), forms.index(form)))


def pick(forms: collections.Counter) -> list[str]:
    """Самая частая форма первой, затем варианты не реже доли от неё."""
    plain = {form: freq for form, freq in forms.items() if PLAIN.match(form)}
    if not plain:
        return []
    top = max(plain.values())
    ordered = sorted(plain.items(), key=lambda item: (-item[1], item[0]))
    if top == 0:
        # Ячейку никто не встречал в корпусе: все варианты словаря считаются
        # верными, первым идёт экавский.
        return ekavian_first([form for form, _ in ordered])
    return ekavian_first([form for form, freq in ordered if freq >= top * ALTERNATIVE_SHARE])


def attested(forms: collections.Counter) -> int:
    return max((freq for form, freq in forms.items() if PLAIN.match(form)), default=0)


def main(source: str) -> None:
    roadmap_nouns, roadmap_verbs = read_roadmap()
    pronoun_prefixes = {prefix for _, _, prefix in PRONOUNS} | {"Pp3mp", "Pp3fp", "Pp3np"}

    noun_cells: dict[str, dict[str, collections.Counter]] = collections.defaultdict(
        lambda: collections.defaultdict(collections.Counter))
    verb_cells: dict[str, dict[str, collections.Counter]] = collections.defaultdict(
        lambda: collections.defaultdict(collections.Counter))
    pronoun_cells: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)

    with gzip.open(source, "rt", encoding="utf-8") as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 8:
                continue
            form, lemma, msd = parts[0].lower(), parts[1], parts[2]
            try:
                freq = int(parts[6])
            except ValueError:
                continue
            if lemma in roadmap_nouns and msd.startswith("Nc"):
                noun_cells[lemma][msd][form] += freq
            elif lemma in roadmap_verbs and msd.startswith("Vm"):
                verb_cells[lemma][msd][form] += freq
            elif msd[:5] in pronoun_prefixes and msd.startswith(("Pp", "Px")):
                pronoun_cells[msd][form] += freq

    nouns = []
    for lemma, info in roadmap_nouns.items():
        cells = noun_cells.get(lemma)
        if not cells:
            continue
        genders = collections.Counter()
        for msd, forms in cells.items():
            match = NOUN_MSD.match(msd)
            if match:
                genders[match.group(1)] += sum(forms.values()) + 1
        if not genders:
            continue
        gender = genders.most_common(1)[0][0]
        # Одушевлённость мужского рода видна по винительному: prijatelja / grad.
        animate = None
        if gender == "m":
            yes = sum(sum(f.values()) for m, f in cells.items() if m.startswith("Ncmsay"))
            no = sum(sum(f.values()) for m, f in cells.items() if m.startswith("Ncmsan"))
            animate = yes > no
        merged: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
        for msd, forms in cells.items():
            match = NOUN_MSD.match(msd)
            if not match or match.group(1) != gender:
                continue
            _, number, case, rest = match.groups()
            if gender == "m" and number == "s" and case == "a" and animate is not None and rest[:1] in ("y", "n"):
                if (rest[:1] == "y") != animate:
                    continue
            merged[number + case].update(forms)
        out = {key: pick(forms) for key, forms in merged.items() if key[1] != "v"}
        out = {key: forms for key, forms in out.items() if forms}
        core = [number + case for number in "sp" for case in "ngdail"]
        # Слово без единственного числа (vrata, novine) в игре не нужно.
        if not all(key in out for key in core):
            continue
        # Больше двух форм, которых нет в текстах, — обычно множественное
        # неисчисляемого (brašana): такое слово в игру не берём.
        if sum(1 for key in core if attested(merged[key]) == 0) > 2:
            continue
        # Звательный словарь часто достраивает неверно (у «pas» — «psu»), поэтому
        # он берётся только встреченным в текстах. Во множественном числе он
        # всегда совпадает с именительным.
        vocative = merged.get("sv", collections.Counter())
        if attested(vocative) >= 20:
            out["sv"] = pick(collections.Counter({f: c for f, c in vocative.items() if c > 0}))
            out["pv"] = out["pn"]
        nouns.append({"l": lemma, "t": info["translation"], "lv": info["level"], "g": gender, "f": out})

    pronouns = []
    for lemma, translation, prefix in PRONOUNS:
        out = {}
        for case in PRONOUN_CASES:
            forms = collections.Counter()
            for msd, cell in pronoun_cells.items():
                if msd.startswith(prefix) and msd[-1] == case and len(msd) == 6:
                    forms.update(cell)
            chosen = pick(forms)
            if chosen:
                out[case] = chosen
        if len(out) == len(PRONOUN_CASES):
            pronouns.append({"l": lemma, "t": translation, "f": out})

    verbs = []
    for lemma, info in roadmap_verbs.items():
        cells = verb_cells.get(lemma)
        if not cells or not lemma.endswith(("ti", "ći")):
            continue

        def cell(msd: str) -> list[str]:
            return pick(cells.get(msd, collections.Counter()))

        present = {p: cell(f"Vmr{p}") for p in ("1s", "2s", "3s", "1p", "2p", "3p")}
        participle = {k: cell(f"Vmp-{k}") for k in ("sm", "sf", "sn", "pm", "pf", "pn")}
        imperative = {p: cell(f"Vmm{p}") for p in ("2s", "1p", "2p")}
        future = {p: cell(f"Vmf{p}") for p in ("1s", "2s", "3s", "1p", "2p", "3p")}
        if not all(present.values()) or not all(participle.values()):
            continue
        entry = {"l": lemma, "t": info["translation"], "lv": info["level"], "pr": present, "pp": participle}
        # srLex записывает «nemoj» императивом «moći», а «htedni» — «hteti».
        # Настоящий императив начинается с той же основы, что и презенс.
        stem = present["3p"][0][:2]
        if all(imperative.values()) and all(forms[0][:2] == stem for forms in imperative.values()):
            entry["im"] = imperative
        # Слитный футур (radiću) есть не у всех: у «ići» только «ići ću».
        if all(future.values()):
            entry["fu"] = future
        verbs.append(entry)

    data = {
        "version": 1,
        "source": "srLex 1.3, CLARIN.SI, CC BY-SA 4.0; слова и переводы — дорожная карта Читавука",
        "nouns": sorted(nouns, key=lambda n: (n["lv"], n["l"])),
        "pronouns": pronouns,
        "verbs": sorted(verbs, key=lambda v: (v["lv"], v["l"])),
    }
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    for path in OUTPUTS:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(raw)
    print(f"существительных {len(nouns)}, местоимений {len(pronouns)}, глаголов {len(verbs)}; "
          f"{len(raw.encode()) // 1024} КиБ")


if __name__ == "__main__":
    main(ensure_source(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SOURCE))
