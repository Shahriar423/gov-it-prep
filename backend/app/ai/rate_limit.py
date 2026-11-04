"""A small in-process limiter: at most N requests in any rolling 60 seconds.
Generation runs inside one server process, so this is enough."""
import asyncio
import time
from collections import deque


class AsyncRateLimiter:
    def __init__(self, max_per_minute: int):
        self.max = max(1, int(max_per_minute))
        self._stamps: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        while True:
            async with self._lock:
                now = time.monotonic()
                while self._stamps and now - self._stamps[0] >= 60:
                    self._stamps.popleft()
                if len(self._stamps) < self.max:
                    self._stamps.append(now)
                    return
                wait = 60 - (now - self._stamps[0])
            await asyncio.sleep(max(wait, 0.05))