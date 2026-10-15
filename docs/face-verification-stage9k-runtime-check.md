# 9K follow-up — ROI tidak muncul pada tab existing

Tanggal: **13 Oktober 2026**. Branch `feat/face-verification`, HEAD
`58bc3d7`, staging kosong. Tidak mengubah kode aplikasi/test atau laporan
9K lama. Hasil diagnosis disimpan terpisah dari bukti sebelumnya.

## Penyebab yang didukung bukti

**Tab existing belum menampilkan integrasi ROI 9K yang disediakan server
sekarang.** Penjelasan yang didukung adalah render frontend lama yang masih
tertahan pada tab. Mekanisme cache/HMR spesifik belum dibuktikan, sehingga
tidak mengklaim cache disk atau WebSocket tertentu sebagai penyebab pasti.

| Pemeriksaan | Bukti aktual |
| --- | --- |
| Checkout | `feat/face-verification / 58bc3d7`; seluruh perubahan face experiment existing masih ada. |
| Server 3000 | Proses Next milik user terverifikasi sebagai `repo-frontend`, command menunjuk repo ini. Tidak restart/stop. |
| JS yang disediakan server | Chunk `app/settings/face-verification/page.js` memiliki FacePadRoi/data-pad-roi. Bundle localhost dan 127.0.0.1 identik. |
| Tab pengguna existing | Panel PAD, hasil SUCCESS dan geometri ada; **jumlah elemen data-pad-roi = 0**. Judul ROI dan pesan unavailable juga tidak ada. |
| Catatan pada tab | **7 baris**. Tidak refresh, export, edit metadata, delete, atau menekan Periksa PAD pada tab tersebut. |
| Client baru terisolasi | Komponen ROI tampil pada halaman aplikasi aktual dengan fixture sintetis dan bundle server saat ini. |

Tab diperiksa lewat browser existing **read-only DOM**. Hanya presence/count
elemen yang diambil: tidak screenshot foto pengguna, membaca src/blob/pixel,
mengambil session/token, membuka kamera atau mengirim foto tambahan.

## Mengapa bukan kegagalan crop/checksum yang dibuktikan

`face-pad-panel.tsx` menempatkan FacePadRoi langsung setelah FacePadGeometry
pada hasil yang lolos `attemptFor(slot)`. Hasil/geometri tampil pada tab,
sehingga blok hasil itu memang dirender. Komponen FacePadRoi **selalu**
menghasilkan figure beserta judul, termasuk ketika status unavailable.

Validasi SUCCESS/diagnostik/binding/dimensi/checksum terjadi di dalam helper
dan effect hook. Bila validasi atau decode gagal pada implementasi 9K,
gambar tidak muncul tetapi figure/judul/pesan unavailable tetap ada. Gate
tersebut tidak dapat menjelaskan hilangnya **seluruh** bagian ROI pada
tab yang diamati. Tidak melonggarkan validasi untuk memunculkan gambar,
tidak mengubah generic fallback tanpa bukti preview sedang gagal.

Potongan wajah di panel kamera tetap preview capture lama (BlazeFace),
bukan ROI PAD. Integrasi ROI current memang terpisah pada hasil PAD.

## Reproduksi terarah dengan fixture

Memakai harness Chrome 9K existing dalam salinan scoped ignored
`.cache/roi-client-check/run.cjs`; output ke folder evidence baru pada cache.
Hanya satu locale/viewport untuk pemeriksaan client baru, tanpa mengulang
matriks/suite/model. Laporan dan screenshot 9K awal tidak ditimpa.

- Chrome **155.0.8059.40**, profil baru terisolasi, actual app/AuthProvider/
  capture/PAD panel. Auth/detector/response PAD fixture; kamera berupa
  canvas stream pola sintetis, bukan kamera fisik/foto pengguna.
- Frame **640×480**, crop server fixture **120,58 →534,472**, ROI **414×414**,
  tanpa clipping. Bbox fixture sintetis dipilih konsisten dengan crop;
  tidak menyimpulkan bbox/pixel pengguna dari angka diagnostiknya.
- Current frontend menampilkan judul dan gambar ROI. Checksum dihitung
  dari blob full capture fixture; guard tetap berjalan.
- Semua pixel ROI browser dibandingkan dengan rectangle PNG full frame
  browser tersebut: selisih maksimum **0**, tidak mirror, native 414×414.
  Ini bukti crop PNG sintetis, bukan kesetaraan tensor model Python.
- Desktop 1440px, ID: gambar dibatasi kartu, nativeWidth 414,
  renderedWidth 327; scrollWidth = clientWidth, tidak overflow.
- Satu POST inspect **diintercept fixture**, tidak dikirim ke backend/PAD
  live. Unknown API dan exception browser **0**; profil task dibersihkan.

PASS ini membuktikan current bundle bisa menampilkan ROI dengan geometri
yang dilaporkan. **Belum membuktikan tab pribadi setelah reload**, karena
catatan/foto sementara harus dipertahankan sampai user mengekspor dahulu.
Tidak ada inferensi atau kesimpulan penyebab spoof tinggi dari pemeriksaan.

Bukti aman: [runtime-check-results.json](face-verification-stage9k-runtime-check-results.json).
Artefak pola sintetis tambahan hanya pada `.cache/roi-client-check/evidence`.

## Perbaikan minimal dan langkah user

Tidak ada perubahan kode yang diperlukan berdasarkan bukti ini. Server
frontend dan layanan existing dapat tetap berjalan; tidak perlu restart
backend/Python atau mengulangi setup/model.

1. Pada tab existing, **Ekspor CSV PAD** untuk menyimpan tujuh catatan
   terlebih dahulu. Ekspor catatan SFace juga jika ada yang ingin disimpan.
   Pertahankan CSV pilot lama; jangan menimpanya tanpa sengaja.
2. Setelah ekspor selesai, lakukan **Ctrl+Shift+R** pada halaman untuk
   memuat frontend current. Foto/hasil/catatan hanya di memori, sehingga
   akan hilang saat reload; CSV tidak dapat mengembalikan frame asli.
3. Ambil capture baru seperti biasa, isi metadata, consent dan Periksa PAD.
   Pada hasil valid, bagian **Preview daerah gambar PAD** berada setelah
   **Geometri frame**, bukan pada Potongan wajah kamera.
4. Jika judul tampil dengan unavailable setelah reload, itu menjadi kasus
   kegagalan preview yang berbeda. Penyebab spesifik harus diperiksa dari
   tahap validasi/decode tersebut; jangan menghapus checksum/binding gate
   atau mengubah model untuk membuat gambar muncul.

Tidak meminta pemeriksaan DevTools berulang. Tidak melakukan reload pada
tab pengguna, karena status ekspor belum diketahui. Tidak mengklaim halaman
pengguna sudah pulih. **Spoof tinggi belum diketahui penyebabnya**.

## Validasi dan retensi

176 file existing dirty/untracked disnapshot sebelum diagnosis. Seluruh
file itu, termasuk kode 9K serta laporan/model/test sebelumnya, dipertahankan
identik. Dua CSV pengguna tetap identik. Hanya dua dokumen follow-up baru.
Strict UTF-8 dan whitespace diperiksa pada dua file baru, git diff check
PASS; staging tetap kosong. Tidak tsc/full suite ulang karena kode tidak
berubah. Fixture Chrome terarah baru dilakukan karena keluhan tab aktual.

Tidak operasi Git tulis, perubahan pipeline/PAD/SFace/crop/probabilitas/
threshold/auth/database, penghentian proses atau foto pengguna ke Git.
