# Tahap 9K — Preview ROI PAD sementara

Tanggal: **13 Oktober 2026**. Branch `feat/face-verification`, HEAD
`58bc3d7`, staging kosong. Scope frontend: melihat daerah frame yang
ditunjuk diagnostik PAD untuk **capture baru**. Penyebab spoof tinggi pada
pilot LIVE **belum diketahui dan belum diperbaiki oleh tahap ini**.

Dasar: [9G](face-verification-stage9g.md), [9I](face-verification-stage9i.md),
[9J](face-verification-stage9j.md). 9J menunjukkan keluaran dua runtime
sebanding pada lima fixture, bukan pada enam frame pilot yang tidak tersedia.
Tidak mengulang inference/model setup atau memakai foto pribadi pengguna.

## Alur preview

1. Panel memakai `attemptFor(slot)` existing: hanya hasil yang masih
   terikat pada akun, Foto A/B, objek foto dan metadata saat request.
2. Preview memerlukan SUCCESS, result/request/slot yang cocok serta
   diagnostik lengkap melalui validator `readPadDiagnostics` existing.
   ERROR/diagnostik kosong atau parsial tidak menampilkan gambar ROI.
3. Sumber adalah **`TemporaryPhoto.blob` frame penuh**, bukan `cropUrl`,
   bbox BlazeFace, preview mirror atau alignment SFace. SHA-256 blob browser
   dicocokkan dengan `result.imageSha256`, tanpa request tambahan.
4. Dimensi foto dan bitmap hasil decode wajib sama dengan
   `diagnostics.frame.width/height` (decoded_frame_width/height pada CSV).
   Batas integer, lebar/tinggi ROI dan clipping divalidasi existing.
   Jika tidak sesuai, tampil **preview tidak tersedia**, tanpa menebak.
5. Koordinat **`cropAfterClip` server langsung** digunakan pada `drawImage`:
   kiri/atas inklusif, kanan/bawah eksklusif. Canvas berukuran asli
   `(right-left) × (bottom-top)`, sumber/tujuan sama besar. Tidak deteksi
   ulang, rekalkulasi crop untuk display, resize ke 128, mirror, warp,
   normalisasi atau perubahan pipeline.
6. PNG ROI dibuat sebagai blob/object URL lokal. `img` menyimpan dimensi
   native; CSS `max-w-full`/`h-auto` mengecilkan **tampilan** jika ruang
   sempit, dengan label ukuran pixel asli. Tidak ada tombol save/upload ROI.

Label **PAD region preview / Preview daerah gambar PAD** terpusat EN/ID.
Penjelasan membedakan ROI ini dari potongan wajah kamera dan menyebut
posisinya sebelum resize model. Status memuat preparing/unavailable dan
alternative text Foto A/B. Model probabilitas tetap terpisah dari preview.

API browser menggunakan [createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap)
dengan orientation `from-image`, tanpa opsi resize. Capture existing berupa
PNG canvas. Resource bitmap dilepas dengan
[ImageBitmap.close()](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap/close).
Decode/encoding browser tidak dijamin identik dengan Pillow/OpenCV, terutama
color management/alpha/format lainnya. **Preview bukan tensor model yang
terbukti identik per piksel.** Tidak merekonstruksi frame dari CSV lama.

## Binding dan cleanup

Manager preview memakai generation dan validity callback. Hasil async
checksum/decode/encode yang selesai setelah clear/dispose/input berubah
tidak boleh menerbitkan URL. Bitmap yang baru selesai decode setelah
unmount tetap ditutup. Canvas dilepas dengan dimensi nol, URL lama direvoke;
buffer sementara perhitungan checksum dibersihkan. Browser/runtime mungkin
memiliki salinan internal; ini bukan jaminan penghapusan forensik.

Hook menahan binding akun/foto/attempt dan tidak mengecat hasil lama pada
render sebelum cleanup effect. Retake/delete/metadata edit menghapus
attempt lewat mekanisme PAD existing sehingga preview unmount/dispose.
Request baru menggantikan preview lama. Logout/pergantian sesi, pergantian
akun/eligibility, pagehide dan unmount menghentikan job serta membersihkan
preview. Pergantian bahasa mempertahankan hasil valid dan URL existing.

Foto A/B dan catatan CSV existing tidak diubah. Preview tidak ditambahkan
ke catatan atau ekspor, tidak di-backfill untuk baris lama, tidak disimpan
pada localStorage/DB/Storage, serta tidak dikirim ke layanan mana pun.
Tidak ada perubahan backend/inference/model/detector/crop/normalisasi/
runtime/mapping/threshold/auth atau database.

## Validasi aktual

### Unit/hook dan render statis

**10 kelompok test terarah PASS**, memakai resource/pixel-coordinate fixture
sintetis/mock, mencakup beberapa varian per kelompok:

- center/native canvas 72×72, koordinat server tepat tanpa mirror/resize128;
- tepi/clipping memakai cropAfterClip 56×66, bukan cropBeforeClip;
- sembilan variasi penolakan: ERROR, diagnostik hilang/parsial, bounds,
  dimensi foto, request/slot berbeda, checksum berbeda dan blob kosong;
- bitmap hasil decode dengan dimensi berbeda ditolak sebelum draw;
- late decode setelah dispose, late encode setelah clear, restart dan
  binding berubah sebelum encode selesai; tidak ada URL usang;
- URL ready direvoke, canvas dikosongkan, bitmap ditutup sekali;
- hook foto/metadata/akun berubah tidak mengecat URL lama, logout segera
  dispose, eligibility/null foto/account mengikuti guard;
- render statis EN/ID: ukuran native/alt/unavailable, tanpa mirror,
  responsive max-width dan kesetaraan key kamus.

Runner PAD hook/CSV existing juga **PASS** sebagai pemeriksaan integrasi
hasil/slot/metadata/akun dan parity kamus setelah panel ditambah. Tidak
mengulang suite aplikasi/9J/London/MiniFASNet atau model nyata.

### Chrome nyata, seluruhnya fixture sintetis

Chrome **155.0.8059.40**, profil terisolasi dari harness browser existing.
Halaman/AuthProvider/app shell/capture/PAD panel aplikasi aktual digunakan.
Kamera berasal dari `canvas.captureStream`; detector capture, auth dan
respons API PAD adalah fixture. Tidak membuka kamera fisik, memakai akun
live, mengirim foto pengguna, atau menjalankan model PAD.

- Full frame pola pixel 640×480 dicapture oleh alur aplikasi. Diagnostik
  fixture memberi crop (104,14 →536,446), ROI **432×432**.
- Membandingkan seluruh pixel ROI PNG browser dengan rectangle frame PNG
  browser tersebut: selisih maksimum **0**. Ini hanya kesetaraan crop PNG
  sintetis dalam browser yang sama, **bukan kesetaraan tensor Python**.
- 1440/390/360px × EN/ID: nativeWidth 432, renderedWidth 327/252/222px,
  tidak mirror, label ukuran terlihat, scrollWidth sama dengan clientWidth.
  Tidak ada overflow horizontal halaman. Screenshot desktop EN dan mobile
  ID juga ditinjau secara visual; ekstrak QA sementara hanya gambar pola.
- Dimensi server berbeda, checksum berbeda dan ERROR: ROI tidak tersedia,
  tanpa gambar atau koordinat alternatif.
- Metadata edit/delete merevoke URL, bitmap fixture seluruhnya ditutup,
  stream sintetis berakhir setelah capture; logout menghapus halaman.
- Tidak ada API fixture yang tidak tercakup atau exception browser. Semua
  API diintercept; host selain local app diblokir. Tidak ada backend/Storage
  live request. Profil Chrome task dibersihkan setelah pemeriksaan.

Bukti: [browser-results.json](face-verification-stage9k/browser-results.json)
dan enam screenshot `face-verification-stage9k/roi-{en,id}-{1440,390,360}.png`.
Probabilitas pada screenshot **data fixture**, bukan hasil PAD nyata/akurasi.

Frontend `tsc --noEmit`, strict UTF-8 file teks yang berubah, dan
`git diff --check` diperiksa. Validasi/daftar file akhir:
[face-verification-stage9k-results.json](face-verification-stage9k-results.json).
Semua perubahan existing dipertahankan; staging tetap kosong.

## Kesiapan startup dan cara mencoba

Launcher pilot existing diperiksa dengan operasi **status read-only**.
Supervisor/listener cocok dengan sesi repo; backend 5000, SFace 8765 dan
PAD 8766 tetap aktif pada 127.0.0.1, health backend dan authenticated health
kedua Python true dengan timestamp monitor terbaru. Frontend 3000 tetap
berjalan dan melayani kode terbaru pada browser fixture. Tidak restart
atau menghentikan proses pengguna. Tidak perlu perubahan startup backend.

```powershell
node 'D:\Workflow Repository System\.cache\face-pilot-session\run.cjs' status
```

1. **Ekspor catatan sementara dahulu** jika akan refresh. CSV pilot lama
   tetap disimpan sendiri; halaman tidak dapat memuat ulang foto dari CSV.
2. Buka `/settings/face-verification` dengan login biasa. Capture Foto A/B
   baru, isi kode peserta/sesi/presentasi/media yang benar, consent, Periksa PAD.
3. Pada hasil SUCCESS, baca **Preview daerah gambar PAD** dan ukuran ROI
   asli. Bandingkan framing/konteks dengan tangkapan penuh. ROI sengaja
   tanpa mirror walau preview kamera mirror; sumber datanya tetap konsisten.
4. Jika unavailable, periksa hasil sukses/geometri/dimensi yang tersedia;
   tidak mengganti koordinat sendiri. Retake/hapus/edit metadata memerlukan
   hasil PAD baru dan membersihkan preview sebelumnya.
5. Catat/ekspor metadata PAD lewat mekanisme existing jika diperlukan.
   Preview sendiri tetap hanya sementara, tanpa save/export tambahan.

**Capture pengguna dengan preview 9K belum diuji pada sesi ini.** Melihat ROI
dapat membantu mengenali framing, tetapi tidak membuktikan penyebab blur,
pencahayaan, domain mismatch, spoof tinggi, keaslian atau keamanan login.
Tidak menetapkan threshold atau mengganti model/runtime berdasarkan preview.

## File utama

- `frontend/src/lib/face-pad-roi.ts`: validasi/binding input, checksum,
  decode/canvas dan lifecycle object URL.
- `frontend/src/hooks/use-face-pad-roi.ts`: lifecycle akun/foto/request.
- `frontend/src/components/settings/face-pad-roi.tsx`: UI EN/ID responsive.
- Panel PAD existing, kamus EN/ID dan package runner: integrasi kecil.
- Unit/hook runner/test serta browser harness baru; laporan dan bukti
  sintetis. Tidak ada dependency baru atau perubahan CSV lama.

Perintah terarah jika implementasi terkait berubah:

```powershell
Set-Location -LiteralPath 'D:\Workflow Repository System\frontend'
node tests/face-pad-roi.cjs
node tests/face-pad.cjs
.\node_modules\.bin\tsc.cmd --noEmit
node tests/browser/face-pad-roi-browser.cjs
```

Browser harness membutuhkan local app 3000 dan Chrome existing. API/camera
fixture berada di harness, bukan endpoint/bypass aplikasi production.
