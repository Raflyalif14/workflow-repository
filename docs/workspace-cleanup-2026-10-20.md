# Perapian file dan paket — 20 Oktober 2026

## Audit sebelum perubahan

- Diperiksa 520 berkas TypeScript: 338 berkas terhubung ke halaman/rute aplikasi, 180 berkas tes, dan dua berkas pendukung tes. Pemeriksaan mengikuti import, export, require, dan dynamic import dengan konfigurasi TypeScript masing-masing aplikasi.
- Dua berkas yang tidak masuk jalur aplikasi tetap diperlukan: `pic-assignment-notification.service.ts` digunakan empat tes, sedangkan `repository-access.fixture.ts` digunakan delapan tes. Keduanya dipertahankan.
- Sembilan source lama sudah dikeluarkan pada [perapian 15 Oktober](workspace-cleanup-2026-10-15.md). Tidak ditemukan source TypeScript lain yang terbukti aman untuk dihapus pada pemeriksaan ini.
- Paket frontend `@tanstack/react-query-devtools` masih terpasang, tetapi tidak lagi diimport oleh source, tes, konfigurasi, atau skrip aplikasi. Provider hanya menggunakan `@tanstack/react-query`. Paket debug tersebut beserta dependency khususnya menjadi sasaran pembersihan.
- Paket `@supabase/supabase-js` di root tidak digunakan oleh perintah root (semuanya meneruskan ke frontend/backend). Pemakai aktif adalah backend melalui dependency backend sendiri, dan skrip backup secara eksplisit memakai paket di `backend/node_modules`. Alat audit metadata lokal memakai HTTP langsung, bukan paket root. Salinan dependency root juga dapat dibersihkan.
- Skrip backup, pemeriksaan database, runner tes lama, aset kamera, model Python, lisensi, SQL, dan bukti pengujian masih mempunyai fungsi atau referensi. Tidak dihapus berdasarkan umur atau nama file saja.

## Rencana dan batas

Hapus paket debug dan dependency root yang tidak digunakan melalui pengelola paket, lalu periksa perubahan lockfile agar versi paket lain tetap sama. Perintah root tetap tersedia. Perubahan CI backend dan indikator navigasi yang sebelumnya belum di-commit tetap dipertahankan. Tidak ada perubahan database, migrasi, akun, atau data wajah.

## Hasil

- Dihapus dua paket frontend: `@tanstack/react-query-devtools` dan `@tanstack/query-devtools`.
- Dihapus sembilan paket dari instalasi root: salinan `@supabase/supabase-js` beserta delapan dependency-nya. Dependency Supabase di backend tetap tersedia dan dapat dimuat tanpa paket root.
- Manifest dan lockfile diperbarui melalui npm secara offline, tanpa menjalankan skrip instalasi. Semua record paket frontend yang tersisa identik dengan sebelum pembersihan; tidak ada pembaruan versi terselip.
- Tidak ada penghapusan source aplikasi. Perbandingan SHA-256 memastikan seluruh perubahan sebelumnya tetap utuh, selain penambahan tautan audit di indeks dokumentasi.
- [README utama](../README.md) dan [indeks dokumentasi](README.md) kini menunjuk laporan ini. Arsip sembilan source lama tetap tersedia.

## Verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| Batas perubahan dependency, versi paket, dan perubahan sebelumnya | Lulus |
| Build backend melalui perintah root | Lulus |
| Tes alat cadangan dengan data buatan | 2/2 lulus |
| TypeScript dan lint frontend | Lulus |
| Seluruh tes frontend | 68/69 lulus pada run utama; satu tes HTTP yang tertahan izin lokal lulus saat diulang (1/1), sehingga seluruh 69 berkas terverifikasi melalui dua run |
| Build produksi frontend pada folder terpisah | Lulus, 23 halaman dihasilkan |
| Tautan laporan dan `git diff --check` | Lulus |

Satu tes HTTP awal tertahan pembatasan koneksi loopback (`EACCES`), lalu lulus saat diulang dengan akses lokal yang diperlukan. Build pertama juga tertahan izin menulis output (`EPERM`) dan diulang. Kedua kejadian ini tidak memerlukan perubahan source.

Log terpisah disimpan lokal di `.cache/unused-cleanup-2026-10-20/`: `frontend-check.log`, `frontend-http-retest.log`, `frontend-build-retest.log`, `backend-build.log`, dan `backup-tests.log`. Perintah `check` pertama keluar dengan kode 1 karena pembatasan HTTP tersebut; ini bukan klaim satu run penuh yang seluruhnya hijau.

Ini pemeriksaan lokal atas pembersihan dependency, bukan pengujian ulang seluruh alur bisnis, akurasi Face ID, atau deployment. Commit dan push tetap dilakukan pengguna.
