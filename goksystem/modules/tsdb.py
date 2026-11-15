"""Millisecond/second time-series store with downsampling queries.

* Samples are stored with an integer millisecond timestamp (SQLite, WAL, WITHOUT ROWID).
* A per-series in-memory ring keeps the most recent samples for low-latency live trends.
* Queries support raw retrieval, bucketed downsampling (avg/min/max/sum/count) and automatic
  bucket selection so a long range never returns more than `limit` points.
"""
import math
import sqlite3
import threading
import time
from collections import deque
from typing import Deque, Dict, List, Optional, Tuple

AGGS = {"avg": "AVG(v)", "min": "MIN(v)", "max": "MAX(v)", "sum": "SUM(v)", "count": "COUNT(v)"}


class TimeSeriesDB:
    def __init__(self, db_path: str, ring_size: int = 6000, retention_s: float = 6 * 3600, autoflush: bool = True):
        self.db_path = db_path
        self.ring_size = ring_size
        self.retention_ms = int(retention_s * 1000)
        self._lock = threading.RLock()
        self._rings: Dict[str, Deque[Tuple[int, float]]] = {}
        self._queue: List[Tuple[str, int, float]] = []
        self._units: Dict[str, str] = {}
        self._autoflush = autoflush
        self._flusher: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._last_prune = 0.0
        with self._conn() as c:
            c.execute("CREATE TABLE IF NOT EXISTS ts_samples (series TEXT NOT NULL, ts_ms INTEGER NOT NULL, v REAL NOT NULL, PRIMARY KEY(series, ts_ms)) WITHOUT ROWID")

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self.db_path, timeout=10.0)
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA synchronous=NORMAL")
        return c

    # writing
    def record(self, series: str, value: float, ts_ms: Optional[int] = None, unit: str = ""):
        self.record_many([(series, value, unit)], ts_ms)

    def record_many(self, items, ts_ms: Optional[int] = None):
        """items: iterable of (series, value[, unit])."""
        ts = int(ts_ms if ts_ms is not None else time.time() * 1000)
        with self._lock:
            for it in items:
                series, value = it[0], float(it[1])
                if len(it) > 2 and it[2]:
                    self._units[series] = it[2]
                ring = self._rings.get(series)
                if ring is None:
                    ring = self._rings[series] = deque(maxlen=self.ring_size)
                ring.append((ts, value))
                self._queue.append((series, ts, value))
        if self._autoflush:
            self._ensure_flusher()

    def _ensure_flusher(self):
        if self._flusher is None or not self._flusher.is_alive():
            self._stop.clear()
            self._flusher = threading.Thread(target=self._flush_loop, daemon=True, name="TSDBFlusher")
            self._flusher.start()

    def _flush_loop(self):
        while not self._stop.wait(1.0):
            try:
                self.flush()
                if time.time() - self._last_prune > 300:
                    self.prune()
            except Exception:
                pass

    def flush(self):
        with self._lock:
            batch, self._queue = self._queue, []
        if not batch:
            return 0
        with self._conn() as c:
            c.executemany("INSERT OR REPLACE INTO ts_samples(series, ts_ms, v) VALUES (?,?,?)", batch)
        return len(batch)

    def prune(self):
        self._last_prune = time.time()
        cutoff = int(time.time() * 1000) - self.retention_ms
        with self._conn() as c:
            c.execute("DELETE FROM ts_samples WHERE ts_ms < ?", (cutoff,))

    def close(self):
        self._stop.set()
        self.flush()

    # reading
    def series_list(self) -> List[dict]:
        with self._lock:
            return [{"series": s, "unit": self._units.get(s, ""), "live_samples": len(r),
                     "last": r[-1][1] if r else None} for s, r in sorted(self._rings.items())]

    def latest(self, series: str, n: int = 100) -> List[dict]:
        """Most recent n samples from the in-memory ring (no disk)."""
        with self._lock:
            ring = self._rings.get(series)
            data = list(ring)[-n:] if ring else []
        return [{"t": t, "v": v} for t, v in data]

    def window(self, series: str, seconds: float, max_points: int = 600) -> List[dict]:
        """Recent window from the ring, thinned by averaging to <= max_points."""
        now = int(time.time() * 1000)
        with self._lock:
            ring = self._rings.get(series)
            data = [(t, v) for t, v in (ring or []) if t >= now - seconds * 1000]
        if len(data) <= max_points:
            return [{"t": t, "v": v} for t, v in data]
        step = math.ceil(len(data) / max_points)
        out = []
        for i in range(0, len(data), step):
            ch = data[i:i + step]
            out.append({"t": ch[len(ch) // 2][0], "v": sum(v for _, v in ch) / len(ch)})
        return out

    def count(self, series: str, t0: int, t1: int) -> int:
        with self._conn() as c:
            return c.execute("SELECT COUNT(*) FROM ts_samples WHERE series=? AND ts_ms BETWEEN ? AND ?", (series, t0, t1)).fetchone()[0]

    def query(self, series: str, t0_ms: Optional[int] = None, t1_ms: Optional[int] = None,
              bucket_ms: Optional[int] = None, agg: str = "avg", limit: int = 2000) -> dict:
        """Range query. If bucket_ms is None and the range has more than `limit` rows, a bucket is chosen automatically."""
        if agg not in AGGS:
            raise ValueError(f"agg must be one of {sorted(AGGS)}")
        self.flush()
        t1 = int(t1_ms if t1_ms is not None else time.time() * 1000)
        t0 = int(t0_ms if t0_ms is not None else t1 - 300_000)
        if t0 > t1:
            t0, t1 = t1, t0
        limit = max(10, min(int(limit), 20000))
        total = self.count(series, t0, t1)
        auto = False
        if not bucket_ms and total > limit:
            bucket_ms = max(1, math.ceil((t1 - t0 + 1) / limit))
            auto = True
        with self._conn() as c:
            if bucket_ms and bucket_ms > 1:
                bucket_ms = int(bucket_ms)
                rows = c.execute(
                    f"SELECT (ts_ms/?)*? AS b, {AGGS[agg]}, MIN(v), MAX(v), COUNT(*) FROM ts_samples "
                    "WHERE series=? AND ts_ms BETWEEN ? AND ? GROUP BY b ORDER BY b LIMIT ?",
                    (bucket_ms, bucket_ms, series, t0, t1, limit)).fetchall()
                pts = [{"t": r[0], "v": r[1], "min": r[2], "max": r[3], "n": r[4]} for r in rows]
            else:
                rows = c.execute("SELECT ts_ms, v FROM ts_samples WHERE series=? AND ts_ms BETWEEN ? AND ? ORDER BY ts_ms LIMIT ?",
                                 (series, t0, t1, limit)).fetchall()
                pts = [{"t": r[0], "v": r[1], "min": r[1], "max": r[1], "n": 1} for r in rows]
                bucket_ms = None
        return {"series": series, "unit": self._units.get(series, ""), "t0": t0, "t1": t1, "bucket_ms": bucket_ms,
                "auto_bucket": auto, "agg": agg, "raw_count": total, "points": pts}
