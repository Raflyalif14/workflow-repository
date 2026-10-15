# Laporan Ringkas Login Wajah WorkflowHub

**Tanggal: 14 Oktober 2026**  
**Status: fitur lokal selesai dan berhasil digunakan; belum siap dinyatakan aman untuk produksi.**

## 1. Apa yang sudah selesai?

Pendaftaran wajah, login sekali tatap, dan halaman pengaturannya sudah dibuat.
Pengguna telah mengonfirmasi berhasil login, lalu dashboard akun terlihat
terbuka. Pendaftaran cukup sekali per browser. Login berikutnya cukup klik
**Masuk dengan kamera**, tatap lurus, dan diam sebentar.

Fitur ini menggunakan kamera biasa. Teknologinya berbeda dari Apple Face ID,
yang memakai kamera TrueDepth dengan informasi kedalaman dan inframerah.
Keberhasilan aplikasi ini tidak berarti tingkat keamanannya setara dengan
Face ID Apple. [Penjelasan Apple](https://support.apple.com/en-us/102381).

## 2. Model apa yang dipakai?

| Model | Tugas | Penjelasan sederhana |
| --- | --- | --- |
| **YuNet — 2023mar** | Mendeteksi wajah dan titik wajah | Menemukan posisi wajah, mata, dan hidung pada gambar kamera. |
| **SFace — 2021dec** | Mencocokkan identitas | Mengubah ciri wajah menjadi 128 angka, lalu membandingkannya dengan data saat pendaftaran. |
| **MiniFASNetV2 + MiniFASNetV1SE** | Memeriksa tanda wajah asli atau tiruan | Dua model memeriksa gambar untuk membantu menolak foto atau video wajah yang ditampilkan ke kamera. |

YuNet dan SFace menggunakan model dari OpenCV; MiniFASNet berasal dari proyek
Silent-Face-Anti-Spoofing milik Minivision. Fungsi deteksi/pengenalan dijelaskan
di [OpenCV](https://docs.opencv.org/4.13.0/d0/dd4/tutorial_dnn_face.html), dan
fungsi pemeriksaan keaslian di [Minivision](https://github.com/minivision-ai/Silent-Face-Anti-Spoofing).

Model **anti-spoof-mn3** yang dahulu memberi skor spoof tinggi pada wajahmu
tidak dipakai untuk keputusan login sekarang. Pemeriksaan lama berhasil
mengulang masalah tersebut; penyebab khusus kegagalannya pada kamera ini
belum dipastikan. MiniFASNet kemudian diuji dan digunakan pada alur login.

## 3. Bagaimana cara kerjanya?

1. **Saat daftar:** pengguna mengonfirmasi password, lalu mengikuti tiga
   posisi otomatis: lurus → menoleh → lurus. Sistem menyimpan ciri wajah
   dalam bentuk angka yang dienkripsi dan mendaftarkan browser tersebut.
2. **Saat login:** kamera mengambil tiga gambar berurutan secara otomatis
   dari satu tatapan. Pengguna tidak perlu menekan foto tiga kali atau menoleh.
3. **Sebelum masuk:** sistem memastikan satu wajah terlihat, posisinya sesuai,
   cocok dengan pendaftaran, lolos pemeriksaan keaslian, dan berasal dari
   browser terdaftar yang memiliki kunci login. Setelah lolos, Supabase
   menerbitkan sesi akun.

Kedua model MiniFASNet harus lolos pada **semua tiga gambar**. Satu hasil yang
gagal menghentikan login. Skor kecocokan SFace minimal 0,60 adalah batas
keputusan internal, **bukan berarti akurasi 60%**. Skor real/spoof juga bukan
jaminan persentase keaslian atau keamanan.

Pemrosesan wajah berlangsung di server lokal menggunakan Python, OpenCV dan
ONNX Runtime pada CPU. Halaman aplikasi memakai Next.js/React; backend memakai
Node.js/Express. ONNX Runtime adalah mesin menjalankan model, bukan model AI.

## 4. Hasil pengujian yang sudah tercatat

| Percobaan | Hasil |
| --- | --- |
| Wajah langsung | Diterima. |
| Foto wajah di layar HP | Ditolak oleh pemeriksaan keaslian; identitas dan posisi memenuhi syarat. |
| Video wajah di layar HP, pengujian ulang | Ditolak oleh pemeriksaan keaslian; identitas dan posisi memenuhi syarat. |
| Login sekali tatap | Pengguna mengonfirmasi berhasil; dashboard akun teramati terbuka. |
| Pemeriksaan kode dan tes alur | Lolos pada cakupan yang diuji, termasuk pembatalan, permintaan kedaluwarsa, dan pemisahan tes dari login. |

Percobaan kamera tersebut masih terbatas pada pengguna/perangkat ini. Banyak
tes kode memakai data atau kamera simulasi. **Belum ada angka akurasi aplikasi
atau tingkat serangan yang lolos yang dapat dipertanggungjawabkan.**

## 5. Apakah masih perlu dilatih?

**Belum ada alasan dari pengujian saat ini untuk langsung melatih ulang.**
Model memakai bobot yang sudah dilatih pembuatnya (*pretrained*). Kita belum
melatih ulang atau melakukan *fine-tuning*. Pendaftaran wajah hanya membuat
data pembanding pengguna; tidak mengubah model. Login berulang juga tidak
otomatis membuat model ini semakin pintar.

Sebelum dipakai banyak pengguna, urutan pekerjaan berikutnya adalah:

1. **Perluas tes:** beberapa orang, kamera, pencahayaan, jarak dan kacamata;
   uji orang lain pada browser terdaftar, foto cetak, serta foto/video dari
   layar berbeda. Rekam keberhasilan, penolakan yang keliru, dan waktu login.
2. **Evaluasi hasil:** ukur seberapa sering wajah sah ditolak dan orang lain
   atau tiruan diterima. Penyesuaian batas keputusan harus diuji pada data
   terpisah, bukan sekadar diturunkan agar contoh yang gagal lolos.
3. **Jika masih bermasalah:** tentukan apakah perlu memperbaiki pengambilan
   gambar, mengganti model, atau melatih ulang dengan data yang memadai dan
   berizin. Training bukan langkah wajib untuk setiap pengguna baru.

## 6. Batas penggunaan dan data

- Kamera/foto diproses sementara; alur login tidak menyimpan foto/video mentah.
  Data ciri wajah disimpan terenkripsi di server lokal, dan kunci privat
  browser tetap di browser. Data ciri wajah tetap merupakan data biometrik.
- Berganti browser/perangkat atau menghapus data situs memerlukan pendaftaran
  ulang. Password tetap tersedia sebagai cara masuk cadangan.
- Mode sekarang sengaja hanya aktif di lingkungan lokal/development. Untuk
  produksi masih perlu audit keamanan, pengelolaan data/kunci, uji banyak
  pengguna, dan verifikasi deployment. Paket standalone Windows sebelumnya
  juga masih memiliki peringatan penyalinan file yang belum dibereskan.

**Keputusan saat ini:** pekerjaan fitur lokal selesai. Pekerjaan untuk
keandalan dan keamanan penggunaan luas masih terbuka, dimulai dari pengujian
lebih luas, bukan pendaftaran berulang atau training otomatis.

Catatan proyek: [hasil login sekali tatap](face-single-glance-login-2026-10-14.md)
dan [perapian pengaturan](face-settings-ux-2026-10-14.md). Laporan ini merangkum
kode dan bukti pengujian yang diperiksa; tidak menambahkan klaim tes kamera baru.
