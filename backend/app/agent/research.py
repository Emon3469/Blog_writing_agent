from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from typing import List, Optional

from ..config import get_settings
from ..llm import is_configured
from .schemas import EvidenceItem

logger = logging.getLogger("draftsmith.research")


def _to_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        pass
    from email.utils import parsedate_to_datetime

    try:
        return parsedate_to_datetime(value).date()
    except (TypeError, ValueError):
        return None


async def _search(client, query: str, mode: str, max_results: int) -> List[dict]:
    kwargs = {"max_results": max_results, "search_depth": "basic", "timeout": 20}
    if mode == "open_book":
        kwargs.update(topic="news", days=7)
    try:
        response = await client.search(query, **kwargs)
        return response.get("results", []) or []
    except Exception as exc:
        logger.warning("search failed for %r: %s", query, exc)
        return []


async def gather_evidence(queries: List[str], mode: str, as_of: str, recency_days: int) -> List[EvidenceItem]:
    key = get_settings().tavily_api_key
    if not queries or not is_configured(key):
        return []
    from tavily import AsyncTavilyClient

    client = AsyncTavilyClient(api_key=key)
    batches = await asyncio.gather(*(_search(client, q, mode, 5) for q in queries[:6]))

    seen: dict[str, EvidenceItem] = {}
    for batch in batches:
        for row in batch:
            url = (row.get("url") or "").strip()
            if not url or url in seen:
                continue
            published = _to_date(row.get("published_date"))
            snippet = " ".join((row.get("content") or "").split())[:400]
            seen[url] = EvidenceItem(
                title=(row.get("title") or url)[:200],
                url=url,
                published_at=published.isoformat() if published else None,
                snippet=snippet or None,
                source=url.split("/")[2] if "://" in url else None,
            )

    evidence = list(seen.values())
    if mode == "open_book":
        cutoff = date.fromisoformat(as_of) - timedelta(days=recency_days)
        recent = [e for e in evidence if (d := _to_date(e.published_at)) and d >= cutoff]
        evidence = recent or evidence
    return evidence[:20]
