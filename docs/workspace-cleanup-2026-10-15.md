# Pemeriksaan dan perapian aplikasi — 15 Oktober 2026

## Batas pemeriksaan

Audit kode, hubungan import, berkas SQL, dan dokumentasi. Ini bukan pengujian seluruh halaman atau bukti bahwa aplikasi bebas bug. Perubahan lain yang sudah ada tetap dipertahankan. Perubahan indikator perpindahan halaman ditunda sesuai permintaan.

Inventaris awal: 486 berkas TypeScript, termasuk 173 berkas tes; 82 berkas SQL; 277 berkas di docs termasuk gambar dan bukti eksperimen. Jumlah berkas tidak sama dengan jumlah fitur atau tabel aktif.

## Kode lama yang diarsipkan

Graf import dari titik masuk aplikasi, dilanjutkan pencarian nama komponen/fungsi dan jalur import, tidak menemukan pemakaian aktif untuk sembilan berkas berikut. Hook assignment hanya dipakai dua dialog lama dalam daftar ini.

| Berkas | Alasan |
| --- | --- |
| frontend/src/components/assignments/assign-pic-dialog.tsx | Tidak dipanggil; penugasan memakai pic-assignment-card pada halaman proyek. |
| frontend/src/components/assignments/assignment-history-dialog.tsx | Tidak dipanggil oleh halaman aktif. |
| frontend/src/hooks/use-assignments.ts | Hanya dipakai dua dialog lama di atas; penugasan aktif melalui use-projects. |
| frontend/src/components/navbar.tsx | Tidak dipanggil; kerangka aplikasi memakai AppShell. |
| frontend/src/components/projects/create-project-dialog.tsx | Tidak dipanggil; pembuatan proyek memakai halaman projects/new. |
| frontend/src/components/projects/milestone-timeline.tsx | Tidak dipanggil oleh halaman aktif. |
| frontend/src/lib/supabase.ts | Klien browser tidak dipakai; frontend mengakses backend API. |
| frontend/src/schemas/workflow.schema.ts | Schema formulir lama tidak dipakai. |
| backend/src/services/official-document-promotion.service.ts | Service lama tidak dipanggil; mutasi dokumen resmi aktif memakai artifact-mutation.service dan RPC mutate_official_artifact. |

Salinan asli disimpan dalam `archive/unused-source-2026-10-15.zip`, disertai manifest jalur dan SHA-256. Ekstrak ke folder sementara untuk meninjau atau memulihkan berkas tertentu; jangan menimpa perubahan baru secara massal.

`pic-assignment-notification.service.ts` dan `test-utils/repository-access.fixture.ts` tetap dipertahankan karena dipakai tes. Pencarian statis tidak dapat membuktikan semua bentuk pemakaian dinamis, sehingga hasilnya juga diperiksa dengan kompilasi.

## Database dan berkas pendukung

- Terdapat 32 nama tabel yang diakses langsung dan 18 nama RPC pada inventaris kode. Tabel tambahan dapat dipakai RPC, trigger, kebijakan akses, dan relasi database.
- Tidak ada tabel atau data pengguna yang dihapus, tidak ada migrasi yang dijalankan.
- Metadata Supabase berhasil dibaca: 45 tabel/view diekspos melalui API. Tiga nama tabel submission lama tidak muncul. Ini bukan pemeriksaan seluruh schema, isi data, kebijakan akses, atau bukti semua migrasi sudah benar.
- SQL lama tetap di lokasi asal karena berisi riwayat perubahan dan beberapa tes membaca jalur tersebut. Panduan ada di [indeks database](../backend/supabase/README.md).
- `.private` menyimpan data lokal sensitif Face ID; `.cache` juga memuat runtime/model yang digunakan. Keduanya bukan kandidat hapus massal.
- Tes dan bukti eksperimen dipertahankan. Dokumentasi lama diberi penanda agar tidak disalahartikan sebagai alur terbaru.
- Explorer VS Code lokal menyembunyikan dependency, hasil build, dan cache melalui `.vscode/settings.json`. File aslinya tetap ada; hapus aturan `files.exclude` bila ingin menampilkannya kembali. Pengaturan ini lokal karena folder `.vscode` diabaikan Git.
- Contoh environment frontend hanya mencantumkan API backend; dua variabel untuk klien Supabase browser lama dikeluarkan karena tidak dipakai.

## Hal yang masih perlu diperhatikan

- Ditemukan tes Phase 18 yang membandingkan 17 output historis dengan 10 output Pra-Tender fase baru. Tes diperbaiki agar memakai definisi kompatibilitas proyek lama dan mendeteksi kunci duplikat. SQL dan aturan aplikasi tidak diubah.
- Perintah tes umum frontend memakai `tsx`, tetapi paket tersebut belum terpasang lokal. ESLint juga belum terpasang. Tes frontend terkait audit dijalankan melalui runner sementara dengan `ts-node` yang sudah tersedia; ini tidak berarti seluruh perintah tes/lint sudah siap.
- Perpindahan halaman belum memberi tanda yang cukup jelas menurut laporan pengguna; perbaikannya ditunda.
- Hasil uji Face ID yang sudah ada bersifat pengujian lokal, belum membuktikan keamanan untuk semua kondisi kamera/pencahayaan.
- Panduan migrasi membantu membaca struktur, tetapi tidak menggantikan pemeriksaan kondisi database sebelum perubahan schema.

## Validasi

- Arsip: sembilan file asli diverifikasi SHA-256 dari isi ZIP sebelum sumber dikeluarkan.
- TypeScript frontend dan backend: lulus.
- Tes backend terkait: artifact-mutation, document-lifecycle, phase18-retirement-guards, dan pic-assignment-atomic lulus. Tes PIC memakai server localhost dan database tiruan; bukan mutasi database nyata.
- Tes frontend terkait: pic-assignment-request dan project-create-request lulus melalui runner sementara.
- Graf import setelah perapian: 477 file TypeScript, 173 tes tetap ada, dan 303 modul yang terjangkau dari titik masuk runtime tetap sama. Dua kandidat tersisa adalah pendukung tes yang sengaja dipertahankan.
- Pemeriksaan metadata database: berhasil, hanya membaca daftar nama tabel/view dan endpoint fungsi.
- Build produksi, seluruh suite tes/lint, pengujian semua halaman di browser, serta pemeriksaan isi/relasi/RLS database langsung tidak dilakukan pada audit ini.
