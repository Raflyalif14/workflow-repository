# Perataan kartu ringkasan dashboard

## Audit sebelum perubahan
- Kartu berada di grid, tetapi pembungkus `dd` dan kartu tidak mengisi tinggi baris grid. Deskripsi dua baris membuat satu kartu lebih tinggi dari kartu lain.
- Perbaikan dibatasi pada pembungkus kartu dan tata letak MetricCard: tinggi mengikuti baris grid, ruang judul/deskripsi konsisten, isi tetap boleh membungkus pada layar kecil. Angka dan perhitungan tidak berubah.
- Verifikasi: ukur batas kartu dan posisi isinya di browser dengan data sintetis, dalam kedua bahasa/tema dan ukuran layar berbeda.

## Hasil
- Pemeriksaan tipe, ESLint dua file yang berubah, dan tes dashboard-layout yang sudah ada: lulus.
- 80 pemeriksaan browser lulus: 4 peran × 2 bahasa × 2 tema × 5 lebar layar (360, 768, 1280, 1440, 1920 px). Semua kartu dalam setiap baris sejajar di bawah, posisi angka sejajar, tidak ada overflow halaman/angka atau runtime error.
- Screenshot HEAD_SA terang desktop dan gelap mobile diperiksa secara visual. Respons API memakai data sintetis; tidak mengubah data pengguna. Pemeriksaan menggunakan preview development terpisah; tidak menjalankan build produksi ulang untuk perubahan tata letak ini.
- Bukti lokal: `.cache/dashboard-summary-alignment/results.json` dan screenshot pada folder yang sama. Script pengukuran bersifat sementara, tidak ditambahkan ke suite tes proyek.
