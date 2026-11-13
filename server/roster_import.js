import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import * as XLSX from 'xlsx';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_SCRIPT = path.join(__dirname, 'parse_roster_pdf.py');

const MONTH_MAP = {
  JANUARY: '01', JAN: '01',
  FEBRUARY: '02', FEB: '02',
  MARCH: '03', MAR: '03',
  APRIL: '04', APR: '04',
  MAY: '05',
  JUNE: '06', JUN: '06',
  JULY: '07', JUL: '07',
  AUGUST: '08', AUG: '08',
  SEPTEMBER: '09', SEP: '09', SEPT: '09',
  OCTOBER: '10', OCT: '10',
  NOVEMBER: '11', NOV: '11',
  DECEMBER: '12', DEC: '12',
};

export function normShiftCode(val) {
  const s = String(val ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!s || s === '-') return '';
  if (['D', 'DAY', 'DAY SHIFT'].includes(s)) return 'D';
  if (['N', 'NIGHT', 'NIGHT SHIFT'].includes(s)) return 'N';
  if (['M', 'GENERAL', 'GEN'].includes(s)) return 'M';
  if (['T', 'TRAINING', 'TRAINING (T)'].includes(s)) return 'T';
  if (['V', 'VAC', 'VACATION', 'VACCATION'].includes(s)) return 'V';
  if (['L', 'LEAVE', 'ON LEAVE'].includes(s)) return 'L';
  if (['SL', 'SICK', 'SICK LEAVE'].includes(s)) return 'SL';
  if (['EM', 'EMERGENCY'].includes(s)) return 'EM';
  if (['OFF', 'DAY OFF', 'DUTY OFF', 'OFF DAY'].includes(s)) return 'OFF';
  return s;
}

export function detectHintsFromText(text = '') {
  const up = text.toUpperCase();
  let teamId = '';
  if (up.includes('LEATHER')) teamId = 'leather-team';
  else if (up.includes('PAINT BOOTH')) teamId = 'paint-booth';
  else if (up.includes('WORKSHOP')) teamId = 'workshop-team';
  else if (up.includes('PAINT')) teamId = 'paint-booth';
  else if (up.includes('TEAM A') || up.includes('TEAM-A')) teamId = 'team-a';
  else if (up.includes('TEAM B') || up.includes('TEAM-B')) teamId = 'team-b';
  else if (up.includes('TEAM C') || up.includes('TEAM-C')) teamId = 'team-c';

  const yearMatch = up.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());
  let monthNum = '';
  for (const [k, v] of Object.entries(MONTH_MAP)) {
    if (new RegExp(`\\b${k}\\b`).test(up)) {
      monthNum = v;
      break;
    }
  }
  const ymMatch = up.match(/\b(20\d{2})[-_/](\d{2})\b/);
  const month = ymMatch ? `${ymMatch[1]}-${ymMatch[2]}` : (monthNum ? `${year}-${monthNum}` : '');
  const revMatch = up.match(/\b(R\d{2})\b/);
  const revision = revMatch ? revMatch[1] : 'R00';

  return { teamId, month, revision };
}

export function parseSpreadsheetBuffer(buffer, originalName = '', requestedSheet = '') {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = wb.SheetNames || [];
  if (sheetNames.length === 0) throw new Error('No sheets found in uploaded Excel/CSV file');

  const sheetName = requestedSheet && sheetNames.includes(requestedSheet) ? requestedSheet : sheetNames[0];
  const ws = wb.Sheets[sheetName];

  // Expand merged cells so merged Vacation ('V') ranges carry across all days
  const merges = ws['!merges'] || [];
  for (const m of merges) {
    const topLeftRef = XLSX.utils.encode_cell(m.s);
    const topLeftCell = ws[topLeftRef];
    if (topLeftCell && topLeftCell.v !== undefined && topLeftCell.v !== '') {
      for (let r = m.s.r; r <= m.e.r; r++) {
        for (let c = m.s.c; c <= m.e.c; c++) {
          const ref = XLSX.utils.encode_cell({ r, c });
          if (!ws[ref]) ws[ref] = { t: topLeftCell.t, v: topLeftCell.v };
        }
      }
    }
  }

  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const topText = grid.slice(0, 5).flat().join(' ') + ' ' + sheetName + ' ' + originalName;
  const hints = detectHintsFromText(topText);

  let dayRowIdx = -1;
  let dayCols = new Map();
  let nameCol = -1;
  let skillCol = -1;
  let uudsCol = -1;
  let contCol = -1;
  let seqCol = -1;

  for (let ri = 0; ri < Math.min(10, grid.length); ri++) {
    const row = grid[ri];
    const foundDays = new Map();
    for (let ci = 0; ci < row.length; ci++) {
      const val = String(row[ci] ?? '').trim();
      if (/^\d{1,2}$/.test(val)) {
        const num = Number(val);
        if (num >= 1 && num <= 31 && !Array.from(foundDays.values()).includes(num)) {
          foundDays.set(ci, num);
        }
      }
    }
    if (foundDays.size >= 15 && dayRowIdx === -1) {
      dayRowIdx = ri;
      dayCols = foundDays;
    }

    for (let ci = 0; ci < row.length; ci++) {
      const cu = String(row[ci] ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
      if (cu === 'NAME' && nameCol === -1) nameCol = ci;
      else if (cu.includes('SKILL') && skillCol === -1) skillCol = ci;
      else if (cu.includes('UUDS') && uudsCol === -1) uudsCol = ci;
      else if ((cu.includes('CONT') || cu.includes('CON.')) && contCol === -1) contCol = ci;
      else if (['NO', 'NO:', 'N0', 'SL.NO', '#'].includes(cu) && seqCol === -1) seqCol = ci;
    }
  }

  if (nameCol === -1 || dayCols.size === 0) {
    throw new Error('Could not find NAME column and Day 1..31 columns in spreadsheet.');
  }

  let headerEnd = dayRowIdx;
  for (let ri = 0; ri < Math.min(10, grid.length); ri++) {
    if (String(grid[ri][nameCol] ?? '').trim().toUpperCase() === 'NAME') {
      headerEnd = Math.max(headerEnd, ri);
    }
  }

  const sortedDayCols = Array.from(dayCols.entries()).sort((a, b) => a[1] - b[1]);
  const daysDetected = sortedDayCols[sortedDayCols.length - 1][1];
  const staffRows = [];

  for (let ri = headerEnd + 1; ri < grid.length; ri++) {
    const r = grid[ri];
    const name = String(r[nameCol] ?? '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const up = name.toUpperCase();
    if (['DUTY TIME', 'TOTAL ON DUTY', 'NO:OF STAFF', 'TIMING DETAILS', 'D', 'N', 'M', 'OFF', 'V', 'VACATION'].includes(up) || up.includes('CHECKED')) {
      break;
    }

    const shifts = sortedDayCols.map(([ci]) => normShiftCode(r[ci]) || 'OFF');
    let skill = skillCol >= 0 ? String(r[skillCol] ?? '').trim() : '';
    if (!skill && up.includes('(TEAM LEADER)')) skill = 'TEAM LEADER';

    staffRows.push({
      seqNo: seqCol >= 0 ? String(r[seqCol] ?? '').trim() || String(staffRows.length + 1) : String(staffRows.length + 1),
      name,
      skill: skill || 'TECHNICIAN',
      uudsNo: uudsCol >= 0 ? String(r[uudsCol] ?? '').replace(/\s+/g, '').trim() : '',
      contingentNo: contCol >= 0 ? String(r[contCol] ?? '').trim() : '',
      shifts,
    });
  }

  return {
    ...hints,
    sheetNames,
    activeSheet: sheetName,
    daysDetected,
    staffRows,
  };
}

export async function parsePdfBuffer(buffer, originalName = '') {
  const tmpPath = path.join(os.tmpdir(), `uuds_roster_${Date.now()}.pdf`);
  fs.writeFileSync(tmpPath, buffer);
  try {
    const { stdout } = await execFileAsync('python', [PDF_SCRIPT, tmpPath], { maxBuffer: 10 * 1024 * 1024 });
    const match = stdout.match(/__JSON_START__([\s\S]*?)__JSON_END__/);
    const jsonStr = match ? match[1] : stdout;
    const parsed = JSON.parse(jsonStr);
    const nameHints = detectHintsFromText(originalName);
    return {
      teamId: parsed.teamId || nameHints.teamId,
      month: parsed.month || nameHints.month,
      revision: parsed.revision !== 'R00' ? parsed.revision : nameHints.revision,
      sheetNames: [],
      activeSheet: '',
      daysDetected: parsed.daysDetected,
      staffRows: parsed.staffRows,
    };
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}
