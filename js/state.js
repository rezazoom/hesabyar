import { currentMonth, isValidMonth } from './date.js';
import {
  createDefaultState,
  isV1Payload,
  migrateV1ToV2,
  SCHEMA_VERSION,
  validateAndNormalizeV2Payload,
} from './migration.js';
import {
  loadPreviousRaw,
  loadRawV1,
  loadRawV2,
  saveRawV2,
} from './storage.js';

let state = createDefaultState();
const listeners = new Set();

export const ui = {
  tab: 'dash',
  obligationsTab: 'plans',
  moreOpen: false,
  txFilter: {
    search: '',
    type: 'all',
    category: 'all',
    accountId: 'all',
    sort: 'date-desc',
  },
  reportFilter: {
    from: currentMonth(),
    to: currentMonth(),
    type: 'all',
    status: 'all',
    accountId: 'all',
    category: 'all',
    search: '',
  },
};

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notify() {
  for (const fn of listeners) {
    fn(state, ui);
  }
}

export function ensureMonthListed(targetState, ym) {
  if (isValidMonth(ym) && !targetState.months.includes(ym)) {
    targetState.months.push(ym);
  }
}

export function initState() {
  let loaded = null;
  let migratedFromV1 = false;
  let legacyLight = false;

  const rawV2 = loadRawV2();
  if (rawV2) {
    try {
      loaded = validateAndNormalizeV2Payload(rawV2);
    } catch {
      loaded = null;
    }
  }

  if (!loaded) {
    const rawV1 = loadRawV1();
    if (rawV1 && isV1Payload(rawV1)) {
      try {
        loaded = migrateV1ToV2(rawV1);
        migratedFromV1 = true;
        legacyLight = Boolean(rawV1.light);
      } catch {
        loaded = null;
      }
    }
  }

  state = loaded || createDefaultState();
  ui.reportFilter.from = state.month;
  ui.reportFilter.to = state.month;

  if (migratedFromV1) {
    saveRawV2(state, { recordPrevious: false });
  }

  return { migratedFromV1, legacyLight };
}

export function mutateState(mutator, { recordPrevious = true, render = true } = {}) {
  const next = structuredClone(state);
  mutator(next);
  next.version = SCHEMA_VERSION;
  ensureMonthListed(next, next.month);
  state = next;
  saveRawV2(state, { recordPrevious });
  if (render) notify();
  return state;
}

export function replaceState(nextState, { recordPrevious = true } = {}) {
  state = validateAndNormalizeV2Payload(nextState);
  ui.reportFilter.from = state.month;
  ui.reportFilter.to = state.month;
  saveRawV2(state, { recordPrevious });
  notify();
  return state;
}

export function undoPreviousState() {
  const prev = loadPreviousRaw();
  if (!prev) {
    throw new Error('نسخه قبلی برای بازیابی موجود نیست');
  }
  let normalized;
  if (prev.version === SCHEMA_VERSION) {
    normalized = validateAndNormalizeV2Payload(prev);
  } else if (isV1Payload(prev)) {
    normalized = migrateV1ToV2(prev);
  } else {
    throw new Error('نسخه قبلی معتبر نیست');
  }
  state = normalized;
  saveRawV2(state, { recordPrevious: false });
  notify();
  return state;
}
