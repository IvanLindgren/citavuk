import unittest
from types import SimpleNamespace as NS
from nlp_selection import select_word


class SelectionTests(unittest.TestCase):
    def test_position_wins_across_sentences(self):
        first = NS(text='sam', misc='start_char=3|end_char=6', upos='AUX')
        last = NS(text='sam', misc='start_char=20|end_char=23', upos='ADJ')
        doc = NS(sentences=[NS(words=[first]), NS(words=[last])])
        self.assertIs(select_word(doc, 3, 6, 'sam', str), first)
        self.assertIs(select_word(doc, 20, 23, 'sam', str), last)

    def test_bad_metadata_does_not_hide_later_exact_match(self):
        first = NS(text='sam', misc='start_char=bad')
        last = NS(text='sam', misc='start_char=7|end_char=10')
        doc = NS(sentences=[NS(words=[first, last])])
        self.assertIs(select_word(doc, 7, 10, 'sam', str), last)
        self.assertIs(select_word(doc, 15, 18, 'sam', str), first)
        self.assertIsNone(select_word(doc, 15, 18, 'other', str))


if __name__ == '__main__':
    unittest.main()
