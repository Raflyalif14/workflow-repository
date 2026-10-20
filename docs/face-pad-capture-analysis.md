# Pemeriksaan skor spoof pada foto kamera — 13 Oktober 2026

Status: skor tinggi **direproduksi pada foto pengguna yang sama**. Lokasi
masalah sudah dipersempit ke respons model pada input kamera ini. Kesalahan
klasifikasi belum diperbaiki; penyebab visual atau ketidakcocokan data latih
belum dibuktikan. Tidak ada perubahan probabilitas, ambang, label, atau login.

## Bukti dari tangkapan baru pengguna

Pengguna mengambil ulang melalui halaman tes cepat dan menyatakan bahwa
foto/hasil sudah tampil. Foto sebelumnya tidak lagi ada di memori halaman.
Pengguna melaporkan sumbernya sebagai wajah langsung di depan kamera;
laporan tersebut bukan label yang diverifikasi secara independen.

Analisis dikirim lewat tombol **Analisis foto yang sama** pada sesi aplikasi
yang sudah login. SHA-256 mengikat foto asli, hasil awal, dan hasil analisis;
dimensi, request ID, slot, serta checksum model juga divalidasi. Foto 640 × 480.
Tidak mengunduh atau menyimpan file foto pengguna untuk pemeriksaan ini.

| Aturan potongan dari satu deteksi YuNet | Real | Spoof |
| --- | ---: | ---: |
| Aplikasi saat ini, 321 × 321 tanpa clipping | 0.0381876453% | 99.9618053436% |
| Perluasan demo asli pada bbox YuNet yang sama | 0.0521992682% | 99.9478042126% |
| Bbox YuNet tanpa perluasan | 0.0926831097% | 99.9073147774% |

- Decoder Pillow dan OpenCV menghasilkan piksel identik: selisih maksimum 0.
- Tensor aplikasi dan perhitungan referensi RGB/mean/std: selisih maksimum 0.
- Model ONNX yang sama dijalankan pada OpenCV CPU dan ONNX Runtime CPU,
  tiga kali per potongan. Semua pengulangan konsisten. Selisih maksimum
  antar mesin pada tiga potongan hanya 1.81e-9.
- Potongan CURRENT mengulang skor awal dalam toleransi 1e-5.
- Urutan output `[real, spoof]` sesuai dokumentasi model. Angka yang
  ditampilkan berasal dari output model; tidak ada pertukaran kelas.

Kesimpulan: decoder, normalisasi, pemetaan kelas, tampilan persentase, dan
perbedaan mesin CPU tidak menjelaskan hasil ini. Ketiga aturan potongan
tetap menghasilkan spoof >99.9%, termasuk CURRENT tanpa clipping. Mengganti
aturan potongan saja tidak menyelesaikan contoh ini. Model/pipeline yang
belum divalidasi pada kondisi kamera pengguna tetap menjadi masalah akurasi.

Belum dapat menyimpulkan pencahayaan, blur, sensor kamera, atau data latih
sebagai sebab tunggal. Tidak melakukan sweep untuk mencari skor real tinggi.
Pembanding potongan memakai YuNet yang sama; demo asli memakai detector
lain, sehingga **belum merupakan kesetaraan seluruh pipeline referensi**.
Perbaikan akurasi perlu validasi dengan sampel kamera langsung dan presentasi
foto/video yang berlabel sebelum mengubah model atau mengaktifkan login wajah.

## Analisis yang ditambahkan

- Tombol satu foto, tanpa capture ulang atau pengisian metadata eksperimen.
- Endpoint `/face-pad/diagnose` memakai autentikasi, eligibility, opt-in PAD,
  pembatasan request, batas upload, dan deadline yang sama dengan inspeksi.
  Analisis hanya aktif dalam `NODE_ENV=development`.
- Foto mengalir ke Python lewat stdin; respons diproyeksikan menjadi angka
  saja. Tidak ada foto/embedding dalam respons. `Cache-Control: no-store`.
- Dua runtime memakai model yang identik dan checksum terverifikasi. Tiga
  varian potongan ditetapkan sebelum inferensi, tanpa pemilihan skor terbaik.
- Perubahan foto/akun, logout, keluar halaman dan unmount membatalkan hasil.
  Proses Python memakai interpreter dasar secara langsung agar pembatalan
  di Windows tidak meninggalkan proses anak venv yang memegang gambar.
- String UI tersedia melalui kamus EN/ID terpusat.

## Verifikasi

- Browser lokal: analisis terhadap foto pengguna berhasil, hasil awal
  direproduksi, tabel dan rincian numerik tampil.
- Python `test_diagnose_capture.py`: 5 PASS, mencakup normalisasi RGB dengan
  nilai independen, clipping, penolakan input, penghapusan buffer saat gagal,
  serta perbandingan dengan adapter produksi pada fixture publik.
- Backend/frontend parser: PASS untuk hasil rusak, keterikatan model,
  proyeksi angka saja, serta perbedaan runtime yang benar-benar ada.
- Proses Node → Python nyata: PASS memakai fixture publik, kedua runtime,
  checksum, pembatalan sebelum proses dan pembatalan proses yang berjalan.
- HTTP: PASS autentikasi dengan provider akun fixture, dev/opt-in gate,
  validasi request, no-store, proyeksi dan checksum. Inferensi pada suite HTTP
  di-stub; inferensi nyata diuji terpisah dan lewat browser pengguna.
- Tes quick face dan PAD sebelumnya tetap PASS. TypeScript frontend/backend
  diperiksa terpisah. Tidak menjalankan seluruh build atau suite repositori.

Layanan pilot lokal dimulai ulang melalui launcher yang memverifikasi pemilik
proses. Frontend tidak dimulai ulang dan tab berisi foto tidak direfresh.

Referensi: [kontrak original ONNX](https://docs.openvino.ai/2023.3/omz_models_model_anti_spoof_mn3.html)
dan [aturan potongan demo asli](https://github.com/kprokofi/light-weight-face-anti-spoofing/blob/82a2c26bacff5462c6f9320c34ae0363ccbed497/demo_tools/wrapers.py).
