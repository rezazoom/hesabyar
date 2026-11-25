import { currentMonth, daysDiff, dueDate, shiftMonth, today } from './date.js';
import { fmt, uid } from './format.js';

export const TYPE_LABELS = {
  income: 'درآمد',
  expense: 'هزینه',
  installment: 'قسط',
  bill: 'قبض و شارژ',
  borrow: 'قرض دریافتی',
  lend: 'قرض پرداختی',
  settlement: 'تسویه قرض و طلب',
  transfer: 'انتقال بین حساب‌ها',
};

export const ACCOUNT_TYPE_LABELS = {
  bank: 'کارت / حساب بانکی',
  cash: 'کیف پول نقد',
  savings: 'حساب پس‌انداز',
};

export const sumAmounts = (items, key = 'amount') =>
  items.reduce((acc, item) => acc + (Number(item?.[key]) || 0), 0);

export function getAccountMap(state) {
  return new Map((state.accounts || []).map((a) => [a.id, a]));
}

export function getAccountName(state, id) {
  return getAccountMap(state).get(id)?.name || 'حساب اصلی';
}

export function getInstallmentOccurrences(state) {
  const defaultAccId = state.accounts?.[0]?.id || 'acc_main';
  return (state.plans || []).flatMap((plan) =>
    Array.from({ length: plan.count }, (_, i) => {
      const ov = plan.overrides?.[i] || {};
      const date = ov.date || dueDate(shiftMonth(plan.start, i), plan.day);
      const amount = Math.round(ov.amount ?? plan.amount);
      const payments = Array.isArray(plan.payments?.[i]) ? plan.payments[i] : [];
      const paidSum = sumAmounts(payments);
      const remaining = Math.max(0, amount - paidSum);
      const latestPayDate = payments.length
        ? payments.map((p) => p.date).sort().at(-1)
        : null;
      return {
        id: `${plan.id}:${i}`,
        plan,
        i,
        title: plan.title,
        category: plan.category || '',
        kind: plan.kind === 'bill' ? 'bill' : 'installment',
        date,
        amount,
        defaultAccountId: plan.defaultAccountId || defaultAccId,
        payments,
        paidSum,
        remaining,
        pay: remaining === 0 && latestPayDate ? { date: latestPayDate, amount: paidSum } : null,
      };
    })
  );
}

export function getLoansNormalized(state) {
  const defaultAccId = state.accounts?.[0]?.id || 'acc_main';
  return (state.loans || []).map((loan) => {
    const payments = Array.isArray(loan.payments) ? loan.payments : [];
    const paidSum = sumAmounts(payments);
    const remaining = Math.max(0, Math.round(loan.amount) - paidSum);
    const latestPayDate = payments.length
      ? payments.map((p) => p.date).sort().at(-1)
      : null;
    return {
      ...loan,
      kind: loan.type === 'borrow' ? 'borrow' : 'lend',
      accountId: loan.accountId || defaultAccId,
      payments,
      paidSum,
      remaining,
      pay: remaining === 0 && latestPayDate ? { date: latestPayDate, amount: paidSum } : null,
    };
  });
}

export function getObligations(state) {
  return [...getInstallmentOccurrences(state), ...getLoansNormalized(state)];
}

export function getCashEvents(state, { includeTransfers = false } = {}) {
  const defaultAccId = state.accounts?.[0]?.id || 'acc_main';
  const events = [];

  for (const t of state.tx || []) {
    events.push({
      id: t.id,
      title: t.title,
      category: t.category || 'سایر',
      date: t.date,
      amount: t.amount,
      sign: t.type === 'income' ? 1 : -1,
      type: t.type,
      accountId: t.accountId || defaultAccId,
      isTransfer: false,
      source: 'tx',
    });
  }

  for (const occ of getInstallmentOccurrences(state)) {
    for (const p of occ.payments) {
      events.push({
        id: p.id,
        title: occ.title,
        category: occ.category || (occ.kind === 'bill' ? 'قبوض' : 'اقساط'),
        date: p.date,
        amount: p.amount,
        sign: -1,
        type: occ.kind,
        accountId: p.accountId || occ.defaultAccountId,
        isTransfer: false,
        source: 'plan',
        refId: occ.id,
      });
    }
  }

  for (const loan of getLoansNormalized(state)) {
    events.push({
      id: loan.id,
      title: loan.title,
      category: 'قرض و طلب',
      date: loan.given,
      amount: loan.amount,
      sign: loan.type === 'borrow' ? 1 : -1,
      type: loan.type,
      accountId: loan.accountId,
      isTransfer: false,
      source: 'loan',
    });

    for (const p of loan.payments) {
      events.push({
        id: p.id,
        title: loan.title,
        category: 'تسویه قرض و طلب',
        date: p.date,
        amount: p.amount,
        sign: loan.type === 'borrow' ? -1 : 1,
        type: 'settlement',
        accountId: p.accountId || loan.accountId,
        isTransfer: false,
        source: 'loan-pay',
        refId: loan.id,
      });
    }
  }

  if (includeTransfers) {
    for (const tr of state.transfers || []) {
      const fromName = getAccountName(state, tr.fromAccountId);
      const toName = getAccountName(state, tr.toAccountId);
      const suffix = tr.note ? ` (${tr.note})` : '';
      events.push({
        id: `${tr.id}:out`,
        title: `انتقال به ${toName}${suffix}`,
        category: 'انتقال',
        date: tr.date,
        amount: tr.amount,
        sign: -1,
        type: 'transfer',
        accountId: tr.fromAccountId,
        isTransfer: true,
        source: 'transfer',
        transferId: tr.id,
      });
      events.push({
        id: `${tr.id}:in`,
        title: `انتقال از ${fromName}${suffix}`,
        category: 'انتقال',
        date: tr.date,
        amount: tr.amount,
        sign: 1,
        type: 'transfer',
        accountId: tr.toAccountId,
        isTransfer: true,
        source: 'transfer',
        transferId: tr.id,
      });
    }
  }

  return events;
}

export function getAllMonths(state) {
  const set = new Set([
    ...(state.months || []),
    state.month,
    currentMonth(),
    ...Object.keys(state.openingByAccount || {}),
  ]);
  for (const e of getCashEvents(state, { includeTransfers: true })) {
    if (e.date) set.add(e.date.slice(0, 7));
  }
  for (const o of getObligations(state)) {
    if (o.date) set.add(o.date.slice(0, 7));
  }
  return [...set].filter(Boolean).sort();
}

export function getMonthTimelineBalances(state) {
  const months = getAllMonths(state);
  const accounts = state.accounts || [];
  const allEvents = getCashEvents(state, { includeTransfers: true });
  const running = {};
  for (const acc of accounts) {
    running[acc.id] = acc.initialBalance || 0;
  }

  const byMonth = {};
  for (const m of months) {
    const openingByAccount = {};
    const openingSourceByAccount = {};
    const manualMap = state.openingByAccount?.[m] || {};
    let totalOpening = 0;
    let hasManualOverride = false;

    for (const acc of accounts) {
      if (Object.hasOwn(manualMap, acc.id)) {
        openingByAccount[acc.id] = manualMap[acc.id];
        openingSourceByAccount[acc.id] = 'manual';
        hasManualOverride = true;
      } else {
        openingByAccount[acc.id] = running[acc.id] ?? 0;
        openingSourceByAccount[acc.id] = 'carryover';
      }
      totalOpening += openingByAccount[acc.id];
    }

    const closingByAccount = {};
    let totalClosing = 0;
    const monthEvents = allEvents.filter((e) => e.date.startsWith(m));

    for (const acc of accounts) {
      const accEvents = monthEvents.filter((e) => e.accountId === acc.id);
      const delta = accEvents.reduce((s, e) => s + e.sign * e.amount, 0);
      const closeVal = openingByAccount[acc.id] + delta;
      closingByAccount[acc.id] = closeVal;
      running[acc.id] = closeVal;
      totalClosing += closeVal;
    }

    byMonth[m] = {
      openingByAccount,
      openingSourceByAccount,
      totalOpening,
      hasManualOverride,
      closingByAccount,
      totalClosing,
    };
  }

  return { months, byMonth };
}

export function getMonthTotals(state, month) {
  const events = getCashEvents(state, { includeTransfers: false }).filter((e) =>
    e.date.startsWith(month)
  );
  const inc = sumAmounts(events.filter((e) => e.sign === 1));
  const out = sumAmounts(events.filter((e) => e.sign === -1));
  const pending = getObligations(state)
    .filter((o) => o.kind !== 'lend' && o.date.startsWith(month) && o.remaining > 0)
    .reduce((s, o) => s + o.remaining, 0);
  return { inc, out, net: inc - out, pending };
}

export function getObligationStatus(o, now = today()) {
  const payments = o.payments || [];
  const totalPaid = o.paidSum ?? sumAmounts(payments);
  const remaining = o.remaining ?? Math.max(0, o.amount - totalPaid);
  const latestDate = payments.length ? payments.map((p) => p.date).sort().at(-1) : null;

  if (remaining === 0 && latestDate && latestDate > now) {
    return { key: 'waiting', label: 'پرداخت ثبت‌شده برای آینده' };
  }
  if (remaining === 0) {
    return { key: 'paid', label: '✓ تسویه شده' };
  }
  if (totalPaid > 0) {
    const pct = Math.round((totalPaid / Math.max(1, o.amount)) * 100);
    return { key: 'partial', label: `پرداخت جزئی (${fmt(pct)}٪)` };
  }
  const d = daysDiff(o.date, now);
  if (d < 0) return { key: 'late', label: `${fmt(-d)} روز گذشته` };
  if (d === 0) return { key: 'soon', label: 'سررسید امروز' };
  if (d <= 7) return { key: 'soon', label: `${fmt(d)} روز مانده` };
  return { key: 'waiting', label: `${fmt(d)} روز مانده` };
}

export function computeDashboardMetrics(state, month, now = today()) {
  const end = dueDate(month, 31);
  const start = `${month}-01`;
  const cut = end < now ? end : now;

  const timeline = getMonthTimelineBalances(state);
  const monthBal = timeline.byMonth[month] || {
    openingByAccount: {},
    openingSourceByAccount: {},
    totalOpening: 0,
    hasManualOverride: false,
  };

  const allEvents = getCashEvents(state, { includeTransfers: true });
  const nonTransferEvents = allEvents.filter((e) => !e.isTransfer);

  const c = nonTransferEvents.filter((x) => x.date >= start && x.date <= cut);
  const planned = nonTransferEvents.filter((x) => x.date > cut && x.date <= end);
  const cAllWithTransfers = allEvents.filter((x) => x.date >= start && x.date <= cut);

  const accountSummaries = (state.accounts || []).map((acc) => {
    const open = monthBal.openingByAccount[acc.id] ?? 0;
    const accEv = cAllWithTransfers.filter((e) => e.accountId === acc.id);
    const inFlow = sumAmounts(accEv.filter((e) => e.sign > 0));
    const outFlow = sumAmounts(accEv.filter((e) => e.sign < 0));
    return {
      account: acc,
      opening: open,
      openingSource: monthBal.openingSourceByAccount[acc.id] || 'carryover',
      inFlow,
      outFlow,
      balance: open + inFlow - outFlow,
    };
  });

  const allObligations = getObligations(state);
  const remainingAtDate = (ob, cutoff) => {
    const paid = sumAmounts((ob.payments || []).filter((p) => p.date <= cutoff));
    return Math.max(0, ob.amount - paid);
  };

  const debt = allObligations.filter((x) => x.kind !== 'lend');
  const openDebt = debt
    .map((x) => ({ ...x, openAtCut: remainingAtDate(x, cut) }))
    .filter((x) => x.openAtCut > 0);

  const monthDebt = debt.filter((x) => x.date.startsWith(month));
  const monthDebtTotal = sumAmounts(monthDebt);
  const monthPaidTotal = monthDebt.reduce(
    (s, x) => s + sumAmounts((x.payments || []).filter((p) => p.date <= cut)),
    0
  );
  const monthOpenItems = monthDebt
    .map((x) => ({ ...x, openAtCut: remainingAtDate(x, cut) }))
    .filter((x) => x.openAtCut > 0);
  const monthOpenTotal = sumAmounts(monthOpenItems, 'openAtCut');

  const lateItems = openDebt.filter((x) => x.date < start);
  const futureItems = openDebt.filter((x) => x.date > end);
  const needTotal = sumAmounts(lateItems, 'openAtCut') + monthOpenTotal;

  // Debt payments scheduled after cut within this month that settle obligations due <= end
  const futureDebtPaidInMonth = debt
    .filter((x) => x.date <= end)
    .reduce(
      (s, x) =>
        s + sumAmounts((x.payments || []).filter((p) => p.date > cut && p.date >= start && p.date <= end)),
      0
    );

  const opening = monthBal.totalOpening;
  const inc = sumAmounts(c.filter((x) => x.sign > 0));
  const out = sumAmounts(c.filter((x) => x.sign < 0));
  const plannedIn = sumAmounts(planned.filter((x) => x.sign > 0));
  const plannedOut = sumAmounts(planned.filter((x) => x.sign < 0));

  const net = opening + inc - out;
  const after = net + plannedIn - plannedOut - needTotal + futureDebtPaidInMonth;
  const allOpenTotal = sumAmounts(openDebt, 'openAtCut');
  const allAfter = net - allOpenTotal;

  const liveDebt = debt
    .map((x) => ({ ...x, openLive: remainingAtDate(x, now) }))
    .filter((x) => x.openLive > 0);
  const actualLate = liveDebt.filter((x) => x.date < now);
  const receivablesLive = allObligations
    .filter((x) => x.kind === 'lend')
    .map((x) => ({ ...x, openLive: remainingAtDate(x, now) }))
    .filter((x) => x.openLive > 0);

  return {
    start,
    end,
    cut,
    opening,
    hasManualOverride: monthBal.hasManualOverride,
    accountSummaries,
    c,
    planned,
    allObligations,
    openDebt,
    allOpenTotal,
    monthDebt,
    monthDebtTotal,
    monthPaidTotal,
    monthOpenTotal,
    monthPaidCount: monthDebt.length - monthOpenItems.length,
    monthOpenCount: monthOpenItems.length,
    lateTotal: sumAmounts(lateItems, 'openAtCut'),
    futureTotal: sumAmounts(futureItems, 'openAtCut'),
    needTotal,
    inc,
    out,
    plannedIn,
    plannedOut,
    net,
    after,
    allAfter,
    earned: sumAmounts(c.filter((x) => x.type === 'income')),
    paidCash: sumAmounts(
      c.filter((x) => x.sign < 0 && ['installment', 'bill', 'settlement'].includes(x.type))
    ),
    liveDebtTotal: sumAmounts(liveDebt, 'openLive'),
    actualLate,
    actualLateTotal: sumAmounts(actualLate, 'openLive'),
    receivablesTotal: sumAmounts(receivablesLive, 'openLive'),
  };
}

export function computeBudgetUsage(state, month) {
  const expenses = (state.tx || []).filter(
    (t) => t.type === 'expense' && t.date.startsWith(month)
  );
  const billPayments = getInstallmentOccurrences(state)
    .filter((o) => o.kind === 'bill')
    .flatMap((o) =>
      o.payments
        .filter((p) => p.date.startsWith(month))
        .map((p) => ({ category: o.category || 'سایر', amount: p.amount }))
    );

  const spentByCategory = {};
  for (const item of [...expenses, ...billPayments]) {
    const cat = item.category || 'سایر';
    spentByCategory[cat] = (spentByCategory[cat] || 0) + item.amount;
  }

  // Prefer month-specific override budget over default (month === '') budget
  const resolved = new Map();
  for (const b of state.budgets || []) {
    if (!b.month) resolved.set(b.category, b);
  }
  for (const b of state.budgets || []) {
    if (b.month === month) resolved.set(b.category, b);
  }

  return [...resolved.values()].map((b) => {
    const spent = spentByCategory[b.category] || 0;
    const pct = Math.round((spent / Math.max(1, b.amount)) * 100);
    const remaining = b.amount - spent;
    const level = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'good';
    return { ...b, spent, pct, remaining, level };
  });
}

export function getDueRecurringItems(state, now = today()) {
  const curMonth = now.slice(0, 7);
  const pending = [];

  for (const rule of state.recurring || []) {
    if (!rule.active) continue;
    const endMonth = rule.end && rule.end < curMonth ? rule.end : curMonth;
    let cursor = rule.start;
    let safety = 0;
    while (cursor <= endMonth && safety < 360) {
      safety++;
      const due = dueDate(cursor, rule.day);
      if (due <= now && !rule.handledMonths?.[cursor]) {
        pending.push({
          rule,
          month: cursor,
          dueDate: due,
        });
      }
      cursor = shiftMonth(cursor, 1);
    }
  }

  return pending.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function applyAutoRecurringRules(state, now = today()) {
  const dueItems = getDueRecurringItems(state, now).filter((item) => item.rule.autoPost);
  if (!dueItems.length) return 0;

  let postedCount = 0;
  for (const item of dueItems) {
    const rule = (state.recurring || []).find((r) => r.id === item.rule.id);
    if (!rule) continue;
    rule.handledMonths = rule.handledMonths || {};
    if (rule.handledMonths[item.month]) continue;

    state.tx.push({
      id: uid(),
      type: rule.type,
      title: rule.title,
      amount: rule.amount,
      date: item.dueDate,
      category: rule.category || 'سایر',
      accountId: rule.accountId || state.accounts?.[0]?.id || 'acc_main',
      recurringId: rule.id,
    });
    if (!state.months.includes(item.month)) {
      state.months.push(item.month);
    }
    rule.handledMonths[item.month] = 'posted';
    postedCount++;
  }

  return postedCount;
}
