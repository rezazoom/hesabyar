import { monthName } from '../date.js';
import { esc, fmt } from '../format.js';
import { getCashEvents, getMonthTimelineBalances, getMonthTotals, getObligations } from '../ledger.js';
import { mutateState } from '../state.js';
import { icon } from '../ui/icons.js';
import { confirmDialog, tableHtml } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { openNewMonthModal, openOpeningModal } from './dialogs.js';

export function renderMonths(state) {
  const timeline = getMonthTimelineBalances(state);
  const monthsDesc = [...timeline.months].reverse();

  return `
    <div class="actions">
      <button type="button" class="btn btn-primary" data-m-act="new">${icon('Plus', 'sm')} ماه جدید</button>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>آرشیو ماه‌ها و زنجیره انتقال موجودی</h2>
        <small>مانده پایان هر ماه به صورت خودکار به ابتدای ماه بعد منتقل می‌شود</small>
      </div>
      ${tableHtml(
        ['ماه', 'اول ماه', 'ورودی', 'خروجی', 'پایان ماه', 'تعهدات باز', 'عملیات'],
        monthsDesc.map((m) => {
          const t = getMonthTotals(state, m);
          const b = timeline.byMonth[m];
          const sourceBadge = b.hasManualOverride
            ? '<span class="state soon">دستی</span>'
            : '<span class="state paid">خودکار</span>';
          return [
            `<b>${esc(monthName(m))}</b>`,
            `<span class="num">${fmt(b.totalOpening)}</span> ${sourceBadge}`,
            `<span class="green num">${fmt(t.inc)}</span>`,
            `<span class="red num">${fmt(t.out)}</span>`,
            `<b class="num ${b.totalClosing < 0 ? 'red' : 'green'}">${fmt(b.totalClosing)}</b>`,
            `<span class="amber num">${fmt(t.pending)}</span>`,
            `<div class="td-actions">
              <button type="button" class="btn btn-sm btn-primary" data-m-open="${esc(m)}">مشاهده</button>
              <button type="button" class="btn btn-sm btn-ghost" data-m-opening="${esc(m)}">تنظیم اول ماه</button>
              <button type="button" class="btn btn-sm btn-danger" data-m-del="${esc(m)}">حذف ماه خالی</button>
            </div>`,
          ];
        })
      )}
    </div>
  `;
}

export function mountMonths(container, state, { navigate }) {
  container.onclick = async (e) => {
    if (e.target.closest('[data-m-act="new"]')) {
      return openNewMonthModal();
    }

    const openM = e.target.closest('[data-m-open]')?.getAttribute('data-m-open');
    if (openM) {
      mutateState((draft) => {
        draft.month = openM;
      }, { recordPrevious: false, render: false });
      navigate('dash');
      return;
    }

    const editOpening = e.target.closest('[data-m-opening]')?.getAttribute('data-m-opening');
    if (editOpening) {
      return openOpeningModal(editOpening);
    }

    const delM = e.target.closest('[data-m-del]')?.getAttribute('data-m-del');
    if (delM) {
      const hasCash = getCashEvents(state, { includeTransfers: true }).some((t) =>
        t.date.startsWith(delM)
      );
      const hasOb = getObligations(state).some((o) => o.date.startsWith(delM));
      if (hasCash || hasOb) {
        showToast('این ماه دارای تراکنش یا تعهد ثبت‌شده است و حذف نمی‌شود.', { type: 'error' });
        return;
      }
      if (state.months.length <= 1) {
        showToast('حداقل یک ماه باید باقی بماند.', { type: 'warning' });
        return;
      }
      const ok = await confirmDialog({
        title: 'حذف ماه خالی',
        message: `ماه ${monthName(delM)} حذف شود؟`,
        confirmLabel: 'حذف ماه',
        danger: true,
      });
      if (!ok) return;
      mutateState((draft) => {
        draft.months = draft.months.filter((x) => x !== delM);
        if (draft.openingByAccount) delete draft.openingByAccount[delM];
        if (draft.month === delM) draft.month = draft.months[0];
      });
      showToast('ماه خالی حذف شد', { type: 'info' });
    }
  };
}
