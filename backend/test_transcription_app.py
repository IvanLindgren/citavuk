import os
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.transcription_app import app


class TranscriptionAppTest(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"CITAVUK_UPSTREAM_SECRET": "worker-secret"}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_unauthorized_request_never_calls_provider(self):
        with TestClient(app) as client, patch("backend.transcription_app.transcribe_audio") as provider:
            response = client.post("/audio/transcribe-file", files={"file": ("voice.mp3", b"ID3test", "audio/mpeg")})
            self.assertEqual(response.status_code, 403)
            provider.assert_not_called()

    def test_authorized_request_keeps_shared_contract(self):
        result = {"language_code": "srp", "provider": "polza", "model": "aiesa/transcribe", "segments": []}
        with TestClient(app) as client, patch("backend.transcription_app.transcribe_audio", return_value=result) as provider:
            response = client.post("/audio/transcribe-file", headers={"X-Citavuk-Proxy-Secret": "worker-secret"}, files={"file": ("voice.mp3", b"ID3test", "audio/mpeg")})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), result)
            provider.assert_called_once_with(b"ID3test", "voice.mp3", "audio/mpeg")

    def test_oversized_audio_never_calls_provider(self):
        with TestClient(app) as client, patch("backend.transcription_app.MAX_AUDIO_BYTES", 4), patch("backend.transcription_app.transcribe_audio") as provider:
            response = client.post("/audio/transcribe-file", headers={"X-Citavuk-Proxy-Secret": "worker-secret"}, files={"file": ("voice.mp3", b"ID3test", "audio/mpeg")})
            self.assertEqual(response.status_code, 413)
            provider.assert_not_called()

    def test_health_exposes_presence_not_secret_values(self):
        with patch.dict(os.environ, {"POLZA_AUDIO_TRANSCRIPTION_KEY": "", "POLZA_AI_KEY": "polza-shared-secret"}), TestClient(app) as client:
            response = client.get("/health")
            self.assertTrue(response.json()["polza"])
            self.assertTrue(response.json()["configured"])
            self.assertNotIn("polza-shared-secret", response.text)


if __name__ == "__main__":
    unittest.main()
