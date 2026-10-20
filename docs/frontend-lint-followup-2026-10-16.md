# Perapian peringatan frontend - 16 Oktober 2026

## Audit singkat

Ada 33 peringatan: dependency Hook, referensi saat cleanup, gambar kamera sementara, dan font root layout. Risiko utama: menambah dependency fungsi yang berubah setiap render dapat membatalkan kamera berulang kali; mereset formulir PIC saat data server berubah dapat menghilangkan konteks konfirmasi konflik; menghapus dependency bahasa tanpa menyesuaikan perhitungan dapat membuat label tidak ikut berganti bahasa.

## Perubahan yang dituju

Stabilkan fungsi pembatalan kamera dan scope sesi; pertahankan pembatalan saat logout/unmount. Hitung label memakai bahasa aktif. Ambil snapshot PIC saat pengguna membuka dialog. Tinjau gambar sementara dan font sesuai cara pemakaiannya. Pertahankan aturan bisnis dan data yang sudah ada. Jalankan lint, TypeScript, tes yang relevan, suite penuh, dan build setelah perubahan.

## Hasil

### Perubahan

- Pembatalan kamera login/tes dan polling notifikasi memakai callback stabil. Perubahan tampilan biasa tidak memulai ulang siklus tersebut.
- Dependency data proyek, output, dashboard, dan sesi dilengkapi. Ringkasan dan tanggal yang diterjemahkan dihitung saat render agar tetap mengikuti perubahan bahasa.
- Snapshot PIC diambil saat tombol pembuka dialog ditekan. Refetch tidak mengubah revisi yang sedang dikonfirmasi maupun menghapus isian. Konfirmasi rencana tetap mengacu pada ID target yang dipilih pengguna.
- Cleanup perbandingan wajah dan catatan eksperimen memakai pembatalan/request serta koleksi yang sesuai dengan siklusnya. Tes tetap memeriksa respons terlambat, logout, unmount, serta pemisahan akun.
- Pratinjau foto memakai `next/image` dengan `unoptimized`, ukuran asli, dan pemuatan langsung. URL blob tetap lokal dan tidak dikirim ke layanan optimasi gambar. Tes markup memeriksa perilaku tersebut.
- Font Plus Jakarta Sans tetap dipakai, kini dibundel dengan `next/font/local`. Font asli 176.288 byte, lisensi OFL, sumber, dan SHA-256 disimpan di `frontend/src/app/fonts/`. Build dan halaman tidak membutuhkan Google Fonts. Root build ditetapkan secara eksplisit untuk repository ini.
- Ditambahkan tes siklus bahasa: pembaruan profil biasa tidak mengulang permintaan bahasa; logout menghentikan status loading; respons akun lama tidak menimpa bahasa akun berikutnya. Mock Hook pada tes kamera/pengaturan/dashboard disesuaikan untuk callback yang stabil.

### Verifikasi akhir

| Pemeriksaan | Hasil |
| --- | --- |
| `npm.cmd run check` dari frontend | Lulus: TypeScript, lint, dan **66/66 berkas tes**. |
| ESLint | **0 error, 0 warning**; aturan produksi tidak dimatikan. |
| `npm.cmd run build` | Lulus, 23 halaman statis, tanpa peringatan lint/font/root. |
| Chrome dengan API tiruan | **8/8**: Projects/Documents, EN/ID, lebar 1440/390 px. Label berubah, font lokal termuat, tanpa overflow halaman, tanpa exception runtime dan endpoint tiruan yang tidak dikenali. |
| Screenshot | Desktop Projects dan mobile Documents diperiksa; teks, kontrol, dan kartu terlihat utuh. Bukti lokal di `.cache/frontend-rendering/`. |
| `git diff --check` | Lulus. |

Percobaan suite pertama mendapat 65/66 karena mock tes pengaturan belum menyediakan `useCallback`; setelah harness diperbaiki, suite penuh lulus 66/66. Chrome awalnya timeout di sandbox; pengulangan di luar sandbox berhasil berjalan, lalu fixture status kamera yang belum terdaftar dilengkapi sebelum hasil 8/8 dicatat. Tidak ada endpoint produksi atau kamera nyata yang dipakai.

Ini verifikasi frontend dan data tiruan, bukan pengujian ulang akurasi Face ID atau otorisasi database. Audit dependency 10 paket dari pekerjaan sebelumnya belum ditangani pada perapian lint ini. Belum commit/push; konfigurasi CI baru belum dijalankan di GitHub.

### Rujukan

Pola dependency/cleanup mengikuti [panduan Effect React](https://react.dev/learn/removing-effect-dependencies). Pengaturan gambar dan font mengikuti [Next.js 15 Image](https://nextjs.org/docs/15/app/api-reference/components/image) dan [Next.js 15 Font](https://nextjs.org/docs/15/app/api-reference/components/font).
