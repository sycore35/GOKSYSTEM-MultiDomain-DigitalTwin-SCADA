"""GÖKSYSTEM 3.0 SCADA Alarm Engine (ISA-18.2 approach).

Lifecycle states (names follow the ISA-18.2 alarm-state-transition idea; this is an
*approach*, not a compliance claim):

    NORMAL      -> UNACK_ALARM   limit exceeded (after optional on-delay)
    UNACK_ALARM -> ACK_ALARM     operator acknowledges
    UNACK_ALARM -> RTN_UNACK     condition cleared before acknowledge (beyond deadband)
    ACK_ALARM   -> NORMAL        condition cleared (beyond deadband)
    RTN_UNACK   -> NORMAL        operator acknowledges the return-to-normal
    RTN_UNACK   -> UNACK_ALARM   condition re-trips before it was acknowledged
    any active  -> SHELVED       operator shelves with a reason and a time limit
    SHELVED     -> UNACK_ALARM / NORMAL   on unshelve or automatic expiry,
                                 depending on whether the condition is still true

Additional features: priority (1..4 derived from severity), deadband (default percentage
or per-alarm absolute override), per-alarm on-delay, transition history, and
rate/shelf/bad-actor statistics.
"""

import threading
import time
from collections import deque
from typing import Callable, Deque, Dict, List, Optional, Tuple
from goksystem.core.models import (
    AlarmRecord, AlarmState, Severity, DomainType
)

SEVERITY_PRIORITY = {
    Severity.CRITICAL: 1,
    Severity.HIGH: 2,
    Severity.MEDIUM: 3,
    Severity.LOW: 4,
    Severity.INFO: 4,
}
MAX_SHELVE_SECONDS = 8 * 3600


class AlarmEngine:
    """Thread-safe alarm annunciator and manager."""

    def __init__(self, deadband_pct: float = 0.015, event_limit: int = 5000):
        self._lock = threading.RLock()
        self._alarms: Dict[str, AlarmRecord] = {}
        self._alarm_history: List[AlarmRecord] = []
        self._events: Deque[dict] = deque(maxlen=event_limit)
        self._seq = 0
        self._pending: Dict[str, float] = {}       # alarm_id -> sim_time condition first true (on-delay)
        self._config: Dict[str, dict] = {}         # alarm_id -> {"deadband": abs, "on_delay_s": s}
        self._occurrence_counts: Dict[str, int] = {}
        self.event_sink: Optional[Callable[[dict], None]] = None   # persistence hook

        # Default deadband margin to prevent chattering (e.g. 1.5%)
        self.deadband_pct = deadband_pct

    # config
    def configure_alarm(self, alarm_id: str, deadband: Optional[float] = None, on_delay_s: Optional[float] = None):
        with self._lock:
            cfg = self._config.setdefault(alarm_id, {})
            if deadband is not None:
                cfg["deadband"] = max(0.0, float(deadband))
            if on_delay_s is not None:
                cfg["on_delay_s"] = max(0.0, float(on_delay_s))
            return dict(cfg)

    def get_config(self) -> Dict[str, dict]:
        with self._lock:
            return {k: dict(v) for k, v in self._config.items()}

    # events
    def _log(self, rec: AlarmRecord, from_state: Optional[AlarmState], to_state: AlarmState,
             sim_time: float, operator: Optional[str] = None, note: str = ""):
        self._seq += 1
        ev = {
            "seq": self._seq,
            "wall_time": time.time(),
            "sim_time": sim_time,
            "alarm_id": rec.alarm_id,
            "source_device": rec.source_device,
            "priority": rec.priority,
            "severity": rec.severity.value,
            "from_state": from_state.value if from_state else None,
            "to_state": to_state.value,
            "value": rec.current_value,
            "operator": operator,
            "note": note,
        }
        self._events.append(ev)
        if self.event_sink:
            try:
                self.event_sink(ev)
            except Exception:
                pass

    # evaluation
    def evaluate_limit(
        self,
        alarm_id: str,
        source_device: str,
        tag_id: str,
        domain: DomainType,
        current_val: float,
        limit_val: float,
        is_high_alarm: bool,
        severity: Severity,
        message: str,
        sim_time: float,
        deadband: Optional[float] = None,
        on_delay_s: Optional[float] = None,
    ) -> Optional[AlarmRecord]:
        """Check value against boundary with hysteresis deadband. Returns the record on a state change."""
        with self._lock:
            cfg = self._config.get(alarm_id, {})
            if deadband is None:
                deadband = cfg.get("deadband")
            if deadband is None:
                deadband = abs(limit_val) * self.deadband_pct if limit_val != 0 else 0.5
            if on_delay_s is None:
                on_delay_s = cfg.get("on_delay_s", 0.0)

            existing = self._alarms.get(alarm_id)
            self._expire_shelves_locked(sim_time)
            existing = self._alarms.get(alarm_id)

            if is_high_alarm:
                condition_active = current_val > limit_val
                condition_cleared = current_val < (limit_val - deadband)
            else:
                condition_active = current_val < limit_val
                condition_cleared = current_val > (limit_val + deadband)

            if not condition_active:
                self._pending.pop(alarm_id, None)

            if condition_active:
                if not existing or existing.state == AlarmState.NORMAL:
                    # On-delay filter (sim seconds)
                    if on_delay_s > 0:
                        first = self._pending.setdefault(alarm_id, sim_time)
                        if sim_time - first < on_delay_s:
                            return None
                    self._pending.pop(alarm_id, None)
                    count = self._occurrence_counts.get(alarm_id, 0) + 1
                    self._occurrence_counts[alarm_id] = count
                    record = AlarmRecord(
                        alarm_id=alarm_id,
                        source_device=source_device,
                        tag_id=tag_id,
                        domain=domain,
                        severity=severity,
                        message=message,
                        current_value=round(current_val, 2),
                        setpoint_or_limit=round(limit_val, 2),
                        state=AlarmState.UNACK_ALARM,
                        trigger_sim_time=sim_time,
                        priority=SEVERITY_PRIORITY.get(severity, 3),
                        occurrences=count,
                        deadband=round(deadband, 4),
                    )
                    self._alarms[alarm_id] = record
                    self._alarm_history.append(record)
                    self._log(record, existing.state if existing else None, AlarmState.UNACK_ALARM, sim_time)
                    return record
                existing.condition_active = True
                existing.current_value = round(current_val, 2)
                if existing.state == AlarmState.RTN_UNACK:
                    existing.state = AlarmState.UNACK_ALARM
                    existing.clear_sim_time = None
                    self._log(existing, AlarmState.RTN_UNACK, AlarmState.UNACK_ALARM, sim_time, note="re-trip")
                    return existing
            elif condition_cleared and existing:
                existing.current_value = round(current_val, 2)
                existing.condition_active = False
                if existing.state == AlarmState.UNACK_ALARM:
                    existing.state = AlarmState.RTN_UNACK
                    existing.clear_sim_time = sim_time
                    self._log(existing, AlarmState.UNACK_ALARM, AlarmState.RTN_UNACK, sim_time)
                    return existing
                elif existing.state == AlarmState.ACK_ALARM:
                    existing.state = AlarmState.NORMAL
                    existing.clear_sim_time = sim_time
                    self._log(existing, AlarmState.ACK_ALARM, AlarmState.NORMAL, sim_time)
                    return existing
            elif existing and existing.state != AlarmState.NORMAL:
                existing.current_value = round(current_val, 2)
            return None

    # operator
    def acknowledge_alarm(self, alarm_id: str, operator_id: str) -> bool:
        """Operator acknowledge transition."""
        with self._lock:
            alarm = self._alarms.get(alarm_id)
            if not alarm:
                return False
            now = time.time()
            if alarm.state == AlarmState.UNACK_ALARM:
                alarm.state = AlarmState.ACK_ALARM
                alarm.ack_by = operator_id
                alarm.ack_timestamp = now
                self._log(alarm, AlarmState.UNACK_ALARM, AlarmState.ACK_ALARM, alarm.trigger_sim_time, operator_id)
                return True
            elif alarm.state == AlarmState.RTN_UNACK:
                alarm.state = AlarmState.NORMAL
                alarm.ack_by = operator_id
                alarm.ack_timestamp = now
                self._log(alarm, AlarmState.RTN_UNACK, AlarmState.NORMAL, alarm.clear_sim_time or 0.0, operator_id)
                return True
            return False

    def acknowledge_all(self, operator_id: str) -> int:
        with self._lock:
            ids = [a.alarm_id for a in self._alarms.values()
                   if a.state in (AlarmState.UNACK_ALARM, AlarmState.RTN_UNACK)]
            return sum(1 for i in ids if self.acknowledge_alarm(i, operator_id))

    def shelve_alarm(self, alarm_id: str, operator_id: str, duration_s: float, reason: str) -> Tuple[bool, str]:
        """Shelve an active alarm for a limited time. A reason is mandatory."""
        with self._lock:
            alarm = self._alarms.get(alarm_id)
            if not alarm or alarm.state == AlarmState.NORMAL:
                return False, "Alarm is not active"
            if alarm.state == AlarmState.SHELVED:
                return False, "Alarm is already shelved"
            if not reason or not reason.strip():
                return False, "A shelving reason is required"
            if duration_s <= 0:
                return False, "Shelving duration must be positive"
            duration_s = min(float(duration_s), MAX_SHELVE_SECONDS)
            prev = alarm.state
            alarm.state = AlarmState.SHELVED
            alarm.shelved_until = time.time() + duration_s
            alarm.shelved_by = operator_id
            alarm.shelve_reason = reason.strip()
            self._log(alarm, prev, AlarmState.SHELVED, alarm.trigger_sim_time, operator_id,
                      note=f"{reason.strip()} ({int(duration_s)}s)")
            return True, "OK"

    def unshelve_alarm(self, alarm_id: str, operator_id: str = "system", note: str = "manual unshelve") -> bool:
        with self._lock:
            return self._unshelve_locked(alarm_id, operator_id, note, 0.0)

    def _unshelve_locked(self, alarm_id: str, operator_id: str, note: str, sim_time: float) -> bool:
        alarm = self._alarms.get(alarm_id)
        if not alarm or alarm.state != AlarmState.SHELVED:
            return False
        alarm.shelved_until = None
        if alarm.condition_active:
            alarm.state = AlarmState.UNACK_ALARM      # must be re-annunciated
            alarm.ack_by = None
        else:
            alarm.state = AlarmState.NORMAL
        self._log(alarm, AlarmState.SHELVED, alarm.state, sim_time or alarm.trigger_sim_time, operator_id, note)
        return True

    def _expire_shelves_locked(self, sim_time: float = 0.0):
        now = time.time()
        for a in list(self._alarms.values()):
            if a.state == AlarmState.SHELVED and a.shelved_until is not None and now >= a.shelved_until:
                self._unshelve_locked(a.alarm_id, "system", "shelve expired", sim_time)

    # queries
    def get_active_alarms(self) -> List[AlarmRecord]:
        """Alarms needing attention or still tripped. Shelved alarms are *not* annunciated here."""
        with self._lock:
            self._expire_shelves_locked()
            return [a.model_copy() for a in self._alarms.values()
                    if a.state not in (AlarmState.NORMAL, AlarmState.SHELVED)]

    def get_shelved_alarms(self) -> List[AlarmRecord]:
        with self._lock:
            self._expire_shelves_locked()
            return [a.model_copy() for a in self._alarms.values() if a.state == AlarmState.SHELVED]

    def get_all_alarms(self) -> List[AlarmRecord]:
        with self._lock:
            self._expire_shelves_locked()
            return [a.model_copy() for a in self._alarms.values()]

    def get_event_history(self, limit: int = 200, alarm_id: Optional[str] = None) -> List[dict]:
        with self._lock:
            evs = [e for e in self._events if alarm_id is None or e["alarm_id"] == alarm_id]
            return evs[-limit:][::-1]

    def get_statistics(self, window_s: float = 600.0) -> dict:
        """ISA-18.2-style performance indicators over the last *window_s* wall seconds."""
        with self._lock:
            now = time.time()
            self._expire_shelves_locked()
            window = [e for e in self._events if now - e["wall_time"] <= window_s]
            trips = [e for e in window if e["to_state"] == AlarmState.UNACK_ALARM.value]
            by_pri: Dict[int, int] = {1: 0, 2: 0, 3: 0, 4: 0}
            for e in trips:
                by_pri[e["priority"]] = by_pri.get(e["priority"], 0) + 1
            ack_times = [a.ack_timestamp - a.trigger_wall_time for a in self._alarm_history
                         if a.ack_timestamp and a.ack_timestamp >= a.trigger_wall_time]
            counts: Dict[str, int] = {}
            for e in self._events:
                if e["to_state"] == AlarmState.UNACK_ALARM.value:
                    counts[e["alarm_id"]] = counts.get(e["alarm_id"], 0) + 1
            bad_actors = sorted(counts.items(), key=lambda kv: -kv[1])[:5]
            states = [a.state for a in self._alarms.values()]
            return {
                "window_s": window_s,
                "alarms_in_window": len(trips),
                "alarm_rate_per_10min": round(len(trips) * 600.0 / window_s, 2),
                "by_priority": by_pri,
                "standing": sum(1 for s in states if s in (AlarmState.UNACK_ALARM, AlarmState.ACK_ALARM)),
                "unacknowledged": sum(1 for s in states if s in (AlarmState.UNACK_ALARM, AlarmState.RTN_UNACK)),
                "shelved": sum(1 for s in states if s == AlarmState.SHELVED),
                "mean_time_to_ack_s": round(sum(ack_times) / len(ack_times), 2) if ack_times else None,
                "bad_actors": [{"alarm_id": a, "trips": n} for a, n in bad_actors],
                "note": "ISA-18.2 approach indicators; not a compliance assessment.",
            }

    def device_alarm_map(self) -> Dict[str, List[AlarmRecord]]:
        out: Dict[str, List[AlarmRecord]] = {}
        for a in self.get_active_alarms():
            out.setdefault(a.source_device, []).append(a)
        return out

    def clear_all(self):
        with self._lock:
            self._alarms.clear()
            self._alarm_history.clear()
            self._pending.clear()
            self._occurrence_counts.clear()
