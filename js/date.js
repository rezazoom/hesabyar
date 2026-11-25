import {
  d2j,
  isValidJalaaliDate,
  j2d,
  jalaaliMonthLength,
  toGregorian,
  toJalaali,
} from '../vendor/jalaali.js';
import { fmtYear, norm } from './format.js';

export const PERSIAN_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export const PERSIAN_WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function jdate(d = new Date()) {
  const { jy, jm, jd } = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${String(jy).padStart(4, '0')}-${pad2(jm)}-${pad2(jd)}`;
}

export function today() {
  return jdate(new Date());
}

export function currentMonth() {
  return today().slice(0, 7);
}

export function parseJalali(value) {
  const s = norm(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const jy = Number(m[1]);
  const jm = Number(m[2]);
  const jd = Number(m[3]);
  if (jy < 1200 || jy > 1600 || !isValidJalaaliDate(jy, jm, jd)) return null;
  return { jy, jm, jd, str: `${jy}-${pad2(jm)}-${pad2(jd)}` };
}

export function validDate(value) {
  const parsed = parseJalali(value);
  if (!parsed) {
    throw new Error('تاریخ شمسی نامعتبر است؛ نمونه صحیح: 1405-09-01');
  }
  return parsed.str;
}

export function isValidMonth(value) {
  const s = norm(value);
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(s);
  if (!m) return false;
  const jy = Number(m[1]);
  return jy >= 1200 && jy <= 1600;
}

export function validMonth(value) {
  const s = norm(value);
  if (!isValidMonth(s)) {
    throw new Error('ماه شمسی نامعتبر است؛ نمونه صحیح: 1405-09');
  }
  return s;
}

export function toGregorianDate(jStr) {
  const p = parseJalali(jStr);
  if (!p) return null;
  const { gy, gm, gd } = toGregorian(p.jy, p.jm, p.jd);
  return new Date(gy, gm - 1, gd, 12, 0, 0, 0);
}

export function shiftMonth(ym, delta) {
  const [y, m] = norm(ym).split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const nextY = Math.floor(total / 12);
  const nextM = ((total % 12) + 12) % 12 + 1;
  return `${String(nextY).padStart(4, '0')}-${pad2(nextM)}`;
}

export function dueDate(ym, day) {
  const [jy, jm] = norm(ym).split('-').map(Number);
  const maxDay = jalaaliMonthLength(jy, jm);
  const clamped = Math.max(1, Math.min(Number(day) || 1, maxDay));
  return `${String(jy).padStart(4, '0')}-${pad2(jm)}-${pad2(clamped)}`;
}

export function daysDiff(jStr, baseStr = today()) {
  const a = parseJalali(jStr);
  const b = parseJalali(baseStr);
  if (!a || !b) return 0;
  return j2d(a.jy, a.jm, a.jd) - j2d(b.jy, b.jm, b.jd);
}

export function addDays(jStr, delta) {
  const p = parseJalali(jStr);
  if (!p) return jStr;
  const { jy, jm, jd } = d2j(j2d(p.jy, p.jm, p.jd) + delta);
  return `${String(jy).padStart(4, '0')}-${pad2(jm)}-${pad2(jd)}`;
}

export function monthName(ym) {
  const s = norm(ym);
  const [y, m] = s.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return ym;
  return `${PERSIAN_MONTHS[m - 1]} ${fmtYear(y)}`;
}

export function getMonthCalendarGrid(jy, jm) {
  const daysInMonth = jalaaliMonthLength(jy, jm);
  const { gy, gm, gd } = toGregorian(jy, jm, 1);
  const jsDay = new Date(gy, gm - 1, gd, 12, 0, 0, 0).getDay();
  // Convert JS Sunday=0..Saturday=6 into Persian Saturday=0..Friday=6
  const startWeekday = (jsDay + 1) % 7;
  return { daysInMonth, startWeekday };
}
