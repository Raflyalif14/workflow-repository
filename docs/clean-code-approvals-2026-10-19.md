# Perapian kode Approvals - 19 Oktober 2026

## Audit singkat

Halaman `frontend/src/app/approvals/page.tsx` memiliki 440 baris. Koordinasi filter, pagination, statistik, dan dialog bercampur dengan tampilan baris persetujuan. Dialog tindakan memiliki 384 baris, termasuk ringkasan permintaan dan rincian deadline yang dapat dipisahkan dari proses konfirmasi.

Aturan pencarian, urutan, pagination, serta tautan output sudah berada di `approval-queue.ts`; tetap gunakan aturan tersebut. Format tanggal pada daftar dan dialog berbeda (dialog deadline memakai tanggal UTC), sehingga tidak disatukan agar perilaku tanggal tetap terjaga.

Ditemukan ketidaksesuaian tampilan: Super Admin memperoleh tombol Lihat detail, tetapi dialog permintaan pending masih menampilkan formulir keputusan. Backend sudah membatasi review deadline/rencana ke Head SA (`deadline-approval.routes.ts` dan `project-plan-approval.service.ts`). Dialog akan menerima izin review yang eksplisit dari halaman, sehingga Super Admin hanya melihat rincian. Tidak ada perubahan kewenangan backend.

## Rencana perubahan

- Pisahkan baris persetujuan beserta label/ringkasannya ke satu komponen.
- Pisahkan ringkasan permintaan di dialog dari formulir keputusan; pertahankan isi dan format tanggal.
- Hapus setter konfirmasi yang dipanggil dua kali dan kondisi label tombol yang berulang.
- Verifikasi dialog baca-saja, tindakan baris lewat mouse/keyboard, filter, pagination, error/kosong, serta konfirmasi Head SA dengan tes dan browser berisi data buatan.

Perubahan detail proyek dan Milestones sebelumnya tetap dipertahankan. Tidak ada migrasi, perubahan data bisnis, staging, commit, atau push.

## Hasil

Selesai untuk halaman Approvals dan dialog terkait:

- Halaman utama berkurang dari **440 menjadi 244 baris**. Baris, label status, dan ringkasan daftar dipindahkan ke `frontend/src/components/approvals/approval-row.tsx`. Isi enam fungsi yang dipindahkan tetap sama.
- Dialog berkurang dari **384 menjadi 322 baris**. Ringkasan permintaan dan rincian deadline berada di `frontend/src/components/approvals/approval-request-summary.tsx`. Format tanggal sebelumnya dipertahankan.
- Dialog menerima `canReview` secara eksplisit. Super Admin hanya melihat rincian; formulir keputusan dan pilihan PIC tidak ditampilkan. Head SA tetap mengikuti validasi alasan, pemilihan PIC bila perlu, dan konfirmasi dua langkah. Backend tidak diubah.
- Setter konfirmasi ganda dan kondisi label tombol yang berulang dibersihkan.

Validasi selesai:

- `npm.cmd run check --prefix frontend`: typecheck, lint, dan **68/68 berkas tes lulus**. Tes yang ada diperluas untuk izin dialog; tes payload, revisi PIC, serta pengulangan permintaan setelah respons tidak pasti tetap lulus.
- Build produksi di salinan source terpisah berhasil, termasuk 23 halaman dan startup server standalone. Folder build development asli tidak disentuh.
- **20/20 skenario browser lulus**: 16 kombinasi empat role, EN/ID, desktop 1440 px dan HP 390 px; ditambah empat alur data lama saat error, coba ulang, dan kosong untuk Head SA/Super Admin dalam kedua bahasa.
- Browser memeriksa 23 permintaan pending lintas halaman, kategori, pencarian yang mengembalikan halaman pertama, riwayat disetujui/ditolak/versi lama, pengecualian pending yang sudah digantikan, validasi alasan, pilihan PIC, pembatalan sebelum keputusan dikirim, serta dialog baca-saja Super Admin.
- Navigasi baris dengan Enter, tautan menuju snapshot output yang tepat, pemisahan klik tombol dari klik baris, dan larangan memuat overview untuk SA/Sales juga lulus. Tidak ada error runtime, API tak dikenal, atau mutasi data bisnis dari tes browser.
- Dua screenshot diperiksa: desktop Head SA dan HP Super Admin. `git diff --check` lulus; tidak ada staging, commit, atau push.

Bukti lokal berada di `.cache/clean-code-approvals/` (diabaikan Git). Cara mengulang browser test ada di `frontend/tests/browser/README.md`.

Tes browser memakai akun dan API buatan, sehingga hasil ini memverifikasi frontend dan tidak mengklaim pengujian ulang otorisasi backend atau data produksi. Penjagaan role di server tetap diperlukan dan tidak digantikan oleh izin dialog frontend.
