"""Заливка авторского урока (теория, упражнения, диалог) на боевой сервер.

Урок публикуется от имени владельца аккаунта из `.env`. Порядок такой:

    проверка файла → создание или обновление урока → публикация

Публикация не происходит, если проверка нашла хоть одну ошибку: сервер и сам
отвергнет такой урок, но лучше не занимать очередь модерации заведомо битым
материалом. Замечания (`warning`) публикацию не останавливают — их видно в
выводе, и решение за автором.

    # проверить, ничего не отправляя
    python tools/content_upload/upload_lesson.py lesson.json --dry-run

    # выложить по ссылке (виден только тем, кому дали ссылку)
    python tools/content_upload/upload_lesson.py lesson.json --publish unlisted

    # выложить в общий каталог; владелец сам себе модератор, поэтому
    # --approve сразу проводит версию через очередь
    python tools/content_upload/upload_lesson.py lesson.json --publish public --approve

Повторный запуск с тем же `slug` (или с `--lesson-id`) обновляет урок, а не
создаёт второй: у ИИ-агента должна быть возможность исправить опечатку, не
плодя дублей в каталоге.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from citavuk_client import ApiError, Citavuk  # noqa: E402
from validate_lesson import check_lesson  # noqa: E402

# Поля, которые сервер ждёт в теле запроса. Всё остальное из файла (заметки
# автора, черновые пометки) на сервер не уходит.
LESSON_FIELDS = ("title", "summary", "coverUrl", "level", "lessonType", "topic",
                 "tags", "estimatedMinutes", "script", "content")


def payload(lesson: dict) -> dict:
    return {name: lesson[name] for name in LESSON_FIELDS if name in lesson}


def find_existing(client: Citavuk, lesson: dict, lesson_id: str | None) -> dict | None:
    """Ищем урок, который уже заливали: по id, затем по названию, затем по slug.

    Название важнее slug, потому что адрес урока придумывает сервер: он берёт
    название и дописывает восемь случайных знаков («Глагол biti» →
    `glagol-biti-v-nasto-em-vremeni-5bde835c`). Слепое сравнение с локальным
    slug поэтому не совпадало никогда, и каждый повторный запуск делал новый
    урок — в каталоге успело осесть три «Аккузатива» и два «Глагола biti».

    Совпадений может оказаться несколько (те самые дубли). Берём самый ранний:
    так повторные запуски сходятся к одному уроку, а не гуляют между ними.
    """
    if lesson_id:
        return {"id": lesson_id}
    slug = (lesson.get("slug") or "").strip()
    title = (lesson.get("title") or "").strip().casefold()

    matches = []
    for item in client.own_lessons():
        item_slug = (item.get("slug") or "").strip()
        if title and (item.get("title") or "").strip().casefold() == title:
            matches.append(item)
        elif slug and (item_slug == slug or item_slug.startswith(slug + "-")):
            matches.append(item)

    if not matches:
        return None
    matches.sort(key=lambda item: item.get("createdAt") or item.get("updatedAt") or "")
    if len(matches) > 1:
        print(f"замечание: уроков с названием «{lesson.get('title')}» уже "
              f"{len(matches)}; обновляю самый ранний, остальные — дубли:")
        for item in matches[1:]:
            print(f"    {item.get('slug') or item.get('id')}")
    return matches[0]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Заливка авторского урока Читавука")
    parser.add_argument("file", help="JSON урока")
    parser.add_argument("--publish", choices=("none", "unlisted", "public"),
                        default="none", help="что сделать после сохранения")
    parser.add_argument("--approve", action="store_true",
                        help="сразу одобрить версию (нужна роль администратора)")
    parser.add_argument("--lesson-id", help="обновить именно этот урок")
    parser.add_argument("--dry-run", action="store_true",
                        help="только проверить файл, ничего не отправляя")
    parser.add_argument("--api", help="адрес сервера, по умолчанию боевой")
    args = parser.parse_args(argv)

    path = Path(args.file)
    try:
        lesson = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"ОШИБКА: не удалось прочитать {path}: {error}")
        return 1

    report = check_lesson(lesson)
    print(report.text())
    if not report.ok:
        print("\nУрок не отправлен: сначала исправьте ошибки.")
        return 1
    if args.dry_run:
        print("\nПроверка пройдена. Отправка отключена (--dry-run).")
        return 0

    client = Citavuk(base_url=args.api)
    try:
        client.login()
        existing = find_existing(client, lesson, args.lesson_id)
        if existing:
            saved = client.update_lesson(existing["id"], payload(lesson))
            print(f"\nОбновлён урок {saved.get('slug') or saved['id']}")
        else:
            saved = client.create_lesson(payload(lesson))
            print(f"\nСоздан урок {saved.get('slug') or saved['id']}")

        revision = saved.get("revisionId")
        if args.publish == "none":
            print("Черновик сохранён. Публикация не запрашивалась.")
            return 0
        if not revision:
            print("ОШИБКА: сервер не вернул версию урока, публиковать нечего.")
            return 1

        if args.publish == "unlisted":
            client.publish_unlisted(saved["id"], revision)
            token = saved.get("shareToken")
            print("Опубликовано по ссылке" + (f": /lesson/link/{token}" if token else ""))
            return 0

        client.submit_public(saved["id"], revision)
        print("Отправлено на модерацию")
        if args.approve:
            client.review_revision(revision, approve=True,
                                   comment="Опубликовано скриптом заливки")
            print(f"Одобрено и опубликовано: /lessons/{saved.get('slug')}")
        return 0
    except (ApiError, RuntimeError) as error:
        print(f"\nОШИБКА: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
