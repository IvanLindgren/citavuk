# -*- coding: utf-8 -*-
"""Собирает lexicon.db из трибанка UD_Serbian-SET.

Таблица lexicon: (form, lemma, upos, feats, msd)
  form  — словоформа (нижний регистр, латиница)
  lemma — начальная форма
  upos  — часть речи (UD: NOUN/VERB/ADJ/...)
  feats — морфопризнаки UD ("Case=Nom|Gender=Masc|Number=Sing")
  msd   — XPOS (MULTEXT-East, напр. Ncmsn) — для совместимости

Таблица dictionary: (word, translation) — базовый sr→ru словарь (ручной seed).
"""
import sqlite3
import os
import glob

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT, "lexicon.db")
UD_GLOB = os.path.join(ROOT, "data", "ud", "*.conllu")

# Базовый словарь переводов (UD переводов не содержит).
DICTIONARY = [
    ("biti", "быть"), ("imati", "иметь"), ("hteti", "хотеть"),
    ("raditi", "работать / делать"), ("govoriti", "говорить"),
    ("videti", "видеть"), ("znati", "знать"), ("moći", "мочь"),
    ("čitati", "читать"), ("pisati", "писать"), ("učiti", "учить / учиться"),
    ("razumeti", "понимать"), ("knjiga", "книга"), ("dan", "день"),
    ("reč", "слово"), ("čovek", "человек"), ("jezik", "язык"),
    ("prijatelj", "друг"), ("grad", "город"), ("kuća", "дом"),
    ("škola", "школа"), ("život", "жизнь"), ("vreme", "время / погода"),
    ("dete", "ребёнок"), ("nov", "новый"), ("star", "старый"),
    ("lep", "красивый"), ("dobar", "хороший"), ("loš", "плохой"),
    ("velik", "большой"), ("mali", "маленький"), ("brz", "быстрый"),
    ("spor", "медленный"), ("srpski", "сербский"), ("ruski", "русский"),
    ("ja", "я"), ("ti", "ты"), ("on", "он"), ("ona", "она"), ("ono", "оно"),
    ("mi", "мы"), ("vi", "вы"), ("oni", "они"), ("se", "себя / -ся"),
    ("i", "и"), ("a", "а / но"), ("u", "в"), ("na", "на"), ("sa", "с / со"),
    ("za", "для / за"), ("iz", "из"), ("o", "о / об"),
    ("da", "что / чтобы / да"), ("ali", "но / однако"),
]


def has_letter(s: str) -> bool:
    return any(ch.isalpha() for ch in s)


def build():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        "CREATE TABLE lexicon (form TEXT NOT NULL, lemma TEXT NOT NULL, "
        "upos TEXT NOT NULL, feats TEXT NOT NULL, msd TEXT NOT NULL)"
    )
    cur.execute("CREATE TABLE dictionary (word TEXT NOT NULL UNIQUE, translation TEXT NOT NULL)")

    rows = set()
    files = glob.glob(UD_GLOB)
    if not files:
        raise SystemExit(f"Нет .conllu в {UD_GLOB}")
    for fn in files:
        with open(fn, encoding="utf-8") as f:
            for line in f:
                if not line.strip() or line.startswith("#"):
                    continue
                c = line.rstrip("\n").split("\t")
                if len(c) < 6:
                    continue
                tid, form, lemma, upos, xpos, feats = c[0], c[1], c[2], c[3], c[4], c[5]
                if "-" in tid or "." in tid:
                    continue
                if lemma == "_" or not has_letter(form):
                    continue
                rows.add((
                    form.lower(),
                    lemma.lower(),
                    upos if upos != "_" else "",
                    feats if feats != "_" else "",
                    xpos if xpos != "_" else "",
                ))

    cur.executemany(
        "INSERT INTO lexicon (form, lemma, upos, feats, msd) VALUES (?,?,?,?,?)",
        list(rows),
    )
    cur.executemany(
        "INSERT OR IGNORE INTO dictionary (word, translation) VALUES (?,?)",
        DICTIONARY,
    )
    cur.execute("CREATE INDEX idx_lexicon_form ON lexicon(form)")
    cur.execute("CREATE INDEX idx_lexicon_lemma ON lexicon(lemma)")
    cur.execute("CREATE INDEX idx_dict_word ON dictionary(word)")
    conn.commit()

    n_forms = cur.execute("SELECT COUNT(*) FROM lexicon").fetchone()[0]
    n_lemmas = cur.execute("SELECT COUNT(DISTINCT lemma) FROM lexicon").fetchone()[0]
    n_dict = cur.execute("SELECT COUNT(*) FROM dictionary").fetchone()[0]
    conn.close()
    print(f"lexicon.db built: {n_forms} forms, {n_lemmas} lemmas, {n_dict} dictionary entries")


if __name__ == "__main__":
    build()
