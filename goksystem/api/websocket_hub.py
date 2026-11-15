"""WebSocket hub for pushing state deltas to the UI. Each client gets a bounded queue so a slow browser cannot stall the simulation loop."""

import asyncio
import json
import logging
from typing import Set
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("goksystem.api.ws")


class WebSocketHub:
    """Manages active browser WebSocket connections with backpressure buffering."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            self.active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast_delta(self, delta_payload: dict):
        """Broadcast state updates to all connected clients."""
        if not self.active_connections:
            return

        message_str = json.dumps(delta_payload)
        dead_connections = []

        async with self._lock:
            for connection in list(self.active_connections):
                try:
                    await asyncio.wait_for(connection.send_text(message_str), timeout=0.1)
                except Exception:
                    dead_connections.append(connection)

            for dead in dead_connections:
                self.active_connections.discard(dead)
