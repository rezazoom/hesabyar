import { monthName } from '../date.js';
import { esc, fmt } from '../format.js';
import {
  getAccountName,
  getInstallmentOccurrences,
  getLoansNormalized,
  getObligationStatus,
  sumAmounts,
} from '../ledger.js';
import { notify, ui } from '../state.js';
import { icon } from '../ui/icons.js';
import { tableHtml } from '../ui/modal.js';
import {
  deleteItemWithConfirm,
  openBillModal,
  openBillOverrideModal,
  openLoanModal,
  openPaymentModal,
  openPlanWizardModal,
} from './dialogs.js';

function renderPlansTab(state) {
  const occs = getInstallmentOccurrences(state);
  const plans = state.plans.filter((p) => p.kind !== 'bill');

  const cards = plans
    .map((p) => {
      const items = occs.filter((o) => o.plan.id === p.id);
      const totalPlan = sumAmounts(items);
      const totalPaid = sumAmounts(items, 'paidSum');
      const totalRemaining = sumAmounts(items, 'remaining');
      const settledCount = items.filter((o) => o.remaining === 0).length;
      const pct = Math.round((totalPaid / Math.max(1, totalPlan)) * 100);
      const openDetails = items.some((o) => o.date.startsWith(state.month));

      return `
        <div class="panel">
          <div class="panel-head">
            <div>
              <h2>${esc(p.title)}</h2>
              <small>شروع: ${esc(monthName(p.start))} · حساب پیش‌فرض: ${esc(getAccountName(state, p.defaultAccountId))}</small>
            </div>
            <div class="row">
              <button type="button" class="btn btn-sm btn-ghost" data-ob-act="edit-plan" data-id="${esc(p.id)}">${icon('Pencil', 'sm')} ویرایش</button>
              <button type="button" class="btn btn-sm btn-danger" data-ob-act="del-plan" data-id="${esc(p.id)}">${icon('Trash2', 'sm')} حذف</button>
            </div>
          </div>

          <div class="grid">
            <div class="card"><small>مبلغ هر قسط</small><strong class="num">${fmt(p.amount)}</strong><small>تومان</small></div>
            <div class="card"><small>بدهی باقی‌مانده</small><strong class="amber num">${fmt(totalRemaining)}</strong><small>تومان</small></div>
            <div class="card"><small>پیشرفت تعداد</small><strong class="green num">${fmt(settledCount)} / ${fmt(p.count)}</strong><small>قسط تسویه‌شده</small></div>
          </div>

          <div class="progress-track"><i class="progress-fill is-good" style="width:${Math.min(100, pct)}%"></i></div>
          <small>${fmt(totalPaid)} تومان پرداخت‌شده از ${fmt(totalPlan)} تومان (${fmt(pct)}٪)</small>

          <details ${openDetails ? 'open' : ''} style="margin-top:12px">
            <summary style="cursor:pointer;font-weight:700;margin-bottom:10px">جدول کامل اقساط</summary>
            ${tableHtml(
              ['شماره', 'سررسید', 'مبلغ قسط', 'پرداخت‌شده', 'وضعیت', 'عملیات'],
              items.map((o) => {
                const stInfo = getObligationStatus(o);
                const btnLabel =
                  o.remaining === 0 ? 'سوابق' : o.paidSum > 0 ? 'ادامه پرداخت' : 'ثبت پرداخت';
                return [
                  fmt(o.i + 1),
                  esc(o.date),
                  `<span class="num">${fmt(o.amount)}</span>`,
                  `<span class="num">${o.paidSum ? fmt(o.paidSum) : '—'}</span>`,
                  `<span class="state ${esc(stInfo.key)}">${esc(stInfo.label)}</span>`,
                  `<button type="button" class="btn btn-sm ${o.remaining === 0 ? 'btn-ghost' : 'btn-primary'}" data-ob-pay="installment|${esc(o.id)}">${esc(btnLabel)}</button>`,
                ];
              })
            )}
          </details>
        </div>
      `;
    })
    .join('');

  return `
    <div class="actions">
      <button type="button" class="btn btn-primary" data-ob-act="add-plan">${icon('Plus', 'sm')} تعریف اقساط با ویزارد</button>
    </div>
    ${cards || '<div class="panel empty-state">هنوز برنامه اقساطی تعریف نشده است.</div>'}
  `;
}

function renderBillsTab(state) {
  const monthBills = getInstallmentOccurrences(state)
    .filter((o) => o.kind === 'bill' && o.date.startsWith(state.month))
    .sort((a, b) => a.date.localeCompare(b.date));

  const billPlans = state.plans.filter((p) => p.kind === 'bill');
  const totalAmt = sumAmounts(monthBills);
  const paidAmt = sumAmounts(monthBills, 'paidSum');
  const remAmt = sumAmounts(monthBills, 'remaining');

  return `
    <div class="actions">
      <button type="button" class="btn btn-primary" data-ob-act="add-bill">${icon('Plus', 'sm')} قبض / هزینه ثابت جدید</button>
    </div>

    <div class="grid">
      <div class="card"><small>مجموع قبوض ${esc(monthName(state.month))}</small><strong class="num">${fmt(totalAmt)}</strong><small>تومان</small></div>
      <div class="card"><small>پرداخت‌شده</small><strong class="green num">${fmt(paidAmt)}</strong><small>تومان</small></div>
      <div class="card"><small>باقی‌مانده</small><strong class="amber num">${fmt(remAmt)}</strong><small>تومان</small></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>قبوض و شارژهای ${esc(monthName(state.month))}</h2></div>
      ${tableHtml(
        ['عنوان', 'دسته', 'سررسید', 'مبلغ', 'پرداخت‌شده', 'وضعیت', 'عملیات'],
        monthBills.map((o) => {
          const stInfo = getObligationStatus(o);
          return [
            esc(o.title),
            esc(o.category || 'سایر'),
            esc(o.date),
            `<span class="num">${fmt(o.amount)}</span>`,
            `<span class="num">${o.paidSum ? fmt(o.paidSum) : '—'}</span>`,
            `<span class="state ${esc(stInfo.key)}">${esc(stInfo.label)}</span>`,
            `<div class="td-actions">
              <button type="button" class="btn btn-sm ${o.remaining === 0 ? 'btn-ghost' : 'btn-primary'}" data-ob-pay="bill|${esc(o.id)}">${o.remaining === 0 ? 'سوابق' : 'پرداخت'}</button>
              <button type="button" class="btn btn-sm btn-ghost" data-bill-ov="${esc(o.plan.id)}|${o.i}">تغییر مبلغ این ماه</button>
            </div>`,
          ];
        })
      )}
    </div>

    <div class="panel">
      <div class="panel-head"><h2>برنامه‌های دوره‌ای قبوض</h2></div>
      ${tableHtml(
        ['عنوان', 'دسته', 'مبلغ پیش‌فرض', 'تعداد ماه', 'حساب پیش‌فرض', 'عملیات'],
        billPlans.map((p) => [
          esc(p.title),
          esc(p.category || 'سایر'),
          `<span class="num">${fmt(p.amount)}</span>`,
          fmt(p.count),
          esc(getAccountName(state, p.defaultAccountId)),
          `<div class="td-actions">
            <button type="button" class="btn btn-sm btn-ghost" data-ob-act="edit-bill" data-id="${esc(p.id)}">ویرایش</button>
            <button type="button" class="btn btn-sm btn-danger" data-ob-act="del-plan" data-id="${esc(p.id)}">حذف</button>
          </div>`,
        ])
      )}
    </div>
  `;
}

function renderLoansTab(state) {
  const loans = getLoansNormalized(state).sort((a, b) => a.date.localeCompare(b.date));

  return `
    <div class="actions">
      <button type="button" class="btn btn-primary" data-ob-act="add-loan">${icon('Plus', 'sm')} ثبت قرض یا طلب جدید</button>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>دفتر قرض و طلب (با امکان بازپرداخت جزئی)</h2></div>
      ${tableHtml(
        ['شخص / شرح', 'نوع', 'حساب', 'تاریخ اولیه', 'سررسید', 'مبلغ کل', 'مانده', 'وضعیت', 'عملیات'],
        loans.map((l) => {
          const stInfo = getObligationStatus(l);
          return [
            esc(l.title),
            l.type === 'lend' ? '<span class="green">طلب</span>' : '<span class="amber">بدهی</span>',
            esc(getAccountName(state, l.accountId)),
            esc(l.given),
            esc(l.date),
            `<span class="num">${fmt(l.amount)}</span>`,
            `<b class="num ${l.remaining > 0 ? 'amber' : 'green'}">${fmt(l.remaining)}</b>`,
            `<span class="state ${esc(stInfo.key)}">${esc(stInfo.label)}</span>`,
            `<div class="td-actions">
              <button type="button" class="btn btn-sm ${l.remaining === 0 ? 'btn-ghost' : 'btn-primary'}" data-ob-pay="${esc(l.type)}|${esc(l.id)}">${l.remaining === 0 ? 'سوابق' : l.paidSum > 0 ? 'ادامه تسویه' : 'تسویه'}</button>
              <button type="button" class="btn btn-sm btn-ghost" data-ob-act="edit-loan" data-id="${esc(l.id)}">ویرایش</button>
              <button type="button" class="btn btn-sm btn-danger" data-ob-act="del-loan" data-id="${esc(l.id)}">حذف</button>
            </div>`,
          ];
        })
      )}
    </div>
  `;
}

export function renderObligations(state) {
  const sub = ui.obligationsTab || 'plans';
  const tabs = [
    ['plans', 'اقساط و وام‌ها', 'CalendarClock'],
    ['bills', 'قبوض و شارژ', 'Receipt'],
    ['loans', 'قرض و طلب', 'Landmark'],
  ];

  const body =
    sub === 'bills'
      ? renderBillsTab(state)
      : sub === 'loans'
      ? renderLoansTab(state)
      : renderPlansTab(state);

  return `
    <div class="sub-tabs" role="tablist">
      ${tabs
        .map(
          ([key, label, ic]) => `
        <button type="button" role="tab" aria-selected="${sub === key}" class="sub-tab ${sub === key ? 'active' : ''}" data-ob-tab="${key}">
          ${icon(ic, 'sm')} ${esc(label)}
        </button>
      `
        )
        .join('')}
    </div>
    ${body}
  `;
}

export function mountObligations(container) {
  container.onclick = (e) => {
    const tabBtn = e.target.closest('[data-ob-tab]');
    if (tabBtn) {
      ui.obligationsTab = tabBtn.getAttribute('data-ob-tab');
      notify();
      return;
    }

    const payBtn = e.target.closest('[data-ob-pay]');
    if (payBtn) {
      const [kind, id] = payBtn.getAttribute('data-ob-pay').split('|');
      return openPaymentModal(kind, id);
    }

    const ovBtn = e.target.closest('[data-bill-ov]');
    if (ovBtn) {
      const [planId, idx] = ovBtn.getAttribute('data-bill-ov').split('|');
      return openBillOverrideModal(planId, Number(idx));
    }

    const actBtn = e.target.closest('[data-ob-act]');
    if (!actBtn) return;
    const act = actBtn.getAttribute('data-ob-act');
    const id = actBtn.getAttribute('data-id') || '';

    if (act === 'add-plan') return openPlanWizardModal();
    if (act === 'edit-plan') return openPlanWizardModal(id);
    if (act === 'add-bill') return openBillModal();
    if (act === 'edit-bill') return openBillModal(id);
    if (act === 'del-plan') return deleteItemWithConfirm('plans', id, 'این برنامه');
    if (act === 'add-loan') return openLoanModal();
    if (act === 'edit-loan') return openLoanModal(id);
    if (act === 'del-loan') return deleteItemWithConfirm('loans', id, 'این قرض / طلب');
  };
}
