export const STORAGE_KEY_V2 = 'hesabyar-v2';
export const STORAGE_KEY_V1 = 'hesabyar-v1';
export const STORAGE_KEY_PREV = 'hesabyar-previous';
export const STORAGE_KEY_APPEARANCE = 'hesabyar-appearance';
export const STORAGE_KEY_LEGACY_FONT = 'hesabyar-custom-font';

const IDB_NAME = 'hesabyar-assets';
const IDB_VERSION = 1;
const FONT_STORE = 'fonts';
const CUSTOM_FONT_KEY = 'custom-font';

export function safeJsonParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadRawV2() {
  return safeJsonParse(localStorage.getItem(STORAGE_KEY_V2));
}

export function loadRawV1() {
  return safeJsonParse(localStorage.getItem(STORAGE_KEY_V1));
}

export function loadPreviousRaw() {
  return safeJsonParse(localStorage.getItem(STORAGE_KEY_PREV));
}

export function saveRawV2(state, { recordPrevious = true } = {}) {
  const serialized = JSON.stringify(state);
  if (recordPrevious) {
    const current = localStorage.getItem(STORAGE_KEY_V2) || localStorage.getItem(STORAGE_KEY_V1);
    if (current && current !== serialized) {
      try {
        localStorage.setItem(STORAGE_KEY_PREV, current);
      } catch {
        // Do not fail primary save if snapshot storage hits quota
      }
    }
  }
  localStorage.setItem(STORAGE_KEY_V2, serialized);
}

export function loadAppearanceRaw() {
  return safeJsonParse(localStorage.getItem(STORAGE_KEY_APPEARANCE));
}

export function saveAppearanceRaw(appearance) {
  localStorage.setItem(STORAGE_KEY_APPEARANCE, JSON.stringify(appearance));
}

function openAssetsDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not supported'));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FONT_STORE)) {
        db.createObjectStore(FONT_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

export async function saveCustomFontAsset(dataUrl, name = 'custom-font') {
  const db = await openAssetsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FONT_STORE, 'readwrite');
    tx.objectStore(FONT_STORE).put({ dataUrl, name, updatedAt: Date.now() }, CUSTOM_FONT_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Failed to save font in IndexedDB'));
    };
  });
}

export async function loadCustomFontAsset() {
  try {
    const db = await openAssetsDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(FONT_STORE, 'readonly');
      const req = tx.objectStore(FONT_STORE).get(CUSTOM_FONT_KEY);
      req.onsuccess = () => {
        db.close();
        resolve(req.result || null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return null;
  }
}

export async function deleteCustomFontAsset() {
  try {
    const db = await openAssetsDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(FONT_STORE, 'readwrite');
      tx.objectStore(FONT_STORE).delete(CUSTOM_FONT_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Ignore storage cleanup errors
  }
}

export async function migrateLegacyFontFromLocalStorage() {
  const legacy = localStorage.getItem(STORAGE_KEY_LEGACY_FONT);
  if (!legacy) return loadCustomFontAsset();
  try {
    await saveCustomFontAsset(legacy, 'فونت واردشده (نسخه قبلی)');
    localStorage.removeItem(STORAGE_KEY_LEGACY_FONT);
    return { dataUrl: legacy, name: 'فونت واردشده (نسخه قبلی)' };
  } catch {
    return { dataUrl: legacy, name: 'فونت واردشده' };
  }
}
