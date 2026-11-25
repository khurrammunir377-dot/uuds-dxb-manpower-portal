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

export function getAuthToken() {
  try {
    return sessionStorage.getItem('uuds_token') || localStorage.getItem('uuds_token') || '';
  } catch {
    return '';
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      sessionStorage.setItem('uuds_token', token);
      localStorage.setItem('uuds_token', token);
    } else {
      sessionStorage.removeItem('uuds_token');
      localStorage.removeItem('uuds_token');
    }
  } catch {
    // ignore storage exceptions
  }
}

const apiCache = new Map();
const CACHE_TTL_MS = 60000; // 60 seconds

export function invalidateApiCache(prefix = '') {
  if (!prefix) {
    apiCache.clear();
  } else {
    for (const key of apiCache.keys()) {
      if (key.startsWith(prefix) || key.includes(prefix)) {
        apiCache.delete(key);
      }
    }
  }
}

export async function apiFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const token = getAuthToken();

  // Clear cache on mutations (POST, PATCH, DELETE, PUT)
  if (method !== 'GET') {
    apiCache.clear();
  } else if (!options.headers?.['no-cache'] && !options.noCache) {
    const cached = apiCache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && unauthorizedHandler && !url.includes('/api/auth/')) {
    unauthorizedHandler();
  }
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  if (method === 'GET' && !url.includes('/api/auth/')) {
    apiCache.set(url, { data, timestamp: Date.now() });
  }

  return data;
}
