import os
import unittest
from unittest.mock import patch, MagicMock

from backend.tts_service import normalize, provider_id, _edge, serbian_speech_text


class TtsNormalizationTest(unittest.TestCase):
    def test_serbian_abbreviations_numbers_and_pauses(self):
        self.assertEqual(
            normalize("Dr. Marko ima 23 knjige — npr. roman.", "sr"),
            "doktor Marko ima dvadeset tri knjige , na primer roman.",
        )

    def test_non_serbian_text_keeps_numbers(self):
        self.assertEqual(normalize("Page 23… Next", "en"), "Page 23. Next")

    def test_edge_is_default_without_paid_credentials(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(provider_id("sr", "sophie", "Dobar dan"), "edge-v4-latn")

    def test_serbian_uses_elevenlabs_when_configured(self):
        variables = {
            "ELEVENLABS_API_KEY": "test-key",
            "ELEVENLABS_SERBIAN_SOPHIE_VOICE_ID": "serbian-voice",
        }
        with patch.dict(os.environ, variables, clear=True):
            self.assertEqual(provider_id("sr", "sophie", "Dobar dan"), "elevenlabs-v4")
            self.assertEqual(provider_id("en", "sophie", "Hello"), "edge-v4-latn")

    def test_full_voice_name_matches_script(self):
        for text, spoken in [('zabačene', 'забачене'),
                             ('strašno zgodnom idejom.', 'страшно згодном идејом.'),
                             ('забачене', 'забачене')]:
            for voice, name in [('sophie', 'SophieNeural'), ('nicholas', 'NicholasNeural')]:
                edge = MagicMock()
                edge.Communicate.return_value.stream_sync.return_value = [{'type': 'audio', 'data': b'mp3'}]
                with patch.dict('sys.modules', {'edge_tts': edge}):
                    self.assertEqual(_edge(text, 'sr', voice), b'mp3')
                edge.Communicate.assert_called_once_with(
                    spoken, f'Microsoft Server Speech Text to Speech Voice (sr-RS, {name})',
                    rate='-2%', pitch='+0Hz')

    def test_latin_failure_does_not_silently_switch_script(self):
        edge = MagicMock()
        edge.Communicate.side_effect = RuntimeError('unavailable')
        with patch.dict('sys.modules', {'edge_tts': edge}):
            with self.assertRaises(RuntimeError):
                _edge('zabačene', 'sr', 'sophie')
        self.assertEqual(edge.Communicate.call_count, 1)

    def test_transliteration(self):
        self.assertEqual(serbian_speech_text('Ljubav NJEGOŠ džep, инјекција!'), 'Љубав ЊЕГОШ џеп, инјекција!')
        self.assertEqual(serbian_speech_text('injekcija konjugacija nadživeti'), 'инјекција конјугација надживети')
        self.assertEqual(serbian_speech_text('c\u030car'), 'чар')


if __name__ == "__main__":
    unittest.main()
