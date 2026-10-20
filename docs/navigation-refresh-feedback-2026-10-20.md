# Respons menu dan pembaruan data — 20 Oktober 2026

## Audit singkat

Indikator menu, pesan membuka halaman, dan fallback loading sudah tersedia dari 19 Oktober. Menggandakannya tidak diperlukan.

Ada celah pada halaman Proyek dan Milestone: query memakai `staleTime: 0`, sehingga membuka kembali halaman dapat menampilkan cache sambil meminta data terbaru. Halaman hanya memeriksa `isLoading`, sehingga pembaruan dengan cache tidak mendapat penanda. Sidebar/dashboard juga memakai data milestone yang sama, sehingga cache dapat tersedia sebelum halaman milestone pertama kali dibuka.

Ini menjelaskan satu jalur UI yang terlihat diam; belum membuktikan penyebab lambat pada koneksi atau Supabase asli.

## Rencana

- Pertahankan indikator router yang sudah ada.
- Tambahkan status kecil pembaruan data pada Proyek dan Milestone berdasarkan status query, dengan ruang tetap agar tampilan tidak bergeser.
- Bedakan pengukuran klik → route dengan klik → data selesai pada build produksi terpisah, memakai respons API buatan yang diperlambat.
- Uji dua bahasa, desktop/mobile, hasil sukses, kegagalan API, dan berakhirnya indikator.

Perubahan CI backend yang belum di-commit dipertahankan. Tidak ada commit, push, perubahan TTL cache, database, atau aturan akses.

## Hasil

Halaman Proyek dan Milestone sekarang menampilkan “Memperbarui data…” / “Updating data…” saat query mengambil ulang data yang sudah memiliki cache. Data lama tetap tersedia selama proses berjalan. Ruang status disediakan sejak awal agar judul dan tombol tidak bergeser. Status selesai mengikuti query, termasuk saat akhirnya gagal; error halaman yang sudah ada tetap bekerja. Pesan bisa dibaca pembaca layar dan animasi mengikuti preferensi pengurangan gerakan.

Indikator router yang sudah ada tetap menangani proses membuka halaman. Tidak ada pengubahan durasi cache, kebijakan retry, prefetch, API, atau otorisasi.

## Pengukuran terkontrol

Build produksi terpisah, akun HEAD_SA sintetis, dua bahasa dan viewport 1440/390 px. Setiap respons API target sengaja ditunda **900 ms**. Berikut rentang pada delapan kasus sukses; delapan kasus lain memeriksa kegagalan dan retry. Klik-ke-status memakai waktu status masuk DOM, bukan waktu fisik piksel ditampilkan. Klik-ke-data memakai polling DOM dan dapat mengandung overhead pengujian. Pengambilan screenshot dilakukan dalam run terpisah.

| Halaman | Sebelum: klik → route | Sebelum: klik → data | Sebelum: status pembaruan | Sesudah: klik → status | Sesudah: klik → data |
| --- | --- | --- | --- | --- | --- |
| Milestone | 21–31 ms | 977–999 ms | Tidak ada | 24–42 ms | 984–1019 ms |
| Proyek | 23–36 ms | 976–992 ms | Tidak ada | 24–39 ms | 980–999 ms |

Durasi request API sesudah perubahan terukur 907–928 ms, sesuai penundaan buatan. Halaman sudah terbuka saat data belum selesai; inilah jeda yang kini mendapat penanda. **Angka ini membuktikan respons UI pada kondisi terkontrol, bukan bahwa API lebih cepat atau bahwa Supabase asli lambat.** Penyebab jeda pada lingkungan/koneksi asli belum diukur.

## Verifikasi

- Typecheck dan lint frontend lulus.
- Sebanyak 68 dari 69 file tes frontend lulus pada run penuh. Satu pemeriksaan aset kamera gagal karena checkout Windows mengubah LF menjadi CRLF. Setelah koreksi byte dan aturan Git, tes aset diulang sendiri dan lulus. Dengan demikian semua 69 file telah lulus, bukan dalam satu run penuh.
- Build produksi pada salinan terpisah lulus.
- **16 kasus pembaruan cache** lulus: Proyek/Milestone × EN/ID × desktop/mobile × sukses/gagal. Cache tetap tampil, satu request sukses tanpa duplikasi, satu retry yang sudah dikonfigurasi tetap dipertahankan, indikator berhenti, tinggi header tetap, tanpa overflow dan exception browser.
- **4 kasus indikator router** lulus lagi, termasuk menu mobile, klik halaman yang sama, kegagalan API, dan Back. Feedback router muncul dalam 3–47 ms pada route yang sengaja ditahan.
- Screenshot desktop EN dan mobile ID diperiksa lewat run visual terpisah. Pengambilan HP menunggu animasi drawer selesai.
- Seluruh perubahan CI backend dari pekerjaan sebelumnya tetap sama. Pemeriksaan format perubahan lulus. Tidak ada data/akun asli, kamera, migrasi, staging, commit, atau push.

Pada percobaan awal harness, pemeriksaan cache terlalu mengasumsikan nama data selalu berasal dari versi pertama. Fixture diperbaiki untuk menerima cache dari pembaruan sebelumnya dan menyiapkan ulang halaman antar kasus; perilaku aplikasi tidak diubah untuk menyesuaikan asumsi itu.

## Koreksi aset setelah checkout Windows

Checksum gagal pada LICENSE dan tiga file JavaScript vendored. Untuk setiap file, byte yang tersimpan pada Git HEAD cocok dengan checksum manifest; file kerja hanya berbeda karena konversi CRLF. Byte HEAD dikembalikan setelah verifikasi perbandingan tersebut, tanpa mengganti paket atau model. Metadata README/manifest juga dipertahankan persis seperti HEAD. `.gitattributes` kini mengatur `frontend/public/vendor/** -text` agar Git mempertahankan byte vendored pada checkout berikutnya. Tidak ada perubahan isi aset terhadap HEAD.

Bukti lokal: `.cache/navigation-refresh-2026-10-20/` menyimpan `baseline.json`, `results.json`, log pemeriksaan/build/browser, retest aset, dan screenshot. Bukti indikator router berada di `.cache/navigation-feedback/results.json`. Tes permanen: `frontend/tests/browser/navigation-refresh-browser.cjs`; lihat [panduan tes browser](../frontend/tests/browser/README.md).
