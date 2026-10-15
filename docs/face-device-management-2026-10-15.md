# Audit pengelolaan perangkat login wajah

Permintaan: daftar browser terdaftar, tanggal pendaftaran/login terakhir,
dan pencabutan akses satu perangkat dari Pengaturan.

Temuan: credential terenkripsi memuat createdAt tetapi belum memuat informasi
browser/platform atau lastUsedAt. Endpoint remove sudah memeriksa pemilik dan
password, tetapi UI hanya mengirim ID browser saat ini. Belum ada endpoint daftar.

Implementasi: metadata browser/platform dari User-Agent (label informatif),
lastUsedAt hanya setelah login berhasil, respons daftar hanya metadata milik akun,
dukungan credential lama tanpa pendaftaran ulang, pemilihan satu perangkat untuk
dicabut dengan konfirmasi password. Perubahan file credential memakai penulisan
atomik dan penguncian per perangkat agar pencatatan login tidak menghidupkan
kembali akses yang telah dicabut. EN/ID tetap memakai kamus terpusat.

Tidak mengubah model/threshold atau menambahkan pengujian kamera yang dilewati
pengguna. Verifikasi dilakukan dengan data sintetis dan pemeriksaan tampilan.

## Hasil implementasi dan pemeriksaan

- Pengaturan menampilkan browser/platform, penanda browser saat ini, tanggal
  pendaftaran, dan waktu login wajah terakhir. Daftar dapat dimuat ulang.
- Data lama tetap dapat dipakai. Nama browser dan waktu login mulai tercatat
  setelah login wajah berikutnya; riwayat sebelumnya tidak direka ulang.
- Pencabutan satu browser atau seluruh browser meminta password akun. UI
  menjelaskan bahwa tindakan ini menghentikan login wajah berikutnya, bukan
  mengakhiri sesi yang sudah masuk. Login dengan password tetap tersedia.
- Backend TypeScript dan frontend TypeScript: PASS.
- Tes layanan perangkat baru: PASS dengan record sintetis terenkripsi. Mencakup
  pembatasan daftar ke pemilik akun, metadata respons tanpa template/kunci,
  label browser, kompatibilitas record lama, pencatatan hanya pada login
  berhasil, password salah, pencabutan satu/semua browser, pembatalan challenge,
  dan pencabutan bersamaan dengan penulisan waktu login tanpa membuat ulang
  record yang sudah dicabut. Tes hanya membaca record sintetis miliknya.
- Regresi layanan login dan login sekali tatap: PASS. Penyedia akun dan
  pemrosesan wajah dimock; tanda tangan serta penyimpanan terenkripsi diuji.
- Tes HTTP lokal: PASS untuk autentikasi daftar, pemilik dari sesi (bukan
  parameter pengguna), trusted origin, no-store, penerusan User-Agent,
  serta regresi pembatasan percobaan dan upload login.
- Tes komponen pengelolaan: PASS untuk tanggal, data lama, pemilihan browser,
  konfirmasi/password salah/batal, hapus satu/semua, error daftar dan ulangi,
  serta pembuangan respons terlambat setelah logout. API dimock.
- Regresi komponen kamera, navigasi Pengaturan dan kamus EN/ID: PASS. Kegagalan
  memperbarui cache browser setelah pencabutan di server tidak ditampilkan
  sebagai kegagalan pencabutan; status UI tetap nonaktif.
- Pemeriksaan whitespace pada file terkait: PASS.
- Browser Edge pada akun pengguna: daftar satu pendaftaran lama tampil,
  status login wajah tetap aktif, penanda browser saat ini benar, formulir
  pencabutan muncul dengan tombol konfirmasi nonaktif tanpa password, dan
  pembatalan menutup formulir tanpa mencabut pendaftaran. Tampilan desktop
  diperiksa melalui screenshot.

Tidak menjalankan pencabutan record pengguna atau pendaftaran ulang manusia.
Tidak mengulang pengujian kamera/pencahayaan atau build produksi penuh;
perubahan ini tidak menilai ulang akurasi maupun keamanan model wajah.
Penguncian file berlaku untuk proses backend lokal tunggal yang digunakan
saat ini; dukungan beberapa proses/server memerlukan penyimpanan transaksi
bersama. Tidak ada migrasi database atau pergantian model.
