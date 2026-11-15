"""HTTP API (real app), Modbus simulator server and hardened FactoryIO client over real sockets."""
import socket
import struct
import threading
import time
import pytest
from fastapi.testclient import TestClient
from goksystem.main import app, engine, ops
from goksystem.protocols.modbus_server import ModbusSimServer
from goksystem.protocols.factoryio_adapter import (
    FactoryIOAdapter, FactoryIOConfig, ModbusException, ModbusProtocolError, ConnectionState, ModbusTCPClientFrame)
from tests.test_platform_core import make_engine


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        time.sleep(1.5)       # let the 10 Hz loop and recorders produce data
        yield c


# API
def test_inspector_returns_real_motor_data_with_trend(client):
    r = client.get("/api/v1/inspector/FAC_VFD_MOTOR_01?window_s=60").json()
    km = r["key_metrics"]
    for k in ("temperature", "rpm", "current", "vibration"):
        assert km[k]["value"] > 0, k
    live = client.get("/api/v1/devices/FAC_VFD_MOTOR_01").json()["telemetry"]
    assert km["rpm"]["value"] == pytest.approx(live["rpm"]["value"], abs=60)     # same source as engine state
    assert len(r["trend"]["rpm"]) >= 5 and r["health"]["is_estimate"] is True
    assert client.get("/api/v1/inspector/NOPE").status_code == 404


def test_inspector_shows_alarm_after_fault(client):
    engine.inject_fault("FAC_VFD_MOTOR_01", "BEARING_WEAR", {"severity": 0.95})
    time.sleep(1.0)
    r = client.get("/api/v1/inspector/FAC_VFD_MOTOR_01").json()
    assert any(a["alarm_id"] == "ALM_FAC_VIBRATION" for a in r["alarms"])
    assert r["status"] == "FAULT" and r["key_metrics"]["vibration"]["alarm_state"] != "NORMAL"
    client.post("/api/v1/simulation/control?action=reset")


def test_alarm_center_ack_shelve_audit(client):
    engine.inject_fault("FAC_VFD_MOTOR_01", "BEARING_WEAR", {"severity": 0.95})
    time.sleep(0.8)
    c = client.get("/api/v1/alarms/center").json()
    aid = next(a["alarm_id"] for a in c["active"] if a["state"] == "UNACK_ALARM")
    assert client.post(f"/api/v1/alarms/{aid}/shelve", json={"duration_s": 60, "reason": ""}).status_code == 400
    assert client.post(f"/api/v1/alarms/{aid}/shelve", json={"duration_s": 60, "reason": "test"}).status_code == 200
    c = client.get("/api/v1/alarms/center").json()
    assert any(a["alarm_id"] == aid for a in c["shelved"]) and all(a["alarm_id"] != aid for a in c["active"])
    assert client.post(f"/api/v1/alarms/{aid}/unshelve").status_code == 200
    assert client.post(f"/api/v1/alarms/{aid}/ack").status_code == 200
    hist = client.get("/api/v1/alarms/history?alarm_id=" + aid).json()
    assert {"SHELVED", "ACK_ALARM"} <= {h["to_state"] for h in hist}
    log = client.get("/api/v1/audit/log?action=ALARM_").json()
    assert {"ALARM_SHELVE", "ALARM_ACK"} <= {x["action"] for x in log}
    assert client.get("/api/v1/audit/verify").json()["valid"] is True
    client.post("/api/v1/simulation/control?action=reset")


def test_assets_api_crud_and_seed(client):
    assert client.get("/api/v1/assets/summary").json()["total"] >= 12
    assert any(a["type"] == "PLC" for a in client.get("/api/v1/assets").json())
    a = client.post("/api/v1/assets", json={"tag": "XFMR-T9", "name": "Spare transformer", "type": "TRANSFORMER", "status": "SPARE"}).json()
    assert client.put(f"/api/v1/assets/{a['asset_id']}", json={"location": "Warehouse"}).json()["location"] == "Warehouse"
    assert client.post("/api/v1/assets", json={"tag": "XFMR-T9", "name": "dup"}).status_code == 400
    assert client.delete(f"/api/v1/assets/{a['asset_id']}").status_code == 200


def test_tsdb_and_trend_compare_api(client):
    s = client.get("/api/v1/tsdb/series").json()
    assert any(x["series"] == "FAC_VFD_MOTOR_01:rpm" for x in s)
    q = client.get("/api/v1/tsdb/query?series=FAC_VFD_MOTOR_01:rpm&seconds=30&bucket_ms=1000").json()
    assert q["bucket_ms"] == 1000 and len(q["points"]) >= 1
    cmp_ = client.get("/api/v1/trends/compare?series=FAC_VFD_MOTOR_01:rpm,FAC_VFD_MOTOR_01:power_kw&seconds=30&normalize=true").json()
    assert len(cmp_["series"]) == 2 and cmp_["series"][0]["stats"]["n"] > 3
    assert client.get("/api/v1/tsdb/query?series=x&agg=bogus").status_code == 400


def test_pid_live_tune_applies_and_validates(client):
    assert client.post("/api/v1/pid/live", json={"kp": 500}).status_code == 400
    r = client.post("/api/v1/pid/live", json={"kp": 12, "ki": 0.8, "kd": 0.2})
    assert r.status_code == 200 and engine.process.kp == 12
    assert client.get("/api/v1/pid/live").json()["kp"] == 12
    r = client.post("/api/v1/pid/compare", json={"runs": [{"kp": 1, "ki": 0.1}, {"kp": 4, "ki": 1}], "tau": 5, "theta": 0.5})
    assert len(r.json()["runs"]) == 2
    client.post("/api/v1/simulation/control?action=reset")


def test_scenario_api(client):
    assert {s["scenario_id"] for s in client.get("/api/v1/scenarios").json()} == {"normal", "fault", "maintenance", "emergency_stop", "production"}
    assert client.post("/api/v1/scenarios/emergency_stop/run").json()["scenario_id"] == "emergency_stop"
    assert client.post("/api/v1/scenarios/nope/run").status_code == 404
    client.post("/api/v1/scenarios/stop")


def test_energy_maintenance_plc_twin_api(client):
    assert client.get("/api/v1/energy/report").json()["site"]["active_kwh"] >= 0
    assert "section" in client.get("/api/v1/energy/report.csv").text
    assert len(client.get("/api/v1/maintenance").json()["machines"]) == 3
    assert client.post("/api/v1/plc/run", json={"run": True}).json()["running"] is True
    bad = client.put("/api/v1/plc/program", json={"tags": {"A": {"kind": "DI"}}, "rungs": [{"id": "r", "logic": {"NO": "Z"}, "outputs": [{"type": "coil", "tag": "A"}]}]})
    assert bad.status_code == 400 and bad.json()["detail"]["errors"]
    client.post("/api/v1/plc/default-program")
    it = client.post("/api/v1/twin/items", json={"kind": "MOTOR", "label": "Aux motor", "x": 4, "y": 0, "z": 2}).json()
    assert any(i["item_id"] == it["item_id"] for i in client.get("/api/v1/twin/layout").json()["items"])
    assert client.put(f"/api/v1/twin/items/{it['item_id']}", json={"x": 8}).json()["x"] == 8
    assert client.put("/api/v1/twin/items/DEV:FAC_VFD_MOTOR_01", json={"x": 1.5, "y": 0, "z": 0}).json()["device_id"] == "FAC_VFD_MOTOR_01"
    client.post("/api/v1/twin/reset")
    assert client.get("/api/v1/twin/layout").json()["items"] == []


def test_perf_endpoints(client):
    t = client.get("/api/v1/perf/tick").json()
    assert t["ticks"] > 5 and "p99" in t["step_duration_ms"]
    d = client.post("/api/v1/perf/determinism?steps=200").json()
    assert d["identical_same_seed"] and d["differs_other_seed"]
    f = client.post("/api/v1/perf/fault-tolerance?steps=50").json()
    assert f["passed"] and f["other_models_alive"]


def test_auth_roles_enforced_with_token(client):
    viewer = client.post("/api/v1/auth/login", json={"username": "viewer", "pin": "1111"}).json()["token"]
    h = {"X-Operator-Token": viewer}
    assert client.post("/api/v1/assets", json={"tag": "Q1", "name": "q"}, headers=h).status_code == 403
    assert client.post("/api/v1/alarms/ack-all", headers=h).status_code == 403
    assert client.post("/api/v1/auth/login", json={"username": "viewer", "pin": "bad"}).status_code == 401
    assert client.get("/api/v1/auth/me", headers={"X-Operator-Token": "garbage"}).status_code == 401
    assert client.get("/api/v1/operators", headers=h).status_code == 403
    eng = client.post("/api/v1/auth/login", json={"username": "engineer", "pin": "3333"}).json()["token"]
    assert client.get("/api/v1/auth/me", headers={"X-Operator-Token": eng}).json()["role"] == "ENGINEER"
    denied = client.get("/api/v1/audit/log?action=PERMISSION_DENIED").json()
    assert denied and denied[0]["status"] == "DENIED"


def test_factoryio_mode_configurable(client):
    st = client.get("/api/v1/factoryio/status").json()
    assert st["configured_mode"] in ("mock", "live", "off")
    r = client.post("/api/v1/factoryio/config", json={"mode": "off"}).json()
    assert r["mode"] == "LIVE" and r["polling"] is False and r["state"] == "DISCONNECTED"
    assert client.post("/api/v1/factoryio/config", json={"mode": "bogus"}).status_code == 400
    assert client.post("/api/v1/factoryio/config", json={"mode": "mock"}).json()["state"] == "MOCK_SIMULATION"


# Modbus server
@pytest.fixture
def sim():
    e = make_engine()
    for _ in range(30):
        e.step_once()
    s = ModbusSimServer(e, port=0)
    s.start()
    yield s, e
    s.stop()


def cli(port):
    a = FactoryIOAdapter(make_engine().state_engine, FactoryIOConfig(host="127.0.0.1", port=port, timeout_sec=2.0))
    assert a.connect()
    return a


def test_modbus_server_all_read_functions(sim):
    s, e = sim
    a = cli(s.port)
    ir = a.read_input_registers(0, 16)
    assert ir[1] == pytest.approx(e.factory.motor_rpm, abs=2) and ir[3] > 0
    assert a.read_discrete_inputs(0, 8)[0] is True              # motor running
    assert a.read_coils(0, 4)[0] is True                         # conveyor run
    assert a.read_holding_registers(0, 3)[0] == 180
    with pytest.raises(ModbusException) as ex:
        a.read_input_registers(14, 5)
    assert ex.value.code == 2
    a.stop()


def test_modbus_server_writes_rejected_by_default_then_allowed(sim):
    s, e = sim
    a = cli(s.port)
    with pytest.raises(ModbusException) as ex:
        a.write_single_register(0, 250)
    assert ex.value.code == 4 and e.factory.conveyor_target_speed == 1.8
    s.write_enabled = True
    a.write_single_register(0, 250)                              # FC06
    assert e.factory.conveyor_target_speed == 2.5
    a.write_multiple_registers(0, [210, 600])                    # FC16
    assert e.factory.conveyor_target_speed == 2.1 and e.process.valve_position_pct == 60.0
    a.write_single_coil(0, False)                                # FC05
    assert e.factory.conveyor_running is False
    a.write_multiple_coils(0, [True, False, False])              # FC15
    assert e.factory.conveyor_running is True


def test_modbus_server_rejects_out_of_range_command(sim):
    s, e = sim
    s.write_enabled = True
    a = cli(s.port)
    with pytest.raises(ModbusException) as ex:
        a.write_single_register(0, 999)
    assert ex.value.code == 4 and e.factory.conveyor_target_speed == 1.8


def test_modbus_server_loopback_only_and_unknown_function(sim):
    s, _ = sim
    with pytest.raises(ValueError):
        ModbusSimServer(None, host="0.0.0.0")
    assert s.handle_pdu(0x2B, b"")[:2] == bytes([0xAB, 1])


# client hardening (fake servers)
def fake_server(handler):
    srv = socket.socket(); srv.bind(("127.0.0.1", 0)); srv.listen(1)
    def run():
        c, _ = srv.accept()
        try:
            handler(c)
        finally:
            c.close(); srv.close()
    threading.Thread(target=run, daemon=True).start()
    return srv.getsockname()[1]


def read_request(c):
    hdr = ModbusTCPClientFrame.recv_exact(c, 7)
    tx, _, ln, unit = struct.unpack(">HHHB", hdr)
    return tx, unit, ModbusTCPClientFrame.recv_exact(c, ln - 1)


def test_client_handles_fragmented_frames():
    def h(c):
        tx, unit, pdu = read_request(c)
        resp = struct.pack(">HHHB", tx, 0, 7, unit) + bytes([0x03, 4]) + struct.pack(">HH", 111, 222)
        for b in resp:                       # one byte per TCP segment
            c.sendall(bytes([b])); time.sleep(0.005)
    a = cli(fake_server(h))
    assert a.read_holding_registers(0, 2) == [111, 222]


def test_client_rejects_wrong_transaction_id():
    def h(c):
        tx, unit, pdu = read_request(c)
        c.sendall(struct.pack(">HHHB", (tx + 5) & 0xFFFF, 0, 5, unit) + bytes([0x03, 2]) + struct.pack(">H", 1))
    a = cli(fake_server(h))
    with pytest.raises(ModbusProtocolError):
        a.read_holding_registers(0, 1)


def test_client_decodes_exception_and_poll_survives():
    def h(c):
        tx, unit, pdu = read_request(c)
        c.sendall(struct.pack(">HHHB", tx, 0, 3, unit) + bytes([0x81, 2]))
    a = cli(fake_server(h))
    with pytest.raises(ModbusException):
        a.read_coils(0, 1)


def test_client_all_eight_function_codes_in_mock_mode():
    a = FactoryIOAdapter(make_engine().state_engine); a.enable_mock_mode(True)
    a.write_multiple_coils(2, [True, True, False]); assert a.read_coils(2, 3) == [True, True, False]
    a.write_multiple_registers(1, [5, 6, 7]); assert a.read_holding_registers(1, 3) == [5, 6, 7]
    a.write_single_coil(0, True); a.write_single_register(0, 9)
    assert a.read_coils(0, 1) == [True] and a.read_holding_registers(0, 1) == [9]
    assert len(a.read_discrete_inputs(0, 4)) == 4 and len(a.read_input_registers(0, 2)) == 2
    with pytest.raises(ValueError):
        a.read_holding_registers(0, 126)


def test_background_poller_start_stop_and_live_polling(sim):
    s, _ = sim
    eng2 = make_engine()
    a = FactoryIOAdapter(eng2.state_engine, FactoryIOConfig(host="127.0.0.1", port=s.port, poll_interval_sec=0.05, timeout_sec=1.0))
    assert a.start() is True and a.start() is False
    deadline = time.time() + 3
    while a.poll_count < 3 and time.time() < deadline:
        time.sleep(0.05)
    assert a.poll_count >= 3 and a.state == ConnectionState.CONNECTED and a.is_polling
    a.stop()
    assert not a.is_polling and a.state == ConnectionState.DISCONNECTED


def test_poller_reconnects_after_server_restart():
    e = make_engine(); [e.step_once() for _ in range(5)]
    s = ModbusSimServer(e, port=0); port = s.start()
    a = FactoryIOAdapter(make_engine().state_engine, FactoryIOConfig(host="127.0.0.1", port=port, poll_interval_sec=0.05, timeout_sec=0.5, max_reconnect_delay=0.5))
    a.start(); time.sleep(0.5)
    n = a.poll_count; assert n > 0
    s.stop(); time.sleep(0.6)
    s2 = ModbusSimServer(e, port=port); s2.start()
    deadline = time.time() + 5
    while a.poll_count <= n + 2 and time.time() < deadline:
        time.sleep(0.1)
    a.stop(); s2.stop()
    assert a.poll_count > n + 2 and a.error_count >= 1
