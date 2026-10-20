# Tahap 9B — Harness offline CPU anti-spoofing

Tanggal: 12 Oktober 2026. Lingkup: kerangka runner, preprocessing dan test sintetis.
**Belum ada detector/bobot PAD, inference nyata, atau integrasi aplikasi/login.**

## Baseline dan file baru

Branch aktual `feat/face-verification`, HEAD `58bc3d7`, staging kosong.
Seluruh 98 file dirty/untracked tahap sebelumnya dipertahankan.
Kajian [9A](face-verification-stage9a.md) dibaca sebelum implementasi.

Harness terpisah di `services/face-anti-spoofing/`:

- `offline_pad.py`: validasi frame/bbox, crop konteks, array tensor NumPy,
  kontrak hasil aman dan CLI preprocessing saja.
- `tests/test_offline_pad.py`: fixture piksel/output sintetis, tanpa foto wajah.
- `reference/generate_patches.py`: referensi crop upstream pada commit pin.
- `reference/LICENSE`, `reference/NOTICE.md`, `reference/sources.json`:
  lisensi, atribusi, sumber dan checksum representasi UTF-8/LF.
- `requirements-cpu.plan.txt`: rencana direct dependency terpin untuk venv
  PAD terpisah; belum diinstall dan bukan lock seluruh dependency transitif.
- Dokumen ini.

Tidak ada edit pada `inference.py`, environment Python identitas, model,
threshold London, backend/frontend, auth, database, layanan, atau laporan lama.
Tidak menjalankan Git fetch/pull maupun operasi branch/staging/commit/push.

## Kontrak input/output

`run_preparation(trial_id, frame, bbox=None)` menerima:

| Input | Aturan |
| --- | --- |
| `trial_id` | Kode percobaan 1–64 karakter: huruf, angka, `_ . : -`; jangan nama/email |
| `frame` | Frame kamera asli yang sudah dibekukan; ndarray uint8 HWC BGR, tiga kanal; bukan crop SFace atau preview mirror |
| Dimensi | Lebar/tinggi 2–4096, maksimal 8 juta piksel; rasio lebar:tinggi tepat 3:4 |
| `bbox` | Opsional `[x,y,width,height]`, finite, positif, seluruhnya di dalam frame. Caller bbox hanya membantu uji crop, bukan bukti detector menemukan satu wajah |

Frame array dipinjam selama satu panggilan; tidak disimpan global atau diubah.
Caller bertanggung jawab melepas frame asal setelah selesai. Patch dan array
tensor sementara yang dibuat runner dibersihkan setelah digunakan.
CLI membersihkan array frame yang dimilikinya sendiri. Ini cleanup resource
aplikasi, bukan jaminan penghapusan forensik seluruh salinan memori runtime.

Hasil berupa JSON metadata, tanpa pixels/embedding atau path input:

| Field | Arti |
| --- | --- |
| `schema_version`, `trial_id`, `started_at`, `duration_ms` | Versi kontrak, kode yang divalidasi, waktu UTC proses dan durasi monotonic total |
| `status`, `reason` | ERROR/INCONCLUSIVE dan kode aman; pesan exception mentah tidak dicetak |
| `frame`, `prepared` | Dimensi, kotak crop inklusif, bentuk array, sumber bbox caller dan durasi preprocessing tiap patch |
| `per_model` | Nama masing-masing kandidat, `NOT_RUN`, probabilitas dan durasi inference `null` selama bobot belum tersedia |
| `combined`, `prediction` | Selalu `null` pada runner tahap 9B; gagal bukan skor 0 atau LIVE |
| `provenance` | Commit upstream, versi preprocessing, CPU, Python/OpenCV/NumPy aktual; nama kandidat model/detector dan SHA-256 `null`, `loaded=false`, `model_inference_enabled=false` |

Nama kandidat dalam provenance bukan bukti model digunakan. Tidak ada loader
model, import PyTorch, request jaringan, pencarian/download bobot, atau adapter
yang mengizinkan hasil fixture menjadi inference runner.

Jika kelak ada adapter nyata: `per_model` harus memuat tiga probabilitas kelas,
durasi dan provenance aset yang benar-benar dimuat; `combined` memuat rata-rata
dua vektor, indeks kelas pemenang serta skor kelas pemenang. Hasil harus tetap
terikat pada frame/ID percobaan tersebut. Adapter itu belum diimplementasikan;
status sukses tidak boleh dibuat hanya karena preprocessing selesai.

### Status dan alasan yang benar-benar ditangani

- ERROR: `MODEL_UNAVAILABLE`, `DETECTOR_UNAVAILABLE`, `FRAME_INVALID`,
  `FRAME_DIMENSIONS_INVALID`, `TRIAL_ID_INVALID`, `FRAME_READ_FAILED`,
  `FRAME_BYTES_EXCEEDED`, `PREPROCESSING_FAILED`.
- INCONCLUSIVE: `FRAME_RATIO_UNSUPPORTED`, `BBOX_INVALID`,
  `CROP_SCALE_UNSUPPORTED`; fixture agregasi juga menolak `CLASS_TIE`.
- Respons fixture tidak lengkap/non-finite/invalid: ERROR, tanpa skor gabungan
  atau prediksi. Kegagalan tidak menghasilkan LIVE.
- Tidak ada pemeriksaan jumlah wajah nyata: detector belum tersedia. Bbox manual
  bukan pengganti validasi wajah. Status missing detector tetap ERROR.

## Preprocessing dan referensi upstream

Commit: **`b6d5f04ad78778917853b25c778acef6d5626d15`**.

| Bagian | Baseline implementasi |
| --- | --- |
| Dua kandidat | `2.7_80x80_MiniFASNetV2.pth` dan `4_0_0_80x80_MiniFASNetV1SE.pth` |
| Crop | Perbesar bbox terhadap pusat, scale 2.7/4.0; clamp scale ke dimensi sumber; shift ke batas frame; truncation integer; slice ujung inklusif |
| Resize | OpenCV INTER_LINEAR, masing-masing patch 80×80 |
| Warna | BGR tetap BGR; tidak swap RGB dan tidak mirror |
| Array tensor | Float32, NCHW `[1,3,80,80]`, nilai 0–255; tidak `/255`, mean/std, alignment atau normalisasi ImageNet |

Geometri diadaptasi dari [generate_patches.py upstream][crop]; file referensi
asli dipertahankan untuk membandingkan hasil. Guard input, pembatasan scale,
array NumPy dan cleanup merupakan perubahan proyek, dicatat di NOTICE.
Valid bbox yang diterima dibandingkan dengan referensi; input invalid ditolak
sebelum reference/resize, karena reference tidak menyediakan guard tersebut.

Array numerik mengikuti operasi ndarray pada
[functional.to_tensor][functional]. Komentar ToTensor upstream tentang 0–1
tidak sesuai implementasi 0–255. Array NumPy ini **belum menjadi bukti tensor
PyTorch**: PyTorch tidak tersedia; test konversi PyTorch dilewati secara jelas.

### Rasio sumber dan decoding

[test.py][test] memeriksa width/height = 3/4. Runner menolak 16:9 atau rasio lain
sebelum crop/resize; tidak meregangkan, melakukan centre crop, padding, maupun
membalik frame diam-diam. Batas ini mengikuti wrapper contoh, bukan kesimpulan
bahwa jaringan mustahil menerima rasio lain.

CLI memakai `--frame` untuk file frame yang pengguna sendiri pilih, maksimum
4 MiB; decoding OpenCV menjadi BGR tanpa menerapkan rotasi EXIF tambahan
(`IMREAD_IGNORE_ORIENTATION`). Gunakan frame capture asli yang orientasi pixelnya
sudah benar, misalnya PNG kamera; CLI bukan pipeline normalisasi JPEG arbitrer.
Kesetaraan decoding/EXIF terhadap `cv2.imread` upstream belum diuji. Pembatasan
dimensi diperiksa pada array hasil decoding; ini harness offline, bukan handler
server untuk input tidak terpercaya. Jangan memberi endpoint publik kepadanya.

Opsi tahap integrasi berikutnya: (a) capture portrait 3:4 terkontrol sebagai
baseline, atau (b) dukungan rasio native sebagai varian preprocessing tersendiri.
Pilihan (b) harus dibandingkan pada frame yang sama untuk geometri/context dan
hasil PAD; jangan menyebut webcam 16:9 setara hanya karena patch akhir 80×80.
Penggantian RetinaFace dengan YuNet juga varian tersendiri, bukan memakai crop
alignment SFace. Tidak ada adaptasi itu pada tahap ini.

## Test pemetaan/agregasi sintetis

`aggregate_synthetic_outputs()` adalah utility test logika, **tidak dipanggil
runner**. Input harus memuat tepat dua nama kandidat dengan vektor softmax tiga
kelas yang finite, bernilai 0–1 dan jumlah mendekati 1. Tidak menerima logits,
model tambahan, model hilang atau string angka.

Sesuai [test.py][test], dua vektor dijumlahkan; argmax dipakai jika pemenangnya
unik, nilai gabungan dibagi dua. Kelas 1 dipetakan LIVE; kelas 0/2 SPOOF tanpa
menebak jenis serangannya. Tidak memakai threshold London atau threshold PAD
baru. Tie menghasilkan INCONCLUSIVE (guard tambahan, berbeda dari pemilihan
indeks pertama upstream). Semua hasil sukses utility diberi
`evidence=SYNTHETIC_LOGIC_ONLY`; angka fixture bukan skor model.

## Rencana dependency CPU terpisah

Belum membuat venv baru atau menginstall paket. Existing `.venv` identitas
dibaca/dipakai untuk test crop saja: Python 3.10.0 x64, OpenCV headless
4.13.0.92, NumPy 2.2.6, Pillow 12.3.0; PyTorch belum terpasang.

Rencana direct pins dalam `requirements-cpu.plan.txt`:

| Komponen | Kandidat rencana | Batas bukti |
| --- | --- | --- |
| Python | 3.10 x64, venv PAD baru terpisah | Reuse interpreter tanpa mengubah venv identitas; lifecycle/security runtime perlu ditinjau sebelum setup berikutnya |
| torch | 2.8.0+cpu dari indeks resmi CPU | Wheel `cp310-cp310-win_amd64` tercantum; belum diinstall/diuji dengan bobot upstream |
| NumPy | 2.2.6 | Dipakai test crop; konversi PyTorch belum diuji |
| OpenCV headless | 4.13.0.92 | Dipakai test crop, bukan uji detector Caffe |

[Indeks CPU PyTorch][torch-index] dan [metadata rilis 2.8.0][torch-release]
mendukung keberadaan kandidat wheel/runtime. Ini kandidat reproduksi, bukan
klaim versi terbaru atau kompatibilitas inference sudah lulus. Jangan memakai
requirements lama Torch 1.2.0 langsung pada Python 3.10 existing.

Tidak membutuhkan torchvision, training suite, atau Pillow untuk harness
ndarray saat ini. Dependency transitif Torch belum di-resolve/dipin; sebelum
setup yang diizinkan, review wheel/checksum dan buat lock dalam environment
terpisah. Kompatibilitas state dict, safe loading, dimensi softmax eksplisit,
numerik dan latency harus diperiksa saat aset boleh dipakai. Jangan memuat
checkpoint tidak dikenal atau mengubah environment SFace untuk percobaan ini.

## Lisensi kode dan kendala aset

Kode referensi diambil dari commit resmi dan dilengkapi root
[Apache-2.0 LICENSE][license], atribusi Minivision/zhuying dan NOTICE perubahan.
Hash SHA-256 yang dicatat merupakan UTF-8 tanpa BOM dengan LF:

- `generate_patches.py`: `cd33552d5ca920088143daafceba3c19b7a64bf9aac125241803e1b4af698d65`
- `LICENSE`: `daf94bf1dc9cc5700fe5af2c7c0cbd1836e70d509ed78fd0bebef7432edee6fb`

Hanya dua file teks sumber/lisensi diambil; tidak mengambil `.pth`,
`.caffemodel`, foto contoh atau data training. Referensi source bukan bobot.

Ketentuan khusus dua [bobot PAD][weights], bobot RetinaFace pihak ketiga, serta
provenance/hak training data tetap belum cukup jelas dari sumber yang diperiksa
9A. README menyebut model terbuka dan root license tersedia, tetapi jangan
menyamakan lisensi library/kode dengan kepastian izin seluruh aset. Nama
detector terkonfirmasi dari [predictor upstream][predict]. Checksum/isi bobot
belum diperiksa. Maintainer tidak dihubungi. Ini masih gate sebelum mengambil,
memuat atau meredistribusikan aset pada tahap berikutnya.

## Hasil validasi yang benar-benar dijalankan

19 test terarah: **18 PASS, 1 SKIP, 0 FAIL**.

| Pemeriksaan | Bukti |
| --- | --- |
| Crop versus fungsi referensi upstream | PASS bit-for-bit pada 74 kasus: 2 tengah, 12 tepi/clamp/fractional, 60 bbox seed-42 acak; kedua scale; OpenCV/NumPy existing |
| BGR, float32, NCHW, 0–255, tidak mirror/normalisasi | PASS dengan pola piksel dan kanal sintetis; frame sumber tidak berubah |
| Invalid bbox/frame/scale dan rasio 16:9 | PASS; invalid input ditolak sebelum resize, tanpa adaptasi tersembunyi |
| Konversi tensor PyTorch | SKIP: PyTorch tidak tersedia; bukan parity runtime ToTensor yang sudah lulus |
| Ensemble, mapping kelas, denominator, tie, output invalid/non-finite | PASS dengan probabilitas sintetis; bukan prediksi model |
| Model/detector tidak tersedia, exception, trial ID | PASS: error aman, tidak ada LIVE atau skor palsu; input sensitif tidak diecho |
| CLI | PASS dengan PNG piksel sintetis sementara; missing/corrupt/size limit; tidak membuat file output dan temporary directory test dibersihkan |
| Cleanup runner | PASS: patch/tensor sementara dibersihkan, frame caller dipertahankan |
| Syntax, UTF-8 strict, whitespace/diff, preservasi existing | Diperiksa terarah; tidak mengulang test aplikasi/identitas |
| PAD model/detector nyata, CPU latency, kamera live/spoof | BELUM DIJALANKAN; tidak ada bobot/detector yang dimuat |

Kesetaraan yang terbukti terbatas pada crop referensi dengan runtime OpenCV
yang sama dan kasus di atas. Tidak membuktikan detector, Torch softmax/model,
cross-version numerics, anti-spoofing, atau keamanan login.

### Menjalankan ulang test terarah bila harness berubah

```powershell
Set-Location -LiteralPath 'D:\Workflow Repository System'
$padHarness = (Resolve-Path -LiteralPath 'services\face-anti-spoofing').Path
& '.\services\face-experiment\.venv\Scripts\python.exe' -B -c `
  "import sys,unittest; sys.path.insert(0,sys.argv[1]); suite=unittest.defaultTestLoader.discover(sys.argv[1]+'/tests',pattern='test_offline_pad.py'); result=unittest.TextTestRunner(verbosity=2).run(suite); sys.exit(not result.wasSuccessful())" $padHarness
if ($LASTEXITCODE -ne 0) { throw 'Stage 9B targeted tests failed.' }
```

`-B` mencegah penulisan bytecode. Tidak perlu mengulang suite frontend/backend,
model London, atau memulai server. Tidak ada foto peserta dalam test/screenshot.

## Langkah terkecil berikutnya

1. Klarifikasi ketentuan bobot PAD/detector dan pin sumber aset sebelum download.
2. Setelah setup terpisah diizinkan, resolve/lock dependency CPU dan buktikan
   konversi Torch serta load/inference dengan provenance aset nyata.
3. Baru lakukan pilot kamera/media mengikuti pemisahan sesi/sumber 9A. Tetap
   terpisah dari SFace, threshold identitas, enrollment dan login.

[crop]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/src/generate_patches.py
[functional]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/src/data_io/functional.py
[test]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/test.py
[license]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/LICENSE
[weights]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/tree/b6d5f04ad78778917853b25c778acef6d5626d15/resources/anti_spoof_models
[predict]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/src/anti_spoof_predict.py
[torch-index]: https://download.pytorch.org/whl/cpu/torch/
[torch-release]: https://pypi.org/project/torch/2.8.0/
