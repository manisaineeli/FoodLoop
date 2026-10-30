# Fill in the page-number column of the table of contents, and write page
# numbers into the List of Figures / List of Tables, using Word itself so the
# numbers are correct rather than estimated.
#
#   powershell -ExecutionPolicy Bypass -File docgen/fill_page_numbers.ps1
#
param(
    [string]$DocPath = "C:\Users\ganes\OneDrive\Desktop\UML\FoodLoop_OOAD_Project_Report.docx",
    [string]$Map = "C:\Users\ganes\OneDrive\Desktop\UML\docgen\toc_map.json"
)

$ErrorActionPreference = "Stop"
$m = Get-Content $Map -Raw | ConvertFrom-Json
$tocIndex = $m.toc_table

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $null

function Save-Doc {
    # Word occasionally leaves a stale lock after a scripted save; retry once
    # after forcing the fields to settle.
    for ($try = 1; $try -le 3; $try++) {
        try { $doc.Save(); return $true }
        catch { Write-Output ("  save attempt {0} failed: {1}" -f $try, $_.Exception.Message); Start-Sleep -Seconds 2 }
    }
    return $false
}

function ConvertTo-Roman([int]$n) {
    if ($n -le 0) { return [string]$n }
    $map = @(@(1000,'m'), @(900,'cm'), @(500,'d'), @(400,'cd'), @(100,'c'), @(90,'xc'),
             @(50,'l'), @(40,'xl'), @(10,'x'), @(9,'ix'), @(5,'v'), @(4,'iv'), @(1,'i'))
    $out = ""
    foreach ($pair in $map) {
        while ($n -ge $pair[0]) { $out += $pair[1]; $n -= $pair[0] }
    }
    return $out
}

try {
    $doc = $word.Documents.Open($DocPath, $false, $false)

    # Word paginates lazily, so force a full layout pass first.
    $doc.Repaginate()

    # ---- 1. resolve every bookmark to its printed page number
    # wdActiveEndAdjustedPageNumber reports the number as printed, so the front
    # matter comes back already formatted as a roman numeral.
    $pages = @{}
    foreach ($bm in $doc.Bookmarks) {
        $pages[$bm.Name] = [string]$bm.Range.Information(1)
    }
    Write-Output ("resolved {0} bookmarks" -f $pages.Count)

    # Word reports the adjusted number as an integer even when the section is
    # numbered in roman, so the front matter is converted here.
    $frontStyle = $doc.Sections.Item(1).PageSetup.PageNumbers.NumberStyle
    if ($frontStyle -eq 2) {          # wdPageNumberStyleLowercaseRoman
        $frontPages = $doc.Sections.Item(1).Range.ComputeStatistics(2)
        Write-Output ("front matter is {0} pages, numbered in roman" -f $frontPages)
    }

    # ---- 2. write the numbers into the contents table
    $toc = $doc.Tables.Item($tocIndex + 1)          # COM tables are 1-based
    $filled = 0
    $skipped = 0
    foreach ($row in $m.rows) {
        $name = $row.bookmark
        if (-not $pages.ContainsKey($name)) {
            $skipped++
            continue
        }
        $value = [string]$pages[$name]
        # the front-matter bookmarks sit in the roman-numbered section
        if ($name.StartsWith("FL_FM_") -and $value -match '^\d+$') {
            $value = ConvertTo-Roman ([int]$value)
        }
        $cell = $toc.Cell($row.row + 1, $toc.Rows.Item($row.row + 1).Cells.Count)
        $cell.Range.Text = $value
        $cell.Range.ParagraphFormat.Alignment = 1     # centre
        # match the template's contents table: Times New Roman 12 pt, not bold
        $cell.Range.Font.Name = "Times New Roman"
        $cell.Range.Font.Size = 12
        $cell.Range.Font.Bold = $false
        $filled++
    }
    Write-Output ("filled {0} of {1} contents rows ({2} bookmarks unresolved)" -f $filled, $m.rows.Count, $skipped)

    # ---- 3. locate every figure / table caption so the lists can be numbered
    $captionPage = @{}
    foreach ($p in $doc.Paragraphs) {
        $t = ($p.Range.Text -replace "[^\x20-\x7E]", " ").Trim()
        if ($t -match '^(Figure|Table)\s+(\d+\.\d+)\s') {
            # the key keeps the word, because "1.1" is both a figure and a table label
            $key = "$($Matches[1]) $($Matches[2])"
            if (-not $captionPage.ContainsKey($key)) {
                $captionPage[$key] = $p.Range.Information(1)
            }
        }
    }
    Write-Output ("located {0} figure/table captions" -f $captionPage.Count)

    # ---- 4. the List of Figures / List of Tables, located by the index the
    # build step recorded rather than by counting tables from the contents one
    $listTables = @(
        @{ Name = "Figure"; Index = $m.lof_table + 1 },
        @{ Name = "Table";  Index = $m.lot_table + 1 }
    )
    foreach ($entry in $listTables) {
        $t = $doc.Tables.Item($entry.Index)
        $hits = 0
        $missed = @()
        for ($r = 2; $r -le $t.Rows.Count; $r++) {
            $label = ($t.Cell($r, 1).Range.Text -replace "[^\x20-\x7E]", "").Trim()
            $key = "$($entry.Name) $label"
            if ($captionPage.ContainsKey($key)) {
                $cell = $t.Cell($r, 3)
                $cell.Range.Text = [string]$captionPage[$key]
                $cell.Range.ParagraphFormat.Alignment = 1
                $cell.Range.Font.Size = 9.5
                $hits++
            } else {
                $missed += $label
            }
        }
        Write-Output ("filled list of {0}s: {1} of {2} rows" -f `
            $entry.Name.ToLower(), $hits, ($t.Rows.Count - 1))
        if ($missed.Count) {
            Write-Output ("  unmatched labels: {0}" -f ($missed -join ", "))
        }
    }

    # ---- 5. refresh the PAGE fields in the footers, then save
    # Only the footers are updated: a whole-document Fields.Update() on a file
    # this size is slow enough to make Word give up.
    foreach ($section in $doc.Sections) {
        foreach ($f in $section.Footers) {
            if ($f.Exists) { $f.Range.Fields.Update() | Out-Null }
        }
    }
    $doc.Repaginate()
    Write-Output ("total pages: {0}" -f $doc.ComputeStatistics(2))

    if (-not (Save-Doc)) { throw "could not save $DocPath" }
    $doc.Close($false)
    $doc = $null
    Write-Output "saved"
}
finally {
    if ($doc) { try { $doc.Close($false) } catch { } }
    try { $word.Quit() } catch { }
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    Get-Process WINWORD -ErrorAction SilentlyContinue | Stop-Process -Force
}
