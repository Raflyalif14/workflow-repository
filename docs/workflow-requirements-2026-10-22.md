# Penyesuaian workflow dan dashboard — 22 Oktober 2026

## Kesepakatan pengguna
- Implementasi aplikasi dahulu; dokumen BRD asli tidak diedit.
- Terminology umum dipertahankan konsisten dalam English/Indonesia, bukan diterjemahkan paksa.
- Label ACTIVE pada fase On Submission Tender menjadi On Progress Tender (internal status tetap ACTIVE).
- Active Work pada SA Workload dihitung per milestone, bukan jumlah project.
- Work Stage diurutkan start date paling awal, kemudian durasi tersingkat untuk tanggal sama.
- Milestone mendukung paralel. Final Sales tetap memiliki syarat pekerjaan/dokumen lain selesai.
- Head SA Workspace menjadi Priority Task; ambil tugas belum selesai dengan deadline terdekat dan sertakan semua yang deadline-nya sama. Action Required menjadi Task List, berisi seluruh tugas yang relevan bagi peran pengguna.
- Pada fase On Submission Tender hanya Proposal Teknis yang wajib; dokumen lain tetap tersedia sebagai pilihan.
- WON/LOST pada final milestone Sales wajib evidence: JPG/JPEG/PNG/PDF/DOC/DOCX.
- Tabel Revenue Opportunity memiliki Final Revenue dan filter Pra-Tender/On Submission Tender.
- Konfirmasi akhir: satu browser boleh digunakan orang berbeda; setiap akun memiliki slot Face ID dan key sendiri. Pilih akun sebelum kamera. Wajah yang cocok dengan akun lain ditolak saat enrollment; login tetap diverifikasi terhadap akun yang dipilih.
- Start manual hanya tersedia saat start date tiba. Tugas overdue mendapat prioritas, beserta semua tugas yang deadline prioritasnya sama.

## Audit sebelum implementasi
- `MetricCard` dan dictionary menggunakan label internal sebagai lookup: pertahankan key internal dan ubah pada display boundary.
- SA Workload sudah menghitung IN_PROGRESS milestone, tetapi perlu memeriksa fase/role serta label agar tidak salah dipahami.
- Progression dan RPC transaksi masih memakai step_order dan pembukaan berurutan. Perubahan paralel perlu konsisten di backend, UI, serta SQL, dengan gate final completion dipertahankan.
- Output On Submission Tender saat ini memiliki empat dokumen wajib. Konstanta frontend/backend dan SQL default perlu diselaraskan tanpa menghapus berkas/dokumen lama.
- Face ID menyimpan satu key `current` di IndexedDB dan credential terikat deviceId/userId. Dukungan beberapa akun membutuhkan record per akun, migrasi record lama, dan pilihan login yang jelas.
- Final Sales outcome memakai RPC atomik dan belum membawa evidence. Validasi server dan penyimpanan evidence perlu diterapkan sebelum hasil boleh dicatat.
- Perubahan sebelumnya (tema dan perataan kartu) serta folder outputs/ dipertahankan. Tidak commit/push atau menjalankan migrasi otomatis.

## Validasi
Pemeriksaan implementasi diselesaikan pada 23 Oktober 2026. SQL belum diterapkan ke database.

- Hasil suite penuh 22 Oktober: 107/107 file tes backend CI dan 77/77 file tes frontend lulus. Delapan file tes backend membutuhkan lingkungan Python/model lokal terpisah dan tidak dijalankan oleh suite CI.
- Pengujian browser dengan API simulasi: 11 kelompok pemeriksaan lulus. Cakupan meliputi pilihan dua akun Face ID, migrasi slot browser lama, semua tugas dengan deadline sama, Task List, filter fase, Final Revenue, English/Indonesia, tema terang/gelap, serta layar desktop/mobile.
- Evidence kosong ditolak sebelum submit; saat pencatatan outcome gagal sementara lalu dicoba lagi, satu unggahan dipakai untuk dua percobaan sehingga berkas tidak diunggah ulang.
- Perbaikan akhir 23 Oktober: Start dan penyelesaian milestone memperbarui cache dashboard/activity. Pencatatan outcome juga memperbarui daftar dokumen, repository, dan pencarian, termasuk ketika outcome perlu dicoba ulang setelah evidence sudah tersimpan. Tes regresi baru `milestone-cache-refresh.test.ts` lulus dengan QueryClient asli dan cache berfilter.
- Pemeriksaan akhir 23 Oktober: typecheck frontend, ESLint seluruh `src`, tes cache baru, tes workflow requirements, Face ID, dan dua file tes ekspor laporan lulus. Production build di folder cache terpisah lulus; 11 kelompok tes browser diulang terhadap build terbaru dan seluruhnya lulus (satu upload evidence untuk dua percobaan outcome, tanpa error runtime). `git diff --check` bersih. Percobaan build awal tertahan izin Windows pada folder standalone; pengulangan dengan izin yang sesuai berhasil.

Batas verifikasi: tes browser menggunakan data/API simulasi, bukan transaksi Supabase atau wajah asli. Pemeriksaan SQL dalam tes bersifat statis; migrasi, transaksi database, serta uji kamera akun A/B tetap harus diverifikasi pada lingkungan aplikasi setelah penerapan. Model Face ID tidak diganti. Satu browser dapat menyimpan beberapa akun Face ID, tetapi tetap satu sesi login aktif.

### Perbaikan ringkasan dashboard — 23 Oktober
Pada data nyata, approval overview gagal karena `identitas_barang_produk` yang sedang IN_REVIEW masih memiliki `is_required=true` dari aturan lama, sementara definisi aplikasi baru menjadikannya optional. Queue kini menerima penanda lama/baru hanya untuk tiga dokumen tender yang berubah menjadi optional. Pemeriksaan pemilik, fase, milestone, snapshot, file, pilihan dokumen, dan kewenangan review tetap berlaku. Proposal Teknis tetap wajib dan penanda tidak valid pada dokumen lain tetap ditolak.

Pembacaan database tanpa perubahan data kini berhasil (9 item overview). Di tab aplikasi pengguna, empat kartu ringkasan kembali tampil dengan nilai 1/1/1/0 dan pesan partial-load hilang. Ini memverifikasi pembacaan dashboard/approval nyata; belum memverifikasi transaksi phase35. Tes regresi mencakup dokumen sebelum/sesudah migrasi serta penolakan data tidak valid.

## Urutan penerapan database
1. Simpan backup/checkpoint sesuai prosedur proyek.
2. Buka `backend/supabase/phase35-preflight.sql` di Supabase SQL Editor. RPC lama harus tersedia. Periksa daftar milestone future yang sudah IN_PROGRESS; migration tidak otomatis mengubah pekerjaan lama itu.
3. Jalankan `backend/supabase/phase35-parallel-work-and-outcome-evidence.sql` satu kali setelah migration sampai phase34 tersedia. Script menambah RPC Start/evidence, tabel relasi evidence ke versi dokumen, guard perubahan hasil, serta memperbarui katalog dokumen wajib. Tidak menghapus file atau hasil historis.
4. Jalankan `backend/supabase/phase35-verify.sql`, lalu deploy/restart backend dan frontend yang cocok. Jangan deploy backend baru sebelum SQL-nya tersedia.
5. Verifikasi manual dengan project uji: dua milestone di-start pada tanggal yang sudah tiba; tanggal future ditolak; final Sales tertahan sampai pekerjaan lain selesai; WON/LOST meminta evidence; cek file lewat repository; akun Face ID A/B masuk hanya dengan wajahnya masing-masing.

Pilihan optional yang sudah tersimpan tetap dipertahankan; perubahan mandatory tidak membatalkan pilihan dokumen yang sebelumnya dibuat. Script database belum dijalankan oleh Codex.

### Cara membaca hasil SQL
- Preflight: ketiga kolom RPC harus berisi nama fungsi, bukan `null`. Jika ada yang `null`, lengkapi migration sebelumnya dahulu. Daftar milestone future boleh kosong; jika berisi baris, tinjau pekerjaan tersebut sebelum menentukan penyesuaian jadwalnya.
- Verify: `proposal_teknis` harus menjadi satu-satunya dokumen wajib On Submission Tender; kedua RPC baru harus tersedia; `relrowsecurity` harus `true`; `invalid_evidence_links` harus `0`; kedua trigger harus tampil. `evidence_rows` boleh `0` sebelum ada outcome baru.
- Hasil query saja belum membuktikan alur transaksi. Tetap jalankan contoh project uji pada langkah 5. Hasil historis WON/LOST tidak diwajibkan memiliki evidence baru secara retroaktif.

## Pemeriksaan ulang — 29 Oktober 2026

Audit dilakukan terhadap kode yang ada dan metadata database langsung (read-only), bukan hanya hasil tes sebelumnya.

| Revisi | Temuan |
| --- | --- |
| Terminology umum | Istilah utama Dashboard, Milestones, SA Workload, Active Work, Work Stage, Priority Task, Task List, Deadline, Progress, Estimated Revenue dan Final Revenue tetap konsisten. Kalimat penjelasan tetap mengikuti bahasa pilihan. |
| Status submission tender | On Progress Tender tersedia di dashboard, daftar dan detail proyek; laporan ekspor diselaraskan pada pemeriksaan ini. Internal status tetap ACTIVE. |
| SA Workload | Active Work menghitung milestone SA IN_PROGRESS pada proyek aktif dan fase yang sesuai, bukan jumlah proyek. |
| Urutan Work Stage | Tanggal mulai paling awal, kemudian durasi terpendek. Pemilihan Work Stage daftar proyek dan penanda detail diperbaiki agar tidak mendahulukan milestone bertanggal lebih lambat hanya karena sudah IN_PROGRESS. |
| Milestone paralel | Route, tombol Start dan SQL tersedia. Tombol Start diperbaiki untuk PIC proyek saat PIC milestone masih kosong; tanggal future tetap tidak boleh dimulai. Fungsi SQL belum tersedia di database. |
| Dokumen wajib tender | Konstanta aplikasi hanya mewajibkan Proposal Teknis. Database masih mewajibkan empat dokumen; perubahan katalog menunggu phase35. |
| Priority Task | Semua tugas belum selesai dengan deadline paling awal ditampilkan, termasuk overdue dan beberapa proyek dengan deadline sama. |
| Task List | Nama dan daftar tugas sesuai peran sudah tersedia, termasuk tugas tanpa deadline. |
| Evidence WON/LOST | Modal, upload dan validasi backend sudah tersedia untuk JPG/JPEG/PNG/PDF/DOC/DOCX. Tabel evidence dan RPC transaksi belum tersedia di database. |
| Final Revenue | Kolom tersedia pada Revenue Opportunity; menampilkan nilai kontrak final proyek WON, bukan estimasi. |
| Filter revenue | Pra-Tender dan On Submission Tender tersedia; filter diterapkan sebelum pembatasan jumlah baris tampilan. |

Hasil inspeksi database: `start_parallel_milestone`, `complete_final_sales_with_evidence`, `mutate_project_outcome_with_evidence`, dan tabel `project_outcome_evidence` belum tersedia. Katalog masih menandai `proposal_teknis`, `timeline_proyek`, `identitas_barang_produk`, `spesifikasi_teknis_toc` sebagai mandatory. Tidak ada data atau skema yang diubah pada audit ini. Mengikuti batas kerja sebelumnya, migrasi tidak dijalankan otomatis; phase35 perlu diterapkan untuk mengaktifkan bagian transaksi dan katalog baru.

Validasi ulang 29 Oktober: backend typecheck dan 107/107 file tes CI lulus (8 tes Python/model terpisah dikecualikan); frontend typecheck, ESLint, 78/78 file tes dan production build lulus. Tes browser dengan data simulasi lulus 12 kelompok, termasuk dua milestone paralel tanpa PIC milestone tersendiri, penolakan tombol Start sebelum tanggal tiba, filter revenue, seluruh deadline sama, dan evidence yang tidak diunggah dua kali saat retry. Tiga RPC prasyarat phase35 ditemukan lewat metadata database. Penerapan SQL serta uji transaksi pada database asli belum dilakukan.

## Sales Pipeline sesuai anotasi pengguna — 29 Oktober 2026

Pengguna mengonfirmasi bahwa bagian tengah menampilkan jumlah proyek yang telah lanjut dari Pra-Tender ke On Submission Tender. Ringkasan Sales diubah menjadi tiga kelompok:

- **Pra-Tender:** Active, Postponed, dan Estimated Revenue proyek yang masih di fase ini dengan dua status tersebut. Draft dan proyek selesai tidak masuk jumlah ini.
- **On Submission Tender:** jumlah perpindahan dari Pra-Tender, status On Progress Tender, Waiting Result, Postponed bila ada, serta Estimated Revenue pekerjaan belum berakhir di fase ini.
- **Tender Result:** WON/LOST pada fase On Submission Tender dan Final Revenue dari nilai kontrak WON yang tercatat.

Jumlah perpindahan berasal dari riwayat kedua fase yang cocok dengan proyek dan scenario, dihitung satu kali per proyek, termasuk proyek yang sudah WON/LOST. Proyek yang langsung dibuat di On Submission Tender masuk status fase tersebut, tetapi tidak diklaim sebagai perpindahan dari Pra-Tender. Karena jumlah perpindahan bersifat riwayat, angka itu tidak dijumlahkan dengan status saat ini sebagai total proyek baru. API mengambil semua proyek dalam akses Sales; angka tidak dihitung dari delapan baris tabel atau halaman pertama daftar proyek. Scope akses peran tetap diterapkan. Data fase yang tidak konsisten ditampilkan sebagai tidak tersedia, bukan angka nol yang seolah valid.

Ringkasan empat kartu Sales lama dan strip hasil yang mengulang angka diganti komponen Sales Pipeline. Head SA, SA, dan Super Admin mempertahankan ringkasan masing-masing. Data `salesResults` lama tetap tersedia di API untuk kompatibilitas konsumen lain.

Penyesuaian tampilan berikutnya: kartu dipadatkan dengan padding/jarak/font lebih kecil. Penjelasan scope dan perhitungan dipindah ke disclosure “Tentang perhitungan” yang tertutup saat awal, sementara seluruh angka status, perpindahan, dan revenue tetap terlihat.

Head SA juga menggunakan tiga kartu ringkas tersebut dengan judul **Project Pipeline** dan scope seluruh proyek dalam akses Head SA, lintas pemilik Sales. Data agregat tersedia terpisah sebagai `projectPipeline`; `salesPipeline` tetap khusus scope Sales. Kartu Nilai Proyek lama pada UI digantikan rincian per fase ketika data baru tersedia. Empat metrik operasional Head SA dipadatkan, sementara SA Workload dan tugas review tetap tersedia. Ringkasan SA/Super Admin tidak diperluas aksesnya. Pembacaan Head SA pada database asli berhasil secara read-only.

Permintaan berikutnya: Workspace Summary (empat metrik operasional) di dashboard Head SA dihapus. Project Pipeline, SA Workload, tugas review, dan ringkasan peran lain tetap tersedia. Pemeriksaan tipe frontend, ESLint file terkait, dan tes layout lintas peran/bahasa lulus setelah penghapusan.

Validasi Head SA: typecheck frontend/backend, ESLint frontend, production build, 6 file tes dashboard backend dan 3 file tes komponen/layout frontend lulus. Browser lulus 16 kelompok, termasuk tambahan Head SA terang/gelap pada lebar 1440/360, keempat metrik yang ringkas, dan SA Workload yang tetap tersedia. Pratinjau memakai data simulasi; pembacaan agregat database asli diperiksa terpisah tanpa mutasi.

Validasi: backend/frontend typecheck, ESLint, 6 file tes dashboard backend, 6 file tes dashboard frontend, serta tes komponen Sales Pipeline lulus. Production build dan 12 kelompok tes browser lulus; mencakup EN/ID, tema terang/gelap, lebar 1440/360, status/transisi, alignment kartu, filter revenue, dan evidence retry. Pembacaan service terhadap database asli berhasil secara read-only: pada scope Sales yang diperiksa, 3 proyek memiliki riwayat perpindahan, 1 masih On Progress Tender, dan 2 sudah WON. Pengecekan ini tidak mengubah skema maupun data; ringkasan memakai fase proyek yang sudah tersedia sehingga tidak bergantung pada phase35.
