# Tahap 9E — Kompatibilitas arsitektur MiniFASNet pada CPU

Tanggal: 12 Oktober 2026. **Selesai untuk kode arsitektur dengan parameter acak
dan input sintetis. Tidak menggunakan bobot pretrained atau mengevaluasi PAD.**

## Baseline dan ruang kerja

- Laporan 9B–9D dibaca sebelum bekerja. Environment PAD 9D sudah tersedia dan
  digunakan kembali: `.cache/face-anti-spoofing-cpu`.
- Branch `feat/face-verification`, HEAD `58bc3d7`, staging kosong. Sebelum tahap
  ini terdapat 114 file dirty/untracked; semuanya dipertahankan.
- Tidak membuat venv lain, menginstall/mengubah dependency, atau mengulang
  24 test 9D. Hanya test baru tahap 9E yang dijalankan.
- Tidak mengubah arsitektur untuk memperoleh hasil lulus. Tidak ditemukan
  incompatibility pada konfigurasi dan runtime yang diuji.

## Sumber kode, checksum dan lisensi

Hanya **`src/model_lib/MiniFASNet.py`** diambil dari commit
`b6d5f04ad78778917853b25c778acef6d5626d15` pada repository resmi Minivision.
[Sumber arsitektur][architecture]. Tidak mengambil predictor, training module,
checkpoint `.pth` pretrained, `.caffemodel`, atau konfigurasi detector.

Referensi asli disimpan pada `services/face-anti-spoofing/reference/MiniFASNet.py`.
File menyertakan helper class bersama dan factory tambahan, tetapi hanya
MiniFASNetV2 dan MiniFASNetV1SE yang diinstansiasi. Tidak memotong/mengubah layer,
forward, default factory ataupun state key.

- Representasi: UTF-8 tanpa BOM, newline LF.
- SHA-256 representasi sumber:
  `e498c4ec5e1ddfaba62b941a126c19d65aa564999f3309661fe43ee8bf38acd7`.
- URL, commit dan checksum ada di `reference/MiniFASNet.sources.json`.
- Root Apache 2.0 dan atribusi Minivision/zhuying dipertahankan melalui
  `reference/LICENSE` dan `reference/MiniFASNet.NOTICE.md`.
- Perubahan hanya pada test: argumen eksplisit, seeding, CPU, softmax dengan
  dimensi kelas, serta kebijakan pemuatan checkpoint sintetis yang aman.

Lisensi kode ini tidak menyelesaikan pertanyaan hak bobot/detector tahap 9C.
Checksum di atas merupakan checksum **kode**, bukan bobot pretrained.

## Konfigurasi yang benar-benar diuji

[Predictor upstream][predictor] menggunakan ukuran dari nama model dan
[get_kernel][kernel] menghitung `((height+15)//16, (width+15)//16)`.
Untuk 80×80 hasilnya **(5,5)**. Default factory **(7,7)** tidak digunakan.
Parameter lain dibuat eksplisit sesuai factory yang dirujuk inference tersebut.

| Parameter | MiniFASNetV2 | MiniFASNetV1SE |
| --- | --- | --- |
| Seed inisialisasi | **42** | **43** |
| Seed input | **20261012** | **20261012** |
| `conv6_kernel` | **(5,5)** | **(5,5)** |
| `num_classes` / `img_channel` | **3 / 3** | **3 / 3** |
| `embedding_size` constructor | **128** | **128** |
| `drop_p` | **0.2** | **0.75** |
| Mode | CPU float32, `eval()` | CPU float32, `eval()` |
| Forward | `torch.no_grad()` | `torch.no_grad()` |
| Softmax | `torch.softmax(logits, dim=1)` | sama |

PyTorch memberikan initialisation default dengan seed tersebut: parameter
convolution/linear acak, sedangkan beberapa parameter/buffer seperti BatchNorm
memiliki initialisation tetap bawaan. Tidak menimpa seluruh parameter menjadi
acak, melatih, memperbarui BatchNorm, atau mengambil embedding/fitur internal.
Ukuran constructor 128 di tabel bukan embedding wajah yang dihasilkan/diukur.

Input dibuat dengan generator CPU lokal, byte-range integers yang dikonversi
ke float32: **BGR `[1,3,80,80]`, nilai 0–255**, tanpa normalisasi. Tidak memakai
foto ataupun detector. Parameter/input seed diisolasi dari RNG caller.

## Test dan hasil aktual

| Kelompok | PASS | SKIP | FAIL / ERROR |
| --- | ---: | ---: | ---: |
| MiniFASNetV2 | **7** | **0** | **0 / 0** |
| MiniFASNetV1SE | **7** | **0** | **0 / 0** |
| Integritas source pin/lisensi | **1** | **0** | **0 / 0** |
| Total | **15** | **0** | **0 / 0** |

Untuk masing-masing arsitektur:

1. Parameter constructor, kernel akhir, tiga kanal/kelas, CPU dan mode eval
   cocok dengan konfigurasi eksplisit.
2. Forward menghasilkan **logits `[1,3]`, float32, finite**; softmax dengan
   `dim=1` finite, berada pada range numerik 0–1 dan jumlah per baris mendekati 1.
   Tidak melakukan argmax, threshold, pemetaan kelas, atau prediksi.
3. `no_grad()` menghasilkan output tanpa graph/gradient; input asal tidak berubah.
4. Seed inisialisasi yang sama menghasilkan state_dict yang identik.
5. Round-trip checkpoint sintetis memulihkan seluruh tensor parameter/buffer
   dan menghasilkan forward yang identik pada input sama.
6. Missing key dan unexpected key ditolak oleh strict loading.
7. Shape salah pada tensor classifier ditolak oleh strict loading.

Nilai logits/softmax tidak disimpan atau dicetak, dan tidak dinamai skor PAD.
Evidence hanya shape, boolean pemeriksaan, seed, konfigurasi, durasi dan status.
[Hasil JSON](face-verification-stage9e-results.json) menyimpan rincian per-test.

### Kebijakan checkpoint sintetis

- Hanya state_dict yang dibuat sendiri dari initialisation acak dalam test.
- Disimpan sebagai `.pt` pada `TemporaryDirectory` khusus test; tidak permanen
  atau masuk repo. Nama ini tidak merujuk checkpoint pretrained.
- Pemuatan selalu `torch.load(..., map_location='cpu', weights_only=True)`;
  [API PyTorch][torch-load]. Dilanjutkan
  `model.load_state_dict(..., strict=True)`; [API Module][torch-module].
- Tidak ada fallback `weights_only=False`, `strict=False`, penghapusan key
  atau perubahan shape agar pemuatan berhasil.
- Setiap test round-trip/penolakan menutup temporary directory dan memeriksa
  bahwa direktorinya sudah tidak ada. Checkpoint valid maupun invalid dibersihkan.
- Instance dari percobaan state invalid tidak dipakai setelah penolakan;
  strict rejection tidak diklaim sebagai rollback atomik internal PyTorch.

## Runtime dan durasi forward sintetis

Runtime aktual: **Python 3.10.0, Windows 64-bit, Torch 2.14.1+cpu** dari venv
PAD existing. `torch.version.cuda=null`. Paket terpasang tetap sama dengan
inventaris 9D; tidak ada setup/install/upgrade.

Test memakai **1 thread PyTorch dalam proses test**, lalu mengembalikan jumlah
thread sebelumnya. Tidak mengubah pengaturan layanan atau dependency.

| Arsitektur | Durasi satu forward yang dicatat | Hasil |
| --- | ---: | --- |
| MiniFASNetV2 | **18.2305 ms** | `[1,3]`, finite |
| MiniFASNetV1SE | **74.6370 ms** | `[1,3]`, finite |

Durasi berasal dari `perf_counter` mengelilingi satu `model(input)`; tidak
mencakup constructor, softmax, checkpoint I/O, decoding atau detector. Tidak
ada warmup eksplisit, repeated timing atau benchmark terkontrol. Cache, urutan
test dan beban mesin dapat memengaruhinya. **Jangan membandingkan kemampuan
PAD/latency pretrained dari angka ini.** Presisi asli tersimpan dalam JSON.

## File baru dan menjalankan ulang secara terarah

File yang ditambahkan:

1. `services/face-anti-spoofing/reference/MiniFASNet.py`
2. `services/face-anti-spoofing/reference/MiniFASNet.sources.json`
3. `services/face-anti-spoofing/reference/MiniFASNet.NOTICE.md`
4. `services/face-anti-spoofing/tests/test_architecture_cpu.py`
5. `docs/face-verification-stage9e.md`
6. `docs/face-verification-stage9e-results.json`

Tidak ada file existing yang diubah. Test dan reference ini tidak diimport oleh
runner 9B atau aplikasi. `offline_pad.py` tetap identik, tanpa fallback parameter
acak, dan kontrak model/detector unavailable tetap ERROR seperti bukti 9B–9D.
Test lama tidak dijalankan ulang karena source/runtime-nya tidak berubah.

Jika kode/runtime terkait kelak berubah, jalankan **test 9E saja**:

```powershell
Set-Location -LiteralPath 'D:\Workflow Repository System'
& '.\.cache\face-anti-spoofing-cpu\Scripts\python.exe' -B `
  '.\services\face-anti-spoofing\tests\test_architecture_cpu.py'
if ($LASTEXITCODE -ne 0) { throw 'Stage 9E architecture tests failed.' }
```

`--output <new-file.json>` opsional menyimpan metadata aman dan menolak file
existing. Jangan menimpa evidence run ini. Temporary checkpoint selalu dibersihkan
oleh test; tidak membutuhkan cleanup manual foto/model.

Syntax Python, UTF-8 strict, whitespace/diff dan preservasi worktree diperiksa
terarah. Tidak menjalankan frontend/backend suite, training, database, server,
atau operasi Git write. Tidak menghubungi maintainer.

## Batas dan langkah berikutnya

**Yang terbukti:** kode kedua arsitektur dapat diinstansiasi dan melakukan
forward sintetis pada runtime ini, serta round-trip state_dict buatan sendiri
dengan kebijakan safe/strict dan penolakan state yang tidak sesuai.

**Yang belum terbukti:** kecocokan checkpoint pretrained (termasuk key prefix,
format/versi dan numerik asal), detector/crop end-to-end, akurasi anti-spoofing,
liveness, foto/video kamera, generalisasi, keamanan login atau lisensi aset.
State_dict buatan sendiri cocok dengan arsitektur yang sama secara konstruksi;
keberhasilan itu tidak mengesahkan bobot lama yang belum diperiksa.

Sebelum tahap bobot pretrained, selesaikan ketentuan/sumber aset yang masih
terbuka pada 9C. Tidak melakukan langkah tersebut dalam tahap 9E. Pipeline
YuNet/SFace, threshold London, auth, UI, layanan dan database dipertahankan.

[architecture]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/src/model_lib/MiniFASNet.py
[predictor]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/src/anti_spoof_predict.py
[kernel]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/src/utility.py
[torch-load]: https://docs.pytorch.org/docs/2.14/generated/torch.load.html
[torch-module]: https://docs.pytorch.org/docs/2.14/generated/torch.nn.Module.html#torch.nn.Module.load_state_dict
