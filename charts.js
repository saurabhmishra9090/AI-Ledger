
/* ==========================================================
   AI LEDGER — VANILLA SVG CHART ENGINE
   Uses real exported JSON. No external chart library.
   ========================================================== */

(() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";

  const COLORS = {
    burgundy: "#470038",
    plum: "#2A0828",
    surface: "#5A124F",
    magenta: "#E84BD8",
    pink: "#F49CEB",
    ivory: "#F7F0E8",
    mauve: "#BBA8B8",
    mint: "#55D6A6",
    coral: "#FF7D8A",
    grid: "rgba(187,168,184,0.22)"
  };

  const money = value =>
    "₹" + Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 0
    });

  const number = value =>
    Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2
    });

  function svgElement(tag, attributes = {}, text = null) {
    const element = document.createElementNS(NS, tag);

    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });

    if (text !== null) {
      element.textContent = text;
    }

    return element;
  }

  function createChart(containerId, title, width = 520, height = 300) {
    const container = document.getElementById(containerId);

    if (!container) {
      return null;
    }

    container.replaceChildren();

    const svg = svgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      width: "100%",
      role: "img",
      "aria-label": title,
      preserveAspectRatio: "xMidYMid meet"
    });

    container.appendChild(svg);
    return { container, svg, width, height };
  }

  function addText(svg, x, y, text, options = {}) {
    svg.appendChild(svgElement("text", {
      x,
      y,
      fill: options.color || COLORS.mauve,
      "font-size": options.size || 11,
      "font-weight": options.weight || 400,
      "text-anchor": options.anchor || "start"
    }, text));
  }

  function renderEmpty(containerId, message) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.replaceChildren();

    const text = document.createElement("p");
    text.textContent = message;
    text.style.color = COLORS.mauve;
    text.style.padding = "24px 8px";
    text.style.textAlign = "center";
    container.appendChild(text);
  }

  // 1. Cost composition — SVG donut chart.
  function renderCostBreakdown(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      renderEmpty("cost-chart", "Cost data unavailable.");
      return;
    }

    const validRows = rows.filter(row =>
      Number.isFinite(Number(row.cost)) && Number(row.cost) >= 0
    );

    const total = validRows.reduce(
      (sum, row) => sum + Number(row.cost), 0
    );

    if (!validRows.length || total <= 0) {
      renderEmpty("cost-chart", "No positive cost values to chart.");
      return;
    }

    const chart = createChart("cost-chart", "Cost composition", 520, 300);
    if (!chart) return;

    const { svg } = chart;
    const cx = 145;
    const cy = 140;
    const radius = 78;
    const stroke = 27;
    const circumference = 2 * Math.PI * radius;

    const palette = [
      COLORS.magenta,
      COLORS.pink,
      COLORS.mauve,
      COLORS.coral
    ];

    svg.appendChild(svgElement("circle", {
      cx, cy, r: radius,
      fill: "none",
      stroke: COLORS.plum,
      "stroke-width": stroke
    }));

    let offset = 0;

    validRows.forEach((row, index) => {
      const value = Number(row.cost);
      const length = (value / total) * circumference;

      svg.appendChild(svgElement("circle", {
        cx, cy, r: radius,
        fill: "none",
        stroke: palette[index % palette.length],
        "stroke-width": stroke,
        "stroke-dasharray": `${length} ${circumference - length}`,
        "stroke-dashoffset": -offset,
        transform: `rotate(-90 ${cx} ${cy})`
      }));

      offset += length;
    });

    addText(svg, cx, cy - 5, money(total), {
      color: COLORS.ivory, size: 17, weight: 700, anchor: "middle"
    });
    addText(svg, cx, cy + 16, "Total cost", {
      color: COLORS.mauve, size: 11, anchor: "middle"
    });

    validRows.forEach((row, index) => {
      const y = 75 + index * 43;
      const value = Number(row.cost);
      const percentage = (value / total) * 100;

      svg.appendChild(svgElement("circle", {
        cx: 280, cy: y - 4, r: 5,
        fill: palette[index % palette.length]
      }));

      addText(svg, 294, y, row.component, {
        color: COLORS.ivory, size: 11
      });

      addText(svg, 505, y, `${percentage.toFixed(1)}%`, {
        color: COLORS.ivory, size: 11, anchor: "end"
      });

      addText(svg, 294, y + 15, money(value), {
        color: COLORS.mauve, size: 10
      });
    });
  }

  // 2. Monte Carlo distribution — histogram of simulated values.
  function renderMonteCarlo(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      renderEmpty("monte-carlo-chart", "Simulation data unavailable.");
      return;
    }

    const values = rows
      .map(row => Number(row.net_value_after_setup))
      .filter(Number.isFinite);

    if (!values.length) {
      renderEmpty("monte-carlo-chart", "No valid simulation values.");
      return;
    }

    const chart = createChart(
      "monte-carlo-chart", "Monte Carlo distribution", 520, 300
    );
    if (!chart) return;

    const { svg } = chart;
    const left = 45;
    const right = 18;
    const top = 25;
    const bottom = 48;
    const plotW = chart.width - left - right;
    const plotH = chart.height - top - bottom;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const bins = 18;
    const counts = Array(bins).fill(0);

    values.forEach(value => {
      const index = Math.min(
        bins - 1,
        Math.floor(((value - min) / range) * bins)
      );
      counts[index]++;
    });

    const maxCount = Math.max(...counts, 1);
    const barGap = 3;
    const barW = plotW / bins;

    for (let i = 0; i < 4; i++) {
      const y = top + (plotH * i) / 3;

      svg.appendChild(svgElement("line", {
        x1: left, y1: y, x2: left + plotW, y2: y,
        stroke: COLORS.grid,
        "stroke-dasharray": "3 4"
      }));
    }

    counts.forEach((count, index) => {
      const barH = (count / maxCount) * plotH;
      svg.appendChild(svgElement("rect", {
        x: left + index * barW + barGap / 2,
        y: top + plotH - barH,
        width: Math.max(1, barW - barGap),
        height: barH,
        rx: 2,
        fill: COLORS.magenta,
        opacity: 0.85
      }));
    });

    const p50 = values.slice().sort((a, b) => a - b)[
      Math.floor((values.length - 1) * 0.5)
    ];

    const medianX = left + ((p50 - min) / range) * plotW;

    svg.appendChild(svgElement("line", {
      x1: medianX, y1: top,
      x2: medianX, y2: top + plotH,
      stroke: COLORS.mint,
      "stroke-width": 2,
      "stroke-dasharray": "5 4"
    }));

    addText(svg, left, 15, `${values.length.toLocaleString()} simulations`, {
      color: COLORS.mauve, size: 10
    });

    addText(svg, left, chart.height - 19, money(min), {
      color: COLORS.mauve, size: 10
    });

    addText(svg, left + plotW, chart.height - 19, money(max), {
      color: COLORS.mauve, size: 10, anchor: "end"
    });

    addText(svg, medianX, chart.height - 33, "Median", {
      color: COLORS.mint, size: 10, anchor: "middle"
    });
  }

  // 3. Sensitivity — compare net value across named scenarios.
  function renderSensitivity(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      renderEmpty("sensitivity-chart", "Sensitivity data unavailable.");
      return;
    }

    const valid = rows.filter(row =>
      Number.isFinite(Number(row.net_value_after_setup))
    );

    if (!valid.length) {
      renderEmpty("sensitivity-chart", "No valid sensitivity values.");
      return;
    }

    const chart = createChart(
      "sensitivity-chart", "Sensitivity analysis", 620, 340
    );
    if (!chart) return;

    const { svg } = chart;
    const left = 165;
    const right = 95;
    const top = 22;
    const rowH = 39;
    const max = Math.max(
      1,
      ...valid.map(row => Math.abs(Number(row.net_value_after_setup)))
    );
    const plotW = chart.width - left - right;

    valid.forEach((row, index) => {
      const y = top + index * rowH;
      const value = Number(row.net_value_after_setup);
      const barW = Math.abs(value / max) * plotW;

      addText(svg, left - 10, y + 15, row.scenario, {
        color: COLORS.ivory, size: 10, anchor: "end"
      });

      svg.appendChild(svgElement("rect", {
        x: left,
        y,
        width: Math.max(1, barW),
        height: 19,
        rx: 3,
        fill: index === 0 ? COLORS.mint : COLORS.magenta,
        opacity: 0.85
      }));

      addText(svg, left + barW + 6, y + 14, money(value), {
        color: COLORS.ivory, size: 10
      });
    });
  }

  // 4. Cumulative payback — requires cumulative SQL export.
  function renderPayback(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      renderEmpty(
        "payback-chart",
        "Cumulative SQL export is not available yet."
      );
      return;
    }

    const valid = rows.filter(row =>
      Number.isFinite(Number(row.task_id)) &&
      Number.isFinite(Number(row.cum_net_after_setup))
    );

    if (!valid.length) {
      renderEmpty("payback-chart", "No valid cumulative values.");
      return;
    }

    const chart = createChart(
      "payback-chart", "Cumulative payback", 620, 300
    );
    if (!chart) return;

    const { svg } = chart;
    const left = 48;
    const right = 18;
    const top = 25;
    const bottom = 35;
    const plotW = chart.width - left - right;
    const plotH = chart.height - top - bottom;

    const xs = valid.map(row => Number(row.task_id));
    const ys = valid.map(row => Number(row.cum_net_after_setup));

    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(0, ...ys);
    const yMax = Math.max(0, ...ys);
    const yRange = yMax - yMin || 1;
    const xRange = xMax - xMin || 1;

    const x = value => left + ((value - xMin) / xRange) * plotW;
    const y = value => top + ((yMax - value) / yRange) * plotH;

    const zeroY = y(0);

    svg.appendChild(svgElement("line", {
      x1: left, y1: zeroY,
      x2: left + plotW, y2: zeroY,
      stroke: COLORS.mauve,
      "stroke-dasharray": "4 4"
    }));

    const stride = Math.max(1, Math.floor(valid.length / 700));
    const sampled = valid.filter((_, index) =>
      index % stride === 0 || index === valid.length - 1
    );

    const points = sampled.map(row =>
      `${x(Number(row.task_id))},${y(Number(row.cum_net_after_setup))}`
    ).join(" ");

    svg.appendChild(svgElement("polyline", {
      points,
      fill: "none",
      stroke: COLORS.magenta,
      "stroke-width": 2.5,
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    }));

    const crossing = valid.find(row =>
      Number(row.cum_net_after_setup) >= 0
    );

    if (crossing) {
      const px = x(Number(crossing.task_id));
      const py = y(Number(crossing.cum_net_after_setup));

      svg.appendChild(svgElement("circle", {
        cx: px, cy: py, r: 5,
        fill: COLORS.mint,
        stroke: COLORS.plum,
        "stroke-width": 2
      }));

      addText(svg, Math.min(px + 8, chart.width - 100),
        Math.max(top + 12, py - 10),
        `Payback: task ${number(crossing.task_id)}`,
        { color: COLORS.mint, size: 10 }
      );
    }

    addText(svg, left, chart.height - 10, `Task ${number(xMin)}`, {
      color: COLORS.mauve, size: 10
    });

    addText(svg, left + plotW, chart.height - 10, `Task ${number(xMax)}`, {
      color: COLORS.mauve, size: 10, anchor: "end"
    });
  }

  window.AILedgerCharts = {
    renderCostBreakdown,
    renderMonteCarlo,
    renderSensitivity,
    renderPayback
  };
})();
