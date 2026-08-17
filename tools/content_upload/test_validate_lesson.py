"""Проверки валидатора уроков.

Стерегут ровно те ошибки, из-за которых урок выглядит целым, а работать не
работает: подставной свободный ответ вместо интерактива, верный ответ не из
списка вариантов, диалог с недостижимой веткой.

    python -m unittest discover -s tools/content_upload
"""

import copy
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from validate_lesson import check_lesson  # noqa: E402

EXAMPLE = Path(__file__).with_name("examples") / "lesson.json"


def sample() -> dict:
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))


class LessonValidatorTests(unittest.TestCase):
    def test_example_lesson_is_clean(self):
        report = check_lesson(sample())
        self.assertTrue(report.ok, report.text())
        self.assertEqual(report.warnings, [], report.text())

    def test_answer_must_be_among_options(self):
        lesson = sample()
        lesson["content"]["exercises"][0]["answer"] = "stolovima"
        report = check_lesson(lesson)
        self.assertFalse(report.ok)
        self.assertTrue(any("не совпадает ни с одним вариантом" in e for e in report.errors),
                        report.text())

    def test_stray_spaces_around_answer_are_forgiven(self):
        lesson = sample()
        lesson["content"]["exercises"][0]["answer"] = "  stolu  "
        report = check_lesson(lesson)
        self.assertTrue(report.ok, report.text())

    def test_fill_blank_without_gap_is_rejected(self):
        lesson = sample()
        lesson["content"]["exercises"][1]["context"] = "Marko radi u kancelariji."
        report = check_lesson(lesson)
        self.assertFalse(report.ok)
        self.assertTrue(any("свободного ответа" in e for e in report.errors), report.text())

    def test_matching_pair_without_right_side(self):
        lesson = sample()
        lesson["content"]["exercises"][3]["pairs"][1] = {"left": "posao"}
        report = check_lesson(lesson)
        self.assertFalse(report.ok)
        self.assertTrue(any("pairs[2]" in e for e in report.errors), report.text())

    def test_theory_longer_than_limit(self):
        lesson = sample()
        lesson["content"]["theory"].append(
            {"id": "long", "type": "paragraph", "text": "а" * 6001}
        )
        report = check_lesson(lesson)
        self.assertFalse(report.ok)
        self.assertTrue(any("6000" in e for e in report.errors), report.text())

    def test_image_over_plain_http(self):
        lesson = sample()
        lesson["content"]["theory"].append(
            {"id": "img", "type": "image", "url": "http://example.com/a.png", "alt": "a"}
        )
        report = check_lesson(lesson)
        self.assertFalse(report.ok)
        self.assertTrue(any("https" in e for e in report.errors), report.text())

    def test_video_from_foreign_host(self):
        lesson = sample()
        lesson["content"]["theory"].append(
            {"id": "v", "type": "video", "url": "https://example.com/video"}
        )
        report = check_lesson(lesson)
        self.assertFalse(report.ok)
        self.assertTrue(any("YouTube" in e for e in report.errors), report.text())

    def test_dialogue_start_must_exist(self):
        lesson = sample()
        lesson["content"]["dialogue"]["startId"] = "нет-такой"
        report = check_lesson(lesson)
        self.assertFalse(report.ok)
        self.assertTrue(any("startId" in e for e in report.errors), report.text())

    def test_unreachable_dialogue_node_is_a_warning(self):
        lesson = sample()
        lesson["content"]["dialogue"]["nodes"].append(
            {"id": "d9", "speaker": "Ana", "avatar": "woman", "text": "Niko me ne čuje."}
        )
        report = check_lesson(lesson)
        self.assertTrue(report.ok, report.text())
        self.assertTrue(any("нельзя дойти" in w for w in report.warnings), report.text())

    def test_unknown_exercise_type(self):
        lesson = sample()
        lesson["content"]["exercises"][0]["type"] = "quiz"
        report = check_lesson(lesson)
        self.assertFalse(report.ok)
        self.assertTrue(any("неизвестный тип" in e for e in report.errors), report.text())

    def test_meta_fields_are_checked(self):
        lesson = sample()
        lesson["level"] = "B7"
        lesson["estimatedMinutes"] = 0
        lesson["topic"] = ""
        report = check_lesson(lesson)
        self.assertFalse(report.ok)
        self.assertEqual(
            sum(1 for e in report.errors if e.startswith(("level", "estimatedMinutes", "topic"))),
            3,
            report.text(),
        )

    def test_empty_markdown_hides_the_lesson_on_the_site(self):
        lesson = sample()
        lesson["content"]["markdown"] = "   "
        report = check_lesson(lesson)
        self.assertFalse(report.ok)
        self.assertTrue(any("markdown пуст" in e for e in report.errors), report.text())

    def test_short_markdown_is_a_warning(self):
        lesson = sample()
        lesson["content"]["markdown"] = "## Локатив\n\nКоротко."
        report = check_lesson(lesson)
        self.assertTrue(report.ok, report.text())
        self.assertTrue(any("короче теории" in w for w in report.warnings), report.text())

    def test_duplicate_exercise_ids(self):
        lesson = sample()
        exercises = lesson["content"]["exercises"]
        exercises.append(copy.deepcopy(exercises[0]))
        report = check_lesson(lesson)
        self.assertFalse(report.ok)
        self.assertTrue(any("повторяющийся id" in e for e in report.errors), report.text())


if __name__ == "__main__":
    unittest.main()
