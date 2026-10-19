# Menjalankan pemeriksaan frontend

Gunakan Node.js 22. Dari root repository, jalankan `npm.cmd ci --prefix backend` dan `npm.cmd ci --prefix frontend` pada pemasangan awal. Dependency backend diperlukan oleh tes kontrak HTTP yang memakai controller backend dengan provider tiruan. Tidak perlu `.env` Supabase asli untuk tes otomatis.

| Perintah dari folder frontend | Kegunaan |
| --- | --- |
| `npm.cmd run check` | TypeScript, lint, lalu seluruh tes. |
| `npm.cmd test` | Seluruh file `src/**/*.test.ts(x)` ditambah pemeriksaan aset kamera. |
| `npm.cmd test -- user-form-feedback` | Hanya file tes yang namanya cocok. Jika tidak ada yang cocok, perintah gagal. |
| `npm.cmd run typecheck` | Pemeriksaan tipe tanpa build. |
| `npm.cmd run lint` | Aturan React/Next.js untuk source; error menyebabkan exit gagal. |
| `npm.cmd run build` | Build produksi sebagai pemeriksaan terpisah. |

Runner memakai dependency lokal, tanpa `npx` yang mengunduh paket saat tes dijalankan. Setiap file mendapat proses sendiri, batas 90 detik, dan hasil PASS/FAIL. Fungsi ekspor bernama `testXxx` dipanggil dan ditunggu; ini mencakup dua tes kamera sekali tatap. Tes top-level async harus mengatur `process.exitCode = 1` saat gagal, seperti pola tes yang sudah ada.

Kredensial Supabase dalam proses tes diganti nilai tiruan. Tes kontrak HTTP memakai server localhost; lingkungan sandbox mungkin memerlukan izin untuk koneksi loopback. Jangan menambahkan tes yang memerlukan akun produksi ke suite ini.

`tests/browser/` adalah pengujian browser terpisah dengan kebutuhan runtime/fixture sendiri. Tes ini tidak otomatis dijalankan oleh `npm test`. Tes kamera unit memakai objek tiruan, sehingga kelulusannya tidak mengukur akurasi biometrik pada kamera nyata.

ESLint memakai `next/core-web-vitals` yang cocok dengan Next.js 15. Aturan urutan Hook tetap aktif untuk source aplikasi. Aturan itu dikecualikan khusus file tes yang memasang dispatcher React tiruan. Pemeriksaan terakhir setelah perapian 16 Oktober 2026 menghasilkan 0 error dan 0 warning; peringatan baru tetap ditampilkan.

Workflow `.github/workflows/frontend-checks.yml` menjalankan check dan build setelah perubahan terkait di-push atau dibuat PR. Konfigurasi tersedia lokal; hasil GitHub Actions baru dapat dipastikan setelah workflow benar-benar berjalan di GitHub.
