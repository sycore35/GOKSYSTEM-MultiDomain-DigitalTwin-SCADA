"""Build every field card (GK-P1 per asset, GK-S1 where the asset has a smart card) with the KiCad build
pipeline, retry builds whose autorouting left connections open (FreeRouting sometimes stops early), then
label / check / publish each one with finish_card.py.

GOKSYSTEM_EDA_DIR must point at the pipeline workspace (it holds specs/ and projects/ and the base design
specs/otg_rn1_retrofit_node.json). GOKSYSTEM_EDA_CMD is the build command, run from that folder
(default: "../ortak/.venv/bin/python ../ortak/pipeline/eda.py").

Usage: GOKSYSTEM_EDA_DIR=... .venv/bin/python hardware/build_all_cards.py [--jobs 3] [card_project ...]
"""
import json
import os
import shlex
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EDA = os.environ.get("GOKSYSTEM_EDA_DIR", "")
EDA_CMD = shlex.split(os.environ.get("GOKSYSTEM_EDA_CMD", "../ortak/.venv/bin/python ../ortak/pipeline/eda.py"))
TRIES = 3


def build_one(name: str, label: str) -> str:
    status = os.path.join(EDA, "projects", name, "build_status.json")
    open_ = None
    for attempt in range(1, TRIES + 1):
        with open(os.path.join(EDA, "projects", f"{name}.build.log"), "w") as log:
            subprocess.run([*EDA_CMD, "build", f"specs/{name}.json", "--force"],
                           cwd=EDA, stdout=log, stderr=subprocess.STDOUT)
        try:
            open_ = json.load(open(status)).get("unrouted")
        except (OSError, ValueError):
            open_ = None
        if open_ == 0:
            break
    r = subprocess.run([sys.executable, os.path.join(HERE, "finish_card.py"), os.path.join(EDA, "projects", name), label],
                       cwd=ROOT, capture_output=True, text=True)
    return f"{name}: tries={attempt} unrouted={open_} | {(r.stdout or r.stderr).strip().splitlines()[-1] if (r.stdout or r.stderr) else ''}"


def main():
    if not EDA or not os.path.isdir(os.path.join(EDA, "specs")):
        sys.exit("Set GOKSYSTEM_EDA_DIR to the KiCad pipeline workspace (the folder with specs/ and projects/).")
    args = sys.argv[1:]
    jobs = 3
    if "--jobs" in args:
        i = args.index("--jobs"); jobs = int(args[i + 1]); del args[i:i + 2]
    out = subprocess.run([sys.executable, os.path.join(HERE, "make_card_specs.py"), "."], cwd=EDA,
                         capture_output=True, text=True, check=True).stdout
    cards = [line.split("\t", 1) for line in out.strip().splitlines()]
    if args:
        cards = [c for c in cards if c[0] in args]
    with ThreadPoolExecutor(jobs) as ex:
        for line in ex.map(lambda c: build_one(*c), cards):
            print(line, flush=True)


if __name__ == "__main__":
    main()
