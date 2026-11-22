import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Lock,
  MessageCircle,
  Paintbrush,
  Printer,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Unlock,
  X,
} from 'lucide-react';
import { SHIFT_CODES, SHIFT_STYLES, apiFetch } from '../api.js';
import WhatsAppModal from './WhatsAppModal.jsx';

const getShortTeamName = (t) => {
  if (!t) return '';
  const id = t.id || '';
  if (id === 'a-check') return 'A-Check';
  if (id === 'team-a') return 'Team A';
  if (id === 'team-b') return 'Team B';
  if (id === 'team-c') return 'Team C';
  if (id === 'leather-team') return 'Leather';
  if (id === 'paint-booth') return 'Paint';
  if (id === 'workshop-team') return 'Workshop';
  if (id === 'stores-team') return 'Stores';
  if (id === 'office') return 'Office';
  if (id === 'planner') return 'Planner';
  return (t.name || '').replace(/On Wing\s*/i, '').replace(/\s*Team/i, '').replace(/&.*$/, '').trim();
};

export default function MasterRosterGrid({
  month,
  teams,
  selectedTeamId,
  setSelectedTeamId,
  onDataChanged,
  notify,
  onStartSwapOrCover,
}) {
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [skillFilter, setSkillFilter] = useState('ALL');
  const [paintMode, setPaintMode] = useState(false);
  const [paintShift, setPaintShift] = useState('V');
  const [paintReason, setPaintReason] = useState('Schedule adjustment');
  const [activeCell, setActiveCell] = useState(null); // { row, day, cell }
  const [cellForm, setCellForm] = useState({ shiftCode: 'D', isOvertime: false, deployedTeamId: '', reason: '' });
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkForm, setBulkForm] = useState({ employeeId: '', startDay: 1, endDay: 5, shiftCode: 'V', reason: '' });
  const [revModal, setRevModal] = useState(false);
  const [revNotes, setRevNotes] = useState('');
  const [waModal, setWaModal] = useState(false);
  const [undoStack, setUndoStack] = useState([]);

  const loadRoster = async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/roster?month=${month}&teamId=${selectedTeamId}`);
      setRoster(data);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoster();
    setUndoStack([]);
  }, [month, selectedTeamId]);

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    try {
      await apiFetch('/api/roster/cell', {
        method: 'PATCH',
        body: JSON.stringify({
          month: last.month,
          day: last.day,
          employeeId: last.employeeId,
          shiftCode: last.prevShift,
          isOvertime: last.prevIsOvertime,
          deployedTeamId: last.prevDeployedTeamId,
          reason: `Undo edit (restored ${last.prevShift})`,
        }),
      });
      setUndoStack((s) => s.slice(0, -1));
      notify(`Undid ${last.employeeName} Day ${last.day} → ${last.prevShift}`);
      loadRoster();
      onDataChanged();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !activeCell && !bulkModal && !revModal) {
        if (undoStack.length > 0) {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undoStack, activeCell, bulkModal, revModal]);

  const toggleDraftPublished = async () => {
    const currentStatus = roster?.teamStatus?.status || 'PUBLISHED';
    const nextStatus = currentStatus === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    try {
      await apiFetch('/api/roster/status', {
        method: 'POST',
        body: JSON.stringify({ month, teamId: selectedTeamId, status: nextStatus }),
      });
      notify(`Roster status changed to ${nextStatus}`);
      loadRoster();
      onDataChanged();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const skills = useMemo(() => {
    if (!roster) return [];
    return ['ALL', ...new Set(roster.rows.map((r) => r.skill))];
  }, [roster]);

  const filteredRows = useMemo(() => {
    if (!roster) return [];
    const q = search.trim().toLowerCase();
    return roster.rows.filter((r) => {
      if (skillFilter !== 'ALL' && r.skill !== skillFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.uudsNo.toLowerCase().includes(q) ||
        r.contingentNo.toLowerCase().includes(q) ||
        r.teamName.toLowerCase().includes(q)
      );
    });
  }, [roster, search, skillFilter]);

  const applyQuickShift = async (row, day, cell, nextCode, customReason) => {
    try {
      const res = await apiFetch('/api/roster/cell', {
        method: 'PATCH',
        body: JSON.stringify({
          month,
          day,
          employeeId: row.id,
          shiftCode: nextCode,
          reason: customReason || `Quick update to ${nextCode}`,
        }),
      });
      setUndoStack((s) => [
        ...s.slice(-29),
        {
          month,
          day,
          employeeId: row.id,
          employeeName: row.name,
          prevShift: cell.code,
          prevIsOvertime: cell.isOvertime,
          prevDeployedTeamId: cell.deployedTeamId || row.teamId,
        },
      ]);
      if (res.warnings?.length) {
        notify(`Updated ${row.name} Day ${day} → ${nextCode} (⚠ ${res.warnings[0]})`, 'error');
      } else {
        notify(`Updated ${row.name} Day ${day} → ${nextCode}`);
      }
      loadRoster();
      onDataChanged();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const handleCellClick = async (row, day, cell) => {
    if (paintMode) {
      await applyQuickShift(row, day, cell, paintShift, paintReason || `Paint mode update to ${paintShift}`);
      return;
    }

    setActiveCell({ row, day, cell });
    setCellForm({
      shiftCode: cell.code,
      isOvertime: cell.isOvertime,
      deployedTeamId: cell.deployedTeamId || row.teamId,
      reason: cell.notes || '',
    });
  };

  const handleCellKeyDown = async (e, rowIdx, dayIdx, row, cell) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      let nextRow = rowIdx;
      let nextDay = dayIdx;
      if (e.key === 'ArrowRight') nextDay = Math.min((roster?.days?.length || 31) - 1, dayIdx + 1);
      if (e.key === 'ArrowLeft') nextDay = Math.max(0, dayIdx - 1);
      if (e.key === 'ArrowDown') nextRow = Math.min(filteredRows.length - 1, rowIdx + 1);
      if (e.key === 'ArrowUp') nextRow = Math.max(0, rowIdx - 1);
      const targetEl = document.getElementById(`roster-cell-${nextRow}-${nextDay}`);
      if (targetEl) targetEl.focus();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      setActiveCell({ row, day: cell.day, cell });
      setCellForm({
        shiftCode: cell.code,
        isOvertime: cell.isOvertime,
        deployedTeamId: cell.deployedTeamId || row.teamId,
        reason: cell.notes || '',
      });
      return;
    }
    const keyMap = { d: 'D', n: 'N', m: 'M', t: 'T', o: 'OFF', v: 'V', s: 'SL', l: 'L' };
    const mapped = keyMap[e.key.toLowerCase()];
    if (mapped && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      await applyQuickShift(row, cell.day, cell, mapped, `Keyboard shortcut (${mapped})`);
    }
  };

  const saveCellEdit = async (e) => {
    e.preventDefault();
    if (!activeCell) return;
    try {
      const res = await apiFetch('/api/roster/cell', {
        method: 'PATCH',
        body: JSON.stringify({
          month,
          day: activeCell.day,
          employeeId: activeCell.row.id,
          ...cellForm,
        }),
      });
      setUndoStack((s) => [
        ...s.slice(-29),
        {
          month,
          day: activeCell.day,
          employeeId: activeCell.row.id,
          employeeName: activeCell.row.name,
          prevShift: activeCell.cell.code,
          prevIsOvertime: activeCell.cell.isOvertime,
          prevDeployedTeamId: activeCell.cell.deployedTeamId || activeCell.row.teamId,
        },
      ]);
      if (res.warnings?.length) {
        notify(`Saved ${activeCell.row.name} Day ${activeCell.day} (⚠ ${res.warnings[0]})`, 'error');
      } else {
        notify(`Saved ${activeCell.row.name} Day ${activeCell.day} (${cellForm.shiftCode})`);
      }
      setActiveCell(null);
      loadRoster();
      onDataChanged();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/api/roster/bulk', {
        method: 'POST',
        body: JSON.stringify({
          month,
          employeeIds: [Number(bulkForm.employeeId)],
          startDay: Number(bulkForm.startDay),
          endDay: Number(bulkForm.endDay),
          shiftCode: bulkForm.shiftCode,
          reason: bulkForm.reason || `Bulk ${bulkForm.shiftCode} applied`,
        }),
      });
      notify(`Applied ${bulkForm.shiftCode} for Days ${bulkForm.startDay}–${bulkForm.endDay}`);
      setBulkModal(false);
      loadRoster();
      onDataChanged();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handlePublishRevision = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/revisions/publish', {
        method: 'POST',
        body: JSON.stringify({ month, teamId: selectedTeamId, notes: revNotes }),
      });
      notify(`Published revision: ${res.published.map((p) => `${p.teamName} ${p.revision}`).join(', ')}`);
      setRevModal(false);
      setRevNotes('');
      loadRoster();
      onDataChanged();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* 1st Line: Team Selector Pills in ONE line at top */}
      <div className="no-print flex items-center gap-1.5 overflow-x-auto pb-1.5 whitespace-nowrap scrollbar-thin">
        <button
          onClick={() => setSelectedTeamId('all')}
          className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
            selectedTeamId === 'all'
              ? 'bg-slate-900 text-white shadow-sm ring-1 ring-slate-900'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          All Teams ({teams.reduce((s, t) => s + (t.staffCount || 0), 0)})
        </button>
        {teams.map((t) => {
          const shortName = getShortTeamName(t);
          const isSelected = selectedTeamId === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSelectedTeamId(t.id)}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                isSelected
                  ? 'bg-slate-900 text-white shadow-sm ring-1 ring-slate-900'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {shortName} ({t.staffCount})
            </button>
          );
        })}
      </div>

      {/* Controls & Quick Paint Toolbar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, UUDS, Contingent..."
              className="w-56 rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs focus:border-sky-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none"
            >
              {skills.map((sk) => (
                <option key={sk} value={sk}>
                  {sk === 'ALL' ? 'All Skills' : sk}
                </option>
              ))}
            </select>
          </div>

          {/* Paint Mode */}
          <button
            onClick={() => setPaintMode((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
              paintMode
                ? 'bg-sky-600 text-white shadow-sm'
                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Paintbrush className="h-3.5 w-3.5" />
            {paintMode ? 'Quick-Paint ON' : 'Quick-Paint'}
          </button>

          {paintMode && (
            <div className="flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1">
              <span className="text-[11px] font-bold text-sky-900">Brush:</span>
              <select
                value={paintShift}
                onChange={(e) => setPaintShift(e.target.value)}
                className="rounded-lg border border-sky-300 bg-white px-2 py-0.5 text-xs font-bold text-slate-800"
              >
                {SHIFT_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c} — {SHIFT_STYLES[c]?.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={paintReason}
                onChange={(e) => setPaintReason(e.target.value)}
                placeholder="Reason..."
                className="w-36 rounded-lg border border-sky-200 bg-white px-2 py-0.5 text-xs"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {undoStack.length > 0 && (
            <button
              onClick={handleUndo}
              title="Undo last shift change (Ctrl+Z)"
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Undo ({undoStack.length})
            </button>
          )}
          {roster?.teamStatus && (
            <button
              onClick={toggleDraftPublished}
              title="Toggle Draft / Published status"
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold ${
                roster.teamStatus.status === 'PUBLISHED'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              {roster.teamStatus.status === 'PUBLISHED' ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              {roster.teamStatus.status} · {roster.teamStatus.revision}
            </button>
          )}
          <button
            onClick={() => {
              if (filteredRows[0]) setBulkForm((f) => ({ ...f, employeeId: filteredRows[0].id }));
              setBulkModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Bulk Date Range
          </button>
          <button
            onClick={() => setRevModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
          >
            <Save className="h-3.5 w-3.5" /> Save Revision
          </button>
          <a
            href={`/api/export/excel?month=${month}&teamId=${selectedTeamId}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel (.xlsx)
          </a>
          <a
            href={`/api/export/pdf?month=${month}&teamId=${selectedTeamId}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100"
          >
            <FileText className="h-3.5 w-3.5" /> PDF
          </a>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <button
            onClick={() => setWaModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </button>
        </div>
      </div>

      {/* Print Header */}
      {roster && (
        <div className="hidden print-only mb-2">
          <h1 className="text-base font-extrabold uppercase">
            UUDS DXB WORKSHOP — {roster.team ? roster.team.full_name : 'MASTER ROSTER'} — {roster.month.label.toUpperCase()} ({roster.revisions[0]?.revision || roster.month.revision})
          </h1>
        </div>
      )}

      {/* Main Roster Matrix Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading || !roster ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-500">Loading roster grid...</div>
        ) : (
          <div className="roster-scroll max-h-[68vh] overflow-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-20 bg-slate-900 text-white">
                <tr>
                  <th className="sticky left-0 z-30 border border-slate-700 bg-slate-900 px-2 py-2 text-center">NO</th>
                  <th className="sticky left-8 z-30 min-w-[190px] border border-slate-700 bg-slate-900 px-2.5 py-2 text-left">
                    NAME
                  </th>
                  <th className="border border-slate-700 px-2 py-2 text-left">SKILL</th>
                  <th className="border border-slate-700 px-2 py-2 text-left">UUDS NO</th>
                  {selectedTeamId === 'all' && <th className="border border-slate-700 px-2 py-2 text-left">TEAM</th>}
                  {roster.days.map((d) => (
                    <th
                      key={d.day}
                      className={`min-w-[34px] border border-slate-700 px-1 py-1 text-center ${
                        d.dow === 'SUN' || d.dow === 'SAT' ? 'bg-slate-800 text-amber-300' : ''
                      }`}
                    >
                      <div className="text-[9px] font-medium opacity-80">{d.dow}</div>
                      <div className="text-xs font-bold">{d.day}</div>
                    </th>
                  ))}
                  <th className="border border-slate-700 bg-slate-800 px-2 py-2 text-center">DAYS</th>
                  <th className="border border-slate-700 bg-slate-800 px-2 py-2 text-center">HRS</th>
                  <th className="border border-slate-700 bg-slate-800 px-2 py-2 text-left">ROTATION</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, idx) => (
                  <tr key={row.id} className="group hover:bg-sky-50/50">
                    <td className="sticky left-0 z-10 border border-slate-200 bg-white px-2 py-1.5 text-center font-semibold text-slate-500 group-hover:bg-sky-50">
                      {idx + 1}
                    </td>
                    <td className="sticky left-8 z-10 border border-slate-200 bg-white px-2.5 py-1.5 font-bold text-slate-900 group-hover:bg-sky-50">
                      <div className="truncate max-w-[190px]" title={row.name}>{row.name}</div>
                    </td>
                    <td className="whitespace-nowrap border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-600">
                      {row.skill}
                    </td>
                    <td className="whitespace-nowrap border border-slate-200 px-2 py-1.5 font-mono text-[10px] text-slate-600">
                      {row.uudsNo || row.contingentNo}
                    </td>
                    {selectedTeamId === 'all' && (
                      <td className="whitespace-nowrap border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-700">
                        {row.teamName}
                      </td>
                    )}
                    {row.shifts.map((cell, dayIdx) => {
                      const st = SHIFT_STYLES[cell.code] || SHIFT_STYLES.OFF;
                      return (
                        <td
                          key={cell.day}
                          id={`roster-cell-${idx}-${dayIdx}`}
                          tabIndex={0}
                          onKeyDown={(e) => handleCellKeyDown(e, idx, dayIdx, row, cell)}
                          onClick={() => handleCellClick(row, cell.day, cell)}
                          title={`${row.name} · Day ${cell.day}: ${cell.code}${cell.isOvertime ? ' (OT)' : ''}${
                            cell.deployedTeamName ? ` · Loaned to ${cell.deployedTeamName}` : ''
                          }${cell.notes ? ` · ${cell.notes}` : ''} (Arrow keys to move, D/N/M/T/O/V/S/L to set)`}
                          className="relative cursor-pointer border border-slate-200 p-0.5 text-center transition hover:ring-2 hover:ring-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        >
                          <div
                            className={`flex h-6 items-center justify-center rounded-sm text-[10px] font-extrabold ${st.bg} ${st.text}`}
                          >
                            {cell.code}
                          </div>
                          {cell.isOvertime && (
                            <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-sky-300 ring-1 ring-slate-900" />
                          )}
                          {cell.deployedTeamName && (
                            <span className="absolute bottom-0.5 left-0.5 h-1.5 w-1.5 rounded-full bg-amber-300 ring-1 ring-slate-900" />
                          )}
                        </td>
                      );
                    })}
                    <td className="border border-slate-200 bg-slate-50 px-2 py-1.5 text-center font-bold text-emerald-800">
                      {row.stats.workedDays}
                    </td>
                    <td className="border border-slate-200 bg-slate-50 px-2 py-1.5 text-center font-mono text-[10px] font-semibold text-slate-700">
                      {row.stats.hours}h
                    </td>
                    <td className="whitespace-nowrap border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] text-slate-600">
                      {row.patternLabel}
                    </td>
                  </tr>
                ))}

                {/* Daily Totals Row */}
                <tr className="sticky bottom-0 z-20 bg-slate-100 font-extrabold text-slate-900">
                  <td colSpan={selectedTeamId === 'all' ? 5 : 4} className="sticky left-0 z-30 border border-slate-300 bg-slate-200 px-3 py-2 text-right">
                    TOTAL ON DUTY ({filteredRows.length} staff)
                  </td>
                  {roster.dailyTotals.map((dt) => (
                    <td key={dt.day} className="border border-slate-300 bg-slate-100 px-1 py-2 text-center">
                      {dt.onDuty}
                    </td>
                  ))}
                  <td colSpan={3} className="border border-slate-300 bg-slate-200 px-2 py-2 text-center text-[10px]">
                    D/N/M/T Active
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend + Team Timing Details */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {SHIFT_CODES.map((c) => (
            <span key={c} className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-bold ${SHIFT_STYLES[c].pill}`}>
              {c} = {SHIFT_STYLES[c].label}
            </span>
          ))}
        </div>
        {roster?.team && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
            <span className="font-bold text-slate-800">Timings:</span>
            {Object.entries(roster.team.shiftTimings || {}).map(([k, v]) => (
              <span key={k} className="rounded bg-slate-100 px-2 py-0.5">
                <strong>{k}:</strong> {v}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Cell Edit Modal */}
      {activeCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">{activeCell.row.name}</h3>
                <p className="text-xs text-slate-500">
                  {activeCell.row.teamName} · {activeCell.row.skill} · Day {activeCell.day}
                </p>
              </div>
              <button onClick={() => setActiveCell(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={saveCellEdit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">Assign Shift Code</label>
                <div className="grid grid-cols-3 gap-2">
                  {SHIFT_CODES.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setCellForm((f) => ({ ...f, shiftCode: c }))}
                      className={`rounded-xl border px-2.5 py-2 text-xs font-bold transition ${
                        cellForm.shiftCode === c
                          ? `${SHIFT_STYLES[c].bg} ${SHIFT_STYLES[c].text} ring-2 ring-slate-900`
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {c} · {SHIFT_STYLES[c].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={cellForm.isOvertime}
                    onChange={(e) => setCellForm((f) => ({ ...f, isOvertime: e.target.checked }))}
                  />
                  Mark as Overtime / Cover
                </label>

                <div>
                  <select
                    value={cellForm.deployedTeamId}
                    onChange={(e) => setCellForm((f) => ({ ...f, deployedTeamId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold"
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        Deploy: {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Reason / Audit Note</label>
                <input
                  type="text"
                  value={cellForm.reason}
                  onChange={(e) => setCellForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="e.g., Covering for sick teammate / AOG surge"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = { employeeId: activeCell.row.id, day: activeCell.day, teamId: activeCell.row.teamId, skill: activeCell.row.skill };
                    setActiveCell(null);
                    onStartSwapOrCover(target);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" /> Find Cover / Swap
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveCell(null)}
                    className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                  >
                    <Check className="h-3.5 w-3.5" /> Save Shift
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Range Modal */}
      {bulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Apply Bulk Date Range</h3>
              <button onClick={() => setBulkModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleBulkSubmit} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Employee</label>
                <select
                  value={bulkForm.employeeId}
                  onChange={(e) => setBulkForm((f) => ({ ...f, employeeId: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
                >
                  {roster?.rows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.teamName})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Start Day</label>
                  <input
                    type="number"
                    min={1}
                    max={roster?.month.days_in_month || 31}
                    value={bulkForm.startDay}
                    onChange={(e) => setBulkForm((f) => ({ ...f, startDay: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">End Day</label>
                  <input
                    type="number"
                    min={1}
                    max={roster?.month.days_in_month || 31}
                    value={bulkForm.endDay}
                    onChange={(e) => setBulkForm((f) => ({ ...f, endDay: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Shift</label>
                  <select
                    value={bulkForm.shiftCode}
                    onChange={(e) => setBulkForm((f) => ({ ...f, shiftCode: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
                  >
                    {SHIFT_CODES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Reason</label>
                <input
                  type="text"
                  value={bulkForm.reason}
                  onChange={(e) => setBulkForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="e.g., Approved Annual Vacation / Safety Training"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setBulkModal(false)} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600">
                  Cancel
                </button>
                <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white">
                  Apply Range
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Save Revision Modal */}
      {revModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">Publish Roster Revision</h3>
            <p className="mt-1 text-xs text-slate-500">
              Creates a permanent snapshot (R00, R01, R02...) in the historical archive for audit & comparison.
            </p>
            <form onSubmit={handlePublishRevision} className="mt-4 space-y-3">
              <textarea
                rows={3}
                value={revNotes}
                onChange={(e) => setRevNotes(e.target.value)}
                placeholder="Revision notes (e.g., Updated Leather Team vacation dates and Team B cover)"
                className="w-full rounded-xl border border-slate-200 p-3 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setRevModal(false)} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600">
                  Cancel
                </button>
                <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">
                  Publish Snapshot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WhatsApp Share Modal */}
      <WhatsAppModal
        isOpen={waModal}
        onClose={() => setWaModal(false)}
        roster={roster}
        month={month}
        teamId={selectedTeamId}
        notify={notify}
      />
    </div>
  );
}
