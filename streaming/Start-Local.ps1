$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ((Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).name -ne 'ikurt-izle') { throw 'ikurt-izle proje kokunde calistirin.' }
$nodeVersion = & node --version
if ($LASTEXITCODE -ne 0 -or [int](($nodeVersion -replace '^v','').Split('.')[0]) -lt 24) { throw 'Yerel test icin Node.js 24 veya ustu gerekli.' }
$state = Join-Path $PSScriptRoot '.local\processes.json'
if (Test-Path -LiteralPath $state) { throw 'Once Stop-Local.ps1 calistirin. Mevcut yerel sureclerin uzerine yazilmadi.' }
& (Join-Path $PSScriptRoot 'Protect-Local.ps1')
$previousLogPath = $env:WRANGLER_LOG_PATH
$previousCachePath = $env:WRANGLER_CACHE_DIR
$env:WRANGLER_LOG_PATH = Join-Path $PSScriptRoot '.local\wrangler-logs'
$env:WRANGLER_CACHE_DIR = Join-Path $PSScriptRoot '.local\wrangler-cache'
Push-Location $repo
try {
  & node (Join-Path $PSScriptRoot 'init-local.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Yerel anahtarlar hazirlanamadi' }
  & (Join-Path $PSScriptRoot 'Install-Tools.ps1')
  & npm install --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Bagimlilik kurulumu basarisiz' }
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Build basarisiz' }
  $node = (Get-Command node.exe).Source
  $items = @()
  foreach ($script in @('gateway.mjs','start-mediamtx.mjs','local-app.mjs','publish-synthetic.mjs')) {
    $path = Join-Path $PSScriptRoot $script
    $process = Start-Process -FilePath $node -ArgumentList ('"' + $path + '"') -WorkingDirectory $repo -WindowStyle Hidden -PassThru
    $items += [pscustomobject]@{ id=$process.Id; started=$process.StartTime.ToUniversalTime().Ticks; executable=$node }
    $items | ConvertTo-Json | Set-Content -LiteralPath $state -Encoding UTF8
    Start-Sleep -Milliseconds 700
  }
  foreach ($item in $items) { if (!(Get-Process -Id $item.id -ErrorAction SilentlyContinue)) { throw 'Bir yerel servis baslatilamadi. Stop-Local.ps1 ile temizleyip portlari kontrol edin.' } }
  foreach ($port in @(8554,8888,9080,5173)) {
    $tcp = New-Object Net.Sockets.TcpClient
    try { $tcp.Connect('127.0.0.1',$port) } finally { $tcp.Dispose() }
  }
  $check = Invoke-WebRequest -Uri 'http://localhost:5173/api/public/access/local-synthetic' -UseBasicParsing -TimeoutSec 10
  if (($check.Content | ConvertFrom-Json).access.camera_id -ne 'cam_synthetic') { throw 'Beklenen sentetik test servisi dogrulanamadi.' }
  Write-Host 'Yalniz sentetik test hazir: http://localhost:5173/c/local-synthetic'
  Write-Host 'Gercek kamera, uzak D1, KV veya deploy kullanilmadi. Durdurmak icin Stop-Local.ps1.'
  Write-Host 'Bu pencereyi acik birakin. Ikinci PowerShell penceresinden test/durdurma komutlarini calistirin.'
  while (Test-Path -LiteralPath $state) {
    foreach ($item in $items) { if (!(Get-Process -Id $item.id -ErrorAction SilentlyContinue)) { throw 'Yerel servis durdu. Yapilandirma ve portlari kontrol edin.' } }
    Start-Sleep -Milliseconds 500
  }
} finally {
  if (Test-Path -LiteralPath $state) { & (Join-Path $PSScriptRoot 'Stop-Local.ps1') }
  Pop-Location; $env:WRANGLER_LOG_PATH = $previousLogPath; $env:WRANGLER_CACHE_DIR = $previousCachePath
}
