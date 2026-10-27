# ikurt İzle — yayın altyapısı ve yerel test raporu

Tarih: 21 Ekim 2026. Hedef repo: C:\Users\tarii\ikurt-projects\ikurt-izle.

## Teslimin gerçek kapsamı

Asıl repo okunabildi; yazma işlemi oturum izinleri tarafından reddedildi. Kod güncel repodan alınan çalışma kopyasında geliştirildi. Uygulama paketi yalnız görev dosyalarını, hash kontrolü ve yedekleme ile gerçek repoya aktarır. Henüz gerçek repo değiştirilmedi. Production deploy, canlı KV/D1 işlemi, ürün ataması veya gerçek kamera bağlantısı yapılmadı.

Mevcut 100 fiziksel ürünün JSON/CSV/bulk dosyaları korunur. Paket bu dosyaları içermez ve generator çalıştırmaz. Otomatik testlerin geçici test verileri fiziksel ürün manifestlerinden bağımsızdır.

## A. İnceleme ve gerçekleştirilen geliştirmeler

### Önceki durum

- Kamera kullanıcı adı/şifresi Worker içinde AES-256-GCM ile şifreleniyordu. Admin API düz şifreyi geri döndürmüyordu.
- source_host/source_port/channel_number/stream_profile alanları ve stream_gateways tablosu mevcuttu.
- Kamera bağlantı testi yalnız form alanlarının doluluğunu doğruluyordu; RTSP bağlantısı yapmıyordu.
- Viewer session, link iptali, işletme/kamera durumu ve heartbeat SQL kontrolleri vardı.
- Viewer'da gerçek video elementi/oynatıcı ve playlist/segment yetkilendirmesi yoktu.
- Admin işletme modeli tek yapılandırılmış tenant üzerinde çalışıyor; bu davranış korundu. Veritabanı ve yeni medya kontrolleri çoklu tenant/kamera kapsamını doğrular; tam çoklu tenant admin/RBAC geçişi yapılmadı.

### Yeni akış

1. /p/:token ve /c/:code korunur; müşteriden üyelik, parola veya kod istenmez.
2. Geçerli viewer oturumu /api/public/media-ticket üzerinden HLS izni alır.
3. HS256 medya izni oturum, hash, tenant, işletme, kamera, gateway ve yayın yoluna bağlıdır. En fazla 90 saniyedir; oturumdan uzun yaşayamaz.
4. Frontend medya gateway /session adresine bu izinle arka planda başvurur.
5. Gateway, Worker'ın /api/internal/media/authorize adresinde oturumu doğrulatır ve dar Path kapsamlı HttpOnly çerez verir.
6. Her HLS playlist, init ve segment isteğinde imza/süre/kapsam kontrolü yapılır; ardından Worker/D1 üzerinde güncel link, tenant, işletme, kamera, gateway, saat ve oturum durumu yeniden sorgulanır. Yetki sonuçları cache edilmez.
7. İptal/pasif/sona ermiş erişim yeni medya isteğinde reddedilir. Önceden alınmış birkaç saniyelik görüntüyü uzaktan silmek mümkün değildir.

Medya ham baytları Worker üzerinden taşınmaz. NVR adresleri/şifreleri, viewer ve medya ticket yanıtına konulmaz. Medya URL'si ticket içermez. Oynatıcı 45 saniyede çerez yeniler; varsayılan sessiz ve playsInline başlatır. Safari'nin yerel HLS desteği, diğer uygun tarayıcılarda dinamik yüklenen hls.js/light 1.7.3 kullanılır. Autoplay engelinde tek bir oynat düğmesi çıkar.

### Medya köprüsü

- MediaMTX v1.21.2; FFmpeg 9.0.2 Windows taşınabilir sürümleri çalışma kopyasında kuruldu.
- MediaMTX arşivi GitHub resmî sürüm digest'iyle, FFmpeg arşivi FFmpeg.org'un yönlendirdiği Gyan Windows dağıtımının SHA-256 değeriyle doğrulandı. Sistem çapında kurulum veya firewall değişikliği yapılmadı.
- RTSP 127.0.0.1:8554, HLS 127.0.0.1:8888, gateway 127.0.0.1:9080. API, metrics, pprof, playback, RTMP, SRT ve WebRTC kapalı.
- MediaMTX HTTP auth callback'i anonim okumayı/yayınlamayı reddeder. Yerel servis ve sentetik publisher ayrı anahtarlarla doğrulanır.
- MediaMTX v1.21'in dahili 302 HLS yönlendirmeleri yalnız aynı origin ve aynı medya dosyası yolunda izlenir. Dahili HLS session UUID parametresi kamera oturumundan bağımsızdır; gateway'in kendi doğrulamasını atlatmaz.
- HLS verisi bellekte tutulur, kayıt eklenmez. NVR'ın mevcut kayıt ayarlarına dokunulmadı.
- Sentetik kaynak: renkli test görüntüsü, H.264 baseline, 640×360, 15 fps, hedef 400 kbit/s, ses yok.
- Gerçek kaynaklar için servis anahtarıyla kamera yapılandırması çekilir; NVR sırları yalnız korumalı runtime dosyasında bulunur. FFmpeg NVR parolasını komut satırında almaz; loopback MediaMTX kaynağına bağlanır, yalnız video kanalını kopyalar ve sesi çıkarır. H.264 doğrulanmadan bu filtre başlayamaz.
- Gerçek kaynak filtreleyicisi bağlantı kopmasında 2–30 saniyelik kontrollü aralıklarla tekrar dener. Gerçek donanım üzerinde bu davranış henüz doğrulanmadı.

### Yeni API'ler

| API | Yetki / işlev |
|---|---|
| POST /api/public/media-ticket | Mevcut viewer bearer tokenı; kısa medya izni |
| POST /api/internal/media/authorize | Gateway'e özel servis anahtarı + imzalı medya izni; her medya isteğinde güncel kontrol |
| GET /api/internal/media/sources | Yalnız atanmış gateway'in gizli servis anahtarı; kullanıcı arayüzünden çağrılmaz |
| GET/PUT /api/admin/stream-policies?location_id=... | Mevcut admin yetkisi; işletme saatleri, oturum üst sınırı, kapasite |
| POST /api/admin/gateways | Mevcut admin yetkisi; tenant'a bağlı, pending sunucu kaydı |
| POST /api/admin/stream-probe/:cameraId | Mevcut admin yetkisi; gerçekten HLS playlist alınabiliyor mu? |
| PATCH /api/admin/cameras/:id | Mevcut API'ye tenant kontrolüyle gateway_id bağlama |

Bağlantı testi gerçek cihaz yönetim testi değildir. HLS probe başarılıysa ilgili kaynağın playlist'i doğrulanmış olur; bunun doğru fiziksel kamera olduğunu yetkili operatör teyit etmelidir. Kamera/izleme pasif yapmak izleyicinin erişimini keser; NVR cihazını kapatmaz.

### İşletme kuralları ve veri modeli

0004_media_policies.sql yalnız hazırlandı. Uzak D1 üzerinde çalıştırılmadı.

- stream_gateways.tenant_id eklenir. Eski satırlar başka tenant'a otomatik atanmaz.
- stream_policies işletme ve tenant kapsamlıdır; 5–240 dakika, varsayılan 60; 1–500 oturum, varsayılan 25; IANA saat dilimi ve haftalık aralıklar.
- Politika kaydı yoksa medya etkinleştirildiğinde saatler kapalı varsayılır. 24 saat erişim panelde açıkça seçilebilir. Yerel sentetik fixture bunu özellikle seçer.
- Mevcut linklerin süresi değiştirilmez. Yeni linklerin varsayılanı 60 dakikadır. Geçerli medya oturum süresi link ile işletme politikasının daha kısasıdır.
- Kapasite kontrolü ve session INSERT tek SQL ifadesindedir; eş zamanlı say/ekle yarışı önlenir.
- Aynı işletme/IP için dakikada 30 yeni session sınırı; IP düz tutulmaz, sunucu sırrıyla hashlenir. Ortak Wi-Fi/NAT ve yoğunlukta bu eşik ayrıca değerlendirilmelidir.
- Gateway'de sınırlı ve temizlenen istek sayacı vardır. Bu tek başına dağıtık DDoS/bot koruması değildir. Production için ayrıca WAF, izleme ve yük testi gerekir.
- 500 değeri donanım kapasitesi iddiası değildir. Aktif izleyici sayısı mevcut heartbeat semantiğiyle geçerli oturumları sayar; video karesi ölçümü değildir.

Yeni medya özellikleri MEDIA_ENABLED=1 olmadan aktif olmaz. Böylece mevcut uygulama yeni migration/secret'ler tamamlanmadan yayın açmaz. Env örneği streaming/worker-media.env.example içindedir. MEDIA_SIGNING_KEY ve her gateway'in ayrı MEDIA_GATEWAY_KEYS girdisi gerçek, bağımsız rastgele sır olmalıdır. Kamera şifreleme anahtarı bu amaçla yeniden kullanılmaz.

## B. Teknik doğrulama ve tercih

### Gerçekleştirilen testler

- Windows NT 10.0.26200; Node v24.17.0.
- Docker ve Docker Compose bulunmadı. Bu nedenle doğrulanmamış bir Compose yığını yerine Windows native profil hazırlandı.
- MediaMTX v1.21.2 ve FFmpeg 9.0.2 başlatıldı.
- Yerel sentetik RTSP → MediaMTX → yetkili gateway HLS akışı çalıştı.
- FFmpeg yetkili HLS üzerinden 2 saniyede 30 kare çözdü. Çıktı null sink'e gönderildi; video kaydedilmedi.
- MediaMTX'e doğrudan anonim okuma ve gateway'de çerezsiz playlist/segment isteği reddedildi.
- Yerel test linki iptal edildiğinde eski medya izniyle playlist ve segment erişimi reddedildi.
- Sentetik publisher kapatılınca kontrollü 404 alındı; yeniden başlatılınca HLS tekrar çözüldü.
- Build ve lint başarılı; mevcut 20 regresyon testi korunarak toplam 29 test başarılı.
- Ek testler: sahte/süresi dolmuş medya izni, tenant/kamera/gateway eşleşmesi, link/kamera/işletme/tenant/oturum iptali, saatler, atomik kapasite ve rate limit, servis kaynak endpoint'i, CORS'un yetki yerine geçmemesi ve güvenli upstream yönlendirmesi.
- Runtime bağımlılıklarında npm audit --omit=dev sonucu 0 bulgu. Tam audit mevcut geliştirme araç zincirinde 5 high bildiriyor (Vite/Cloudflare plugin/Wrangler ve alt bağımlılıkları). Bunlar toplu otomatik güncellenmedi; production öncesi ayrı yükseltme ve regresyon kontrolü gerekir.

Tarayıcı otomasyon aracı bu oturumda sunulmadı. Viewer kodu build edildi, fakat video elementinde gerçek tarayıcı oynatımı doğrulanmadı. iPhone Safari, Android Chrome, gerçek mobil ekranlar ve çok izleyicili yük testi yapılmadı; yapılmış sayılmamalı. Test yalnız sentetik kaynak içindir, NVR'a erişildiği anlamına gelmez.

### HLS ve WebRTC karşılaştırması

| Ölçüt | Bu aşamada seçilen HLS/fMP4 | WebRTC |
|---|---|---|
| Mobil | Safari yerel HLS; Android uygun MSE/hls.js | Genellikle uygun; codec ve signaling ayrıca test edilir |
| Gecikme | Birkaç saniye beklenir; uçtan uca gecikme ölçülmedi | Daha düşük gecikme olanağı; burada kurulmadı/ölçülmedi |
| İptal | Her playlist/segmentte güncel yetki | Signaling kontrolü tek başına yetmez; bağlantıyı sunucuda sonlandırma gerekir |
| Ağ | HTTPS ve yetkilendirilmiş reverse proxy | ICE, erişilebilir UDP/TCP, gerekirse TURN gerekir |
| CGNAT | Dışarı doğru güvenli tünelle kurulabilir | STUN tek başına her ağı çözmez; TURN maliyeti olabilir |
| Çoklu izleyici | İzleyici başına bant genişliği ve auth sorgusu; kapasite testi gerekir | Sunucu çıkışı/SFU/TURN kapasitesi gerekir |

HLS, bilinmeyen işletme ağına rağmen test edilebilen, Safari desteği ve istek bazlı iptali açık bir ilk aşama sağlar. WebRTC'nin düşük gecikme avantajı reddedilmedi; ağ/ICE/TURN ve bağlantı iptal modeli doğrulanmadan etkinleştirilmedi. Cloudflare Tunnel'ın HTTP geçişini WebRTC UDP medya taşıması kabul etmek doğru değildir.

### Cloudflare ve barındırma

Yerel test uygulaması geliştirme amaçlı admin geçişi içerir ve yalnız loopback/bellek veritabanında çalışır. 5173 portunu internete veya LAN'a açmayın. Gerçek medya için yalnız yetkilendirilmiş gateway'in 9080 portu kontrollü TLS reverse proxy arkasına alınır. Yerel anahtarlar ve MediaMTX'in üretebileceği auto.key/auto.crt paketlenmez.

Cloudflare Access'in mevcut admin koruması korunmuştur. Edge application kapsamı ayrıca doğrulanmalı: bütün hosta uygulanan Access, müşteri veya gateway çağrısını giriş ekranına çevirebilir. Kamuya açık viewer/ticket ile servis anahtarlı internal medya API'si kendi doğrulamalarıyla çalışır; bu görev Access politikalarını değiştirmedi.

Standart CDN/Tunnel'ı sınırsız video dağıtım ürünü kabul etmeyin. Cloudflare'ın video politikası Stream ve Enterprise Stream Delivery seçeneklerini tarif eder. Bu kodda Cloudflare Worker yalnız kontrol/metadata trafiğini taşır; HLS için ayrı HTTPS medya origin'i ve DNS-only yayın adı öngörülür. Turuncu bulutla veya ücretsiz Tunnel ile production video taşıma kurulmadı.

İlk kontrollü seçenek: işletmede sürekli açık Windows/Linux cihazında MediaMTX+FFmpeg+gateway; dışarı doğru SSH reverse tunnel veya değerlendirilmiş VPN; VPS'te TLS reverse proxy ve aynı site altında medya adı (ör. media.ikurt.net). İşletme modeminde RTSP portu açılmaz.

Gateway mevcut native profilde loopback'e bağlıdır. SSH reverse tunnel örneği, ancak yetkili VPS/anahtar hazır olduğunda: ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -R 127.0.0.1:19080:127.0.0.1:9080 bridge@VPS. VPS'te 19080 kamuya açılmaz; HTTPS reverse proxy bu yerel adrese bağlanır. Bu bağlantı bu görevde kurulmadı.

Gateway ve uygulama HTTPS ile aynı site altında olmalıdır. Çerez SameSite=Strict, HttpOnly, Secure ve kamera yoluna bağlıdır. Farklı siteler/üçüncü taraf çerez kısıtları için bu profil doğrulanmadı. Workers.dev adresi yerine kalıcı izle.ikurt.net akışı kullanılmalıdır.

Reverse proxy gereklilikleri: TLS; proxy_cache off; yanıt cache'ini açmama; upstream redirect'i dışarıya taşımama; HLS/session için uygun timeout; /internal/ yolunu kamuya kapatma; URL/Authorization/Cookie içeren erişim loglarını kapatma/redakte etme. İzin verilen gateway origin'leri Worker'da açık listeye alınmalıdır. Maliyet/kapasite artınca işletmeden tek video upstream'i taşıyan VPS relay tasarımı ayrıca kurulmalıdır; mevcut doğrudan HLS proxy her izleyiciyi işletme upload'ına yansıtır.

### Maliyet hesabı

Donanım, elektrik, VPS, upload kotası ve yetki kontrolü için Workers/D1 maliyeti vardır. Sağlayıcı seçilmediği için doğrulanmış VPS teklifi yoktur; küçük bir pilot için aylık 10–30 USD sunucu bütçesi yalnız planlama tahminidir, fiyat taahhüdü değildir. Mini PC bedeli donanım seçilmeden hesaplanamaz.

400 kbit/s yaklaşık 180 MB/izleyici-saat; 800 kbit/s yaklaşık 360 MB/izleyici-saat eder (protokol ek yükü hariç). Örnek: 30 izleyici × 4 saat/gün × 30 gün = 3.600 izleyici-saat; yaklaşık 648–1.296 GB/ay. 30 eş zamanlı izleyicide 400 kbit/s akış doğrudan proxy edilirse işletmenin en az 12 Mbit/s net upload'ı, ayrıca güvenli pay gerekir. Gerçek hız ölçülmedi.

Sık playlist/segment doğrulaması Workers/D1 istek sayısını artırır; CPU/sorgu ve bant genişliği ölçümü yapılmadan sınırsız kapasite vaat edilmez. Alternatif ürün kıyası için resmî Cloudflare Stream sayfası 1.000 teslim dakika başına 1 USD ve 1.000 saklama dakika kapasitesi başına aylık 5 USD belirtir. 216.000 teslim dakika örneği yalnız dağıtım için yaklaşık 216 USD eder; diğer kalemler ve vergiler hariçtir. Stream bu görevde kurulmadı; kayıt/iptal/özel medya gereksinimleri ayrıca değerlendirilmelidir.

## C. Eksikler ve açık riskler

1. NVR yerel IPv4, RTSP portu, gerçek oyun alanı kanalı, yalnız canlı izleme cihaz hesabı, substream H.264/GOP/fps/bitrate ve ses ayarı bilinmiyor.
2. NVR-D855 bir DMSS cihaz adı; bildirilen gerçek model DHI-NVR4216-16P-4KS3. IPC DH-IPC-HDW1230V-SA. Bunların RTSP erişimi bu görevde doğrulanmadı.
3. Fiziksel NVR konumu, kamera LAN topolojisi, aynı ağa erişim, upload ve sürekli açık cihaz belli değil.
4. DMSS paylaşımı RTSP veya cihaz yöneticisi yetkisi sayılmadı. Özel DMSS API'si kullanılmadı, kimlik doğrulama aşılmadı.
5. Gerçek görüntü için işletme izni, hukuki dayanak/aydınlatma, erişebilecek kişilerin kapsamı, çocukların korunması ve hizmet sağlayıcı/yurt dışı veri akışı değerlendirmesi tamamlanmalı. Hukuki uygunluk beyanı verilmedi.
6. QR/NFC URL'si paylaşılırsa uzaktan yeniden kullanılabilir. Oturum ve rastgele ürün tokenı ebeveyn kimliği veya fiziksel konum doğrulaması değildir.
7. İzleme izinleri kısa süreli olsa da tarayıcı sahibince paylaşılabilir. İptal önceden indirilmiş görüntüyü yok etmez. Download düğmesini gizlemek ekran kaydını engellemez.
8. Fiziksel ürünün KV durumunu kapatmak, mevcut D1 erişim linkini/oturumunu tek başına iptal etmiş sayılmamalı. Acil kapatmada ilgili access link/camera D1 kontrolü de kapatılmalıdır. Bu görev mevcut KV kayıtlarını değiştirmedi.
9. .local/cameras.yml operasyonel kaynak sırları içerir. Windows ACL/servis hesabı ve tercihen disk şifrelemesiyle korunmalı; depoya, loga, pakete veya sohbete taşınmamalı. Runtime dosyası ancak açık onaylı kaynak eşitlemede oluşur; bu görevde gerçek kaynak dosyası oluşturulmadı.
10. Bilinmeyen NVR codec'ini varsayarak canlı gösterme yoktur. H.265 kaynağı H.264 olarak doğrulanmadan relay etmemek tercih edildi; otomatik yüksek maliyetli transcoding kurulmadı.

## D. Sonraki adımlar — açık ve sıralı

### Önce yalnız sentetik testi kendi repoda aç

1. Teslim ZIP'ini Tümünü ayıkla ile aç; Uygula.cmd dosyasını çalıştır. Bu işlem dosya yedeği alır, ancak npm, D1/KV veya deploy çalıştırmaz.
2. Win+R → powershell → Enter. Aşağıdakileri çalıştır:

   cd "C:\Users\tarii\ikurt-projects\ikurt-izle"
   powershell -NoProfile -ExecutionPolicy Bypass -File .\streaming\Start-Local.ps1

3. Script yalnız özel .local klasöründe anahtarlar oluşturur, doğrulanmış portable araçları ve kilitli npm bağımlılıklarını kurar, build yapar ve gizli pencerelerde dört yerel sentetik servisi başlatır. İlk kurulum internet ve indirme süresi gerektirir.
4. Tarayıcıda http://localhost:5173/c/local-synthetic aç. Gerçek kamera değil, renkli sentetik görüntü beklenir. Gerekirse tek oynat düğmesine bas.
5. İkinci PowerShell'de aynı klasörden node streaming/smoke-local.mjs çalıştır. Başarılı test gerçek NVR'a bağlanmaz.
6. Durdurmak için powershell -NoProfile -ExecutionPolicy Bypass -File .\streaming\Stop-Local.ps1 çalıştır. Script yalnız kaydettiği PID/start-time/executable eşleşen kendi süreçlerini kapatır.
7. Yerel test veritabanı bellektedir; servis yeniden başlatılınca sentetik fixture sıfırlanır. Bu localhost testi mobil telefondan LAN erişimi açmaz.

SHA-256 uyuşmazsa arşiv açılmaz. FFmpeg'in hareketli release URL'si ileride değişirse resmî hash/sürüm kilidinin yeniden doğrulanması gerekir; doğrulamayı kapatmayın.

### Sonra işletmedeki teknik bilgileri topla

1. İşletme yetkilisi/kurulum firmasıyla NVR konumunu ve kamera ağını bulun.
2. Yetkili teknisyenden yerel IP/port, gerçek kanal, salt canlı izleme cihaz hesabı ve H.264 substream ayarını alın. Hesap şifresini sohbetten göndermeyin.
3. Aynı LAN'da VLC'yi açın. VLC kurulu görünmedi; resmî VideoLAN Windows sürümü 3.0.24 olarak doğrulandı. İndirme/kurulum gerekirse yalnız resmî kaynağı kullanın.
4. VLC → Medya → Ağ Akışı Aç (Ctrl+N). Örnek biçim: rtsp://NVR_IP:RTSP_PORT/cam/realmonitor?channel=GERCEK_KANAL&subtype=1. Bunlar yer tutucudur; gerçek adres değildir.
5. Kullanıcı adı/şifreyi URL'ye eklemeyin; cihazın kimlik doğrulama penceresinde girin. Yetki/kodek/ağ sorununu çözmek için erişim aşma veya modem port açma yapmayın.
6. NVR substream H.264 ve uygun anahtar kare aralığını yetkili teknisyene doğrulatın. Kayıt/ses/değişiklik yetkisi açtırmayın.

### Kontrollü gerçek entegrasyon için ayrı aşama

1. Sürekli açık cihaz, güvenli outbound bağlantı, DNS-only HTTPS medya adı ve kapasite bütçesini belirleyin.
2. Repo değişikliklerini, 0004 migration'ı ve sır/tenant eşleştirmelerini gözden geçirin; production'a uygulama bu görevin dışında.
3. Mevcut admin Kameralar ekranına yalnız doğrulanmış NVR bilgilerini girin. Yayınlar ekranında tenant'a ait gateway'i kaydedin, kameraya bağlayın; saatleri ve oturum limitini ayarlayın.
4. Gateway'de .local/media.env içine gerçek APP_ORIGIN/GATEWAY_ID ve Worker ile eşleşen bağımsız sırları yerel olarak koyun. Worker'da MEDIA_GATEWAY_ORIGINS izin listesi ve ilgili sırlar operasyonel süreçle tanımlanmalı; MEDIA_ENABLED ancak tüm kontrollerden sonra açılmalı.
5. Açık yetki/onay geldikten sonra kaynak yapılandırmasını almak için node streaming/sync-sources.mjs --confirmed kullanılır. Bu komut NVR'a bağlanmaz; korumalı runtime yapılandırması hazırlar.
6. Gerçek kaynaklara bağlanma kararı ayrı verilir: sentetik MediaMTX/publisher kapatılır; gateway yeniden başlatılır, node streaming/start-mediamtx.mjs --camera-config ve node streaming/filter-sources.mjs --confirmed çalıştırılır. Bu komutlar bu görevde çalıştırılmadı.
7. Yayınlar → Yayını doğrula; ardından kısıtlı ortamda doğru oyun alanı, sesin bulunmaması, Safari/Chrome, bağlantı kesilmesi, iptal ve saatler test edilir.
8. Ancak hukuki/operasyonel onay ve erişim testlerinden sonra gerçek dağıtım kararı verilir. İlk QR/NFC ürününü atama ve KV değişikliği ayrıca kontrollü yapılır; mevcut 100 token değiştirilmez.

## Resmî kaynaklar

- https://mediamtx.org/docs/usage/authentication
- https://mediamtx.org/docs/usage/webrtc-specific-features
- https://github.com/bluenviron/mediamtx/releases/tag/v1.21.2
- https://raw.githubusercontent.com/bluenviron/mediamtx/main/mediamtx.yml
- https://ffmpeg.org/download.html
- https://www.gyan.dev/ffmpeg/builds/
- https://www.videolan.org/vlc/download-windows.html
- https://developers.cloudflare.com/fundamentals/reference/policies-compliances/delivering-videos-with-cloudflare/
- https://developers.cloudflare.com/stream/pricing/

Bu kaynaklar doğrudan HTTPS üzerinden okundu; arama servisi bu oturumda 503 verdi. Fiziksel cihaz veya mobil tarayıcı testi yerine kaynak okuması test sonucu olarak gösterilmedi.






## Gorev dosyalari

- .gitignore
- docs/streaming-setup.md
- eslint.config.js
- migrations/0004_media_policies.sql
- package-lock.json
- package.json
- scripts/load-worker.mjs
- src/components/LiveVideo.tsx
- src/components/StreamSettings.css
- src/components/StreamSettings.tsx
- src/hls-light.d.ts
- src/pages/CamerasPage.tsx
- src/pages/StreamsPage.tsx
- src/pages/ViewerPage.css
- src/pages/ViewerPage.tsx
- streaming/filter-sources.mjs
- streaming/gateway.mjs
- streaming/Install-Tools.ps1
- streaming/init-local.mjs
- streaming/local-app.mjs
- streaming/mediamtx-base.json
- streaming/mediamtx.yml
- streaming/Protect-Local.ps1
- streaming/publish-synthetic.mjs
- streaming/smoke-local.mjs
- streaming/Start-Local.ps1
- streaming/start-mediamtx.mjs
- streaming/Stop-Local.ps1
- streaming/sync-sources.mjs
- streaming/worker-media.env.example
- tests/izle-links.test.mjs
- tests/media.test.mjs
- tests/worker.test.mjs
- worker/index.ts
- worker/media.ts
