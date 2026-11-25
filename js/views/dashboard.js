import { getCategoryMeta } from '../categories.js';
import { renderAccountBalancesBar, renderCategoryDoughnut } from '../charts.js';
import { currentMonth, daysDiff, dueDate, monthName, today } from '../date.js';
import { esc, fmt, uid } from '../format.js';
import {
  ACCOUNT_TYPE_LABELS,
  computeBudgetUsage,
  computeDashboardMetrics,
  getAccountName,
  getDueRecurringItems,
  getObligationStatus,
  TYPE_LABELS,
} from '../ledger.js';
import { ensureMonthListed, mutateState, ui } from '../state.js';
import { icon } from '../ui/icons.js';
import { tableHtml } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import {
  openBillModal,
  openLoanModal,
  openOpeningModal,
  openPaymentModal,
  openPlanWizardModal,
  openTransferModal,
  openTxModal,
} from './dialogs.js';

function kpiCard(label, value, colorClass = '', sub = 'تومان') {
  return `
    <div class="card">
      <small>${esc(label)}</small>
      <strong class="${esc(colorClass)}" data-num="1">${fmt(value)}</strong>
      <small>${esc(sub)}</small>
    </div>
  `;
}

function obligationRowsHtml(state, list) {
  return list.map((o) => {
    const stInfo = getObligationStatus(o);
    const kindLabel = TYPE_LABELS[o.kind] || o.kind;
    const amtText =
      o.paidSum > 0 && o.remaining > 0
        ? `${fmt(o.remaining)} <small class="muted">از ${fmt(o.amount)}</small>`
        : fmt(o.amount);
    const payLabel = o.remaining === 0 ? 'سوابق تسویه' : o.paidSum > 0 ? 'ادامه پرداخت' : 'ثبت تسویه';
    const btnCls = o.remaining === 0 ? 'btn-ghost' : 'btn-primary';
    return [
      esc(o.title),
      esc(kindLabel),
      esc(o.date),
      amtText,
      `<span class="state ${esc(stInfo.key)}">${esc(stInfo.label)}</span>`,
      `<button type="button" class="btn btn-sm ${btnCls}" data-dash-pay="${esc(o.kind)}|${esc(o.id)}">${esc(payLabel)}</button>`,
    ];
  });
}

export function renderDashboard(state) {
  const m = state.month;
  const metrics = computeDashboardMetrics(state, m);
  const colorOf = (v) => (v < 0 ? 'red' : 'green');
  const pct = Math.round((metrics.monthPaidTotal / Math.max(1, metrics.monthDebtTotal)) * 100);
  const dueRecurring = getDueRecurringItems(state);
  const budgets = computeBudgetUsage(state, m);
  const warnBudgets = budgets.filter((b) => b.level !== 'good');

  const now = today();
  const upcoming = metrics.allObligations
    .filter((x) => x.remaining > 0 && daysDiff(x.date, now) >= 0 && daysDiff(x.date, now) <= 7)
    .sort((a, b) => a.date.localeCompare(b.date));

  const urgentRows = [...metrics.actualLate, ...upcoming];
  const monthCalendar = metrics.allObligations
    .filter((x) => x.date.startsWith(m))
    .sort((a, b) => a.date.localeCompare(b.date));

  const recentLedger = [...metrics.c]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)
    .map((x) => [
      esc(x.title),
      esc(TYPE_LABELS[x.type] || x.type),
      esc(getAccountName(state, x.accountId)),
      esc(x.date),
      `<span class="${x.sign > 0 ? 'green' : 'red'} num">${x.sign > 0 ? '+' : '−'} ${fmt(x.amount)}</span>`,
    ]);

  const line = (label, value, cls = '') => `
    <div class="mini-line">
      <span>${esc(label)}</span>
      <b class="${esc(cls)} num">${fmt(value)} تومان</b>
    </div>
  `;

  return `
    <div class="hero">
      <div>
        <small>مرکز کنترل پول من</small>
        <h1>${esc(monthName(m))}</h1>
        <small>محاسبه تا ${esc(metrics.cut)} · امروز ${esc(now)} · ${
          metrics.hasManualOverride ? 'شروع ماه: موجودی دستی' : 'شروع ماه: انتقال خودکار از ماه قبل'
        }</small>
      </div>
      <div class="row">
        <button type="button" class="btn btn-ghost" data-dash-act="opening">${icon('SlidersHorizontal', 'sm')} موجودی ابتدای ماه</button>
        <button type="button" class="btn btn-primary" data-dash-act="current-month">${icon('Calendar', 'sm')} ماه جاری</button>
      </div>
    </div>

    <div class="actions">
      <button type="button" class="btn btn-primary" data-dash-act="add-income">${icon('Plus', 'sm')} درآمد</button>
      <button type="button" class="btn btn-secondary" data-dash-act="add-expense">${icon('Plus', 'sm')} هزینه</button>
      <button type="button" class="btn btn-ghost" data-dash-act="add-transfer">${icon('ArrowLeftRight', 'sm')} انتقال کارت</button>
      <button type="button" class="btn btn-ghost" data-dash-act="add-plan">${icon('CalendarClock', 'sm')} قسط</button>
      <button type="button" class="btn btn-ghost" data-dash-act="add-bill">${icon('Receipt', 'sm')} قبض</button>
      <button type="button" class="btn btn-ghost" data-dash-act="add-loan">${icon('Landmark', 'sm')} قرض / طلب</button>
    </div>

    ${
      dueRecurring.length
        ? `
      <div class="panel">
        <div class="panel-head">
          <h2>${icon('Repeat', 'sm')} یادآورهای تکرار آماده ثبت (${fmt(dueRecurring.length)})</h2>
          <button type="button" class="btn btn-sm btn-ghost" data-dash-nav="budgets">مدیریت تکرارها</button>
        </div>
        ${dueRecurring
          .slice(0, 5)
          .map(
            (item) => `
          <div class="mini-line">
            <div>
              <b>${esc(item.rule.title)}</b>
              <small class="muted"> · ${item.rule.type === 'income' ? 'درآمد' : 'هزینه'} · ${esc(item.dueDate)} · ${esc(getAccountName(state, item.rule.accountId))}</small>
            </div>
            <div class="row">
              <b class="${item.rule.type === 'income' ? 'green' : 'red'} num">${fmt(item.rule.amount)} تومان</b>
              <button type="button" class="btn btn-sm btn-primary" data-rec-post="${esc(item.rule.id)}|${esc(item.month)}|${esc(item.dueDate)}">تأیید و ثبت</button>
              <button type="button" class="btn btn-sm btn-ghost" data-rec-skip="${esc(item.rule.id)}|${esc(item.month)}">رد کردن</button>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `
        : ''
    }

    ${
      warnBudgets.length
        ? `
      <div class="notice ${warnBudgets.some((b) => b.level === 'over') ? 'danger' : ''}">
        ${icon('AlertTriangle', 'sm')}
        <div>
          <b>هشدار بودجه ماه:</b>
          ${warnBudgets
            .map((b) => `${esc(b.category)} (${fmt(b.pct)}٪ مصرف)`)
            .join(' · ')}
        </div>
      </div>
    `
        : ''
    }

    <div class="section-title"><h2>پول من کجاست؟</h2></div>
    <div class="finance-main">
      ${kpiCard('موجودی تخمینی کل حساب‌ها تا این لحظه', metrics.net, colorOf(metrics.net), 'موجودی اول ماه + دریافتی‌ها − پرداختی‌ها')}
      ${kpiCard('پولی که بعد از تعهدات این ماه می‌ماند', metrics.after, colorOf(metrics.after), 'با احتساب معوقات و بدهی‌های باز این ماه')}
    </div>

    <div class="accounts-strip">
      ${metrics.accountSummaries
        .map(
          (s) => `
        <div class="account-card" style="--card-accent:${esc(s.account.color || '#0e937e')}">
          <div class="row between">
            <b>${esc(s.account.name)}</b>
            <small class="pill">${esc(ACCOUNT_TYPE_LABELS[s.account.type] || s.account.type)}</small>
          </div>
          <strong class="${s.balance < 0 ? 'red' : 'green'} num">${fmt(s.balance)} <small>تومان</small></strong>
          <small>اول ماه: ${fmt(s.opening)} (${s.openingSource === 'manual' ? 'دستی' : 'خودکار'})</small>
        </div>
      `
        )
        .join('')}
    </div>

    <div class="finance-grid" style="margin-top:12px">
      ${kpiCard('ورودی واقعی تا الان', metrics.inc, 'green', 'بدون احتساب انتقال‌های داخلی')}
      ${kpiCard('خروجی واقعی تا الان', metrics.out, 'red', 'تمام پرداخت‌های واقعی ماه')}
      ${kpiCard('مانده بدهی لازم تا پایان ماه', metrics.needTotal, 'amber', 'بدهی این ماه + معوقات قبلی')}
    </div>

    <div class="charts-grid">
      <div class="panel">
        <div class="panel-head"><h2>ترکیب هزینه‌های ماه بر اساس دسته‌بندی</h2></div>
        <div class="chart-box"><canvas id="dashCategoryChart"></canvas></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>موجودی حساب‌ها و کارت‌ها</h2></div>
        <div class="chart-box"><canvas id="dashAccountsChart"></canvas></div>
      </div>
    </div>

    <div class="section-title">
      <h2>وضعیت بدهی‌ها و اقساط</h2>
      <small>با پشتیبانی از پرداخت جزئی</small>
    </div>
    <div class="finance-grid">
      ${kpiCard('کل بدهی سررسید این ماه', metrics.monthDebtTotal, '', 'پرداخت‌شده + باقی‌مانده')}
      ${kpiCard('پرداخت‌شده از بدهی ماه', metrics.monthPaidTotal, 'green', `${fmt(metrics.monthPaidCount)} مورد تسویه کامل`)}
      ${kpiCard('باقی‌مانده از بدهی ماه', metrics.monthOpenTotal, 'amber', `${fmt(metrics.monthOpenCount)} مورد باز`)}
      ${kpiCard('کل بدهی زنده امروز', metrics.liveDebtTotal, 'amber', 'تمام اقساط و بدهی‌های باز')}
      ${kpiCard('بدهی عقب‌افتاده امروز', metrics.actualLateTotal, 'red', `${fmt(metrics.actualLate.length)} مورد`)}
      ${kpiCard('کل مطالبات باز امروز', metrics.receivablesTotal, 'green', 'پولی که باید پس بگیرید')}
    </div>

    <div class="charts-grid">
      <div class="panel">
        <h2>اگر همه بدهی‌ها را یکجا بدهم</h2>
        ${line('موجودی تخمینی در تاریخ انتخاب‌شده', metrics.net, colorOf(metrics.net))}
        ${line('کل بدهی باقی‌مانده در همان تاریخ', metrics.allOpenTotal, 'amber')}
        ${line(metrics.allAfter < 0 ? 'کسری برای تسویه کامل' : 'مانده پس از تسویه کامل', Math.abs(metrics.allAfter), colorOf(metrics.allAfter))}
      </div>
      <div class="panel">
        <h2>جزئیات پول آزاد پایان ماه</h2>
        ${line('موجودی ابتدای ماه', metrics.opening)}
        ${line('درآمد واقعی دریافت‌شده', metrics.earned, 'green')}
        ${line('کل پرداخت واقعی (هزینه و تعهدات)', metrics.out, 'red')}
        ${line('دریافتی ثبت‌شده آتی همین ماه', metrics.plannedIn, 'green')}
        ${line('خروجی ثبت‌شده آتی همین ماه', metrics.plannedOut, 'amber')}
        ${line('معوقات از ماه‌های قبل', metrics.lateTotal, 'red')}
      </div>
    </div>

    <div class="panel">
      <h2>پیشرفت تسویه بدهی‌های ماه · ${fmt(pct)}٪</h2>
      <div class="debt-bar">
        <span style="width:${Math.min(100, pct)}%"></span>
        <span style="width:${Math.max(0, 100 - pct)}%"></span>
      </div>
      <div class="mini-line">
        <span class="green">✓ ${fmt(metrics.monthPaidTotal)} تومان پرداخت‌شده</span>
        <span class="amber">${fmt(metrics.monthOpenTotal)} تومان باقی‌مانده</span>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>فوری | معوقه‌ها و سررسید ۷ روز آینده</h2></div>
      ${tableHtml(['عنوان', 'نوع', 'سررسید', 'مبلغ', 'وضعیت', 'عملیات'], obligationRowsHtml(state, urgentRows))}
    </div>

    <div class="panel">
      <div class="panel-head"><h2>تقویم تعهدات ${esc(monthName(m))}</h2></div>
      ${tableHtml(['عنوان', 'نوع', 'سررسید', 'مبلغ', 'وضعیت', 'عملیات'], obligationRowsHtml(state, monthCalendar))}
    </div>

    <div class="panel">
      <div class="panel-head"><h2>آخرین گردش واقعی ماه</h2></div>
      ${tableHtml(['شرح', 'نوع', 'حساب', 'تاریخ', 'مبلغ'], recentLedger)}
    </div>
  `;
}

export function mountDashboard(container, state, { navigate }) {
  const m = state.month;
  const metrics = computeDashboardMetrics(state, m);

  // Category expense chart data
  const catTotals = {};
  for (const e of metrics.c) {
    if (e.sign < 0 && (e.type === 'expense' || e.type === 'bill')) {
      const key = e.category || 'سایر';
      catTotals[key] = (catTotals[key] || 0) + e.amount;
    }
  }
  const catEntries = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([label, amount]) => ({
      label,
      amount,
      color: getCategoryMeta(state, label).color,
    }));

  renderCategoryDoughnut(container.querySelector('#dashCategoryChart'), catEntries, {
    key: 'dash-cat',
    emptyLabel: 'هنوز هزینه‌ای ثبت نشده',
  });
  renderAccountBalancesBar(container.querySelector('#dashAccountsChart'), metrics.accountSummaries, {
    key: 'dash-acc',
  });

  container.onclick = (e) => {
    const actBtn = e.target.closest('[data-dash-act]');
    if (actBtn) {
      const act = actBtn.getAttribute('data-dash-act');
      if (act === 'opening') openOpeningModal(m);
      else if (act === 'current-month') {
        mutateState((draft) => {
          const cur = currentMonth();
          ensureMonthListed(draft, cur);
          draft.month = cur;
        });
      } else if (act === 'add-income') openTxModal('income');
      else if (act === 'add-expense') openTxModal('expense');
      else if (act === 'add-transfer') openTransferModal();
      else if (act === 'add-plan') openPlanWizardModal();
      else if (act === 'add-bill') openBillModal();
      else if (act === 'add-loan') openLoanModal();
      return;
    }

    const navBtn = e.target.closest('[data-dash-nav]');
    if (navBtn) {
      navigate(navBtn.getAttribute('data-dash-nav'));
      return;
    }

    const payBtn = e.target.closest('[data-dash-pay]');
    if (payBtn) {
      const [kind, id] = payBtn.getAttribute('data-dash-pay').split('|');
      openPaymentModal(kind, id);
      return;
    }

    const postBtn = e.target.closest('[data-rec-post]');
    if (postBtn) {
      const [ruleId, rMonth, rDate] = postBtn.getAttribute('data-rec-post').split('|');
      mutateState((draft) => {
        const rule = (draft.recurring || []).find((r) => r.id === ruleId);
        if (!rule) return;
        rule.handledMonths = rule.handledMonths || {};
        if (rule.handledMonths[rMonth]) return;
        draft.tx.push({
          id: uid(),
          type: rule.type,
          title: rule.title,
          amount: rule.amount,
          date: rDate,
          category: rule.category || 'سایر',
          accountId: rule.accountId || draft.accounts[0]?.id || 'acc_main',
          recurringId: rule.id,
        });
        ensureMonthListed(draft, rMonth);
        rule.handledMonths[rMonth] = 'posted';
      });
      showToast('تراکنش دوره‌ای با موفقیت ثبت شد', { type: 'success' });
      return;
    }

    const skipBtn = e.target.closest('[data-rec-skip]');
    if (skipBtn) {
      const [ruleId, rMonth] = skipBtn.getAttribute('data-rec-skip').split('|');
      mutateState((draft) => {
        const rule = (draft.recurring || []).find((r) => r.id === ruleId);
        if (!rule) return;
        rule.handledMonths = rule.handledMonths || {};
        rule.handledMonths[rMonth] = 'skipped';
      });
      showToast('یادآور این ماه رد شد', { type: 'info' });
    }
  };
}
