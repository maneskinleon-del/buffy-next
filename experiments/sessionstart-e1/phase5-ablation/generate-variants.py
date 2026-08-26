#!/usr/bin/env python3
"""Generate Buffy context variants with one field removed for ablation study."""

import json
import sys
from pathlib import Path

# Full Buffy context (baseline)
FULL_CONTEXT = {
    "schema": "buffy.context/v1",
    "platform": {
        "os": "linux",
        "os_name": "EndeavourOS",
        "kernel": "6.18.45-2-lts",
        "architecture": "x86_64"
    },
    "hardware": {
        "cpu": "AMD Ryzen 5 3400G with Radeon Vega Graphics",
        "cpu_cores": 8,
        "ram_gb": 13.6,
        "ram_available_gb": 7.0,
        "gpu": "AMD/ATI Picasso/Raven 2 [Radeon Vega Series]",
        "gpu_driver": "amdgpu",
        "gpu_is_generic": False,
        "storage": [{"mount": "/", "total_gb": 217, "free_gb": 88.3, "used_percent": 58}],
        "temperature_c": 43
    },
    "environment": {
        "shell": "zsh",
        "node_version": "v26.7.0"
    },
    "tools": [
        {"name": "Node.js", "available": True, "version": "v26.7.0"},
        {"name": "npm", "available": True, "version": "12.0.2"},
        {"name": "git", "available": True, "version": "2.55.0"},
        {"name": "Python", "available": True, "version": "3.14.7"},
        {"name": "Docker", "available": True, "version": "29.7.2"},
        {"name": "ADB", "available": True, "version": "37.0.0"}
    ],
    "privileges": {"shell": True, "adb": True, "root": False}
}

# Fields to ablate (one at a time)
ABLATION_FIELDS = {
    "-gpu": {
        "description": "Remove GPU information",
        "remove": ["hardware.gpu", "hardware.gpu_driver", "hardware.gpu_is_generic"]
    },
    "-ram": {
        "description": "Remove RAM information",
        "remove": ["hardware.ram_gb", "hardware.ram_available_gb"]
    },
    "-disk": {
        "description": "Remove disk information",
        "remove": ["hardware.storage"]
    },
    "-temp": {
        "description": "Remove temperature information",
        "remove": ["hardware.temperature_c"]
    },
    "-cpu": {
        "description": "Remove CPU information",
        "remove": ["hardware.cpu", "hardware.cpu_cores"]
    },
    "-os": {
        "description": "Remove OS/kernel information",
        "remove": ["platform.os", "platform.os_name", "platform.kernel", "platform.architecture"]
    },
    "-tools": {
        "description": "Remove tools list",
        "remove": ["tools"]
    }
}


def remove_field(data: dict, field_path: str) -> dict:
    """Remove a field from nested dict using dot notation."""
    result = json.loads(json.dumps(data))  # Deep copy
    parts = field_path.split(".")
    
    if len(parts) == 1:
        result.pop(parts[0], None)
    elif len(parts) == 2:
        if parts[0] in result and parts[1] in result[parts[0]]:
            del result[parts[0]][parts[1]]
    elif len(parts) == 3:
        if parts[0] in result and parts[1] in result[parts[0]] and parts[2] in result[parts[0]][parts[1]]:
            del result[parts[0]][parts[1]][parts[2]]
    
    return result


def context_to_text(context: dict) -> str:
    """Convert context dict to readable text format."""
    lines = ["System context provided by Buffy (observed now):", ""]
    
    # Platform
    if "platform" in context:
        p = context["platform"]
        lines.append("Platform:")
        if "os" in p:
            lines.append(f"- OS: {p.get('os', 'Unknown')} ({p.get('os_name', 'Unknown')})")
        if "kernel" in p:
            lines.append(f"- Kernel: {p['kernel']}")
        if "architecture" in p:
            lines.append(f"- Arch: {p['architecture']}")
        lines.append("")
    
    # Hardware
    if "hardware" in context:
        h = context["hardware"]
        lines.append("Hardware:")
        if "cpu" in h:
            lines.append(f"- CPU: {h['cpu']} ({h.get('cpu_cores', '?')} cores)")
        if "ram_gb" in h:
            lines.append(f"- RAM: {h['ram_gb']} GB total, {h.get('ram_available_gb', '?')} GB available")
        if "gpu" in h:
            lines.append(f"- GPU: {h['gpu']}, driver {h.get('gpu_driver', '?')}")
        if "storage" in h and h["storage"]:
            s = h["storage"][0]
            lines.append(f"- Disk (/): {s.get('total_gb', '?')} GB total, {s.get('free_gb', '?')} GB free ({s.get('used_percent', '?')}% used)")
        if "temperature_c" in h:
            lines.append(f"- CPU temperature: {h['temperature_c']}°C")
        lines.append("")
    
    # Environment
    if "environment" in context:
        e = context["environment"]
        lines.append("Environment:")
        if "shell" in e:
            lines.append(f"- Shell: {e['shell']}")
        if "node_version" in e:
            lines.append(f"- Node.js: {e['node_version']}")
        lines.append("")
    
    # Tools
    if "tools" in context:
        lines.append("Available tools:")
        for t in context["tools"]:
            lines.append(f"- {t['name']} {t.get('version', '')}")
        lines.append("")
    
    # Privileges
    if "privileges" in context:
        priv = context["privileges"]
        lines.append(f"Privileges: shell={'yes' if priv.get('shell') else 'no'}, adb={'yes' if priv.get('adb') else 'no'}, root={'yes' if priv.get('root') else 'no'}")
    
    return "\n".join(lines)


def main():
    output_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate FULL variant
    full_text = context_to_text(FULL_CONTEXT)
    (output_dir / "full.txt").write_text(full_text)
    print(f"✅ full.txt ({len(full_text)} bytes)")
    
    # Generate ablation variants
    for variant_name, variant_info in ABLATION_FIELDS.items():
        ablated = FULL_CONTEXT.copy()
        for field in variant_info["remove"]:
            ablated = remove_field(ablated, field)
        
        variant_text = context_to_text(ablated)
        (output_dir / f"{variant_name}.txt").write_text(variant_text)
        print(f"✅ {variant_name}.txt ({len(variant_text)} bytes) — {variant_info['description']}")
    
    print(f"\n📁 Generated {1 + len(ABLATION_FIELDS)} variants in {output_dir}")


if __name__ == "__main__":
    main()
