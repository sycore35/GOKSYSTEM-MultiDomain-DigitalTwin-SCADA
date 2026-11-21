# Field cards: GK-P1 (PLC) and GK-S1 (smart retrofit)

Every asset in the plant has its own **GK-P1 PLC card**. The motor, the feed pump and the HVAC unit also have a
**GK-S1 smart retrofit card** for condition-monitoring sensors. That is 15 KiCad designs, one per card.

| Card | MCU | I/O | Bus |
|---|---|---|---|
| GK-P1 | ESP32-S3-WROOM-1 | only the blocks the asset uses: up to 4 × 24 V opto DI, 2 × 4–20 mA AI, 4 × MOSFET DO | RS-485 Modbus RTU |
| GK-S1 | ESP32-S3-WROOM-1 | I²C sensor header (ADXL355, SHT31) and the 4–20 mA inputs it needs | RS-485 Modbus RTU |

Both are 2-layer boards with a protected 24 V input (fuse, reverse-polarity Schottky, SMAJ28A TVS, R-78B3.3
DC/DC). All 15 pass DRC with 0 errors and 0 unrouted connections under JLCPCB's 2-layer limits
(0.2 mm minimum hole, 0.3 mm copper-to-edge).

## Where things are

| Path | Contents |
|---|---|
| `hardware/kicad/<card>/` | editable KiCad project (`.kicad_pro/.kicad_sch/.kicad_pcb`), Gerber zip, BOM, pick-and-place, DRC/ERC reports |
| `frontend/public/boards/<card>/` | 3D renders, schematic PDF, BOM and DRC summary shown on the *Saha Kartları* page and in the 3D twin |
| `goksystem/modules/hardware.py` | wiring of every card: terminals, sensors, Modbus address, ladder program |

Open `hardware/kicad/<card>/<card>.kicad_pro` in KiCad 10. The library tables point at the default macOS
install (`/Applications/KiCad`); on other systems re-point them in *Preferences → Manage Libraries*.

## How the designs are generated

1. `make_gk_n1_spec.py` builds **GK-N1**, the full-option base: an existing routed retrofit-node design with
   its stacking header replaced by an I²C header and four low-side MOSFET outputs added on the free GPIOs.
2. `make_card_specs.py` derives each card from GK-N1 by removing the channel blocks the asset does not use.
   Parts are only removed, never moved, so the placement stays the proven one.
3. `build_all_cards.py` runs the KiCad pipeline (schematic, placement, FreeRouting, DRC, Gerbers) for every
   card and retries a card when the autorouter stops with open connections.
4. `finish_card.py` adds the silkscreen label (card id, asset, Modbus address), applies the fab limits,
   re-runs DRC, re-exports Gerbers and renders, and copies the results to the two folders above.

```bash
export GOKSYSTEM_EDA_DIR=/path/to/pipeline/workspace   # folder with specs/ and projects/
.venv/bin/python hardware/build_all_cards.py --jobs 3   # all 15 cards
.venv/bin/python hardware/build_all_cards.py gk_p1_tnk01
```

## Limits

- The output column of GK-N1 was placed by hand; everything else follows the base design. Silkscreen overlap
  warnings remain (cosmetic), and unused ESP32 pins show up as schematic-parity warnings.
- Analog outputs are not on the card: the valve positioner and drives are reached over RS-485.
- In the simulation the card outputs only drive relay states; they never command the plant.
- The boards have not been manufactured or bench-tested.
