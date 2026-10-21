# Kalender tenggat milestone

## Audit singkat

- Halaman Milestones saat ini berisi antrean penugasan dan review; belum ada kalender.
- Data penugasan pribadi tidak mencakup seluruh proyek yang boleh dilihat Head SA. Kalender perlu endpoint baca tersendiri dengan aturan akses proyek yang sama.
- Tanggal tenggat berupa tanggal kalender. Tampilan tidak boleh menggesernya karena zona waktu.
- Perubahan dibatasi pada kalender bulanan, agenda per hari, dan tautan ke milestone. Alur kerja, izin menu, dan database tidak diubah.

## Implementasi dan validasi

- Buka **Milestones → Calendar / Kalender**. Tampilan awal tetap Daftar.
- Kalender bulanan menyediakan tombol bulan sebelumnya/berikutnya dan Hari ini. Klik tanggal untuk agenda harian, atau klik milestone untuk membuka bagian terkait di proyek.
- Ringkasan: jumlah tenggat bulan ini, yang lewat tenggat, dan yang selesai. Proyek ditunda/ditutup tidak dihitung terlambat. Milestone tanpa tanggal tenggat tidak ditampilkan.
- Desktop menampilkan nama milestone di kotak tanggal. Ponsel memakai penanda ringkas dan agenda di bawah kalender.
- Bahasa Inggris dan Indonesia menggunakan kamus terpusat yang sudah ada.
- Endpoint baca: `GET /api/me/deadline-calendar?month=YYYY-MM`. Sales dibatasi proyek miliknya, SA dibatasi proyek tempatnya menjadi PIC, Head SA dan Super Admin mengikuti akses seluruh proyek. Akun tidak aktif atau wajib ganti password tetap ditolak autentikasi.
- Pembacaan proyek dan milestone memakai paging eksplisit. Cache frontend dipisah per akun, sesi, peran, dan bulan; perubahan proyek/milestone membatalkannya lewat prefix cache proyek. Respons sesi lama ditolak.

Pemeriksaan yang lulus:

- Typecheck dan build backend/frontend; lint frontend.
- Tes backend kalender: batas bulan/tahun, autentikasi, empat peran, pembatasan data, lebih dari 3.000 milestone, kosong, dan kegagalan database.
- Dua berkas tes frontend kalender: susunan tanggal/tahun kabisat, status proyek, tautan, isolasi cache/sesi, pembatalan permintaan, dan invalidasi.
- Tes halaman penugasan lama dan konsistensi kamus i18n.
- 19 skenario browser kalender dengan data contoh: empat peran, dua bahasa, lebar 1440/360 px, agenda, tautan, bulan, loading/error/retry/kosong.
- 24 skenario browser antrean Milestones lama tetap lulus.

Preview berada di `.cache/deadline-calendar/browser/calendar-id-1440.png` dan `calendar-id-360.png`. Hasil browser memakai data contoh terisolasi; belum merupakan verifikasi kalender dengan akun/database pengguna yang sebenarnya. Tidak menjalankan migrasi, commit, atau push.
