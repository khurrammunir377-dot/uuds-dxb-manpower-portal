import { db, runTx } from './db.js';

export function runMigration() {
  console.log('Running Office Staff & Columns Migration...');

  // 1. Ensure columns on employees table
  const ensureCol = (col, def) => {
    const cols = db.prepare('PRAGMA table_info(employees)').all();
    if (!cols.some(c => c.name === col)) {
      db.exec(`ALTER TABLE employees ADD COLUMN ${col} ${def}`);
      console.log(`Added column ${col} to employees`);
    }
  };

  ensureCol('join_date', "TEXT NOT NULL DEFAULT ''");
  ensureCol('dxb_shift_date', "TEXT NOT NULL DEFAULT ''");
  ensureCol('mobile_no', "TEXT NOT NULL DEFAULT ''");

  // 2. Ensure office team exists
  let officeTeam = db.prepare("SELECT * FROM teams WHERE id = 'office'").get();
  if (!officeTeam) {
    db.prepare(`
      INSERT INTO teams (id, name, full_name, category, min_daily_target, shift_timings_json, sort_order)
      VALUES (
        'office',
        'Office & Planning',
        'OFFICE & PLANNING',
        'Office',
        15,
        '{"M":"08:00 - 17:00","OFF":"Weekend / Off","AL":"Annual Leave","SL":"Sick Leave","UPL":"Unpaid Leave"}',
        9
      )
    `).run();
    console.log('Created office & planning team');
    officeTeam = db.prepare("SELECT * FROM teams WHERE id = 'office'").get();
  }

  // 3. Ensure roster_team_status has office team for Nov 2026
  db.prepare(`
    INSERT OR IGNORE INTO roster_team_status (month, team_id, status, revision, updated_by)
    VALUES ('2026-11', 'office', 'PUBLISHED', 'R00', 'System')
  `).run();

  // 4. Staff list provided by user
  const officeStaff = [
    { uuds: 'UUDS-014', staffNo: '953722', name: 'Vinod Viswanath Viswanath Vellakkattu Gopalan Nair', pos: 'Planner', subteam: 'Planner', mobile: '050-9525084', join: '2022-12-14', status: 'ACTIVE' },
    { uuds: 'UUDS-018', staffNo: '953745', name: 'Sandesh Dilantha Rishendra Wickramasinghe', pos: 'Aircraft Cabin Technician', subteam: 'Planner', mobile: '', join: '2024-02-24', status: 'ACTIVE' },
    { uuds: 'UUDS-022', staffNo: '953728', name: 'Danika Lakmal Athapattu Athapattu Liyanaralalage', pos: 'Director - Onwing', subteam: 'Office', mobile: '052-9071090', join: '2022-11-08', status: 'ACTIVE' },
    { uuds: 'UUDS-107', staffNo: '953729', name: 'Aravind Madhu Kumar', pos: 'Planner', subteam: 'Planner', mobile: '054-7009646', join: '2022-11-14', status: 'ACTIVE' },
    { uuds: 'UUDS-1170', staffNo: 'C39766', name: 'Shalin Madhuranga Perera', pos: 'Assistant A/ Maintenance Mechanic', subteam: 'Planner', mobile: '050-3986977', join: '2025-07-21', status: 'ACTIVE' },
    { uuds: 'UUDS-1299', staffNo: 'C55242', name: 'Gothami Bhagya Piyarathne Mallehe', pos: 'Material Planner', subteam: 'Planner', mobile: '056-7386338', join: '2025-09-29', status: 'ACTIVE' },
    { uuds: 'UUDS-1406', staffNo: 'C60933', name: 'Senadhi Pathiranahalage Udari', pos: 'Material Planner', subteam: 'Planner', mobile: '058-8123456', join: '2025-10-20', status: 'UN Paid Leave' },
    { uuds: 'UUDS-170', staffNo: '953723', name: 'Joseph Sheronne Priyamal Silva Franciscu Hettige', pos: 'Manager projects-Onwing', subteam: 'Office', mobile: '056-5028789', join: '2023-01-11', status: 'ACTIVE' },
    { uuds: 'UUDS-214', staffNo: '958572', name: 'Madhawa Lakruwan Herath Herath Mudiyanselage', pos: 'Project coordinator', subteam: 'Office', mobile: '054-5936971', join: '2023-02-15', status: 'ACTIVE' },
    { uuds: 'UUDS-357', staffNo: '960417', name: 'Viraj Krishantha Perera Vidana Arachchige', pos: 'Workshop Manager', subteam: 'Office', mobile: '050-7412750', join: '2023-01-27', status: 'ACTIVE' },
    { uuds: 'UUDS-364', staffNo: '958566', name: 'Akila Akalanka Manamendra Manamendra Patabadige', pos: 'Aircraft Cabin Technician/Supervisor', subteam: 'Office', mobile: '056-5047064', join: '2023-01-16', status: 'ACTIVE' },
    { uuds: 'UUDS-416', staffNo: '972623', name: 'Iresh Sanjeewa Madduma Kankanige', pos: 'Trainer', subteam: 'Office', mobile: '054-5726017', join: '2023-06-13', status: 'UN Paid Leave' },
    { uuds: 'UUDS-432', staffNo: '971582', name: 'Savindu Rashinthan Aapphamy Pathirajage Don', pos: 'Material coordinator', subteam: 'Planner', mobile: '055-4310084', join: '2023-06-13', status: 'ACTIVE' },
    { uuds: 'UUDS-453', staffNo: 'C12154', name: 'Anand Prabhakaran', pos: 'Plannig officer', subteam: 'Planner', mobile: '058-1275454', join: '2023-04-13', status: 'ACTIVE' },
    { uuds: 'UUDS-553', staffNo: 'C12155', name: 'Isuru Acharige', pos: 'Planner', subteam: 'Planner', mobile: '050-3864700', join: '2023-09-20', status: 'ACTIVE' },
    { uuds: 'UUDS-611', staffNo: 'C09072', name: 'Mohammed Ijaz', pos: 'Aircraft Maintenance Mechanic', subteam: 'Planner', mobile: '055-5204955', join: '2024-08-21', status: 'ACTIVE' },
    { uuds: 'UUDS-614', staffNo: 'C09096', name: 'koggala liyana Patabediee Nalin Silva', pos: 'Training Mannager', subteam: 'Office', mobile: '050-6230296', join: '2025-05-18', status: 'ACTIVE' },
    { uuds: 'UUDS-616', staffNo: '999683', name: 'Charith  Krishantha', pos: 'Assistant Cordinator', subteam: 'Office', mobile: '050-5421882', join: '2024-03-20', status: 'ACTIVE' },
    { uuds: 'UUDS-712', staffNo: 'C10012', name: 'Madushka Nipun Edirisinghe Edirisinghe Arachchilage', pos: 'Aircraft  Technician', subteam: 'Planner', mobile: '050-4354051', join: '2024-09-06', status: 'ACTIVE' },
    { uuds: 'UUDS-753', staffNo: 'C17125', name: 'Puspa Kumara', pos: 'Office Assistant', subteam: 'Office', mobile: '052-8371048', join: '2024-10-15', status: 'Non Tec.' }
  ];

  const officePatternJson = JSON.stringify({
    period: 7,
    cycle: ['M', 'M', 'M', 'M', 'M', 'OFF', 'OFF'],
    label: '5M-2OFF (Mon-Fri 08:00-17:00, Sat-Sun OFF)'
  });

  runTx(() => {
    let seq = 1;
    for (const s of officeStaff) {
      let emp = db.prepare('SELECT id FROM employees WHERE UPPER(uuds_no) = ?').get(s.uuds.toUpperCase());
      const normalizedStatus = s.status === 'UN Paid Leave' ? 'INACTIVE' : s.status === 'Non Tec.' ? 'ACTIVE' : 'ACTIVE';
      const notes = s.status === 'UN Paid Leave' ? 'UN Paid Leave' : s.status === 'Non Tec.' ? 'Non Tec.' : '';

      if (!emp) {
        const r = db.prepare(`
          INSERT INTO employees (
            team_id, seq_no, name, uuds_no, contingent_no, skill, default_pattern_json,
            status, notes, join_date, dxb_shift_date, mobile_no
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'office',
          String(seq),
          s.name.toUpperCase(),
          s.uuds.toUpperCase(),
          s.staffNo.toUpperCase(),
          s.pos.toUpperCase(),
          officePatternJson,
          normalizedStatus,
          notes,
          s.join,
          s.join,
          s.mobile
        );
        emp = { id: Number(r.lastInsertRowid) };
        console.log(`Inserted office staff: ${s.uuds} - ${s.name}`);
      } else {
        db.prepare(`
          UPDATE employees
          SET team_id = 'office',
              name = ?,
              contingent_no = ?,
              skill = ?,
              default_pattern_json = ?,
              status = ?,
              notes = ?,
              join_date = ?,
              dxb_shift_date = ?,
              mobile_no = ?
          WHERE id = ?
        `).run(
          s.name.toUpperCase(),
          s.staffNo.toUpperCase(),
          s.pos.toUpperCase(),
          officePatternJson,
          normalizedStatus,
          notes,
          s.join,
          s.join,
          s.mobile,
          emp.id
        );
        console.log(`Updated office staff: ${s.uuds} - ${s.name}`);
      }

      // Seed November 2026 daily roster: 8 to 5 (M shift) Mon-Fri, Sat and Sun OFF (or L if unpaid leave)
      for (let day = 1; day <= 30; day++) {
        const dt = new Date(2026, 10, day); // Nov 2026
        const dow = dt.getDay(); // 0 = Sun, 6 = Sat
        const isWeekend = (dow === 0 || dow === 6);
        let shiftCode = isWeekend ? 'OFF' : 'M';
        if (s.status === 'UN Paid Leave') {
          shiftCode = isWeekend ? 'OFF' : 'L';
        }

        db.prepare(`
          INSERT INTO roster_entries (month, day, employee_id, team_id, deployed_team_id, shift_code, updated_by)
          VALUES ('2026-11', ?, ?, 'office', 'office', ?, 'System')
          ON CONFLICT(month, day, employee_id) DO UPDATE SET
            shift_code = excluded.shift_code,
            team_id = 'office',
            deployed_team_id = 'office'
        `).run(day, emp.id, shiftCode);
      }

      seq++;
    }
  });

  console.log('Migration completed successfully!');
}

runMigration();
