import { monthName } from '../date.js';
import { esc, fmt } from '../format.js';
import { ACCOUNT_TYPE_LABELS, computeDashboardMetrics, getAccountName } from '../ledger.js';
import { mutateState } from '../state.js';
import { icon } from '../ui/icons.js';
import { confirmDialog, tableHtml } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { deleteItemWithConfirm, openAccountModal, openOpeningModal, openTransferModal } from './dialogs.js';

export function renderAccounts(state) {
  const metrics = computeDashboardMetrics(state, state.month);
  const transfers = [...(state.transfers || [])]
    .filter((t) => t.date.startsWith(state.month))
    .sort((a, b) => b.date.localeCompare(a.date));

  const allTransfers = [...(state.transfers || [])].sort((a, b) => b.date.localeCompare(a.date));

  return `
    <div class="actions">
      <button type="button" class="btn btn-primary" data-acc-act="add-account">${icon('Plus', 'sm')} حساب / کارت جدید</button>
      <button type="button" class="btn btn-secondary" data-acc-act="add-transfer">${icon('ArrowLeftRight', 'sm')} انتقال بین حساب‌ها</button>
      <button type="button" class="btn btn-ghost" data-acc-act="opening">${icon('SlidersHorizontal', 'sm')} تنظیم موجودی ابتدای ماه</button>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>کارت‌ها و کیف‌پول‌ها · ${esc(monthName(state.month))}</h2>
        <small>مجموع مانده فعلی: <b class="num ${metrics.net < 0 ? 'red' : 'green'}">${fmt(metrics.net)} تومان</b></small>
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
            <div class="mini-line"><span>ابتدای ماه</span><b class="num">${fmt(s.opening)}</b></div>
            <div class="mini-line"><span>ورودی ماه</span><b class="green num">+ ${fmt(s.inFlow)}</b></div>
            <div class="mini-line"><span>خروجی ماه</span><b class="red num">− ${fmt(s.outFlow)}</b></div>
            <div class="row" style="margin-top:6px">
              <button type="button" class="btn btn-sm btn-ghost" data-acc-edit="${esc(s.account.id)}">${icon('Pencil', 'sm')} ویرایش</button>
              ${
                state.accounts.length > 1
                  ? `<button type="button" class="btn btn-sm btn-danger" data-acc-del="${esc(s.account.id)}">${icon('Trash2', 'sm')} حذف</button>`
                  : ''
              }
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>انتقال‌های ${esc(monthName(state.month))}</h2>
        <small>${fmt(transfers.length)} انتقال در این ماه · کل تاریخچه: ${fmt(allTransfers.length)}</small>
      </div>
      ${tableHtml(
        ['تاریخ', 'از حساب', 'به حساب', 'مبلغ', 'توضیح', 'عملیات'],
        allTransfers.map((tr) => [
          esc(tr.date),
          esc(getAccountName(state, tr.fromAccountId)),
          esc(getAccountName(state, tr.toAccountId)),
          `<b class="num">${fmt(tr.amount)} تومان</b>`,
          esc(tr.note || '—'),
          `<div class="td-actions">
            <button type="button" class="btn btn-sm btn-ghost" data-tr-edit="${esc(tr.id)}">ویرایش</button>
            <button type="button" class="btn btn-sm btn-danger" data-tr-del="${esc(tr.id)}">حذف</button>
          </div>`,
        ]),
        { emptyText: 'هنوز انتقالی بین حساب‌ها ثبت نشده است.' }
      )}
    </div>
  `;
}

export function mountAccounts(container, state) {
  container.onclick = async (e) => {
    const act = e.target.closest('[data-acc-act]')?.getAttribute('data-acc-act');
    if (act === 'add-account') return openAccountModal();
    if (act === 'add-transfer') return openTransferModal();
    if (act === 'opening') return openOpeningModal(state.month);

    const editId = e.target.closest('[data-acc-edit]')?.getAttribute('data-acc-edit');
    if (editId) return openAccountModal(editId);

    const delId = e.target.closest('[data-acc-del]')?.getAttribute('data-acc-del');
    if (delId) {
      const used =
        state.tx.some((t) => t.accountId === delId) ||
        (state.transfers || []).some((tr) => tr.fromAccountId === delId || tr.toAccountId === delId) ||
        state.loans.some((l) => l.accountId === delId);
      if (used) {
        showToast('این حساب دارای تراکنش یا انتقال ثبت‌شده است و قابل حذف نیست.', { type: 'error' });
        return;
      }
      const ok = await confirmDialog({
        title: 'حذف حساب',
        message: 'این حساب خالی حذف شود؟',
        confirmLabel: 'حذف حساب',
        danger: true,
      });
      if (!ok) return;
      mutateState((draft) => {
        draft.accounts = draft.accounts.filter((a) => a.id !== delId);
      });
      showToast('حساب حذف شد', { type: 'info' });
      return;
    }

    const trEdit = e.target.closest('[data-tr-edit]')?.getAttribute('data-tr-edit');
    if (trEdit) return openTransferModal(trEdit);

    const trDel = e.target.closest('[data-tr-del]')?.getAttribute('data-tr-del');
    if (trDel) return deleteItemWithConfirm('transfers', trDel, 'این انتقال');
  };
}
