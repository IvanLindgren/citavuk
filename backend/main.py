import os
import sqlite3
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Optional
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

import threading
import time
import urllib.request

# Global NLP pipeline (loaded once on startup via lifespan)
nlp = None
nlp_active = False

def ping_self():
    space_host = os.environ.get("SPACE_HOST")
    if not space_host:
        logging.info("No SPACE_HOST env var found, self-ping disabled.")
        return
    
    url = f"https://{space_host}/health"
    logging.info(f"Started self-ping thread for {url} every 12 hours.")
    while True:
        # Sleep for 12 hours
        time.sleep(12 * 3600)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Chitavuk-KeepAlive/1.0"})
            with urllib.request.urlopen(req, timeout=10):
                logging.info(f"Self-ping successful: {url}")
        except Exception as e:
            logging.error(f"Self-ping failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global nlp, nlp_active
    threading.Thread(target=ping_self, daemon=True).start()
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

# Global read-only connection
_db_conn = None

def get_db():
    global _db_conn
    if _db_conn is None and os.path.exists(DB_PATH):
        _db_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    return _db_conn

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
    conn = get_db()
    if not conn:
        return []
    cursor = conn.cursor()
    cursor.execute(
        "SELECT lemma, upos, feats, msd FROM lexicon WHERE form = ?",
        (word_latin.lower(),),
    )
    return cursor.fetchall()

def get_forms_from_lexicon(lemma: str, upos: str) -> Dict[str, str]:
    """Retrieves standard forms for a lemma using UD feats from local DB."""
    forms: Dict[str, str] = {}
    conn = get_db()
    if not conn:
        return forms
    cursor = conn.cursor()
    cursor.execute("SELECT form, feats FROM lexicon WHERE lemma = ?", (lemma.lower(),))
    rows = cursor.fetchall()

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
    conn = get_db()
    if not conn:
        return None
    cursor = conn.cursor()
    
    # Try exact word
    cursor.execute("SELECT translation FROM dictionary WHERE word = ?", (word.lower(),))
    row = cursor.fetchone()
    if row:
        return row[0]
        
    # Try lemma
    cursor.execute("SELECT translation FROM dictionary WHERE word = ?", (lemma.lower(),))
    row = cursor.fetchone()
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
        
    # Contextual translation logic
    contextual_translation = None
    if req.sentence and req.start_offset is not None and req.end_offset is not None:
        try:
            start = req.start_offset
            end = req.end_offset
            if 0 <= start <= len(req.sentence) and 0 <= end <= len(req.sentence) and start < end:
                tagged_sentence = req.sentence[:start] + f"<w>{req.token_text}</w>" + req.sentence[end:]
                translated_sentence = fetch_online_translation(tagged_sentence)
                import re
                match = re.search(r"<w[^>]*>(.*?)</w>", translated_sentence, re.IGNORECASE | re.DOTALL)
                if match:
                    contextual_translation = match.group(1).strip()
        except Exception as e:
            logging.error(f"Contextual translation failed: {e}")

    return {
        "lemma": lemma,
        "upos": upos,
        "feats": feats,
        "forms": forms,
        "translation": translation,
        "contextual_translation": contextual_translation
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

# ---------------------------------------------------------------------------
# Новости/статьи на сербском: RSS-ленты по темам + извлечение полного текста.
# Парсинг идёт на сервере (нет CORS, надёжные библиотеки), приложение зовёт
# /news и /article. Ленты можно править под себя.
# ---------------------------------------------------------------------------
import calendar

# Ленты проверены (отдают статьи). Темы агрегируют несколько СМИ; дубли по
# ссылке отсекаются, сортировка — по дате.
NEWS_FEEDS = {
    "general": [
        "https://n1info.rs/feed/",
        "https://www.danas.rs/feed/",
        "https://nova.rs/feed/",
    ],
    "politics": [
        "https://n1info.rs/vesti/feed/",
        "https://nova.rs/vesti/politika/feed/",
    ],
    "culture": [
        "https://www.blic.rs/rss/Kultura",
        "https://nova.rs/kultura/feed/",
        "https://n1info.rs/kultura/feed/",
    ],
    "trending": [  # «лента дня» — самое читаемое сегодня (Blic) + свежее
        "https://www.blic.rs/rss/danasnji-najcitaniji",
        "https://nova.rs/feed/",
        "https://n1info.rs/feed/",
    ],
    "science": [
        "https://naukakrozprice.rs/feed/",
        "https://nova.rs/it/feed/",
        "https://www.blic.rs/rss/IT",
    ],
}

# Кэш ленты по теме (чтобы не дёргать RSS на каждый заход).
_NEWS_CACHE = {}
_NEWS_TTL = 300  # 5 минут


def _clean_summary(html: str) -> str:
    text = re.sub(r"<[^>]+>", "", html or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:300]


def _entry_timestamp(e) -> int:
    for key in ("published_parsed", "updated_parsed"):
        val = e.get(key)
        if val:
            try:
                return calendar.timegm(val)
            except Exception:
                pass
    return 0


def _entry_image(e) -> Optional[str]:
    # media:content / media:thumbnail
    for key in ("media_content", "media_thumbnail"):
        media = e.get(key)
        if media:
            for m in media:
                if m.get("url"):
                    return m["url"]
    # enclosure-картинки
    for link in e.get("links", []):
        if link.get("rel") == "enclosure" and str(link.get("type", "")).startswith("image"):
            return link.get("href")
    # первый <img> в summary/content
    html = e.get("summary", "") or ""
    if e.get("content"):
        try:
            html += e["content"][0].get("value", "")
        except Exception:
            pass
    m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', html)
    if m:
        return m.group(1)
    return None


@app.get("/news")
def news(topic: str = "general", limit: int = 25):
    import feedparser
    # Кэш: отдаём свежий результat, не дёргая RSS чаще раза в 5 минут.
    now = time.time()
    cached = _NEWS_CACHE.get(topic)
    if cached and now - cached[0] < _NEWS_TTL:
        return {"topic": topic, "items": cached[1][:limit], "cached": True}

    feeds = NEWS_FEEDS.get(topic, NEWS_FEEDS["general"])
    items = []
    seen = set()
    for feed_url in feeds:
        try:
            d = feedparser.parse(feed_url)
            source = ""
            try:
                source = d.feed.get("title", "")
            except Exception:
                pass
            for e in d.entries:
                link = e.get("link", "")
                if not link or link in seen:
                    continue
                seen.add(link)
                items.append({
                    "title": (e.get("title", "") or "").strip(),
                    "summary": _clean_summary(e.get("summary", "")),
                    "image": _entry_image(e),
                    "source": source,
                    "link": link,
                    "published": e.get("published", "") or e.get("updated", ""),
                    "published_ts": _entry_timestamp(e),
                })
        except Exception as ex:
            logging.error(f"RSS feed failed ({feed_url}): {ex}")
    items.sort(key=lambda x: x.get("published_ts", 0), reverse=True)
    _NEWS_CACHE[topic] = (now, items)
    return {"topic": topic, "items": items[:limit]}


@app.get("/translate")
def translate(q: str, sl: str = "sr", tl: str = "ru"):
    """Перевод текста (для веба, где прямой запрос к Google блокируется CORS)."""
    try:
        from deep_translator import GoogleTranslator
        out = GoogleTranslator(source=sl, target=tl).translate(q)
        return {"translation": out or ""}
    except Exception as ex:
        logging.error(f"/translate failed: {ex}")
        return {"translation": ""}


@app.get("/img")
def img_proxy(url: str):
    """Прокси картинок: грузим на сервере и отдаём приложению — чтобы новостные
    изображения работали и в вебе (нет CORS)."""
    from fastapi.responses import Response
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            content = r.read()
            ctype = r.headers.get("Content-Type", "image/jpeg")
            return Response(content=content, media_type=ctype)
    except Exception as ex:
        logging.error(f"Image proxy failed ({url}): {ex}")
        from fastapi.responses import Response as _R
        return _R(status_code=404)


@app.get("/article")
def article(url: str):
    """Извлекает основной текст статьи и заглавную картинку по ссылке."""
    try:
        import trafilatura
        # Use urllib request to avoid python signal errors inside threads
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            downloaded = r.read()
        if not downloaded:
            return {"error": "fetch_failed"}
        from trafilatura.settings import use_config
        newconfig = use_config()
        newconfig.set("DEFAULT", "EXTRACTION_TIMEOUT", "0")
        result = trafilatura.extract(
            downloaded,
            output_format="json",
            with_metadata=True,
            include_comments=False,
            include_images=False,
            favor_recall=True,
            config=newconfig,
        )
        if not result:
            return {"error": "extract_failed"}
        data = json.loads(result)
        text = data.get("text", "") or ""
        paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
        image = data.get("image")
        # запасной поиск og:image. downloaded — bytes (urllib), декодируем для
        # regex; ошибка здесь не должна ронять всю статью.
        if not image:
            try:
                html_str = downloaded.decode("utf-8", "ignore") \
                    if isinstance(downloaded, (bytes, bytearray)) else downloaded
                m = re.search(
                    r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
                    html_str, re.IGNORECASE)
                if m:
                    image = m.group(1)
            except Exception:
                pass
        return {
            "title": data.get("title", "") or "",
            "image": image,
            "source": data.get("sitename") or data.get("hostname", "") or "",
            "date": data.get("date", "") or "",
            "paragraphs": paragraphs,
        }
    except Exception as ex:
        logging.error(f"Article extraction failed ({url}): {ex}")
        return {"error": str(ex)}


if __name__ == "__main__":
    import uvicorn
    # Run backend
    uvicorn.run(app, host="0.0.0.0", port=8000)
