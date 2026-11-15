"""PLC Logic Simulator: a small ladder-logic scan engine.

Elements: NO / NC contacts, series (AND) and parallel (OR) branches, comparison contacts,
rising-edge contacts, coil / set / reset / TON timer / CTU counter / move (analog) outputs.
I/O: digital in/out (DI/DO), analog in/out (AI/AO), memory bits (M). Inputs can be bound to live
engine telemetry; outputs can optionally issue engine commands (write mode is OFF by default,
mirroring the Factory I/O command-mode interlock).

This is a teaching/simulation scan engine, not an IEC 61131-3 runtime.
"""
import copy
import threading
import time
from typing import Any, Callable, Dict, List, Optional

MAX_RUNGS = 100
MAX_DEPTH = 8
KINDS = {"DI", "DO", "AI", "AO", "M", "TON", "CTU"}
CMP_OPS = {">", "<", ">=", "<=", "==", "!="}


class PLCError(ValueError):
    def __init__(self, errors):
        self.errors = errors if isinstance(errors, list) else [str(errors)]
        super().__init__("; ".join(self.errors))


DEFAULT_PROGRAM: Dict[str, Any] = {
    "name": "Konveyör motor kontrolü (demo)",
    "description": "Aşırı sıcaklık kilitlemeli mühürlü başlat/durdur, yeniden başlatma gecikmesi (TON) ve parça sayacı (CTU).",
    "tags": {
        "I_START": {"kind": "DI", "comment": "Başlat butonu (sanal)"},
        "I_STOP": {"kind": "DI", "comment": "Durdur butonu (sanal, NC mantık)"},
        "I_OVERTEMP": {"kind": "DI", "source": "FAC_VFD_MOTOR_01:temperature_c", "mode": "gt", "threshold": 70.0,
                       "comment": "Motor sıcaklığı 70 °C üstünde"},
        "I_PART": {"kind": "DI", "source": "FAC_CONVEYOR_01:part_count", "mode": "changed", "comment": "Parça fotosel önünden geçti"},
        "I_RESET_CNT": {"kind": "DI", "comment": "Sayaç sıfırlama (sanal)"},
        "AI_TEMP": {"kind": "AI", "source": "FAC_VFD_MOTOR_01:temperature_c"},
        "M_RUN": {"kind": "M", "comment": "Çalışma talebi (mühürlü)"},
        "M_TEMP_WARN": {"kind": "M"},
        "T_RESTART": {"kind": "TON", "preset_ms": 3000},
        "C_PARTS": {"kind": "CTU", "preset": 5},
        "Q_RUN": {"kind": "DO", "command": {"device": "FAC_CONVEYOR_01", "on_true": "START", "on_false": "STOP"}},
        "Q_BATCH_DONE": {"kind": "DO", "comment": "5 parçalık parti sayıldı"},
        "AO_SPEED": {"kind": "AO", "comment": "Hız ayar noktası (m/s)",
                     "command": {"device": "FAC_CONVEYOR_01", "operation": "SET_SPEED", "param": "speed"}},
    },
    "rungs": [
        {"id": "R1", "comment": "Aşırı sıcaklık kilitlemeli mühürlü başlat/durdur",
         "logic": {"AND": [{"OR": [{"NO": "I_START"}, {"NO": "M_RUN"}]}, {"NC": "I_STOP"}, {"NC": "I_OVERTEMP"}]},
         "outputs": [{"type": "coil", "tag": "M_RUN"}]},
        {"id": "R2", "comment": "Yeniden başlatma gecikmesi: çıkış, çalışma talebinden 3 sn sonra enerjilenir",
         "logic": {"NO": "M_RUN"}, "outputs": [{"type": "ton", "tag": "T_RESTART"}]},
        {"id": "R3", "comment": "Gecikme sonrası çalışma çıkışı", "logic": {"NO": "T_RESTART.Q"},
         "outputs": [{"type": "coil", "tag": "Q_RUN"}]},
        {"id": "R4", "comment": "Parça say (yükselen kenar), I_RESET_CNT ile sıfırla", "logic": {"NO": "I_PART"},
         "outputs": [{"type": "ctu", "tag": "C_PARTS", "reset_tag": "I_RESET_CNT"}]},
        {"id": "R5", "comment": "Parti tamamlandı lambası", "logic": {"NO": "C_PARTS.Q"},
         "outputs": [{"type": "coil", "tag": "Q_BATCH_DONE"}]},
        {"id": "R6", "comment": "Sıcaklık uyarı biti (analog karşılaştırma)",
         "logic": {"CMP": {"op": ">", "a": "AI_TEMP", "b": 60.0}}, "outputs": [{"type": "coil", "tag": "M_TEMP_WARN"}]},
        {"id": "R7", "comment": "Sıcaklık uyarısı sürerken hızı 1,2 m/s'ye düşür",
         "logic": {"NO": "M_TEMP_WARN"}, "outputs": [{"type": "move", "tag": "AO_SPEED", "value": 1.2}]},
    ],
}


class PLCRuntime:
    def __init__(self):
        self._lock = threading.RLock()
        self.program: Dict[str, Any] = {}
        self.values: Dict[str, Any] = {}
        self.running = False
        self.write_enabled = False
        self.scan_count = 0
        self.last_scan_us = 0.0
        self.max_scan_us = 0.0
        self.rung_state: Dict[str, bool] = {}
        self.forced: Dict[str, Any] = {}
        self.command_log: List[dict] = []
        self.command_sink: Optional[Callable[[str, str, dict], bool]] = None
        self._prev_logic: Dict[str, bool] = {}
        self._prev_src: Dict[str, float] = {}
        self._edge_mem: Dict[str, bool] = {}
        self._last_out: Dict[str, Any] = {}
        self.load_program(DEFAULT_PROGRAM)

    # validation
    @staticmethod
    def validate(prog: dict) -> List[str]:
        errs: List[str] = []
        if not isinstance(prog, dict):
            return ["program must be an object"]
        tags = prog.get("tags")
        rungs = prog.get("rungs")
        if not isinstance(tags, dict) or not tags:
            return ["'tags' must be a non-empty object"]
        if not isinstance(rungs, list):
            return ["'rungs' must be a list"]
        if len(rungs) > MAX_RUNGS:
            errs.append(f"too many rungs (max {MAX_RUNGS})")
        known = set()
        for name, t in tags.items():
            if not isinstance(t, dict) or t.get("kind") not in KINDS:
                errs.append(f"tag '{name}': kind must be one of {sorted(KINDS)}")
                continue
            known.add(name)
            if t["kind"] == "TON":
                known |= {f"{name}.Q", f"{name}.ET"}
                if float(t.get("preset_ms", 0)) <= 0:
                    errs.append(f"timer '{name}': preset_ms must be > 0")
            if t["kind"] == "CTU":
                known |= {f"{name}.Q", f"{name}.CV"}
                if float(t.get("preset", 0)) <= 0:
                    errs.append(f"counter '{name}': preset must be > 0")
            src = t.get("source")
            if src is not None and (not isinstance(src, str) or src.count(":") != 1):
                errs.append(f"tag '{name}': source must be 'DEVICE:point'")
        ids = set()

        def chk_ref(ref, where):
            if isinstance(ref, (int, float)) and not isinstance(ref, bool):
                return
            if ref not in known:
                errs.append(f"{where}: unknown tag '{ref}'")

        def chk_node(n, depth, where):
            if depth > MAX_DEPTH:
                errs.append(f"{where}: logic nested too deep"); return
            if not isinstance(n, dict) or len(n) != 1:
                errs.append(f"{where}: node must be an object with exactly one key"); return
            (k, v), = n.items()
            if k in ("NO", "NC", "RISING"):
                chk_ref(v, where)
            elif k in ("AND", "OR"):
                if not isinstance(v, list) or not v:
                    errs.append(f"{where}: {k} needs a non-empty list")
                else:
                    for c in v:
                        chk_node(c, depth + 1, where)
            elif k == "CMP":
                if not isinstance(v, dict) or v.get("op") not in CMP_OPS:
                    errs.append(f"{where}: CMP.op must be one of {sorted(CMP_OPS)}")
                else:
                    chk_ref(v.get("a"), where); chk_ref(v.get("b"), where)
            else:
                errs.append(f"{where}: unknown node '{k}'")

        for i, r in enumerate(rungs):
            rid = r.get("id") or f"#{i}"
            if rid in ids:
                errs.append(f"duplicate rung id '{rid}'")
            ids.add(rid)
            chk_node(r.get("logic"), 0, f"rung {rid}")
            outs = r.get("outputs")
            if not isinstance(outs, list) or not outs:
                errs.append(f"rung {rid}: outputs required"); continue
            for o in outs:
                typ, tg = o.get("type"), o.get("tag")
                if typ not in ("coil", "set", "reset", "ton", "ctu", "move"):
                    errs.append(f"rung {rid}: unknown output type '{typ}'"); continue
                if tg not in tags:
                    errs.append(f"rung {rid}: output tag '{tg}' not declared"); continue
                kind = tags[tg].get("kind")
                if typ in ("coil", "set", "reset") and kind not in ("DO", "M"):
                    errs.append(f"rung {rid}: {typ} needs a DO/M tag, '{tg}' is {kind}")
                if typ == "ton" and kind != "TON":
                    errs.append(f"rung {rid}: ton needs a TON tag")
                if typ == "ctu":
                    if kind != "CTU":
                        errs.append(f"rung {rid}: ctu needs a CTU tag")
                    if o.get("reset_tag") and o["reset_tag"] not in known:
                        errs.append(f"rung {rid}: reset_tag '{o['reset_tag']}' unknown")
                if typ == "move":
                    if kind not in ("AO", "AI"):
                        errs.append(f"rung {rid}: move needs an AO tag")
                    if "value" not in o and "from" not in o:
                        errs.append(f"rung {rid}: move needs 'value' or 'from'")
                    if "from" in o:
                        chk_ref(o["from"], f"rung {rid}")
        return errs

    def load_program(self, prog: dict):
        errs = self.validate(prog)
        if errs:
            raise PLCError(errs)
        with self._lock:
            self.program = copy.deepcopy(prog)
            self.values = {}
            for name, t in self.program["tags"].items():
                k = t["kind"]
                if k == "TON":
                    self.values[f"{name}.Q"] = False; self.values[f"{name}.ET"] = 0.0
                elif k == "CTU":
                    self.values[f"{name}.Q"] = False; self.values[f"{name}.CV"] = 0
                elif k in ("AI", "AO"):
                    self.values[name] = 0.0
                else:
                    self.values[name] = False
            self.rung_state = {}
            self.forced = {}
            self._prev_logic, self._prev_src, self._edge_mem, self._last_out = {}, {}, {}, {}
            self.scan_count = 0

    # control
    def set_input(self, tag: str, value: Any):
        with self._lock:
            t = self.program["tags"].get(tag)
            if not t or t["kind"] not in ("DI", "AI") or t.get("source"):
                raise PLCError([f"'{tag}' is not a manual input"])
            self.values[tag] = bool(value) if t["kind"] == "DI" else float(value)

    def force(self, tag: str, value: Any):
        with self._lock:
            if tag not in self.values and tag not in self.program["tags"]:
                raise PLCError([f"unknown tag '{tag}'"])
            if value is None:
                self.forced.pop(tag, None)
            else:
                self.forced[tag] = value

    # scan
    def _val(self, ref):
        if isinstance(ref, (int, float)) and not isinstance(ref, bool):
            return ref
        return self.forced.get(ref, self.values.get(ref, 0))

    def _eval(self, n, rid) -> bool:
        (k, v), = n.items()
        if k == "NO":
            return bool(self._val(v))
        if k == "NC":
            return not bool(self._val(v))
        if k == "AND":
            return all([self._eval(c, rid) for c in v])
        if k == "OR":
            return any([self._eval(c, rid) for c in v])
        if k == "RISING":
            cur = bool(self._val(v))
            key = f"{rid}:{v}"
            res = cur and not self._edge_mem.get(key, False)
            self._edge_mem[key] = cur
            return res
        a, b, op = self._val(v["a"]), self._val(v["b"]), v["op"]
        return {">": a > b, "<": a < b, ">=": a >= b, "<=": a <= b, "==": a == b, "!=": a != b}[op]

    def _read_inputs(self, state_engine):
        for name, t in self.program["tags"].items():
            src = t.get("source")
            if not src or t["kind"] not in ("DI", "AI"):
                continue
            dev, pt = src.split(":")
            x = state_engine.read_point_value(dev, pt, 0.0) if state_engine else 0.0
            if t["kind"] == "AI":
                self.values[name] = x
            else:
                mode = t.get("mode", "bool")
                if mode == "gt":
                    self.values[name] = x > float(t.get("threshold", 0.5))
                elif mode == "lt":
                    self.values[name] = x < float(t.get("threshold", 0.5))
                elif mode == "changed":
                    prev = self._prev_src.get(name)
                    self.values[name] = prev is not None and x != prev
                    self._prev_src[name] = x
                else:
                    self.values[name] = x >= 0.5

    def scan(self, state_engine=None, dt_ms: float = 100.0):
        if not self.running:
            return
        t0 = time.perf_counter()
        with self._lock:
            self._read_inputs(state_engine)
            tags = self.program["tags"]
            for r in self.program["rungs"]:
                rid = r["id"]
                res = self._eval(r["logic"], rid)
                self.rung_state[rid] = res
                for o in r["outputs"]:
                    tg, typ = o["tag"], o["type"]
                    if typ == "coil":
                        self.values[tg] = res
                    elif typ == "set" and res:
                        self.values[tg] = True
                    elif typ == "reset" and res:
                        self.values[tg] = False
                    elif typ == "ton":
                        et = self.values[f"{tg}.ET"]
                        et = min(float(tags[tg]["preset_ms"]), et + dt_ms) if res else 0.0
                        self.values[f"{tg}.ET"] = et
                        self.values[f"{tg}.Q"] = et >= float(tags[tg]["preset_ms"])
                    elif typ == "ctu":
                        if o.get("reset_tag") and self._val(o["reset_tag"]):
                            self.values[f"{tg}.CV"] = 0
                        elif res and not self._prev_logic.get(f"{rid}:{tg}", False):
                            self.values[f"{tg}.CV"] += 1
                        self._prev_logic[f"{rid}:{tg}"] = res
                        self.values[f"{tg}.Q"] = self.values[f"{tg}.CV"] >= float(tags[tg]["preset"])
                    elif typ == "move" and res:
                        self.values[tg] = float(self._val(o["from"]) if "from" in o else o["value"])
            for tg, v in self.forced.items():
                if tg in self.values:
                    self.values[tg] = v
            self._drive_outputs()
            self.scan_count += 1
        self.last_scan_us = (time.perf_counter() - t0) * 1e6
        self.max_scan_us = max(self.max_scan_us, self.last_scan_us)

    def _drive_outputs(self):
        if not self.write_enabled or not self.command_sink:
            return
        for name, t in self.program["tags"].items():
            cmd = t.get("command")
            if not cmd or t["kind"] not in ("DO", "AO"):
                continue
            cur = self.values.get(name)
            if self._last_out.get(name) == cur:
                continue
            first = name not in self._last_out
            self._last_out[name] = cur
            if first and t["kind"] == "DO" and not cur:
                continue    # do not issue an OFF command just because the PLC started
            if t["kind"] == "DO":
                op = cmd["on_true"] if cur else cmd["on_false"]
                params: dict = {}
            else:
                op, params = cmd["operation"], {cmd.get("param", "value"): cur}
            ok = self.command_sink(cmd["device"], op, params)
            self.command_log.append({"t": time.time(), "tag": name, "device": cmd["device"], "operation": op,
                                     "params": params, "accepted": bool(ok)})
            del self.command_log[:-50]

    def snapshot(self) -> dict:
        with self._lock:
            return {"running": self.running, "write_enabled": self.write_enabled, "scan_count": self.scan_count,
                    "last_scan_us": round(self.last_scan_us, 1), "max_scan_us": round(self.max_scan_us, 1),
                    "values": {k: (round(v, 3) if isinstance(v, float) else v) for k, v in self.values.items()},
                    "rung_state": dict(self.rung_state), "forced": dict(self.forced),
                    "command_log": list(self.command_log[-10:]), "program": self.program}
