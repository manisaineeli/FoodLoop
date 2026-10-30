# Regenerate the whole FoodLoop OOAD report from scratch.
#
#   powershell -ExecutionPolicy Bypass -File docgen/make.ps1
#
# Steps:
#   1. draw the diagrams the project did not already have
#   2. capture the app screenshots from the running server
#   3. build the docx from the university template
#   4. let Word fill in the real page numbers
#   5. render a PDF preview
#
param(
    [switch]$SkipDiagrams,
    [switch]$SkipScreenshots,
    [switch]$SkipPreview
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($n) { Write-Output "`n=== $n ===" }

if (-not $SkipDiagrams) {
    Step "1. diagrams"
    python docgen\generate_diagrams.py
}

if (-not $SkipScreenshots) {
    Step "2. screenshots"
    $api = "http://127.0.0.1:5000/api/health"
    $up = $false
    try { $null = Invoke-RestMethod -Uri $api -TimeoutSec 3; $up = $true } catch { }
    if (-not $up) {
        Write-Output "  API not responding - start it with start.cmd, then re-run"
        Write-Output "  (skipped: the report already contains the previous captures)"
    } else {
        node docgen\capture-screenshots.mjs
        Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep -Seconds 2
        Remove-Item -Recurse -Force "$root\docgen\.chrome-profile" -ErrorAction SilentlyContinue
    }
}

Step "3. build the document"
python docgen\build_report.py

Step "4. page numbers"
Get-Process WINWORD -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
powershell -ExecutionPolicy Bypass -File docgen\fill_page_numbers.ps1
Get-Process WINWORD -ErrorAction SilentlyContinue | Stop-Process -Force

if (-not $SkipPreview) {
    Step "5. preview"
    powershell -ExecutionPolicy Bypass -File docgen\preview.ps1
}

Write-Output "`nDone: $root\FoodLoop_OOAD_Project_Report.docx"
