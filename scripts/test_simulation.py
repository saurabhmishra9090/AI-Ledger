
"""Automated tests for AI Ledger Monte Carlo simulation."""

import numpy as np
import pytest

from scripts.simulation import (
    ACCURACY_UNCERTAINTY,
    N_SIMULATIONS,
    SEED,
    calculate_scenario,
    calculate_break_even_accuracy,
    load_task_data,
    run_monte_carlo,
    run_sensitivity,
)


@pytest.fixture(scope="module")
def tasks():
    return load_task_data()


def test_simulation_is_reproducible(tasks):
    first = run_monte_carlo(tasks)
    second = run_monte_carlo(tasks)

    assert first.equals(second)


def test_simulation_has_expected_number_of_trials(tasks):
    results = run_monte_carlo(tasks)
    assert len(results) == N_SIMULATIONS


def test_percentiles_are_ordered(tasks):
    results = run_monte_carlo(tasks)
    values = results["net_value_after_setup"]

    p10, p50, p90 = np.percentile(values, [10, 50, 90])

    assert p10 <= p50 <= p90


def test_all_simulation_values_are_finite(tasks):
    results = run_monte_carlo(tasks)

    assert np.isfinite(
        results["net_value_after_setup"].to_numpy()
    ).all()


def test_higher_accuracy_does_not_reduce_net_value(tasks):
    lower = calculate_scenario(
        tasks,
        accuracy_shift=-ACCURACY_UNCERTAINTY,
    )
    higher = calculate_scenario(
        tasks,
        accuracy_shift=ACCURACY_UNCERTAINTY,
    )

    assert higher >= lower


def test_higher_ai_cost_does_not_increase_net_value(tasks):
    base = calculate_scenario(
        tasks,
        accuracy_shift=0.0,
        ai_cost=0.02,
    )
    higher_cost = calculate_scenario(
        tasks,
        accuracy_shift=0.0,
        ai_cost=0.04,
    )

    assert higher_cost < base


def test_sensitivity_contains_expected_scenarios(tasks):
    results = run_sensitivity(tasks)

    expected = {
        "Base case",
        "Accuracy -2pp",
        "Accuracy +2pp",
        "Hourly cost -20%",
        "Hourly cost +20%",
        "AI cost doubled",
        "Error cost doubled",
    }

    assert set(results["scenario"]) == expected


def test_simulation_uses_fixed_seed():
    assert SEED == 42
    
