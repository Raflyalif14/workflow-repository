# Tahap 9F — Smoke test pretrained anti-spoof-mn3 pada CPU

Tanggal: **13 Oktober 2026**. **Bobot ONNX pretrained berhasil dimuat dan
forward CPU berhasil**, memakai gambar sintetis saja. Belum menguji wajah
langsung/foto/video, akurasi PAD, atau mengaktifkan login wajah.

## Pergantian kandidat dan baseline

Pengguna memilih anti-spoof-mn3 menggantikan kandidat MiniFASNet. Tahap 9A–9E
dipertahankan sebagai arsip; hasil arsitektur acak 9E tidak dianggap bukti
model baru. Tidak menunggu klarifikasi aset MiniFASNet untuk eksperimen ini.

Git aktual: `feat/face-verification`, HEAD `58bc3d7`, staging kosong. Snapshot
SHA-256 dibuat sebelum perubahan untuk **120 file existing dirty/untracked**.
Tidak stage/commit/push/fetch/pull/checkout/merge/reset. Tidak mengubah runner
9B, SFace, threshold London, backend, frontend, auth, database atau layanan.

Environment PAD 9D dipakai kembali: `.cache/face-anti-spoofing-cpu`, Python
3.10.0 x64, NumPy 2.2.6, opencv-python-headless 4.13.0.92 (runtime `cv2` 4.13.0).
Tidak menginstall paket, membuat venv, mengubah dependency, atau menjalankan
suite MiniFASNet/London/aplikasi. ONNX Runtime tidak diperlukan karena OpenCV
DNN existing berhasil mengimport dan mengeksekusi model pada CPU.

## Sumber dan lisensi yang diperiksa

Open Model Zoo dipin pada **`eda1863a6d60b09551df9d039cff2377d6ddd4d6`**;
original repository pada **`82a2c26bacff5462c6f9320c34ae0363ccbed497`**.
Metadata API/teks diambil read-only, tanpa operasi Git fetch.

- [README model OMZ][readme] menyebut original model berlisensi MIT.
- [LICENSE original][mit] adalah MIT, copyright 2020 Prokofev Kirill.
- [Jawaban Zulkifli_Intel, Moderator, 1 Oktober 2025][intel] secara eksplisit
  membahas ONNX weights dan menyatakan penggunaan/redistribusi diizinkan
  dengan retensi copyright/license serta atribusi. Pernyataan itu merupakan
  bukti publik pendukung keputusan eksperimen lokal, bukan jaminan seluruh
  hak pihak ketiga, kualitas PAD, atau izin produksi aplikasi ini.
- **Perbedaan sumber:** [model.yml][model] menunjuk LICENSE pada
  `kirillProkofiev/training_extensions`, branch `kp/antispoofing`, yang
  ternyata berisi **Apache 2.0**, bukan MIT. Teksnya dipin/dicocokkan pada
  commit **`84459ca1c32967c145f5feb27d2ad84aa64960e8`**. Perbedaan ini dicatat
  eksplisit; kedua notices penuh dipertahankan, tidak menyatakan semua
  sumber konsisten MIT. Scope redistribusi/produksi perlu ditinjau lagi jika
  kemudian diminta; tahap ini tidak membagikan bobot atau deploy aplikasi.

Referensi lisensi/atribusi: `services/face-anti-spoofing/reference/mn3/`.
Sumber, revisi dan hash teks mentah tercatat di `sources.json`. Tidak menyalin
atau mengeksekusi demo upstream, yang dapat membuka kamera/menulis video.

## Aset pretrained dan checksum

Model dari URL HTTPS resmi dalam model.yml:

`https://storage.openvinotoolkit.org/repositories/open_model_zoo/public/2022.1/anti-spoof-mn3/anti-spoof-mn3.onnx`

Lokasi lokal, di luar repo:

`C:\Users\Rafli\Downloads\face-experiment-assets\anti-spoof-mn3\anti-spoof-mn3.onnx`

| Pemeriksaan | Hasil |
| --- | --- |
| Ukuran | **12,270,179 byte**, cocok dengan model.yml |
| Algoritma checksum OMZ | **SHA-384**; [Checksum.deserialize][checksum] menetapkan string checksum sebagai sha384 |
| SHA-384 | `6de4534964b723397b3e8c995cadcf43bc007cc2f9930b95ae25f76adccece5d1d4d058d0b15117b9e4a9f758424f92a`, cocok |
| SHA-256 lokal | `c4c99af04603b62d7e44f6f4daeb33e0daeccc696008c0b1d62f6f5cebbb3262` |
| Binary | Tidak dimodifikasi, tidak dimasukkan Git |
| Notices di folder aset | LICENSE MIT, model-yml-LICENSE Apache, NOTICE.txt, asset-provenance.json |

Pengambilan dibatasi ukuran/checksum dan memakai exclusive creation. Aset
berbeda tidak dioverwrite. Adapter memeriksa ukuran serta kedua hash sebelum
import, lalu memuat **bytes yang telah diverifikasi**, tidak membaca ulang
path setelah verifikasi. Nama/provenance model bukan sekadar label: smoke
benar-benar memuat aset tersebut.

## Adapter, preprocessing, dan output

Adapter baru: `services/face-anti-spoofing/mn3_offline.py`, terpisah dari
`offline_pad.py` dan inference identitas. Tidak memiliki akses jaringan,
detector, kamera, endpoint, enrollment ataupun sesi autentikasi.

`Mn3CpuAdapter.infer_patch()` menerima patch caller berupa BGR uint8 tiga
kanal di memori, bukan tensor yang sudah dinormalisasi. Ini kontrak ROI;
patch manual tidak membuktikan ada satu wajah. CLI 9F hanya menghasilkan
fixture sintetis sendiri dan tidak menerima foto peserta.

1. Resize patch ke 128×128 dengan **INTER_CUBIC**, mengikuti interpolasi
   accuracy-check OMZ dan preprocessing demo original. Crop kamera belum
   dibuat pada tahap ini.
2. BGR → **RGB**, float32. Normalisasi byte-scale **sekali**:
   `(RGB - [151.2405,119.5950,107.8395]) / [63.0105,56.4570,55.0035]`.
   Tidak `/255` lagi, tidak memakai normalisasi MiniFASNet atau ImageNet.
3. NCHW contiguous **[1,3,128,128]**, input `actual_input_1`. Mengikuti
   **ONNX original**, bukan aturan BGR pada converted OpenVINO IR.
4. OpenCV DNN backend OpenCV, target CPU, output `output1` **[1,2]**.
   README memetakan indeks **0 real, 1 spoof**. Importer menunjukkan terminal
   **Softmax → Identity(output1)**; nilai diperiksa finite, 0–1 dan jumlah
   mendekati 1. **Tidak menambah softmax kedua.**

Nilai dua kelas dapat tersedia sebagai metadata infer_patch yang valid,
tetapi tidak diberi threshold/argmax atau label LIVE/SPOOF pada tahap ini.
Smoke hanya menyimpan shape, boolean pemeriksaan dan durasi; tidak menyimpan
vektor skor sintetis. `SUCCESS` berarti eksekusi berhasil, bukan liveness.
`prediction` selalu null. Input salah/aset hilang/hash salah/exception/output
rusak menghasilkan ERROR dengan probabilitas/prediksi kosong. Exception
mentah, path input, pixels dan embedding tidak masuk hasil.

Array patch caller dipertahankan. Tensor/output sementara dibersihkan setelah
inference; cleanup ini bukan jaminan penghapusan forensik salinan runtime.
Adapter caller-owned, satu eksperimen offline, tidak thread-safe. Ini bukan
handler server untuk input tidak terpercaya; tidak membuka endpoint publik.

## Pengujian yang benar-benar dilakukan

- **14 test terarah PASS**, 0 SKIP, 0 FAIL/ERROR: RGB/mean/std sekali,
  cubic resize dan orientasi, input invalid sebelum resize, probabilitas
  tanpa softmax ulang, output rusak/non-finite, missing model/size/hash,
  exception aman, cleanup tensor ketika forward gagal, trial ID dan
  penolakan overwrite bukti. Fixture guard memakai piksel sintetis/mock;
  angka mock tidak menggantikan pretrained inference.
- Smoke pretrained nyata: **3 kasus sintetis PASS**, masing-masing **3
  forward** (9 total), constant/pattern/noise seed 42. Shape [1,2], finite,
  jumlah probabilitas valid, source tidak berubah. Selisih maksimum antara
  pengulangan pada runtime ini **0.0**, toleransi rtol=1e-5/atol=1e-6.
- Durasi forward tercatat sekitar **5.25–24.80 ms**; load sekitar **78.47 ms**.
  Pengamatan eksekusi ini bukan benchmark kamera/pretrained terkontrol:
  tanpa warmup/isolasi beban, tidak mencakup detector atau capture, dan bukan
  angka performa aplikasi/login.
- Bukti: [face-verification-stage9f-results.json](face-verification-stage9f-results.json).
  Test tidak mengukur akurasi PAD/APCER/BPCER/ACER; tidak ada ground truth
  LIVE/SPOOF pada piksel sintetis, threshold PAD tidak ditetapkan.
- Syntax/UTF-8/whitespace, retensi SHA-256 120 file existing, staging dan
  inventaris dependency PAD diperiksa terarah. Tidak mengulang tahap 1–8/9E.

## Crop contoh resmi untuk tahap kamera berikutnya

Sumber diperiksa pada commit pin; **belum menjadi implementasi crop proyek**.

| Contoh | Aturan yang ditemukan |
| --- | --- |
| [Original FaceDetector][original-crop] + [demo][original-demo] | SSD `face-detection-0100`, confidence default 0.6, bbox diperluas lebar **1.1×** dan tinggi **1.05×**; frame ROI slice top:bottom/left:right. Tidak alignment lima landmark. Contoh ini tidak menyediakan seluruh guard batas/jumlah wajah yang diperlukan proyek. |
| [OMZ interactive_face_detection_demo][omz-crop] + [main][omz-main] | Bbox dijadikan persegi berdasar sisi maksimum, diperluas default **1.2×**, dx/dy default 1; ROI diintersect dengan batas frame lalu dikirim ke classifier. Ini contoh berbeda, bukan crop identik original. |

Tidak ada alasan memakai crop SFace 112×112 atau scale konteks MiniFASNet
2.7/4.0. Dukungan input patch ini tidak membenarkan meregangkan seluruh
webcam 16:9 menjadi wajah 128×128. Rasio frame native bisa dipertahankan;
yang diresize adalah ROI dengan geometri/context yang terdokumentasi.

Untuk pilot berikutnya, tentukan detector dan versi crop secara eksplisit.
YuNet existing dapat dipertimbangkan **sebagai varian terpisah**, dengan
tepat satu wajah, bbox valid, clipping/context tercatat; tidak mengklaim
kesetaraan detector/crop upstream. Belum mengunduh detector tambahan.

## Menjalankan smoke kembali hanya jika kode/runtime/aset berubah

```powershell
Set-Location -LiteralPath 'D:\Workflow Repository System'
& '.\.cache\face-anti-spoofing-cpu\Scripts\python.exe' -B `
  '.\services\face-anti-spoofing\mn3_offline.py'
```

`--model <path>` opsional; bytes tetap wajib cocok dengan hash. `--output`
metadata opsional menolak overwrite. Test baru:

```powershell
& '.\.cache\face-anti-spoofing-cpu\Scripts\python.exe' -B `
  '.\services\face-anti-spoofing\tests\test_mn3_offline.py'
```

## File baru dan langkah berikutnya

Delapan file baru: adapter, test terarah, laporan ini, results JSON, serta
reference/mn3/{LICENSE, MODEL-YML-APACHE-LICENSE, NOTICE.md, sources.json}.
Aset binary/notices lokal di Downloads dan cache audit di `.cache/stage9f`
berada di luar daftar source Git. Laporan/lisensi MiniFASNet tidak berubah.

Berikutnya: siapkan pilot wajah langsung versus foto sendiri di layar HP,
dengan detector/crop dinyatakan sebagai varian, guard tanpa/multi-wajah dan
pemisahan sesi/media development/evaluasi menurut protokol 9A. Kemudian
ukur output PAD nyata dan coverage, terpisah dari cosine SFace. Tidak boleh
menyebut skor sintetis sebagai keamanan login atau memasang threshold London
ke PAD. Kamera peserta, enrollment, integrasi UI/auth dan login belum dilakukan.

[readme]: https://github.com/openvinotoolkit/open_model_zoo/blob/eda1863a6d60b09551df9d039cff2377d6ddd4d6/models/public/anti-spoof-mn3/README.md
[model]: https://github.com/openvinotoolkit/open_model_zoo/blob/eda1863a6d60b09551df9d039cff2377d6ddd4d6/models/public/anti-spoof-mn3/model.yml
[checksum]: https://github.com/openvinotoolkit/open_model_zoo/blob/eda1863a6d60b09551df9d039cff2377d6ddd4d6/tools/model_tools/src/omz_tools/download_engine/cache.py
[mit]: https://github.com/kprokofi/light-weight-face-anti-spoofing/blob/82a2c26bacff5462c6f9320c34ae0363ccbed497/LICENSE
[intel]: https://community.intel.com/t5/Intel-Distribution-of-OpenVINO/Anti-spoof-mn3/m-p/1721874
[original-crop]: https://github.com/kprokofi/light-weight-face-anti-spoofing/blob/82a2c26bacff5462c6f9320c34ae0363ccbed497/demo_tools/wrapers.py
[original-demo]: https://github.com/kprokofi/light-weight-face-anti-spoofing/blob/82a2c26bacff5462c6f9320c34ae0363ccbed497/demo/demo.py
[omz-crop]: https://github.com/openvinotoolkit/open_model_zoo/blob/eda1863a6d60b09551df9d039cff2377d6ddd4d6/demos/interactive_face_detection_demo/cpp/detectors.cpp
[omz-main]: https://github.com/openvinotoolkit/open_model_zoo/blob/eda1863a6d60b09551df9d039cff2377d6ddd4d6/demos/interactive_face_detection_demo/cpp/main.cpp
