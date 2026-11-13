# Pengingat H-1 deadline

Backend memeriksa deadline setiap satu menit selama server berjalan. H-1 berarti satu tanggal kalender sebelum deadline menurut **Asia/Jakarta**, termasuk akhir pekan. Jika backend mati sepanjang hari H-1, pengingat tidak dikirim terlambat pada hari deadline.

- Penerima adalah PIC SA aktif pada milestone, atau PIC project bila PIC milestone kosong.
- Hanya project berstatus ACTIVE, tidak postponed, dan milestone pada fase aktif yang diperiksa.
- Output terpilih/wajib memakai jadwal masing-masing. Output yang sudah approved atau sedang in review tidak diingatkan. Milestone tanpa output terpilih memakai deadline milestone.
- Pesan mengikuti bahasa akun penerima dan menyediakan link ke milestone project.
- In-app dan Telegram mengikuti pengaturan notifikasi pengguna. Telegram harus sudah terhubung dan diaktifkan. Email dikirim ke email akun melalui SMTP yang dikonfigurasi di backend. SMTP Mailtrap tetap masuk ke sandbox Mailtrap.

Satu kombinasi tugas, PIC, dan tanggal deadline hanya membuat satu pengingat. Pengulangan proses dan restart server memakai catatan yang sama. Pergantian PIC atau perubahan deadline dapat menghasilkan pengingat baru untuk penerima/tanggal yang baru. Deadline yang diubah kembali ke tanggal sebelumnya tidak membuat ulang pengingat yang sudah pernah dicatat.

## Pemasangan

Jalankan `backend/supabase/phase45-deadline-reminders.sql` satu kali setelah Phase 44, sebelum menjalankan backend versi ini. Migrasi menambahkan dua tabel antrean/catatan dan tiga fungsi yang hanya dapat dipakai service role. Data project dan jadwal lama tidak diubah. Backend memulai worker secara otomatis bersama server.

Email diproses maksimal lima pesan bersamaan dengan lease lima menit dan maksimal tiga percobaan. Email yang belum dikirim diperiksa ulang terhadap jadwal/PIC/status terbaru saat diklaim. SMTP yang belum dikonfigurasi meninggalkan email dalam antrean, sementara kanal lainnya tetap diproses. Antrean yang sudah melewati hari H-1 akan dilewati saat pemrosesan email aktif.

Pencatatan unik mencegah notifikasi ganda akibat scheduler. SMTP tidak menyediakan jaminan exactly-once. Jika proses berhenti setelah SMTP menerima pesan tetapi sebelum status tersimpan, retry dapat mengirim ulang email. Message-ID tetap digunakan untuk percobaan pesan yang sama. Status SENT berarti SMTP menerima email, bukan bukti email sudah masuk inbox penerima.

## Pemeriksaan

```powershell
node backend/tests/run-ci.cjs deadline-reminder
python backend/tests/postgres/run_deadline_reminders.py
npm.cmd run build --prefix backend
```

Tes PostgreSQL memakai database lokal terisolasi dan identitas buatan. Tes ini tidak mengirim Telegram atau email sungguhan. Periksa penerimaan pesan nyata melalui akun dan layanan SMTP tujuan setelah pemasangan.
