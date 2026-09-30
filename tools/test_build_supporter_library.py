import unittest
from tools.build_supporter_library import chapter_titles, clean_rendered, validate_book


class SupporterLibraryTest(unittest.TestCase):
    def test_chapter_order_ignores_header_links(self):
        raw = '{{Навигация|[[Книга/3]]|[[Книга/1]]}}\n[[Книга/1]] [[Книга/2]] [[Книга/3]]'
        self.assertEqual(chapter_titles(raw, 'Книга'), ['Книга/1', 'Книга/2', 'Книга/3'])

    def test_collection_only_uses_numbered_story_links(self):
        self.assertEqual(chapter_titles('[[Предисловие]]\n# [[Сказка 1]]\n# [[Сказка 2|Название]]', 'Сборник', True), ['Сказка 1', 'Сказка 2'])

    def test_poetry_tables_are_not_lost(self):
        raw = '<table><tr><td>Навигация</td></tr></table><table style="background-color:ghostwhite"><tr><td><p>Первый стих<br>Второй стих</p></td></tr></table><h2>Извор</h2><p>Служебные данные</p>'
        self.assertEqual(clean_rendered(raw), 'Первый стих\nВторой стих')

    def test_translator_rights_are_checked_separately(self):
        with self.assertRaises(ValueError):
            validate_book({'title': 'Книга', 'authorDeath': 1898, 'translator': 'Новый переводчик', 'translatorDeath': 2001})
        validate_book({'title': 'Книга', 'authorDeath': 1898, 'translator': 'Старый переводчик', 'translatorDeath': 1955})


if __name__ == '__main__':
    unittest.main()
