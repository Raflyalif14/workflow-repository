# Tahap 9A — Kajian anti-spoofing lokal

Tanggal pemeriksaan: 12 Oktober 2026. Status: kajian sumber dan environment saja; belum ada inference PAD (presentation attack detection), pengujian kamera PAD, atau integrasi login.

## Keputusan singkat

**Layak dicoba sebagai eksperimen CPU terpisah, dengan kendala konkret sebelum implementasi.** Kandidatnya Silent-Face-Anti-Spoofing milik Minivision. Kendala utamanya: ketentuan khusus bobot belum cukup jelas, dependency upstream lama tidak langsung cocok dengan Python existing, dan contoh inference memiliki batas rasio frame serta detector yang perlu diberi pemeriksaan kegagalan.

Skor SFace menjawab kemiripan tampilan wajah. PAD mencoba membedakan wajah langsung dari wajah yang disajikan melalui media. Keduanya harus tetap menjadi hasil terpisah. Hasil PAD bukan bukti identitas maupun jaminan liveness/login aman.

## Baseline repository dan ruang pemeriksaan

- Git aktual: `feat/face-verification`, HEAD `58bc3d7`, staging kosong.
- Sebelum kajian terdapat 97 file dirty/untracked dari pekerjaan existing. Tahap ini hanya menambahkan dokumen ini; seluruh file tersebut dipertahankan.
- Tidak ditemukan `AGENTS.md` yang berlaku pada direktori induk/repository/dokumentasi yang diperiksa.
- Dibaca: `services/face-experiment/inference.py`, `requirements.txt`, laporan tahap 4–8, `frontend/src/lib/face-photo.ts`, dan `frontend/src/hooks/use-face-comparison.ts`.
- Pipeline identitas existing tetap YuNet → alignment lima landmark → SFace 112×112 → embedding 128 dimensi → cosine. Crop preview bermargin 20% hanya untuk tampilan; capture menyimpan frame penuh pada resolusi video asli di memori, tanpa mirror pada bytes.
- Threshold London tetap **0.5730850398540497**, operator `>=`, untuk eksperimen identitas neutral-versus-smiling. Tidak digunakan sebagai threshold PAD dan tidak dipasang ke login. Laporan tahap 8 bukan bukti anti-spoofing.

## Catatan percobaan manual pengguna

Pengguna melaporkan cosine **0.7782512903213501** antara wajah langsung dan selfie sendiri yang ditampilkan di HP. Selfie asli dibuat **9 Oktober 2026**; pengambilan layar dilakukan **12 Oktober 2026**. Ini laporan pengguna, bukan percobaan yang dijalankan ulang pada tahap 9A. Foto pribadi dan CSV percobaan tidak dibaca atau dimasukkan ke repository.

`session_b=s01` masih ambigu: belum jelas apakah menunjuk sesi pembuatan selfie asli atau sesi kamera yang merekam layar HP. Keduanya berbeda. Jangan menafsirkan kode itu sebagai bukti sesi asli yang diketahui atau mengubah CSV lama diam-diam. Untuk percobaan berikutnya, bedakan `source_media_id`, sesi/tanggal pembuatan media asal, serta sesi/tanggal presentasi dan capture kamera. Jika sesi asal tidak diketahui, tulis tidak diketahui; tanggal saja tidak membuktikan ID sesi.

Skor tersebut menunjukkan kesamaan visual pada percobaan ini. Walaupun lebih besar daripada threshold London, threshold London tidak tervalidasi untuk kamera/media ini dan tidak dapat membedakan manusia langsung dari foto layar. Jangan memberi label LIVE, berhasil login, atau menyimpulkan waktu pengambilan dari skor.

## Sumber resmi dan lisensi

Snapshot yang diperiksa: commit **`b6d5f04ad78778917853b25c778acef6d5626d15`**. Semua baseline kode di bawah merujuk commit tersebut, bukan URL `latest`. [Commit upstream][commit].

| Bagian | Bukti dan kesimpulan |
| --- | --- |
| Gambaran model | [README English][readme-en] dan [README Mandarin][readme] diperiksa. Model klasifikasi ringan dengan supervisi Fourier saat training; README memperingatkan ketergantungan pada kamera dan kondisi pengambilan. |
| Kode | Root [LICENSE][license] adalah Apache 2.0, copyright Minivision 2020. Jika kelak kode disalin/diadaptasi, pertahankan lisensi, atribusi, dan pemberitahuan perubahan yang diperlukan. |
| Bobot PAD | [Direktori bobot pada commit][weights] memuat dua `.pth` di tabel berikut. README menyebut model terbuka, tetapi pada sumber yang diperiksa tidak ditemukan model card/lisensi khusus bobot maupun provenance hak data training yang cukup rinci. Root license merupakan bukti, bukan alasan menyatakan seluruh hak bobot/data pasti jelas. Klarifikasi cakupan bobot dengan maintainer sebelum redistribusi atau penggunaan di luar eksperimen yang telah dipastikan izinnya. |
| Detector pihak ketiga | [Kode predictor][predict] menggunakan `Widerface-RetinaFace.caffemodel` dan `deploy.prototxt`. README menunjuk RetinaFace sebagai referensi. Ketentuan aset detector harus diperiksa terpisah; jangan menganggap lisensi kode RetinaFace otomatis menjelaskan bobot ini. |
| Batas akses sumber | Teks kode dan daftar bobot PAD pada commit dapat diakses. Tampilan folder detector pada commit gagal dimuat; nama aset di atas terkonfirmasi dari kode, bukan pemeriksaan isi binary. Tidak mengunduh `.pth`/`.caffemodel`; checksum SHA-256 dan kecocokan isi bobot belum diverifikasi. |

## Konfigurasi baseline inference upstream

Baseline berarti dua model yang benar-benar tercantum, bukan memilih satu model lalu menyebutnya setara dengan ensemble.

| Bobot | Arsitektur | Input H×W | Scale crop |
| --- | --- | --- | --- |
| `2.7_80x80_MiniFASNetV2.pth` | MiniFASNetV2 | 80×80 | 2.7 |
| `4_0_0_80x80_MiniFASNetV1SE.pth` | MiniFASNetV1SE | 80×80 | 4.0 |

Nama/aset: [daftar bobot][weights]. Ukuran, arsitektur, dan scale dibaca oleh [parser nama][utility]; `4_0_0` tidak berarti tiga scale. Arsitektur memakai blok convolution/depthwise/residual; V1SE menambahkan squeeze-and-excitation. Kedua factory tersebut menghasilkan tiga logit kelas; kernel akhir untuk input 80×80 adalah 5×5. Cabang Fourier pada [MultiFTNet][multift] adalah supervisi training, bukan tahap FFT yang perlu ditambahkan ke input inference. [MiniFASNet][architecture].

### Frame, detector, dan crop

1. [test.py][test] membaca gambar kamera melalui OpenCV. Pemeriksaan contohnya mensyaratkan **width/height = 3/4**, misalnya 480×640. Ini batas wrapper contoh, bukan bukti bahwa semua rasio lain pasti ditolak oleh jaringan.
2. Predictor memakai detector Caffe RetinaFace. Untuk gambar berarea minimal 192², ukuran detector menjadi `int(192*sqrt(w/h))` × `int(192/sqrt(w/h))`. Blob memakai BGR, scale 1, pengurangan mean `(104,117,123)`; koordinat dipetakan kembali ke frame sumber. Ia memilih detection dengan confidence terbesar. Nilai `detector_confidence=0.6` dideklarasikan tetapi **tidak dipakai sebagai filter**; kode tidak memastikan tepat satu wajah. [Predictor][predict].
3. Dua patch dibuat langsung dari bounding box pada frame sumber. Scale efektif dibatasi `min((H-1)/box_h, (W-1)/box_w, scale)`. Kotak diperbesar terhadap pusatnya, digeser agar berada di batas gambar, koordinat diubah menjadi integer, lalu slice dengan ujung inklusif dan resize linear ke 80×80. Tidak ada rotasi atau alignment landmark. [CropImage][crop].

Frame native aplikasi dapat memiliki rasio lain; fixture capture existing misalnya 1280×720. Ukuran kamera fisik pengguna belum diinventarisasi dalam kajian ini. **Jangan meregangkan frame menjadi 3:4 atau memakai crop wajah SFace 112×112/crop preview sebagai pengganti input PAD.** Baseline awal sebaiknya memakai pengambilan portrait 3:4 yang terkontrol. Dukungan rasio native lain harus menjadi varian terdokumentasi dan diuji terpisah, termasuk konteks sekitar wajah; rasio yang belum didukung menghasilkan INCONCLUSIVE.

### Tensor, prediksi, dan keputusan

- Patch OpenCV tetap **BGR**, HWC → CHW, float32, batch `[1,3,80,80]`.
- Implementasi [functional.to_tensor][functional] mempertahankan **0–255**: tidak membagi 255, tidak melakukan normalisasi mean/std atau ImageNet. Komentar [ToTensor][transform] menyebut 0–1 tetapi tidak sesuai implementasi. Ikuti kode inference, bukan komentar tersebut.
- Model berjalan `eval()` dan `no_grad()`; predictor memuat bobot tiap pemanggilan dan menerapkan softmax. [Predictor][predict].
- [test.py][test] menjumlahkan dua vektor softmax, mengambil `argmax`, lalu membagi nilai kelas pemenang dengan **2**. Label **1** diberi Real Face; label **0 atau 2** diberi Fake Face. Nama jenis serangan untuk masing-masing kelas 0/2 belum terbukti dari sumber ini; jangan menamai keduanya print/replay berdasarkan tebakan.
- Tidak ada threshold numerik PAD pada keputusan Python tersebut. Pengaturan threshold APK yang dibahas README berbeda dari aturan `test.py`. Nilai kelas pemenang bukan cosine, persentase identitas, atau probabilitas keamanan terkalibrasi.

Usulan adapter nantinya: allowlist tepat dua bobot; jangan memasukkan semua file suatu direktori. Simpan tiga nilai rata-rata kelas dan kelas pemenang sebagai metadata eksperimen, tanpa menambah threshold sekarang. Tie/non-finite/hasil tidak lengkap harus gagal aman. Pemeriksaan tersebut tambahan wrapper yang harus didokumentasikan, bukan klaim bahwa upstream sudah memilikinya. Jangan menjalankan `test.py` mentah di jalur aplikasi: contoh itu menulis gambar hasil anotasi ke disk. [test.py][test].

## Kompatibilitas lokal — pemeriksaan read-only

| Komponen | Kondisi aktual |
| --- | --- |
| Python identitas | `services/face-experiment/.venv`, Python 3.10.0, 64-bit, Windows |
| CPU | AMD Ryzen 7 5800HS with Radeon Graphics; 16 logical CPU |
| Paket existing | `opencv-python-headless==4.13.0.92`, `numpy==2.2.6`, `Pillow==12.3.0` |
| Paket belum ada pada venv itu | `torch`, `torchvision`, `easydict`, `tqdm`, `tensorboardX` |
| Pins upstream | `torch==1.2.0`, `torchvision==0.4.0`, `numpy==1.17.0`, `opencv_python==4.2.0.34`, `Pillow==7.1.2`, `easydict==1.9`, `tqdm==4.31.1`, `tensorboardX==2.0` |

Pins berasal dari [requirements upstream][requirements]. Inventaris lokal memakai metadata paket/stdlib dan identitas CPU, bukan import/inference upstream. Wheel resmi PyTorch 1.2.0 untuk Windows yang diperiksa bertag CPython 3.5–3.7; tidak ada wheel CPython 3.10 pada daftar itu. Jadi requirements lama bukan instalasi langsung yang kompatibel dengan venv saat ini. [Indeks wheel PyTorch][torch-wheels], [versi terdahulu][torch-previous].

**Rekomendasi:** environment PAD terpisah; jangan downgrade atau menambah paket ke venv YuNet/SFace. Pilih dan pin runtime CPU yang didukung pada tahap implementasi setelah uji kesetaraan. Belum memilih versi pengganti atau menjamin bobot lama dapat dimuat olehnya. Perlu memeriksa load state dict, perilaku softmax dengan dimensi kelas eksplisit, dan konversi NumPy → tensor. Jangan memuat checkpoint dari sumber tak dikenal.

Secara arsitektur/input, eksperimen CPU masuk akal dan predictor memiliki jalur CPU. Namun latency, RAM, throughput, kompatibilitas runtime modern, dan akurasi lokal **belum diuji**. Angka kinerja APK upstream bukan pengukuran laptop ini. Mulai dengan satu permintaan/frame, bukan loop video realtime.

## Rancangan integrasi eksperimen terpisah

Ini usulan, belum perubahan endpoint atau kontrak aplikasi.

1. Ambil **frame asli yang dibekukan** dari alur capture existing. Untuk pasangan A/B, PAD memeriksa setiap frame secara terpisah; jangan memakai hasil PAD A untuk B atau hasil loop video yang lebih lama.
2. Pertahankan pipeline YuNet/SFace existing utuh. PAD memiliki preprocessing, nama model, checksum bobot/detector, dan versi sendiri. Similarity dan PAD ditampilkan sebagai dua hasil; tidak digabung menjadi skor login.
3. Bind hasil ke ID percobaan/request, slot foto, generasi foto, revisi metadata, serta digest bytes input yang diverifikasi layanan. Digest untuk pengikatan hanya sementara, tidak perlu dicatat permanen. Browser mengabaikan hasil lama setelah retake/delete/perubahan metadata/account/unmount; layanan membersihkan pixels/tensor setelah selesai.
4. Bila kelak melalui aplikasi, gunakan auth guard dan pengecekan akun aktif existing, layanan Python internal, batas bytes/dimensi, satu permintaan berjalan, timeout dan pembatalan yang terbatas. Tidak membuat token, sesi login, enrollment, atau akses baru. Default production tetap nonaktif.
5. Status proses: **ERROR** untuk model tidak ada, decoding/inference exception, timeout, atau respons rusak; **INCONCLUSIVE** untuk tidak ada/lebih dari satu wajah, bbox/rasio/quality yang belum didukung, atau tie. Skor gagal kosong. Hanya proses lengkap dapat menghasilkan klasifikasi kandidat LIVE/SPOOF menurut model; kata LIVE di sini label model, bukan bukti manusia asli. Tidak ada fallback error → LIVE.
6. Tidak menyimpan foto, embedding, gambar anotasi, atau payload log. Hasil numerik/provenance boleh berada di memori catatan eksperimen; ekspor hanya atas klik dan tanpa foto. Jangan mencatat private input atau digest secara permanen tanpa kebutuhan baru yang eksplisit.

### Pilihan detector

Baseline kesetaraan memakai **RetinaFace upstream** agar geometri crop asal bobot dapat diperiksa. Tambahkan penolakan hasil kosong/bbox invalid dan gate tepat satu wajah yang terukur; upstream sendiri belum menyediakan gate itu. Jika ingin memakai YuNet existing sebagai gate jumlah wajah, catat bahwa ini guard tambahan, bukan penggantian bbox RetinaFace secara otomatis.

Mengganti bbox dengan YuNet mengubah lokasi, ukuran, confidence dan konteks patch 2.7/4.0. Tidak boleh langsung menggunakan lima landmark/alignment SFace. Jadikan `yunet-pad-crop` varian preprocessing tersendiri. Bandingkan bbox, patch dan hasil pada frame yang sama terhadap baseline, termasuk tepi frame, pose, wajah kecil, tanpa/multi-wajah, dan seluruh media pilot. Jangan mengubah threshold identitas atau menyatakan kedua detector setara sebelum hasil tersebut tersedia.

## Protokol pilot kecil yang diusulkan

Pilot memakai diri sendiri secara sukarela, kode peserta tanpa nama/email. Ini protokol belajar, bukan benchmark atau evaluasi keamanan produksi.

| Presentasi | Asal ground truth | Contoh minimum per sesi yang direncanakan |
| --- | --- | --- |
| Wajah langsung | Peserta benar-benar berada di depan kamera pada sesi itu | 3 capture terpisah: normal, ekspresi berbeda, cahaya berbeda |
| Foto pada layar HP | Selfie peserta sendiri ditampilkan pada media layar | 3 capture; catat ID file asal, sesi asal, sesi replay, perangkat/brightness sebagai kategori nonidentifikasi |
| Foto cetak | Cetakan milik peserta bila tersedia | 3 capture; catat ID gambar asal/cetakan dan kondisi pantulan; jika tidak tersedia laporkan belum diuji |
| Replay video sendiri | Video peserta direkam dahulu lalu diputar di layar | 1 klip asal per kelompok, 3 capture pada posisi waktu yang ditetapkan sebelum melihat skor |

Angka di atas rencana, bukan data yang sudah dikumpulkan. Ground truth berasal dari cara presentasi yang diamati, bukan dari cosine/PAD. Foto London biasa tidak membuktikan LIVE. Gerakan, kedipan, atau menoleh dalam video layar juga dapat ditampilkan ulang; jangan menjadikannya bukti keaslian tunggal.

### Pemisahan development dan evaluasi

- Rencanakan empat sesi kamera: dua development dan dua evaluasi pada waktu/hari berbeda. Gunakan dua set media asal yang berbeda, dibuat dalam sesi asal yang berbeda. Beri seluruh media turunan dari foto/klip yang sama satu `source_media_group`.
- Tetapkan split menurut **sesi capture, sesi pembuatan media asal, dan source_media_group** sebelum melihat hasil. Jangan menempatkan foto/klip yang sama, hasil cetaknya, atau frame dari satu video di kedua kelompok. Semua turunan tetap pada kelompok asal.
- Percobaan selfie 9 Oktober → layar 12 Oktober merupakan eksplorasi/development yang telah dilihat, bukan data evaluasi tertutup. Karantina dari evaluasi berikutnya sampai metadata jelas; jangan menebak `session_b`.
- Development untuk debugging pipeline/quality dan mengukur latency. Bekukan bobot, preprocessing, guard dan aturan keputusan sebelum evaluasi. Jangan menyetel berdasarkan evaluasi. Belum menentukan threshold PAD pada tahap 9A.
- Catat ID percobaan, kode peserta/sesi/media, jenis presentasi sebenarnya, kondisi, waktu, status/error aman, skor kelas jika valid, keputusan model, dan provenance. Jangan menyimpan nama, foto atau embedding dalam Git; tidak ada dataset foto permanen dalam rancangan aplikasi.
- Laporkan jumlah dicoba/valid/ERROR/INCONCLUSIVE per presentasi. Salah menerima serangan dibanding seluruh serangan yang berhasil diproses; salah menolak wajah langsung dibanding seluruh wajah langsung yang berhasil diproses. Tampilkan juga coverage terhadap semua percobaan, sehingga kegagalan tidak disembunyikan. Jangan melabeli processing failure sebagai SPOOF.

Keterbatasan pilot: satu peserta, sedikit sesi/media/perangkat, sampel berbagi sumber, dan kondisi terkontrol. Tidak mengukur generalisasi, fairness, seluruh jenis serangan, atau kelayakan login.

## Batas ancaman

| Ancaman | Cakupan kandidat RGB ini |
| --- | --- |
| Foto layar, cetak, replay video di depan kamera | Sasaran pilot PAD; efektivitas lokal belum terbukti |
| Injeksi file/video atau virtual camera | Frame palsu bisa sudah masuk sebelum detector. Model saja tidak membuktikan sumber kamera/keaslian jalur capture |
| Manipulasi request/hasil frontend atau replay request | Membutuhkan kontrol server dan pengikatan request existing; angka PAD dari browser tidak dapat dipercaya sebagai authorization |
| Deepfake, mask/serangan baru | Tidak otomatis tercakup oleh pilot. Tidak membuat klaim tahan semua serangan dari satu model RGB |

Pengikatan frame/request mencegah hasil tertukar dalam aplikasi; itu sendiri bukan attestation kamera. Anti-spoofing tidak menggantikan kontrol auth/session dan tidak mengubah akses bisnis.

## Langkah implementasi terkecil berikutnya

**Tahap 9B yang disarankan: harness offline CPU untuk kesetaraan preprocessing/inference, belum UI/server/login.**

1. Selesaikan pemeriksaan izin bobot PAD dan detector; catat sumber pin serta checksum SHA-256 setelah pengambilan aset diizinkan. Jangan meredistribusikan aset dengan ketentuan belum jelas.
2. Siapkan environment terpisah dengan paket CPU terpin yang kompatibel. Audit potongan upstream yang benar-benar diperlukan; tidak membawa training suite/dependency tak terpakai ke pipeline identitas.
3. Dengan frame kamera portrait yang pengguna izinkan dan disimpan sementara saja, buktikan urutan BGR, tensor 0–255, crop dua scale, load bobot tiga kelas, dan ensemble sama dengan referensi. Tambahan guard error/quality diberi versi dan diuji tersendiri.
4. Ukur satu inference CPU, RAM dan timeout; uji tanpa/multi-wajah, input rusak, aset hilang, non-finite/tie. Hanya setelah hasil nyata tersedia, putuskan integrasi eksperimen internal dan pengambilan pilot. Jangan membuat skor simulasi.

## Bukti dan batas tahap 9A

| Pemeriksaan | Hasil |
| --- | --- |
| Git/instruksi repository dan file pipeline/laporan | Dibaca; pekerjaan tahap 1–8 dipertahankan |
| README, LICENSE, test, crop, transform, arsitektur, daftar bobot PAD pada sumber resmi | Diperiksa dengan commit pin; temuan di atas berasal dari kode, bukan inferensi hasil model |
| Python/package metadata dan CPU | Read-only; tidak install, download bobot, import atau menjalankan kode upstream |
| Lisensi spesifik/provenance bobot dan detector; checksum bytes | Belum cukup jelas/belum diverifikasi; jangan menyebut izin pasti |
| PAD nyata, latency CPU, model parity, kamera/serangan pilot | Belum dijalankan pada tahap ini |
| Perubahan aplikasi, threshold, auth, layanan, database | Tidak dilakukan |

Validasi dokumen: decoding UTF-8 strict dan pemeriksaan whitespace/diff. Tidak mengulang suite/inference identitas karena tidak ada perubahan kode. Kajian ini belum mengaktifkan anti-spoofing atau login wajah.

[commit]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/commit/b6d5f04ad78778917853b25c778acef6d5626d15
[readme-en]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/README_EN.md
[readme]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/README.md
[license]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/LICENSE
[weights]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/tree/b6d5f04ad78778917853b25c778acef6d5626d15/resources/anti_spoof_models
[test]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/test.py
[predict]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/src/anti_spoof_predict.py
[crop]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/src/generate_patches.py
[utility]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/src/utility.py
[transform]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/src/data_io/transform.py
[functional]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/src/data_io/functional.py
[architecture]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/src/model_lib/MiniFASNet.py
[multift]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/src/model_lib/MultiFTNet.py
[requirements]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/requirements.txt
[torch-wheels]: https://download.pytorch.org/whl/torch_stable.html
[torch-previous]: https://pytorch.org/get-started/previous-versions/
