const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

export function norm(value) {
  return String(value ?? '')
    .replace(/[۰-۹]/g, (c) => String(PERSIAN_DIGITS.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String(ARABIC_DIGITS.indexOf(c)))
    .replaceAll('/', '-')
    .trim();
}

export function fmt(n) {
  return Math.round(Number(n) || 0).toLocaleString('fa-IR');
}

export function fmtYear(y) {
  return (Number(y) || 0).toLocaleString('fa-IR', { useGrouping: false });
}

export function toPersianDigits(value) {
  return String(value ?? '').replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export function formatMoneyInput(raw) {
  const digits = norm(raw).replace(/[^0-9]/g, '');
  if (!digits) return '';
  const cleaned = digits.replace(/^0+(?=\d)/, '');
  return toPersianDigits(cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));
}

export function parseMoney(raw, { allowZero = false, label = 'مبلغ' } = {}) {
  const cleaned = norm(raw).replace(/[,٬،\s]/g, '');
  if (!cleaned) {
    throw new Error(`${label} را وارد کنید`);
  }
  const n = Number(cleaned);
  if (!Number.isSafeInteger(n) || (allowZero ? n < 0 : n <= 0)) {
    throw new Error(allowZero ? `${label} باید عدد صحیح نامنفی باشد` : `${label} باید عدد صحیح مثبت باشد`);
  }
  return n;
}

export function requireText(raw, label = 'عنوان') {
  const s = String(raw ?? '').trim();
  if (!s) {
    throw new Error(`${label} نمی‌تواند خالی باشد`);
  }
  return s;
}

export function csvCell(value) {
  const s = String(value ?? '');
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${guarded.replaceAll('"', '""')}"`;
}

export function attachMoneyInputs(root = document) {
  root.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.money) return;

    const caretPos = target.selectionStart ?? target.value.length;
    const digitsBeforeCaret = norm(target.value.slice(0, caretPos)).replace(/[^0-9]/g, '').length;
    const formatted = formatMoneyInput(target.value);
    if (formatted === target.value) return;

    target.value = formatted;

    if (document.activeElement === target && typeof target.setSelectionRange === 'function') {
      let seenDigits = 0;
      let nextCaret = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (seenDigits >= digitsBeforeCaret) break;
        const ch = norm(formatted[i]);
        if (/[0-9]/.test(ch)) seenDigits++;
        nextCaret = i + 1;
      }
      target.setSelectionRange(nextCaret, nextCaret);
    }
  });
}
