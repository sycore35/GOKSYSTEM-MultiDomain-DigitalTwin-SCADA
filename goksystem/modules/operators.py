"""Operator management: users, roles, permissions, sessions.

Authentication mode:
  * open (default, local demo): requests without a token act as the built-in 'local_operator'
    with the role in GOKSYSTEM_DEFAULT_ROLE (default ENGINEER). Everything is still audited.
  * required (GOKSYSTEM_AUTH_REQUIRED=1): a valid X-Operator-Token is mandatory for mutating calls.

This is a simulator access-control layer (PBKDF2 hashed PINs, in-memory sessions), not a hardened
identity system.
"""
import hashlib
import hmac
import os
import secrets
import sqlite3
import threading
import time
from typing import Dict, List, Optional

ROLE_PERMISSIONS: Dict[str, List[str]] = {
    "VIEWER": ["VIEW"],
    "OPERATOR": ["VIEW", "ACK_ALARM", "SHELVE_ALARM", "COMMAND", "SIM_PAUSE", "SCENARIO_RUN"],
    "ENGINEER": ["VIEW", "ACK_ALARM", "SHELVE_ALARM", "COMMAND", "SIM_PAUSE", "SCENARIO_RUN", "INJECT_FAULT",
                 "EDIT_ASSETS", "EDIT_TWIN", "PID_TUNE", "PLC_EDIT", "ALARM_CONFIG", "PROTOCOL_CONTROL"],
    "ADMIN": ["VIEW", "ACK_ALARM", "SHELVE_ALARM", "COMMAND", "SIM_PAUSE", "SCENARIO_RUN", "INJECT_FAULT",
              "EDIT_ASSETS", "EDIT_TWIN", "PID_TUNE", "PLC_EDIT", "ALARM_CONFIG", "PROTOCOL_CONTROL",
              "SIM_RESET", "MANAGE_USERS"],
}
ROLES = list(ROLE_PERMISSIONS)

# Local demo accounts, created on first start only. Change PINs via the API (ADMIN) for any shared use.
DEFAULT_USERS = [
    ("viewer", "Viewer", "VIEWER", "1111"),
    ("operator", "Operator", "OPERATOR", "2222"),
    ("engineer", "Engineer", "ENGINEER", "3333"),
    ("admin", "Administrator", "ADMIN", "9999"),
]
SESSION_TTL = 8 * 3600


def _hash_pin(pin: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, 120_000).hex()


class Operator:
    def __init__(self, username: str, display: str, role: str):
        self.username, self.display, self.role = username, display, role

    @property
    def permissions(self) -> List[str]:
        return ROLE_PERMISSIONS.get(self.role, [])

    def can(self, perm: str) -> bool:
        return perm in self.permissions

    def to_dict(self) -> dict:
        return {"username": self.username, "display": self.display, "role": self.role, "permissions": self.permissions}


class OperatorManager:
    def __init__(self, db_path: str, auth_required: Optional[bool] = None, default_role: Optional[str] = None):
        self.db_path = db_path
        self._lock = threading.RLock()
        self._sessions: Dict[str, tuple] = {}
        self.auth_required = (os.environ.get("GOKSYSTEM_AUTH_REQUIRED", "0") == "1") if auth_required is None else auth_required
        role = (default_role or os.environ.get("GOKSYSTEM_DEFAULT_ROLE", "ENGINEER")).upper()
        self.default_role = role if role in ROLES else "ENGINEER"
        with self._conn() as c:
            c.execute("CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, display TEXT, role TEXT, salt TEXT, pin_hash TEXT, active INTEGER DEFAULT 1, created REAL)")
            if c.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
                for u, d, r, pin in DEFAULT_USERS:
                    salt = secrets.token_bytes(16)
                    c.execute("INSERT INTO users VALUES (?,?,?,?,?,1,?)", (u, d, r, salt.hex(), _hash_pin(pin, salt), time.time()))

    def _conn(self):
        c = sqlite3.connect(self.db_path, timeout=10.0)
        c.row_factory = sqlite3.Row
        return c

    def anonymous(self) -> Operator:
        return Operator("local_operator", "Local demo operator", self.default_role)

    def login(self, username: str, pin: str) -> Optional[dict]:
        with self._conn() as c:
            r = c.execute("SELECT * FROM users WHERE username=? AND active=1", (username,)).fetchone()
        if not r:
            _hash_pin(pin, b"x" * 16)  # keep timing similar
            return None
        if not hmac.compare_digest(_hash_pin(pin, bytes.fromhex(r["salt"])), r["pin_hash"]):
            return None
        tok = secrets.token_urlsafe(24)
        with self._lock:
            self._sessions[tok] = (Operator(r["username"], r["display"], r["role"]), time.time() + SESSION_TTL)
        return {"token": tok, "operator": Operator(r["username"], r["display"], r["role"]).to_dict(), "expires_in_s": SESSION_TTL}

    def logout(self, token: str):
        with self._lock:
            self._sessions.pop(token, None)

    def resolve(self, token: Optional[str]) -> Optional[Operator]:
        if not token:
            return None
        with self._lock:
            ent = self._sessions.get(token)
            if not ent:
                return None
            if ent[1] < time.time():
                self._sessions.pop(token, None)
                return None
            return ent[0]

    def list_users(self) -> List[dict]:
        with self._conn() as c:
            return [{"username": r["username"], "display": r["display"], "role": r["role"], "active": bool(r["active"])}
                    for r in c.execute("SELECT * FROM users ORDER BY username")]

    def upsert_user(self, username: str, display: str, role: str, pin: Optional[str] = None, active: bool = True) -> dict:
        role = role.upper()
        if role not in ROLES:
            raise ValueError(f"role must be one of {ROLES}")
        if not username or not username.replace("_", "").replace("-", "").isalnum():
            raise ValueError("username must be alphanumeric")
        with self._lock, self._conn() as c:
            cur = c.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
            if cur is None:
                if not pin or len(pin) < 4:
                    raise ValueError("PIN (min 4 chars) required for a new user")
                salt = secrets.token_bytes(16)
                c.execute("INSERT INTO users VALUES (?,?,?,?,?,?,?)", (username, display or username, role, salt.hex(), _hash_pin(pin, salt), int(active), time.time()))
            else:
                if pin:
                    if len(pin) < 4:
                        raise ValueError("PIN must be at least 4 chars")
                    salt = secrets.token_bytes(16)
                    c.execute("UPDATE users SET salt=?, pin_hash=? WHERE username=?", (salt.hex(), _hash_pin(pin, salt), username))
                c.execute("UPDATE users SET display=?, role=?, active=? WHERE username=?", (display or cur["display"], role, int(active), username))
                if not active or role != cur["role"]:
                    for t in [t for t, (op, _) in self._sessions.items() if op.username == username]:
                        self._sessions.pop(t, None)
        return {"username": username, "display": display or username, "role": role, "active": active}
