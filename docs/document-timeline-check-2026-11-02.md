# Pemeriksaan jadwal output dokumen — 2 November 2026

## Hasil

Belum memenuhi kebutuhan setiap output sebagai milestone dengan jadwal tersimpan konsisten lintas browser.

Pemeriksaan menjalankan potongan fungsi simpan dan pembentukan baris dari kode aktual `project-timeline-editor.tsx`, dengan data sintetis dan dua penyimpanan terpisah. Bukan pengujian dua browser langsung terhadap database produksi. Tidak ada proyek atau data bisnis yang diubah.

| Output | Jadwal yang dimasukkan | Browser asal (cache tersedia) | Simulasi browser lain (cache kosong) |
|---|---|---|---|
| A | 2 November 2026, 2 hari kerja | Sesuai | 2 November 2026, 3 hari kerja |
| B | 10 November 2026, 3 hari kerja | Sesuai | 2 November 2026, 3 hari kerja |

Kedua output menggunakan milestone induk yang sama. Payload server hanya berisi satu jadwal: 2 November 2026 selama 3 hari kerja. Tanggal yang lebih akhir tidak dipertahankan.

## Penyebab terverifikasi

1. Jadwal masing-masing output disimpan pada `localStorage`, dengan key berdasarkan project.
2. Sebelum mengirim ke API, baris digabung berdasarkan `milestoneId`, menggunakan tanggal paling awal dan durasi terbesar. Ini tidak mencakup keseluruhan rentang pekerjaan.
3. Pembacaan di browser tanpa cache menggunakan jadwal milestone induk untuk kedua output.
4. Cache ditulis sebelum API berhasil. Simulasi API gagal membuktikan jadwal baru tetap masuk cache.
5. `dueDate` setiap baris diambil dari milestone induk, bukan hasil perhitungan jadwal output masing-masing.

Kontrak API timeline saat ini menerima `milestoneId`, `startDate`, dan `durationWorkingDays`. Backend memperbarui milestone yang sudah ada dalam fase proyek; proses ini tidak menciptakan milestone tersendiri bagi tiap output. Status review output tersedia terpisah; pemeriksaan ini belum menguji transisi status secara langsung pada aplikasi/database.

## Langkah perbaikan

Wujudkan relasi output dengan milestone independen di server, selaraskan API dan pembacaan jadwal/deadline/status, lalu gunakan cache hanya untuk draft. Simpan dianggap berhasil setelah server menerima perubahan. Pertahankan aturan approval, fase, dan akses pengguna. Siapkan penanganan data lama sebelum menerapkan perubahan database.

Reproduksi: `node .cache/check-document-timeline-2026-11-02.cjs` (skrip lokal di folder cache yang diabaikan Git). Pemeriksaan ini tidak mengubah kode aplikasi.
