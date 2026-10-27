param([string]$RepoPath='C:\Users\tarii\ikurt-projects\ikurt-izle')
$ErrorActionPreference='Stop'
$repo=(Resolve-Path -LiteralPath $RepoPath).Path.TrimEnd('\')
if((Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).name -ne 'ikurt-izle'){throw 'Hedef ikurt-izle reposu degil.'}
$manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
function TargetPath($Relative){
  $target=[IO.Path]::GetFullPath((Join-Path $repo $Relative))
  if(![string]::IsNullOrEmpty($Relative) -and $target.StartsWith($repo+'\',[StringComparison]::OrdinalIgnoreCase)){return $target}
  throw 'Repo disinda dosya yolu reddedildi.'
}
foreach($entry in $manifest){
  $target=TargetPath $entry.path
  $incoming=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot $entry.path))
  if(!$incoming.StartsWith($PSScriptRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Gecersiz paket yolu.'}
  if((Get-FileHash -LiteralPath $incoming -Algorithm SHA256).Hash -ne $entry.updatedHash){throw "Paket dosyasi farkli: $($entry.path)"}
  if(Test-Path -LiteralPath $target){
    $hash=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    if($hash -ne $entry.originalHash -and $hash -ne $entry.updatedHash){throw "Dosya degismis; hicbir dosyanin uzerine yazilmadi: $($entry.path)"}
  }elseif($entry.originalHash){throw "Beklenen dosya yok: $($entry.path)"}
}
$backup=Join-Path $repo ('streaming-code-backups\'+[DateTime]::Now.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
foreach($entry in $manifest){
  $target=TargetPath $entry.path
  if(Test-Path -LiteralPath $target){
    $save=Join-Path $backup $entry.path
    New-Item -ItemType Directory -Path (Split-Path $save) -Force | Out-Null
    Copy-Item -LiteralPath $target -Destination $save
  }
}
foreach($entry in $manifest){
  $target=TargetPath $entry.path
  New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $entry.path) -Destination $target -Force
}
Write-Host "Yayin altyapisi kaynak dosyalari uygulandi. Yedek: $backup"
Write-Host 'DEPLOY, D1/KV degisikligi, QR uretimi ve gercek kamera baglantisi YAPILMADI.'
Write-Host 'Yerel sentetik test icin docs/streaming-setup.md dosyasindaki sirayi izleyin.'
