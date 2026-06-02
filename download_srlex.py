"""
Downloads srLex (Serbian inflectional lexicon, ~6.9M wordforms) from ReLDI,
converts it to SQLite and saves as lexicon.db.

srLex format (TSV, 8 columns):
  wordform  lemma  MSD  MSD_features  UPOS  UD_features  abs_freq  rel_freq

We store: form, lemma, upos, feats (UD string), msd (original MSD tag).
"""

import os
import sys
import sqlite3
import urllib.request
import zipfile
import io

SRLEX_URL = "https://www.clarin.si/repository/xmlui/bitstream/handle/11356/1233/srLex_v1.3.gz?sequence=3&isAllowed=y"
SRLEX_FALLBACK_URL = "https://reldi.rs/data/srLex.gz"
DB_PATH = os.path.join(os.path.dirname(__file__), "lexicon.db")
ASSETS_PATH = os.path.join(os.path.dirname(__file__), "frontend", "assets", "lexicon.db")

DICTIONARY_DATA = [
    ("biti", "быть"), ("imati", "иметь"), ("hteti", "хотеть"),
    ("raditi", "работать / делать"), ("govoriti", "говорить"),
    ("videti", "видеть"), ("znati", "знать"), ("moći", "мочь"),
    ("čitati", "читать"), ("pisati", "писать"), ("učiti", "учить / учиться"),
    ("razumeti", "понимать"), ("moliti", "просить / молить"),
    ("knjiga", "книга"), ("dan", "день"), ("reč", "слово"),
    ("čovek", "человек"), ("jezik", "язык"), ("prijatelj", "друг"),
    ("grad", "город"), ("kuća", "дом"), ("škola", "школа"),
    ("život", "жизнь"), ("vreme", "время / погода"), ("dete", "ребенок"),
    ("nov", "новый"), ("star", "старый"), ("lep", "красивый"),
    ("dobar", "хороший"), ("loš", "плохой"), ("velik", "большой"),
    ("mali", "маленький"), ("brz", "быстрый"), ("spor", "медленный"),
    ("srpski", "сербский"), ("ruski", "русский"),
    ("ja", "я"), ("ti", "ты"), ("on", "он"), ("ona", "она"),
    ("ono", "оно"), ("mi", "мы"), ("vi", "вы"), ("oni", "они"),
    ("se", "себя / -ся"),
    ("i", "и"), ("a", "а / но"), ("u", "в"), ("na", "на"),
    ("sa", "с / со"), ("za", "для / за"), ("iz", "из"), ("o", "о / об"),
    ("da", "что / чтобы / да"), ("ali", "но / однако"),
    ("sve", "все / всё"), ("svaki", "каждый"), ("neki", "некий / какой-то"),
    ("ovaj", "этот"), ("taj", "тот"), ("koji", "который"),
    ("dobar", "хороший"), ("svet", "мир / свет"), ("leto", "лето / год"),
    ("zemlja", "земля / страна"), ("voda", "вода"), ("ruka", "рука"),
    ("glava", "голова"), ("oko", "глаз"), ("put", "путь / раз"),
    ("stvar", "вещь"), ("mesto", "место"), ("posao", "работа / дело"),
    ("ići", "идти"), ("doći", "прийти"), ("dati", "дать"),
    ("reći", "сказать"), ("misliti", "думать"), ("trebati", "нужно"),
    ("morati", "быть должным"), ("želeti", "желать"),
    ("ostati", "остаться"), ("pitati", "спросить"),
    ("odgovoriti", "ответить"), ("naći", "найти"),
    ("stajati", "стоять"), ("sedeti", "сидеть"),
    ("jesti", "есть (еду)"), ("piti", "пить"), ("spavati", "спать"),
    ("živeti", "жить"), ("umreti", "умереть"),
]


def download_srlex(dest_dir: str) -> str:
    """Downloads and extracts srLex. Returns path to the TSV file."""
    gz_path = os.path.join(dest_dir, "srLex.gz")
    tsv_path = os.path.join(dest_dir, "srLex.tsv")

    if os.path.exists(tsv_path):
        print(f"srLex already exists at {tsv_path}, skipping download.")
        return tsv_path

    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    for url in [SRLEX_URL, SRLEX_FALLBACK_URL]:
        try:
            print(f"Downloading srLex from {url}...")
            urllib.request.urlretrieve(url, gz_path, context=ctx)
            break
        except TypeError:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, context=ctx) as resp:
                with open(gz_path, "wb") as out:
                    out.write(resp.read())
            break
        except Exception as e:
            print(f"Failed from {url}: {e}")
    else:
        sys.exit("Could not download srLex from any source.")

    import gzip
    print("Extracting...")
    with gzip.open(gz_path, "rb") as f_in:
        with open(tsv_path, "wb") as f_out:
            f_out.write(f_in.read())

    os.remove(gz_path)
    print(f"Extracted to {tsv_path}")
    return tsv_path


def build_db(tsv_path: str):
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE lexicon (
            form  TEXT NOT NULL,
            lemma TEXT NOT NULL,
            upos  TEXT NOT NULL DEFAULT '',
            feats TEXT NOT NULL DEFAULT '',
            msd   TEXT NOT NULL DEFAULT ''
        )
    """)
    cur.execute("""
        CREATE TABLE dictionary (
            word        TEXT NOT NULL UNIQUE,
            translation TEXT NOT NULL
        )
    """)

    print("Importing srLex into SQLite...")
    batch = []
    count = 0
    with open(tsv_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) < 6:
                continue
            form = parts[0].strip().lower()
            lemma = parts[1].strip().lower()
            msd = parts[2].strip()
            upos = parts[4].strip()
            feats = parts[5].strip()
            if feats == "_":
                feats = ""
            if not form or not lemma:
                continue
            batch.append((form, lemma, upos, feats, msd))
            count += 1
            if len(batch) >= 50000:
                cur.executemany(
                    "INSERT INTO lexicon (form, lemma, upos, feats, msd) VALUES (?, ?, ?, ?, ?)",
                    batch,
                )
                batch.clear()
                print(f"  ...{count} rows")

    if batch:
        cur.executemany(
            "INSERT INTO lexicon (form, lemma, upos, feats, msd) VALUES (?, ?, ?, ?, ?)",
            batch,
        )

    print(f"Total lexicon rows: {count}")

    cur.execute("CREATE INDEX idx_lexicon_form ON lexicon(form)")
    cur.execute("CREATE INDEX idx_lexicon_lemma ON lexicon(lemma)")

    cur.executemany(
        "INSERT OR IGNORE INTO dictionary (word, translation) VALUES (?, ?)",
        DICTIONARY_DATA,
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_dict_word ON dictionary(word)")

    conn.commit()
    conn.close()
    print(f"Database saved to {DB_PATH}")

    import shutil
    os.makedirs(os.path.dirname(ASSETS_PATH), exist_ok=True)
    shutil.copy2(DB_PATH, ASSETS_PATH)
    print(f"Copied to {ASSETS_PATH}")


if __name__ == "__main__":
    dest = os.path.dirname(__file__)
    tsv = download_srlex(dest)
    build_db(tsv)
