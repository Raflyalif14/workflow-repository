# Respons perpindahan halaman — 19 Oktober 2026

## Audit dan rencana

Menu memakai Next Link, tetapi hanya menutup drawer saat diklik dan belum menampilkan status perpindahan. Tidak ada `app/loading.tsx`. Halaman data sudah memiliki skeleton/error masing-masing; status perpindahan route perlu dibedakan dari pengambilan data API.

Gunakan status pending bawaan Next 15 (`useLinkStatus`) agar klik tab baru, route yang sudah siap, pembatalan, dan perpindahan cepat tetap mengikuti router. Tambahkan indikator menu, pesan EN/ID yang tetap terlihat setelah drawer mobile tertutup, serta fallback loading halaman. Tidak mengubah TTL cache, API, atau otorisasi sebelum ada bukti bottleneck.

Ukur klik-ke-indikator, klik-ke-route, dan durasi request pada build produksi lokal dengan API buatan. Tahan respons route dan perlambat API secara terkontrol untuk memastikan feedback muncul sebelum hasil tiba. Ini bukan benchmark database produksi. Tidak ada server aplikasi aktif terdeteksi pada port 3000/5000 saat pemeriksaan awal.

## Hasil

Selesai untuk respons tampilan saat navigasi:

- Menu yang diklik mendapat penanda, garis loading muncul di atas, dan pesan “Membuka Milestone...” / “Opening Milestones...” tampil selama router masih menunggu. Pesan tetap terlihat setelah menu HP menutup.
- Status mengikuti router bawaan (`useLinkStatus`), tanpa timer buatan. Halaman yang sudah siap bisa langsung terbuka tanpa menampilkan indikator.
- Ditambahkan fallback `app/loading.tsx` serta teks loading yang dapat dibaca pembaca layar pada daftar proyek dan milestone. Animasi menghormati preferensi pengurangan gerakan.
- TTL cache, query, API, aturan akses, dan data tidak diubah.

### Pengukuran terkontrol

Chrome headless menggunakan akun HEAD_SA dan API buatan, tanpa akun/database asli. Respons route sengaja ditahan setidaknya 500 ms dan API terkait diberi jeda 600 ms. Angka klik-ke-indikator memakai waktu penambahan elemen ke DOM, bukan waktu layar fisik selesai menggambar.

| Tampilan | Sebelum: klik ke indikator | Sesudah: klik ke indikator | Sesudah: klik ke route |
| --- | --- | --- | --- |
| Desktop 1440 px, EN | Tidak ada | 1 ms | 876 ms |
| Desktop 1440 px, ID | Tidak ada | 3 ms | 636 ms |
| HP 390 px, EN | Tidak ada | 6 ms | 643 ms |
| HP 390 px, ID | Tidak ada | 5 ms | 781 ms |

Sebelum perubahan, route terbuka dalam 641–656 ms pada skenario ditahan ini tanpa indikator. Sesudah perubahan, pengguna mendapat feedback sebelum route selesai. Durasi API milestone yang sengaja diperlambat terukur 604–620 ms. Pengambilan ulang data berlangsung dengan data cache tetap terlihat. Angka route mencakup jeda pengujian dan pengambilan screenshot; **bukan perbandingan kecepatan aplikasi atau benchmark Supabase**. Penyebab keterlambatan pada koneksi/database asli belum disimpulkan.

### Verifikasi

- `npm.cmd run check` dari folder `frontend`: typecheck, lint, dan **67/67 berkas tes** lolos.
- `npm.cmd run build`: lolos, 23 halaman dihasilkan.
- **4 skenario navigasi** (EN/ID × desktop/HP): indikator muncul saat route lambat, menu HP menutup tanpa menyembunyikan pesan, indikator berhenti setelah navigasi, klik halaman yang sama tidak meninggalkan spinner, kegagalan API menampilkan error, tombol Back bekerja, tidak ada overflow atau exception browser.
- **8 skenario regresi** Projects/Documents: ringkasan dan filter proyek selesai, dua bahasa, desktop/HP, serta font lokal lolos.
- Screenshot desktop EN dan HP ID diperiksa. `git diff --check` lolos.

Percobaan browser pertama setelah build gagal karena proses `next dev` yang sedang berjalan menulis ulang sebagian `.next`, sehingga server `next start` membaca campuran build development/produksi. Pengujian akhir menggunakan snapshot standalone hasil build dengan aset statis yang disalin ke dalamnya; proses development pengguna tidak dihentikan. Tidak ada perubahan konfigurasi deployment.

Bukti lokal ada di `.cache/navigation-feedback/`: `baseline.json`, `results.json`, `check.log`, `build.log`, `browser-build-conflict.log`, `browser.log`, `rendering.log`, dan dua screenshot `pending-*.png`. Bukti ini diabaikan Git. Tes browser permanen: `frontend/tests/browser/navigation-feedback-browser.cjs`.

Untuk mencoba: jalankan aplikasi seperti biasa, klik menu lain. Jika halaman perlu menunggu, pesan loading muncul; jika halaman sudah siap, perpindahan langsung terjadi. Pengujian HP menggunakan ukuran layar Chrome, belum perangkat HP fisik. Belum dilakukan commit/push.

## Rujukan

- [Next 15 useLinkStatus](https://nextjs.org/docs/15/app/api-reference/functions/use-link-status)
- [Next 15 loading](https://nextjs.org/docs/15/app/api-reference/file-conventions/loading)
