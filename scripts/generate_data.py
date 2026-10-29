
"""AI Ledger: reproducible synthetic task-data generator.

All generated records are simulated, not real company observations.
Run from the project root:
    python scripts/generate_data.py
"""

from __future__ import annotations

import csv
import random
from pathlib import Path

# Project paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "data" / "raw"
OUTPUT_FILE = OUTPUT_DIR / "fact_task.csv"

# Reproducibility and volume
SEED = 42
N_TASKS = 20_000

# Global assumptions — ASSUMPTION, not measured business data.
AI_COST_PER_TASK = 0.02  # ₹ per task
REVIEW_CATCH_RATE = 0.85  # fraction of errors caught by review

# Category configuration.
# Values are ASSUMPTIONS and must be calibrated with pilot data later.
CATEGORY_CONFIG = {
    "Billing": {
        "baseline_min": 8.0,
        "accuracy": 0.96,
        "review_min": 2.0,
        "rework_min": 5.0,
        "severity_multiplier": 1.0,
        "volume_share": 0.30,
    },
    "Technical": {
        "baseline_min": 12.0,
        "accuracy": 0.88,
        "review_min": 3.5,
        "rework_min": 10.0,
        "severity_multiplier": 1.8,
        "volume_share": 0.20,
    },
    "Account": {
        "baseline_min": 7.0,
        "accuracy": 0.95,
        "review_min": 2.0,
        "rework_min": 5.0,
        "severity_multiplier": 1.0,
        "volume_share": 0.25,
    },
    "Returns": {
        "baseline_min": 9.0,
        "accuracy": 0.92,
        "review_min": 2.5,
        "rework_min": 7.0,
        "severity_multiplier": 1.3,
        "volume_share": 0.15,
    },
    "Complaints": {
        "baseline_min": 14.0,
        "accuracy": 0.82,
        "review_min": 4.0,
        "rework_min": 12.0,
        "severity_multiplier": 2.2,
        "volume_share": 0.10,
    },
}

FIELDNAMES = [
    "task_id",
    "category",
    "ai_cost",
    "ai_correct",
    "review_min",
    "edit_min",
    "error_severity",
    "rework_min",
    "escalated",
    "review_caught",
    "escaped",
]


def validate_config() -> None:
    """Fail early if configuration assumptions are inconsistent."""
    if N_TASKS < 1:
        raise ValueError("N_TASKS must be at least 1.")

    total_share = sum(
        config["volume_share"] for config in CATEGORY_CONFIG.values()
    )
    if abs(total_share - 1.0) > 1e-9:
        raise ValueError(
            f"Category volume shares must sum to 1.0; got {total_share:.6f}."
        )

    for category, config in CATEGORY_CONFIG.items():
        if not 0 <= config["accuracy"] <= 1:
            raise ValueError(f"Invalid accuracy for {category}.")
        if not 0 <= config["volume_share"] <= 1:
            raise ValueError(f"Invalid volume share for {category}.")


def allocate_category_counts(n_tasks: int) -> dict[str, int]:
    """Allocate integer task counts using largest-remainder rounding."""
    exact = {
        name: n_tasks * config["volume_share"]
        for name, config in CATEGORY_CONFIG.items()
    }
    counts = {name: int(value) for name, value in exact.items()}
    remaining = n_tasks - sum(counts.values())

    ranked = sorted(
        exact,
        key=lambda name: exact[name] - counts[name],
        reverse=True,
    )
    for name in ranked[:remaining]:
        counts[name] += 1

    return counts


def generate_tasks() -> list[dict[str, object]]:
    """Generate a deterministic task dataset for a fixed seed."""
    rng = random.Random(SEED)
    counts = allocate_category_counts(N_TASKS)
    tasks: list[dict[str, object]] = []

    for category, count in counts.items():
        config = CATEGORY_CONFIG[category]

        for _ in range(count):
            ai_correct = rng.random() < config["accuracy"]

            # Review and edit time are simulated around category assumptions.
            review_min = max(
                0.1,
                rng.triangular(
                    config["review_min"] * 0.7,
                    config["review_min"] * 1.3,
                    config["review_min"],
                ),
            )
            edit_min = (
                rng.triangular(0.1, 1.5, 0.4)
                if not ai_correct
                else rng.triangular(0.0, 0.5, 0.1)
            )

            error_severity = (
                rng.triangular(0.5, 1.5, 1.0)
                * config["severity_multiplier"]
                if not ai_correct
                else 0.0
            )

            review_caught = (
                (not ai_correct) and (rng.random() < REVIEW_CATCH_RATE)
            )
            escaped = (not ai_correct) and (not review_caught)

            rework_min = (
                rng.triangular(
                    config["rework_min"] * 0.7,
                    config["rework_min"] * 1.3,
                    config["rework_min"],
                )
                if review_caught
                else 0.0
            )

            # Escalation is simulated as more likely for uncaught errors.
            escalated = (
                rng.random() < (0.35 if escaped else 0.05)
            )

            tasks.append(
                {
                    "task_id": 0,  # assigned after shuffling
                    "category": category,
                    "ai_cost": AI_COST_PER_TASK,
                    "ai_correct": ai_correct,
                    "review_min": round(review_min, 4),
                    "edit_min": round(edit_min, 4),
                    "error_severity": round(error_severity, 4),
                    "rework_min": round(rework_min, 4),
                    "escalated": escalated,
                    "review_caught": review_caught,
                    "escaped": escaped,
                }
            )

    # Mix categories while retaining the exact weighted allocation.
    rng.shuffle(tasks)
    for task_id, task in enumerate(tasks, start=1):
        task["task_id"] = task_id

    return tasks


def write_csv(tasks: list[dict[str, object]]) -> None:
    """Write generated tasks as UTF-8 CSV."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with OUTPUT_FILE.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(tasks)


def main() -> None:
    validate_config()
    tasks = generate_tasks()
    write_csv(tasks)

    category_counts: dict[str, int] = {}
    for task in tasks:
        category = str(task["category"])
        category_counts[category] = category_counts.get(category, 0) + 1

    print("AI LEDGER — SYNTHETIC DATA GENERATOR")
    print("=" * 42)
    print(f"Seed: {SEED}")
    print(f"Rows generated: {len(tasks):,}")
    print(f"Output: {OUTPUT_FILE}")
    print("\nCategory counts:")
    for category, count in category_counts.items():
        print(f"  {category:<12} {count:>7,}")
    print("\nData label: SYNTHETIC SIMULATION")
    print("Configuration label: ASSUMPTION")
    print("Generation completed successfully.")


if __name__ == "__main__":
    main()
