# Ekspor laporan proyek

## Audit singkat

- Detail proyek sudah memuat metadata proyek dan milestone yang boleh dilihat pengguna.
- Progres halaman dihitung dari milestone fase aktif. Laporan harus memakai perhitungan dan cakupan yang sama.
- Belum ada tombol ekspor. Tambahkan satu komponen di header, tanpa mengubah workflow, otorisasi, atau database.
- File Excel/PDF dibentuk lokal di browser. Pustaka pembuat file dimuat ketika tombol unduh digunakan.
- Data teks harus tetap menjadi teks di Excel, termasuk nama yang diawali tanda `=`. Tanggal tenggat tidak boleh bergeser zona waktu.
- Ekspor mengambil ulang metadata/milestone melalui endpoint terautentikasi sebelum membuat file, dan menolak hasil jika sesi atau proyek sudah berubah.

## Hasil implementasi dan pemeriksaan

- Di detail proyek, klik **Export report / Ekspor laporan**, lalu pilih Excel atau PDF.
- Isi laporan: proyek, pelanggan, skenario/fase, status, Sales, PIC, progres, serta tabel milestone berikut penanggung jawab dan tanggalnya.
- Cakupan laporan adalah fase proyek saat ini, sama dengan perhitungan progres di detail proyek. Fase historis tidak ikut dihitung. Tanggal ekspor memakai zona bisnis WIB.
- Laporan dibentuk dari pembacaan baru endpoint proyek dan milestone yang sudah terautentikasi. Tidak memakai data cache jika pembacaan gagal. Perubahan sesi, pembatalan, atau perpindahan proyek membatalkan unduhan yang masih disiapkan.
- Pustaka `write-excel-file` dan `pdfmake` beserta font PDF dimuat hanya ketika format terkait diunduh. Tidak perlu layanan eksternal, konfigurasi server, atau migrasi database.
- Ekspor tidak menyertakan email, berkas dokumen, nilai keuangan, atau foto/data biometrik.

Pemeriksaan yang lulus:

- Typecheck, lint, dan build frontend pada direktori build terpisah.
- Dua berkas tes ekspor: kesesuaian fase/progres, urutan milestone, dua bahasa, tanggal, nilai kosong, string Excel, nama file, akses ditolak, pembatalan, dan pergantian sesi saat permintaan berlangsung.
- Tes i18n dan perhitungan progres milestone yang sudah ada.
- 18 skenario browser ekspor: empat peran, dua bahasa, lebar 1440/360 px, dialog, kegagalan akses dan percobaan ulang, laporan panjang/kosong.
- Delapan unduhan nyata: Excel dan PDF untuk EN, ID, 58 milestone, dan fase kosong.
- XML Excel berhasil dibaca kembali, tanpa formula atau fase historis. Karakter aksen dan simbol `&` tetap utuh.
- PDF dibaca kembali dan dirender untuk pemeriksaan visual. Laporan 58 milestone menjadi delapan halaman, seluruh baris masuk, judul kolom berulang, dan nomor halaman benar.
- 18 skenario browser detail proyek lama tetap lulus.
- Audit dependensi setelah instalasi: paket ekspor baru tidak termasuk dalam delapan temuan high yang tercatat pada rantai lint/Tailwind yang sudah ada. Tidak menjalankan pembaruan paksa.

Contoh hasil pengujian ada di `.cache/project-report/browser/report-id.pdf` dan `report-id.xlsx`. Itu data contoh terisolasi, belum pengujian unduhan dari akun/database pengguna yang sebenarnya. Preview dialog dan hasil pemeriksaan ada di folder yang sama.

Perubahan kalender dan folder outputs milik pengguna dipertahankan. Tidak melakukan migrasi, commit, atau push.
