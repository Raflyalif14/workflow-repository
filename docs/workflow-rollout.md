# Panduan rollout utama Workflow Repository System

## Status dan cara membaca bukti

Baseline pemeriksaan: `main / 1347244f21b4007fa6e6e239172b579790408969`; staging kosong; 201 dirty paths sebelum pekerjaan ini. Seluruh patch existing dipertahankan.

**Phase 24-31 dilaporkan sudah diterapkan manual oleh pengguna.** Agent belum menjalankan SQL, mendeteksi objek live, atau menguji perilaku database/Storage live. Panduan Phase lama mencatat status pada sesi pembuatannya; kalimat "belum diterapkan" di sana bukan ledger deployment terbaru. Test mock/statis tidak mengubah status menjadi verified live.

Tiga tingkat bukti berbeda:

1. **Dilaporkan diterapkan**: keterangan operator, bukan pembacaan database.
2. **Objek terdeteksi**: signature, kolom, trigger, permission/index ditemukan oleh healthcheck manual. Ini belum membuktikan body RPC/transaction benar.
3. **Perilaku diuji**: actor fixtures dan concurrency/failure diuji pada database/Storage terisolasi, dengan bukti hasilnya. Tabel kosong bukan bukti retry berfungsi.

## Mulai dari sini: satu pemeriksaan manual

Jalankan sekali [workflow-healthcheck.sql](../backend/supabase/workflow-healthcheck.sql) sebagai administrator database terverifikasi, tanpa DDL berjalan bersamaan. Hasilnya satu result set: `check_name, status, observed, expected`. Jangan memasukkan service key/credential ke browser atau aplikasi client.

- **PASS**: invariant katalog/count tersebut cocok; bukan jaminan seluruh sistem aman.
- **FAIL**: mismatch teramati atau kontrak permission tidak cocok; hentikan writer terkait dan investigasi.
- **MISSING**: table/kolom/signature/trigger/index/role tidak ada. Jangan langsung menjalankan ulang migrasi.
- **NEEDS_REVIEW**: legacy classification, pekerjaan operasional bermasalah, type drift, atau visibilitas baca tidak lengkap.
- **NEEDS_RUNTIME_CHECK**: perilaku tidak dapat dibuktikan oleh query read-only, termasuk lease aktif yang sah dan antrean kosong.

Query memakai introspeksi katalog lalu built-in `query_to_xml` untuk **SELECT count(*) tetap** yang telah diperiksa dependency-nya. Tidak ada DO block, helper database, temporary object, mutation RPC, signed URL, data penerima, isi notifikasi, hash file atau Storage path dalam hasil. Query ini membutuhkan PostgreSQL dengan built-in XML support, seperti lingkungan Supabase yang menjadi target aplikasi. Dukungan XML/kompilasi query pada server target belum diuji oleh agent.

Pembacaan data hanya dilakukan bila seluruh table/kolom yang dipakai hadir, tipe JSON sesuai, grant SELECT ada dan visibilitas penuh terbukti (superuser/BYPASSRLS atau owner yang tidak dipaksa RLS). Reader yang terfilter RLS menghasilkan NEEDS_REVIEW, bukan nol palsu. Jalankan sebagai admin terverifikasi; jangan menonaktifkan RLS. Tidak ada output data bisnis mentah, meskipun perbandingan referensi internal diperlukan untuk menghitung mismatch.

## Database existing versus instalasi baru

**Existing:** kumpulkan catatan apply operator lalu cocokkan objek melalui healthcheck. Phase 27/28/30 mengganti signature/wrapper/core; hilangnya nama RPC lama kadang memang diharapkan. Preflight historical adalah pemeriksaan sebelum apply, bukan skrip healthcheck setelah apply. Jangan mengulang Phase 22/23 karena guard teks body publiknya tidak lagi cocok: Phase 30 menyimpan body asli di private core.

**Baru/kosong:** jangan menjalankan Phase 24 sebagai schema bootstrap. Baseline schema Supabase dan chain historical melalui Phase 23 harus tersedia lebih dahulu. Penyusunan baseline/squash database baru adalah pekerjaan lanjutan; tidak dibuat di sesi ini. Tidak ada script auto-apply atau replay semua Phase.

## Dependency dan kontrak deployment

| Phase | Dependency / objek utama | Kontrak yang harus cocok |
| --- | --- | --- |
| Prasyarat | Schema aplikasi, katalog Phase 19, diagnostics/outbox Phase 20-21, collections Phase 22, outcomes Phase 23; retirement 18b | Multi-file snapshot/receipt, private bucket dan exact paths; outbox worker menggunakan diagnostics terbaru |
| 24 | Phase 23, katalog canonical 10/7, dua scenario Operational V2; `project_phases`, active/current identity dan phase FK/triggers | Scope dan timeline per fase; existing tetap LEGACY_REVIEW; current scenario terpisah dari initial scenario |
| 25 | Phase 24, status COMPLETED, preferences/delivery | Sales Continue/Close memakai satu project lock; kanal in-app/Telegram independen |
| 26 | activity log dan `estimated_revenue numeric(18,2)` | Estimasi owner Sales, CAS/retry UUID, audit atomik; final contract tetap outcome WON |
| 27 | Phase 24-26; `pic_revision`, assignment phase, PIC receipts dan private review core | Plan+PIC atomik; `expected_pic_revision` dan request UUID; PIC historical tidak ditimpa |
| 28 | Phase 22-27; file revision markers/review receipts | `expected_version_id`, request UUID, feedback per file; old review writer/core tidak boleh dipakai langsung |
| 29 | Phase 28, document versions, protected activity access | Repository grants tidak memberi akses proyek/audit; ACL manager-only; private receipt dan restrictive audit policies |
| 30 | Phase 24-29 dan Phase 23; business receipts/audit, wrapper/core boundaries | Business request UUID+reviewed timestamp; audit+write dalam transaksi; service tidak boleh memanggil private cores |
| 31 | Phase 24-30; creation receipt/file manifest | Header `x-project-create-request-id` wajib; lease 10 menit/fencing; Storage di luar transaksi, metadata+receipt success atomik |

Jika benar-benar ada Phase yang belum diterapkan: selesaikan prasyarat, gunakan preflight **Phase yang belum dipasang** dan panduan rinci terkait, kemudian apply hanya Phase missing berurutan. Kegagalan healthcheck permission/data tidak otomatis berarti migrasi missing. Jangan mengedit atau mengulang migrasi applied untuk menutup drift.

## Writer dan worker saat deployment

- Phase 24: maintenance seluruh project/phase/scope/timeline/output/plan writers; jangan campur writer model lama dan fase baru.
- Phase 27: drain PIC, plan review dan Continue writers lama. Core review Phase 24 privat tetap dipanggil oleh wrapper SQL, bukan endpoint service.
- Phase 28: drain output submit/review writers lama; mereka tidak memakai receipt/marker gate baru.
- Phase 29: tahan writer ACL serta reader repository versi lama selama cutover policy/list/detail/download. Jangan memperluas proyek sebagai pengganti grant dokumen.
- Phase 30: drain business/project/output/scope/completion/deletion writers lama. Wrapper menggunakan private core yang sengaja masih ada.
- Phase 31: drain **semua old create writers** dan request upload aktif sebelum cutover. Client lama tanpa UUID mendapat 422; jangan menghasilkan UUID pengganti di server. Backend/frontend harus di-deploy terkoordinasi.
- Prasyarat outbox Phase 20-21: pause worker terkait ketika fungsi delivery diganti, resume hanya setelah apply/verification. Jangan memanggil delivery RPC untuk "healthcheck": itu menulis antrean. Worker output retry normal setiap 60 detik; Telegram delivery tetap memakai policy existing. Backend restart dapat langsung memulai worker, jadi kontrol lifecycle deployment.

Setelah seluruh instance memakai kontrak baru dan checks wajib sesuai, buka kembali writer terkait. Jangan menjalankan writer lama yang masih dapat melewati wrapper/receipt, dan jangan memberi kembali EXECUTE kepada core untuk membuat binary lama bekerja.

## Apply gagal / hasil belum pasti

1. Hentikan writer terkait dan simpan kode error/operasi aman. Jangan tampilkan raw payload, credential atau paths.
2. Batalkan transaksi deployment yang masih gagal melalui kontrol SQL editor/operator, lalu periksa objek memakai healthcheck. Jangan menganggap error berarti semua tahap sudah rollback, terutama bila editor memecah batch.
3. Bila tidak ada objek baru dan operator memastikan rollback penuh, apply **file lengkap Phase tersebut yang benar** setelah review. Bila sebagian objek terdeteksi, jangan DROP atau replay otomatis; investigasi drift dan siapkan perbaikan lanjutan terpisah.
4. Error Phase 31 CASE/THEN sudah diperbaiki menjadi `IS DISTINCT FROM (CASE ... END)` di file repository aktual. Keberadaan RPC saja tidak membuktikan target menggunakan body terbaru.
5. Jangan menghapus/menandai delivered job atau membersihkan Storage untuk menenangkan healthcheck. UPLOADING yang belum pasti memerlukan exact-object reconciliation dan writer fencing; tidak boleh reset menjadi PENDING atau upload ulang atas dasar timeout.

## Pemeriksaan wajib versus opsional

**Wajib sebelum membuka writer:** semua objek/permission/trigger/unique identity yang dipakai aplikasi tersedia; mismatch relasi/snapshot/receipt/audit yang terdeteksi diselesaikan; setiap LEGACY_REVIEW mengikuti policy declared; backend/frontend terbaru; test risiko pada fixture terisolasi untuk transaksi/actor/retry. Hasil NEEDS_REVIEW operasional tidak disembunyikan, tetapi inventory legacy atau antrean pending yang sah bukan otomatis mismatch/failure.

**Pemeriksaan runtime terisolasi yang tetap diperlukan:** account switch/logout saat request berjalan; Continue versus Close; plan approval+PIC rollback; review snapshot usang/per-file revision; list/search/detail/download/ZIP dan revoke; create dua instance, lease expiry, lost commit response dan uncertain upload; audit failure rollback. Gunakan fixture non-live, jangan membuat data produksi untuk UAT.

**Opsional / diagnosis lanjutan:** query preflight/verify Phase rinci bila satu check belum menjelaskan masalah, timing development opt-in, dan detail monitoring SUPER_ADMIN existing. Jangan menjalankan banyak query secara mekanis. Schema bootstrap baru, recovery administratif intake abandoned, serta baseline legacy classification adalah pekerjaan terpisah.

## Recovery rinci (baca hanya bila relevan)

- [Fase dan legacy classification](sequential-project-phases-rollout.md)
- [Keputusan Sales Pra-Tender](pra-tender-sales-decision-rollout.md)
- [Assignment/plan PIC atomik](atomic-pic-assignment-rollout.md)
- [Collections dan outcome Storage Phase 22-23](output-file-collections-rollout.md)
- [Review per file Phase 28](output-file-revisions-rollout.md)
- [Repository ACL Phase 29](document-repository-access-rollout.md)
- [Audit/wrapper Phase 30](business-audit-rollout.md)
- [Receipt create Phase 31 dan keterbatasan recovery](project-creation-receipts-rollout.md)
- [Laporan integrasi sesi ini](workflow-integration-checkpoint.md)

Built-in XML mapping dijelaskan dalam [dokumentasi PostgreSQL](https://www.postgresql.org/docs/16/functions-xml.html#FUNCTIONS-XML-MAPPING). Sumber tersebut menjelaskan fungsi pembacaan query, bukan membuktikan healthcheck ini sudah dieksekusi pada database target.
