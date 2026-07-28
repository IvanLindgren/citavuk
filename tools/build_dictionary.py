#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Наполняет таблицу ``dictionary`` в lexicon.db переводами всех лемм.

Зачем это нужно
---------------
Скачиваемый словарь содержал 54 слова, поэтому оффлайн-перевод почти не работал.
Замер на постороннем сербском тексте (статьи сербской Википедии, к корпусу UD
отношения не имеющие):

    покрытие лексиконом      73.3 % словоупотреблений
    перевод оффлайн до       24.8 %
    перевод оффлайн после    73.3 %

Остаток в 27 % — слова за пределами корпуса UD_Serbian-SET, на котором построен
лексикон. Их не добавить, не поменяв сам лексикон.

Почему не DeepL
---------------
Основной провайдер перевода в приложении — DeepL, и на связном тексте он лучше.
Но на отдельных словах он разваливается, что и проверялось на живом API:

    "Ovo je velika kuća sa baštom." -> "Это большой дом с садом."   верно
    "kuća"                          -> "собака"                     неверно
    "кућа"                          -> "«Адвокат дьявола»"          неверно

Словарь состоит ровно из отдельных слов, поэтому здесь используется провайдер,
который на них ведёт себя предсказуемо, — тот же, которым уже пользуется
приложение. Разделение зафиксировано и на сервере: server/internal/translate.

Запуск::

    python tools/build_dictionary.py --dry-run     # посмотреть объём работы
    python tools/build_dictionary.py               # собрать словарь
    python tools/build_dictionary.py --force       # перевести заново всё

После сборки обязательно поднять ``_version`` в
frontend/lib/services/lexicon_db.dart, иначе установленные приложения продолжат
пользоваться старой копией базы (инвариант 10 из PROJECT_AGENT_GUIDE).
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_DB = os.path.join(ROOT, "lexicon.db")
CLIENT_DB = os.path.join(ROOT, "frontend", "assets", "lexicon.db")

ENDPOINT = "https://translate.googleapis.com/translate_a/single"
PROVIDER = "google-batch"

# Размер пачки. Слова отправляются одной строкой на слово, и ответ обязан
# содержать ровно столько же строк. Чем больше пачка, тем выше шанс, что
# переводчик склеит или разорвёт строку, поэтому 40 — компромисс между
# количеством запросов и устойчивостью выравнивания.
BATCH = 40

# Части речи, для которых перевод отдельного слова осмыслен. Междометия,
# знаки препинания и служебные метки корпуса пропускаются.
USEFUL_POS = {
    "NOUN", "VERB", "ADJ", "ADV", "PRON", "DET", "NUM",
    "ADP", "CCONJ", "SCONJ", "PART", "PROPN", "INTJ",
}


@dataclass
class Stats:
    """Счётчики прогона — печатаются в конце и служат отчётом о сборке."""

    total: int = 0
    translated: int = 0
    skipped: int = 0
    failed: int = 0
    batches: int = 0
    realigned: int = 0
    failures: list[str] = field(default_factory=list)


def fetch_batch(words: list[str], timeout: float = 30.0) -> list[str] | None:
    """Переводит пачку слов одним запросом.

    Возвращает ``None``, если ответ не разобрался или число строк не совпало с
    числом слов. Несовпадение — не мелочь: при сдвиге на одну строку каждое
    слово получило бы перевод соседнего, и словарь молча начал бы учить неверным
    значениям. Такую пачку вызывающий код переводит по одному слову.
    """
    query = "\n".join(words)
    url = "{}?{}".format(
        ENDPOINT,
        urllib.parse.urlencode(
            {"client": "gtx", "sl": "sr", "tl": "ru", "dt": "t", "q": query}
        ),
    )
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, ValueError, TimeoutError, OSError):
        return None

    if not isinstance(payload, list) or not payload or not isinstance(payload[0], list):
        return None

    joined = "".join(seg[0] for seg in payload[0] if seg and seg[0])
    lines = [line.strip() for line in joined.split("\n")]
    if len(lines) != len(words):
        return None
    return lines


def fetch_one(word: str) -> str | None:
    """Переводит одно слово. Запасной путь для пачек с нарушенным выравниванием."""
    result = fetch_batch([word])
    if not result:
        return None
    value = result[0].strip()
    return value or None


def load_lemmas(db_path: str, include_propn: bool) -> list[tuple[str, str]]:
    """Возвращает пары (лемма, часть речи) из лексикона."""
    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute(
            """
            SELECT lemma, upos, count(*) AS n
              FROM lexicon
             WHERE lemma <> ''
             GROUP BY lemma, upos
             ORDER BY n DESC, lemma
            """
        ).fetchall()
    finally:
        conn.close()

    seen: dict[str, str] = {}
    for lemma, upos, _ in rows:
        if upos not in USEFUL_POS:
            continue
        if upos == "PROPN" and not include_propn:
            continue
        # Лемма может встречаться с разными частями речи. Берётся самая частая:
        # запрос идёт по слову, а не по паре «слово + часть речи».
        seen.setdefault(lemma, upos)
    return sorted(seen.items())


def existing_words(db_path: str) -> set[str]:
    conn = sqlite3.connect(db_path)
    try:
        return {row[0] for row in conn.execute("SELECT word FROM dictionary")}
    finally:
        conn.close()


def ensure_schema(conn: sqlite3.Connection) -> None:
    """Создаёт таблицы, если их нет, и добавляет колонки происхождения.

    Происхождение обязательно: перевод машинный, и это должно быть видно —
    и преподавателю, и коду, который однажды захочет отличить проверенную
    статью от автоматической.
    """
    conn.execute(
        "CREATE TABLE IF NOT EXISTS dictionary ("
        "word TEXT NOT NULL UNIQUE, translation TEXT NOT NULL)"
    )
    columns = {row[1] for row in conn.execute("PRAGMA table_info(dictionary)")}
    if "pos" not in columns:
        conn.execute("ALTER TABLE dictionary ADD COLUMN pos TEXT NOT NULL DEFAULT ''")
    if "source" not in columns:
        conn.execute("ALTER TABLE dictionary ADD COLUMN source TEXT NOT NULL DEFAULT ''")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS dictionary_meta ("
        "key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    )


def save(db_path: str, entries: list[tuple[str, str, str]]) -> None:
    """Записывает переводы. Существующие статьи обновляются."""
    conn = sqlite3.connect(db_path)
    try:
        ensure_schema(conn)
        conn.executemany(
            "INSERT INTO dictionary (word, translation, pos, source) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(word) DO UPDATE SET "
            "translation = excluded.translation, pos = excluded.pos, source = excluded.source",
            [(w, t, p, PROVIDER) for w, t, p in entries],
        )
        conn.commit()
    finally:
        conn.close()


def write_meta(db_path: str, stats: Stats) -> None:
    conn = sqlite3.connect(db_path)
    try:
        ensure_schema(conn)
        total = conn.execute("SELECT count(*) FROM dictionary").fetchone()[0]
        meta = {
            "built_at": time.strftime("%Y-%m-%d"),
            "provider": PROVIDER,
            "entries": str(total),
            "note": "машинный перевод отдельных лемм; требует выборочной проверки",
        }
        conn.executemany(
            "INSERT INTO dictionary_meta (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            list(meta.items()),
        )
        conn.commit()
    finally:
        conn.close()


def is_suspicious(word: str, translation: str) -> bool:
    """Отбраковывает заведомо бесполезные переводы.

    Совпадение с исходным словом означает, что переводчик его не узнал и вернул
    как есть. Для имён собственных это нормально, для остальных — мусор, который
    лучше не класть в словарь: пустая статья честнее неверной.
    """
    if not translation:
        return True
    if translation.lower() == word.lower():
        return True
    # Ответ заметно длиннее слова — обычно это развёрнутая фраза, а не статья.
    if len(translation) > max(60, len(word) * 6):
        return True
    return False


def build(args: argparse.Namespace) -> Stats:
    stats = Stats()
    lemmas = load_lemmas(args.db, include_propn=args.propn)
    stats.total = len(lemmas)

    known: set[str] = set() if args.force else existing_words(args.db)
    todo = [(w, p) for w, p in lemmas if w not in known]
    stats.skipped = stats.total - len(todo)

    print(f"лемм в лексиконе: {stats.total}")
    print(f"уже переведено:   {stats.skipped}")
    print(f"к переводу:       {len(todo)}")
    if args.limit:
        todo = todo[: args.limit]
        print(f"ограничение:      {len(todo)}")
    if args.dry_run:
        return stats

    pending: list[tuple[str, str, str]] = []
    for start in range(0, len(todo), BATCH):
        chunk = todo[start : start + BATCH]
        words = [w for w, _ in chunk]
        stats.batches += 1

        translations = fetch_batch(words)
        if translations is None:
            # Выравнивание нарушено или запрос не удался: переводим по одному,
            # чтобы не приписать словам чужие значения.
            stats.realigned += 1
            translations = []
            for word in words:
                translations.append(fetch_one(word) or "")
                time.sleep(0.15)

        for (word, pos), translation in zip(chunk, translations):
            translation = translation.strip()
            if is_suspicious(word, translation):
                stats.failed += 1
                if len(stats.failures) < 40:
                    stats.failures.append(f"{word} ({pos}) -> {translation!r}")
                continue
            pending.append((word, translation, pos))
            stats.translated += 1

        if len(pending) >= 200:
            save(args.db, pending)
            pending.clear()

        done = min(start + BATCH, len(todo))
        print(
            f"  {done}/{len(todo)} — переведено {stats.translated}, "
            f"отброшено {stats.failed}",
            flush=True,
        )
        # Пауза со случайной добавкой: ровный поток запросов к публичному
        # эндпоинту распознаётся как автоматический быстрее неровного.
        time.sleep(args.delay + random.uniform(0, args.delay))

    if pending:
        save(args.db, pending)
    write_meta(args.db, stats)
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default=SERVER_DB, help="путь к lexicon.db")
    parser.add_argument("--force", action="store_true", help="перевести заново уже готовые статьи")
    parser.add_argument("--dry-run", action="store_true", help="только показать объём работы")
    parser.add_argument("--limit", type=int, default=0, help="перевести не больше N лемм")
    parser.add_argument("--delay", type=float, default=0.4, help="пауза между пачками, секунды")
    parser.add_argument("--propn", action="store_true", help="включить имена собственные")
    args = parser.parse_args()

    if not os.path.exists(args.db):
        print(f"не найден {args.db}", file=sys.stderr)
        return 1

    started = time.time()
    stats = build(args)

    print()
    print(f"пачек запрошено:      {stats.batches}")
    print(f"пачек по одному слову: {stats.realigned}")
    print(f"переведено:           {stats.translated}")
    print(f"отброшено:            {stats.failed}")
    print(f"время:                {time.time() - started:.0f} с")
    if stats.failures:
        print("\nпримеры отброшенных (перевод совпал с оригиналом или слишком длинный):")
        for line in stats.failures[:20]:
            print(f"  {line}")
    if not args.dry_run:
        print(f"\nсловарь записан в {args.db}")
        print("не забудь скопировать в frontend/assets/lexicon.db и поднять _version")
    return 0


if __name__ == "__main__":
    sys.exit(main())
