# Audit dan implementasi login wajah kamera biasa

Permintaan: melanjutkan tes kamera menjadi pendaftaran dan login yang dapat
dipakai. Pengguna memilih kamera biasa setelah perbandingan dua cara login.

## Temuan sebelum perubahan autentikasi

- Login existing menerbitkan sesi Supabase setelah email/password.
- Tes PAD/SFace existing memerlukan akun yang sudah masuk, tanpa enrollment.
- MiniFASNet membedakan satu pengambilan pertama (real 99.86%) dan satu
  foto layar HP yang dikonfirmasi pengguna (spoof 60.51%). Bukan kalibrasi
  tingkat kesalahan atau bukti ketahanan serangan lain.
- Ada konflik alamat IPv4/IPv6 pada localhost; API lokal sekarang dipilih
  eksplisit melalui 127.0.0.1. Tidak ada kredensial database SQL langsung
  di konfigurasi backend; hanya akses Supabase API yang sudah digunakan.

## Batas implementasi

Login kamera akan memerlukan **kunci perangkat + verifikasi wajah**. Browser
membuat kunci privat ECDSA non-extractable. Pendaftaran memerlukan akun aktif
dan pemeriksaan password baru. Login memerlukan tanda tangan challenge baru
dari perangkat terdaftar, PAD, gerakan acak dan kecocokan template. Password
tetap tersedia untuk perangkat baru/pemulihan. Foto mentah tidak disimpan.

Penyimpanan kredensial lokal terenkripsi di backend ditujukan untuk instalasi
lokal satu server yang sedang diperbaiki. Tidak memakai tabel Prisma lama,
tidak mengubah skema Supabase, tidak menjadi sistem terdistribusi atau layanan
produksi tanpa evaluasi dan pemindahan penyimpanan yang sesuai. Kunci enkripsi
tidak masuk Git; metadata/template terikat pemilik dan ID perangkat lewat AAD.

Sesi tetap diterbitkan dan diverifikasi oleh Supabase setelah semua faktor
lolos; tidak membuat JWT sendiri atau melonggarkan middleware/rute existing.
Enrollment dan login harus gagal tertutup jika model, penyimpanan, challenge,
signature, pemeriksaan gerakan/PAD, profil akun atau layanan auth tidak valid.

## Implementasi lokal

- `/settings/face-verification` sekarang berisi formulir pendaftaran kamera.
  Eksperimen lama tetap tersedia di `/settings/face-verification/advanced`
  dan tes cepat tetap di `/settings/face-verification/quick`.
- Tombol login kamera ditambahkan pada `/login`. Setiap browser profil perlu
  didaftarkan melalui password akun terlebih dahulu; password tetap fallback.
- Browser menyimpan kunci privat P-256 non-extractable di IndexedDB, tidak
  mengirimkannya ke server. Server menerima kunci publik dan tiga foto.
- Challenge 90 detik, satu penggunaan, satu challenge terbaru per perangkat;
  tanda tangan mengikat nonce, action, device, urutan dan SHA256 tiga foto.
  Salah origin, akun, perangkat, urutan foto, replay dan challenge kedaluwarsa
  ditolak sebelum inference. Limit 5 start/perangkat/10 menit, 20 request/IP/10
  menit; maksimal dua pemrosesan multipart/inference sekaligus.
- Gerakan lurus → arah acak → lurus diperiksa dari landmark YuNet di server.
  Setiap frame harus memiliki satu wajah, dua model MiniFAS sama-sama memberi
  real lebih tinggi dari gabungan kelas attack, dan SFace konsisten. Rasio
  pergeseran hidung/antar mata ditetapkan .12, pose awal maksimum .22 dan
  toleransi kembali .12; ketiganya belum dikalibrasi pada populasi pengguna.
- Cosine SFace minimum .60 ditetapkan sebelum pengujian enrollment/login
  pengguna, lebih ketat dari contoh umum LFW .363 di
  [dokumentasi OpenCV](https://docs.opencv.org/4.13.0/d0/dd4/tutorial_dnn_face.html).
  Ini kebijakan awal lokal, bukan jaminan FAR tertentu dan bukan kalibrasi
  keamanan. Tes liveness/motion belum mengevaluasi video replay/deepfake.
- Template 128 dimensi dan metadata perangkat disimpan dengan AES-256-GCM,
  AAD versi+device ID, file baru saja (`wx`), di `.private/face-login/`.
  Kunci 32 byte di `.private/face-login-key.bin`; folder diabaikan Git dan
  setup Windows membatasi pewarisan ACL ke pengguna saat ini/SYSTEM. Setup
  tidak mengganti kunci yang sudah ada. Kehilangan kunci/browser storage
  memerlukan pendaftaran ulang memakai password.
- Pembatalan mematikan kamera, menolak respons lama dan menghentikan proses
  Python langsung. Data foto melewati stdin, tidak disimpan ke disk.
- Setelah seluruh faktor lolos, backend memakai
  [generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink)
  dan [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp)
  secara internal untuk menerbitkan sesi Supabase. Token sekali pakai tidak
  dikirim ke frontend/email. ID pengguna auth dicocokkan dengan profil aktif
  sebelum/sesudah issuance. Provider mencatat sesi sebagai magic-link/email,
  bukan faktor biometrik native atau sertifikasi MFA.
- Pengguna dapat menonaktifkan perangkat saat ini atau semua perangkat milik
  akunnya setelah verifikasi password. Ini mencabut login kamera berikutnya,
  bukan mengakhiri sesi akun lain yang sudah terbit.
- Feature secara sengaja hanya aktif ketika `NODE_ENV=development` dan
  `FACE_LOGIN_ENABLED=true`; mode produksi selalu nonaktif. Setup lokal
  `node scripts/prepare-face-login.cjs` sudah dijalankan dan backend pilot
  dimulai ulang. Tidak ada migrasi, pendaftaran akun atau perubahan data
  Supabase selain operasi auth yang diminta pengguna melalui UI nantinya.

## Validasi aktual sebelum pendaftaran pengguna

- Frontend/backend `tsc --noEmit`: PASS sesudah penambahan fitur dan tes.
- Backend service test: PASS, signature WebCrypto asli diverifikasi Node,
  enkripsi/AAD, password, akun, replay, urutan gambar, rate limit, revoke,
  gagal PAD/akun nonaktif dan produksi nonaktif. Provider/inference di-stub;
  hanya template sintetis sementara dengan UUID acak, dihapus setelah tes.
- Backend HTTP test: PASS dengan auth asli/provider sintetis, multipart tiga
  gambar, origin, cleanup pixels, disconnect/abort, respons dan default-off.
  Inference/session issuance di-stub.
- Python: empat tes PASS, termasuk model asli menolak gambar tanpa wajah
  dan foto statis; logika gerakan dan PAD diuji terpisah. Bukan hasil kamera
  pengguna atau uji ketahanan serangan representatif.
- Frontend workflow test: PASS, tidak mengambil kamera otomatis, tiga frame
  ditandatangani, password tidak digabung request foto, persist perangkat,
  pembatalan start, dan EN/ID. Kamera/storage/transport di-mock.
- Regresi AuthProvider existing: PASS (guard/profil, logout dan race akun).
- Pada tahap awal ini, halaman pendaftaran sudah terlihat pada browser pengguna
  dengan password kosong dan kontrol aktivasi. Hasil penggunaan selanjutnya
  dicatat di bawah; tidak ada klaim siap produksi atau bebas error.

## Penyederhanaan pengambilan foto

- Pengguna mengonfirmasi pendaftaran selesai dan login kamera berhasil pada
  14 Oktober 2026, tetapi tiga klik foto terasa merepotkan. Ini konfirmasi
  pengguna, bukan pengujian ulang mandiri oleh agen.
- Audit alur: tiga foto diperlukan oleh pemeriksaan gerakan server, sedangkan
  tiga klik terpisah hanya berasal dari UI. Perubahan difokuskan pada UI:
  setelah klik mulai, setiap posisi diberi hitungan mundur tiga detik lalu
  diambil otomatis. Opsi manual tetap tersedia untuk kebutuhan waktu berbeda.
- Hitungan hanya berjalan saat kamera siap dan tab terlihat. Pembatalan,
  logout, perpindahan akun/halaman, kamera terputus dan challenge kedaluwarsa
  harus menghentikan pengambilan otomatis. Kembali ke tab memulai hitungan
  posisi saat ini dari awal. Validasi server dan ambang model tidak berubah.
- Implementasi selesai: default otomatis, pilihan tombol manual, penghentian
  timer saat capture berjalan, hanya satu submission setelah tiga foto, dan
  petunjuk digulirkan ke area terlihat ketika preview dibuka. Tidak mengambil
  gambar sebelum pengguna menekan tombol mulai; tidak memakai deteksi pose
  otomatis di browser. Hitungan adalah panduan waktu, keputusan tetap di server.
- Tes frontend PASS dengan kamera/provider/storage dan waktu sintetis:
  enrollment + login otomatis (3 × 3 detik), satu submission bertanda tangan,
  fallback manual, tab tersembunyi/kembali, kamera error, expiry, logout sebelum
  render berikutnya, cancel saat capture tertunda, unmount dan EN/ID. Tidak ada
  perubahan threshold PAD, pencocokan wajah, format proof atau validasi server.
- `tsc --noEmit` frontend dan regresi AuthProvider existing PASS setelah
  perubahan terakhir. `git diff --check` dan pemeriksaan whitespace file baru
  terkait PASS.
- Build frontend pada salinan terpisah berhasil mengompilasi dan menghasilkan
  22 halaman (exit 0), tetapi bundel standalone memberi warning EPERM saat
  menyalin symlink node_modules di Windows. Paket deploy standalone belum
  terverifikasi. Build dilakukan sebelum tambahan guard pembatalan sinkron dan
  scroll petunjuk; kedua tambahan lolos typecheck dan tes alur di atas.
- Browser nyata memperlihatkan petunjuk otomatis yang baru dan tombol login
  aktif. Pengguna kemudian mengonfirmasi versi otomatis berhasil masuk dan
  lebih praktis. Ini konfirmasi pengguna, bukan pengujian kamera mandiri agen.
  Semua pengujian ini tetap lokal/development.

## Umpan balik setelah login otomatis berhasil

- Pengguna menginginkan cukup menatap kamera lalu masuk, tanpa tiga pose.
  Audit ulang memastikan `inspect()` selalu memanggil `verify_motion()` setelah
  PAD dan kecocokan identitas; ketiga pose adalah syarat server, bukan hanya UI.
- Pemindaian beberapa frame lurus dalam satu sesi dapat menyederhanakan UX,
  tetapi tidak memenuhi pemeriksaan gerakan acak saat ini. Menghapusnya adalah
  perubahan kebijakan autentikasi, bukan optimasi timer yang setara.
- Ditanyakan pilihan untuk menguji mode sekali tatap lokal dengan evaluasi
  foto/video terlebih dahulu. Belum ada perubahan syarat penerimaan login,
  threshold model, format proof atau credential tersimpan. Hasil dua sampel
  PAD sebelumnya belum membuktikan keamanan mode tanpa gerakan.
