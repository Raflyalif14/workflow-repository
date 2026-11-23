Add-Type -AssemblyName System.IO.Compression.FileSystem

$source = 'C:\Users\Rafli\Downloads\Monthly Report Internship R17 Group.docx'
$output = 'D:\Workflow Repository System\Monthly Report Internship R17 Group November 2026 Filled.docx'
Copy-Item -LiteralPath $source -Destination $output -Force

$activities = @(
    @('01 November 2026', 'Menelaah kebutuhan pengguna dan alur utama WorkflowHub untuk pengelolaan proyek tender.', 'Daftar kebutuhan fitur dan prioritas pengembangan tersusun.'),
    @('02 November 2026', 'Menyusun penyesuaian dashboard, status proyek, dan indikator Priority Task.', 'Rancangan informasi dashboard lebih sesuai dengan alur tender.'),
    @('03 November 2026', 'Mengerjakan perbaikan milestone dan output dokumen agar jadwal tersimpan di server.', 'Jadwal output dapat dikelola per milestone secara terpusat.'),
    @('04 November 2026', 'Menguji urutan work stage berdasarkan tanggal mulai dan durasi serta mendukung pekerjaan paralel.', 'Logika urutan dan pekerjaan paralel tervalidasi.'),
    @('05 November 2026', 'Mengembangkan fitur meeting proyek yang diajukan Sales dan memerlukan persetujuan Head SA.', 'Alur permintaan meeting dan approval tersedia.'),
    @('06 November 2026', 'Menambahkan reschedule, pemeriksaan jadwal bentrok, dan pencatatan hasil meeting atau MoM.', 'Perubahan jadwal dan dokumentasi meeting dapat ditelusuri.'),
    @('07 November 2026', 'Menyesuaikan kalender internal agar menampilkan meeting dan milestone proyek.', 'Agenda kerja SA dan Head SA dapat dipantau dalam kalender.'),
    @('08 November 2026', 'Melakukan pengecekan tampilan dashboard, task list, dan priority task.', 'Tampilan tugas diperbaiki agar lebih ringkas dan mudah dibaca.'),
    @('09 November 2026', 'Memperbaiki Face ID agar identitas wajah terhubung ke akun dan dapat digunakan lintas browser.', 'Alur sign-in dengan kamera dan data akun diperbaiki.'),
    @('10 November 2026', 'Mengembangkan pengajuan perubahan project plan setelah plan disetujui.', 'Sales dapat mengajukan perubahan output atau milestone untuk direview Head SA.'),
    @('11 November 2026', 'Menyesuaikan perhitungan durasi milestone menggunakan aturan hari kerja N+1.', 'Tanggal deadline milestone dihitung konsisten sesuai durasi kerja.'),
    @('12 November 2026', 'Mengintegrasikan Google Calendar untuk meeting proyek yang telah disetujui.', 'Koneksi OAuth dan sinkronisasi event meeting disiapkan.'),
    @('13 November 2026', 'Menguji sinkronisasi create, reschedule, dan cancel meeting ke Google Calendar.', 'Sinkronisasi meeting berhasil diverifikasi pada akun pengujian.'),
    @('14 November 2026', 'Memvalidasi pengaturan zona waktu kalender dan tampilan jadwal meeting.', 'Jam meeting pada aplikasi dan Google Calendar diselaraskan.'),
    @('15 November 2026', 'Melakukan regresi alur proyek, approval, dokumen, dan kalender.', 'Temuan tampilan dan alur diperbaiki sebelum pengujian lanjutan.'),
    @('16 November 2026', 'Meninjau stabilitas fitur, dokumentasi konfigurasi, dan kesiapan perubahan untuk disimpan di repository.', 'Catatan pengujian dan panduan konfigurasi diperbarui.'),
    @('17 November 2026', 'Menyusun laporan aktivitas magang dan melakukan pengecekan akhir hasil pengembangan.', 'Laporan aktivitas sampai tanggal 17 November 2026 selesai disusun.')
)

$zip = [System.IO.Compression.ZipFile]::Open($output, [System.IO.Compression.ZipArchiveMode]::Update)
try {
    $entry = $zip.GetEntry('word/document.xml')
    $reader = [System.IO.StreamReader]::new($entry.Open())
    [xml]$xml = $reader.ReadToEnd()
    $reader.Close()

    $ns = [System.Xml.XmlNamespaceManager]::new($xml.NameTable)
    $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
    $tables = $xml.SelectNodes('//w:body/w:tbl', $ns)

    function Set-CellText($cell, [string]$value) {
        $textNodes = $cell.SelectNodes('.//w:t', $ns)
        if ($textNodes.Count -eq 0) {
            $paragraph = $cell.SelectSingleNode('./w:p', $ns)
            if ($null -eq $paragraph) {
                $paragraph = $xml.CreateElement('w', 'p', $ns.LookupNamespace('w'))
                [void]$cell.AppendChild($paragraph)
            }
            $run = $xml.CreateElement('w', 'r', $ns.LookupNamespace('w'))
            $text = $xml.CreateElement('w', 't', $ns.LookupNamespace('w'))
            [void]$run.AppendChild($text)
            [void]$paragraph.AppendChild($run)
            $textNodes = @($text)
        }
        $textNodes[0].InnerText = $value
        for ($i = 1; $i -lt $textNodes.Count; $i++) { $textNodes[$i].InnerText = '' }
    }

    # Metadata that can be stated without inferring the intern's identity.
    $profile = $tables[0]
    $profileRows = $profile.SelectNodes('./w:tr', $ns)
    $profileCells = $profileRows[3].SelectNodes('./w:tc', $ns)
    Set-CellText $profileCells[1] '1 - 17 November 2026'
    Set-CellText $profileCells[3] 'November 2026'

    # Daily activity table. It contains a repeated header on the second page.
    $daily = $tables[1]
    $dailyRows = $daily.SelectNodes('./w:tr', $ns)
    for ($i = 0; $i -lt $activities.Count; $i++) {
        $rowIndex = if ($i -lt 16) { $i + 1 } else { 18 }
        $cells = $dailyRows[$rowIndex].SelectNodes('./w:tc', $ns)
        Set-CellText $cells[1] $activities[$i][0]
        Set-CellText $cells[2] $activities[$i][1]
        Set-CellText $cells[3] $activities[$i][2]
    }

    $reflection = $tables[2]
    $reflectionCells = $reflection.SelectNodes('./w:tr', $ns)[1].SelectNodes('./w:tc', $ns)
    Set-CellText $reflectionCells[0] 'Memahami pengembangan sistem workflow berbasis web, pengelolaan milestone paralel, mekanisme approval, sinkronisasi Google Calendar, dan pengujian fitur.'
    Set-CellText $reflectionCells[1] 'Penyesuaian jadwal, OAuth Google Calendar, dan konsistensi zona waktu memerlukan pengujian berulang. Kendala ditangani melalui perbaikan konfigurasi dan validasi alur.'

    $entry.Delete()
    $newEntry = $zip.CreateEntry('word/document.xml', [System.IO.Compression.CompressionLevel]::Optimal)
    $writer = [System.IO.StreamWriter]::new($newEntry.Open(), [System.Text.UTF8Encoding]::new($false))
    $xml.Save($writer)
    $writer.Close()
}
finally {
    $zip.Dispose()
}

Write-Output $output
