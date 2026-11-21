"""After `eda.py build specs/<card>.json`: label the board, apply fab limits, regenerate outputs and publish.

1. Adds silkscreen identification: card id, asset and Modbus address on the top side, a large card id on the
   bottom side (real field cards carry this; it also tells otherwise similar variants apart).
2. Sets the fab limits the base design uses (0.2 mm min hole for the ESP32-S3 module's thermal vias,
   0.3 mm copper-to-edge; within JLCPCB's 2-layer process).
3. Re-runs DRC, re-exports Gerbers/drill and the 3D renders so they include the label.
4. Copies renders, schematic PDF, BOM, build status and a DRC summary to frontend/public/boards/<card>/.

Usage: python3 hardware/finish_card.py <projects/<card>> "<top label>"
"""
import json
import os
import shutil
import subprocess
import sys
import uuid
import zipfile
from collections import Counter

KICAD_CLI = "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"
FAB_RULES = {"min_through_hole_diameter": 0.2, "min_copper_edge_clearance": 0.3}
ORIGIN = (100.0, 60.0)          # pipeline places the board outline at (100, 60)


def text(s, x, y, layer, size, justify):
    return (f'\t(gr_text "{s}"\n\t\t(at {x:.2f} {y:.2f} 0)\n\t\t(layer "{layer}")\n\t\t(uuid "{uuid.uuid4()}")\n'
            f'\t\t(effects\n\t\t\t(font\n\t\t\t\t(size {size} {size})\n\t\t\t\t(thickness {size * 0.15:.2f})\n\t\t\t)\n'
            f'\t\t\t(justify {justify})\n\t\t)\n\t)\n')


def add_labels(pcb: str, top: str, card_id: str, width: float):
    s = open(pcb).read()
    if f'(gr_text "{top}"' in s:          # already labelled (the build regenerates the board from scratch)
        return
    x0, y0 = ORIGIN
    block = (text(top, x0 + 8.0, y0 + 3.0, "F.SilkS", 1.1, "left")
             + text(f"GOKSYSTEM {card_id}", x0 + width / 2, y0 + 30.0, "B.SilkS", 3.0, "mirror"))
    i = s.rstrip().rfind(")")
    open(pcb, "w").write(s[:i] + block + s[i:])


def run(*a):
    return subprocess.run([str(x) for x in a], capture_output=True, text=True)


def export_sources(proj: str, name: str):
    """Copy the editable KiCad sources and fab outputs into hardware/kicad/<card>/ (STEP models are left out: ~4.5 MB each)."""
    dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kicad", name)
    os.makedirs(dst, exist_ok=True)
    for f in (f"{name}.kicad_pro", f"{name}.kicad_sch", f"{name}.kicad_pcb", "fp-lib-table", "sym-lib-table", "drc.json", "erc.json"):
        if os.path.exists(os.path.join(proj, f)):
            shutil.copy2(os.path.join(proj, f), dst)
    for f in (f"{name}_gerbers.zip", f"{name}_bom.csv", f"{name}_cpl.csv"):
        if os.path.exists(os.path.join(proj, "fab", f)):
            shutil.copy2(os.path.join(proj, "fab", f), dst)


def board_stats(status: dict) -> dict:
    pcb = status.get("steps", {}).get("pcb", {})
    route = pcb.get("routing", {})
    return {"size_mm": pcb.get("board_mm"), "footprints": pcb.get("footprints"), "nets": pcb.get("nets"),
            "tracks": route.get("tracks"), "vias": route.get("vias"), "unrouted": status.get("unrouted")}


def to_jpg(src: str, dst: str, max_px: int = 0, quality: int = 85):
    """PNG render -> JPEG for the web UI (about 5x smaller). Uses macOS sips, else Pillow."""
    if shutil.which("sips"):
        args = ["sips", "-s", "format", "jpeg", "-s", "formatOptions", str(quality)] + (["-Z", str(max_px)] if max_px else [])
        run(*args, src, "--out", dst)
        return
    from PIL import Image                         # pip install pillow on Linux/Windows
    im = Image.open(src).convert("RGB")
    if max_px:
        im.thumbnail((max_px, max_px))
    im.save(dst, "JPEG", quality=quality)


def main(proj: str, top_label: str):
    name = os.path.basename(os.path.normpath(proj))
    pcb = os.path.join(proj, f"{name}.kicad_pcb")
    status_path = os.path.join(proj, "build_status.json")
    status = json.load(open(status_path))
    width = status["steps"]["pcb"]["board_mm"][0]
    card_id = top_label.split()[0]
    add_labels(pcb, top_label, card_id, width)

    pro = os.path.join(proj, f"{name}.kicad_pro")
    d = json.load(open(pro))
    d["board"]["design_settings"]["rules"].update(FAB_RULES)
    json.dump(d, open(pro, "w"), indent=2)

    drc = os.path.join(proj, "drc.json")
    run(KICAD_CLI, "pcb", "drc", "--format", "json", "--severity-all", "--schematic-parity", "-o", drc, pcb)
    r = json.load(open(drc))
    items = r.get("violations", []) + r.get("unconnected_items", []) + r.get("schematic_parity", [])
    errors = [x for x in items if x.get("severity") == "error"]
    summary = {"errors": len(errors), "warnings": len(items) - len(errors),
               "error_list": [f"{x.get('type')}: {x.get('description')}" for x in errors][:20],
               "by_type": dict(Counter(f"{x.get('type')}:{x.get('severity')}" for x in items)),
               "unconnected": len(r.get("unconnected_items", [])), "fab_rules": FAB_RULES,
               "board": board_stats(status)}

    fab = os.path.join(proj, "fab")
    gdir = os.path.join(fab, "gerber")
    shutil.rmtree(gdir, ignore_errors=True)
    os.makedirs(gdir)
    run(KICAD_CLI, "pcb", "export", "gerbers", "-o", gdir, "--layers",
        "F.Cu,B.Cu,F.Paste,B.Paste,F.Silkscreen,B.Silkscreen,F.Mask,B.Mask,Edge.Cuts", pcb)
    run(KICAD_CLI, "pcb", "export", "drill", "--format", "excellon", "--excellon-separate-th", "-o", gdir + "/", pcb)
    with zipfile.ZipFile(os.path.join(fab, f"{name}_gerbers.zip"), "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(os.listdir(gdir)):
            z.write(os.path.join(gdir, f), f)
    for side, extra in (("top", []), ("bottom", []), ("iso", ["--rotate", "-45,0,45", "--perspective"])):
        run(KICAD_CLI, "pcb", "render", "-o", os.path.join(proj, f"3d_{side}.png"), "--quality", "high",
            "--width", "1600", "--height", "1200", "--background", "opaque",
            "--side", "top" if side == "iso" else side, *extra, pcb)

    status["steps"]["kicad_drc"] = f"{summary['errors']} errors, {summary['warnings']} warnings (fab rules {FAB_RULES})"
    status["drc_errors"] = summary["errors"]
    status["label"] = top_label
    json.dump(status, open(status_path, "w"), indent=2, ensure_ascii=False)

    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "public", "boards", name)
    os.makedirs(out, exist_ok=True)
    for side in ("top", "bottom", "iso"):
        to_jpg(os.path.join(proj, f"3d_{side}.png"), os.path.join(out, f"3d_{side}.jpg"))
    to_jpg(os.path.join(proj, "3d_top.png"), os.path.join(out, "thumb.jpg"), max_px=512)   # 3D twin panel texture
    shutil.copy2(os.path.join(proj, f"{name}_schematic.pdf"), out)
    shutil.copy2(os.path.join(fab, f"{name}_bom.csv"), out)
    json.dump(summary, open(os.path.join(out, "drc_summary.json"), "w"), indent=2, ensure_ascii=False)
    export_sources(proj, name)
    print(name, "DRC errors:", summary["errors"], "unrouted:", status["unrouted"], summary["error_list"][:3])


if __name__ == "__main__":
    if sys.argv[1] == "--sources-only":           # re-export sources of already finished cards
        for proj in sys.argv[2:]:
            export_sources(proj, os.path.basename(os.path.normpath(proj)))
    else:
        main(sys.argv[1], sys.argv[2])
