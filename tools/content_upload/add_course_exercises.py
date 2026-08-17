"""Добавление упражнений в курс и Тренажёрку.

Тренажёрка не хранит своих упражнений: она берёт их из курса по `skillId`
(`tools/build_trainer_catalog.py`). Поэтому «залить упражнение в тренажёрку» —
это дописать его в урок нужного навыка в `course_content/units/*.json`.

Отсюда следует главное отличие от авторских уроков: этот путь идёт **через
репозиторий**, а не через API. Упражнение появится у людей только после
пересборки bundle и выкатки сайта с приложением.

    # добавить и проверить
    python tools/content_upload/add_course_exercises.py new_exercises.json

    # посмотреть, что изменится, не трогая файлы
    python tools/content_upload/add_course_exercises.py new_exercises.json --dry-run

Формат входного файла — список упражнений, каждое с адресом, куда его класть:

    [
      {
        "unitId": "u_glagoli",
        "skillId": "sk_prezent",
        "lessonId": "l_prezent_2",
        "type": "multiple_choice",
        "prompt": "...",
        "options": [{"id": "o1", "text": "...", "correct": true}, ...],
        "explanation": "..."
      }
    ]

`id`, `difficulty`, `serbianScript` и `sourceRef` подставит нормализатор
`tools/course_build`, если их не указать, — писать их руками не нужно.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from course_insert import InsertError, insert_exercise  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
UNITS = ROOT / "course_content" / "units"
BUILD = ROOT / "tools" / "course_build"
BUNDLE = ROOT / "frontend" / "assets" / "course" / "course_bundle.json"


def load_unit(unit_id: str) -> tuple[Path, str, dict]:
    """Текст файла и разобранная структура.

    Текст нужен целиком: упражнение дописывается в него точечно, чтобы правка
    не превратилась в переформатирование всего раздела.
    """
    path = UNITS / f"{unit_id}.json"
    if not path.exists():
        raise SystemExit(f"ОШИБКА: нет раздела {unit_id} ({path})")
    raw = path.read_text(encoding="utf-8")
    return path, raw, json.loads(raw)


def place(unit: dict, skill_id: str, lesson_id: str) -> list:
    """Находит список упражнений урока. Ошибается вслух: молча создать урок
    нельзя — у него должны быть название, цели и место в цепочке."""
    for skill in unit.get("skills", []):
        if skill.get("id") != skill_id:
            continue
        for lesson in skill.get("lessons", []):
            if lesson.get("id") == lesson_id:
                return lesson.setdefault("exercises", [])
        known = ", ".join(l.get("id", "?") for l in skill.get("lessons", []))
        raise SystemExit(
            f"ОШИБКА: в навыке {skill_id} нет урока {lesson_id}. Есть: {known}"
        )
    known = ", ".join(s.get("id", "?") for s in unit.get("skills", []))
    raise SystemExit(f"ОШИБКА: в разделе нет навыка {skill_id}. Есть: {known}")


def existing_ids(unit: dict) -> set[str]:
    ids = set()
    for skill in unit.get("skills", []):
        for lesson in skill.get("lessons", []):
            for exercise in lesson.get("exercises", []) or []:
                if exercise.get("id"):
                    ids.add(exercise["id"])
    return ids


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Добавить упражнения в курс")
    parser.add_argument("file", help="JSON со списком упражнений")
    parser.add_argument("--dry-run", action="store_true",
                        help="показать, что изменится, и не писать файлы")
    parser.add_argument("--skip-build", action="store_true",
                        help="не пересобирать bundle (валидатор всё равно запустится)")
    args = parser.parse_args(argv)

    try:
        items = json.loads(Path(args.file).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"ОШИБКА: не удалось прочитать {args.file}: {error}")
        return 1
    if not isinstance(items, list) or not items:
        print("ОШИБКА: ожидался непустой список упражнений")
        return 1

    touched: dict[str, list] = {}
    added = 0
    for index, exercise in enumerate(items, 1):
        for field in ("unitId", "skillId", "lessonId", "type"):
            if not exercise.get(field):
                print(f"ОШИБКА: упражнение {index}: нет поля {field}")
                return 1
        unit_id = exercise["unitId"]
        if unit_id not in touched:
            touched[unit_id] = list(load_unit(unit_id))
        path, raw, unit = touched[unit_id]
        if exercise.get("id") and exercise["id"] in existing_ids(unit):
            print(f"ОШИБКА: упражнение {index}: id «{exercise['id']}» уже есть в {unit_id}")
            return 1
        lesson_id = exercise["lessonId"]
        exercises = place(unit, exercise["skillId"], lesson_id)
        try:
            raw = insert_exercise(raw, lesson_id, exercises, exercise)
        except InsertError as error:
            print(f"ОШИБКА: упражнение {index}: {error}")
            return 1
        # Структура и текст идут в ногу: следующее упражнение того же урока
        # ищет уже обновлённый список.
        exercises.append(exercise)
        touched[unit_id][1] = raw
        added += 1
        print(f"+ {unit_id} / {exercise['skillId']} / {lesson_id}: {exercise['type']}")

    if args.dry_run:
        print(f"\nГотово к записи: {added} упражнений в {len(touched)} разделах (--dry-run).")
        return 0

    for path, raw, _ in touched.values():
        path.write_text(raw, encoding="utf-8")
    print(f"\nЗаписано {added} упражнений в {len(touched)} разделах.")

    command = ["go", "run", "."] if args.skip_build else ["go", "run", ".", "-out", str(BUNDLE)]
    print(f"Проверка: {' '.join(command)} (в {BUILD})")
    result = subprocess.run(command, cwd=BUILD)
    if result.returncode != 0:
        print("\nВалидатор не пропустил контент. Правьте JSON и запускайте снова.")
        return result.returncode
    print("\nВалидатор доволен. Не забудьте про сборку каталога Тренажёрки:")
    print("    python tools/build_trainer_catalog.py")
    print("Упражнение попадёт к людям только после выкатки сайта и приложения.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
