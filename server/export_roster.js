import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ExcelJS from 'exceljs';
import { WORKING_SHIFTS, getDayOfWeek, parseShiftHours } from './rotation.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_EXPORT_SCRIPT = path.join(__dirname, 'export_roster_pdf.py');

const EXCEL_SHIFT_COLORS = {
  D: { argb: 'FF92D050', font: 'FF0F2910' },
  N: { argb: 'FF9F40C7', font: 'FFFFFFFF' },
  M: { argb: 'FFFFC000', font: 'FF1F1700' },
  T: { argb: 'FF0284C7', font: 'FFFFFFFF' },
  OFF: { argb: 'FFEA1F24', font: 'FFFFFFFF' },
  V: { argb: 'FFCBD5E1', font: 'FF1E293B' },
  L: { argb: 'FFEA580C', font: 'FFFFFFFF' },
  SL: { argb: 'FFE11D48', font: 'FFFFFFFF' },
  EM: { argb: 'FF991B1B', font: 'FFFFFFFF' },
};

export function buildRosterExportData(db, month, teamId = 'all') {
  const monthMeta = db.prepare('SELECT * FROM roster_months WHERE month = ?').get(month);
  if (!monthMeta) throw new Error(`Month ${month} not found`);

  const teams = teamId === 'all'
    ? db.prepare('SELECT * FROM teams ORDER BY sort_order ASC').all()
    : db.prepare('SELECT * FROM teams WHERE id = ?').all(teamId);

  if (teams.length === 0) throw new Error('Team not found');

  const entries = db.prepare('SELECT * FROM roster_entries WHERE month = ?').all(month);
  const entryByEmp = new Map();
  for (const en of entries) {
    if (!entryByEmp.has(en.employee_id)) entryByEmp.set(en.employee_id, {});
    entryByEmp.get(en.employee_id)[en.day] = en;
  }

  const days = Array.from({ length: monthMeta.days_in_month }, (_, i) => ({
    day: i + 1,
    dow: getDayOfWeek(month, i + 1),
  }));

  const teamPayloads = teams.map((team) => {
    const shiftTimings = JSON.parse(team.shift_timings_json || '{}');
    const emps = db.prepare(`
      SELECT * FROM employees
      WHERE team_id = ? AND status = 'ACTIVE'
      ORDER BY CAST(seq_no AS INTEGER) ASC, id ASC
    `).all(team.id);

    const latestRev = db.prepare(`
      SELECT revision FROM team_revisions WHERE month = ? AND team_id = ? ORDER BY id DESC LIMIT 1
    `).get(month, team.id);

    const rows = emps.map((emp) => {
      const empEntries = entryByEmp.get(emp.id) || {};
      const shifts = [];
      let workedDays = 0;
      let hours = 0;

      for (let d = 1; d <= monthMeta.days_in_month; d++) {
        const code = empEntries[d]?.shift_code || 'OFF';
        shifts.push({ day: d, code });
        if (WORKING_SHIFTS.has(code)) {
          workedDays++;
          hours += parseShiftHours(code, shiftTimings);
        }
      }

      return {
        id: emp.id,
        seqNo: emp.seq_no,
        name: emp.name,
        skill: emp.skill,
        uudsNo: emp.uuds_no,
        contingentNo: emp.contingent_no,
        shifts,
        stats: { workedDays, hours: Math.round(hours * 10) / 10 },
      };
    });

    const dailyTotals = days.map(({ day }) => {
      let onDuty = 0;
      for (const r of rows) {
        if (WORKING_SHIFTS.has(r.shifts[day - 1]?.code)) onDuty++;
      }
      return { day, onDuty };
    });

    return {
      id: team.id,
      name: team.name,
      fullName: team.full_name,
      revision: latestRev?.revision || monthMeta.revision || 'R00',
      shiftTimings,
      days,
      rows,
      dailyTotals,
    };
  });

  return {
    month,
    monthLabel: monthMeta.label,
    status: monthMeta.status,
    revision: monthMeta.revision,
    generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    teams: teamPayloads,
  };
}

export async function generateRosterExcelBuffer(db, month, teamId = 'all') {
  const payload = buildRosterExportData(db, month, teamId);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'UUDS DXB Workshop Command';
  wb.created = new Date();

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FF475569' } },
    left: { style: 'thin', color: { argb: 'FF475569' } },
    bottom: { style: 'thin', color: { argb: 'FF475569' } },
    right: { style: 'thin', color: { argb: 'FF475569' } },
  };

  for (const team of payload.teams) {
    const ws = wb.addWorksheet(team.name.slice(0, 31), {
      views: [{ state: 'frozen', xSplit: 5, ySplit: 3 }],
      pageSetup: { paperSize: 8, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
    });

    const totalCols = 5 + team.days.length + 2;

    // Row 1: Title Banner
    ws.mergeCells(1, 1, 1, totalCols);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = `UUDS DXB WORKSHOP — ${team.fullName} — ${payload.monthLabel.toUpperCase()} (${team.revision})`;
    titleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(1).height = 26;

    // Row 2: Weekday headers & Row 3: Date & column headers
    const fixedHeaders = ['NO', 'NAME', 'SKILL', 'UUDS NO', 'CONT. NO'];
    fixedHeaders.forEach((h, i) => {
      ws.mergeCells(2, i + 1, 3, i + 1);
      const c = ws.getCell(2, i + 1);
      c.value = h;
      c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      c.alignment = { vertical: 'middle', horizontal: 'center' };
      c.border = thinBorder;
      ws.getCell(3, i + 1).border = thinBorder;
    });

    team.days.forEach((d, idx) => {
      const col = 6 + idx;
      const isWknd = d.dow === 'SAT' || d.dow === 'SUN';
      const dowCell = ws.getCell(2, col);
      dowCell.value = d.dow;
      dowCell.font = { bold: true, size: 8, color: { argb: isWknd ? 'FFFCD34D' : 'FFE2E8F0' } };
      dowCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isWknd ? 'FF334155' : 'FF1E293B' } };
      dowCell.alignment = { vertical: 'middle', horizontal: 'center' };
      dowCell.border = thinBorder;

      const dayCell = ws.getCell(3, col);
      dayCell.value = d.day;
      dayCell.font = { bold: true, size: 9, color: { argb: isWknd ? 'FFFCD34D' : 'FFFFFFFF' } };
      dayCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isWknd ? 'FF334155' : 'FF1E293B' } };
      dayCell.alignment = { vertical: 'middle', horizontal: 'center' };
      dayCell.border = thinBorder;
    });

    ['DAYS', 'HRS'].forEach((h, idx) => {
      const col = 6 + team.days.length + idx;
      ws.mergeCells(2, col, 3, col);
      const c = ws.getCell(2, col);
      c.value = h;
      c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      c.alignment = { vertical: 'middle', horizontal: 'center' };
      c.border = thinBorder;
      ws.getCell(3, col).border = thinBorder;
    });
    ws.getRow(2).height = 16;
    ws.getRow(3).height = 17;

    // Staff Rows
    team.rows.forEach((r, rIdx) => {
      const rowNum = 4 + rIdx;
      const rowObj = ws.getRow(rowNum);
      rowObj.height = 18;
      const baseVals = [rIdx + 1, r.name, r.skill, r.uudsNo, r.contingentNo];
      baseVals.forEach((v, i) => {
        const cell = rowObj.getCell(i + 1);
        cell.value = v;
        cell.font = { bold: i === 1, size: 9, color: { argb: 'FF0F172A' } };
        cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'center' : 'left' };
        cell.border = thinBorder;
      });

      r.shifts.forEach((sh, dIdx) => {
        const cell = rowObj.getCell(6 + dIdx);
        const style = EXCEL_SHIFT_COLORS[sh.code] || { argb: 'FFE2E8F0', font: 'FF0F172A' };
        cell.value = sh.code;
        cell.font = { bold: true, size: 8.5, color: { argb: style.font } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.argb } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = thinBorder;
      });

      const dSumCell = rowObj.getCell(6 + team.days.length);
      dSumCell.value = r.stats.workedDays;
      dSumCell.font = { bold: true, size: 9 };
      dSumCell.alignment = { vertical: 'middle', horizontal: 'center' };
      dSumCell.border = thinBorder;

      const hSumCell = rowObj.getCell(7 + team.days.length);
      hSumCell.value = r.stats.hours;
      hSumCell.font = { size: 9 };
      hSumCell.alignment = { vertical: 'middle', horizontal: 'center' };
      hSumCell.border = thinBorder;
    });

    // Footer TOTAL ON DUTY Row
    const footerRowNum = 4 + team.rows.length;
    ws.mergeCells(footerRowNum, 1, footerRowNum, 5);
    const fLabel = ws.getCell(footerRowNum, 1);
    fLabel.value = 'TOTAL ON DUTY';
    fLabel.font = { bold: true, size: 9.5, color: { argb: 'FF0F172A' } };
    fLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    fLabel.alignment = { vertical: 'middle', horizontal: 'right' };
    for (let c = 1; c <= 5; c++) ws.getCell(footerRowNum, c).border = thinBorder;

    team.dailyTotals.forEach((dt, idx) => {
      const cell = ws.getCell(footerRowNum, 6 + idx);
      cell.value = dt.onDuty;
      cell.font = { bold: true, size: 9 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = thinBorder;
    });
    ws.getRow(footerRowNum).height = 20;

    // Legend
    let legRow = footerRowNum + 2;
    ws.getCell(legRow, 2).value = 'SHIFT TIMINGS & LEGEND';
    ws.getCell(legRow, 2).font = { bold: true, size: 9 };
    legRow++;
    for (const [code, desc] of Object.entries(team.shiftTimings || {})) {
      const c1 = ws.getCell(legRow, 2);
      const style = EXCEL_SHIFT_COLORS[code] || { argb: 'FFE2E8F0', font: 'FF0F172A' };
      c1.value = code;
      c1.font = { bold: true, size: 9, color: { argb: style.font } };
      c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.argb } };
      c1.alignment = { vertical: 'middle', horizontal: 'center' };
      c1.border = thinBorder;

      const c2 = ws.getCell(legRow, 3);
      c2.value = desc;
      c2.font = { size: 9 };
      c2.border = thinBorder;
      legRow++;
    }

    // Column widths
    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 28;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 12;
    ws.getColumn(5).width = 13;
    for (let i = 0; i < team.days.length; i++) ws.getColumn(6 + i).width = 4.6;
    ws.getColumn(6 + team.days.length).width = 6.5;
    ws.getColumn(7 + team.days.length).width = 7;
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function generateRosterPdfBuffer(db, month, teamId = 'all') {
  const payload = buildRosterExportData(db, month, teamId);
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tmpJson = path.join(os.tmpdir(), `uuds_pdf_in_${stamp}.json`);
  const tmpPdf = path.join(os.tmpdir(), `uuds_pdf_out_${stamp}.pdf`);

  fs.writeFileSync(tmpJson, JSON.stringify(payload), 'utf-8');
  try {
    await execFileAsync('python', [PDF_EXPORT_SCRIPT, tmpJson, tmpPdf], { maxBuffer: 20 * 1024 * 1024 });
    return fs.readFileSync(tmpPdf);
  } finally {
    if (fs.existsSync(tmpJson)) fs.unlinkSync(tmpJson);
    if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
  }
}

export function buildPayrollExportData(db, month, teamId = 'all') {
  const monthMeta = db.prepare('SELECT * FROM roster_months WHERE month = ?').get(month);
  if (!monthMeta) throw new Error(`Month ${month} not found`);

  const teams = teamId === 'all'
    ? db.prepare('SELECT * FROM teams ORDER BY sort_order ASC').all()
    : db.prepare('SELECT * FROM teams WHERE id = ?').all(teamId);

  if (teams.length === 0) throw new Error('Team not found');

  const entries = db.prepare('SELECT * FROM roster_entries WHERE month = ?').all(month);
  const entryByEmp = new Map();
  for (const en of entries) {
    if (!entryByEmp.has(en.employee_id)) entryByEmp.set(en.employee_id, {});
    entryByEmp.get(en.employee_id)[en.day] = en;
  }

  const teamPayloads = teams.map((team) => {
    const shiftTimings = JSON.parse(team.shift_timings_json || '{}');
    const emps = db.prepare(`
      SELECT * FROM employees
      WHERE team_id = ? AND status = 'ACTIVE'
      ORDER BY CAST(seq_no AS INTEGER) ASC, id ASC
    `).all(team.id);

    const statusRow = db.prepare('SELECT revision FROM roster_team_status WHERE month = ? AND team_id = ?').get(month, team.id);
    const rows = emps.map((emp) => {
      const empEntries = entryByEmp.get(emp.id) || {};
      const counts = { D: 0, N: 0, M: 0, T: 0, OFF: 0, V: 0, L: 0, SL: 0, EM: 0 };
      let workedDays = 0;
      let totalHours = 0;
      let overtimeFlags = 0;
      let emergencyFlags = 0;
      let flaggedOtHours = 0;

      for (let d = 1; d <= monthMeta.days_in_month; d++) {
        const entry = empEntries[d];
        const code = entry?.shift_code || 'OFF';
        counts[code] = (counts[code] || 0) + 1;
        const hrs = parseShiftHours(code, shiftTimings);
        if (WORKING_SHIFTS.has(code)) {
          workedDays++;
          totalHours += hrs;
        }
        if (entry?.is_overtime) {
          overtimeFlags++;
          flaggedOtHours += hrs;
        }
        if (entry?.is_emergency) emergencyFlags++;
      }

      const regularHours = Math.min(192, Math.round(totalHours * 10) / 10);
      const overtimeHours = Math.max(
        Math.round(flaggedOtHours * 10) / 10,
        Math.max(0, Math.round((totalHours - 192) * 10) / 10)
      );

      return {
        seqNo: emp.seq_no,
        name: emp.name,
        uudsNo: emp.uuds_no,
        contingentNo: emp.contingent_no,
        skill: emp.skill,
        workedDays,
        totalHours: Math.round(totalHours * 10) / 10,
        regularHours,
        overtimeHours,
        overtimeFlags,
        emergencyFlags,
        counts,
      };
    });

    return {
      id: team.id,
      name: team.name,
      fullName: team.full_name,
      revision: statusRow?.revision || monthMeta.revision || 'R00',
      rows,
    };
  });

  return {
    month,
    monthLabel: monthMeta.label,
    generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    teams: teamPayloads,
  };
}

export async function generatePayrollExcelBuffer(db, month, teamId = 'all') {
  const data = buildPayrollExportData(db, month, teamId);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'UUDS DXB Workshop Command';
  wb.created = new Date();

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };

  for (const team of data.teams) {
    const sheetName = `${team.name} Payroll`.replace(/[\\/*?:[\]]/g, '').slice(0, 31);
    const ws = wb.addWorksheet(sheetName, {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
    });

    ws.mergeCells(1, 1, 1, 17);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = `UUDS DXB WORKSHOP — PAYROLL & OVERTIME SUMMARY — ${team.fullName.toUpperCase()} (${data.monthLabel})`;
    titleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(1).height = 28;

    const headers = [
      'SN', 'Employee Name', 'UUDS ID', 'Contingent No', 'Skill / Role',
      'Worked Days', 'Regular Hrs', 'Total Hrs', 'OT Hrs',
      'D', 'N', 'M', 'OFF', 'V', 'SL', 'L / EM', 'OT / EMG Flags',
    ];
    const hRow = ws.getRow(3);
    hRow.height = 22;
    headers.forEach((h, i) => {
      const c = hRow.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, size: 9, color: { argb: 'FF0F172A' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      c.alignment = { vertical: 'middle', horizontal: i <= 4 ? 'left' : 'center' };
      c.border = thinBorder;
    });

    team.rows.forEach((r, idx) => {
      const row = ws.getRow(4 + idx);
      row.height = 19;
      const vals = [
        r.seqNo, r.name, r.uudsNo || '-', r.contingentNo || '-', r.skill,
        r.workedDays, r.regularHours, r.totalHours, r.overtimeHours,
        r.counts.D || 0, r.counts.N || 0, r.counts.M || 0, r.counts.OFF || 0,
        r.counts.V || 0, r.counts.SL || 0, (r.counts.L || 0) + (r.counts.EM || 0),
        `${r.overtimeFlags} OT / ${r.emergencyFlags} EMG`,
      ];
      vals.forEach((v, i) => {
        const c = row.getCell(i + 1);
        c.value = v;
        c.font = { size: 9, bold: i === 8 && r.overtimeHours > 0, color: { argb: i === 8 && r.overtimeHours > 0 ? 'FFD97706' : 'FF0F172A' } };
        c.alignment = { vertical: 'middle', horizontal: i <= 4 ? 'left' : 'center' };
        c.border = thinBorder;
      });
    });

    const widths = [6, 26, 13, 14, 22, 12, 12, 11, 10, 6, 6, 6, 7, 6, 6, 9, 15];
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function generatePayrollPdfBuffer(db, month, teamId = 'all') {
  const payload = buildPayrollExportData(db, month, teamId);
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tmpJson = path.join(os.tmpdir(), `uuds_payroll_in_${stamp}.json`);
  const tmpPdf = path.join(os.tmpdir(), `uuds_payroll_out_${stamp}.pdf`);
  const scriptPath = path.join(__dirname, 'export_payroll_pdf.py');

  fs.writeFileSync(tmpJson, JSON.stringify(payload), 'utf-8');
  try {
    await execFileAsync('python', [scriptPath, tmpJson, tmpPdf], { maxBuffer: 20 * 1024 * 1024 });
    return fs.readFileSync(tmpPdf);
  } finally {
    if (fs.existsSync(tmpJson)) fs.unlinkSync(tmpJson);
    if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
  }
}

export async function generateOvertimeExcelBuffer(db, month = '2026-11', teamId = 'all') {
  const monthMeta = db.prepare('SELECT * FROM roster_months WHERE month = ?').get(month);
  const monthLabel = monthMeta?.label || month;

  let query = `
    SELECT ot.*, e.name AS emp_name, e.uuds_no, e.contingent_no, e.skill, t.name AS team_name
    FROM overtime_records ot
    JOIN employees e ON e.id = ot.employee_id
    JOIN teams t ON t.id = ot.team_id
    WHERE ot.month = ?
  `;
  const params = [month];
  if (teamId && teamId !== 'all') {
    query += ' AND ot.team_id = ?';
    params.push(teamId);
  }
  query += ' ORDER BY ot.day ASC, ot.team_id ASC, e.name ASC';
  const rows = db.prepare(query).all(...params);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'UUDS DXB Workshop Command';
  wb.created = new Date();

  const ws = wb.addWorksheet('Approved Overtime Form', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };

  function formatAviationDate(dateStr, day, month) {
    let d;
    if (dateStr && typeof dateStr === 'string' && dateStr.includes('-')) {
      const parts = dateStr.split('-');
      if (parts.length === 3) d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      else d = new Date(dateStr);
    } else if (month && day) {
      const [y, m] = month.split('-').map(Number);
      d = new Date(y, m - 1, Number(day));
    }
    if (!d || isNaN(d.getTime())) return dateStr || '-';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dd = String(d.getDate()).padStart(2, '0');
    const mmm = months[d.getMonth()];
    const yyyy = d.getFullYear();
    return `${dd}-${mmm}-${yyyy}`;
  }

  // Header Title Row 1 (Clean white, no background fill)
  ws.mergeCells(1, 1, 1, 14);
  const title1 = ws.getCell(1, 1);
  title1.value = 'UUDS Aero DWC (DXB Workshop)';
  title1.font = { bold: true, size: 14, color: { argb: 'FF0F172A' } };
  title1.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 26;

  // Header Title Row 2 (Clean white, no background fill)
  ws.mergeCells(2, 1, 2, 14);
  const title2 = ws.getCell(2, 1);
  title2.value = `MONTHLY OVERTIME RECORD FORM — ${monthLabel.toUpperCase()}`;
  title2.font = { bold: true, size: 11, color: { argb: 'FF1E293B' } };
  title2.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 22;

  // Table Column Headers (Row 4, all centered)
  const headers = [
    'SN', 'Date', 'UUDS ID', 'Staff Name', 'Trade / Skill',
    'Team', 'Shift', 'Duty End', 'Finish Time', 'Total Extra (Hrs)',
    '1st 2-Hrs Non-OT', 'Approved OT (Hrs)', 'Work Reason / A/C Reg / Bay', 'Team Manager Signature'
  ];
  const hRow = ws.getRow(4);
  hRow.height = 24;
  headers.forEach((h, i) => {
    const c = hRow.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = thinBorder;
  });

  let totalExtra = 0;
  let totalDeducted = 0;
  let totalApproved = 0;

  let rIdx = 5;
  rows.forEach((r, idx) => {
    const row = ws.getRow(rIdx);
    row.height = 20;
    totalExtra += Number(r.total_extra_hours || 0);
    totalDeducted += Number(r.buffer_hours || 2.0);
    totalApproved += Number(r.approved_ot_hours || 0);

    const values = [
      idx + 1,
      formatAviationDate(r.date_str, r.day, month),
      r.uuds_no || '-',
      r.emp_name,
      r.skill,
      r.team_name,
      r.shift_code || 'D',
      r.scheduled_end_time || '20:00',
      r.actual_end_time,
      Number(r.total_extra_hours).toFixed(1),
      `-${Number(r.buffer_hours || 2.0).toFixed(1)}`,
      Number(r.approved_ot_hours).toFixed(1),
      `${r.aircraft_reg ? r.aircraft_reg + ' · ' : ''}${r.reason || ''}${r.location_bay ? ' (' + r.location_bay + ')' : ''}`,
      '' // Blank for physical signature on paper
    ];

    values.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      c.font = {
        size: 9,
        bold: i === 11,
        color: { argb: i === 11 ? 'FF047857' : (i === 10 ? 'FFB45309' : 'FF0F172A') }
      };
      if (i === 11) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
      }
      c.alignment = { vertical: 'middle', horizontal: (i === 3 || i === 12) ? 'left' : 'center' };
      c.border = thinBorder;
    });
    rIdx++;
  });

  // Totals Row
  const totalRow = ws.getRow(rIdx);
  totalRow.height = 24;
  totalRow.getCell(1).value = 'TOTALS';
  ws.mergeCells(rIdx, 1, rIdx, 9);
  totalRow.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
  totalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'right' };
  totalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

  totalRow.getCell(10).value = totalExtra.toFixed(1);
  totalRow.getCell(10).font = { bold: true, size: 10 };
  totalRow.getCell(10).alignment = { vertical: 'middle', horizontal: 'center' };
  totalRow.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

  totalRow.getCell(11).value = `-${totalDeducted.toFixed(1)}`;
  totalRow.getCell(11).font = { bold: true, size: 10, color: { argb: 'FFB45309' } };
  totalRow.getCell(11).alignment = { vertical: 'middle', horizontal: 'center' };
  totalRow.getCell(11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

  totalRow.getCell(12).value = totalApproved.toFixed(1);
  totalRow.getCell(12).font = { bold: true, size: 11, color: { argb: 'FF047857' } };
  totalRow.getCell(12).alignment = { vertical: 'middle', horizontal: 'center' };
  totalRow.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };

  ws.mergeCells(rIdx, 13, rIdx, 14);
  totalRow.getCell(13).value = `${rows.length} Total Duty OT Records`;
  totalRow.getCell(13).font = { bold: true, size: 9, color: { argb: 'FF475569' } };
  totalRow.getCell(13).alignment = { vertical: 'middle', horizontal: 'center' };
  totalRow.getCell(13).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

  for (let c = 1; c <= 14; c++) {
    totalRow.getCell(c).border = thinBorder;
  }

  // Signature Block at Bottom
  rIdx += 3;
  ws.getRow(rIdx).height = 20;
  ws.getCell(rIdx, 2).value = 'APPROVAL & AUTHORIZATION SIGN-OFF:';
  ws.getCell(rIdx, 2).font = { bold: true, size: 10, underline: true, color: { argb: 'FF0F172A' } };

  rIdx += 1;
  // Box 1: Workshop Manager
  ws.mergeCells(rIdx, 2, rIdx + 3, 6);
  const box1 = ws.getCell(rIdx, 2);
  box1.value = 'WORKSHOP MANAGER APPROVAL:\n\nName: ______________________\nSignature: __________________   Date: __/__/2026';
  box1.font = { size: 9, bold: true };
  box1.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  box1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  box1.border = thinBorder;

  // Box 2: Project Manager (JOSEPH SHERONNE)
  ws.mergeCells(rIdx, 8, rIdx + 3, 13);
  const box2 = ws.getCell(rIdx, 8);
  box2.value = 'PROJECT MANAGER APPROVAL:\n\nName: JOSEPH SHERONNE\nSignature: __________________   Date: __/__/2026';
  box2.font = { size: 9, bold: true };
  box2.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  box2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  box2.border = thinBorder;

  const colWidths = [5, 14, 13, 24, 18, 16, 7, 10, 11, 13, 14, 14, 28, 24];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
