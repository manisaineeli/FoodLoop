# Render the report to PDF and to page PNGs so the layout can be checked.
#
#   powershell -ExecutionPolicy Bypass -File docgen/preview.ps1 -Pages 1,6,10
param(
    [int[]]$Pages = @(),
    [string]$DocPath = "C:\Users\ganes\OneDrive\Desktop\UML\FoodLoop_OOAD_Project_Report.docx",
    [string]$OutDir = "C:\Users\ganes\AppData\Local\Temp\opencode\preview"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
[string]$pdf = Join-Path $OutDir "report.pdf"

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open($DocPath, $false, $true)
    $doc.SaveAs([ref]$pdf, [ref]17)
    $n = $doc.ComputeStatistics(2)
    $doc.Close($false)
}
finally {
    $word.Quit()
    Start-Sleep -Seconds 2
    Get-Process WINWORD -ErrorAction SilentlyContinue | Stop-Process -Force
}

Get-ChildItem $OutDir -Filter *.png -ErrorAction SilentlyContinue | Remove-Item -Force

if ($Pages.Count -eq 0) { $Pages = 1..8 }

python -c @"
import pymupdf, os
d = pymupdf.open(r'$pdf')
print('pages', d.page_count)
want = sorted({p for p in [$($Pages -join ',')] if 1 <= p <= d.page_count})
for p in want:
    d[p-1].get_pixmap(dpi=95).save(os.path.join(r'$OutDir', f'page{p:02d}.png'))
print('rendered', want)
"@

Write-Output ("PDF: {0}  ({1} pages)" -f $pdf, $n)
