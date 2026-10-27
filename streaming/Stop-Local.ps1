$ErrorActionPreference = 'Stop'
$state = Join-Path $PSScriptRoot '.local\processes.json'
if (!(Test-Path -LiteralPath $state)) { Write-Host 'Kayitli yerel surec yok.'; exit }
$items = Get-Content -LiteralPath $state -Raw | ConvertFrom-Json
foreach ($item in $items) {
  $process = Get-Process -Id $item.id -ErrorAction SilentlyContinue
  if ($process -and $process.Path -eq $item.executable -and $process.StartTime.ToUniversalTime().Ticks -eq $item.started) {
    & taskkill.exe /PID $item.id /T /F | Out-Null
  }
}
Remove-Item -LiteralPath $state
Write-Host 'Bu kurulumun baslattigi yerel surecler durduruldu.'
