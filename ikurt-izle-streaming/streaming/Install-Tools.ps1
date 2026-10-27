param([switch]$SkipFFmpeg)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$tools = Join-Path $PSScriptRoot '.local\tools'
New-Item -ItemType Directory -Path $tools -Force | Out-Null
function Install-VerifiedZip($Name, $Url, $Hash, $Subfolder) {
  $destination = Join-Path $tools $Name
  $binary = Join-Path $destination $Subfolder
  if (Test-Path -LiteralPath $binary) { Write-Host "$Name zaten mevcut; degistirilmedi."; return }
  $archive = Join-Path $tools ($Name + '.zip')
  $download = @{ Uri=$Url; OutFile=$archive; UseBasicParsing=$true; TimeoutSec=180 }
  $proxy = $env:HTTPS_PROXY
  if (!$proxy) { $proxy = $env:HTTP_PROXY }
  if ($proxy) { $download.Proxy = $proxy }
  Invoke-WebRequest @download
  if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $Hash) { throw "$Name SHA256 dogrulanamadi. Arsiv acilmadi." }
  $extract = Join-Path $tools ($Name + '-verified')
  New-Item -ItemType Directory -Path $extract -Force | Out-Null
  Expand-Archive -LiteralPath $archive -DestinationPath $extract -Force
  $found = Get-ChildItem -LiteralPath $extract -Filter ([IO.Path]::GetFileName($binary)) -File -Recurse | Select-Object -First 1
  if (!$found) { throw "$Name programi arsivde yok." }
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  if ($Name -eq 'ffmpeg') { Copy-Item -LiteralPath $found.Directory.FullName -Destination (Join-Path $destination 'bin') -Recurse -Force }
  else { Copy-Item -LiteralPath $found.FullName -Destination $binary -Force }
  Write-Host "$Name hash dogrulamasi ve yerel kurulum tamam."
}
Install-VerifiedZip 'mediamtx' 'https://github.com/bluenviron/mediamtx/releases/download/v1.21.2/mediamtx_v1.21.2_windows_amd64.zip' 'a84224f5a490855684e62ba6fb71e80ea2a5e16aed61883bb58380290e93e467' 'mediamtx.exe'
if (!$SkipFFmpeg) { Install-VerifiedZip 'ffmpeg' 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba' 'bin\ffmpeg.exe' }
# Official sources: MediaMTX GitHub release digest; FFmpeg.org links to Gyan's Windows builds.
# No system installation, firewall change, administrator elevation, or port forwarding.
