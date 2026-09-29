param([Parameter(Mandatory=$true)][string]$DraftDirectory, [switch]$IncludeRoadmap)
$ErrorActionPreference = 'Stop'
$bankDirectory = Join-Path $PSScriptRoot '../server/internal/translationgame/phrases'
$levels = @('A1','A2','B1','B2','C1','C2')
$planned = @()
$allSeen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($direction in @('sr-ru','ru-sr')) {
    foreach ($level in $levels) {
        $path = Join-Path $bankDirectory "$direction/$level.txt"
        $old = @([IO.File]::ReadAllLines($path) | Where-Object { $_.Trim() -ne '' })
        foreach ($line in $old) { if (-not $allSeen.Add($line.Trim())) { throw "Existing duplicate: $line" } }
    }
}
$added = 0
foreach ($direction in @('sr-ru','ru-sr')) {
    foreach ($level in $levels) {
        $draftPath = Join-Path $DraftDirectory "$direction/$level.json"
        $candidates = @()
        if (Test-Path -LiteralPath $draftPath) {
            $draft = Get-Content -LiteralPath $draftPath -Raw -Encoding utf8 | ConvertFrom-Json
            $candidates += @($draft.sentences)
        }
        if ($IncludeRoadmap) {
            $examples = Import-Csv -LiteralPath (Join-Path $PSScriptRoot "data/roadmap_examples_$($level.ToLower()).tsv") -Delimiter "`t" -Encoding utf8
            # Different source rows, never two sides of the same example.
            for ($i=0; $i -lt $examples.Count; $i++) {
                if ($direction -eq 'sr-ru' -and $i%2 -eq 0) { $candidates += $examples[$i].example.Replace('*','') }
                if ($direction -eq 'ru-sr' -and $i%2 -eq 1) { $candidates += $examples[$i].translation.Replace('*','') }
            }
        }
        $path = Join-Path $bankDirectory "$direction/$level.txt"
        $old = @([IO.File]::ReadAllLines($path) | Where-Object { $_.Trim() -ne '' })
        $fresh = @()
        foreach ($line in $candidates) {
            $line = $line.Trim()
            if ($line.Length -lt 6 -or $line.Length -gt 550 -or $line -match '[\r\n]|___|^\d+[.)]') { throw "Invalid phrase in $direction/$level" }
            if ($direction -eq 'sr-ru' -and ($line -match '[А-Яа-яЁё]' -or $line -notmatch '[A-Za-z]')) { throw "Wrong Serbian script: $line" }
            if ($direction -eq 'ru-sr' -and $line -notmatch '[А-Яа-яЁё]') { throw "Wrong Russian script: $line" }
            if ($allSeen.Add($line)) { $fresh += $line }
        }
        if ($fresh.Count -lt 30) { throw "Too few new phrases in $direction/$level`: $($fresh.Count)" }
        $added += $fresh.Count
        $planned += [PSCustomObject]@{ Path=$path; Lines=@($old)+@($fresh); Direction=$direction; Level=$level; New=$fresh.Count }
    }
}
if ($added -lt 1000) { throw "Only $added new phrases; no bank was changed." }
# Bulk mechanical import of validated generated text, retaining original line IDs.
foreach ($entry in $planned) {
    [IO.File]::WriteAllText($entry.Path, ($entry.Lines -join "`n")+"`n", [Text.UTF8Encoding]::new($false))
    Write-Output "$($entry.Direction)/$($entry.Level): +$($entry.New), total $($entry.Lines.Count)"
}
Write-Output "Added $added phrases; total $($added + 180)."
