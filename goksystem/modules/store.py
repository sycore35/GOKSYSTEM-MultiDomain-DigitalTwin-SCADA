"""Persistent platform store (SQLite): asset inventory, digital-twin layout, alarm events, audit chain."""
import hashlib
import json
import sqlite3
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

ASSET_TYPES = ["PLC", "MOTOR", "PUMP", "VALVE", "SENSOR", "TRANSFORMER", "CONVEYOR", "ROBOT",
               "BREAKER", "TANK", "HVAC", "BATTERY", "INVERTER", "OTHER"]
ASSET_STATUS = ["IN_SERVICE", "SPARE", "MAINTENANCE", "DECOMMISSIONED"]
TWIN_KINDS = ["MOTOR", "PUMP", "VALVE", "TANK", "SENSOR", "PLC_CABINET", "TRANSFORMER", "BOX"]

DEVICE_TYPE_TO_ASSET = {
    "CONVEYOR": "CONVEYOR", "VFD_MOTOR": "MOTOR", "ROBOT_ARM": "ROBOT", "PHOTO_SENSOR": "SENSOR",
    "E_STOP": "SENSOR", "TRANSFORMER": "TRANSFORMER", "CIRCUIT_BREAKER": "BREAKER", "BUSBAR_11KV": "OTHER",
    "PROTECTION_RELAY": "OTHER", "TANK": "TANK", "PUMP": "PUMP", "CONTROL_VALVE": "VALVE", "PID_CONTROLLER": "PLC",
    "FLOW_SENSOR": "SENSOR", "HVAC_ZONE": "HVAC", "SOLAR_INVERTER": "INVERTER", "BMS_BATTERY": "BATTERY",
    "ENERGY_METER": "SENSOR",
}


class ValidationError(ValueError):
    pass


class PlatformStore:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._lock = threading.RLock()
        with self._conn() as c:
            c.executescript("""
            CREATE TABLE IF NOT EXISTS assets (
                asset_id TEXT PRIMARY KEY, tag TEXT NOT NULL UNIQUE, name TEXT NOT NULL, type TEXT NOT NULL,
                manufacturer TEXT DEFAULT '', model TEXT DEFAULT '', serial TEXT DEFAULT '', location TEXT DEFAULT '',
                status TEXT DEFAULT 'IN_SERVICE', install_date TEXT DEFAULT '', device_id TEXT DEFAULT '',
                notes TEXT DEFAULT '', attrs TEXT DEFAULT '{}', created REAL, updated REAL);
            CREATE TABLE IF NOT EXISTS twin_items (
                item_id TEXT PRIMARY KEY, device_id TEXT DEFAULT '', bind_device TEXT DEFAULT '', kind TEXT NOT NULL,
                label TEXT NOT NULL, x REAL DEFAULT 0, y REAL DEFAULT 0, z REAL DEFAULT 0, rot_y REAL DEFAULT 0,
                scale REAL DEFAULT 1, color TEXT DEFAULT '#7A8A99', custom INTEGER DEFAULT 0, updated REAL);
            CREATE TABLE IF NOT EXISTS alarm_events (
                seq INTEGER PRIMARY KEY AUTOINCREMENT, wall_time REAL, sim_time REAL, alarm_id TEXT, source_device TEXT,
                priority INTEGER, severity TEXT, from_state TEXT, to_state TEXT, value REAL, operator TEXT, note TEXT);
            CREATE INDEX IF NOT EXISTS idx_alarm_events_t ON alarm_events(wall_time);
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, actor TEXT, role TEXT, action TEXT, target TEXT,
                status TEXT, details TEXT, prev_hash TEXT, hash TEXT);
            """)

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self.db_path, timeout=10.0)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        return c

    # assets
    def _asset_row(self, r) -> dict:
        d = dict(r)
        d["attrs"] = json.loads(d.get("attrs") or "{}")
        return d

    def list_assets(self, type_: Optional[str] = None, status: Optional[str] = None, q: Optional[str] = None) -> List[dict]:
        sql, args = "SELECT * FROM assets WHERE 1=1", []
        if type_:
            sql += " AND type=?"; args.append(type_)
        if status:
            sql += " AND status=?"; args.append(status)
        if q:
            sql += " AND (tag LIKE ? OR name LIKE ? OR serial LIKE ? OR location LIKE ?)"
            args += [f"%{q}%"] * 4
        with self._conn() as c:
            return [self._asset_row(r) for r in c.execute(sql + " ORDER BY tag", args)]

    def get_asset(self, asset_id: str) -> Optional[dict]:
        with self._conn() as c:
            r = c.execute("SELECT * FROM assets WHERE asset_id=? OR device_id=? OR tag=?", (asset_id, asset_id, asset_id)).fetchone()
            return self._asset_row(r) if r else None

    def upsert_asset(self, data: Dict[str, Any], asset_id: Optional[str] = None) -> dict:
        tag = (data.get("tag") or "").strip()
        name = (data.get("name") or "").strip()
        typ = (data.get("type") or "").upper()
        if asset_id is None and (not tag or not name):
            raise ValidationError("tag and name are required")
        if typ and typ not in ASSET_TYPES:
            raise ValidationError(f"type must be one of {ASSET_TYPES}")
        status = (data.get("status") or "IN_SERVICE").upper()
        if status not in ASSET_STATUS:
            raise ValidationError(f"status must be one of {ASSET_STATUS}")
        now = time.time()
        with self._lock, self._conn() as c:
            if asset_id is None:
                if c.execute("SELECT 1 FROM assets WHERE tag=?", (tag,)).fetchone():
                    raise ValidationError(f"tag '{tag}' already exists")
                aid = "AST-" + uuid.uuid4().hex[:8].upper()
                c.execute("INSERT INTO assets VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                    aid, tag, name, typ or "OTHER", data.get("manufacturer", ""), data.get("model", ""),
                    data.get("serial", ""), data.get("location", ""), status, data.get("install_date", ""),
                    data.get("device_id", ""), data.get("notes", ""), json.dumps(data.get("attrs") or {}), now, now))
                created = aid
            else:
                created = None
        if created:
            return self.get_asset(created)
        with self._lock, self._conn() as c:
            cur = c.execute("SELECT * FROM assets WHERE asset_id=?", (asset_id,)).fetchone()
            if not cur:
                raise KeyError(asset_id)
            merged = dict(cur)
            for k in ("tag", "name", "type", "manufacturer", "model", "serial", "location", "status",
                      "install_date", "device_id", "notes"):
                if k in data and data[k] is not None:
                    merged[k] = data[k]
            merged["type"] = (merged["type"] or "OTHER").upper()
            if merged["type"] not in ASSET_TYPES:
                raise ValidationError(f"type must be one of {ASSET_TYPES}")
            merged["status"] = merged["status"].upper()
            if merged["status"] not in ASSET_STATUS:
                raise ValidationError(f"status must be one of {ASSET_STATUS}")
            attrs = data.get("attrs") if data.get("attrs") is not None else json.loads(cur["attrs"] or "{}")
            c.execute("""UPDATE assets SET tag=?,name=?,type=?,manufacturer=?,model=?,serial=?,location=?,status=?,
                         install_date=?,device_id=?,notes=?,attrs=?,updated=? WHERE asset_id=?""", (
                merged["tag"], merged["name"], merged["type"], merged["manufacturer"], merged["model"], merged["serial"],
                merged["location"], merged["status"], merged["install_date"], merged["device_id"], merged["notes"],
                json.dumps(attrs), now, asset_id))
        return self.get_asset(asset_id)

    def delete_asset(self, asset_id: str) -> bool:
        with self._lock, self._conn() as c:
            return c.execute("DELETE FROM assets WHERE asset_id=?", (asset_id,)).rowcount > 0

    def seed_assets(self, devices) -> int:
        """Create inventory rows from the device registry (+ a PLC and field sensors) if the table is empty."""
        with self._conn() as c:
            if c.execute("SELECT COUNT(*) FROM assets").fetchone()[0] > 0:
                return 0
        n = 0
        mfr = {"VFD_MOTOR": ("ABB", "ACS880 + M3AA 160"), "TRANSFORMER": ("Generic", "ONAN 2.5 MVA"),
               "PUMP": ("Generic", "Centrifugal 7.5 kW")}
        for d in devices:
            t = d.type.value if hasattr(d.type, "value") else str(d.type)
            m = mfr.get(t, ("", ""))
            self.upsert_asset({"tag": d.device_id, "name": d.name, "type": DEVICE_TYPE_TO_ASSET.get(t, "OTHER"),
                               "manufacturer": m[0], "model": m[1], "location": f"{d.domain.value} zone",
                               "device_id": d.device_id, "notes": d.description, "install_date": "2024-03-01"})
            n += 1
        extras = [
            {"tag": "PLC-MAIN-01", "name": "Main Line PLC (simulated)", "type": "PLC", "manufacturer": "Simulated", "model": "GOK-SOFTPLC v1", "location": "Control room", "notes": "Runs the PLC Logic Simulator program"},
            {"tag": "TT-MOT-01", "name": "Motor winding temperature sensor", "type": "SENSOR", "location": "FAC motor", "device_id": "", "notes": "PT100, 4-20 mA"},
            {"tag": "VT-MOT-01", "name": "Motor bearing vibration sensor", "type": "SENSOR", "location": "FAC motor", "notes": "IEPE accelerometer"},
            {"tag": "LT-TANK-01", "name": "Tank level transmitter", "type": "SENSOR", "location": "PROC tank", "notes": "Radar 0-4 m"},
        ]
        for e in extras:
            self.upsert_asset(e); n += 1
        return n

    # twin
    def list_twin(self) -> List[dict]:
        with self._conn() as c:
            return [dict(r) for r in c.execute("SELECT * FROM twin_items ORDER BY item_id")]

    def upsert_twin(self, data: Dict[str, Any], item_id: Optional[str] = None) -> dict:
        kind = (data.get("kind") or "BOX").upper()
        if kind not in TWIN_KINDS:
            raise ValidationError(f"kind must be one of {TWIN_KINDS}")
        for k in ("x", "y", "z"):
            if k in data and not (-200.0 <= float(data[k]) <= 200.0):
                raise ValidationError(f"{k} out of range [-200, 200]")
        now = time.time()
        with self._lock, self._conn() as c:
            cur = c.execute("SELECT * FROM twin_items WHERE item_id=?", (item_id,)).fetchone() if item_id else None
            if cur is None:
                if item_id is None:
                    item_id = "TW-" + uuid.uuid4().hex[:6].upper()
                    custom = 1
                else:
                    custom = 1 if data.get("custom") else 0
                c.execute("INSERT INTO twin_items VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                    item_id, data.get("device_id", ""), data.get("bind_device", ""), kind,
                    (data.get("label") or item_id), float(data.get("x", 0)), float(data.get("y", 0)),
                    float(data.get("z", 0)), float(data.get("rot_y", 0)), float(data.get("scale", 1)),
                    data.get("color", "#7A8A99"), custom, now))
            else:
                m = dict(cur)
                for k in ("device_id", "bind_device", "kind", "label", "x", "y", "z", "rot_y", "scale", "color"):
                    if k in data and data[k] is not None:
                        m[k] = data[k]
                c.execute("UPDATE twin_items SET device_id=?,bind_device=?,kind=?,label=?,x=?,y=?,z=?,rot_y=?,scale=?,color=?,updated=? WHERE item_id=?",
                          (m["device_id"], m["bind_device"], str(m["kind"]).upper(), m["label"], float(m["x"]), float(m["y"]),
                           float(m["z"]), float(m["rot_y"]), float(m["scale"]), m["color"], now, item_id))
            return dict(c.execute("SELECT * FROM twin_items WHERE item_id=?", (item_id,)).fetchone())

    def delete_twin(self, item_id: str) -> bool:
        """Custom items are removed; built-in device overrides are reset (row deleted -> default position)."""
        with self._lock, self._conn() as c:
            return c.execute("DELETE FROM twin_items WHERE item_id=?", (item_id,)).rowcount > 0

    def reset_twin(self):
        with self._lock, self._conn() as c:
            c.execute("DELETE FROM twin_items")

    # alarm events
    def add_alarm_event(self, ev: dict):
        with self._lock, self._conn() as c:
            c.execute("INSERT INTO alarm_events(wall_time,sim_time,alarm_id,source_device,priority,severity,from_state,to_state,value,operator,note) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                      (ev["wall_time"], ev["sim_time"], ev["alarm_id"], ev["source_device"], ev["priority"], ev["severity"],
                       ev["from_state"], ev["to_state"], ev["value"], ev["operator"], ev["note"]))

    def query_alarm_events(self, limit: int = 200, alarm_id: Optional[str] = None, since: Optional[float] = None) -> List[dict]:
        sql, args = "SELECT * FROM alarm_events WHERE 1=1", []
        if alarm_id:
            sql += " AND alarm_id=?"; args.append(alarm_id)
        if since:
            sql += " AND wall_time>=?"; args.append(since)
        with self._conn() as c:
            return [dict(r) for r in c.execute(sql + " ORDER BY seq DESC LIMIT ?", args + [limit])]

    # audit
    @staticmethod
    def _hash(prev: str, ts: float, actor: str, role: str, action: str, target: str, status: str, details: str) -> str:
        return hashlib.sha256("|".join([prev, repr(ts), actor, role, action, target, status, details]).encode()).hexdigest()

    def audit(self, actor: str, role: str, action: str, target: str = "", status: str = "OK", details: Optional[dict] = None) -> dict:
        details_s = json.dumps(details or {}, sort_keys=True, default=str)
        ts = time.time()
        with self._lock, self._conn() as c:
            last = c.execute("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1").fetchone()
            prev = last["hash"] if last else "GENESIS"
            h = self._hash(prev, ts, actor, role, action, target, status, details_s)
            cur = c.execute("INSERT INTO audit_log(ts,actor,role,action,target,status,details,prev_hash,hash) VALUES (?,?,?,?,?,?,?,?,?)",
                            (ts, actor, role, action, target, status, details_s, prev, h))
            return {"id": cur.lastrowid, "ts": ts, "actor": actor, "role": role, "action": action,
                    "target": target, "status": status, "hash": h}

    def query_audit(self, limit: int = 100, actor: Optional[str] = None, action: Optional[str] = None) -> List[dict]:
        sql, args = "SELECT * FROM audit_log WHERE 1=1", []
        if actor:
            sql += " AND actor=?"; args.append(actor)
        if action:
            sql += " AND action LIKE ?"; args.append(f"%{action}%")
        with self._conn() as c:
            rows = [dict(r) for r in c.execute(sql + " ORDER BY id DESC LIMIT ?", args + [limit])]
        for r in rows:
            r["details"] = json.loads(r["details"] or "{}")
        return rows

    def verify_audit_chain(self) -> dict:
        """Recompute the hash chain. Detects edited/removed rows (tamper-evident, not tamper-proof)."""
        with self._conn() as c:
            rows = list(c.execute("SELECT * FROM audit_log ORDER BY id"))
        prev = "GENESIS"
        for r in rows:
            if r["prev_hash"] != prev or r["hash"] != self._hash(prev, r["ts"], r["actor"], r["role"], r["action"], r["target"], r["status"], r["details"]):
                return {"valid": False, "records": len(rows), "broken_at_id": r["id"]}
            prev = r["hash"]
        return {"valid": True, "records": len(rows), "broken_at_id": None}
