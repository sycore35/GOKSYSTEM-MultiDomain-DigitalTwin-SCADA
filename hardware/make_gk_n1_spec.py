"""Generate the CircuitSpec for GK-N1, the GÖKSYSTEM field I/O node, from the proven OTG-RN1 retrofit node.

GK-N1 is the full-option base design; make_card_specs.py derives each asset's GK-P1 PLC card and GK-S1 smart
card from it by keeping only the channel blocks that asset uses.

Changes against OTG-RN1 (ERC/DRC clean, fully routed):
  * the OTG-SG1 2x5 stacking header and its guard lines are removed;
  * a 1x4 I2C sensor header (3V3, SDA, SCL, GND) takes its place, for vibration / climate sensor modules;
  * the freed ESP32-S3 pins (IO15, IO16, IO12, IO13) drive 4 low-side MOSFET outputs (AO3400A, 100R gate,
    100k pull-down, 1N4148W flyback to 24 V) on a 5-pin terminal (DO1-DO4 + 24 V load common);
  * the board grows from 84 to 100 mm wide to fit the output column; J1 (24 V in) shifts 2 mm left for J8 and D13 1 mm left for J1.

Usage: python3 hardware/make_gk_n1_spec.py <pipeline workspace>   (writes specs/gk_n1_io_node.json)
"""
import copy
import json
import os
import sys

BASE = "otg_rn1_retrofit_node"
NAME = "gk_n1_io_node"
DO_PINS = [("8", "IO15"), ("9", "IO16"), ("20", "IO12"), ("21", "IO13")]   # ESP32-S3-WROOM-1 pin number, name


def two_pin(ref, value, sym, fp, pos, cat):
    return {"ref": ref, "value": value, "category": cat, "kicad_symbol": sym, "kicad_footprint": fp, "pcb_pos": pos,
            "pins": [{"number": "1", "name": "1", "electrical_type": "passive"},
                     {"number": "2", "name": "2", "electrical_type": "passive"}]}


def build(base: dict) -> dict:
    s = copy.deepcopy(base)
    s["name"] = NAME
    s["description"] = ("GK-N1 GOKSYSTEM saha I/O dugumu: 24 V DC giris (sigorta, ters polarite, TVS), R-78B3.3 -> 3V3, "
                        "ESP32-S3-WROOM-1, 4x 24 V optolu dijital giris (PC817), 2x 4-20 mA analog giris (150R sont, RC, "
                        "kenetleme, TVS), 4x low-side MOSFET dijital cikis (AO3400A + flyback), RS-485 Modbus RTU "
                        "(MAX3485 + SM712 + jumperli 120R), I2C sensor basligi. OTG-RN1 tabanli.")
    s["board"]["width_mm"] = 100

    drop = {"R7", "R8"}
    s["components"] = [c for c in s["components"] if c["ref"] not in drop]
    for c in s["components"]:
        if c["ref"] == "J3":
            c.update({"value": "I2C SENSOR 3V3 SDA SCL GND", "kicad_symbol": "Connector_Generic:Conn_01x04",
                      "kicad_footprint": "Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical",
                      "pins": [{"number": str(i), "name": str(i), "electrical_type": "passive"} for i in range(1, 5)]})

    nets = {n["name"]: n for n in s["nets"]}
    for gone in ("GUARD_ALERT", "GUARD_RST", "UART_RX", "UART_TX"):
        nets.pop(gone, None)
    for n in nets.values():
        n["connections"] = [x for x in n["connections"] if x["ref"] not in drop and x["ref"] != "J3"]
    nets["3V3"]["connections"].append({"ref": "J3", "pin": "1"})
    nets["I2C_SDA"]["connections"].append({"ref": "J3", "pin": "2"})
    nets["I2C_SCL"]["connections"].append({"ref": "J3", "pin": "3"})
    nets["GND"]["connections"].append({"ref": "J3", "pin": "4"})

    comps = s["components"]
    x0 = 90.0
    for k, (mcu_pin, _io) in enumerate(DO_PINS, start=1):
        y = 10.0 + 9.0 * (k - 1)
        rg, rp, q, d = f"R{30 + k}", f"R{40 + k}", f"Q{k}", f"D{20 + k}"
        comps += [
            two_pin(rg, "100R", "Device:R", "Resistor_SMD:R_0603_1608Metric", [x0 - 4.5, y, 0], "resistor"),
            two_pin(rp, "100k", "Device:R", "Resistor_SMD:R_0603_1608Metric", [x0 - 1.5, y + 3.5, 90], "resistor"),
            {"ref": q, "value": "AO3400A", "category": "mosfet", "kicad_symbol": "Transistor_FET:AO3400A",
             "kicad_footprint": "Package_TO_SOT_SMD:SOT-23", "pcb_pos": [x0 + 1.5, y, 0],
             "pins": [{"number": "1", "name": "G", "electrical_type": "input"},
                      {"number": "2", "name": "S", "electrical_type": "passive"},
                      {"number": "3", "name": "D", "electrical_type": "passive"}]},
            two_pin(d, "1N4148W", "Device:D", "Diode_SMD:D_SOD-123", [x0 + 6.0, y + 2.5, 90], "diode"),
        ]
        comps[-1]["pins"] = [{"number": "1", "name": "K", "electrical_type": "passive"},
                             {"number": "2", "name": "A", "electrical_type": "passive"}]
        nets[f"DO{k}_MCU"] = {"name": f"DO{k}_MCU", "connections": [{"ref": "U2", "pin": mcu_pin}, {"ref": rg, "pin": "1"}]}
        nets[f"DO{k}_G"] = {"name": f"DO{k}_G", "connections": [{"ref": rg, "pin": "2"}, {"ref": q, "pin": "1"}, {"ref": rp, "pin": "1"}]}
        nets[f"DO{k}"] = {"name": f"DO{k}", "connections": [{"ref": q, "pin": "3"}, {"ref": d, "pin": "2"}, {"ref": "J8", "pin": str(k)}]}
        nets["GND"]["connections"] += [{"ref": q, "pin": "2"}, {"ref": rp, "pin": "2"}]
        nets["24V"]["connections"].append({"ref": d, "pin": "1"})
    comps.append({"ref": "J8", "value": "DO 1-4 + 24V", "category": "connector", "kicad_symbol": "Connector_Generic:Conn_01x05",
                  "kicad_footprint": "Connector_Phoenix_MC:PhoenixContact_MC_1,5_5-G-3.5_1x05_P3.50mm_Horizontal",
                  "pcb_pos": [96.5, 56, 180],
                  "pins": [{"number": str(i), "name": str(i), "electrical_type": "passive"} for i in range(1, 6)]})
    nets["24V"]["connections"].append({"ref": "J8", "pin": "5"})
    for c in comps:      # mounting hole 2 moves to the new right edge; 24 V input terminal makes room for J8
        if c["ref"] == "H2":
            c["pcb_pos"] = [96, 4, 0]
        if c["ref"] == "J1":
            c["pcb_pos"] = [74, 56, 180]
        if c["ref"] == "D13":            # RS-485 TVS moves 1 mm left to clear J1's body
            c["pcb_pos"] = [62.5, 44, 0]
    s["nets"] = list(nets.values())
    return s


if __name__ == "__main__":
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    base = json.load(open(os.path.join(root, "specs", f"{BASE}.json")))
    out = build(base)
    path = os.path.join(root, "specs", f"{NAME}.json")
    json.dump(out, open(path, "w"), indent=2, ensure_ascii=False)
    print(path, len(out["components"]), "components", len(out["nets"]), "nets")
