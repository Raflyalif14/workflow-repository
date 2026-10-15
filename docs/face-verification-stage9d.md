# Tahap 9D — Environment CPU dan konversi tensor sintetis

Tanggal: 12 Oktober 2026. **Selesai untuk setup terisolasi dan konversi tensor;
belum menjalankan inference PAD atau memuat aset model/detector.**

## Baseline dan isolasi

- Dibaca: laporan 9B/9C, `requirements-cpu.plan.txt`, dan test 9B.
- Git aktual: `feat/face-verification`, HEAD `58bc3d7`, staging kosong.
  Sebelum tahap ini ada 107 file dirty/untracked yang dipertahankan.
- Tidak ada environment PAD atau hasil 9D existing yang ditemukan, sehingga
  dibuat **satu** venv: `.cache/face-anti-spoofing-cpu`.
- Lokasi tersebut sudah diabaikan aturan `.cache/` pada root `.gitignore`;
  dibuktikan dengan `git check-ignore -v` sebelum creation. Tidak mengubah
  `.gitignore` atau memasukkan environment ke Git.
- Interpreter memakai instalasi existing CPython **3.10.0, Windows x64**,
  tetapi pip/package hanya dipasang ke venv PAD. `sys.prefix` target berbeda
  dari `sys.base_prefix`; `include-system-site-packages=false`.
- NumPy, OpenCV, Pillow dan Torch yang diimport terkonfirmasi berasal dari
  prefix venv PAD. Tidak memakai site-packages venv identitas.
- Inventaris paket dan hash `pyvenv.cfg` venv YuNet/SFace dibandingkan
  sebelum/sesudah: **identik**. Python global tidak diinstall/diupgrade.
  Interpreter 3.10.0 ini bukan klaim rekomendasi patch/runtime produksi.

Environment lokal dibiarkan tersedia untuk tahap belajar berikutnya. Tidak ada
server yang dimulai atau proses pengguna yang dihentikan.

## Pemilihan versi dan sumber resmi

Pins 9B tetap disimpan sebagai rencana historis, bukan diganti diam-diam.

| Komponen | Pilihan aktual | Bukti dan alasan |
| --- | --- | --- |
| PyTorch | **2.14.1+cpu** | [Indeks CPU resmi][cpu-index] menyediakan `cp310-cp310-win_amd64`; [metadata 2.14.1][torch-meta] menyatakan Python >=3.10. Kandidat 2.8.0 tidak dipakai setelah metadata resmi menampilkan advisory yang telah diperbaiki pada versi lebih baru |
| NumPy | **2.2.6** | [Metadata NumPy][numpy-meta]: Python >=3.10, wheel `cp310-cp310-win_amd64`; menjaga numeric/crop baseline 9B |
| OpenCV headless | **4.13.0.92** | [Metadata OpenCV][opencv-meta]: wheel `cp37-abi3-win_amd64`; untuk Python >=3.9 memerlukan NumPy >=2. NumPy 2.2.6 memenuhi range; import dan crop diuji pada runtime aktual |
| Pillow | **12.3.0** | [Metadata Pillow][pillow-meta] dan wheel Windows CPython 3.10 yang dipasang. Dibutuhkan untuk mengimport **fungsi referensi upstream utuh**, walaupun input test hanya ndarray; tidak diperlukan oleh runner crop 9B sendiri |
| pip | **26.2** | [Metadata pip][pip-meta]: Python >=3.10. Bootstrap hanya venv PAD, dengan URL wheel dan SHA-256 resmi; tidak mempertahankan pip seed 21.2.3 untuk resolusi paket |

PyTorch diambil dari `download-r2.pytorch.org`, sebagaimana link dalam indeks
`download.pytorch.org/whl/cpu/torch/`. Dependency lain memakai indeks eksplisit
`https://pypi.org/simple` dan wheel `files.pythonhosted.org`. Semua asal artifact
tercatat pada evidence JSON. Instalasi memakai `--isolated`, `--only-binary`,
timeout 30 detik/retry 1, serta path `python.exe` venv target; tidak membangun
source distribution atau memasang CUDA package. `torch.version.cuda` adalah
`null`, versi berakhiran `+cpu`, dan tensor referensi berada di CPU.

Kesesuaian metadata bukan jaminan semua operasi/model kompatibel. Yang
dibuktikan di sini adalah import, crop dan ndarray → tensor. Metadata advisory
dipakai untuk memilih kandidat, bukan audit keamanan lengkap dependency atau
klaim bahwa environment bebas semua celah.

## Seluruh paket yang terpasang

Inventaris aktual mencakup **14 distribusi**, termasuk installer dan dependency
transitif. Ini snapshot hasil instalasi, terpisah dari lock artifact.

| Distribusi | Versi |
| --- | --- |
| filelock | 4.1.0 |
| fsspec | 2026.9.0 |
| Jinja2 | 3.1.6 |
| MarkupSafe | 3.0.4 |
| mpmath | 1.3.0 |
| networkx | 3.4.2 |
| numpy | 2.2.6 |
| opencv-python-headless | 4.13.0.92 |
| pillow | 12.3.0 |
| pip | 26.2 |
| setuptools | 84.0.0 |
| sympy | 1.14.0 |
| torch | 2.14.1+cpu |
| typing_extensions | 4.16.0 |

`pip check`: **PASS — No broken requirements found.** Dependency transitif
dipilih resolver terhadap Python 3.10, kemudian dipin ke artifact yang dipasang.

### Inventaris versus lock instalasi

- [Evidence JSON](face-verification-stage9d-results.json) menyimpan inventaris,
  ID/hasil test, checksum sumber dan URL/hash setiap wheel.
- `services/face-anti-spoofing/requirements-cpu.stage9d.lock.txt` memuat direct
  URL wheel dan `--hash=sha256:...` untuk **seluruh 14 distribusi**, termasuk pip.
  Coverage nama/versi lock dicocokkan dengan inventaris aktual.
- CPU wheel Torch memakai SHA-256 resmi
  `bda7043ec45539b1b61538af468e19854b72ac6be8d6fde2f51dfd0c91721568`.
  Ini checksum **library wheel**, bukan bobot PAD.
- Lock dipakai dengan `--require-hashes`, mengikuti [panduan pip][pip-hashes].
  Scope artifact adalah Windows x64 / CPython 3.10; bukan lock lintas OS/Python.
- Tidak membuat environment kedua atau mengulang seluruh download demi replay
  instalasi. **Fresh-environment replay lock belum dijalankan.** Lock tidak
  mencakup installer/interpreter Python atau menjamin URL tetap tersedia selamanya.

Raw install report dan skrip pengumpulan hasil berada pada folder `.cache`
terisolasi. Evidence Git hanya metadata aman, tanpa token, payload, pixels,
embedding, signed URL, maupun path data peserta.

## Referensi asli dan konversi yang diuji

Untuk melampaui pengujian ulang dua operasi yang ditulis manual pada test 9B,
disimpan salinan kode **`src/data_io/functional.py` asli** dari commit
`b6d5f04ad78778917853b25c778acef6d5626d15`. [Sumber upstream][functional].

File referensi hanya dinormalisasi UTF-8/LF; SHA-256 representasi:
`8f779a775e01485800368e8a11104c49c8ba602629927e19ea223b74ff946898`.
URL/commit/hash ada di `reference/functional.sources.json`; atribusi dan batas
scope ada di `reference/functional.NOTICE.md`. Root Apache license yang sudah
disalin pada 9B dipertahankan. Tidak mengambil bobot atau konfigurasi detector.

Test tambahan benar-benar memanggil **`reference.to_tensor(patch)`**, lalu
`unsqueeze(0)`, bukan model forward. Hasil NumPy harness dibandingkan dengan
tensor referensi secara **exact array equality**, tanpa tolerance pelonggaran:

- BGR tetap BGR, float32;
- NCHW `[1,3,80,80]`;
- nilai piksel tetap 0–255, termasuk uji 0 dan 255;
- tidak `/255`, mean/std, RGB swap, mirror, alignment SFace atau embedding;
- 10 crop berpola: 5 bbox tengah/tepi/fractional/full-frame × 2 scale;
- 3 pola warna konstan untuk membuktikan kanal/range;
- input ndarray strided/non-contiguous, tanpa membalik urutan piksel;
- frame asal tidak berubah dan tensor berada pada CPU.

Fungsi transform lain dalam file referensi tidak diuji; jalur PIL bukan bagian
klaim kesetaraan ini. Batas rasio 3:4 dan penolakan 16:9 pada harness tetap ada.

## Hasil aktual

| Kelompok | PASS | SKIP | FAIL / ERROR |
| --- | ---: | ---: | ---: |
| Test 9B pada environment CPU baru | **19** | **0** | **0 / 0** |
| Test langsung terhadap fungsi upstream | **5** | **0** | **0 / 0** |
| Total | **24** | **0** | **0 / 0** |

Test yang sebelumnya SKIP karena Torch tidak tersedia kini **dijalankan dan
PASS**. Pengulangan 9B diperlukan karena runtime/environment berubah; tidak
mengulang suite aplikasi atau inference London.

Pengujian juga mempertahankan bukti crop identik pada 74 kasus sintetis,
guard invalid input, output/error tanpa prediksi palsu, agregasi fixture dan
cleanup. Test hanya membuat PNG piksel sintetis dalam temporary directory yang
dibersihkan; tidak menggunakan foto wajah/peserta.

Bukti hasil per-test dan waktu UTC: [face-verification-stage9d-results.json](face-verification-stage9d-results.json).
Syntax Python, UTF-8 strict, whitespace/diff dan preservasi existing diperiksa
terarah setelah artifact selesai.

## Menjalankan ulang bila runtime/harness berubah

Tidak perlu mengulang test sekarang karena hasil sudah tersimpan.

```powershell
Set-Location -LiteralPath 'D:\Workflow Repository System'
$padPython = '.\.cache\face-anti-spoofing-cpu\Scripts\python.exe'
$padHarness = (Resolve-Path -LiteralPath 'services\face-anti-spoofing').Path
& $padPython -B -c `
  "import sys,unittest; sys.path.insert(0,sys.argv[1]); suite=unittest.defaultTestLoader.discover(sys.argv[1]+'/tests',pattern='test_*.py'); result=unittest.TextTestRunner(verbosity=2).run(suite); sys.exit(not result.wasSuccessful())" $padHarness
if ($LASTEXITCODE -ne 0) { throw 'PAD synthetic tests failed.' }
```

Untuk rekonstruksi yang sengaja diizinkan nanti pada **venv PAD baru** yang
sudah diverifikasi terisolasi, installer dapat memakai lock berikut. Jangan
menjalankan dengan Python global atau venv identitas:

```powershell
& $padPython -B -m pip --isolated --disable-pip-version-check install `
  --no-index --require-hashes --only-binary ':all:' --no-input `
  -r '.\services\face-anti-spoofing\requirements-cpu.stage9d.lock.txt'
if ($LASTEXITCODE -ne 0) { throw 'Locked PAD installation failed.' }
```

Direct URLs dalam lock tetap mengambil wheel resmi meskipun `--no-index`
menonaktifkan pencarian index. Blok rekonstruksi tersebut **tidak dijalankan
ulang pada tahap ini**.

## File baru dan batas verifikasi

File Git yang ditambahkan:

1. `docs/face-verification-stage9d.md`
2. `docs/face-verification-stage9d-results.json`
3. `services/face-anti-spoofing/requirements-cpu.stage9d.lock.txt`
4. `services/face-anti-spoofing/tests/test_tensor_reference.py`
5. `services/face-anti-spoofing/reference/functional.py`
6. `services/face-anti-spoofing/reference/functional.sources.json`
7. `services/face-anti-spoofing/reference/functional.NOTICE.md`

Local-only: satu venv/cache/report setup pada `.cache/face-anti-spoofing-cpu`.
Laporan lama, rencana pins 9B, test 9B dan `offline_pad.py` tidak diubah.

**Belum terbukti:** load/inference MiniFASNet, detector RetinaFace, softmax model,
latency model, akurasi PAD, foto kamera/liveness, kecocokan dengan bobot lama,
atau keamanan login. Hak bobot/detector dari audit 9C tetap perlu klarifikasi.
Konversi tensor yang identik tidak menutup bagian-bagian tersebut.

Tidak mengubah environment identitas, UI, layanan, database, SFace, threshold
London, atau auth. Tidak ada stage/commit/push maupun Git fetch/pull/branch
mutation. Tahap ini berhenti pada environment dan bukti konversi sintetis.

[cpu-index]: https://download.pytorch.org/whl/cpu/torch/
[torch-meta]: https://pypi.org/project/torch/2.14.1/
[numpy-meta]: https://pypi.org/project/numpy/2.2.6/
[opencv-meta]: https://pypi.org/project/opencv-python-headless/4.13.0.92/
[pillow-meta]: https://pypi.org/project/pillow/12.3.0/
[pip-meta]: https://pypi.org/project/pip/26.2/
[pip-hashes]: https://pip.pypa.io/en/stable/topics/secure-installs/
[functional]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/src/data_io/functional.py
