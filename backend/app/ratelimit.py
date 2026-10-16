from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window = window_seconds
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def __call__(self, request: Request) -> None:
        if self.limit <= 0:
            return
        forwarded = request.headers.get("x-forwarded-for", "")
        client = forwarded.split(",")[0].strip() or (request.client.host if request.client else "anon")
        now = time.monotonic()
        bucket = self.hits[client]
        while bucket and now - bucket[0] > self.window:
            bucket.popleft()
        if len(bucket) >= self.limit:
            retry = int(self.window - (now - bucket[0])) + 1
            raise HTTPException(
                status_code=429,
                detail=f"Too many requests. Try again in {retry} seconds.",
                headers={"Retry-After": str(retry)},
            )
        bucket.append(now)
        if len(self.hits) > 5000:
            stale = [k for k, v in self.hits.items() if not v or now - v[-1] > self.window]
            for k in stale:
                self.hits.pop(k, None)
