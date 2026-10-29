
"""AI Ledger: Monte Carlo simulation and sensitivity analysis.

All results are simulations based on ASSUMPTION parameters.
Run from the project root:
    python scripts/simulation.py
"""

from __future__ import annotations

import json
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DB_FILE = ROOT / "data" / "processed" / "ai_ledger.duckdb"
EXPORT_DIR = ROOT / "exports"

SEED = 42
N_SIMULATIONS = 2_000

# Assumption parameters — not measured business facts.
HOURLY_RATE = 30.0
SETUP_COST = 2_000.0
AI_COST_PER_TASK = 0.02
ESCAPED_ERROR_COST = 40.0
REVIEW_CATCH_RATE = 0.85

# Accuracy uncertainty: ±2 percentage points around each category
# baseline assumption. This is a modelling choice, not empirical evidence.
ACCURACY_UNCERTAINTY = 0.02


def load_task_data() -> pd.DataFrame:
    """Load task and category configuration from the existing DuckDB model."""
    if not DB_FILE.is_file():
        raise FileNotFoundError(
            f"Database not found: {DB_FILE}. "
            "Run scripts/run_analysis.py first."
        )

    with duckdb.connect(str(DB_FILE), read_only=True) as con:
        tasks = con.execute("""
            SELECT
                f.task_id,
                f.category,
                f.ai_correct,
                f.review_min,
                f.edit_min,
                f.error_severity,
                f.rework_min,
                f.escaped,
                d.baseline_min,
               d.base_accuracy,
                d.severity_multiplier,
                d.assumed_rework_min
            FROM fact_task f
            JOIN dim_category d USING (category)
            ORDER BY f.task_id
        """).df()

    if tasks.empty:
        raise ValueError("The task dataset is empty.")

    return tasks


def calculate_scenario(
    tasks: pd.DataFrame,
    accuracy_shift: float,
    hourly_rate: float = HOURLY_RATE,
    ai_cost: float = AI_COST_PER_TASK,
    escaped_error_cost: float = ESCAPED_ERROR_COST,
) -> float:
    """Calculate aggregate net value for one simulated accuracy scenario."""
    # Apply the same hypothetical accuracy shift to every category.
    # Existing review, edit and rework times remain fixed in this version.
    accuracy = np.clip(
        tasks["base_accuracy"].to_numpy(dtype=float) + accuracy_shift,
        0.0,
        1.0,
    )

    # Expected error risk under the scenario.
    error_probability = 1.0 - accuracy
    escaped_probability = error_probability * (1.0 - REVIEW_CATCH_RATE)
    caught_probability = error_probability * REVIEW_CATCH_RATE

    baseline_cost = (
        tasks["baseline_min"].to_numpy(dtype=float) / 60.0
    ) * hourly_rate

    review_cost = (
        (tasks["review_min"].to_numpy(dtype=float)
         + tasks["edit_min"].to_numpy(dtype=float)) / 60.0
    ) * hourly_rate

    rework_cost = (
        caught_probability
        * tasks["assumed_rework_min"].to_numpy(dtype=float)
        / 60.0
        * hourly_rate
    )

    severity = tasks["severity_multiplier"].to_numpy(dtype=float)
    error_cost = (
        escaped_probability * severity * escaped_error_cost
    )

    net_value = (
        baseline_cost
        - ai_cost
        - review_cost
        - rework_cost
        - error_cost
    )

    return float(net_value.sum())


def run_monte_carlo(tasks: pd.DataFrame) -> pd.DataFrame:
    """Run reproducible scenarios around the category accuracy assumptions."""
    rng = np.random.default_rng(SEED)

    # Draw a shared accuracy shift per simulation.
    # Uniform bounds are explicit modelling assumptions.
    shifts = rng.uniform(
        -ACCURACY_UNCERTAINTY,
        ACCURACY_UNCERTAINTY,
        size=N_SIMULATIONS,
    )

    results = []
    for simulation_id, shift in enumerate(shifts, start=1):
        operating_value = calculate_scenario(
            tasks,
            accuracy_shift=float(shift),
        )
        results.append(
            {
                "simulation_id": simulation_id,
                "accuracy_shift": float(shift),
                "operating_net_value": operating_value,
                "net_value_after_setup": operating_value - SETUP_COST,
            }
        )

    return pd.DataFrame(results)


def run_sensitivity(tasks: pd.DataFrame) -> pd.DataFrame:
    """Evaluate operating value under explicit alternative assumptions."""
    scenarios = [
        ("Base case", 0.0, HOURLY_RATE, AI_COST_PER_TASK, ESCAPED_ERROR_COST),
        ("Accuracy -2pp", -0.02, HOURLY_RATE, AI_COST_PER_TASK, ESCAPED_ERROR_COST),
        ("Accuracy +2pp", 0.02, HOURLY_RATE, AI_COST_PER_TASK, ESCAPED_ERROR_COST),
        ("Hourly cost -20%", 0.0, HOURLY_RATE * 0.8, AI_COST_PER_TASK, ESCAPED_ERROR_COST),
        ("Hourly cost +20%", 0.0, HOURLY_RATE * 1.2, AI_COST_PER_TASK, ESCAPED_ERROR_COST),
        ("AI cost doubled", 0.0, HOURLY_RATE, AI_COST_PER_TASK * 2, ESCAPED_ERROR_COST),
        ("Error cost doubled", 0.0, HOURLY_RATE, AI_COST_PER_TASK, ESCAPED_ERROR_COST * 2),
    ]

    rows = []
    for name, shift, rate, ai_cost, error_cost in scenarios:
        operating_value = calculate_scenario(
            tasks,
            accuracy_shift=shift,
            hourly_rate=rate,
            ai_cost=ai_cost,
            escaped_error_cost=error_cost,
        )
        rows.append(
            {
                "scenario": name,
                "operating_net_value": operating_value,
                "net_value_after_setup": operating_value - SETUP_COST,
            }
        )

    return pd.DataFrame(rows)


def export_json(
    monte_carlo: pd.DataFrame,
    sensitivity: pd.DataFrame,
) -> None:
    """Export dashboard-friendly summaries as JSON arrays."""
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    p10, p50, p90 = np.percentile(
        monte_carlo["net_value_after_setup"],
        [10, 50, 90],
    )

    summary = {
        "simulation_label": "SYNTHETIC SIMULATION",
        "parameter_label": "ASSUMPTION",
        "seed": SEED,
        "simulation_count": N_SIMULATIONS,
        "setup_cost": SETUP_COST,
        "net_value_after_setup": {
            "p10": round(float(p10), 2),
            "p50": round(float(p50), 2),
            "p90": round(float(p90), 2),
            "mean": round(
                float(monte_carlo["net_value_after_setup"].mean()), 2
            ),
            "probability_positive": round(
                float(
                    (monte_carlo["net_value_after_setup"] > 0).mean()
                ),
                4,
            ),
        },
    }

    (EXPORT_DIR / "simulation_summary.json").write_text(
        json.dumps(summary, indent=2),
        encoding="utf-8",
    )

    sensitivity.to_json(
        EXPORT_DIR / "sensitivity.json",
        orient="records",
        indent=2,
    )

    monte_carlo.to_json(
        EXPORT_DIR / "monte_carlo.json",
        orient="records",
        indent=2,
    )


def main() -> None:
    print("AI LEDGER — MONTE CARLO SIMULATION")
    print("=" * 44)

    tasks = load_task_data()
    print(f"Tasks loaded: {len(tasks):,}")

    monte_carlo = run_monte_carlo(tasks)
    sensitivity = run_sensitivity(tasks)
    export_json(monte_carlo, sensitivity)

    values = monte_carlo["net_value_after_setup"]

    print(f"Simulation trials: {N_SIMULATIONS:,}")
    print("\nNET VALUE AFTER SETUP COST (₹)")
    print(f"P10:  ₹{values.quantile(0.10):,.2f}")
    print(f"P50:  ₹{values.quantile(0.50):,.2f}")
    print(f"P90:  ₹{values.quantile(0.90):,.2f}")
    print(f"Mean: ₹{values.mean():,.2f}")
    print(f"Positive-value scenarios: {(values > 0).mean():.1%}")

    print("\nSENSITIVITY ANALYSIS")
    print(
        sensitivity[
            ["scenario", "net_value_after_setup"]
        ].to_string(index=False)
    )

    print("\nExports created:")
    print("  exports/simulation_summary.json")
    print("  exports/sensitivity.json")
    print("  exports/monte_carlo.json")
    print("\nAll results are simulated under stated assumptions.")


if __name__ == "__main__":
    main()
