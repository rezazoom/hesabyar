import { esc } from '../format.js';
import { icon } from './icons.js';

const ICONS_BY_TYPE = {
  success: 'Check',
  error: 'AlertTriangle',
  warning: 'AlertTriangle',
  info: 'HelpCircle',
};

export function showToast(message, { type = 'info', duration = 3500 } = {}) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  while (container.children.length >= 2) {
    container.firstElementChild?.remove();
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.innerHTML = `
    <span class="row" style="gap:8px;flex-wrap:nowrap">
      ${icon(ICONS_BY_TYPE[type] || 'HelpCircle', 'sm')}
      <span>${esc(message)}</span>
    </span>
    <button type="button" class="btn btn-icon btn-sm btn-ghost" aria-label="بستن">${icon('X', 'sm')}</button>
  `;

  const remove = () => {
    toast.remove();
  };

  toast.querySelector('button')?.addEventListener('click', remove);
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(remove, duration);
  }
}
