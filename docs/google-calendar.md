# Google Calendar — pemasangan dan penggunaan

Kode integrasi tersedia, tetapi belum terhubung ke Google sampai OAuth dan migrasi di bawah disiapkan. Fitur ini hanya meeting; milestone belum disinkronkan.

## Cara kerja

- Sales, SA, dan Head SA menghubungkan akun Google masing-masing melalui **Settings → Google Calendar**.
- Aplikasi membuat kalender khusus **WorkflowHub**, dengan izin `calendar.app.created`. Kalender pribadi tidak dibaca atau diubah.
- Meeting berstatus APPROVED disalin untuk Sales pemilik project, SA PIC saat ini, dan Head SA yang terhubung. Head SA mengikuti cakupan akses meeting internal yang dapat melihat semua project.
- Pengajuan reschedule belum mengubah jadwal Google. Setelah approved, event yang sama diperbarui. Pembatalan, penghapusan meeting/project, atau perubahan PIC menghapus salinan yang tidak lagi relevan pada sinkronisasi berikutnya.
- Sinkronisasi awal menyertakan meeting approved yang sudah ada, termasuk riwayat. Tidak ada email undangan/attendees atau Google Meet otomatis.
- Meeting tanpa jam selesai memakai slot perkiraan 30 menit berstatus **free**, dengan catatan di event. Data jam selesai di aplikasi tetap kosong.
- Perubahan hanya satu arah. Edit manual di Google tidak mengubah WorkflowHub. Jangan gunakan kalender khusus ini untuk event pribadi.
- Worker memeriksa koneksi setiap 15 detik dan menjadwalkan sinkronisasi akun sekitar satu menit setelah proses sebelumnya selesai. Gangguan dicoba ulang sekitar lima menit kemudian. Server harus aktif; bukan jaminan pembaruan real time.

## 1. Google Cloud

1. Buat/pilih project di Google Cloud Console dan aktifkan **Google Calendar API**.
2. Siapkan **Google Auth Platform / OAuth consent screen**: nama aplikasi, email dukungan, audience, dan test users jika masih Testing.
3. Tambahkan scope `https://www.googleapis.com/auth/calendar.app.created`.
4. Buat OAuth Client tipe **Web application**. Authorized redirect URI lokal harus persis:
   `http://localhost:3000/settings/google-calendar/callback`
5. Simpan Client ID dan Client Secret secara lokal. Jangan commit atau kirim secret di chat.

Untuk hosting, gunakan URL HTTPS aplikasi yang sebenarnya pada redirect URI dan konfigurasi di bawah. Izin/publikasi atau verifikasi Google mengikuti audience dan status aplikasi di Google Cloud. Token aplikasi External yang masih Testing dapat kedaluwarsa setelah tujuh hari; ini bukan durasi sesi WorkflowHub.

## 2. Konfigurasi backend

Tambahkan di `backend/.env`:

```dotenv
GOOGLE_CALENDAR_CLIENT_ID=client-id-dari-google
GOOGLE_CALENDAR_CLIENT_SECRET=client-secret-dari-google
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3000/settings/google-calendar/callback
GOOGLE_CALENDAR_APP_URL=http://localhost:3000
GOOGLE_CALENDAR_TOKEN_KEY=64-karakter-hex-acak
```

Buat key sekali menggunakan PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Simpan hasilnya sebagai TOKEN_KEY. Key mengenkripsi refresh token dan PKCE verifier dengan AES-256-GCM, terikat ke user. Jangan mengganti key selama ada koneksi aktif; sertakan key secara aman dalam prosedur backup. Tidak ada secret yang memakai prefix `NEXT_PUBLIC_`.

## 3. Database dan menjalankan aplikasi

- Pasang `backend/supabase/phase47-google-calendar.sql` **sekali**, setelah Phase 46, ke database aplikasi melalui prosedur migrasi yang disetujui.
- Migrasi menambah tiga tabel dan fungsi server. Browser/anon/authenticated tidak mendapat akses langsung ke token atau fungsi sinkronisasi.
- Restart backend setelah mengubah `.env`. Gunakan frontend pada port yang sesuai redirect URI.
- Buka Settings, hubungkan akun Google, setujui izin, lalu tunggu status sinkronisasi. Jika konfigurasi belum lengkap, UI menampilkan bahwa setup administrator belum selesai.
- Docker Compose meneruskan `.env` backend yang sudah tersedia; pastikan variabel ini diberikan kepada proses backend bila memakai deployment lain.

## Pemeriksaan sebelum dipakai tim

1. Sales/SA/Head SA masing-masing connect memakai akun Google test user.
2. Meeting pending tidak muncul. Approve → muncul satu event pada kalender terkait.
3. Reschedule pending → tanggal lama tetap. Approve reschedule → event yang sama berpindah.
4. Cancel → event hilang; ganti PIC → salinan berpindah ke SA baru yang terhubung.
5. Uji gangguan jaringan/retry agar tidak ada event duplikat.
6. Disconnect menghapus seluruh kalender khusus WorkflowHub lalu menghapus kredensial lokal. Kalender lain tetap. Izin aplikasi Google dapat dicabut manual di pengaturan akun Google.

Jika akses Google sudah dicabut, cleanup remote tidak mungkin; disconnect membuang token lokal dan kalender sisa perlu dihapus manual. Jika pembuatan kalender mengalami timeout sehingga hasilnya tidak pasti, worker tidak mengulang create secara otomatis (mencegah kalender duplikat). Periksa/hapus kalender sisa di Google sebelum disconnect lalu connect ulang. Event yang diedit/dihapus manual di Google tidak otomatis dipulihkan jika payload sumber belum berubah; pemulihan penuh dilakukan dengan disconnect lalu connect ulang.

## Pengujian kode

```powershell
node backend/tests/run-ci.cjs google-calendar
python backend/tests/postgres/run_google_calendar.py
node frontend/tests/browser/google-calendar-browser.cjs
```

Tes unit memakai Google HTTP buatan, tes database memakai PostgreSQL lokal terisolasi, dan tes browser memakai API/akun sintetis. Ketiganya tidak membuktikan OAuth/izin/event pada akun Google asli. Uji akun Google nyata menunggu kredensial dan pemasangan migrasi.

Referensi resmi: [OAuth web server](https://developers.google.com/identity/protocols/oauth2/web-server), [membuat kalender aplikasi](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert), [membuat event](https://developers.google.com/workspace/calendar/api/guides/create-events).
