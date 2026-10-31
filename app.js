
/* ==========================================================
   AI LEDGER — DASHBOARD DATA CONTROLLER
   Data source: Python + DuckDB JSON exports
   ========================================================== */

"use strict";

const AILedgerApp = (() => {
  const state = {
    categories: [],
    costs: [],
    ledger: [],
    simulation: null,
    sensitivity: [],
    monteCarlo: [],
    page: 1,
    pageSize: 25,
    loading: false
  };

  const $ = (selector) => document.querySelector(selector);

  const money = (value) =>
    Number(value || 0).toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    });

  const number = (value, digits = 2) =>
    Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: digits
    });

  const percent = (value, digits = 2) =>
    `${(Number(value || 0) * 100).toFixed(digits)}%`;

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  
let toastTimer;

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("visible");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("visible");
  }, 3000);
}


  async function loadJSON(filename) {
    const response = await fetch(`exports/${filename}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        `${filename}: HTTP ${response.status}. Check the file path.`
      );
    }

    return response.json();
  }

  function validateArray(value, filename) {
    if (!Array.isArray(value)) {
      throw new Error(`${filename} must contain a JSON array.`);
    }
    return value;
  }

  function validateData() {
    const required = [
      ["category_summary.json", state.categories],
      ["cost_breakdown.json", state.costs],
      ["ledger.json", state.ledger],
      ["sensitivity.json", state.sensitivity],
      ["monte_carlo.json", state.monteCarlo]
    ];

    for (const [filename, rows] of required) {
      validateArray(rows, filename);
    }

    if (!state.simulation ||
        typeof state.simulation !== "object" ||
        !state.simulation.net_value_after_setup) {
      throw new Error(
        "simulation_summary.json has an unexpected schema."
      );
    }

    const ledgerFields = [
      "task_id", "category", "baseline_cost",
      "ai_usage_cost", "review_cost", "rework_cost",
      "error_cost", "net_value"
    ];

    if (state.ledger.length) {
      for (const field of ledgerFields) {
        if (!(field in state.ledger[0])) {
          throw new Error(`ledger.json is missing ${field}.`);
        }
      }
    }
  }

  async function loadAllData() {
    if (state.loading) return;

    state.loading = true;
    showToast("Loading exported analytics data…");
    const refreshButton = $("#refresh-data");
    refreshButton?.classList.add("is-loading");
    refreshButton?.setAttribute("disabled", "");

    try {
      const [
        categories,
        costs,
        ledger,
        simulation,
        sensitivity,
        monteCarlo
      ] = await Promise.all([
        loadJSON("category_summary.json"),
        loadJSON("cost_breakdown.json"),
        loadJSON("ledger.json"),
        loadJSON("simulation_summary.json"),
        loadJSON("sensitivity.json"),
        loadJSON("monte_carlo.json")
      ]);

      state.categories = validateArray(
        categories, "category_summary.json"
      );
      state.costs = validateArray(costs, "cost_breakdown.json");
      state.ledger = validateArray(ledger, "ledger.json");
      state.simulation = simulation;
      state.sensitivity = validateArray(
        sensitivity, "sensitivity.json"
      );
      state.monteCarlo = validateArray(
        monteCarlo, "monte_carlo.json"
      );

      validateData();

      renderAll();
      showToast("Dashboard data loaded successfully.");
    } catch (error) {
      console.error("AI Ledger data loading failed:", error);

      showToast(
        `Data loading failed: ${error.message}. Check exports and server.`
      );

      renderLoadError(error.message);
    } finally {
      state.loading = false;
      refreshButton?.classList.remove("is-loading");
      refreshButton?.removeAttribute("disabled");
    }
  }

  function renderLoadError(message) {
    for (const id of [
      "category-table-body",
      "ledger-table-body"
    ]) {
      const element = document.getElementById(id);
      if (element) {
        element.innerHTML =
          `<tr><td colspan="8">${escapeHTML(message)}</td></tr>`;
      }
    }

    for (const id of [
      "cost-chart",
      "monte-carlo-chart",
      "sensitivity-chart",
      "payback-chart"
    ]) {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = "Data unavailable. Check console.";
      }
    }
  }

  
function renderKPIs() {
  const simulation = state.simulation;
  const distribution = simulation.net_value_after_setup;

  const netValueElement = $("#kpi-net-value");
  if (netValueElement) {
    netValueElement.textContent = money(distribution.p50);
  }

  // Break-even accuracy: show only when a verified value exists.
  const breakEvenElement = $("#kpi-break-even");
  const breakEvenShift = Number(simulation.break_even_accuracy_shift);

  if (breakEvenElement) {
    breakEvenElement.textContent =
      Number.isFinite(breakEvenShift) &&
      simulation.break_even_accuracy_shift !== null &&
      simulation.break_even_accuracy_shift !== ""
        ? `${(breakEvenShift * 100).toFixed(2)} pp`
        : "N/A";
  }

  const baselineTotal = state.ledger.reduce(
    (sum, row) => sum + Number(row.baseline_cost || 0),
    0
  );

  const reviewTotal = state.ledger.reduce(
    (sum, row) => sum + Number(row.review_cost || 0),
    0
  );

  const reviewBurdenElement = $("#kpi-review-burden");
  if (reviewBurdenElement) {
    reviewBurdenElement.textContent =
      baselineTotal > 0
        ? percent(reviewTotal / baselineTotal)
        : "N/A";
  }

  const escapedTasks = state.ledger.filter(
    row => Number(row.error_cost || 0) > 0
  ).length;

  const errorRateElement = $("#kpi-error-rate");
  if (errorRateElement) {
    errorRateElement.textContent =
      state.ledger.length > 0
        ? percent(escapedTasks / state.ledger.length)
        : "N/A";
  }
}

function renderInsights() {
  // 1. Largest cost contributor
  const costTitle = $("#insight-cost-title");
  const costDescription = $("#insight-cost-description");

  const costs = Array.isArray(state.costs) ? state.costs : [];

  if (costs.length && costTitle && costDescription) {
    const largestCost = [...costs].sort(
      (a, b) => Number(b.cost) - Number(a.cost)
    )[0];

    costTitle.textContent = `${largestCost.component} is the largest cost`;
    costDescription.textContent =
      `${money(largestCost.cost)} estimated cost in this synthetic model.`;
  }

  // 2. Simulation outcome
  const valueTitle = $("#insight-value-title");
  const valueDescription = $("#insight-value-description");

  const p50 = Number(state.simulation?.net_value_after_setup?.p50);

  if (valueTitle && valueDescription && Number.isFinite(p50)) {
    valueTitle.textContent =
      p50 >= 0 ? "Positive median net value" : "Negative median net value";

    valueDescription.textContent =
      `Estimated median net value after setup: ${money(p50)}.`;
  }

  // 3. Operational efficiency
  const efficiencyTitle = $("#insight-efficiency-title");
  const efficiencyDescription = $("#insight-efficiency-description");

  const categories = Array.isArray(state.categories)
    ? state.categories
    : [];

  if (categories.length && efficiencyTitle && efficiencyDescription) {
    const highestReview = [...categories].sort(
      (a, b) => Number(b.review_burden) - Number(a.review_burden)
    )[0];

    efficiencyTitle.textContent =
      `${highestReview.category} has the highest review burden`;

    efficiencyDescription.textContent =
      `Review burden: ${percent(highestReview.review_burden)}. ` +
      `Escaped error rate: ${percent(highestReview.escaped_error_rate)}.`;
  }
}


function renderTopCategories() {
    const container = $("#top-categories-grid");
    if (!container) return;

    const categories = Array.isArray(state.categories)
        ? state.categories
        : [];

    if (!categories.length) {
        container.innerHTML = `
            <article class="card">
                <p>No category data available.</p>
            </article>
        `;
        return;
    }

    const topThree = [...categories]
        .sort((a, b) =>
            Number(b.net_per_task || 0) - Number(a.net_per_task || 0)
        )
        .slice(0, 3);

    const categoryInfo = (category) => {
        const name = String(category).toLowerCase();

        if (name.includes("bill")) {
            return {
                icon: "▤",
                description: "Invoicing and billing related costs and adjustments."
            };
        }

        if (name.includes("technical")) {
            return {
                icon: "⚙",
                description: "Technical operations and service related costs."
            };
        }

        if (name.includes("return")) {
            return {
                icon: "↶",
                description: "Product returns and refund processing costs."
            };
        }

        return {
            icon: "▣",
            description: "Category performance and operational cost analysis."
        };
    };

    container.innerHTML = topThree.map((row, index) => {
        const category = String(row.category || "Unclassified");
        const info = categoryInfo(category);
        const categoryKey = category.toLowerCase().replace(/[^a-z0-9]+/g, "-");

        const review = Math.max(
            0,
            Math.min(100, Number(row.review_burden || 0) * 100)
        );

        return `
            <article class="category-feature-card">

                <div class="category-card-header">

                 <div class="category-icon category-icon-${categoryKey}">
                        ${info.icon}
                    </div>

                    <div class="category-heading">
                        <span class="rank-badge">
                            RANK ${index + 1}
                        </span>

                        <h3>${escapeHTML(category)}</h3>

                        <p>${info.description}</p>
                    </div>

                    <div class="category-mini-bars" aria-hidden="true">
                        <span></span>
                        <span></span>
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>

                </div>

                <div class="category-metrics">

                    <div class="category-metric-row">
                    <div class="metric-icon metric-icon-tasks">
    <svg viewBox="0 0 24 24" width="27" height="27"
         fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round">
        <path d="M12 3 3 8l9 5 9-5-9-5Z"/>
        <path d="m3 12 9 5 9-5"/>
        <path d="m3 16 9 5 9-5"/>
    </svg>
</div>
                        <div class="metric-details">
                            <span>Total Tasks</span>
                            <strong>${number(row.tasks || 0)}</strong>
                        </div>
                    </div>

                    <div class="category-metric-row">
                      <div class="metric-icon metric-icon-value">₹</div>

                        <div class="metric-details">
                            <span>Net value per task</span>
                            <strong>${money(row.net_per_task)}</strong>
                        </div>
                    </div>

                    <div class="category-metric-row review-metric">
                      <div class="metric-icon metric-icon-review">🛡</div>

                        <div class="metric-details">
                            <span>Review burden</span>
                            <strong>${review.toFixed(2)}%</strong>

                            <div class="review-progress">
                                <div style="width: ${review}%"></div>
                            </div>
                        </div>
                    </div>

                </div>

            </article>
        `;
    }).join("");
}

  function renderCategoryTable() {
    const tbody = $("#category-table-body");
    if (!tbody) return;

    tbody.innerHTML = state.categories.map(row => {
      const verdict = String(row.verdict || "UNCLASSIFIED");
      const verdictClass = ({
        "AUTOMATE": "verdict-automate",
        "ASSIST": "verdict-assist",
        "KEEP HUMAN": "verdict-human"
      })[verdict] || "";

      return `
        <tr>
     <td>
  <span class="ledger-category-badge ${String(row.category).toLowerCase()}">
    ${escapeHTML(row.category)}
  </span>
</td>
          <td>${number(row.tasks, 0)}</td>
          <td>${money(row.net_per_task)}</td>
          <td>${percent(row.escaped_error_rate)}</td>
          <td>${percent(row.review_burden)}</td>
          <td>
            <span class="verdict ${verdictClass}">
              ${escapeHTML(verdict)}
            </span>
          </td>
        </tr>
      `;
    }).join("");
  }

  function getFilteredLedger() {
    const search = ($("#ledger-search")?.value || "")
      .trim().toLowerCase();

    const category = $("#ledger-category")?.value || "";

    return state.ledger.filter(row => {
      const matchesSearch =
        String(row.task_id).toLowerCase().includes(search) ||
        String(row.category).toLowerCase().includes(search);

      const matchesCategory =
        !category || row.category === category;

      return matchesSearch && matchesCategory;
    });
  }

  function renderLedger() {
    const tbody = $("#ledger-table-body");
    if (!tbody) return;

    const rows = getFilteredLedger();
    const totalPages = Math.max(
      1, Math.ceil(rows.length / state.pageSize)
    );

    state.page = Math.min(state.page, totalPages);

    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);

    tbody.innerHTML = pageRows.map(row => `
      <tr>
        <td>${number(row.task_id, 0)}</td>
        <td>
  <span class="ledger-category-badge ${String(row.category).toLowerCase()}">
    ${escapeHTML(row.category)}
  </span>
</td>
        <td>${money(row.baseline_cost)}</td>
        <td>${money(row.ai_usage_cost)}</td>
        <td>${money(row.review_cost)}</td>
        <td>${money(row.rework_cost)}</td>
        <td>${money(row.error_cost)}</td>
        <td class="${Number(row.net_value) >= 0 ? "positive-value" : "negative-value"}">
          ${money(row.net_value)}
        </td>
      </tr>
    `).join("");

    if (!pageRows.length) {
      tbody.innerHTML =
        '<tr><td colspan="8">No matching task records.</td></tr>';
    }

    $("#ledger-count").textContent =
      `${number(rows.length, 0)} matching tasks`;

    $("#ledger-page-info").textContent =
      `Page ${state.page} of ${totalPages}`;

    $("#ledger-prev").disabled = state.page <= 1;
    $("#ledger-next").disabled = state.page >= totalPages;
  }

  function renderCharts() {
    const charts = window.AILedgerCharts;

    if (!charts) {
      throw new Error(
        "charts.js did not load. Check the script filename."
      );
    }

    charts.renderCostBreakdown(state.costs);
    charts.renderMonteCarlo(state.monteCarlo);
    charts.renderSensitivity(state.sensitivity);

    // This chart requires cumulative.json, which will be
    // exported from DuckDB in a later verified step.
    charts.renderPayback([]);
  }

  function renderAll() {
    renderKPIs();
    renderInsights();
    renderTopCategories();
    renderCategoryTable();
    renderLedger();
    renderCharts();
  }

  function downloadCSV(filename, rows, columns) {
    if (!rows.length) {
      showToast("No rows available to export.");
      return;
    }

    const quote = value =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const csv = [
      columns.map(column => quote(column.label)).join(","),
      ...rows.map(row =>
        columns.map(column => quote(row[column.key])).join(",")
      )
    ].join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    anchor.click();

    URL.revokeObjectURL(url);
    showToast(`${filename} export requested.`);
  }

  function bindEvents() {
    $("#refresh-data")?.addEventListener("click", loadAllData);

    $("#ledger-search")?.addEventListener("input", () => {
      state.page = 1;
      renderLedger();
    });

    $("#ledger-category")?.addEventListener("change", () => {
      state.page = 1;
      renderLedger();
    });

    $("#ledger-prev")?.addEventListener("click", () => {
      state.page = Math.max(1, state.page - 1);
      renderLedger();
    });

    $("#ledger-next")?.addEventListener("click", () => {
      state.page++;
      renderLedger();
    });

    $("#export-categories")?.addEventListener("click", () => {
      downloadCSV("ai-ledger-categories.csv", state.categories, [
        { key: "category", label: "Category" },
        { key: "tasks", label: "Tasks" },
        { key: "net_per_task", label: "Net per task" },
        { key: "escaped_error_rate", label: "Escaped error rate" },
        { key: "review_burden", label: "Review burden" },
        { key: "verdict", label: "Model verdict" }
      ]);
    });

    $("#export-ledger")?.addEventListener("click", () => {
      downloadCSV("ai-ledger-task-records.csv", getFilteredLedger(), [
        { key: "task_id", label: "Task ID" },
        { key: "category", label: "Category" },
        { key: "baseline_cost", label: "Baseline cost" },
        { key: "ai_usage_cost", label: "AI usage cost" },
        { key: "review_cost", label: "Review cost" },
        { key: "rework_cost", label: "Rework cost" },
        { key: "error_cost", label: "Error cost" },
        { key: "net_value", label: "Net value" }
      ]);
    });

    $("#recalculate-model")?.addEventListener("click", () => {
      showToast(
        "Assumptions are not recalculated in the browser yet. " +
        "We will connect them to the Python model in a later step."
      );
    });

    document.querySelectorAll(".nav-link").forEach(link => {
      link.addEventListener("click", () => {
        document.querySelectorAll(".nav-link").forEach(item =>
          item.classList.remove("active")
        );

        link.classList.add("active");
      });
    });

    $("#menu-toggle")?.addEventListener("click", () => {
      const sidebar = $("#sidebar");
      if (!sidebar) return;

      const open = sidebar.classList.toggle("sidebar-open");
      $("#menu-toggle").setAttribute("aria-expanded", String(open));
    });
  }

  function init() {
    bindEvents();
    loadAllData();
  }

  return { init, loadAllData };
})();

document.addEventListener("DOMContentLoaded", AILedgerApp.init);
