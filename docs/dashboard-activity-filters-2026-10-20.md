# Filter Aktivitas terbaru — 20 Oktober 2026

Audit sebelum perubahan: panel sudah memakai paginasi server, tetapi belum dapat menyaring proyek, jenis aktivitas, atau tanggal. Filter harus diterapkan sebelum penghitungan total dan pengambilan halaman, tetap mengikuti akses akun, dan tidak mengambil seluruh riwayat ke browser.

Rencana: toolbar responsif untuk proyek, jenis aktivitas, dan periode (semua, hari ini, tujuh hari terakhir, tanggal pilihan), dengan Terapkan dan Reset. Pilihan proyek berasal dari cakupan akun. Menerapkan atau menghapus filter kembali ke halaman pertama; filter tetap berlaku saat pindah halaman dan bahasa. Halaman pertama tanpa filter tetap memakai dashboard yang sudah dimuat. Tidak ada migrasi atau perubahan data bisnis.

Implementasi: jenis aktivitas dikelompokkan menjadi perubahan proyek, milestone/tenggat, dokumen/unggahan, pengajuan/persetujuan, dan penugasan PIC. Satu aktivitas dapat masuk beberapa kelompok (misalnya persetujuan dokumen). Semua filter digabungkan dengan AND sebelum count dan pagination. Daftar proyek hanya memuat proyek dalam akses akun, termasuk yang belum punya aktivitas. Tanggal mengikuti hari kalender browser; tanggal akhir disertakan penuh. Rentang preset dihitung saat Terapkan ditekan.

Tampilan: toolbar berwarna netral, ikon kecil, label pilihan, penanda jumlah filter aktif, tombol Terapkan, Reset, jumlah hasil, dan pesan khusus jika tidak ada hasil. Pilihan tanggal muncul sebelum tombol Terapkan. Layout menyesuaikan ponsel dan desktop; bahasa Inggris tetap default, Indonesia tetap tersedia.

| Pemeriksaan | Hasil |
| --- | --- |
| Tes backend dashboard | 5 berkas lulus; mencakup gabungan filter, tanggal awal inklusif/akhir eksklusif, proyek di luar akses, count sebelum pagination, serta query tidak valid |
| Tes frontend dashboard | 6 berkas lulus; preset tanggal, validasi rentang, draft/Terapkan/Reset, cache filter, pagination, akun, dan bahasa |
| Tes kamus bahasa | 1 berkas lulus |
| Tes fixture browser | 6 tes lulus |
| Browser filter | 6 skenario lulus: EN/ID × 360/390/1440 px, hasil 9 aktivitas/2 halaman, kosong/error/retry, reset dan akun berubah |
| Regresi shortcut paginasi | 4 skenario lulus: EN/ID × 360/1440 px |
| TypeScript frontend/backend, lint frontend, build frontend/backend | Lulus |

Screenshot desktop dan ponsel diperiksa. Label judul toolbar dipersingkat agar penanda aktif tidak terpotong pada ponsel 360 px; hasil akhir ponsel diperiksa ulang. Bukti lokal di `.cache/activity-filters-2026-10-20/` dan log `.cache/activity-filter-*.log`. Pengujian memakai akun/API buatan dan backend dengan fixture; bukan uji ulang database Supabase asli. Tidak ada migrasi, commit, atau push.
