"""Thread-safe live state for all devices, with dirty tracking so only changed points are sent to the UI."""

import threading
import copy
import time
from typing import Dict, List, Optional, Any
from goksystem.core.models import (
    DeviceRuntimeState, TelemetryPoint, DomainType, Quality
)
from goksystem.core.device_registry import DeviceRegistry


class StateEngine:
    """Thread-safe state container with double buffering and change detection."""

    def __init__(self, registry: DeviceRegistry):
        self._registry = registry
        self._lock = threading.RLock()
        
        self._states: Dict[str, DeviceRuntimeState] = {}
        # Changed keys tracking for delta sync
        self._dirty_devices: set = set()
        
        for dev in self._registry.list_all():
            self._states[dev.device_id] = DeviceRuntimeState(
                device_id=dev.device_id,
                domain=dev.domain,
                status="ONLINE",
                telemetry={},
                active_alarms=[],
                interlocks_engaged=False,
                last_update_sim_time=0.0
            )
            self._dirty_devices.add(dev.device_id)

    def update_telemetry(self, device_id: str, point_id: str, value: float, unit: str, sim_time: float, quality: Quality = Quality.GOOD, metadata: Optional[Dict[str, Any]] = None):
        """Thread-safe update of a single telemetry point."""
        with self._lock:
            state = self._states.get(device_id)
            if not state:
                return
            
            point = TelemetryPoint(
                point_id=point_id,
                value=float(value),
                unit=unit,
                quality=quality,
                sim_time=sim_time,
                wall_time=time.time(),
                metadata=metadata or {}
            )
            state.telemetry[point_id] = point
            state.last_update_sim_time = sim_time
            self._dirty_devices.add(device_id)

    def set_device_status(self, device_id: str, status: str, interlocks: Optional[bool] = None):
        with self._lock:
            state = self._states.get(device_id)
            if state:
                state.status = status
                if interlocks is not None:
                    state.interlocks_engaged = interlocks
                self._dirty_devices.add(device_id)

    def get_device_state(self, device_id: str) -> Optional[DeviceRuntimeState]:
        with self._lock:
            state = self._states.get(device_id)
            return copy.deepcopy(state) if state else None

    def get_all_states(self) -> Dict[str, DeviceRuntimeState]:
        """Returns deep copy of current complete system state."""
        with self._lock:
            return copy.deepcopy(self._states)

    def get_domain_states(self, domain: DomainType) -> List[DeviceRuntimeState]:
        with self._lock:
            return [copy.deepcopy(s) for s in self._states.values() if s.domain == domain]

    def pop_dirty_snapshot(self) -> Dict[str, DeviceRuntimeState]:
        """Atomic extraction and reset of dirty states for streaming delta updates."""
        with self._lock:
            if not self._dirty_devices:
                return {}
            snapshot = {d_id: copy.deepcopy(self._states[d_id]) for d_id in self._dirty_devices if d_id in self._states}
            self._dirty_devices.clear()
            return snapshot

    def read_point_value(self, device_id: str, point_id: str, default: float = 0.0) -> float:
        """Fast scalar readout for numerical simulations."""
        with self._lock:
            state = self._states.get(device_id)
            if state and point_id in state.telemetry:
                return state.telemetry[point_id].value
            return default

    def set_active_alarms(self, device_id: str, alarm_ids: List[str]):
        with self._lock:
            state = self._states.get(device_id)
            if state and state.active_alarms != alarm_ids:
                state.active_alarms = list(alarm_ids)
                self._dirty_devices.add(device_id)

    def device_ids(self) -> List[str]:
        with self._lock:
            return list(self._states.keys())

    def statuses(self) -> Dict[str, str]:
        """Cheap {device_id: status} snapshot (no deep copies)."""
        with self._lock:
            return {d: st.status for d, st in self._states.items()}

    def iter_points(self) -> List[tuple]:
        """Cheap (device_id, point_id, value, unit) snapshot without deep copies (for recorders)."""
        with self._lock:
            return [(d, p, pt.value, pt.unit) for d, st in self._states.items() for p, pt in st.telemetry.items()]

    def perturb(self, device_id: str, point_id: str, delta: float):
        """Add a delta to a published value (measurement-noise model)."""
        with self._lock:
            st = self._states.get(device_id)
            if st and point_id in st.telemetry:
                st.telemetry[point_id].value += delta

    def set_device_status_if_changed(self, device_id: str, status: str):
        with self._lock:
            state = self._states.get(device_id)
            if state and state.status != status:
                state.status = status
                self._dirty_devices.add(device_id)
