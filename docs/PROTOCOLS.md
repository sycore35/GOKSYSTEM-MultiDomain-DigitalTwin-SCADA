# Protocols

## Modbus TCP
`goksystem/protocols/modbus_server.py` is a real Modbus TCP server on `127.0.0.1:5020` (override with `GOKSYSTEM_MODBUS_SIM_PORT`). Writes are rejected unless enabled. The full register map is in the module docstring. Addresses are 0-based, for example:

| Table | Address | Point |
|---|---|---|
| Input register | 0 | conveyor speed, x100 m/s |
| Input register | 5 | tank level, x10 % |
| Input register | 7 | transformer load, kVA |
| Holding register | 0 | conveyor speed setpoint, x100 m/s |
| Coil | 0 | conveyor run |

## MQTT
Telemetry is published to `goksystem/telemetry/{domain}/{device_id}/{point_id}` and commands are read from `goksystem/command/{device_id}`. If no broker is reachable, an in-memory bus is used instead (this is what the tests run against).

## OPC UA
The adapter in `opcua_adapter.py` keeps a small node model (`ns=2;s=GOKSYSTEM.Factory.ConveyorSpeed`, `...Grid.TrafoLoad`, `...Process.TankLevel`, `...Building.SolarPower`). It is not a network server at the moment.

## Factory I/O
`factoryio_adapter.py` runs in mock mode by default. Set `GOKSYSTEM_FACTORYIO_MODE` to `live` (with `GOKSYSTEM_FACTORYIO_HOST` / `_PORT`) or `off`.
