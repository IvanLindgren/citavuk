"""Build the small, rights-checked public library shared by web and Flutter.

Texts are downloaded at release time, never when the catalog is rendered.
This keeps the catalog light and prevents a browser from loading every book
into memory. Sources are Serbian Wikisource pages whose authors died more than
70 years ago; attribution and the source revision URL stay in the catalog.
"""

from __future__ import annotations

import json
import re
import textwrap
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "public" / "public-library"
FONT_REGULAR = ROOT / "frontend" / "assets" / "fonts" / "NotoSerif-Regular.ttf"
FONT_BOLD = ROOT / "frontend" / "assets" / "fonts" / "NotoSerif-Bold.ttf"
API = "https://sr.wikisource.org/w/api.php"

BOOKS = [
    {
        "id": "vodja",
        "title": "Вођа",
        "author": "Радоје Домановић",
        "year": "1901",
        "kind": "Рассказ",
        "genre": "Сатира",
        "level": "B1",
        "summary": "Политическая сатира о людях, которые выбрали себе вождя и перестали смотреть, куда идут.",
        "pages": ["Вођа"],
        "accent": "#A92C27",
    },
    {
        "id": "jazavac-pred-sudom",
        "title": "Јазавац пред судом",
        "author": "Петар Кочић",
        "year": "1904",
        "kind": "Пьеса",
        "genre": "Сатира",
        "level": "B2",
        "summary": "Крестьянин Давид Штрбац приводит барсука в суд и превращает разбирательство в острый разговор о власти.",
        "pages": ["Јазавац пред судом"],
        "accent": "#315C55",
    },
    {
        "id": "prvi-put-s-ocem",
        "title": "Први пут с оцем на јутрење",
        "author": "Лаза Лазаревић",
        "year": "1879",
        "kind": "Рассказ",
        "genre": "Реализм",
        "level": "B1",
        "summary": "Семейный рассказ о слабости, долге и возвращении человека к тем, кто его любит.",
        "pages": ["Први пут с оцем на јутрење"],
        "accent": "#7D4F3B",
    },
    {
        "id": "sumnjivo-lice",
        "title": "Сумњиво лице",
        "author": "Бранислав Нушић",
        "year": "1888",
        "kind": "Пьеса",
        "genre": "Комедия",
        "level": "B2",
        "summary": "Комедия о провинциальной бюрократии, секретном письме и подозрительном лице, которого ищут не там.",
        "pages": [
            "Сумњиво лице/Лица",
            "Сумњиво лице/Чин први",
            "Сумњиво лице/Чин други",
        ],
        "accent": "#8B3154",
    },
    {
        "id": "sve-ce-to-narod-pozlatiti",
        "title": "Све ће то народ позлатити",
        "author": "Лаза Лазаревић",
        "year": "1882",
        "kind": "Рассказ",
        "genre": "Реализм",
        "level": "B2",
        "summary": "Тяжёлый рассказ о встрече отцов с сыновьями, вернувшимися с войны, и цене громких обещаний.",
        "pages": ["Све ће то народ позлатити"],
        "accent": "#425B7A",
    },
    {
        "id": "pilipenda",
        "title": "Пилипенда",
        "author": "Симо Матавуљ",
        "year": "1901",
        "kind": "Рассказ",
        "genre": "Реализм",
        "level": "B2",
        "summary": "Короткий рассказ о бедности, достоинстве и упрямой верности собственному выбору.",
        "pages": ["Пилипенда"],
        "accent": "#6C6231",
    },
    {
        "id": "cardak",
        "title": "Чардак ни на небу ни на земљи",
        "author": "Народная сказка, запись Вука Караџића",
        "year": "XIX век",
        "kind": "Сказка",
        "genre": "Фольклор",
        "level": "A2",
        "summary": "Сербская волшебная сказка о трёх братьях, похищенной царевне и замке между небом и землёй.",
        "pages": ["Чардак ни на небу ни на земљи"],
        "accent": "#9A5725",
    },
]


def api(params: dict[str, str]) -> dict:
    query = urllib.parse.urlencode(
        {"format": "json", "formatversion": "2", **params}
    )
    request = urllib.request.Request(
        f"{API}?{query}",
        headers={"User-Agent": "CitavukPublicLibrary/1.0 (https://citavuk.ru)"},
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.load(response)


def fetch_page(title: str) -> tuple[str, str]:
    data = api(
        {
            "action": "query",
            "redirects": "1",
            "prop": "extracts|info",
            "explaintext": "1",
            "inprop": "url",
            "titles": title,
        }
    )
    page = data["query"]["pages"][0]
    if page.get("missing"):
        raise RuntimeError(f"Wikisource page is missing: {title}")
    text = page.get("extract", "").strip()
    if len(text) < 500:
        raw = api(
            {
                "action": "query",
                "redirects": "1",
                "prop": "revisions",
                "rvprop": "content",
                "rvslots": "main",
                "titles": title,
            }
        )["query"]["pages"][0]
        revisions = raw.get("revisions") or []
        if revisions:
            text = clean_wikitext(
                revisions[0].get("slots", {}).get("main", {}).get("content", "")
            )
    # Dramatis personae can be deliberately short. The combined work is
    # checked by the resulting catalog size.
    if len(text) < 100:
        raise RuntimeError(f"Wikisource page is unexpectedly short: {title}")
    return clean_extract(text), page["fullurl"]


def clean_extract(text: str) -> str:
    # MediaWiki extracts append navigation/category sections which are useful on
    # the source site but become noise inside a book.
    text = text.replace("\r\n", "\n")
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    text = re.sub(r"\n{3,}", "\n\n", text)
    cut_markers = (
        "\nПреузето са „",
        "\nПреузето из „",
        "\nКатегорије:",
        "\nКатегорија:",
        "\nImage\n",
    )
    positions = [text.find(marker) for marker in cut_markers]
    positions = [position for position in positions if position > 500]
    if positions:
        text = text[: min(positions)]
    return text.strip()


def clean_wikitext(text: str) -> str:
    text = re.split(
        r"\n==\s*(?:Извор|Види још|Референце)\s*==",
        text,
        maxsplit=1,
    )[0]
    text = re.sub(r"<poem>|</poem>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\{\{[^{}]*\}\}", "", text)
    text = re.sub(r"\[\[(?:[^|\]]+\|)?([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"'{2,5}", "", text)
    return clean_extract(text)


def make_cover(book: dict, path: Path) -> None:
    width, height = 720, 1040
    accent = book["accent"]
    image = Image.new("RGB", (width, height), "#F3E9D2")
    draw = ImageDraw.Draw(image)
    title_font = ImageFont.truetype(str(FONT_BOLD), 62)
    author_font = ImageFont.truetype(str(FONT_BOLD), 31)
    meta_font = ImageFont.truetype(str(FONT_REGULAR), 25)

    draw.rounded_rectangle(
        (34, 34, width - 34, height - 34),
        radius=24,
        outline=accent,
        width=5,
    )
    draw.rectangle((64, 64, width - 64, 84), fill=accent)
    draw.rectangle((64, height - 84, width - 64, height - 64), fill=accent)

    # Serbian cross with four firesteels, kept geometric so it remains crisp.
    cx, cy = width // 2, 230
    draw.rectangle((cx - 14, cy - 92, cx + 14, cy + 92), fill=accent)
    draw.rectangle((cx - 92, cy - 14, cx + 92, cy + 14), fill=accent)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = cx + sx * 58, cy + sy * 58
            draw.arc((x - 20, y - 25, x + 20, y + 25), 70, 290, fill=accent, width=8)

    title_lines = []
    for paragraph in textwrap.wrap(book["title"], width=20):
        title_lines.append(paragraph)
    title_text = "\n".join(title_lines)
    title_box = draw.multiline_textbbox(
        (0, 0), title_text, font=title_font, spacing=12, align="center"
    )
    title_width = title_box[2] - title_box[0]
    title_height = title_box[3] - title_box[1]
    draw.multiline_text(
        ((width - title_width) / 2, 430 - title_height / 2),
        title_text,
        font=title_font,
        fill="#261A12",
        spacing=12,
        align="center",
    )

    author_lines = "\n".join(textwrap.wrap(book["author"], width=34))
    author_box = draw.multiline_textbbox(
        (0, 0), author_lines, font=author_font, spacing=8, align="center"
    )
    draw.multiline_text(
        ((width - (author_box[2] - author_box[0])) / 2, 650),
        author_lines,
        font=author_font,
        fill=accent,
        spacing=8,
        align="center",
    )
    meta = f"{book['kind']}  •  {book['year']}  •  {book['level']}"
    meta_box = draw.textbbox((0, 0), meta, font=meta_font)
    draw.text(
        ((width - (meta_box[2] - meta_box[0])) / 2, 855),
        meta,
        font=meta_font,
        fill="#5A4738",
    )
    image.save(path, "WEBP", quality=86, method=6)


def main() -> None:
    texts = OUT / "texts"
    covers = OUT / "covers"
    texts.mkdir(parents=True, exist_ok=True)
    covers.mkdir(parents=True, exist_ok=True)

    catalog = []
    for book in BOOKS:
        parts = []
        source_urls = []
        for page in book["pages"]:
            text, url = fetch_page(page)
            parts.append(text)
            source_urls.append(url)
        full_text = "\n\n".join(parts).strip() + "\n"
        text_path = texts / f"{book['id']}.txt"
        text_path.write_text(full_text, encoding="utf-8")
        make_cover(book, covers / f"{book['id']}.webp")

        catalog.append(
            {
                key: value
                for key, value in book.items()
                if key not in {"pages", "accent"}
            }
            | {
                "coverUrl": f"/public-library/covers/{book['id']}.webp",
                "textUrl": f"/public-library/texts/{book['id']}.txt",
                "sourceUrls": source_urls,
                "license": "Общественное достояние; разметка Викизворника — CC BY-SA 4.0",
                "characters": len(full_text),
            }
        )
        print(f"{book['id']}: {len(full_text):,} chars")

    (OUT / "catalog.json").write_text(
        json.dumps(
            {
                "version": 1,
                "generatedAt": "2026-07-30",
                "items": catalog,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
