
"""Validate AI Ledger synthetic task data."""

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "raw" / "fact_task.csv"

EXPECTED_ROWS = 20_000
EXPECTED_COUNTS = {
    "Billing": 6_000,
    "Technical": 4_000,
    "Account": 5_000,
    "Returns": 3_000,
    "Complaints": 2_000,
}

REQUIRED_COLUMNS = [
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


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(f"FAILED: {message}")
    print(f"PASS: {message}")


def main() -> None:
    check(CSV_PATH.is_file(), "CSV file exists")

    df = pd.read_csv(CSV_PATH)

    check(len(df) == EXPECTED_ROWS, "Exactly 20,000 rows")
    check(
        all(column in df.columns for column in REQUIRED_COLUMNS),
        "All required columns exist",
    )
    check(not df[REQUIRED_COLUMNS].isna().any().any(), "No missing values")
    check(df["task_id"].is_unique, "Task IDs are unique")
    check(
        df["task_id"].tolist() == list(range(1, EXPECTED_ROWS + 1)),
        "Task IDs run from 1 to 20,000",
    )

    counts = df["category"].value_counts().to_dict()
    check(counts == EXPECTED_COUNTS, "Category counts match configured shares")

    check(
        df["ai_correct"].isin([True, False]).all(),
        "AI correctness flags are boolean",
    )
    check(
        df["review_caught"].isin([True, False]).all(),
        "Review-caught flags are boolean",
    )
    check(
        df["escaped"].isin([True, False]).all(),
        "Escaped-error flags are boolean",
    )
    check(
        df["escalated"].isin([True, False]).all(),
        "Escalation flags are boolean",
    )

    check(
        (df["ai_cost"] >= 0).all()
        and (df["review_min"] >= 0).all()
        and (df["edit_min"] >= 0).all()
        and (df["rework_min"] >= 0).all()
        and (df["error_severity"] >= 0).all(),
        "Cost inputs and time values are non-negative",
    )
    numeric_columns = [
        "ai_cost",
        "review_min",
        "edit_min",
        "error_severity",
        "rework_min",
    ]

    check(
        df[numeric_columns].apply(
            lambda column: pd.to_numeric(
                column, errors="coerce"
            ).map(lambda value: pd.notna(value) and value not in [float("inf"), float("-inf")])
        ).all().all(),
        "Numeric values are finite and valid",
    )
   
    # PASTE NEW CHECK HERE
    check(
        not df.loc[df["ai_correct"], "review_caught"].any(),
        "Correct AI outputs are never marked as review-caught",
    )

    incorrect = ~df["ai_correct"]
    check(
            (df.loc[incorrect, "review_caught"] != df.loc[incorrect, "escaped"]).all()
            and not df.loc[df["ai_correct"], "review_caught"].any()
            and not df.loc[df["ai_correct"], "escaped"].any(),
            "Caught and escaped flags are logically consistent",
        )
    check(
            (df.loc[~df["review_caught"], "rework_min"] == 0).all(),
            "No caught error means zero rework time",
        )
    check(
            (df.loc[df["ai_correct"], "error_severity"] == 0).all(),
            "Correct AI outputs have zero error severity",
        )

    print("\nCategory counts:")
    print(df["category"].value_counts().to_string())
    print("\nALL DATA QUALITY CHECKS PASSED")


if __name__ == "__main__":
    main()
