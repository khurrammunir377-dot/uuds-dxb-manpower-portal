export const WORKING_SHIFTS = new Set(['D', 'N', 'M', 'T']);
export const LEAVE_SHIFTS = new Set(['V', 'L', 'SL', 'EM']);

export const SHIFT_META = {
  D: { label: 'Day Shift', short: 'D', color: '#16a34a', bg: '#dcfce7', text: '#14532d', border: '#86efac', defaultHours: 12 },
  N: { label: 'Night Shift', short: 'N', color: '#9333ea', bg: '#f3e8ff', text: '#581c87', border: '#d8b4fe', defaultHours: 12 },
  M: { label: 'General / Mid', short: 'M', color: '#d97706', bg: '#fef3c7', text: '#78350f', border: '#fcd34d', defaultHours: 9 },
  T: { label: 'Training', short: 'T', color: '#0284c7', bg: '#e0f2fe', text: '#0c4a6e', border: '#7dd3fc', defaultHours: 9 },
  OFF: { label: 'Off Day', short: 'OFF', color: '#dc2626', bg: '#fee2e2', text: '#7f1d1d', border: '#fca5a5', defaultHours: 0 },
  V: { label: 'Vacation', short: 'V', color: '#475569', bg: '#e2e8f0', text: '#1e293b', border: '#cbd5e1', defaultHours: 0 },
  L: { label: 'Leave', short: 'L', color: '#ea580c', bg: '#ffedd5', text: '#7c2d12', border: '#fdba74', defaultHours: 0 },
  SL: { label: 'Sick Leave', short: 'SL', color: '#e11d48', bg: '#ffe4e6', text: '#881337', border: '#fda4af', defaultHours: 0 },
  EM: { label: 'Emergency', short: 'EM', color: '#b91c1c', bg: '#fecaca', text: '#7f1d1d', border: '#f87171', defaultHours: 0 },
};

export function getDaysInMonth(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

export function getPrevMonth(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function getNextMonth(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const d = new Date(year, month, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function getDayOfWeek(monthStr, day) {
  const [year, month] = monthStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

export function parseShiftHours(shiftCode, shiftTimings = {}) {
  if (!WORKING_SHIFTS.has(shiftCode)) return 0;
  const timingStr = shiftTimings[shiftCode];
  if (timingStr) {
    const matches = timingStr.match(/(\d{1,2}):(\d{2})/g);
    if (matches && matches.length >= 2) {
      const [h1, m1] = matches[0].split(':').map(Number);
      const [h2, m2] = matches[1].split(':').map(Number);
      let start = h1 + m1 / 60;
      let end = h2 + m2 / 60;
      // Handle 19:30 PM -> 7:00 AM or 12-hour hints
      if (timingStr.toUpperCase().includes('PM') && end < 12 && matches[1].startsWith('07') === false && h2 < 12 && end > start) {
        end += 12;
      }
      if (end <= start) end += 24;
      const diff = end - start;
      if (diff > 0 && diff <= 16) return Math.round(diff * 10) / 10;
    }
  }
  return SHIFT_META[shiftCode]?.defaultHours ?? 12;
}

export function describeCycle(cycle) {
  if (!cycle || !cycle.length) return 'Custom';
  const len = cycle.length;
  const counts = {};
  for (const s of cycle) counts[s] = (counts[s] || 0) + 1;
  if (len === 4 && counts.D === 2 && counts.OFF === 2) return '2D-2OFF (4d)';
  if (len === 7 && counts.M === 5 && counts.OFF === 2) return '5M-2OFF (Mon-Fri)';
  if (len === 8 && counts.N === 2 && counts.D === 2 && counts.OFF === 4) return '2N-2OFF-2D-2OFF (8d)';
  if (len === 7 && counts.D === 4 && counts.OFF === 3) return '3D-2OFF-1D-1OFF (7d)';
  if (len === 6 && counts.D === 3 && counts.OFF === 3) return '2D-2OFF-1D-1OFF (6d)';
  if (len === 15) return `15-Day D/N Cycle (${counts.D || 0}D/${counts.N || 0}N/${counts.OFF || 0}OFF)`;
  return `${len}-Day Cycle (${counts.D || 0}D/${counts.N || 0}N/${counts.M || 0}M/${counts.OFF || 0}OFF)`;
}

export function detectRotationPattern(shifts) {
  const validCodes = new Set(['D', 'N', 'M', 'OFF']);
  const validIndices = [];
  for (let i = 0; i < shifts.length; i++) {
    if (validCodes.has(shifts[i])) validIndices.push(i);
  }
  if (validIndices.length < 8) {
    return { period: 0, cycle: null, label: 'Vacation / Partial', confidence: 0 };
  }

  const candidatePeriods = [4, 5, 6, 7, 8, 9, 10, 12, 14, 15];
  let best = null;

  for (const p of candidatePeriods) {
    const buckets = Array.from({ length: p }, () => ({}));
    for (const idx of validIndices) {
      const s = shifts[idx];
      const mod = idx % p;
      buckets[mod][s] = (buckets[mod][s] || 0) + 1;
    }
    const cycle = buckets.map((b) => {
      const entries = Object.entries(b).sort((a, z) => z[1] - a[1]);
      return entries[0]?.[0] || 'OFF';
    });
    let matches = 0;
    for (const idx of validIndices) {
      if (shifts[idx] === cycle[idx % p]) matches++;
    }
    const confidence = matches / validIndices.length;

    if (confidence >= 0.96) {
      return {
        period: p,
        cycle,
        label: describeCycle(cycle),
        confidence: Math.round(confidence * 100),
      };
    }
    if (!best || confidence > best.confidenceRaw + 0.01) {
      best = {
        period: p,
        cycle,
        label: describeCycle(cycle),
        confidence: Math.round(confidence * 100),
        confidenceRaw: confidence,
      };
    }
  }

  if (best && best.confidenceRaw >= 0.72) {
    const { confidenceRaw, ...clean } = best;
    return clean;
  }

  return { period: 0, cycle: null, label: 'Custom / Irregular', confidence: best ? best.confidence : 0 };
}

export function generateShiftsFromPattern(sourceShifts, targetDays, customCycle = null, fallbackCycle = ['D', 'D', 'OFF', 'OFF']) {
  const detected = detectRotationPattern(sourceShifts);
  const cycle = (customCycle && customCycle.length > 0)
    ? customCycle
    : (detected.cycle || fallbackCycle);
  const p = cycle.length;
  const offset = sourceShifts.length;
  const out = [];
  for (let d = 0; d < targetDays; d++) {
    out.push(cycle[(offset + d) % p]);
  }
  return { shifts: out, usedCycle: cycle, detected };
}

export const PRESET_PATTERNS = [
  { id: '2d-2off', name: '2 Days ON / 2 Days OFF (4-day)', cycle: ['D', 'D', 'OFF', 'OFF'] },
  { id: '2off-2d', name: '2 Days OFF / 2 Days ON (4-day)', cycle: ['OFF', 'OFF', 'D', 'D'] },
  { id: 'mon-fri-m', name: 'Mon-Fri General (08:00-17:00)', cycle: ['OFF', 'M', 'M', 'M', 'M', 'M', 'OFF'] },
  { id: '2n-2off-2d-2off', name: '2 Nights / 2 OFF / 2 Days / 2 OFF (8-day)', cycle: ['N', 'N', 'OFF', 'OFF', 'D', 'D', 'OFF', 'OFF'] },
  { id: '3d-2off-1d-1off', name: '3 Days / 2 OFF / 1 Day / 1 OFF (7-day)', cycle: ['D', 'D', 'D', 'OFF', 'OFF', 'D', 'OFF'] },
  { id: '15d-dn-a', name: 'On-Wing 15-Day D/N Cycle', cycle: ['N', 'OFF', 'OFF', 'N', 'OFF', 'D', 'N', 'OFF', 'D', 'OFF', 'OFF', 'D', 'N', 'OFF', 'D'] },
  { id: '2d-2off-1d-1off', name: 'Manager 6-Day (2D-2OFF-1D-1OFF)', cycle: ['OFF', 'D', 'D', 'OFF', 'OFF', 'D'] },
];

export function evaluateTurnaroundSafety(prevShift, targetShift, nextShift) {
  const warnings = [];
  if (prevShift === 'N' && (targetShift === 'D' || targetShift === 'M')) {
    warnings.push('Night → Day turnaround (short rest)');
  }
  if (targetShift === 'N' && (nextShift === 'D' || nextShift === 'M')) {
    warnings.push('Night → Next-day Day turnaround');
  }
  return warnings;
}

export function evaluateFatigueGuardrails(dayShiftsMap, targetDay, targetShift, daysInMonth = 31, shiftTimings = {}) {
  const warnings = [];
  const simulated = { ...dayShiftsMap, [targetDay]: targetShift };

  if (WORKING_SHIFTS.has(targetShift)) {
    let streak = 1;
    for (let d = targetDay - 1; d >= 1; d--) {
      if (WORKING_SHIFTS.has(simulated[d])) streak++;
      else break;
    }
    for (let d = targetDay + 1; d <= daysInMonth; d++) {
      if (WORKING_SHIFTS.has(simulated[d])) streak++;
      else break;
    }
    if (streak >= 6) {
      warnings.push(`${streak} consecutive working days (fatigue alert)`);
    }
  }

  let totalHours = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    totalHours += parseShiftHours(simulated[d], shiftTimings);
  }
  if (totalHours >= 260) {
    warnings.push(`High monthly hours (${Math.round(totalHours * 10) / 10}h)`);
  }

  return { warnings, totalHours: Math.round(totalHours * 10) / 10 };
}

export function bumpRevision(rev = 'R00') {
  const match = String(rev || 'R00').match(/^R(\d+)$/i);
  if (!match) return 'R01';
  const next = Number(match[1]) + 1;
  return `R${String(next).padStart(2, '0')}`;
}
