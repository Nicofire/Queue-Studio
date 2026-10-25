# Beendet die Dev-Server anhand ihrer Ports - unabhaengig davon, wie sie gestartet wurden.
# 5173 = Vite dev server, 7860 = Automatic1111 WebUI
param(
    [int[]]$Ports = @(5173, 7860)
)

$ids = Get-NetTCPConnection -LocalPort $Ports -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

if (-not $ids) {
    Write-Host "Nothing to stop (ports $($Ports -join ', ') are free)."
    return
}

foreach ($procId in $ids) {
    $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
    Write-Host "Stopping PID $procId ($name)"
    # taskkill /T beendet auch die Kindprozesse (npm -> node, launch.py -> python)
    taskkill /PID $procId /T /F | Out-Null
}
