#!/bin/bash
# Buffy Next — Android/Termux system info script
# Bash script for system detection on Android via Termux

echo "=== Android System Info ==="

# OS
echo "OS: Android $(getprop ro.build.version.release)"
echo "SDK: $(getprop ro.build.version.sdk)"
echo "Arch: $(getprop ro.product.cpu.abi)"
echo "Device: $(getprop ro.product.manufacturer) $(getprop ro.product.model)"

# CPU
echo "CPU: $(grep 'model name' /proc/cpuinfo 2>/dev/null | head -1 | cut -d: -f2 | xargs)"
echo "Cores: $(grep -c processor /proc/cpuinfo 2>/dev/null)"

# RAM
total=$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null)
avail=$(awk '/MemAvailable/ {print $2}' /proc/meminfo 2>/dev/null)
if [ -n "$total" ]; then
    totalGB=$(echo "scale=1; $total / 1048576" | bc 2>/dev/null || echo "?")
    availGB=$(echo "scale=1; $avail / 1048576" | bc 2>/dev/null || echo "?")
    echo "RAM: ${totalGB} GB total, ${availGB} GB available"
fi

# GPU
gpu=$(cat /sys/class/kgsl/kgsl-3d0/gpu_model 2>/dev/null || echo "")
if [ -z "$gpu" ]; then
    gpu=$(dumpsys SurfaceFlinger 2>/dev/null | grep -i GLES | head -1 || echo "Unknown")
fi
echo "GPU: $gpu"

# Storage
df -h /data 2>/dev/null | tail -1 | awk '{print "Storage: " $3 " used / " $2 " total (" $5 " used)"}'

# Temperature
temp=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null)
if [ -n "$temp" ]; then
    if [ "$temp" -gt 1000 ]; then
        temp=$((temp / 1000))
    fi
    echo "Temperature: ${temp}°C"
fi

# Privilege level
echo "User: $(whoami)"

echo "=== End ==="
