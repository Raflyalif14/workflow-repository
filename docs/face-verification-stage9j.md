# Tahap 9J — OpenCV DNN versus ONNX Runtime CPU

Tanggal: **13 Oktober 2026**. Git aktual: `feat/face-verification`, HEAD
`58bc3d7`, staging kosong. **PASS untuk lima fixture yang diuji**, bukan
validasi akurasi PAD atau penjelasan hasil wajah langsung pengguna.

## Pertanyaan dan batas bukti

9F memuat ONNX pada OpenCV CPU; 9G memakai frame → YuNet → crop konteks 1.2;
9I menambahkan geometri tanpa mengubah inferensi. Diagnosis 9H tersedia di
percakapan, tidak ditemukan dokumen 9H di repo. Diagnosis tersebut tidak
menemukan bug binding, warna, normalisasi atau mapping kelas.

CSV geometry-v1 pengguna diperiksa read-only: enam SUCCESS/checksum berbeda,
640×480, satu wajah setiap tangkapan, tiga LIVE tanpa clipping dan satu
SCREEN_PHOTO dengan clipping. CSV lama dipertahankan dan tidak disalin ke
Git. Frame asli tidak tersedia, sehingga tahap ini **tidak menjalankan kedua
runtime pada enam capture tersebut**. Tidak menetapkan threshold dari pilot,
tidak mengubah label berdasarkan probabilitas, tidak membuka kamera.

Pertanyaan terbatas: apakah **bytes model serta tensor input identik**
menghasilkan dua probabilitas yang sebanding pada kedua runtime? PASS tidak
berarti kedua runtime pasti sama untuk semua input, upstream crop setara,
atau model siap liveness/login. Penyebab spoof LIVE tinggi **belum terbukti**.

## Environment terpisah dan sumber paket

Venv baru: **`.cache/face-pad-runtime-comparison`**, diabaikan Git oleh
`.gitignore` existing. Python **3.10.0 x64**, system site packages **false**.
Tidak ada environment/hasil 9J sebelumnya yang ditemukan. Environment PAD
`.cache/face-anti-spoofing-cpu` dan identity `services/face-experiment/.venv`
dipertahankan; tidak restart/mengubah layanan pilot.

[Instalasi resmi ORT](https://onnxruntime.ai/docs/install/) membedakan paket
CPU `onnxruntime` dari GPU/DirectML. Paket dipin **1.23.2** dari maintainer
Microsoft di [PyPI resmi](https://pypi.org/project/onnxruntime/1.23.2/), wheel
**cp310-cp310-win_amd64**, Python ≥3.10. Inventaris PyPI saat tugas menunjukkan
rilis terbaru 1.31.0 memerlukan Python ≥3.11; 1.23.2 adalah wheel cp310 Windows
x64 non-yanked terbaru yang ditemukan. Ini pilihan kompatibilitas untuk
pembandingan lokal, bukan pembaruan runtime aplikasi. Persyaratan Windows
Visual C++ runtime disebut dokumentasi; import dan forward aktual berhasil
tanpa menginstall runtime sistem tambahan.

| Paket terpasang | Versi |
| --- | --- |
| onnxruntime (CPU) | 1.23.2 |
| numpy | 2.2.6 |
| opencv-python-headless / `cv2` | 4.13.0.92 / 4.13.0 |
| pillow | 12.3.0 |
| coloredlogs / humanfriendly / pyreadline3 | 15.0.1 / 10.0 / 3.5.4 |
| flatbuffers / packaging / protobuf | 25.12.19 / 26.3 / 7.36.2 |
| sympy / mpmath | 1.14.0 / 1.3.0 |
| pip / setuptools | 26.2 / 84.0.0 |

NumPy, OpenCV dan Pillow sama dengan PAD baseline. SHA-256 teks
`cv2.getBuildInformation()` kedua environment sama:
`fc048a2b6c657a1e163e8591b98100d585d65bacf1d1f1a6e28659cae3b531f1`.
Tidak menginstall torch, onnx, GPU provider atau framework lain. Paket selain
decoder/runtime mengikuti dependency ORT yang dideklarasikan dan transitive
Windows; pip/setuptools adalah tooling venv.

**Inventaris bukan lock:** versi aktual serta metadata/url/filename/ukuran/
SHA-256 setiap 14 wheel ada di
[environment evidence](face-verification-stage9j-environment.json).
Lock reproduksi Windows x64/Python 3.10 berisi URL wheel eksak dan hash:
`services/face-anti-spoofing/requirements-runtime-comparison.stage9j.lock.txt`.
Semua wheel berasal dari `pypi.org`/`files.pythonhosted.org`, checksum download
dicocokkan dengan metadata PyPI, kemudian pip memasang dengan
`--isolated --no-deps --require-hashes`; **pip check PASS**. Tidak memakai
global pip atau venv identity/PAD untuk instalasi. Hash membuktikan konsistensi
artifact PyPI, bukan audit keamanan seluruh dependency.

Hambatan setup terbatas: sandbox tidak dapat menjangkau PyPI, akses jaringan
scoped yang diizinkan dipakai hanya untuk wheel. Protobuf memiliki wheel
universal dan native; seleksi diperjelas ke cp310-abi3-win_amd64 sebelum
instalasi. Tidak ada download bobot/detector atau percobaan setup berulang.

## Bytes, tensor dan konfigurasi

ONNX existing tetap di Downloads/face-experiment-assets/anti-spoof-mn3.
Harness membaca **sekali**, memeriksa ukuran dan kedua checksum, lalu
mengirim bytes tersebut ke OpenCV buffer loader dan `InferenceSession(bytes)`.

- Ukuran: **12,270,179 byte**.
- SHA-384: `6de4534964b723397b3e8c995cadcf43bc007cc2f9930b95ae25f76adccece5d1d4d058d0b15117b9e4a9f758424f92a`.
- SHA-256: `c4c99af04603b62d7e44f6f4daeb33e0daeccc696008c0b1d62f6f5cebbb3262`.
- Sumber/ketentuan bobot dipertahankan dari [9F](face-verification-stage9f.md),
  OMZ commit `eda1863a6d60b09551df9d039cff2377d6ddd4d6`.

Preprocessing dipakai ulang melalui **`mn3_offline.prepare_patch()` sekali
per fixture**: cubic 128, BGR → RGB float32, mean/std byte-scale existing,
contiguous NCHW **[1,3,128,128]**. Tidak `/255`, normalisasi kedua, softmax
tambahan, class swap atau threshold. **ndarray yang sama** dipakai pada
enam call per fixture. SHA-256 tensor diperiksa setelah setiap call; sumber
patch juga diperiksa tidak berubah. Hanya hash/metadata tersimpan, bukan
array/pixel. Tensor/ROI/frame/output sementara dibersihkan setelah dipakai;
proses offline berakhir, tanpa klaim penghapusan forensik salinan native.

Mengikuti [API ORT resmi](https://onnxruntime.ai/docs/api/python/api_summary.html):
`CPUExecutionProvider` eksplisit, fallback dinonaktifkan, sequential,
intra/inter-op satu thread, `ORT_ENABLE_ALL`. OpenCV memakai
`DNN_BACKEND_OPENCV`, `DNN_TARGET_CPU`, satu thread. Tidak mengganti runtime
aplikasi. Tidak profiling yang menyimpan tensor atau optimized model.

Catalog nyata: input **actual_input_1**, tensor(float), [1,3,128,128]; output
**output1**, tensor(float), [1,2]. ORT hanya CPUExecutionProvider. OpenCV
output1 dengan terminal Softmax → Identity. Setiap output dicek float32,
shape [1,2], finite, 0–1, jumlah mendekati 1 oleh validator existing. Urutan
kelas tetap **[real, spoof]**; tidak menghasilkan prediksi LIVE/SPOOF.

## Kebijakan numerik ditetapkan sebelum inference

**atol=1e-5, rtol=1e-4**, dengan ORT sebagai referensi:

`abs(OpenCV - ORT) <= 1e-5 + 1e-4 * abs(ORT)`.

Float32 convolution/reductions, fusion dan kernel CPU dapat memiliki urutan
operasi berbeda. Atol mengizinkan selisih absolut 10⁻⁵ pada probabilitas;
rtol mengizinkan 10⁻⁴ relatif. Absolute term menjaga perbandingan dekat nol
tidak hanya bergantung pada error relatif. Ini aturan pemeriksaan eksperimen
yang dipilih sebelum forward, **bukan jaminan vendor atau ambang PAD**.
Tidak dilonggarkan setelah hasil dilihat.

Error relatif untuk laporan:
`abs(OpenCV-ORT) / max(abs(ORT), epsilon float32)`; keputusan PASS memakai
formula atol/rtol di atas, bukan angka relatif saja. Tiga pengulangan setiap
runtime harus memberikan nilai persis sama, selisih dari pertama **0**.
Tidak melakukan rata-rata untuk menyembunyikan variasi.

## Fixture dan hasil aktual

Tiga synthetic patch existing: constant, pattern, noise
(`numpy.default_rng`, PCG64, **seed 42**). Dua foto publik existing dari
fixture identity, dengan local SHA-256 dan atribusi pada manifest:

- **same-person-a.jpg**, NASA s97-00690, foto publik 1996, resize existing.
- **same-person-b.jpg**, NASA ISS034-E-031671, crop fixture existing dari
  foto publik 2013. Crop fixture ini telah ada sebelum tugas; tidak membuat
  alternatif crop baru. Kedua fixture kemudian melalui decoder/YuNet/crop
  **existing** 9G/9I, tepat satu wajah dan bbox valid.
- Sumber, izin NASA public domain, processing fixture, hash dan geometri
  tersimpan pada evidence. Tidak menganggap foto publik ini ground truth
  **LIVE** atau **SPOOF**. Fixture tersebut menguji eksekusi/numerik, bukan
  kemampuan membedakan keaslian.

Angka berikut adalah output pertama, ditulis 9 digit untuk tabel saja.
JSON menyimpan seluruh output float32 dalam representasi Python float
tanpa pembulatan, termasuk ketiga pengulangan, error absolut/relatif **kedua
kelas**, timing dan determinisme.

| Fixture | OpenCV real / spoof | ORT real / spoof | Max absolut | Max relatif | Hasil |
| --- | --- | --- | --- | --- | --- |
| constant | 0.723385394 / 0.276614606 | 0.723384917 / 0.276615113 | 5.066394806e-7 | 1.831568330e-6 | PASS |
| pattern | 0.932613015 / 0.067386933 | 0.932613015 / 0.067386970 | 3.725290298e-8 | 5.528205679e-7 | PASS |
| noise seed 42 | 0.956379771 / 0.043620251 | 0.956379890 / 0.043620110 | 1.415610313e-7 | 3.245315814e-6 | PASS |
| NASA A | 0.858011603 / 0.141988412 | 0.858011544 / 0.141988486 | 7.450580597e-8 | 5.247313218e-7 | PASS |
| NASA B | 0.838104188 / 0.161895901 | 0.838103890 / 0.161896050 | 2.980232239e-7 | 9.204153650e-7 | PASS |

**5/5 PASS, 30 forward nyata**: lima input × tiga ulang × dua runtime.
Selisih absolut maksimum **5.066394805908203e-7**, relatif maksimum
**3.2453158136382518e-6**. Selisih ulang maksimum kedua runtime **0.0**.
Model dan tensor identik, input tidak dimutasi, shape/probability checks PASS.
Durasi per-call pada JSON adalah pengamatan run ini, **bukan benchmark**.
Tidak ada perbedaan material yang memerlukan penelusuran operator atau
menonaktifkan optimisasi. Tidak mencoba toleransi baru atau runtime lain.

Bukti: [hasil inference](face-verification-stage9j-results.json).

## Test dan retensi pekerjaan

**12 test terarah PASS, 0 SKIP/FAIL**: preprocessing sekali/tensor sama,
input/output cleanup, selisih material tetap FAIL tanpa swap/softmax,
toleransi tepat di batas, repeat yang berubah ditolak, output invalid/
non-finite/type, CPU-only catalog/names/shapes, kedua hash model, private
fixture path ditolak, exception aman, serta overwrite ditolak sebelum load.
Ini unit test mock/synthetic; dibedakan dari 30 pretrained forward di atas.

Syntax Python, strict UTF-8 enam file baru, dan `git diff --check` diperiksa.
Tidak full suite, TS/build aplikasi, eksperimen London, MiniFASNet atau test
9F lama diulang. Sebanyak **155 file existing dirty/untracked** disnapshot
sebelum tugas dan diverifikasi tidak berubah; model dan kedua CSV pengguna
tetap sama. Inventaris PAD/SFace dan konfigurasi venv existing tidak berubah.
Tidak operasi Git tulis, perubahan UI/endpoint/auth/DB, layanan atau kamera.

## Menjalankan kembali jika input/runtime/harness berubah

Environment pembanding disimpan ignored agar tidak perlu setup ulang.
Perintah berikut memakai environment existing, tanpa instalasi/server.
Pilih nama evidence **baru**, karena file yang sudah ada ditolak.

```powershell
Set-Location -LiteralPath 'D:\Workflow Repository System'
& '.\.cache\face-pad-runtime-comparison\Scripts\python.exe' -B `
  'services\face-anti-spoofing\tests\test_compare_cpu_runtimes.py'
& '.\.cache\face-pad-runtime-comparison\Scripts\python.exe' -B `
  'services\face-anti-spoofing\compare_cpu_runtimes.py' `
  --output '.cache\stage9j\comparison-new.json'
```

Untuk reproduksi di mesin Windows x64/Python 3.10 lain, buat venv pembanding
terpisah, kemudian gunakan **python venv itu**:

```powershell
& $comparisonPython -m pip --isolated install --no-deps --require-hashes `
  --disable-pip-version-check `
  -r 'services\face-anti-spoofing\requirements-runtime-comparison.stage9j.lock.txt'
& $comparisonPython -m pip --isolated check
```

Lock khusus wheel platform ini; bukan lock untuk Linux atau Python lain.
Tidak memasukkan venv, wheel cache, model maupun foto baru ke Git.

## File baru dan langkah terkecil berikutnya

Enam file baru: harness, unit test, requirements hash lock, laporan ini,
hasil perbandingan JSON, serta environment/wheel evidence JSON. Seluruh
file aplikasi/pipeline dan laporan sebelumnya tetap dipertahankan.

Hasil fixture tidak memberikan alasan mengganti OpenCV pada layanan.
Pembandingan **capture yang sama** di kedua runtime memerlukan frame asli
atau percobaan development baru dengan izin khusus untuk pemrosesan
sementara kedua runtime. CSV/geometri saja tidak dapat merekonstruksi
piksel/tensor. Tahap berikutnya harus mempertahankan model/crop/preprocessing
serta hasil raw yang terikat pada frame sama, tanpa mengubah threshold atau
mengklaim penyebab pencahayaan/blur/crop/model telah ditemukan.
