# Perapian kode Dashboard - 19 Oktober 2026

## Audit singkat

Halaman Dashboard memiliki 1.012 baris. Selain koordinasi query dan susunan halaman, file tersebut memuat pembentukan antrean berdasarkan role, perhitungan ringkasan, kartu angka, baris proyek, panel perhatian, dan beban kerja Solution Architect.

Helper `dashboard-ux.ts` dan panel aktivitas/status fase sudah terpisah. Pengujian yang ada mencakup empat role, EN/ID, status loading/error/kosong, tautan pekerjaan, serta tata letak browser. Bagian tersebut dapat digunakan untuk memeriksa hasil perapian tanpa menambah dependensi tes.

## Rencana perubahan

- Pisahkan pembentukan ringkasan dan item pekerjaan ke helper `dashboard-overview.ts`.
- Pisahkan kartu angka, baris proyek, panel perhatian, dan beban kerja SA menjadi komponen Dashboard.
- Pertahankan query, internal key metrik, urutan prioritas, terjemahan, izin, tautan, dan tampilan sebelumnya.
- Periksa kesetaraan fungsi, jalankan pemeriksaan frontend dan build terpisah, lalu gunakan tes browser yang sudah tersedia dengan data buatan.

Lingkup hanya Dashboard dan dokumentasi/validasi terkait. Perubahan tahap sebelumnya dipertahankan. Tidak ada perubahan database, model wajah, staging, commit, atau push.

## Hasil

Selesai. Halaman utama berkurang dari **1.012 menjadi 398 baris**. Tanggung jawab kode dipisahkan sebagai berikut:

| Bagian | Berkas |
| --- | --- |
| Ringkasan dan daftar pekerjaan berdasarkan role | `frontend/src/lib/dashboard-overview.ts` |
| Kartu angka ringkasan | `frontend/src/components/dashboard/metric-card.tsx` |
| Baris perkembangan proyek | `frontend/src/components/dashboard/project-delivery-row.tsx` |
| Panel pekerjaan yang perlu perhatian | `frontend/src/components/dashboard/quick-insights-panel.tsx` |
| Panel beban kerja SA | `frontend/src/components/dashboard/solution-architect-workload-panel.tsx` |

Isi 18 definisi sebelum/sesudah pemindahan cocok, termasuk fungsi halaman, helper, komponen, tipe, dan pemetaan label. Query dan isi fungsi halaman tidak diubah. Internal key metrik tetap dipakai untuk perhitungan; terjemahan dilakukan saat menampilkan hasil. Import yang sudah tidak dipakai, termasuk `BarChart3` dan `formatActorRoleLabel`, dihapus.

## Verifikasi

- `npm.cmd run check --prefix frontend`: TypeScript, lint, dan **68/68 berkas tes lulus**.
- Build produksi pada salinan terpisah berhasil: 23 halaman dan server standalone. Source Dashboard pada salinan build sudah dibandingkan dengan hasil akhir di workspace.
- Tes data simulasi browser: **4/4 lulus**. Permintaan yang tidak dikonfigurasi tetap ditolak.
- Tes browser akhir: **84 pemeriksaan UI lulus**, terdiri dari 24 kombinasi Dashboard (empat role, EN/ID, lebar 360/390/1440 px), empat navigasi HP, empat pagination aktivitas, 48 pemeriksaan halaman terkait, dan empat kondisi kosong. Pemeriksaan isolasi tambahan juga lulus: tidak ada error runtime, API tak dikenal, atau mutasi data bisnis.
- Screenshot akhir desktop Head SA EN dan Sales ID pada lebar 390 px sudah diperiksa. Angka ringkasan tidak keluar dari kartu dan tidak ada overflow halaman.
- `git diff --check` dan pemeriksaan whitespace berkas baru lulus. Index kosong dan HEAD tetap `44ae2e5`.

Percobaan browser pertama berhenti pada pemeriksaan isolasi karena fixture lama belum menangani `GET /face-login/capabilities`. Respons khusus `{ enabled: false }` ditambahkan pada fixture agar tes Dashboard tidak meminta kamera. Kode login wajah tidak diubah. Pemeriksaan browser juga diperkuat agar error runtime menyebabkan tes gagal, dan metadata baseline diperjelas sebagai baseline fixture. Bukti kegagalan awal disimpan di `.cache/clean-code-dashboard/browser-attempt-1/`.

Log/bukti tahap ini berada di `.cache/clean-code-dashboard/`: `check.log`, `build.log`, `function-parity.json`, serta `browser-final/results.json` dan screenshot akhir. Cara mengulang tes tercantum di `frontend/tests/browser/README.md`. Browser memakai akun/API buatan dan ukuran layar yang diemulasi; hasilnya memverifikasi frontend, bukan otorisasi backend, data produksi, atau perangkat HP asli. Tidak ada staging, commit, push, atau migrasi.
