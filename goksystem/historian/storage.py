"""SQLite historian (WAL mode) with batched writes and CSV export. Refuses to open database paths that point at the old v2 data."""

import sqlite3
import threading
import os
import time
import csv
import io
from typing import List, Dict, Any, Optional
from goksystem.core.models import TelemetryPoint, AlarmRecord, EventRecord

FORBIDDEN_PATHS = ["iot simulation project", "digital_twin.db"]


class HistorianStorage:
    """Industrial historian with SQLite WAL backend and in-memory batch writes."""

    def __init__(self, db_path: str):
        norm_path = os.path.normpath(db_path).lower()
        for forbidden in FORBIDDEN_PATHS:
            if forbidden.lower() in norm_path:
                raise ValueError(f"SECURITY VIOLATION: Refusing to open legacy path '{db_path}' for writes!")

        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self._lock = threading.RLock()
        
        self._batch_queue: List[tuple] = []
        self._batch_size = 50
        
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        return conn

    def _init_db(self):
        with self._lock:
            with self._get_connection() as conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS telemetry_historian (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        device_id TEXT NOT NULL,
                        point_id TEXT NOT NULL,
                        value REAL NOT NULL,
                        unit TEXT NOT NULL,
                        quality TEXT NOT NULL,
                        sim_time REAL NOT NULL,
                        wall_time REAL NOT NULL
                    );
                """)
                conn.execute("CREATE INDEX IF NOT EXISTS idx_telem_dev_pt ON telemetry_historian(device_id, point_id, sim_time);")
                
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS alarm_historian (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        alarm_id TEXT NOT NULL,
                        source_device TEXT NOT NULL,
                        domain TEXT NOT NULL,
                        severity TEXT NOT NULL,
                        message TEXT NOT NULL,
                        value REAL NOT NULL,
                        state TEXT NOT NULL,
                        trigger_sim_time REAL NOT NULL,
                        ack_timestamp REAL,
                        clear_sim_time REAL
                    );
                """)
                
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS event_historian (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        event_id TEXT NOT NULL,
                        sim_time REAL NOT NULL,
                        domain TEXT NOT NULL,
                        source TEXT NOT NULL,
                        category TEXT NOT NULL,
                        severity TEXT NOT NULL,
                        message TEXT NOT NULL
                    );
                """)
                conn.commit()

    def record_telemetry(self, device_id: str, point: TelemetryPoint):
        with self._lock:
            self._batch_queue.append((
                device_id, point.point_id, point.value, point.unit,
                point.quality.value, point.sim_time, point.wall_time
            ))
            if len(self._batch_queue) >= self._batch_size:
                self.flush()

    def flush(self):
        with self._lock:
            if not self._batch_queue:
                return
            with self._get_connection() as conn:
                conn.executemany("""
                    INSERT INTO telemetry_historian (device_id, point_id, value, unit, quality, sim_time, wall_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?);
                """, self._batch_queue)
                conn.commit()
            self._batch_queue.clear()

    def query_trends(self, device_id: str, point_id: str, limit: int = 200) -> List[Dict[str, Any]]:
        self.flush()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT sim_time, wall_time, value, unit, quality
                FROM telemetry_historian
                WHERE device_id = ? AND point_id = ?
                ORDER BY sim_time DESC
                LIMIT ?;
            """, (device_id, point_id, limit))
            rows = cursor.fetchall()
            return [
                {"sim_time": r[0], "wall_time": r[1], "value": r[2], "unit": r[3], "quality": r[4]}
                for r in reversed(rows)
            ]

    def record_alarm(self, alarm: AlarmRecord):
        with self._lock:
            with self._get_connection() as conn:
                conn.execute("""
                    INSERT INTO alarm_historian (alarm_id, source_device, domain, severity, message, value, state, trigger_sim_time, ack_timestamp, clear_sim_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    alarm.alarm_id, alarm.source_device, alarm.domain.value, alarm.severity.value,
                    alarm.message, alarm.current_value, alarm.state.value, alarm.trigger_sim_time,
                    alarm.ack_timestamp, alarm.clear_sim_time
                ))
                conn.commit()

    def record_event(self, event: EventRecord):
        with self._lock:
            with self._get_connection() as conn:
                conn.execute("""
                    INSERT INTO event_historian (event_id, sim_time, domain, source, category, severity, message)
                    VALUES (?, ?, ?, ?, ?, ?, ?);
                """, (
                    event.event_id, event.timestamp_sim, event.domain.value, event.source,
                    event.category, event.severity.value, event.message
                ))
                conn.commit()

    def export_telemetry_csv(self, device_id: str, point_id: str) -> str:
        trends = self.query_trends(device_id, point_id, limit=5000)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["sim_time", "wall_time", "value", "unit", "quality"])
        for t in trends:
            writer.writerow([t["sim_time"], t["wall_time"], t["value"], t["unit"], t["quality"]])
        return output.getvalue()
