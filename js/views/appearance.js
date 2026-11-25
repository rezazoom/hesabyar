import { esc, toPersianDigits } from '../format.js';
import {
  clampRadius,
  clearCustomFont,
  getAppearance,
  hexColor,
  importCustomFontFile,
  RADIUS_PRESETS,
  resetAppearance,
  setAppearance,
  THEMES,
} from '../theme.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';

export function openAppearanceModal() {
  const dlg = document.getElementById('appearanceDlg');
  if (!dlg) return;
  renderAppearanceModal();
  if (!dlg.open) dlg.showModal();
}

export function renderAppearanceModal() {
  const container = document.getElementById('appearanceBody');
  if (!container) return;

  const app = getAppearance();
  const activeTheme = THEMES[app.theme] || THEMES.ocean;
  const radiusPct = clampRadius(app.radius ?? 100);

  container.innerHTML = `
    <small>تغییرات بلافاصله روی کل برنامه و نمودارها اعمال و مستقل از اطلاعات مالی ذخیره می‌شوند.</small>
    <div class="appearance-grid">
      ${Object.entries(THEMES)
        .map(
          ([key, vals]) => `
        <button type="button" class="theme-tile ${app.theme === key ? 'selected' : ''}" data-theme-pick="${key}">
          <b>${esc(vals[0])}</b>
          <span class="swatches">
            ${vals
              .slice(1, 5)
              .map((color) => `<i style="background:${esc(color)}"></i>`)
              .join('')}
          </span>
        </button>
      `
        )
        .join('')}
    </div>

    <div class="grid">
      <label class="field">
        <span>فونت رابط کاربری</span>
        <select id="appFontSelect">
          <option value="arad" ${app.font === 'arad' ? 'selected' : ''}>آراد ۲.۵.۱ (متغیر با اعداد فارسی · آفلاین)</option>
          <option value="system" ${app.font === 'system' ? 'selected' : ''}>فونت پیش‌فرض سیستم</option>
          <option value="custom" ${app.font === 'custom' ? 'selected' : ''}>فونت سفارشی (ذخیره در IndexedDB)</option>
        </select>
      </label>

      <label class="field">
        <span>اندازه نوشته: <b id="appSizeVal">${toPersianDigits(Number(app.size) || 14)}</b> px</span>
        <input id="appSizeRange" type="range" min="12" max="20" value="${Number(app.size) || 14}">
      </label>

      ${[
        ['accent', 'رنگ اصلی', 3],
        ['accent2', 'رنگ مکمل', 4],
        ['bg', 'پس‌زمینه', 1],
        ['surface', 'رنگ کارت‌ها', 2],
      ]
        .map(
          ([key, label, idx]) => `
        <label class="field">
          <span>${esc(label)}</span>
          <input type="color" data-color-key="${key}" value="${hexColor(app.colors?.[key], activeTheme[idx])}">
        </label>
      `
        )
        .join('')}
    </div>

    <div class="radius-control">
      <div class="row between">
        <span style="color:var(--muted);font-size:13px">گردی گوشه‌ها (Border Radius): <b id="appRadiusVal">${toPersianDigits(radiusPct)}٪</b></span>
      </div>
      <div class="radius-presets">
        ${RADIUS_PRESETS.map(
          (p) => `
          <button type="button" class="btn btn-sm ${radiusPct === p.value ? 'btn-primary' : 'btn-ghost'}" data-radius-preset="${p.value}">
            ${esc(p.label)} (${toPersianDigits(p.value)}٪)
          </button>
        `
        ).join('')}
      </div>
      <input id="appRadiusRange" type="range" min="0" max="180" step="5" value="${radiusPct}" aria-label="میزان گردی گوشه‌ها">
    </div>

    <div class="appearance-preview">
      <small>پیش‌نمایش زنده · موجودی تخمینی</small>
      <h1 class="green" style="margin:6px 0">۲۵٬۸۰۰٬۰۰۰ تومان</h1>
      <div class="row" style="margin-bottom:10px">
        <button type="button" class="btn btn-sm btn-primary" tabindex="-1">دکمه نمونه</button>
        <button type="button" class="btn btn-sm btn-ghost" tabindex="-1">دکمه ثانویه</button>
      </div>
      <div class="row">
        <span class="state paid">تسویه شده</span>
        <span class="state partial">پرداخت جزئی</span>
        <span class="state late">معوقه</span>
        <span class="state soon">در انتظار</span>
      </div>
    </div>

    <div class="actions">
      <button type="button" class="btn btn-secondary" id="uploadFontBtn">${icon('Upload', 'sm')} وارد کردن فونت دلخواه</button>
      <button type="button" class="btn btn-ghost" id="clearCustomFontBtn">حذف فونت سفارشی</button>
      <button type="button" class="btn btn-ghost" id="resetAppearanceBtn">بازنشانی ظاهر</button>
    </div>

    <small>
      فونت آراد ۲.۵.۱ از مخزن رسمی
      <a href="https://github.com/MohamadDarvishi/Arad" target="_blank" rel="noopener" style="color:inherit">محمد درویشی</a>
      به صورت متغیر و کاملاً آفلاین داخل پروژه قرار دارد. فونت‌های دلخواه بدون اشغال سهمیه <code>localStorage</code> در IndexedDB ذخیره می‌شوند.
    </small>
  `;

  container.querySelectorAll('[data-theme-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setAppearance({ theme: btn.getAttribute('data-theme-pick'), colors: {} });
      renderAppearanceModal();
    });
  });

  container.querySelector('#appFontSelect')?.addEventListener('change', (e) => {
    setAppearance({ font: e.target.value });
  });

  container.querySelector('#appSizeRange')?.addEventListener('input', (e) => {
    const size = Number(e.target.value) || 14;
    const label = container.querySelector('#appSizeVal');
    if (label) label.textContent = toPersianDigits(size);
    setAppearance({ size });
  });

  const syncRadiusButtons = (val) => {
    const label = container.querySelector('#appRadiusVal');
    if (label) label.textContent = `${toPersianDigits(val)}٪`;
    container.querySelectorAll('[data-radius-preset]').forEach((btn) => {
      const match = Number(btn.getAttribute('data-radius-preset')) === val;
      btn.classList.toggle('btn-primary', match);
      btn.classList.toggle('btn-ghost', !match);
    });
  };

  container.querySelectorAll('[data-radius-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = clampRadius(btn.getAttribute('data-radius-preset'));
      const range = container.querySelector('#appRadiusRange');
      if (range) range.value = String(val);
      syncRadiusButtons(val);
      setAppearance({ radius: val });
    });
  });

  container.querySelector('#appRadiusRange')?.addEventListener('input', (e) => {
    const val = clampRadius(e.target.value);
    syncRadiusButtons(val);
    setAppearance({ radius: val });
  });

  container.querySelectorAll('[data-color-key]').forEach((inp) => {
    inp.addEventListener('input', (e) => {
      const key = inp.getAttribute('data-color-key');
      const nextColors = { ...(getAppearance().colors || {}), [key]: e.target.value };
      setAppearance({ colors: nextColors });
    });
  });

  container.querySelector('#uploadFontBtn')?.addEventListener('click', () => {
    document.getElementById('fontUpload')?.click();
  });

  container.querySelector('#clearCustomFontBtn')?.addEventListener('click', async () => {
    await clearCustomFont();
    renderAppearanceModal();
    showToast('فونت سفارشی پاک شد', { type: 'info' });
  });

  container.querySelector('#resetAppearanceBtn')?.addEventListener('click', () => {
    resetAppearance();
    renderAppearanceModal();
    showToast('تنظیمات ظاهر بازنشانی شد', { type: 'info' });
  });
}

export function initFontUploadHandler() {
  const input = document.getElementById('fontUpload');
  if (!input) return;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const name = await importCustomFontFile(file);
      renderAppearanceModal();
      showToast(`فونت «${name}» اعمال و در IndexedDB ذخیره شد`, { type: 'success' });
    } catch (err) {
      showToast(err?.message || 'ورود فونت ناموفق بود', { type: 'error' });
    }
  });
}
