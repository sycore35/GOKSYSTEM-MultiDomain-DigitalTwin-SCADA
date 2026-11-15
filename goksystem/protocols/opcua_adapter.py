"""OPC UA node model with a few exposed points (ns=2;s=GOKSYSTEM.Factory.ConveyorSpeed, Grid.TrafoLoad, Process.TankLevel, Building.SolarPower)."""

import logging
from typing import Dict, Any
from goksystem.core.state_engine import StateEngine

logger = logging.getLogger("goksystem.protocols.opcua")


class VirtualOPCUAServer:
    """Virtual OPC UA Server node hierarchy model."""

    def __init__(self, state_engine: StateEngine, endpoint: str = "opc.tcp://0.0.0.0:4840/freeopcua/server/"):
        self.state_engine = state_engine
        self.endpoint = endpoint
        self.nodes = {
            "GOKSYSTEM.Factory.ConveyorSpeed": 0.0,
            "GOKSYSTEM.Grid.TrafoLoad": 0.0,
            "GOKSYSTEM.Process.TankLevel": 0.0,
            "GOKSYSTEM.Building.SolarPower": 0.0
        }
        self.running = False

    def sync_nodes(self):
        """Poll telemetry into OPC UA variable nodes."""
        self.nodes["GOKSYSTEM.Factory.ConveyorSpeed"] = self.state_engine.read_point_value("FAC_CONVEYOR_01", "speed", 0.0)
        self.nodes["GOKSYSTEM.Grid.TrafoLoad"] = self.state_engine.read_point_value("GRID_TRAFO_01", "load_kva", 0.0)
        self.nodes["GOKSYSTEM.Process.TankLevel"] = self.state_engine.read_point_value("PROC_TANK_01", "level_pct", 0.0)
        self.nodes["GOKSYSTEM.Building.SolarPower"] = self.state_engine.read_point_value("BLD_SOLAR_PV_01", "output_kw", 0.0)

    def read_node_value(self, node_id: str) -> Any:
        self.sync_nodes()
        return self.nodes.get(node_id, 0.0)

    def write_node_value(self, node_id: str, value: Any) -> bool:
        if node_id in self.nodes:
            self.nodes[node_id] = float(value)
            return True
        return False
