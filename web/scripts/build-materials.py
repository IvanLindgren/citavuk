#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Собирает каталог материалов для поступления из открытых источников.

Что это
-------
Раздел «Материалы для поступления» показывает настоящие экзаменационные тесты и
пособия с сайтов сербских государственных учреждений и университетов. Файлы
**не копируются** к нам: каталог хранит только описания и ссылки на
первоисточник, а скачивание идёт по явному нажатию пользователя. Так у
документа остаётся автор, а у нас не появляется чужой библиотеки, права на
раздачу которой никто не проверял.

Источники
---------
Два уровня поступления, и это разные материалы:

* ``gimnazija`` — приём в гимназии и специализированные отделения. Публикует
  Завод за вредновање квалитета образовања и васпитања (ceo.edu.rs),
  учреждение Министерства просвещения Сербии.
* ``fakultet`` — вступительные экзамены на факультеты. Публикуют сами
  факультеты всех четырёх государственных университетов Сербии: Белградского,
  Нови-Садского, Нишского и Крагуевацкого.

Все источники — государственные, открытые, без регистрации и оплаты.

Предмет документа определяется по имени файла, и это не всегда возможно: часть
факультетов называет сборник просто ``zadaci-prijemni.pdf``. Для таких
источников предмет задан в описании — но задан не наугад, а по содержимому
самого файла. Технологический факультет Нови-Сада, например, помечен химией
потому, что его сборник открывается программой «NASTAVNI PROGRAM HEMIJA».

Проверка
--------
Каждая ссылка проверяется запросом: живой ответ, сигнатура PDF, размер. В
каталог попадает только то, что действительно открывается — «битая ссылка на
учебник» хуже отсутствия учебника, потому что тратит время в момент, когда
человек готовится к экзамену.

Запуск::

    python scripts/build-materials.py            # собрать и проверить
    python scripts/build-materials.py --quick    # без проверки ссылок
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import http.client
import io
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(ROOT)

# Один генератор — несколько потребителей. Каталог нужен и сайту, и приложению;
# держать две копии, собранные по-разному, значит однажды показать разное.
OUT_PATHS = [
    os.path.join(ROOT, "src", "materials", "catalog.json"),
    os.path.join(REPO, "frontend", "assets", "materials", "catalog.json"),
]

USER_AGENT = "Mozilla/5.0 (compatible; CitavukCatalog/1.0; +https://citavuk.ru)"

# Часть факультетских сайтов держит устаревшие настройки TLS: короткий ключ
# Диффи — Хеллмана, неполная цепочка сертификатов. Ослабление проверки здесь
# допустимо и ни на что не влияет: скрипт только читает публичные списки файлов
# и ничего не отправляет. Сами документы пользователь скачивает через прокси
# сервера, у которого проверки на месте.
_TLS = ssl.create_default_context()
_TLS.check_hostname = False
_TLS.verify_mode = ssl.CERT_NONE
try:
    _TLS.set_ciphers("DEFAULT@SECLEVEL=1")
except ssl.SSLError:  # pragma: no cover — зависит от сборки OpenSSL
    pass

LEVELS = {
    "gimnazija": "Гимназия",
    "fakultet": "Университет",
}

# --- Источники -------------------------------------------------------------
#
# `pages`          — страницы, с которых собираются ссылки на PDF;
# `urls`           — известные адреса файлов, которые ни на одной странице
#                    списком не перечислены (проверяются наравне с остальными);
# `include`        — что оставить. Без него в каталог попадают ранг-листы,
#                    объявления о конкурсе и бланки заявлений — формально PDF,
#                    но к подготовке отношения не имеющие;
# `subject`        — предмет, если он у источника один и по имени не читается;
# `defaultSubject` — предмет для тех файлов источника, у которых он по имени не
#                    определился, когда у остальных определяется;
# `defaultKind`    — вид документа, когда по имени он не читается.

SOURCES = [
    {
        "id": "ceo-prijemni",
        "pages": [
            "https://ceo.edu.rs/%d0%bf%d1%80%d0%b8%d1%98%d0%b5%d0%bc%d0%bd%d0%b8-%d0%b8%d1%81%d0%bf%d0%b8%d1%82%d0%b8/"
        ],
        "publisher": "Завод за вредновање квалитета образовања и васпитања",
        "publisherShort": "ЗВКОВ",
        "level": "gimnazija",
    },
    {
        "id": "matf-oas",
        "pages": ["https://www.matf.bg.ac.rs/upis-oas/"],
        # Тесты названы по году и месяцу («2016Jun.pdf»), решения — отдельно.
        "include": r"/\d{4}(jun|jul|sep)[^/]*\.pdf$|zadaci-prijemni|probni_prijemni",
        "publisher": "Математический факультет Белградского университета",
        "publisherShort": "Матфак, Белград",
        "level": "fakultet",
        "subject": ("math", "Математика"),
    },
    {
        "id": "matf-pripremna",
        "pages": ["https://pripremna.matf.bg.ac.rs/"],
        "include": r"prijemni|zadac|probni",
        "publisher": "Математический факультет Белградского университета",
        "publisherShort": "Матфак, Белград",
        "level": "fakultet",
        "subject": ("math", "Математика"),
    },
    {
        "id": "chem-bg",
        "pages": ["https://www.chem.bg.ac.rs/upis/zadaci.html"],
        "include": r"zadaci",
        "publisher": "Химический факультет Белградского университета",
        "publisherShort": "Химфак, Белград",
        "level": "fakultet",
        "subject": ("chemistry", "Химия"),
    },
    {
        "id": "ftn-uns",
        "pages": ["https://ftn.uns.ac.rs/zbirka-zadataka-i-literatura/"],
        "include": r"prijemni|test|zbirka",
        "publisher": "Факультет технических наук Университета Нови-Сада",
        "publisherShort": "ФТН, Нови-Сад",
        "level": "fakultet",
        "subject": ("math", "Математика"),
    },
    {
        "id": "pmf-uns-math",
        "pages": ["https://matematika.pmf.uns.ac.rs/upis/prijemni-ispit/"],
        "publisher": "Естественно-математический факультет Университета Нови-Сада",
        "publisherShort": "ПМФ, Нови-Сад",
        "level": "fakultet",
        "subject": ("math", "Математика"),
    },
    {
        "id": "agrif-pripremna",
        # Список этих пособий на страницах факультета не выводится — ссылки
        # раскиданы по разделам подготовительных курсов. Адреса взяты обходом
        # сайта и, как и все остальные, проверяются при сборке.
        "urls": [
            "https://agrif.bg.ac.rs/uploads/files/strane/UPIS/Pripremna_nastava/Biologija.pdf",
            "https://agrif.bg.ac.rs/uploads/files/strane/UPIS/Pripremna_nastava/Hemija.pdf",
            "https://agrif.bg.ac.rs/uploads/files/strane/UPIS/Pripremna_nastava/Fizika.pdf",
            "https://agrif.bg.ac.rs/uploads/files/strane/UPIS/Pripremna_nastava/Matematika.pdf",
            "https://agrif.bg.ac.rs/uploads/files/strane/UPIS/Pripremna_nastava/Sociologija.pdf",
            "https://www.agrif.bg.ac.rs/uploads/files/strane/Fakultet/Studije/Upis/Biologija.pdf",
            "https://www.agrif.bg.ac.rs/uploads/files/strane/Fakultet/Studije/Upis/Hemija.pdf",
            "https://www.agrif.bg.ac.rs/uploads/files/strane/Fakultet/Studije/Upis/Fizika.pdf",
            "https://www.agrif.bg.ac.rs/uploads/files/strane/Fakultet/Studije/Upis/Matematika.pdf",
            "https://www.agrif.bg.ac.rs/uploads/files/strane/Fakultet/Studije/Upis/Sociologija.pdf",
        ],
        "sourcePage": "https://agrif.bg.ac.rs/upis",
        "publisher": "Сельскохозяйственный факультет Белградского университета",
        "publisherShort": "Агрофак, Белград",
        "level": "fakultet",
        "defaultKind": ("book", "Пособие"),
    },
    {
        "id": "sf-bg",
        "urls": [
            "https://www.sf.bg.ac.rs/download/upisdoc/2025/Resenja_prijemnog_ispita_Fizika_2025.pdf",
            "https://www.sf.bg.ac.rs/download/upisdoc/2025/Resenja_probnog_prijemnog_2025_SF.pdf",
            "https://www.sf.bg.ac.rs/download/upisdoc/2025/g1resenja.pdf",
            "https://www.sf.bg.ac.rs/download/upisdoc/2025/g2resenja.pdf",
        ],
        "sourcePage": "https://www.sf.bg.ac.rs/",
        "publisher": "Транспортный факультет Белградского университета",
        "publisherShort": "Саобраћајни, Белград",
        "level": "fakultet",
        "subject": ("math", "Математика"),
    },
    {
        "id": "ff-bg",
        "pages": ["https://www.ff.bg.ac.rs/upis/prijemni-ispit"],
        # Рядом на странице лежат расписания экзаменов — их отсекает `fizika`.
        "include": r"fizika",
        "publisher": "Физический факультет Белградского университета",
        "publisherShort": "Физфак, Белград",
        "level": "fakultet",
        "subject": ("physics", "Физика"),
    },
    # --- Университет Нови-Сада -----------------------------------------------
    {
        "id": "tf-uns",
        "pages": ["https://www.tf.uns.ac.rs/upis"],
        "include": r"zadaci-prijemni",
        "publisher": "Технологический факультет Университета Нови-Сада",
        "publisherShort": "Технолошки, Нови-Сад",
        "level": "fakultet",
        # Файл называется просто «zadaci-prijemni.pdf», но открывается строкой
        # «NASTAVNI PROGRAM HEMIJA» — это сборник по химии на 69 страниц.
        "subject": ("chemistry", "Химия"),
        "defaultKind": ("book", "Сборник задач"),
    },
    # --- Университет Ниша ----------------------------------------------------
    {
        "id": "pmf-ni",
        # Страница приёма выводит документы скриптом, в разметке ссылок нет.
        # Адреса собраны обходом каталога загрузок и проверяются при сборке.
        "urls": [
            "https://www.pmf.ni.ac.rs/download/Biologija-jun-resenja.pdf",
            "https://www.pmf.ni.ac.rs/download/upis/upis_oas/Prijemni-test-2020-Biologija.pdf",
            "https://www.pmf.ni.ac.rs/download/upis/TEST-ZA-PRIJEMNI-ISPIT-BIOLOGIJA-2023-RESEN-TEST.pdf",
            "https://www.pmf.ni.ac.rs/download/upis_202122/resenja_jun_prijemni/Resenja_Prijemni_2021_jun_fizika.pdf",
            "https://www.pmf.ni.ac.rs/download/upis-2022-23/oas/resenja/resenja_prijemni_2022_jun_mat.pdf",
            "https://www.pmf.ni.ac.rs/download/upis-2022-23/oas/resenja/resenja_prijemni_2022_jun_inf.pdf",
            # Подборка тестов прошлых лет лежит на старом поддомене факультета.
            "https://www1.pmf.ni.ac.rs/pmf/vesti/biologija/biologija-primeri prijemnih.pdf",
        ],
        "sourcePage": "https://www.pmf.ni.ac.rs/",
        "publisher": "Естественно-математический факультет Университета Ниша",
        "publisherShort": "ПМФ, Ниш",
        "level": "fakultet",
    },
    {
        "id": "elfak-ni",
        "pages": ["https://www.elfak.ni.ac.rs/upis"],
        # На той же странице висят ранг-листы и бланки согласий; из всего
        # набора к подготовке относится один сборник, его и берём по имени.
        "include": r"zbirka",
        "publisher": "Электронный факультет Университета Ниша",
        "publisherShort": "Елфак, Ниш",
        "level": "fakultet",
        "subject": ("math", "Математика"),
        "defaultKind": ("book", "Сборник задач"),
    },
    {
        "id": "masfak-ni",
        "urls": [
            "https://www.masfak.ni.ac.rs/images/upload/Upis/Zbirka_prijemni_MF_NP.pdf",
        ],
        "sourcePage": "https://www.masfak.ni.ac.rs/",
        "publisher": "Машиностроительный факультет Университета Ниша",
        "publisherShort": "Машински, Ниш",
        "level": "fakultet",
        "subject": ("math", "Математика"),
        "defaultKind": ("book", "Сборник задач"),
    },
    # --- Университет Крагуеваца ----------------------------------------------
    # Института математики и информатики ЕМФ Крагуеваца здесь нет намеренно.
    # Его страница приёма (imi.pmf.kg.ac.rs/upis-studije/482-upis) перечисляет
    # десяток тестов и решений, но по прямому адресу вместо PDF отдаёт HTML
    # своей же оболочки — с любым User-Agent и с Referer. Проверка при сборке их
    # и отбрасывала; держать источник ради десяти заведомо мёртвых запросов на
    # каждой сборке смысла нет.
    {
        "id": "fizika-pmf-kg",
        "pages": ["https://fizika.pmf.kg.ac.rs/priprema-prijemnog-ispita.php"],
        "publisher": "Институт физики ЕМФ Университета Крагуеваца",
        "publisherShort": "Физика ПМФ, Крагуевац",
        "level": "fakultet",
        "subject": ("physics", "Физика"),
        # Материалы подготовительных занятий названы по темам («Термодинамика»),
        # без слова «сборник» в имени.
        "defaultKind": ("book", "Материалы подготовки"),
    },
    {
        "id": "ibe-pmf-kg",
        "pages": ["https://ibe.pmf.kg.ac.rs/upis.php"],
        "publisher": "Институт биологии и экологии ЕМФ Университета Крагуеваца",
        "publisherShort": "Биологија ПМФ, Крагуевац",
        "level": "fakultet",
        # Тесты названы одним годом: «2019.pdf».
        "subject": ("biology", "Биология"),
    },
    {
        "id": "medf-kg",
        "urls": [
            "https://www.medf.kg.ac.rs/informacije/brosura/Biologija.pdf",
            "https://www.medf.kg.ac.rs/informacije/brosura/Hemija.pdf",
            "https://www.medf.kg.ac.rs/informacije/brosura/Matematika.pdf",
        ],
        "sourcePage": "https://medf.kg.ac.rs/index.php?pismo=lat&vest=zbirke",
        "publisher": "Факультет медицинских наук Университета Крагуеваца",
        "publisherShort": "Медицински, Крагуевац",
        "level": "fakultet",
        "defaultKind": ("book", "Сборник задач"),
    },
    {
        "id": "znrfak-ni",
        "urls": [
            "https://www.znrfak.ni.ac.rs/upis/zbirka/Zbirka zadataka.pdf",
        ],
        "sourcePage": "https://www.znrfak.ni.ac.rs/upis/",
        "publisher": "Факультет охраны труда Университета Ниша",
        "publisherShort": "Заштита на раду, Ниш",
        "level": "fakultet",
        # «Збирка решених задатака са пријемних испита», 218 страниц. Вступительный
        # экзамен факультета — по математике, ей сборник и помечен.
        "subject": ("math", "Математика"),
        "defaultKind": ("book", "Сборник задач"),
    },
    {
        "id": "fin-kg",
        "urls": [
            "https://fin.kg.ac.rs/images/Studenti/2021/08/Primeri_zadataka_za_prijemni_ispit_20210831.pdf",
        ],
        "sourcePage": "https://fin.kg.ac.rs/",
        "publisher": "Факультет инженерных наук Университета Крагуеваца",
        "publisherShort": "ФИН, Крагуевац",
        "level": "fakultet",
        "subject": ("math", "Математика"),
    },
]

# Мусор, который лежит рядом с материалами на тех же страницах.
COMMON_EXCLUDE = re.compile(
    r"rang[-_]?list|rangl|prijavljeni|kandidat|konkurs|prijava|uplatnic|cenovnik"
    r"|statut|odluka|ugovor|izjava|raspored|obavest|uputstvo[-_]?online"
    r"|spisak|bodovi|akreditac|informator|resenje[-_]?o[-_]",
    re.IGNORECASE,
)

# Предмет распознаётся по имени файла. Порядок важен: более длинные и более
# специфичные образцы проверяются раньше, иначе «Madarski» поймается правилом
# для «Mat».
SUBJECTS: list[tuple[str, str, str]] = [
    (r"madj?arski|mad[ая]rski", "hungarian", "Венгерский язык"),
    (r"teorija[-_ ]?muzike|muzicko|muzicke", "music", "Теория музыки"),
    # «inf» без окончания встречается в именах вида «prijemni_2022_jun_inf.pdf».
    # Обязательно с разделителем: иначе правило поймает «informator».
    (r"informatika|racunarstvo|inf[-_]|_inf\b|inf\.pdf", "informatics", "Информатика"),
    (r"sociologija", "sociology", "Социология"),
    (r"matematika|\bmat\b|mat[-_]", "math", "Математика"),
    (r"srpski", "serbian", "Сербский язык"),
    (r"engleski", "english", "Английский язык"),
    (r"nemacki", "german", "Немецкий язык"),
    (r"francuski", "french", "Французский язык"),
    (r"italijanski", "italian", "Итальянский язык"),
    (r"ruski", "russian", "Русский язык"),
    (r"biologija", "biology", "Биология"),
    (r"hemija", "chemistry", "Химия"),
    (r"fizika", "physics", "Физика"),
    (r"geografija", "geography", "География"),
    (r"istorija", "history", "История"),
    (r"gradevinarstvo|gradjevinarstvo", "engineering", "Строительство"),
    (r"sklonosti", "aptitude", "Тест склонностей"),
    (r"avsu|scenske", "arts", "Сценические и аудиовизуальные искусства"),
    (r"umetnicka", "arts", "Художественные школы"),
]

# Направление приёма (только для школьного уровня).
TRACKS: list[tuple[str, str]] = [
    (r"filolo", "Филологическая гимназия"),
    (r"dvojezicn|bilingvaln|dj[-_]os", "Двуязычные отделения"),
    (r"\bibo\b|-ibo|_ibo", "Международный бакалавриат (IBO)"),
    (r"mat[-_ ]?gimnazija|mat-odeljenja", "Математическая гимназия"),
    (r"7[-_ ]?razred", "Седьмой класс"),
    (r"\bos\b|_os_", "Основная школа"),
]

# Вид документа: сам тест, ответы к нему, инструкция или пособие.
#
# Правила «на всякий случай» вроде `\.pdf$` здесь нет намеренно: оно ловило всё
# подряд и не оставляло места для `defaultKind` источника — материалы
# подготовительных занятий, названные по темам, уезжали в «Тесты».
DOC_KINDS: list[tuple[str, str, str]] = [
    (r"uputstvo|pregledanje", "guide", "Инструкция по проверке"),
    (r"kljuc|klju[cč]", "key", "Ключ с ответами"),
    (r"resenj|re[sš]enj", "key", "Решения"),
    (r"zbirka|pripremn|prirucnik|skripta|primeri[-_ ]?zadataka", "book", "Сборник задач"),
    (r"test|prijemni|klasifikacioni|zadaci|zadatak", "test", "Тест"),
]

KIND_ORDER = {"test": 0, "key": 1, "book": 2, "guide": 3}


def fetch(url: str, limit: int = 2_000_000, timeout: float = 40.0) -> tuple[str, str]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout, context=_TLS) as response:
        return response.geturl(), response.read(limit).decode("utf-8", errors="replace")


def normalize_url(url: str) -> str:
    """Приводит адрес к виду, который примут и HTTP-клиент, и браузер.

    Часть сайтов (Крагуевац) даёт ссылки с пробелами прямо в пути:
    ``…/prijemni 2023 - informatika resenja.pdf``. Браузер такое чинит сам, а
    ``http.client`` отвергает запрос целиком — «URL can't contain control
    characters», и на этом останавливалась вся сборка каталога.

    Процент в списке разрешённых нужен, чтобы уже закодированные адреса не
    закодировались повторно: ``%20`` иначе превратился бы в ``%2520``.
    """
    return urllib.parse.quote(url.strip(), safe=":/?&=%#+,;@$!*'()~")


def collect_links(page_url: str) -> list[str]:
    """Достаёт со страницы все ссылки на PDF, приводя их к абсолютному https."""
    final_url, html = fetch(page_url)
    links = re.findall(r'href=["\']([^"\']+\.pdf)["\']', html, flags=re.IGNORECASE)

    absolute = []
    for link in links:
        full = urllib.parse.urljoin(final_url, link.strip())
        # Часть ссылок на сайтах записана через http:// — переводим на https,
        # иначе браузер заблокирует смешанное содержимое.
        absolute.append(normalize_url(re.sub(r"^http://", "https://", full)))
    return sorted(set(absolute))


def match_first(rules, text, default=None):
    for pattern, *value in rules:
        if re.search(pattern, text):
            return tuple(value) if len(value) > 1 else value[0]
    return default


def classify(url: str, source: dict) -> dict | None:
    """Разбирает имя файла в описание документа."""
    name = urllib.parse.unquote(url.rsplit("/", 1)[-1])
    plain = name.replace("%9a", "š").lower()

    if COMMON_EXCLUDE.search(plain):
        return None
    include = source.get("include")
    if include and not re.search(include, urllib.parse.unquote(url), re.IGNORECASE):
        return None

    subject = (
        source.get("subject")
        or match_first(SUBJECTS, plain)
        or source.get("defaultSubject")
    )
    if subject is None:
        return None

    year = year_of(plain, source)
    # Для школьного уровня год обязателен: там весь смысл в том, за какой год
    # тест. У факультетских пособий года может не быть вовсе.
    if year is None and source["level"] == "gimnazija":
        return None

    kind = match_first(DOC_KINDS, plain) or source.get("defaultKind") or ("test", "Тест")

    track = match_first(TRACKS, plain) if source["level"] == "gimnazija" else None

    return {
        "id": hashlib.sha1(url.encode("utf-8")).hexdigest()[:12],
        "subjectId": subject[0],
        "subject": subject[1],
        "year": year,
        "track": track,
        "kindId": kind[0],
        "kind": kind[1],
        "level": source["level"],
        "levelTitle": LEVELS[source["level"]],
        "file": name,
        "url": url,
    }


def year_of(plain: str, source: dict) -> int | None:
    """Достаёт год: «2016Jun.pdf», «prijemni2016.pdf», «zadaci-2016-6.pdf»."""
    full = re.search(r"(19[89]\d|20[0-4]\d)", plain)
    if full:
        return int(full.group(1))
    # ФТН сокращает год до двух цифр: «Prijemni25.pdf».
    short = re.search(r"prijemni(\d{2})\b", plain)
    if short:
        return 2000 + int(short.group(1))
    return None


def verify(item: dict) -> dict | None:
    """Проверяет, что документ действительно отдаётся."""
    try:
        request = urllib.request.Request(
            item["url"], headers={"User-Agent": USER_AGENT}
        )
        with urllib.request.urlopen(request, timeout=45, context=_TLS) as response:
            if response.status != 200:
                return None
            content_type = (response.headers.get("Content-Type") or "").lower()
            # Читаем только начало: нам нужны сигнатура и размер, а не сам файл.
            head = response.read(1024)
            length = response.headers.get("Content-Length")

        if not head.startswith(b"%PDF-") and "pdf" not in content_type:
            return None

        item["bytes"] = int(length) if length and length.isdigit() else 0
        return item
    except (
        urllib.error.URLError,
        # InvalidURL наследуется от HTTPException, а не от ValueError, и раньше
        # один кривой адрес ронял сборку целиком вместо того, чтобы выпасть из
        # каталога наравне с прочими мёртвыми ссылками.
        http.client.HTTPException,
        TimeoutError,
        OSError,
        ValueError,
    ):
        return None


def title_for(item: dict) -> str:
    parts = [item["subject"]]
    if item["track"]:
        parts.append(item["track"])
    if item["level"] == "fakultet":
        parts.append(item["publisherShort"])
    if item["year"]:
        parts.append(str(item["year"]))
    return " · ".join(parts)


def gather(source: dict) -> list[dict]:
    """Собирает и размечает документы одного источника."""
    links: list[str] = [normalize_url(url) for url in source.get("urls", [])]
    for page in source.get("pages", []):
        try:
            found = collect_links(page)
        except Exception as error:  # noqa: BLE001 — сеть, причина в сообщении
            print(f"  не удалось прочитать {page}: {error}", file=sys.stderr)
            continue
        print(f"  {page}: ссылок на PDF {len(found)}")
        links.extend(found)

    parsed = [item for item in (classify(link, source) for link in set(links)) if item]
    for item in parsed:
        item["sourceId"] = source["id"]
        item["publisher"] = source["publisher"]
        item["publisherShort"] = source["publisherShort"]
        item["sourcePage"] = source.get("sourcePage") or source.get("pages", [""])[0]
    print(f"  распознано: {len(parsed)}")
    return parsed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quick", action="store_true", help="не проверять ссылки")
    parser.add_argument("--workers", type=int, default=8, help="одновременных проверок")
    args = parser.parse_args()

    documents: list[dict] = []
    for source in SOURCES:
        print(f"\nИсточник: {source['publisher']}")
        documents.extend(gather(source))

    # Один и тот же файл встречается под http и https или на двух зеркалах.
    unique: dict[str, dict] = {}
    for item in documents:
        key = urllib.parse.unquote(item["url"]).lower().replace("https://www.", "https://")
        unique.setdefault(key, item)
    if len(unique) != len(documents):
        print(f"\nПовторов убрано: {len(documents) - len(unique)}")
    documents = list(unique.values())

    if not args.quick:
        print(f"\nПроверяем {len(documents)} ссылок…")
        alive: list[dict] = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            for index, result in enumerate(pool.map(verify, documents), start=1):
                if result:
                    alive.append(result)
                if index % 50 == 0:
                    print(f"  {index}/{len(documents)}, живых {len(alive)}", flush=True)
        print(f"  живых ссылок: {len(alive)} из {len(documents)}")

        # Один и тот же файл нередко лежит у факультета по двум путям сразу —
        # старому и новому. По имени и размеру это видно, а до проверки размера
        # ещё нет, поэтому повтор убирается здесь.
        deduped: dict[tuple, dict] = {}
        for item in alive:
            deduped.setdefault((item["publisher"], item["file"], item["bytes"]), item)
        if len(deduped) != len(alive):
            print(f"  одинаковых файлов убрано: {len(alive) - len(deduped)}")
        documents = list(deduped.values())
    else:
        for item in documents:
            item.setdefault("bytes", 0)

    for item in documents:
        item["title"] = title_for(item)
    # Свежие материалы полезнее старых, поэтому год по убыванию.
    documents.sort(
        key=lambda item: (
            item["level"] != "gimnazija",
            item["subject"],
            -(item["year"] or 0),
            KIND_ORDER.get(item["kindId"], 9),
            item["file"],
        )
    )

    catalog = {
        "generatedAt": None,  # намеренно без времени: сборка должна быть детерминированной
        "levels": [
            {
                "id": level,
                "title": title,
                "count": sum(1 for d in documents if d["level"] == level),
            }
            for level, title in LEVELS.items()
        ],
        "subjects": summarize(documents, "subjectId", "subject"),
        "sources": [
            {
                "id": source_id,
                "publisher": publisher,
                "publisherShort": short,
                "page": page,
                "count": sum(1 for d in documents if d["sourceId"] == source_id),
            }
            for source_id, publisher, short, page in sorted(
                {
                    (d["sourceId"], d["publisher"], d["publisherShort"], d["sourcePage"])
                    for d in documents
                }
            )
        ],
        "documents": documents,
    }

    payload = json.dumps(catalog, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    for path in OUT_PATHS:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with io.open(path, "w", encoding="utf-8") as handle:
            handle.write(payload)
        print(f"\nЗаписано: {path}")

    print(f"\n  предметов: {len(catalog['subjects'])}, документов: {len(documents)}")
    for entry in catalog["subjects"]:
        span = f"{entry['yearFrom']}–{entry['yearTo']}" if entry["yearFrom"] else "—"
        print(f"    {entry['title']:<42} {entry['count']:>4}  {span}")
    print()
    for entry in catalog["sources"]:
        print(f"    {entry['publisherShort']:<24} {entry['count']:>4}")
    return 0


def summarize(documents: list[dict], id_key: str, title_key: str) -> list[dict]:
    groups: dict[str, dict] = {}
    for item in documents:
        entry = groups.setdefault(
            item[id_key],
            {"id": item[id_key], "title": item[title_key], "count": 0, "years": set()},
        )
        entry["count"] += 1
        if item["year"]:
            entry["years"].add(item["year"])
    return [
        {
            "id": entry["id"],
            "title": entry["title"],
            "count": entry["count"],
            "yearFrom": min(entry["years"]) if entry["years"] else None,
            "yearTo": max(entry["years"]) if entry["years"] else None,
        }
        for entry in sorted(groups.values(), key=lambda e: -e["count"])
    ]


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
