
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
    height: `${height}px`,
    style: `width: 100%; height: ${height}px; display: block;`,
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

    return svg.lastElementChild;
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
    let selectedSegment = null;
    const segments = [];
    let selectedLegendCard = null;
  validRows.forEach((row, index) => {
    const value = Number(row.cost);
    const length = (value / total) * circumference;
    const color = palette[index % palette.length];

    const segment = svgElement("circle", {
        cx, cy, r: radius,
        fill: "none",
        stroke: color,
        "stroke-width": stroke,
        "stroke-dasharray": `${length} ${circumference - length}`,
        "stroke-dashoffset": -offset,
        transform: `rotate(-90 ${cx} ${cy})`,
        tabindex: "0",
        role: "button",
        "aria-label": `${row.component}: ${money(value)}`
    });

    const originalTransform = `rotate(-90 ${cx} ${cy})`;
    const midAngle = -Math.PI / 2 +
        ((offset + length / 2) / circumference) * 2 * Math.PI;

    const dx = Math.cos(midAngle) * 9;
    const dy = Math.sin(midAngle) * 9;

    const liftedTransform =
        `translate(${dx} ${dy}) ${originalTransform}`;
        segment.dataset.originalTransform = originalTransform;
        segment.dataset.liftedTransform = liftedTransform;

    const tooltip = svgElement(
        "title",
        {},
        `${row.component}: ${money(value)} | ${((value / total) * 100).toFixed(1)}%`
    );

    segment.appendChild(tooltip);
    segment.style.cursor = "pointer";
    segment.style.transition = "stroke-width 180ms ease, opacity 180ms ease";
    segment.style.opacity = "0.9";
    segment.dataset.originalTransform = originalTransform;
    segment.addEventListener("mouseenter", () => {
        segment.setAttribute("transform", liftedTransform);
        segment.setAttribute("stroke-width", stroke + 5);
        segment.style.opacity = "1";
    });

    segment.addEventListener("mouseleave", () => {
        if (selectedSegment !== segment) {
            segment.setAttribute("transform", originalTransform);
            segment.setAttribute("stroke-width", stroke);
            segment.style.opacity = "0.9";
        }
    });

    segment.addEventListener("click", () => {
        if (selectedSegment && selectedSegment !== segment) {
            selectedSegment.setAttribute(
                "transform",
                selectedSegment.dataset.originalTransform
            );
            selectedSegment.setAttribute("stroke-width", stroke);
            selectedSegment.style.opacity = "0.9";
        }

        if (selectedSegment === segment) {
            selectedSegment = null;
            segment.setAttribute("transform", originalTransform);
            segment.setAttribute("stroke-width", stroke);
            segment.style.opacity = "0.9";
        } else {
            selectedSegment = segment;
            segment.dataset.originalTransform = originalTransform;
            segment.setAttribute("transform", liftedTransform);
            segment.setAttribute("stroke-width", stroke + 5);
            segment.style.opacity = "1";
        }
    
    const centerValueEl = svg.querySelector("#donut-center-value");
    const centerLabelEl = svg.querySelector("#donut-center-label");

    if (selectedSegment === segment) {
        centerValueEl.textContent = money(value);
        centerLabelEl.textContent = row.component;
    } else {
        centerValueEl.textContent = money(total);
        centerLabelEl.textContent = "Total cost";
    }
});-    
    segments.push(segment);
    svg.appendChild(segment);
    offset += length;
});
   const centerValue = addText(svg, cx, cy - 5, money(total), {
    color: COLORS.ivory,
    size: 17,
    weight: 700,
    anchor: "middle"
});
centerValue.setAttribute("id", "donut-center-value");

const centerLabel = addText(svg, cx, cy + 16, "Total cost", {
    color: COLORS.mauve,
    size: 11,
    anchor: "middle"
});
centerLabel.setAttribute("id", "donut-center-label");

   validRows.forEach((row, index) => {
    const y = 75 + index * 43;
    const segment = segments[index];
    const value = Number(row.cost);
    const percentage = (value / total) * 100;
    const color = palette[index % palette.length];

    // Subtle legend card background
   const legendCard = svgElement("rect", {
    x: 270,
    y: y - 17,
    width: 245,
    height: 38,
    rx: 8,
    fill: "rgba(255,255,255,0.035)",
    stroke: "rgba(255,255,255,0.07)",
    "stroke-width": 1,
    tabindex: "0",
    role: "button",
    style: "cursor:pointer; transition:all 180ms ease;"
});

svg.appendChild(legendCard);

legendCard.addEventListener("mouseenter", () => {
    segment.setAttribute("transform", segment.dataset.liftedTransform);
    segment.setAttribute("stroke-width", stroke + 5);
    legendCard.setAttribute("stroke", color);
});

legendCard.addEventListener("mouseleave", () => {
    if (selectedSegment !== segment) {
        segment.setAttribute("transform", segment.dataset.originalTransform);
        segment.setAttribute("stroke-width", stroke);
        legendCard.setAttribute("stroke", "rgba(255,255,255,0.07)");
    }
});
legendCard.addEventListener("click", () => {
    segment.dispatchEvent(new MouseEvent("click", {
        bubbles: true
    }));
});

    // Category colour indicator
    svg.appendChild(svgElement("circle", {
        cx: 280,
        cy: y - 4,
        r: 5,
        fill: color
    }));

    // Category name
    addText(svg, 294, y, row.component, {
        color: COLORS.ivory,
        size: 11,
        weight: 600
    });

    // Percentage
    addText(svg, 505, y, `${percentage.toFixed(1)}%`, {
        color,
        size: 12,
        weight: 700,
        anchor: "end"
    });

    // Actual cost
    addText(svg, 294, y + 15, money(value), {
        color: COLORS.mauve,
        size: 10
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

    
let selectedBar = null;

counts.forEach((count, index) => {
    const barH = (count / maxCount) * plotH;
    const barX = left + index * barW + barGap / 2;
    const barY = top + plotH - barH;
    const actualWidth = Math.max(1, barW - barGap);

    const binMin = min + (index / bins) * range;
    const binMax = min + ((index + 1) / bins) * range;

    const bar = svgElement("rect", {
        x: barX,
        y: barY,
        width: actualWidth,
        height: barH,
        rx: 3,
        fill: COLORS.magenta,
        opacity: 0.85,
        tabindex: "0",
        role: "button",
        "aria-label": `${count} simulations between ${money(binMin)} and ${money(binMax)}`
    });

   const tooltipWidth = 190;
const tooltipHeight = 48;

const tooltipX = Math.max(
    4,
    Math.min(barX + actualWidth / 2 - tooltipWidth / 2,
    chart.width - tooltipWidth - 4)
);

const tooltipY = Math.max(32, barY - tooltipHeight - 10);

const tooltipGroup = svgElement("g", {
    visibility: "hidden",
    "pointer-events": "none"
});

tooltipGroup.appendChild(svgElement("rect", {
    x: tooltipX,
    y: tooltipY,
    width: tooltipWidth,
    height: tooltipHeight,
    rx: 8,
    fill: "#2A0828",
    stroke: COLORS.magenta,
    "stroke-width": 1.2,
    filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.35))"
}));

addText(tooltipGroup, tooltipX + 12, tooltipY + 19,
    `${count} simulations`, {
        color: COLORS.ivory,
        size: 11,
        weight: 700
    }
);

addText(tooltipGroup, tooltipX + 12, tooltipY + 36,
    `${money(binMin)} – ${money(binMax)}`, {
        color: COLORS.mauve,
        size: 10
    }
);
    bar.style.cursor = "pointer";
    bar.style.transformBox = "fill-box";
    bar.style.transformOrigin = "center bottom";
    bar.style.transition =
        "transform 180ms ease, opacity 180ms ease, filter 180ms ease";

    bar.addEventListener("mouseenter", () => {
        tooltipGroup.setAttribute("visibility", "visible");
        bar.style.transform = "translateY(-6px)";
        bar.style.opacity = "1";
        bar.style.filter = "drop-shadow(0 0 7px rgba(232,75,216,0.5))";
    });

    bar.addEventListener("mouseleave", () => {
        tooltipGroup.setAttribute("visibility", "hidden");
        if (selectedBar !== bar) {
            bar.style.transform = "translateY(0)";
            bar.style.opacity = "0.85";
            bar.style.filter = "none";
        }
    });

    bar.addEventListener("click", () => {
        if (selectedBar && selectedBar !== bar) {
            selectedBar.style.transform = "translateY(0)";
            selectedBar.style.opacity = "0.85";
            selectedBar.style.filter = "none";
            selectedBar.setAttribute("stroke", "none");
        }

        if (selectedBar === bar) {
            selectedBar = null;
            bar.style.transform = "translateY(0)";
            bar.style.opacity = "0.85";
            bar.style.filter = "none";
            bar.setAttribute("stroke", "none");
        } else {
            selectedBar = bar;
            bar.style.transform = "translateY(-6px)";
            bar.style.opacity = "1";
            bar.style.filter =
                "drop-shadow(0 0 9px rgba(232,75,216,0.65))";
            bar.setAttribute("stroke", COLORS.ivory);
            bar.setAttribute("stroke-width", "1.5");
        }
    });

    svg.appendChild(bar);
    svg.appendChild(tooltipGroup);
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