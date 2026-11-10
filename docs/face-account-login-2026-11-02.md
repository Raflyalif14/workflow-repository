# Face ID lintas browser

Pendaftaran wajah lama tetap digunakan. Pengguna mengisi email akun pada kartu Login dengan kamera, lalu memilih masuk dengan kamera. Email disinkronkan dengan formulir login utama. Browser baru tidak perlu pendaftaran ulang. Semua browser harus mengakses aplikasi yang sama dan backend yang memiliki penyimpanan wajah tersebut.

## Implementasi

- Backend mencari pendaftaran wajah akun berdasarkan email, memeriksa status akun, lalu menerbitkan challenge sekali pakai yang terikat origin, akun, kunci permintaan, dan versi pendaftaran.
- Browser baru membuat kunci permintaan untuk menandatangani challenge dan hash frame. Kunci ini menjaga keterikatan permintaan; kepemilikannya bukan lagi syarat browser pernah didaftarkan.
- Identitas login lintas browser bergantung pada pencocokan wajah dan pemeriksaan liveness yang sudah ada. Perubahan ini melepas syarat kepemilikan kunci browser lama; tidak menambah kemampuan model atau membuktikan tingkat keamanan setara biometrik perangkat keras.
- Template wajah tetap terenkripsi di penyimpanan server yang sudah ada, bukan dikirim ke browser. Tidak ada daftar akun yang dibuka untuk publik.
- Percobaan salah dihitung per akun untuk login lintas browser, selain pembatasan IP pada route. ID browser baru tidak menghapus batas percobaan akun.
- Tidak membuat pendaftaran tambahan setiap login. Menghapus pendaftaran sumber membatalkan challenge yang memakainya; menghapus semua pendaftaran mematikan login wajah akun di semua browser. Sesi yang sudah login mengikuti aturan sesi yang sudah ada.
- Pengaturan menampilkan status pendaftaran akun dari server, termasuk saat browser tidak punya kunci pendaftaran lokal.
- Pendaftaran tetap membutuhkan login aktif dan konfirmasi password. Pemeriksaan satu wajah terhadap akun lain tetap digunakan. Mode development/feature flag yang sudah ada tetap berlaku.

## Hasil verifikasi

Typecheck backend/frontend, lint berkas terkait, lima file tes backend (account login, login lama, single glance, route, devices), serta tiga file tes frontend (login, devices, i18n) lulus. Sebagian tes fixture membutuhkan izin di luar sandbox untuk loopback/rename file sementara.

Tes memakai model/sesi sintetis, bukan wajah pengguna: browser baru tanpa credential lokal, signature berbeda dari browser pendaftaran, template lama, replay challenge, liveness/mismatch yang ditolak model, akun nonaktif, pencabutan saat challenge aktif, serta batas percobaan lintas ID browser. UI diuji untuk login browser kosong dan status Pengaturan dari server.

Pengujian wajah langsung di browser kedua masih memerlukan pengguna. Tidak ada template wajah atau kunci pengguna yang diubah oleh tes, tidak ada migrasi database, dan tidak ada commit/push.

## Perbaikan cabang login browser lama

Setelah laporan Chrome masih menampilkan pesan browser belum terdaftar, ditemukan cabang yang dapat memakai login device lama saat email tidak tersedia tetapi browser masih memiliki catatan pendaftaran lokal. Mode akun kini selalu membutuhkan email; form kamera menampilkan kolom email sendiri. Email kosong/invalid dihentikan sebelum permintaan dan pengambilan kamera, termasuk saat dipanggil dengan catatan browser lama. Pesan pendaftaran hilang dalam mode akun menyebut pendaftaran akun, bukan meminta mendaftarkan Chrome ulang. Tes regresi memeriksa tidak ada permintaan device-only saat email kosong serta email/public key selalu dikirim pada login mode akun.
