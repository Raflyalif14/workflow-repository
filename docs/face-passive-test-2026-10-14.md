# Audit: uji sekali tatap sebelum mengganti login

Status lanjutan: pengujian ulang video dan penerapan login lokal sekali tatap
telah selesai; pengguna mengonfirmasi berhasil masuk. Bukti terbaru dan batas
validasinya ada di [catatan login sekali tatap](face-single-glance-login-2026-10-14.md).
Isi berikut mencatat tahap evaluasi sebelum penerapan tersebut.

Pengguna memilih "Sekali tatap, uji perlindungan foto/video dulu" setelah
login gerakan otomatis berhasil. Tujuan UX: satu pemindaian tanpa hitungan
atau instruksi menoleh. Tiga frame pendek dikumpulkan di belakang layar.

## Rancangan yang diuji

- Halaman authenticated khusus, memakai template dan kunci browser terdaftar.
  Tidak mendaftarkan ulang wajah, menulis template, atau menerbitkan sesi.
- Challenge sekali pakai berdomain `passive-test`, terkait akun, perangkat,
  origin, versi credential, kondisi yang dinyatakan pengguna dan urutan frame.
  Challenge tes tidak dapat dikirim ke endpoint login/enrollment atau sebaliknya.
- Kamera dimulai hanya setelah tombol uji. Setelah waktu siap singkat, ambil
  tiga frame baru berjarak minimal 350 ms dari satu pose. Tab tersembunyi,
  logout, perubahan akun, expiry, kamera berhenti dan cancel menghentikan tes.
  Foto hanya diproses sementara lewat alur lokal existing, tidak disimpan.
- Model dan batas PAD/pencocokan tetap. Setiap frame harus lolos dua MiniFAS,
  cosine SFace >= .60 terhadap template dan frame pertama, satu wajah dan
  posisi lurus. Syarat gerakan acak hanya dilewati untuk evaluasi ini.
- Sampel berlabel oleh pengguna: live, foto layar, video layar. Satu contoh
  masing-masing hanyalah pemeriksaan awal; bukan pengukuran FAR/APCER/BPCER.
  Penolakan karena wajah salah/tidak terlihat bukan bukti PAD menolak replay.
- Login existing tetap memakai gerakan. Tidak ada promosi otomatis dari hasil
  tes, tidak ada pelonggaran ambang atau pemilihan frame dengan skor tertinggi.

## Implementasi dan verifikasi

- Halaman `/settings/face-verification/passive` sudah dibuat, ditautkan dari
  pengaturan wajah, dan terlihat di browser dengan pengguna terautentikasi.
  Label, petunjuk dan hasil tersedia dalam EN/ID. Kamera tidak dimulai oleh
  agen; pengguna diminta melakukan tiga kondisi fisik tersebut.
- Endpoint `/api/face-login/passive-test/start` dan `/finish` memerlukan auth,
  akun aktif, origin benar, perangkat milik akun tersebut dan signature.
  Mode evaluasi menggunakan versi `webcam-passive-evaluation-v1`; hasil hanya
  memuat skor, checks dan metadata. Tidak ada embedding/token/session output.
- Pemindaian menunggu satu detik lalu mengambil tiga frame video baru berjarak
  minimum 350 ms. Kamera macet dihentikan pada batas delapan detik; keseluruhan
  operasi dibatasi 40 detik. Tidak ada countdown tiga posisi atau best-frame.
- Setiap percobaan yang berhasil diproses ditambahkan ke hasil sementara.
  Foto/video yang pernah diterima tetap memberi peringatan walau tes berikutnya
  ditolak. Penolakan karena posisi/identitas diberi label belum konklusif.
- Backend service + HTTP regression: PASS. Cakupan tambahan: pemilik akun,
  pemisahan challenge tes/login/enroll, replay, auth wajib, tidak menerbitkan
  sesi atau menulis credential selama tes. Provider/inference utama di-mock.
- Parser keputusan: PASS untuk semua enam keluaran PAD, batas match/pose,
  checksum/versi, angka invalid dan pembuangan field credential yang tak diizinkan.
- Python: lima tes PASS, termasuk mode lurus hanya boleh dievaluasi sementara
  jalur login tetap menolak tanpa gerakan. Dua tes memakai model asli pada
  gambar kosong/statis; jalur positive sintetis memakai mock.
- Runner Node → Python asli: PASS untuk dua mode pada tiga PNG kosong sintetis,
  keduanya mengembalikan `FACE_NONE`. Tidak menggunakan foto pengguna.
- Frontend burst + UI dan regresi login gerakan: PASS. Video/frame/clock/API
  di-mock; mencakup frame baru, jeda, timeout, tab hidden, abort, permintaan
  terlambat setelah logout, riwayat hasil dan peringatan serangan diterima.
- Frontend/backend typecheck: PASS. Build terpisah mengompilasi 23 halaman
  dengan exit 0. Warning Windows EPERM saat menyalin symlink node_modules ke
  bundel standalone masih ada pada salinan build; paket deploy belum diuji.
- `git diff --check` dan whitespace file baru terkait: PASS.

## Lingkungan berjalan

Layanan pilot milik sesi dihentikan secara terverifikasi ketika memuat route
baru. Restart pilot menemukan backend dev repository lain yang sudah aktif
pada port 5000. Backend existing tersebut sudah memuat route baru; capabilities
aktif dan request tes tanpa auth mengembalikan 401. Proses existing itu tidak
dihentikan. Tes sekali tatap memakai subprocess model lokal langsung dan tidak
memerlukan service PAD/SFace lama pada port 8765/8766. Frontend tetap berjalan.

## Hasil kamera manusia

Pada pembacaan awal browser, satu wajah langsung diterima dan dua foto layar
ditolak oleh PAD dengan identity/position memenuhi syarat. Dua pengambilan foto
lain belum konklusif karena identity/position. Pada screenshot yang kemudian
dikirim pengguna, tercantum satu wajah langsung diterima, satu foto HP ditolak
oleh PAD dengan match/pose lolos, dan satu video HP belum konklusif karena
match atau pose. Screenshot juga memuat error posisi untuk percobaan terakhir;
pesan ini bukan status keseluruhan tes. Label kondisi berasal dari pilihan
pengguna. Tidak ada kesimpulan ketahanan video atau aktivasi login sekali tatap.

## Perbaikan penjelasan hasil

Pengguna mengira "Ditolak oleh tes ini" untuk foto HP berarti aplikasi gagal.
Label UI diperjelas: wajah langsung diterima dan foto/video ditolak oleh PAD
ditandai "Sesuai harapan". Penolakan karena match/pose diberi judul "Belum
konklusif", sedangkan serangan diterima tetap menjadi peringatan kegagalan
perlindungan. Error pengambilan diberi konteks percobaan terakhir serta petunjuk
untuk wajah pada layar HP. Semua perubahan pada tampilan; kebijakan pemeriksaan
dan ambang model tidak diubah.

Tes alur frontend dan klasifikasi hasil diperiksa: PASS (wajah langsung
diterima/ditolak, foto/video ditolak, replay diterima, serta match/pose belum
konklusif). Whitespace juga PASS. Verifikasi tampilan ulang melalui browser
terhambat koneksi kontrol tab yang tidak terpasang; penjelasan hasil pengguna
didasarkan pada screenshot yang dilampirkan, bukan pembacaan detail video baru.
