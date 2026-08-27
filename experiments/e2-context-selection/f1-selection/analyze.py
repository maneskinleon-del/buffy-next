#!/usr/bin/env python3
"""Analyze E2-F1 Selection results.

Scores each response against E1 Ground Truth.
Computes:
  - Accuracy per condition (T1-T4 factual, T5 diagnostic)
  - Mean latency per condition
  - Context size per condition
  - Gate logic: Full vs High-value, Task-adaptive vs High-value
"""

import json
import os
import re
import glob

RESULTS_DIR = os.path.join(os.path.dirname(__file__), "results", "full")
SCORES_DIR = os.path.join(os.path.dirname(__file__), "analysis")
os.makedirs(SCORES_DIR, exist_ok=True)

# Ground Truth keywords per task (from E1)
GT = {
    "T1": {
        "keywords": ["AMD", "Radeon", "Vega", "Picasso", "Raven"],
        "max_score": 1.0,
        "description": "GPU identification"
    },
    "T2": {
        "keywords_high": ["13", "13.6", "RAM"],
        "keywords_available": ["7", "7.2", "disponible", "available", "libre", "free"],
        "max_score": 1.0,
        "description": "RAM assessment for compilation"
    },
    "T3": {
        "keywords_percent": ["58", "57", "59"],
        "keywords_disk": ["disco", "disk", "88", "89", "libre", "free"],
        "max_score": 1.0,
        "description": "Disk usage assessment"
    },
    "T4": {
        "keywords_os": ["EndeavourOS", "Linux", "Arch"],
        "keywords_kernel": ["6.18", "lts"],
        "max_score": 1.0,
        "description": "OS/kernel description"
    },
    "T5": {
        "keywords": [],  # Diagnostic — qualitative scoring
        "max_score": 1.0,
        "description": "System diagnosis (qualitative)"
    }
}

def score_task(task, response):
    """Score a response against Ground Truth for a given task."""
    response_lower = response.lower()
    score = 0.0
    details = []

    if task == "T1":
        has_amd = "amd" in response_lower
        has_radeon = "radeon" in response_lower
        has_vega = "vega" in response_lower
        has_picasso = "picasso" in response_lower or "raven" in response_lower
        score = sum([has_amd, has_radeon, has_vega, has_picasso]) / 4.0
        details = f"AMD={has_amd} Radeon={has_radeon} Vega={has_vega} Picasso/Raven={has_picasso}"

    elif task == "T2":
        has_13gb = any(x in response for x in ["13", "13.6", "13,6"])
        has_available = any(x in response_lower for x in ["7", "disponible", "available", "libre", "free"])
        has_yes_no = any(x in response_lower for x in ["sí", "si ", "yes", "no ", "no."])
        score = sum([has_13gb, has_available, has_yes_no]) / 3.0
        details = f"13GB={has_13gb} available={has_available} yes/no={has_yes_no}"

    elif task == "T3":
        has_percent = any(x in response for x in ["58", "57", "59", "58%"])
        has_free = any(x in response for x in ["88", "89", "libre", "free"])
        has_risk = any(x in response_lower for x in ["riesgo", "risk", "preocup", "worry", "cerca", "lleno", "safe", "seguro"])
        score = sum([has_percent, has_free, has_risk]) / 3.0
        details = f"percent={has_percent} free={has_free} risk_assessment={has_risk}"

    elif task == "T4":
        has_os = any(x in response for x in ["EndeavourOS", "endeavouros", "Linux", "linux", "Arch", "arch"])
        has_kernel = any(x in response for x in ["6.18", "lts", "kernel"])
        score = sum([has_os, has_kernel]) / 2.0
        details = f"os={has_os} kernel={has_kernel}"

    elif task == "T5":
        # Qualitative: check for structured diagnosis
        has_checklist = any(x in response_lower for x in ["revisar", "check", "verificar", "primero", "primera"])
        has_processes = any(x in response_lower for x in ["proceso", "process", "cpu", "memoria", "ram"])
        has_disk = any(x in response_lower for x in ["disco", "disk", "almacenamiento"])
        has_temp = any(x in response_lower for x in ["temperatura", "temperature", "calient", "thermal"])
        score = sum([has_checklist, has_processes, has_disk, has_temp]) / 4.0
        details = f"checklist={has_checklist} processes={has_processes} disk={has_disk} temp={has_temp}"

    return score, details

# Parse all results
results = {}
for meta_file in sorted(glob.glob(os.path.join(RESULTS_DIR, "*-meta.json"))):
    with open(meta_file) as f:
        meta = json.load(f)

    output_file = meta_file.replace("-meta.json", "-output.md")
    if not os.path.exists(output_file):
        continue

    with open(output_file) as f:
        response = f.read()

    # Strip "...done thinking..." prefix if present
    if "...done thinking..." in response:
        response = response.split("...done thinking...")[-1].strip()

    condition = meta["condition"]
    task = meta["task"]
    run = meta["run"]
    latency = meta["latency_ms"]
    context_size = meta["context_size"]

    score, details = score_task(task, response)

    key = f"{condition}"
    if key not in results:
        results[key] = []
    results[key].append({
        "task": task,
        "run": run,
        "score": score,
        "latency_ms": latency,
        "context_size": context_size,
        "details": details
    })

# Compute summary
print("╔══════════════════════════════════════════════════════════════╗")
print("║  E2-F1 Selection: Results Analysis                         ║")
print("╚══════════════════════════════════════════════════════════════╝")
print()

# Accuracy by condition
print("## Accuracy by Condition (T1-T4 factual)")
print(f"{'Condition':15s} {'T1':>6s} {'T2':>6s} {'T3':>6s} {'T4':>6s} {'T5':>6s} {'Mean':>6s} {'Ctx Size':>10s}")
print("-" * 75)

condition_means = {}
for condition in ["full", "high-value", "task-adaptive", "minimal"]:
    if condition not in results:
        continue
    task_scores = {}
    task_latencies = {}
    ctx_sizes = {}
    for r in results[condition]:
        t = r["task"]
        if t not in task_scores:
            task_scores[t] = []
            task_latencies[t] = []
        task_scores[t].append(r["score"])
        task_latencies[t].append(r["latency_ms"])
        ctx_sizes[t] = r["context_size"]

    scores_str = []
    all_scores = []
    for t in ["T1", "T2", "T3", "T4", "T5"]:
        if t in task_scores:
            mean = sum(task_scores[t]) / len(task_scores[t])
            scores_str.append(f"{mean:.2f}")
            all_scores.extend(task_scores[t])
        else:
            scores_str.append("  N/A")

    overall_mean = sum(all_scores) / len(all_scores) if all_scores else 0
    avg_ctx = sum(ctx_sizes.values()) / len(ctx_sizes) if ctx_sizes else 0
    condition_means[condition] = overall_mean

    print(f"{condition:15s} {scores_str[0]:>6s} {scores_str[1]:>6s} {scores_str[2]:>6s} {scores_str[3]:>6s} {scores_str[4]:>6s} {overall_mean:>6.2f} {avg_ctx:>8.0f}B")

print()

# Latency by condition
print("## Latency by Condition (ms)")
print(f"{'Condition':15s} {'Mean':>8s} {'Min':>8s} {'Max':>8s}")
print("-" * 45)
for condition in ["full", "high-value", "task-adaptive", "minimal"]:
    if condition not in results:
        continue
    latencies = [r["latency_ms"] for r in results[condition]]
    mean_lat = sum(latencies) / len(latencies)
    print(f"{condition:15s} {mean_lat:>8.0f} {min(latencies):>8d} {max(latencies):>8d}")

print()

# Gate analysis
print("## Gate Analysis")
print()
if "full" in condition_means and "high-value" in condition_means:
    delta = condition_means["full"] - condition_means["high-value"]
    if abs(delta) < 0.05:
        print(f"  Full ({condition_means['full']:.2f}) ≈ High-value ({condition_means['high-value']:.2f})")
        print(f"  → Δ = {delta:+.2f} — CONTEXTO REDUCIBLE")
        print(f"  → High-value (OS/kernel + RAM + Disco) is sufficient")
    else:
        print(f"  Full ({condition_means['full']:.2f}) > High-value ({condition_means['high-value']:.2f})")
        print(f"  → Δ = {delta:+.2f} — SOME ADDITIONAL FIELDS MATTER")
print()

if "high-value" in condition_means and "task-adaptive" in condition_means:
    delta = condition_means["task-adaptive"] - condition_means["high-value"]
    if abs(delta) < 0.05:
        print(f"  Task-adaptive ({condition_means['task-adaptive']:.2f}) ≈ High-value ({condition_means['high-value']:.2f})")
        print(f"  → Δ = {delta:+.2f} — DYNAMIC SELECTOR MAY BE UNNECESSARY")
    else:
        print(f"  Task-adaptive ({condition_means['task-adaptive']:.2f}) > High-value ({condition_means['high-value']:.2f})")
        print(f"  → Δ = {delta:+.2f} — EVIDENCE FOR TASK-SPECIFIC SELECTOR")
print()

if "high-value" in condition_means and "minimal" in condition_means:
    delta = condition_means["minimal"] - condition_means["high-value"]
    if delta < -0.1:
        print(f"  Minimal ({condition_means['minimal']:.2f}) < High-value ({condition_means['high-value']:.2f})")
        print(f"  → Δ = {delta:+.2f} — LOWER BOUND IDENTIFIED")
    else:
        print(f"  Minimal ({condition_means['minimal']:.2f}) ≈ High-value ({condition_means['high-value']:.2f})")
        print(f"  → Δ = {delta:+.2f} — EVEN LESS MAY BE SUFFICIENT")

# Save summary JSON
summary = {
    "experiment": "e2-f1-selection",
    "conditions": {}
}
for condition in ["full", "high-value", "task-adaptive", "minimal"]:
    if condition in results:
        summary["conditions"][condition] = {
            "mean_score": condition_means.get(condition, 0),
            "runs": len(results[condition]),
            "context_size": results[condition][0]["context_size"] if results[condition] else 0
        }

with open(os.path.join(SCORES_DIR, "summary.json"), "w") as f:
    json.dump(summary, f, indent=2)

print(f"\nSummary saved to: {os.path.join(SCORES_DIR, 'summary.json')}")
