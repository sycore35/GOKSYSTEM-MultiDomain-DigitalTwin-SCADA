"""REST API tests."""

import pytest
from fastapi.testclient import TestClient
from goksystem.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_health_check(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "HEALTHY"
    assert data["version"] == "3.0.0"


def test_list_devices(client):
    res = client.get("/api/v1/devices")
    assert res.status_code == 200
    devs = res.json()
    assert len(devs) >= 12
    dev_ids = [d["device_id"] for d in devs]
    assert "FAC_CONVEYOR_01" in dev_ids
    assert "GRID_TRAFO_01" in dev_ids
    assert "PROC_TANK_01" in dev_ids
    assert "BLD_HVAC_ZONE1" in dev_ids


def test_enterprise_summary(client):
    res = client.get("/api/v1/summary")
    assert res.status_code == 200
    summary = res.json()
    assert "kpis" in summary
    assert "factory_oee_pct" in summary["kpis"]
    assert "grid_total_power_mw" in summary["kpis"]


def test_command_execution_api(client):
    cmd_body = {
        "command_id": "test_cmd_rest_01",
        "target_device": "FAC_CONVEYOR_01",
        "operation": "SET_SPEED",
        "parameters": {"speed": 2.2},
        "operator_id": "rest_tester",
        "user_role": "OPERATOR"
    }
    res = client.post("/api/v1/commands", json=cmd_body)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "executed successfully" in data["message"]


def test_simulation_control(client):
    res = client.post("/api/v1/simulation/control?action=pause")
    assert res.status_code == 200
    assert res.json()["running"] is False

    res = client.post("/api/v1/simulation/control?action=resume&speed=2.0")
    assert res.status_code == 200
    assert res.json()["running"] is True
    assert res.json()["speed_factor"] == 2.0
