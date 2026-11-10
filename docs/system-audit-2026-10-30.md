# Audit sistem — 30 Oktober 2026

## Ringkasan

Pemeriksaan dilakukan terhadap source dan perubahan lokal terbaru, tes otomatis, metadata database langsung, konfigurasi lokal yang disaring, serta status paket backup. Tidak mengubah kode aplikasi, transaksi database, konfigurasi rahasia, atau commit/push.

Temuan terpenting adalah ketidaksesuaian editor jadwal per dokumen dengan penyimpanan server dan parser nominal. Tes yang lulus belum membuktikan kedua alur baru ini benar.

## Temuan yang perlu diprioritaskan

### 1. Jadwal per dokumen belum tersimpan secara konsisten — tinggi

- Editor menampilkan baris per dokumen, tetapi rincian jadwal disimpan di `localStorage` dengan key proyek, bukan sebagai jadwal dokumen di database. Browser/perangkat lain hanya dapat membangun ulang jadwal dari milestone server.
- Saat beberapa dokumen memakai milestone yang sama, request server mengambil tanggal paling awal dan durasi terbesar. Kombinasi itu tidak selalu mencakup dokumen yang mulai lebih lambat.
- Reproduksi dari blok agregasi source saat ini: dua dokumen dalam satu milestone, masing-masing mulai **2 November 2026 / 2 hari** dan **10 November 2026 / 2 hari**, menghasilkan payload server **2 November 2026 / 2 hari**. Jadwal dokumen kedua tidak terwakili.
- Cache lokal diperbarui sebelum request server berhasil. Jika request gagal, cache itu dapat dibaca ulang sebagai nilai tersimpan, meskipun server belum menerima perubahan.

Bukti: [cache dan pemetaan jadwal](../frontend/src/components/projects/project-timeline-editor.tsx#L35), [penyimpanan dan agregasi](../frontend/src/components/projects/project-timeline-editor.tsx#L245), [kontrak server hanya per milestone](../backend/src/validators/project-plan.validator.ts), [penerapan timeline di backend](../backend/src/services/project-plan-approval.service.ts#L243).

Tindak lanjut: tentukan penyimpanan resmi jadwal dokumen di server bila memang jadwal per dokumen dibutuhkan; hitung rentang milestone dari tanggal mulai hingga tanggal selesai paling akhir menggunakan kalender kerja; perbarui cache hanya setelah penyimpanan terkonfirmasi. Tambahkan regresi untuk dua dokumen bertanggal berbeda, gagal simpan, browser lain, dan fase proyek.

### 2. Parser nominal menghilangkan tanda desimal — tinggi

- Parser/formatter baru menghapus semua karakter selain digit, sedangkan validasi dan kontrak backend masih menerima desimal.
- Reproduksi: `parseRupiahInput('1500.50')` menjadi `'150050'`; `formatRupiahInput(1500.5)` menghasilkan `'15.005'`. Nilai yang sudah benar dapat berubah besarannya ketika ditampilkan/diedit.
- Ini bukti kasus input sintetis; audit tidak menyatakan data nominal yang sudah tersimpan telah berubah.

Bukti: [parser dan formatter](../frontend/src/lib/project-create-validation.ts#L5), [nilai server dengan desimal](../backend/src/validators/project-management.validator.ts#L51).

Tindak lanjut: sepakati apakah nominal rupiah bulat atau dua desimal, lalu samakan parser, formatter, validasi, draft, dan payload. Jangan diam-diam menghapus tanda desimal. Tambahkan kasus nilai lama, input berpemisah ribuan, dan nominal besar.

### 3. Tes backend belum seluruhnya lulus — sedang

- Hasil lokal: **107/108 file tes CI lulus**, satu gagal pada `legacy-cleanup.test.ts` karena tes mewajibkan `docker-compose.yml` tidak ada.
- File Compose sekarang berisi layanan aplikasi backend/frontend dan dipakai dalam README. Karena itu kegagalan ini menunjukkan aturan tes yang tidak lagi cocok dengan struktur baru; bukan bukti bahwa alur proyek rusak.
- Workflow GitHub menjalankan suite yang sama. Jangan menutupinya dengan menghapus tes atau menandai semua kegagalan sebagai aman; perbarui pemeriksaan agar tetap menolak infrastruktur lama yang memang sudah dipensiunkan.

Bukti: [assertion lama](../backend/src/services/legacy-cleanup.test.ts#L35), [Compose aplikasi](../docker-compose.yml), [workflow CI backend](../.github/workflows/backend-checks.yml).

### 4. Jalur deployment Docker frontend perlu diselaraskan — sedang, sebelum deployment

- `outputFileTracingRoot` menunjuk direktori induk proyek. Next menaruh standalone server menurut path relatif terhadap direktori tracing itu.
- Artefak build lokal menunjukkan `.next/standalone/frontend/server.js`, sedangkan Dockerfile menyalin seluruh isi standalone lalu menjalankan `node server.js` pada root `/app`.
- Pada builder Docker, project directory `/app` dan tracing root `/` menghasilkan subdirektori `app/server.js`; jalur server dan static assets perlu diselaraskan sebelum mengandalkan image tersebut.
- Compose juga mengunci API browser ke `http://localhost:5000/api`. Itu alamat lokal pengguna browser, sehingga perlu diganti/diatur sebelum dipakai dari komputer lain.
- Tidak ada Docker image/container yang dibangun atau dijalankan dalam audit ini. Temuan jalur diturunkan dari konfigurasi, artefak build yang tersedia, dan implementasi generator standalone Next yang terpasang.

Bukti: [tracing root](../frontend/next.config.ts), [copy standalone dan CMD](../frontend/Dockerfile#L34), [alamat API Compose](../docker-compose.yml).

### 5. Backup baru dan uji pemulihan belum terbukti — sedang

- Paket backup penuh terbaru yang ditemukan di folder lokal bertanggal **16 Oktober 2026**, berstatus `CAPTURED_NOT_RESTORE_TESTED`.
- Paket lain pada hari itu hanya parsial. Metadata tersebut tidak membuktikan salinan eksternal atau backup yang mungkin disimpan di tempat lain.
- Backup sudah dapat diambil dan diuji integritasnya, tetapi belum ada bukti pemulihan aplikasi penuh pada lingkungan terpisah. Perubahan setelah paket itu tidak otomatis tercakup.

Bukti: status paket lokal yang dibaca tanpa dekripsi, [panduan backup dan hasil terakhir](manual-backup.md#L73).

Tindak lanjut: ambil backup baru setelah checkpoint yang disepakati, simpan salinan di media terpisah dengan pengelolaan key yang sesuai, lalu lakukan restore drill pada database/Storage pengujian. Jangan melakukan restore percobaan ke aplikasi aktif.

### 6. Kesiapan pemakaian di luar laptop masih perlu dilengkapi — batas operasional

- Konfigurasi SMTP lokal terdeteksi sebagai sandbox, sehingga email ke inbox pengguna nyata belum dikonfirmasi. Tidak ada email yang dikirim dalam audit.
- URL aplikasi masih menunjuk localhost.
- Face ID secara eksplisit hanya diaktifkan pada `NODE_ENV=development`. Pada production, fungsi akan mengembalikan disabled meski flag diaktifkan. Ini pembatasan yang disengaja, bukan permintaan untuk membukanya tanpa validasi.
- Delapan tes backend yang bergantung Python/model lokal dikecualikan dari CI. Hasil tes Node tidak mengukur performa biometrik/PAD. Audit ini tidak mengambil wajah baru atau mengganti model.

Bukti: pemeriksaan konfigurasi tersaring (hanya boolean), [gate Face ID](../backend/src/services/face-login.service.ts#L26), [pengecualian tes](../backend/tests/ci-exclusions.cjs), [batas pengujian kamera](face-single-glance-login-2026-10-14.md).

## Yang sudah terkonfirmasi berjalan

- **Frontend:** typecheck, ESLint, dan **79/79 file tes** lulus.
- **Backend:** typecheck lulus; **107/108 file tes CI** lulus; **8 file** membutuhkan lingkungan terpisah dan tidak dihitung lulus.
- **Database sekarang berbeda dari catatan lama:** metadata menunjukkan `start_parallel_milestone`, `complete_final_sales_with_evidence`, `mutate_project_outcome_with_evidence`, serta tabel evidence sudah tersedia. Katalog On Submission Tender hanya menandai `proposal_teknis` sebagai wajib.
- Keberadaan fungsi/tabel belum membuktikan seluruh transaksi phase35 atau rollout database lulus UAT. Tidak memanggil RPC mutasi untuk keperluan audit.

## Batas pemeriksaan

Audit ini bukan sertifikasi keamanan, pengujian beban, atau UAT semua akun. Production build terbaru, Docker startup, restore penuh, inbox email nyata, tes manusia Face ID, dan transaksi bisnis database tidak dijalankan ulang. Perubahan lokal yang sudah ada dipertahankan. Log dan reproduksi sintetis tersimpan di `.cache/system-audit-*2026-10-30*`.

Urutan yang disarankan: **jadwal dokumen → parser nominal → tes backend → deployment/backup → email dan validasi operasional**.
