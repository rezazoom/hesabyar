import { getCategoryMeta } from '../categories.js';
import { renderCategoryDoughnut, renderMonthlyCashflowBar } from '../charts.js';
import { currentMonth, daysDiff, monthName, shiftMonth } from '../date.js';
import { exportReportCsv, exportReportXlsx } from '../export.js';
import { esc, fmt, norm } from '../format.js';
import {
  getAccountName,
  getAllMonths,
  getCashEvents,
  getObligations,
  getObligationStatus,
  sumAmounts,
  TYPE_LABELS,
} from '../ledger.js';
import { ensureMonthListed, mutateState, ui } from '../state.js';
import { icon } from '../ui/icons.js';
import { tableHtml } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { openPaymentModal } from './dialogs.js';

function getFilteredData(state) {
  const F = ui.reportFilter;
  const q = norm(F.search).toLowerCase();

  const inside = (x) => x.date.slice(0, 7) >= F.from && x.date.slice(0, 7) <= F.to;
  const matchType = (t) => F.type === 'all' || t === F.type;
  const matchAcc = (accId) => F.accountId === 'all' || accId === F.accountId;
  const matchCat = (cat) => F.category === 'all' || (cat || 'سایر') === F.category;
  const matchQuery = (x) =>
    !q ||
    norm(x.title).toLowerCase().includes(q) ||
    norm(x.category || '').toLowerCase().includes(q);

  const c = getCashEvents(state, { includeTransfers: false }).filter(
    (x) => inside(x) && matchType(x.type) && matchAcc(x.accountId) && matchCat(x.category) && matchQuery(x)
  );

  let o = getObligations(state).filter(
    (x) =>
      inside(x) &&
      matchType(x.kind) &&
      matchAcc(x.defaultAccountId || x.accountId) &&
      matchCat(x.category) &&
      matchQuery(x)
  );

  o = o.filter((x) => {
    if (F.status === 'all') return true;
    if (F.status === 'paid') return x.remaining === 0;
    if (F.status === 'late') return x.remaining > 0 && daysDiff(x.date) < 0;
    return x.remaining > 0;
  });

  return { c, o };
}

function buildMonthlyRows(c, from, to) {
  const rows = [];
  let cursor = from;
  while (cursor <= to && rows.length < 360) {
    const items = c.filter((x) => x.date.startsWith(cursor));
    rows.push({
      m: cursor,
      i: sumAmounts(items.filter((x) => x.sign > 0)),
      o: sumAmounts(items.filter((x) => x.sign < 0)),
    });
    cursor = shiftMonth(cursor, 1);
  }
  return rows;
}

function renderReportBodyHtml(state) {
  const F = ui.reportFilter;
  if (F.from > F.to) {
    return '<div class="notice danger">بازه زمانی نامعتبر است؛ ماه شروع باید کوچک‌تر یا مساوی ماه پایان باشد.</div>';
  }

  const { c, o } = getFilteredData(state);
  const inc = sumAmounts(c.filter((x) => x.sign > 0));
  const out = sumAmounts(c.filter((x) => x.sign < 0));
  const earned = sumAmounts(c.filter((x) => x.type === 'income'));
  const spent = sumAmounts(c.filter((x) => ['expense', 'bill', 'installment'].includes(x.type)));
  const openFiltered = sumAmounts(o.filter((x) => x.remaining > 0 && x.kind !== 'lend'), 'remaining');

  return `
    <div class="finance-grid" style="margin-top:14px">
      <div class="card"><small>درآمد واقعی</small><strong class="green num">${fmt(earned)}</strong><small>تومان</small></div>
      <div class="card"><small>مجموع ورودی نقدی</small><strong class="green num">${fmt(inc)}</strong><small>تومان</small></div>
      <div class="card"><small>مجموع خروجی نقدی</small><strong class="red num">${fmt(out)}</strong><small>تومان</small></div>
      <div class="card"><small>هزینه، اقساط و قبوض</small><strong class="red num">${fmt(spent)}</strong><small>تومان</small></div>
      <div class="card"><small>خالص گردش بازه</small><strong class="${inc - out >= 0 ? 'green' : 'red'} num">${fmt(inc - out)}</strong><small>تومان</small></div>
      <div class="card"><small>مانده تعهدات فیلترشده</small><strong class="amber num">${fmt(openFiltered)}</strong><small>تومان</small></div>
    </div>

    <div class="charts-grid">
      <div class="panel">
        <div class="panel-head"><h2>مقایسه ورودی و خروجی ماهانه</h2></div>
        <div class="chart-box"><canvas id="repMonthlyBarChart"></canvas></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>ترکیب خروجی بر اساس دسته‌بندی</h2></div>
        <div class="chart-box"><canvas id="repCategoryDoughnut"></canvas></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>گردش نقدی فیلترشده (بر اساس تاریخ واقعی)</h2>
        <small>${fmt(c.length)} ردیف</small>
      </div>
      ${tableHtml(
        ['شرح', 'نوع', 'دسته', 'حساب', 'تاریخ', 'ورودی', 'خروجی'],
        [...c]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((x) => [
            esc(x.title),
            esc(TYPE_LABELS[x.type] || x.type),
            esc(x.category || 'سایر'),
            esc(getAccountName(state, x.accountId)),
            esc(x.date),
            x.sign > 0 ? `<span class="green num">${fmt(x.amount)}</span>` : '—',
            x.sign < 0 ? `<span class="red num">${fmt(x.amount)}</span>` : '—',
          ])
      )}
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>تعهدات فیلترشده (بر اساس سررسید)</h2>
        <small>${fmt(o.length)} مورد</small>
      </div>
      ${tableHtml(
        ['عنوان', 'نوع', 'سررسید', 'مبلغ کل', 'مانده', 'وضعیت', 'عملیات'],
        [...o]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((x) => {
            const stInfo = getObligationStatus(x);
            return [
              esc(x.title),
              esc(TYPE_LABELS[x.kind] || x.kind),
              esc(x.date),
              `<span class="num">${fmt(x.amount)}</span>`,
              `<b class="num ${x.remaining > 0 ? 'amber' : 'green'}">${fmt(x.remaining)}</b>`,
              `<span class="state ${esc(stInfo.key)}">${esc(stInfo.label)}</span>`,
              `<button type="button" class="btn btn-sm ${x.remaining === 0 ? 'btn-ghost' : 'btn-primary'}" data-rep-pay="${esc(x.kind)}|${esc(x.id)}">${x.remaining === 0 ? 'سوابق' : 'پرداخت'}</button>`,
            ];
          })
      )}
    </div>
  `;
}

function drawReportCharts(container, state) {
  const F = ui.reportFilter;
  if (F.from > F.to) return;
  const { c } = getFilteredData(state);
  const rows = buildMonthlyRows(c, F.from, F.to);

  renderMonthlyCashflowBar(container.querySelector('#repMonthlyBarChart'), rows, {
    key: 'rep-monthly',
  });

  const outByCat = {};
  for (const x of c) {
    if (x.sign < 0) {
      const cat = x.category || TYPE_LABELS[x.type] || 'سایر';
      outByCat[cat] = (outByCat[cat] || 0) + x.amount;
    }
  }
  const entries = Object.entries(outByCat)
    .sort((a, b) => b[1] - a[1])
    .map(([label, amount]) => ({
      label,
      amount,
      color: getCategoryMeta(state, label).color,
    }));

  renderCategoryDoughnut(container.querySelector('#repCategoryDoughnut'), entries, {
    key: 'rep-cat',
    emptyLabel: 'خروجی در این بازه وجود ندارد',
  });
}

export function renderReports(state) {
  const F = ui.reportFilter;
  const months = getAllMonths(state);
  const monthOpts = (selected) =>
    months
      .map((m) => `<option value="${esc(m)}" ${m === selected ? 'selected' : ''}>${esc(monthName(m))}</option>`)
      .join('');

  const categories = [...new Set((state.categories || []).map((c) => c.name))];

  return `
    <div class="panel">
      <div class="panel-head"><h2>مرکز تحلیل و گزارش مالی</h2></div>
      <div class="filter-bar">
        <label class="field"><span>از ماه</span><select id="repFrom">${monthOpts(F.from)}</select></label>
        <label class="field"><span>تا ماه</span><select id="repTo">${monthOpts(F.to)}</select></label>
        <label class="field">
          <span>نوع</span>
          <select id="repType">
            <option value="all" ${F.type === 'all' ? 'selected' : ''}>همه موارد</option>
            ${Object.entries(TYPE_LABELS)
              .filter(([k]) => k !== 'transfer')
              .map(([k, v]) => `<option value="${k}" ${k === F.type ? 'selected' : ''}>${esc(v)}</option>`)
              .join('')}
          </select>
        </label>
        <label class="field">
          <span>حساب</span>
          <select id="repAccount">
            <option value="all" ${F.accountId === 'all' ? 'selected' : ''}>همه حساب‌ها</option>
            ${(state.accounts || [])
              .map((a) => `<option value="${esc(a.id)}" ${a.id === F.accountId ? 'selected' : ''}>${esc(a.name)}</option>`)
              .join('')}
          </select>
        </label>
        <label class="field">
          <span>دسته‌بندی</span>
          <select id="repCategory">
            <option value="all" ${F.category === 'all' ? 'selected' : ''}>همه دسته‌ها</option>
            ${categories
              .map((c) => `<option value="${esc(c)}" ${c === F.category ? 'selected' : ''}>${esc(c)}</option>`)
              .join('')}
          </select>
        </label>
        <label class="field">
          <span>وضعیت تعهدات</span>
          <select id="repStatus">
            ${[['all', 'همه'], ['paid', 'تسویه شده'], ['open', 'پرداخت نشده'], ['late', 'معوقه']]
              .map(([k, v]) => `<option value="${k}" ${k === F.status ? 'selected' : ''}>${v}</option>`)
              .join('')}
          </select>
        </label>
        <label class="field">
          <span>جستجو</span>
          <input id="repSearch" type="search" value="${esc(F.search)}" placeholder="عنوان یا دسته...">
        </label>
      </div>

      <div class="actions">
        <button type="button" class="btn btn-ghost" data-rep-preset="month">این ماه</button>
        <button type="button" class="btn btn-ghost" data-rep-preset="3m">۳ ماه اخیر</button>
        <button type="button" class="btn btn-ghost" data-rep-preset="6m">۶ ماه اخیر</button>
        <button type="button" class="btn btn-ghost" data-rep-preset="year">امسال</button>
        <button type="button" class="btn btn-secondary" data-rep-export="csv">${icon('Download', 'sm')} خروجی CSV</button>
        <button type="button" class="btn btn-primary" data-rep-export="xlsx">${icon('FileSpreadsheet', 'sm')} خروجی اکسل (.xlsx)</button>
      </div>
    </div>

    <div id="reportBody">${renderReportBodyHtml(state)}</div>
  `;
}

export function mountReports(container, state) {
  const refresh = () => {
    const body = container.querySelector('#reportBody');
    if (!body) return;
    body.innerHTML = renderReportBodyHtml(state);
    drawReportCharts(container, state);
  };

  drawReportCharts(container, state);

  container.querySelector('#repFrom')?.addEventListener('change', (e) => {
    ui.reportFilter.from = e.target.value;
    refresh();
  });
  container.querySelector('#repTo')?.addEventListener('change', (e) => {
    ui.reportFilter.to = e.target.value;
    refresh();
  });
  container.querySelector('#repType')?.addEventListener('change', (e) => {
    ui.reportFilter.type = e.target.value;
    refresh();
  });
  container.querySelector('#repAccount')?.addEventListener('change', (e) => {
    ui.reportFilter.accountId = e.target.value;
    refresh();
  });
  container.querySelector('#repCategory')?.addEventListener('change', (e) => {
    ui.reportFilter.category = e.target.value;
    refresh();
  });
  container.querySelector('#repStatus')?.addEventListener('change', (e) => {
    ui.reportFilter.status = e.target.value;
    refresh();
  });
  container.querySelector('#repSearch')?.addEventListener('input', (e) => {
    ui.reportFilter.search = e.target.value;
    refresh();
  });

  container.onclick = async (e) => {
    const payBtn = e.target.closest('[data-rep-pay]');
    if (payBtn) {
      const [kind, id] = payBtn.getAttribute('data-rep-pay').split('|');
      return openPaymentModal(kind, id);
    }

    const preset = e.target.closest('[data-rep-preset]')?.getAttribute('data-rep-preset');
    if (preset) {
      const cur = currentMonth();
      if (preset === 'month') {
        ui.reportFilter.from = state.month;
        ui.reportFilter.to = state.month;
      } else if (preset === '3m') {
        ui.reportFilter.from = shiftMonth(cur, -2);
        ui.reportFilter.to = cur;
      } else if (preset === '6m') {
        ui.reportFilter.from = shiftMonth(cur, -5);
        ui.reportFilter.to = cur;
      } else if (preset === 'year') {
        const y = cur.slice(0, 4);
        ui.reportFilter.from = `${y}-01`;
        ui.reportFilter.to = `${y}-12`;
      }
      mutateState((draft) => {
        ensureMonthListed(draft, ui.reportFilter.from);
        ensureMonthListed(draft, ui.reportFilter.to);
      }, { recordPrevious: false });
      return;
    }

    const exp = e.target.closest('[data-rep-export]')?.getAttribute('data-rep-export');
    if (exp) {
      const { c, o } = getFilteredData(state);
      if (exp === 'csv') {
        exportReportCsv(state, c, ui.reportFilter.from, ui.reportFilter.to);
        showToast('فایل CSV گزارش آماده شد', { type: 'success' });
      } else {
        try {
          await exportReportXlsx(state, {
            cashRows: c,
            obligationRows: o,
            from: ui.reportFilter.from,
            to: ui.reportFilter.to,
          });
          showToast('فایل اکسل (.xlsx) گزارش آماده شد', { type: 'success' });
        } catch (err) {
          showToast(err?.message || 'خطا در ساخت فایل اکسل', { type: 'error' });
        }
      }
    }
  };
}
