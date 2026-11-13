import { db } from './db.js';

console.log('--- Separating Office and Planner Teams ---');

// 1. Ensure Planner team exists in teams table
db.prepare(`
  INSERT OR IGNORE INTO teams (id, name, full_name, category, min_daily_target, shift_timings_json, sort_order)
  VALUES ('planner', 'Planner', 'Planning & Material Planning', 'Planning', 0, '{"M":"08:00 - 17:00"}', 10)
`).run();

// Update Office team name and full_name
db.prepare(`
  UPDATE teams
  SET name = 'Office', full_name = 'Workshop Office & Management', sort_order = 9
  WHERE id = 'office'
`).run();

// 2. The 11 Planner team members
const plannerUudsNos = [
  'UUDS-014',  // Vinod Viswanath - Planner
  'UUDS-018',  // Sandesh Dilantha - Aircraft Cabin Technician (Planner)
  'UUDS-107',  // Aravind Madhu Kumar - Planner
  'UUDS-1170', // Shalin Madhuranga Perera - Assistant A/ Maintenance Mechanic (Planner)
  'UUDS-1299', // Gothami Bhagya - Material Planner (Planner)
  'UUDS-1406', // Senadhi Pathiranahalage Udari - Material Planner (Planner)
  'UUDS-432',  // Savindu Rashinthan - Material coordinator (Planner)
  'UUDS-453',  // Anand Prabhakaran - Plannig officer (Planner)
  'UUDS-553',  // Isuru Acharige - Planner
  'UUDS-611',  // Mohammed Ijaz - Aircraft Maintenance Mechanic (Planner)
  'UUDS-712'   // Madushka Nipun Edirisinghe - Aircraft Technician (Planner)
];

// The 9 Office team members
const officeUudsNos = [
  'UUDS-022',  // Danika Lakmal - Director - Onwing
  'UUDS-170',  // Joseph Sheronne Priyamal - Manager projects-Onwing
  'UUDS-214',  // Madhawa Lakruwan Herath - Project coordinator
  'UUDS-357',  // Viraj Krishantha Perera - Workshop Manager
  'UUDS-364',  // Akila Akalanka Manamendra - Aircraft Cabin Technician/Supervisor
  'UUDS-416',  // Iresh Sanjeewa - Trainer
  'UUDS-614',  // koggala liyana Patabediee Nalin Silva - Training Mannager
  'UUDS-616',  // Charith Krishantha - Assistant Cordinator
  'UUDS-753'   // Puspa Kumara - Office Assistant
];

// Update Planner staff
const getEmp = db.prepare('SELECT id FROM employees WHERE uuds_no = ?');
const updateEmp = db.prepare('UPDATE employees SET team_id = ? WHERE id = ?');
const updateRoster = db.prepare('UPDATE roster_entries SET team_id = ? WHERE employee_id = ?');

for (const uudsNo of plannerUudsNos) {
  const emp = getEmp.get(uudsNo);
  if (emp) {
    updateEmp.run('planner', emp.id);
    updateRoster.run('planner', emp.id);
  }
}

for (const uudsNo of officeUudsNos) {
  const emp = getEmp.get(uudsNo);
  if (emp) {
    updateEmp.run('office', emp.id);
    updateRoster.run('office', emp.id);
  }
}

const plannerCount = db.prepare("SELECT count(*) as c FROM employees WHERE team_id = 'planner'").get().c;
const officeCount = db.prepare("SELECT count(*) as c FROM employees WHERE team_id = 'office'").get().c;
const totalTeams = db.prepare("SELECT count(*) as c FROM teams").get().c;

console.log(`Updated successfully!`);
console.log(`Total Teams: ${totalTeams}`);
console.log(`Planner Staff Count: ${plannerCount}`);
console.log(`Office Staff Count: ${officeCount}`);
