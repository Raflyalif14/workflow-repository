# Panduan database

Database menyimpan lebih dari daftar proyek: ada versi dokumen, persetujuan, riwayat, notifikasi, dan pencatatan permintaan. Banyak tabel bukan berarti ada banyak fitur yang terlihat oleh pengguna.

## Peta tabel

Pemeriksaan metadata API pada **15 Oktober 2026** menemukan **45 tabel/view yang diekspos**. Daftar ini bukan inventaris seluruh schema internal Supabase; schema Auth dan Storage juga dikelola Supabase. Pemeriksaan hanya membaca nama objek, tanpa membaca isi data pengguna atau mengubah database.

| Kelompok | Nama tabel/view | Kegunaan |
| --- | --- | --- |
| Akun dan alur proyek | `users`, `projects`, `scenarios`, `workflow_stages`, `project_phases`, `project_milestones`, `project_assignments`, `holidays` | Akun, fase, pekerjaan, penugasan, dan kalender. |
| Persetujuan dan riwayat | `project_plan_approvals`, `milestone_deadline_approvals`, `milestone_deadline_history`, `milestone_initiation_approvals`, `activity_logs` | Persetujuan rencana/jadwal dan rekam perubahan. Initiation approvals masih dibaca sebagai riwayat lama. |
| Dokumen kerja/output | `output_document_stage_catalog`, `project_output_documents`, `project_output_document_versions`, `project_output_document_files`, `project_output_document_version_files`, `project_output_file_revisions`, `milestone_contributions`, `milestone_contribution_attachments`, `project_intake_attachments` | Jenis output, versi, berkas, lampiran kontribusi, dan bukti awal proyek. |
| Repository resmi dan akses | `documents`, `document_versions`, `document_version_approvals`, `document_comments`, `document_repository_access`, `document_repository_grants`, `project_document_sharing` | Dokumen resmi beserta versi, review, komentar, dan akses. |
| Notifikasi | `notifications`, `notification_preferences`, `notification_deliveries`, `telegram_link_tokens`, `output_notification_outbox` | Pesan, pilihan penerima, pengiriman, dan antrean yang perlu diproses. |
| Pengaman proses dan pengulangan permintaan | `artifact_mutation_requests`, `document_repository_access_requests`, `project_business_requests`, `project_creation_requests`, `project_creation_files`, `project_document_sharing_requests`, `project_output_document_draft_requests`, `project_output_document_draft_files`, `project_output_review_requests`, `project_pic_requests`, `project_deletion_cleanups` | Mencatat operasi agar pengulangan permintaan tidak membuat hasil ganda, serta melacak berkas yang perlu ditangani setelah kegagalan. |

Tabel pengaman tetap diperlukan meskipun tidak punya menu sendiri. Sebagian dibaca/ditulis oleh fungsi SQL, bukan langsung oleh kode backend. Tabel kosong juga belum tentu tidak digunakan.

Tiga tabel lama (`milestone_submission_packages`, `milestone_submission_attachments`, `milestone_approvals`) tidak muncul pada metadata API yang diperiksa. Ini sesuai arah pensiun alur submission lama di Phase 18; metadata API saja tidak membuktikan bahwa objek tersebut sudah dihapus dari seluruh schema.

## Cara membaca berkas SQL

| Jenis | Fungsi |
| --- | --- |
| `phase*.sql` dengan nama fitur | Perubahan struktur/fungsi dari tahap tertentu. Bukan file yang perlu dijalankan setiap hari. |
| `*-preflight.sql` | Pemeriksaan sebelum perubahan terkait. Baca isinya dan petunjuk tahap tersebut. |
| `*-verify.sql` | Pemeriksaan hasil sesudah perubahan terkait. |
| `*-diagnostics.sql`, `*-diagnosis.sql` | Pemeriksaan masalah tertentu. |
| [workflow-healthcheck.sql](workflow-healthcheck.sql) | Pemeriksaan umum struktur dan konsistensi workflow; baca hasilnya sebelum memilih tindak lanjut. |

Ada 82 berkas SQL pada audit ini. Nama dan lokasi dipertahankan karena dipakai dokumentasi, tes, dan urutan perubahan. **Jangan menjalankan semuanya berdasarkan urutan nama, dan jangan mengulang migrasi lama hanya karena filenya masih ada.**

## Kelompok perubahan

| Tahap | Pokok perubahan |
| --- | --- |
| 1–11 | Fondasi proyek, pengguna, workflow, repository, notifikasi, serta perubahan alur awal. |
| 12–18 | Output dokumen, revisi, notifikasi, bahasa, dan pensiun pengajuan milestone lama. Phase 18 memisahkan perluasan schema dan penghapusan alur lama. |
| 19–23 | Pilihan output, perbaikan notifikasi, kumpulan berkas, dan pencatatan upload. |
| 24–28 | Fase proyek, keputusan Pra-Tender, nilai proyek, penugasan PIC, dan revisi berkas. |
| 29–34 | Akses dokumen, audit perubahan, pencatatan pembuatan proyek, berbagi dokumen, perbaikan submit, dan mutasi dokumen resmi. |
| 35 | Pekerjaan milestone paralel, bukti (evidence) hasil akhir Sales WON/LOST, guard tanggal mulai, dan penyesuaian katalog dokumen wajib On Submission Tender. |

Panduan pelaksanaan masing-masing fitur ada di [indeks dokumentasi](../../docs/README.md). Snapshot metadata ini tidak membuktikan semua migrasi telah diterapkan dengan benar; audit ini tidak menjalankan migrasi atau menghapus data.
