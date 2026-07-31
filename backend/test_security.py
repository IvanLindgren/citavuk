"""Регрессионные тесты лёгких защитных модулей без импорта CLASSLA."""

import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import analysis_cache
import urlguard
from ratelimit import TokenBucketLimiter, make_limiter


class UrlGuardTests(unittest.TestCase):
    def test_rejects_non_public_or_foreign_urls(self):
        for url in (
            "http://169.254.169.254/",
            "http://evil.com/x",
            "file:///etc/passwd",
        ):
            with self.subTest(url=url), self.assertRaises(urlguard.UrlRejected):
                urlguard.check_url(url)

    @mock.patch(
        "urlguard.socket.getaddrinfo",
        return_value=[(None, None, None, "", ("93.184.216.34", 0))],
    )
    def test_accepts_feed_and_cdn_hosts(self, _):
        self.assertEqual(
            urlguard.check_url("https://n1info.rs/img.jpg"),
            "https://n1info.rs/img.jpg",
        )
        self.assertEqual(
            urlguard.check_url("https://ocdn.eu/image.jpg"),
            "https://ocdn.eu/image.jpg",
        )

    @mock.patch(
        "urlguard.socket.getaddrinfo",
        return_value=[(None, None, None, "", ("10.0.0.5", 0))],
    )
    def test_rejects_private_dns_answer(self, _):
        with self.assertRaises(urlguard.UrlRejected):
            urlguard.check_url("https://n1info.rs/img.jpg")

    def test_redirect_is_validated_before_following(self):
        handler = urlguard._ValidatingRedirectHandler(urlguard.check_url)
        with self.assertRaises(urlguard.UrlRejected):
            handler.redirect_request(
                None,
                None,
                302,
                "Found",
                {},
                "http://169.254.169.254/latest/meta-data/",
            )


class RateLimitTests(unittest.TestCase):
    def test_bucket_is_per_ip_and_enforces_burst(self):
        limiter = TokenBucketLimiter("test", 30, 10)
        self.assertEqual(
            sum(1 for _ in range(15) if limiter.allow("1.2.3.4")),
            10,
        )
        self.assertFalse(limiter.allow("1.2.3.4"))
        self.assertTrue(limiter.allow("5.6.7.8"))

    def test_dependency_uses_forwarded_ip_and_returns_429(self):
        dependency = make_limiter(30, 2)
        request = mock.Mock()
        request.headers = {"x-forwarded-for": "7.7.7.7, 8.8.8.8"}
        request.client.host = "9.9.9.9"

        async def exhaust():
            await dependency(request)
            await dependency(request)
            await dependency(request)

        with self.assertRaises(Exception) as caught:
            asyncio.run(exhaust())
        self.assertEqual(caught.exception.status_code, 429)


class AnalysisCacheTests(unittest.TestCase):
    def test_round_trip_closes_database(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "cache.db"
            payload = {"lemma": "kuća", "upos": "NOUN"}
            with mock.patch.object(analysis_cache, "_DB_PATH", database):
                analysis_cache.set("key", payload)
                self.assertEqual(analysis_cache.get("key"), payload)
                self.assertIsNone(analysis_cache.get("missing"))
            # Windows не удалит открытый SQLite-файл: выход из
            # TemporaryDirectory дополнительно проверяет закрытие соединений.


if __name__ == "__main__":
    unittest.main()
