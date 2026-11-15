"""Analytics: FFT vibration spectrum (185 Hz bearing defect), transformer health index from the C57.91 thermal model and 3-sigma SPC limits for the process tank."""

import numpy as np
from typing import Dict, Any, List


class AnalyticsEngine:
    """Industrial predictive analytics and condition monitoring."""

    @staticmethod
    def analyze_vibration_fft(samples: List[float], sample_rate_hz: float = 1000.0) -> Dict[str, Any]:
        """Perform real FFT on acceleration vibration data.
        
        Assumptions:
        - Sample rate: 1000 Hz (Nyquist limit = 500 Hz, sufficient for 185 Hz bearing fault)
        - Hanning window applied to reduce spectral leakage
        """
        n = len(samples)
        if n < 64:
            return {"status": "INSUFFICIENT_DATA", "peak_freq_hz": 0.0, "defect_detected": False}

        windowed = np.array(samples) * np.hanning(n)
        fft_vals = np.abs(np.fft.rfft(windowed)) / (n / 2.0)
        freqs = np.fft.rfftfreq(n, d=1.0 / sample_rate_hz)

        # Locate peak near 185 Hz (+/- 10 Hz band)
        band_mask = (freqs >= 175.0) & (freqs <= 195.0)
        band_amp = np.max(fft_vals[band_mask]) if np.any(band_mask) else 0.0
        overall_peak_idx = np.argmax(fft_vals[1:]) + 1
        overall_peak_freq = freqs[overall_peak_idx]

        # Bearing defect threshold: 0.5g in the 185 Hz band
        defect_detected = band_amp > 0.5

        return {
            "status": "ANALYZED",
            "overall_peak_freq_hz": round(float(overall_peak_freq), 2),
            "bearing_185hz_amp_g": round(float(band_amp), 3),
            "defect_detected": bool(defect_detected),
            "condition": "CRITICAL_DEFECT" if defect_detected else "NORMAL"
        }

    @staticmethod
    def calculate_transformer_health_index(winding_hotspot_c: float, oil_temp_c: float) -> Dict[str, Any]:
        """Calculates aging acceleration factor based on Arrhenius IEEE C57.91."""
        # Reference rated hotspot: 110°C
        # Aging factor F_AA = exp(15000 / 383 - 15000 / (hotspot + 273))
        t_kelvin = winding_hotspot_c + 273.15
        f_aa = np.exp(15000.0 / 383.15 - 15000.0 / t_kelvin)
        
        # Health Index 0 to 100%
        if f_aa <= 1.0:
            hi = 98.0 - (f_aa * 5.0)
        elif f_aa <= 4.0:
            hi = 90.0 - (f_aa * 10.0)
        else:
            hi = max(10.0, 50.0 - f_aa * 5.0)

        return {
            "hotspot_temp_c": round(winding_hotspot_c, 1),
            "aging_acceleration_factor": round(float(f_aa), 3),
            "health_index_pct": round(float(hi), 1),
            "status": "GOOD" if hi > 80.0 else ("WARNING" if hi > 50.0 else "POOR")
        }
