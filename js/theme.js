import {
  deleteCustomFontAsset,
  loadAppearanceRaw,
  migrateLegacyFontFromLocalStorage,
  saveAppearanceRaw,
  saveCustomFontAsset,
} from './storage.js';

export const THEMES = {
  ocean: ['اقیانوس', '#0b1220', '#141f31', '#0e937e', '#5179c4', false],
  forest: ['جنگل زمردی', '#101c18', '#192b23', '#258c62', '#a18a48', false],
  violet: ['کهکشان', '#171322', '#251e36', '#9162d8', '#536cd8', false],
  midnight: ['نیمه‌شب', '#090b10', '#191c24', '#6479aa', '#a783cd', false],
  rose: ['رز و مس', '#24171c', '#322129', '#bd657e', '#c69054', false],
  paper: ['کاغذ روشن', '#edf2f7', '#ffffff', '#087e70', '#4169b1', true],
  sand: ['شن ساحلی', '#f5efe4', '#fffaf3', '#94652e', '#567d73', true],
  ice: ['آبی یخی', '#eaf3fa', '#ffffff', '#276bb0', '#537aa1', true],
};

export const FONT_STACKS = {
  arad: "'HesabArad', Tahoma, Arial, sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif",
  custom: "'HesabCustom', 'HesabArad', Tahoma, sans-serif",
};

let appearance = {
  theme: 'ocean',
  font: 'arad',
  size: 14,
  colors: {},
};

const appearanceListeners = new Set();

export function getAppearance() {
  return appearance;
}

export function onAppearanceChange(fn) {
  appearanceListeners.add(fn);
  return () => appearanceListeners.delete(fn);
}

export function hexColor(v, fallback) {
  return /^#[0-9a-f]{6}$/i.test(v || '') ? v : fallback;
}

export function contrastColor(hex) {
  const parts = hex.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255);
  const lin = parts.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2] > 0.179 ? '#101820' : '#ffffff';
}

export function applyAppearance() {
  const t = THEMES[appearance.theme] || THEMES.ocean;
  const c = appearance.colors || {};
  const isLight = t[5];
  const bg = hexColor(c.bg, t[1]);
  const surface = hexColor(c.surface, t[2]);
  const accent = hexColor(c.accent, t[3]);
  const accent2 = hexColor(c.accent2, t[4]);
  const size = Math.max(12, Math.min(20, Number(appearance.size) || 14));

  document.body.classList.toggle('light', isLight);

  const vars = {
    bg,
    surface,
    'surface-alt': surface,
    accent,
    accent2,
    fg: isLight ? '#182438' : '#e5edf8',
    muted: isLight ? '#52647a' : '#a9bad0',
    border: isLight ? '#d6deea' : '#324259',
    good: isLight ? '#087b58' : '#4ee0ad',
    bad: isLight ? '#b72237' : '#ff858e',
    warn: isLight ? '#956000' : '#ffc875',
    info: isLight ? '#2458a8' : '#78b4ff',
    'accent-text': contrastColor(accent),
    'ui-font': FONT_STACKS[appearance.font] || FONT_STACKS.arad,
    'ui-size': `${size}px`,
  };

  for (const [k, v] of Object.entries(vars)) {
    document.documentElement.style.setProperty(`--${k}`, v);
  }

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', bg);

  for (const fn of appearanceListeners) fn(appearance);
}

export function setAppearance(patch, { persist = true } = {}) {
  appearance = { ...appearance, ...patch };
  if (!Object.hasOwn(FONT_STACKS, appearance.font)) appearance.font = 'arad';
  if (persist) {
    try {
      saveAppearanceRaw(appearance);
    } catch {
      // Ignore quota issue for appearance prefs
    }
  }
  applyAppearance();
}

export function toggleLightDark() {
  const isLight = (THEMES[appearance.theme] || THEMES.ocean)[5];
  setAppearance({ theme: isLight ? 'ocean' : 'paper', colors: {} });
}

export function resetAppearance() {
  setAppearance({ theme: 'ocean', font: 'arad', size: 14, colors: {} });
}

export async function loadCustomFontFace(dataUrl) {
  const font = new FontFace('HesabCustom', `url("${dataUrl}")`);
  await font.load();
  for (const old of document.fonts) {
    if (old.family === 'HesabCustom') document.fonts.delete(old);
  }
  document.fonts.add(font);
  return font;
}

export async function importCustomFontFile(file) {
  if (!file) return null;
  if (!/\.(woff2?|ttf|otf)$/i.test(file.name) || file.size > 4_000_000) {
    throw new Error('فایل فونت معتبر (WOFF/WOFF2/TTF/OTF) با حجم حداکثر ۴ مگابایت انتخاب کنید');
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('خواندن فایل فونت ناموفق بود'));
    reader.readAsDataURL(file);
  });
  await loadCustomFontFace(dataUrl);
  await saveCustomFontAsset(dataUrl, file.name);
  setAppearance({ font: 'custom' });
  return file.name;
}

export async function clearCustomFont() {
  await deleteCustomFontAsset();
  if (appearance.font === 'custom') {
    setAppearance({ font: 'arad' });
  }
}

export async function initTheme({ legacyLight = false } = {}) {
  const saved = loadAppearanceRaw();
  if (saved && typeof saved === 'object') {
    appearance = { ...appearance, ...saved };
  } else if (legacyLight) {
    appearance.theme = 'paper';
  }
  if (!Object.hasOwn(FONT_STACKS, appearance.font)) {
    appearance.font = 'arad';
  }
  applyAppearance();

  const fontAsset = await migrateLegacyFontFromLocalStorage();
  if (fontAsset?.dataUrl) {
    try {
      await loadCustomFontFace(fontAsset.dataUrl);
      applyAppearance();
    } catch {
      if (appearance.font === 'custom') setAppearance({ font: 'arad' });
    }
  }
}
