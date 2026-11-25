import { uid } from './format.js';

export const DEFAULT_CATEGORIES = [
  { id: 'cat_food', name: 'خوراک و سوپرمارکت', type: 'expense', color: '#4ee0ad', icon: 'Receipt' },
  { id: 'cat_transport', name: 'حمل‌ونقل', type: 'expense', color: '#60a5fa', icon: 'CreditCard' },
  { id: 'cat_housing', name: 'مسکن و قبوض', type: 'expense', color: '#f59e0b', icon: 'Landmark' },
  { id: 'cat_health', name: 'درمان و سلامت', type: 'expense', color: '#fb7185', icon: 'AlertTriangle' },
  { id: 'cat_shopping', name: 'پوشاک و خرید', type: 'expense', color: '#c084fc', icon: 'Wallet' },
  { id: 'cat_leisure', name: 'تفریح و رستوران', type: 'expense', color: '#f472b6', icon: 'PieChart' },
  { id: 'cat_edu', name: 'آموزش و کتاب', type: 'expense', color: '#38bdf8', icon: 'HelpCircle' },
  { id: 'cat_salary', name: 'حقوق و دستمزد', type: 'income', color: '#34d399', icon: 'TrendingUp' },
  { id: 'cat_bonus', name: 'پاداش و پروژه', type: 'income', color: '#2dd4bf', icon: 'Target' },
  { id: 'cat_invest', name: 'سود و سرمایه‌گذاری', type: 'income', color: '#818cf8', icon: 'Landmark' },
  { id: 'cat_other', name: 'سایر', type: 'both', color: '#94a3b8', icon: 'Receipt' },
];

export const BILL_CATEGORIES = [
  'شارژ ساختمان',
  'آب',
  'برق',
  'گاز',
  'تلفن',
  'اینترنت',
  'اجاره',
  'بیمه',
  'اشتراک',
  'سایر',
];

const PALETTE = ['#4ee0ad', '#60a5fa', '#f59e0b', '#fb7185', '#c084fc', '#38bdf8', '#a3e635', '#f97316'];

export function createDefaultCategories() {
  return DEFAULT_CATEGORIES.map((c) => ({ ...c }));
}

export function getCategoryMeta(state, name) {
  const found = (state.categories || []).find((c) => c.name === name);
  if (found) return found;
  return { id: 'cat_fallback', name: name || 'سایر', type: 'both', color: '#94a3b8', icon: 'Receipt' };
}

export function getCategoriesForType(state, type) {
  return (state.categories || []).filter((c) => c.type === 'both' || c.type === type);
}

export function ensureCategory(state, name, type = 'expense') {
  const clean = String(name ?? '').trim() || 'سایر';
  if (!Array.isArray(state.categories)) state.categories = createDefaultCategories();
  const existing = state.categories.find((c) => c.name === clean);
  if (existing) {
    if (existing.type !== type && existing.type !== 'both') {
      existing.type = 'both';
    }
    return existing;
  }
  const next = {
    id: uid(),
    name: clean,
    type,
    color: PALETTE[state.categories.length % PALETTE.length],
    icon: type === 'income' ? 'TrendingUp' : 'Receipt',
  };
  state.categories.push(next);
  return next;
}
