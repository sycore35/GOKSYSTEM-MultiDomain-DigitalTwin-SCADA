import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'tr' | 'en';

export interface Translations {
  // Navigation / Shell
  appTitle: string;
  appSubtitle: string;
  overview: string;
  factory: string;
  process: string;
  grid: string;
  building: string;
  digitalTwin: string;
  alarms: string;
  historian: string;
  eventAudit: string;
  settings: string;
  
  // Connection / Sim Status
  connected: string;
  disconnected: string;
  gateway: string;
  simRunning: string;
  simPaused: string;
  speed: string;
  simTime: string;
  
  // Actions
  actions: string;
  start: string;
  pause: string;
  resume: string;
  reset: string;
  acknowledge: string;
  ackAll: string;
  injectFault: string;
  emergencyStop: string;
  resetTrip: string;
  setSpeed: string;
  returnOverview: string;
  openTrends: string;
  exportCsv: string;
  filter: string;
  search: string;
  close: string;
  apply: string;
  
  // Equipment & Telemetry
  equipment: string;
  equipmentDetails: string;
  telemetry: string;
  status: string;
  running: string;
  stopped: string;
  warning: string;
  fault: string;
  tripped: string;
  offline: string;
  normal: string;
  active: string;
  energized: string;
  highLoad: string;
  
  temperature: string;
  pressure: string;
  flowRate: string;
  tankLevel: string;
  power: string;
  voltage: string;
  current: string;
  frequency: string;
  vibration: string;
  rpm: string;
  load: string;
  partCount: string;
  
  // 3D Digital Twin specific
  twinTitle: string;
  twinSubtitle: string;
  cameraPresets: string;
  camOverview: string;
  camTop: string;
  camFront: string;
  camIso: string;
  camReset: string;
  zoneFilter: string;
  allZones: string;
  inspectMachine: string;
  clickToInspect: string;
  selectedAsset: string;
  zone1Production: string;
  zone2Process: string;
  zone3Power: string;
  zone4Facility: string;
  zone5Personnel: string;
  lightingMode: string;
  gridOverlay: string;
  
  // Alarms & Audit
  activeAlarms: string;
  unackAlarms: string;
  severity: string;
  critical: string;
  high: string;
  medium: string;
  low: string;
  info: string;
  timestamp: string;
  message: string;
  device: string;
  tag: string;
  limit: string;
  value: string;
  noActiveAlarms: string;
  allSystemsNormal: string;
  
  // KPIs
  oee: string;
  totalProduction: string;
  gridPower: string;
  powerFactor: string;
  reactorVolume: string;
  chillerLoad: string;
  bessSoc: string;
  solarGeneration: string;
  
  // Language
  language: string;
}

const translations: Record<Language, Translations> = {
  tr: {
    appTitle: 'GÖKSYSTEM 3.0',
    appSubtitle: 'Endüstriyel Çok Alanlı Dijital İkiz ve SCADA Platformu',
    overview: 'Genel Bakış',
    factory: 'Akıllı Fabrika',
    process: 'Proses Sistemleri',
    grid: 'Elektrik Şebekesi',
    building: 'Bina Yönetimi',
    digitalTwin: '3B Dijital İkiz',
    alarms: 'Alarmlar ve Olaylar',
    historian: 'Veri Geçmişi',
    eventAudit: 'Olay Denetimi',
    settings: 'Ayarlar',
    actions: 'Operasyonlar',
    
    connected: 'BAĞLI',
    disconnected: 'BAĞLANTI KESİLDİ',
    gateway: 'Ağ Geçidi',
    simRunning: 'SİMÜLASYON AKTİF',
    simPaused: 'DURAKLATILDI',
    speed: 'Hız',
    simTime: 'Sim Süresi',
    
    start: 'Başlat',
    pause: 'Duraklat',
    resume: 'Devam Et',
    reset: 'Sıfırla',
    acknowledge: 'Onayla',
    ackAll: 'Tümünü Onayla',
    injectFault: 'Arıza Enjekte Et',
    emergencyStop: 'ACİL DURDURMA',
    resetTrip: 'Arıza Kilidini Aç',
    setSpeed: 'Hız Belirle',
    returnOverview: 'Genel Bakışa Dön',
    openTrends: 'Trendleri Aç',
    exportCsv: 'CSV İndir',
    filter: 'Filtrele',
    search: 'Ara...',
    close: 'Kapat',
    apply: 'Uygula',
    
    equipment: 'Ekipmanlar',
    equipmentDetails: 'Ekipman Detayları',
    telemetry: 'Telemetri',
    status: 'Durum',
    running: 'Çalışıyor',
    stopped: 'Durdu',
    warning: 'Uyarı',
    fault: 'Arıza',
    tripped: 'Açtı (Trip)',
    offline: 'Çevrim Dışı',
    normal: 'Normal',
    active: 'Aktif',
    energized: 'Enerjili',
    highLoad: 'Yüksek Yük',
    
    temperature: 'Sıcaklık',
    pressure: 'Basınç',
    flowRate: 'Debi',
    tankLevel: 'Tank Seviyesi',
    power: 'Güç',
    voltage: 'Gerilim',
    current: 'Akım',
    frequency: 'Frekans',
    vibration: 'Titreşim',
    rpm: 'Devir',
    load: 'Yük',
    partCount: 'Parça Sayısı',
    
    twinTitle: 'Fabrika Üç Boyutlu Dijital İkizi',
    twinSubtitle: 'Three.js / WebGL Mekansal Fiziksel Tesis Modeli',
    cameraPresets: 'Kamera Görünümleri',
    camOverview: 'Genel Görünüm',
    camTop: 'Üstten',
    camFront: 'Önden',
    camIso: 'İzometrik',
    camReset: 'Kamerayı Sıfırla',
    zoneFilter: 'Bölge Filtresi',
    allZones: 'Tüm Tesis',
    inspectMachine: 'Ekipmanı İncele',
    clickToInspect: 'İNCELEMEK İÇİN MAKİNEYE TIKLAYIN',
    selectedAsset: 'SEÇİLİ EKİPMAN',
    zone1Production: 'Bölge 1: Üretim Hattı & Robotik',
    zone2Process: 'Bölge 2: Akışkan & Kimyasal Proses',
    zone3Power: 'Bölge 3: 11kV Enerji & Şalt',
    zone4Facility: 'Bölge 4: Tesis Altyapısı & HVAC',
    zone5Personnel: 'Bölge 5: İSG & Saha Personeli',
    lightingMode: 'Aydınlatma',
    gridOverlay: 'Teknik Izgara',
    
    activeAlarms: 'Aktif Alarmlar',
    unackAlarms: 'Onaylanmamış Alarmlar',
    severity: 'Önem Derecesi',
    critical: 'KRİTİK',
    high: 'YÜKSEK',
    medium: 'ORTA',
    low: 'DÜŞÜK',
    info: 'BİLGİ',
    timestamp: 'Zaman Damgası',
    message: 'Alarm Mesajı',
    device: 'Cihaz',
    tag: 'Etiket',
    limit: 'Limit / Eşik',
    value: 'Mevcut Değer',
    noActiveAlarms: 'Aktif alarm bulunmamaktadır.',
    allSystemsNormal: 'Tüm sistemler nominal parametrelerde çalışıyor.',
    
    oee: 'Tesis OEE Oranı',
    totalProduction: 'Toplam Üretim',
    gridPower: 'Şebeke Aktif Güç',
    powerFactor: 'Güç Faktörü (cos phi)',
    reactorVolume: 'Reaktör Sıvı Seviyesi',
    chillerLoad: 'Chiller Soğutma Yükü',
    bessSoc: 'BESS Batarya Doluluğu (SoC)',
    solarGeneration: 'Güneş Paneli Üretimi',
    
    language: 'Dil',
  },
  en: {
    appTitle: 'GÖKSYSTEM 3.0',
    appSubtitle: 'Industrial Multi-Domain Digital Twin & SCADA Platform',
    overview: 'Overview',
    factory: 'Smart Factory',
    process: 'Process Systems',
    grid: 'Electrical Grid',
    building: 'Building Management',
    digitalTwin: '3D Digital Twin',
    alarms: 'Alarms & Events',
    historian: 'Historian',
    eventAudit: 'Event Audit',
    settings: 'Settings',
    actions: 'Actions',
    
    connected: 'CONNECTED',
    disconnected: 'DISCONNECTED',
    gateway: 'Gateway',
    simRunning: 'SIMULATION ACTIVE',
    simPaused: 'PAUSED',
    speed: 'Speed',
    simTime: 'Sim Time',
    
    start: 'Start',
    pause: 'Pause',
    resume: 'Resume',
    reset: 'Reset',
    acknowledge: 'Acknowledge',
    ackAll: 'Acknowledge All',
    injectFault: 'Inject Fault',
    emergencyStop: 'EMERGENCY STOP',
    resetTrip: 'Reset Trip',
    setSpeed: 'Set Speed',
    returnOverview: 'Return to Overview',
    openTrends: 'Open Trends',
    exportCsv: 'Export CSV',
    filter: 'Filter',
    search: 'Search...',
    close: 'Close',
    apply: 'Apply',
    
    equipment: 'Equipment',
    equipmentDetails: 'Equipment Details',
    telemetry: 'Telemetry',
    status: 'Status',
    running: 'Running',
    stopped: 'Stopped',
    warning: 'Warning',
    fault: 'Fault',
    tripped: 'Tripped',
    offline: 'Offline',
    normal: 'Normal',
    active: 'Active',
    energized: 'Energized',
    highLoad: 'High Load',
    
    temperature: 'Temperature',
    pressure: 'Pressure',
    flowRate: 'Flow Rate',
    tankLevel: 'Tank Level',
    power: 'Power',
    voltage: 'Voltage',
    current: 'Current',
    frequency: 'Frequency',
    vibration: 'Vibration',
    rpm: 'RPM',
    load: 'Load',
    partCount: 'Part Count',
    
    twinTitle: 'Full Facility Three-Dimensional Digital Twin',
    twinSubtitle: 'Three.js / WebGL Spatial Physical Plant Model',
    cameraPresets: 'Camera Views',
    camOverview: 'Overview',
    camTop: 'Top View',
    camFront: 'Front View',
    camIso: 'Isometric',
    camReset: 'Reset Camera',
    zoneFilter: 'Zone Filter',
    allZones: 'Entire Plant',
    inspectMachine: 'Inspect Machine',
    clickToInspect: 'CLICK MACHINE TO INSPECT',
    selectedAsset: 'SELECTED ASSET',
    zone1Production: 'Zone 1: Production Line & Robotics',
    zone2Process: 'Zone 2: Fluid & Chemical Process',
    zone3Power: 'Zone 3: 11kV Power & Switchgear',
    zone4Facility: 'Zone 4: Plant Facility & HVAC',
    zone5Personnel: 'Zone 5: PPE Safety & Field Personnel',
    lightingMode: 'Lighting',
    gridOverlay: 'Technical Grid',
    
    activeAlarms: 'Active Alarms',
    unackAlarms: 'Unacknowledged Alarms',
    severity: 'Severity',
    critical: 'CRITICAL',
    high: 'HIGH',
    medium: 'MEDIUM',
    low: 'LOW',
    info: 'INFO',
    timestamp: 'Timestamp',
    message: 'Alarm Message',
    device: 'Device',
    tag: 'Tag',
    limit: 'Limit / Threshold',
    value: 'Current Value',
    noActiveAlarms: 'No active alarms present.',
    allSystemsNormal: 'All systems operating within nominal parameters.',
    
    oee: 'Facility OEE Rate',
    totalProduction: 'Total Production',
    gridPower: 'Grid Active Power',
    powerFactor: 'Power Factor (cos phi)',
    reactorVolume: 'Reactor Liquid Level',
    chillerLoad: 'Chiller Thermal Load',
    bessSoc: 'BESS Battery State of Charge',
    solarGeneration: 'Solar PV Generation',
    
    language: 'Language',
  }
};

export type TranslateHelper = ((key: keyof Translations) => string) & Translations;

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: TranslateHelper;
}

const createTranslateHelper = (currentLang: Language): TranslateHelper => {
  const dict = translations[currentLang];
  const fn = ((key: keyof Translations) => dict[key] || (key as string)) as TranslateHelper;
  return Object.assign(fn, dict);
};

const LanguageContext = createContext<LanguageContextType>({
  lang: 'tr',
  setLang: () => {},
  t: createTranslateHelper('tr')
});

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Arayüz yalnızca Türkçe (tasarım yönü: tek dil).
  const [lang] = useState<Language>('tr');
  const setLang = (_l: Language) => { /* tek dil */ };

  const tHelper = createTranslateHelper(lang);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: tHelper }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => useContext(LanguageContext);