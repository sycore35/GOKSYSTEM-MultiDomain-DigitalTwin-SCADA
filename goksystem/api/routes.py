"""REST routes for devices, alarms, commands, historian, analytics and simulation control."""

import os
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from typing import Dict, Any, List, Optional
from goksystem.core.models import (
    DeviceDefinition, DeviceRuntimeState, CommandRequest, CommandResult,
    AlarmRecord, SystemStateSummary, DomainType
)

router = APIRouter(prefix="/api/v1")


def configure_factoryio(adapter, mode: str, host=None, port=None, start: bool = True):
    """mode: 'mock' (in-memory, default), 'live' (Modbus TCP to Factory I/O) or 'off' (stopped)."""
    mode = mode.lower()
    if mode not in ("mock", "live", "off"):
        raise ValueError("mode must be mock, live or off")
    adapter.stop()
    adapter.configure(host=host, port=port)
    if mode == "mock":
        adapter.enable_mock_mode(True)
        if start:
            adapter.start()
    elif mode == "live":
        adapter.enable_mock_mode(False)
        if start:
            adapter.start()
    else:
        adapter.enable_mock_mode(False)
    return mode


def register_routes(app, engine, ws_hub, ctx=None):
    """Binds simulation engine instance to REST endpoints.

    `ctx` (optional) supplies authentication/audit (need(), audit_fn()). Without it the endpoints are open.
    """
    from goksystem.modules.operators import Operator
    if ctx is not None:
        cmd_dep, sim_dep, fault_dep, reset_dep = ctx.need("COMMAND"), ctx.need("SIM_PAUSE"), ctx.need("INJECT_FAULT"), ctx.need("SIM_RESET")
        proto_dep = ctx.need("PROTOCOL_CONTROL")
        audit = ctx.audit_fn
    else:
        _anon = lambda: Operator("local_operator", "Local", "ADMIN")
        cmd_dep = sim_dep = fault_dep = reset_dep = proto_dep = _anon
        audit = lambda *a, **k: None

    @router.get("/health")
    def health_check():
        return {
            "status": "HEALTHY",
            "version": "3.0.0",
            "engine_running": engine.running,
            "sim_time": engine.sim_time,
            "clients_connected": len(ws_hub.active_connections)
        }

    @router.get("/devices", response_model=List[DeviceDefinition])
    def list_devices(domain: Optional[DomainType] = None):
        if domain:
            return engine.registry.list_by_domain(domain)
        return engine.registry.list_all()

    @router.get("/devices/{device_id}", response_model=DeviceRuntimeState)
    def get_device_state(device_id: str):
        state = engine.state_engine.get_device_state(device_id)
        if not state:
            raise HTTPException(status_code=404, detail=f"Device '{device_id}' not found.")
        return state

    @router.get("/states")
    def get_all_states():
        return engine.state_engine.get_all_states()

    @router.post("/commands", response_model=CommandResult)
    def execute_command(cmd: CommandRequest, op: Operator = Depends(cmd_dep)):
        # The authenticated role (not the request body) decides what the caller may do.
        if ctx is not None and op.username != "local_operator":
            cmd = cmd.model_copy(update={"user_role": op.role, "operator_id": op.username})
        res = engine.execute_command(cmd)
        audit(op, "COMMAND", cmd.target_device, {"operation": cmd.operation, "parameters": cmd.parameters, "role": cmd.user_role}, "OK" if res.success else "REJECTED")
        return res

    @router.get("/alarms", response_model=List[AlarmRecord])
    def list_alarms(active_only: bool = True):
        if active_only:
            return engine.alarm_engine.get_active_alarms()
        return engine.alarm_engine.get_all_alarms()

    @router.get("/summary", response_model=SystemStateSummary)
    def get_summary():
        return engine.get_summary()

    @router.post("/simulation/control")
    def control_simulation(action: str = Query(..., pattern="^(start|pause|resume|reset)$"), speed: Optional[float] = None,
                           op: Operator = Depends(sim_dep)):
        if action == "reset" and not op.can("SIM_RESET"):
            raise HTTPException(403, f"Role '{op.role}' lacks permission 'SIM_RESET'")
        audit(op, f"SIM_{action.upper()}", "engine", {"speed": speed})
        if action == "start":
            engine.start()
        elif action == "pause":
            engine.pause()
        elif action == "resume":
            engine.resume()
        elif action == "reset":
            engine.reset()

        if speed is not None:
            engine.set_speed(speed)

        return {"status": "SUCCESS", "action": action, "speed_factor": engine.speed_factor, "running": engine.running}

    @router.post("/simulation/fault")
    def inject_fault(target_device: str, fault_type: str, parameters: Dict[str, Any] = None, op: Operator = Depends(fault_dep)):
        ok = engine.inject_fault(target_device, fault_type, parameters or {})
        audit(op, "FAULT_INJECT", target_device, {"fault_type": fault_type, "parameters": parameters or {}}, "OK" if ok else "UNKNOWN_FAULT")
        if not ok:
            raise HTTPException(400, f"Unknown fault '{fault_type}' for device '{target_device}'")
        return {"status": "FAULT_INJECTED", "target_device": target_device, "fault_type": fault_type}

    @router.get("/historian/trends")
    def get_trends(device_id: str, point_id: str, limit: int = 150):
        if not engine.historian:
            return []
        return engine.historian.query_trends(device_id, point_id, limit=limit)

    @router.get("/historian/export/csv")
    def export_csv(device_id: str, point_id: str):
        if not engine.historian:
            raise HTTPException(status_code=400, detail="Historian persistence not enabled.")
        csv_data = engine.historian.export_telemetry_csv(device_id, point_id)
        return Response(content=csv_data, media_type="text/csv", headers={
            "Content-Disposition": f"attachment; filename={device_id}_{point_id}_trends.csv"
        })

    @router.get("/audit")
    def get_audit(limit: int = 50):
        return engine.security_mgr.get_audit_trail(limit=limit)

    
    # Factory I/O 3D Simulator Integration Endpoints
    from goksystem.protocols.factoryio_adapter import FactoryIOAdapter
    if not hasattr(engine, "factoryio_adapter"):
        engine.factoryio_adapter = FactoryIOAdapter(engine.state_engine)
        mode = os.environ.get("GOKSYSTEM_FACTORYIO_MODE", "mock").lower()     # mock | live | off
        if mode not in ("mock", "live", "off"):
            mode = "mock"
        h, p = os.environ.get("GOKSYSTEM_FACTORYIO_HOST"), os.environ.get("GOKSYSTEM_FACTORYIO_PORT")
        configure_factoryio(engine.factoryio_adapter, mode, h, int(p) if p else None, start=False)
        engine.factoryio_mode = mode

    @router.get("/factoryio/status")
    def get_factoryio_status():
        st = engine.factoryio_adapter.get_status()
        st["configured_mode"] = getattr(engine, "factoryio_mode", "mock")
        return st

    @router.post("/factoryio/config")
    def set_factoryio_config(body: Dict[str, Any], op: Operator = Depends(proto_dep)):
        try:
            mode = configure_factoryio(engine.factoryio_adapter, str(body.get("mode", "mock")), body.get("host"), body.get("port"))
        except ValueError as e:
            raise HTTPException(400, str(e))
        engine.factoryio_mode = mode
        audit(op, "FACTORYIO_CONFIG", "factoryio", {k: body.get(k) for k in ("mode", "host", "port")})
        return get_factoryio_status()

    @router.post("/factoryio/command-mode")
    def toggle_factoryio_command_mode(enabled: bool = Query(...), op: Operator = Depends(proto_dep)):
        new_state = engine.factoryio_adapter.set_command_mode(enabled)
        audit(op, "FACTORYIO_COMMAND_MODE", "factoryio", {"enabled": new_state})
        return {"command_mode_enabled": new_state}

    @router.post("/factoryio/command")
    def execute_factoryio_actuator_command(tag_id: str, value: float, op: Operator = Depends(cmd_dep)):
        res = engine.factoryio_adapter.send_actuator_command(tag_id, value)
        audit(op, "FACTORYIO_COMMAND", tag_id, {"value": value}, "OK" if res.get("success") else "REJECTED")
        if not res.get("success"):
            raise HTTPException(status_code=400, detail=res.get("error", "Actuator write failed"))
        return res

    app.include_router(router)
