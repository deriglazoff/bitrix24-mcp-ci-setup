# expose-lan.ps1 — проброс WSL-портов MCP в локальную сеть.
# Запускать в PowerShell ОТ АДМИНИСТРАТОРА:
#   powershell -ExecutionPolicy Bypass -File C:\projects\bitrix24-mcp-bit2beat\deploy\expose-lan.ps1
# Повторно прогонять после перезагрузки WSL (IP WSL меняется).
#Requires -RunAsAdministrator

$ports = @(5013, 5014)   # 5013=test, 5014=prod

$wslIp = (wsl hostname -I).Trim().Split(" ")[0]
if (-not $wslIp) { Write-Error "Не удалось получить WSL IP. WSL запущен?"; exit 1 }
Write-Host "WSL IP: $wslIp"

foreach ($p in $ports) {
  netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$p 2>$null | Out-Null
  netsh interface portproxy add    v4tov4 listenaddress=0.0.0.0 listenport=$p connectaddress=$wslIp connectport=$p
  if (-not (Get-NetFirewallRule -DisplayName "WSL MCP $p" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "WSL MCP $p" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $p | Out-Null
  }
  Write-Host "  port $p -> $wslIp`:$p  (portproxy + firewall ok)"
}

Write-Host "`n--- active portproxy ---"
netsh interface portproxy show v4tov4

$lan = (Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
if (-not $lan) { $lan = "192.168.103.95" }
Write-Host "`nURL для других агентов:"
Write-Host "  PROD SSE:        http://$lan`:5014/sse"
Write-Host "  PROD streamable: http://$lan`:5014/mcp"
Write-Host "  TEST SSE:        http://$lan`:5013/sse"
