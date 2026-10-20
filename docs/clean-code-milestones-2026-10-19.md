# Perapian kode Milestones - 19 Oktober 2026

## Audit singkat

Halaman `frontend/src/app/milestones/page.tsx` memiliki 325 baris. Pengambilan data, filter/tab, ringkasan jumlah, dan tampilan kedua antrean masih berada dalam satu berkas. JSX pada baris tugas dan review terlalu padat. Import `getIntlLocale` dan prop `isHeadSa` pada baris tugas tidak digunakan.

Aturan klasifikasi sudah terpusat di `assigned-milestone-ux.ts` dan memiliki tes untuk pekerjaan aktif, ditunda, output campuran, review, dan selesai. Aturan tersebut tetap dipakai. Komponen kontribusi merupakan bagian detail proyek, sehingga tidak ikut diubah pada tahap ini.

## Perubahan yang dituju

- Pisahkan tampilan antrean tugas dan review ke satu modul komponen Milestones. Tampilan loading, error, dan kosong tetap bersama komponen tersebut.
- Halaman utama tetap mengatur query sesuai role, tab, ringkasan, dan filter. Rapikan JSX dan hapus import/prop yang terbukti tidak terpakai.
- Sesuaikan tes halaman agar memeriksa baris dan tautan yang dirender, bukan bergantung pada susunan komponen internal. Lengkapi pemeriksaan akses dan antrean review Head SA.
- Jalankan pemeriksaan frontend dan build terpisah dari development, lalu tes browser dengan API/akun buatan.

Tidak ada perubahan database, API, model wajah, commit, atau push. Perubahan detail proyek dari tahap sebelumnya dipertahankan.

## Hasil

Selesai untuk halaman Milestones. File halaman utama berkurang dari **325 menjadi 222 baris**. Tampilan antrean dipindahkan ke `frontend/src/components/milestones/milestone-queues.tsx` (149 baris), dengan JSX yang lebih mudah dibaca dan feedback loading/error/kosong yang tetap digunakan bersama.

Import `getIntlLocale` dan prop baris `isHeadSa` yang tidak terpakai sudah dihapus. Query, endpoint, urutan tab, label EN/ID, tautan, hitungan ringkasan, dan aturan klasifikasi tidak diubah. Pengujian `assigned-work-page.test.tsx` sekarang mengecek hasil render dan tautan, serta mencakup empat role dan kegagalan data tugas/review yang terpisah.

Validasi:

- `npm.cmd run check --prefix frontend`: typecheck, lint, dan **68/68 berkas tes lulus**.
- Build produksi pada salinan source terpisah berhasil, termasuk 23 halaman dan startup server standalone. Folder build development asli tidak digunakan oleh tes ini.
- **24/24 skenario browser lulus**: 16 kombinasi empat role, EN/ID, desktop 1440 px dan HP 390 px; ditambah delapan kondisi error/kosong untuk SA/Head SA dalam dua bahasa. Loading juga diperiksa saat respons tes sengaja diperlambat.
- Seluruh tab, angka ringkasan, tautan milestone/output, pekerjaan campuran, pekerjaan ditunda, pekerjaan selesai, serta query sesuai role diperiksa. Tidak ada error runtime, permintaan API tak dikenal, atau mutasi data bisnis.
- Dua screenshot diperiksa. Tampilan terbaca tanpa overflow halaman; baris tab HP tetap dapat digeser sesuai tampilan sebelumnya.
- `git diff --check` lulus. Tidak ada staging, commit, atau push.

Bukti lokal: `.cache/clean-code-milestones/` (diabaikan Git). Petunjuk menjalankan browser test tersedia di `frontend/tests/browser/README.md`.

Tes browser menggunakan akun/API buatan. Hasilnya memverifikasi perilaku frontend, bukan otorisasi backend atau data produksi. Tahap ini tidak mencakup perapian halaman Approvals.
