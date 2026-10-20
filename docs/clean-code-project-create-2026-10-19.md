# Perapian halaman Buat Proyek - 19 Oktober 2026

## Audit singkat

Halaman Buat Proyek berisi 727 baris, mencampur koordinasi penyimpanan, validasi, informasi proyek, pilihan skenario/output, lampiran, dan checklist.

Pencegahan kiriman ganda sudah tersedia melalui penguncian dialog konfirmasi, penggabungan permintaan yang sedang berjalan, dan ID pembuatan yang dipakai kembali saat retry. Form dikunci setelah konfirmasi untuk mempertahankan isi permintaan jika respons server belum pasti. Mekanisme tersebut perlu dipertahankan.

Kekurangan terkait: kegagalan memuat skenario belum menampilkan error/retry; skenario yang sudah hilang dari daftar masih dapat dianggap terpilih; pesan nilai pendapatan kosong tidak konsisten dengan validasi akhir; checklist belum memeriksa angka tak hingga.

## Rencana

- Pisahkan informasi proyek, skenario/output, lampiran, dan checklist dari koordinasi halaman.
- Satukan validasi, perjelas error skenario dan nilai pendapatan, pertahankan isi form saat retry.
- Uji validasi, file, konfirmasi, klik berulang, dan pengulangan permintaan dengan data simulasi.
- Jalankan pemeriksaan frontend, build terpisah, browser, serta tes terkait alur proyek yang tidak memakai database asli.

Perubahan sebelumnya dipertahankan. Tidak ada staging, commit, push, atau migrasi. Pengujian memakai data buatan.

## Hasil

1. **Pemisahan Bagian Form (Clean Code & Modularitas)**:
   - Header halaman diisolasi ke [`ProjectCreateHeader`](file:///d:/Workflow%20Repository%20System/frontend/src/components/projects/project-create-header.tsx) lengkap dengan breadcrumb/back navigation dan disable state.
   - Panel aksi bawah diisolasi ke [`ProjectCreateActions`](file:///d:/Workflow%20Repository%20System/frontend/src/components/projects/project-create-actions.tsx), menaungi tombol submit/cancel, status receipt retry saat form terkunci, serta alert pesan error.
   - Komponen form per bagian ([`ProjectCreateDetails`](file:///d:/Workflow%20Repository%20System/frontend/src/components/projects/project-create-details.tsx), [`ProjectCreateScenario`](file:///d:/Workflow%20Repository%20System/frontend/src/components/projects/project-create-scenario.tsx), [`ProjectCreateAttachments`](file:///d:/Workflow%20Repository%20System/frontend/src/components/projects/project-create-attachments.tsx), [`ProjectCreateChecklist`](file:///d:/Workflow%20Repository%20System/frontend/src/components/projects/project-create-checklist.tsx)) distrukturkan ulang menggunakan interface TypeScript yang rapi dan terdokumentasi.

2. **Validasi, Pesan Error, dan Tanda Proses Penyimpanan**:
   - Validasi ketat untuk nama proyek, customer, keaktifan skenario, format pendapatan numerik non-negatif, file MoM PDF, foto bukti, dan lampiran dokumen.
   - Ditambahkan visual loading spinner (`Loader2 animate-spin`) pada tombol submit saat proses penyimpanan berlangsung dan pada tombol konfirmasi modal [`BusinessConfirmation`](file:///d:/Workflow%20Repository%20System/frontend/src/components/projects/business-confirmation.tsx).
   - Penanganan error terpusat dengan i18n banner dan inline accessibility feedback (`aria-invalid`, `aria-describedby`).

3. **Pencegahan Klik Berulang (Anti Duplicate Project Creation)**:
   - Guard multi-layer:
     - Layer UI: `isSubmitting.current` ref dan `create.isPending` memblokir pemanggilan fungsi submit berulang secara sinkron sebelum re-render.
     - Layer Dialog: Tombol konfirmasi dan cancel didisable saat `pending`, modal dicegah tertutup secara prematur saat transfer berjalan.
     - Layer Hook: `createProjectCreateRequest` menggabungkan promise konkruen (`if (pending) return pending`) dan menyematkan header idempotent `x-project-create-request-id`.
     - Layer Pasca-sukses: `createdProjectId.current` mengunci pengiriman ulang saat menunggu navigasi router.

4. **Pengujian dengan Data Simulasi**:
   - Tes frontend terkait bagian berikut lulus:
     - Buat Proyek (`project-create-form.test.tsx`, `project-create-request.test.tsx`)
     - Penugasan PIC (`pic-assignment-request.test.tsx`)
     - Milestone & Timeline (`project-milestone-progress.test.ts`)
     - Persetujuan Rencana & Dokumen (`project-review-dialogs.test.tsx`, `approval-queue.test.ts`, `approval-queue-ui.test.tsx`)
     - Penyelesaian Proyek (`project-list-completion.test.tsx`, `workflow-ux-helpers.test.ts`)
   - Pada review 20 Oktober 2026, seluruh 69 file tes frontend telah lulus. Run pertama menghasilkan 68/69; satu tes HTTP terhalang izin koneksi lokal dan lulus setelah diulang dengan izin yang sesuai.
   - Pemeriksaan tipe frontend/backend, lint frontend, dan build produksi pada salinan terpisah lulus.
   - Sebanyak 16 kasus browser lulus untuk form proyek, daftar proyek/dokumen, dan pengguna dalam bahasa Indonesia/Inggris serta ukuran desktop/mobile. Seluruh API browser memakai data simulasi.
   - Hasil ini belum membuktikan satu alur lengkap Buat Proyek → PIC → Milestone → Approval → Selesai melalui database dan penyimpanan asli.

## Koreksi review — 20 Oktober 2026

Penanganan error deadline dikembalikan agar hanya mempercayai kelas error yang dikenal. Error lain yang kebetulan bernama sama tetap menghasilkan pesan umum; detail teknis disimpan di log server. Tes regresi ditambahkan untuk penyimpanan dan penolakan perubahan deadline, termasuk memastikan error bisnis yang valid tetap terbaca.

Empat file tes backend terkait, pemeriksaan tipe backend, dan pemeriksaan format perubahan lulus setelah koreksi. Tes memakai data simulasi tanpa mengubah database asli.

