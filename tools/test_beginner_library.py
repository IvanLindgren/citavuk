import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tools import build_beginner_library as library


class BeginnerLibraryTest(unittest.TestCase):
    def setUp(self):
        self.registry, self.sources, self.covers = library.load_inputs()

    def test_editorial_package_has_fifty_distinct_sources_and_texts(self):
        report = library.validate(self.registry, self.sources, self.covers)
        self.assertEqual(len(report), 50)
        self.assertTrue(all(row['words'] >= 70 for row in report))

    def test_rejects_duplicates(self):
        registry = copy.deepcopy(self.registry)
        registry['items'][1]['id'] = registry['items'][0]['id']
        with self.assertRaises(ValueError):
            library.validate(registry, self.sources, self.covers)

    def test_rejects_repeated_cover(self):
        covers = copy.deepcopy(self.covers)
        covers['a1-lisica-i-grozdje'] = covers['a1-lav-i-mis']
        with self.assertRaisesRegex(ValueError, 'повторная обложка'):
            library.validate(self.registry, self.sources, covers)

    def test_requires_individual_fable_cover(self):
        covers = copy.deepcopy(self.covers)
        del covers['a1-lav-i-mis']
        with self.assertRaisesRegex(ValueError, 'нет индивидуальной обложки'):
            library.validate(self.registry, self.sources, covers)

    def test_rejects_invalid_crop(self):
        covers = copy.deepcopy(self.covers)
        covers['a1-lav-i-mis']['crop'] = [0, 0, 2, 1]
        with self.assertRaisesRegex(ValueError, 'неверная область'):
            library.validate(self.registry, self.sources, covers)

    def test_rejects_russian_in_serbian_body(self):
        registry = copy.deepcopy(self.registry)
        registry['items'][0]['body'] += ' перевод'
        with self.assertRaises(ValueError):
            library.validate(registry, self.sources, self.covers)

    def test_rejects_unlabeled_adaptation(self):
        registry = copy.deepcopy(self.registry)
        registry['items'][0]['summary'] = 'Оригинальный текст'
        with self.assertRaises(ValueError):
            library.validate(registry, self.sources, self.covers)

    def test_rejects_long_a1_sentence(self):
        registry = copy.deepcopy(self.registry)
        registry['items'][0]['body'] = ' '.join(['Lav'] * 80) + '.'
        with self.assertRaises(ValueError):
            library.validate(registry, self.sources, self.covers)

    def test_merge_preserves_other_materials_and_is_idempotent(self):
        untouched = {'id': 'old-book', 'textUrl': '/public-library/texts/old-book.txt', 'custom': {'keep': True}}
        original = copy.deepcopy(untouched)
        with tempfile.TemporaryDirectory() as temporary, patch.object(library, 'make_cover'):
            root = Path(temporary)
            first = library.build_into_catalog([untouched], out=root)
            second = library.build_into_catalog(first, out=root)
            self.assertEqual(first, second)
            self.assertEqual(len(second), 51)
            self.assertEqual(second[-1], original)
            self.assertEqual(untouched, original)
            for item in second[:-1]:
                text = (root / 'texts' / f'{item["id"]}.txt').read_text(encoding='utf-8')
                proof = json.loads((root / 'sources' / f'{item["id"]}.json').read_text(encoding='utf-8'))
                self.assertEqual(item['characters'], len(text))
                self.assertIn('Prilagođeno za učenje', text)
                self.assertIn(proof['revisionUrl'], text)
                self.assertIn(library.LICENSE, text)
                self.assertNotIn('body', item)
                self.assertTrue(item['textUrl'].endswith('.txt'))
                self.assertEqual(proof['textSha256'], library.hashlib.sha256(text.encode()).hexdigest())


if __name__ == '__main__':
    unittest.main()
