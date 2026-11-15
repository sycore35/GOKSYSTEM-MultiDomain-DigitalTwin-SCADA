# Simulation models

Constants below are the ones used in `goksystem/domains/`.

**Factory line.** Conveyor speed follows a first-order lag towards the target, dV/dt = (V_target - V) / tau, tau = 0.4 s. Pull-cord braking decelerates at 14 m/s^2. The vibration signal contains a 185 Hz bearing-defect component sampled at 1 kHz.

**Grid.** Transformer top-oil temperature follows ambient + rated rise * (S / S_rated)^1.6 with a 300 s time constant, and the winding hotspot adds its own rise (same exponent) with a 40 s time constant (IEEE C57.91 style). Protection: ANSI 50 instantaneous overcurrent at 160 A on the primary and ANSI 49 thermal trip at a 130 C hotspot.

**Process.** Tank drain uses Torricelli's law, Q = Cd * A * sqrt(2 g h) with Cd = 0.62, plus the mass balance dV/dt = Q_in - Q_drain. The pH loop is a PID controller (Kp 18, Ki 1.2, Kd 0.5) with integral clamping.

**Building.** The zone temperature is a first-order thermal model (tau = 180 s). Solar output follows a diurnal sine-shaped irradiance curve scaled to a 150 kW array, and the 250 kWh battery integrates charge/discharge power into SOC.
