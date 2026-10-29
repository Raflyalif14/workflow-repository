# Panduan dokumen proyek

Mulai dari daftar ini; tidak perlu membaca seluruh folder. Berkas tes, gambar, dan laporan eksperimen tetap disimpan sebagai bukti pekerjaan.

| Kebutuhan | Buka |
| --- | --- |
| Struktur aplikasi dan cara menjalankan | [README utama](../README.md) |
| Penyesuaian workflow, milestone paralel, dan bukti outcome | [Workflow 22-29 Oktober 2026](workflow-requirements-2026-10-22.md) |
| Dukungan tema gelap (Dark mode) | [Dark mode 22 Oktober 2026](dark-mode-2026-10-22.md) |
| Penyelarasan ringkasan dashboard dan pipeline | [Ringkasan dashboard 22 Oktober 2026](dashboard-summary-alignment-2026-10-22.md) |
| Hasil pemeriksaan dan perapian terbaru | [Audit 20 Oktober 2026](workspace-cleanup-2026-10-20.md), [arsip source lama](workspace-cleanup-2026-10-15.md) |
| Pemeriksaan otomatis frontend dan perbaikan pesan | [Hasil tes 16 Oktober 2026](frontend-testing-2026-10-16.md) |
| Pemeriksaan backend saat push ke GitHub | [Tes backend otomatis](backend-ci-2026-10-20.md) |
| Penyelesaian peringatan frontend | [Lint bersih dan tes lanjutan](frontend-lint-followup-2026-10-16.md) |
| Hitungan proyek selesai dan filter Won | [Koreksi ringkasan proyek](project-completed-counter-fix-2026-10-16.md) |
| Halaman dan filter Aktivitas terbaru | [Paginasi aktivitas dashboard](dashboard-activity-pagination-2026-10-20.md), [filter proyek/jenis/tanggal](dashboard-activity-filters-2026-10-20.md) |
| Pembaruan keamanan paket dan temuan tersisa | [Audit dependency 19 Oktober 2026](dependency-security-update-2026-10-19.md) |
| Respons klik menu dan loading halaman | [Indikator navigasi](navigation-feedback-2026-10-19.md), [pembaruan data halaman](navigation-refresh-feedback-2026-10-20.md) |
| Perapian kode halaman detail proyek | [Pemisahan komponen dan tes regresi](clean-code-project-detail-2026-10-19.md) |
| Perapian kode halaman Buat Proyek | [Validasi, anti-duplikasi, dan modularitas](clean-code-project-create-2026-10-19.md) |
| Perapian kode halaman Daftar Proyek | [Pemisahan logika format dan komponen baris](clean-code-project-list-2026-10-19.md) |
| Perapian kode halaman Milestones | [Antrean tugas dan review](clean-code-milestones-2026-10-19.md) |
| Perapian kode halaman Approvals | [Daftar dan dialog persetujuan](clean-code-approvals-2026-10-19.md) |
| Perapian kode halaman Documents | [Daftar dokumen dan riwayat versi](clean-code-documents-2026-10-19.md) |
| Perapian kode halaman Dashboard | [Ringkasan, prioritas tugas, dan panel proyek](clean-code-dashboard-2026-10-19.md) |
| Perapian kode halaman Pengguna | [Manajemen akun dan modal form](clean-code-users-2026-10-19.md) |
| Memahami tabel dan berkas SQL | [Panduan database](../backend/supabase/README.md) |
| Membuat dan memeriksa cadangan | [Cadangan manual](manual-backup.md) |
| Memahami Face ID secara singkat | [Laporan login wajah](laporan-login-wajah-ringkas-2026-10-14.md) |
| Cara kerja login sekali tatap | [Login sekali tatap](face-single-glance-login-2026-10-14.md) |
| Pengaturan pendaftaran dan browser | [Pengaturan wajah](face-settings-ux-2026-10-14.md), [daftar browser](face-device-management-2026-10-15.md) |
| Alur fase proyek | [Fase proyek berurutan](sequential-project-phases-rollout.md), [keputusan Pra-Tender](pra-tender-sales-decision-rollout.md) |
| Penugasan PIC | [Penugasan PIC](atomic-pic-assignment-rollout.md) |
| Dokumen hasil pekerjaan dan revisinya | [Kumpulan berkas output](output-file-collections-rollout.md), [revisi berkas](output-file-revisions-rollout.md), [antrean review](output-review-queue.md) |
| Akses dan pembagian dokumen | [Akses repository](document-repository-access-rollout.md), [berbagi dokumen proyek](project-document-sharing-rollout.md) |
| Pencatatan perubahan dokumen | [Mutasi dokumen resmi](official-artifact-atomic-audit-rollout.md) |

## Membaca catatan lama

- `face-verification-stage*`, `face-pad-*`, dan folder gambar terkait berisi tahapan eksperimen. Hasil tahap awal bukan status model/login terbaru.
- Dokumen `phase-*`, `*-audit`, dan `*-rollout` menjelaskan kondisi pada tahap penulisannya. Ikuti tanggal, batas pengujian, dan bagian hasil verifikasinya.
- [Audit SA September](sa-output-milestone-audit.md) dan [UAT Phase 10A](phase-10a-uat.md) dipertahankan sebagai riwayat, bukan panduan alur terkini.
- `archive/unused-source-2026-10-15.zip` adalah cadangan sembilan file kode lama yang dikeluarkan dari source aktif. Daftar serta alasannya ada di audit perapian.
