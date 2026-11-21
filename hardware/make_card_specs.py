"""Generate one CircuitSpec per field card (goksystem/modules/hardware.py) for the KiCad build pipeline.

  * GK-P1 PLC card of an asset = GK-N1 (hardware/make_gk_n1_spec.py) with only the DI / AI / DO channel blocks
    that asset is wired to; the I2C header goes to the smart card. RS-485 always stays (uplink to SCADA).
  * GK-S1 smart card = OTG-RN1 core (power, ESP32-S3, RS-485) + I2C sensor header + the 4-20 mA inputs it
    needs; no DI, no DO, 84 mm wide.

All placements come from the routed, DRC-clean base designs; blocks are only removed, never moved.

Usage: python3 hardware/make_card_specs.py <pipeline workspace>   -> specs/gk_p1_*.json, specs/gk_s1_*.json
Prints one line per card: <project> <silkscreen label>.
"""
import copy
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

from goksystem.modules import hardware as hw  # noqa: E402
import make_gk_n1_spec as gkn1  # noqa: E402

BLOCKS = {
    "DI1": ["R9", "U3", "D5", "R10"], "DI2": ["R11", "U4", "D6", "R12"],
    "DI3": ["R13", "U5", "D7", "R14"], "DI4": ["R15", "U6", "D8", "R16"],
    "AI1": ["R17", "R18", "C8", "D9", "D10"], "AI2": ["R19", "R20", "C9", "D11", "D12"],
    "DO1": ["R31", "R41", "Q1", "D21"], "DO2": ["R32", "R42", "Q2", "D22"],
    "DO3": ["R33", "R43", "Q3", "D23"], "DO4": ["R34", "R44", "Q4", "D24"],
}
GROUP_PARTS = {"DI": ["J4"], "AI": ["J5", "F2"], "DO": ["J8"]}
NAMES = {"FAC_CONVEYOR_01": "ANA KONVEYOR", "FAC_ROBOT_01": "ROBOT KOL", "FAC_VFD_MOTOR_01": "SURUCULU MOTOR",
         "PROC_TANK_01": "REAKTOR TANKI", "PROC_PUMP_01": "BESLEME POMPASI", "PROC_VALVE_01": "KONTROL VANASI",
         "GRID_TRAFO_01": "11/0,4 kV TRAFO", "GRID_BREAKER_01": "ANA KESICI", "GRID_BUSBAR_11KV": "11 kV BARA",
         "BLD_HVAC_ZONE1": "KLIMA SANTRALI", "BLD_SOLAR_PV_01": "GUNES PANELI", "BLD_BMS_BATTERY_01": "BATARYA SISTEMI"}


def prune(spec: dict, remove: set) -> dict:
    s = copy.deepcopy(spec)
    s["components"] = [c for c in s["components"] if c["ref"] not in remove]
    nets = []
    for n in s["nets"]:
        conns = [x for x in n["connections"] if x["ref"] not in remove]
        if len(conns) >= 2 or (conns and n["name"] in ("GND", "3V3", "24V")):
            nets.append({**n, "connections": conns})
    s["nets"] = nets
    return s


def channel_removals(populated: set, groups=("DI", "AI", "DO")) -> set:
    rm = set()
    for ch, refs in BLOCKS.items():
        if ch[:2] in groups and ch not in populated:
            rm |= set(refs)
    for g in groups:
        if not any(ch.startswith(g) for ch in populated):
            rm |= set(GROUP_PARTS[g])
    return rm


def plc_spec(gk: dict, device_id: str) -> dict:
    n = hw.NODES[device_id]
    populated = {c["ch"] for c in n["channels"]}
    s = prune(gk, channel_removals(populated) | {"J3", "R5", "R6"})
    s["name"] = hw.project_name(device_id, "plc")
    kinds = {k: sum(1 for c in n["channels"] if c["kind"] == k) for k in ("DI", "AI", "DO")}
    s["description"] = (f"{n['node_id']} PLC I/O karti, {device_id} ({n['location']}): GK-N1 tabanli; "
                        f"{kinds['DI']} DI, {kinds['AI']} AI (4-20 mA), {kinds['DO']} DO (MOSFET), RS-485 Modbus adres {n['address']}.")
    return s


def smart_spec(gk: dict, device_id: str) -> dict:
    n = hw.NODES[device_id]
    sm = n["smart"]
    populated = {c["ch"] for c in sm["channels"]}
    rm = channel_removals(populated, ("DI", "AI")) | channel_removals(set(), ("DO",))
    s = prune(gk, rm)
    s["name"] = hw.project_name(device_id, "smart")
    s["board"]["width_mm"] = 84                       # no output column: back to the OTG-RN1 outline
    for c in s["components"]:
        if c["ref"] == "J1":
            c["pcb_pos"] = [76, 56, 180]
        elif c["ref"] == "H2":
            c["pcb_pos"] = [80, 4, 0]
        elif c["ref"] == "D13":
            c["pcb_pos"] = [63.5, 44, 0]
    s["description"] = (f"{sm['card_id']} akilli donusum karti, {device_id} ({sm['location']}): OTG-RN1 cekirdegi, "
                        f"I2C sensor basligi, {len(populated)} adet 4-20 mA giris, RS-485 Modbus adres {sm['address']}.")
    return s


def main(root: str):
    base = json.load(open(os.path.join(root, "specs", f"{gkn1.BASE}.json")))
    gk = gkn1.build(base)
    for dev, n in hw.NODES.items():
        jobs = [("plc", plc_spec(gk, dev), f"{n['node_id']}  {NAMES[dev]}  @{n['address']}")]
        if "smart" in n:
            jobs.append(("smart", smart_spec(gk, dev), f"{n['smart']['card_id']}  {NAMES[dev]}  @{n['smart']['address']}"))
        for _fam, spec, label in jobs:
            json.dump(spec, open(os.path.join(root, "specs", f"{spec['name']}.json"), "w"), indent=2, ensure_ascii=False)
            print(f"{spec['name']}\t{label}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
