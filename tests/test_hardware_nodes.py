"""Field I/O nodes: every asset has a GK-N1 card with wired sensors and its own ladder program."""
import pytest

from goksystem.core.device_registry import DeviceRegistry
from goksystem.core.engine import SimulationEngine
from goksystem.core.state_engine import StateEngine
from goksystem.modules import hardware
from goksystem.modules.hardware import FieldNodes, ai_signal
from goksystem.modules.plc import PLCRuntime
from goksystem.scada.alarm_engine import AlarmEngine
from goksystem.scada.security import SecurityManager


def make_engine():
    reg = DeviceRegistry()
    e = SimulationEngine(reg, StateEngine(reg), AlarmEngine(), SecurityManager(), None, seed=3, noise_pct=0.0)
    e.field_nodes = FieldNodes()
    return e


class FakeState:
    def __init__(self, values):
        self.values = values

    def read_point_value(self, dev, pt, default=0.0):
        return self.values.get((dev, pt), default)


def test_every_device_has_a_node_with_valid_program_and_unique_address():
    e = make_engine()
    ids = set(e.state_engine.device_ids())
    assert set(hardware.NODES) == ids
    addrs = [n["address"] for n in hardware.NODES.values()]
    assert len(addrs) == len(set(addrs))
    for dev in ids:
        prog = hardware.build_program(dev)
        assert PLCRuntime.validate(prog) == [], dev


def test_every_wired_point_exists_in_device_telemetry():
    e = make_engine()
    e.step_once()
    for dev, node in hardware.NODES.items():
        tel = e.state_engine.get_device_state(dev).telemetry
        for ch in node["channels"]:
            if ch["kind"] == "DO":
                continue                     # outputs are driven by the card, not read from telemetry
            src = e.state_engine.get_device_state(ch.get("source_device") or dev).telemetry
            assert ch["point"] in src, (dev, ch)
        for bus in node.get("bus", []):
            for pt, _tag in bus["points"]:
                assert pt in tel, (dev, pt)


def test_channel_ids_fit_the_card_families():
    for dev, node in hardware.NODES.items():
        chs = [c["ch"] for c in node["channels"]]
        assert len(chs) == len(set(chs)), dev
        for kind, mx in hardware.FAMILIES["plc"]["max_channels"].items():
            assert {c for c in chs if c.startswith(kind)} <= {f"{kind}{i}" for i in range(1, mx + 1)}, dev
        sm = node.get("smart")
        if sm:
            assert all(c["kind"] == "AI" and c["ch"] in ("AI1", "AI2") and c.get("plc_tag") for c in sm["channels"]), dev


def test_every_asset_has_its_own_plc_card_project_and_smart_cards_where_needed():
    projects = []
    for dev in hardware.NODES:
        cs = hardware.cards(dev)
        assert cs[0]["family"] == "plc" and cs[0]["card_id"].startswith("GK-P1-")
        projects += [c["kicad_project"] for c in cs]
    assert len(projects) == len(set(projects))                       # one KiCad design per card
    smart = {d for d in hardware.NODES if any(c["family"] == "smart" for c in hardware.cards(d))}
    assert smart == {"FAC_VFD_MOTOR_01", "PROC_PUMP_01", "BLD_HVAC_ZONE1"}


def test_smart_card_values_reach_the_plc_program():
    prog = hardware.build_program("BLD_HVAC_ZONE1")
    assert prog["tags"]["CO2"]["source"] == "BLD_HVAC_ZONE1:co2_ppm"
    assert prog["tags"]["ZONE_RH"]["source"] == "BLD_HVAC_ZONE1:humidity_pct"
    nodes = FieldNodes()
    nodes.scan(FakeState({("BLD_HVAC_ZONE1", "co2_ppm"): 950.0, ("BLD_HVAC_ZONE1", "humidity_pct"): 45.0}), 100.0)
    assert nodes.plc("BLD_HVAC_ZONE1").values["DO1"] is True        # fresh-air damper from the smart card's CO2


def test_4_20ma_scaling_and_namur_saturation():
    assert ai_signal(0, 0, 100)["mA"] == 4.0
    assert ai_signal(50, 0, 100)["mA"] == 12.0
    assert ai_signal(100, 0, 100)["mA"] == 20.0
    over = ai_signal(130, 0, 100)
    assert over["mA"] == 20.5 and over["status"] == "OVER_RANGE"
    under = ai_signal(-10, 0, 100)
    assert under["mA"] == 3.8 and under["status"] == "UNDER_RANGE"
    s = ai_signal(100, 0, 100)
    assert s["shunt_v"] == 3.0                       # 20 mA through the 150 R shunt
    assert 0 < s["adc_counts"] <= 4095


def test_motor_ladder_fan_and_permissive_follow_sensors():
    nodes = FieldNodes()
    hot = FakeState({("FAC_VFD_MOTOR_01", "temperature_c"): 75.0, ("FAC_VFD_MOTOR_01", "rpm"): 1400.0})
    for _ in range(3):
        nodes.scan(hot, 100.0)
    v = nodes.plc("FAC_VFD_MOTOR_01").values
    assert v["DO2"] is True          # cooling fan above 60 °C
    assert v["DO1"] is True          # STO permissive: no PTC trip, e-stop chain healthy
    tripped = FakeState({("FAC_VFD_MOTOR_01", "temperature_c"): 95.0, ("FAC_VFD_MOTOR_01", "rpm"): 1400.0})
    nodes.scan(tripped, 100.0)
    v = nodes.plc("FAC_VFD_MOTOR_01").values
    assert v["DI2"] is True and v["DO1"] is False and v["DO3"] is True


def test_engine_scans_all_nodes_and_detail_reports_live_wiring():
    e = make_engine()
    for _ in range(20):
        e.step_once()
    for dev in e.state_engine.device_ids():
        assert e.field_nodes.plc(dev).scan_count == 20
    d = e.field_nodes.detail("PROC_TANK_01", e.state_engine)
    ai1 = next(c for c in d["channels"] if c["ch"] == "AI1")
    level = e.state_engine.read_point_value("PROC_TANK_01", "level_pct")
    assert ai1["value"] == pytest.approx(level)
    assert ai1["signal"]["mA"] == pytest.approx(4 + 16 * level / 100, abs=1e-3)
    assert d["plc"]["scan_count"] == 20
    assert d["cards"][0]["id"] == "GK-P1" and d["cards"][0]["kicad_project"] == "gk_p1_tnk01"
    assert e.field_nodes.detail("NOPE", e.state_engine) is None


def test_node_programs_are_deterministic():
    def run():
        e = make_engine()
        for _ in range(150):
            e.step_once()
        return {d: e.field_nodes.plc(d).snapshot()["values"] for d in e.state_engine.device_ids()}
    assert run() == run()


def test_hardware_api_lists_nodes_and_returns_detail():
    from fastapi.testclient import TestClient
    from goksystem.main import app
    with TestClient(app) as c:
        r = c.get("/api/v1/hardware/nodes")
        assert r.status_code == 200
        body = r.json()
        assert body["families"]["plc"]["id"] == "GK-P1" and len(body["nodes"]) == 12
        d = c.get("/api/v1/hardware/nodes/FAC_VFD_MOTOR_01").json()
        assert d["node_id"] == "GK-P1-11" and [c["card_id"] for c in d["cards"]] == ["GK-P1-11", "GK-S1-11"]
        assert d["cards"][1]["bus"][0]["points"][0]["tag"] == "VIB"
        assert {ch["ch"] for ch in d["channels"]} >= {"DI1", "AI1", "DO1"}
        assert c.get("/api/v1/hardware/nodes/NOPE").status_code == 404
