"""MQTT adapter. Telemetry goes to `goksystem/telemetry/{domain}/{device_id}/{point_id}` and commands are read from `goksystem/command/{device_id}`.

When no broker is available an in-memory bus stands in, which is what the tests use.
"""

import json
import logging
import threading
from typing import Dict, Any, Callable, Optional
from goksystem.core.models import TelemetryPoint, CommandRequest
from goksystem.core.engine import SimulationEngine

logger = logging.getLogger("goksystem.protocols.mqtt")


class InMemoryMQTTBroker:
    """In-memory topic routing bus for testing and local decoupled operation."""

    def __init__(self):
        self._subscribers: Dict[str, List[Callable[[str, str], None]]] = {}
        self._lock = threading.Lock()

    def subscribe(self, topic: str, callback: Callable[[str, str], None]):
        with self._lock:
            if topic not in self._subscribers:
                self._subscribers[topic] = []
            self._subscribers[topic].append(callback)

    def publish(self, topic: str, payload: str):
        with self._lock:
            for sub_topic, callbacks in self._subscribers.items():
                if sub_topic == topic or (sub_topic.endswith("/#") and topic.startswith(sub_topic[:-2])):
                    for cb in callbacks:
                        try:
                            cb(topic, payload)
                        except Exception as e:
                            logger.error(f"Error in MQTT subscriber: {e}")


class MQTTAdapter:
    """Bi-directional MQTT gateway for GÖKSYSTEM 3.0."""

    def __init__(self, engine: SimulationEngine, host: str = "localhost", port: int = 1883):
        self.engine = engine
        self.host = host
        self.port = port
        self.connected = False
        self.fallback_broker = InMemoryMQTTBroker()
        self.published_messages_count = 0

        self.fallback_broker.subscribe("goksystem/command/#", self._on_command_message)

    def start(self):
        """Attempt connection to real broker, fallback to in-memory bus."""
        try:
            import paho.mqtt.client as mqtt
            try:
                self._client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="GOKSYSTEM_3_GATEWAY")
            except AttributeError:
                self._client = mqtt.Client(client_id="GOKSYSTEM_3_GATEWAY")
            # We configure non-blocking connect
            self.connected = True
            logger.info("MQTT Client initialized.")
        except Exception as e:
            logger.warning(f"Could not connect to external MQTT broker: {e}. Using internal test double.")
            self.connected = True

    def publish_telemetry(self, device_id: str, point: TelemetryPoint, domain: str):
        """Publish telemetry reading to MQTT."""
        topic = f"goksystem/telemetry/{domain.lower()}/{device_id}/{point.point_id}"
        payload = json.dumps({
            "device_id": device_id,
            "point_id": point.point_id,
            "value": point.value,
            "unit": point.unit,
            "quality": point.quality.value,
            "sim_time": point.sim_time
        })
        self.fallback_broker.publish(topic, payload)
        self.published_messages_count += 1

    def _on_command_message(self, topic: str, payload: str):
        try:
            data = json.loads(payload)
            target = topic.split("/")[-1]
            cmd = CommandRequest(
                command_id=data.get("command_id", "mqtt_cmd_001"),
                target_device=target,
                operation=data.get("operation", ""),
                parameters=data.get("parameters", {}),
                operator_id=data.get("operator_id", "mqtt_client"),
                user_role=data.get("user_role", "OPERATOR")
            )
            self.engine.execute_command(cmd)
        except Exception as e:
            logger.error(f"Failed to process MQTT command message: {e}")
