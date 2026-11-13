# Perubahan project plan setelah approval

Sales membuka detail project aktif lalu memilih **Project plan changes → Request plan change**. Pilih output yang ditambah/dihapus dari katalog fase aktif, isi jadwal untuk output baru, lalu tuliskan alasan. Deadline baru dihitung server berdasarkan hari kerja dan hari libur.

Plan lama tetap berlaku selama pengajuan menunggu. Head SA menemukan pengajuan di **Approvals → Project plan changes**, membuka rinciannya, lalu menyetujui atau menolak. Penolakan wajib disertai alasan. Sales dapat membatalkan pengajuan yang belum direview, kemudian membuat pengajuan baru.

## Aturan

- Hanya pemilik Sales yang dapat mengajukan, dan hanya Head SA yang dapat approve/reject.
- Satu project hanya memiliki satu pengajuan pending.
- Perubahan menggunakan katalog output yang sudah tersedia. Milestone SA terkait dibuat/dihapus otomatis sesuai mapping katalog; fitur ini tidak membuat jenis milestone bebas di luar katalog.
- Output wajib tidak dapat dihapus. Milestone/output yang sudah dimulai, memiliki dokumen, versi, kontribusi, atau referensi riwayat lain tidak dapat dihapus. Pilihan yang jelas sudah memiliki pekerjaan dikunci di form. Server memeriksa ulang saat approval.
- Output baru tidak dapat ditambahkan ke milestone/fase yang sudah selesai. Tidak ada reset pekerjaan atau pembukaan ulang milestone selesai.
- Jadwal dan status item lama yang dipertahankan tetap berlaku. Perubahan jadwal lama memakai Request Deadline Change.
- Pengajuan menyimpan pilihan sebelum/sesudah, alasan, hasil review, dan snapshot internal. Activity serta notifikasi in-app/Telegram mencatat prosesnya sesuai pengaturan pengguna.
- Jika pekerjaan berjalan saat pengajuan menunggu, approval dapat ditolak oleh pengaman server. Sales dapat membatalkan pengajuan dan membuat pilihan yang diperbarui.
- Retry memakai request ID yang sama. Approval dan penerapan scope berlangsung dalam satu transaksi dengan lock project, sehingga tidak ada penerapan sebagian ketika gagal.

## Pemasangan dan pengujian

Jalankan `backend/supabase/phase46-approved-scope-changes.sql` satu kali setelah Phase 45, sebelum menjalankan backend/frontend versi ini. Migrasi menambahkan tabel pengajuan dan fungsi server; tidak mengubah scope project yang sudah ada.

```powershell
node backend/tests/run-ci.cjs project-scope-change
node backend/tests/run-ci.cjs approval-overview
python backend/tests/postgres/run_scope_changes.py
node frontend/tests/browser/scope-changes-browser.cjs
```

Tes PostgreSQL memakai database lokal terisolasi. Tes browser memakai akun dan API buatan; tidak mengubah project asli atau mengirim pesan nyata.
