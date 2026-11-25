import { monthName } from '../date.js';
import { exportJsonBackup, exportMonthCsv, exportMonthXlsx } from '../export.js';
import { esc, fmt } from '../format.js';
import { getAllMonths, getDueRecurringItems } from '../ledger.js';
import { normalizeBackupPayload } from '../migration.js';
import {
  ensureMonthListed,
  getState,
  mutateState,
  notify,
  replaceState,
  ui,
  undoPreviousState,
} from '../state.js';
import { saveCustomFontAsset } from '../storage.js';
import { getAppearance, loadCustomFontFace, setAppearance, toggleLightDark } from '../theme.js';
import { mountAccounts, renderAccounts } from '../views/accounts.js';
import { openAppearanceModal } from '../views/appearance.js';
import { mountBudgets, renderBudgets } from '../views/budgets.js';
import { mountDashboard, renderDashboard } from '../views/dashboard.js';
import { openNewMonthModal, openTxModal } from '../views/dialogs.js';
import { mountMonths, renderMonths } from '../views/months.js';
import { mountObligations, renderObligations } from '../views/obligations.js';
import { mountReports, renderReports } from '../views/reports.js';
import { mountTransactions, renderTransactions } from '../views/transactions.js';
import { icon } from './icons.js';
import { confirmDialog } from './modal.js';
import { showToast } from './toast.js';

const BRAND_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 21 12 12 21 3 12Z"/><path d="M12 8.2 15.8 12 12 15.8 8.2 12Z" fill="currentColor" stroke="none"/></svg>`;

const NAV_ITEMS = [
  { id: 'dash', label: 'داشبورد', icon: 'LayoutDashboard', mobile: true },
  { id: 'tx', label: 'درآمد و هزینه', icon: 'Receipt', mobile: true },
  { id: 'accounts', label: 'کارت‌ها و انتقال', icon: 'CreditCard', mobile: true },
  { id: 'obligations', label: 'تعهدات', icon: 'CalendarClock', mobile: true },
  { id: 'budgets', label: 'بودجه و تکرار', icon: 'Target', mobile: false },
  { id: 'reports', label: 'گزارش و تحلیل', icon: 'PieChart', mobile: false },
  { id: 'months', label: 'مدیریت ماه‌ها', icon: 'Calendar', mobile: false },
];

const VIEWS = {
  dash: { title: 'داشبورد مالی', render: renderDashboard, mount: mountDashboard },
  tx: { title: 'درآمد و هزینه', render: renderTransactions, mount: mountTransactions },
  accounts: { title: 'کارت‌ها و انتقال', render: renderAccounts, mount: mountAccounts },
  obligations: { title: 'اقساط، قبوض و قرض', render: renderObligations, mount: mountObligations },
  budgets: { title: 'بودجه و قوانین تکرار', render: renderBudgets, mount: mountBudgets },
  reports: { title: 'گزارش و تحلیل', render: renderReports, mount: mountReports },
  months: { title: 'مدیریت ماه‌ها', render: renderMonths, mount: mountMonths },
};

export function navigate(tabId) {
  if (!VIEWS[tabId]) return;
  ui.tab = tabId;
  ui.moreOpen = false;
  notify();
}

function closeMoreDrawer() {
  ui.moreOpen = false;
  document.getElementById('moreDrawer')?.classList.add('hidden');
  document.getElementById('moreBackdrop')?.classList.add('hidden');
}

function setBubbleOpen(isOpen) {
  const root = document.getElementById('quickBubble');
  if (!root) return;
  root.classList.toggle('is-open', Boolean(isOpen));
  const trigger = root.querySelector('.bubble-trigger');
  trigger?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function renderQuickBubble() {
  const root = document.getElementById('quickBubble');
  if (!root || root.childElementCount > 0) return;
  root.innerHTML = `
    <div id="bubbleActions" class="bubble-items" role="menu" aria-label="ثبت سریع تراکنش">
      <button type="button" class="bubble-item" role="menuitem" data-bubble-act="income">
        <span class="bubble-fab is-income">${icon('TrendingUp')}</span>
        <span class="bubble-label">ثبت درآمد</span>
      </button>
      <button type="button" class="bubble-item" role="menuitem" data-bubble-act="expense">
        <span class="bubble-fab is-expense">${icon('TrendingDown')}</span>
        <span class="bubble-label">ثبت هزینه</span>
      </button>
    </div>
    <button type="button" class="bubble-trigger" aria-expanded="false" aria-haspopup="menu" aria-controls="bubbleActions" aria-label="افزودن سریع درآمد یا هزینه" title="ثبت سریع درآمد / هزینه">
      ${icon('Plus')}
    </button>
  `;
}

function openMoreDrawer() {
  ui.moreOpen = true;
  document.getElementById('moreDrawer')?.classList.remove('hidden');
  document.getElementById('moreBackdrop')?.classList.remove('hidden');
}

function renderSidebar(state, dueCount) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const months = [...getAllMonths(state)].reverse();
  sidebar.innerHTML = `
    <div class="brand-box">
      <div class="brand-title">
        <div class="brand-mark">${BRAND_SVG}</div>
        <div>
          <strong>حساب‌یار</strong>
          <small>مدیریت مالی شخصی</small>
        </div>
      </div>
      <a class="btn btn-icon btn-ghost" href="./help.html" title="راهنمای استفاده" aria-label="راهنمای استفاده">
        ${icon('HelpCircle', 'sm')}
      </a>
    </div>

    <div class="sidebar-month">
      <small>ماه فعال</small>
      <div class="sidebar-month-row">
        <select id="sidebarMonthSelect" aria-label="انتخاب ماه">
          ${months
            .map((m) => `<option value="${esc(m)}" ${m === state.month ? 'selected' : ''}>${esc(monthName(m))}</option>`)
            .join('')}
        </select>
        <button type="button" class="btn btn-icon btn-primary" data-shell-act="new-month" title="تعریف ماه جدید">
          ${icon('Plus', 'sm')}
        </button>
      </div>
    </div>

    <nav class="sidebar-nav" aria-label="بخش‌های برنامه">
      ${NAV_ITEMS.map((item) => {
        const badge =
          item.id === 'budgets' && dueCount > 0
            ? `<span class="nav-badge">${fmt(dueCount)}</span>`
            : '';
        return `
          <button type="button" class="nav-item ${ui.tab === item.id ? 'active' : ''}" data-nav-id="${item.id}">
            <span class="nav-item-label">${icon(item.icon)} <span>${esc(item.label)}</span></span>
            ${badge}
          </button>
        `;
      }).join('')}
    </nav>

    <div class="sidebar-footer">
      <div class="sidebar-tools">
        <button type="button" class="btn btn-sm btn-ghost" data-shell-act="backup">${icon('Download', 'sm')} پشتیبان</button>
        <button type="button" class="btn btn-sm btn-ghost" data-shell-act="restore">${icon('Upload', 'sm')} بازیابی</button>
        <button type="button" class="btn btn-sm btn-ghost" data-shell-act="undo">${icon('Undo2', 'sm')} برگشت</button>
      </div>
      <small style="font-size:11px;line-height:1.5">ذخیره محلی در مرورگر این دستگاه</small>
    </div>
  `;
}

function renderTopbar(state) {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;
  const viewMeta = VIEWS[ui.tab] || VIEWS.dash;
  const months = [...getAllMonths(state)].reverse();

  topbar.innerHTML = `
    <div class="topbar-title">
      <div class="topbar-mobile-brand">
        <div class="brand-mark" style="width:30px;height:30px">${BRAND_SVG}</div>
      </div>
      <h2 style="margin:0">${esc(viewMeta.title)}</h2>
    </div>

    <div class="topbar-actions">
      <div class="topbar-month-wrap">
        <select id="topbarMonthSelect" aria-label="انتخاب ماه" style="width:auto;padding:6px 10px">
          ${months
            .map((m) => `<option value="${esc(m)}" ${m === state.month ? 'selected' : ''}>${esc(monthName(m))}</option>`)
            .join('')}
        </select>
        <button type="button" class="btn btn-icon btn-sm btn-primary" data-shell-act="new-month" aria-label="ماه جدید">${icon('Plus', 'sm')}</button>
      </div>
      <button type="button" class="btn btn-sm btn-ghost topbar-desktop-only" data-shell-act="csv">${icon('Download', 'sm')} CSV ماه</button>
      <button type="button" class="btn btn-sm btn-ghost topbar-desktop-only" data-shell-act="xlsx">${icon('FileSpreadsheet', 'sm')} اکسل ماه</button>
      <button type="button" class="btn btn-icon btn-sm btn-ghost" data-shell-act="toggle-theme" title="تغییر تم روشن/تاریک" aria-label="تغییر تم روشن/تاریک">${icon('Sun', 'sm')}</button>
      <button type="button" class="btn btn-sm btn-ghost topbar-desktop-only" data-shell-act="appearance">${icon('SlidersHorizontal', 'sm')} ظاهر</button>
    </div>
  `;
}

function renderMobileNav(dueCount) {
  const bottom = document.getElementById('bottomNav');
  const drawer = document.getElementById('moreDrawer');
  const isMoreActive = ['budgets', 'reports', 'months'].includes(ui.tab);

  if (bottom) {
    bottom.innerHTML = `
      ${NAV_ITEMS.filter((i) => i.mobile)
        .map(
          (i) => `
        <button type="button" class="bottom-nav-btn ${ui.tab === i.id ? 'active' : ''}" data-nav-id="${i.id}">
          ${icon(i.icon)}
          <span>${esc(i.label.split(' ')[0])}</span>
        </button>
      `
        )
        .join('')}
      <button type="button" class="bottom-nav-btn ${isMoreActive ? 'active' : ''}" data-shell-act="more-drawer">
        ${icon('Menu')}
        <span>بیشتر${dueCount > 0 ? ` (${fmt(dueCount)})` : ''}</span>
      </button>
    `;
  }

  if (drawer) {
    drawer.innerHTML = `
      <div class="more-drawer-header">
        <b>بخش‌های تکمیلی و ابزارها</b>
        <button type="button" class="btn btn-icon btn-sm btn-ghost" data-shell-act="close-more">${icon('X', 'sm')}</button>
      </div>
      <div class="more-drawer-grid">
        ${NAV_ITEMS.filter((i) => !i.mobile)
          .map(
            (i) => `
          <button type="button" class="btn ${ui.tab === i.id ? 'btn-primary' : 'btn-ghost'}" data-nav-id="${i.id}">
            ${icon(i.icon, 'sm')} ${esc(i.label)}
          </button>
        `
          )
          .join('')}
        <button type="button" class="btn btn-ghost" data-shell-act="appearance">${icon('SlidersHorizontal', 'sm')} ظاهر</button>
        <button type="button" class="btn btn-ghost" data-shell-act="backup">${icon('Download', 'sm')} پشتیبان JSON</button>
        <button type="button" class="btn btn-ghost" data-shell-act="restore">${icon('Upload', 'sm')} ورود پشتیبان</button>
        <button type="button" class="btn btn-ghost" data-shell-act="xlsx">${icon('FileSpreadsheet', 'sm')} اکسل ماه</button>
        <button type="button" class="btn btn-ghost" data-shell-act="csv">${icon('Download', 'sm')} CSV ماه</button>
        <button type="button" class="btn btn-ghost" data-shell-act="undo">${icon('Undo2', 'sm')} بازیابی تغییر</button>
        <a class="btn btn-ghost" href="./help.html">${icon('HelpCircle', 'sm')} راهنما</a>
      </div>
    `;
  }
}

export function renderApp() {
  const state = getState();
  const dueCount = getDueRecurringItems(state).length;

  renderSidebar(state, dueCount);
  renderTopbar(state);
  renderMobileNav(dueCount);
  renderQuickBubble();

  const viewEl = document.getElementById('view');
  const activeView = VIEWS[ui.tab] || VIEWS.dash;
  if (viewEl) {
    viewEl.innerHTML = activeView.render(state, ui);
    activeView.mount?.(viewEl, state, { navigate });
  }
}

async function handleShellAction(act) {
  const state = getState();
  if (act === 'new-month') return openNewMonthModal();
  if (act === 'toggle-theme') {
    toggleLightDark();
    return;
  }
  if (act === 'appearance') {
    closeMoreDrawer();
    return openAppearanceModal();
  }
  if (act === 'backup') {
    await exportJsonBackup(state, getAppearance());
    showToast('فایل پشتیبان JSON دانلود شد', { type: 'success' });
    return;
  }
  if (act === 'restore') {
    closeMoreDrawer();
    document.getElementById('importFile')?.click();
    return;
  }
  if (act === 'csv') {
    exportMonthCsv(state, state.month);
    showToast('فایل CSV ماه دانلود شد', { type: 'success' });
    return;
  }
  if (act === 'xlsx') {
    try {
      await exportMonthXlsx(state, state.month);
      showToast('فایل اکسل (.xlsx) ماه دانلود شد', { type: 'success' });
    } catch (err) {
      showToast(err?.message || 'خطا در خروجی اکسل', { type: 'error' });
    }
    return;
  }
  if (act === 'undo') {
    const ok = await confirmDialog({
      title: 'بازیابی آخرین تغییر',
      message: 'وضعیت به قبل از آخرین تغییر بازگردانده شود؟',
      confirmLabel: 'بازیابی',
    });
    if (!ok) return;
    try {
      undoPreviousState();
      showToast('آخرین وضعیت قبلی بازیابی شد', { type: 'success' });
    } catch (err) {
      showToast(err?.message || 'نسخه قبلی موجود نیست', { type: 'error' });
    }
    return;
  }
  if (act === 'more-drawer') {
    if (ui.moreOpen) closeMoreDrawer();
    else openMoreDrawer();
    return;
  }
  if (act === 'close-more') {
    closeMoreDrawer();
  }
}

export function initShell() {
  document.addEventListener('click', (e) => {
    const bubbleTrigger = e.target.closest('#quickBubble .bubble-trigger');
    if (bubbleTrigger) {
      const root = document.getElementById('quickBubble');
      setBubbleOpen(!root?.classList.contains('is-open'));
      return;
    }

    const bubbleAct = e.target.closest('[data-bubble-act]')?.getAttribute('data-bubble-act');
    if (bubbleAct) {
      setBubbleOpen(false);
      openTxModal(bubbleAct === 'income' ? 'income' : 'expense');
      return;
    }

    if (!e.target.closest('#quickBubble')) {
      setBubbleOpen(false);
    }

    const navBtn = e.target.closest('[data-nav-id]');
    if (navBtn) {
      navigate(navBtn.getAttribute('data-nav-id'));
      closeMoreDrawer();
      return;
    }

    const actBtn = e.target.closest('[data-shell-act]');
    if (actBtn) {
      handleShellAction(actBtn.getAttribute('data-shell-act'));
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setBubbleOpen(false);
    }
  });

  document.getElementById('moreBackdrop')?.addEventListener('click', closeMoreDrawer);

  document.addEventListener('change', (e) => {
    if (e.target.id === 'sidebarMonthSelect' || e.target.id === 'topbarMonthSelect') {
      const m = e.target.value;
      mutateState((draft) => {
        ensureMonthListed(draft, m);
        draft.month = m;
      }, { recordPrevious: false });
    }
  });

  const importInput = document.getElementById('importFile');
  importInput?.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const { state: nextState, appearance, customFont, legacyLight } = normalizeBackupPayload(parsed);

      const ok = await confirmDialog({
        title: 'ورود فایل پشتیبان',
        message: 'تمام اطلاعات فعلی با فایل پشتیبان انتخاب‌شده جایگزین شود؟',
        confirmLabel: 'جایگزینی اطلاعات',
        danger: true,
      });
      if (!ok) return;

      replaceState(nextState);

      if (appearance) {
        setAppearance(appearance);
      } else if (legacyLight) {
        setAppearance({ theme: 'paper', colors: {} });
      }

      if (customFont && /^data:[^,]*;base64,[A-Za-z0-9+/=]+$/.test(customFont)) {
        try {
          await loadCustomFontFace(customFont);
          await saveCustomFontAsset(customFont, 'فونت پشتیبان');
        } catch {
          showToast('فونت سفارشی فایل پشتیبان بارگذاری نشد', { type: 'warning' });
        }
      }

      showToast('پشتیبان با موفقیت بازیابی شد', { type: 'success' });
    } catch (err) {
      showToast(err?.message || 'ورود فایل پشتیبان ناموفق بود', { type: 'error' });
    }
  });
}
