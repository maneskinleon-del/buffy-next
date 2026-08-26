#!/usr/bin/env python3
"""Phase 4: Score responses against Ground Truth for outcome analysis."""

import os
import re
import sys
from pathlib import Path

# Ground Truth facts for each task
GROUND_TRUTH = {
    "T1": {
        "gpu": "AMD Picasso/Raven 2",
        "gpu_driver": "amdgpu",
        "gpu_type": "specific",  # specific vs generic
    },
    "T2": {
        "ram_total_mb": 13891,
        "ram_available_mb": 8585,
        "can_compile": True,
    },
    "T3": {
        "disk_used_percent": 58,
        "disk_free_gb": 89,
        "risk_level": "low",
    },
    "T4": {
        "kernel": "6.18.45-2-lts",
        "os": "Linux",
        "distro": "EndeavourOS",
    },
    "T5": {
        "type": "diagnostic",  # Open-ended, different rubric
    },
}

# Keywords to detect tool mentions
TOOL_KEYWORDS = [
    "lspci", "sensors", "free -h", "free -m", "df -h", "df /",
    "uname -a", "uname -r", "top", "htop", "ps aux", "nvidia-smi",
    "ejecut", "comando", "command", "terminal", "shell",
    "necesito ver", "necesito ej", "let me check", "let me run",
]


def parse_ground_truth(gt_file: str) -> dict:
    """Parse a ground truth file and extract key facts."""
    facts = {}
    with open(gt_file, "r") as f:
        content = f.read()
    
    # Extract GPU
    gpu_match = re.search(r"VGA compatible controller: (.+?)(?:\n|$)", content)
    if gpu_match:
        facts["gpu_raw"] = gpu_match.group(1).strip()
    
    # Extract GPU driver
    driver_match = re.search(r"Kernel driver in use: (\w+)", content)
    if driver_match:
        facts["gpu_driver"] = driver_match.group(1).strip()
    
    # Extract RAM
    ram_match = re.search(r"Mem:\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+\s+\d+\s+(\d+)", content)
    if ram_match:
        facts["ram_total_mb"] = int(ram_match.group(1))
        facts["ram_available_mb"] = int(ram_match.group(4))
    
    # Extract disk
    disk_match = re.search(r"/dev/\S+\s+\S+\s+\S+\s+\S+\s+(\d+)%\s+/", content)
    if disk_match:
        facts["disk_used_percent"] = int(disk_match.group(1))
    
    # Extract temperature
    temp_match = re.search(r"edge:\s+\+(\d+\.?\d*)", content)
    if temp_match:
        facts["temperature_c"] = float(temp_match.group(1))
    
    # Extract kernel
    kernel_match = re.search(r"Linux \S+ (\S+)", content)
    if kernel_match:
        facts["kernel"] = kernel_match.group(1)
    
    return facts


def strip_ansi(text: str) -> str:
    """Remove ANSI escape codes from text."""
    ansi_escape = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')
    return ansi_escape.sub('', text)


def score_response(response: str, task: str, ground_truth_facts: dict) -> dict:
    """Score a response against ground truth facts."""
    result = {
        "correct": 0,
        "incorrect": 0,
        "unsupported": 0,
        "tool_mentions": 0,
        "buffy_references": 0,
    }
    
    # Strip ANSI codes
    response = strip_ansi(response)
    response_lower = response.lower()
    
    if task == "T1":
        # GPU identification
        if "picasso" in response_lower or "raven" in response_lower or "vega" in response_lower:
            result["correct"] += 1
        elif "amd" in response_lower or "ati" in response_lower:
            result["correct"] += 0.5  # Partial credit
        
        # Driver identification
        if "amdgpu" in response_lower:
            result["correct"] += 1
        elif "radeon" in response_lower or "driver" in response_lower:
            result["correct"] += 0.5
        
        # Driver type
        if "específico" in response_lower or "specific" in response_lower or "dedicado" in response_lower:
            result["correct"] += 1
        elif "genérico" in response_lower or "generic" in response_lower:
            result["incorrect"] += 1
    
    elif task == "T2":
        # RAM
        if "13" in response and ("gb" in response_lower or "memoria" in response_lower):
            result["correct"] += 1
        if "8" in response or "7" in response or "disponible" in response_lower:
            result["correct"] += 0.5
    
    elif task == "T3":
        # Disk percentage
        if "58" in response or "57" in response:
            result["correct"] += 1
        
        # Risk assessment
        if "bajo" in response_lower or "low" in response_lower or "no está" in response_lower:
            result["correct"] += 1
        elif "medio" in response_lower or "medium" in response_lower:
            result["correct"] += 0.5
    
    elif task == "T4":
        # Kernel
        if "6.18" in response or "6.18.45" in response:
            result["correct"] += 1
        
        # OS
        if "linux" in response_lower:
            result["correct"] += 0.5
        
        # Distro
        if "endeavouros" in response_lower or "arch" in response_lower:
            result["correct"] += 0.5
    
    elif task == "T5":
        # Diagnostic quality - different rubric
        result["correct"] = 0  # Will be scored separately
        result["diagnostic"] = {
            "coverage": 0,
            "evidence_use": 0,
            "prioritization": 0,
        }
        
        # Coverage of diagnostic areas
        areas = ["cpu", "ram", "disco", "disk", "procesos", "process", "temperatura", "temperature"]
        for area in areas:
            if area in response_lower:
                result["diagnostic"]["coverage"] += 1
        
        # Evidence use
        if "buffy" in response_lower or "contexto" in response_lower or "observado" in response_lower:
            result["diagnostic"]["evidence_use"] += 1
        
        # Prioritization
        if "primero" in response_lower or "primera" in response_lower or "priorizar" in response_lower:
            result["diagnostic"]["prioritization"] += 1
    
    # Count tool mentions
    for keyword in TOOL_KEYWORDS:
        if keyword in response_lower:
            result["tool_mentions"] += 1
    
    # Count Buffy references
    buffy_keywords = ["buffy", "contexto", "observado", "proporcionado", "sistema", "hechos"]
    for keyword in buffy_keywords:
        if keyword in response_lower:
            result["buffy_references"] += 1
    
    return result


def main():
    results_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    
    # Find all output files
    outputs = list(results_dir.glob("*-output.md"))
    
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║           PHASE 4: OUTCOME SCORING                          ║")
    print("╚══════════════════════════════════════════════════════════════╝")
    print()
    
    all_scores = {}
    
    for output_file in sorted(outputs):
        # Parse filename: various patterns
        stem = output_file.stem.replace("-output", "")
        parts = stem.split("-")
        task = parts[0]
        
        # Handle different naming conventions
        if parts[1] in ["control", "policy"]:  # Phase 3
            condition = parts[1]
        elif parts[1] in ["early", "late"]:  # Phase 2
            condition = parts[1]
        elif parts[1] in ["a", "b"]:  # Phase 1
            condition = "json" if parts[1] == "a" else "semantic"
        else:
            condition = parts[1]
        
        run = parts[2]
        
        # Read response
        with open(output_file, "r") as f:
            content = f.read()
        
        # Extract response (after "## Response")
        response_match = re.search(r"## Response\n(.+)", content, re.DOTALL)
        response = response_match.group(1).strip() if response_match else ""
        
        # Score
        gt = GROUND_TRUTH.get(task, {})
        score = score_response(response, task, gt)
        
        key = f"{task}-{condition}"
        if key not in all_scores:
            all_scores[key] = []
        all_scores[key].append(score)
    
    # Aggregate scores
    # Detect condition labels from data
    all_conditions = set()
    for key in all_scores:
        parts = key.split("-", 1)
        if len(parts) > 1:
            all_conditions.add(parts[1])
    
    # Use first two conditions found as cond_a and cond_b
    cond_list = sorted(all_conditions)
    if len(cond_list) >= 2:
        cond_a, cond_b = cond_list[0], cond_list[1]
    else:
        cond_a = cond_list[0] if cond_list else "?"
        cond_b = "?"
    
    print(f"📊 ACCURACY SCORES (T1-T4) — {cond_a} vs {cond_b}")
    print("┌──────┬─────────────┬─────────────┬─────────────┐")
    print(f"│ Task │ {cond_a+' avg':11s} │ {cond_b+' avg':11s} │ {'Δ':11s} │")
    print("├──────┼─────────────┼─────────────┼─────────────┤")
    
    for task in ["T1", "T2", "T3", "T4"]:
        key_a = f"{task}-{cond_a}"
        key_b = f"{task}-{cond_b}"
        
        scores_a = all_scores.get(key_a, [])
        scores_b = all_scores.get(key_b, [])
        
        avg_a = sum(s["correct"] for s in scores_a) / len(scores_a) if scores_a else 0
        avg_b = sum(s["correct"] for s in scores_b) / len(scores_b) if scores_b else 0
        
        delta = avg_b - avg_a
        print(f"│ {task:4s} │ {avg_a:9.1f} │ {avg_b:9.1f} │ {delta:+9.1f}  │")
    
    print("└──────┴─────────────┴─────────────┴─────────────┘")
    print()
    
    print(f"🔧 TOOL MENTIONS (avg per response) — {cond_a} vs {cond_b}")
    print("┌──────┬─────────────┬─────────────┐")
    print(f"│ Task │ {cond_a+' avg':11s} │ {cond_b+' avg':11s} │")
    print("├──────┼─────────────┼─────────────┤")
    
    for task in ["T1", "T2", "T3", "T4", "T5"]:
        key_a = f"{task}-{cond_a}"
        key_b = f"{task}-{cond_b}"
        
        scores_a = all_scores.get(key_a, [])
        scores_b = all_scores.get(key_b, [])
        
        avg_a = sum(s["tool_mentions"] for s in scores_a) / len(scores_a) if scores_a else 0
        avg_b = sum(s["tool_mentions"] for s in scores_b) / len(scores_b) if scores_b else 0
        
        print(f"│ {task:4s} │ {avg_a:9.1f} │ {avg_b:9.1f} │")
    
    print("└──────┴─────────────┴─────────────┘")
    print()
    
    print(f"📝 BUFFY REFERENCES (avg per response) — {cond_a} vs {cond_b}")
    print("┌──────┬─────────────┬─────────────┐")
    print(f"│ Task │ {cond_a+' avg':11s} │ {cond_b+' avg':11s} │")
    print("├──────┼─────────────┼─────────────┤")
    
    for task in ["T1", "T2", "T3", "T4", "T5"]:
        key_a = f"{task}-{cond_a}"
        key_b = f"{task}-{cond_b}"
        
        scores_a = all_scores.get(key_a, [])
        scores_b = all_scores.get(key_b, [])
        
        avg_a = sum(s["buffy_references"] for s in scores_a) / len(scores_a) if scores_a else 0
        avg_b = sum(s["buffy_references"] for s in scores_b) / len(scores_b) if scores_b else 0
        
        print(f"│ {task:4s} │ {avg_a:9.1f} │ {avg_b:9.1f} │")
    
    print("└──────┴─────────────┴─────────────┘")
    print()


if __name__ == "__main__":
    main()
