# Audit singkat pengaturan login wajah

Permintaan: pengguna baru memahami bahwa pendaftaran cukup sekali per browser,
sedangkan login berikutnya menggunakan sekali tatap pada mode lokal aktif.

Temuan terkait: halaman utama masih memajang tiga tautan eksperimen; status
terdaftar tetap disertai kolom password dan tombol nonaktifkan; tiga posisi
pendaftaran belum dibedakan dari pemindaian login. Saat status belum dimuat,
teks fitur nonaktif juga muncul terlalu dini.

Perbaikan: satu pintu "Login wajah" di Pengaturan, panduan tiga tahap sebelum
pendaftaran, penjelasan posisi hanya untuk pendaftaran, status aktif dengan
petunjuk login berikutnya, serta pengelolaan/nonaktifkan dan privasi dalam
bagian yang dapat dibuka. Halaman eksperimen tetap tersedia pada URL existing,
tetapi bukan bagian alur pendaftaran pengguna. Tidak mengubah API, model,
ambang pemeriksaan, atau data pendaftaran yang sudah ada.

## Hasil pemeriksaan

- Navigasi Pengaturan dan dictionary EN/ID: PASS. Label tombol dan seluruh
  teks baru memakai dictionary terpusat; bahasa default tetap English.
- Frontend TypeScript: PASS setelah perubahan selesai.
- Regresi komponen kamera: PASS dengan kamera/API/storage/clock mock.
  Cakupan: panduan sebelum daftar, status loading, selesai tanpa kolom
  password pendaftaran, menu pengelolaan tertutup, password pengelolaan
  terpisah, nonaktifkan, akun lain, enrollment tiga posisi dan login sekali
  tatap existing, pembatalan/logout/expiry.
- Browser Edge: kartu "Face sign-in" di Pengaturan membuka halaman yang
  menampilkan status aktif untuk perangkat existing; tidak meminta daftar
  lagi. Menu privasi/pengelolaan dapat dibuka/tutup, tombol nonaktifkan tetap
  disabled tanpa password. Tidak membuka kamera atau mengubah credential.
- Tampilan desktop status aktif diperiksa melalui screenshot. Halaman
  ditinggalkan terbuka untuk pengguna. Pendaftaran manusia baru tidak diulang;
  kondisi pengguna baru diperiksa lewat pengujian komponen.
- Whitespace: PASS. Tidak menjalankan build produksi ulang untuk perubahan
  tampilan ini; hasil build alur login sebelumnya tercatat terpisah.
