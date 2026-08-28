<#
    ANPR Traffic Intelligence - bundle front-end libraries for offline use

    Downloads Leaflet and Chart.js into backend\static\vendor\ so the dashboard
    renders with no external network calls at all. Run this once, while you have
    internet, before demoing on a network you do not control.

    The dashboard prefers these local copies and only falls back to a CDN when
    they are absent, so vendoring is purely additive - nothing to switch on.

    Usage:
        powershell -ExecutionPolicy Bypass -File scripts\vendor-assets.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$RepoRoot  = Split-Path -Parent $PSScriptRoot
$VendorDir = Join-Path $RepoRoot 'backend\static\vendor'

# Filenames must match the paths the dashboard looks for:
#   /vendor/leaflet.css, /vendor/leaflet.js, /vendor/chart.umd.min.js
$Assets = @(
    @{ Name = 'leaflet.css'        ; Url = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css' }
    @{ Name = 'leaflet.js'         ; Url = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js' }
    @{ Name = 'chart.umd.min.js'   ; Url = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js' }
)

# Leaflet loads marker/shadow images relative to its own stylesheet.
$Images = @(
    'marker-icon.png', 'marker-icon-2x.png', 'marker-shadow.png', 'layers.png', 'layers-2x.png'
)

New-Item -ItemType Directory -Force -Path $VendorDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $VendorDir 'images') | Out-Null

Write-Host "Vendoring dashboard assets into backend\static\vendor ..." -ForegroundColor Cyan
Write-Host ""

$failed = 0

foreach ($a in $Assets) {
    $dest = Join-Path $VendorDir $a.Name
    try {
        Invoke-WebRequest -Uri $a.Url -OutFile $dest -UseBasicParsing -TimeoutSec 30
        $kb = [math]::Round((Get-Item $dest).Length / 1KB, 1)
        Write-Host ("  [ok]   {0,-22} {1} KB" -f $a.Name, $kb) -ForegroundColor Green
    } catch {
        Write-Host ("  [fail] {0,-22} {1}" -f $a.Name, $_.Exception.Message) -ForegroundColor Red
        $failed++
    }
}

foreach ($img in $Images) {
    $dest = Join-Path $VendorDir "images\$img"
    try {
        Invoke-WebRequest -Uri "https://unpkg.com/leaflet@1.9.4/dist/images/$img" `
                          -OutFile $dest -UseBasicParsing -TimeoutSec 30
        Write-Host ("  [ok]   images/{0}" -f $img) -ForegroundColor DarkGreen
    } catch {
        Write-Host ("  [warn] images/{0} - markers may not render" -f $img) -ForegroundColor Yellow
    }
}

Write-Host ""
if ($failed -gt 0) {
    Write-Host "$failed core file(s) failed. Check your connection and re-run." -ForegroundColor Red
    exit 1
}

Write-Host "Done. The dashboard now loads its map and charts locally." -ForegroundColor Green
Write-Host "Hard-refresh the browser (Ctrl+Shift+R) to pick them up." -ForegroundColor DarkGray
