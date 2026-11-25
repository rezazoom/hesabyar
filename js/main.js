import { attachMoneyInputs, fmt } from './format.js';
import { applyAutoRecurringRules } from './ledger.js';
import { getState, initState, mutateState, subscribe } from './state.js';
import { initTheme, onAppearanceChange } from './theme.js';
import { initDatePicker } from './ui/datepicker.js';
import { initModalCloseHandlers } from './ui/modal.js';
import { initShell, renderApp } from './ui/shell.js';
import { showToast } from './ui/toast.js';
import { initFontUploadHandler } from './views/appearance.js';

async function bootstrap() {
  const { migratedFromV1, legacyLight } = initState();
  await initTheme({ legacyLight });

  // Evaluate any recurring rules with autoPost enabled up to today
  const previewCount = applyAutoRecurringRules(structuredClone(getState()));
  if (previewCount > 0) {
    mutateState((draft) => {
      applyAutoRecurringRules(draft);
    }, { recordPrevious: false, render: false });
  }

  attachMoneyInputs(document);
  initModalCloseHandlers();
  initDatePicker();
  initFontUploadHandler();
  initShell();

  let pendingFrame = 0;
  subscribe(() => renderApp());
  onAppearanceChange(() => {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = requestAnimationFrame(() => renderApp());
  });

  renderApp();

  if (migratedFromV1) {
    showToast('اطلاعات نسخه PRO 3.3 با موفقیت به نسخه جدید منتقل شد', { type: 'success' });
  }
  if (previewCount > 0) {
    showToast(`${fmt(previewCount)} تراکنش دوره‌ای خودکار ثبت شد`, { type: 'info' });
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Non-fatal when running in environments that block SW
    });
  }
}

bootstrap();
