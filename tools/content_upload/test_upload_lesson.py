"""Поиск уже залитого урока.

Стережёт ровно ту ошибку, из-за которой в каталоге осело три «Аккузатива» и
два «Глагола biti»: адрес урока придумывает сервер, дописывая к названию
восемь случайных знаков, и сравнение с локальным slug не совпадало никогда.

    python -m unittest discover -s tools/content_upload
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from upload_lesson import find_existing  # noqa: E402


class FakeClient:
    """Ровно та часть клиента, которую трогает поиск: список своих уроков."""

    def __init__(self, items):
        self.items = items

    def own_lessons(self):
        return self.items


class FindExistingTests(unittest.TestCase):
    def test_server_slug_with_random_tail_is_recognized(self):
        client = FakeClient([
            {"id": "1", "slug": "glagol-biti-v-nasto-em-vremeni-5bde835c",
             "title": "Глагол biti в настоящем времени"},
        ])
        lesson = {"slug": "glagol-biti-v-nasto-em-vremeni",
                  "title": "Глагол biti в настоящем времени"}
        found = find_existing(client, lesson, None)
        self.assertIsNotNone(found)
        self.assertEqual(found["id"], "1")

    def test_title_matches_even_when_slug_differs(self):
        # Сервер строит адрес из названия по своим правилам, и локальный slug
        # с ним не совпадает вовсе — урок всё равно должен найтись.
        client = FakeClient([
            {"id": "1", "slug": "akkuzativ-edinstvennogo-cisla-832bb2e1",
             "title": "Аккузатив единственного числа и прямой объект"},
        ])
        lesson = {"slug": "akuzativ-jednine",
                  "title": "Аккузатив единственного числа и прямой объект"}
        self.assertEqual(find_existing(client, lesson, None)["id"], "1")

    def test_duplicates_resolve_to_the_earliest(self):
        client = FakeClient([
            {"id": "b", "slug": "urok-2", "title": "Урок", "createdAt": "2026-08-17T00:23:18Z"},
            {"id": "a", "slug": "urok-1", "title": "Урок", "createdAt": "2026-08-17T00:23:04Z"},
            {"id": "c", "slug": "urok-3", "title": "Урок", "createdAt": "2026-08-17T00:23:32Z"},
        ])
        self.assertEqual(find_existing(client, {"title": "Урок"}, None)["id"], "a")

    def test_other_lessons_are_left_alone(self):
        client = FakeClient([
            {"id": "1", "slug": "lokativ-ff79f1dc", "title": "Локатив"},
        ])
        self.assertIsNone(find_existing(client, {"title": "Аккузатив"}, None))

    def test_explicit_id_wins(self):
        client = FakeClient([{"id": "1", "title": "Урок"}])
        self.assertEqual(find_existing(client, {"title": "Урок"}, "given")["id"], "given")


if __name__ == "__main__":
    unittest.main()
