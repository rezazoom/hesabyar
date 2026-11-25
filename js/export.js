import { today } from './date.js';
import { csvCell } from './format.js';
import { getAccountName, getCashEvents, getObligationStatus, TYPE_LABELS } from './ledger.js';
import { loadCustomFontAsset } from './storage.js';

export function downloadFile(filename, data, mimeType) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 500);
}

export async function exportJsonBackup(state, appearance) {
  const customFontAsset = await loadCustomFontAsset();
  const payload = {
    ...state,
    _appearance: appearance,
    _customFont: customFontAsset?.dataUrl || null,
  };
  downloadFile(`hesabyar-${today()}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

export function exportMonthCsv(state, month) {
  const rows = getCashEvents(state, { includeTransfers: true })
    .filter((e) => e.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [
      e.title,
      TYPE_LABELS[e.type] || e.type,
      getAccountName(state, e.accountId),
      e.date,
      e.sign > 0 ? e.amount : 0,
      e.sign < 0 ? e.amount : 0,
    ]);

  const lines = [['شرح', 'نوع', 'حساب', 'تاریخ', 'ورودی', 'خروجی'], ...rows]
    .map((r) => r.map(csvCell).join(','))
    .join('\r\n');

  downloadFile(`hesabyar-${month}.csv`, `\ufeff${lines}`, 'text/csv;charset=utf-8');
}

export function exportReportCsv(state, cashRows, from, to) {
  const rows = [...cashRows]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((e) => [
      e.title,
      TYPE_LABELS[e.type] || e.type,
      getAccountName(state, e.accountId),
      e.date,
      e.sign > 0 ? e.amount : 0,
      e.sign < 0 ? e.amount : 0,
    ]);

  const lines = [['شرح', 'نوع', 'حساب', 'تاریخ', 'ورودی', 'خروجی'], ...rows]
    .map((r) => r.map(csvCell).join(','))
    .join('\r\n');

  downloadFile(`hesabyar-report-${from}-${to}.csv`, `\ufeff${lines}`, 'text/csv;charset=utf-8');
}

function headerCell(text) {
  return {
    value: String(text),
    type: String,
    fontWeight: 'bold',
    backgroundColor: '#1e3a4c',
    color: '#ffffff',
  };
}

function makeCashSheet(state, events, sheetTitle) {
  const header = ['شرح', 'نوع', 'دسته', 'حساب', 'تاریخ', 'ورودی (تومان)', 'خروجی (تومان)'].map(headerCell);
  const body = [...events]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [
      { value: String(e.title || ''), type: String },
      { value: String(TYPE_LABELS[e.type] || e.type), type: String },
      { value: String(e.category || 'سایر'), type: String },
      { value: String(getAccountName(state, e.accountId)), type: String },
      { value: String(e.date), type: String },
      { value: e.sign > 0 ? Number(e.amount) : 0, type: Number, format: '#,##0' },
      { value: e.sign < 0 ? Number(e.amount) : 0, type: Number, format: '#,##0' },
    ]);

  return {
    sheet: sheetTitle,
    rightToLeft: true,
    columns: [
      { width: 28 },
      { width: 16 },
      { width: 18 },
      { width: 18 },
      { width: 14 },
      { width: 16 },
      { width: 16 },
    ],
    data: [header, ...body],
  };
}

function makeObligationsSheet(obligations, sheetTitle) {
  const header = ['عنوان', 'نوع', 'سررسید', 'مبلغ کل', 'پرداخت‌شده', 'مانده', 'وضعیت'].map(headerCell);
  const body = [...obligations]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((o) => [
      { value: String(o.title || ''), type: String },
      { value: String(TYPE_LABELS[o.kind] || o.kind), type: String },
      { value: String(o.date), type: String },
      { value: Number(o.amount), type: Number, format: '#,##0' },
      { value: Number(o.paidSum || 0), type: Number, format: '#,##0' },
      { value: Number(o.remaining ?? o.amount), type: Number, format: '#,##0' },
      { value: String(getObligationStatus(o).label), type: String },
    ]);

  return {
    sheet: sheetTitle,
    rightToLeft: true,
    columns: [
      { width: 26 },
      { width: 14 },
      { width: 14 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 20 },
    ],
    data: [header, ...body],
  };
}

export async function exportMonthXlsx(state, month) {
  const writeXlsxFile = globalThis.writeXlsxFile;
  if (typeof writeXlsxFile !== 'function') {
    throw new Error('کتابخانه خروجی اکسل بارگذاری نشده است');
  }
  const events = getCashEvents(state, { includeTransfers: true }).filter((e) =>
    e.date.startsWith(month)
  );
  const sheet = makeCashSheet(state, events, `تراکنش‌های ${month}`);
  await writeXlsxFile([sheet], { fontFamily: 'Tahoma', fontSize: 11 }).toFile(
    `hesabyar-${month}.xlsx`
  );
}

export async function exportReportXlsx(state, { cashRows, obligationRows, from, to }) {
  const writeXlsxFile = globalThis.writeXlsxFile;
  if (typeof writeXlsxFile !== 'function') {
    throw new Error('کتابخانه خروجی اکسل بارگذاری نشده است');
  }
  const sheets = [
    makeCashSheet(state, cashRows, 'گردش نقدی'),
    makeObligationsSheet(obligationRows, 'تعهدات'),
  ];
  await writeXlsxFile(sheets, { fontFamily: 'Tahoma', fontSize: 11 }).toFile(
    `hesabyar-report-${from}-${to}.xlsx`
  );
}
