# Nomor halaman Recent activity — 20 Oktober 2026

Audit singkat: panel saat ini memakai cursor Next/Previous, menampilkan nomor halaman tanpa total, dan tidak dapat langsung melompat. Hitungan tidak boleh dibuat dari delapan baris yang sedang tampil atau dari aktivitas seluruh akun.

Perubahan: hitung seluruh aktivitas dalam cakupan proyek akun, tetap kecualikan audit akses dokumen privat, tampilkan Page X of Y / Halaman X dari Y, serta tambahkan kolom Ke halaman dan tombol untuk melompat. Halaman pertama tetap memakai respons dashboard; halaman lain diminta langsung dari server. Endpoint cursor lama tetap didukung. Tidak ada migrasi atau perubahan data.

Cara pakai: di bagian bawah Aktivitas terbaru, ketik nomor pada kolom **Ke halaman**, lalu tekan **Enter** atau **Buka**. Tombol Sebelumnya/Berikutnya tetap tersedia. Bahasa Inggris menampilkan **Page X of Y**, **Go to page**, dan **Go**. Total mengikuti aktivitas terbaru, sehingga posisi baris dapat berubah saat ada aktivitas baru.

Hasil pemeriksaan:

| Pemeriksaan | Hasil |
| --- | --- |
| Backend dashboard | 5 berkas tes lulus: total 0/8/9/17/24, lompat langsung, batas halaman, empat peran, pencabutan akses, audit privat, total hilang/error, serta kompatibilitas cursor lama |
| Frontend dashboard | 5 berkas tes lulus: nomor/total, input tidak valid, lompat tanpa halaman perantara, total menyusut, loading/error/retry, cache sesi, dan bahasa |
| Fixture browser | 5 tes lulus |
| Browser produksi | 4 skenario lulus: EN/ID × 360/1440 px; Enter, Next/Previous, batas input, tombol saat loading, retry, pergantian akun, serta tidak ada overflow horizontal |
| TypeScript frontend/backend, lint frontend, dan build frontend/backend | Lulus |

Screenshot desktop Inggris dan ponsel Indonesia diperiksa. Bukti lokal tersedia di `.cache/activity-pagination-2026-10-20/` serta log `.cache/activity-*.log`. Seluruh tes memakai data buatan; belum menguji ulang data Supabase akun asli. Tidak ada commit atau push.
