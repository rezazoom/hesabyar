import { esc } from '../format.js';

export function icon(name, cls = '') {
  const def = globalThis.lucide?.icons?.[name];
  if (!Array.isArray(def)) return '';

  const children = def
    .map(([tag, attrs]) => {
      if (!/^[a-z]+$/i.test(tag) || !attrs || typeof attrs !== 'object') return '';
      const attrStr = Object.entries(attrs)
        .map(([k, v]) => `${esc(k)}="${esc(v)}"`)
        .join(' ');
      return `<${tag} ${attrStr}></${tag}>`;
    })
    .join('');

  return `<svg class="icon-svg ${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`;
}
