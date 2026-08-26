#!/usr/bin/env python3
"""Analyze Phase 5 ablation results to determine field importance."""

import re
from pathlib import Path

# Ground truth facts for each task
GROUND_TRUTH = {
    "T1": {"gpu_keywords": ["picasso", "raven", "vega", "amd"], "driver": "amdgpu"},
    "T2": {"ram_gb": 13, "ram_available": True},
    "T3": {"disk_percent": 58, "risk": "low"},
    "T4": {"kernel": "6.18", "os": "linux"},
}


def strip_ansi(text: str) -> str:
    """Remove ANSI escape codes from text."""
    ansi_escape = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')
    return ansi_escape.sub('', text)


def score_response(response: str, task: str) -> float:
    """Score a response against ground truth. Returns 0-1."""
    response = strip_ansi(response).lower()
    
    if task == "T1":
        score = 0
        if any(kw in response for kw in ["picasso", "raven", "vega"]):
            score += 0.5
        if "amdgpu" in response:
            score += 0.5
        return score
    
    elif task == "T2":
        score = 0
        if "13" in response or "13.6" in response:
            score += 0.5
        if "7" in response or "disponible" in response or "available" in response:
            score += 0.5
        return score
    
    elif task == "T3":
        score = 0
        if "58" in response or "57" in response:
            score += 0.5
        if "bajo" in response or "low" in response or "no está" in response:
            score += 0.5
        return score
    
    elif task == "T4":
        score = 0
        if "6.18" in response:
            score += 0.5
        if "linux" in response:
            score += 0.25
        if "endeavouros" in response or "arch" in response:
            score += 0.25
        return score
    
    return 0


def main():
    results_dir = Path(".")
    
    # Find all output files
    outputs = list(results_dir.glob("*-output.md"))
    
    # Group by variant
    variant_scores = {}
    variant_tool_mentions = {}
    
    for output_file in sorted(outputs):
        parts = output_file.stem.replace("-output", "").split("-")
        task = parts[0]
        variant = "-".join(parts[1:-1])  # e.g., "gpu", "ram", "full"
        run = parts[-1]
        
        # Read response
        with open(output_file, "r") as f:
            content = f.read()
        
        # Extract response
        response_match = re.search(r"## Response\n(.+)", content, re.DOTALL)
        response = response_match.group(1).strip() if response_match else ""
        
        # Score
        score = score_response(response, task)
        
        key = variant
        if key not in variant_scores:
            variant_scores[key] = {}
        if task not in variant_scores[key]:
            variant_scores[key][task] = []
        variant_scores[key][task].append(score)
    
    # Print results
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║           PHASE 5: ABLATION ANALYSIS                        ║")
    print("║           Which Buffy fields matter most?                   ║")
    print("╚══════════════════════════════════════════════════════════════╝")
    print()
    
    # Accuracy by variant
    print("📊 ACCURACY BY VARIANT (T1-T4)")
    print("┌──────────┬───────┬───────┬───────┬───────┬───────┬─────────┐")
    print("│ Variant  │  T1   │  T2   │  T3   │  T4   │ Total │ Δ Full  │")
    print("├──────────┼───────┼───────┼───────┼───────┼───────┼─────────┤")
    
    # Get full scores
    full_total = 0
    for task in ["T1", "T2", "T3", "T4"]:
        scores = variant_scores.get("full", {}).get(task, [])
        avg = sum(scores) / len(scores) if scores else 0
        full_total += avg
    
    # Sort variants
    variant_totals = {}
    for variant in sorted(variant_scores.keys()):
        total = 0
        row = f"│ {variant:8s} │"
        for task in ["T1", "T2", "T3", "T4"]:
            scores = variant_scores.get(variant, {}).get(task, [])
            avg = sum(scores) / len(scores) if scores else 0
            total += avg
            row += f" {avg:5.2f} │"
        variant_totals[variant] = total
        delta = total - full_total
        row += f" {total:5.2f} │ {delta:+6.2f}  │"
        print(row)
    
    print("└──────────┴───────┴───────┴───────┴───────┴───────┴─────────┘")
    print()
    
    # Field importance ranking
    print("🏆 FIELD IMPORTANCE RANKING")
    print("┌──────────┬─────────┬──────────────────────────────────────┐")
    print("│ Field    │ Δ Full  │ Interpretation                       │")
    print("├──────────┼─────────┼──────────────────────────────────────┤")
    
    field_interpretations = {
        "gpu": "GPU info for T1 (GPU identification)",
        "ram": "RAM info for T2 (compile feasibility)",
        "disk": "Disk info for T3 (space assessment)",
        "temp": "Temperature for diagnostics",
        "cpu": "CPU info for general hardware",
        "os": "OS/kernel for system identification",
        "tools": "Tools list for capability awareness",
    }
    
    sorted_variants = sorted(variant_totals.items(), key=lambda x: x[1], reverse=True)
    for variant, total in sorted_variants:
        if variant == "full":
            continue
        delta = total - full_total
        interp = field_interpretations.get(variant.lstrip("-"), "")
        print(f"│ {variant:8s} │ {delta:+6.2f} │ {interp:36s} │")
    
    print("└──────────┴─────────┴──────────────────────────────────────┘")
    print()
    
    # High-value fields
    high_value = [(v, t) for v, t in sorted_variants if (t - full_total) < -0.3]
    print("🎯 HIGH-VALUE FIELDS (removing causes significant accuracy drop)")
    for variant, total in high_value:
        delta = total - full_total
        print(f"  • {variant}: Δ = {delta:+.2f} (accuracy drops when removed)")
    
    if not high_value:
        print("  No fields show significant impact when removed.")
        print("  This suggests Buffy's value comes from the combination of fields,")
        print("  not from any single field dominating.")
    
    print()


if __name__ == "__main__":
    main()
