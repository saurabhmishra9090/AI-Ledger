
"""Independent validation of AI Ledger financial calculations."""

from pathlib import Path

import duckdb
import pytest

ROOT = Path(__file__).resolve().parent.parent
DB_FILE = ROOT / "data" / "processed" / "ai_ledger.duckdb"


@pytest.fixture
def con():
    assert DB_FILE.is_file(), "Run scripts/run_analysis.py first."
    connection = duckdb.connect(str(DB_FILE), read_only=True)
    yield connection
    connection.close()


def test_ledger_has_exactly_20000_tasks(con):
    count = con.execute("SELECT COUNT(*) FROM ledger").fetchone()[0]
    assert count == 20_000


def test_task_ids_are_unique(con):
    total, unique = con.execute("""
        SELECT COUNT(*), COUNT(DISTINCT task_id)
        FROM ledger
    """).fetchone()
    assert total == unique


def test_net_value_matches_independent_formula(con):
    rows = con.execute("""
        SELECT
            baseline_cost,
            ai_usage_cost,
            review_cost,
            rework_cost,
            error_cost,
            net_value
        FROM ledger
        ORDER BY task_id
        LIMIT 100
    """).fetchall()

    assert len(rows) == 100

    for baseline, ai, review, rework, error, net in rows:
        independently_calculated = (
            baseline - ai - review - rework - error
        )
        assert net == pytest.approx(
            independently_calculated, abs=1e-9
        )


def test_error_cost_only_applies_to_escaped_errors(con):
    invalid = con.execute("""
        SELECT COUNT(*)
        FROM ledger
        WHERE (escaped AND error_cost < 0)
           OR (NOT escaped AND error_cost <> 0)
    """).fetchone()[0]
    assert invalid == 0


def test_category_counts_match_weighted_allocation(con):
    actual = dict(con.execute("""
        SELECT category, COUNT(*)
        FROM fact_task
        GROUP BY category
    """).fetchall())

    expected = {
        "Billing": 6000,
        "Technical": 4000,
        "Account": 5000,
        "Returns": 3000,
        "Complaints": 2000,
    }
    assert actual == expected


def test_category_summary_covers_all_categories(con):
    count = con.execute("""
        SELECT COUNT(DISTINCT category)
        FROM category_summary
    """).fetchone()[0]
    assert count == 5


def test_cost_breakdown_matches_ledger_totals(con):
    breakdown_total = con.execute("""
        SELECT SUM(cost) FROM cost_breakdown
    """).fetchone()[0]

    ledger_total = con.execute("""
        SELECT SUM(
            ai_usage_cost + review_cost + rework_cost + error_cost
        )
        FROM ledger
    """).fetchone()[0]

    assert breakdown_total == pytest.approx(
        ledger_total, abs=0.01
    )


def test_cumulative_value_includes_setup_cost(con):
    first_value = con.execute("""
        SELECT cum_net_after_setup
        FROM cumulative
        WHERE task_id = (
            SELECT MIN(task_id) FROM ledger
        )
    """).fetchone()[0]

    first_task_net = con.execute("""
        SELECT net_value FROM ledger ORDER BY task_id LIMIT 1
    """).fetchone()[0]

    assert first_value == pytest.approx(
        first_task_net - 2000.0, abs=1e-9
    )
