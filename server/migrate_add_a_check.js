import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, runTx, recordAudit } from './db.js';
import { detectRotationPattern } from './rotation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.resolve(__dirname, '../data/november_2026_seed.json');
const A_CHECK_SEED_PATH = path.resolve(__dirname, '../data/a_check_aft_lounge_seed.json');

const aCheckStaff = JSON.parse(fs.readFileSync(A_CHECK_SEED_PATH, 'utf-8'));

const aCheckTeam = {
  id: "a-check",
  name: "A-Check & Aft Lounge",
  fullName: "A-CHECK & AFT LOUNGE",
  revision: "R00",
  category: "A-Check",
  minDailyTarget: 22,
  sortOrder: 3,
  shiftTimings: {
    "D": "08:00 - 20:00",
    "N": "20:00 - 08:00",
    "M": "08:00 - 17:00",
    "OFF": "Day Off",
    "AL": "On Leave"
  },
  staff: aCheckStaff.map(s => ({
    seq: String(s.seq),
    name: s.name,
    contingentNo: s.contNo || '',
    uudsNo: s.uudsNo || '',
    skill: s.role,
    notes: s.subTeam,
    shifts: s.shifts
  }))
};

// 1. Update data/november_2026_seed.json
if (fs.existsSync(SEED_PATH)) {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'));
  const existingIdx = seed.teams.findIndex(t => t.id === 'a-check');
  if (existingIdx >= 0) {
    seed.teams[existingIdx] = aCheckTeam;
  } else {
    // Insert after paint-booth
    const paintIdx = seed.teams.findIndex(t => t.id === 'paint-booth');
    if (paintIdx >= 0) {
      seed.teams.splice(paintIdx + 1, 0, aCheckTeam);
    } else {
      seed.teams.push(aCheckTeam);
    }
  }
  fs.writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2), 'utf-8');
  console.log('Updated november_2026_seed.json with A-Check & Aft Lounge team');
}

// 2. Insert into SQLite DB
runTx(() => {
  // Clean up if already exists
  db.prepare("DELETE FROM roster_entries WHERE team_id = 'a-check' OR employee_id IN (SELECT id FROM employees WHERE team_id = 'a-check')").run();
  db.prepare("DELETE FROM team_revisions WHERE team_id = 'a-check'").run();
  db.prepare("DELETE FROM roster_team_status WHERE team_id = 'a-check'").run();
  db.prepare("DELETE FROM employees WHERE team_id = 'a-check'").run();
  db.prepare("DELETE FROM teams WHERE id = 'a-check'").run();

  // Insert Team
  db.prepare(`
    INSERT INTO teams (id, name, full_name, category, min_daily_target, shift_timings_json, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    aCheckTeam.id,
    aCheckTeam.name,
    aCheckTeam.fullName,
    aCheckTeam.category,
    aCheckTeam.minDailyTarget,
    JSON.stringify(aCheckTeam.shiftTimings),
    aCheckTeam.sortOrder
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

  for (const s of aCheckTeam.staff) {
    const pattern = detectRotationPattern(s.shifts);
    const empRes = insertEmp.run(
      'a-check',
      s.seq,
      s.name,
      s.uudsNo,
      s.contingentNo,
      s.skill,
      s.notes,
      pattern.cycle ? JSON.stringify(pattern) : null
    );
    const empId = Number(empRes.lastInsertRowid);

    s.shifts.forEach((code, idx) => {
      insertEntry.run(idx + 1, empId, code);
    });

    snapshotStaff.push({
      id: empId,
      name: s.name,
      uudsNo: s.uudsNo,
      skill: s.skill,
      shifts: s.shifts
    });
  }

  // Insert Revision
  db.prepare(`
    INSERT INTO team_revisions (month, team_id, revision, published_by, notes, snapshot_json)
    VALUES ('2026-11', 'a-check', 'R00', 'System Import', 'Imported from A-CHECK & AFT LOUNGE November 2026 PDF (R00)', ?)
  `).run(
    JSON.stringify({
      teamId: 'a-check',
      teamName: aCheckTeam.name,
      staffCount: aCheckTeam.staff.length,
      staff: snapshotStaff
    })
  );

  // Insert Roster Team Status
  db.prepare(`
    INSERT INTO roster_team_status (month, team_id, status, revision, updated_by, updated_at)
    VALUES ('2026-11', 'a-check', 'PUBLISHED', 'R00', 'System', datetime('now'))
  `).run();

  // Audit log
  recordAudit({
    month: '2026-11',
    teamId: 'a-check',
    teamName: aCheckTeam.name,
    actionType: 'TEAM_ADDED',
    newShift: `50 Staff`,
    reason: 'Imported A-Check & Aft Lounge team (50 staff) from November 2026 PDF',
    actor: 'System'
  });
});

console.log('Successfully inserted A-Check & Aft Lounge into database!');
