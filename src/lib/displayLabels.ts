/** Translate display labels only; API enums and payloads stay unchanged. */
export function statusLabel(value: string): string {
  const labels: Record<string, string> = {
    online: "Çevrimiçi", offline: "Çevrimdışı", pending: "Bekleniyor", error: "Hata",
    active: "Aktif", inactive: "Pasif", disabled: "Kapalı", revoked: "İptal edildi",
    expired: "Süresi doldu", connected: "Bağlı", disconnected: "Bağlantı kesildi",
    ready: "Hazır", healthy: "Çalışıyor", running: "Çalışıyor", stopped: "Durduruldu",
  };
  return labels[value.toLowerCase()] ?? "Durum bilinmiyor";
}

export function streamProfileLabel(value: string): string {
  return value === "main" ? "Ana akış" : value === "sub" ? "Alt akış" : "Belirtilmedi";
}

export function cameraFieldLabel(value: string): string {
  const labels: Record<string, string> = {
    name: "Kamera adı", manufacturer: "Marka", model: "Kamera modeli", location_id: "İşletme",
    connection_mode: "Bağlantı kaynağı", recorder_model: "Kayıt cihazı modeli", source_type: "Protokol",
    source_host: "Sunucu adresi", source_port: "Bağlantı noktası", channel_number: "Kanal",
    stream_profile: "Yayın akışı", username: "Kullanıcı adı", password: "Parola", credentials: "Kamera giriş bilgileri",
  };
  return labels[value] ?? "Kamera yapılandırması";
}

