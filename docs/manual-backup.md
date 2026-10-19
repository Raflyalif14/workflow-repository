# Cadangan manual aplikasi

Alat: `node scripts/manual-backup.cjs`. Perintah ini membaca sumber dan membuat salinan terenkripsi; tidak menjalankan migrasi, menghapus data, atau melakukan pemulihan.

## Isi dan tempat penyimpanan

- `.private/backups/backup-<waktu>/`: paket terenkripsi AES-256-GCM, katalog terenkripsi, dan status.
- `.private/backup-keys/<waktu>.key`: kunci paket yang sesuai, disimpan terpisah dari folder paket. Tanpa kunci ini cadangan tidak bisa dibuka.
- Kode dari commit HEAD, konfigurasi environment, pendaftaran wajah lokal beserta kunci enkripsinya, metadata bucket dan file Storage yang berhasil diunduh.
- Database PostgreSQL hanya disalin bila `BACKUP_DATABASE_URL` tersedia. Salinan menggunakan `pg_dump` format custom, termasuk schema yang dapat diakses akun koneksi. Kegagalan akses membuat paket gagal, bukan dianggap berhasil.

Folder `.private` diabaikan Git dan memiliki pembatasan akses lokal dari pengaturan Face ID. Enkripsi paket tetap diperlukan karena konfigurasi berisi kredensial. Salin paket ke media cadangan pribadi dan simpan kuncinya di tempat aman yang terpisah. Cadangan di disk yang sama belum melindungi dari kehilangan laptop/disk. Jangan unggah paket atau kunci ke repository.

Kunci perangkat browser yang tidak dapat diekspor **tidak dicadangkan**. Cadangan server tidak menjamin login wajah bisa langsung dipakai dari browser baru; gunakan password dan daftarkan ulang wajah bila diperlukan. Model/runtime lokal tidak disalin; siapkan ulang sesuai panduan Face ID sebelum menjalankan layanan.

## Persiapan database

Di dashboard Supabase pilih **Connect → Session pooler**. Simpan URI PostgreSQL lengkap sebagai `BACKUP_DATABASE_URL` di `backend/.env`, termasuk password yang di-URL-encode bila mengandung karakter khusus. Jangan kirim password melalui chat. Tidak perlu mereset password database bila password yang benar masih tersedia.

Alat memakai `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`; lokasi lain bisa ditentukan melalui environment `PG_DUMP_PATH`. SSL diminta saat koneksi. Koneksi dan stderr alat database tidak dicetak agar rahasia tidak bocor.

Pada laptop ini, PG18 memerlukan dependensi `zlib1.dll` yang tersedia di instalasi PG16. Script menambahkan lokasi runtime PG16 hanya ke PATH proses anak, tanpa mengubah instalasi atau PATH sistem. URI dipecah menjadi variabel libpq untuk host, port, akun, password, dan nama database; rahasia tidak dimasukkan ke argumen perintah. Mode SSL `verify-ca`/`verify-full` dipertahankan bila ditentukan pada URI.

Jalankan saat tidak ada unggahan, perubahan proyek, atau pendaftaran wajah. Database dan Storage bukan satu transaksi bersama. Daftar objek Storage diperiksa ulang setelah penyalinan untuk mendeteksi perubahan; ini bukan jaminan snapshot atomik seluruh aplikasi.

## Membaca hasil

- `PARTIAL_NO_DATABASE`: kode, konfigurasi, wajah dan Storage disalin; database serta akun Supabase Auth belum dicadangkan.
- `CAPTURED_NOT_RESTORE_TESTED`: pengambilan termasuk database selesai, tetapi pemulihan penuh belum diuji.
- `FAILED.txt`: pengambilan gagal. Jangan gunakan sebagai titik pemulihan.

Pemeriksaan integritas:

```powershell
node scripts/manual-backup.cjs verify "<folder-paket>" "<file-kunci>"
```

Pemeriksaan ini memverifikasi autentikasi enkripsi, ukuran, serta SHA-256 setiap isi. Ini belum membuktikan data bisa dipulihkan menjadi aplikasi yang berjalan.

Untuk paket yang berisi database, periksa katalog dan pembacaan seluruh arsip PostgreSQL tanpa memulihkan ke database:

```powershell
node scripts/check-backup-database.cjs "<folder-paket>" "<file-kunci>"
```

Hasil tersimpan sebagai `database-verification.json` di paket. Alat hanya mengalirkan hasil dekripsi ke `pg_restore --list` dan pembaca arsip dengan keluaran dibuang; tidak menyimpan SQL terbuka atau menghubungi database.

## Rencana uji pemulihan

1. Siapkan PostgreSQL/Supabase pengujian terpisah. Jangan mencoba restore ke database aktif.
2. Verifikasi seluruh paket, lalu dekripsi hanya ke folder kerja privat dengan bantuan alat pemulihan yang ditinjau. Perintah `verify` tidak menulis plaintext.
3. Tinjau arsip database dengan `pg_restore --list` sebelum memilih objek yang akan dipulihkan. Supabase mengelola schema/role internal; dump penuh bukan skrip yang boleh ditimpa langsung ke proyek Supabase baru. Ikuti prosedur pemulihan resmi dan cocokkan versi/ekstensi/policy/konfigurasi Auth.
4. Pulihkan bucket dan objek melalui Storage API ke proyek pengujian, mempertahankan nama/path dan metadata yang diperlukan. Metadata di database saja tidak memulihkan isi file.
5. Cocokkan jumlah data dan checksum file; uji password login, daftar proyek, akses dokumen, dan persetujuan memakai akun uji. Uji wajah hanya sesudah konfigurasi/kunci lokal siap dan hak akses data dipastikan.
6. Catat hasil dan keterbatasannya. Sampai langkah ini dijalankan, status tetap belum diuji pulih.

Alat pemulihan otomatis belum disediakan agar paket awal tidak dapat menimpa aplikasi aktif secara tidak sengaja. [Panduan resmi Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) menjelaskan penyesuaian untuk pemulihan PostgreSQL/Supabase.

## Hasil pertama — 16 Oktober 2026

- Paket: `.private/backups/backup-2026-10-16T02-43-06-021Z`.
- Kunci terpisah: `.private/backup-keys/2026-10-16T02-43-06-021Z.key`.
- Status: **PARTIAL_NO_DATABASE**. Koneksi PostgreSQL belum dikonfigurasi, sehingga data tabel dan akun Auth belum diekspor.
- Berhasil disalin: kode commit `099fbbb`, dua file environment, dua pendaftaran wajah dan kunci lokal, metadata satu bucket, serta 12 objek Storage.
- Seluruh 19 payload terenkripsi lolos pemeriksaan autentikasi, ukuran, dan SHA-256. Daftar Storage sebelum/sesudah cocok. Ukuran folder sekitar 37,4 MB.
- Uji alat: data uji terenkripsi dapat diverifikasi kembali; kunci salah, perubahan isi, checksum/ukuran salah, path di luar folder, dan penimpaan file ditolak.
- Pemulihan aplikasi penuh dan salinan ke media eksternal belum dilakukan. Script/panduan backup yang baru dibuat belum masuk kode checkpoint dalam paket dan belum di-commit/push.

## Kelanjutan koneksi — 16 Oktober 2026

URI PostgreSQL yang semula ditulis tanpa nama variabel sudah diberi nama `BACKUP_DATABASE_URL`. Kendala dependensi alat PG18 dan pemuatan koneksi script telah diperbaiki. Port jaringan Supabase dapat dijangkau, tetapi percobaan dump schema PostgreSQL berhenti karena **autentikasi database ditolak**. Tidak ada password/alamat lengkap yang dicetak dan tidak ada schema/data yang diubah. Menunggu koreksi password database lokal; backup penuh dan uji pemulihan masih belum selesai. Paket awal tetap berstatus parsial; paket percobaan yang gagal tidak boleh dipakai sebagai titik pemulihan.

## Hasil terbaru — 16 Oktober 2026, 10.00 WIB

Penyebab penolakan autentikasi sudah ditemukan: tanda kurung siku template masih membungkus password. Setelah satu pemeriksaan koneksi read-only tanpa tanda pembungkus berhasil, URI lokal diperbaiki. Password tidak diganti atau ditampilkan.

- **Gunakan paket terbaru** `.private/backups/backup-2026-10-16T02-59-12-127Z` (dibuat mulai 09.59 WIB).
- Kunci pasangan: `.private/backup-keys/2026-10-16T02-59-12-127Z.key`.
- Status: **CAPTURED_NOT_RESTORE_TESTED**. Pengambilan selesai termasuk database, tetapi belum diuji sebagai pemulihan aplikasi penuh.
- 20 payload terenkripsi lolos pemeriksaan autentikasi AES-GCM, ukuran, dan SHA-256.
- Dump database berhasil dibaca seluruhnya oleh `pg_restore`. Terdapat 83 entri data tabel: 45 schema public, 27 auth, 8 storage, dan 3 pada schema lain. Jumlah ini adalah entri tabel dalam arsip, bukan jumlah baris atau pengguna.
- Data `public.projects`, `public.users`, `auth.users`, dan `storage.objects` terdapat dalam katalog arsip. Akun Auth masuk dalam dump; file Storage tetap dicadangkan terpisah.
- 12 objek dari 1 bucket, 2 pendaftaran wajah lokal, kunci wajah, 2 konfigurasi environment, dan kode commit `099fbbb` ikut tersalin. Kunci browser dan model/runtime lokal tidak ikut.
- Dump menggunakan `--no-owner --no-acl`; pemilik objek, hak akses, role global, konfigurasi layanan Supabase, dan kebutuhan ekstensi harus ditinjau/disiapkan saat pemulihan. Ini bukan paket yang otomatis dapat ditimpa ke proyek Supabase baru.
- Tidak ada migrasi, penulisan data database, penghapusan objek Storage, atau reset password yang dilakukan. Paket masih berada di disk laptop; penyalinan ke media eksternal serta uji pemulihan aplikasi penuh tetap belum dilakukan.
