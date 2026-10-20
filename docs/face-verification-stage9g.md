# Tahap 9G — PAD tangkapan kamera lokal, terpisah dari SFace

Tanggal: 13 Oktober 2026. Branch `feat/face-verification`, HEAD `58bc3d7`,
staging kosong. Sebelum perubahan: 128 file dirty/untracked existing disnapshot.
Tahap 1–9F dipertahankan. Tidak mengubah database, autentikasi login,
threshold London, workflow, dependency/environment, atau aset MiniFASNet.

## Alur dan batas hasil

Capture Foto A/B existing tetap menyimpan PNG **frame penuh** di memori.
Panel baru menerima `TemporaryPhoto.blob`, bukan `cropUrl`/alignment SFace.
User mengisi kode peserta, sesi capture, presentasi sebenarnya dan kode media
asal (wajib untuk layar/cetak/video), memberi persetujuan PAD terpisah, lalu
menekan Periksa PAD Foto A atau B. Metadata label diisi user, bukan dari skor.

Node memakai `authenticateUser` existing dan akun aktif tanpa kewajiban ganti
password yang belum selesai. Endpoint `/api/face-pad/{capabilities,inspect}`
terpisah dari `/api/face-experiment/compare`. PAD default nonaktif,
`FACE_PAD_ENABLED=true` hanya opt-in eksplisit. Tidak membuat token/sesi,
menambah enrollment, threshold PAD, atau mengubah login.

Hasil: `SUCCESS` berarti pemrosesan berhasil, **bukan LIVE**. Probabilitas
kelas real/spoof model ditampilkan terpisah; tidak ditafsirkan sebagai
peluang identitas benar atau bukti keaslian. `prediction=null` selalu.
ERROR memiliki probabilitas kosong, tidak skor 0. Cosine user terbaru
**0.7218485474586487** untuk LIVE versus SCREEN_PHOTO/identitas SAME adalah
laporan eksperimen **SFace**, bukan PAD; tidak diimpor ke catatan baru.

## Pipeline dan provenance

- Decoder bounded PNG/JPEG dari `services/face-experiment/inference.py`
  dipakai ulang tanpa perubahan. EXIF orientation diterapkan, tidak mirror.
- YuNet 2023mar existing, bytes diperiksa ukuran 232589 dan SHA-256
  `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`,
  lalu OpenCV buffer overload memuat bytes yang diverifikasi. Confidence
  0.9, NMS 0.3, topK 5000, longest side detector maksimal 640; hasil bbox
  dipetakan ke resolusi asli. Wajib tepat satu wajah. Bbox non-finite,
  non-positive atau di luar frame ditolak sebelum PAD.
- Varian **`yunet-max-side-square-context-1.2-clip-v1`**: pusat bbox,
  sisi persegi `max(width,height)*1.2`, floor kiri/atas, ceil kanan/bawah,
  clipping dengan batas frame, slice eksklusif kanan/bawah. Tidak shift
  ROI, padding, mirror atau warp landmark. Di tepi, clipping dapat membuat
  ROI rectangular. Adapter me-resize ROI, bukan seluruh frame, ke 128×128.
- Varian detector/crop ini **belum terbukti setara upstream**. OMZ example
  persegi 1.2 bukan jaminan kesetaraan dengan YuNet atau crop original 1.1/1.05.
- Adapter `mn3_offline.py` 9F dipakai **tanpa perubahan**: checksum SHA-384
  dan SHA-256, ONNX bytes verified, OpenCV DNN CPU, cubic resize, RGB,
  byte-scale mean/std sekali, tanpa /255/softmax kedua. Output `[real,spoof]`.
- Model SHA-256:
  `c4c99af04603b62d7e44f6f4daeb33e0daeccc696008c0b1d62f6f5cebbb3262`.
  Preprocessing **`mn3-original-onnx-rgb-cubic-128-v1`**.
  Sumber, lisensi dan ketidakkonsistenan notices tetap merujuk
  [laporan 9F](face-verification-stage9f.md) dan `reference/mn3/`.
  [API YuNet resmi](https://docs.opencv.org/4.13.0/df/d20/classcv_1_1FaceDetectorYN.html)
  mendokumentasikan bbox dan buffer overload yang dipakai.

Response memuat provenance model/detector/crop/preprocessing/runtime,
request ID, slot, waktu proses, durasi dan checksum **bytes capture**.
Node mengecek checksum tersebut terhadap file yang benar-benar dikirim,
serta binding request/slot dan kontrak probabilitas/provenance. Frontend
mengikat hasil pada actor, slot, objek foto/generasi, metadata dan request.
Retake/delete/edit metadata/cancel/logout/account change/unmount menolak
hasil terlambat. Pergantian bahasa tidak menghapus foto/hasil/catatan.

## Layanan dan recovery

PAD Python terpisah memakai `.cache/face-anti-spoofing-cpu`, port default
8766, bind **127.0.0.1 saja**, internal key minimal 32 karakter. Tidak CORS,
request logging atau file upload ke disk. Startup menolak aset hilang/rusak.
Setiap inference child memuat YuNet dan MN3; tidak memuat model SFace.
Spawn/deadline/terminate helper dari server identitas dipakai ulang tanpa
menjalankan server tersebut atau mengubah environment-nya.

Batas: 4 MiB, sisi 128–4096, ≤8MP, satu PNG/JPEG tanpa animasi. Node:
12 percobaan/10 menit/actor, satu request/actor, maksimal dua actor aktif,
absolute multipart deadline 15 detik, internal response ≤4096 byte,
fetch deadline 15 detik, frontend 20 detik. Python: satu inference aktif,
empat koneksi, request socket timeout 10 detik; child deadline 12 detik
termasuk startup, terminasi saat timeout/disconnect. Pixel/crop/detection/
tensor dibersihkan dan proses direap. Ini bukan jaminan penghapusan forensik
salinan native/immutable bytes. Tidak menyimpan embedding; PAD tidak
menghasilkan embedding identitas.

Jika gagal, foto tetap dapat dipakai untuk mencoba lagi dengan **request
eksperimen baru**. Tidak ada mutation database/Storage atau receipt bisnis.
Tidak ada skor palsu/model acak sebagai fallback.

## Catatan dan CSV PAD

Panel PAD punya catatan terpisah, hanya di memori, tambah lewat Catat hasil.
Satu request tidak dapat dicatat dua kali walau baris dihapus. Hasil lama
tidak bisa dicatat setelah foto/metadata diganti. Baris memuat request/slot,
waktu, participant/capture session, actual presentation, source media ID,
status/reason aman, probabilitas asli tanpa pembulatan, image checksum,
provenance dan durasi. Gagal: probabilitas kosong, provenance kosong jika
model belum tersedia/terverifikasi. Tidak menambahkan tanggal/sesi asal
selfie berdasarkan dugaan. Kode sesi di sini adalah sesi kamera.

CSV `face-pad-notes.csv` hanya atas klik user; escaping quote/newline dan
formula injection memakai helper existing. Object URL export dilepas.
Tidak mengubah CSV SFace, tidak localStorage/DB/Storage. Refresh/keluar/
logout/ganti akun menghapus catatan; ekspor dahulu. Tidak ada foto pribadi
user pada repo atau bukti browser.

## Bukti pengujian aktual

- **Python: 11 PASS**, 0 SKIP/FAIL: center/edge exact crop, invalid bbox,
  detector scale asli, zero/multi-face sebelum adapter, original patch,
  cleanup, missing model, exception aman, image rusak/dimensi, loopback,
  child timeout/cancel dan reap. Pixel/model untuk unit test adalah mock.
- **HTTP Node → Python asli: PASS** memakai provider/profile sintetis dan
  middleware autentikasi aplikasi aktual. YuNet + pretrained ONNX MN3 CPU
  benar-benar berjalan pada fixture NASA existing `same-person-a.jpg`
  (NASA s97-00690; atribusi/checksum di
  `services/face-experiment/tests/fixtures/manifest.json`). Memeriksa default
  off, unauthenticated/invalid/inactive/password, original-byte checksum,
  request/slot, probability contract, no SFace fields, file/parser limits,
  actor concurrency, rate limit, internal auth, service mati dan reply usang.
- **Hook/CSV frontend: PASS** dengan mock transport/hook lifecycle:
  consent, full blob, double-click, result/error tanpa skor, metadata/photo/
  cancel/account/logout rejection, locale retention, kode media wajib,
  CSV presisi/formula escaping, EN/ID key parity.
- **Chrome nyata: PASS** pada 1440/390/360px × EN/ID, actual app/capture/
  AuthProvider/components, canvas camera dan browser detection sintetis;
  Node/Python PAD nyata. A NASA fixture menghasilkan probabilitas, B blank
  ditolak **YuNet nyata** tanpa probabilitas. Memeriksa consent, satu POST
  (OPTIONS dihitung terpisah), keterpisahan SFace, record, metadata/delete/
  logout, retention locale dan no page overflow. Screenshot serta
  `browser-results.json` berada di `docs/face-verification-stage9g/`.
  Metadata LIVE/SCREEN pada screenshot adalah label fixture UI sintetis,
  **bukan ground truth PAD foto NASA**. Tidak evaluasi akurasi.
- Percobaan Chrome sandbox pertama timeout `Page.enable` sebelum halaman.
  Eksekusi lokal approved berhasil. Assertion awal menghitung CORS OPTIONS
  sebagai POST; test dikoreksi menghitung method POST, tanpa mengubah app.
- Backend/frontend TypeScript, strict UTF-8 serta diff check diperiksa
  terarah. Hasil final direkam di `validation-results.json`.
- Belum membuktikan GoTrue/Storage asli, PAD foto pengguna, foto layar,
  APCER/BPCER/ACER, keamanan login, injection/virtual camera atau request
  tampering. Browser fixture bukan bukti authorization backend live.

## Menjalankan lokal pada Windows

Gunakan terminal backend milik Anda; **Anda sendiri** menghentikan backend
port 5000 dengan Ctrl+C. Biarkan frontend 3000 dan SFace Python 8765 existing
berjalan. Jalankan blok ini di terminal yang memiliki konfigurasi backend
existing (termasuk `FACE_EXPERIMENT_*` jika Anda masih memakai SFace).
Blok tidak menginstall/download; port 8766 harus kosong. Internal key baru
hanya di environment proses, tidak dicetak/disimpan repo.

```powershell
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath 'D:\Workflow Repository System'
$repoRoot = (Get-Location).Path
$padPythonExe = Join-Path $repoRoot '.cache\face-anti-spoofing-cpu\Scripts\python.exe'
$padServerScript = Join-Path $repoRoot 'services\face-anti-spoofing\pad_server.py'
if (!(Test-Path -LiteralPath $padPythonExe)) { throw 'Environment PAD belum tersedia.' }
foreach ($port in @(5000,8766)) {
  $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$port)
  try { $probe.Start() } catch { throw "Port $port masih dipakai; periksa proses pemiliknya. Tidak ada proses yang dihentikan." }
  finally { $probe.Stop() }
}
$priorPad = @{}
foreach ($name in @('FACE_PAD_ENABLED','FACE_PAD_URL','FACE_PAD_INTERNAL_KEY')) {
  $priorPad[$name] = [Environment]::GetEnvironmentVariable($name,'Process')
}
$randomBytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($randomBytes) } finally { $rng.Dispose() }
$env:FACE_PAD_INTERNAL_KEY = [BitConverter]::ToString($randomBytes).Replace('-','').ToLowerInvariant()
[Array]::Clear($randomBytes,0,$randomBytes.Length)
$env:FACE_PAD_ENABLED = 'true'
$env:FACE_PAD_URL = 'http://127.0.0.1:8766'
$padRunDir = Join-Path $repoRoot ('.cache\face-pad-session\' + [Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $padRunDir -Force | Out-Null
$padProcess = $null
try {
  $padProcess = Start-Process -FilePath $padPythonExe -ArgumentList @('-B',('"'+$padServerScript+'"'),'--port','8766') `
    -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $padRunDir 'stdout.log') -RedirectStandardError (Join-Path $padRunDir 'stderr.log')
  $ready = $false
  for ($i=0; $i -lt 30; $i++) {
    $padProcess.Refresh()
    if ($padProcess.HasExited) { throw 'Python PAD gagal startup; periksa log lokal (tanpa payload/key).' }
    try {
      $health = Invoke-RestMethod -Uri "$env:FACE_PAD_URL/health" -Headers @{Authorization=('Bearer '+$env:FACE_PAD_INTERNAL_KEY)} -TimeoutSec 1
      if ($health.ready -eq $true) { $ready = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 250
  }
  if (!$ready) { throw 'Healthcheck PAD gagal; backend belum dijalankan.' }
  Write-Host "PAD siap. PID milik blok ini: $($padProcess.Id). Ctrl+C backend juga menutup PAD lewat finally."
  Push-Location -LiteralPath (Join-Path $repoRoot 'backend')
  try { npm.cmd run dev; if ($LASTEXITCODE -ne 0) { throw 'Backend gagal startup.' } }
  finally { Pop-Location }
} finally {
  if ($padProcess) { $padProcess.Refresh(); if (!$padProcess.HasExited) { Stop-Process -Id $padProcess.Id } }
  foreach ($name in $priorPad.Keys) { [Environment]::SetEnvironmentVariable($name,$priorPad[$name],'Process') }
}
```

Hentikan dengan Ctrl+C di terminal backend dan biarkan `finally` menutup
**Python yang dibuat blok tersebut**. Jika terminal tertutup sebelum finally,
gunakan PID yang dicetak setelah memastikan ia masih Python PAD milik blok
ini; jangan kill berdasarkan nama `python` atau menghentikan SFace 8765.
Log startup tanpa request/payload tinggal di direktori `.cache` ignored.
Jangan menaruh key pada `.env`, screenshot atau laporan.

## Pilot user: 3 capture langsung + 3 foto layar

1. Login biasa → Settings → Face verification. PAD harus tersedia; SFace
   similarity optional dan terpisah. Isi metadata PAD sebelum memeriksa.
2. P01/S_CAPTURE_01/LIVE, media kosong. Capture satu wajah langsung pada
   Foto A → consent PAD → Periksa → Catat hasil. Ulangi retake dua kali
   (tiga tangkapan berbeda, satu sesi jelas). Jangan memilih berdasarkan skor.
3. Tampilkan foto diri pada HP; kode media M01 untuk foto asal yang sama,
   sesi capture S_CAPTURE_02, SCREEN_PHOTO. Capture Foto B → consent PAD →
   Periksa → Catat; retake sampai tiga tangkapan. Jangan memasukkan sesi/tanggal
   asal selfie yang tidak diketahui. Jika menggunakannya, simpan keterangan
   asal sebagai catatan terpisah tanpa mengubah label capture.
4. Ekspor CSV PAD enam baris. Jika gagal, catat ERROR, jangan mengganti dengan
   0/LIVE. Catatan foto A/B lama hilang dari panel saat retake; baris yang sudah
   dicatat tetap di memori sampai refresh/logout/keluar halaman.
5. Laporkan coverage dan probabilitas deskriptif, tanpa threshold baru/keputusan
   login. Enam capture ini pilot pengembangan, bukan evaluasi keamanan.
   Pisahkan sesi dan media untuk evaluasi berikutnya; jangan split frame dari
   video/media sama antar development/evaluation. Kedipan/menoleh bukan bukti.

**Pengujian kamera pengguna tahap 9G: BELUM DILAKUKAN.**

## File utama dan test terarah

Python: `pad_inference.py` (decode/YuNet/crop/adapter/provenance),
`pad_server.py` (internal transport/deadline), `tests/test_pad_camera.py`.
Node: `face-pad.routes.ts`, routes index, HTTP test dan fixture.
Frontend: `face-pad.ts` (kontrak/CSV), `use-face-pad.ts` (binding/lifecycle),
`face-pad-panel.tsx`, camera panel wiring, EN/ID, focused runner/test/browser.
File final tambahan tercatat pada `validation-results.json`.

```powershell
Set-Location -LiteralPath 'D:\Workflow Repository System'
& '.\.cache\face-anti-spoofing-cpu\Scripts\python.exe' -B 'services\face-anti-spoofing\tests\test_pad_camera.py'
Set-Location -LiteralPath 'D:\Workflow Repository System\backend'
node -r ts-node/register/transpile-only src/routes/face-pad.test.ts
Set-Location -LiteralPath 'D:\Workflow Repository System\frontend'
node tests/face-pad.cjs
node tests/browser/face-pad-browser.cjs
```

Runner backend auto-discover `.test.ts`; frontend test baru didaftarkan pada
runner eksplisit. Tidak full build/suite, London/MiniFASNet setup atau download.
