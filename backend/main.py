import os
import sqlite3
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Optional
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

# Global NLP pipeline (loaded once on startup via lifespan)
nlp = None
nlp_active = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global nlp, nlp_active
    try:
        import classla
        logging.info("Downloading/verifying Serbian models...")
        classla.download('sr')
        logging.info("Initializing CLASSLA Serbian pipeline...")
        nlp = classla.Pipeline('sr', processors='tokenize,pos,lemma')
        nlp_active = True
        logging.info("CLASSLA initialized.")
    except Exception as e:
        logging.warning(f"CLASSLA unavailable ({e}); using SQLite-only analysis.")
        nlp_active = False
    yield


app = FastAPI(title="Serbian NLP Backend", lifespan=lifespan)
# Разрешаем доступ из Flutter (web — другой origin/порт; desktop/mobile — не мешает).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "nlp": nlp_active}

# DB path check
DB_PATH = "lexicon.db"
if not os.path.exists(DB_PATH):
    # Fallback to parent dir if run from backend/
    DB_PATH = "../lexicon.db"

# Transliteration mappings
CYR_TO_LAT = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ђ': 'đ', 'е': 'e', 'ж': 'ž',
    'з': 'z', 'и': 'i', 'ј': 'j', 'к': 'k', 'л': 'l', 'љ': 'lj', 'м': 'm', 'н': 'n',
    'њ': 'nj', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'ћ': 'ć', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'č', 'џ': 'dž', 'ш': 'š',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Ђ': 'Đ', 'Е': 'E', 'Ж': 'Ž',
    'З': 'Z', 'И': 'I', 'Ј': 'J', 'К': 'K', 'Л': 'L', 'Љ': 'Lj', 'М': 'M', 'Н': 'N',
    'Њ': 'Nj', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'Ћ': 'Ć', 'У': 'U',
    'Ф': 'F', 'Х': 'H', 'Ц': 'C', 'Ч': 'Č', 'Џ': 'Dž', 'Ш': 'Š'
}

def to_latin(text: str) -> str:
    # Transliterates Serbian Cyrillic to Latin
    res = []
    i = 0
    while i < len(text):
        char = text[i]
        res.append(CYR_TO_LAT.get(char, char))
        i += 1
    return "".join(res)

class AnalyzeRequest(BaseModel):
    sentence: str
    start_offset: int
    end_offset: int
    token_text: str

def _parse_feats(s: str) -> Dict[str, str]:
    d: Dict[str, str] = {}
    if s and s != "_":
        for part in s.split("|"):
            if "=" in part:
                k, v = part.split("=", 1)
                d[k] = v
    return d


def query_local_lexicon(word_latin: str) -> list:
    """Returns lexicon rows (lemma, upos, feats, msd) for a word form."""
    if not os.path.exists(DB_PATH):
        return []
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT lemma, upos, feats, msd FROM lexicon WHERE form = ?",
        (word_latin.lower(),),
    )
    rows = cursor.fetchall()
    conn.close()
    return rows

def get_forms_from_lexicon(lemma: str, upos: str) -> Dict[str, str]:
    """Retrieves standard forms for a lemma using UD feats from local DB."""
    forms: Dict[str, str] = {}
    if not os.path.exists(DB_PATH):
        return forms
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT form, feats FROM lexicon WHERE lemma = ?", (lemma.lower(),))
    rows = cursor.fetchall()
    conn.close()

    for form, feats_str in rows:
        f = _parse_feats(feats_str)
        if upos in ("VERB", "AUX"):
            if f.get("VerbForm") == "Inf":
                forms["infinitive"] = form
            elif f.get("Tense") == "Pres" and f.get("Person") == "1" and f.get("Number") == "Sing":
                forms["present_1sg"] = form
        elif upos in ("NOUN", "PROPN"):
            if f.get("Case") == "Nom" and f.get("Number") == "Sing":
                forms["nominative_singular"] = form
            elif f.get("Case") == "Nom" and f.get("Number") == "Plur":
                forms["nominative_plural"] = form
        elif upos == "ADJ":
            if f.get("Case") == "Nom" and f.get("Number") == "Sing":
                g = f.get("Gender")
                if g == "Masc":
                    forms["nominative_masculine"] = form
                elif g == "Fem":
                    forms["nominative_feminine"] = form
                elif g == "Neut":
                    forms["nominative_neuter"] = form

    return forms

def get_dictionary_translation(word: str, lemma: str) -> Optional[str]:
    """Looks up translation in SQLite database."""
    if not os.path.exists(DB_PATH):
        return None
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Try exact word
    cursor.execute("SELECT translation FROM dictionary WHERE word = ?", (word.lower(),))
    row = cursor.fetchone()
    if row:
        conn.close()
        return row[0]
        
    # Try lemma
    cursor.execute("SELECT translation FROM dictionary WHERE word = ?", (lemma.lower(),))
    row = cursor.fetchone()
    conn.close()
    if row:
        return row[0]
    return None

def fetch_online_translation(word: str) -> str:
    """Fallback translator using Google Translate."""
    try:
        from deep_translator import GoogleTranslator
        translated = GoogleTranslator(source='sr', target='ru').translate(word)
        return translated
    except Exception as e:
        logging.error(f"Translation service failed: {e}")
        return "[Перевод недоступен]"

@app.post("/analyze")
def analyze_token(req: AnalyzeRequest):
    word_lat = to_latin(req.token_text).strip()
    
    # Fast path for multi-word phrases
    if " " in word_lat:
        translation = fetch_online_translation(req.token_text)
        return {
            "lemma": word_lat,
            "upos": "PHRASE",
            "feats": {},
            "forms": {},
            "translation": translation
        }
        
    lemma = word_lat.lower()
    upos = "UNKNOWN"
    feats = {}
    
    # Engine A: CLASSLA (Contextual NLP)
    if nlp_active and nlp:
        try:
            doc = nlp(req.sentence)
            matched_word = None
            
            # Find the word that corresponds to the character offsets
            for sentence in doc.sentences:
                for word in sentence.words:
                    # Stanza stores character offset inside word.misc as 'start_char=X|end_char=Y'
                    misc = word.misc if hasattr(word, 'misc') else ""
                    start_c = None
                    end_c = None
                    if misc:
                        parts = misc.split('|')
                        for p in parts:
                            if p.startswith('start_char='):
                                start_c = int(p.split('=')[1])
                            elif p.startswith('end_char='):
                                end_c = int(p.split('=')[1])
                                
                    # If offsets overlap or text matches
                    if (start_c is not None and end_c is not None and 
                            start_c <= req.start_offset and end_c >= req.end_offset):
                        matched_word = word
                        break
                    elif to_latin(word.text).lower() == word_lat.lower():
                        matched_word = word
            
            if matched_word:
                lemma = to_latin(matched_word.lemma)
                upos = matched_word.upos
                # Parse features
                if matched_word.feats:
                    # Feats string format: "Case=Nom|Gender=Masc|Number=Sing"
                    feat_parts = matched_word.feats.split('|')
                    for part in feat_parts:
                        if '=' in part:
                            k, v = part.split('=', 1)
                            feats[k] = v
        except Exception as e:
            logging.error(f"CLASSLA analysis failed: {e}")
            # Fall back to SQLite

    # Engine B: SQLite fallback (Lexicon lookup with UD upos/feats)
    if upos == "UNKNOWN":
        rows = query_local_lexicon(word_lat)
        if rows:
            content = {"NOUN", "VERB", "ADJ", "PROPN", "ADV", "NUM"}
            best = next((r for r in rows if r[1] in content), rows[0])
            lemma = best[0]
            upos = best[1] or "UNKNOWN"
            feats = _parse_feats(best[2])

    # Engine C: Online Wiktionary fallback
    if upos == "UNKNOWN":
        online = fetch_wiktionary_lemma(word_lat)
        if online:
            lemma, upos = online

    # Get inflected forms from local lexicon DB
    forms = get_forms_from_lexicon(lemma, upos)
    
    # Translate (SQLite Dictionary -> DeepL/Google fallback)
    translation = get_dictionary_translation(req.token_text, lemma)
    if not translation:
        translation = fetch_online_translation(req.token_text)
        
    return {
        "lemma": lemma,
        "upos": upos,
        "feats": feats,
        "forms": forms,
        "translation": translation
    }

import urllib.parse
import re
import ssl
import json

def fetch_wiktionary_lemma(word: str) -> Optional[tuple[str, str]]:
    try:
        url = "https://en.wiktionary.org/w/api.php?" + urllib.parse.urlencode({
            "action": "query",
            "titles": word,
            "prop": "revisions",
            "rvprop": "content",
            "format": "json",
            "redirects": 1
        })
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, headers={"User-Agent": "Chitavuk/1.0 (denis@example.com)"})
        with urllib.request.urlopen(req, context=ctx, timeout=3) as response:
            data = json.loads(response.read().decode('utf-8'))
            pages = data.get("query", {}).get("pages", {})
            for page_id, page in pages.items():
                if page_id == "-1":
                    continue
                revisions = page.get("revisions", [])
                if not revisions:
                    continue
                content = revisions[0].get("*", "")
                
                if "==Serbo-Croatian==" not in content and "==Serbian==" not in content:
                    continue
                
                sc_match = re.search(r"==(?:Serbo-Croatian|Serbian)==(.*?)(?:==[a-zA-Z -]+==|$)", content, re.DOTALL)
                if not sc_match:
                    continue
                sc_content = sc_match.group(1)
                
                lemma = None
                upos = "UNKNOWN"
                
                match3 = re.search(r"\{\{(?:inflection of|infl of)\|(?:sh|sr)\|([^}|]+)", sc_content)
                match1 = re.search(r"of\s+(?:the\s+)?\[\[([^\]|]+)(?:\|[^\]]+)?\]\]", sc_content)
                match2 = re.search(r"\{\{m\|(?:sh|sr)\|([^}|]+)", sc_content)
                
                if match3:
                    lemma = match3.group(1)
                elif match1:
                    lemma = match1.group(1)
                elif match2:
                    lemma = match2.group(1)
                
                if "===Noun===" in sc_content:
                    upos = "NOUN"
                elif "===Verb===" in sc_content:
                    upos = "VERB"
                elif "===Adjective===" in sc_content:
                    upos = "ADJ"
                elif "===Adverb===" in sc_content:
                    upos = "ADV"
                elif "===Pronoun===" in sc_content:
                    upos = "PRON"
                elif "===Proper noun===" in sc_content:
                    upos = "PROPN"
                
                if lemma:
                    return lemma.strip().lower(), upos
                elif upos != "UNKNOWN":
                    return word.strip().lower(), upos
    except Exception as e:
        logging.error(f"Wiktionary lookup failed: {e}")
    return None

if __name__ == "__main__":
    import uvicorn
    # Run backend
    uvicorn.run(app, host="0.0.0.0", port=8000)
