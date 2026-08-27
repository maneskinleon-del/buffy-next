#!/usr/bin/env python3
"""Generate E2-F1 Selection variants from Buffy context JSON.

Variants:
  - full: All fields (E1 baseline)
  - high-value: OS/kernel + RAM + Disco only
  - task-adaptive: Fields selected per task (T1=GPU, T2=RAM, T3=Disk, T4=OS, T5=All)
  - minimal: Single most relevant field per task
"""

import json
import subprocess
import os

# Get fresh Buffy context
result = subprocess.run(
    ["node", "dist/cli.js", "doctor", "--context"],
    capture_output=True, text=True, timeout=10,
    cwd=os.path.expanduser("~/e1/buffy")
)
ctx = json.loads(result.stdout)

VARIANTS_DIR = os.path.join(os.path.dirname(__file__), "variants")
os.makedirs(VARIANTS_DIR, exist_ok=True)

# === Variant A: Full (everything) ===
full = ctx

# === Variant B: High-value (OS/kernel + RAM + Disk) ===
high_value = {
    "schema": ctx["schema"],
    "platform": {
        "os": ctx["platform"]["os"],
        "os_name": ctx["platform"]["os_name"],
        "kernel": ctx["platform"]["kernel"],
    },
    "hardware": {
        "ram_gb": ctx["hardware"]["ram_gb"],
        "ram_available_gb": ctx["hardware"]["ram_available_gb"],
        "storage": ctx["hardware"]["storage"],
    }
}

# === Variant C: Task-adaptive (different fields per task) ===
# This will be generated per-task at runtime, but we define the mappings here
TASK_FIELD_MAP = {
    "T1": {  # GPU question
        "platform": ctx["platform"],
        "hardware": {
            "gpu": ctx["hardware"]["gpu"],
            "gpu_driver": ctx["hardware"]["gpu_driver"],
            "gpu_is_generic": ctx["hardware"]["gpu_is_generic"],
        }
    },
    "T2": {  # RAM question
        "platform": {"os": ctx["platform"]["os"], "kernel": ctx["platform"]["kernel"]},
        "hardware": {
            "ram_gb": ctx["hardware"]["ram_gb"],
            "ram_available_gb": ctx["hardware"]["ram_available_gb"],
            "cpu": ctx["hardware"]["cpu"],
        }
    },
    "T3": {  # Disk question
        "platform": {"os": ctx["platform"]["os"]},
        "hardware": {
            "storage": ctx["hardware"]["storage"],
        }
    },
    "T4": {  # OS/kernel question
        "platform": ctx["platform"],
        "environment": ctx["environment"],
    },
    "T5": {  # Diagnosis (needs everything)
        "platform": ctx["platform"],
        "hardware": ctx["hardware"],
        "environment": ctx["environment"],
        "tools": ctx["tools"],
    }
}

# === Variant D: Minimal (single most relevant field) ===
TASK_MINIMAL_MAP = {
    "T1": {  # GPU
        "hardware": {
            "gpu": ctx["hardware"]["gpu"],
            "gpu_driver": ctx["hardware"]["gpu_driver"],
        }
    },
    "T2": {  # RAM
        "hardware": {
            "ram_gb": ctx["hardware"]["ram_gb"],
            "ram_available_gb": ctx["hardware"]["ram_available_gb"],
        }
    },
    "T3": {  # Disk
        "hardware": {
            "storage": ctx["hardware"]["storage"],
        }
    },
    "T4": {  # OS
        "platform": ctx["platform"],
    },
    "T5": {  # Diagnosis (minimal = OS + RAM + Disk)
        "platform": {"os": ctx["platform"]["os"], "kernel": ctx["platform"]["kernel"]},
        "hardware": {
            "ram_gb": ctx["hardware"]["ram_gb"],
            "ram_available_gb": ctx["hardware"]["ram_available_gb"],
            "storage": ctx["hardware"]["storage"],
        }
    }
}

# Write static variants
with open(os.path.join(VARIANTS_DIR, "full.json"), "w") as f:
    json.dump(full, f, indent=2)

with open(os.path.join(VARIANTS_DIR, "high-value.json"), "w") as f:
    json.dump(high_value, f, indent=2)

# Write per-task adaptive and minimal variants
for task_id in ["T1", "T2", "T3", "T4", "T5"]:
    with open(os.path.join(VARIANTS_DIR, f"task-adaptive-{task_id}.json"), "w") as f:
        json.dump(TASK_FIELD_MAP[task_id], f, indent=2)
    with open(os.path.join(VARIANTS_DIR, f"minimal-{task_id}.json"), "w") as f:
        json.dump(TASK_MINIMAL_MAP[task_id], f, indent=2)

# Print sizes
print("=== E2-F1 Variant Sizes ===")
for name in ["full", "high-value"]:
    path = os.path.join(VARIANTS_DIR, f"{name}.json")
    size = os.path.getsize(path)
    print(f"  {name:15s} → {size:,} bytes")

for task_id in ["T1", "T2", "T3", "T4", "T5"]:
    for variant in ["task-adaptive", "minimal"]:
        path = os.path.join(VARIANTS_DIR, f"{variant}-{task_id}.json")
        size = os.path.getsize(path)
        print(f"  {variant}-{task_id:2s} → {size:,} bytes")

print(f"\nTotal variants: {2 + 5 + 5} = {12}")
