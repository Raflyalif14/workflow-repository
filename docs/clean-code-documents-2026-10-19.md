# Perapian kode Documents - 19 Oktober 2026

## Audit singkat

Halaman Documents memiliki 576 baris dan dialog rincian/komentar 526 baris. Halaman memuat koordinasi query, filter, pilihan dokumen, unduh, dan dua jenis baris hasil. Dialog mencampurkan informasi utama, riwayat versi, dan komentar. Pemetaan nama kategori dokumen juga ditulis dua kali.

Penggabungan dokumen resmi/output, filter, pagination, dan status pemuatan sudah terpusat di `document-repository.ts`; aturan tersebut tetap dipakai. Session key, pemeriksaan akses saat retry, penggunaan versi output yang disetujui untuk unduh, dan penyembunyian rincian saat akses ditolak perlu dipertahankan.

## Rencana perubahan

- Pisahkan baris dokumen resmi dan output ke modul komponen daftar.
- Pisahkan tampilan versi terbaru/riwayat versi dari koordinasi dialog komentar dan unduh.
- Satukan label kategori di helper tampilan dokumen yang sudah ada, dengan internal key dan terjemahan tetap sama.
- Jalankan tes terkait, seluruh pemeriksaan frontend, build terpisah dari development, dan browser dengan akun/API buatan untuk filter, akses, versi, dan kegagalan unduh.

Tidak ada perubahan endpoint, database, file dokumen asli, model wajah, staging, commit, atau push. Perubahan sebelumnya tetap dipertahankan.

## Hasil

Selesai. Halaman Documents berkurang dari 576 menjadi 375 baris, dan dialog rincian/komentar dari 526 menjadi 370 baris. Kode tampilan dipindahkan ke komponen sesuai tanggung jawabnya, bukan dihapus fiturnya.

- `document-repository-rows.tsx`: baris dokumen resmi dan output beserta statusnya.
- `document-versions.tsx`: versi terbaru, riwayat versi, dan tombol unduh versi.
- `document-surface-ux.ts`: satu pemetaan nama kategori yang dipakai halaman dan dialog.

Filter, pagination, query, deep link, komentar, aturan akses, serta pemilihan versi unduhan tetap memakai alur sebelumnya. Perbandingan lima fungsi halaman/baris menunjukkan isi fungsi tetap sama setelah memperhitungkan pemindahan dan perubahan nama helper kategori.

## Verifikasi

- Tes terkait dokumen: 10/10 berkas lulus.
- `npm.cmd run check --prefix frontend`: lint, pemeriksaan TypeScript, dan 68/68 berkas tes lulus.
- Build produksi terpisah: berhasil, 23 halaman dibangkitkan dan keluaran standalone tersedia.
- Browser Chrome: 24 skenario lulus untuk empat role, bahasa Inggris/Indonesia, dan lebar 1440/390 px. Meliputi filter/pagination, rincian versi, dokumen berbagi tanpa akses proyek, permintaan unduh versi yang tepat, akses ditolak, gagal memuat, coba lagi, dan hasil kosong.
- Dua tangkapan layar rincian dokumen diperiksa: desktop bahasa Inggris dan tampilan sempit bahasa Indonesia.
- `git diff --check` dan pemeriksaan whitespace berkas baru lulus. Tidak ada berkas yang di-stage; HEAD tetap sama.

Bukti lokal tersedia di `.cache/clean-code-documents/`: `check.log`, `build.log`, `function-parity.json`, serta `browser/results.json` dan tangkapan layar. Cara menjalankan tes browser dicatat di `frontend/tests/browser/README.md`.

Tes browser menggunakan akun dan respons API buatan. Tes ini memeriksa perilaku frontend serta permintaan unduh, bukan otorisasi server, file Storage asli, atau isi ZIP. Tidak ada perubahan data bisnis maupun pengujian unggah/komentar pada akun asli. Tidak ada commit atau push.
