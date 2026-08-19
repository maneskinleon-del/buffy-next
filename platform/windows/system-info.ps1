# Buffy Next — Windows system info script
# PowerShell script for system detection
# Called by WindowsAdapter internally

# OS Info
$os = Get-CimInstance Win32_OperatingSystem
Write-Host "OS: $($os.Caption)"
Write-Host "Version: $($os.Version) (build $($os.BuildNumber))"
Write-Host "Arch: $env:PROCESSOR_ARCHITECTURE"

# CPU
$cpu = Get-CimInstance Win32_Processor
Write-Host "CPU: $($cpu.Name) ($($cpu.NumberOfCores) cores)"

# RAM
$totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$freeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
Write-Host "RAM: ${totalGB} GB total, ${freeGB} GB available"

# GPU
$gpu = Get-CimInstance Win32_VideoController
Write-Host "GPU: $($gpu.Name) (driver: $($gpu.DriverVersion))"

# Storage
Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 } | ForEach-Object {
    $free = [math]::Round($_.FreeSpace / 1GB, 1)
    $total = [math]::Round($_.Size / 1GB, 1)
    Write-Host "Disk $($_.DeviceID): $free GB free / $total GB total"
}

# Temperature (if available)
try {
    $temp = Get-CimInstance MSAcpi_ThermalZoneTemperature -ErrorAction Stop | Select-Object -First 1
    $celsius = [math]::Round(($temp.CurrentTemperature - 2732) / 10, 1)
    Write-Host "Temperature: ${celsius}°C"
} catch {
    Write-Host "Temperature: not available"
}
