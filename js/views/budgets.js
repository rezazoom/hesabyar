import { getCategoryMeta } from '../categories.js';
import { monthName } from '../date.js';
import { esc, fmt, uid } from '../format.js';
import { computeBudgetUsage, getAccountName, getDueRecurringItems } from '../ledger.js';
import { ensureMonthListed, mutateState } from '../state.js';
import { icon } from '../ui/icons.js';
import { tableHtml } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { deleteItemWithConfirm, openBudgetModal, openRecurringModal } from './dialogs.js';

export function renderBudgets(state) {
  const m = state.month;
  const budgets = computeBudgetUsage(state, m);
  const dueList = getDueRecurringItems(state);
  const rules = state.recurring || [];

  return `
    <div class="actions">
      <button type="button" class="btn btn-primary" data-bg-act="add-budget">${icon('Target', 'sm')} تعیین بودجه دسته‌بندی</button>
      <button type="button" class="btn btn-secondary" data-bg-act="add-recurring">${icon('Repeat', 'sm')} قانون تکرار ماهانه جدید</button>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>بودجه دسته‌بندی‌های ${esc(monthName(m))}</h2>
        <small>هشدار خودکار در ۸۰٪ و سقف ۱۰۰٪ مصرف</small>
      </div>
      ${
        budgets.length
          ? `
        <div class="budget-grid">
          ${budgets
            .map((b) => {
              const meta = getCategoryMeta(state, b.category);
              const fillCls = b.level === 'over' ? 'is-over' : b.level === 'warn' ? 'is-warn' : 'is-good';
              return `
                <div class="card budget-card">
                  <div class="row between">
                    <span class="category-chip" style="--chip-color:${esc(meta.color)}">${esc(b.category)}</span>
                    <small class="pill">${b.month ? 'فقط این ماه' : 'پیش‌فرض ماهانه'}</small>
                  </div>
                  <div class="row between">
                    <b class="num">${fmt(b.spent)} <small>از ${fmt(b.amount)} تومان</small></b>
                    <b class="${b.level === 'over' ? 'red' : b.level === 'warn' ? 'amber' : 'green'} num">${fmt(b.pct)}٪</b>
                  </div>
                  <div class="progress-track">
                    <i class="progress-fill ${fillCls}" style="width:${Math.min(100, b.pct)}%"></i>
                  </div>
                  <div class="row between">
                    <small class="${b.remaining < 0 ? 'red' : 'muted'}">
                      ${b.remaining >= 0 ? `مانده مجاز: ${fmt(b.remaining)} تومان` : `اضافه مصرف: ${fmt(-b.remaining)} تومان`}
                    </small>
                    <div class="row" style="gap:4px">
                      <button type="button" class="btn btn-sm btn-ghost" data-bg-edit="${esc(b.id)}">ویرایش</button>
                      <button type="button" class="btn btn-sm btn-danger" data-bg-del="${esc(b.id)}">حذف</button>
                    </div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      `
          : '<div class="empty-state">هنوز بودجه‌ای برای دسته‌بندی‌ها تعیین نشده است.</div>'
      }
    </div>

    ${
      dueList.length
        ? `
      <div class="panel">
        <div class="panel-head"><h2>یادآورهای آماده ثبت تا امروز</h2></div>
        ${tableHtml(
          ['عنوان', 'نوع', 'دسته', 'حساب', 'تاریخ سررسید', 'مبلغ', 'عملیات'],
          dueList.map((d) => [
            esc(d.rule.title),
            d.rule.type === 'income' ? '<span class="green">درآمد</span>' : '<span class="red">هزینه</span>',
            esc(d.rule.category || 'سایر'),
            esc(getAccountName(state, d.rule.accountId)),
            esc(d.dueDate),
            `<b class="num">${fmt(d.rule.amount)}</b>`,
            `<div class="td-actions">
              <button type="button" class="btn btn-sm btn-primary" data-rec-post="${esc(d.rule.id)}|${esc(d.month)}|${esc(d.dueDate)}">تأیید و ثبت</button>
              <button type="button" class="btn btn-sm btn-ghost" data-rec-skip="${esc(d.rule.id)}|${esc(d.month)}">نادیده گرفتن</button>
            </div>`,
          ])
        )}
      </div>
    `
        : ''
    }

    <div class="panel">
      <div class="panel-head"><h2>قوانین درآمد و هزینه تکرارشونده</h2></div>
      ${tableHtml(
        ['عنوان', 'نوع', 'مبلغ', 'حساب', 'روز ماه', 'بازه', 'نحوه ثبت', 'وضعیت', 'عملیات'],
        rules.map((r) => [
          esc(r.title),
          r.type === 'income' ? '<span class="green">درآمد</span>' : '<span class="red">هزینه</span>',
          `<b class="num">${fmt(r.amount)}</b>`,
          esc(getAccountName(state, r.accountId)),
          fmt(r.day),
          `${esc(r.start)} تا ${esc(r.end || 'نامحدود')}`,
          r.autoPost ? '<span class="state paid">ثبت خودکار</span>' : '<span class="state soon">تأیید دستی</span>',
          r.active ? '<span class="state paid">فعال</span>' : '<span class="state waiting">متوقف</span>',
          `<div class="td-actions">
            <button type="button" class="btn btn-sm btn-ghost" data-rec-edit="${esc(r.id)}">ویرایش</button>
            <button type="button" class="btn btn-sm btn-danger" data-rec-del="${esc(r.id)}">حذف</button>
          </div>`,
        ]),
        { emptyText: 'هنوز قانون تکرار ماهانه‌ای تعریف نشده است.' }
      )}
    </div>
  `;
}

export function mountBudgets(container) {
  container.onclick = (e) => {
    const act = e.target.closest('[data-bg-act]')?.getAttribute('data-bg-act');
    if (act === 'add-budget') return openBudgetModal();
    if (act === 'add-recurring') return openRecurringModal();

    const bgEdit = e.target.closest('[data-bg-edit]')?.getAttribute('data-bg-edit');
    if (bgEdit) return openBudgetModal(bgEdit);

    const bgDel = e.target.closest('[data-bg-del]')?.getAttribute('data-bg-del');
    if (bgDel) return deleteItemWithConfirm('budgets', bgDel, 'این بودجه');

    const recEdit = e.target.closest('[data-rec-edit]')?.getAttribute('data-rec-edit');
    if (recEdit) return openRecurringModal(recEdit);

    const recDel = e.target.closest('[data-rec-del]')?.getAttribute('data-rec-del');
    if (recDel) return deleteItemWithConfirm('recurring', recDel, 'این قانون تکرار');

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
      showToast('تراکنش دوره‌ای ثبت شد', { type: 'success' });
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
      showToast('این دوره نادیده گرفته شد', { type: 'info' });
    }
  };
}
