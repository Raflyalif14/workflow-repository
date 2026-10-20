# Pemeriksaan backend otomatis — 20 Oktober 2026

## Audit singkat

Workflow GitHub yang tersedia memeriksa frontend. Backend dipasang sebagai dependensi tes frontend, tetapi belum diperiksa tipe, build, dan tesnya secara khusus.

Perintah tes backend lama menjalankan semua file melalui `npx ts-node`. Beberapa tes membutuhkan model/runtime Python lokal yang tidak tersedia pada runner GitHub. Banyak tes lainnya memakai provider simulasi dan server HTTP loopback.

## Rencana

- Tambahkan workflow backend terpisah, dengan instalasi dari lockfile, pemeriksaan tipe, build, dan tes Node.
- Jalankan tiap file tes pada proses terpisah, dengan batas waktu dan hasil lulus/gagal yang jelas.
- Gunakan konfigurasi sintetis, cegah pembacaan `.env`, dan batasi koneksi tes ke loopback.
- Cantumkan tes yang membutuhkan lingkungan khusus secara eksplisit; tes tersebut tidak dihitung sebagai lulus CI.
- Verifikasi lokal sebelum menyerahkan perubahan. Commit dan push dilakukan pengguna.

## Perubahan

Workflow `Backend checks` berjalan saat file backend terkait di-push, pada pull request, dan lewat tombol manual di GitHub Actions. File kontrak frontend yang dibaca tes backend juga menjadi pemicu.

Urutannya: pasang dependensi dari lockfile → periksa tipe → build backend → tes backend terisolasi. Workflow tidak memakai kredensial aplikasi atau database asli.

Tes CI menjalankan setiap file pada proses terpisah dengan batas 60 detik. Konfigurasi lokal `.env` tidak dimuat, koneksi eksternal diblokir, dan berkas privat fixture diarahkan ke folder sementara. Tes baru otomatis ikut, kecuali dicantumkan dengan alasan pada daftar pengecualian.

Empat tes lama disesuaikan dengan kontrak yang sudah berlaku:

- Penyelesaian Sales tidak lagi mengharapkan audit ditulis terpisah oleh Node; audit dimiliki transaksi RPC. Bentuk SQL diperiksa secara statis, bukan dijalankan.
- Fixture daftar dokumen menyediakan hasil RPC akses dan pagination yang sekarang dipakai aplikasi.
- Fixture Telegram menyediakan preferensi bahasa penerima notifikasi.
- Tes penugasan PIC mengacu pada RPC atomik saat ini, bukan nama helper lama.

Kode bisnis aplikasi tidak diubah untuk meloloskan tes tersebut.

## Batas pengujian

Delapan tes integrasi wajah memerlukan model/runtime Python lokal. Kedelapan file ditampilkan sebagai `EXCLUDED`, bukan dihitung lulus. Tes login wajah yang memakai inferensi simulasi dan tes pemantau server dengan fixture HTTP tetap ikut CI. Tes PostgreSQL dan auth/Storage terpisah juga tidak dijalankan oleh workflow ini.

Panduan perintah tersedia di [panduan tes backend](../backend/tests/README.md). Pemeriksaan ini membantu menangkap regresi setelah push; hasil run di GitHub baru dapat diketahui setelah pengguna melakukan commit dan push.

## Hasil verifikasi lokal

- Seluruh 105 file tes dalam pilihan CI telah lulus: 104 file pada run penuh, ditambah tes pemantau server yang kemudian dimasukkan dan diuji tersendiri. Delapan tes Python/model tetap dipisahkan.
- Pemeriksaan tipe backend dan build berhasil setelah koreksi fixture.
- Format YAML, pemicu push/pull request/manual, dan langkah wajib workflow diperiksa.
- Tes harness membuktikan konfigurasi sintetis, pencegahan pemuatan `.env`, pemblokiran koneksi eksternal, koneksi loopback yang berfungsi, pengalihan penyimpanan privat, dan kegagalan tes yang menghasilkan exit nonzero.
- Pemilihan tes kosong atau hanya berisi file yang dipisahkan menghasilkan kegagalan, bukan hasil hijau kosong.
- Dependensi `package.json` sesuai dengan lockfile; pemeriksaan format perubahan lulus.

Verifikasi lokal menggunakan Windows dan Node 22.21.0. Eksekusi runner Ubuntu di GitHub belum dilakukan; tidak ada commit, push, migrasi, atau perubahan data asli dari pekerjaan ini. Hasil ini tidak menggantikan pengujian layanan database/Storage dan model Python pada lingkungan masing-masing.
