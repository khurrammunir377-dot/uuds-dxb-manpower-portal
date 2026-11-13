export const SHIFT_STYLES = {
  D: {
    label: 'Day Shift',
    bg: 'bg-emerald-500',
    softBg: 'bg-emerald-50',
    text: 'text-white',
    softText: 'text-emerald-800',
    border: 'border-emerald-600',
    pill: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  N: {
    label: 'Night Shift',
    bg: 'bg-purple-600',
    softBg: 'bg-purple-50',
    text: 'text-white',
    softText: 'text-purple-800',
    border: 'border-purple-700',
    pill: 'bg-purple-100 text-purple-800 border-purple-300',
  },
  M: {
    label: 'General (08-17)',
    bg: 'bg-amber-400',
    softBg: 'bg-amber-50',
    text: 'text-slate-950',
    softText: 'text-amber-900',
    border: 'border-amber-500',
    pill: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  T: {
    label: 'Training',
    bg: 'bg-sky-500',
    softBg: 'bg-sky-50',
    text: 'text-white',
    softText: 'text-sky-800',
    border: 'border-sky-600',
    pill: 'bg-sky-100 text-sky-800 border-sky-300',
  },
  OFF: {
    label: 'Off Day',
    bg: 'bg-rose-600',
    softBg: 'bg-rose-50',
    text: 'text-white',
    softText: 'text-rose-800',
    border: 'border-rose-700',
    pill: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  V: {
    label: 'Vacation',
    bg: 'bg-slate-400',
    softBg: 'bg-slate-100',
    text: 'text-white',
    softText: 'text-slate-700',
    border: 'border-slate-500',
    pill: 'bg-slate-200 text-slate-800 border-slate-300',
  },
  L: {
    label: 'Leave',
    bg: 'bg-orange-500',
    softBg: 'bg-orange-50',
    text: 'text-white',
    softText: 'text-orange-800',
    border: 'border-orange-600',
    pill: 'bg-orange-100 text-orange-800 border-orange-300',
  },
  SL: {
    label: 'Sick Leave',
    bg: 'bg-pink-600',
    softBg: 'bg-pink-50',
    text: 'text-white',
    softText: 'text-pink-800',
    border: 'border-pink-700',
    pill: 'bg-pink-100 text-pink-800 border-pink-300',
  },
  EM: {
    label: 'Emergency',
    bg: 'bg-red-800',
    softBg: 'bg-red-50',
    text: 'text-white',
    softText: 'text-red-900',
    border: 'border-red-900',
    pill: 'bg-red-100 text-red-900 border-red-300',
  },
};

export const SHIFT_CODES = ['D', 'N', 'M', 'T', 'OFF', 'V', 'L', 'SL', 'EM'];

let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

export async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && unauthorizedHandler && !url.includes('/api/auth/')) {
    unauthorizedHandler();
  }
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}
