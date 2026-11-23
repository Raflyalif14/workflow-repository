Add-Type -AssemblyName System.IO.Compression.FileSystem

$source = 'C:\Users\Rafli\Downloads\Monthly Report Internship R17 Group.docx'
$output = 'D:\Workflow Repository System\Monthly Report Internship R17 Group November 2026 with Evidence.docx'
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

$wdStory = 6
$wdPageBreak = 7
$wdAlignLeft = 0
$wdAlignCenter = 1
$wdLineStyleSingle = 1
$wdColorWhite = 16777215
$darkBlue = 7949855 # #1F4E79 in Word BGR number format

function Add-Paragraph {
    param(
        [Parameter(Mandatory)]$Selection,
        [Parameter(Mandatory)][string]$Text,
        [int]$Size = 10,
        [bool]$Bold = $false,
        [int]$Alignment = 0,
        [int]$SpaceAfter = 6,
        [int]$SpaceBefore = 0
    )
    $Selection.Font.Name = 'Aptos'
    $Selection.Font.Size = $Size
    $Selection.Font.Bold = if ($Bold) { 1 } else { 0 }
    $Selection.Font.Color = 0
    $Selection.ParagraphFormat.Alignment = $Alignment
    $Selection.ParagraphFormat.SpaceAfter = $SpaceAfter
    $Selection.ParagraphFormat.SpaceBefore = $SpaceBefore
    $Selection.ParagraphFormat.LineSpacingRule = 0
    $Selection.TypeText($Text)
    $Selection.TypeParagraph()
}

function Add-Bullet {
    param([Parameter(Mandatory)]$Selection, [Parameter(Mandatory)][string]$Text)
    $Selection.Font.Name = 'Aptos'
    $Selection.Font.Size = 10
    $Selection.Font.Bold = 0
    $Selection.ParagraphFormat.Alignment = 0
    $Selection.ParagraphFormat.SpaceAfter = 4
    $Selection.Range.ListFormat.ApplyBulletDefault() | Out-Null
    $Selection.TypeText($Text)
    $Selection.TypeParagraph()
    $Selection.Range.ListFormat.RemoveNumbers() | Out-Null
}

function Add-Heading {
    param([Parameter(Mandatory)]$Selection, [Parameter(Mandatory)][string]$Text, [int]$Level = 1)
    $size = if ($Level -eq 1) { 16 } else { 12 }
    Add-Paragraph -Selection $Selection -Text $Text -Size $size -Bold $true -Alignment 0 -SpaceAfter 8 -SpaceBefore 12
}

function Add-Table {
    param(
        [Parameter(Mandatory)]$Document,
        [Parameter(Mandatory)]$Selection,
        [Parameter(Mandatory)][string[]]$Headers,
        [Parameter(Mandatory)][object[]]$Rows,
        [int[]]$Widths = @()
    )
    $table = $Document.Tables.Add($Selection.Range, $Rows.Count + 1, $Headers.Count)
    $table.Borders.Enable = 1
    $table.AllowAutoFit = $true
    $table.Rows.Item(1).HeadingFormat = $true
    $table.Rows.Item(1).AllowBreakAcrossPages = $false
    for ($c = 1; $c -le $Headers.Count; $c++) {
        $cell = $table.Cell(1, $c)
        $cell.Range.Text = "$($Headers[$c - 1])`r`a"
        $cell.Range.Font.Name = 'Aptos Display'
        $cell.Range.Font.Size = 9
        $cell.Range.Font.Bold = 1
        $cell.Range.Font.Color = $wdColorWhite
        $cell.Range.ParagraphFormat.Alignment = $wdAlignCenter
        $cell.Shading.BackgroundPatternColor = $darkBlue
        if ($Widths.Count -eq $Headers.Count) { $cell.Width = $Widths[$c - 1] }
    }
    for ($r = 0; $r -lt $Rows.Count; $r++) {
        for ($c = 1; $c -le $Headers.Count; $c++) {
            $cell = $table.Cell($r + 2, $c)
            $cell.Range.Text = "$($Rows[$r][($c - 1)])"
            $cell.Range.Font.Name = 'Aptos'
            $cell.Range.Font.Size = 8.5
            $cell.Range.Font.Bold = 0
            $cell.Range.Font.Color = 0
            $cell.Range.ParagraphFormat.Alignment = $wdAlignLeft
            $cell.Range.ParagraphFormat.SpaceAfter = 2
            $cell.VerticalAlignment = 1
        }
    }
    $Selection.SetRange($table.Range.End, $table.Range.End)
    $Selection.TypeParagraph()
}

$word = $null
$doc = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $doc = $word.Documents.Open($output, $false, $false)
    # Fill the Monthly Report section before appending the evidence section.
    $profile = $doc.Tables.Item(1)
    $profile.Cell(4, 2).Range.Text = "1 - 17 November 2026`r`a"
    $profile.Cell(4, 4).Range.Text = "November 2026`r`a"
    $daily = $doc.Tables.Item(2)
    for ($i = 0; $i -lt $activities.Count; $i++) {
        $row = if ($i -lt 16) { $i + 2 } else { 19 }
        $daily.Cell($row, 2).Range.Text = "$($activities[$i][0])`r`a"
        $daily.Cell($row, 3).Range.Text = "$($activities[$i][1])`r`a"
        $daily.Cell($row, 4).Range.Text = "$($activities[$i][2])`r`a"
    }
    $reflection = $doc.Tables.Item(3)
    $reflection.Cell(2, 1).Range.Text = "Memahami pengembangan sistem workflow berbasis web, pengelolaan milestone paralel, mekanisme approval, sinkronisasi Google Calendar, dan pengujian fitur.`r`a"
    $reflection.Cell(2, 2).Range.Text = "Penyesuaian jadwal, OAuth Google Calendar, dan konsistensi zona waktu memerlukan pengujian berulang. Kendala ditangani melalui perbaikan konfigurasi dan validasi alur.`r`a"
    $selection = $word.Selection
    $selection.EndKey($wdStory) | Out-Null
    $selection.InsertBreak($wdPageBreak)

    Add-Paragraph -Selection $selection -Text 'LAMPIRAN EVIDENCE PENGEMBANGAN SISTEM' -Size 19 -Bold $true -Alignment $wdAlignCenter -SpaceAfter 4 -SpaceBefore 24
    Add-Paragraph -Selection $selection -Text 'WorkflowHub - Workflow Repository Management' -Size 13 -Bold $true -Alignment $wdAlignCenter -SpaceAfter 12
    Add-Paragraph -Selection $selection -Text 'Periode evidence: Oktober - November 2026' -Size 10 -Bold $false -Alignment $wdAlignCenter -SpaceAfter 26
    Add-Paragraph -Selection $selection -Text 'Lampiran ini merangkum fitur sistem yang dikembangkan pada WorkflowHub dan menjadi panduan pengumpulan screenshot untuk membuktikan hasil pekerjaan. Screenshot dimasukkan setelah setiap caption evidence sesuai nomor yang tercantum pada checklist.' -Size 10 -Bold $false -Alignment 0 -SpaceAfter 12
    Add-Paragraph -Selection $selection -Text 'Catatan penggunaan evidence' -Size 11 -Bold $true -Alignment 0 -SpaceAfter 4
    Add-Bullet -Selection $selection -Text 'Gunakan data proyek uji; sembunyikan password, token OAuth, API key, dan informasi pribadi yang tidak relevan.'
    Add-Bullet -Selection $selection -Text 'Ambil screenshot setelah aksi berhasil sehingga status, hasil, atau notifikasi keberhasilan terlihat jelas.'
    Add-Bullet -Selection $selection -Text 'Berikan caption dengan format: Gambar [nomor]. [nama fitur] - [hasil yang terbukti].'
    Add-Bullet -Selection $selection -Text 'Untuk fitur yang memiliki beberapa peran, gunakan screenshot dari peran yang melakukan aksi dan peran yang menyetujui.'
    $selection.InsertBreak($wdPageBreak)

    Add-Heading -Selection $selection -Text '1. Ringkasan Sistem yang Dikembangkan' -Level 1
    Add-Paragraph -Selection $selection -Text 'WorkflowHub adalah aplikasi web untuk mengelola alur tender dari Pra-Tender sampai hasil tender. Sistem membantu Sales, Solution Architect, dan Head Solution Architect mengatur proyek, milestone, dokumen, persetujuan, jadwal meeting, serta pemantauan pekerjaan dalam satu aplikasi.' -Size 10 -Bold $false -Alignment 0 -SpaceAfter 10

    $summaryRows = @(
        @('1', 'Manajemen proyek tender', 'Membuat dan memantau proyek berdasarkan fase Pra-Tender, On Submission Tender, dan Tender Result.'),
        @('2', 'Milestone dan output dokumen', 'Mengubah output pekerjaan menjadi milestone, mengatur PIC, jadwal, durasi, deadline, dan progres pekerjaan.'),
        @('3', 'Pekerjaan paralel', 'Memungkinkan milestone dimulai paralel ketika tanggal mulai sudah tiba tanpa menunggu milestone lain selesai.'),
        @('4', 'Dokumen dan approval', 'Upload, revisi, submit, review, approval, riwayat dokumen, serta dokumen wajib Proposal Teknis pada fase submission tender.'),
        @('5', 'Project plan changes', 'Sales mengajukan tambah atau hapus output setelah plan disetujui; Head SA mereview sebelum perubahan diterapkan.'),
        @('6', 'Dashboard berbasis peran', 'Dashboard Sales, SA, dan Head SA dengan Project Pipeline, Priority Task, Task List, SA Workload, dan Revenue Opportunity.'),
        @('7', 'Outcome tender', 'Sales mencatat WON atau LOST beserta final contract value dan file evidence yang diwajibkan.'),
        @('8', 'Meeting dan kalender', 'Sales mengajukan meeting dengan PIC SA otomatis, approval Head SA, reschedule, conflict warning, dan MoM.'),
        @('9', 'Google Calendar', 'Sinkronisasi satu arah meeting yang sudah approved ke kalender Google pengguna yang menghubungkan akunnya.'),
        @('10', 'Face sign-in', 'Login kamera yang mengidentifikasi akun dari wajah terdaftar dengan pemeriksaan anti-spoofing dan tetap menyediakan password sebagai fallback.'),
        @('11', 'Activity dan notifikasi', 'Riwayat perubahan proyek dan pemberitahuan untuk aktivitas workflow yang relevan.'),
        @('12', 'Bahasa dan akses peran', 'Tampilan English/Indonesia serta akses fitur berdasarkan peran pengguna.')
    )
    Add-Table -Document $doc -Selection $selection -Headers @('No', 'Modul / Fitur', 'Fungsi yang Dibuat') -Rows $summaryRows

    Add-Heading -Selection $selection -Text '2. Rincian Fitur dan Bukti yang Dibutuhkan' -Level 1
    $featureRows = @(
        @('A. Akses dan autentikasi', 'Email/password login, Face ID per akun, anti-spoofing, dan manajemen akses kamera.', 'Tampilkan halaman login; lalu halaman Settings yang menunjukkan Face sign-in aktif atau kamera berhasil mengenali akun.'),
        @('B. Proyek dan fase tender', 'Daftar proyek, detail proyek, status fase, filter, dan transisi Pra-Tender ke On Submission Tender.', 'Tampilkan daftar proyek dengan fase aktif dan halaman detail satu proyek.'),
        @('C. Timeline dan milestone', 'Tanggal mulai, durasi hari kerja N+1, deadline, urutan stage, start sesuai tanggal, dan milestone paralel.', 'Tampilkan Project Timeline Setup serta minimal dua milestone yang dapat berjalan bersamaan.'),
        @('D. PIC dan SA Workload', 'Penugasan PIC SA, riwayat PIC, Active Work dihitung dari milestone, dan detail beban kerja SA.', 'Tampilkan assignment PIC, kemudian dashboard Head SA pada tabel SA Workload.'),
        @('E. Dokumen output', 'Upload, versi, submit review, approval, mandatory Proposal Teknis, dan repository dokumen.', 'Tampilkan output document pada milestone, status review, serta halaman Documents.'),
        @('F. Approval dan perubahan plan', 'Approval project plan, perubahan deadline, dan perubahan output/milestone setelah plan disetujui.', 'Tampilkan request change oleh Sales dan antrean approval Head SA.'),
        @('G. Dashboard dan revenue', 'Priority Task, Task List, Project Pipeline, Estimated Revenue, Final Revenue, serta filter fase.', 'Tampilkan dashboard peran dan tabel Revenue Opportunity dengan kolom Final Revenue.'),
        @('H. WON / LOST', 'Pencatatan hasil tender dengan final value dalam format IDR serta evidence JPG/JPEG/PNG/PDF/DOC/DOCX.', 'Tampilkan modal result dengan evidence terlampir dan status hasil sesudah tersimpan.'),
        @('I. Meeting dan kalender', 'Request meeting, approval, reschedule, conflict warning, MoM, dan calendar internal.', 'Tampilkan request dari Sales, approval Head SA, dan agenda pada Calendar.'),
        @('J. Google Calendar', 'OAuth connection dan sinkronisasi meeting APPROVED; reschedule memperbarui event dan cancel menghapus event.', 'Tampilkan status connected di Settings dan event WorkflowHub pada Google Calendar.'),
        @('K. Riwayat dan notifikasi', 'Activity history serta notifikasi tindakan workflow.', 'Tampilkan activity item yang menjelaskan aktor, proyek, aksi, dan waktu.')
    )
    Add-Table -Document $doc -Selection $selection -Headers @('Area', 'Pekerjaan yang Dibuat', 'Bukti Screenshot yang Disarankan') -Rows $featureRows

    Add-Heading -Selection $selection -Text '3. Checklist Screenshot Evidence' -Level 1
    Add-Paragraph -Selection $selection -Text 'Urutkan gambar mengikuti kode di bawah. Jika satu screenshot sudah membuktikan dua poin terkait, tetap beri dua caption berbeda agar reviewer mudah mencocokkan evidence dengan fitur.' -Size 10 -Bold $false -Alignment 0 -SpaceAfter 8
    $evidenceRows = @(
        @('E-01', 'Halaman login', 'Buka halaman login.', 'Form email/password dan tombol sign-in terlihat.'),
        @('E-02', 'Face sign-in', 'Gunakan camera sign-in pada akun yang sudah terdaftar.', 'Status kamera atau hasil identifikasi akun terlihat tanpa memperlihatkan data rahasia.'),
        @('E-03', 'Face sign-in settings', 'Buka Settings pada akun yang sudah memiliki registrasi wajah.', 'Status face sign-in aktif serta penjelasan akun dapat dipakai lintas browser.'),
        @('E-04', 'Dashboard Sales', 'Masuk sebagai Sales.', 'Project Pipeline, Priority Task, dan Task List terlihat.'),
        @('E-05', 'Dashboard Head SA', 'Masuk sebagai Head SA.', 'Project Pipeline, SA Workload, Priority Task, dan review queue terlihat.'),
        @('E-06', 'Dashboard SA', 'Masuk sebagai Solution Architect.', 'Tugas yang relevan dengan SA dan proyek PIC terlihat.'),
        @('E-07', 'Daftar proyek', 'Buka Projects dan gunakan filter fase.', 'Filter Pra-Tender atau On Submission Tender dan hasilnya terlihat.'),
        @('E-08', 'Detail proyek', 'Buka satu proyek aktif.', 'Nama proyek, customer, fase aktif, sales owner, dan ringkasan proyek terlihat.'),
        @('E-09', 'Assign PIC SA', 'Head SA membuka penugasan PIC pada proyek.', 'Nama SA PIC dan riwayat/konfirmasi penugasan terlihat.'),
        @('E-10', 'Project Timeline Setup', 'Buka pengaturan timeline proyek.', 'Start date, duration, dan calculated due date untuk output terlihat.'),
        @('E-11', 'Milestone paralel', 'Tampilkan dua milestone dengan jadwal aktif pada periode yang sama.', 'Kedua milestone dapat berstatus aktif tanpa menunggu urutan linear.'),
        @('E-12', 'Start date guard', 'Coba membuka milestone sebelum tanggal mulai pada proyek uji.', 'Pesan bahwa milestone belum dapat dimulai terlihat.'),
        @('E-13', 'Output document', 'Buka milestone SA dan upload output.', 'Nama output, file, versi, status, dan aksi submit/review terlihat.'),
        @('E-14', 'Approval output', 'Head SA membuka approval output.', 'Detail output serta tombol approve/reject atau hasil approval terlihat.'),
        @('E-15', 'Mandatory Proposal Teknis', 'Buka fase On Submission Tender.', 'Proposal Teknis diberi indikator Required; dokumen lain tidak dipaksa sebagai mandatory.'),
        @('E-16', 'Document repository', 'Buka Documents.', 'Dokumen approved, proyek asal, versi, dan aksi download/open project terlihat.'),
        @('E-17', 'Request deadline change', 'Ajukan perubahan deadline pada milestone.', 'Tanggal lama/baru, alasan, dan status Pending review terlihat.'),
        @('E-18', 'Project plan change', 'Sales buka Project plan changes dan ajukan perubahan.', 'Alasan, item Add atau Remove, serta status Pending review terlihat.'),
        @('E-19', 'Approval plan change', 'Head SA buka Approvals.', 'Request perubahan plan beserta pilihan approve/reject terlihat.'),
        @('E-20', 'Priority Task dan Task List', 'Buka dashboard saat ada tugas dengan deadline dekat atau overdue.', 'Urutan deadline dan tombol Open task terlihat.'),
        @('E-21', 'SA Workload detail', 'Klik atau buka detail salah satu SA pada SA Workload.', 'Daftar milestone atau pekerjaan SA terlihat.'),
        @('E-22', 'Revenue Opportunity', 'Buka dashboard yang berisi revenue table.', 'Estimated Revenue, Final Revenue, dan filter fase terlihat.'),
        @('E-23', 'WON / LOST evidence', 'Sales pilih WON atau LOST pada milestone akhir.', 'Final Contract Value berformat IDR dan file evidence wajib terlampir.'),
        @('E-24', 'Tender Result', 'Selesaikan pencatatan outcome pada proyek uji.', 'Status WON/LOST dan Final Revenue di detail atau dashboard terlihat.'),
        @('E-25', 'Request meeting', 'Sales buka detail proyek lalu pilih Request meeting.', 'Judul, waktu mulai, lokasi/link, agenda, dan tanda field wajib terlihat.'),
        @('E-26', 'Meeting approval', 'Head SA membuka approval meeting.', 'Informasi request meeting dan pilihan keputusan terlihat.'),
        @('E-27', 'Reschedule dan conflict warning', 'Ajukan perubahan jadwal yang bertabrakan dengan agenda PIC.', 'Peringatan conflict dan status reschedule pending terlihat.'),
        @('E-28', 'Meeting results / MoM', 'Buka meeting yang waktunya sudah lewat.', 'Kolom catatan, keputusan, dan tindak lanjut hasil meeting terlihat.'),
        @('E-29', 'Internal Calendar', 'Buka menu Calendar.', 'Meeting approved dan milestone pada tanggal kalender terlihat.'),
        @('E-30', 'Google Calendar sync', 'Hubungkan akun Google di Settings lalu approve satu meeting proyek uji.', 'Status Connected dan event WorkflowHub pada Google Calendar terlihat.'),
        @('E-31', 'Activity history', 'Buka History/Activity pada project atau dashboard.', 'Aktor, nama proyek, aksi, dan timestamp terlihat.'),
        @('E-32', 'Notification', 'Klik ikon notifikasi setelah ada aktivitas workflow.', 'Notifikasi yang relevan dengan tugas atau approval terlihat.')
    )
    Add-Table -Document $doc -Selection $selection -Headers @('Kode', 'Screenshot', 'Cara Mengambil', 'Yang Harus Terlihat') -Rows $evidenceRows

    Add-Heading -Selection $selection -Text '4. Urutan Penyusunan Lampiran Foto' -Level 1
    Add-Paragraph -Selection $selection -Text 'Susun evidence setelah halaman ini dengan urutan E-01 sampai E-32. Setiap gambar diberi caption di bawahnya. Untuk menjaga ukuran laporan, gunakan satu gambar per halaman bila teks pada screenshot kecil; gunakan dua gambar per halaman hanya jika keduanya masih terbaca.' -Size 10 -Bold $false -Alignment 0 -SpaceAfter 8
    Add-Bullet -Selection $selection -Text 'Mulai dari akses/login dan dashboard, lanjutkan ke proyek, milestone, dokumen, approval, revenue, meeting, kalender, lalu activity history.'
    Add-Bullet -Selection $selection -Text 'Sertakan bukti sebelum dan sesudah approval bila proses membutuhkan dua peran, misalnya request meeting dan approval Head SA.'
    Add-Bullet -Selection $selection -Text 'Gunakan satu proyek uji yang konsisten agar reviewer dapat mengikuti alur dari timeline sampai hasil tender.'
    Add-Bullet -Selection $selection -Text 'Pastikan jam pada aplikasi dan Google Calendar memakai zona waktu yang sama sebelum mengambil evidence sinkronisasi.'
    $selection.InsertBreak($wdPageBreak)

    Add-Heading -Selection $selection -Text '5. Batas Evidence' -Level 1
    Add-Paragraph -Selection $selection -Text 'Screenshot membuktikan tampilan dan hasil aksi pada aplikasi. Untuk fitur yang bergantung pada layanan eksternal, seperti Google Calendar, tambahkan satu screenshot dari aplikasi dan satu screenshot dari kalender Google. Jangan mencantumkan Client Secret, token, API key, password, atau kode verifikasi pada gambar.' -Size 10 -Bold $false -Alignment 0 -SpaceAfter 8
    Add-Paragraph -Selection $selection -Text 'Selesai.' -Size 10 -Bold $true -Alignment 0 -SpaceAfter 0 -SpaceBefore 14

    $doc.Save()
}
finally {
    if ($doc) { try { $doc.Close() } catch {} }
    if ($word) { try { $word.Quit() } catch {} }
}

Write-Output $output
