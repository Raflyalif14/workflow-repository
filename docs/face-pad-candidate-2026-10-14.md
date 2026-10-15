# Kandidat perbaikan PAD — 14 Oktober 2026

Status: **siap untuk dua pengambilan pengguna; akurasi dan login wajah belum tervalidasi**.

## Dasar perubahan

Analisis [foto identik sebelumnya](face-pad-capture-analysis.md) mengulang skor
MN3 yang tinggi untuk spoof pada OpenCV dan ONNX Runtime. Decoder dan tensor
normalisasi cocok; tiga pilihan crop tetap menghasilkan skor spoof tinggi.
Belum ada bukti bahwa pembalikan kelas, warna, atau perubahan threshold adalah
perbaikan yang benar. Penyebab kegagalan generalisasi pada kamera pengguna
belum dapat dipastikan.

Ditambahkan pembanding MiniFASNet V2 + V1SE dari
[Silent-Face-Anti-Spoofing](https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/tree/b6d5f04ad78778917853b25c778acef6d5626d15).
Model belum menggantikan MN3 pada `/inspect` dan tidak menerbitkan sesi login.
Login aplikasi yang ada tetap memakai autentikasi akun; belum ada enrollment
atau penerbitan sesi menggunakan wajah.

## Implementasi

- Halaman `/settings/face-verification/quick` menampilkan **Tes model baru**
  setelah tes MN3 selesai. Satu foto asli yang sama dipakai keduanya.
- Kandidat menjalankan dua model, merata-ratakan seluruh probabilitas kelas.
  Kelas 1 adalah real; kelas 0 + 2 adalah spoof. Tidak memilih model/skor terbaik
  dan tidak menetapkan keputusan LIVE/SPOOF atau threshold baru.
- Crop konteks 2.7 dan 4 mengikuti algoritme resmi `CropImage`; input 80 x 80,
  BGR, float32 NCHW dengan rentang byte 0–255. Detector memakai YuNet proyek,
  serta rasio asli kamera dipertahankan. Karena detector dan rasio sumber
  berbeda dari demo Android 3:4, ini adapter proyek, bukan klaim kesetaraan
  seluruh pipeline upstream.
- Bobot resmi diverifikasi ukuran/Git blob saat setup dan SHA256 saat dimuat
  untuk konversi. ONNX hasil konversi juga dipatok ukuran dan SHA256; model
  dengan bytes berbeda ditolak sebelum pemrosesan.
- Runtime foto memakai CPU ONNX Runtime. PyTorch hanya digunakan saat ekspor
  lokal agar pemuatan PyTorch yang lambat tidak menunda setiap tes pengguna.
- `/face-pad/candidate` memerlukan akun aktif, `FACE_PAD_ENABLED=true`, dan
  `NODE_ENV=development`. Tetap memakai batas foto 4 MiB, rate limit, kapasitas
  proses, timeout, pemeriksaan SHA foto, dan `Cache-Control: no-store`.
- Respons hanya berisi angka/metadata yang diizinkan. Foto lewat stdin proses
  lokal tanpa file foto. Hasil browser terikat foto/akun/request, dibatalkan
  saat foto atau akun berubah, logout, meninggalkan halaman atau unmount.

## Aset dan kesetaraan konversi

Sumber dipatok pada commit `b6d5f04ad78778917853b25c778acef6d5626d15`.
Lisensi Apache-2.0 upstream disertakan pada cache; detector Caffe upstream
tidak diunduh atau dipakai.

| Model | SHA256 bobot resmi | SHA256 ONNX lokal |
| --- | --- | --- |
| MiniFASNetV2 | `a5eb02e1843f19b5386b953cc4c9f011c3f985d0ee2bb9819eea9a142099bec0` | `2e4d897d506d2265ae3bf8c092002a527b2e78d940f8c60223a4ee03b7b65e11` |
| MiniFASNetV1SE | `84ee1d37d96894d5e82de5a57df044ef80a58be2b218b5ed7cdfd875ec2f5990` | `6e4baab0c157a97f274f69bbd2bc3cf773c2ccd635a613930963963669dc3af5` |

Ekspor opset 13 memakai Torch 2.14.1+cpu, ONNX 1.23.0, ONNX Runtime 1.23.2.
Empat kasus per model: input konstan, noise deterministik, dan dua crop foto
fixture publik. Toleransi ditetapkan `atol=1e-5, rtol=1e-4` sebelum perbandingan.
Selisih maksimum V2 `2.0265579223632812e-6`, V1SE
`2.3245811462402344e-6`: **PASS**. Ini validasi konversi, bukan akurasi PAD.

Pada fixture publik `same-person-a.jpg`, baseline MN3 real ~0.85801160;
MiniFAS reference PyTorch ~0.74881303 dan ONNX ~0.74881423. Waktu pemrosesan
internal kandidat ONNX yang diamati ~844 ms; bukan jaminan latensi browser
atau pengukuran kamera pengguna.

Script setup: `services/face-anti-spoofing/setup_minifas_candidate.py`.
Script ekspor dan pemeriksaan: `export_minifas_candidate.py`, memakai
`minifas_reference.py` dan arsitektur berlisensi yang sudah ada di `reference/`.
Aset/manifest/parity disimpan di `.cache/face-pad-candidate/models/` (ignored).
Paket ekspor ONNX dipasang terisolasi di `.cache/face-pad-candidate/export-packages/`;
tidak mengganti paket runtime existing. Runtime kandidat memakai lingkungan
`.cache/face-pad-runtime-comparison`. Setup runtime/cache masih lokal Windows,
bukan paket deployment lintas lingkungan.

## Validasi yang dijalankan

- Python `test_minifas_candidate.py`: **5 PASS**; piksel crop sama dengan kode
  upstream pada landscape, portrait dan tepi; kelas/ensemble; bobot rusak;
  output nonfinite; pipeline ONNX aktual pada fixture publik; tanpa wajah.
- Backend `face-pad-candidate.test.ts` (utils): **PASS**, proses ONNX aktual
  di bawah deadline rute, checksum, validasi kelas/crop/model dan proyeksi.
- Backend `face-pad-candidate.test.ts` (routes): **PASS**, auth aktual dengan
  provider akun sintetis, dev/opt-in, akun nonaktif, binding foto, no-store.
  Inference pada tes HTTP ini di-stub, bukan hasil kamera.
- Frontend `tests/face-candidate.cjs`: **PASS**, pengiriman eksplisit, klik
  ganda, binding foto/request/dimensi/baseline, pembatalan lifecycle, EN/ID.
  Transport di-mock.
- Regresi `tests/quick-face-test.cjs`, backend runner analisis aktual dan
  HTTP analisis lama: **PASS**.
- Frontend dan backend `tsc --noEmit`: **PASS**, keduanya diulang setelah
  penambahan tes baru.
- `git diff --check`: **PASS** untuk perubahan tracked. Mayoritas file face
  masih untracked dari pekerjaan yang sedang berlangsung; tidak di-commit.

## Perbaikan lingkungan lokal yang ditemukan saat uji pengguna

Layanan pilot awalnya gagal menunggu cold start: retry launcher hanya sekitar
7.5 detik ketika koneksi langsung ditolak. Deadline kesiapan cache launcher
ditambah 90 detik; layanan backend/PAD/SFace kemudian terverifikasi siap.

Saat pengguna mengambil foto, ada pula listener IPv6 `::` pada port 3000/5000
di luar pilot IPv4 `127.0.0.1`. Halaman `localhost` menampilkan `PAD_DISABLED`
meskipun pilot aktif. Alamat `NEXT_PUBLIC_API_URL` lokal di `frontend/.env`
diubah dari `http://localhost:5000/api` menjadi `http://127.0.0.1:5000/api`
untuk memilih backend pilot secara eksplisit. Proses lain tidak dihentikan.
Pembaruan env membuat halaman memuat ulang dan menghapus foto sementara;
pengguna sudah diminta mengambil ulang. Ini masalah sambungan terpisah dari
skor spoof MN3 yang sudah berhasil direproduksi sebelumnya.

## Uji manusia yang masih diperlukan

1. Wajah langsung di kamera, tes MN3 kemudian kandidat pada foto identik.
2. Foto wajah ditampilkan di layar HP, tampilkan hanya satu wajah pada
   kamera, jalankan kedua model lagi.

Baca dan catat angka pertama sebelum mengambil ulang; halaman tidak menyimpan
foto/hasil ketika input diganti. Kedua kategori adalah laporan kondisi dari
pengguna, bukan ground truth hasil inferensi model.

Pengambilan pertama berhasil melalui UI setelah alamat API diperbaiki. Kamera
mendeteksi satu wajah; foto 640 x 480 diambil melalui tombol halaman dan diproses
kedua model tanpa error. Kategori yang diminta adalah wajah langsung, tetapi
konfirmasi kondisi fisik tetap memerlukan pengguna. Hasil pada foto identik:

| Model | Real | Spoof |
| --- | --- | --- |
| MN3 | 0.0031274876091629267 | 0.9968724846839905 |
| MiniFASNet ensemble | 0.9985929429531097 | 0.0014070468751015142 |

Waktu internal kandidat 318.32 ms (tidak termasuk jaringan/start proses).
V2 real 0.9976447224617004; V1SE real 0.999541163444519. Kedua crop konteks
dibatasi tinggi frame sehingga persegi panjang inputnya sama, 382 x 480.
Ini bukan dua foto/crop independen. Frontend berhasil memverifikasi checksum
foto, request, dimensi, baseline yang diulang dan agregasi model.

Pengguna kemudian mengonfirmasi pengambilan kedua adalah foto wajah di layar
HP. Hasil telah ditampilkan oleh UI dan diperiksa tanpa mengambil ulang atau
menyalin foto ke file:

| Model | Real | Spoof |
| --- | --- | --- |
| MN3 | 0.00045043646241538227 | 0.9995495676994324 |
| MiniFASNet ensemble | 0.39486950635910034 | 0.6051305048167706 |

Waktu internal kandidat 199.62 ms. V2 real 0.46226492524147034; V1SE real
0.32747408747673035. Kedua crop dibatasi frame menjadi 332 x 480. Model baru
membedakan kedua pengambilan ini, namun margin pada contoh layar lebih kecil
daripada contoh pertama. Kedua uji bukan estimasi FAR/FRR/APCER/BPCER dan
tidak membuktikan ketahanan terhadap foto/video, perangkat, atau pencahayaan
lain. Tidak ada perubahan threshold, pembalikan label, atau promosi model
otomatis. Login wajah penuh masih belum diimplementasikan.
