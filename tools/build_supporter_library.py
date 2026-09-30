"""Собирает полные, проверенные по правам тексты для закрытой библиотеки.

Результат не попадает в web/public: импортируется в защищённую серверную БД.
Страница-оглавление, отсутствующая глава или неполный перевод — ошибка сборки.
"""
from __future__ import annotations

import argparse
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
API = "https://sr.wikisource.org/w/api.php"


def api(params):
    query = urllib.parse.urlencode({"format": "json", "formatversion": "2", **params})
    request = urllib.request.Request(f"{API}?{query}", headers={"User-Agent": "CitavukLibrary/1.0 (https://citavuk.ru)"})
    with urllib.request.urlopen(request, timeout=45) as response:
        result = json.load(response)
    time.sleep(0.25)
    if "error" in result:
        raise ValueError(f"Wikisource: {result['error'].get('code')}")
    return result


def without_templates(text):
    # Только для выделения ссылок оглавления; не для текста самой книги.
    while re.search(r"\{\{[^{}]*\}\}", text):
        text = re.sub(r"\{\{[^{}]*\}\}", "", text)
    return text


def chapter_titles(raw, title, collection=False):
    content = without_templates(raw)
    if collection:
        links = re.findall(r"^#\s*\[\[([^]|]+)", content, re.M)
    else:
        links = re.findall(r"\[\[([^]|]+)", content)
        links = [s for s in links if s.startswith(title + "/")]
    return list(dict.fromkeys(s.strip() for s in links))


class LiteraryText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skipped = []
        self.parts = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        classes = values.get("class", "").split()
        verse_table = tag == "table" and any(c in values.get("style", "").lower() for c in ("ghostwhite", "background-color:transparent"))
        excluded = tag in {"script", "style", "sup"} or (tag == "table" and not verse_table) or any(
            c in {"mw-editsection", "navbox", "noprint", "ws-noexport", "references", "reflist", "catlinks"} for c in classes
        )
        if self.skipped:
            if tag not in {"br", "hr", "img", "input", "meta", "link"}:
                self.skipped.append(tag)
        elif excluded:
            self.skipped.append(tag)
        elif tag in {"p", "div", "h1", "h2", "h3", "h4", "br", "hr"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if self.skipped:
            if tag in self.skipped:
                pos = len(self.skipped) - 1 - self.skipped[::-1].index(tag)
                self.skipped = self.skipped[:pos]
        elif tag in {"p", "div", "h1", "h2", "h3", "h4"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skipped:
            self.parts.append(data)


def clean_rendered(rendered):
    parser = LiteraryText()
    parser.feed(rendered)
    text = html.unescape("".join(parser.parts)).replace("\u200b", "").replace("\xa0", " ")
    text = re.sub(r"\n\s*(?:Извор|Извори|Напомене|Референце)\s*\n.*", "", text, flags=re.S)
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def validate_book(book, year=2026):
    for field in ["authorDeath"] + (["translatorDeath"] if book.get("translator") else []):
        death = book.get(field)
        if type(death) is not int or death < 1 or death + 70 >= year:
            raise ValueError(f"Не подтверждено общественное достояние: {book['title']}, {field}")


def raw_page(title):
    page = api({"action": "query", "redirects": "1", "prop": "revisions", "rvprop": "ids|content", "rvslots": "main", "titles": title})["query"]["pages"][0]
    if page.get("missing") or not page.get("revisions"):
        raise ValueError(f"Отсутствующая глава: {title}")
    revision = page["revisions"][0]
    return revision["slots"]["main"]["content"], revision["revid"]


def build(book, cache):
    validate_book(book)
    source = book.get("sourceTitle", book["title"])
    raw, revision = raw_page(source)
    pages = book.get("pages", [source])
    if book.get("index") or book.get("collection"):
        # У старого указателя могут быть ссылки с коротким заголовком.
        prefixes = [source, *book.get("chapterAliases", [])]
        content = without_templates(raw)
        if book.get("collection"):
            pages = chapter_titles(raw, source, True)
        else:
            pages = list(dict.fromkeys(s.strip() for s in re.findall(r"\[\[([^]|]+)", content)
                if any(s.startswith(prefix + "/") for prefix in prefixes)))
        if not pages:
            raise ValueError(f"Пустое оглавление: {source}")
    if book.get("expectedChapters") and len(pages) != book["expectedChapters"]:
        raise ValueError(f"Число глав не совпадает: {source}")
    texts, sources = [], []
    for title in pages:
        key = hashlib.sha256(title.encode()).hexdigest()
        cached = cache / f"{key}.json"
        if cached.exists():
            saved = json.loads(cached.read_text(encoding="utf8"))
        else:
            parsed = api({"action": "parse", "page": title, "prop": "text|revid", "disableeditsection": "1", "disablelimitreport": "1"})["parse"]
            text = clean_rendered(parsed["text"])
            if len(text) < 100:
                raise ValueError(f"Пустая/слишком короткая глава: {title}")
            saved = {"title": title, "revision": parsed["revid"], "text": text}
            cached.write_text(json.dumps(saved, ensure_ascii=False), encoding="utf8")
        text = saved["text"]
        if "{{" in text or "[[" in text:
            raise ValueError(f"Неочищенная разметка: {title}")
        texts.append((title.rsplit("/", 1)[-1] + "\n\n" if len(pages) > 1 else "") + text)
        sources.append(f"https://sr.wikisource.org/w/index.php?oldid={saved['revision']}")
    body = "\n\n".join(texts)
    if len(body) < 3000:
        raise ValueError(f"Книга слишком короткая, возможно это фрагмент: {source}")
    source_url = "https://sr.wikisource.org/wiki/" + urllib.parse.quote(source.replace(" ", "_"))
    credit = f"Источник: {source_url}\nОригинал и перевод — общественное достояние. Оцифровка: Викизворник, CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)."
    if book.get("translator"):
        credit = f"Превод: {book['translator']}.\n" + credit
    return {"kind": "book", "title": book["title"], "author": book["author"],
            "description": book["description"], "level": book["level"], "published": True,
            "coverUrl": "", "body": body + "\n\n" + credit, "sourceUrl": source_url,
            "license": "public-domain", "sourceRevisions": sources,
            "authorDeath": book["authorDeath"], "translator": book.get("translator", ""),
            "translatorDeath": book.get("translatorDeath", 0), "chapters": len(pages)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=ROOT / "output/supporter-library-20260930/catalog.json")
    args = parser.parse_args()
    books = json.loads((ROOT / "tools/data/supporter_books.json").read_text(encoding="utf8"))["books"]
    cache = args.out.parent / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    result = []
    for book in books:
        item = build(book, cache)
        result.append(item)
        print(f"OK {item['title']}: {item['chapters']} глав, {len(item['body'])} знаков", flush=True)
    args.out.write_text(json.dumps({"items": result}, ensure_ascii=False), encoding="utf8")
    print(f"Готово: {len(result)} книг. Тексты не опубликованы в общедоступной статике.")


if __name__ == "__main__":
    main()
