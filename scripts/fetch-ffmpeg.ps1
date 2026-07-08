#Requires -Version 5.1
<#
.SYNOPSIS
  Fetch a static ffmpeg build into src-tauri\binaries\ as a Tauri sidecar named
  ffmpeg-<target-triple>.exe. Windows counterpart of scripts/fetch-ffmpeg.sh
  (which handles macOS). Static build from gyan.dev. Run before `tauri build`;
  the binaries are gitignored.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\fetch-ffmpeg.ps1
#>
param(
  # Rust target triple; the produced file is ffmpeg-<Triple>.exe.
  [string]$Triple = "x86_64-pc-windows-msvc"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $root "src-tauri\binaries"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("ffmpeg-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

try {
  $zip = Join-Path $tmp "ffmpeg.zip"
  $url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

  Write-Host "-> Windows ($Triple)"
  Write-Host "   downloading $url"
  # TLS 1.2 for older PowerShell hosts; Invoke-WebRequest handles redirects.
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

  Write-Host "   extracting..."
  Expand-Archive -Path $zip -DestinationPath $tmp -Force

  # The archive nests ffmpeg.exe under ffmpeg-<version>-essentials_build\bin\.
  $exe = Get-ChildItem -Path $tmp -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
  if (-not $exe) { throw "ffmpeg.exe not found in the downloaded archive" }

  $dest = Join-Path $binDir ("ffmpeg-" + $Triple + ".exe")
  Copy-Item -Path $exe.FullName -Destination $dest -Force
  Write-Host "Done. Binary at $dest"
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
