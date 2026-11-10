# Meeting project dan kalender pekerjaan

## Perilaku

- Sales pemilik project mengajukan meeting dari bagian **Meeting project**. Isian: judul, waktu mulai/selesai, lokasi atau link, dan agenda.
- Project harus memiliki PIC SA aktif dan berstatus DRAFT, ACTIVE, atau WAITING_RESULT; project yang ditunda/ditutup tidak menerima pengajuan baru. Waktu mulai meeting harus di masa depan. Waktu selesai opsional; bila diisi, harus setelah waktu mulai.
- Pengajuan berstatus PENDING. Head SA menyetujui atau menolak lewat project, panel Persetujuan meeting pada Approvals, atau kalender. Penolakan wajib memakai alasan. Admin dapat membaca tetapi tidak memberi keputusan.
- Hanya meeting APPROVED masuk kalender. SA hanya membaca meeting yang disetujui pada project tempat ia menjadi PIC saat ini. Peserta SA selalu mengikuti PIC project, termasuk setelah reassignment; peserta tidak ditentukan dari input browser.
- Sales pemilik project dan Head SA dapat membatalkan pengajuan pending atau meeting approved yang belum dimulai. Riwayat ditahan. Meeting approved yang belum mulai dapat diajukan reschedule oleh Sales pemilik project, kemudian ditinjau Head SA.
- Kalender bulanan menampilkan meeting yang disetujui serta tanggal mulai/deadline milestone yang belum selesai pada project ACTIVE dan fase aktif. Jadwal output dokumen individual digunakan ketika tersedia; milestone induknya tidak digandakan.
- SA melihat project dan milestone miliknya; Head SA melihat pekerjaan tim SA; Sales melihat project sendiri dan milestone Sales; Admin melihat lingkup keseluruhan. Filter jenis jadwal, agenda per hari, navigasi bulan, tanggal hari ini, serta tautan langsung ke project tersedia.
- Tanggal dan jam meeting disimpan sebagai timestamptz. Input/display memakai zona waktu browser yang ditampilkan pada halaman. Tanggal milestone tidak digeser ke zona waktu lain.
- Query kalender dipisah per pengguna, sesi, role, dan rentang tanggal; kembali ke halaman atau fokus browser memuat ulang data. Bukan notifikasi push lintas browser. Tidak ada email atau pesan eksternal otomatis pada fitur ini.

## Penyimpanan dan integritas

Migration tambahan: `backend/supabase/phase37-project-meetings.sql`.
Tabel `project_meetings` dan receipt `project_meeting_requests`, dengan RLS dan tanpa akses langsung bagi anon/authenticated. Service role membaca tabel; penulisan melalui RPC saja.

RPC mengunci project, memeriksa pemilik Sales/Head SA/PIC dan kondisi terkini, memakai revision saat review, menyimpan audit, dan memberikan receipt berdasarkan request UUID serta payload. Retry pengajuan atau keputusan yang sama tidak menggandakan data. Keputusan terhadap revision lama ditolak. Meeting dan receipt mengikuti penghapusan project lewat cascade.

## Validasi

- Tes backend service: scope antar-Sales/SA, Head review, hanya meeting approved, fase/role/milestone selesai, jadwal output, validasi waktu, serta actor/PIC tidak dipercayakan ke browser.
- Dry-run PostgreSQL dengan proyek sintetis dan ROLLBACK: CREATE, receipt retry, larangan Sales approve sendiri, alasan penolakan, Head approval, revision stale, konflik payload retry, pembatalan, PIC wajib, audit, permission RPC, dan cascade project. Data uji tidak disimpan.
- Tes helper frontend: kalender Senin–Minggu, leap day, timestamp lokal, tanggal milestone, dan batas meeting lintas tengah malam.
- Browser fixture terisolasi: Sales mengajukan meeting, Head SA menyetujui, event muncul di kalender/agenda, scope SA, bahasa EN/ID, desktop 1440px dan HP 390px, tanpa horizontal overflow atau error runtime. Seluruh API browser test memakai data sintetis; tidak menulis ke Supabase.
- Screenshot diperiksa pada `.cache/project-meeting-ui/`.
- Pemeriksaan frontend: typecheck dan lint lulus; 83 dari 84 file tes lulus di sandbox. Satu tes HTTP lokal (`auth-upload-http`) yang diblokir izin loopback lulus saat diulang dengan izin yang sesuai, sehingga seluruh 84 file tes berhasil diverifikasi. Typecheck backend dan tes service meeting juga lulus.

## Status penerapan

**Migration berhasil diterapkan permanen ke Supabase pada 4 November 2026**, setelah pengguna memberi izin khusus penerapan. Dua tabel, indeks, dan RPC sudah tersedia. Tidak ada data project lama yang dimigrasikan.

Verifikasi live setelah penerapan:

- Uji transaksi `phase37-transaction-test.sql` berhasil pada schema yang sudah aktif, lalu seluruh fixture di-rollback.
- RLS aktif pada tabel meeting dan receipt. Authenticated tidak dapat membaca tabel atau mengeksekusi RPC langsung. Service role dapat memanggil RPC; INSERT langsung ke tabel meeting tetap tidak diizinkan.
- Pembacaan kalender dan daftar meeting melalui service/API Supabase berhasil untuk Sales, SA, Head SA, dan Admin dengan scope masing-masing. API lokal tanpa login mengembalikan HTTP 401.
- RPC melalui PostgREST dikenali dan menolak UUID project yang tidak ada sebelum penulisan. Tidak ada data yang dibuat oleh pemeriksaan ini.
- Hasil akhir: 0 meeting, 0 receipt, dan 0 project sintetis tersisa. Tidak ada commit/push.

Alur UI sebelumnya diuji dengan fixture API sintetis di browser. Pengajuan meeting nyata oleh Sales dan keputusan Head SA di aplikasi dapat dilakukan setelah refresh, menggunakan data/jadwal yang dipilih pengguna.

## Koreksi tombol pengajuan Sales

Panel meeting sebelumnya memeriksa `project.pic_id`, sementara DTO detail project mengirim PIC melalui `project.pic`. Akibatnya tombol **Request meeting** tersembunyi dan pesan PIC kosong muncul meski PIC tersedia. Panel kini memakai `project.pic.id` sesuai tipe Project; pemeriksaan PIC aktif dan kewenangan di server tetap berlaku.

Tes render EN/ID memastikan Sales pemilik project dengan PIC dapat melihat tombol, sedangkan PIC kosong, pemilik berbeda, project ditunda/ditutup, dan role lain tidak dapat mengajukan. Typecheck, lint terarah, dan tes regresi lulus. Fixture browser meeting disesuaikan agar tidak menyertakan `pic_id` pada DTO detail project.

Browser test setelah koreksi juga lulus: Sales mengajukan, Head SA menyetujui, meeting muncul pada kalender/agenda, dan tampilan SA berjalan pada desktop/HP dengan fixture API terisolasi. Tidak membuat meeting nyata.

## Waktu selesai opsional dan penanda isian wajib

- Judul dan waktu mulai wajib, ditandai `*` dengan petunjuk pada formulir. Waktu selesai, lokasi/link, dan agenda opsional.
- Waktu selesai yang kosong disimpan sebagai NULL, bukan perkiraan durasi. Riwayat, dialog approval dan kalender menampilkan keterangan waktu selesai belum ditentukan.
- Meeting tanpa waktu selesai hanya muncul pada tanggal mulai di zona waktu browser; tidak memenuhi hari-hari setelahnya. Meeting dengan waktu selesai tetap memakai rentang waktu, termasuk lintas tengah malam.
- Migration tambahan `phase38-meeting-optional-end.sql` mempertahankan jadwal meeting lama dan membuat `ends_at` nullable. RPC tetap memeriksa pemilik Sales, PIC aktif, approval Head SA, revision dan receipt retry.
- Validasi: typecheck backend/frontend, lint terarah, tes service meeting, helper kalender, serta browser fixture Sales → Head approval → kalender tanpa waktu selesai lulus. Uji PostgreSQL transaksi mencakup end kosong/null, start wajib, end tidak valid dan approval; seluruh data sintetis dibatalkan.
- Migration phase38 diterapkan pada 4 November 2026. Verifikasi live: `ends_at` nullable, RLS aktif, authenticated tidak dapat memanggil RPC langsung, service role tetap dapat memanggil RPC, dan tidak ada project sintetis phase38 tersisa. Tidak ada commit/push.

## Notifikasi meeting dalam aplikasi

Phase39 diterapkan: trigger database mencatat notifikasi dalam transaksi yang sama dengan perubahan meeting. Kegagalan notifikasi membatalkan perubahan sehingga pengajuan dapat diulang; receipt retry tidak menghasilkan notifikasi ganda. Tidak mengirim email/Telegram.

- Pengajuan baru: seluruh Head SA aktif, sesuai lingkup approval global saat ini.
- Approved/rejected: Sales pemilik dan PIC SA saat keputusan dibuat.
- Cancelled: Sales pemilik, PIC SA saat ini dan Head SA aktif.
- Mengikuti preferensi notifikasi dalam aplikasi dan bahasa akun. Klik menuju bagian Project meetings; penolakan menyertakan alasan.
- Lonceng memakai pembaruan berkala yang sudah tersedia (30 detik). Tidak mengirim ulang riwayat meeting lama.
- Tes transaksi sebelum/sesudah penerapan lulus: penerima pengajuan dan approval, retry pengajuan tanpa duplikasi, notifikasi keputusan/pembatalan dan tautan project. Seluruh fixture dibatalkan; bukan pengiriman meeting nyata.

## Reschedule meeting (phase40)

Sales pemilik project dapat memilih Reschedule pada meeting APPROVED yang belum mulai. Judul, agenda, lokasi, serta waktu otomatis terisi; waktu selesai tetap opsional. Tanggal mulai/selesai harus berubah. Satu pengajuan perubahan dapat pending pada satu meeting.

Jadwal approved tetap digunakan kalender selama perubahan menunggu approval. Head SA meninjau usulan di project, Approvals atau Calendar. Approval menerapkan usulan; penolakan wajib beralasan dan mempertahankan jadwal lama. Pembatalan meeting juga menghapus usulan pending. PIC aktif, kondisi project, hak akses dan revision diperiksa lagi dalam transaksi database. Notifikasi reschedule mengikuti Head SA, Sales dan PIC saat keputusan.

Phase40 sudah diterapkan. Tes database sebelum/sesudah penerapan lulus: jadwal lama tetap selama pending/ditolak, Sales tidak bisa approve, approval mengubah jadwal, dan notifikasi tercatat. Tes service API, typecheck backend/frontend, lint terarah serta browser fixture Sales reschedule dengan isian otomatis → Head approval → kalender lulus. Seluruh data database uji di-rollback. Browser memakai fixture sintetis; tidak membuat meeting nyata. Commit/push tetap oleh pengguna.

## Peringatan jadwal bentrok PIC

Form pengajuan, reschedule, dan dialog approve Head SA memeriksa meeting APPROVED pada semua project dengan PIC SA yang sama. Pemeriksaan server memakai PIC project saat ini, bukan PIC dari browser. Untuk reschedule/approval, meeting sendiri dikecualikan. Rentang waktu memakai interval awal inklusif dan akhir eksklusif, sehingga jam selesai yang sama dengan awal meeting berikutnya tidak bentrok.

Jika salah satu waktu selesai kosong, hanya awal yang sama atau awal yang berada dalam rentang meeting yang diketahui dapat dideteksi. UI selalu menyertakan keterbatasan bila waktu selesai kandidat atau meeting yang diperiksa kosong. Tidak menebak durasi meeting. Hanya jumlah bentrok dikirim; nama project, judul dan agenda Sales lain tidak dibocorkan.

Peringatan tidak memblokir pengajuan/approval dan bukan reservasi jadwal. Pemeriksaan diperbarui ketika waktu berubah (debounce 400 ms), saat fokus, dan setiap 30 detik. Kegagalan pembacaan ditampilkan sebagai gagal periksa dengan tombol retry, bukan hasil bebas bentrok. Tidak ada perubahan schema database.

Validasi: typecheck backend/frontend dan lint terarah lulus; tes interval, waktu kosong, pengecualian meeting sendiri, scope PIC, akses antar-Sales, kegagalan database, serta respons tanpa detail project lulus. Browser fixture menampilkan peringatan bentrok/keterbatasan dan tetap menyelesaikan pengajuan, approval serta reschedule. Query service juga diverifikasi baca saja pada database aplikasi; tidak membuat meeting nyata.

## Hasil meeting / MoM (phase41)

Pada meeting approved, Sales pemilik project, PIC SA saat ini, dan Head SA dapat mencatat atau mengedit MoM. Admin hanya membaca. Tombol tersedia setelah waktu selesai terjadwal berlalu; bila waktu selesai kosong, setelah waktu mulai berlalu. Pengguna wajib memastikan meeting sudah selesai melalui checkbox. Pengajuan reschedule pending harus ditinjau terlebih dahulu.

Isian: catatan wajib, keputusan dan tindak lanjut opsional (masing-masing maksimal 10.000 karakter). Tindak lanjut berupa teks yang dapat memuat PIC dan target tanggal, tidak otomatis membuat task/milestone. MoM tampil di Project meetings bersama nama pengubah dan waktu perubahan. Data disimpan di server sehingga dapat dibaca dari browser lain sesuai akses project.

RPC `save_project_meeting_minutes` memeriksa pengguna aktif/peran/pemilik/PIC, meeting approved, waktu, dan konfirmasi selesai. Revision mencegah edit bersamaan menimpa catatan terbaru. Receipt request mencegah simpan ulang membuat audit ganda. Penyimpanan mencatat aktivitas MEETING_MINUTES_SAVED. Tidak mengubah status approval meeting atau mengirim notifikasi approval ulang.

Phase41 diterapkan. Tes PostgreSQL sebelum/sesudah penerapan lulus: menolak meeting masa depan, catatan kosong, konfirmasi belum selesai dan revisi basi; PIC SA, Sales serta Head SA dapat menyimpan; retry tidak menggandakan audit. Akses RPC langsung authenticated ditolak. Seluruh fixture di-rollback.

Typecheck backend/frontend, lint terarah dan tes service lulus. Browser fixture: PIC SA mengisi tiga bagian, mengonfirmasi selesai, menyimpan, kemudian Head SA membaca hasil yang sama. Pemeriksaan baca database juga memastikan list meeting dan kalender tetap berfungsi. Tidak membuat MoM nyata milik pengguna, tidak commit/push.

## Approval dan History digabung (5 November 2026)

Halaman Approvals sekarang memakai satu daftar workflow untuk meeting, project plan, deadline dan output document. Panel meeting terpisah di halaman ini dihapus. Meeting pending/reschedule pending masuk Needs review; meeting approved/rejected/cancelled masuk History. Filter jenis Meeting, pencarian, status dan pagination memakai daftar yang sama. Jumlah total pending mencakup meeting. Mutasi meeting memuat ulang data overview.

Tombol keputusan meeting memakai dialog meeting yang sudah tersedia, termasuk peringatan bentrok dan reschedule. Tautan detail menuju Project meetings. Kalender tetap memiliki panel approval ringkas sendiri.

Tes backend approval-overview mencakup rejected history, reschedule pending dan cancelled; tes helper paging/filter serta render halaman dengan meeting digabung juga dijalankan. Pemeriksaan baca pada database mengonfirmasi satu meeting rejected tersedia dalam response gabungan Head SA. Tidak mengubah status meeting atau membuat data bisnis.

## Meeting pada dashboard (5 November 2026)

Task List Head SA menampilkan pengajuan meeting dan reschedule pending dari scope approval-nya. Priority Task Sales pemilik dan PIC SA menampilkan meeting approved mendatang yang paling dekat, termasuk semua meeting dengan waktu mulai terdekat yang sama. Prioritas milestone/deadline tetap dihitung sendiri sehingga meeting terdekat tidak tertutup tugas overdue. Meeting approved tidak digandakan ke Task List.

Kartu menampilkan judul, project, label meeting/approval meeting serta tanggal dan jam. Link pengajuan menuju Approvals, link jadwal menuju Project meetings. Daftar tetap dibatasi tinggi dan dapat di-scroll. Kalender masih menggunakan waktu approved selama usulan reschedule pending. Meeting rejected/cancelled, jadwal yang sudah mulai, serta akun yang bukan peserta tidak dimasukkan ke jadwal mendatang. Admin tidak diberi tugas approval meeting.

Server membaca meeting dengan project scope Sales/PIC SA/Head SA; paging 250 dan batch project 200 memakai helper pembacaan yang tersedia. Tidak menulis data bisnis atau mengubah database schema. Penyimpanan/perubahan meeting memuat ulang cache dashboard; dashboard juga memakai refresh berkala 30 detik yang tersedia.

Validasi: typecheck backend/frontend, lint terarah, tes dashboard-meeting-tasks, concurrency, phase-status dan project-values, helper prioritas serta render panel EN/ID lulus. Pemeriksaan baca saja pada database memastikan dashboard ketiga role dapat memuat data. Meeting tersimpan saat pemeriksaan berstatus rejected sehingga tidak ada tugas meeting mendatang/pending yang ditampilkan. Tidak mengklaim pengujian browser dengan meeting nyata.

## Keterangan Recent activity

Label audit meeting dikenali pada dashboard dan riwayat project: pengajuan, approved, rejected, cancelled, reschedule requested/approved/rejected dan MoM saved. Keterangan menyebut judul meeting dan tindakan yang terjadi. Penolakan mengarahkan pengguna membuka project untuk catatan peninjauan; alasan atau waktu historis tidak dibuat-buat jika tidak tercatat pada audit lama.

Kode internal yang tersimpan sebagai keterangan PIC/plan diubah menjadi ringkasan yang dapat dibaca. Catatan bebas pengguna dipertahankan. Filter Meeting mencakup seluruh tindakan meeting dan MoM, dengan filter akses project yang sama. Tidak mengubah data log lama.

## Ekspor MoM PDF (5 November 2026)

Tombol Ekspor MoM PDF tersedia pada hasil meeting yang sudah disimpan, termasuk untuk pengguna yang hanya memiliki akses baca project. Ekspor mengambil meeting terbaru dari server melalui endpoint GET project/meeting yang memeriksa kembali akses. PIC SA hanya membaca meeting approved. Hasil memuat project, judul, waktu mulai/selesai, PIC SA, lokasi/link, catatan, keputusan, tindak lanjut, penulis dan waktu perubahan. Waktu selesai kosong dijelaskan, tidak diperkirakan.

PDF A4 portrait memakai bahasa tampilan dan zona waktu browser yang dicantumkan; teks panjang dapat melanjutkan ke halaman lain, dengan nomor halaman. Font dibundel dan generator di-load ketika tombol dipakai. Nama file dibersihkan. Ekspor tidak menyimpan file di server atau mengirim email. Pergantian akun dan pembatalan komponen membatalkan unduhan; error memiliki petunjuk retry.

Validasi: typecheck backend/frontend, lint terarah, tes PDF EN/ID/teks panjang/waktu kosong/nama file, serta tes permintaan data (403, identitas tidak sesuai, MoM kosong, pergantian akun) lulus. Tes service mencakup akses meeting untuk ekspor. Browser fixture menyimpan MoM lalu menekan ekspor dan memastikan file unduhan diawali signature PDF. PDF sintetis dua halaman dibuat dengan generator yang sama, dirender menggunakan pypdfium2 dan kedua halaman diperiksa visual. Tidak mengunduh MoM nyata pengguna dan tidak commit/push.
