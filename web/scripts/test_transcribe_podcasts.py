import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("transcribe-podcasts.py")
SPEC = importlib.util.spec_from_file_location("citavuk_transcriber", SCRIPT)
assert SPEC and SPEC.loader
transcriber = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(transcriber)


class TranscriptTimingTests(unittest.TestCase):
    def test_word_timestamp_rollback_starts_a_new_cue(self):
        words = [
            {"word": "Prva", "start": 10.0, "end": 10.5},
            {"word": "rečenica.", "start": 10.5, "end": 11.2},
            {"word": "Druga", "start": 9.0, "end": 9.5},
            {"word": "rečenica.", "start": 9.5, "end": 10.0},
        ]

        cues, dropped = transcriber.cues_from_words(words, [], 20.0)

        self.assertEqual(dropped, 0)
        self.assertEqual(len(cues), 2)
        self.assertEqual(cues[0]["text"], "Prva rečenica.")
        self.assertEqual(cues[1]["text"], "Druga rečenica.")

    def test_normalize_cues_repairs_invalid_end_and_overlap(self):
        cues = transcriber.normalize_cues(
            [
                {"start": 4.0, "end": 2.0, "text": "Neispravan kraj"},
                {"start": 5.0, "end": 8.0, "text": "Sledeća replika"},
            ]
        )

        self.assertGreater(cues[0]["end"], cues[0]["start"])
        self.assertLessEqual(cues[0]["end"], cues[1]["start"])

    def test_normalize_cues_merges_nearly_identical_starts(self):
        cues = transcriber.normalize_cues(
            [
                {"start": 4.0, "end": 4.03, "text": "Prva"},
                {"start": 4.02, "end": 5.0, "text": "druga"},
            ]
        )

        self.assertEqual(cues, [{"start": 4.0, "end": 5.0, "text": "Prva druga"}])

    def test_music_and_empty_segments_are_rejected(self):
        self.assertFalse(
            transcriber.usable(
                {
                    "text": "Subtitles by the Amara.org community",
                    "no_speech_prob": 0.0,
                    "avg_logprob": 0.0,
                },
                "",
            )
        )
        self.assertEqual(
            transcriber.normalize_cues(
                [
                    {
                        "start": 1,
                        "end": 3,
                        "text": "Dobar dan! Subtitles by Dima",
                    }
                ]
            ),
            [],
        )
        self.assertFalse(
            transcriber.usable(
                {"text": "Izmišljeno", "no_speech_prob": 0.9, "avg_logprob": 0.0},
                "",
            )
        )

    def test_transcode_failure_does_not_return_broken_chunks(self):
        completed = type(
            "Completed",
            (),
            {"returncode": 1, "stderr": b"invalid media"},
        )()
        with patch.object(transcriber.subprocess, "run", return_value=completed):
            with self.assertRaisesRegex(RuntimeError, "invalid media"):
                transcriber.transcode_and_split(b"not media", "ffmpeg")

    def test_catalog_marks_real_source_and_repairs_timing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "episode.json"
            target.write_text(
                '{"duration":1,"cues":[{"start":2,"end":1,"text":"Zdravo"}]}',
                encoding="utf-8",
            )

            changed = transcriber.normalize_catalog(
                root, {"https://cdn.example/episode.mp3": target.name}
            )

            self.assertEqual(changed, 1)
            data = transcriber.json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(data["source"], "groq")
            self.assertEqual(data["model"], transcriber.MODEL)
            self.assertEqual(data["timing"], "word")
            self.assertGreater(data["cues"][0]["end"], data["cues"][0]["start"])


if __name__ == "__main__":
    unittest.main()
