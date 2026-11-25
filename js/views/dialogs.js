import { BILL_CATEGORIES, ensureCategory } from '../categories.js';
import { currentMonth, dueDate, shiftMonth, today, validDate, validMonth } from '../date.js';
import { esc, fmt, norm, parseMoney, requireText, uid } from '../format.js';
import {
  ACCOUNT_TYPE_LABELS,
  getAccountName,
  getInstallmentOccurrences,
  getLoansNormalized,
  getMonthTimelineBalances,
} from '../ledger.js';
import { ensureMonthListed, getState, mutateState } from '../state.js';
import { icon } from '../ui/icons.js';
import {
  accountSelectHtml,
  closeModal,
  confirmDialog,
  dateFieldHtml,
  fieldHtml,
  moneyFieldHtml,
  openFormModal,
  openInfoModal,
  selectHtml,
  tableHtml,
} from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

export function openNewMonthModal() {
  const st = getState();
  openFormModal({
    title: 'تعریف ماه جدید',
    fieldsHtml: fieldHtml('m', 'سال و ماه شمسی', shiftMonth(st.month, 1), 'text', 'placeholder="1405-10" dir="ltr" required'),
    submitLabel: 'ایجاد و انتخاب ماه',
    onSubmit(o) {
      const m = validMonth(o.m);
      mutateState((draft) => {
        ensureMonthListed(draft, m);
        draft.month = m;
      });
      closeModal();
      showToast('ماه جدید اضافه شد', { type: 'success' });
    },
  });
}

export function openTxModal(defaultType = 'income', id = '') {
  const st = getState();
  const existing = st.tx.find((x) => x.id === id);
  const tx = existing || {
    type: defaultType,
    title: '',
    amount: '',
    date: st.month === currentMonth() ? today() : `${st.month}-01`,
    category: defaultType === 'income' ? 'حقوق و دستمزد' : 'خوراک و سوپرمارکت',
    accountId: st.accounts[0]?.id || 'acc_main',
  };

  const catOptions = [...new Set((st.categories || []).map((c) => c.name))];
  const datalist = `
    <datalist id="txCategoryList">
      ${catOptions.map((c) => `<option value="${esc(c)}"></option>`).join('')}
    </datalist>
  `;

  openFormModal({
    title: existing ? 'ویرایش تراکنش' : 'ثبت تراکنش جدید',
    fieldsHtml:
      selectHtml('type', 'نوع تراکنش', [['income', 'درآمد'], ['expense', 'هزینه']], tx.type) +
      accountSelectHtml(st, 'accountId', 'حساب / کارت', tx.accountId) +
      fieldHtml('title', 'شرح تراکنش', tx.title, 'text', 'required placeholder="مثلاً خرید هفتگی یا حقوق"') +
      moneyFieldHtml('amount', 'مبلغ (تومان)', tx.amount) +
      dateFieldHtml('date', 'تاریخ شمسی', tx.date) +
      fieldHtml('category', 'دسته‌بندی', tx.category, 'text', 'list="txCategoryList" required'),
    extraHtml: datalist,
    onSubmit(o) {
      const type = o.type === 'income' ? 'income' : 'expense';
      const title = requireText(o.title, 'شرح تراکنش');
      const amount = parseMoney(o.amount, { label: 'مبلغ' });
      const date = validDate(o.date);
      const category = String(o.category || '').trim() || 'سایر';
      const accountId = o.accountId || st.accounts[0]?.id || 'acc_main';

      mutateState((draft) => {
        ensureCategory(draft, category, type);
        ensureMonthListed(draft, date.slice(0, 7));
        const item = { id: id || uid(), type, title, amount, date, category, accountId };
        const idx = draft.tx.findIndex((x) => x.id === id);
        if (idx >= 0) draft.tx[idx] = { ...draft.tx[idx], ...item };
        else draft.tx.push(item);
      });

      closeModal();
      showToast(existing ? 'تراکنش ویرایش شد' : 'تراکنش ثبت شد', { type: 'success' });
    },
  });
}

export function openAccountModal(id = '') {
  const st = getState();
  const existing = st.accounts.find((a) => a.id === id);
  const acc = existing || {
    name: '',
    type: 'bank',
    initialBalance: 0,
    color: '#0e937e',
  };

  openFormModal({
    title: existing ? 'ویرایش حساب / کارت' : 'افزودن کارت یا کیف پول جدید',
    fieldsHtml:
      fieldHtml('name', 'نام کارت یا حساب', acc.name, 'text', 'required placeholder="مثلاً کارت ملت یا کیف پول"') +
      selectHtml(
        'type',
        'نوع حساب',
        Object.entries(ACCOUNT_TYPE_LABELS),
        acc.type
      ) +
      moneyFieldHtml('initialBalance', 'موجودی پایه اولیه (تومان)', acc.initialBalance, {
        required: true,
        placeholder: '۰',
      }) +
      fieldHtml('color', 'رنگ شاخص', acc.color || '#0e937e', 'color'),
    extraHtml:
      '<div class="notice info">موجودی پایه اولیه فقط در نقطه شروع تاریخچه این حساب اعمال می‌شود و برای ماه‌های بعد به صورت خودکار انتقال می‌یابد.</div>',
    onSubmit(o) {
      const name = requireText(o.name, 'نام حساب');
      const initialBalance = parseMoney(o.initialBalance, { allowZero: true, label: 'موجودی پایه' });
      const type = ['bank', 'cash', 'savings'].includes(o.type) ? o.type : 'bank';
      const color = /^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : '#0e937e';

      mutateState((draft) => {
        if (existing) {
          const target = draft.accounts.find((a) => a.id === id);
          if (target) Object.assign(target, { name, type, initialBalance, color });
        } else {
          draft.accounts.push({ id: uid(), name, type, initialBalance, color, archived: false });
        }
      });

      closeModal();
      showToast(existing ? 'حساب ویرایش شد' : 'حساب جدید ایجاد شد', { type: 'success' });
    },
  });
}

export function openTransferModal(id = '') {
  const st = getState();
  if ((st.accounts || []).length < 2) {
    showToast('برای انتقال وجه حداقل باید ۲ حساب یا کارت تعریف شده باشد.', { type: 'warning' });
    return;
  }
  const existing = (st.transfers || []).find((t) => t.id === id);
  const tr = existing || {
    fromAccountId: st.accounts[0]?.id,
    toAccountId: st.accounts[1]?.id,
    amount: '',
    date: st.month === currentMonth() ? today() : `${st.month}-01`,
    note: '',
  };

  openFormModal({
    title: existing ? 'ویرایش انتقال بین حساب‌ها' : 'انتقال وجه بین کارت‌ها / حساب‌ها',
    fieldsHtml:
      accountSelectHtml(st, 'fromAccountId', 'از حساب (مبدا)', tr.fromAccountId) +
      accountSelectHtml(st, 'toAccountId', 'به حساب (مقصد)', tr.toAccountId) +
      moneyFieldHtml('amount', 'مبلغ انتقال (تومان)', tr.amount) +
      dateFieldHtml('date', 'تاریخ انتقال', tr.date) +
      fieldHtml('note', 'توضیح (اختیاری)', tr.note || '', 'text', 'placeholder="مثلاً شارژ کارت پس‌انداز"'),
    extraHtml:
      '<div class="notice info">انتقال بین حساب‌های خودتان موجودی هر کارت را به‌روز می‌کند اما در جمع درآمد یا هزینه ماه شمارش نمی‌شود.</div>',
    onSubmit(o) {
      if (o.fromAccountId === o.toAccountId) {
        throw new Error('حساب مبدا و مقصد نمی‌توانند یکسان باشند');
      }
      const amount = parseMoney(o.amount, { label: 'مبلغ انتقال' });
      const date = validDate(o.date);
      const note = String(o.note || '').trim();

      mutateState((draft) => {
        ensureMonthListed(draft, date.slice(0, 7));
        const item = {
          id: id || uid(),
          fromAccountId: o.fromAccountId,
          toAccountId: o.toAccountId,
          amount,
          date,
          note,
        };
        draft.transfers = draft.transfers || [];
        const idx = draft.transfers.findIndex((x) => x.id === id);
        if (idx >= 0) draft.transfers[idx] = item;
        else draft.transfers.push(item);
      });

      closeModal();
      showToast(existing ? 'انتقال ویرایش شد' : 'انتقال ثبت شد', { type: 'success' });
    },
  });
}

export function openOpeningModal(month) {
  const st = getState();
  const timeline = getMonthTimelineBalances(st);
  const mInfo = timeline.byMonth[month];

  const fields = (st.accounts || [])
    .map((acc) => {
      const hasManual = Object.hasOwn(st.openingByAccount?.[month] || {}, acc.id);
      const currentVal = mInfo?.openingByAccount?.[acc.id] ?? 0;
      const hint = hasManual ? 'دستی' : 'انتقال خودکار از ماه قبل';
      return moneyFieldHtml(`acc_${acc.id}`, `${acc.name} (${hint})`, currentVal, {
        required: true,
        placeholder: '۰',
      });
    })
    .join('');

  const resetBtn = mInfo?.hasManualOverride
    ? `<button type="button" class="btn btn-ghost" id="clearOpeningOverridesBtn">بازگشت به انتقال خودکار ماه قبل</button>`
    : '';

  openFormModal({
    title: `تنظیم موجودی ابتدای ماه ${month}`,
    fieldsHtml: fields,
    extraHtml: `
      <div class="notice info">موجودی واقعی حساب‌ها را در شروع این ماه وارد کنید تا مبنای محاسبه دقیق شود. برای بازگشت به محاسبه خودکار از مانده ماه قبل، دکمه بازنشانی را بزنید.</div>
      ${resetBtn ? `<div class="actions">${resetBtn}</div>` : ''}
    `,
    onSubmit(o) {
      mutateState((draft) => {
        draft.openingByAccount = draft.openingByAccount || {};
        draft.openingByAccount[month] = draft.openingByAccount[month] || {};
        for (const acc of draft.accounts || []) {
          const val = parseMoney(o[`acc_${acc.id}`], {
            allowZero: true,
            label: `موجودی ${acc.name}`,
          });
          draft.openingByAccount[month][acc.id] = val;
        }
      });
      closeModal();
      showToast('موجودی ابتدای ماه ذخیره شد', { type: 'success' });
    },
  });

  document.getElementById('clearOpeningOverridesBtn')?.addEventListener('click', () => {
    mutateState((draft) => {
      if (draft.openingByAccount) {
        delete draft.openingByAccount[month];
      }
    });
    closeModal();
    showToast('انتقال خودکار از ماه قبل فعال شد', { type: 'info' });
  });
}

export function openPlanWizardModal(id = '') {
  const st = getState();
  const existing = st.plans.find((x) => x.id === id && x.kind !== 'bill');
  const maxPaidIdx = existing
    ? Math.max(
        -1,
        ...Object.entries(existing.payments || {})
          .filter(([, arr]) => Array.isArray(arr) && arr.length > 0)
          .map(([idx]) => Number(idx))
      )
    : -1;

  const draftPlan = existing
    ? { ...existing }
    : {
        title: '',
        amount: '',
        count: 12,
        day: 5,
        start: st.month,
        defaultAccountId: st.accounts[0]?.id || 'acc_main',
      };

  openFormModal({
    title: existing ? 'ویرایش برنامه اقساط | مرحله ۱ از ۲' : 'ویزارد تعریف اقساط | مرحله ۱ از ۲',
    submitLabel: 'پیش‌نمایش جدول اقساط',
    fieldsHtml:
      fieldHtml('title', 'نام وام یا خرید اقساطی', draftPlan.title, 'text', 'required') +
      moneyFieldHtml('amount', 'مبلغ هر قسط (تومان)', draftPlan.amount) +
      fieldHtml('count', 'تعداد کل اقساط', draftPlan.count, 'number', `min="${Math.max(1, maxPaidIdx + 1)}" max="360" required`) +
      fieldHtml('day', 'روز سررسید در ماه', draftPlan.day, 'number', 'min="1" max="31" required') +
      fieldHtml(
        'start',
        'ماه اولین قسط (YYYY-MM)',
        draftPlan.start,
        'text',
        `dir="ltr" required ${maxPaidIdx >= 0 ? 'readonly title="به دلیل داشتن پرداخت ثبت‌شده، ماه شروع ثابت است"' : ''}`
      ) +
      accountSelectHtml(st, 'defaultAccountId', 'حساب پیش‌فرض پرداخت', draftPlan.defaultAccountId),
    extraHtml:
      maxPaidIdx >= 0
        ? '<div class="notice">این برنامه دارای پرداخت ثبت‌شده است؛ سوابق پرداخت حفظ می‌شوند و مبلغ جدید روی اقساط اعمال خواهد شد.</div>'
        : '',
    onSubmit(o) {
      const title = requireText(o.title, 'نام وام');
      const amount = parseMoney(o.amount, { label: 'مبلغ هر قسط' });
      const count = Number(norm(o.count));
      const day = Number(norm(o.day));
      const start = maxPaidIdx >= 0 ? existing.start : validMonth(o.start);
      if (!Number.isInteger(count) || count < Math.max(1, maxPaidIdx + 1) || count > 360) {
        throw new Error(`تعداد اقساط باید بین ${Math.max(1, maxPaidIdx + 1)} تا ۳۶۰ باشد`);
      }
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        throw new Error('روز سررسید باید بین ۱ تا ۳۱ باشد');
      }

      const nextPlan = {
        id: existing?.id || uid(),
        kind: 'installment',
        title,
        category: existing?.category || '',
        start,
        day,
        count,
        amount,
        defaultAccountId: o.defaultAccountId || st.accounts[0]?.id || 'acc_main',
        overrides: existing?.overrides || {},
        payments: existing?.payments || {},
      };

      const rows = Array.from({ length: count }, (_, i) => {
        const occAmt = nextPlan.overrides?.[i]?.amount ?? amount;
        const paid = (nextPlan.payments?.[i] || []).reduce((s, p) => s + p.amount, 0);
        return [
          fmt(i + 1),
          nextPlan.overrides?.[i]?.date || dueDate(shiftMonth(start, i), day),
          `${fmt(occAmt)} تومان`,
          paid > 0 ? `${fmt(paid)} تومان` : '—',
        ];
      });

      const body = openInfoModal({
        title: existing ? 'ویرایش اقساط | مرحله ۲ از ۲' : 'ویزارد اقساط | مرحله ۲ از ۲',
        wide: true,
        html: `
          <div class="notice info">مجموع کل اقساط: <b>${fmt(amount * count)} تومان</b> · حساب پیش‌فرض: <b>${esc(getAccountName(st, nextPlan.defaultAccountId))}</b></div>
          ${tableHtml(['شماره', 'سررسید', 'مبلغ قسط', 'پرداخت‌شده'], rows)}
          <div class="dialog-actions">
            <button type="button" class="btn btn-ghost" id="wizardBackBtn">بازگشت و ویرایش</button>
            <button type="button" class="btn btn-primary" id="wizardCommitBtn">${existing ? 'ذخیره تغییرات' : 'تأیید و ساخت جدول'}</button>
          </div>
        `,
      });

      body?.querySelector('#wizardBackBtn')?.addEventListener('click', () => {
        openPlanWizardModal(id);
      });
      body?.querySelector('#wizardCommitBtn')?.addEventListener('click', () => {
        mutateState((draft) => {
          ensureMonthListed(draft, nextPlan.start);
          const idx = draft.plans.findIndex((p) => p.id === nextPlan.id);
          if (idx >= 0) draft.plans[idx] = nextPlan;
          else draft.plans.push(nextPlan);
        });
        closeModal();
        showToast(existing ? 'برنامه اقساط به‌روزرسانی شد' : 'جدول اقساط ساخته شد', { type: 'success' });
      });
    },
  });
}

export function openBillModal(id = '') {
  const st = getState();
  const existing = st.plans.find((x) => x.id === id && x.kind === 'bill');
  const maxPaidIdx = existing
    ? Math.max(
        -1,
        ...Object.entries(existing.payments || {})
          .filter(([, arr]) => Array.isArray(arr) && arr.length > 0)
          .map(([idx]) => Number(idx))
      )
    : -1;

  const bill = existing || {
    category: 'شارژ ساختمان',
    title: '',
    amount: '',
    start: st.month,
    day: 10,
    count: 1,
    defaultAccountId: st.accounts[0]?.id || 'acc_main',
  };

  openFormModal({
    title: existing ? 'ویرایش قبض یا هزینه دوره‌ای' : 'ثبت قبض / هزینه ثابت ماهانه',
    fieldsHtml:
      selectHtml(
        'category',
        'دسته قبض',
        BILL_CATEGORIES.map((c) => [c, c]),
        bill.category
      ) +
      fieldHtml('title', 'عنوان قبض / شارژ', bill.title, 'text', 'required placeholder="مثلاً قبض برق منزل"') +
      moneyFieldHtml('amount', 'مبلغ پیش‌فرض هر دوره (تومان)', bill.amount) +
      fieldHtml(
        'start',
        'ماه اولین سررسید (YYYY-MM)',
        bill.start,
        'text',
        `dir="ltr" required ${maxPaidIdx >= 0 ? 'readonly' : ''}`
      ) +
      fieldHtml('day', 'روز سررسید', bill.day, 'number', 'min="1" max="31" required') +
      fieldHtml('count', 'تعداد ماه تکرار (۱ برای تکی)', bill.count, 'number', `min="${Math.max(1, maxPaidIdx + 1)}" max="360" required`) +
      accountSelectHtml(st, 'defaultAccountId', 'حساب پیش‌فرض پرداخت', bill.defaultAccountId),
    extraHtml:
      '<div class="notice info">اگر مبلغ قبضی در یک ماه خاص متفاوت باشد (مثلاً قبض آب یا برق)، می‌توانید از جدول قبوض مبلغ همان ماه را جداگانه تغییر دهید.</div>',
    onSubmit(o) {
      const title = requireText(o.title, 'عنوان قبض');
      const amount = parseMoney(o.amount, { label: 'مبلغ' });
      const start = maxPaidIdx >= 0 ? existing.start : validMonth(o.start);
      const day = Number(norm(o.day));
      const count = Number(norm(o.count));
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        throw new Error('روز سررسید باید بین ۱ تا ۳۱ باشد');
      }
      if (!Number.isInteger(count) || count < Math.max(1, maxPaidIdx + 1) || count > 360) {
        throw new Error('تعداد ماه تکرار نامعتبر است');
      }

      mutateState((draft) => {
        ensureMonthListed(draft, start);
        const item = {
          id: existing?.id || uid(),
          kind: 'bill',
          title,
          category: o.category || 'سایر',
          start,
          day,
          count,
          amount,
          defaultAccountId: o.defaultAccountId || draft.accounts[0]?.id || 'acc_main',
          overrides: existing?.overrides || {},
          payments: existing?.payments || {},
        };
        const idx = draft.plans.findIndex((p) => p.id === item.id);
        if (idx >= 0) draft.plans[idx] = item;
        else draft.plans.push(item);
      });

      closeModal();
      showToast(existing ? 'قبض ویرایش شد' : 'قبض ثبت شد', { type: 'success' });
    },
  });
}

export function openBillOverrideModal(planId, occIndex) {
  const st = getState();
  const occ = getInstallmentOccurrences(st).find((x) => x.id === `${planId}:${occIndex}`);
  if (!occ) return;

  openFormModal({
    title: `ویرایش دوره خاص | ${occ.title}`,
    fieldsHtml:
      moneyFieldHtml('amount', 'مبلغ این ماه (تومان)', occ.amount) +
      dateFieldHtml('date', 'تاریخ سررسید این ماه', occ.date),
    extraHtml: `<div class="notice info">تغییر این فرم فقط برای سررسید <b>${esc(occ.date.slice(0, 7))}</b> اعمال می‌شود و سایر ماه‌ها ثابت می‌مانند.</div>`,
    onSubmit(o) {
      const amount = parseMoney(o.amount, { label: 'مبلغ' });
      const date = validDate(o.date);
      mutateState((draft) => {
        const plan = draft.plans.find((p) => p.id === planId);
        if (!plan) return;
        plan.overrides = plan.overrides || {};
        plan.overrides[occIndex] = { amount, date };
        ensureMonthListed(draft, date.slice(0, 7));
      });
      closeModal();
      showToast('مبلغ/تاریخ این دوره به‌روزرسانی شد', { type: 'success' });
    },
  });
}

export function openLoanModal(id = '') {
  const st = getState();
  const existing = st.loans.find((l) => l.id === id);
  const loan = existing || {
    type: 'lend',
    title: '',
    amount: '',
    given: today(),
    date: dueDate(shiftMonth(st.month, 1), 1),
    accountId: st.accounts[0]?.id || 'acc_main',
  };

  const hasPayments = (existing?.payments?.length || 0) > 0;

  openFormModal({
    title: existing ? 'ویرایش قرض / طلب' : 'ثبت قرض یا طلب جدید',
    fieldsHtml:
      selectHtml(
        'type',
        'نوع',
        [['lend', 'قرض دادم (طلب)'], ['borrow', 'قرض گرفتم (بدهی)']],
        loan.type,
        hasPayments ? 'disabled' : ''
      ) +
      fieldHtml('title', 'نام شخص / شرح', loan.title, 'text', 'required') +
      moneyFieldHtml('amount', 'مبلغ کل (تومان)', loan.amount) +
      accountSelectHtml(st, 'accountId', 'حساب مرتبط', loan.accountId) +
      dateFieldHtml('given', 'تاریخ دریافت / پرداخت اولیه', loan.given) +
      dateFieldHtml('date', 'تاریخ سررسید بازپرداخت', loan.date),
    extraHtml: hasPayments
      ? '<div class="notice">به دلیل داشتن پرداخت جزئی، نوع قرض ثابت است و مبلغ کل نباید کمتر از مجموع پرداخت‌شده باشد.</div>'
      : '',
    onSubmit(o) {
      const title = requireText(o.title, 'نام شخص / شرح');
      const amount = parseMoney(o.amount, { label: 'مبلغ' });
      const given = validDate(o.given);
      const date = validDate(o.date);
      if (date < given) {
        throw new Error('تاریخ سررسید نباید قبل از تاریخ اولیه باشد');
      }
      const paidSoFar = (existing?.payments || []).reduce((s, p) => s + p.amount, 0);
      if (amount < paidSoFar) {
        throw new Error(`مبلغ کل نمی‌تواند کمتر از مبلغ تسویه‌شده (${fmt(paidSoFar)} تومان) باشد`);
      }

      mutateState((draft) => {
        ensureMonthListed(draft, given.slice(0, 7));
        const item = {
          id: existing?.id || uid(),
          type: existing && hasPayments ? existing.type : o.type === 'borrow' ? 'borrow' : 'lend',
          title,
          amount,
          given,
          date,
          accountId: o.accountId || draft.accounts[0]?.id || 'acc_main',
          payments: existing?.payments || [],
        };
        const idx = draft.loans.findIndex((x) => x.id === item.id);
        if (idx >= 0) draft.loans[idx] = item;
        else draft.loans.push(item);
      });

      closeModal();
      showToast(existing ? 'اطلاعات قرض ویرایش شد' : 'قرض / طلب ثبت شد', { type: 'success' });
    },
  });
}

function findObligation(st, kind, id) {
  if (kind === 'installment' || kind === 'bill') {
    return getInstallmentOccurrences(st).find((x) => x.id === id);
  }
  return getLoansNormalized(st).find((x) => x.id === id);
}

export function openPaymentModal(kind, id) {
  const st = getState();
  const ob = findObligation(st, kind, id);
  if (!ob) return;

  const historyHtml = ob.payments.length
    ? `
      <div class="history-list">
        <small>سوابق پرداخت ثبت‌شده:</small>
        ${ob.payments
          .map(
            (p) => `
          <div class="history-item">
            <div>
              <b>${fmt(p.amount)} تومان</b>
              <small> · ${esc(p.date)} · ${esc(getAccountName(st, p.accountId))}</small>
            </div>
            <button type="button" class="btn btn-sm btn-danger" data-del-pay="${esc(p.id)}">
              ${icon('Trash2', 'sm')} حذف
            </button>
          </div>
        `
          )
          .join('')}
      </div>
    `
    : '<small class="muted">هنوز پرداختی برای این مورد ثبت نشده است.</small>';

  const summaryHtml = `
    <div class="notice info" style="justify-content:space-between;flex-wrap:wrap">
      <span>مبلغ کل: <b>${fmt(ob.amount)} تومان</b></span>
      <span>پرداخت‌شده: <b class="green">${fmt(ob.paidSum)} تومان</b></span>
      <span>مانده: <b class="amber">${fmt(ob.remaining)} تومان</b></span>
    </div>
    ${historyHtml}
  `;

  if (ob.remaining > 0) {
    const body = openFormModal({
      title: `ثبت پرداخت / تسویه | ${ob.title}`,
      submitLabel: 'ثبت پرداخت',
      fieldsHtml:
        moneyFieldHtml('amount', 'مبلغ پرداختی (کامل یا جزئی)', ob.remaining) +
        dateFieldHtml('date', 'تاریخ واقعی پرداخت', today()) +
        accountSelectHtml(st, 'accountId', 'حساب / کارت', ob.defaultAccountId || ob.accountId),
      extraHtml: summaryHtml,
      onSubmit(o) {
        const payAmount = parseMoney(o.amount, { label: 'مبلغ پرداخت' });
        if (payAmount > ob.remaining) {
          throw new Error(`مبلغ پرداخت نباید بیشتر از مانده (${fmt(ob.remaining)} تومان) باشد`);
        }
        const date = validDate(o.date);
        if (date > today()) {
          throw new Error('تاریخ تسویه نمی‌تواند در آینده باشد');
        }
        if (ob.given && date < ob.given) {
          throw new Error('تاریخ تسویه نمی‌تواند قبل از تاریخ ایجاد قرض باشد');
        }

        mutateState((draft) => {
          ensureMonthListed(draft, date.slice(0, 7));
          const payObj = {
            id: uid(),
            date,
            amount: payAmount,
            accountId: o.accountId || draft.accounts[0]?.id || 'acc_main',
          };

          if (kind === 'installment' || kind === 'bill') {
            const [planId, occIdx] = id.split(':');
            const plan = draft.plans.find((p) => p.id === planId);
            if (!plan) return;
            plan.payments = plan.payments || {};
            plan.payments[occIdx] = plan.payments[occIdx] || [];
            plan.payments[occIdx].push(payObj);
          } else {
            const loan = draft.loans.find((l) => l.id === id);
            if (!loan) return;
            loan.payments = loan.payments || [];
            loan.payments.push(payObj);
          }
        });

        closeModal();
        showToast(
          payAmount === ob.remaining ? 'تسویه کامل با موفقیت ثبت شد' : 'پرداخت جزئی با موفقیت ثبت شد',
          { type: 'success' }
        );
      },
    });

    bindDeletePaymentButtons(body, kind, id);
  } else {
    const body = openInfoModal({
      title: `سوابق تسویه | ${ob.title}`,
      html: `
        ${summaryHtml}
        <div class="dialog-actions">
          <button type="button" class="btn btn-ghost" data-close-dialog="dlg">بستن</button>
        </div>
      `,
    });
    bindDeletePaymentButtons(body, kind, id);
  }
}

function bindDeletePaymentButtons(container, kind, id) {
  container?.querySelector('.history-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-del-pay]');
    if (!btn) return;
    const payId = btn.getAttribute('data-del-pay');
    const ok = await confirmDialog({
      title: 'حذف پرداخت ثبت‌شده',
      message: 'این پرداخت حذف و اثر آن از گردش حساب برداشته شود؟',
      confirmLabel: 'حذف پرداخت',
      danger: true,
    });
    if (!ok) return;

    mutateState((draft) => {
      if (kind === 'installment' || kind === 'bill') {
        const [planId, occIdx] = id.split(':');
        const plan = draft.plans.find((p) => p.id === planId);
        if (plan?.payments?.[occIdx]) {
          plan.payments[occIdx] = plan.payments[occIdx].filter((p) => p.id !== payId);
          if (!plan.payments[occIdx].length) delete plan.payments[occIdx];
        }
      } else {
        const loan = draft.loans.find((l) => l.id === id);
        if (loan?.payments) {
          loan.payments = loan.payments.filter((p) => p.id !== payId);
        }
      }
    });

    showToast('پرداخت حذف شد', { type: 'info' });
    openPaymentModal(kind, id);
  });
}

export function openBudgetModal(id = '') {
  const st = getState();
  const existing = (st.budgets || []).find((b) => b.id === id);
  const expenseCats = (st.categories || [])
    .filter((c) => c.type === 'expense' || c.type === 'both')
    .map((c) => [c.name, c.name]);

  const budget = existing || {
    category: expenseCats[0]?.[0] || 'سایر',
    amount: '',
    month: '',
  };

  openFormModal({
    title: existing ? 'ویرایش سقف بودجه' : 'تعیین بودجه دسته‌بندی',
    fieldsHtml:
      selectHtml('category', 'دسته‌بندی هزینه', expenseCats, budget.category) +
      moneyFieldHtml('amount', 'سقف بودجه ماهانه (تومان)', budget.amount) +
      selectHtml(
        'month',
        'محدوده زمانی',
        [['', 'همه ماه‌ها (پیش‌فرض)'], [st.month, `فقط ${st.month}`]],
        budget.month || ''
      ),
    onSubmit(o) {
      const amount = parseMoney(o.amount, { label: 'مبلغ بودجه' });
      const category = o.category || 'سایر';
      const month = o.month || '';

      mutateState((draft) => {
        draft.budgets = draft.budgets || [];
        // Replace existing rule for same category + month scope cleanly
        draft.budgets = draft.budgets.filter(
          (b) => b.id !== id && !(b.category === category && (b.month || '') === month)
        );
        draft.budgets.push({ id: id || uid(), category, amount, month });
      });

      closeModal();
      showToast('بودجه ذخیره شد', { type: 'success' });
    },
  });
}

export function openRecurringModal(id = '') {
  const st = getState();
  const existing = (st.recurring || []).find((r) => r.id === id);
  const rule = existing || {
    type: 'income',
    title: '',
    amount: '',
    category: 'حقوق و دستمزد',
    accountId: st.accounts[0]?.id || 'acc_main',
    day: 1,
    start: st.month,
    end: '',
    autoPost: false,
    active: true,
  };

  const cats = [...new Set((st.categories || []).map((c) => c.name))].map((c) => [c, c]);

  openFormModal({
    title: existing ? 'ویرایش قانون تکرار ماهانه' : 'تعریف درآمد یا هزینه تکرارشونده',
    fieldsHtml:
      selectHtml('type', 'نوع', [['income', 'درآمد ماهانه'], ['expense', 'هزینه ماهانه']], rule.type) +
      fieldHtml('title', 'عنوان', rule.title, 'text', 'required placeholder="مثلاً حقوق ماهانه یا اجاره"') +
      moneyFieldHtml('amount', 'مبلغ (تومان)', rule.amount) +
      selectHtml('category', 'دسته‌بندی', cats, rule.category) +
      accountSelectHtml(st, 'accountId', 'حساب / کارت', rule.accountId) +
      fieldHtml('day', 'روز سررسید در ماه', rule.day, 'number', 'min="1" max="31" required') +
      fieldHtml('start', 'از ماه (YYYY-MM)', rule.start, 'text', 'dir="ltr" required') +
      fieldHtml('end', 'تا ماه (اختیاری - YYYY-MM)', rule.end || '', 'text', 'dir="ltr" placeholder="نامحدود"'),
    extraHtml: `
      <div style="display:grid;gap:8px;margin-top:8px">
        <label class="check-row">
          <input type="checkbox" name="autoPost" ${rule.autoPost ? 'checked' : ''}>
          <span>ثبت خودکار در گردش حساب هنگام رسیدن تاریخ سررسید (در غیر این صورت به عنوان یادآور یک‌کلیکی نمایش داده می‌شود)</span>
        </label>
        <label class="check-row">
          <input type="checkbox" name="active" ${rule.active ? 'checked' : ''}>
          <span>این قانون تکرار فعال باشد</span>
        </label>
      </div>
    `,
    onSubmit(o) {
      const title = requireText(o.title, 'عنوان');
      const amount = parseMoney(o.amount, { label: 'مبلغ' });
      const day = Number(norm(o.day));
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        throw new Error('روز سررسید باید بین ۱ تا ۳۱ باشد');
      }
      const start = validMonth(o.start);
      const end = String(o.end || '').trim() ? validMonth(o.end) : '';
      if (end && end < start) {
        throw new Error('ماه پایان نباید قبل از ماه شروع باشد');
      }

      mutateState((draft) => {
        draft.recurring = draft.recurring || [];
        const item = {
          id: existing?.id || uid(),
          type: o.type === 'expense' ? 'expense' : 'income',
          title,
          amount,
          category: o.category || 'سایر',
          accountId: o.accountId || draft.accounts[0]?.id || 'acc_main',
          day,
          start,
          end,
          autoPost: Boolean(o.autoPost),
          active: Boolean(o.active),
          handledMonths: existing?.handledMonths || {},
        };
        const idx = draft.recurring.findIndex((r) => r.id === item.id);
        if (idx >= 0) draft.recurring[idx] = item;
        else draft.recurring.push(item);
      });

      closeModal();
      showToast('قانون تکرار ذخیره شد', { type: 'success' });
    },
  });
}

export async function deleteItemWithConfirm(collectionKey, id, label = 'این مورد') {
  const ok = await confirmDialog({
    title: 'تأیید حذف',
    message: `آیا از حذف ${label} مطمئن هستید؟`,
    confirmLabel: 'حذف',
    danger: true,
  });
  if (!ok) return;

  mutateState((draft) => {
    draft[collectionKey] = (draft[collectionKey] || []).filter((x) => x.id !== id);
  });
  showToast('مورد با موفقیت حذف شد', { type: 'info' });
}
