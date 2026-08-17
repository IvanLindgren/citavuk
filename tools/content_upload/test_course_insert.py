"""Проверки точечной вставки упражнения в файл курса.

Главное требование к ней — не трогать ничего, кроме одного массива. Правка,
переписывающая раздел целиком, формально верна, но проверить её глазами нельзя,
а именно это и придётся делать перед выкаткой.
"""

import json
import sys
import unittest
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from course_insert import InsertError, insert_exercise  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
UNIT = ROOT / "course_content" / "units" / "u_glagoli.json"

COMPACT = """{
  "id": "u_test",
  "skills": [
    {
      "id": "sk_a",
      "lessons": [
        {
          "id": "l_01",
          "exercises": [
            {"type": "multiple_choice", "prompt": "Первое"},
            {"type": "fill_blank", "prompt": "Второе"}
          ]
        },
        {
          "id": "l_02",
          "exercises": []
        }
      ]
    }
  ]
}
"""


def exercises_of(text: str, lesson_id: str) -> list:
    unit = json.loads(text)
    for skill in unit["skills"]:
        for lesson in skill["lessons"]:
            if lesson["id"] == lesson_id:
                return lesson["exercises"]
    raise AssertionError(lesson_id)


class InsertTests(unittest.TestCase):
    def test_appends_to_existing_list(self):
        new = {"type": "matching", "prompt": "Третье"}
        result = insert_exercise(COMPACT, "l_01", exercises_of(COMPACT, "l_01"), new)

        self.assertEqual(len(exercises_of(result, "l_01")), 3)
        self.assertEqual(exercises_of(result, "l_01")[-1], new)
        # Соседний урок не задет.
        self.assertEqual(exercises_of(result, "l_02"), [])

    def test_keeps_one_line_style_of_neighbours(self):
        new = {"type": "matching", "prompt": "Третье"}
        result = insert_exercise(COMPACT, "l_01", exercises_of(COMPACT, "l_01"), new)

        added = [line for line in result.splitlines() if "Третье" in line]
        self.assertEqual(len(added), 1, "упражнение должно занять ровно одну строку")

    def test_fills_empty_list(self):
        new = {"type": "matching", "prompt": "Единственное"}
        result = insert_exercise(COMPACT, "l_02", [], new)

        self.assertEqual(exercises_of(result, "l_02"), [new])
        self.assertEqual(len(exercises_of(result, "l_01")), 2)

    def test_unknown_lesson_is_reported(self):
        with self.assertRaises(InsertError):
            insert_exercise(COMPACT, "l_99", [], {"type": "matching"})

    def test_real_unit_file_changes_by_one_line(self):
        """На настоящем файле курса: остальное содержимое байт в байт то же."""
        raw = UNIT.read_text(encoding="utf-8")
        before = exercises_of(raw, "l_06")
        new = {"type": "multiple_choice", "prompt": "Проверочное"}

        result = insert_exercise(raw, "l_06", before, new)

        self.assertEqual(len(exercises_of(result, "l_06")), len(before) + 1)
        old_lines = Counter(raw.splitlines())
        new_lines = Counter(result.splitlines())
        self.assertEqual(sum(new_lines.values()), sum(old_lines.values()) + 1)
        # Сравнение по индексу здесь не годится: после вставки всё съезжает на
        # строку. Считаем, какие строки исчезли и какие появились.
        removed = list((old_lines - new_lines).elements())
        added = list((new_lines - old_lines).elements())
        self.assertEqual(len(removed), 1, f"пропало лишнее: {removed}")
        # Прежняя последняя строка массива вернулась с запятой, плюс само
        # упражнение.
        self.assertEqual(len(added), 2, f"добавилось лишнее: {added}")
        self.assertEqual(added[0].rstrip(","), removed[0].rstrip(","))
        self.assertIn("Проверочное", added[1])


if __name__ == "__main__":
    unittest.main()
