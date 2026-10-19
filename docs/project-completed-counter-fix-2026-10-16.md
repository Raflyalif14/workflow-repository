# Koreksi hitungan pekerjaan proyek selesai

## Temuan

Kartu Completed pada daftar proyek hanya menghitung status `COMPLETED`. Proyek berstatus `WON` sudah ditampilkan sebagai Delivery complete dengan progres 100%, tetapi belum masuk kartu tersebut. Filter Completed juga hanya meminta status persis `COMPLETED`.

Backend dan dashboard sudah mengelompokkan `COMPLETED`, `WAITING_RESULT`, `WON`, dan `LOST` sebagai pekerjaan yang selesai. Gunakan pengelompokan yang sama pada kartu dan filter daftar. Status hasil bisnis, otorisasi, database, serta angka progres tidak diubah. Ringkasan tetap menghitung isi halaman aktif sesuai labelnya.

## Perbaikan

Kartu dan tab memakai kelompok status yang sama: `COMPLETED`, `WAITING_RESULT`, `WON`, dan `LOST`. Labelnya diperjelas menjadi Delivery complete / Pelaksanaan selesai agar tidak tertukar dengan hasil tender menang atau kalah.

Filter baru `status_group=DELIVERY_COMPLETED` diterapkan server sebelum pagination dan penghitungan total. Filter lama `status=COMPLETED` tetap berarti status persis tersebut. Pengelompokan ini bukan status database baru dan tidak memerlukan migrasi.

## Hasil

- Kasus satu ACTIVE + satu WON menghasilkan ringkasan `[2, 1, 0, 1]`; setelah filter pekerjaan selesai menjadi `[1, 0, 0, 1]`. Badge Won tetap tampil.
- Frontend `npm.cmd run check`: **67/67 berkas tes lulus**, TypeScript serta lint tanpa error/peringatan. Build produksi berhasil, 23 halaman dihasilkan.
- Backend TypeScript lulus. Tes pengelompokan, pagination, pencarian/skenario, pembatasan SALES/SA, filter status lama, kontrak revisi PIC, dan validasi hasil proyek lulus.
- Browser Chrome terisolasi: **8/8 pemeriksaan lulus**, mencakup Projects/Documents dalam EN/ID pada lebar 1440/390 px. Empat pemeriksaan Projects memverifikasi angka selesai, filter, dan status Won. Tidak ada error runtime atau halaman melebar. Screenshot desktop diperiksa secara visual.

Perintah tes khusus dari root: `npm.cmd test --prefix frontend -- project-list-completion`. Tes backend: dari folder backend, `node -r ts-node/register src/services/project-list-completion.test.ts` dengan variabel Supabase dummy sesuai pola tes lokal. Bukti browser tersimpan di `.cache/frontend-rendering/` dan cara menjalankannya ada di [panduan browser](../frontend/tests/browser/README.md).

Pengujian memakai data buatan dan query Supabase yang digantikan dalam proses tes. Akun serta database asli tidak diubah; tampilan akun pengguna setelah refresh belum diverifikasi. Jalankan backend dan frontend dari source terbaru agar filter kelompok tersedia. Belum di-commit atau di-push.
