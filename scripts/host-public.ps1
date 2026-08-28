<#
    ANPR Traffic Intelligence - publish a public HTTPS link

    Starts the backend, then opens a Cloudflare Tunnel to it and prints the
    public URL. Anyone on the internet can open that URL; no port forwarding,
    router config, or TLS certificate needed.

    Because that URL is genuinely public, the script hardens the deployment
    before exposing it: it generates a random write key (so a stranger who finds
    the link can watch the demo but cannot resolve violations) and hides the
    OpenAPI docs that would otherwise advertise the write endpoint.

    Usage (from anywhere):
        powershell -ExecutionPolicy Bypass -File scripts\host-public.ps1

        -ReadOnly     refuse every write, whatever key is presented
        -ApiKey <k>   use a specific write key instead of a generated one
        -OpenWrites   no key at all (only sensible with -LocalOnly)
        -ShowDocs     serve /docs and /openapi.json publicly

    Press Ctrl+C once to shut down both the tunnel and the server.
#>

[CmdletBinding()]
param(
    # Local port the backend listens on.
    [int]$Port = 8000,

    # Skip the tunnel and just serve locally on the LAN.
    [switch]$LocalOnly,

    # Reject every mutation, regardless of credentials.
    [switch]$ReadOnly,

    # Write key to require. Empty means "generate one" unless -OpenWrites.
    [string]$ApiKey = '',

    # Leave the resolve endpoint unauthenticated. Use only on a trusted network.
    [switch]$OpenWrites,

    # Expose /docs, /redoc and /openapi.json.
    [switch]$ShowDocs
)

$ErrorActionPreference = 'Stop'

$RepoRoot  = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot 'backend'

if (-not (Test-Path (Join-Path $BackendDir 'api\main.py'))) {
    throw "Could not find backend\api\main.py under '$RepoRoot'. Run this script from inside the repo."
}

# ---------------------------------------------------------------- python ----
# Prefer the project virtual environment; fall back to whatever `python` is on
# PATH. Using the venv's python.exe directly avoids needing to Activate first.
$VenvPython = Join-Path $BackendDir '.venv\Scripts\python.exe'
if (Test-Path $VenvPython) {
    $Python = $VenvPython
    Write-Host "[ok]   Using virtual environment: backend\.venv" -ForegroundColor Green
} else {
    $Python = 'python'
    Write-Host "[warn] No backend\.venv found - using the system python." -ForegroundColor Yellow
}

# Verify uvicorn is importable before we bother starting a tunnel.
# Native commands that write to stderr can raise a terminating NativeCommandError
# while $ErrorActionPreference is 'Stop', so relax it just for this probe and
# read the exit code instead.
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $Python -c "import uvicorn" *> $null
$hasUvicorn = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $prevEAP

if (-not $hasUvicorn) {
    Write-Host ""
    Write-Host "uvicorn is not installed for this interpreter." -ForegroundColor Red
    Write-Host "Install the dependencies first:" -ForegroundColor Red
    Write-Host "    cd $BackendDir"
    Write-Host "    python -m venv .venv"
    Write-Host "    .venv\Scripts\Activate.ps1"
    Write-Host "    pip install -r requirements.txt"
    exit 1
}

# ----------------------------------------------------------- cloudflared ----
$Cloudflared = $null
if (-not $LocalOnly) {
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd) {
        $Cloudflared = $cmd.Source
        Write-Host "[ok]   cloudflared found" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "cloudflared is not installed - it creates the public HTTPS link." -ForegroundColor Yellow
        Write-Host "Install it with either:" -ForegroundColor Yellow
        Write-Host "    winget install --id Cloudflare.cloudflared"
        Write-Host "    choco install cloudflared"
        Write-Host ""
        Write-Host "Then re-run this script. To serve on your LAN only, use:" -ForegroundColor Yellow
        Write-Host "    powershell -ExecutionPolicy Bypass -File scripts\host-public.ps1 -LocalOnly"
        exit 1
    }
}

# ------------------------------------------------------------- posture -----
# Child processes inherit this session's environment, so setting these here is
# how the backend is configured. Nothing is written to .env - the hardening
# lasts exactly as long as this script does.
if ($ReadOnly) {
    $env:ANPR_READ_ONLY = '1'
    $env:ANPR_API_KEY   = ''
    $writeKey = ''
}
elseif ($OpenWrites) {
    $env:ANPR_READ_ONLY = '0'
    $env:ANPR_API_KEY   = ''
    $writeKey = ''
}
else {
    $env:ANPR_READ_ONLY = '0'
    if ($ApiKey) {
        $writeKey = $ApiKey
    } else {
        # 24 random bytes, url-safe: enough that it cannot be guessed during a demo.
        $writeKey = & $Python -c "import secrets;print(secrets.token_urlsafe(24))"
        if ($LASTEXITCODE -ne 0 -or -not $writeKey) {
            throw "Could not generate a write key. Pass one explicitly with -ApiKey."
        }
        $writeKey = $writeKey.Trim()
    }
    $env:ANPR_API_KEY = $writeKey
}

# A public URL should not publish a schema describing how to write to it.
if ($ShowDocs) { $env:ENABLE_DOCS = '1' }
elseif (-not $LocalOnly) { $env:ENABLE_DOCS = '0' }

Write-Host ""
Write-Host "Security posture for this run:" -ForegroundColor Cyan
if ($ReadOnly) {
    Write-Host "    writes    : disabled entirely (-ReadOnly)" -ForegroundColor Green
} elseif ($writeKey) {
    Write-Host "    writes    : require an X-API-Key header" -ForegroundColor Green
    Write-Host "    write key : $writeKey" -ForegroundColor Yellow
    Write-Host "                Paste this into the dashboard when it asks, to resolve" -ForegroundColor DarkGray
    Write-Host "                violations. Anyone without it can only look." -ForegroundColor DarkGray
} else {
    Write-Host "    writes    : OPEN - anyone with the link can resolve violations" -ForegroundColor Red
    if (-not $LocalOnly) {
        Write-Host "                Re-run without -OpenWrites before sharing this link." -ForegroundColor Red
    }
}
Write-Host "    docs      : $(if ($env:ENABLE_DOCS -eq '0') { 'hidden' } else { 'served at /docs' })" -ForegroundColor DarkGray
Write-Host "    rate limit: on (240 req/min per IP; 30/min for exports)" -ForegroundColor DarkGray

# --------------------------------------------------------------- backend ----
# One worker only: the TrafficSimulator is an in-process singleton, so a second
# worker would run a second simulation and double every detection + violation.
# --reload is deliberately omitted; it restarts the app and resets sim state.
$bindHost = if ($LocalOnly) { '0.0.0.0' } else { '127.0.0.1' }

$uvicornArgs = @(
    '-m', 'uvicorn', 'api.main:app',
    '--host', $bindHost,
    '--port', "$Port",
    '--workers', '1',
    '--proxy-headers',                  # trust X-Forwarded-* from the tunnel
    '--forwarded-allow-ips', '*'
)

Write-Host ""
Write-Host "Starting the ANPR backend on ${bindHost}:${Port} ..." -ForegroundColor Cyan

$server = Start-Process -FilePath $Python -ArgumentList $uvicornArgs `
                        -WorkingDirectory $BackendDir -PassThru -NoNewWindow

$tunnel = $null
try {
    # Give uvicorn a moment, then confirm it actually came up.
    $ready = $false
    foreach ($attempt in 1..20) {
        Start-Sleep -Milliseconds 500
        if ($server.HasExited) { throw "The backend exited during startup (code $($server.ExitCode))." }
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2 -UseBasicParsing
            if ($r.StatusCode -eq 200) { $ready = $true; break }
        } catch { }   # not listening yet
    }
    if (-not $ready) { throw "The backend did not answer /health on port $Port within 10s." }

    Write-Host "[ok]   Backend healthy at http://127.0.0.1:$Port" -ForegroundColor Green

    if ($LocalOnly) {
        # Show the LAN addresses others on this wifi can reach.
        Write-Host ""
        Write-Host "Serving on your local network:" -ForegroundColor Cyan
        Get-NetIPAddress -AddressFamily IPv4 |
            Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
            ForEach-Object { Write-Host "    http://$($_.IPAddress):$Port" -ForegroundColor White }
        Write-Host ""
        Write-Host "If it is unreachable from another device, allow the port once (as admin):" -ForegroundColor Yellow
        Write-Host "    New-NetFirewallRule -DisplayName 'ANPR $Port' -Direction Inbound -LocalPort $Port -Protocol TCP -Action Allow"
        Write-Host ""
        Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
        Wait-Process -Id $server.Id
    }
    else {
        Write-Host ""
        Write-Host "Opening the Cloudflare Tunnel ..." -ForegroundColor Cyan
        Write-Host "Watch for the https://<name>.trycloudflare.com URL below - that is your public link." -ForegroundColor DarkGray
        Write-Host "WebSockets are proxied automatically, so the live feed works over it." -ForegroundColor DarkGray
        if ($writeKey) {
            Write-Host ""
            Write-Host "Reminder - the write key for this session is: $writeKey" -ForegroundColor Yellow
        }
        Write-Host ""

        # Runs in the foreground and streams its own output, including the URL.
        $tunnel = Start-Process -FilePath $Cloudflared `
                                -ArgumentList @('tunnel', '--no-autoupdate', '--url', "http://localhost:$Port") `
                                -PassThru -NoNewWindow
        Wait-Process -Id $tunnel.Id
    }
}
finally {
    Write-Host ""
    Write-Host "Shutting down ..." -ForegroundColor DarkGray
    foreach ($p in @($tunnel, $server)) {
        if ($p -and -not $p.HasExited) {
            try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch { }
        }
    }
    Write-Host "Stopped." -ForegroundColor DarkGray
}
