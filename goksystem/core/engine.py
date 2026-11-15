"""Simulation engine: runs the 10 Hz loop over all domains. Supports pause/resume/reset, speed scaling (0.1x to 5x), scenarios and fault injection."""

import threading
import time
import random
import queue
import logging
from typing import Dict, Any, Optional, List, Callable
from goksystem.core.models import SystemStateSummary, ScenarioDefinition, CommandRequest, CommandResult, DomainType
from goksystem.core.device_registry import DeviceRegistry
from goksystem.core.state_engine import StateEngine
from goksystem.scada.alarm_engine import AlarmEngine
from goksystem.scada.security import SecurityManager
from goksystem.historian.storage import HistorianStorage

from goksystem.domains.factory import FactoryDomain
from goksystem.domains.grid import GridDomain
from goksystem.domains.process import ProcessDomain
from goksystem.domains.building import BuildingDomain
from goksystem.modules.perf import TickProfiler

logger = logging.getLogger("goksystem.engine")


class SimulationEngine:
    """Master 10 Hz industrial simulation engine."""

    def __init__(
        self,
        registry: DeviceRegistry,
        state_engine: StateEngine,
        alarm_engine: AlarmEngine,
        security_mgr: SecurityManager,
        historian: Optional[HistorianStorage] = None,
        seed: int = 42,
        noise_pct: float = 0.0,
    ):
        self.registry = registry
        self.state_engine = state_engine
        self.alarm_engine = alarm_engine
        self.security_mgr = security_mgr
        self.historian = historian

        self.factory = FactoryDomain(state_engine, alarm_engine)
        self.grid = GridDomain(state_engine, alarm_engine)
        self.process = ProcessDomain(state_engine, alarm_engine)
        self.building = BuildingDomain(state_engine, alarm_engine)

        self.sim_time = 0.0
        self.wall_start_time = time.time()
        self.running = False
        self.speed_factor = 1.0  # 1.0 = real-time, 2.0 = 2x, etc.
        self.base_dt = 0.1       # 10 Hz nominal timestep
        
        self.active_scenario: Optional[ScenarioDefinition] = None
        self.scenario_elapsed = 0.0
        
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._lock = threading.RLock()
        
        self.step_count = 0

        # Platform extensions (all optional; engine works standalone without them)
        self.seed = seed
        self.noise_pct = float(noise_pct)          # relative gaussian measurement noise (0 = off)
        self.rng = random.Random(seed)
        self.profiler = TickProfiler()
        self.tsdb = None                           # goksystem.modules.tsdb.TimeSeriesDB
        self.plc = None                            # goksystem.modules.plc.PLCRuntime
        self.energy = None                         # goksystem.modules.energy.EnergyManager
        self._hooks: List[tuple] = []              # (name, fn(dt, sim_time)) executed each tick, fault-isolated
        self._model_errors: Dict[str, bool] = {}
        self._scenario_fired: set = set()
        self.scenario_log: List[Dict[str, Any]] = []
        self.scenario_finished = False
        self._persist_q: "queue.Queue[Callable[[], None]]" = queue.Queue(maxsize=2000)
        self._writer: Optional[threading.Thread] = None
        self.persist_dropped = 0

    def start(self):
        with self._lock:
            self.running = True
            self._stop_event.clear()
            if not (self._thread and self._thread.is_alive()):
                self._thread = threading.Thread(target=self._run_loop, daemon=True, name="GoksystemSimLoop")
                self._thread.start()
                logger.info("Simulation Engine started at 10 Hz.")
            if not (self._writer and self._writer.is_alive()):
                self._writer = threading.Thread(target=self._writer_loop, daemon=True, name="GoksystemPersist")
                self._writer.start()

    def stop(self):
        with self._lock:
            self.running = False
            self._stop_event.set()
            t, w = self._thread, self._writer
        if t and t.is_alive() and t is not threading.current_thread():
            t.join(timeout=1.0)
        if w and w.is_alive():
            w.join(timeout=1.0)
        logger.info("Simulation Engine stopped.")

    def register_model(self, name: str, fn: Callable[[float, float], None]):
        """Register an extra per-tick model/hook. Exceptions are isolated and counted, never fatal."""
        self._hooks.append((name, fn))

    def _persist(self, fn: Callable[[], None]):
        """Run a persistence callable off the simulation thread when the writer is alive."""
        if self._writer and self._writer.is_alive():
            try:
                self._persist_q.put_nowait(fn)
            except queue.Full:
                self.persist_dropped += 1
        else:
            fn()

    def _writer_loop(self):
        while not self._stop_event.is_set() or not self._persist_q.empty():
            try:
                fn = self._persist_q.get(timeout=0.2)
            except queue.Empty:
                continue
            try:
                fn()
            except Exception as exc:
                self.profiler.record_error("persistence", exc)

    def pause(self):
        with self._lock:
            self.running = False

    def resume(self):
        with self._lock:
            if not self.running:
                self.running = True

    def set_speed(self, speed: float):
        with self._lock:
            self.speed_factor = max(0.1, min(10.0, float(speed)))

    def reset(self):
        with self._lock:
            self.sim_time = 0.0
            self.step_count = 0
            self.active_scenario = None
            self.scenario_elapsed = 0.0
            self.alarm_engine.clear_all()
            self.rng = random.Random(self.seed)
            self._scenario_fired = set()
            self.scenario_log = []
            self.scenario_finished = False
            self._model_errors = {}
            if self.energy:
                self.energy.reset()
            self.factory = FactoryDomain(self.state_engine, self.alarm_engine)
            self.grid = GridDomain(self.state_engine, self.alarm_engine)
            self.process = ProcessDomain(self.state_engine, self.alarm_engine)
            self.building = BuildingDomain(self.state_engine, self.alarm_engine)

    def execute_command(self, cmd: CommandRequest) -> CommandResult:
        """Execute validated SCADA command on the target domain."""
        valid, reason = self.security_mgr.validate_command(cmd)
        if not valid:
            return CommandResult(
                command_id=cmd.command_id,
                target_device=cmd.target_device,
                success=False,
                message=reason,
                execution_sim_time=self.sim_time
            )

        target = cmd.target_device
        op = cmd.operation
        params = cmd.parameters
        success = False

        if target.startswith("FAC_"):
            success = self.factory.handle_command(op, params)
        elif target.startswith("GRID_"):
            success = self.grid.handle_command(op, params)
        elif target.startswith("PROC_"):
            success = self.process.handle_command(op, params)
        elif target.startswith("BLD_"):
            success = self.building.handle_command(op, params)

        msg = f"Command {op} executed successfully on {target}" if success else f"Command {op} rejected by device interlock"
        return CommandResult(
            command_id=cmd.command_id,
            target_device=target,
            success=success,
            message=msg,
            execution_sim_time=self.sim_time
        )

    def load_scenario(self, scenario: ScenarioDefinition):
        with self._lock:
            self.reset()
            self.active_scenario = scenario
            self.scenario_elapsed = 0.0
            self._scenario_fired = set()
            self.scenario_log = []
            self.scenario_finished = False
            for key, val in scenario.initial_conditions.items():
                self._set_initial(key, val)

    _INITIAL_WHITELIST = {
        "factory.conveyor_target_speed", "factory.conveyor_load_kg", "factory.bearing_defect_severity",
        "process.ph_setpoint", "process.pump_rpm", "building.target_temp_c",
    }

    def _set_initial(self, key: str, val: Any):
        if key in self._INITIAL_WHITELIST:
            dom, attr = key.split(".")
            setattr(getattr(self, dom), attr, float(val))

    def scenario_status(self) -> Dict[str, Any]:
        sc = self.active_scenario
        if not sc:
            return {"active": False, "scenario_id": None, "log": list(self.scenario_log)}
        return {
            "active": not self.scenario_finished, "finished": self.scenario_finished, "scenario_id": sc.scenario_id,
            "name": sc.name, "elapsed_sec": round(self.scenario_elapsed, 1), "duration_sec": sc.duration_sec,
            "events": [{"t": e.get("trigger_at_sec", 0), "label": e.get("label", ""), "fired": i in self._scenario_fired}
                       for i, e in enumerate(sc.scheduled_faults)],
            "log": list(self.scenario_log[-30:]),
        }

    def _apply_scenario_event(self, ev: Dict[str, Any]):
        sc_id = self.active_scenario.scenario_id if self.active_scenario else "?"
        if ev.get("kind") == "command":
            res = self.execute_command(CommandRequest(
                command_id=f"scn-{sc_id}-{self.step_count}", target_device=ev.get("target_device", ""),
                operation=ev.get("operation", ""), parameters=ev.get("parameters", {}),
                operator_id=f"scenario:{sc_id}", user_role="ENGINEER"))
            ok, msg = res.success, res.message
        else:
            ok = self.inject_fault(ev.get("target_device", ""), ev.get("fault_type", ""), ev.get("parameters", {}))
            msg = "fault injected" if ok else "unknown fault"
        self.scenario_log.append({"sim_time": round(self.sim_time, 2), "scenario_t": round(self.scenario_elapsed, 2),
                                  "label": ev.get("label", ""), "ok": bool(ok), "message": msg})

    def _run_scenario(self, dt: float):
        sc = self.active_scenario
        if not sc or self.scenario_finished:
            return
        self.scenario_elapsed += dt
        for i, ev in enumerate(sc.scheduled_faults):
            if i not in self._scenario_fired and self.scenario_elapsed + 1e-9 >= ev.get("trigger_at_sec", 0.0):
                self._scenario_fired.add(i)
                self._apply_scenario_event(ev)
        if self.scenario_elapsed >= sc.duration_sec:
            self.scenario_finished = True

    def _guarded(self, name: str, fn: Callable[[], None]):
        """Run one model; an exception marks only that model faulted, the loop continues."""
        try:
            fn()
            if self._model_errors.get(name):
                self._model_errors[name] = False
        except Exception as exc:
            self.profiler.record_error(name, exc)
            if not self._model_errors.get(name):
                logger.exception("Model '%s' raised; isolated, simulation loop continues", name)
            self._model_errors[name] = True

    def _apply_noise(self):
        if self.noise_pct <= 0:
            return
        for dev, pt, val, unit in self.state_engine.iter_points():
            if unit in ("bool", "state", "ansi", "pcs", "idx"):
                continue
            self.state_engine.perturb(dev, pt, self.rng.gauss(0.0, self.noise_pct * abs(val)))

    _DOMAIN_PREFIX = {"factory": "FAC_", "grid": "GRID_", "process": "PROC_", "building": "BLD_"}

    def _sync_alarm_status(self):
        """Publish per-device alarm ids and derived status (ONLINE / WARNING / FAULT / MODEL_FAULT)."""
        by_dev = self.alarm_engine.device_alarm_map()
        running = {
            "FAC_CONVEYOR_01": self.factory.conveyor_speed > 0.05,
            "FAC_VFD_MOTOR_01": self.factory.motor_rpm > 50,
            "FAC_ROBOT_01": self.factory.robot_active and self.factory.light_curtain_ok,
            "PROC_PUMP_01": self.process.pump_running,
        }
        for dev_id in self.state_engine.device_ids():
            alms = by_dev.get(dev_id, [])
            self.state_engine.set_active_alarms(dev_id, sorted(a.alarm_id for a in alms))
            dom = next((d for d, pre in self._DOMAIN_PREFIX.items() if dev_id.startswith(pre)), None)
            if dom and self._model_errors.get(dom):
                status = "MODEL_FAULT"
            elif any(a.priority <= 2 for a in alms):
                status = "FAULT"
            elif alms:
                status = "WARNING"
            else:
                status = "RUNNING" if running.get(dev_id) else "ONLINE"
            self.state_engine.set_device_status_if_changed(dev_id, status)

    def step_once(self):
        """Execute exactly one discrete simulation step (useful for tests or deterministic loops)."""
        t_start = time.perf_counter()
        dt = self.base_dt
        self.sim_time += dt
        self.step_count += 1
        st = self.sim_time

        # Factory motor load (~45 kW) and building base load couple into the grid model
        fac_load = 45.0 * (self.factory.motor_rpm / 1500.0) if self.factory.conveyor_running else 5.0
        bld_load = max(10.0, 85.0 + self.building.hvac_cooling_kw - self.building.solar_output_kw)

        self._guarded("factory", lambda: self.factory.step(dt, st))
        self._guarded("grid", lambda: self.grid.step(dt, st, factory_load_kw=fac_load, building_load_kw=bld_load))
        self._guarded("process", lambda: self.process.step(dt, st))
        self._guarded("building", lambda: self.building.step(dt, st))

        self._guarded("scenario", lambda: self._run_scenario(dt))
        self._guarded("noise", self._apply_noise)
        if self.energy:
            self._guarded("energy", lambda: self.energy.update(self.state_engine, dt))
        if self.plc:
            self._guarded("plc", lambda: self.plc.scan(self.state_engine, dt * 1000.0))
        for name, fn in list(self._hooks):
            self._guarded(name, lambda fn=fn: fn(dt, st))
        self._guarded("alarm_status", self._sync_alarm_status)

        # Record to Historian (1 Hz) and the millisecond time-series store (every tick)
        if self.historian and (self.step_count % 10 == 0):
            def _hist(states=self.state_engine.get_all_states()):
                for dev_id, state in states.items():
                    for pt in state.telemetry.values():
                        self.historian.record_telemetry(dev_id, pt)
            self._guarded("historian", lambda: self._persist(_hist))
        if self.tsdb:
            def _ts():
                pts = self.state_engine.iter_points()
                self.tsdb.record_many([(f"{d}:{p}", v, u) for d, p, v, u in pts], int(time.time() * 1000))
            self._guarded("tsdb", _ts)
        self.profiler.record_step(time.perf_counter() - t_start)

    def inject_fault(self, target_device: str, fault_type: str, parameters: Dict[str, Any]) -> bool:
        """Inject reproducible physical faults. Returns False for an unknown device/fault pair."""
        if target_device == "FAC_VFD_MOTOR_01" and fault_type == "BEARING_WEAR":
            self.factory.bearing_defect_severity = max(0.0, min(1.0, float(parameters.get("severity", 0.8))))
        elif target_device == "FAC_VFD_MOTOR_01" and fault_type == "MOTOR_OVERLOAD":
            self.factory.conveyor_load_kg = max(0.0, min(400.0, float(parameters.get("load_kg", 230.0))))
        elif target_device == "FAC_CONVEYOR_01" and fault_type == "PULL_CORD_TRIP":
            self.factory.pull_cord_tripped = True
        elif target_device == "GRID_BREAKER_01" and fault_type == "OVERCURRENT_TRIP":
            self.grid.breaker_closed = False
            self.grid.breaker_tripped_ansi = 50
        elif target_device == "PROC_TANK_01" and fault_type == "DRAIN_BLOCKAGE":
            self.process.tank_volume_l = min(10000.0, self.process.tank_volume_l + 3000.0)
        elif target_device == "PROC_TANK_01" and fault_type == "PH_EXCURSION":
            self.process.ph_value = max(2.0, min(12.0, self.process.ph_value + float(parameters.get("delta", 0.8))))
        elif target_device == "PROC_PUMP_01" and fault_type == "PUMP_BEARING_WEAR":
            self.process.pump_defect_severity = max(0.0, min(1.0, float(parameters.get("severity", 0.7))))
        else:
            return False
        return True

    def get_summary(self) -> SystemStateSummary:
        active_alms = self.alarm_engine.get_active_alarms()
        unack_count = sum(1 for a in active_alms if a.state.value == "UNACK_ALARM")
        
        kpis = {
            "factory_oee_pct": 87.4 if self.factory.conveyor_running else 22.0,
            "factory_parts_total": self.factory.part_count,
            "grid_total_power_mw": round(self.state_engine.read_point_value("GRID_BUSBAR_11KV", "total_p_mw", 1.5), 3),
            "grid_power_factor": round(self.state_engine.read_point_value("GRID_TRAFO_01", "power_factor", 0.92), 3),
            "process_tank_level_pct": round(self.state_engine.read_point_value("PROC_TANK_01", "level_pct", 68.0), 1),
            "process_ph_value": round(self.state_engine.read_point_value("PROC_TANK_01", "ph_value", 7.0), 2),
            "building_solar_kw": round(self.state_engine.read_point_value("BLD_SOLAR_PV_01", "output_kw", 110.0), 1),
            "building_battery_soc_pct": round(self.state_engine.read_point_value("BLD_BMS_BATTERY_01", "soc_pct", 78.5), 1),
        }

        return SystemStateSummary(
            sim_time=round(self.sim_time, 2),
            wall_time=time.time(),
            running=self.running,
            speed_factor=self.speed_factor,
            total_devices=len(self.registry.list_all()),
            active_alarms_count=len(active_alms),
            unack_alarms_count=unack_count,
            kpis=kpis
        )

    def _run_loop(self):
        """Worker thread: absolute-deadline scheduler (no drift) with a short busy-wait for the last ~5 ms (macOS timer wake-ups overshoot by 1-3 ms)."""
        pc = time.perf_counter
        next_t = pc()
        prev_start = None
        while not self._stop_event.is_set():
            period = self.base_dt / self.speed_factor
            if not self.running:
                self._stop_event.wait(0.05)
                next_t = pc()
                prev_start = None
                continue
            t0 = pc()
            lateness = t0 - next_t
            self.step_once()
            if prev_start is not None:
                self.profiler.record_period(t0 - prev_start, period, lateness)
            prev_start = t0
            next_t += period
            delay = next_t - pc()
            if delay < 0:
                self.profiler.record_overrun()
                if delay < -5 * period:       # long stall: resynchronise instead of bursting
                    next_t = pc()
                continue
            if delay > 0.006:
                self._stop_event.wait(delay - 0.005)
            while pc() < next_t:
                pass
