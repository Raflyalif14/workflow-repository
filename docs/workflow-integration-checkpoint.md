# Checkpoint integrasi dan rollout

## Bukti dan baseline

Pemeriksaan repository: `main / 1347244f21b4007fa6e6e239172b579790408969`, index kosong, 201 dirty paths sebelum edit (101 modified tracked, 100 untracked). Snapshot hash+bytes disimpan di temporary folder di luar repo. Tidak ada AGENTS.md ditemukan pada repo/ancestor.

Phase 24-31 **dilaporkan diterapkan manual**, bukan diverifikasi live oleh agent. Tidak ada SQL, migrasi, business RPC, upload, cleanup, mutation akun/proyek atau pengiriman notifikasi live dilakukan. Port lokal expected 3000/5000 tidak memiliki listener saat pemeriksaan; browser/session/database live tidak diperiksa. File schema, guards, calls, permissions dan panduan existing ditelusuri; ini bukan pengganti observasi server target.

## Temuan terkonfirmasi dan patch kecil

### 1. Cache repository/search/statistik sesudah penghapusan

Lokasi: `frontend/src/hooks/use-projects.ts`, `useDeleteProject.onSuccess`. Sebelumnya hanya `documents`, `approvals` dan Dashboard diinvalidate; repository output memakai key `output-documents/repository`, global search memakai `global-search`, dan approval stats memakai `approval-stats` yang tidak berada di bawah prefix tersebut.

Dampak: hasil Approved dan pencarian proyek terhapus serta angka approval dapat tetap cached sampai refresh lain. Endpoint download tetap memeriksa akses/keberadaan; ini tidak membuka izin baru.

Perbaikan: invalidate tiga key existing itu sesudah delete berhasil. Success dengan cleanup PENDING tetap berarti metadata proyek sudah dihapus. Error delete tidak menghapus cache atau mengklaim berhasil. HTTP method/body, role, policy cleanup dan endpoint tetap sama.

Bukti test: actual hook dengan QueryClient dan HTTP mock; query detail/milestone/progress terhapus, official/output/search/approvals/stats/Dashboard diinvalidate; error 503 mempertahankan state dan tidak otomatis replay.

### 2. Loop create worker usang setelah receipt COMMITTED

Lokasi: `backend/src/services/project-creation.service.ts`, loop START_FILE/STORED_FILE. SQL Phase 31 dapat mengembalikan COMMITTED untuk operasi yang sudah diselesaikan worker lain, setelah verifikasi actor/payload/current ownership. Service sebelumnya mengabaikan respons itu.

Jalur konkret: objek upload pertama sudah diterima tetapi respons tertunda; lease expired; worker baru memverifikasi exact bytes dan menyelesaikan receipt; worker lama menerima respons lalu meneruskan descriptor PENDING lamanya. `upsert:false` melindungi objek existing dari overwrite, tetapi tidak mencegah percobaan transfer tambahan oleh loop lama.

Perbaikan: langsung kembalikan ID proyek bila START_FILE atau STORED_FILE melaporkan COMMITTED. Tidak ada perubahan SQL/aturan lease/receipt, actor, payload, hash, bucket, path, metadata, atau kompensasi.

Bukti test: deferred response dan lease takeover pada fixture RPC/Storage terisolasi. Implementasi terbaru menghasilkan tiga transfer untuk tiga file, satu proyek dan satu audit. Kontrol negatif melepas guard hanya dalam memori; test gagal dengan lima percobaan versus tiga yang diharapkan. Tidak ada file source di-restore atau data live dipakai. Ini membuktikan regresi service; belum membuktikan scheduler/locking PostgreSQL live.

## Titik integrasi yang ditelusuri

| Area | Bukti kode yang ada | Batas verifikasi |
| --- | --- | --- |
| Auth/replay | `api-client.ts`: refresh single-flight per session, satu replay saat AUTH_TOKEN_INVALID, body/header asli, account/session late-response guard; `auth-provider.tsx` clears QueryClient on logout/session change; repository keys include account/session | Tidak ada automatic network/5xx mutation retry pada jalur ini. Tidak menjalankan seluruh test auth ulang; belum memverifikasi lintas tab live |
| Fase/PIC | Phase 24-27 project/phase identity, lock, expected revision dan private plan core; service memakai current scenario; Dashboard projection join active phase dan proyek berpaginasi lengkap | SQL diterapkan hanya menurut laporan operator; legacy classification bukan auto-backfill dan perlu keputusan manual |
| Snapshot/review | Phase 22/28 immutable refs, version/file FK, request receipts dan marker gate; service memeriksa current expected snapshot; output review queue memvalidasi snapshot refs dan role | Tidak membuat UI/status baru. Fencing/concurrency dan transaksi real tetap memerlukan fixture DB terisolasi |
| Repository | `DocumentAccessService` dipakai official/output/download/ZIP; search memakai layanan repository; grants tidak menjadikan project_access true; non-native/Sales dibatasi approved current results | Pencabutan diperiksa pada request baru. Signed URL yang sudah diterbitkan tetap memiliki TTL existing 300 detik; ini bukan immediate revocation terhadap URL lama |
| Storage/create/deletion | Registry/FK dan exact-path guards Phase 22-23 dipertahankan; output uncertainty PENDING tidak eligible untuk retry; cleanup FAILED memakai endpoint existing dan exact removeMany; create uses stable paths/fence and no compensation delete | Tidak membuktikan object existence/reference protection di Storage live. Abandoned UPLOADING tetap butuh reconciliation; tidak dibuat auto-reupload/cleanup baru |
| Audit/cache | Phase 26/27/29/30 audit+receipt berada dalam transaksi/wrapper; private cores tetap dibutuhkan SQL; output mutations invalidate repository/Dashboard/Approvals; deletion cache regression diperbaiki | Audit resmi/comment atau legacy paths di luar coverage existing tidak direfactor. Tidak mengklaim seluruh audit bisnis selesai |

Tidak ada kebutuhan schema/policy baru yang diterapkan dalam sesi ini. Keberadaan fungsi, jumlah nol, permission yang tampak cocok atau HTTP 200 tidak membuktikan seluruh implementasi berjalan benar.

## Healthcheck dan panduan

- Entry point: [workflow-rollout.md](workflow-rollout.md). Panduan Phase historical tetap utuh dan hanya dibaca untuk detail khusus.
- [workflow-healthcheck.sql](../backend/supabase/workflow-healthcheck.sql): satu statement/result set; kolom `check_name,status,observed,expected`; 47 count queries tetap yang dijaga schema/type/full-read-visibility; RPC/core permissions, RLS, triggers, unique identity indexes, relasi/snapshot/receipt/audit dan queue aggregates.
- Missing table/kolom/signature ditangani introspeksi, bukan cast eager atau unconditional table SELECT. Reader RLS terfilter tidak dianggap nol sah. Nilai counts saja yang dikeluarkan; tidak ada teks pengguna/recipient/hash/Storage path atau business RPC.
- Batas: parser/PostgreSQL terisolasi tidak tersedia dan SQL sengaja tidak dieksekusi. Static schema fixtures menguji coverage/branch yang diharapkan, bukan planning/evaluation PostgreSQL. Built-in XML support dibutuhkan; jangan ada DDL bersamaan ketika operator menjalankan query. Schema drift lain, isi body RPC, security behavior dan locking masih perlu pemeriksaan runtime terisolasi.

## Validasi yang benar-benar selesai

- `rollout-healthcheck.test.ts`: lulus; SELECT-only/dynamic-count guards, schema/visibility fixtures, empty/legacy/lease/tombstone/historical delivered-error cases.
- `project-creation-receipts.test.ts`: lulus setelah guard worker committed; kontrol negatif sebelum fix gagal sesuai regresi yang diuji.
- `project-deletion-cache.test.tsx`: lulus, terdaftar sekali di runner frontend explicit. Runner backend menemukan test `.test.ts` otomatis.
- Backend/frontend `tsc --noEmit`: lulus; backend diulang sesudah perubahan service, frontend yang sudah lulus tidak diulang tanpa perubahan relevan.
- Strict UTF-8 dan `git diff --check`: dicatat pada laporan akhir setelah semua dokumen stabil.
- Full build/full suite, database/Storage/browser UAT: tidak dijalankan. Bukti targeted existing yang masih relevan tidak diulang mekanis.

## File pekerjaan ini

Extended: `frontend/src/hooks/use-projects.ts`, `frontend/package.json`, `backend/src/services/project-creation.service.ts`, `backend/src/services/project-creation-receipts.test.ts`.

New: `frontend/src/lib/project-deletion-cache.test.tsx`, `backend/src/services/rollout-healthcheck.test.ts`, `backend/supabase/workflow-healthcheck.sql`, `docs/workflow-rollout.md`, dokumen ini.

Langkah terkecil berikutnya: review dan jalankan **satu healthcheck read-only** secara manual sebagai administrator terverifikasi; tangani FAIL/MISSING, klasifikasikan NEEDS_REVIEW, lalu lakukan fixture dua-instance create/lease dan akses revoke di lingkungan terisolasi. Jangan reapply Phase 24-31 hanya karena query healthcheck belum pernah dijalankan.

## Checkpoint akhir Git dan preservasi

Strict UTF-8 seluruh dirty text dan `git diff --check` lulus. Dari 201 dirty paths awal, 197 identik byte-for-byte; empat diperluas sesuai manifest di atas; tidak ada yang dihapus. Semua 24 file SQL Phase 24-31 tetap identik. Lima file baru ditambahkan oleh pekerjaan ini.

Git akhir: `main / 1347244`, staging kosong; 101 modified tracked + 105 untracked = 206 dirty paths. Tidak ada stage/commit/push/reset/restore/SQL atau perubahan data live.
