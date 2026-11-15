"""Role checks (VIEWER, OPERATOR, ENGINEER, ADMIN), interlocks and parameter range checks for commands, plus an audit log."""

import time
import logging
from typing import Dict, Any, Tuple
from goksystem.core.models import CommandRequest, CommandResult

logger = logging.getLogger("goksystem.security")

ROLE_HIERARCHY = {
    "VIEWER": 0,
    "OPERATOR": 1,
    "ENGINEER": 2,
    "ADMIN": 3
}

OPERATION_PERMISSIONS = {
    # Viewer: read-only
    # Operator
    "START": "OPERATOR",
    "STOP": "OPERATOR",
    "SET_SPEED": "OPERATOR",
    "SET_FREQUENCY": "OPERATOR",
    "OPEN": "OPERATOR",
    "CLOSE": "OPERATOR",
    "DRAIN": "OPERATOR",
    "FILL": "OPERATOR",
    "SET_TEMPERATURE_SP": "OPERATOR",
    "CHARGE": "OPERATOR",
    "DISCHARGE": "OPERATOR",
    "ACK_ALARM": "OPERATOR",
    # Engineer
    "SET_TARGET_SOC": "ENGINEER",
    "ENABLE_PID": "ENGINEER",
    "SET_POSITION": "ENGINEER",
    "EXECUTE_CYCLE": "ENGINEER",
    "TAP_UP": "ENGINEER",
    "TAP_DOWN": "ENGINEER",
    "RESET_PROTECTION": "ENGINEER",
    "RESET_TRIP": "ENGINEER",
    # Admin / Critical
    "E_STOP": "OPERATOR",   # Emergency stop is open to all operators
    "INJECT_FAULT": "ENGINEER",
    "RESET_SIMULATION": "ADMIN"
}


class SecurityManager:
    """Enforces authorization, parameter bounds, and logs audit events."""

    def __init__(self):
        self._audit_log = []

    def validate_command(self, cmd: CommandRequest) -> Tuple[bool, str]:
        """Verify role, permission, and parameter safety."""
        required_role = OPERATION_PERMISSIONS.get(cmd.operation.upper(), "ENGINEER")
        
        user_level = ROLE_HIERARCHY.get(cmd.user_role.upper(), -1)
        req_level = ROLE_HIERARCHY.get(required_role, 99)
        
        if user_level < req_level:
            msg = f"Forbidden: Operation '{cmd.operation}' requires '{required_role}' privileges, got '{cmd.user_role}'"
            self._log_audit(cmd, success=False, reason=msg)
            return False, msg

        # Check parameter safety bounds
        params = cmd.parameters
        if cmd.operation.upper() == "SET_SPEED" and "speed" in params:
            spd = float(params["speed"])
            if not (0.0 <= spd <= 3.5):
                msg = f"Safety Gate Rejection: Conveyor speed {spd} m/s exceeds physical limits [0.0 - 3.5 m/s]"
                self._log_audit(cmd, success=False, reason=msg)
                return False, msg
                
        if cmd.operation.upper() == "SET_TEMPERATURE_SP" and "temperature" in params:
            temp = float(params["temperature"])
            if not (16.0 <= temp <= 32.0):
                msg = f"Safety Gate Rejection: Temperature setpoint {temp}°C outside allowable range [16 - 32°C]"
                self._log_audit(cmd, success=False, reason=msg)
                return False, msg

        self._log_audit(cmd, success=True, reason="Command validated successfully")
        return True, "OK"

    def _log_audit(self, cmd: CommandRequest, success: bool, reason: str):
        record = {
            "timestamp": time.time(),
            "command_id": cmd.command_id,
            "target": cmd.target_device,
            "operation": cmd.operation,
            "operator": cmd.operator_id,
            "role": cmd.user_role,
            "success": success,
            "reason": reason
        }
        self._audit_log.append(record)
        if len(self._audit_log) > 5000:
            self._audit_log.pop(0)

    def get_audit_trail(self, limit: int = 100):
        return self._audit_log[-limit:]
