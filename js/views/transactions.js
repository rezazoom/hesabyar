import { getCategoryMeta } from '../categories.js';
import { monthName } from '../date.js';
import { esc, fmt, norm } from '../format.js';
import { getAccountName, getCashEvents, sumAmounts, TYPE_LABELS } from '../ledger.js';
import { ui } from '../state.js';
import { icon } from '../ui/icons.js';
import { tableHtml } from '../ui/modal.js';
import { deleteItemWithConfirm, openTxModal } from './dialogs.js';

function getFilteredTx(state) {
  const f = ui.txFilter;
  const q = norm(f.search).toLowerCase();

  const items = state.tx
    .filter((t) => t.date.startsWith(state.month))
    .filter((t) => f.type === 'all' || t.type === f.type)
    .filter((t) => f.category === 'all' || (t.category || 'سایر') === f.category)
    .filter((t) => f.accountId === 'all' || (t.accountId || state.accounts[0]?.id) === f.accountId)
    .filter((t) => {
      if (!q) return true;
      return (
        norm(t.title).toLowerCase().includes(q) ||
        norm(t.category || '').toLowerCase().includes(q)
      );
    });

  const sorters = {
    'date-desc': (a, b) => b.date.localeCompare(a.date),
    'date-asc': (a, b) => a.date.localeCompare(b.date),
    'amount-desc': (a, b) => b.amount - a.amount,
    'amount-asc': (a, b) => a.amount - b.amount,
  };
  return items.sort(sorters[f.sort] || sorters['date-desc']);
}

function renderTxResultsHtml(state) {
  const list = getFilteredTx(state);
  const incTotal = sumAmounts(list.filter((x) => x.type === 'income'));
  const expTotal = sumAmounts(list.filter((x) => x.type === 'expense'));

  const txTable = tableHtml(
    ['شرح', 'دسته‌بندی', 'حساب', 'نوع', 'تاریخ', 'مبلغ', 'عملیات'],
    list.map((t) => {
      const meta = getCategoryMeta(state, t.category);
      return [
        esc(t.title),
        `<span class="category-chip" style="--chip-color:${esc(meta.color)}">${esc(t.category || 'سایر')}</span>`,
        esc(getAccountName(state, t.accountId)),
        t.type === 'income' ? '<span class="green">درآمد</span>' : '<span class="red">هزینه</span>',
        esc(t.date),
        `<b class="num ${t.type === 'income' ? 'green' : 'red'}">${fmt(t.amount)} تومان</b>`,
        `<div class="td-actions">
          <button type="button" class="btn btn-sm btn-ghost" data-tx-edit="${esc(t.id)}">ویرایش</button>
          <button type="button" class="btn btn-sm btn-danger" data-tx-del="${esc(t.id)}">حذف</button>
        </div>`,
      ];
    })
  );

  const ledgerEvents = getCashEvents(state, { includeTransfers: true })
    .filter((e) => e.date.startsWith(state.month))
    .filter((e) => ui.txFilter.accountId === 'all' || e.accountId === ui.txFilter.accountId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const ledgerTable = tableHtml(
    ['شرح', 'نوع', 'حساب', 'تاریخ', 'مبلغ'],
    ledgerEvents.map((e) => [
      esc(e.title),
      esc(TYPE_LABELS[e.type] || e.type),
      esc(getAccountName(state, e.accountId)),
      esc(e.date),
      `<span class="${e.isTransfer ? 'info-text' : e.sign > 0 ? 'green' : 'red'} num">${e.sign > 0 ? '+' : '−'} ${fmt(e.amount)}</span>`,
    ])
  );

  return `
    <div class="grid" style="margin-bottom:14px">
      <div class="card"><small>درآمد فیلترشده</small><strong class="green num">${fmt(incTotal)}</strong><small>تومان</small></div>
      <div class="card"><small>هزینه فیلترشده</small><strong class="red num">${fmt(expTotal)}</strong><small>تومان</small></div>
      <div class="card"><small>خالص تراکنش‌های فیلترشده</small><strong class="${incTotal - expTotal >= 0 ? 'green' : 'red'} num">${fmt(incTotal - expTotal)}</strong><small>تومان</small></div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>تراکنش‌های ${esc(monthName(state.month))}</h2>
        <small>${fmt(list.length)} مورد</small>
      </div>
      ${txTable}
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>دفتر کل گردش نقدی ماه (شامل اقساط، قبوض، قرض و انتقال)</h2>
        <small>${fmt(ledgerEvents.length)} ردیف</small>
      </div>
      ${ledgerTable}
    </div>
  `;
}

export function renderTransactions(state) {
  const f = ui.txFilter;
  const categories = [...new Set((state.categories || []).map((c) => c.name))];

  return `
    <div class="actions">
      <button type="button" class="btn btn-primary" data-tx-add="income">${icon('Plus', 'sm')} ثبت درآمد</button>
      <button type="button" class="btn btn-secondary" data-tx-add="expense">${icon('Plus', 'sm')} ثبت هزینه</button>
    </div>

    <div class="panel">
      <div class="filter-bar">
        <label class="field">
          <span>جستجو</span>
          <input id="txSearchInput" type="search" value="${esc(f.search)}" placeholder="عنوان یا دسته...">
        </label>
        <label class="field">
          <span>نوع</span>
          <select id="txTypeFilter">
            <option value="all" ${f.type === 'all' ? 'selected' : ''}>همه</option>
            <option value="income" ${f.type === 'income' ? 'selected' : ''}>درآمد</option>
            <option value="expense" ${f.type === 'expense' ? 'selected' : ''}>هزینه</option>
          </select>
        </label>
        <label class="field">
          <span>دسته‌بندی</span>
          <select id="txCatFilter">
            <option value="all" ${f.category === 'all' ? 'selected' : ''}>همه دسته‌ها</option>
            ${categories
              .map((c) => `<option value="${esc(c)}" ${f.category === c ? 'selected' : ''}>${esc(c)}</option>`)
              .join('')}
          </select>
        </label>
        <label class="field">
          <span>حساب / کارت</span>
          <select id="txAccFilter">
            <option value="all" ${f.accountId === 'all' ? 'selected' : ''}>همه حساب‌ها</option>
            ${(state.accounts || [])
              .map((a) => `<option value="${esc(a.id)}" ${f.accountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`)
              .join('')}
          </select>
        </label>
        <label class="field">
          <span>مرتب‌سازی</span>
          <select id="txSortFilter">
            <option value="date-desc" ${f.sort === 'date-desc' ? 'selected' : ''}>جدیدترین</option>
            <option value="date-asc" ${f.sort === 'date-asc' ? 'selected' : ''}>قدیمی‌ترین</option>
            <option value="amount-desc" ${f.sort === 'amount-desc' ? 'selected' : ''}>بیشترین مبلغ</option>
            <option value="amount-asc" ${f.sort === 'amount-asc' ? 'selected' : ''}>کمترین مبلغ</option>
          </select>
        </label>
      </div>
    </div>

    <div id="txResults">${renderTxResultsHtml(state)}</div>
  `;
}

export function mountTransactions(container, state) {
  const refreshBody = () => {
    const body = container.querySelector('#txResults');
    if (body) body.innerHTML = renderTxResultsHtml(state);
  };

  container.querySelector('#txSearchInput')?.addEventListener('input', (e) => {
    ui.txFilter.search = e.target.value;
    refreshBody();
  });
  container.querySelector('#txTypeFilter')?.addEventListener('change', (e) => {
    ui.txFilter.type = e.target.value;
    refreshBody();
  });
  container.querySelector('#txCatFilter')?.addEventListener('change', (e) => {
    ui.txFilter.category = e.target.value;
    refreshBody();
  });
  container.querySelector('#txAccFilter')?.addEventListener('change', (e) => {
    ui.txFilter.accountId = e.target.value;
    refreshBody();
  });
  container.querySelector('#txSortFilter')?.addEventListener('change', (e) => {
    ui.txFilter.sort = e.target.value;
    refreshBody();
  });

  container.onclick = (e) => {
    const addType = e.target.closest('[data-tx-add]')?.getAttribute('data-tx-add');
    if (addType) return openTxModal(addType);

    const editId = e.target.closest('[data-tx-edit]')?.getAttribute('data-tx-edit');
    if (editId) return openTxModal('income', editId);

    const delId = e.target.closest('[data-tx-del]')?.getAttribute('data-tx-del');
    if (delId) return deleteItemWithConfirm('tx', delId, 'این تراکنش');
  };
}
