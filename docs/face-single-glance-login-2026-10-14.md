# Audit dan penerapan login sekali tatap lokal

## Bukti sebelum perubahan

Pengguna meminta login sekali tatap setelah menguji wajah langsung, foto HP,
dan video HP. Hasil dibaca langsung dari rincian halaman di Edge pada
2026-10-14, tanpa menyimpan gambar atau video:

| Sampel (label pengguna) | Waktu UTC | PAD | Identitas | Posisi |
| --- | --- | --- | --- | --- |
| Wajah langsung | 07:47:27.608 | Lolos | Lolos | Lolos |
| Foto HP | 07:47:40.210 | Ditolak | Lolos | Lolos |
| Video HP | 07:47:51.955 | Ditolak | Lolos | Lolos |

Video terbaru konklusif untuk contoh ini: kedua model menolak ketiga frame,
sementara cosine identitas 0.773–0.824 dan posisi lurus memenuhi batas yang
sudah ditetapkan. Pada foto, sebagian frame model V2 lolos, tetapi model V1SE
menolak semuanya; aturan semua model pada semua frame tetap menolak foto.
Wajah langsung lolos enam pemeriksaan PAD. Ini pemeriksaan awal pada satu
pengguna/perangkat, bukan sertifikasi atau pengukuran tingkat serangan.

## Perubahan yang diterapkan

- Mode lokal opt-in `FACE_LOGIN_SINGLE_GLANCE_ENABLED`, tetap mati di production.
- Server memilih challenge `login-passive`; mode tidak dipilih payload klien.
  Purpose masuk dalam signature. Challenge evaluasi tidak menjadi sesi login.
- Login memakai burst yang sama dengan pengujian: tiga frame baru dari satu
  pose, tanpa tombol foto, hitungan per foto atau menoleh. Enrollment existing
  tetap tiga pose dan tidak perlu diulang oleh perangkat yang terdaftar.
- Tetap memerlukan kunci browser, template terdaftar, origin, challenge sekali
  pakai, semua skor PAD/match/pose, akun aktif, batas waktu dan rate limit.
- Tidak mengubah model, ambang, atau memilih frame terbaik. Error tidak
  memicu pelonggaran pemeriksaan maupun fallback ke login tanpa wajah.
- Uji sintetik memeriksa isolasi purpose, kegagalan PAD/match/pose, pembatalan,
  pencabutan perangkat, flag dinonaktifkan, dan alur UI satu pemindaian.
  Login kamera manusia setelah perubahan berhasil dikonfirmasi pengguna.

## Verifikasi implementasi

- Frontend dan backend TypeScript: PASS.
- Tes autentikasi sekali tatap: PASS dengan signature ECDSA asli, parser skor
  asli dan provider/Python sintetis. Mencakup PAD, identitas, konsistensi,
  posisi, output model invalid, purpose salah, frame duplikat, replay,
  flag mati, abort, pencabutan saat inferensi dan saat penerbitan sesi.
- Regresi layanan autentikasi gerakan/enrollment dan endpoint HTTP: PASS.
  Endpoint tes tetap memerlukan login dan tidak menerbitkan sesi.
- Tes UI login dan burst: PASS dengan kamera/API/clock mock. Satu burst hanya
  menghasilkan satu submission; cancel/logout membuang hasil terlambat.
  Enrollment/fallback gerakan, password, error kamera dan EN/ID tetap lolos.
- Tes UI evaluasi dan AuthProvider existing: PASS.
- Runner Node ke Python/model lokal asli: PASS pada tiga frame kosong sintetis
  (`FACE_NONE`), baik mode evaluasi maupun gerakan. Tidak memakai foto pengguna.
- Build pada salinan terpisah: exit 0, 23 halaman terkompilasi. Warning EPERM
  penyalinan symlink pada paket standalone Windows masih ada; artefak deploy
  belum diverifikasi. Proses dev yang digunakan pengguna tidak diganti build.
- Server berjalan telah mengembalikan `enabled:true, singleGlance:true,
  localOnly:true`. Flag disimpan pada `.env` lokal yang diabaikan Git.
- Halaman login di Edge menampilkan petunjuk sekali tatap serta tombol aktif
  untuk perangkat terdaftar. Pengguna kemudian mengonfirmasi "Berhasil masuk"
  setelah diminta memakai tombol kamera tanpa menoleh atau mengambil foto
  satu-satu. Pemeriksaan browser sesudah konfirmasi menunjukkan dashboard
  authenticated di `http://localhost:3000/` dengan akun yang sama. Dengan
  konfirmasi pengguna dan halaman akhir tersebut, alur login lokal sekali
  tatap dinyatakan berhasil pada percobaan ini. Agen tidak merekam video
  pengguna maupun menginspeksi token sesi.

## Status akhir

Login sekali tatap aktif dan berhasil dipakai pada browser/perangkat lokal
yang sudah terdaftar. Enrollment tidak diulang. Wajah langsung diterima serta
contoh foto/video HP ditolak pada evaluasi sebelumnya. Hasil ini tetap terbatas
pada percobaan tersebut; tidak membuktikan perlindungan semua serangan replay
atau kesiapan produksi. Tidak ada commit, push, atau migrasi database.

Untuk kembali ke alur gerakan, ubah `FACE_LOGIN_SINGLE_GLANCE_ENABLED=false`
dan muat ulang backend. Konfigurasi mati atau perubahan mode membatalkan
challenge lama. Tidak ada perubahan model/template atau migrasi database.
