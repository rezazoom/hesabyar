import {
  addDays,
  getMonthCalendarGrid,
  pad2,
  parseJalali,
  PERSIAN_MONTHS,
  PERSIAN_WEEKDAYS_SHORT,
  today,
} from '../date.js';
import { esc, fmtYear, toPersianDigits } from '../format.js';
import { icon } from './icons.js';

let targetInput = null;
let viewYear = 1405;
let viewMonth = 1;

function getPopover() {
  return document.getElementById('datepickerPopover');
}

function positionPopover(anchor) {
  const pop = getPopover();
  if (!pop || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const popW = Math.min(304, window.innerWidth * 0.92);
  const popH = 320;
  let left = rect.left;
  if (left + popW > window.innerWidth - 10) {
    left = Math.max(10, window.innerWidth - popW - 10);
  }
  let top = rect.bottom + 6;
  if (top + popH > window.innerHeight - 10) {
    top = Math.max(10, rect.top - popH - 6);
  }
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}

function selectDate(dateStr) {
  if (!targetInput) return;
  targetInput.value = dateStr;
  targetInput.dispatchEvent(new Event('input', { bubbles: true }));
  targetInput.dispatchEvent(new Event('change', { bubbles: true }));
  closeDatePicker();
}

function renderPopover() {
  const pop = getPopover();
  if (!pop) return;

  const { daysInMonth, startWeekday } = getMonthCalendarGrid(viewYear, viewMonth);
  const todayStr = today();
  const selectedStr = parseJalali(targetInput?.value)?.str || '';

  const blanks = Array.from({ length: startWeekday }, () => '<span></span>').join('');
  const dayButtons = Array.from({ length: daysInMonth }, (_, idx) => {
    const day = idx + 1;
    const str = `${viewYear}-${pad2(viewMonth)}-${pad2(day)}`;
    const classes = ['dp-day'];
    if (str === todayStr) classes.push('is-today');
    if (str === selectedStr) classes.push('is-selected');
    return `<button type="button" class="${classes.join(' ')}" data-dp-date="${str}">${toPersianDigits(day)}</button>`;
  }).join('');

  pop.innerHTML = `
    <div class="dp-header">
      <div class="row" style="gap:4px">
        <button type="button" class="btn btn-icon btn-sm btn-ghost" data-dp-nav="prev-year" title="سال قبل">${icon('ChevronsRight', 'sm')}</button>
        <button type="button" class="btn btn-icon btn-sm btn-ghost" data-dp-nav="prev-month" title="ماه قبل">${icon('ChevronRight', 'sm')}</button>
      </div>
      <span class="dp-title">${esc(PERSIAN_MONTHS[viewMonth - 1])} ${fmtYear(viewYear)}</span>
      <div class="row" style="gap:4px">
        <button type="button" class="btn btn-icon btn-sm btn-ghost" data-dp-nav="next-month" title="ماه بعد">${icon('ChevronLeft', 'sm')}</button>
        <button type="button" class="btn btn-icon btn-sm btn-ghost" data-dp-nav="next-year" title="سال بعد">${icon('ChevronsLeft', 'sm')}</button>
      </div>
    </div>
    <div class="dp-weekdays">
      ${PERSIAN_WEEKDAYS_SHORT.map((d) => `<span>${d}</span>`).join('')}
    </div>
    <div class="dp-days">
      ${blanks}${dayButtons}
    </div>
    <div class="dp-quick">
      <button type="button" class="btn btn-sm btn-ghost" data-dp-quick="today">امروز</button>
      <button type="button" class="btn btn-sm btn-ghost" data-dp-quick="yesterday">دیروز</button>
      <button type="button" class="btn btn-sm btn-ghost" data-dp-quick="month-start">اول ماه</button>
    </div>
  `;
}

export function openDatePicker(inputEl, anchorEl) {
  const pop = getPopover();
  if (!pop || !inputEl) return;

  targetInput = inputEl;
  const parsed = parseJalali(inputEl.value) || parseJalali(today());
  viewYear = parsed.jy;
  viewMonth = parsed.jm;

  // Ensure popover is inside open <dialog> if input lives inside a modal (top-layer!)
  const openDialog = inputEl.closest('dialog[open]');
  const desiredParent = openDialog || document.body;
  if (pop.parentElement !== desiredParent) {
    desiredParent.appendChild(pop);
  }

  renderPopover();
  pop.classList.remove('hidden');
  positionPopover(anchorEl || inputEl);
}

export function closeDatePicker() {
  const pop = getPopover();
  if (!pop) return;
  pop.classList.add('hidden');
  targetInput = null;
}

export function initDatePicker() {
  const pop = getPopover();
  if (!pop) return;

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-date-trigger]');
    if (trigger) {
      e.preventDefault();
      e.stopPropagation();
      const wrap = trigger.closest('.date-input-wrap');
      const input = wrap?.querySelector('input[data-jalali]');
      if (input) {
        if (targetInput === input && !pop.classList.contains('hidden')) {
          closeDatePicker();
        } else {
          openDatePicker(input, trigger);
        }
      }
      return;
    }

    if (pop.classList.contains('hidden')) return;
    if (pop.contains(e.target) || e.target === targetInput) return;
    closeDatePicker();
  });

  pop.addEventListener('click', (e) => {
    e.stopPropagation();
    const dayBtn = e.target.closest('[data-dp-date]');
    if (dayBtn) {
      selectDate(dayBtn.getAttribute('data-dp-date'));
      return;
    }

    const nav = e.target.closest('[data-dp-nav]')?.getAttribute('data-dp-nav');
    if (nav) {
      if (nav === 'prev-month') {
        viewMonth -= 1;
        if (viewMonth < 1) {
          viewMonth = 12;
          viewYear -= 1;
        }
      } else if (nav === 'next-month') {
        viewMonth += 1;
        if (viewMonth > 12) {
          viewMonth = 1;
          viewYear += 1;
        }
      } else if (nav === 'prev-year') {
        viewYear -= 1;
      } else if (nav === 'next-year') {
        viewYear += 1;
      }
      renderPopover();
      return;
    }

    const quick = e.target.closest('[data-dp-quick]')?.getAttribute('data-dp-quick');
    if (quick) {
      const t = today();
      if (quick === 'today') selectDate(t);
      else if (quick === 'yesterday') selectDate(addDays(t, -1));
      else if (quick === 'month-start') selectDate(`${t.slice(0, 7)}-01`);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.classList.contains('hidden')) {
      closeDatePicker();
    }
  });

  document.addEventListener('close', () => {
    if (!pop.classList.contains('hidden')) {
      closeDatePicker();
    }
  }, true);
}
