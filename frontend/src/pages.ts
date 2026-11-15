import { LayoutDashboard, Factory, Droplet, Zap, Building, Box, Bell, LineChart, ShieldCheck, Gauge, Package, Activity, SlidersHorizontal, Layers, Wrench, BatteryCharging, Cpu, Users, Radio } from 'lucide-react';

export interface PageDef { id: string; label: string; title: string; desc: string; icon: any; group: 'ops' | 'platform' }

export const PAGES: PageDef[] = [
  { id: 'overview', label: 'Genel bakış', title: 'Genel Bakış', desc: 'Dört alanın (fabrika, proses, elektrik, bina) anlık durumu ve aktif alarmlar.', icon: LayoutDashboard, group: 'ops' },
  { id: 'factory', label: 'Akıllı Fabrika', title: 'Akıllı Fabrika', desc: 'Üretim hattı, konveyör, robot ve motor sürücüsü: komut, arıza ve ölçümler.', icon: Factory, group: 'ops' },
  { id: 'process', label: 'Proses', title: 'Proses Sistemleri', desc: 'Reaktör, pompa ve vana akış şeması; pH ve seviye denetimi.', icon: Droplet, group: 'ops' },
  { id: 'grid', label: 'Elektrik', title: 'Elektrik Şebekesi', desc: '11 kV tek hat şeması, trafo, kesici ve bara ölçümleri.', icon: Zap, group: 'ops' },
  { id: 'building', label: 'Bina', title: 'Bina Yönetimi', desc: 'Klima, güneş enerjisi ve batarya sistemi; konfor ve enerji dengesi.', icon: Building, group: 'ops' },
  { id: 'twin', label: '3B İkiz', title: '3B Dijital İkiz', desc: 'Ekipmana tıklayın: canlı değerler, alarm durumu, trend ve çalışma geçmişi sağda açılır.', icon: Box, group: 'ops' },
  { id: 'alarms', label: 'Alarmlar', title: 'Alarm Yönetimi', desc: 'Öncelik, onay, raflama ve geçiş geçmişi ile alarm yaşam döngüsü.', icon: Bell, group: 'ops' },
  { id: 'historian', label: 'Veri Geçmişi', title: 'Veri Geçmişi', desc: 'Seçili noktaların zaman serisi kaydı ve dışa aktarma.', icon: LineChart, group: 'ops' },
  { id: 'audit', label: 'Olay Denetimi', title: 'Olay Denetimi', desc: 'Operatör komutları ve sistem olaylarının zincirli denetim izi.', icon: ShieldCheck, group: 'ops' },
  { id: 'analyzer', label: 'Trend', title: 'Trend Analizörü', desc: 'Çoklu seri bindirme, istatistik, eğim ve korelasyon.', icon: Activity, group: 'platform' },
  { id: 'perf', label: 'Motor', title: 'Motor Performansı', desc: 'Simülasyon çekirdeğinin tick zamanlaması, jitter ve determinizm ölçümü.', icon: Gauge, group: 'platform' },
  { id: 'assets', label: 'Varlık', title: 'Varlık Yöneticisi', desc: 'Ekipman kayıtları: ekle, düzenle, ara ve canlı duruma bağla.', icon: Package, group: 'platform' },
  { id: 'pid', label: 'PID Studio', title: 'PID Studio', desc: 'Basamak yanıtı, kazanç karşılaştırma ve canlı pH döngüsü ayarı.', icon: SlidersHorizontal, group: 'platform' },
  { id: 'scenarios', label: 'Senaryolar', title: 'Senaryolar', desc: 'Normal, arıza, bakım, acil durdurma ve üretim senaryoları.', icon: Layers, group: 'platform' },
  { id: 'maintenance', label: 'Bakım', title: 'Bakım Tahmini', desc: 'Sağlık indeksi ve limite kalan süre tahmini (kalibre değil, tahmindir).', icon: Wrench, group: 'platform' },
  { id: 'energy', label: 'Enerji', title: 'Enerji Yönetimi', desc: 'Aktif/reaktif güç, kWh, tüketici payları ve maliyet tahmini.', icon: BatteryCharging, group: 'platform' },
  { id: 'plc', label: 'PLC', title: 'PLC Mantık Simülatörü', desc: 'Merdiven mantığı programı, giriş/çıkışlar ve zamanlayıcılar.', icon: Cpu, group: 'platform' },
  { id: 'protocol', label: 'Protokol', title: 'Protokol Simülatörü', desc: 'Yerel Modbus TCP sunucusu ve kayıt haritası.', icon: Radio, group: 'platform' },
  { id: 'operators', label: 'Operatörler', title: 'Operatör Yönetimi', desc: 'Roller, izinler ve SHA-256 zincirli denetim izi.', icon: Users, group: 'platform' },
];
export const PAGE_BY_ID: Record<string, PageDef> = Object.fromEntries(PAGES.map(p => [p.id, p]));
