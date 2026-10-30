
"""AI Ledger: execute the DuckDB SQL model and verify its outputs."""

from __future__ import annotations

import os
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
SQL_FILE = ROOT / "sql" / "ledger.sql"
DB_FILE = ROOT / "data" / "processed" / "ai_ledger.duckdb"

EXPECTED_TASKS = 20_000
EXPECTED_CATEGORIES = 5


def main() -> None:
    if not SQL_FILE.is_file():
        raise FileNotFoundError(f"SQL file not found: {SQL_FILE}")

    if not (ROOT / "data" / "raw" / "fact_task.csv").is_file():
        raise FileNotFoundError("Synthetic task CSV has not been generated.")

    DB_FILE.parent.mkdir(parents=True, exist_ok=True)

    # SQL reads the CSV using a project-relative path.
    os.chdir(ROOT)

    print("AI LEDGER — DUCKDB ANALYSIS")
    print("=" * 44)
    print(f"Database: {DB_FILE}")
    print(f"SQL model: {SQL_FILE}")

    with duckdb.connect(str(DB_FILE)) as con:
        sql_text = SQL_FILE.read_text(encoding="utf-8")
        con.execute(sql_text)

        # Verify imported task data.
        task_count = con.execute(
            "SELECT COUNT(*) FROM fact_task"
        ).fetchone()[0]

        assert task_count == EXPECTED_TASKS, (
            f"Expected {EXPECTED_TASKS} tasks, got {task_count}"
        )
        print(f"\nPASS: {task_count:,} tasks loaded into DuckDB")

        # Verify ledger has one row per task.
        ledger_count = con.execute(
            "SELECT COUNT(*) FROM ledger"
        ).fetchone()[0]

        assert ledger_count == EXPECTED_TASKS
        print(f"PASS: Ledger contains {ledger_count:,} rows")

        # Verify category configuration and task allocation.
        category_count = con.execute(
            "SELECT COUNT(*) FROM category_summary"
        ).fetchone()[0]

        assert category_count == EXPECTED_CATEGORIES
        print(f"PASS: {category_count} category summaries generated")

        # Verify all calculated cost values are finite and non-null.
        invalid_costs = con.execute("""
            SELECT COUNT(*)
            FROM ledger
            WHERE baseline_cost IS NULL
               OR ai_usage_cost IS NULL
               OR review_cost IS NULL
               OR rework_cost IS NULL
               OR error_cost IS NULL
               OR net_value IS NULL
               OR NOT isfinite(baseline_cost)
               OR NOT isfinite(ai_usage_cost)
               OR NOT isfinite(review_cost)
               OR NOT isfinite(rework_cost)
               OR NOT isfinite(error_cost)
               OR NOT isfinite(net_value)
        """).fetchone()[0]

        assert invalid_costs == 0, (
            f"{invalid_costs} ledger rows contain invalid cost values"
        )
        print("PASS: All ledger cost calculations are finite and non-null")

        # Verify cost composition has the expected four components.
        breakdown = con.execute("""
            SELECT component, ROUND(cost, 2) AS cost
            FROM cost_breakdown
            ORDER BY component
        """).fetchall()

        assert len(breakdown) == 4
        print("\nCOST BREAKDOWN (₹)")
        for component, cost in breakdown:
            print(f"  {component:<20} ₹{cost:,.2f}")

        # Print category decisions for inspection.
        categories = con.execute("""
            SELECT
                category,
                tasks,
                net_per_task,
                escaped_error_rate,
                review_burden,
                verdict
            FROM category_summary
            ORDER BY category
        """).fetchall()

        print("\nCATEGORY SUMMARY")
        print(
            f"{'Category':<13} {'Tasks':>7} {'Net/task':>11} "
            f"{'Escaped':>10} {'Review':>9} {'Verdict':>12}"
        )
        for row in categories:
            category, tasks, net, escaped_rate, review, verdict = row
            print(
                f"{category:<13} {tasks:>7,} {net:>11.2f} "
                f"{escaped_rate:>9.2%} {review:>8.3f} {verdict:>12}"
            )

        # Payback check: first task where cumulative net value
        # after setup becomes non-negative, if one exists.
        payback = con.execute("""
            SELECT MIN(task_id)
            FROM cumulative
            WHERE cum_net_after_setup >= 0
        """).fetchone()[0]

        if payback is None:
            print("\nPayback: not reached in this simulation.")
        else:
            print(f"\nPayback reached at task #{payback:,}.")

        # Export SQL results for the dashboard.
        output_dir = ROOT / "exports"
        output_dir.mkdir(parents=True, exist_ok=True)

        con.execute("""
            COPY (
                SELECT * FROM category_summary ORDER BY category
            )
            TO 'exports/category_summary.json'
            (FORMAT JSON, ARRAY true)
        """)

        con.execute("""
            COPY (
                SELECT * FROM cost_breakdown ORDER BY component
            )
            TO 'exports/cost_breakdown.json'
            (FORMAT JSON, ARRAY true)
        """)

        con.execute("""
            COPY (
                SELECT
                    task_id,
                    category,
                    baseline_cost,
                    ai_usage_cost,
                    review_cost,
                    rework_cost,
                    error_cost,
                    net_value
                FROM ledger
                ORDER BY task_id
            )
            TO 'exports/ledger.json'
            (FORMAT JSON, ARRAY true)
        """)
        
        # Export cumulative payback data for the dashboard.
        con.execute("""
            COPY (
                SELECT
                    task_id,
                    cum_net_after_setup
                FROM cumulative
                ORDER BY task_id
            )
            TO 'exports/cumulative_payback.json'
            (FORMAT JSON, ARRAY true)
        """)


        print("\nPASS: Dashboard JSON exports created")

    print("\nALL SQL MODEL CHECKS PASSED")
    print("Synthetic simulation only; business parameters are assumptions.")


if __name__ == "__main__":
    main()
