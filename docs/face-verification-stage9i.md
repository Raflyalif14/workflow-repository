# Tahap 9I — Metadata geometri PAD yang aman

Tanggal: 13 Oktober 2026. Branch aktual `feat/face-verification`, HEAD
`58bc3d7`, staging kosong. Seluruh pekerjaan tahap 1–9G/9G.1 dipertahankan.
Sumber: [9F](face-verification-stage9f.md), [9G](face-verification-stage9g.md),
serta diagnosis 9H di percakapan (tidak ditemukan dokumen 9H di repository).

9H tidak menemukan kesalahan binding, warna, normalisasi atau mapping.
Probabilitas spoof LIVE awal **0.9941073656082153** belum memiliki penyebab
yang terbukti. Tahap ini menambahkan pengamatan geometri, **bukan perbaikan
hasil model**. CSV pengguna awal tidak diubah atau dimasukkan ke repo.

## Pengambilan data, tanpa deteksi ulang

`pad_inference.py` menambahkan collector optional pada `detect_box()` dan
`crop_frame()`. `inspect_photo()` menyimpan dimensi **frame yang berhasil
di-decode**, jumlah wajah dari panggilan `detector.detect()` yang sudah ada,
bbox/confidence dari satu hasil tersebut sebelum buffer dibersihkan, serta
koordinat yang benar-benar digunakan crop. Tidak memanggil detector lagi,
tidak mengambil landmark, pixel, embedding, path input atau exception mentah.

Detector tetap YuNet 2023mar, confidence 0.9/NMS 0.3/topK 5000, max-side 640;
bbox dipetakan ke ukuran frame asli. Crop tetap
`yunet-max-side-square-context-1.2-clip-v1`, rounding floor/ceil, clipping,
slice dan copy yang sama. Adapter 9F, resize cubic 128, RGB float32 NCHW,
mean/std, checksum bobot, probabilitas/index kelas serta threshold tidak
berubah. Test membandingkan pixel ROI dengan ekspresi pre-9I dan tensor
adapter dengan tensor sebelum diagnostik; keduanya identik.

## Kontrak `diagnostics`

Versi: **`pad-geometry-v1`**. Semua koordinat dalam **piksel frame hasil
decoding/EXIF orientation**, bukan preview browser mirrored. Tidak dibulatkan
untuk response/CSV. UI membatasi tampilan angka pecahan menjadi tiga desimal
agar ringkas; angka asli tetap pada CSV.

| Field | Definisi dan validasi |
| --- | --- |
| `version` | Literal `pad-geometry-v1`. |
| `frame.width/height` | Integer, 128–4096, total ≤8MP. Hanya setelah decode berhasil. |
| `faceCount` | Integer 0–5000 dari hasil deteksi. **0 berarti benar-benar tidak ada wajah**; null berarti deteksi belum berhasil. |
| `bbox.x/y/width/height` | Float finite hasil YuNet yang dipetakan ke frame asli; hanya untuk satu wajah dan bbox valid. x/y ≥0, width/height >0, seluruh bbox di dalam frame. |
| `bbox.confidence` | Nilai asli elemen confidence YuNet, finite 0–1. Jika nilai ini tidak valid, null; tidak mengubah confidence gate/deteksi/crop. |
| `cropBeforeClip.left/top/right/bottom` | Integer hasil floor/ceil sebelum clipping. Dapat negatif/melebihi frame. Harus konsisten dengan bbox, pusat dan sisi `max(width,height)*1.2`. |
| `cropAfterClip.left/top/right/bottom` | Integer hasil intersect dengan frame. Harus sama dengan clipping koordinat sebelumnya. Right/bottom **eksklusif** seperti slice NumPy. |
| `roi.width/height` | Ukuran aktual array crop yang dibuat; sama dengan right-left / bottom-top; minimal 2. Tidak memakai ukuran input model 128×128 sebagai ukuran ROI. |
| `clipped.left/top/right/bottom` | Boolean per tepi, berdasarkan perbedaan koordinat sebelum/sesudah clipping. false adalah pengamatan nyata, bukan pengisi data yang hilang. |

Field tahap yang belum diperoleh adalah **null**. Seluruh `diagnostics`
boleh null pada timeout/error transport atau response lama. Object parsial
tetap memuat semua field dengan null eksplisit. Tidak membuat bbox dari
label atau ukuran preview.

Contoh sintetis: frame 240×200, bbox (0,0,40,60) menghasilkan crop sebelum
(-16,-6 →56,66), crop setelah (0,0 →56,66), ROI 56×66, clipped kiri/atas true.
Ini contoh geometri, bukan hasil foto peserta/PAD.

## Kegagalan dan batas pengamatan

- Decode gagal: seluruh pengukuran null.
- Detector hilang/exception: frame tersedia, faceCount/bbox/crop null.
- Nol atau beberapa wajah: frame + jumlah sebenarnya; bbox/crop null.
- Bbox invalid: frame + count; bbox invalid tidak diteruskan sebagai angka
  yang seolah sah. Crop tidak tersedia.
- Model gagal setelah crop: geometri yang telah diperoleh tetap tersedia,
  probabilitas tetap kosong. Tidak diubah menjadi LIVE atau skor 0.
- Child timeout/termination: parent tidak memiliki hasil parsial yang
  terkonfirmasi, sehingga diagnostics null.

Node dan frontend memvalidasi tipe number/boolean (tanpa coercion), finite,
batas dimensi/koordinat, relasi count-bbox, rumus crop, ukuran ROI dan flag
clipping. Field tambahan pada setiap object **diproyeksikan keluar**.
Kontrak tidak valid ditolak; tidak ditampilkan sebagai diagnostik terpercaya.
Success object baru harus memiliki geometri lengkap; response lama tanpa
diagnostics masih kompatibel dan menampilkan tidak tersedia, tanpa backfill.

Binding request ID/slot/checksum file dan akun/foto/generasi/metadata existing
tetap dipakai. Diagnostics kegagalan yang tersedia juga wajib membawa request
ID/slot yang benar. Retake/delete/edit metadata/cancel/logout/ganti akun dan
hasil terlambat membatalkan seluruh hasil beserta geometri.

## UI dan ekspor

Ringkasan hasil menampilkan frame, jumlah wajah, ROI serta tepi terpotong.
Native `<details>/<summary>` menampilkan bbox/confidence dan koordinat crop.
Field tidak tersedia memakai `—`, tanpa nol palsu. EN/ID terpusat, layout
min-width 0 dan angka panjang dapat wrap; tabel catatan scroll di wadahnya.

Ekspor baru bernama **`face-pad-notes-geometry-v1.csv`**, agar berbeda dari
CSV pilot awal. Dua puluh dua kolom existing tetap berada di posisi yang sama;
**23 kolom baru ditambahkan di akhir**:

```text
diagnostics_version, decoded_frame_width, decoded_frame_height,
detected_face_count, yunet_bbox_x, yunet_bbox_y, yunet_bbox_width,
yunet_bbox_height, yunet_confidence, crop_before_left, crop_before_top,
crop_before_right, crop_before_bottom, crop_after_left, crop_after_top,
crop_after_right, crop_after_bottom, roi_width, roi_height,
clipped_left, clipped_top, clipped_right, clipped_bottom
```

Baris lama tanpa diagnostik mengekspor 23 sel kosong. Tidak menghitung ulang
atau menebak nilai lama. Nol/false pengamatan yang valid tetap diekspor.
Finite numeric literals mempertahankan tanda negatif koordinat sebelum clip
dan presisi asli; text user tetap di-escape dan dilindungi formula injection.
CSV SFace dan file CSV pengguna tidak dibuka untuk write atau ditimpa.
Catatan tetap di memori, tanpa persistence/foto/embedding.

## Pengujian aktual

- **19 test Python PASS**, 0 SKIP/FAIL/ERROR (11 test 9G terdampak +8 baru):
  ROI pixel center/edges, clipping per tepi, bbox/confidence asli, deteksi
  satu kali, cleanup, partial/error/null, dan tensor/probability mapping tetap.
- **Validator backend PASS**: center/edge, partial/null legacy, invalid tipe,
  NaN/Infinity/koordinat/count/ROI/flag, serta proyeksi field aman.
- **HTTP Node/Python nyata PASS**, provider/profile sintetis dan fixture NASA
  existing beratribusi: diagnostik success lengkap, multi-face partial,
  malformed geometry ditolak, unknown fields tidak bocor, request/checksum,
  auth/limits/timeout existing. Tidak memakai foto pengguna atau database live.
- **Hook/CSV frontend PASS**: success/error diagnostik, stale account/photo/
  metadata/cancel/timeout, failure request/slot mismatch, double recording,
  compatibility/no-backfill, CSV precision/negative coordinates/escaping,
  key EN/ID. Component geometri dirender **statis** dalam EN/ID untuk details,
  center/edge/zero/null. Ini bukan bukti browser/kamera fisik tahap 9I.
- Backend/frontend TypeScript, Python syntax, strict UTF-8 serta diff check
  diperiksa terarah. Tidak full suite/build, 9A–9F/MiniFASNet/London rerun,
  runtime install/download, kamera atau pengiriman foto pengguna.
- Hasil dan daftar file final: `face-verification-stage9i-results.json`.

## Startup dan capture berikutnya

Launcher pilot existing `.cache/face-pilot-session/run.cjs` dipakai untuk
memuat backend/PAD terbaru. Sebelum restart, supervisor/descendants/listeners
diperiksa via Windows owner, command fingerprint, creation time dan ancestry;
stop command melakukan verifikasi lagi. Frontend 3000 tetap berjalan.
Bootstrap pilot tetap memakai app/auth asli tanpa memulai worker notifikasi.
Keys random hanya dalam environment proses, tidak dicetak/disimpan.

Backend 5000 dan authenticated health SFace 8765/PAD 8766 PASS setelah restart.
Ketiga listener pilot 127.0.0.1; PID aktual aman tercatat pada status launcher,
bukan perintah untuk kill berdasarkan PID lama. Tidak melakukan inference
atau membuka kamera pada sesi pengguna untuk membuktikan startup.

```powershell
node 'D:\Workflow Repository System\.cache\face-pilot-session\run.cjs' start
node 'D:\Workflow Repository System\.cache\face-pilot-session\run.cjs' status
# Stop hanya keluarga proses pilot yang identitasnya sesuai:
node 'D:\Workflow Repository System\.cache\face-pilot-session\run.cjs' stop
```

1. Jika ada catatan sementara di browser, ekspor dahulu sebelum refresh.
   Pertahankan `face-pad-notes.csv` lama.
2. Buka halaman eksperimen; ambil **capture baru**, isi kode peserta/sesi/
   presentasi/media secara nyata, consent dan Periksa PAD.
3. Baca Geometri frame; buka Detail geometri untuk bbox/crop/clipping.
   Catat hasil, termasuk ERROR jika terjadi, lalu ekspor file geometry-v1.
4. Bandingkan pengamatan development tanpa mengganti label berdasar skor.
   Geometri **tidak membuktikan penyebab blur/pencahayaan, kesetaraan crop
   upstream, akurasi PAD, liveness atau keamanan login**. Masalah hasil LIVE
   awal belum dinyatakan teratasi. Pilot fisik dengan diagnostik ini belum diuji.

## File

Python: `pad_inference.py`, `pad_server.py`, `tests/test_pad_camera.py`.
Backend: route/test PAD, util validator/test baru.
Frontend: validator baru, helper CSV/result, hook, panel dan component geometri
baru, hook/CSV test dan EN/ID. Laporan/evidence baru tahap ini saja; laporan
lama serta adapter/model/identity/auth/workflow tetap dipertahankan.
