"""Проверка URL перед серверной загрузкой (защита от SSRF).

Пропускаются только http/https-ссылки на хосты новостных лент, чей DNS-ответ
не указывает на приватные/служебные адреса.
"""

import ipaddress
import socket
import urllib.parse
import urllib.request
from typing import Callable, Mapping, Optional

# Домены лент из NEWS_FEEDS (main.py).
# ocdn.eu — CDN Ringier Axel Springer: картинки статей Blic отдаются оттуда
# (проверено по https://www.blic.rs/rss/Kultura), остальные ленты хостят
# изображения на собственных доменах.
_ALLOWED_SUFFIXES = (
    "n1info.rs",
    "danas.rs",
    "nova.rs",
    "blic.rs",
    "naukakrozprice.rs",
    "ocdn.eu",
)


class UrlRejected(Exception):
    """URL не прошёл проверку — запрос наружу делать нельзя."""


def check_url(url: str) -> str:
    """Возвращает url, если он безопасен для серверного fetch, иначе UrlRejected."""
    candidate = (url or "").strip()
    parsed = urllib.parse.urlparse(candidate)
    if parsed.scheme not in ("http", "https"):
        raise UrlRejected(f"недопустимая схема: {parsed.scheme!r}")
    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise UrlRejected("пустой хост")
    if not any(
        hostname == suffix or hostname.endswith("." + suffix)
        for suffix in _ALLOWED_SUFFIXES
    ):
        raise UrlRejected(f"хост вне списка: {hostname}")
    try:
        infos = socket.getaddrinfo(hostname, None)
    except OSError as exc:
        raise UrlRejected(f"DNS не резолвится: {hostname}") from exc
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            raise UrlRejected(f"DNS указывает на служебный адрес: {address}")
    return candidate


class _ValidatingRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Повторяет проверку до каждого перехода, а не после сетевого запроса."""

    def __init__(self, validator: Callable[[str], str]) -> None:
        super().__init__()
        self._validator = validator

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self._validator(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def open_checked(
    url: str,
    *,
    headers: Optional[Mapping[str, str]] = None,
    timeout: float = 10,
    validator: Callable[[str], str] = check_url,
):
    """Открывает URL и проверяет исходный адрес и каждый HTTP-редирект."""
    checked = validator(url)
    opener = urllib.request.build_opener(_ValidatingRedirectHandler(validator))
    request = urllib.request.Request(checked, headers=dict(headers or {}))
    return opener.open(request, timeout=timeout)
