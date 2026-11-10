# PIC SA tetap saat lanjut Submission Tender

Saat Sales melanjutkan Pra-Tender, PIC pada project dan fase Submission Tender tetap memakai PIC sebelumnya. Fase baru tetap DRAFT dan membutuhkan jadwal serta approval Head SA sendiri. Riwayat fase Pra-Tender dipertahankan.

Dialog approval pada project dan halaman Approvals otomatis mengisi nama PIC yang ada. Approval menerima PIC yang sama dan tetap memvalidasi status aktif/perannya. Approval ini tidak membuat penugasan PIC baru atau notifikasi penugasan ganda. Project baru tanpa PIC tetap membutuhkan pilihan PIC saat approval pertama.

Migration `phase42-carry-phase-pic.sql` diterapkan pada 5 November 2026. Definisi fungsi database diperiksa sebelum perubahan; baris riwayat lama tidak ditulis ulang. Activity baru memakai PIC_PHASE_CARRIED. Pemeriksaan data lama tidak menemukan project dengan fase Pra-Tender sebelumnya yang sedang DRAFT Submission Tender tanpa PIC; satu DRAFT Submission Tender tanpa fase Pra-Tender tidak diubah.

Validasi:
- Tes PostgreSQL sebelum dan sesudah penerapan: PIC project/fase terbawa, riwayat tetap, status DRAFT, transisi ulang tidak menduplikasi fase, approval PIC berbeda ditolak, approval PIC sama berhasil, milestone SA mendapat PIC, tidak ada assignment ganda. Fixture di-rollback.
- Typecheck backend/frontend dan lint terarah lulus.
- Tes service phase-plan-review dan project-phase lulus.
- Tes komponen project-review-dialogs dan pic-assignment-request mencakup PIC otomatis pada kedua dialog, note tetap bisa diisi, dan submit tanpa memilih PIC ulang; lulus.
- `git diff --check` lulus. Browser aktual belum terverifikasi karena localhost timeout/access failure meski dev server menyatakan ready. Harness `carried-pic-browser.cjs` disiapkan untuk pengujian ulang.
- Tidak melakukan commit/push.

## Tugas keputusan Sales setelah Pra-Tender selesai

Dashboard sebelumnya hanya memasukkan milestone belum selesai; keputusan Yes/No tidak terwakili setelah seluruh milestone Pra-Tender selesai. Kini Sales pemilik project mendapat tugas Tentukan kelanjutan Pra-Tender di bagian atas Task List. Tautan menuju panel keputusan project; klik kartu tidak otomatis memilih atau mengirim keputusan.

Syarat: project ACTIVE dan tidak postponed, fase aktif Pra-Tender berstatus COMPLETED, belum ada keputusan dan belum dibuat fase Submission Tender. Tugas hilang setelah keputusan atau perubahan fase. Tidak diberi deadline buatan dan tidak dimasukkan ke Priority Task berbasis deadline. Metadata status/keputusan fase dibaca server pada query dashboard.

Tes backend mencakup kondisi selesai/belum selesai, keputusan sudah tersimpan, fase lanjut sudah ada, project paused/closed, serta scope owner/role. Tes komponen memastikan tugas keputusan tampil di preview Task List meski tanpa deadline. Typecheck, lint terarah, tes dashboard phase-status dan service lulus. Pembacaan dashboard pada database aktif berhasil. Browser end-to-end belum terverifikasi karena Page.navigate timeout; harness sintetis tersedia di sales-phase-decision-browser.cjs. Tidak mengubah keputusan project nyata.
