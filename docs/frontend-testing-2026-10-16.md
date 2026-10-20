# Pengujian frontend dan perapian pesan — 16 Oktober 2026

## Temuan awal

- Perintah `test` berisi daftar panjang `npx tsx`, tetapi `tsx` tidak terpasang. Beberapa tes baru juga belum masuk daftar.
- Runner Face ID memakai `ts-node` dari folder backend. Dua tes sekali tatap mengekspor fungsi sehingga tidak cukup hanya di-import untuk menjalankannya.
- Perintah lint belum memiliki ESLint/config terpasang. Pemeriksaan TypeScript saja belum mencakup aturan React dan Next.js.
- Dialog pengguna menampilkan kegagalan simpan melalui `alert` umum, tanpa pesan di dalam formulir. Ini menjadi sasaran perapian setelah tes tersedia.

## Rencana perubahan

Sediakan runner frontend lokal yang menemukan semua tes, menjalankan setiap file dalam proses terpisah, memanggil tes yang diekspor, dan melaporkan kegagalan. Pasang konfigurasi lint sesuai Next.js 15. Pertahankan kamus EN/ID dan aturan bisnis. Perubahan backup yang sudah ada tidak digabungkan atau di-commit dalam pekerjaan ini. Pengujian alur proyek dan hak akses nomor 1–2 sudah dinyatakan aman oleh pengguna; tidak diulang sebagai UAT langsung.

## Hasil

**Pembaruan lanjutan:** 33 peringatan pada catatan awal di bawah telah dirapikan. Hasil terbaru: lint 0 error/0 warning, 66/66 berkas tes, build lulus, dan 8 pemeriksaan browser lulus. Rincian serta batasnya ada di [laporan lanjutan](frontend-lint-followup-2026-10-16.md).

### Yang sudah diperbaiki

- `npm.cmd run check --prefix frontend` menjalankan TypeScript, lint, dan seluruh tes dari root repository. Runner menemukan tes secara otomatis; file tes baru tidak perlu ditambahkan ke daftar panjang di `package.json`.
- Runner memakai dependency frontend sendiri, menjalankan tes secara terpisah, dan menunggu fungsi tes async yang diekspor. Tidak ada paket yang diunduh ketika perintah tes dijalankan.
- Konfigurasi GitHub Actions tersedia untuk pemeriksaan dan build setelah push/PR. Konfigurasi ini belum di-push atau dijalankan di GitHub.
- Dua `useMemo` setelah return bersyarat pada halaman buat proyek dihapus; perhitungan kecilnya dilakukan langsung. Helper mutasi skenario diberi nama Hook yang benar. Aturan bisnis tetap sama.
- Kegagalan tambah/ubah pengguna tampil di dalam formulir dalam EN/ID. Isian tetap tersedia, pesan memberi petunjuk memeriksa hasil sebelum mencoba lagi, dan kontrol dinonaktifkan selama menyimpan.
- Tiga tes lama disesuaikan dengan kontrak tampilan terkini: pesan privasi kamera, penyelesaian milestone oleh PIC, dan pesan penghapusan proyek yang sudah memakai kamus terjemahan. Ditambahkan tes perilaku pesan error formulir pengguna.

### Pemeriksaan lokal

| Pemeriksaan | Hasil |
| --- | --- |
| Seluruh suite frontend | **65/65 berkas tes lulus**. Jumlah ini adalah berkas, bukan jumlah skenario. |
| Perubahan terakhir pada formulir dan terjemahan | Tes formulir EN/ID untuk tambah/ubah, retry, input yang dipertahankan, kontrol saat menyimpan, dan reset pesan lulus; tes kesesuaian kamus lulus. |
| TypeScript | Lulus, tanpa error. |
| ESLint | **0 error, 33 peringatan**. Peringatan tetap ditampilkan. |
| Build produksi | Lulus; 23 halaman statis selesai dibuat. Next.js masih menampilkan peringatan deteksi root karena ada lockfile root dan frontend. |
| Runner gagal secara benar | Filter tanpa hasil dan penolakan async yang disengaja menghasilkan exit gagal. |
| Konfigurasi CI | YAML berhasil dibaca; check/build dan izin baca repository terkonfigurasi. Belum ada hasil eksekusi GitHub. |

Suite mencakup helper alur/hak akses, kontrak HTTP dengan provider tiruan, terjemahan, dan komponen kamera dengan objek tiruan. Ini bukan pengujian browser menyeluruh atau pengukuran akurasi Face ID. Tidak ada migrasi maupun perubahan data akun produksi dalam pengujian ini.

### Catatan yang tersisa

- Peringatan lint terutama mengenai dependensi React Hook, penggunaan gambar biasa, dan font. Perubahan dependensi Hook perlu diperiksa bersama perilaku komponen; menambahkannya secara otomatis dapat mengubah siklus kamera atau pengambilan data.
- `source-map-js` diperbarui ke 1.2.2. Audit dependency setelah pembaruan masih melaporkan **10 paket terdampak: 3 moderate dan 7 high**, melalui rantai Tailwind/ESLint. Ini perlu pekerjaan pembaruan tersendiri; tidak dilakukan upgrade/downgrade framework besar atau `audit fix --force` pada tugas ini.
- Pengujian browser pada `frontend/tests/browser/` tetap terpisah. UAT alur proyek dan hak akses nomor 1–2 mengikuti hasil yang sudah dinyatakan aman oleh pengguna, bukan hasil pengujian langsung baru dari pekerjaan ini.

Panduan perintah dan batas pengujian: [frontend/tests/README.md](../frontend/tests/README.md).
