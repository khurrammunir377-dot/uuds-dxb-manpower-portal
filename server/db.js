import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {
  detectRotationPattern,
  formatMonthLabel,
  getDaysInMonth,
} from './rotation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let DATA_DIR = path.resolve(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
  DATA_DIR = path.resolve(process.cwd(), 'data');
}
let DB_PATH = path.join(DATA_DIR, 'uuds_roster.db');
const SEED_PATH = path.join(DATA_DIR, 'november_2026_seed.json');
let BACKUP_DIR = path.join(DATA_DIR, 'backups');

if (process.env.VERCEL) {
  const tmpDir = '/tmp/uuds_data';
  const tmpBackup = '/tmp/uuds_data/backups';
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.mkdirSync(tmpBackup, { recursive: true });
    const tmpDb = path.join(tmpDir, 'uuds_roster.db');
    if (!fs.existsSync(tmpDb)) {
      if (fs.existsSync(DB_PATH)) {
        fs.copyFileSync(DB_PATH, tmpDb);
      }
    }
    DB_PATH = tmpDb;
    BACKUP_DIR = tmpBackup;
  } catch (err) {
    console.error('Failed to initialize /tmp DB on Vercel:', err);
  }
} else {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function runTx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const res = fn();
    db.exec('COMMIT');
    return res;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      full_name TEXT NOT NULL,
      category TEXT NOT NULL,
      min_daily_target INTEGER NOT NULL DEFAULT 8,
      shift_timings_json TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT NOT NULL REFERENCES teams(id),
      seq_no TEXT NOT NULL,
      name TEXT NOT NULL,
      uuds_no TEXT NOT NULL DEFAULT '',
      contingent_no TEXT NOT NULL DEFAULT '',
      skill TEXT NOT NULL DEFAULT 'TECHNICIAN',
      default_pattern_json TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS roster_months (
      month TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      days_in_month INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      revision TEXT NOT NULL DEFAULT 'R00',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS roster_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL REFERENCES roster_months(month),
      day INTEGER NOT NULL,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      team_id TEXT NOT NULL REFERENCES teams(id),
      deployed_team_id TEXT REFERENCES teams(id),
      shift_code TEXT NOT NULL,
      is_overtime INTEGER NOT NULL DEFAULT 0,
      is_emergency INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT NOT NULL DEFAULT 'Supervisor',
      UNIQUE(month, day, employee_id)
    );

    CREATE INDEX IF NOT EXISTS idx_entries_month_day ON roster_entries(month, day);
    CREATE INDEX IF NOT EXISTS idx_entries_month_team ON roster_entries(month, team_id);
    CREATE INDEX IF NOT EXISTS idx_entries_emp ON roster_entries(employee_id, month);

    CREATE TABLE IF NOT EXISTS team_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL REFERENCES roster_months(month),
      team_id TEXT NOT NULL,
      revision TEXT NOT NULL,
      published_at TEXT NOT NULL DEFAULT (datetime('now')),
      published_by TEXT NOT NULL DEFAULT 'Workshop Manager',
      notes TEXT NOT NULL DEFAULT '',
      snapshot_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      month TEXT NOT NULL,
      day INTEGER,
      employee_id INTEGER,
      employee_name TEXT NOT NULL DEFAULT '',
      team_id TEXT NOT NULL DEFAULT '',
      team_name TEXT NOT NULL DEFAULT '',
      action_type TEXT NOT NULL,
      old_shift TEXT NOT NULL DEFAULT '',
      new_shift TEXT NOT NULL DEFAULT '',
      replacement_employee_id INTEGER,
      replacement_employee_name TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL DEFAULT 'Workshop Manager'
    );

    CREATE INDEX IF NOT EXISTS idx_audit_month ON audit_logs(month, created_at DESC);

    CREATE TABLE IF NOT EXISTS emergency_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      month TEXT NOT NULL,
      start_day INTEGER NOT NULL,
      end_day INTEGER NOT NULL,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      team_id TEXT NOT NULL REFERENCES teams(id),
      incident_type TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      resolution_status TEXT NOT NULL DEFAULT 'OPEN',
      replacement_employee_id INTEGER REFERENCES employees(id),
      notes TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL DEFAULT 'Workshop Manager',
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'ADMIN',
      password_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS roster_team_status (
      month TEXT NOT NULL REFERENCES roster_months(month),
      team_id TEXT NOT NULL REFERENCES teams(id),
      status TEXT NOT NULL DEFAULT 'PUBLISHED',
      revision TEXT NOT NULL DEFAULT 'R00',
      updated_by TEXT NOT NULL DEFAULT 'Workshop Manager',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (month, team_id)
    );

    CREATE TABLE IF NOT EXISTS overtime_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL REFERENCES roster_months(month),
      day INTEGER NOT NULL,
      date_str TEXT NOT NULL,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      team_id TEXT NOT NULL REFERENCES teams(id),
      shift_code TEXT NOT NULL DEFAULT 'D',
      scheduled_start_time TEXT NOT NULL DEFAULT '08:00',
      scheduled_end_time TEXT NOT NULL DEFAULT '20:00',
      actual_end_time TEXT NOT NULL,
      total_extra_hours REAL NOT NULL,
      buffer_hours REAL NOT NULL DEFAULT 2.0,
      approved_ot_hours REAL NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      aircraft_reg TEXT NOT NULL DEFAULT '',
      work_order_no TEXT NOT NULL DEFAULT '',
      location_bay TEXT NOT NULL DEFAULT 'DXB Ramp',
      team_manager_status TEXT NOT NULL DEFAULT 'APPROVED',
      team_manager_name TEXT NOT NULL DEFAULT 'Shift Supervisor',
      remarks TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ot_month ON overtime_records(month, day);
    CREATE INDEX IF NOT EXISTS idx_ot_emp ON overtime_records(employee_id, month);
  `);

  const ensureColumn = (table, col, def) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    }
  };

  ensureColumn('teams', 'supervisor_phone', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('teams', 'whatsapp_group_label', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('employees', 'airside_pass_expiry', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('employees', 'visa_expiry', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('employees', 'medical_expiry', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('employees', 'contingent_card_expiry', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('employees', 'passport_no', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('employees', 'passport_expiry', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('employees', 'join_date', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('employees', 'dxb_shift_date', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('employees', 'mobile_no', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('emergency_incidents', 'rollback_payload', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('emergency_incidents', 'expected_return_date', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('users', 'team_id', "TEXT NOT NULL DEFAULT ''");

  // Standardized shift timings:
  // - Office staff: Daily morning 8 to 5 only (08:00 - 17:00), Sat and Sun off.
  // - A-Check: 12h duty 8 to 8 (08:00 - 20:00 / 20:00 - 08:00).
  // - Other all: 12h duty 07:30 to 19:30 (07:30 - 19:30 / 19:30 - 07:30).
  db.prepare(`
    UPDATE teams
    SET shift_timings_json = '{"M":"08:00 - 17:00","OFF":"Weekend / Off (Sat & Sun)","AL":"Annual Leave","SL":"Sick Leave","UPL":"Unpaid Leave"}'
    WHERE id IN ('office', 'planner')
  `).run();

  db.prepare(`
    UPDATE teams
    SET shift_timings_json = '{"D":"08:00 - 20:00","N":"20:00 - 08:00","M":"08:00 - 17:00","OFF":"Day Off","AL":"On Leave"}'
    WHERE id = 'a-check'
  `).run();

  db.prepare(`
    UPDATE teams
    SET shift_timings_json = '{"D":"07:30 - 19:30","N":"19:30 - 07:30","M":"08:00 - 17:00","OFF":"Day Off","V":"Vacation","AL":"On Leave"}'
    WHERE id NOT IN ('office', 'planner', 'a-check')
  `).run();

  // Ensure default admin user with uuds@123 exists
  const adminRow = db.prepare('SELECT user_id FROM users WHERE user_id = ?').get('admin');
  if (!adminRow) {
    db.prepare(`
      INSERT INTO users (user_id, display_name, role, team_id, password_hash)
      VALUES ('admin', 'System Administrator', 'ADMIN', '', ?)
    `).run(hashPassword('uuds@123'));
  } else {
    db.prepare(`
      UPDATE users SET password_hash = ? WHERE user_id = 'admin'
    `).run(hashPassword('uuds@123'));
  }

  // Also ensure UUDS-DXB exists and has uuds@123
  const uudsRow = db.prepare('SELECT user_id FROM users WHERE user_id = ?').get('UUDS-DXB');
  if (!uudsRow) {
    db.prepare(`
      INSERT INTO users (user_id, display_name, role, team_id, password_hash)
      VALUES ('UUDS-DXB', 'Workshop Manager', 'ADMIN', '', ?)
    `).run(hashPassword('uuds@123'));
  } else {
    db.prepare(`
      UPDATE users SET password_hash = ? WHERE user_id = 'UUDS-DXB'
    `).run(hashPassword('uuds@123'));
  }

  // Fix SISIDU HASITHA duplicate UUDS ID -> UUDS-1292
  db.prepare(`
    UPDATE employees
    SET uuds_no = 'UUDS-1292', updated_at = datetime('now')
    WHERE UPPER(TRIM(name)) = 'SISIDU HASITHA' AND uuds_no = 'UUDS-152'
  `).run();

  // Backfill roster_team_status for existing months/teams
  db.prepare(`
    INSERT OR IGNORE INTO roster_team_status (month, team_id, status, revision, updated_by)
    SELECT DISTINCT rm.month, t.id,
      CASE WHEN rm.status = 'PUBLISHED' THEN 'PUBLISHED' ELSE 'PUBLISHED' END,
      COALESCE(rm.revision, 'R00'),
      'System'
    FROM roster_months rm
    CROSS JOIN teams t
    WHERE EXISTS (SELECT 1 FROM roster_entries re WHERE re.month = rm.month AND re.team_id = t.id)
  `).run();

  // Ensure Stores Team exists
  const hasStores = db.prepare("SELECT COUNT(*) AS cnt FROM teams WHERE id = 'stores-team'").get().cnt;
  if (hasStores === 0 && fs.existsSync(SEED_PATH)) {
    try {
      const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'));
      const stores = seed.teams.find((t) => t.id === 'stores-team');
      if (stores) {
        runTx(() => {
          db.prepare(`
            INSERT INTO teams (id, name, full_name, category, min_daily_target, shift_timings_json, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            stores.id,
            stores.name,
            stores.fullName || stores.name.toUpperCase(),
            stores.category || 'Support',
            stores.minDailyTarget || 6,
            JSON.stringify(stores.shiftTimings || {}),
            stores.sortOrder || 3
          );
          const insertEmp = db.prepare(`
            INSERT INTO employees (team_id, seq_no, name, uuds_no, contingent_no, skill, default_pattern_json, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
          `);
          const insertEntry = db.prepare(`
            INSERT INTO roster_entries (month, day, employee_id, team_id, deployed_team_id, shift_code, updated_by)
            VALUES ('2026-11', ?, ?, 'stores-team', 'stores-team', ?, 'Initial PDF Import')
          `);
          const snapshotStaff = [];
          for (const s of stores.staff) {
            const pattern = detectRotationPattern(s.shifts);
            const empRes = insertEmp.run(
              'stores-team',
              String(s.seq),
              s.name,
              s.uudsNo || '',
              s.contingentNo || '',
              s.skill || 'STORES',
              pattern.cycle ? JSON.stringify(pattern) : null
            );
            const empId = Number(empRes.lastInsertRowid);
            s.shifts.forEach((code, idx) => {
              insertEntry.run(idx + 1, empId, code);
            });
            snapshotStaff.push({ id: empId, name: s.name, uudsNo: s.uudsNo, skill: s.skill, shifts: s.shifts });
          }
          db.prepare(`
            INSERT INTO team_revisions (month, team_id, revision, published_by, notes, snapshot_json)
            VALUES ('2026-11', 'stores-team', 'R00', 'System Import', 'Imported from STORES TEAM November 2026 PDF (R00)', ?)
          `).run(JSON.stringify({ teamId: 'stores-team', teamName: stores.name, staffCount: stores.staff.length, staff: snapshotStaff }));
          db.prepare(`
            INSERT OR IGNORE INTO roster_team_status (month, team_id, status, revision, updated_by, updated_at)
            VALUES ('2026-11', 'stores-team', 'PUBLISHED', 'R00', 'System', datetime('now'))
          `).run();
        });
      }
    } catch (e) {
      console.error('Error ensuring Stores team:', e.message);
    }
  }

  // Ensure A-Check & Aft Lounge team exists
  const hasACheck = db.prepare("SELECT COUNT(*) AS cnt FROM teams WHERE id = 'a-check'").get().cnt;
  if (hasACheck === 0 && fs.existsSync(SEED_PATH)) {
    try {
      const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'));
      const aCheck = seed.teams.find((t) => t.id === 'a-check');
      if (aCheck) {
        runTx(() => {
          db.prepare(`
            INSERT INTO teams (id, name, full_name, category, min_daily_target, shift_timings_json, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            aCheck.id,
            aCheck.name,
            aCheck.fullName || aCheck.name.toUpperCase(),
            aCheck.category || 'A-Check',
            aCheck.minDailyTarget || 22,
            JSON.stringify(aCheck.shiftTimings || {}),
            aCheck.sortOrder || 3
          );
          const insertEmp = db.prepare(`
            INSERT INTO employees (team_id, seq_no, name, uuds_no, contingent_no, skill, notes, default_pattern_json, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
          `);
          const insertEntry = db.prepare(`
            INSERT INTO roster_entries (month, day, employee_id, team_id, deployed_team_id, shift_code, updated_by)
            VALUES ('2026-11', ?, ?, 'a-check', 'a-check', ?, 'Initial PDF Import')
          `);
          const snapshotStaff = [];
          for (const s of aCheck.staff) {
            const pattern = detectRotationPattern(s.shifts);
            const empRes = insertEmp.run(
              'a-check',
              String(s.seq),
              s.name,
              s.uudsNo || '',
              s.contingentNo || '',
              s.skill || 'TECHNICIAN',
              s.notes || '',
              pattern.cycle ? JSON.stringify(pattern) : null
            );
            const empId = Number(empRes.lastInsertRowid);
            s.shifts.forEach((code, idx) => {
              insertEntry.run(idx + 1, empId, code);
            });
            snapshotStaff.push({ id: empId, name: s.name, uudsNo: s.uudsNo, skill: s.skill, shifts: s.shifts });
          }
          db.prepare(`
            INSERT INTO team_revisions (month, team_id, revision, published_by, notes, snapshot_json)
            VALUES ('2026-11', 'a-check', 'R00', 'System Import', 'Imported from A-CHECK & AFT LOUNGE November 2026 PDF (R00)', ?)
          `).run(JSON.stringify({ teamId: 'a-check', teamName: aCheck.name, staffCount: aCheck.staff.length, staff: snapshotStaff }));
          db.prepare(`
            INSERT OR IGNORE INTO roster_team_status (month, team_id, status, revision, updated_by, updated_at)
            VALUES ('2026-11', 'a-check', 'PUBLISHED', 'R00', 'System', datetime('now'))
          `).run();
        });
      }
    } catch (e) {
      console.error('Error ensuring A-Check team:', e.message);
    }
  }

  // Seed sample Overtime records for demonstration if table is empty
  try {
    const otCount = db.prepare('SELECT COUNT(*) AS cnt FROM overtime_records').get().cnt;
    if (otCount === 0) {
      const activeEmps = db.prepare("SELECT id, team_id, name, uuds_no, contingent_no, skill FROM employees WHERE status = 'ACTIVE' LIMIT 20").all();
      if (activeEmps.length > 0) {
        const insertOt = db.prepare(`
          INSERT INTO overtime_records (
            month, day, date_str, employee_id, team_id, shift_code,
            scheduled_start_time, scheduled_end_time, actual_end_time,
            total_extra_hours, buffer_hours, approved_ot_hours,
            reason, aircraft_reg, work_order_no, location_bay,
            team_manager_status, team_manager_name, remarks
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Sample entries covering user's exact case (8 PM to 11 PM -> 3 hrs extra -> 2 hrs buffer -> 1 hr OT)
        const samples = [
          { day: 10, empIdx: 0, actEnd: '23:00', extra: 3.0, buffer: 2.0, ot: 1.0, reason: 'A380 Cabin Deep Cleaning & Seat Belt Check', reg: 'A6-EVA', bay: 'Stand B12', mgr: 'A. Al-Mansoori' },
          { day: 10, empIdx: 1, actEnd: '23:30', extra: 3.5, buffer: 2.0, ot: 1.5, reason: 'A380 Cabin Deep Cleaning & Seat Belt Check', reg: 'A6-EVA', bay: 'Stand B12', mgr: 'A. Al-Mansoori' },
          { day: 11, empIdx: 2, actEnd: '23:00', extra: 3.0, buffer: 2.0, ot: 1.0, reason: 'B777 Galley Chiller Urgent Replacement', reg: 'A6-EOQ', bay: 'Bay C24', mgr: 'R. K. Sharma' },
          { day: 11, empIdx: 3, actEnd: '22:00', extra: 2.0, buffer: 2.0, ot: 0.0, reason: 'Lavatory Smoke Detector Defect Rectification', reg: 'A6-EPF', bay: 'Bay A05', mgr: 'R. K. Sharma' },
          { day: 12, empIdx: 4, actEnd: '00:00', extra: 4.0, buffer: 2.0, ot: 2.0, reason: 'A/C Delay - A6-EEX Urgent Departure Prep', reg: 'A6-EEX', bay: 'Stand F08', mgr: 'M. Tariq' },
          { day: 12, empIdx: 5, actEnd: '23:00', extra: 3.0, buffer: 2.0, ot: 1.0, reason: 'A/C Delay - A6-EEX Urgent Departure Prep', reg: 'A6-EEX', bay: 'Stand F08', mgr: 'M. Tariq' },
          { day: 13, empIdx: 6, actEnd: '23:00', extra: 3.0, buffer: 2.0, ot: 1.0, reason: 'Flight Delay EK-203 Cabin Rectification', reg: 'A6-BLA', bay: 'Stand B21', mgr: 'F. Rahman' },
          { day: 14, empIdx: 7, actEnd: '01:00', extra: 5.0, buffer: 2.0, ot: 3.0, reason: 'Aft Lounge Carpet & Armrest Rapid Fix', reg: 'A6-EVN', bay: 'Hangar 02', mgr: 'K. Munir' },
          { day: 15, empIdx: 8, actEnd: '22:30', extra: 2.5, buffer: 2.0, ot: 0.5, reason: 'Cockpit Windshield Trim Panel Securing', reg: 'A6-ENE', bay: 'Stand C11', mgr: 'A. Al-Mansoori' },
          { day: 16, empIdx: 9, actEnd: '23:00', extra: 3.0, buffer: 2.0, ot: 1.0, reason: 'Emergency Seat Track Inspection Work Order', reg: 'A6-ECH', bay: 'Bay E04', mgr: 'M. Tariq' }
        ];

        runTx(() => {
          samples.forEach((s, idx) => {
            const emp = activeEmps[s.empIdx % activeEmps.length];
            const dayStr = String(s.day).padStart(2, '0');
            const dateStr = `2026-11-${dayStr}`;
            insertOt.run(
              '2026-11',
              s.day,
              dateStr,
              emp.id,
              emp.team_id,
              'D',
              '08:00',
              '20:00',
              s.actEnd,
              s.extra,
              s.buffer,
              s.ot,
              s.reason,
              s.reg,
              `WO-DXB-${202600 + idx}`,
              s.bay,
              'APPROVED',
              s.mgr,
              'Operational necessity approved under DXB airside ops.'
            );
          });
        });
      }
    }
  } catch (err) {
    console.error('Error seeding overtime records:', err.message);
  }
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password, storedHash) {
  const [salt, keyHex] = String(storedHash || '').split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(String(password), salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

export function seedIfEmpty() {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM teams').get();
  if (row.cnt > 0) return;

  if (!fs.existsSync(SEED_PATH)) {
    throw new Error(`Seed file not found at ${SEED_PATH}`);
  }
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'));
  const month = seed.month || '2026-11';
  const days = getDaysInMonth(month);

  runTx(() => {
    db.prepare(`
      INSERT INTO roster_months (month, label, days_in_month, status, revision)
      VALUES (?, ?, ?, 'PUBLISHED', 'R01')
    `).run(month, formatMonthLabel(month), days);

    const insertTeam = db.prepare(`
      INSERT INTO teams (id, name, full_name, category, min_daily_target, shift_timings_json, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertEmp = db.prepare(`
      INSERT INTO employees (team_id, seq_no, name, uuds_no, contingent_no, skill, default_pattern_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    `);
    const insertEntry = db.prepare(`
      INSERT INTO roster_entries (month, day, employee_id, team_id, deployed_team_id, shift_code, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, 'Initial Seed')
    `);
    const insertRev = db.prepare(`
      INSERT INTO team_revisions (month, team_id, revision, published_by, notes, snapshot_json)
      VALUES (?, ?, ?, 'System Import', ?, ?)
    `);

    seed.teams.forEach((team, tIdx) => {
      insertTeam.run(
        team.id,
        team.name,
        team.fullName || team.name.toUpperCase(),
        team.category || 'Operations',
        team.minDailyTarget || Math.ceil(team.staff.length * 0.45),
        JSON.stringify(team.shiftTimings || {}),
        tIdx + 1
      );

      const snapshotStaff = [];
      for (const s of team.staff) {
        const pattern = detectRotationPattern(s.shifts);
        const empRes = insertEmp.run(
          team.id,
          String(s.seq),
          s.name,
          s.uudsNo || '',
          s.contingentNo || '',
          s.skill || 'TECHNICIAN',
          pattern.cycle ? JSON.stringify(pattern) : null
        );
        const empId = Number(empRes.lastInsertRowid);
        s.shifts.forEach((code, idx) => {
          insertEntry.run(month, idx + 1, empId, team.id, team.id, code);
        });
        snapshotStaff.push({ id: empId, name: s.name, uudsNo: s.uudsNo, skill: s.skill, shifts: s.shifts });
      }

      insertRev.run(
        month,
        team.id,
        team.revision || 'R00',
        `Imported from ${team.fullName} November 2026 PDF (${team.revision || 'R00'})`,
        JSON.stringify({ teamId: team.id, teamName: team.name, staffCount: team.staff.length, staff: snapshotStaff })
      );
    });

    db.prepare(`
      INSERT INTO audit_logs (month, action_type, team_name, reason, actor)
      VALUES (?, 'INITIAL_IMPORT', 'All 7 Workshop Teams', 'Imported 182 staff across 7 UUDS DXB Workshop roster PDFs for November 2026', 'System')
    `).run(month);
  });
}

export function recordAudit({
  month,
  day = null,
  employeeId = null,
  employeeName = '',
  teamId = '',
  teamName = '',
  actionType,
  oldShift = '',
  newShift = '',
  replacementEmployeeId = null,
  replacementEmployeeName = '',
  reason = '',
  actor = 'Workshop Manager',
}) {
  db.prepare(`
    INSERT INTO audit_logs (
      month, day, employee_id, employee_name, team_id, team_name,
      action_type, old_shift, new_shift, replacement_employee_id,
      replacement_employee_name, reason, actor
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    month,
    day,
    employeeId,
    employeeName,
    teamId,
    teamName,
    actionType,
    oldShift,
    newShift,
    replacementEmployeeId,
    replacementEmployeeName,
    reason,
    actor
  );
}

export function runDailyBackup({ force = false } = {}) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const targetName = force
    ? `uuds_roster_${today}_${Date.now()}.db`
    : `uuds_roster_${today}.db`;
  const targetPath = path.join(BACKUP_DIR, targetName);

  if (!force && fs.existsSync(targetPath)) {
    return { skipped: true, filename: targetName, path: targetPath };
  }

  const escaped = targetPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escaped}'`);

  // Retain last 30 daily backups
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('uuds_roster_') && f.endsWith('.db'))
    .sort()
    .reverse();
  for (const oldFile of files.slice(30)) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, oldFile));
    } catch {
      // ignore cleanup error
    }
  }

  const stat = fs.statSync(targetPath);
  return { skipped: false, filename: targetName, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
}

export function listBackups() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  return fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('uuds_roster_') && f.endsWith('.db'))
    .sort()
    .reverse()
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return {
        filename: f,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    });
}
