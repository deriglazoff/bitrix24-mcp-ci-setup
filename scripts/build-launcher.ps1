# Собирает Bitrix24-MCP.exe в корне репозитория встроенным csc.exe.
# Запуск: powershell -ExecutionPolicy Bypass -File scripts/build-launcher.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $PSScriptRoot "launcher\Program.cs"
$out = Join-Path $root "Bitrix24-MCP.exe"
$csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
  $csc = Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
if (-not (Test-Path $csc)) {
  Write-Error "Не найден csc.exe (.NET Framework 4). Установите .NET Framework Developer Pack."
  exit 1
}
& $csc /nologo /t:exe /out:$out /utf8output /codepage:65001 $src
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "OK $out"
