# Draf formulir buat proyek

## Audit perbaikan getaran saat mengetik

- Status draf berubah dari tersimpan menjadi menyimpan pada setiap perubahan input.
- Baris waktu simpan hanya dirender saat status tersimpan, sehingga tinggi banner berpotensi berubah setiap kali menyimpan. Panjang judul dan munculnya tombol hapus juga perlu diperiksa pada layar sempit.
- Perbaikan dibatasi pada kestabilan tampilan banner dan pengujian posisi input selama mengetik. Penyimpanan langsung, lampiran, isolasi akun, dan penanda retry tetap dipertahankan.
- Pengukuran browser mengonfirmasi pergeseran banner dan kolom sebesar 20,5 px pada desktop/ponsel, baik EN maupun ID.
- Baris waktu simpan sekarang tetap berada di tata letak, tinggi judul mengikuti status normal terpanjang, dan ruang tombol hapus tersedia sejak formulir kosong. Ikon saat menyimpan dibuat tetap agar tidak berkedip setiap ketikan.
- Setelah perbaikan, empat pengujian ketik (EN/ID pada 1440/360 px) mencatat pergeseran 0 px, termasuk ketika pengakuan transaksi diperlambat 120 ms. Karakter terakhir juga diperiksa langsung dari penyimpanan browser.
- Build, typecheck, lint, tiga berkas tes formulir/draf, dan 16 skenario browser pemulihan tetap lulus. Hasil ukur sebelum/sesudah ada di `.cache/project-form-draft/typing/before.json` dan `after.json`.

## Audit singkat

- Isian dan lampiran formulir `/projects/new` saat ini hanya berada di memori halaman.
- Formulir hanya untuk Sales. Draf harus dipisah per akun dan tidak dipulihkan sebelum identitas akun siap.
- Pengiriman proyek sudah memakai penanda permintaan untuk mencegah duplikasi. Pemulihan setelah gagal kirim harus memakai penanda dan payload yang sama.
- Draf lokal memakai penyimpanan browser yang mendukung lampiran (IndexedDB), tanpa endpoint atau migrasi database baru.
- Pemulihan dilakukan otomatis, dilengkapi status simpan dan tindakan hapus draf. Draf dihapus setelah proyek berhasil dibuat. Status tersimpan hanya muncul setelah transaksi selesai.
- Kegagalan penyimpanan dan draf dari tab lain perlu ditampilkan, bukan dianggap berhasil menyimpan. Alur kalender/ekspor dan pekerjaan lain dipertahankan.

## Hasil implementasi dan pemeriksaan

- Buka **Proyek → Buat proyek** sebagai Sales. Status draf muncul di atas formulir.
- Nama, pelanggan, estimasi pendapatan, skenario, checklist, MoM, foto, dan dokumen pendukung tersimpan otomatis untuk akun tersebut di browser yang sama.
- Tunggu **Draf tersimpan** sebelum menutup halaman. Saat formulir dibuka lagi, isian dan lampiran dipulihkan otomatis. Draf tidak dikirim otomatis ke server.
- **Hapus draf** meminta konfirmasi lalu membersihkan isian dan lampiran. Draf juga dibersihkan setelah proyek berhasil dibuat.
- Draf bukan sinkronisasi lintas perangkat. Menghapus data situs/browser juga dapat menghapus draf lokal.
- Revisi penyimpanan mencegah tab lama menimpa perubahan tab lain. Jika terjadi konflik, pengguna dapat memuat draf terbaru secara eksplisit.
- Sebelum POST pertama, snapshot dan penanda pengiriman disimpan tuntas. Jika browser menolak penyimpanan, pengiriman ditahan sampai penyimpanan berhasil agar pemulihan tidak membuat operasi baru.
- Pengiriman yang belum pasti hasilnya dipulihkan dalam keadaan terkunci dan hanya dikirim ulang setelah konfirmasi pengguna, memakai penanda dan file yang sama. Akun/sesi yang berubah membatalkan kelanjutan pengiriman.

Pemeriksaan yang lulus:

- Typecheck, lint tanpa peringatan baru, dan build frontend terpisah.
- Tes formulir/pengiriman lama tetap lulus, termasuk validasi, pembatalan konfirmasi, retry, dan pembatasan peran.
- Tes draf: validasi schema/akun/file, nilai kosong dan nol, penanda pengiriman setelah reload, dan pengiriman ulang dengan byte file yang sama.
- Tes kamus Inggris/Indonesia.
- 16 skenario browser dengan penyimpanan IndexedDB nyata dan data contoh: pemulihan setelah dokumen ditutup, isi/metadata file, dua bahasa, desktop/ponsel, dua akun, logout/login, hapus/batal, penyimpanan penuh/retry, revisi tab, pemulihan pengiriman, perubahan sesi, request ID yang sama, dan pembersihan setelah sukses.

Hasil dan preview ada di `.cache/project-form-draft/browser/`. Pengujian memakai akun dan API contoh terisolasi, belum uji pembuatan proyek pada akun/database pengguna sebenarnya. Tidak menambah dependensi, endpoint, atau tabel backend. Tidak melakukan migrasi, commit, atau push.
