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


def api(params, *, post=False):
    query = urllib.parse.urlencode({"format": "json", "formatversion": "2", **params})
    request = urllib.request.Request(API if post else f"{API}?{query}",
        data=query.encode("utf8") if post else None,
        headers={"User-Agent": "CitavukLibrary/1.0 (https://citavuk.ru)", "Content-Type": "application/x-www-form-urlencoded"})
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


def leaf_titles(pages):
    """Оглавления разделов не дублируют уже выбранные главы этих разделов."""
    return [page for page in pages if not any(other.startswith(page + "/") for other in pages)]


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
    if "anonymousTranslationPublished" in book:
        published = book["anonymousTranslationPublished"]
        # Для известного анонимного исторического перевода берём консервативные
        # 95 лет от публикации. Не подставляем выдуманную дату смерти переводчика.
        if type(published) is not int or published < 1 or published + 95 >= year or not book.get("translationNote"):
            raise ValueError(f"Не подтверждены права анонимного перевода: {book['title']}")


def raw_page(title):
    page = api({"action": "query", "redirects": "1", "prop": "revisions", "rvprop": "ids|content", "rvslots": "main", "titles": title})["query"]["pages"][0]
    if page.get("missing") or not page.get("revisions"):
        raise ValueError(f"Отсутствующая глава: {title}")
    revision = page["revisions"][0]
    return revision["slots"]["main"]["content"], revision["revid"]


def fetch_raw_pages(titles):
    """Получает главы пачками, сохраняя порядок и проверяя каждую ссылку."""
    result = {}
    for offset in range(0, len(titles), 40):
        batch = titles[offset:offset + 40]
        query = api({"action": "query", "redirects": "1", "prop": "revisions",
            "rvprop": "ids|content", "rvslots": "main", "titles": "|".join(batch)})["query"]
        aliases = {r["from"]: r["to"] for r in [*query.get("normalized", []), *query.get("redirects", [])]}
        pages = {page["title"]: page for page in query["pages"]}
        for title in batch:
            canonical = title
            for _ in range(10):
                if canonical not in aliases:
                    break
                canonical = aliases[canonical]
            page = pages.get(canonical, {})
            if page.get("missing") or not page.get("revisions"):
                raise ValueError(f"Отсутствующая глава: {title}")
            revision = page["revisions"][0]
            result[title] = {"title": title, "revision": revision["revid"],
                "raw": revision["slots"]["main"]["content"]}
    return result


def render_sections(sections):
    """Рендерит публичный wikitext одним read-only запросом без потери границ."""
    joined = "\n\n".join(f"<h2>CITAVUK_SECTION_{i}</h2>\n{section['raw']}" for i, section in enumerate(sections))
    if any("CITAVUK_SECTION_" in section["raw"] for section in sections):
        raise ValueError("Текст совпадает со служебной границей раздела")
    parsed = api({"action": "parse", "title": "CitavukLibraryBatch", "text": joined,
        "contentmodel": "wikitext", "prop": "text", "disableeditsection": "1",
        "disablelimitreport": "1"}, post=True)["parse"]["text"]
    pieces = re.split(r"<h2\b[^>]*>CITAVUK_SECTION_(\d+)</h2>", parsed)
    if len(pieces) != len(sections) * 2 + 1:
        raise ValueError("Рендер потерял границы глав")
    texts = []
    for i, section in enumerate(sections):
        if pieces[i * 2 + 1] != str(i):
            raise ValueError("Рендер изменил порядок глав")
        text = clean_rendered(pieces[i * 2 + 2])
        title_page = section["title"].rsplit("/", 1)[-1].lower() in {"насловна", "насловна страна"}
        if len(text) < 20 and not title_page:
            raise ValueError(f"Пустая глава: {section['title']}")
        texts.append(text)
    return texts


def fetch_rendered_pages(titles, cache):
    saved = {}
    pending = []
    for title in titles:
        path = cache / (hashlib.sha256(title.encode()).hexdigest() + ".json")
        if path.exists():
            saved[title] = json.loads(path.read_text(encoding="utf8"))
        else:
            pending.append(title)
    raw_pages = fetch_raw_pages(pending)
    group, size = [], 0

    def flush():
        for section, text in zip(group, render_sections(group)):
            item = {"title": section["title"], "revision": section["revision"], "text": text}
            path = cache / (hashlib.sha256(section["title"].encode()).hexdigest() + ".json")
            path.write_text(json.dumps(item, ensure_ascii=False), encoding="utf8")
            saved[section["title"]] = item

    for title in pending:
        section = raw_pages[title]
        if group and size + len(section["raw"]) > 100000:
            flush()
            group, size = [], 0
        group.append(section)
        size += len(section["raw"])
    if group:
        flush()
    return saved


def build(book, cache):
    validate_book(book)
    source = book.get("sourceTitle", book["title"])
    raw, revision = raw_page(source)
    pages = book.get("pages", [source])
    if book.get("pagesFromIndex"):
        links = re.findall(r"\[\[([^]|]+)", raw)
        children = [s.strip() for s in links if s.startswith(source + "/")]
        if not children:
            children = [s.strip() for s in re.findall(r"\[\[([^]|]+)", without_templates(raw)) if ":" not in s and s != source]
        pages = list(dict.fromkeys(children))
        if not pages:
            raise ValueError(f"Нет глав оглавления: {source}")
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
    if book.get("leafIndex"):
        pages = leaf_titles(pages)
    pages = list(dict.fromkeys([*book.get("extraIntroPages", []), *pages]))
    omit = set(book.get("omitChapters", []))
    if any(title not in pages for title in omit):
        raise ValueError(f"Исключённая служебная страница не найдена: {source}")
    pages = [title for title in pages if title not in omit]
    texts, sources = [], []
    rendered_pages = fetch_rendered_pages(pages, cache)
    for title in pages:
        saved = rendered_pages[title]
        text = saved["text"]
        if "{{" in text or "[[" in text:
            raise ValueError(f"Неочищенная разметка: {title}")
        if text:
            texts.append((title.rsplit("/", 1)[-1] + "\n\n" if len(pages) > 1 else "") + text)
        sources.append(f"https://sr.wikisource.org/w/index.php?oldid={saved['revision']}")
    body = "\n\n".join(texts)
    if len(body) < 3000:
        raise ValueError(f"Книга слишком короткая, возможно это фрагмент: {source}")
    source_url = "https://sr.wikisource.org/wiki/" + urllib.parse.quote(source.replace(" ", "_"))
    credit = f"Источник: {source_url}\nОригинал и перевод — общественное достояние. Оцифровка: Викизворник, CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)."
    if book.get("translator"):
        credit = f"Превод: {book['translator']}.\n" + credit
    if book.get("translationNote"):
        credit = book["translationNote"] + "\n" + credit
    return {"kind": "book", "title": book["title"], "author": book["author"],
            "description": book["description"], "level": book["level"], "published": True,
            "coverUrl": "", "body": body + "\n\n" + credit, "sourceUrl": source_url,
            "license": "public-domain", "sourceRevisions": sources,
            "authorDeath": book["authorDeath"], "translator": book.get("translator", ""),
            "translatorDeath": book.get("translatorDeath", 0), "chapters": len(pages)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=ROOT / "output/supporter-library-20260930/catalog.json")
    parser.add_argument("--registry", type=Path, default=ROOT / "tools/data/supporter_books.json")
    args = parser.parse_args()
    books = json.loads(args.registry.read_text(encoding="utf8"))["books"]
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
