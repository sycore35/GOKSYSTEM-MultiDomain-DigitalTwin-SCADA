# 10 Hz loop: timing, fault tolerance, determinism

The simulation runs in one thread at a nominal 100 ms period (`SimulationEngine._run_loop`): an absolute-deadline
scheduler (no drift) that sleeps until ~5 ms before the deadline and busy-waits the rest.
Every tick is recorded by `TickProfiler` (`goksystem/modules/perf.py`) and shown on the **Motor** page.

| Metric | Definition |
|---|---|
| step duration | compute time of one `step_once()` |
| period error | actual start-to-start interval minus 100 ms (absolute value for percentiles) |
| jitter σ | standard deviation of the signed period error (sensitive to single outliers; read p95/p99 with it) |
| overrun | a step whose compute time exceeded its period budget |
| missed deadline | a tick that started more than one full period late |

## How to measure

```bash
.venv/bin/python scripts/measure_tick.py 60            # engine only, no server
.venv/bin/python scripts/measure_tick.py 60 --full     # + ms time-series store, energy, PLC, run-history
.venv/bin/python scripts/measure_tick_under_load.py 30 # full server + 20 HTTP req/s + 1 WebSocket client
```

`measure_tick_under_load.py` also reports Python GC pauses per generation. `--no-gc-freeze` and
`GOKSYSTEM_GIL_SWITCH_S=0.005` reproduce the previous server settings for comparison.

## Results (MacBook, Python 3.11, 2026-11-18)

Engine only, 10 s: step p99 0.44 ms, period error p95 0.05 ms, max 0.19 ms, 0 overruns.

Full server under the fixed load, 3 × 30 s per setting. "old" = Python defaults, "new" = `gc.freeze()` after
startup + 0.5 ms GIL switch interval (both now set in `goksystem/main.py`).

| run | setting | period err p50 | p95 | p99 | max | gen2 GC pause max |
|---|---|---|---|---|---|---|
| 1 | old | 0.019 | 0.32 | 2.00 | 28.4 | 12.3 |
| 1 | new | 0.014 | 0.55 | 15.5 | 72.2 | 3.9 |
| 2 | old | 0.012 | 0.046 | 1.63 | 2.70 | 22.0 |
| 2 | new | 0.018 | 0.050 | 0.28 | 0.32 | 1.5 |
| 3 | old | 0.016 | 0.100 | 1.01 | 1.49 | 24.5 |
| 3 | new | 0.019 | 0.044 | 0.43 | 2.49 | 3.4 |

(all values ms; 0 overruns and 0 missed deadlines in every run)

What this shows, and what it does not:

* `gc.freeze()` cuts the worst full (gen2) garbage-collection pause from 12–24 ms to 1.5–3.9 ms in every run.
  A GC pause stops every thread, including the sim loop, so this removes a known source of late ticks.
* The tick-level effect is **not** established: "new" was better in runs 2 and 3, but run 1 had a 72 ms outlier
  that the GC log does not explain (another process on the machine is the likely cause). Treat the p99/max
  numbers as machine-dependent; the median stays at ~0.02 ms either way.
* An earlier, noisier comparison with the browser UI attached measured p99 39.8 ms (old) vs 5.1 ms (new GIL
  setting), which motivated the change.

## Fault tolerance and determinism

* Each domain model and hook runs inside `_guarded`: an exception marks only that domain's devices as
  `MODEL_FAULT`, counts the error in the profiler and the loop keeps running
  (`tests/test_platform_core.py::test_domain_exception_marks_model_fault_and_others_continue`, Motor page → *Hata toleransı*).
* Same seed ⇒ identical trajectory, hashed over every published point
  (`test_determinism_same_seed_identical_trajectory`, Motor page → *Determinizm*). Run-history counters and
  the per-asset field-node PLC programs use simulation time only, so they are deterministic as well
  (`tests/test_runtime_tracker.py`, `tests/test_hardware_nodes.py`).
