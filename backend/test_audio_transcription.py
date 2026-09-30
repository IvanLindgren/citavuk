import json
import os
import unittest
import urllib.error
from unittest.mock import patch

from backend.audio_transcription import (
    NotSerbianError,
    _merge_chunk_candidates,
    _split_mp3,
    normalise_provider_response,
    normalise_scribe_response,
    transcription_quality,
    transcribe_audio,
    transcription_keys,
    request_polza_transcription,
    validate_audio,
)


class _Response:
    def __init__(self, payload):
        self._body = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, _limit=-1):
        return self._body


def _audio_payload(text="Dobar dan.", *, quality=True):
    return {
        "language": "sr",
        "duration": 4,
        "segments": [{
            "start": 0,
            "end": 2,
            "text": text,
            "avg_logprob": -0.1 if quality else -1.6,
            "no_speech_prob": 0.01 if quality else 0.95,
            "compression_ratio": 1.2 if quality else 3.2,
            "speaker": "speaker_0",
        }],
        "words": [
            {"word": "Dobar", "start": 0.1, "end": 0.7, "speaker": "speaker_0"},
            {"word": "dan.", "start": 0.8, "end": 1.3, "speaker": "speaker_0"},
        ],
    }


class AudioTranscriptionTest(unittest.TestCase):
    def test_aiesa_queue_polls_audio_endpoint_and_unwraps_result(self):
        with patch("backend.audio_transcription.time.sleep"), patch(
            "backend.audio_transcription.urllib.request.urlopen",
            side_effect=[
                _Response({"id": "test-job", "status": "processing"}),
                _Response({"status": "processing"}),
                _Response({"status": "completed", "result": _audio_payload()}),
            ],
        ) as request:
            result = request_polza_transcription(b"ID3-test", "sample.mp3", "audio/mpeg", "test-key")
        self.assertEqual(result["language"], "sr")
        self.assertEqual(request.call_count, 3)
        for call in request.call_args_list[1:]:
            self.assertEqual(call.args[0].full_url, "https://polza.ai/api/v1/audio/transcriptions/test-job")
            self.assertEqual(call.args[0].get_method(), "GET")

    def test_aiesa_foreign_or_distorted_response_is_not_accepted_as_serbian(self):
        payload = {"text": "И даниэ Сам арсен сутрадан Кади", "duration": 12,
                   "segments": [{"start": 0, "end": 12, "text": "И даниэ Сам арсен сутрадан Кади"}]}
        with patch("backend.audio_transcription.urllib.request.urlopen", return_value=_Response(payload)), patch.dict(
            os.environ, {"POLZA_AUDIO_FALLBACK_MODEL": ""}, clear=True,
        ):
            with self.assertRaises(NotSerbianError):
                transcribe_audio(b"ID3" + b"\0" * 32, "sample.mp3", "audio/mpeg", polza_api_key="test-key")

    def test_empty_dedicated_secrets_do_not_hide_shared_keys(self):
        with patch.dict(os.environ, {
            "GROQ_AUDIO_TRANSCRIPTION_KEY": " ", "GROQ_API_KEY": "groq-shared",
            "POLZA_AUDIO_TRANSCRIPTION_KEY": "", "POLZA_AI_KEY": "polza-shared",
        }, clear=True):
            self.assertEqual(transcription_keys(), ("groq-shared", "polza-shared"))

    def test_polza_api_key_alias_is_supported(self):
        with patch.dict(os.environ, {"POLZA_AI_KEY": "", "POLZA_API_KEY": "polza-alias"}, clear=True):
            self.assertEqual(transcription_keys(), ("", "polza-alias"))

    def test_explicit_keys_have_priority_and_empty_keys_use_fallback(self):
        with patch.dict(os.environ, {"GROQ_API_KEY": "groq-env", "POLZA_AI_KEY": "polza-env"}, clear=True):
            self.assertEqual(transcription_keys(groq_api_key=" groq-explicit ", polza_api_key="polza-explicit"), ("groq-explicit", "polza-explicit"))
            self.assertEqual(transcription_keys(groq_api_key="", polza_api_key="  "), ("groq-env", "polza-env"))

    def test_mp3_is_split_only_at_frame_boundaries(self):
        # MPEG-1 Layer III, 128 kbit/s, 44.1 kHz: 417 bytes per frame.
        frame = b"\xff\xfb\x90\x64" + b"\x00" * 413
        chunks = _split_mp3(frame * 14000)
        self.assertGreaterEqual(len(chunks), 2)
        self.assertTrue(all(len(chunk) <= 5 * 1024 * 1024 for chunk, _ in chunks))
        self.assertEqual(sum(len(chunk) for chunk, _ in chunks), len(frame) * 14000)
        self.assertEqual(chunks[0][1], 0.0)
        self.assertGreater(chunks[1][1], 0.0)

    def test_chunk_merge_offsets_word_and_segment_timestamps(self):
        first = normalise_provider_response(
            _audio_payload(), provider="groq", model="whisper-large-v3-turbo"
        )
        second = normalise_provider_response(
            _audio_payload("Zdravo svima."), provider="groq", model="whisper-large-v3-turbo"
        )
        merged = _merge_chunk_candidates(
            [(first, 0.0), (second, 12.0)],
            provider="groq",
            model="whisper-large-v3-turbo",
        )
        self.assertEqual(merged["chunks"], 2)
        self.assertEqual(merged["segments"][1]["start"], 12.0)
        self.assertEqual(merged["segments"][1]["words"][0]["start"], 12.1)

    def test_chunk_merge_does_not_hide_mixed_language(self):
        first = normalise_provider_response(
            _audio_payload(), provider="groq", model="whisper-large-v3-turbo"
        )
        foreign = _audio_payload("Hello everyone.")
        foreign["language"] = "en"
        second = normalise_provider_response(
            foreign, provider="groq", model="whisper-large-v3-turbo"
        )
        merged = _merge_chunk_candidates(
            [(first, 0.0), (second, 12.0)],
            provider="groq",
            model="whisper-large-v3-turbo",
        )
        self.assertEqual(merged["language_code"], "mixed")

    def test_rejects_non_audio_bytes(self):
        with self.assertRaisesRegex(ValueError, "не похож"):
            validate_audio(b"not audio", "audio/mpeg", "voice.mp3")

    def test_rejects_non_serbian_transcript(self):
        with self.assertRaises(NotSerbianError):
            normalise_scribe_response(
                {"language_code": "eng", "language_probability": 0.99, "words": []}
            )

    def test_groups_words_by_speaker_with_exact_timing(self):
        result = normalise_scribe_response(
            {
                "language_code": "srp",
                "language_probability": 0.94,
                "words": [
                    {"type": "word", "text": "Zdravo", "start": 1.0, "end": 1.4, "speaker_id": "speaker_0"},
                    {"type": "spacing", "text": " ", "start": 1.4, "end": 1.45, "speaker_id": "speaker_0"},
                    {"type": "word", "text": "svima.", "start": 1.45, "end": 2.0, "speaker_id": "speaker_0"},
                    {"type": "spacing", "text": " ", "start": 2.0, "end": 2.1, "speaker_id": "speaker_1"},
                    {"type": "word", "text": "Dobar", "start": 2.1, "end": 2.5, "speaker_id": "speaker_1"},
                    {"type": "spacing", "text": " ", "start": 2.5, "end": 2.55, "speaker_id": "speaker_1"},
                    {"type": "word", "text": "dan!", "start": 2.55, "end": 2.9, "speaker_id": "speaker_1"},
                ],
            }
        )
        self.assertEqual(result["speakers"], ["speaker_0", "speaker_1"])
        self.assertEqual(len(result["segments"]), 2)
        self.assertEqual(result["segments"][0]["text"], "Zdravo svima.")
        self.assertEqual(result["segments"][1]["words"][0]["start"], 2.1)

    def test_normalises_groq_response_to_shared_contract(self):
        result = normalise_provider_response(
            _audio_payload(), provider="groq", model="whisper-large-v3-turbo"
        )
        self.assertEqual(result["language_code"], "srp")
        self.assertEqual(result["provider"], "groq")
        self.assertEqual(result["segments"][0]["words"][1]["text"], "dan.")
        self.assertGreaterEqual(result["quality_score"], 0.72)

    def test_quality_score_explains_whisper_bad_metrics(self):
        result = normalise_provider_response(
            _audio_payload("music music music music music music", quality=False),
            provider="groq",
            model="whisper-large-v3-turbo",
        )
        score, reasons = transcription_quality(result)
        self.assertLess(score, 0.72)
        self.assertTrue(reasons)

    def test_drops_isolated_hallucinated_segments(self):
        payload = _audio_payload()
        payload["segments"].append(
            {
                "start": 2.2,
                "end": 4,
                "text": "Subtitles by the Amara.org community",
                "avg_logprob": -0.2,
                "no_speech_prob": 0.01,
                "compression_ratio": 1.1,
            }
        )
        result = normalise_provider_response(payload, provider="groq", model="whisper-large-v3-turbo")
        self.assertEqual(len(result["segments"]), 1)
        self.assertEqual(result["segments"][0]["text"], "Dobar dan.")

    def test_groq_fast_falls_back_to_aiesa_when_result_is_poor(self):
        with patch(
            "backend.audio_transcription.urllib.request.urlopen",
            side_effect=[_Response(_audio_payload(quality=False)), _Response(_audio_payload())],
        ) as request:
            result = transcribe_audio(
                b"ID3" + b"\x00" * 32,
                "lesson.mp3",
                "audio/mpeg",
                groq_api_key="groq-key",
                polza_api_key="polza-key",
            )
        self.assertEqual(result["provider"], "polza")
        self.assertTrue(result["fallback_used"])
        self.assertEqual(request.call_count, 2)
        self.assertIn(b"whisper-large-v3-turbo", request.call_args_list[0].args[0].data)
        self.assertIn(b"aiesa/transcribe", request.call_args_list[1].args[0].data)
        polza_request = request.call_args_list[1].args[0]
        self.assertEqual(polza_request.get_header("Content-type"), "application/json")
        payload = json.loads(polza_request.data)
        self.assertTrue(payload["file"].startswith("data:audio/mpeg;base64,"))
        self.assertNotIn("response_format", payload)
        self.assertNotIn("temperature", payload)
        self.assertNotIn("stream", payload)
        self.assertNotIn(b'name="temperature"', request.call_args_list[1].args[0].data)
        self.assertNotIn(b'name="stream"', request.call_args_list[1].args[0].data)

    def test_groq_network_error_falls_back_to_aiesa(self):
        with patch(
            "backend.audio_transcription.urllib.request.urlopen",
            side_effect=[urllib.error.URLError("offline"), _Response(_audio_payload())],
        ):
            result = transcribe_audio(
                b"ID3" + b"\x00" * 32,
                "lesson.mp3",
                "audio/mpeg",
                groq_api_key="groq-key",
                polza_api_key="polza-key",
            )
        self.assertEqual(result["provider"], "polza")

    def test_poor_aiesa_response_uses_its_whisper_fallback(self):
        with patch(
            "backend.audio_transcription.urllib.request.urlopen",
            side_effect=[
                _Response(_audio_payload(quality=False)),
                _Response(_audio_payload(quality=False)),
                _Response(_audio_payload()),
            ],
        ) as request:
            result = transcribe_audio(
                b"ID3" + b"\x00" * 32,
                "lesson.mp3",
                "audio/mpeg",
                groq_api_key="groq-key",
                polza_api_key="polza-key",
            )
        self.assertEqual(result["provider"], "polza")
        self.assertEqual(result["model"], "openai/whisper-large-v3")
        self.assertTrue(result["fallback_used"])
        self.assertEqual(request.call_count, 3)
        self.assertIn(b"openai/whisper-large-v3", request.call_args_list[2].args[0].data)

    def test_no_provider_keys_are_reported_as_configuration_error(self):
        with self.assertRaisesRegex(RuntimeError, "Не настроен"):
            transcribe_audio(b"ID3" + b"\x00" * 32, "lesson.mp3", "audio/mpeg")

    def test_poor_result_is_not_saved_when_no_fallback_is_available(self):
        with patch(
            "backend.audio_transcription.urllib.request.urlopen",
            side_effect=[_Response(_audio_payload(quality=False)), _Response(_audio_payload(quality=False))],
        ):
            with self.assertRaisesRegex(RuntimeError, "не прошла проверку качества"):
                transcribe_audio(
                    b"ID3" + b"\x00" * 32,
                    "lesson.mp3",
                    "audio/mpeg",
                    groq_api_key="groq-key",
                )


if __name__ == "__main__":
    unittest.main()
