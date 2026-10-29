
-- ============================================================
-- AI LEDGER: DUCKDB COST-VALUE LEDGER
-- All business parameters are ASSUMPTIONS.
-- Input records are SYNTHETIC SIMULATION data.
-- ============================================================

-- 1. Load generated task data
CREATE OR REPLACE TABLE fact_task AS
SELECT *
FROM read_csv_auto(
    'data/raw/fact_task.csv',
    header = true
);

-- 2. Central model assumptions
CREATE OR REPLACE TABLE params AS
SELECT
    30.0   AS hourly_rate,
    40.0   AS escaped_error_cost,
    2000.0 AS setup_cost,
    0.02   AS default_ai_cost,
    0.85   AS review_catch_rate,
    'ASSUMPTION' AS parameter_label;

-- 3. Category configuration
CREATE OR REPLACE TABLE dim_category AS
SELECT *
FROM (
    VALUES
        ('Billing',    8.0, 0.96, 2.0,  5.0, 1.0, 0.30),
        ('Technical', 12.0, 0.88, 3.5, 10.0, 1.8, 0.20),
        ('Account',    7.0, 0.95, 2.0,  5.0, 1.0, 0.25),
        ('Returns',    9.0, 0.92, 2.5,  7.0, 1.3, 0.15),
        ('Complaints',14.0, 0.82, 4.0, 12.0, 2.2, 0.10)
) AS t(
    category,
    baseline_min,
    base_accuracy,
    assumed_review_min,
    assumed_rework_min,
    severity_multiplier,
    volume_share
);

-- 4. Task-level cost and value ledger
CREATE OR REPLACE VIEW ledger AS
SELECT
    f.task_id,
    f.category,
    f.ai_correct,
    f.review_caught,
    f.escaped,
    f.escalated,

    d.baseline_min / 60.0
        * p.hourly_rate AS baseline_cost,

    f.ai_cost AS ai_usage_cost,

    (f.review_min + f.edit_min) / 60.0
        * p.hourly_rate AS review_cost,

    f.rework_min / 60.0
        * p.hourly_rate AS rework_cost,

    CASE
        WHEN f.escaped
        THEN f.error_severity * p.escaped_error_cost
        ELSE 0.0
    END AS error_cost,

    d.baseline_min / 60.0 * p.hourly_rate
        - f.ai_cost
        - (f.review_min + f.edit_min) / 60.0 * p.hourly_rate
        - f.rework_min / 60.0 * p.hourly_rate
        - CASE
            WHEN f.escaped
            THEN f.error_severity * p.escaped_error_cost
            ELSE 0.0
          END AS net_value

FROM fact_task f
JOIN dim_category d USING (category)
CROSS JOIN params p;

-- 5. Category-level decision support
CREATE OR REPLACE VIEW category_summary AS
SELECT
    category,
    COUNT(*) AS tasks,
    ROUND(AVG(net_value), 2) AS net_per_task,
    ROUND(AVG(escaped::INT), 4) AS escaped_error_rate,
    ROUND(
        SUM(review_cost) / NULLIF(SUM(baseline_cost), 0),
        3
    ) AS review_burden,

    CASE
        WHEN AVG(net_value) <= 0
            THEN 'KEEP HUMAN'
        WHEN AVG(escaped::INT) < 0.02
            THEN 'AUTOMATE'
        ELSE 'ASSIST'
    END AS verdict

FROM ledger
GROUP BY category;

-- 6. Cost composition for dashboard charts
CREATE OR REPLACE VIEW cost_breakdown AS
SELECT 'AI usage' AS component, SUM(ai_usage_cost) AS cost
FROM ledger

UNION ALL

SELECT 'Review', SUM(review_cost)
FROM ledger

UNION ALL

SELECT 'Rework', SUM(rework_cost)
FROM ledger

UNION ALL

SELECT 'Escaped errors', SUM(error_cost)
FROM ledger;

-- 7. Cumulative value after one-time setup cost
CREATE OR REPLACE VIEW cumulative AS
SELECT
    task_id,
    SUM(net_value) OVER (
        ORDER BY task_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) - (SELECT setup_cost FROM params)
      AS cum_net_after_setup
FROM ledger;
