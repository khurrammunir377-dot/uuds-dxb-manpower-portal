import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { db, hashPassword, initSchema, listBackups, recordAudit, runDailyBackup, runTx, seedIfEmpty, verifyPassword } from './db.js';
import { generatePayrollExcelBuffer, generatePayrollPdfBuffer, generateRosterExcelBuffer, generateRosterPdfBuffer } from './export_roster.js';
import { parsePdfBuffer, parseSpreadsheetBuffer } from './roster_import.js';
import {
  PRESET_PATTERNS,
  WORKING_SHIFTS,
  bumpRevision,
  detectRotationPattern,
  evaluateFatigueGuardrails,
  evaluateTurnaroundSafety,
  formatMonthLabel,
  generateShiftsFromPattern,
  getDayOfWeek,
  getDaysInMonth,
  getPrevMonth,
  parseShiftHours,
} from './rotation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../dist');

initSchema();
seedIfEmpty();
if (!process.env.VERCEL) {
  try {
    runDailyBackup({ force: false });
  } catch (err) {
    console.error('Startup backup warning:', err.message);
  }
  setInterval(() => {
    try {
      runDailyBackup({ force: false });
    } catch (err) {
      console.error('Scheduled backup warning:', err.message);
    }
  }, 24 * 60 * 60 * 1000).unref();
}

const app = express();
app.use(express.json({ limit: '10mb' }));

function parseCookies(cookieHeader = '') {
  const out = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return out;
}

const SESSION_SECRET = process.env.SESSION_SECRET || 'uuds-dxb-jwt-auth-secret-key-2026-portal';

function signToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(tokenStr) {
  if (!tokenStr || typeof tokenStr !== 'string') return null;
  const parts = tokenStr.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function getSessionUser(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const token = bearer || cookies.uuds_session || '';
  if (!token) return null;

  // 1. Check stateless signed token (works across all serverless lambda containers)
  const payload = verifyToken(token);
  if (payload && payload.userId) {
    return {
      userId: payload.userId,
      displayName: payload.displayName || payload.userId,
      role: payload.role || 'ADMIN',
      teamId: payload.teamId || '',
      token,
    };
  }

  // 2. Fallback to DB sessions table
  try {
    const row = db.prepare(`
      SELECT s.token, s.expires_at, u.user_id, u.display_name, u.role, u.team_id
      FROM sessions s
      JOIN users u ON u.user_id = s.user_id
      WHERE s.token = ?
    `).get(token);

    if (row && new Date(row.expires_at).getTime() >= Date.now()) {
      return {
        userId: row.user_id,
        displayName: row.display_name,
        role: row.role,
        teamId: row.team_id || '',
        token: row.token,
      };
    }
  } catch (err) {
    // Ignore DB session error
  }

  return null;
}

function canEditTeam(user, teamId) {
  if (!user) return false;
  if (user.role === 'ADMIN' || !user.teamId) return true;
  return user.teamId === teamId;
}

function getTeamStatusRow(month, teamId) {
  let row = db.prepare('SELECT * FROM roster_team_status WHERE month = ? AND team_id = ?').get(month, teamId);
  if (!row) {
    db.prepare(`
      INSERT OR IGNORE INTO roster_team_status (month, team_id, status, revision, updated_by)
      VALUES (?, ?, 'PUBLISHED', 'R00', 'System')
    `).run(month, teamId);
    row = db.prepare('SELECT * FROM roster_team_status WHERE month = ? AND team_id = ?').get(month, teamId);
  }
  return row;
}

function autoBumpPublishedRevision(month, teamId, actor = 'Workshop Manager') {
  const row = getTeamStatusRow(month, teamId);
  if (row && row.status === 'PUBLISHED') {
    const nextRev = bumpRevision(row.revision);
    db.prepare(`
      UPDATE roster_team_status
      SET revision = ?, updated_by = ?, updated_at = datetime('now')
      WHERE month = ? AND team_id = ?
    `).run(nextRev, actor, month, teamId);
    return nextRev;
  }
  return row?.revision || 'R00';
}

function getEmployeeShiftMap(month, employeeId) {
  const rows = db.prepare('SELECT day, shift_code FROM roster_entries WHERE month = ? AND employee_id = ?').all(month, employeeId);
  const map = {};
  for (const r of rows) map[r.day] = r.shift_code;
  return map;
}

// Auth Endpoints
app.get('/api/auth/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ authenticated: false });
  res.json({
    authenticated: true,
    user: { userId: user.userId, displayName: user.displayName, role: user.role, teamId: user.teamId },
  });
});

app.post('/api/auth/login', (req, res) => {
  const { userId = '', password = '', remember = true } = req.body;
  const normalizedId = String(userId).trim().toUpperCase();
  const user = db.prepare('SELECT * FROM users WHERE UPPER(user_id) = ?').get(normalizedId);

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid User ID or Password. Please try again.' });
  }

  const maxAgeDays = remember ? 30 : 1;
  const exp = Date.now() + maxAgeDays * 86400 * 1000;
  const payload = {
    userId: user.user_id,
    displayName: user.display_name,
    role: user.role,
    teamId: user.team_id || '',
    exp,
  };
  const token = signToken(payload);

  try {
    const expiresAt = new Date(exp).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.user_id, expiresAt);
  } catch (err) {
    // Ignore DB session error
  }

  const cookieParts = [
    `uuds_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (remember) cookieParts.push(`Max-Age=${maxAgeDays * 86400}`);
  res.setHeader('Set-Cookie', cookieParts.join('; '));

  res.json({
    ok: true,
    token,
    user: { userId: user.user_id, displayName: user.display_name, role: user.role, teamId: user.team_id || '' },
  });
});

app.post('/api/auth/logout', (req, res) => {
  const user = getSessionUser(req);
  if (user?.token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(user.token);
  }
  res.setHeader('Set-Cookie', 'uuds_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

app.post('/api/auth/change-password', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  const { currentPassword = '', newPassword = '' } = req.body;
  if (String(newPassword).length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters.' });
  }
  const dbUser = db.prepare('SELECT * FROM users WHERE user_id = ?').get(user.userId);
  if (!dbUser || !verifyPassword(currentPassword, dbUser.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE user_id = ?").run(
    hashPassword(newPassword),
    user.userId
  );
  res.json({ ok: true });
});

// Protect all other /api/* routes
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  req.user = user;
  next();
});

function getTeamMap() {
  const teams = db.prepare('SELECT * FROM teams ORDER BY sort_order ASC').all();
  return Object.fromEntries(
    teams.map((t) => [
      t.id,
      {
        ...t,
        shiftTimings: JSON.parse(t.shift_timings_json || '{}'),
      },
    ])
  );
}

// 1. Metadata: months, teams, preset patterns
app.get('/api/meta', (req, res) => {
  const months = db.prepare('SELECT * FROM roster_months ORDER BY month DESC').all();
  const teams = db.prepare('SELECT * FROM teams ORDER BY sort_order ASC').all().map((t) => ({
    ...t,
    shiftTimings: JSON.parse(t.shift_timings_json || '{}'),
    staffCount: db.prepare("SELECT COUNT(*) AS cnt FROM employees WHERE team_id = ? AND status = 'ACTIVE'").get(t.id).cnt,
  }));
  res.json({ months, teams, presets: PRESET_PATTERNS });
});

// 2. Executive Command Overview for a Month + Selected Day
app.get('/api/overview', (req, res) => {
  const months = db.prepare('SELECT * FROM roster_months ORDER BY month DESC').all();
  const month = req.query.month || months[0]?.month || '2026-11';
  const monthMeta = db.prepare('SELECT * FROM roster_months WHERE month = ?').get(month);
  if (!monthMeta) return res.status(404).json({ error: `Month ${month} not found` });

  const day = Math.min(Math.max(Number(req.query.day) || 10, 1), monthMeta.days_in_month);
  const teams = db.prepare('SELECT * FROM teams ORDER BY sort_order ASC').all();
  const entries = db.prepare(`
    SELECT re.*, e.name AS emp_name, e.skill, e.uuds_no, e.contingent_no, e.status AS emp_status
    FROM roster_entries re
    JOIN employees e ON e.id = re.employee_id
    WHERE re.month = ? AND e.status = 'ACTIVE'
  `).all(month);

  const activeEmployees = db.prepare("SELECT * FROM employees WHERE status = 'ACTIVE'").all();
  const teamSummaries = teams.map((team) => {
    const teamEmps = activeEmployees.filter((e) => e.team_id === team.id);
    const dayEntries = entries.filter((e) => e.day === day && (e.deployed_team_id || e.team_id) === team.id);
    const counts = { D: 0, N: 0, M: 0, T: 0, OFF: 0, V: 0, L: 0, SL: 0, EM: 0 };
    for (const en of dayEntries) {
      counts[en.shift_code] = (counts[en.shift_code] || 0) + 1;
    }
    const onDuty = counts.D + counts.N + counts.M + counts.T;
    const onLeave = counts.V + counts.L + counts.SL + counts.EM;

    // Daily trend across entire month
    const dailyTrend = [];
    for (let d = 1; d <= monthMeta.days_in_month; d++) {
      const dEntries = entries.filter((e) => e.day === d && (e.deployed_team_id || e.team_id) === team.id);
      const working = dEntries.filter((e) => WORKING_SHIFTS.has(e.shift_code)).length;
      const dayShift = dEntries.filter((e) => e.shift_code === 'D').length;
      const nightShift = dEntries.filter((e) => e.shift_code === 'N').length;
      const midShift = dEntries.filter((e) => e.shift_code === 'M' || e.shift_code === 'T').length;
      dailyTrend.push({
        day: d,
        dow: getDayOfWeek(month, d),
        onDuty: working,
        D: dayShift,
        N: nightShift,
        M: midShift,
        belowTarget: working < team.min_daily_target,
      });
    }

    const teamStatusRow = getTeamStatusRow(month, team.id);

    return {
      id: team.id,
      name: team.name,
      category: team.category,
      totalStaff: teamEmps.length,
      minDailyTarget: team.min_daily_target,
      shiftTimings: JSON.parse(team.shift_timings_json || '{}'),
      onDuty,
      onLeave,
      counts,
      coveragePct: team.min_daily_target > 0 ? Math.round((onDuty / team.min_daily_target) * 100) : 100,
      belowTarget: onDuty < team.min_daily_target,
      dailyTrend,
      lowDaysCount: dailyTrend.filter((d) => d.belowTarget).length,
      status: teamStatusRow?.status || 'PUBLISHED',
      revision: teamStatusRow?.revision || 'R00',
    };
  });

  // Overall day breakdown
  const selectedDayEntries = entries.filter((e) => e.day === day);
  const globalCounts = { D: 0, N: 0, M: 0, T: 0, OFF: 0, V: 0, L: 0, SL: 0, EM: 0 };
  const skillMap = {};
  for (const en of selectedDayEntries) {
    globalCounts[en.shift_code] = (globalCounts[en.shift_code] || 0) + 1;
    const sk = en.skill || 'OTHER';
    if (!skillMap[sk]) skillMap[sk] = { skill: sk, total: 0, onDuty: 0, D: 0, N: 0, M: 0, OFF: 0, leave: 0 };
    skillMap[sk].total++;
    if (WORKING_SHIFTS.has(en.shift_code)) {
      skillMap[sk].onDuty++;
      if (en.shift_code === 'D') skillMap[sk].D++;
      else if (en.shift_code === 'N') skillMap[sk].N++;
      else skillMap[sk].M++;
    } else if (en.shift_code === 'OFF') {
      skillMap[sk].OFF++;
    } else {
      skillMap[sk].leave++;
    }
  }

  const totalOnDuty = globalCounts.D + globalCounts.N + globalCounts.M + globalCounts.T;
  const totalLeave = globalCounts.V + globalCounts.L + globalCounts.SL + globalCounts.EM;

  const openIncidents = db.prepare(`
    SELECT ei.*, e.name AS employee_name, e.uuds_no, e.skill, t.name AS team_name,
           rep.name AS replacement_name
    FROM emergency_incidents ei
    JOIN employees e ON e.id = ei.employee_id
    JOIN teams t ON t.id = ei.team_id
    LEFT JOIN employees rep ON rep.id = ei.replacement_employee_id
    WHERE ei.month = ?
    ORDER BY CASE WHEN ei.resolution_status = 'OPEN' THEN 0 ELSE 1 END, ei.created_at DESC
    LIMIT 25
  `).all(month);

  const recentAudit = db.prepare(`
    SELECT * FROM audit_logs
    WHERE month = ?
    ORDER BY id DESC
    LIMIT 15
  `).all(month);

  // Compliance / Document Expiry Alerts (next 3 calendar months summary + list)
  const nowMs = Date.now();
  const currentDate = new Date();
  const next3Months = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    let passCount = 0;
    let cardCount = 0;
    let visaCount = 0;
    for (const emp of activeEmployees) {
      if (emp.airside_pass_expiry && emp.airside_pass_expiry.startsWith(key)) passCount++;
      if ((emp.contingent_card_expiry || emp.medical_expiry) && (emp.contingent_card_expiry || emp.medical_expiry).startsWith(key)) cardCount++;
      if (emp.visa_expiry && emp.visa_expiry.startsWith(key)) visaCount++;
    }
    next3Months.push({
      key,
      label,
      pass: passCount,
      card: cardCount,
      visa: visaCount,
      total: passCount + cardCount + visaCount,
    });
  }

  const teamNameMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));

  const expiryAlerts = [];
  for (const emp of activeEmployees) {
    const checks = [
      { field: 'Contingent Card', dateStr: emp.contingent_card_expiry || emp.medical_expiry },
      { field: 'Visa', dateStr: emp.visa_expiry },
      { field: 'Airside Pass', dateStr: emp.airside_pass_expiry },
    ];
    for (const c of checks) {
      if (!c.dateStr) continue;
      const dt = new Date(c.dateStr);
      if (Number.isNaN(dt.getTime())) continue;
      const daysLeft = Math.ceil((dt.getTime() - nowMs) / 86400000);
      if (daysLeft <= 90) {
        expiryAlerts.push({
          employeeId: emp.id,
          name: emp.name,
          uudsNo: emp.uuds_no,
          contingentNo: emp.contingent_no,
          teamId: emp.team_id,
          teamName: teamNameMap[emp.team_id] || emp.team_id,
          documentType: c.field,
          expiryDate: c.dateStr,
          airsidePassExpiry: emp.airside_pass_expiry || '',
          contingentCardExpiry: emp.contingent_card_expiry || emp.medical_expiry || '',
          visaExpiry: emp.visa_expiry || '',
          daysLeft,
          severity: daysLeft <= 0 ? 'EXPIRED' : daysLeft <= 30 ? 'CRITICAL' : daysLeft <= 60 ? 'URGENT' : 'UPCOMING',
        });
      }
    }
  }
  expiryAlerts.sort((a, b) => a.daysLeft - b.daysLeft);

  // Coverage Alerts (below min_daily_target, excluding coordinated On-Wing stand-down days)
  const coverageAlerts = [];
  const onWingTotalsByDay = {};
  for (let d = 1; d <= monthMeta.days_in_month; d++) {
    onWingTotalsByDay[d] = ['team-a', 'team-b', 'team-c'].reduce((sum, tid) => {
      const ts = teamSummaries.find((t) => t.id === tid);
      return sum + (ts?.dailyTrend?.[d - 1]?.onDuty || 0);
    }, 0);
  }
  for (const ts of teamSummaries) {
    const minTarget = Number(ts.min_daily_target || 0);
    if (minTarget <= 0) continue;
    for (const dt of ts.dailyTrend) {
      const isCoordinatedStandDown =
        (ts.id === 'team-a' || ts.id === 'team-b') &&
        dt.onDuty === 0 &&
        onWingTotalsByDay[dt.day] >= 6;
      if (!isCoordinatedStandDown && dt.onDuty < minTarget) {
        coverageAlerts.push({
          teamId: ts.id,
          teamName: ts.name,
          day: dt.day,
          onDuty: dt.onDuty,
          minTarget,
        });
      }
    }
  }

  const teamStatuses = db.prepare('SELECT * FROM roster_team_status WHERE month = ?').all(month);

  res.json({
    month: monthMeta,
    day,
    dayOfWeek: getDayOfWeek(month, day),
    totals: {
      totalStaff: activeEmployees.length,
      onDuty: totalOnDuty,
      dayShift: globalCounts.D,
      nightShift: globalCounts.N,
      generalTraining: globalCounts.M + globalCounts.T,
      offDuty: globalCounts.OFF,
      onLeave: totalLeave,
      overtimeToday: selectedDayEntries.filter((e) => e.is_overtime === 1).length,
      emergencyToday: selectedDayEntries.filter((e) => e.is_emergency === 1).length,
      openIncidentsCount: openIncidents.filter((i) => i.resolution_status === 'OPEN').length,
      expiryAlertsCount: expiryAlerts.length,
      coverageAlertsCount: coverageAlerts.length,
    },
    teamSummaries,
    skillBreakdown: Object.values(skillMap).sort((a, b) => b.total - a.total),
    openIncidents,
    recentAudit,
    expirySummary: next3Months,
    expiryAlerts: expiryAlerts,
    coverageAlerts: coverageAlerts.slice(0, 40),
    teamStatuses,
  });
});

// 3. Master Roster Grid
app.get('/api/roster', (req, res) => {
  const month = req.query.month || '2026-11';
  const teamId = req.query.teamId || 'all';
  const monthMeta = db.prepare('SELECT * FROM roster_months WHERE month = ?').get(month);
  if (!monthMeta) return res.status(404).json({ error: `Month ${month} not found` });

  const teamMap = getTeamMap();
  let employees;
  if (teamId === 'all') {
    employees = db.prepare(`
      SELECT e.*, t.name AS team_name, t.sort_order
      FROM employees e
      JOIN teams t ON t.id = e.team_id
      WHERE e.status = 'ACTIVE'
      ORDER BY t.sort_order ASC, CAST(e.seq_no AS INTEGER) ASC, e.id ASC
    `).all();
  } else {
    employees = db.prepare(`
      SELECT e.*, t.name AS team_name, t.sort_order
      FROM employees e
      JOIN teams t ON t.id = e.team_id
      WHERE e.team_id = ? AND e.status = 'ACTIVE'
      ORDER BY CAST(e.seq_no AS INTEGER) ASC, e.id ASC
    `).all(teamId);
  }

  const entries = db.prepare(`
    SELECT * FROM roster_entries
    WHERE month = ?
  `).all(month);

  const entryByEmp = new Map();
  for (const en of entries) {
    if (!entryByEmp.has(en.employee_id)) entryByEmp.set(en.employee_id, {});
    entryByEmp.get(en.employee_id)[en.day] = en;
  }

  const daysArr = Array.from({ length: monthMeta.days_in_month }, (_, i) => ({
    day: i + 1,
    dow: getDayOfWeek(month, i + 1),
  }));

  const rows = employees.map((emp) => {
    const empEntries = entryByEmp.get(emp.id) || {};
    const teamTimings = teamMap[emp.team_id]?.shiftTimings || {};
    const shifts = [];
    const stats = { workedDays: 0, D: 0, N: 0, M: 0, T: 0, OFF: 0, V: 0, L: 0, OT: 0, hours: 0 };

    for (let d = 1; d <= monthMeta.days_in_month; d++) {
      const cell = empEntries[d];
      const code = cell?.shift_code || 'OFF';
      const isLoaned = cell?.deployed_team_id && cell.deployed_team_id !== emp.team_id;
      shifts.push({
        day: d,
        code,
        isOvertime: Boolean(cell?.is_overtime),
        isEmergency: Boolean(cell?.is_emergency),
        deployedTeamId: cell?.deployed_team_id || emp.team_id,
        deployedTeamName: isLoaned ? (teamMap[cell.deployed_team_id]?.name || cell.deployed_team_id) : null,
        notes: cell?.notes || '',
      });

      if (WORKING_SHIFTS.has(code)) {
        stats.workedDays++;
        stats[code] = (stats[code] || 0) + 1;
        stats.hours += parseShiftHours(code, teamTimings);
      } else if (code === 'OFF') {
        stats.OFF++;
      } else if (code === 'V') {
        stats.V++;
      } else {
        stats.L++;
      }
      if (cell?.is_overtime) stats.OT++;
    }

    const pattern = detectRotationPattern(shifts.map((s) => s.code));
    return {
      id: emp.id,
      seqNo: emp.seq_no,
      name: emp.name,
      uudsNo: emp.uuds_no,
      contingentNo: emp.contingent_no,
      skill: emp.skill,
      teamId: emp.team_id,
      teamName: emp.team_name,
      patternLabel: pattern.label,
      patternConfidence: pattern.confidence,
      shifts,
      stats: { ...stats, hours: Math.round(stats.hours * 10) / 10 },
    };
  });

  // Daily on-duty totals for currently filtered rows
  const dailyTotals = daysArr.map(({ day }) => {
    let onDuty = 0, D = 0, N = 0, M = 0, OFF = 0, leave = 0;
    for (const r of rows) {
      const c = r.shifts[day - 1]?.code;
      if (WORKING_SHIFTS.has(c)) {
        onDuty++;
        if (c === 'D') D++;
        else if (c === 'N') N++;
        else M++;
      } else if (c === 'OFF') OFF++;
      else leave++;
    }
    return { day, onDuty, D, N, M, OFF, leave };
  });

  const revisions = db.prepare(`
    SELECT id, team_id, revision, published_at, published_by, notes
    FROM team_revisions
    WHERE month = ? ${teamId !== 'all' ? 'AND team_id = ?' : ''}
    ORDER BY id DESC
  `).all(...(teamId !== 'all' ? [month, teamId] : [month]));

  const teamStatuses = db.prepare('SELECT * FROM roster_team_status WHERE month = ?').all(month);
  const currentTeamStatus = teamId !== 'all' ? getTeamStatusRow(month, teamId) : null;

  res.json({
    month: monthMeta,
    days: daysArr,
    team: teamId !== 'all' ? teamMap[teamId] : null,
    rows,
    dailyTotals,
    revisions,
    teamStatus: currentTeamStatus,
    teamStatuses,
  });
});

// Toggle Draft / Published status for a team & month
app.post('/api/roster/status', (req, res) => {
  const { month, teamId, status = 'PUBLISHED' } = req.body;
  if (!month || !teamId) return res.status(400).json({ error: 'month and teamId are required' });
  if (!['DRAFT', 'PUBLISHED'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const actor = req.user.displayName || 'Workshop Manager';
  if (teamId !== 'all' && !canEditTeam(req.user, teamId)) {
    return res.status(403).json({ error: `Permission denied: your account is restricted to ${req.user.teamId}` });
  }

  const targetTeams = teamId === 'all'
    ? db.prepare('SELECT id, name FROM teams').all()
    : db.prepare('SELECT id, name FROM teams WHERE id = ?').all(teamId);

  runTx(() => {
    for (const t of targetTeams) {
      const existing = getTeamStatusRow(month, t.id);
      const rev = existing?.revision || 'R00';
      db.prepare(`
        INSERT INTO roster_team_status (month, team_id, status, revision, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(month, team_id) DO UPDATE SET
          status = excluded.status,
          updated_by = excluded.updated_by,
          updated_at = datetime('now')
      `).run(month, t.id, status, rev, actor);

      recordAudit({
        month,
        teamId: t.id,
        teamName: t.name,
        actionType: status === 'PUBLISHED' ? 'ROSTER_PUBLISHED' : 'ROSTER_DRAFTED',
        reason: `Roster marked as ${status} (${rev})`,
        actor,
      });
    }
  });

  res.json({ ok: true, status });
});

// 4. Single Cell Update
app.patch('/api/roster/cell', (req, res) => {
  const { month, day, employeeId, shiftCode, isOvertime = false, deployedTeamId = null, reason = '' } = req.body;
  const actor = req.user?.displayName || req.body.actor || 'Workshop Manager';
  if (!month || !day || !employeeId || !shiftCode) {
    return res.status(400).json({ error: 'month, day, employeeId, shiftCode are required' });
  }

  const emp = db.prepare(`
    SELECT e.*, t.name AS team_name, t.shift_timings_json FROM employees e JOIN teams t ON t.id = e.team_id WHERE e.id = ?
  `).get(employeeId);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  if (!canEditTeam(req.user, emp.team_id)) {
    return res.status(403).json({ error: `Permission denied: your account is restricted to ${req.user.teamId}` });
  }

  const monthMeta = db.prepare('SELECT days_in_month FROM roster_months WHERE month = ?').get(month);
  const existing = db.prepare('SELECT * FROM roster_entries WHERE month = ? AND day = ? AND employee_id = ?').get(month, day, employeeId);
  const oldShift = existing?.shift_code || 'OFF';
  const targetTeam = deployedTeamId || emp.team_id;
  const isEm = ['SL', 'EM', 'L'].includes(shiftCode) ? 1 : 0;

  const shiftMap = getEmployeeShiftMap(month, employeeId);
  const prevShift = shiftMap[Number(day) - 1] || 'OFF';
  const nextShift = shiftMap[Number(day) + 1] || 'OFF';
  const turnaroundWarnings = evaluateTurnaroundSafety(prevShift, shiftCode, nextShift);
  const shiftTimings = JSON.parse(emp.shift_timings_json || '{}');
  const fatigue = evaluateFatigueGuardrails(shiftMap, Number(day), shiftCode, monthMeta?.days_in_month || 31, shiftTimings);
  const warnings = [...turnaroundWarnings, ...fatigue.warnings];

  let newRevision = null;
  runTx(() => {
    db.prepare(`
      INSERT INTO roster_entries (month, day, employee_id, team_id, deployed_team_id, shift_code, is_overtime, is_emergency, notes, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
      ON CONFLICT(month, day, employee_id) DO UPDATE SET
        shift_code = excluded.shift_code,
        deployed_team_id = excluded.deployed_team_id,
        is_overtime = excluded.is_overtime,
        is_emergency = excluded.is_emergency,
        notes = excluded.notes,
        updated_at = datetime('now'),
        updated_by = excluded.updated_by
    `).run(month, day, employeeId, emp.team_id, targetTeam, shiftCode, isOvertime ? 1 : 0, isEm, reason, actor);

    newRevision = autoBumpPublishedRevision(month, emp.team_id, actor);

    recordAudit({
      month,
      day,
      employeeId,
      employeeName: emp.name,
      teamId: emp.team_id,
      teamName: emp.team_name,
      actionType: isOvertime ? 'OVERTIME_COVER' : (targetTeam !== emp.team_id ? 'CROSS_TEAM_LOAN' : 'SHIFT_EDIT'),
      oldShift,
      newShift: shiftCode + (isOvertime ? ' (OT)' : ''),
      reason: reason || `Updated Day ${day} shift from ${oldShift} to ${shiftCode}`,
      actor,
    });
  });

  res.json({ ok: true, warnings, revision: newRevision });
});

// 5. Bulk Date-Range Update (Vacation, Training, Leave, Pattern block)
app.post('/api/roster/bulk', (req, res) => {
  const { month, employeeIds, startDay, endDay, shiftCode, isOvertime = false, deployedTeamId = null, reason = '', actor = 'Workshop Manager' } = req.body;
  if (!month || !Array.isArray(employeeIds) || !employeeIds.length || !startDay || !endDay || !shiftCode) {
    return res.status(400).json({ error: 'Invalid bulk update payload' });
  }
  const sDay = Math.min(Number(startDay), Number(endDay));
  const eDay = Math.max(Number(startDay), Number(endDay));

  runTx(() => {
    for (const empId of employeeIds) {
      const emp = db.prepare(`SELECT e.*, t.name AS team_name FROM employees e JOIN teams t ON t.id = e.team_id WHERE e.id = ?`).get(empId);
      if (!emp) continue;
      const targetTeam = deployedTeamId || emp.team_id;
      const isEm = ['SL', 'EM', 'L'].includes(shiftCode) ? 1 : 0;

      for (let d = sDay; d <= eDay; d++) {
        db.prepare(`
          INSERT INTO roster_entries (month, day, employee_id, team_id, deployed_team_id, shift_code, is_overtime, is_emergency, notes, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
          ON CONFLICT(month, day, employee_id) DO UPDATE SET
            shift_code = excluded.shift_code,
            deployed_team_id = excluded.deployed_team_id,
            is_overtime = excluded.is_overtime,
            is_emergency = excluded.is_emergency,
            notes = excluded.notes,
            updated_at = datetime('now'),
            updated_by = excluded.updated_by
        `).run(month, d, empId, emp.team_id, targetTeam, shiftCode, isOvertime ? 1 : 0, isEm, reason, actor);
      }

      recordAudit({
        month,
        day: sDay,
        employeeId: empId,
        employeeName: emp.name,
        teamId: emp.team_id,
        teamName: emp.team_name,
        actionType: 'BULK_RANGE_UPDATE',
        oldShift: `Days ${sDay}-${eDay}`,
        newShift: shiftCode,
        reason: reason || `Bulk applied ${shiftCode} for Days ${sDay}-${eDay}`,
        actor,
      });
    }
  });

  res.json({ ok: true, count: employeeIds.length * (eDay - sDay + 1) });
});

// 6. Shift Swap between two employees
app.post('/api/roster/swap', (req, res) => {
  const { month, startDay, endDay, employeeAId, employeeBId, reason = '' } = req.body;
  const actor = req.user?.displayName || req.body.actor || 'Workshop Manager';
  if (!month || !startDay || !employeeAId || !employeeBId || employeeAId === employeeBId) {
    return res.status(400).json({ error: 'Two different employees and startDay are required' });
  }
  const sDay = Number(startDay);
  const eDay = Number(endDay || startDay);

  const empA = db.prepare(`SELECT e.*, t.name AS team_name, t.shift_timings_json FROM employees e JOIN teams t ON t.id = e.team_id WHERE e.id = ?`).get(employeeAId);
  const empB = db.prepare(`SELECT e.*, t.name AS team_name, t.shift_timings_json FROM employees e JOIN teams t ON t.id = e.team_id WHERE e.id = ?`).get(employeeBId);
  if (!empA || !empB) return res.status(404).json({ error: 'Employee not found' });
  if (empA.team_id !== empB.team_id) {
    return res.status(400).json({ error: 'Shift swaps are restricted to staff in the same team.' });
  }
  if (!canEditTeam(req.user, empA.team_id)) {
    return res.status(403).json({ error: `Permission denied: your account is restricted to ${req.user.teamId}` });
  }

  const monthMeta = db.prepare('SELECT days_in_month FROM roster_months WHERE month = ?').get(month);
  const daysInMonth = monthMeta?.days_in_month || 31;
  const shiftTimings = JSON.parse(empA.shift_timings_json || '{}');
  const mapA = getEmployeeShiftMap(month, empA.id);
  const mapB = getEmployeeShiftMap(month, empB.id);
  const warnings = [];

  runTx(() => {
    for (let d = sDay; d <= eDay; d++) {
      const aCell = db.prepare('SELECT shift_code FROM roster_entries WHERE month = ? AND day = ? AND employee_id = ?').get(month, d, employeeAId);
      const bCell = db.prepare('SELECT shift_code FROM roster_entries WHERE month = ? AND day = ? AND employee_id = ?').get(month, d, employeeBId);
      const codeA = aCell?.shift_code || 'OFF';
      const codeB = bCell?.shift_code || 'OFF';

      const wA = evaluateFatigueGuardrails(mapA, d, codeB, daysInMonth, shiftTimings).warnings;
      const wB = evaluateFatigueGuardrails(mapB, d, codeA, daysInMonth, shiftTimings).warnings;
      if (wA.length) warnings.push(`${empA.name} Day ${d}: ${wA.join(', ')}`);
      if (wB.length) warnings.push(`${empB.name} Day ${d}: ${wB.join(', ')}`);

      db.prepare(`
        INSERT INTO roster_entries (month, day, employee_id, team_id, deployed_team_id, shift_code, notes, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
        ON CONFLICT(month, day, employee_id) DO UPDATE SET
          shift_code = excluded.shift_code, notes = excluded.notes, updated_at = datetime('now'), updated_by = excluded.updated_by
      `).run(month, d, employeeAId, empA.team_id, empA.team_id, codeB, `Swapped with ${empB.name}: ${reason}`, actor);

      db.prepare(`
        INSERT INTO roster_entries (month, day, employee_id, team_id, deployed_team_id, shift_code, notes, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
        ON CONFLICT(month, day, employee_id) DO UPDATE SET
          shift_code = excluded.shift_code, notes = excluded.notes, updated_at = datetime('now'), updated_by = excluded.updated_by
      `).run(month, d, employeeBId, empB.team_id, empB.team_id, codeA, `Swapped with ${empA.name}: ${reason}`, actor);

      recordAudit({
        month,
        day: d,
        employeeId: empA.id,
        employeeName: empA.name,
        teamId: empA.team_id,
        teamName: empA.team_name,
        actionType: 'SHIFT_SWAP',
        oldShift: codeA,
        newShift: codeB,
        replacementEmployeeId: empB.id,
        replacementEmployeeName: empB.name,
        reason: reason || `Swapped Day ${d} shift (${codeA} ↔ ${codeB}) with ${empB.name}`,
        actor,
      });
    }
    autoBumpPublishedRevision(month, empA.team_id, actor);
  });

  res.json({ ok: true, warnings });
});

// 7. Smart Replacement Finder for Emergencies / Shortages
app.get('/api/emergency/replacements', (req, res) => {
  const { month = '2026-11', day = '10', teamId, skill, targetShift = 'D', excludeEmployeeId } = req.query;
  const d = Number(day);
  const monthMeta = db.prepare('SELECT * FROM roster_months WHERE month = ?').get(month);
  if (!monthMeta) return res.status(404).json({ error: 'Month not found' });

  const candidates = db.prepare(`
    SELECT e.*, t.name AS team_name
    FROM employees e
    JOIN teams t ON t.id = e.team_id
    WHERE e.status = 'ACTIVE'
    ${excludeEmployeeId ? 'AND e.id != ?' : ''}
  `).all(...(excludeEmployeeId ? [Number(excludeEmployeeId)] : []));

  const entries = db.prepare('SELECT employee_id, day, shift_code FROM roster_entries WHERE month = ?').all(month);
  const byEmp = new Map();
  for (const en of entries) {
    if (!byEmp.has(en.employee_id)) byEmp.set(en.employee_id, {});
    byEmp.get(en.employee_id)[en.day] = en.shift_code;
  }

  const ranked = [];
  for (const emp of candidates) {
    const empDays = byEmp.get(emp.id) || {};
    const todayShift = empDays[d] || 'OFF';
    if (todayShift !== 'OFF') continue; // only people OFF that day can cover

    const prevShift = d > 1 ? (empDays[d - 1] || 'OFF') : 'OFF';
    const nextShift = d < monthMeta.days_in_month ? (empDays[d + 1] || 'OFF') : 'OFF';
    const turnaround = evaluateTurnaroundSafety(prevShift, targetShift, nextShift);
    const fatigue = evaluateFatigueGuardrails(empDays, d, targetShift, monthMeta.days_in_month);
    const warnings = [...turnaround, ...fatigue.warnings];

    let workedCount = 0;
    for (const val of Object.values(empDays)) {
      if (WORKING_SHIFTS.has(val)) workedCount++;
    }

    const sameTeam = teamId ? emp.team_id === teamId : false;
    const sameSkill = skill ? emp.skill.toUpperCase() === skill.toUpperCase() : false;

    let score = 0;
    if (sameTeam) score += 50;
    if (sameSkill) score += 35;
    if (warnings.length === 0) score += 25;
    else score -= 30;
    score += Math.max(0, 20 - workedCount); // prefer fairer workload

    ranked.push({
      id: emp.id,
      name: emp.name,
      uudsNo: emp.uuds_no,
      contingentNo: emp.contingent_no,
      skill: emp.skill,
      teamId: emp.team_id,
      teamName: emp.team_name,
      sameTeam,
      sameSkill,
      prevShift,
      todayShift,
      nextShift,
      workedThisMonth: workedCount,
      safetyWarnings: warnings,
      safeRest: warnings.length === 0,
      score,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  res.json({ candidates: ranked.slice(0, 30) });
});

// 8. Report Emergency / Absence + Optional Instant Cover
app.post('/api/emergency/report', (req, res) => {
  const {
    month,
    startDay,
    endDay,
    employeeId,
    incidentType = 'SL', // SL, EM, L, V
    reason = '',
    expectedReturnDate = '',
    replacementEmployeeId = null,
    markReplacementOvertime = true,
  } = req.body;
  const actor = req.user?.displayName || req.body.actor || 'Workshop Manager';

  if (!month || !startDay || !employeeId) {
    return res.status(400).json({ error: 'month, startDay, and employeeId are required' });
  }
  const sDay = Number(startDay);
  const eDay = Number(endDay || startDay);

  const emp = db.prepare(`SELECT e.*, t.name AS team_name FROM employees e JOIN teams t ON t.id = e.team_id WHERE e.id = ?`).get(employeeId);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  if (!canEditTeam(req.user, emp.team_id)) {
    return res.status(403).json({ error: `Permission denied: your account is restricted to ${req.user.teamId}` });
  }

  const rep = replacementEmployeeId
    ? db.prepare(`SELECT e.*, t.name AS team_name FROM employees e JOIN teams t ON t.id = e.team_id WHERE e.id = ?`).get(replacementEmployeeId)
    : null;

  const rollbackEntries = [];
  const incidentId = runTx(() => {
    for (let d = sDay; d <= eDay; d++) {
      const orig = db.prepare('SELECT shift_code, deployed_team_id, is_overtime, is_emergency, notes FROM roster_entries WHERE month = ? AND day = ? AND employee_id = ?').get(month, d, employeeId);
      const origShift = orig?.shift_code || 'D';
      rollbackEntries.push({
        employeeId: emp.id,
        teamId: emp.team_id,
        day: d,
        shiftCode: orig?.shift_code || 'OFF',
        deployedTeamId: orig?.deployed_team_id || emp.team_id,
        isOvertime: orig?.is_overtime || 0,
        isEmergency: orig?.is_emergency || 0,
        notes: orig?.notes || '',
      });

      db.prepare(`
        INSERT INTO roster_entries (month, day, employee_id, team_id, deployed_team_id, shift_code, is_emergency, notes, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), ?)
        ON CONFLICT(month, day, employee_id) DO UPDATE SET
          shift_code = excluded.shift_code, is_emergency = 1, notes = excluded.notes, updated_at = datetime('now'), updated_by = excluded.updated_by
      `).run(month, d, employeeId, emp.team_id, emp.team_id, incidentType, reason, actor);

      recordAudit({
        month,
        day: d,
        employeeId: emp.id,
        employeeName: emp.name,
        teamId: emp.team_id,
        teamName: emp.team_name,
        actionType: 'EMERGENCY_ABSENCE',
        oldShift: origShift,
        newShift: incidentType,
        replacementEmployeeId: rep?.id || null,
        replacementEmployeeName: rep?.name || '',
        reason: reason || `Emergency ${incidentType} reported`,
        actor,
      });

      if (rep) {
        const coverShift = WORKING_SHIFTS.has(origShift) ? origShift : 'D';
        const repOrig = db.prepare('SELECT shift_code, deployed_team_id, is_overtime, is_emergency, notes FROM roster_entries WHERE month = ? AND day = ? AND employee_id = ?').get(month, d, rep.id);
        rollbackEntries.push({
          employeeId: rep.id,
          teamId: rep.team_id,
          day: d,
          shiftCode: repOrig?.shift_code || 'OFF',
          deployedTeamId: repOrig?.deployed_team_id || rep.team_id,
          isOvertime: repOrig?.is_overtime || 0,
          isEmergency: repOrig?.is_emergency || 0,
          notes: repOrig?.notes || '',
        });
        db.prepare(`
          INSERT INTO roster_entries (month, day, employee_id, team_id, deployed_team_id, shift_code, is_overtime, notes, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
          ON CONFLICT(month, day, employee_id) DO UPDATE SET
            shift_code = excluded.shift_code,
            deployed_team_id = excluded.deployed_team_id,
            is_overtime = excluded.is_overtime,
            notes = excluded.notes,
            updated_at = datetime('now'),
            updated_by = excluded.updated_by
        `).run(
          month,
          d,
          rep.id,
          rep.team_id,
          emp.team_id,
          coverShift,
          markReplacementOvertime ? 1 : 0,
          `Emergency cover for ${emp.name} (${reason})`,
          actor
        );

        recordAudit({
          month,
          day: d,
          employeeId: rep.id,
          employeeName: rep.name,
          teamId: rep.team_id,
          teamName: rep.team_name,
          actionType: rep.team_id !== emp.team_id ? 'CROSS_TEAM_COVER' : 'OVERTIME_COVER',
          oldShift: repOrig?.shift_code || 'OFF',
          newShift: `${coverShift}${markReplacementOvertime ? ' (OT)' : ''}`,
          replacementEmployeeId: emp.id,
          replacementEmployeeName: emp.name,
          reason: `Covering for ${emp.name} in ${emp.team_name}`,
          actor,
        });
      }
    }

    autoBumpPublishedRevision(month, emp.team_id, actor);
    if (rep && rep.team_id !== emp.team_id) autoBumpPublishedRevision(month, rep.team_id, actor);

    const resInc = db.prepare(`
      INSERT INTO emergency_incidents (
        month, start_day, end_day, employee_id, team_id, incident_type,
        reason, expected_return_date, resolution_status, replacement_employee_id, notes, actor, resolved_at, rollback_payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      month,
      sDay,
      eDay,
      emp.id,
      emp.team_id,
      incidentType,
      reason,
      expectedReturnDate || '',
      rep ? 'RESOLVED' : 'OPEN',
      rep?.id || null,
      rep ? `Covered by ${rep.name}` : 'Awaiting replacement assignment',
      actor,
      rep ? new Date().toISOString() : null,
      JSON.stringify(rollbackEntries)
    );
    return Number(resInc.lastInsertRowid);
  });

  res.json({ ok: true, incidentId, status: rep ? 'RESOLVED' : 'OPEN' });
});

// 8b. Revert an Emergency Incident (1-click rollback)
app.post('/api/emergency/incidents/:id/revert', (req, res) => {
  const id = Number(req.params.id);
  const actor = req.user?.displayName || 'Workshop Manager';
  const inc = db.prepare('SELECT * FROM emergency_incidents WHERE id = ?').get(id);
  if (!inc) return res.status(404).json({ error: 'Incident not found' });
  if (inc.resolution_status === 'REVERTED') {
    return res.status(400).json({ error: 'Incident has already been reverted.' });
  }
  if (!canEditTeam(req.user, inc.team_id)) {
    return res.status(403).json({ error: `Permission denied: your account is restricted to ${req.user.teamId}` });
  }

  let rollbackEntries = [];
  try {
    rollbackEntries = JSON.parse(inc.rollback_payload || '[]');
  } catch {
    rollbackEntries = [];
  }

  if (rollbackEntries.length === 0) {
    return res.status(400).json({ error: 'No rollback snapshot is stored for this older incident.' });
  }

  const emp = db.prepare('SELECT e.*, t.name AS team_name FROM employees e JOIN teams t ON t.id = e.team_id WHERE e.id = ?').get(inc.employee_id);

  runTx(() => {
    for (const item of rollbackEntries) {
      db.prepare(`
        INSERT INTO roster_entries (month, day, employee_id, team_id, deployed_team_id, shift_code, is_overtime, is_emergency, notes, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
        ON CONFLICT(month, day, employee_id) DO UPDATE SET
          deployed_team_id = excluded.deployed_team_id,
          shift_code = excluded.shift_code,
          is_overtime = excluded.is_overtime,
          is_emergency = excluded.is_emergency,
          notes = excluded.notes,
          updated_at = datetime('now'),
          updated_by = excluded.updated_by
      `).run(
        inc.month,
        item.day,
        item.employeeId,
        item.teamId,
        item.deployedTeamId || item.teamId,
        item.shiftCode || 'OFF',
        item.isOvertime || 0,
        item.isEmergency || 0,
        item.notes || '',
        actor
      );
    }

    db.prepare(`
      UPDATE emergency_incidents
      SET resolution_status = 'REVERTED', notes = notes || ' | Reverted by ' || ?, resolved_at = datetime('now')
      WHERE id = ?
    `).run(actor, id);

    autoBumpPublishedRevision(inc.month, inc.team_id, actor);

    recordAudit({
      month: inc.month,
      day: inc.start_day,
      employeeId: inc.employee_id,
      employeeName: emp?.name || `Staff #${inc.employee_id}`,
      teamId: inc.team_id,
      teamName: emp?.team_name || inc.team_id,
      actionType: 'EMERGENCY_REVERTED',
      oldShift: inc.incident_type,
      newShift: 'RESTORED',
      reason: `Reverted incident #${id} (${inc.incident_type}) and restored ${rollbackEntries.length} shift entries`,
      actor,
    });
  });

  res.json({ ok: true, restoredCount: rollbackEntries.length });
});

// 9. Resolve an Open Emergency Incident by assigning replacement
app.patch('/api/emergency/incidents/:id/resolve', (req, res) => {
  const id = Number(req.params.id);
  const { replacementEmployeeId, markOvertime = true, notes = '', actor = 'Workshop Manager' } = req.body;
  const inc = db.prepare('SELECT * FROM emergency_incidents WHERE id = ?').get(id);
  if (!inc) return res.status(404).json({ error: 'Incident not found' });

  const emp = db.prepare(`SELECT e.*, t.name AS team_name FROM employees e JOIN teams t ON t.id = e.team_id WHERE e.id = ?`).get(inc.employee_id);
  const rep = replacementEmployeeId
    ? db.prepare(`SELECT e.*, t.name AS team_name FROM employees e JOIN teams t ON t.id = e.team_id WHERE e.id = ?`).get(replacementEmployeeId)
    : null;

  runTx(() => {
    if (rep) {
      for (let d = inc.start_day; d <= inc.end_day; d++) {
        const repOrig = db.prepare('SELECT shift_code FROM roster_entries WHERE month = ? AND day = ? AND employee_id = ?').get(inc.month, d, rep.id);
        db.prepare(`
          INSERT INTO roster_entries (month, day, employee_id, team_id, deployed_team_id, shift_code, is_overtime, notes, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?, 'D', ?, ?, datetime('now'), ?)
          ON CONFLICT(month, day, employee_id) DO UPDATE SET
            shift_code = excluded.shift_code,
            deployed_team_id = excluded.deployed_team_id,
            is_overtime = excluded.is_overtime,
            notes = excluded.notes,
            updated_at = datetime('now'),
            updated_by = excluded.updated_by
        `).run(inc.month, d, rep.id, rep.team_id, inc.team_id, markOvertime ? 1 : 0, `Assigned cover for ${emp.name}`, actor);

        recordAudit({
          month: inc.month,
          day: d,
          employeeId: rep.id,
          employeeName: rep.name,
          teamId: rep.team_id,
          teamName: rep.team_name,
          actionType: 'INCIDENT_RESOLVED_COVER',
          oldShift: repOrig?.shift_code || 'OFF',
          newShift: `D${markOvertime ? ' (OT)' : ''}`,
          replacementEmployeeId: emp.id,
          replacementEmployeeName: emp.name,
          reason: notes || `Resolved incident #${id} for ${emp.name}`,
          actor,
        });
      }
    }

    db.prepare(`
      UPDATE emergency_incidents
      SET resolution_status = 'RESOLVED',
          replacement_employee_id = ?,
          notes = ?,
          resolved_at = datetime('now')
      WHERE id = ?
    `).run(rep?.id || null, notes || (rep ? `Covered by ${rep.name}` : 'Marked resolved without cover'), id);
  });

  res.json({ ok: true });
});

// 10. Monthly Roster Generator (Preview or Commit, Team-Wise or All Teams)
app.post('/api/months/generate', (req, res) => {
  const {
    sourceMonth = '2026-11',
    targetMonth,
    teamIds = [], // empty array or ['all'] means all 7 teams; otherwise subset of team IDs
    commit = false,
    teamPatternOverrides = {}, // { [teamId]: ['D','D','OFF','OFF'] }
    patternOverrides = {}, // { [employeeId]: ['D','D','OFF','OFF'] }
    vacationOverrides = [], // [{ employeeId, startDay, endDay, code }]
    actor = 'Workshop Manager',
  } = req.body;

  if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) {
    return res.status(400).json({ error: 'targetMonth (YYYY-MM) is required' });
  }

  const targetDays = getDaysInMonth(targetMonth);
  const prevMonth = sourceMonth || getPrevMonth(targetMonth);
  const prevMeta = db.prepare('SELECT * FROM roster_months WHERE month = ?').get(prevMonth);
  const allTeams = db.prepare('SELECT * FROM teams ORDER BY sort_order ASC').all();
  const normalizedTeamIds = Array.isArray(teamIds)
    ? teamIds.filter((id) => id && id !== 'all')
    : (teamIds && teamIds !== 'all' ? [teamIds] : []);
  const selectedTeams = normalizedTeamIds.length > 0
    ? allTeams.filter((t) => normalizedTeamIds.includes(t.id))
    : allTeams;

  if (selectedTeams.length === 0) {
    return res.status(400).json({ error: 'No valid teams selected' });
  }
  const selectedTeamSet = new Set(selectedTeams.map((t) => t.id));

  const employees = db.prepare(`
    SELECT e.*, t.name AS team_name
    FROM employees e JOIN teams t ON t.id = e.team_id
    WHERE e.status = 'ACTIVE'
    ORDER BY t.sort_order ASC, CAST(e.seq_no AS INTEGER) ASC, e.id ASC
  `).all().filter((e) => selectedTeamSet.has(e.team_id));

  const prevEntries = prevMeta
    ? db.prepare('SELECT employee_id, day, shift_code FROM roster_entries WHERE month = ?').all(prevMonth)
    : [];
  const prevByEmp = new Map();
  for (const en of prevEntries) {
    if (!prevByEmp.has(en.employee_id)) prevByEmp.set(en.employee_id, []);
    prevByEmp.get(en.employee_id)[en.day - 1] = en.shift_code;
  }

  const vacByEmp = new Map();
  for (const vo of vacationOverrides) {
    if (!vacByEmp.has(Number(vo.employeeId))) vacByEmp.set(Number(vo.employeeId), []);
    vacByEmp.get(Number(vo.employeeId)).push(vo);
  }

  const generated = employees.map((emp) => {
    const srcShifts = prevByEmp.get(emp.id) || [];
    const empDefault = emp.default_pattern_json ? JSON.parse(emp.default_pattern_json)?.cycle : null;
    const explicitCycle = patternOverrides[emp.id] || teamPatternOverrides[emp.team_id] || null;
    const { shifts, usedCycle, detected } = generateShiftsFromPattern(
      srcShifts,
      targetDays,
      explicitCycle,
      empDefault || ['D', 'D', 'OFF', 'OFF']
    );

    // Apply pre-booked vacations / training
    const vacs = vacByEmp.get(emp.id) || [];
    for (const v of vacs) {
      for (let d = Math.max(1, Number(v.startDay)); d <= Math.min(targetDays, Number(v.endDay)); d++) {
        shifts[d - 1] = v.code || 'V';
      }
    }

    return {
      employeeId: emp.id,
      name: emp.name,
      uudsNo: emp.uuds_no,
      skill: emp.skill,
      teamId: emp.team_id,
      teamName: emp.team_name,
      sourceTail: srcShifts.slice(-4),
      detectedLabel: explicitCycle ? `Override (${usedCycle.length}d)` : detected.label,
      usedCycle,
      shifts,
    };
  });

  // Coverage preview per selected team
  const teamCoverage = selectedTeams.map((team) => {
    const teamGen = generated.filter((g) => g.teamId === team.id);
    const daily = [];
    for (let d = 1; d <= targetDays; d++) {
      const onDuty = teamGen.filter((g) => WORKING_SHIFTS.has(g.shifts[d - 1])).length;
      daily.push({ day: d, onDuty, belowTarget: onDuty < team.min_daily_target });
    }
    const minOnDuty = daily.length ? Math.min(...daily.map((x) => x.onDuty)) : 0;
    const avgOnDuty = daily.length ? Math.round((daily.reduce((s, x) => s + x.onDuty, 0) / daily.length) * 10) / 10 : 0;
    return {
      teamId: team.id,
      teamName: team.name,
      staffCount: teamGen.length,
      minDailyTarget: team.min_daily_target,
      minOnDuty,
      avgOnDuty,
      lowDays: daily.filter((x) => x.belowTarget).map((x) => x.day),
    };
  });

  if (!commit) {
    return res.json({
      preview: true,
      sourceMonth: prevMonth,
      targetMonth,
      targetLabel: formatMonthLabel(targetMonth),
      targetDays,
      selectedTeamIds: selectedTeams.map((t) => t.id),
      teamCoverage,
      sampleEmployees: generated,
      totalEmployees: generated.length,
    });
  }

  const teamScopeLabel = selectedTeams.length === allTeams.length
    ? `All ${allTeams.length} Workshop Teams`
    : selectedTeams.map((t) => t.name).join(', ');

  runTx(() => {
    db.prepare(`
      INSERT INTO roster_months (month, label, days_in_month, status, revision, updated_at)
      VALUES (?, ?, ?, 'DRAFT', 'R00', datetime('now'))
      ON CONFLICT(month) DO UPDATE SET
        days_in_month = excluded.days_in_month,
        updated_at = datetime('now')
    `).run(targetMonth, formatMonthLabel(targetMonth), targetDays);

    const upsert = db.prepare(`
      INSERT INTO roster_entries (month, day, employee_id, team_id, deployed_team_id, shift_code, is_overtime, is_emergency, notes, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'Generated from rotation pattern', datetime('now'), ?)
      ON CONFLICT(month, day, employee_id) DO UPDATE SET
        shift_code = excluded.shift_code,
        team_id = excluded.team_id,
        deployed_team_id = excluded.deployed_team_id,
        is_overtime = 0,
        is_emergency = 0,
        notes = excluded.notes,
        updated_at = datetime('now'),
        updated_by = excluded.updated_by
    `);

    for (const g of generated) {
      g.shifts.forEach((code, idx) => {
        upsert.run(targetMonth, idx + 1, g.employeeId, g.teamId, g.teamId, code, actor);
      });
    }

    for (const t of selectedTeams) {
      db.prepare(`
        INSERT INTO roster_team_status (month, team_id, status, revision, updated_by, updated_at)
        VALUES (?, ?, 'DRAFT', 'R00', ?, datetime('now'))
        ON CONFLICT(month, team_id) DO UPDATE SET
          status = 'DRAFT',
          updated_by = excluded.updated_by,
          updated_at = datetime('now')
      `).run(targetMonth, t.id, actor);
    }

    recordAudit({
      month: targetMonth,
      teamId: selectedTeams.length === 1 ? selectedTeams[0].id : '',
      actionType: 'MONTH_GENERATED',
      teamName: teamScopeLabel,
      reason: `Generated ${formatMonthLabel(targetMonth)} roster for ${teamScopeLabel} (${generated.length} staff) continuing rotation from ${prevMonth}`,
      actor,
    });
  });

  res.json({
    ok: true,
    targetMonth,
    selectedTeamIds: selectedTeams.map((t) => t.id),
    totalEmployees: generated.length,
    teamCoverage,
  });
});

// 11. Publish Revision Snapshot (R00, R01, R02...)
app.post('/api/revisions/publish', (req, res) => {
  const { month, teamId = 'all', notes = '', actor = 'Workshop Manager' } = req.body;
  if (!month) return res.status(400).json({ error: 'month is required' });

  const teams = teamId === 'all'
    ? db.prepare('SELECT * FROM teams ORDER BY sort_order ASC').all()
    : db.prepare('SELECT * FROM teams WHERE id = ?').all(teamId);

  const published = [];
  runTx(() => {
    for (const team of teams) {
      const latest = db.prepare(`
        SELECT revision FROM team_revisions WHERE month = ? AND team_id = ? ORDER BY id DESC LIMIT 1
      `).get(month, team.id);
      let nextRev = 'R00';
      if (latest?.revision) {
        const num = parseInt(latest.revision.replace(/\D/g, ''), 10);
        nextRev = `R${String((Number.isNaN(num) ? 0 : num) + 1).padStart(2, '0')}`;
      }

      const staffRows = db.prepare(`
        SELECT e.id, e.name, e.uuds_no, e.skill, re.day, re.shift_code
        FROM employees e
        LEFT JOIN roster_entries re ON re.employee_id = e.id AND re.month = ?
        WHERE e.team_id = ? AND e.status = 'ACTIVE'
        ORDER BY CAST(e.seq_no AS INTEGER) ASC, e.id ASC, re.day ASC
      `).all(month, team.id);

      db.prepare(`
        INSERT INTO team_revisions (month, team_id, revision, published_by, notes, snapshot_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(month, team.id, nextRev, actor, notes || `Published ${nextRev}`, JSON.stringify(staffRows));

      db.prepare(`
        INSERT INTO roster_team_status (month, team_id, status, revision, updated_by, updated_at)
        VALUES (?, ?, 'PUBLISHED', ?, ?, datetime('now'))
        ON CONFLICT(month, team_id) DO UPDATE SET
          status = 'PUBLISHED',
          revision = excluded.revision,
          updated_by = excluded.updated_by,
          updated_at = datetime('now')
      `).run(month, team.id, nextRev, actor);

      published.push({ teamId: team.id, teamName: team.name, revision: nextRev });
    }

    db.prepare("UPDATE roster_months SET status = 'PUBLISHED', updated_at = datetime('now') WHERE month = ?").run(month);

    recordAudit({
      month,
      teamId: teamId === 'all' ? '' : teamId,
      teamName: teamId === 'all' ? 'All Workshop Teams' : teams[0]?.name || teamId,
      actionType: 'REVISION_PUBLISHED',
      newShift: published.map((p) => `${p.teamName}:${p.revision}`).join(', '),
      reason: notes || 'Published official roster revision',
      actor,
    });
  });

  res.json({ ok: true, published });
});

// 12. Staff Directory CRUD
app.get('/api/employees', (req, res) => {
  const rows = db.prepare(`
    SELECT e.*, t.name AS team_name
    FROM employees e
    JOIN teams t ON t.id = e.team_id
    ORDER BY t.sort_order ASC, CAST(e.seq_no AS INTEGER) ASC, e.id ASC
  `).all();

  // Detect duplicate UUDS numbers
  const uudsCount = {};
  for (const r of rows) {
    if (r.uuds_no && r.status === 'ACTIVE') {
      uudsCount[r.uuds_no] = (uudsCount[r.uuds_no] || 0) + 1;
    }
  }
  const enriched = rows.map((r) => ({
    ...r,
    defaultPattern: r.default_pattern_json ? JSON.parse(r.default_pattern_json) : null,
    duplicateUuds: r.uuds_no && uudsCount[r.uuds_no] > 1,
  }));
  res.json({ employees: enriched });
});

app.post('/api/employees', (req, res) => {
  const {
    teamId,
    name,
    uudsNo = '',
    contingentNo = '',
    skill = 'TECHNICIAN',
    defaultCycle = ['D', 'D', 'OFF', 'OFF'],
    seedMonth = null,
    airsidePassExpiry = '',
    visaExpiry = '',
    medicalExpiry = '',
    contingentCardExpiry = '',
    joinDate = '',
    dxbShiftDate = '',
    mobileNo = '',
  } = req.body;
  const effectiveContingentCardExpiry = contingentCardExpiry || medicalExpiry || '';
  const actor = req.user?.displayName || req.body.actor || 'Workshop Manager';
  if (!teamId || !name) return res.status(400).json({ error: 'teamId and name are required' });
  if (!canEditTeam(req.user, teamId)) {
    return res.status(403).json({ error: `Permission denied: your account is restricted to ${req.user.teamId}` });
  }

  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const normalizedUuds = String(uudsNo || '').trim().toUpperCase();
  if (normalizedUuds) {
    const dup = db.prepare("SELECT id, name FROM employees WHERE UPPER(uuds_no) = ? AND status = 'ACTIVE'").get(normalizedUuds);
    if (dup) {
      return res.status(409).json({ error: `Duplicate UUDS ID: ${normalizedUuds} is already assigned to ${dup.name}.` });
    }
  }

  const maxSeqRow = db.prepare('SELECT MAX(CAST(seq_no AS INTEGER)) AS max_seq FROM employees WHERE team_id = ?').get(teamId);
  const nextSeq = String((maxSeqRow?.max_seq || 0) + 1);

  const empId = runTx(() => {
    const patternObj = { cycle: defaultCycle, label: `${defaultCycle.length}-Day Custom`, period: defaultCycle.length };
    const r = db.prepare(`
      INSERT INTO employees (
        team_id, seq_no, name, uuds_no, contingent_no, skill, default_pattern_json,
        status, airside_pass_expiry, visa_expiry, medical_expiry, contingent_card_expiry,
        join_date, dxb_shift_date, mobile_no
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      teamId,
      nextSeq,
      name.toUpperCase(),
      normalizedUuds,
      contingentNo.toUpperCase(),
      skill.toUpperCase(),
      JSON.stringify(patternObj),
      airsidePassExpiry || '',
      visaExpiry || '',
      effectiveContingentCardExpiry,
      effectiveContingentCardExpiry,
      joinDate || '',
      dxbShiftDate || '',
      mobileNo || ''
    );
    const newId = Number(r.lastInsertRowid);

    const months = seedMonth ? [db.prepare('SELECT * FROM roster_months WHERE month = ?').get(seedMonth)].filter(Boolean) : db.prepare('SELECT * FROM roster_months').all();
    for (const m of months) {
      for (let d = 1; d <= m.days_in_month; d++) {
        const code = defaultCycle[(d - 1) % defaultCycle.length] || 'OFF';
        db.prepare(`
          INSERT OR IGNORE INTO roster_entries (month, day, employee_id, team_id, deployed_team_id, shift_code, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(m.month, d, newId, teamId, teamId, code, actor);
      }
    }

    recordAudit({
      month: months[0]?.month || '2026-11',
      employeeId: newId,
      employeeName: name.toUpperCase(),
      teamId,
      teamName: team.name,
      actionType: 'STAFF_ADDED',
      reason: `Added new ${skill.toUpperCase()} (${normalizedUuds || 'No UUDS'}) to ${team.name}`,
      actor,
    });
    return newId;
  });

  res.json({ ok: true, id: empId });
});

app.patch('/api/employees/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Employee not found' });
  if (!canEditTeam(req.user, existing.team_id)) {
    return res.status(403).json({ error: `Permission denied: your account is restricted to ${req.user.teamId}` });
  }

  const {
    teamId = existing.team_id,
    name = existing.name,
    uudsNo = existing.uuds_no,
    contingentNo = existing.contingent_no,
    skill = existing.skill,
    status = existing.status,
    airsidePassExpiry = existing.airside_pass_expiry || '',
    visaExpiry = existing.visa_expiry || '',
    medicalExpiry = existing.medical_expiry || '',
    contingentCardExpiry = existing.contingent_card_expiry || existing.medical_expiry || '',
    joinDate = existing.join_date || '',
    dxbShiftDate = existing.dxb_shift_date || '',
    mobileNo = existing.mobile_no || '',
    defaultCycle,
  } = req.body;
  const effectiveContingentCardExpiry = req.body.contingentCardExpiry !== undefined
    ? req.body.contingentCardExpiry
    : (req.body.medicalExpiry !== undefined ? req.body.medicalExpiry : contingentCardExpiry);
  const actor = req.user?.displayName || req.body.actor || 'Workshop Manager';
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);

  const normalizedUuds = String(uudsNo || '').trim().toUpperCase();
  if (normalizedUuds && status === 'ACTIVE') {
    const dup = db.prepare("SELECT id, name FROM employees WHERE UPPER(uuds_no) = ? AND status = 'ACTIVE' AND id != ?").get(normalizedUuds, id);
    if (dup) {
      return res.status(409).json({ error: `Duplicate UUDS ID: ${normalizedUuds} is already assigned to ${dup.name}.` });
    }
  }

  runTx(() => {
    const patJson = defaultCycle ? JSON.stringify({ cycle: defaultCycle, label: `${defaultCycle.length}-Day Pattern`, period: defaultCycle.length }) : existing.default_pattern_json;
    db.prepare(`
      UPDATE employees
      SET team_id = ?, name = ?, uuds_no = ?, contingent_no = ?, skill = ?, status = ?,
          airside_pass_expiry = ?, visa_expiry = ?, medical_expiry = ?, contingent_card_expiry = ?,
          join_date = ?, dxb_shift_date = ?, mobile_no = ?,
          default_pattern_json = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      teamId,
      name.toUpperCase(),
      normalizedUuds,
      contingentNo.toUpperCase(),
      skill.toUpperCase(),
      status,
      airsidePassExpiry || '',
      visaExpiry || '',
      effectiveContingentCardExpiry || '',
      effectiveContingentCardExpiry || '',
      joinDate || '',
      dxbShiftDate || '',
      mobileNo || '',
      patJson,
      id
    );

    if (teamId !== existing.team_id) {
      db.prepare('UPDATE roster_entries SET team_id = ?, deployed_team_id = ? WHERE employee_id = ?').run(teamId, teamId, id);
    }

    recordAudit({
      month: '2026-11',
      employeeId: id,
      employeeName: name.toUpperCase(),
      teamId,
      teamName: team?.name || teamId,
      actionType: teamId !== existing.team_id ? 'STAFF_TRANSFERRED' : 'STAFF_UPDATED',
      reason: teamId !== existing.team_id ? `Transferred from ${existing.team_id} to ${team?.name}` : `Updated profile / status (${status})`,
      actor,
    });
  });

  res.json({ ok: true });
});

app.patch('/api/teams/:id/settings', (req, res) => {
  const teamId = req.params.id;
  if (!canEditTeam(req.user, teamId)) {
    return res.status(403).json({ error: `Permission denied: your account is restricted to ${req.user.teamId}` });
  }
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const {
    supervisorPhone = team.supervisor_phone || '',
    whatsappGroupLabel = team.whatsapp_group_label || '',
    minDailyTarget = team.min_daily_target,
  } = req.body;

  db.prepare(`
    UPDATE teams
    SET supervisor_phone = ?, whatsapp_group_label = ?, min_daily_target = ?
    WHERE id = ?
  `).run(String(supervisorPhone).trim(), String(whatsappGroupLabel).trim(), Math.max(0, Number(minDailyTarget) || 0), teamId);

  res.json({ ok: true });
});

// 13. Full Records: Audit Log + Monthly Hours & Attendance Summary
app.get('/api/records/audit', (req, res) => {
  const { month, teamId, actionType, search = '', limit = '200' } = req.query;
  const clauses = [];
  const params = [];
  if (month && month !== 'all') { clauses.push('month = ?'); params.push(month); }
  if (teamId && teamId !== 'all') { clauses.push('team_id = ?'); params.push(teamId); }
  if (actionType && actionType !== 'all') { clauses.push('action_type = ?'); params.push(actionType); }
  if (search.trim()) {
    clauses.push('(employee_name LIKE ? OR reason LIKE ? OR replacement_employee_name LIKE ?)');
    const q = `%${search.trim()}%`;
    params.push(q, q, q);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const logs = db.prepare(`SELECT * FROM audit_logs ${where} ORDER BY id DESC LIMIT ?`).all(...params, Number(limit));
  res.json({ logs });
});

app.get('/api/records/summary', (req, res) => {
  const month = req.query.month || '2026-11';
  const teamMap = getTeamMap();
  const employees = db.prepare(`
    SELECT e.*, t.name AS team_name
    FROM employees e JOIN teams t ON t.id = e.team_id
    WHERE e.status = 'ACTIVE'
    ORDER BY t.sort_order ASC, CAST(e.seq_no AS INTEGER) ASC
  `).all();
  const entries = db.prepare('SELECT * FROM roster_entries WHERE month = ?').all(month);

  const byEmp = new Map();
  for (const en of entries) {
    if (!byEmp.has(en.employee_id)) byEmp.set(en.employee_id, []);
    byEmp.get(en.employee_id).push(en);
  }

  const summary = employees.map((emp) => {
    const list = byEmp.get(emp.id) || [];
    const timings = teamMap[emp.team_id]?.shiftTimings || {};
    let workedDays = 0, D = 0, N = 0, M = 0, T = 0, OFF = 0, V = 0, L = 0, OT = 0, emergencyDays = 0, hours = 0;
    for (const en of list) {
      const c = en.shift_code;
      if (WORKING_SHIFTS.has(c)) {
        workedDays++;
        if (c === 'D') D++;
        else if (c === 'N') N++;
        else if (c === 'M') M++;
        else if (c === 'T') T++;
        hours += parseShiftHours(c, timings);
      } else if (c === 'OFF') OFF++;
      else if (c === 'V') V++;
      else L++;
      if (en.is_overtime) OT++;
      if (en.is_emergency) emergencyDays++;
    }
    return {
      id: emp.id,
      name: emp.name,
      uudsNo: emp.uuds_no,
      contingentNo: emp.contingent_no,
      skill: emp.skill,
      teamId: emp.team_id,
      teamName: emp.team_name,
      workedDays,
      D,
      N,
      M,
      T,
      OFF,
      V,
      L,
      OT,
      emergencyDays,
      hours: Math.round(hours * 10) / 10,
    };
  });

  const revisions = db.prepare(`
    SELECT tr.*, t.name AS team_name
    FROM team_revisions tr
    LEFT JOIN teams t ON t.id = tr.team_id
    WHERE tr.month = ?
    ORDER BY tr.id DESC
  `).all(month);

  res.json({ month, summary, revisions });
});

// 14. CSV Export (Roster Grid or Audit Log)
app.get('/api/export/csv', (req, res) => {
  const { month = '2026-11', teamId = 'all', type = 'roster' } = req.query;
  if (type === 'audit') {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC').all();
    const header = 'ID,Timestamp,Month,Day,Team,Employee,Action,Old Shift,New Shift,Replacement,Reason,Actor\n';
    const body = logs.map((l) => [
      l.id, l.created_at, l.month, l.day || '', `"${(l.team_name || '').replace(/"/g, '""')}"`,
      `"${(l.employee_name || '').replace(/"/g, '""')}"`, l.action_type, l.old_shift, l.new_shift,
      `"${(l.replacement_employee_name || '').replace(/"/g, '""')}"`,
      `"${(l.reason || '').replace(/"/g, '""')}"`, l.actor,
    ].join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="UUDS_Audit_Log_${month}.csv"`);
    return res.send(header + body);
  }

  const monthMeta = db.prepare('SELECT * FROM roster_months WHERE month = ?').get(month);
  if (!monthMeta) return res.status(404).send('Month not found');

  const employees = db.prepare(`
    SELECT e.*, t.name AS team_name
    FROM employees e JOIN teams t ON t.id = e.team_id
    WHERE e.status = 'ACTIVE' ${teamId !== 'all' ? 'AND e.team_id = ?' : ''}
    ORDER BY t.sort_order ASC, CAST(e.seq_no AS INTEGER) ASC
  `).all(...(teamId !== 'all' ? [teamId] : []));

  const entries = db.prepare('SELECT employee_id, day, shift_code FROM roster_entries WHERE month = ?').all(month);
  const map = new Map();
  for (const en of entries) {
    if (!map.has(en.employee_id)) map.set(en.employee_id, {});
    map.get(en.employee_id)[en.day] = en.shift_code;
  }

  const daysHeaders = Array.from({ length: monthMeta.days_in_month }, (_, i) => i + 1).join(',');
  const header = `NO,TEAM,NAME,SKILL,UUDS NO,CONTINGENT NO,${daysHeaders}\n`;
  const lines = employees.map((emp) => {
    const eDays = map.get(emp.id) || {};
    const cells = Array.from({ length: monthMeta.days_in_month }, (_, i) => eDays[i + 1] || 'OFF').join(',');
    return `${emp.seq_no},"${emp.team_name}","${emp.name}","${emp.skill}","${emp.uuds_no}","${emp.contingent_no}",${cells}`;
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="UUDS_DXB_Roster_${month}_${teamId}.csv"`);
  res.send(header + lines.join('\n'));
});

app.get('/api/export/excel', async (req, res) => {
  try {
    const { month = '2026-11', teamId = 'all' } = req.query;
    const buf = await generateRosterExcelBuffer(db, month, teamId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="UUDS_DXB_Roster_${month}_${teamId}.xlsx"`);
    res.send(buf);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Excel export failed' });
  }
});

app.get('/api/export/pdf', async (req, res) => {
  try {
    const { month = '2026-11', teamId = 'all' } = req.query;
    const buf = await generateRosterPdfBuffer(db, month, teamId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="UUDS_DXB_Roster_${month}_${teamId}.pdf"`);
    res.send(buf);
  } catch (err) {
    res.status(400).json({ error: err.message || 'PDF export failed' });
  }
});

app.get('/api/export/payroll-excel', async (req, res) => {
  try {
    const { month = '2026-11', teamId = 'all' } = req.query;
    const buf = await generatePayrollExcelBuffer(db, month, teamId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="UUDS_DXB_Payroll_${month}_${teamId}.xlsx"`);
    res.send(buf);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Payroll Excel export failed' });
  }
});

app.get('/api/export/payroll-pdf', async (req, res) => {
  try {
    const { month = '2026-11', teamId = 'all' } = req.query;
    const buf = await generatePayrollPdfBuffer(db, month, teamId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="UUDS_DXB_Payroll_${month}_${teamId}.pdf"`);
    res.send(buf);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Payroll PDF export failed' });
  }
});

// 14b. User & Role Management (Admin Only)
app.get('/api/users', (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  const users = db.prepare(`
    SELECT u.user_id, u.display_name, u.role, u.team_id, u.updated_at, t.name AS team_name
    FROM users u
    LEFT JOIN teams t ON t.id = u.team_id
    ORDER BY CASE WHEN u.role = 'ADMIN' THEN 0 ELSE 1 END, u.user_id ASC
  `).all();
  res.json({ users });
});

app.post('/api/users', (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  const { userId = '', displayName = '', role = 'SUPERVISOR', teamId = '', password = '' } = req.body;
  const normalizedId = String(userId).trim().toUpperCase();
  if (!normalizedId || !displayName.trim() || String(password).length < 4) {
    return res.status(400).json({ error: 'User ID, Display Name, and Password (min 4 chars) are required.' });
  }
  if (!['ADMIN', 'SUPERVISOR'].includes(role)) {
    return res.status(400).json({ error: 'Role must be ADMIN or SUPERVISOR' });
  }
  const existing = db.prepare('SELECT user_id FROM users WHERE UPPER(user_id) = ?').get(normalizedId);
  if (existing) return res.status(409).json({ error: `User ID ${normalizedId} already exists.` });

  db.prepare(`
    INSERT INTO users (user_id, display_name, role, team_id, password_hash)
    VALUES (?, ?, ?, ?, ?)
  `).run(normalizedId, displayName.trim(), role, role === 'SUPERVISOR' ? (teamId || '') : '', hashPassword(password));

  res.json({ ok: true });
});

app.delete('/api/users/:userId', (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  const targetId = String(req.params.userId).trim().toUpperCase();
  if (targetId === 'UUDS-DXB' || targetId === req.user.userId.toUpperCase()) {
    return res.status(400).json({ error: 'Cannot delete the primary or currently logged-in Admin account.' });
  }
  db.prepare('DELETE FROM sessions WHERE UPPER(user_id) = ?').run(targetId);
  db.prepare('DELETE FROM users WHERE UPPER(user_id) = ?').run(targetId);
  res.json({ ok: true });
});

app.post('/api/users/:userId/reset-password', (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  const targetId = String(req.params.userId).trim().toUpperCase();
  const { newPassword = '' } = req.body;
  if (String(newPassword).length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters.' });
  }
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE UPPER(user_id) = ?").run(
    hashPassword(newPassword),
    targetId
  );
  res.json({ ok: true });
});

// 14c. Automated Daily SQLite Backups (Admin Only)
app.get('/api/backups', (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  res.json({ backups: listBackups() });
});

app.post('/api/backups/run', (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  const result = runDailyBackup({ force: true });
  res.json({ ok: true, backup: result, backups: listBackups() });
});

// 15. Month-Wise Excel / PDF Roster Upload (Historical & Future Months)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.get('/api/import/template', (req, res) => {
  const { month = '2026-10', teamId = 'team-a' } = req.query;
  const days = getDaysInMonth(month);
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  const emps = db.prepare(`
    SELECT * FROM employees WHERE team_id = ? AND status = 'ACTIVE'
    ORDER BY CAST(seq_no AS INTEGER) ASC, id ASC
  `).all(teamId);

  const dayHeaders = Array.from({ length: days }, (_, i) => i + 1);
  const aoa = [
    [`${team?.full_name || 'UUDS TEAM'} - ROSTER - ${formatMonthLabel(month).toUpperCase()}`],
    ['NO', 'NAME', 'SKILL', 'UUDS NO', 'CONTINGENT NO', ...dayHeaders],
    ...emps.map((e, idx) => [
      e.seq_no || String(idx + 1),
      e.name,
      e.skill,
      e.uuds_no,
      e.contingent_no,
      ...dayHeaders.map(() => 'D'),
    ]),
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, team?.name || 'Roster');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="UUDS_${teamId}_${month}_Template.xlsx"`);
  res.send(buf);
});

app.post('/api/import/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Please select an Excel (.xlsx/.xls/.csv) or PDF file.' });
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    const requestedSheet = req.body.sheetName || '';

    let parsed;
    if (ext === '.pdf') {
      parsed = await parsePdfBuffer(req.file.buffer, req.file.originalname);
    } else if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      parsed = parseSpreadsheetBuffer(req.file.buffer, req.file.originalname, requestedSheet);
    } else {
      return res.status(400).json({ error: `Unsupported file type (${ext}). Upload .xlsx, .xls, .csv, or .pdf.` });
    }

    const chosenTeamId = req.body.teamId || parsed.teamId || '';
    const chosenMonth = req.body.month || parsed.month || '';

    // Match against existing employees across workshop (prioritize chosen team)
    const allEmps = db.prepare('SELECT * FROM employees').all();
    const byUuds = new Map();
    const byCont = new Map();
    const byName = new Map();
    for (const e of allEmps) {
      if (e.uuds_no) byUuds.set(e.uuds_no.replace(/\s+/g, '').toUpperCase(), e);
      if (e.contingent_no) byCont.set(e.contingent_no.replace(/\s+/g, '').toUpperCase(), e);
      byName.set(e.name.replace(/\s+/g, ' ').trim().toUpperCase(), e);
    }

    const enrichedRows = parsed.staffRows.map((row) => {
      const normUuds = (row.uudsNo || '').replace(/\s+/g, '').toUpperCase();
      const normCont = (row.contingentNo || '').replace(/\s+/g, '').toUpperCase();
      const normName = (row.name || '').replace(/\s+/g, ' ').trim().toUpperCase();
      const match =
        (normUuds && byUuds.get(normUuds)) ||
        (normCont && byCont.get(normCont)) ||
        byName.get(normName) ||
        null;

      return {
        ...row,
        matchedEmployeeId: match ? match.id : null,
        matchedTeamId: match ? match.team_id : null,
        matchStatus: match ? 'MATCHED' : 'NEW_STAFF',
      };
    });

    res.json({
      fileName: req.file.originalname,
      fileType: ext.replace('.', '').toUpperCase(),
      detectedTeamId: chosenTeamId,
      detectedMonth: chosenMonth,
      detectedRevision: parsed.revision || 'R00',
      sheetNames: parsed.sheetNames || [],
      activeSheet: parsed.activeSheet || '',
      daysDetected: parsed.daysDetected,
      matchedCount: enrichedRows.filter((r) => r.matchStatus === 'MATCHED').length,
      newCount: enrichedRows.filter((r) => r.matchStatus === 'NEW_STAFF').length,
      rows: enrichedRows,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to parse uploaded roster file' });
  }
});

app.post('/api/import/commit', (req, res) => {
  const {
    month,
    teamId,
    revision = 'R00',
    status = 'PUBLISHED',
    autoCreateMissing = true,
    notes = '',
    fileName = 'Uploaded File',
    rows = [],
  } = req.body;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Valid target month (YYYY-MM) is required.' });
  }
  if (!teamId) {
    return res.status(400).json({ error: 'Target team is required.' });
  }
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  if (!team) return res.status(404).json({ error: 'Selected team not found.' });
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No roster rows to import.' });
  }

  const daysInMonth = getDaysInMonth(month);
  const actor = req.user?.displayName || 'Workshop Manager';

  const result = runTx(() => {
    db.prepare(`
      INSERT INTO roster_months (month, label, days_in_month, status, revision, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(month) DO UPDATE SET
        days_in_month = excluded.days_in_month,
        status = excluded.status,
        revision = excluded.revision,
        updated_at = datetime('now')
    `).run(month, formatMonthLabel(month), daysInMonth, status, revision);

    const insertEmp = db.prepare(`
      INSERT INTO employees (team_id, seq_no, name, uuds_no, contingent_no, skill, status)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
    `);
    const upsertEntry = db.prepare(`
      INSERT INTO roster_entries (month, day, employee_id, team_id, deployed_team_id, shift_code, is_overtime, is_emergency, notes, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, datetime('now'), ?)
      ON CONFLICT(month, day, employee_id) DO UPDATE SET
        shift_code = excluded.shift_code,
        team_id = excluded.team_id,
        deployed_team_id = excluded.deployed_team_id,
        notes = excluded.notes,
        updated_at = datetime('now'),
        updated_by = excluded.updated_by
    `);

    let importedStaff = 0;
    let createdStaff = 0;
    const snapshotStaff = [];

    for (const r of rows) {
      let empId = r.matchedEmployeeId;
      if (!empId) {
        if (!autoCreateMissing) continue;
        const empRes = insertEmp.run(
          teamId,
          String(r.seqNo || importedStaff + 1),
          String(r.name).toUpperCase(),
          String(r.uudsNo || '').toUpperCase(),
          String(r.contingentNo || '').toUpperCase(),
          String(r.skill || 'TECHNICIAN').toUpperCase()
        );
        empId = Number(empRes.lastInsertRowid);
        createdStaff++;
      }

      const dayShifts = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const code = (r.shifts?.[d - 1] || 'OFF').toUpperCase();
        dayShifts.push(code);
        upsertEntry.run(
          month,
          d,
          empId,
          teamId,
          teamId,
          code,
          `Imported from ${fileName} (${revision})`,
          actor
        );
      }
      importedStaff++;
      snapshotStaff.push({ id: empId, name: r.name, uudsNo: r.uudsNo, skill: r.skill, shifts: dayShifts });
    }

    db.prepare(`
      INSERT INTO team_revisions (month, team_id, revision, published_by, notes, snapshot_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      month,
      teamId,
      revision,
      actor,
      notes || `Imported ${fileName} (${importedStaff} staff)`,
      JSON.stringify({ teamId, teamName: team.name, staffCount: importedStaff, staff: snapshotStaff })
    );

    recordAudit({
      month,
      teamId,
      teamName: team.name,
      actionType: 'ROSTER_IMPORTED',
      newShift: `${revision} (${importedStaff} staff)`,
      reason: notes || `Imported ${formatMonthLabel(month)} roster from ${fileName} (${createdStaff} new staff added)`,
      actor,
    });

    return { importedStaff, createdStaff };
  });

  res.json({ ok: true, month, teamId, ...result });
});

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

export default app;

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`UUDS DXB Roster API listening on http://localhost:${PORT}`);
  });
}
