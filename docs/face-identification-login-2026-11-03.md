# Login kamera tanpa email

Pengguna cukup memilih **Masuk dengan kamera** lalu menatap kamera. Sistem mencari akun berdasarkan wajah pada pendaftaran server yang sudah ada. Browser lain tidak membutuhkan pendaftaran wajah baru, selama mengakses sistem/backend yang sama. Form email/password biasa tetap tersedia sebagai alternatif login.

## Alur dan batas

- Browser membuat challenge bertanda tangan tanpa email atau daftar akun. Server hanya mengembalikan nonce dan metadata challenge, bukan identitas pendaftar.
- Worker memproses tiga frame sekali: deteksi satu wajah, dua classifier PAD, konsistensi identitas antar-frame, dan posisi lurus untuk mode sekali tatap. Mode dengan gerakan tetap memeriksa gerakan.
- Tiga embedding dikembalikan hanya lewat kanal privat worker ke backend. Tidak dikirim ke browser atau disimpan sebagai foto.
- Backend membandingkan setiap frame dengan pendaftaran yang sudah ada sebelum challenge dibuat. Semua frame harus cocok dengan pendaftaran yang sama, menggunakan cosine minimal 0,60. Pendaftaran dengan akun yang sama dikelompokkan.
- Jika beberapa akun melewati ambang, tidak ada akun yang cocok, atau selisih skor terbaik dengan akun kedua kurang dari 0,05, login ditolak. Margin adalah aturan konservatif, bukan hasil pengukuran FAR/FRR pada populasi pengguna.
- Akun nonaktif, kewajiban ganti password, pendaftaran yang dicabut, challenge kadaluarsa/replay, serta kegagalan signature/PAD tetap ditolak sebelum sesi diberikan.
- Batas percobaan IP pada route, batas device, maksimal dua proses inference serentak, dan batas akun yang sudah teridentifikasi tetap berlaku. Karena akun belum diketahui saat wajah tidak cocok, kegagalan tersebut terutama dibatasi per IP/device. Endpoint tidak menyediakan daftar akun publik.
- Pencarian dibatasi maksimal 250 pendaftaran. Melebihi batas menghasilkan busy; perlu rancangan indeks/penyimpanan untuk skala lebih besar. Ini identifikasi 1:N, sehingga pengujian salah cocok antar banyak pengguna tetap diperlukan sebelum klaim keamanan lebih luas.
- Template tetap terenkripsi di server. Pendaftaran lama tetap berlaku; login baru tidak menambah pendaftaran. Fitur tetap mengikuti gate development/feature flag yang ada.

## Verifikasi

- Dua file tes identifikasi backend lulus: pemilihan akun yang benar untuk dua pengguna, seluruh frame, akun ambigu/dekat, wajah asing, PAD gagal, akun nonaktif, pencabutan, replay, serta validasi hash/versi/embedding worker.
- Tes regresi login lama, sekali tatap, login dengan email (kompatibilitas API), pencabutan perangkat, route, dan kebijakan PAD lulus.
- Tujuh tes Python policy/worker lulus, termasuk pemeriksaan kedua classifier pada setiap frame, pose, konsistensi, mode gerakan, dan blank/static fixture yang sudah ada. Tes policy memakai model tiruan untuk kontrol hasil; tidak membuktikan akurasi identifikasi manusia nyata.
- Tes UI login dan i18n, typecheck backend/frontend, lint terkait, dan diff whitespace lulus.
- Pengguna masih perlu mencoba login wajah langsung di Chrome/Edge. Tidak ada template pengguna atau data bisnis yang diubah oleh pengujian. Tidak ada migrasi database atau commit/push.
