"""Field hardware: every simulated asset has its own PLC card, and assets that need condition monitoring also
have a smart retrofit card. Each card is its own KiCad design.

Families (hardware/make_card_specs.py -> elektronik-tasarim pipeline, one project per card):
  * GK-P1 PLC I/O card - derived from GK-N1 / OTG-RN1: 24 V DC, ESP32-S3, opto 24 V DI, 4-20 mA AI, low-side
    MOSFET DO, RS-485 Modbus RTU. Only the channel blocks an asset uses are placed, so every asset's board differs.
  * GK-S1 smart retrofit card - same power/MCU/RS-485 core with an I2C sensor header and optional 4-20 mA
    input, no DI/DO. It reads condition-monitoring sensors and serves them to the asset's PLC card over RS-485.

The ladder program of an asset runs on its PLC card (goksystem.modules.plc.PLCRuntime), scanned once per
simulation tick. Inputs are read from live telemetry through the wiring below; card firmware is assumed to
scale 4-20 mA to engineering units, so AI tags carry engineering values. Outputs drive relay states only:
they never command the plant (that stays with the operator, the main PLC page and Factory I/O).
"""
import copy
import threading
from typing import Any, Dict, List, Optional

from goksystem.modules.plc import PLCRuntime

SHUNT_OHM = 150.0
ADC_FULL_V = 3.3
ADC_MAX = 4095
DI_SUPPLY_V = 24.0
DI_SERIES_OHM = 3300.0

_POWER = "24 V DC (sigorta, ters polarite Schottky, SMAJ28A TVS) → R-78B3.3 → 3,3 V"
_RS485 = {"group": "RS-485", "detail": "MAX3485, SM712 TVS, jumperlı 120 Ω sonlandırma, Modbus RTU", "terminal": "J6 (A, B, GND)"}
_IO_DETAIL = {
    "DI": {"detail": "24 V, PC817 optokuplör, 3,3 kΩ seri direnç (~6,9 mA), 1N4148W ters koruma", "terminal": "J4"},
    "AI": {"detail": "4–20 mA, 150 Ω %0,1 şönt, 1 kΩ/100 nF RC, BAT54S kenetleme, SMAJ10CA TVS, 250 mA döngü sigortası", "terminal": "J5"},
    "DO": {"detail": "Low-side AO3400A MOSFET, 100 Ω kapı + 100 kΩ çekme, 1N4148W serbest döngü diyotu → ara röle bobinleri", "terminal": "J8"},
    "I2C": {"detail": "4,7 kΩ çekme dirençleri, sensör modülü kablosu", "terminal": "J3 (3V3, SDA, SCL, GND)"},
}

FAMILIES: Dict[str, Dict[str, Any]] = {
    "plc": {"id": "GK-P1", "name": "GK-P1 PLC I/O kartı", "role": "Kontrol: girişleri okur, ladder programını tarar, çıkış rölelerini sürer",
            "base_design": "GK-N1 / OTG-RN1", "mcu": "ESP32-S3-WROOM-1 (N8)", "supply": _POWER, "layers": 2,
            "max_channels": {"DI": 4, "AI": 2, "DO": 4}},
    "smart": {"id": "GK-S1", "name": "GK-S1 akıllı dönüşüm kartı", "role": "Durum izleme: sensör modüllerini okur, değerleri RS-485 ile PLC kartına ve SCADA'ya sunar",
              "base_design": "OTG-RN1", "mcu": "ESP32-S3-WROOM-1 (N8)", "supply": _POWER, "layers": 2,
              "max_channels": {"AI": 2}},
}

SHORT = {"FAC_CONVEYOR_01": "knv01", "FAC_ROBOT_01": "rob01", "FAC_VFD_MOTOR_01": "mot01", "PROC_TANK_01": "tnk01",
         "PROC_PUMP_01": "pmp01", "PROC_VALVE_01": "van01", "GRID_TRAFO_01": "trf01", "GRID_BREAKER_01": "kes01",
         "GRID_BUSBAR_11KV": "bar01", "BLD_HVAC_ZONE1": "hvc01", "BLD_SOLAR_PV_01": "ges01", "BLD_BMS_BATTERY_01": "bat01"}


def project_name(device_id: str, family: str) -> str:
    return f"gk_{'p1' if family == 'plc' else 's1'}_{SHORT[device_id]}"


def artifacts(project: str) -> Dict[str, str]:
    b = f"boards/{project}"
    return {"top": f"{b}/3d_top.jpg", "bottom": f"{b}/3d_bottom.jpg", "iso": f"{b}/3d_iso.jpg",
            "schematic_pdf": f"{b}/{project}_schematic.pdf", "bom_csv": f"{b}/{project}_bom.csv",
            "drc_summary": f"{b}/drc_summary.json"}


def ai(ch, tag, desc, part, point, lo, hi):
    return {"ch": ch, "kind": "AI", "tag": tag, "desc": desc, "part": part, "point": point, "range": [lo, hi]}


def di(ch, tag, desc, part, point, mode="bool", threshold=0.5, source_device=None):
    return {"ch": ch, "kind": "DI", "tag": tag, "desc": desc, "part": part, "point": point, "mode": mode,
            "threshold": threshold, "source_device": source_device}


def do(ch, tag, desc, part="24 V DC ara röle (bobin ~17 mA)"):
    return {"ch": ch, "kind": "DO", "tag": tag, "desc": desc, "part": part}


def bus(kind, addr, tag, desc, part, points):
    return {"bus": kind, "address": addr, "tag": tag, "desc": desc, "part": part, "points": points}


def NO(t): return {"NO": t}
def NC(t): return {"NC": t}
def AND(*a): return {"AND": list(a)}
def OR(*a): return {"OR": list(a)}
def CMP(a, op, b): return {"CMP": {"op": op, "a": a, "b": b}}
def rung(rid, comment, logic, *outs): return {"id": rid, "comment": comment, "logic": logic, "outputs": list(outs)}
def coil(t): return {"type": "coil", "tag": t}
def ton(t): return {"type": "ton", "tag": t}


NODES: Dict[str, Dict[str, Any]] = {
    "FAC_CONVEYOR_01": {
        "node_id": "GK-N1-10", "address": 10, "location": "Üretim hattı saha panosu =P10",
        "channels": [
            di("DI1", "HS-101", "Acil çekme ipi şalteri", "İpli acil stop şalteri, NC kontak", "pull_cord_tripped"),
            di("DI2", "FS-101", "Giriş fotoseli (parça geçişi)", "Karşılıklı fotosel, PNP", "part_count", "changed"),
            di("DI3", "SS-101", "Bant hareket bekçisi", "Endüktif sensör, kasnak devir bekçisi", "speed", "gt", 0.05),
            ai("AI1", "WT-101", "Bant yükü", "Yük hücresi + 4–20 mA transmitter (0–500 kg)", "load_kg", 0, 500),
            ai("AI2", "ST-101", "Bant hızı", "Enkoder → 4–20 mA dönüştürücü (0–3 m/s)", "speed", 0, 3),
            do("DO1", "XL-101", "Çalışıyor lambası (yeşil)"),
            do("DO2", "XA-101", "Acil stop korna/flaşör"),
            do("DO3", "XL-102", "50 parçalık parti tamam lambası"),
            do("DO4", "XA-102", "Aşırı yük uyarısı"),
        ],
        "tags": {"C_BATCH": {"kind": "CTU", "preset": 50}, "M_BATCH": {"kind": "M"}, "T_LAMP": {"kind": "TON", "preset_ms": 3000},
                 "T_OVL": {"kind": "TON", "preset_ms": 2000}},
        "rungs": [
            rung("R1", "İp çekildiyse korna", NO("DI1"), coil("DO2")),
            rung("R2", "Bant hareket ediyor ve ip sağlam → çalışıyor lambası", AND(NO("DI3"), NC("DI1")), coil("DO1")),
            rung("R3", "Fotosel kenarlarını say, parti bitince sıfırla", NO("DI2"), {"type": "ctu", "tag": "C_BATCH", "reset_tag": "M_BATCH"}),
            rung("R4", "Parti tamam: lambayı mühürle", NO("C_BATCH.Q"), {"type": "set", "tag": "M_BATCH"}),
            rung("R5", "Lamba 3 sn yanar", NO("M_BATCH"), ton("T_LAMP")),
            rung("R6", "Süre dolunca lamba sönsün", NO("T_LAMP.Q"), {"type": "reset", "tag": "M_BATCH"}),
            rung("R7", "Parti lambası çıkışı", NO("M_BATCH"), coil("DO3")),
            rung("R8", "Yük 400 kg üstünde 2 sn → aşırı yük", CMP("AI1", ">", 400.0), ton("T_OVL")),
            rung("R9", "Aşırı yük uyarısı", NO("T_OVL.Q"), coil("DO4")),
        ],
    },
    "FAC_ROBOT_01": {
        "node_id": "GK-N1-12", "address": 12, "location": "Robot hücresi emniyet panosu =P12",
        "channels": [
            di("DI1", "ZS-121", "Işık perdesi OSSD (sağlam = 24 V)", "Tip 4 emniyet ışık perdesi", "light_curtain_ok"),
            di("DI2", "PS-121", "Tutucu vakum anahtarı (parça var)", "Vakum anahtarı, PNP", "payload_kg", "gt", 0.5),
            ai("AI1", "WT-121", "Tutucu yükü", "Bilek kuvvet sensörü → 4–20 mA (0–10 kg)", "payload_kg", 0, 10),
            do("DO1", "XS-121", "Güvenli durdurma talebi (robot kontrolörüne)", "Emniyet rölesi girişi"),
            do("DO2", "XL-121", "Hücre durumu yeşil (otomatik + parça)"),
            do("DO3", "XA-121", "Eksen 1 limit uyarısı"),
        ],
        "bus": [bus("RS485", 1, "RC-121", "Robot kontrolörü eksen geri beslemesi", "Robot kontrolörü Modbus RTU ağ geçidi",
                    [["joint1_deg", "RB_J1"], ["joint2_deg", "RB_J2"], ["joint3_deg", "RB_J3"]])],
        "tags": {"T_PICK": {"kind": "TON", "preset_ms": 500}},
        "rungs": [
            rung("R1", "Perde kesildi → güvenli durdurma", NC("DI1"), coil("DO1")),
            rung("R2", "Parça 0,5 sn kararlı tutuldu", NO("DI2"), ton("T_PICK")),
            rung("R3", "Perde sağlam ve parça tutuldu → yeşil", AND(NO("DI1"), NO("T_PICK.Q")), coil("DO2")),
            rung("R4", "Eksen 1 ±170° dışına çıktı", OR(CMP("RB_J1", ">", 170.0), CMP("RB_J1", "<", -170.0)), coil("DO3")),
        ],
    },
    "FAC_VFD_MOTOR_01": {
        "node_id": "GK-N1-11", "address": 11, "location": "Motor kontrol merkezi MCC-1, hücre 3",
        "channels": [
            di("DI1", "YS-111", "VFD çalışıyor rölesi", "VFD röle çıkışı (RUN)", "rpm", "gt", 50.0),
            di("DI2", "TS-111", "PTC termistör rölesi trip", "Sargı PTC + termistör rölesi (90 °C)", "temperature_c", "gt", 90.0),
            di("DI3", "HS-111", "Acil stop zinciri (KNV-01 ipli şalteri ile seri)", "Emniyet zinciri geri beslemesi", "pull_cord_tripped",
               source_device="FAC_CONVEYOR_01"),
            ai("AI1", "TT-111", "Sargı sıcaklığı", "PT100 + kafa transmitteri (0–150 °C → 4–20 mA)", "temperature_c", 0, 150),
            ai("AI2", "IT-111", "Motor akımı", "Hall etkili akım transdüseri (0–50 A → 4–20 mA)", "current_a", 0, 50),
            do("DO1", "XS-111", "STO rölesi (enerjili = tork izni)", "Güvenli tork kapatma (STO) rölesi"),
            do("DO2", "XY-111", "Soğutma fanı kontaktörü"),
            do("DO3", "XA-111", "Arıza flaşörü"),
        ],
        "bus": [bus("RS485", 1, "SC-111", "Frekans konvertörü", "VFD, Modbus RTU 19200 8E1",
                    [["rpm", "MB_RPM"], ["frequency_hz", "MB_HZ"], ["power_kw", "MB_KW"], ["torque_nm", "MB_NM"]])],
        "smart": {"address": 111, "location": "Motor gövdesi yanı, IP65 kutu", "channels": [],
                  "bus": [bus("I2C", "0x1D", "VT-111", "Rulman titreşimi (RMS ve 185 Hz FFT bandı)", "ADXL355 ivmeölçer modülü, motor gövdesine",
                              [["vibration_rms", "VIB"], ["vibration_fft_185hz_amp", "VIB_FFT"]])]},
        "tags": {"M_PERM": {"kind": "M"}, "T_ALM": {"kind": "TON", "preset_ms": 5000}},
        "rungs": [
            rung("R1", "Tork izni: PTC trip yok ve acil stop zinciri sağlam", AND(NC("DI2"), NC("DI3")), coil("M_PERM")),
            rung("R2", "STO rölesi izinle enerjilenir", NO("M_PERM"), coil("DO1")),
            rung("R3", "Sargı 60 °C üstünde → soğutma fanı", CMP("AI1", ">", 60.0), coil("DO2")),
            rung("R4", "Titreşim > 4,5 mm/s veya sargı > 80 °C, 5 sn sürerse", OR(CMP("VIB", ">", 4.5), CMP("AI1", ">", 80.0)), ton("T_ALM")),
            rung("R5", "Gecikmeli alarm veya PTC trip → flaşör", OR(NO("T_ALM.Q"), NO("DI2")), coil("DO3")),
        ],
    },
    "PROC_TANK_01": {
        "node_id": "GK-N1-21", "address": 21, "location": "Proses sahası saha kutusu JB-21",
        "channels": [
            di("DI1", "LSH-201", "Yüksek seviye şamandırası", "Şamandıralı seviye şalteri (%90)", "level_pct", "gt", 90.0),
            di("DI2", "LSL-201", "Düşük seviye şamandırası", "Şamandıralı seviye şalteri (%10)", "level_pct", "lt", 10.0),
            ai("AI1", "LT-201", "Tank seviyesi", "Radar seviye vericisi (0–100 % → 4–20 mA)", "level_pct", 0, 100),
            ai("AI2", "TT-201", "Ürün sıcaklığı", "PT100 + transmitter (0–100 °C)", "temp_c", 0, 100),
            do("DO1", "XA-201", "Seviye alarmı kornası"),
            do("DO2", "XY-201", "pH dozaj pompası izni"),
            do("DO3", "XA-202", "Yüksek seviye ön uyarısı"),
            do("DO4", "XY-202", "Ceket ısıtıcı izni (ürün < 25 °C)"),
        ],
        "bus": [bus("RS485", 2, "AT-201", "pH analizörü", "pH analizörü, Modbus RTU", [["ph_value", "PH"]])],
        "tags": {"T_PH": {"kind": "TON", "preset_ms": 10000}},
        "rungs": [
            rung("R1", "Yüksek veya düşük şamandıra → korna", OR(NO("DI1"), NO("DI2")), coil("DO1")),
            rung("R2", "pH 6,5–7,5 bandı dışında 10 sn", OR(CMP("PH", "<", 6.5), CMP("PH", ">", 7.5)), ton("T_PH")),
            rung("R3", "Dozaj pompası izni", NO("T_PH.Q"), coil("DO2")),
            rung("R4", "Seviye %85 üstü ön uyarı", CMP("AI1", ">", 85.0), coil("DO3")),
            rung("R5", "Ürün 25 °C altında → ısıtıcı izni", CMP("AI2", "<", 25.0), coil("DO4")),
        ],
    },
    "PROC_PUMP_01": {
        "node_id": "GK-N1-22", "address": 22, "location": "Pompa istasyonu saha kutusu JB-22",
        "channels": [
            di("DI1", "YS-221", "Pompa çalışıyor geri beslemesi", "Yumuşak yolverici RUN rölesi", "rpm", "gt", 50.0),
            di("DI2", "XS-221", "Kavitasyon / kuru çalışma", "Emme basınç şalteri", "cavitation_risk", "gt", 0.5),
            ai("AI1", "PT-221", "Çıkış basıncı", "Basınç transmitteri (0–10 bar → 4–20 mA)", "discharge_press_bar", 0, 10),
            ai("AI2", "FT-221", "Debi", "Elektromanyetik debimetre (0–100 m³/h → 4–20 mA)", "flow_m3h", 0, 100),
            do("DO1", "XL-221", "Çalışıyor lambası"),
            do("DO2", "XA-221", "Kavitasyon alarmı"),
            do("DO3", "XV-221", "Minimum debi baypas vanası aç"),
            do("DO4", "XA-222", "Yüksek titreşim uyarısı (akıllı karttan)"),
        ],
        "bus": [bus("RS485", 3, "SC-221", "Yumuşak yolverici", "Yumuşak yolverici, Modbus RTU",
                    [["current_a", "MB_A"], ["power_kw", "MB_KW"], ["temperature_c", "MB_TEMP"]])],
        "smart": {"address": 122, "location": "Pompa yatağı yanı, IP65 kutu", "channels": [],
                  "bus": [bus("I2C", "0x1D", "VT-221", "Pompa yatağı titreşimi", "ADXL355 ivmeölçer modülü", [["vibration_rms", "VIB"]])]},
        "tags": {"T_CAV": {"kind": "TON", "preset_ms": 3000}, "T_MINF": {"kind": "TON", "preset_ms": 5000}},
        "rungs": [
            rung("R1", "Çalışma lambası", NO("DI1"), coil("DO1")),
            rung("R2", "Kavitasyon 3 sn sürerse", NO("DI2"), ton("T_CAV")),
            rung("R3", "Kavitasyon alarmı", NO("T_CAV.Q"), coil("DO2")),
            rung("R4", "Çalışırken debi < 10 m³/h, 5 sn", AND(NO("DI1"), CMP("AI2", "<", 10.0)), ton("T_MINF")),
            rung("R5", "Minimum debi baypası", NO("T_MINF.Q"), coil("DO3")),
            rung("R6", "Titreşim > 4,5 mm/s (GK-S1-22)", CMP("VIB", ">", 4.5), coil("DO4")),
        ],
    },
    "PROC_VALVE_01": {
        "node_id": "GK-N1-23", "address": 23, "location": "Proses sahası saha kutusu JB-21 (2. kart)",
        "channels": [
            di("DI1", "ZSO-231", "Tam açık limit şalteri", "Endüktif limit şalteri (≥ %95)", "position_pct", "gt", 95.0),
            di("DI2", "ZSC-231", "Tam kapalı limit şalteri", "Endüktif limit şalteri (≤ %5)", "position_pct", "lt", 5.0),
            ai("AI1", "ZT-231", "Vana konumu", "Pozisyoner konum geri beslemesi (0–100 % → 4–20 mA)", "position_pct", 0, 100),
            do("DO1", "XY-231", "Solenoid (enerjili = açılabilir, enerjisiz = emniyetli kapanır)"),
            do("DO2", "XL-231", "Açık lambası"),
            do("DO3", "XL-232", "Kapalı lambası"),
            do("DO4", "XA-231", "Limit şalteri uyuşmazlığı"),
        ],
        "tags": {"M_DISC": {"kind": "M"}},
        "rungs": [
            rung("R1", "İki limit aynı anda → uyuşmazlık", AND(NO("DI1"), NO("DI2")), coil("M_DISC")),
            rung("R2", "Uyuşmazlık yoksa solenoid enerjili", NC("M_DISC"), coil("DO1")),
            rung("R3", "Açık lambası", NO("DI1"), coil("DO2")),
            rung("R4", "Kapalı lambası", NO("DI2"), coil("DO3")),
            rung("R5", "Uyuşmazlık alarmı", NO("M_DISC"), coil("DO4")),
        ],
    },
    "GRID_TRAFO_01": {
        "node_id": "GK-N1-31", "address": 31, "location": "Trafo hücresi koruma panosu =H31",
        "channels": [
            di("DI1", "TSH-311", "Yağ termometresi (OTI) alarm kontağı", "Kadranlı yağ termometresi, 90 °C kontak", "oil_temp_c", "gt", 90.0),
            di("DI2", "TSHH-311", "Sargı termometresi (WTI) trip kontağı", "Sargı sıcaklık göstergesi, 110 °C kontak", "winding_hotspot_c", "gt", 110.0),
            ai("AI1", "TT-311", "Üst yağ sıcaklığı", "PT100 + transmitter (0–150 °C)", "oil_temp_c", 0, 150),
            ai("AI2", "TT-312", "Sargı sıcak nokta", "WTI analog çıkışı (0–200 °C → 4–20 mA)", "winding_hotspot_c", 0, 200),
            do("DO1", "XY-311", "Soğutma fanları 1. kademe"),
            do("DO2", "XY-312", "Soğutma fanları 2. kademe"),
            do("DO3", "XA-311", "Trafo sıcaklık alarmı"),
            do("DO4", "XA-312", "Aşırı yük uyarısı"),
        ],
        "bus": [bus("RS485", 4, "JT-311", "Sekonder enerji analizörü", "3 fazlı enerji analizörü, Modbus RTU",
                    [["load_kva", "MB_KVA"], ["v_secondary_v", "MB_V"], ["power_factor", "MB_PF"]])],
        "tags": {"T_OVL": {"kind": "TON", "preset_ms": 10000}},
        "rungs": [
            rung("R1", "Yağ > 65 °C → fan 1. kademe", CMP("AI1", ">", 65.0), coil("DO1")),
            rung("R2", "Sargı > 90 °C → fan 2. kademe", CMP("AI2", ">", 90.0), coil("DO2")),
            rung("R3", "OTI veya WTI kontağı → alarm", OR(NO("DI1"), NO("DI2")), coil("DO3")),
            rung("R4", "Yük > 2000 kVA, 10 sn", CMP("MB_KVA", ">", 2000.0), ton("T_OVL")),
            rung("R5", "Aşırı yük uyarısı", NO("T_OVL.Q"), coil("DO4")),
        ],
    },
    "GRID_BREAKER_01": {
        "node_id": "GK-N1-32", "address": 32, "location": "11 kV kesici hücresi =H32 alçak gerilim bölmesi",
        "channels": [
            di("DI1", "ZSC-321", "Kesici kapalı (52a yardımcı kontak)", "Kesici yardımcı kontağı", "state", "gt", 0.5),
            di("DI2", "XS-321", "Koruma trip / 86 kilitleme", "Kilitleme rölesi kontağı", "tripped_ansi_code", "gt", 0.5),
            ai("AI1", "IT-321", "Faz L1 akımı", "Akım trafosu 200/1 A + transdüser (0–200 A → 4–20 mA)", "current_l1_a", 0, 200),
            do("DO1", "XL-321", "Kapalı lambası (kırmızı)"),
            do("DO2", "XL-322", "Açık lambası (yeşil)"),
            do("DO3", "XA-321", "Trip alarmı"),
            do("DO4", "XA-322", "Aşırı akım ön uyarısı (150 A, 2 sn)"),
        ],
        "tags": {"T_OC": {"kind": "TON", "preset_ms": 2000}},
        "rungs": [
            rung("R1", "Kapalı lambası", NO("DI1"), coil("DO1")),
            rung("R2", "Açık lambası", NC("DI1"), coil("DO2")),
            rung("R3", "Trip alarmı", NO("DI2"), coil("DO3")),
            rung("R4", "Akım > 150 A, 2 sn (uyarı; koruma rölesi değildir)", CMP("AI1", ">", 150.0), ton("T_OC")),
            rung("R5", "Aşırı akım ön uyarısı", NO("T_OC.Q"), coil("DO4")),
        ],
    },
    "GRID_BUSBAR_11KV": {
        "node_id": "GK-N1-33", "address": 33, "location": "11 kV bara ölçü hücresi =H30",
        "channels": [
            di("DI1", "EY-331", "Düşük gerilim rölesi (27) kontağı", "Gerilim rölesi, 0,9 Un", "voltage_kv", "lt", 9.9),
            di("DI2", "EY-332", "Aşırı gerilim rölesi (59) kontağı", "Gerilim rölesi, 1,1 Un", "voltage_kv", "gt", 12.1),
            ai("AI1", "ET-331", "Bara gerilimi", "Gerilim trafosu 11 kV/110 V + transdüser (0–13,2 kV)", "voltage_kv", 0, 13.2),
            do("DO1", "XA-331", "Bara gerilim alarmı"),
            do("DO2", "XS-331", "Yük atma izni (düşük gerilim 2 sn)"),
        ],
        "bus": [bus("RS485", 5, "JT-331", "Bara enerji analizörü", "Enerji analizörü, Modbus RTU",
                    [["total_p_mw", "MB_P"], ["total_q_mvar", "MB_Q"]])],
        "tags": {"T_UV": {"kind": "TON", "preset_ms": 2000}},
        "rungs": [
            rung("R1", "27 veya 59 kontağı → alarm", OR(NO("DI1"), NO("DI2")), coil("DO1")),
            rung("R2", "Düşük gerilim 2 sn sürerse", NO("DI1"), ton("T_UV")),
            rung("R3", "Yük atma izni", NO("T_UV.Q"), coil("DO2")),
        ],
    },
    "BLD_HVAC_ZONE1": {
        "node_id": "GK-N1-41", "address": 41, "location": "Klima santrali kontrol panosu =AHU1",
        "channels": [
            di("DI1", "PDS-411", "Fan diferansiyel basınç şalteri (hava akışı var)", "Fark basınç şalteri", "fan_power_kw", "gt", 0.2),
            ai("AI1", "JT-411", "Fan gücü", "Güç transdüseri (0–10 kW → 4–20 mA)", "fan_power_kw", 0, 10),
            do("DO1", "XY-411", "Taze hava damperi aç"),
            do("DO2", "XY-412", "Nemlendirici izni"),
            do("DO3", "XA-411", "Hava akışı yok alarmı"),
        ],
        "smart": {"address": 141, "location": "Zon 1 duvarı, sensör kutusu",
                  "channels": [dict(ai("AI1", "AT-411", "CO₂ konsantrasyonu", "NDIR CO₂ sensörü (0–2000 ppm → 4–20 mA)", "co2_ppm", 0, 2000), plc_tag="CO2")],
                  "bus": [bus("I2C", "0x44", "TT-411", "Zon sıcaklık ve nem", "SHT31 sıcaklık/nem modülü",
                              [["current_temp_c", "ZONE_T"], ["humidity_pct", "ZONE_RH"]])]},
        "tags": {"T_FLOW": {"kind": "TON", "preset_ms": 10000}},
        "rungs": [
            rung("R1", "CO₂ > 800 ppm → taze hava (akıllı karttan)", CMP("CO2", ">", 800.0), coil("DO1")),
            rung("R2", "Nem < %30 → nemlendirici", CMP("ZONE_RH", "<", 30.0), coil("DO2")),
            rung("R3", "Hava akışı 10 sn yok", NC("DI1"), ton("T_FLOW")),
            rung("R4", "Hava akışı alarmı", NO("T_FLOW.Q"), coil("DO3")),
        ],
    },
    "BLD_SOLAR_PV_01": {
        "node_id": "GK-N1-42", "address": 42, "location": "Çatı GES dağıtım kutusu =PV1",
        "channels": [
            di("DI1", "YS-421", "Evirici üretimde", "Evirici durum rölesi", "output_kw", "gt", 0.5),
            ai("AI1", "RT-421", "Güneş ışınımı", "Piranometre (0–1500 W/m² → 4–20 mA)", "irradiance_wm2", 0, 1500),
            do("DO1", "XL-421", "Üretim lambası"),
            do("DO2", "XA-421", "Düşük verim uyarısı"),
        ],
        "bus": [bus("RS485", 6, "JT-421", "Evirici", "Şebeke bağlantılı evirici, Modbus RTU (SunSpec)",
                    [["output_kw", "INV_KW"], ["daily_yield_kwh", "INV_KWH"]])],
        "tags": {"T_LOW": {"kind": "TON", "preset_ms": 30000}},
        "rungs": [
            rung("R1", "Üretim lambası", NO("DI1"), coil("DO1")),
            rung("R2", "Işınım > 400 W/m² ama çıkış < 10 kW, 30 sn", AND(CMP("AI1", ">", 400.0), CMP("INV_KW", "<", 10.0)), ton("T_LOW")),
            rung("R3", "Düşük verim uyarısı", NO("T_LOW.Q"), coil("DO2")),
        ],
    },
    "BLD_BMS_BATTERY_01": {
        "node_id": "GK-N1-43", "address": 43, "location": "Batarya odası kontrol panosu =ESS1",
        "channels": [
            di("DI1", "YS-431", "BMS hücre dengeleme aktif", "BMS durum rölesi", "balancing_active"),
            ai("AI1", "JT-431", "DC bara gücü", "Hall etkili DC güç transdüseri (±60 kW → 4–20 mA)", "power_kw", -60, 60),
            do("DO1", "XS-431", "Şarj kontaktörü izni"),
            do("DO2", "XS-432", "Deşarj kontaktörü izni"),
            do("DO3", "XL-431", "Dengeleme lambası"),
        ],
        "bus": [bus("RS485", 7, "BMS-431", "Batarya yönetim sistemi", "BMS ana modülü, Modbus RTU",
                    [["soc_pct", "SOC"], ["cell_max_v", "VCELL_MAX"], ["cell_min_v", "VCELL_MIN"]])],
        "tags": {},
        "rungs": [
            rung("R1", "Şarj izni: en yüksek hücre < 3,60 V ve SOC < %95", AND(CMP("VCELL_MAX", "<", 3.60), CMP("SOC", "<", 95.0)), coil("DO1")),
            rung("R2", "Deşarj izni: en düşük hücre > 2,90 V ve SOC > %10", AND(CMP("VCELL_MIN", ">", 2.90), CMP("SOC", ">", 10.0)), coil("DO2")),
            rung("R3", "Dengeleme lambası", NO("DI1"), coil("DO3")),
        ],
    },
}


for _dev, _n in NODES.items():      # card ids follow the asset's Modbus address
    _n["node_id"] = f"GK-P1-{_n['address']}"
    if "smart" in _n:
        _n["smart"]["card_id"] = f"GK-S1-{_n['address']}"


def cards(device_id: str) -> List[Dict[str, Any]]:
    """Static description of the cards of one asset: family, ids, KiCad project, artifacts and channel blocks."""
    n = NODES[device_id]
    out = []
    groups = {"DI": 0, "AI": 0, "DO": 0}
    for c in n["channels"]:
        groups[c["kind"]] += 1
    plc_io = [{"group": g, "count": groups[g], **_IO_DETAIL[g]} for g in ("DI", "AI", "DO") if groups[g]] + [dict(_RS485, count=1)]
    proj = project_name(device_id, "plc")
    out.append({"family": "plc", **{k: FAMILIES["plc"][k] for k in ("id", "name", "role", "base_design", "mcu", "supply", "layers")},
                "card_id": n["node_id"], "address": n["address"], "location": n["location"], "kicad_project": proj,
                "artifacts": artifacts(proj), "io": plc_io,
                "populated": [c["ch"] for c in n["channels"]]})
    sm = n.get("smart")
    if sm:
        proj = project_name(device_id, "smart")
        n_ai = len(sm["channels"])
        io = ([{"group": "AI", "count": n_ai, **_IO_DETAIL["AI"]}] if n_ai else []) + [{"group": "I2C", "count": 1, **_IO_DETAIL["I2C"]}] + [dict(_RS485, count=1)]
        out.append({"family": "smart", **{k: FAMILIES["smart"][k] for k in ("id", "name", "role", "base_design", "mcu", "supply", "layers")},
                    "card_id": sm["card_id"], "address": sm["address"], "location": sm["location"], "kicad_project": proj,
                    "artifacts": artifacts(proj), "io": io, "populated": [c["ch"] for c in sm["channels"]]})
    return out


def build_program(device_id: str) -> Dict[str, Any]:
    """Ladder program of the asset's PLC card: I/O tags from its wiring, values served by its smart card, own rungs."""
    n = NODES[device_id]
    tags: Dict[str, Any] = {}
    for ch in n["channels"]:
        src_dev = ch.get("source_device") or device_id
        if ch["kind"] == "DI":
            tags[ch["ch"]] = {"kind": "DI", "source": f"{src_dev}:{ch['point']}", "mode": ch["mode"],
                              "threshold": ch["threshold"], "comment": f"{ch['tag']} {ch['desc']}"}
        elif ch["kind"] == "AI":
            tags[ch["ch"]] = {"kind": "AI", "source": f"{device_id}:{ch['point']}", "comment": f"{ch['tag']} {ch['desc']}"}
        else:
            tags[ch["ch"]] = {"kind": "DO", "comment": f"{ch['tag']} {ch['desc']}"}
    buses = list(n.get("bus", []))
    sm = n.get("smart")
    if sm:
        for ch in sm["channels"]:
            tags[ch["plc_tag"]] = {"kind": "AI", "source": f"{device_id}:{ch['point']}",
                                   "comment": f"{sm['card_id']} {ch['ch']} {ch['tag']} (RS-485)"}
        buses += sm["bus"]
    for b in buses:
        for pt, tag in b["points"]:
            tags[tag] = {"kind": "AI", "source": f"{device_id}:{pt}", "comment": f"{b['bus']} {b['address']} {b['tag']}"}
    tags.update(copy.deepcopy(n.get("tags", {})))
    return {"name": f"{n['node_id']} {device_id}", "description": n["location"], "tags": tags,
            "rungs": copy.deepcopy(n["rungs"])}


def ai_signal(value: float, lo: float, hi: float) -> Dict[str, Any]:
    """Engineering value -> 4-20 mA loop current (NAMUR NE 43 saturation 3.8 / 20.5 mA) -> shunt volts -> ADC counts."""
    frac = (float(value) - lo) / (hi - lo) if hi != lo else 0.0
    ma = 4.0 + 16.0 * frac
    status = "OK"
    if ma > 20.5 or frac > 1.0 + 1e-9:
        ma, status = min(ma, 20.5), "OVER_RANGE"
    if ma < 3.8 or frac < -1e-9:
        ma, status = max(ma, 3.8), "UNDER_RANGE"
    v = ma / 1000.0 * SHUNT_OHM
    return {"mA": round(ma, 4), "shunt_v": round(v, 4), "adc_counts": int(round(min(v, ADC_FULL_V) / ADC_FULL_V * ADC_MAX)),
            "status": status}


class FieldNodes:
    """Holds one PLCRuntime per asset (its PLC card) and scans all of them every simulation tick."""

    def __init__(self):
        self._lock = threading.Lock()
        self._plc: Dict[str, PLCRuntime] = {}
        for dev in NODES:
            p = PLCRuntime()
            p.load_program(build_program(dev))
            p.running = True
            self._plc[dev] = p

    def plc(self, device_id: str) -> Optional[PLCRuntime]:
        return self._plc.get(device_id)

    def reset(self):
        with self._lock:
            for dev, p in self._plc.items():
                p.load_program(build_program(dev))
                p.running = True

    def scan(self, state_engine, dt_ms: float):
        with self._lock:
            for p in self._plc.values():
                p.scan(state_engine, dt_ms)

    def summary(self) -> List[Dict[str, Any]]:
        out = []
        for dev, n in NODES.items():
            p = self._plc[dev]
            vals = p.values
            outs = [c for c in n["channels"] if c["kind"] == "DO"]
            out.append({"device_id": dev, "node_id": n["node_id"], "address": n["address"], "location": n["location"],
                        "cards": [{"family": c["family"], "id": c["id"], "card_id": c["card_id"], "address": c["address"],
                                   "kicad_project": c["kicad_project"], "top": c["artifacts"]["top"]} for c in cards(dev)],
                        "running": p.running, "scan_count": p.scan_count,
                        "inputs_on": sum(1 for c in n["channels"] if c["kind"] == "DI" and vals.get(c["ch"])),
                        "outputs_on": sum(1 for c in outs if vals.get(c["ch"])),
                        "outputs": [{"ch": c["ch"], "tag": c["tag"], "on": bool(vals.get(c["ch"]))} for c in outs],
                        "inputs": [{"ch": c["ch"], "tag": c["tag"], "on": bool(vals.get(c["ch"]))} for c in n["channels"] if c["kind"] == "DI"],
                        "analog": [{"ch": c["ch"], "tag": c["tag"], "mA": ai_signal(vals.get(c["ch"], 0.0), *c["range"])["mA"]}
                                   for c in n["channels"] if c["kind"] == "AI"],
                        "fieldbus": [{"bus": b["bus"], "address": b["address"], "tag": b["tag"], "desc": b["desc"]} for b in n.get("bus", [])],
                        "smart_bus": [{"bus": b["bus"], "address": b["address"], "tag": b["tag"], "desc": b["desc"]}
                                      for b in n.get("smart", {}).get("bus", [])],
                        "channels_used": len(n["channels"]), "bus_devices": len(n.get("bus", []))})
        return out

    @staticmethod
    def _channel_rows(device_id: str, channels, vals, state_engine):
        rows = []
        for c in channels:
            row = {k: c.get(k) for k in ("ch", "kind", "tag", "desc", "part", "point")}
            if c["kind"] == "AI":
                v = state_engine.read_point_value(device_id, c["point"], 0.0)
                row.update(value=v, range=c["range"], signal=ai_signal(v, *c["range"]), plc_tag=c.get("plc_tag", c["ch"]))
            elif c["kind"] == "DI":
                on = bool(vals.get(c["ch"]))
                src_dev = c.get("source_device") or device_id
                row.update(value=on, source=f"{src_dev}:{c['point']}", mode=c["mode"], threshold=c["threshold"],
                           signal={"volts": DI_SUPPLY_V if on else 0.0,
                                   "led_mA": round((DI_SUPPLY_V - 1.2) / DI_SERIES_OHM * 1000.0, 2) if on else 0.0})
            else:
                on = bool(vals.get(c["ch"]))
                row.update(value=on, signal={"mosfet": "ON" if on else "OFF", "coil_v": DI_SUPPLY_V if on else 0.0})
            rows.append(row)
        return rows

    @staticmethod
    def _bus_rows(buses, vals):
        return [{**{k: b[k] for k in ("bus", "address", "tag", "desc", "part")},
                 "points": [{"point": pt, "tag": tag, "value": vals.get(tag)} for pt, tag in b["points"]]} for b in buses]

    def detail(self, device_id: str, state_engine) -> Optional[Dict[str, Any]]:
        n = NODES.get(device_id)
        if not n:
            return None
        snap = self._plc[device_id].snapshot()
        vals = snap["values"]
        out_cards = []
        for c in cards(device_id):
            if c["family"] == "plc":
                c.update(channels=self._channel_rows(device_id, n["channels"], vals, state_engine),
                         bus=self._bus_rows(n.get("bus", []), vals))
            else:
                sm = n["smart"]
                c.update(channels=self._channel_rows(device_id, sm["channels"], vals, state_engine),
                         bus=self._bus_rows(sm["bus"], vals))
            out_cards.append(c)
        plc_card = out_cards[0]
        return {"device_id": device_id, "node_id": n["node_id"], "address": n["address"], "location": n["location"],
                "cards": out_cards, "channels": plc_card["channels"], "bus": plc_card["bus"], "plc": snap}
