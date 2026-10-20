# Diagnosis verifikasi wajah, 13 Oktober 2026

Status: **perbaikan isolasi Foto A/B selesai; masalah skor PAD tinggi dan
login wajah belum terselesaikan**.

Pembaruan pemeriksaan foto yang sama: lihat
[analisis tangkapan kamera](face-pad-capture-analysis.md). Analisis baru berhasil
mengulang skor pengguna pada dua runtime dan tiga potongan. Bagian di bawah
mencatat pemeriksaan awal sebelum analisis tersebut tersedia.

## Temuan pada aplikasi yang terbuka

- Halaman `/settings/face-verification` sudah memiliki satu tangkapan,
  hasil PAD SUCCESS, satu wajah terdeteksi, dan preview ROI yang berhasil
  dimuat. Frame 640 x 480; ROI 355 x 355 tanpa clipping.
- Tangkapan berlabel manual LIVE menghasilkan real
  `0.0003748097224161029` dan spoof `0.9996252059936523`. Ini pengamatan
  pada halaman pengguna, bukan hasil eksperimen baru atau ground truth
  yang diverifikasi secara independen.
- Tidak ada error/warning pada log tab yang tersedia ketika diperiksa.
- Kode login memakai email/password. Endpoint wajah memerlukan sesi
  autentikasi existing dan tidak menerbitkan sesi login wajah.

## Bug yang direproduksi dan diperbaiki

`useFacePad` sebelumnya menghapus seluruh hasil dan membatalkan request
ketika salah satu foto berubah. Mengambil ulang Foto B menghilangkan hasil
PAD/ROI Foto A walaupun input A tetap sama. Mengedit metadata B juga
membatalkan request A yang masih berjalan.

Sekarang invalidasi mengikuti slot foto. Foto/metadata B hanya membatalkan
request B; hasil dan request A tetap terikat pada input aslinya. Perilaku
ini berlaku sebaliknya. Pergantian foto tetap meminta consent baru untuk
request berikutnya; request yang sudah disetujui pada foto lain tetap
berjalan. Logout, pergantian akun, cancel, dan perubahan foto/metadata
yang sedang diperiksa tetap membatalkan request dan menolak respons lama.

File aplikasi yang diubah pada pemeriksaan ini:

- `frontend/src/hooks/use-face-pad.ts`
- `frontend/src/lib/face-pad.test.tsx`

## Validasi aktual

- Tes regresi baru gagal pada salinan terisolasi perilaku lama, tepat pada
  kasus hasil A hilang ketika B diambil ulang. Kode aplikasi yang sedang
  berjalan tidak ditukar dengan salinan tersebut.
- `node tests/face-pad.cjs`: PASS, termasuk retake/delete B, recording
  tanpa duplikasi, request A/B independen, serta pembatalan foto aktif.
- `node tests/face-pad-roi.cjs`: PASS (10 kelompok).
- Frontend `tsc --noEmit`: PASS.
- Python `test_mn3_offline.py`: 14 PASS; `test_pad_camera.py`: 19 PASS.
  Tes tersebut memakai fixture/mock; bukan validasi akurasi wajah pengguna.
- `git diff --check`: PASS untuk perubahan tracked yang sudah ada.
  Dua file perubahan ini masih untracked dari pekerjaan sebelumnya;
  pengecekan whitespace/UTF-8 dilakukan terpisah.
- Tangkapan, preview ROI, dan satu catatan existing masih terlihat setelah
  edit. Tab tidak direfresh, metadata tidak diganti, foto tidak dikirim
  ulang, dan kamera fisik tidak dibuka.

Belum menjalankan full build/suite atau uji browser interaktif untuk
perilaku baru. Probe HTTP shell ke localhost ditolak sandbox (`EACCES`),
sehingga tidak dipakai sebagai bukti server mati. Status launcher shell
juga tidak berhasil; tidak ada restart/stop layanan.

## Mengapa skor spoof belum dinyatakan diperbaiki

Urutan RGB, ukuran input, mean/std dan urutan kelas kode sesuai
[kontrak original ONNX OpenVINO](https://docs.openvino.ai/2023.3/omz_models_model_anti_spoof_mn3.html).
Tidak ditemukan dasar untuk menukar kelas, mengubah normalisasi atau
melonggarkan ambang agar tangkapan ini tampak lolos.

Crop aplikasi menggunakan persegi 1.2 kali sisi maksimum bbox YuNet.
[Demo asli model](https://github.com/kprokofi/light-weight-face-anti-spoofing/blob/82a2c26bacff5462c6f9320c34ae0363ccbed497/demo_tools/wrapers.py)
menggunakan detector lain serta perluasan lebar 1.1 dan tinggi 1.05.
Perbedaan pipeline ini adalah kandidat penyelidikan, **bukan penyebab
terbukti**. Crop/model/probabilitas/auth belum diubah dalam perbaikan ini.

Percobaan mengambil frame existing melalui `downloadMedia` gagal karena
browser tidak mendukung unduhan blob. Inventaris aset halaman juga tidak
menyediakan gambar blob. Tidak ada file foto pengguna yang berhasil
diunduh/disimpan. Karena tidak tersedia bytes frame asli, perbandingan
input yang sama terhadap pipeline referensi belum dapat dilakukan.

Langkah teknis berikutnya adalah menyiapkan uji lokal pada frame identik
dengan jalur input referensi yang ditetapkan lebih dahulu, lalu menguji
ulang capture LIVE dan presentasi foto/video. Hasil satu tangkapan maupun
tes sintetis tidak cukup untuk menyatakan model siap mengamankan login.
