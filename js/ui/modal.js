import { esc, fmt } from '../format.js';
import { icon } from './icons.js';
import { showToast } from './toast.js';

let activeOnSubmit = null;

export function fieldHtml(name, label, value = '', type = 'text', extra = '') {
  const isMoney = extra.includes('data-money');
  const displayVal = isMoney && value !== '' && value !== null && value !== undefined
    ? fmt(value)
    : value;
  return `
    <label class="field">
      <span>${esc(label)}</span>
      <input name="${esc(name)}" type="${esc(type)}" value="${esc(displayVal)}" ${extra}>
    </label>
  `;
}

export function moneyFieldHtml(name, label, value = '', { required = true, placeholder = 'مثلاً ۲٬۵۰۰٬۰۰۰' } = {}) {
  const displayVal = value !== '' && value !== null && value !== undefined ? fmt(value) : '';
  return `
    <label class="field">
      <span>${esc(label)}</span>
      <input name="${esc(name)}" type="text" inputmode="numeric" data-money="1" autocomplete="off" placeholder="${esc(placeholder)}" value="${esc(displayVal)}" ${required ? 'required' : ''}>
    </label>
  `;
}

export function dateFieldHtml(name, label, value = '', { required = true } = {}) {
  return `
    <label class="field">
      <span>${esc(label)}</span>
      <div class="date-input-wrap">
        <input name="${esc(name)}" type="text" data-jalali="1" placeholder="1405-09-01" autocomplete="off" value="${esc(value)}" ${required ? 'required' : ''}>
        <button type="button" class="date-trigger" data-date-trigger="${esc(name)}" aria-label="انتخاب از تقویم">
          ${icon('Calendar', 'sm')}
        </button>
      </div>
    </label>
  `;
}

export function selectHtml(name, label, options, selected = '', extra = '') {
  return `
    <label class="field">
      <span>${esc(label)}</span>
      <select name="${esc(name)}" ${extra}>
        ${options
          .map(
            ([val, text]) =>
              `<option value="${esc(val)}" ${String(val) === String(selected) ? 'selected' : ''}>${esc(text)}</option>`
          )
          .join('')}
      </select>
    </label>
  `;
}

export function accountSelectHtml(state, name = 'accountId', label = 'حساب / کارت', selectedId = '') {
  const accounts = (state.accounts || []).filter((a) => !a.archived || a.id === selectedId);
  const current = selectedId || accounts[0]?.id || '';
  return selectHtml(
    name,
    label,
    accounts.map((a) => [a.id, a.name]),
    current
  );
}

export function tableHtml(headers, rows, { emptyText = 'هنوز موردی ثبت نشده است.', mobileCards = true } = {}) {
  const cls = mobileCards ? 'mobile-cards' : '';
  const body = rows.length
    ? rows
        .map(
          (row) =>
            `<tr>${row
              .map((cell, i) => `<td data-label="${esc(headers[i] || '')}">${cell}</td>`)
              .join('')}</tr>`
        )
        .join('')
    : `<tr><td colspan="${headers.length}" class="empty-cell muted">${esc(emptyText)}</td></tr>`;

  return `
    <div class="scroll">
      <table class="${cls}">
        <thead>
          <tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

export function openFormModal({
  title,
  fieldsHtml,
  extraHtml = '',
  submitLabel = 'ذخیره',
  wide = false,
  onSubmit,
}) {
  const dlg = document.getElementById('dlg');
  const dt = document.getElementById('dt');
  const db = document.getElementById('db');
  if (!dlg || !dt || !db) return;

  dlg.classList.toggle('dialog-wide', Boolean(wide));
  dt.textContent = title;
  db.innerHTML = `
    <form id="modalForm" novalidate>
      <div class="grid">${fieldsHtml}</div>
      ${extraHtml}
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" data-close-dialog="dlg">انصراف</button>
        <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
      </div>
    </form>
  `;

  activeOnSubmit = onSubmit;
  const form = document.getElementById('modalForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(form).entries());
    // Include unchecked checkboxes cleanly if needed via form.elements
    for (const el of form.elements) {
      if (el instanceof HTMLInputElement && el.type === 'checkbox' && el.name) {
        raw[el.name] = el.checked;
      }
    }
    try {
      activeOnSubmit?.(raw, form);
    } catch (err) {
      showToast(err?.message || 'خطا در ثبت اطلاعات', { type: 'error' });
    }
  });

  if (!dlg.open) dlg.showModal();
  return db;
}

export function openInfoModal({ title, html, wide = false }) {
  const dlg = document.getElementById('dlg');
  const dt = document.getElementById('dt');
  const db = document.getElementById('db');
  if (!dlg || !dt || !db) return null;

  dlg.classList.toggle('dialog-wide', Boolean(wide));
  dt.textContent = title;
  db.innerHTML = html;
  if (!dlg.open) dlg.showModal();
  return db;
}

export function closeModal(id = 'dlg') {
  const dlg = document.getElementById(id);
  if (dlg?.open) dlg.close();
}

export function confirmDialog({
  title = 'تأیید عملیات',
  message,
  confirmLabel = 'تأیید',
  cancelLabel = 'انصراف',
  danger = false,
}) {
  const dlg = document.getElementById('confirmDlg');
  const titleEl = document.getElementById('confirmTitle');
  const bodyEl = document.getElementById('confirmBody');
  const actionsEl = document.getElementById('confirmActions');

  if (!dlg || !titleEl || !bodyEl || !actionsEl) {
    return Promise.resolve(false);
  }

  titleEl.textContent = title;
  bodyEl.innerHTML = `<p style="margin:0">${esc(message)}</p>`;
  actionsEl.innerHTML = `
    <button type="button" class="btn btn-ghost" id="confirmNoBtn">${esc(cancelLabel)}</button>
    <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirmYesBtn">${esc(confirmLabel)}</button>
  `;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      dlg.removeEventListener('close', onClose);
      if (dlg.open) dlg.close();
      resolve(result);
    };
    const onClose = () => finish(false);

    dlg.addEventListener('close', onClose);
    document.getElementById('confirmNoBtn')?.addEventListener('click', () => finish(false));
    document.getElementById('confirmYesBtn')?.addEventListener('click', () => finish(true));
    dlg.showModal();
  });
}

function isOutsideDialogRect(dlg, clientX, clientY) {
  const rect = dlg.getBoundingClientRect();
  return (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  );
}

export function initModalCloseHandlers() {
  let pointerDownInside = false;

  document.addEventListener('pointerdown', (e) => {
    if (e.target instanceof HTMLDialogElement && e.target.open) {
      pointerDownInside = !isOutsideDialogRect(e.target, e.clientX, e.clientY);
    } else {
      pointerDownInside = true;
    }
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-close-dialog]');
    if (btn) {
      const id = btn.getAttribute('data-close-dialog');
      if (id) closeModal(id);
      pointerDownInside = false;
      return;
    }

    if (
      e.target instanceof HTMLDialogElement &&
      e.target.open &&
      !pointerDownInside &&
      (e.clientX !== 0 || e.clientY !== 0) &&
      isOutsideDialogRect(e.target, e.clientX, e.clientY)
    ) {
      e.target.close();
    }
    pointerDownInside = false;
  });
}
