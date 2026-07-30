"""Build the small, rights-checked public library shared by web and Flutter.

Texts are downloaded at release time, never when the catalog is rendered.
This keeps the catalog light and prevents a browser from loading every book
into memory. Sources are Serbian Wikisource pages whose authors died more than
70 years ago; attribution and the source revision URL stay in the catalog.
"""

from __future__ import annotations

import json
import html
import io
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "public" / "public-library"
API = "https://sr.wikisource.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"

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
        "coverFile": 'First page of "The Leader".jpg',
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
        "coverFile": "Prva strana Jazavac pred sudom.jpg",
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
        "coverFile": "Laza K. Lazarevic.jpg",
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
        "coverFile": 'Branislav Nušić "Sumnjivo lice", prvo izdanje na kineskom jeziku.jpg',
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
        "coverFile": "Naslovna strana Sve će to narod pozlatiti.png",
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
        "coverFile": "Simo Matavulj.jpg",
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
        "coverFile": "Herotaleslegends-petrovitch-p222-dragon-of-pavilion.jpg",
    },
    {
        "id": "stradija",
        "title": "Страдија",
        "author": "Радоје Домановић",
        "year": "1902",
        "kind": "Рассказ",
        "genre": "Сатира",
        "level": "B2",
        "summary": "Путевые заметки из вымышленной страны, где громкие слова о свободе мирно уживаются с покорностью и страхом.",
        "pages": ["Страдија", "Страдија/2", "Страдија/3"],
        "coverFile": "RadojeD Stradija - titlepage.png",
    },
    {
        "id": "danga",
        "title": "Данга",
        "author": "Радоје Домановић",
        "year": "1899",
        "kind": "Рассказ",
        "genre": "Сатира",
        "level": "B2",
        "summary": "Гротескный сон о гражданах, которые с готовностью принимают клеймо как знак порядка и благонадёжности.",
        "pages": ["Данга"],
        "coverFile": "Radoje Domanović (1).jpg",
    },
    {
        "id": "mrtvo-more",
        "title": "Мртво море",
        "author": "Радоје Домановић",
        "year": "1902",
        "kind": "Рассказ",
        "genre": "Сатира",
        "level": "B2",
        "summary": "Сатира о среде, которая отвергает всякого, кто решается думать, работать и выбиваться из привычного спокойствия.",
        "pages": ["Мртво море"],
        "coverFile": "Rodna kuća Radoja Domanovića u Ovsištu.jpg",
    },
    {
        "id": "marko-medju-srbima",
        "title": "Краљевић Марко по други пут међу Србима",
        "author": "Радоје Домановић",
        "year": "1901",
        "kind": "Повесть",
        "genre": "Сатира",
        "level": "C1",
        "summary": "Легендарный герой возвращается к народу, который веками звал его на помощь, и обнаруживает совсем не героическую действительность.",
        "pages": ["Краљевић Марко по други пут међу Србима"],
        "coverFile": "Radoje Domanović 1973 Yugoslavia stamp.jpg",
    },
    {
        "id": "vetar",
        "title": "Ветар",
        "author": "Лаза Лазаревић",
        "year": "1889",
        "kind": "Рассказ",
        "genre": "Реализм",
        "level": "B2",
        "summary": "Психологический рассказ о случайной встрече, нерешительности и жизни, которая проходит рядом с человеком.",
        "pages": ["Ветар"],
        "coverFile": "LazaLazarevicVetar.jpg",
    },
    {
        "id": "svabica",
        "title": "Швабица",
        "author": "Лаза Лазаревић",
        "year": "1876",
        "kind": "Повесть",
        "genre": "Реализм",
        "level": "C1",
        "summary": "История любви сербского студента в Берлине, рассказанная через письма и конфликт между чувством и ожиданиями среды.",
        "pages": ["Швабица"],
        "coverFile": "LazaL Svabica.pdf",
    },
    {
        "id": "mracajski-proto",
        "title": "Мрачајски прото",
        "author": "Петар Кочић",
        "year": "1904",
        "kind": "Рассказ",
        "genre": "Реализм",
        "level": "C1",
        "summary": "Мрачный портрет одинокого священника и мира, в котором подозрение и пережитое насилие меняют человека.",
        "pages": ["Мрачајски прото"],
        "coverFile": "Petar Kocic, ulje na drvetu. Autor Spiro Bocaric, slikar.jpg",
    },
    {
        "id": "kroz-mecavu",
        "title": "Кроз мећаву",
        "author": "Петар Кочић",
        "year": "1907",
        "kind": "Рассказ",
        "genre": "Реализм",
        "level": "B2",
        "summary": "Старик и ребёнок возвращаются с рынка сквозь метель; короткая дорога превращается в тяжёлое испытание.",
        "pages": ["Кроз мећаву"],
        "coverFile": "Petar Kočić1.jpg",
    },
    {
        "id": "prva-brazda",
        "title": "Прва бразда",
        "author": "Милован Глишић",
        "year": "1885",
        "kind": "Рассказ",
        "genre": "Реализм",
        "level": "B1",
        "summary": "Рассказ о вдове, её детях и первой борозде, которая становится знаком взросления и надежды.",
        "pages": ["Прва бразда"],
        "coverFile": "Milovan Glišić potrait.jpg",
    },
    {
        "id": "darina-textbooks",
        "title": "Учебники сербского языка",
        "author": "Подборкой поделилась darina",
        "year": "Современные материалы",
        "kind": "Подборка",
        "genre": "Учебники",
        "level": "A1–C1",
        "summary": "Внешняя подборка учебников и пособий по сербскому языку. Файлы остаются в Google Drive и открываются у первоисточника.",
        "externalUrl": "https://drive.google.com/drive/folders/1igeVGjzlEfI1BndD8bnHFAV3FbrqgXus?usp=drive_link",
        "attribution": "Подборкой поделилась девушка под ником darina",
        "coverFile": "Univerzitetska biblioteka u Beogradu 07.jpg",
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
        result = json.load(response)
    # Wikimedia asks bulk clients to avoid short request bursts.
    time.sleep(0.2)
    return result


def commons_api(params: dict[str, str]) -> dict:
    query = urllib.parse.urlencode(
        {"format": "json", "formatversion": "2", **params}
    )
    request = urllib.request.Request(
        f"{COMMONS_API}?{query}",
        headers={"User-Agent": "CitavukPublicLibrary/1.0 (https://citavuk.ru)"},
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        result = json.load(response)
    time.sleep(0.2)
    return result


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


def _plain_metadata(value: str) -> str:
    return re.sub(r"<[^>]+>", "", html.unescape(value)).strip()


def make_cover(book: dict, path: Path) -> dict[str, str]:
    """Download and crop a real Commons image, preserving its attribution."""
    file_title = f"File:{book['coverFile']}"
    data = commons_api(
        {
            "action": "query",
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiurlwidth": "1000",
            "titles": file_title,
        }
    )
    page = data["query"]["pages"][0]
    if page.get("missing") or not page.get("imageinfo"):
        raise RuntimeError(f"Commons cover is missing: {file_title}")
    info = page["imageinfo"][0]
    image_url = info.get("thumburl") or info["url"]
    request = urllib.request.Request(
        image_url,
        headers={"User-Agent": "CitavukPublicLibrary/1.0 (https://citavuk.ru)"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read()

    with Image.open(io.BytesIO(raw)) as source:
        source = ImageOps.exif_transpose(source)
        if source.mode in {"RGBA", "LA"}:
            background = Image.new("RGBA", source.size, "#F3E9D2")
            background.alpha_composite(source.convert("RGBA"))
            source = background
        cover = ImageOps.fit(
            source.convert("RGB"),
            (720, 1040),
            method=Image.Resampling.LANCZOS,
            centering=book.get("coverFocus", (0.5, 0.5)),
        )
        cover.save(path, "WEBP", quality=88, method=6)

    metadata = info.get("extmetadata") or {}

    def field(name: str) -> str:
        value = metadata.get(name) or {}
        return _plain_metadata(str(value.get("value") or ""))

    return {
        "coverSourceUrl": info.get("descriptionurl")
        or f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(file_title)}",
        "coverLicense": field("LicenseShortName") or "См. страницу файла",
        "coverAuthor": field("Artist") or field("Credit") or "Wikimedia Commons",
    }


def main() -> None:
    texts = OUT / "texts"
    covers = OUT / "covers"
    texts.mkdir(parents=True, exist_ok=True)
    covers.mkdir(parents=True, exist_ok=True)

    catalog = []
    for book in BOOKS:
        parts = []
        source_urls = []
        for page in book.get("pages", []):
            text, url = fetch_page(page)
            parts.append(text)
            source_urls.append(url)
        full_text = ("\n\n".join(parts).strip() + "\n") if parts else ""
        text_url = ""
        if full_text:
            text_path = texts / f"{book['id']}.txt"
            text_path.write_text(full_text, encoding="utf-8")
            text_url = f"/public-library/texts/{book['id']}.txt"
        elif book.get("externalUrl"):
            source_urls.append(book["externalUrl"])
        cover_metadata = make_cover(book, covers / f"{book['id']}.webp")

        catalog.append(
            {
                key: value
                for key, value in book.items()
                if key not in {"pages", "coverFile", "coverFocus"}
            }
            | {
                "coverUrl": f"/public-library/covers/{book['id']}.webp",
                "textUrl": text_url,
                "sourceUrls": source_urls,
                "license": (
                    "Общественное достояние; разметка Викизворника — CC BY-SA 4.0"
                    if full_text
                    else "Внешняя подборка; права на отдельные файлы указаны их авторами"
                ),
                "characters": len(full_text),
            }
            | cover_metadata
        )
        print(
            f"{book['id']}: "
            f"{len(full_text):,} chars"
            if full_text
            else f"{book['id']}: external collection"
        )

    (OUT / "catalog.json").write_text(
        json.dumps(
            {
                "version": 2,
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
