import { monthName } from './date.js';
import { fmt } from './format.js';

const chartInstances = new Map();

function readThemePalette() {
  const cs = getComputedStyle(document.documentElement);
  const get = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  const rawScale = parseFloat(get('--radius-scale', '1'));
  return {
    fg: get('--fg', '#e5edf8'),
    muted: get('--muted', '#9eb1ca'),
    border: get('--border', '#2c3d57'),
    good: get('--good', '#4ee0ad'),
    bad: get('--bad', '#ff858e'),
    warn: get('--warn', '#ffc875'),
    accent: get('--accent', '#0e937e'),
    accent2: get('--accent2', '#5179c4'),
    surface: get('--surface', '#141f31'),
    font: get('--ui-font', 'HesabArad, Tahoma, sans-serif'),
    radiusScale: Number.isFinite(rawScale) ? rawScale : 1,
  };
}

export function destroyChart(key) {
  const existing = chartInstances.get(key);
  if (existing) {
    existing.destroy();
    chartInstances.delete(key);
  }
}

export function destroyAllCharts() {
  for (const chart of chartInstances.values()) {
    chart.destroy();
  }
  chartInstances.clear();
}

function getChartCtor() {
  return globalThis.Chart || null;
}

function showEmptyChart(canvas, message) {
  if (!canvas?.parentElement) return;
  canvas.classList.add('hidden');
  let empty = canvas.parentElement.querySelector('.empty-chart');
  if (!empty) {
    empty = document.createElement('div');
    empty.className = 'empty-chart';
    canvas.parentElement.appendChild(empty);
  }
  empty.textContent = message;
}

function clearEmptyChart(canvas) {
  if (!canvas?.parentElement) return;
  canvas.classList.remove('hidden');
  canvas.parentElement.querySelector('.empty-chart')?.remove();
}

export function renderCategoryDoughnut(canvas, entries, { key = 'cat-doughnut', emptyLabel = 'داده‌ای ثبت نشده است' } = {}) {
  destroyChart(key);
  const Chart = getChartCtor();
  if (!Chart || !canvas) return null;

  if (!entries.length) {
    showEmptyChart(canvas, emptyLabel);
    return null;
  }

  clearEmptyChart(canvas);
  const p = readThemePalette();
  const labels = entries.map((e) => e.label);
  const values = entries.map((e) => e.amount);
  const colors = entries.map((e, idx) => e.color || [p.accent, p.accent2, p.good, p.warn, p.bad][idx % 5]);

  const chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderColor: p.surface,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '66%',
      plugins: {
        legend: {
          position: 'bottom',
          rtl: true,
          labels: {
            color: p.fg,
            font: { family: p.font, size: 12 },
            boxWidth: 10,
            usePointStyle: true,
            padding: 12,
          },
        },
        tooltip: {
          rtl: true,
          titleFont: { family: p.font },
          bodyFont: { family: p.font },
          callbacks: {
            label: (ctx) => `${ctx.label}: ${fmt(ctx.parsed)} تومان`,
          },
        },
      },
    },
  });

  chartInstances.set(key, chart);
  return chart;
}

export function renderMonthlyCashflowBar(canvas, rows, { key = 'monthly-bar' } = {}) {
  destroyChart(key);
  const Chart = getChartCtor();
  if (!Chart || !canvas) return null;

  if (!rows.length || rows.every((r) => r.i === 0 && r.o === 0)) {
    showEmptyChart(canvas, 'گردش مالی در این بازه ثبت نشده است');
    return null;
  }

  clearEmptyChart(canvas);
  const p = readThemePalette();
  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: rows.map((r) => monthName(r.m)),
      datasets: [
        {
          label: 'ورودی',
          data: rows.map((r) => r.i),
          backgroundColor: p.good,
          borderRadius: Math.round(6 * p.radiusScale),
        },
        {
          label: 'خروجی',
          data: rows.map((r) => r.o),
          backgroundColor: p.bad,
          borderRadius: Math.round(6 * p.radiusScale),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          rtl: true,
          labels: { color: p.fg, font: { family: p.font, size: 12 }, usePointStyle: true, boxWidth: 10 },
        },
        tooltip: {
          rtl: true,
          titleFont: { family: p.font },
          bodyFont: { family: p.font },
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)} تومان`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: p.muted, font: { family: p.font, size: 11 } },
          grid: { display: false },
        },
        y: {
          ticks: {
            color: p.muted,
            font: { family: p.font, size: 11 },
            callback: (val) => fmt(val),
          },
          grid: { color: 'rgba(148, 163, 184, 0.14)' },
        },
      },
    },
  });

  chartInstances.set(key, chart);
  return chart;
}

export function renderAccountBalancesBar(canvas, accountSummaries, { key = 'accounts-bar' } = {}) {
  destroyChart(key);
  const Chart = getChartCtor();
  if (!Chart || !canvas) return null;

  clearEmptyChart(canvas);
  const p = readThemePalette();
  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: accountSummaries.map((a) => a.account.name),
      datasets: [
        {
          label: 'موجودی فعلی (تومان)',
          data: accountSummaries.map((a) => a.balance),
          backgroundColor: accountSummaries.map((a) =>
            a.balance < 0 ? p.bad : a.account.color || p.accent
          ),
          borderRadius: Math.round(8 * p.radiusScale),
          maxBarThickness: 56,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          rtl: true,
          titleFont: { family: p.font },
          bodyFont: { family: p.font },
          callbacks: {
            label: (ctx) => `${fmt(ctx.parsed.y)} تومان`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: p.fg, font: { family: p.font, size: 12 } },
          grid: { display: false },
        },
        y: {
          ticks: {
            color: p.muted,
            font: { family: p.font, size: 11 },
            callback: (val) => fmt(val),
          },
          grid: { color: 'rgba(148, 163, 184, 0.14)' },
        },
      },
    },
  });

  chartInstances.set(key, chart);
  return chart;
}
