# Tes wajah cepat

Halaman: `/settings/face-verification/quick`. Dari halaman eksperimen
existing, pilih **Buka tes wajah cepat di tab baru**. Tab baru menjaga
tangkapan/catatan yang masih ada di tab eksperimen.

Alur: **Nyalakan kamera → Ambil foto → Tes wajah**. Tidak ada kode peserta,
kode sesi, label LIVE/SPOOF manual, Foto B, atau CSV. Penjelasan pengiriman
foto terlihat tepat sebelum tombol Tes wajah. Kamera tidak otomatis aktif
dan pengambilan foto tidak otomatis mengirimkannya.

Tes mengirim satu frame asli ke endpoint PAD berautentikasi yang sudah ada.
Hasil wajib cocok dengan request, slot, checksum foto dan dimensi. Summary
menampilkan deteksi wajah, preview crop yang diverifikasi, skor model, dan
kesimpulan keaslian yang masih belum dapat dipastikan. Skor tampilan berupa
persentase; angka mentah tersedia di rincian. Tidak ada threshold baru,
keputusan login, label ground truth buatan, enrollment, atau penyimpanan foto.

Retake/delete/cancel, pergantian akun, logout, pagehide dan unmount
membatalkan request serta menolak respons lama. Bahasa EN/ID terpusat.
Mode eksperimen existing tetap tersedia pada URL semula.

Validasi 13 Oktober 2026:

- Runner baru `npm run test:face-quick`: PASS dengan transport, foto dan
  lifecycle sintetis/mock; juga mencakup checksum salah, request/slot salah,
  dimensi tidak cocok, error layanan, timeout, double-click, dan EN/ID.
- Runner PAD existing dan ROI (10 kelompok): PASS.
- Frontend TypeScript: PASS. Tidak menjalankan full production build.
- Halaman aktual dibuka pada Edge dengan sesi existing; initial state,
  petunjuk tiga langkah, tombol dan layout ditinjau. Tidak ada error/warning
  pada log tab yang tersedia. Kamera fisik dan inference foto pengguna
  belum dijalankan pada mode baru.

Ini penyederhanaan pengujian. Masalah skor spoof tinggi belum dinyatakan
terselesaikan; tidak mengubah model/crop/normalisasi/backend/auth.
