# Pembaruan keamanan dependency — 19 Oktober 2026

## Audit awal dan batas pekerjaan

Permintaan: kerjakan pembaruan keamanan paket saja. Perubahan kode, tes, dan backup yang sudah ada di working tree tetap dipertahankan; tidak ada commit, push, migrasi, atau perubahan akun/data asli.

Audit npm terhadap lockfile: frontend 10 paket terdampak (7 high, 3 moderate), backend 5 (1 critical, 4 moderate). Angka ini mencakup dependency induk yang ikut ditandai, bukan jumlah celah independen atau bukti eksploitasi aplikasi.

- Backend: Express 4.22.2 membawa `proxy-addr` 2.0.7 dan `qs` 6.15.3; pembatasan login memakai `ip-address` 10.7.0. Tersedia rilis perbaikan dalam major yang sama.
- Frontend: `postcss-selector-parser` 6.1.4 perlu diganti dengan 7.1.6 melalui override terarah dan diuji kompatibilitas CSS-nya. Tailwind tetap pada major 3 dan Next pada major 15.
- `braces` 3.0.3 masih versi terbaru resmi dan belum memiliki patch. Rantai Tailwind/ESLint menggunakan paket ini untuk pola berkas saat pengembangan/build. Audit tetap dibiarkan menampilkan temuan tersebut; tidak disembunyikan dengan menurunkan ambang audit atau mengganti nama paket.

## Rencana validasi

Bandingkan lockfile sebelum/sesudah, audit ulang, kompilasi backend/frontend, tes frontend, tes HTTP/autentikasi/upload backend yang terkait, dan build produksi. Bandingkan CSS sebelum/sesudah override lalu periksa tampilan browser dengan API buatan. Pengujian tidak memakai akun, database, atau kamera nyata.

## Hasil

### Paket yang diperbarui

| Paket | Sebelum | Sesudah |
| --- | --- | --- |
| express | 4.22.2 | 4.22.3 |
| body-parser | 1.20.6 | 1.20.8 |
| proxy-addr | 2.0.7 | 2.0.8 |
| qs | 6.15.3 | 6.16.1 |
| ip-address | 10.7.0 | 10.7.4 |
| postcss-selector-parser | 6.1.4 | 7.1.6 |

Express dinaikkan batas minimumnya menjadi `^4.22.3`. Lima perubahan versi backend berada dalam rentang dependency yang didukung. Frontend menggunakan override `postcss-selector-parser: 7.1.6`; hasil kompilasi CSS dari source aplikasi sebelum/sesudah identik byte per byte (SHA-256 `d274328760df142082ce1ec9c12d953c5184741dc66bbeea57a1cda8d93e4ef7`). Lockfile sebelum tugas dibandingkan untuk memastikan hanya enam versi di atas yang berubah; perubahan frontend yang sudah ada sebelumnya tetap dipertahankan.

### Audit sesudah pembaruan

- **Backend: 0 temuan npm**, turun dari 5. Ini hasil database advisori npm saat diperiksa, bukan jaminan seluruh aplikasi bebas celah.
- **Frontend: 8 high**, turun dari 10 paket terdampak. Semua temuan tersisa berasal dari satu advisori `braces`, termasuk paket induk `micromatch`, `fast-glob`, `chokidar`, Tailwind dan konfigurasi ESLint. Tingkat severity paket induk dihitung ulang oleh npm; hasil sebelum/sesudah dilaporkan apa adanya.
- Registry resmi masih menunjukkan `braces` 3.0.3 sebagai versi terbaru pada 19 Oktober 2026. Tidak dilakukan `audit fix --force`, downgrade Next/ESLint, migrasi besar Tailwind, atau perubahan ambang audit. Tindak lanjutnya adalah memperbarui ketika patch upstream tersedia atau mengevaluasi migrasi toolchain secara terpisah.
- Pola berkas pada `tailwind.config.ts` berasal dari konfigurasi proyek. Jalur yang ditinjau memakai `braces` melalui toolchain build/lint, bukan input endpoint aplikasi. Ini membatasi konteks temuan, tetapi tidak menghilangkannya: hanya gunakan source/config yang dipercaya untuk proses build/lint.

### Verifikasi

- `npm.cmd run check` frontend: TypeScript, lint, dan **67/67 berkas tes lulus**; lint 0 error/0 warning.
- `npm.cmd run build` backend: lulus.
- **15/15 berkas tes backend terkait lulus**: autentikasi, pembatasan login, parsing HTTP/upload, error, profil, pendaftaran/reset password, bahasa, persetujuan, daftar proyek, rute fase, rute login kamera dengan layanan tiruan, dan timing.
- Ditambahkan tes regresi yang memeriksa penolakan pemalsuan IP lewat subnet proxy IPv6, keberhasilan proxy yang dikonfigurasi benar, serta pemisahan keluarga alamat IPv4/IPv6. Tes memuat dependency yang dipakai Express dan rate limiter.
- Percobaan awal runner salah menunjuk `routes/phase-route.test.ts`; lokasi sebenarnya `services/phase-route.test.ts`. Setelah jalur dibetulkan, tes itu lulus. Tidak ada perubahan aplikasi untuk menutupi kegagalan tes.
- Kompilasi CSS sebelum/sesudah identik. CLI Tailwind menampilkan informasi database Browserslist lama pada kedua percobaan; database tersebut tidak diperbarui dalam tugas keamanan ini.
- Build produksi frontend: lulus, tanpa error kompilasi/lint.
- Browser Chrome terisolasi: **8/8 pemeriksaan lulus** pada Projects/Documents, EN/ID, desktop/mobile. Angka selesai dan filter proyek, font lokal, batas lebar halaman, serta exception runtime diperiksa. Screenshot desktop dan mobile diperiksa secara visual.
- `git diff --check`: lulus.
- Server sementara port 3035 dihentikan setelah tes. `next start` memberi peringatan konfigurasi standalone yang sudah ada; server tes berhasil melayani halaman. Panduan deployment standalone tidak diubah dalam tugas ini.

Bukti lokal: `.cache/security-update-2026-10-19/` berisi salinan manifest/lockfile sebelum tugas, daftar perubahan versi, audit akhir, log tes, hasil browser, dan CSS pembanding. Screenshot ada di `.cache/frontend-rendering/`. Pengujian HTTP memakai layanan/database buatan; akurasi kamera dan akun produksi tidak diuji ulang. Perubahan belum di-commit atau di-push. Backend/frontend yang sudah berjalan sebelum pemasangan perlu dimulai ulang agar memakai dependency baru.

## Sumber

- [Perbaikan proxy-addr](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h)
- [Perbaikan selector parser](https://github.com/postcss/postcss-selector-parser/security/advisories/GHSA-rj75-hqrm-r3gf)
- [Laporan upstream braces yang belum memiliki rilis perbaikan](https://github.com/micromatch/braces/issues/70)
