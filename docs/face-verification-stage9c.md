# Tahap 9C — Audit sumber dan ketentuan aset PAD

Tanggal audit: **12 Oktober 2026**. Hanya teks dan metadata publik resmi yang
dibaca. Tidak mengambil binary, memuat model/detector, install, membuat venv,
menjalankan inference, atau menghubungi maintainer.

## Ringkasan keputusan

**Dua bobot MiniFASNet memiliki dasar interpretasi lisensi repositori yang
cukup kuat; kepastian asal/hak detector belum dapat ditutup.** Tidak ditemukan
pernyataan khusus yang menyebut keempat nama aset dan cakupan haknya satu per
satu. Ini tidak membuktikan bahwa aset tanpa file lisensi sendiri tidak berizin.

Root Apache 2.0, README yang menyebut model terbuka, dan penyertaan bobot oleh
anggota proyek merupakan bukti yang relevan terhadap cakupan repositori.
Jangan menyimpulkan root license hanya untuk kode; jangan pula menyimpulkan
root license mengatasi semua hak pihak ketiga/data secara pasti.

Rekomendasi saat ini: pertahankan harness/preprocessing 9B; selesaikan pertanyaan
spesifik asal detector dan cakupan bobot sebelum menyatakan paket PAD siap
diambil, didistribusikan, atau dipakai untuk produksi. Tahap ini tidak
memberikan persetujuan operasional untuk download atau inference berikutnya.

## Baseline dan metode

- Dibaca terlebih dahulu: [9A](face-verification-stage9a.md) dan
  [9B](face-verification-stage9b.md).
- Git aktual: `feat/face-verification`, HEAD `58bc3d7`, staging kosong;
  106 file pekerjaan existing dipertahankan. Hanya dokumen ini ditambahkan.
- Snapshot Minivision: **`b6d5f04ad78778917853b25c778acef6d5626d15`**.
  [Tree API rekursif][tree] mengembalikan `truncated=false`.
- Tree memuat root `LICENSE`. Tidak ada file bernama NOTICE, COPYING,
  COPYRIGHT, THIRD_PARTY atau lisensi lain yang ditemukan pada snapshot,
  termasuk di direktori empat aset. Ketiadaan NOTICE bukan bukti izin atau
  bukti bahwa tidak ada materi pihak ketiga.
- README English/Mandarin, LICENSE, riwayat commit empat path, metadata blob,
  teks `deploy.prototxt`, serta diskusi publik yang relevan diperiksa.
- Pencarian issue mencakup `license`, `licence`, `commercial`, `商用`, `商业`,
  `授权`, `版权`, `许可`, dan `dataset`. Ini pencarian terbatas, bukan pembuktian
  bahwa tidak ada pernyataan lain di seluruh internet, channel privat atau video.
- Kesimpulan diberi tiga tingkat: **eksplisit** (tertulis/metadata),
  **interpretasi** (penalaran dari bukti), **belum tersedia** (tidak terkonfirmasi).

## Inventaris empat aset

Seluruh URL aset berikut menunjuk **halaman metadata/source**, bukan instruksi
download. Binary `.pth` dan `.caffemodel` tidak dibaca.

| Aset dan sumber resmi | Snapshot / riwayat path | Bukti eksplisit | Interpretasi dan batas kepastian |
| --- | --- | --- | --- |
| [`2.7_80x80_MiniFASNetV2.pth`][v2] | Snapshot `b6d5f04…`; ditambahkan pada [`f679b7c…`][pad-commit], 14 Juli 2020, oleh `zhuyingSeu` | Binary tercantum bersama root Apache-2.0 dan README model terbuka; ukuran metadata 1,849,453 byte | Masuk akal membaca bobot yang disertakan sebagai bagian karya proyek. Tidak ada pengecualian ditemukan, tetapi tidak ada grant khusus filename/model card atau pemetaan hak data training yang terkonfirmasi. Bukan bukti bobot pasti hanya untuk riset. |
| [`4_0_0_80x80_MiniFASNetV1SE.pth`][v1se] | Snapshot `b6d5f04…`; ditambahkan pada commit [`f679b7c…`][pad-commit] yang sama | Root/README dan contributor sama; ukuran metadata 1,856,130 byte | Dasar cakupan repositori sama dengan V2. Jangan menganggap lisensi/aset versi ONNX pihak lain otomatis berlaku pada file `.pth` ini. Kepastian khusus bobot/data masih belum tersedia. |
| [`Widerface-RetinaFace.caffemodel`][detector] | Snapshot `b6d5f04…`; ditambahkan pada [`11730bc…`][detector-commit], 16 Juni 2020, oleh `zhuyingSeu` | Metadata 1,866,013 byte; README merujuk proyek RetinaFace; predictor memuat file ini bersama prototxt | Penyertaan/root license merupakan bukti, tetapi asal bobot dan rantai conversion/retraining belum terhubung ke sumber asli yang spesifik. Tidak dapat menetapkan Apache, MIT, ataupun research-only secara pasti untuk binary ini. |
| [`deploy.prototxt`][prototxt] | Snapshot `b6d5f04…`; ditambahkan bersama detector pada [`11730bc…`][detector-commit] | Teks konfigurasi 40,787 byte, 2,500 baris menurut pembacaan teks; tidak ditemukan URL, copyright, author, license atau NOTICE di dalamnya | Konfigurasi merupakan jenis materi yang dapat dicakup license repositori. Belum diketahui apakah ditulis sendiri atau diturunkan dari konfigurasi lain. Ketentuan bobot tidak otomatis identik dengan ketentuan file konfigurasi ini. |

Riwayat di atas adalah riwayat **path tersebut** pada snapshot, bukan bukti
asal seluruh training/format sebelumnya. Metadata commit membuktikan siapa
mengunggah, bukan semua hak yang dimilikinya.

### Identitas metadata, bukan checksum binary terverifikasi

[Tree API][tree] mencatat Git blob object IDs berikut:

| Aset | Git blob ID pada snapshot |
| --- | --- |
| MiniFASNetV2 | `47c4af2023fb072c0f5b0e0ade4824053a0558e1` |
| MiniFASNetV1SE | `55a25b316ef33ced3925687007a31a5e306990db` |
| Caffe detector | `8f7b5178cfc667c349b5887a29451b72420ea7b7` |
| Prototxt | `6821aca03203a68107735897b3406605e2f9c520` |

Git blob ID bukan SHA-256 file binary dan bukan checksum yang dihitung dari
binary lokal. **SHA-256 bobot/detector: belum tersedia.** Tidak membuat nilai
checksum dugaan. Checksum file kode/lisensi yang dicatat 9B berbeda objeknya.

## Bukti ketentuan repositori Minivision

### Eksplisit

1. [LICENSE pada snapshot][license] berisi Apache License 2.0, copyright 2020
   Minivision. Definisi Source mencakup kode, dokumentasi dan konfigurasi;
   Object tidak hanya executable. Grant mengacu pada karya yang dilisensikan,
   tanpa syarat non-komersial pada teks Apache tersebut.
2. [README English][readme-en] menyatakan pelepasan model anti-spoofing beserta
   training/preprocessing/test. [README Mandarin][readme-zh] membedakan model
   terbuka dari model high-precision privat dan menyebut release Caffe pada
   30 Juli 2020. Promosi SDK komersial terpisah tidak dengan sendirinya
   memberikan syarat research-only pada dua `.pth` ini.
3. Tree tidak berisi lisensi tambahan untuk empat path. Metadata commit
   membuktikan bobot PAD dan detector/config disertakan oleh `zhuyingSeu`.

### Interpretasi yang dapat dipertanggungjawabkan

Root license ditambah README dan isi repositori mendukung pembacaan bahwa
model proyek yang disertakan dapat merupakan bagian karya berlisensi. Lisensi
tidak harus diulang dalam setiap file untuk menjadi bukti yang relevan.
Namun scope karya, hak contributor, dan materi pihak ketiga tetap perlu
dihubungkan pada aset spesifik. Klaim "Apache pasti hanya kode" dan "Apache
pasti mencakup seluruh aset/hak data" sama-sama terlalu kuat untuk bukti ini.

Jadi, penyebutan "lisensi khusus bobot belum jelas" pada 9A–9B berarti
**belum ada kepastian per aset**, bukan penetapan bahwa bobot tidak berizin.
Dokumen lama dipertahankan; penjelasan lebih lengkap ada di audit ini.

## Pernyataan maintainer dan batasnya

Dalam [issue #25, komentar 21 Agustus 2020][dataset-member-1], `zhuyingSeu`
dengan `author_association=MEMBER` menjelaskan bahwa contoh data tidak dibuka
karena privasi. [Komentar lanjutannya][dataset-member-2] menyatakan tidak memakai
dataset open-source dan mengumpulkan data sesuai skenario aplikasi.

Ini bukti eksplisit pernyataan anggota proyek, **setelah** tanggal snapshot.
Pernyataan membahas data proyek secara umum, tidak menyebut kedua filename,
lisensi bobot, persetujuan peserta, atau daftar data/izin per model. Tidak
boleh menyimpulkan consent/hak data sudah terbukti, ataupun membatasi bobot PAD
sebagai non-komersial hanya karena datanya tidak tersedia. Rujukan CelebA
dalam diskusi juga tidak membuktikan bobot ini dilatih pada CelebA.

Pencarian lisensi menemukan [issue #138][onnx-issue] yang menyatakan konversi
ONNX memakai Apache 2.0. Penulisnya pihak luar (`author_association=NONE`),
bukan grant Minivision; tidak ada komentar pada issue tersebut ketika diperiksa.
Ini bukan bukti tambahan izin empat aset asli. Diskusi dataset #108/#132 yang
dibaca tidak memberi pernyataan lisensi dari anggota proyek. Tidak ditemukan
jawaban maintainer yang secara eksplisit menutup empat pertanyaan aset ini
dalam pencarian di atas. Tidak ada pesan yang dikirim.

## Detector dan rantai pihak ketiga

### Apa yang terhubung secara eksplisit

[README Minivision][readme-en] menunjuk
`deepinsight/insightface/RetinaFace`. [Predictor][predict] menyebut dua path
detector, tetapi tidak menunjuk release/hash bobot asal atau proses conversion.
Prototxt dimulai dengan nama jaringan
`20200403141819_Widerface-RetinaFace_mb_640_negscope-0_epoch_4`.
Nama ini bukan bukti tanggal training, pemilik, dataset, atau lisensi.

Untuk menghindari hanya mengandalkan README bergerak, diperiksa sumber resmi:

- [RetinaFace README historis][retina-historical], revisi
  `0a634cb8ae04844375c176c4fd46e6492f49f57f` (8 Oktober 2019), revisi path README
  terakhir yang ditemukan sebelum commit detector Minivision. Dokumen membahas
  MXNet, data WIDERFACE, bobot R50 serta model MobileNet dari pihak ketiga.
  Tidak mengidentifikasi dua file Caffe Minivision.
- [Root README InsightFace pada revisi historis itu][insight-historical]
  membedakan kode MIT dan ketentuan non-commercial research untuk data
  beranotasi beserta model yang dilatih menggunakan data tersebut.
- [Root README InsightFace saat audit][insight-current], dipin ke
  `81929474ec02e54e3655f6841bced800009c592d` (4 Oktober 2026), tetap membedakan
  kode MIT dari data/model tertentu dengan ketentuan non-komersial.

### Apa yang belum terhubung

Belum ada bukti apakah Caffe detector ini:

1. conversion dari bobot InsightFace yang dibatasi penggunaannya;
2. conversion dari bobot pihak ketiga yang disebut RetinaFace;
3. training Minivision sendiri dengan kode/konfigurasi/data lain; atau
4. varian lain dengan grant yang berbeda.

Karena itu, kebijakan InsightFace merupakan **risiko provenance yang relevan**,
bukan bukti otomatis bahwa seluruh aset Minivision bersyarat non-komersial.
Sebaliknya, nama file/keberadaan Apache tidak cukup untuk mengabaikan kebijakan
asal jika kelak conversion dari bobot terbatas terbukti. Konversi format tidak
membuktikan munculnya hak baru. Audit ini tidak memperluas ketentuan InsightFace
ke YuNet/SFace existing; pipeline identitas tidak dinilai ulang atau diubah.

## Eksperimen lokal, redistribusi, dan produksi

| Penggunaan | Pembacaan berdasarkan bukti | Keputusan praktis saat ini |
| --- | --- | --- |
| Belajar offline non-komersial, tanpa berbagi aset | Jika aset termasuk karya Apache, teksnya memberi hak penggunaan/copy; pemakaian lokal tidak membuktikan scope otomatis. Jika detector ternyata tunduk ketentuan research-only, pastikan eksperimen memenuhi tujuan research, bukan sekadar menyebutnya lokal | Belum mengaktifkan inference; dua PAD punya dasar repositori lebih kuat, detector perlu klarifikasi asal. Lokasi localhost tidak otomatis berarti non-komersial |
| Membagikan repo, zip, installer, Docker image atau binary | Jika Apache berlaku, redistribusi memerlukan salinan lisensi, pemberitahuan perubahan dan retensi notices; NOTICE upstream yang ada harus diteruskan. Hak pihak ketiga tetap diperiksa | Jangan memasukkan binary ke Git/distribusi berdasarkan metadata saja; perlu scope dan attribution tiap aset |
| Produksi internal/komersial atau layanan tanpa membagikan bobot | Apache tidak membatasi penggunaan karya yang dicakup ke riset. Tidak mendistribusikan tidak menghapus pembatasan penggunaan dari sumber aset lain | Paket empat aset belum dapat dinyatakan cleared untuk produksi; pastikan asal detector dan ketentuan penggunaan, terpisah dari evaluasi kualitas/keamanan PAD |

Ringkasan Apache di atas bersumber [LICENSE][license], khususnya sections
1–4, 6–7. Grant tersebut bergantung pada cakupan karya; tidak menjamin seluruh
hak pihak ketiga atau kualitas sistem. Tidak ada bukti yang menetapkan lisensi
baru bagi bobot hanya karena inference dilakukan lokal.

## Pertanyaan klarifikasi spesifik — belum dikirim

**Untuk Minivision / pemilik aset:**

1. Apakah Apache 2.0 pada commit `b6d5f04…` dimaksudkan mencakup **kedua `.pth`
   yang disebut di tabel**, termasuk eksperimen offline, penggunaan komersial,
   redistribution, dan conversion ONNX? Adakah pengecualian tertulis?
2. Untuk `Widerface-RetinaFace.caffemodel`, siapa pembuat/pemilik bobot; apa URL
   release/commit aset asal; apakah dilatih sendiri atau dikonversi? Jika
   dikonversi, dari model/revisi mana dan dengan izin apa?
3. Apakah `deploy.prototxt` karya sendiri atau turunan konfigurasi lain? Berikan
   source/revisi, copyright dan notices yang perlu dipertahankan.
4. Untuk kedua PAD dan detector, adakah pembatasan data/annotation/training yang
   diteruskan ke hak penggunaan atau redistribusi bobot? Apakah hak melepas
   bobot untuk penggunaan yang diminta dapat dikonfirmasi tanpa membuka data
   wajah privat?
5. Notices/lisensi apa yang harus menyertai packaging keempat aset? Apakah ada
   sumber checksum resmi SHA-256 untuk file pada snapshot tersebut?

**Hanya jika asal InsightFace/pihak ketiga terbukti:** tanyakan pada pemilik
asal apakah lisensi aset spesifik mengizinkan conversion, eksperimen lokal,
redistribusi dan produksi yang direncanakan. Jangan meminta izin untuk model
yang berbeda atau menganggap README current mengidentifikasi file historis ini.

## Langkah terkecil dan batas verifikasi

Langkah terkecil sekarang adalah memakai tabel/pertanyaan ini untuk keputusan
scope aset, terutama **rantai asal Caffe detector dan prototxt**, tanpa download
atau install. Tidak perlu mengulang 18 PASS / 1 SKIP 9B untuk audit dokumen.
Jika klarifikasi resmi tersedia kemudian, tambahkan bukti tertulis dan revisi
sebelum mengambil aset serta menghitung SHA-256 binary yang sebenarnya.

Yang sudah selesai: penelusuran sumber resmi/metadata, lisensi repositori,
riwayat empat path, atribusi, diskusi publik, dan batas hak penggunaan.
Yang belum terbukti: scope grant spesifik tiap binary, rantai asal detector,
hak data per bobot, checksum binary, ataupun inference/ketahanan PAD.

Validasi tahap ini hanya UTF-8 strict, whitespace/diff dan preservasi file
existing. Tidak menjalankan suite aplikasi, test 9B, model atau server; tidak
mengambil foto, embedding, credential atau data live. Tidak ada operasi Git
write ataupun kontak maintainer.

[tree]: https://api.github.com/repos/minivision-ai/Silent-Face-Anti-Spoofing/git/trees/b6d5f04ad78778917853b25c778acef6d5626d15?recursive=1
[license]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/LICENSE
[readme-en]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/README_EN.md
[readme-zh]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/README.md
[v2]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.pth
[v1se]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/resources/anti_spoof_models/4_0_0_80x80_MiniFASNetV1SE.pth
[detector]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/resources/detection_model/Widerface-RetinaFace.caffemodel
[prototxt]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/resources/detection_model/deploy.prototxt
[pad-commit]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/commit/f679b7c96ad407d1114182847d3e0c20619a76d0
[detector-commit]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/commit/11730bcc3710753f06e2e6a8c1b997e149965a16
[dataset-member-1]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/issues/25#issuecomment-678095382
[dataset-member-2]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/issues/25#issuecomment-678321691
[onnx-issue]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/issues/138
[predict]: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/b6d5f04ad78778917853b25c778acef6d5626d15/src/anti_spoof_predict.py
[retina-historical]: https://github.com/deepinsight/insightface/blob/0a634cb8ae04844375c176c4fd46e6492f49f57f/RetinaFace/README.md
[insight-historical]: https://github.com/deepinsight/insightface/blob/0a634cb8ae04844375c176c4fd46e6492f49f57f/README.md
[insight-current]: https://github.com/deepinsight/insightface/blob/81929474ec02e54e3655f6841bced800009c592d/README.md
