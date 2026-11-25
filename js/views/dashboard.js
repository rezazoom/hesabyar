import { getCategoryMeta } from '../categories.js';
import { renderAccountBalancesBar, renderCategoryDoughnut } from '../charts.js';
import { currentMonth, daysDiff, monthName, today } from '../date.js';
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
import { ensureMonthListed, mutateState } from '../state.js';
import { icon } from '../ui/icons.js';
import { tableHtml } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import {
  openOpeningModal,
  openPaymentModal,
  openTransferModal,
} from './dialogs.js';

function obligationRowsHtml(state, list) {
  return list.map((o) => {
    const stInfo = getObligationStatus(o);
    const kindLabel = TYPE_LABELS[o.kind] || o.kind;
    const amtText =
      o.paidSum > 0 && o.remaining > 0
        ? `<span class="num">${fmt(o.remaining)}</span> <small class="muted">از ${fmt(o.amount)}</small>`
        : `<span class="num">${fmt(o.amount)}<span class="unit">تومان</span></span>`;
    const payLabel = o.remaining === 0 ? 'سوابق' : o.paidSum > 0 ? 'ادامه پرداخت' : 'تسویه';
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
  const pct = Math.round((metrics.monthPaidTotal / Math.max(1, metrics.monthDebtTotal)) * 100);
  const dueRecurring = getDueRecurringItems(state);
  const budgets = computeBudgetUsage(state, m);
  const warnBudgets = budgets.filter((b) => b.level !== 'good');

  const now = today();
  const curMonth = currentMonth();
  const upcoming = metrics.allObligations
    .filter((x) => x.remaining > 0 && daysDiff(x.date, now) >= 0 && daysDiff(x.date, now) <= 7)
    .sort((a, b) => a.date.localeCompare(b.date));

  const urgentRows = [...metrics.actualLate, ...upcoming];
  const monthCalendar = metrics.allObligations
    .filter((x) => x.date.startsWith(m))
    .sort((a, b) => a.date.localeCompare(b.date));

  const recentLedger = [...metrics.c]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)
    .map((x) => [
      esc(x.title),
      esc(TYPE_LABELS[x.type] || x.type),
      esc(getAccountName(state, x.accountId)),
      esc(x.date),
      `<span class="${x.sign > 0 ? 'green' : 'red'} num-ltr">${x.sign > 0 ? '+' : '−'} ${fmt(x.amount)}</span> <span class="unit">تومان</span>`,
    ]);

  const line = (label, value, cls = '') => `
    <div class="mini-line">
      <span>${esc(label)}</span>
      <b class="${esc(cls)} num"><span class="num-ltr">${fmt(value)}</span><span class="unit">تومان</span></b>
    </div>
  `;

  return `
    <section class="cockpit-summary">
      <div class="cockpit-top">
        <div class="cockpit-balance">
          <div class="row" style="gap:8px">
            <small>موجودی کل حساب‌ها · ${esc(monthName(m))}</small>
            <span class="pill">${metrics.hasManualOverride ? 'شروع ماه: دستی' : 'انتقال خودکار'}</span>
          </div>
          <div class="cockpit-balance-val ${metrics.net < 0 ? 'is-neg' : ''} num">
            <span class="num-ltr">${fmt(metrics.net)}</span><span class="unit">تومان</span>
          </div>
          <small>به‌روزرسانی گردش تا ${esc(metrics.cut)}</small>
        </div>
        <div class="row">
          <button type="button" class="btn btn-sm btn-ghost" data-dash-act="opening">${icon('SlidersHorizontal', 'sm')} موجودی اول ماه</button>
          <button type="button" class="btn btn-sm btn-ghost" data-dash-act="add-transfer">${icon('ArrowLeftRight', 'sm')} انتقال کارت</button>
          ${
            m !== curMonth
              ? `<button type="button" class="btn btn-sm btn-primary" data-dash-act="current-month">${icon('Calendar', 'sm')} ماه جاری</button>`
              : ''
          }
        </div>
      </div>

      <div class="cockpit-metrics">
        <div class="cockpit-metric">
          <small>ورودی ماه</small>
          <strong class="num"><span class="green">+</span> ${fmt(metrics.inc)}<span class="unit">تومان</span></strong>
        </div>
        <div class="cockpit-metric">
          <small>خروجی ماه</small>
          <strong class="num"><span class="red">−</span> ${fmt(metrics.out)}<span class="unit">تومان</span></strong>
        </div>
        <div class="cockpit-metric">
          <small>مانده پس از تعهدات</small>
          <strong class="num ${metrics.after < 0 ? 'red' : ''}"><span class="num-ltr">${fmt(metrics.after)}</span><span class="unit">تومان</span></strong>
        </div>
      </div>
    </section>

    ${
      dueRecurring.length
        ? `
      <div class="panel">
        <div class="panel-head">
          <h2>${icon('Repeat', 'sm')} یادآورهای تکرار آماده ثبت (${fmt(dueRecurring.length)})</h2>
          <button type="button" class="btn btn-sm btn-ghost" data-dash-nav="budgets">مدیریت تکرارها</button>
        </div>
        ${dueRecurring
          .slice(0, 4)
          .map(
            (item) => `
          <div class="mini-line">
            <div>
              <b>${esc(item.rule.title)}</b>
              <small class="muted"> · ${item.rule.type === 'income' ? 'درآمد' : 'هزینه'} · ${esc(item.dueDate)} · ${esc(getAccountName(state, item.rule.accountId))}</small>
            </div>
            <div class="row">
              <b class="num"><span class="${item.rule.type === 'income' ? 'green' : 'red'}">${item.rule.type === 'income' ? '+' : '−'}</span> ${fmt(item.rule.amount)}<span class="unit">تومان</span></b>
              <button type="button" class="btn btn-sm btn-primary" data-rec-post="${esc(item.rule.id)}|${esc(item.month)}|${esc(item.dueDate)}">تأیید و ثبت</button>
              <button type="button" class="btn btn-sm btn-ghost" data-rec-skip="${esc(item.rule.id)}|${esc(item.month)}">رد</button>
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
          ${warnBudgets.map((b) => `${esc(b.category)} (${fmt(b.pct)}٪ مصرف)`).join(' · ')}
        </div>
      </div>
    `
        : ''
    }

    <div class="accounts-strip">
      ${metrics.accountSummaries
        .map(
          (s) => `
        <div class="account-card">
          <div class="row between">
            <span class="account-title">
              <span class="account-dot" style="background:${esc(s.account.color || '#0e937e')}"></span>
              <b>${esc(s.account.name)}</b>
            </span>
            <small class="pill">${esc(ACCOUNT_TYPE_LABELS[s.account.type] || s.account.type)}</small>
          </div>
          <strong class="${s.balance < 0 ? 'red' : ''} num"><span class="num-ltr">${fmt(s.balance)}</span><span class="unit">تومان</span></strong>
          <small>اول ماه: <span class="num-ltr">${fmt(s.opening)}</span> (${s.openingSource === 'manual' ? 'دستی' : 'خودکار'})</small>
        </div>
      `
        )
        .join('')}
    </div>

    <div class="cockpit-bento">
      <div class="panel">
        <div class="panel-head">
          <h2>ترکیب هزینه‌های ماه</h2>
          <button type="button" class="btn btn-sm btn-ghost" data-dash-nav="reports">گزارش کامل</button>
        </div>
        <div class="chart-box"><canvas id="dashCategoryChart"></canvas></div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>تعهدات و بدهی‌های ماه</h2>
          <button type="button" class="btn btn-sm btn-ghost" data-dash-nav="obligations">مدیریت تعهدات</button>
        </div>
        <div class="mini-line"><span>پیشرفت تسویه ماه</span><b class="num">${fmt(pct)}٪</b></div>
        <div class="debt-bar" style="margin:6px 0 12px">
          <span style="width:${Math.min(100, pct)}%"></span>
          <span style="width:${Math.max(0, 100 - pct)}%"></span>
        </div>
        ${line('پرداخت‌شده از بدهی ماه', metrics.monthPaidTotal, 'green')}
        ${line('باقی‌مانده تعهدات تا پایان ماه', metrics.needTotal, metrics.needTotal > 0 ? 'amber' : '')}
        ${line('کل بدهی زنده (اقساط و قرض‌ها)', metrics.liveDebtTotal)}
        ${line('مطالبات باز', metrics.receivablesTotal, 'green')}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>فوری · معوقه‌ها و سررسید ۷ روز آینده</h2>
        <small>${fmt(urgentRows.length)} مورد</small>
      </div>
      ${tableHtml(['عنوان', 'نوع', 'سررسید', 'مبلغ', 'وضعیت', 'عملیات'], obligationRowsHtml(state, urgentRows), {
        emptyText: 'مورد معوقه یا سررسید فوری در ۷ روز آینده ندارید.',
      })}
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>آخرین گردش حساب ماه</h2>
        <button type="button" class="btn btn-sm btn-ghost" data-dash-nav="tx">همه تراکنش‌ها</button>
      </div>
      ${tableHtml(['شرح', 'نوع', 'حساب', 'تاریخ', 'مبلغ'], recentLedger)}
    </div>

    <details class="panel cockpit-details">
      <summary>
        <span>جزئیات محاسبات، شبیه‌ساز تسویه یکجا و تقویم ماه</span>
        <small class="muted">مشاهده / بستن</small>
      </summary>
      <div class="charts-grid" style="margin-top:0">
        <div>
          <h3>شبیه‌ساز تسویه یکجای بدهی‌ها</h3>
          ${line('موجودی تخمینی در تاریخ انتخاب‌شده', metrics.net)}
          ${line('کل بدهی باقی‌مانده در همان تاریخ', metrics.allOpenTotal, 'amber')}
          ${line(metrics.allAfter < 0 ? 'کسری برای تسویه کامل' : 'مانده پس از تسویه کامل', Math.abs(metrics.allAfter), metrics.allAfter < 0 ? 'red' : 'green')}
        </div>
        <div>
          <h3>صورت خلاصه پایان ماه</h3>
          ${line('موجودی ابتدای ماه', metrics.opening)}
          ${line('درآمد واقعی دریافت‌شده', metrics.earned, 'green')}
          ${line('کل پرداخت واقعی (هزینه و تعهدات)', metrics.out, 'red')}
          ${line('دریافتی آتی ثبت‌شده ماه', metrics.plannedIn, 'green')}
          ${line('خروجی آتی ثبت‌شده ماه', metrics.plannedOut, 'amber')}
          ${line('معوقات از ماه‌های قبل', metrics.lateTotal, 'red')}
        </div>
      </div>

      <div style="margin-top:18px">
        <h3>مقایسه موجودی حساب‌ها</h3>
        <div class="chart-box"><canvas id="dashAccountsChart"></canvas></div>
      </div>

      <div style="margin-top:18px">
        <h3>تقویم تعهدات ${esc(monthName(m))}</h3>
        ${tableHtml(['عنوان', 'نوع', 'سررسید', 'مبلغ', 'وضعیت', 'عملیات'], obligationRowsHtml(state, monthCalendar))}
      </div>
    </details>
  `;
}

export function mountDashboard(container, state, { navigate }) {
  const m = state.month;
  const metrics = computeDashboardMetrics(state, m);

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
    emptyLabel: 'هنوز هزینه‌ای در این ماه ثبت نشده است',
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
      } else if (act === 'add-transfer') openTransferModal();
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
