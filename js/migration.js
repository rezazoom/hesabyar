import { createDefaultCategories, ensureCategory } from './categories.js';
import { currentMonth, isValidMonth, parseJalali } from './date.js';
import { uid } from './format.js';

export const SCHEMA_VERSION = 2;
export const DEFAULT_ACCOUNT_ID = 'acc_main';

const idOk = (v) => typeof v === 'string' && /^[a-z0-9_]+$/i.test(v);
const posNum = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const nonNegInt = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const dateOk = (v) => typeof v === 'string' && Boolean(parseJalali(v));

export function createDefaultAccount() {
  return {
    id: DEFAULT_ACCOUNT_ID,
    name: 'حساب اصلی',
    type: 'bank',
    initialBalance: 0,
    color: '#0e937e',
    archived: false,
  };
}

export function createDefaultState(month = currentMonth()) {
  return {
    version: SCHEMA_VERSION,
    month,
    months: [month],
    accounts: [createDefaultAccount()],
    openingByAccount: {},
    tx: [],
    transfers: [],
    plans: [],
    loans: [],
    categories: createDefaultCategories(),
    budgets: [],
    recurring: [],
  };
}

export function isV1Payload(x) {
  return Boolean(
    x &&
    typeof x === 'object' &&
    !x.version &&
    Array.isArray(x.tx) &&
    Array.isArray(x.plans) &&
    Array.isArray(x.loans) &&
    Array.isArray(x.months)
  );
}

export function validateV1Payload(x) {
  if (!isV1Payload(x) || !isValidMonth(x.month)) {
    throw new Error('فایل پشتیبان نامعتبر است');
  }
  const legacyIdOk = (v) => typeof v === 'string' && /^[a-z0-9]+$/.test(v);
  const payOk = (p) => !p || (posNum(p.amount) && dateOk(p.date));

  if (
    !x.months.every((m) => isValidMonth(m)) ||
    !x.tx.every((t) => legacyIdOk(t.id) && posNum(t.amount) && dateOk(t.date) && ['income', 'expense'].includes(t.type)) ||
    !x.plans.every(
      (p) =>
        legacyIdOk(p.id) &&
        posNum(p.amount) &&
        Number.isInteger(p.count) &&
        p.count >= 1 &&
        p.count <= 360 &&
        Number.isInteger(p.day) &&
        p.day >= 1 &&
        p.day <= 31 &&
        isValidMonth(p.start) &&
        Object.values(p.pay || {}).every(payOk)
    ) ||
    !x.loans.every(
      (l) =>
        legacyIdOk(l.id) &&
        posNum(l.amount) &&
        dateOk(l.given) &&
        dateOk(l.date) &&
        payOk(l.pay) &&
        ['lend', 'borrow'].includes(l.type)
    )
  ) {
    throw new Error('ساختار اطلاعات پشتیبان PRO 3.3 نامعتبر است');
  }

  if (
    x.opening !== undefined &&
    (!x.opening ||
      typeof x.opening !== 'object' ||
      Object.entries(x.opening).some(([k, v]) => !isValidMonth(k) || !nonNegInt(v)))
  ) {
    throw new Error('موجودی ابتدای ماه در پشتیبان نامعتبر است');
  }
}

export function migrateV1ToV2(v1) {
  validateV1Payload(v1);

  const state = createDefaultState(v1.month);
  state.months = [...new Set([v1.month, ...v1.months])];

  if (v1.opening && typeof v1.opening === 'object') {
    for (const [m, amount] of Object.entries(v1.opening)) {
      if (isValidMonth(m) && nonNegInt(amount)) {
        state.openingByAccount[m] = { [DEFAULT_ACCOUNT_ID]: amount };
      }
    }
  }

  state.tx = v1.tx.map((t) => {
    const category = String(t.category || 'سایر').trim() || 'سایر';
    ensureCategory(state, category, t.type);
    return {
      id: t.id,
      type: t.type,
      title: String(t.title ?? ''),
      amount: Math.round(t.amount),
      date: parseJalali(t.date).str,
      category,
      accountId: DEFAULT_ACCOUNT_ID,
    };
  });

  state.plans = v1.plans.map((p) => {
    const payments = {};
    for (const [idx, payItem] of Object.entries(p.pay || {})) {
      if (payItem && posNum(payItem.amount) && dateOk(payItem.date)) {
        payments[idx] = [
          {
            id: uid(),
            date: parseJalali(payItem.date).str,
            amount: Math.round(payItem.amount),
            accountId: DEFAULT_ACCOUNT_ID,
          },
        ];
      }
    }
    return {
      id: p.id,
      kind: p.kind === 'bill' ? 'bill' : 'installment',
      title: String(p.title ?? ''),
      category: p.category || (p.kind === 'bill' ? 'سایر' : ''),
      start: p.start,
      day: p.day,
      count: p.count,
      amount: Math.round(p.amount),
      defaultAccountId: DEFAULT_ACCOUNT_ID,
      overrides: {},
      payments,
    };
  });

  state.loans = v1.loans.map((l) => ({
    id: l.id,
    type: l.type,
    title: String(l.title ?? ''),
    amount: Math.round(l.amount),
    given: parseJalali(l.given).str,
    date: parseJalali(l.date).str,
    accountId: DEFAULT_ACCOUNT_ID,
    payments:
      l.pay && posNum(l.pay.amount) && dateOk(l.pay.date)
        ? [
            {
              id: uid(),
              date: parseJalali(l.pay.date).str,
              amount: Math.round(l.pay.amount),
              accountId: DEFAULT_ACCOUNT_ID,
            },
          ]
        : [],
  }));

  return state;
}

export function validateAndNormalizeV2Payload(x) {
  if (!x || typeof x !== 'object' || x.version !== SCHEMA_VERSION || !isValidMonth(x.month)) {
    throw new Error('ساختار فایل پشتیبان نسخه ۲ نامعتبر است');
  }
  if (
    !Array.isArray(x.months) ||
    !x.months.every((m) => isValidMonth(m)) ||
    !Array.isArray(x.accounts) ||
    !x.accounts.length ||
    !Array.isArray(x.tx) ||
    !Array.isArray(x.transfers || []) ||
    !Array.isArray(x.plans) ||
    !Array.isArray(x.loans)
  ) {
    throw new Error('بخش‌های اصلی فایل پشتیبان ناقص یا نامعتبر است');
  }

  const accIds = new Set();
  const accounts = x.accounts.map((a) => {
    if (!a || !idOk(a.id) || typeof a.name !== 'string' || !a.name.trim() || !Number.isSafeInteger(a.initialBalance ?? 0)) {
      throw new Error('اطلاعات حساب/کارت در فایل پشتیبان نامعتبر است');
    }
    accIds.add(a.id);
    return {
      id: a.id,
      name: a.name.trim(),
      type: ['bank', 'cash', 'savings'].includes(a.type) ? a.type : 'bank',
      initialBalance: Number.isSafeInteger(a.initialBalance) ? a.initialBalance : 0,
      color: typeof a.color === 'string' && /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : '#0e937e',
      archived: Boolean(a.archived),
    };
  });

  const accRefOk = (id) => idOk(id) && accIds.has(id);
  const paymentListOk = (arr) =>
    Array.isArray(arr) &&
    arr.every((p) => p && idOk(p.id) && posNum(p.amount) && dateOk(p.date) && (!p.accountId || accRefOk(p.accountId)));

  const openingByAccount = {};
  if (x.openingByAccount && typeof x.openingByAccount === 'object') {
    for (const [m, map] of Object.entries(x.openingByAccount)) {
      if (!isValidMonth(m) || !map || typeof map !== 'object') {
        throw new Error('ساختار موجودی ابتدای ماه نامعتبر است');
      }
      openingByAccount[m] = {};
      for (const [accId, val] of Object.entries(map)) {
        if (!accRefOk(accId) || !Number.isSafeInteger(val)) {
          throw new Error('مقدار موجودی حساب در فایل پشتیبان نامعتبر است');
        }
        openingByAccount[m][accId] = val;
      }
    }
  }

  for (const t of x.tx) {
    if (!t || !idOk(t.id) || !posNum(t.amount) || !dateOk(t.date) || !['income', 'expense'].includes(t.type) || !accRefOk(t.accountId || accounts[0].id)) {
      throw new Error('ساختار تراکنش‌ها نامعتبر است');
    }
  }

  for (const tr of x.transfers || []) {
    if (!tr || !idOk(tr.id) || !posNum(tr.amount) || !dateOk(tr.date) || !accRefOk(tr.fromAccountId) || !accRefOk(tr.toAccountId) || tr.fromAccountId === tr.toAccountId) {
      throw new Error('ساختار انتقال بین حساب‌ها نامعتبر است');
    }
  }

  for (const p of x.plans) {
    if (
      !p ||
      !idOk(p.id) ||
      !posNum(p.amount) ||
      !Number.isInteger(p.count) ||
      p.count < 1 ||
      p.count > 360 ||
      !Number.isInteger(p.day) ||
      p.day < 1 ||
      p.day > 31 ||
      !isValidMonth(p.start) ||
      !Object.values(p.payments || {}).every(paymentListOk)
    ) {
      throw new Error('ساختار اقساط یا قبوض نامعتبر است');
    }
  }

  for (const l of x.loans) {
    if (!l || !idOk(l.id) || !posNum(l.amount) || !dateOk(l.given) || !dateOk(l.date) || !['lend', 'borrow'].includes(l.type) || !paymentListOk(l.payments || [])) {
      throw new Error('ساختار قرض و طلب نامعتبر است');
    }
  }

  const base = createDefaultState(x.month);
  base.months = [...new Set([x.month, ...x.months])];
  base.accounts = accounts;
  base.openingByAccount = openingByAccount;
  base.tx = x.tx.map((t) => ({ ...t, accountId: t.accountId || accounts[0].id }));
  base.transfers = (x.transfers || []).map((tr) => ({ ...tr }));
  base.plans = x.plans.map((p) => ({
    ...p,
    defaultAccountId: accRefOk(p.defaultAccountId) ? p.defaultAccountId : accounts[0].id,
    overrides: p.overrides && typeof p.overrides === 'object' ? p.overrides : {},
    payments: p.payments && typeof p.payments === 'object' ? p.payments : {},
  }));
  base.loans = x.loans.map((l) => ({
    ...l,
    accountId: accRefOk(l.accountId) ? l.accountId : accounts[0].id,
    payments: Array.isArray(l.payments) ? l.payments : [],
  }));
  base.categories = Array.isArray(x.categories) && x.categories.length ? x.categories : createDefaultCategories();
  for (const t of base.tx) ensureCategory(base, t.category, t.type);
  base.budgets = Array.isArray(x.budgets) ? x.budgets : [];
  base.recurring = Array.isArray(x.recurring) ? x.recurring : [];
  return base;
}

export function normalizeBackupPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('فایل پشتیبان معتبر نیست');
  }
  const appearance = parsed._appearance && typeof parsed._appearance === 'object' ? parsed._appearance : null;
  const customFont = typeof parsed._customFont === 'string' ? parsed._customFont : null;
  const legacyLight = Boolean(parsed.light);

  const clone = { ...parsed };
  delete clone._appearance;
  delete clone._customFont;

  let state;
  if (clone.version === SCHEMA_VERSION) {
    state = validateAndNormalizeV2Payload(clone);
  } else if (isV1Payload(clone)) {
    state = migrateV1ToV2(clone);
  } else {
    throw new Error('نسخه یا ساختار فایل پشتیبان پشتیبانی نمی‌شود');
  }

  return { state, appearance, customFont, legacyLight };
}
