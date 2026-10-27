$ErrorActionPreference = 'Stop'
$target = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '.local'))
if ($target -ne [IO.Path]::GetFullPath($PSScriptRoot + '\.local')) { throw 'Beklenmedik hedef' }
New-Item -ItemType Directory -Path $target -Force | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $target '/inheritance:r' '/grant:r' ($identity + ':(OI)(CI)F') 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Yerel gizli klasor izinleri ayarlanamadi.' }
Write-Host 'Yerel kimlik bilgileri klasoru yalniz mevcut Windows kullanicisi ve SYSTEM icin izinli.'
