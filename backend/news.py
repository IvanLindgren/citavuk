"""RSS: ограниченный набор тем, кеш и HTTP-маршрут."""
import calendar
import logging
import re
import time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
try:
    from .redis_cache import redis_cache
    from .ratelimit import make_limiter
except ImportError:
    from redis_cache import redis_cache
    from ratelimit import make_limiter
router = APIRouter()

NEWS_FEEDS = {
    "general": [
        "https://n1info.rs/feed/",
        "https://www.danas.rs/feed/",
        "https://nova.rs/feed/",
    ],
    "politics": [
        "https://n1info.rs/vesti/feed/",
        "https://nova.rs/vesti/politika/feed/",
    ],
    "culture": [
        "https://www.blic.rs/rss/Kultura",
        "https://nova.rs/kultura/feed/",
        "https://n1info.rs/kultura/feed/",
    ],
    "trending": [  # «лента дня» — самое читаемое сегодня (Blic) + свежее
        "https://www.blic.rs/rss/danasnji-najcitaniji",
        "https://nova.rs/feed/",
        "https://n1info.rs/feed/",
    ],
    "science": [
        "https://naukakrozprice.rs/feed/",
        "https://nova.rs/it/feed/",
        "https://www.blic.rs/rss/IT",
    ],
}

# Кэш ленты по теме (чтобы не дёргать RSS на каждый заход).
_NEWS_CACHE = {}
_NEWS_TTL = 300  # 5 минут


def _clean_summary(html: str) -> str:
    text = re.sub(r"<[^>]+>", "", html or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:300]


def _entry_timestamp(e) -> int:
    for key in ("published_parsed", "updated_parsed"):
        val = e.get(key)
        if val:
            try:
                return calendar.timegm(val)
            except Exception:
                pass
    return 0


def _entry_image(e) -> Optional[str]:
    # media:content / media:thumbnail
    for key in ("media_content", "media_thumbnail"):
        media = e.get(key)
        if media:
            for m in media:
                if m.get("url"):
                    return m["url"]
    # enclosure-картинки
    for link in e.get("links", []):
        if link.get("rel") == "enclosure" and str(link.get("type", "")).startswith("image"):
            return link.get("href")
    # первый <img> в summary/content
    html = e.get("summary", "") or ""
    if e.get("content"):
        try:
            html += e["content"][0].get("value", "")
        except Exception:
            pass
    m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', html)
    if m:
        return m.group(1)
    return None


@router.get("/news")
def news(topic: str = "general", limit: int = Query(25, ge=1, le=100),
         _: None = Depends(make_limiter(20, 5))):
    if topic not in NEWS_FEEDS:
        raise HTTPException(status_code=400, detail="Неизвестная тема новостей.")
    import feedparser
    # Кэш: отдаём свежий результat, не дёргая RSS чаще раза в 5 минут.
    now = time.time()
    cached = _NEWS_CACHE.get(topic)
    if cached and now - cached[0] < _NEWS_TTL:
        return {"topic": topic, "items": cached[1][:limit], "cached": True}
    shared = redis_cache.get_json(f"news:{topic}")
    if isinstance(shared, list):
        _NEWS_CACHE[topic] = (now, shared)
        return {"topic": topic, "items": shared[:limit], "cached": True}

    feeds = NEWS_FEEDS.get(topic, NEWS_FEEDS["general"])
    items = []
    seen = set()
    for feed_url in feeds:
        try:
            d = feedparser.parse(feed_url)
            source = ""
            try:
                source = d.feed.get("title", "")
            except Exception:
                pass
            for e in d.entries:
                link = e.get("link", "")
                if not link or link in seen:
                    continue
                seen.add(link)
                items.append({
                    "title": (e.get("title", "") or "").strip(),
                    "summary": _clean_summary(e.get("summary", "")),
                    "image": _entry_image(e),
                    "source": source,
                    "link": link,
                    "published": e.get("published", "") or e.get("updated", ""),
                    "published_ts": _entry_timestamp(e),
                })
        except Exception as ex:
            logging.error(f"RSS feed failed ({feed_url}): {ex}")
    items.sort(key=lambda x: x.get("published_ts", 0), reverse=True)
    _NEWS_CACHE[topic] = (now, items)
    redis_cache.set_json(f"news:{topic}", items, _NEWS_TTL)
    return {"topic": topic, "items": items[:limit]}
