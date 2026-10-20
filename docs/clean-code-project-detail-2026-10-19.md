# Perapian kode detail proyek — 19 Oktober 2026

## Audit singkat dan batas

Halaman `frontend/src/app/projects/[id]/page.tsx` berisi sekitar 2.200 baris. Halaman menggabungkan pengambilan data, koordinasi tindakan proyek, baris milestone, dialog deadline/persetujuan, riwayat, dan lampiran awal. Fungsi-fungsi tersebut masih dipakai; dipisahkan menurut tugasnya, bukan dihapus.

Pekerjaan dibatasi pada halaman ini dan komponen/tes yang langsung terkait. Kode halaman tetap mengoordinasikan proyek; komponen menangani tampilan dan formulir masing-masing. Nama `ReviewDialog` diperjelas menjadi `DeadlineReviewDialog` karena satu-satunya jenis yang didukung adalah deadline. Import yang tidak lagi digunakan setelah pemisahan dibersihkan. Aturan bisnis, akses role, API, database, terjemahan, dan perilaku konfirmasi tetap dipertahankan.

Komponen rencana, milestone, riwayat dan lampiran ditempatkan bersama komponen proyek yang sudah ada. Formatter tampilan bersama dipusatkan agar tidak disalin ke setiap komponen. Tidak ada penghapusan tabel, migrasi, penggantian model wajah, staging, commit, atau push.

## Pemeriksaan yang direncanakan

- Bandingkan isi fungsi sebelum/sesudah pemindahan untuk memastikan tidak ada logika yang hilang.
- Periksa kompilasi, lint, dan tes frontend. Sesuaikan tes yang sebelumnya mencari kode pada satu file agar mengikuti komponen baru.
- Tes perilaku konfirmasi deadline dan persetujuan rencana: alasan penolakan, PIC, pending, serta penolakan data yang sudah berubah.
- Uji halaman detail di browser dengan akun/API buatan untuk role terkait, bahasa EN/ID dan ukuran desktop/HP. Pengujian tidak menyentuh akun/data asli.
- Hindari konflik `.next` dengan development: gunakan salinan source/build khusus pengujian bila proses development sedang aktif.

## Hasil

Tahap pertama selesai. File halaman utama berkurang dari 2.206 menjadi 747 baris. Kode dipindahkan ke tujuh berkas komponen proyek dan satu berkas formatter bersama; total fungsi aplikasi tetap dipertahankan. Tujuannya memudahkan pencarian dan pemeliharaan kode, bukan menjanjikan peningkatan kecepatan aplikasi.

| Bagian | Lokasi baru |
| --- | --- |
| Riwayat aktivitas | `frontend/src/components/projects/project-activity-timeline.tsx` |
| Lampiran awal proyek | `frontend/src/components/projects/project-intake-section.tsx` |
| Ringkasan rencana dan langkah berikutnya | `frontend/src/components/projects/project-plan-summary.tsx` |
| Baris milestone | `frontend/src/components/projects/project-milestone-row.tsx` |
| Pengajuan dan review deadline | `frontend/src/components/projects/milestone-deadline-dialogs.tsx` |
| Review rencana proyek | `frontend/src/components/projects/project-plan-review-dialog.tsx` |
| Label status proyek | `frontend/src/components/projects/project-status-badge.tsx` |
| Format tanggal dan rupiah | `frontend/src/lib/project-detail-format.ts` |

Pemeriksaan selesai:

- Isi 17 fungsi sebelum/sesudah pemindahan cocok setelah normalisasi akhir baris dan penggantian nama `ReviewDialog`. Aturan di dalam fungsi tidak diubah.
- `npm.cmd run check --prefix frontend`: typecheck, lint, dan **68/68 berkas tes lulus**. Tes baru mencakup validasi deadline, dua langkah konfirmasi, kiriman ganda, data persetujuan yang berubah, pilihan/konflik PIC, serta alasan penolakan dalam EN/ID.
- Build produksi pada salinan terpisah berhasil, termasuk pembuatan 23 halaman dan paket standalone. Peringatan izin junction Windows pada build awal sudah diatasi di lingkungan tes; build akhir tanpa peringatan tersebut dan server standalone berhasil dijalankan.
- **18/18 skenario browser lulus pada build standalone akhir**: empat role (SALES, SA, HEAD_SA, SUPER_ADMIN), EN/ID, layar 1440/390 px, serta dua skenario pembatalan review rencana. Bagian lampiran/riwayat, buka-tutup milestone, tombol sesuai role, validasi alasan, dan lebar halaman diperiksa. Tidak ada error runtime, API tak terduga, atau perubahan data proyek dari tes ini.
- Screenshot desktop dan HP diperiksa; tata letak terbaca tanpa halaman melebar ke samping. `git diff --check` lulus.

Log dan bukti lokal berada di `.cache/clean-code-project-detail/` (diabaikan Git). Cara mengulang tes browser tercantum di `frontend/tests/browser/README.md`.

Pengujian browser memakai akun dan respons API buatan. Hasil ini memverifikasi frontend terkait, bukan pengujian ulang database, otorisasi backend, login wajah, atau semua alur bisnis dengan data asli. Refactor seluruh aplikasi belum dilakukan; lingkup tahap ini hanya halaman detail proyek dan bagian yang langsung terkait. Commit dan push tetap dilakukan pengguna.
