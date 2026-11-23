from copy import deepcopy
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH


SOURCE = Path(r"C:\Users\Rafli\Downloads\Monthly Report Internship R17 Group.docx")
OUTPUT = Path(r"D:\Workflow Repository System\outputs\Monthly_Report_Internship_R17_21Okt_17Nov_2026.docx")


def set_cell(cell, text, align=None):
    paragraph = cell.paragraphs[0]
    paragraph.clear()
    run = paragraph.add_run(text)
    if align is not None:
        paragraph.alignment = align
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    return run


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = Document(SOURCE)

    # Keep personal identity and supervisor fields empty: no verified values were supplied.
    identity = doc.tables[0]
    set_cell(identity.cell(3, 1), "21 Oktober - 17 November 2026")
    set_cell(identity.cell(3, 3), "Oktober - November 2026")

    activities = [
        ("21 Oktober 2026", "Menelaah kebutuhan dokumentasi Middleware Soundbox dan pembaruan laporan magang.", "Daftar kebutuhan revisi dokumen dan ruang lingkup pekerjaan tersusun."),
        ("22 Oktober 2026", "Menyusun skenario pengujian UAT untuk fitur utama platform Middleware.", "Draft Test Script UAT disiapkan."),
        ("23 Oktober 2026", "Menyesuaikan panduan operasional Middleware Soundbox dengan template perusahaan.", "Struktur panduan dan materi login, dashboard, log, serta hak akses diperbarui."),
        ("26 Oktober 2026", "Melanjutkan perapihan panduan Middleware, termasuk alur penggunaan dan istilah status transaksi.", "Materi panduan lebih terstruktur dan mudah dipahami."),
        ("27 Oktober 2026", "Menyusun panduan operasional TOMS dan memperbaiki laporan QA.", "Draft panduan TOMS, flowchart proses, dan revisi laporan QA tersedia."),
        ("28 Oktober 2026", "Meninjau prosedur TOMS untuk merchant, Groups, aktivasi terminal, dan Open Capability.", "Catatan penyempurnaan prosedur TOMS disusun."),
        ("29 Oktober 2026", "Memperbaiki kejelasan bahasa panduan Middleware dan menata gambar dashboard.", "Bahasa panduan diperjelas dan gambar ditempatkan pada bagian terkait."),
        ("30 Oktober 2026", "Menyelesaikan revisi panduan TOMS berdasarkan peninjauan antarmuka dan alur operasional.", "Dokumen Panduan Operasional TOMS Revisi 30 Oktober disusun."),
        ("2 November 2026", "Meninjau kembali kelengkapan dokumen panduan Middleware dan TOMS.", "Daftar bagian yang perlu dilengkapi dan diperbaiki diperbarui."),
        ("3 November 2026", "Merapikan materi panduan dan hasil revisi laporan QA.", "Dokumen kerja disusun untuk mendukung tahap penyempurnaan berikutnya."),
        ("4 November 2026", "Menggabungkan materi pendahuluan TOMS/FlyIoT dan Middleware Soundbox.", "Draft pendahuluan terpadu berisi latar belakang, tujuan, ruang lingkup, pengguna, dan alur notifikasi pembayaran."),
        ("5 November 2026", "Menelusuri masalah label perangkat pada fitur verifikasi wajah yang masih menampilkan Microsoft Edge.", "Lokasi terkait deteksi browser dan pengelolaan perangkat diidentifikasi."),
        ("6 November 2026", "Mendokumentasikan hasil penelusuran masalah label perangkat untuk tindak lanjut perbaikan.", "Catatan komponen terkait dan kebutuhan tindak lanjut disiapkan."),
        ("9 November 2026", "Meninjau kembali alur dokumen operasional Middleware dan TOMS.", "Konsistensi istilah, urutan prosedur, dan keterangan gambar diperiksa."),
        ("10 November 2026", "Melengkapi catatan perbaikan pada panduan operasional dan dokumen QA.", "Daftar perbaikan dokumen diperbarui."),
        ("11 November 2026", "Mengecek kesesuaian materi panduan dengan alur operasional sistem.", "Bagian yang memerlukan penjelasan tambahan diidentifikasi."),
        ("12 November 2026", "Merapikan dokumentasi pendukung untuk panduan Middleware dan TOMS.", "Dokumen pendukung tertata untuk proses peninjauan."),
        ("13 November 2026", "Meninjau hasil pembaruan dokumen dan memastikan susunan informasi mudah dipahami.", "Catatan hasil peninjauan disiapkan."),
        ("16 November 2026", "Melanjutkan pengecekan konsistensi istilah dan alur pada dokumentasi operasional.", "Konsistensi materi dokumentasi diperiksa."),
        ("17 November 2026", "Menyusun rekap kegiatan dan hasil pekerjaan untuk laporan magang bulanan.", "Rekap kegiatan periode 21 Oktober sampai 17 November 2026 disiapkan."),
    ]

    activity_table = doc.tables[1]
    for index, (date, work, output) in enumerate(activities, start=1):
        row = activity_table.rows[index]
        set_cell(row.cells[1], date, WD_ALIGN_PARAGRAPH.CENTER)
        set_cell(row.cells[2], work)
        set_cell(row.cells[3], output)

    learning_table = doc.tables[2]
    set_cell(
        learning_table.cell(1, 0),
        "Memahami penyusunan panduan operasional sistem, pengelolaan dokumen QA/UAT, alur Middleware Soundbox dan TOMS, serta penelusuran masalah label browser pada fitur verifikasi wajah.",
    )
    set_cell(
        learning_table.cell(1, 1),
        "Beberapa bahan pendukung belum tersedia, seperti sebagian gambar atau screenshot. Masalah label perangkat yang masih terbaca Microsoft Edge juga belum memiliki penyelesaian yang tercatat.",
    )

    doc.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
