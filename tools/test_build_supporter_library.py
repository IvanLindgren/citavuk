import unittest
from unittest.mock import patch
from tools.build_supporter_library import chapter_titles, clean_rendered, validate_book, render_sections, fetch_raw_pages, leaf_titles


class SupporterLibraryTest(unittest.TestCase):
    def test_nested_contents_do_not_duplicate_leaf_chapters(self):
        self.assertEqual(leaf_titles(['Книга/A','Книга/A/1','Книга/A/2','Книга/B','Книга/B/1']), ['Книга/A/1','Книга/A/2','Книга/B/1'])
    def test_batch_render_does_not_cut_next_chapter_after_source_notes(self):
        rendered = '<h2>CITAVUK_SECTION_0</h2><p>Первая глава содержит длинный текст.</p><h2>Извор</h2><p>Библиография</p><h2>CITAVUK_SECTION_1</h2><p>Вторая глава тоже остаётся полностью.</p>'
        with patch('tools.build_supporter_library.api', return_value={'parse': {'text': rendered}}) as request:
            texts = render_sections([{'title':'A','raw':'A'}, {'title':'B','raw':'B'}])
        self.assertEqual(texts, ['Первая глава содержит длинный текст.', 'Вторая глава тоже остаётся полностью.'])
        self.assertTrue(request.call_args.kwargs['post'])

    def test_batch_render_rejects_missing_chapter_marker(self):
        with patch('tools.build_supporter_library.api', return_value={'parse': {'text':'Текст без границ'}}):
            with self.assertRaises(ValueError):
                render_sections([{'title':'A','raw':'A'}])

    def test_empty_cover_is_allowed_but_empty_scene_is_rejected(self):
        with patch('tools.build_supporter_library.api', return_value={'parse':{'text':'<h2>CITAVUK_SECTION_0</h2>'}}):
            self.assertEqual(render_sections([{'title':'Книга/насловна','raw':'[[File:Cover.jpg]]'}]), [''])
            with self.assertRaises(ValueError):
                render_sections([{'title':'Книга/1','raw':'...'}])

    def test_batch_fetch_rejects_missing_chapters(self):
        with patch('tools.build_supporter_library.api', return_value={'query': {'pages':[{'title':'A','missing':True}]}}):
            with self.assertRaises(ValueError):
                fetch_raw_pages(['A'])

    def test_batch_fetch_resolves_redirect_and_preserves_requested_title(self):
        payload = {'query':{'redirects':[{'from':'Alias','to':'Actual'}], 'pages':[{'title':'Actual','revisions':[{'revid':15,'slots':{'main':{'content':'Текст главы'}}}]}]}}
        with patch('tools.build_supporter_library.api', return_value=payload):
            saved = fetch_raw_pages(['Alias'])
        self.assertEqual(saved['Alias']['revision'], 15)
        self.assertEqual(saved['Alias']['title'], 'Alias')

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

    def test_anonymous_translation_needs_verified_publication_and_note(self):
        book = {'title':'Рассказ', 'authorDeath':1849, 'anonymousTranslationPublished':1863, 'translationNote':'Анонимный перевод, журнал «Даница», 1863.'}
        validate_book(book)
        with self.assertRaises(ValueError):
            validate_book({**book, 'anonymousTranslationPublished':2000})
        with self.assertRaises(ValueError):
            validate_book({**book, 'translationNote':''})


if __name__ == '__main__':
    unittest.main()
