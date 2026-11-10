# Sesi berdasarkan aktivitas

Mulai 3 November 2026, dashboard memakai batas **30 menit tanpa aktivitas**. Klik/tap, gerakan pointer, ketikan, input formulir, dan scroll mengulang waktu dari aktivitas terakhir. Konstanta berada di `frontend/src/lib/session-activity.ts` (`SESSION_IDLE_MS`).

- Aktivitas dibagikan antar-tab untuk ID sesi login yang sama lewat satu catatan localStorage. Pengecekan aktivitas dibatasi sekali per detik; tidak menulis token pada setiap interaksi.
- Reload tidak memberi waktu baru pada sesi yang sudah lewat batas. Saat tab aktif kembali atau timer berjalan setelah komputer tidur, waktu terakhir diperiksa ulang. Fokus/tab terlihat saja tidak dianggap aktivitas.
- Setelah 30 menit tanpa aktivitas, aplikasi melakukan logout lokal segera, membersihkan cache privat, menuju login, dan mencoba logout server. Timer browser dapat tertunda saat komputer tidur; pemeriksaan dilakukan lagi saat bangun.
- Selama ada aktivitas dalam lima menit terakhir, verifikasi akun dilakukan paling sering sekali per lima menit melalui alur refresh token yang sudah ada. Permintaan gagal sementara tidak langsung mengakhiri sesi pengguna aktif yang sebelumnya terverifikasi. Akun/sesi yang ditolak tetap logout.
- Token tidak diperpanjang hanya dengan mengganti timestamp lokal. Pencabutan sesi, akun nonaktif, penolakan refresh token, dan batas dari penyedia autentikasi tetap berlaku. Ini mekanisme inactivity di aplikasi browser, bukan kebijakan idle timeout server untuk semua klien API.
- Kegiatan browser lama tidak dapat memperpanjang atau menghapus sesi akun yang baru. Listener dan timer dilepas saat logout atau pergantian sesi.

Validasi: tes jam virtual mencakup setiap jenis aktivitas, batas 30 menit, tab lain, reload, background/sleep, tidak menghidupkan sesi kedaluwarsa, isolasi akun, dan pembatasan keep-alive. Tes AuthProvider, refresh sesi, retry profil, typecheck, dan lint terkait lulus. Durasi 30 menit belum diuji dengan menunggu waktu nyata di browser pengguna.
