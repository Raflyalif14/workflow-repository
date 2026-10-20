# Audit pembatas percobaan login wajah

Permintaan: login berhasil mereset hitungan; jeda berlaku setelah kegagalan.

Temuan: layanan menghitung setiap start (termasuk login berhasil dan batal),
sedangkan pembatas HTTP menghitung start, finish, status, dan pengaturan.
Pengujian login yang berhasil berulang tetap bisa terkena jeda.

Perubahan yang dituju: hitung kegagalan pemeriksaan wajah pada challenge
login dengan bukti browser valid; lima kegagalan memicu jeda sepuluh menit.
Login yang selesai menerbitkan sesi mereset hitungan. Pembatas HTTP menghitung
respons gagal dan direset setelah login berhasil. Enrollment dan tes terpisah
tetap memiliki batas sendiri. Error layanan dan pembatalan bukan kegagalan wajah.

Hasil: kegagalan wajah dengan bukti browser valid dihitung sampai lima, lalu
jeda sepuluh menit dari kegagalan terakhir. Start/batal tidak menambah hitungan.
Login berhasil mereset hitungan browser dan kegagalan HTTP dari IP tersebut.
Pembatas lonjakan 120 permintaan/menit tetap berlaku terpisah; respons HTTP
gagal dibatasi 20/10 menit. Tes terpisah dan enrollment tidak mereset kegagalan login.

Verifikasi 15 Oktober 2026:
- Backend TypeScript: PASS.
- Regresi autentikasi enrollment/gerakan: PASS.
- Regresi sekali tatap: PASS, delapan login berhasil berulang, empat gagal lalu
  berhasil mereset, lima gagal memblokir, perangkat lain tetap berfungsi,
  jeda habis dengan clock sintetis, error model/proof invalid tidak menambah
  kegagalan wajah. Pemeriksaan tanda tangan dan parser asli, provider/model mock.
- HTTP lokal: PASS, 25 respons login berhasil tidak diblokir, dua rangkaian
  15 kegagalan dipisahkan keberhasilan masing-masing tidak terakumulasi,
  20 kegagalan tanpa keberhasilan tetap diblokir. Layanan wajah mock.
- Tes HTTP perlu izin koneksi lokal karena sandbox menolak socket loopback;
  pengulangan dengan akses yang disetujui berhasil.
- Tidak menjalankan pengambilan wajah manusia baru untuk perubahan ini.
