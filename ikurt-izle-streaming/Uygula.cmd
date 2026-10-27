@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply-Streaming.ps1"
if errorlevel 1 (
  echo Islem tamamlanamadi. Yukaridaki hata metnini paylasin.
) else (
  echo Kod uygulandi. Canli sistem veya gercek kamera degistirilmedi.
)
pause
