# Jadwal per output di server

## Perubahan

- Setiap output menyimpan `start_date`, `duration_working_days`, dan `due_date` di database.
- Form mengirim ID output, bukan menggabungkan jadwal di browser. Pembacaan di browser lain memakai respons API yang sama.
- Backend menghitung deadline memakai kalender hari kerja/libur yang sudah ada.
- Milestone induk mencakup tanggal paling awal sampai deadline paling akhir; durasinya dihitung dari rentang itu.
- Output fase lama tidak masuk form fase aktif. Output asing, tidak dipilih, duplikat, dan campuran jadwal induk/output ditolak.
- RPC menyimpan parent dan output dalam satu transaksi, memakai pemeriksaan pemilik Sales, fase, DRAFT, approval tertunda, concurrency, retry, serta audit yang sudah ada. Kegagalan output membatalkan transaksi keseluruhan.
- Cache jadwal browser tidak lagi menjadi sumber data atau ditulis saat Save.

## Penerapan database

Migration: `backend/supabase/phase36-output-document-timeline.sql`.
Verification: `backend/supabase/phase36-verify.sql`.

Terapkan migration satu kali sebelum menjalankan kode baru terhadap database. Migration menambah tiga kolom dan RPC khusus server, serta mengisi jadwal output lama dari jadwal milestone induk yang telah tersimpan di server. Tidak menghapus output, file, atau status. Script menggunakan transaksi; kegagalan membatalkan perubahan.

Tanggal yang sebelumnya hanya tersimpan di localStorage tidak dapat dipulihkan oleh server. Cache lama tidak dihapus, tetapi tidak otomatis diimpor sebagai data resmi. Jadwal berbeda yang belum pernah tersimpan di server perlu ditinjau dan disimpan kembali melalui form setelah migration.

Perubahan ini menyimpan jadwal output terpisah; tidak memecah status/approval milestone induk menjadi workflow baru. Perubahan deadline proyek ACTIVE tetap mengikuti alur persetujuan deadline yang ada, bukan form timeline awal DRAFT.

## Validasi

- Typecheck backend/frontend dan lint frontend lulus. Semua 80 file tes frontend lulus: 79 pada suite utama, satu tes HTTP lokal lulus saat diulang dengan izin loopback setelah sandbox memblokir koneksi.
- Enam file tes backend terkait lulus: dua output timeline (termasuk API ke RPC), dua project plan, pembacaan output lintas fase, dan business mutation audit.
- Tes helper frontend: dua pembaca independen memperoleh jadwal dan deadline identik dari respons server, isolasi fase, dan fallback data lama.
- Tes backend: dua tanggal berbeda, hari libur, rentang induk, output duplikat/asing, kelengkapan output, dan larangan mencampur jadwal parent/output.
- Pada 2 November 2026, setelah persetujuan pengguna, migration berhasil diterapkan ke Supabase. Dry-run dengan ROLLBACK lulus sebelum penerapan permanen.
- Hasil live: tiga kolom tersedia, RPC tersedia, execute untuk authenticated ditolak dan service_role diizinkan, 30 output tetap ada, 27 memiliki jadwal, tidak ada jadwal tidak valid. Tiga output lain belum memiliki jadwal induk lengkap sehingga tidak diisi secara tebakan.
- API REST Supabase mengembalikan HTTP 200 untuk kolom jadwal baru.
- `backend/supabase/phase36-transaction-test.sql` lulus langsung di Supabase: fixture proyek baru dengan dua output, tanggal/deadline independen, status tidak berubah, retry tanpa duplikasi audit, penolakan pengguna asing, penolakan timestamp lama, serta rollback penuh pada kegagalan output. Seluruh fixture diakhiri ROLLBACK; tidak ada data uji permanen.
- Uji dua browser pengguna secara langsung belum dilakukan. Konsistensi pembacaan dua konsumen sudah diuji dengan respons server yang sama; penyimpanan RPC telah diuji terpisah pada database asli.
