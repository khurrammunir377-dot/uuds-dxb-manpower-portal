import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  CalendarCheck2,
  Check,
  ChevronDown,
  Filter,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Undo2,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '../api.js';

export default function QuickDatesEditor({
  teams = [],
  employees = [],
  activeMonth = '2026-11',
  onDataChanged,
  notify,
}) {
  // Local working copy of employee dates: { [id]: { airsidePassExpiry, contingentCardExpiry, visaExpiry, joinDate, dxbShiftDate } }
  const [editedDates, setEditedDates] = useState({});
  const [saving, setSaving] = useState(false);
  const [savingRowId, setSavingRowId] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, EXPIRED, CRITICAL, UPCOMING, UNSAVED, MISSING

  // Bulk column filler tool
  const [bulkField, setBulkField] = useState('airsidePassExpiry');
  const [bulkDate, setBulkDate] = useState('');
  const [showBulkTool, setShowBulkTool] = useState(false);

  // Initialize or reset editedDates when employees prop changes
  useEffect(() => {
    const initial = {};
    for (const emp of employees) {
      initial[emp.id] = {
        passportNo: emp.passport_no || emp.passportNo || '',
        passportExpiry: emp.passport_expiry || emp.passportExpiry || '',
        airsidePassExpiry: emp.airside_pass_expiry || emp.airsidePassExpiry || '',
        contingentCardExpiry: emp.contingent_card_expiry || emp.medical_expiry || emp.contingentCardExpiry || '',
        visaExpiry: emp.visa_expiry || emp.visaExpiry || '',
        joinDate: emp.join_date || emp.joinDate || '',
        dxbShiftDate: emp.dxb_shift_date || emp.dxbShiftDate || '',
      };
    }
    setEditedDates(initial);
  }, [employees]);

  // Helper to calculate days remaining
  const getDaysRemaining = (dateStr) => {
    if (!dateStr) return null;
    const target = new Date(dateStr);
    if (Number.isNaN(target.getTime())) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Check if a specific row has been modified compared to original employee prop
  const isRowModified = (empId) => {
    const current = editedDates[empId];
    if (!current) return false;
    const orig = employees.find((e) => e.id === empId);
    if (!orig) return false;

    const origPassportNo = orig.passport_no || orig.passportNo || '';
    const origPassportExp = orig.passport_expiry || orig.passportExpiry || '';
    const origAirside = orig.airside_pass_expiry || orig.airsidePassExpiry || '';
    const origContingent = orig.contingent_card_expiry || orig.medical_expiry || orig.contingentCardExpiry || '';
    const origVisa = orig.visa_expiry || orig.visaExpiry || '';
    const origJoin = orig.join_date || orig.joinDate || '';
    const origDxb = orig.dxb_shift_date || orig.dxbShiftDate || '';

    return (
      current.passportNo !== origPassportNo ||
      current.passportExpiry !== origPassportExp ||
      current.airsidePassExpiry !== origAirside ||
      current.contingentCardExpiry !== origContingent ||
      current.visaExpiry !== origVisa ||
      current.joinDate !== origJoin ||
      current.dxbShiftDate !== origDxb
    );
  };

  // Get total count of modified rows
  const modifiedEmployeeIds = useMemo(() => {
    return employees.filter((e) => isRowModified(e.id)).map((e) => e.id);
  }, [editedDates, employees]);

  // Handle cell date change directly in table
  const handleDateChange = (empId, field, value) => {
    setEditedDates((prev) => ({
      ...prev,
      [empId]: {
        ...(prev[empId] || {}),
        [field]: value,
      },
    }));
  };

  // Discard edits for a single row
  const handleResetRow = (empId) => {
    const orig = employees.find((e) => e.id === empId);
    if (!orig) return;
    setEditedDates((prev) => ({
      ...prev,
      [empId]: {
        passportNo: orig.passport_no || orig.passportNo || '',
        passportExpiry: orig.passport_expiry || orig.passportExpiry || '',
        airsidePassExpiry: orig.airside_pass_expiry || orig.airsidePassExpiry || '',
        contingentCardExpiry: orig.contingent_card_expiry || orig.medical_expiry || orig.contingentCardExpiry || '',
        visaExpiry: orig.visa_expiry || orig.visaExpiry || '',
        joinDate: orig.join_date || orig.joinDate || '',
        dxbShiftDate: orig.dxb_shift_date || orig.dxbShiftDate || '',
      },
    }));
  };

  // Discard all unsaved changes
  const handleDiscardAll = () => {
    if (window.confirm(`Discard unsaved changes for ${modifiedEmployeeIds.length} employee(s)?`)) {
      const initial = {};
      for (const emp of employees) {
        initial[emp.id] = {
          passportNo: emp.passport_no || emp.passportNo || '',
          passportExpiry: emp.passport_expiry || emp.passportExpiry || '',
          airsidePassExpiry: emp.airside_pass_expiry || emp.airsidePassExpiry || '',
          contingentCardExpiry: emp.contingent_card_expiry || emp.medical_expiry || emp.contingentCardExpiry || '',
          visaExpiry: emp.visa_expiry || emp.visaExpiry || '',
          joinDate: emp.join_date || emp.joinDate || '',
          dxbShiftDate: emp.dxb_shift_date || emp.dxbShiftDate || '',
        };
      }
      setEditedDates(initial);
      notify('All unsaved edits discarded');
    }
  };

  // Save a single row directly
  const handleSaveSingleRow = async (empId) => {
    const data = editedDates[empId];
    if (!data) return;
    setSavingRowId(empId);
    try {
      await apiFetch(`/api/employees/${empId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          passportNo: data.passportNo,
          passportExpiry: data.passportExpiry,
          airsidePassExpiry: data.airsidePassExpiry,
          contingentCardExpiry: data.contingentCardExpiry,
          medicalExpiry: data.contingentCardExpiry,
          visaExpiry: data.visaExpiry,
          joinDate: data.joinDate,
          dxbShiftDate: data.dxbShiftDate,
        }),
      });
      notify('Staff documents saved successfully!');
      if (onDataChanged) onDataChanged();
    } catch (err) {
      notify(err.message || 'Failed to save staff documents', 'error');
    } finally {
      setSavingRowId(null);
    }
  };

  // Save all modified rows in one fast batch
  const handleSaveAllModified = async () => {
    if (modifiedEmployeeIds.length === 0) return;
    setSaving(true);
    try {
      const updates = modifiedEmployeeIds.map((id) => ({
        id,
        ...editedDates[id],
      }));
      const res = await apiFetch('/api/employees/batch-dates', {
        method: 'PATCH',
        body: JSON.stringify({
          updates,
          month: activeMonth,
        }),
      });
      notify(`Successfully updated dates for ${res.count || updates.length} staff member(s)!`);
      if (onDataChanged) onDataChanged();
    } catch (err) {
      notify(err.message || 'Failed to batch save dates', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((emp) => {
      // Team filter
      if (teamFilter !== 'all' && emp.team_id !== teamFilter) return false;

      // Status filter
      if (statusFilter === 'UNSAVED' && !isRowModified(emp.id)) return false;

      const current = editedDates[emp.id] || {};
      const passDays = getDaysRemaining(current.passportExpiry);
      const airDays = getDaysRemaining(current.airsidePassExpiry);
      const cardDays = getDaysRemaining(current.contingentCardExpiry);
      const visaDays = getDaysRemaining(current.visaExpiry);

      const hasExpired = (passDays !== null && passDays <= 0) || (airDays !== null && airDays <= 0) || (cardDays !== null && cardDays <= 0) || (visaDays !== null && visaDays <= 0);
      const hasCritical = (passDays !== null && passDays > 0 && passDays <= 30) || (airDays !== null && airDays > 0 && airDays <= 30) || (cardDays !== null && cardDays > 0 && cardDays <= 30) || (visaDays !== null && visaDays > 0 && visaDays <= 30);
      const hasUpcoming = (passDays !== null && passDays > 30 && passDays <= 90) || (airDays !== null && airDays > 30 && airDays <= 90) || (cardDays !== null && cardDays > 30 && cardDays <= 90) || (visaDays !== null && visaDays > 30 && visaDays <= 90);
      const hasMissing = !current.passportExpiry || !current.airsidePassExpiry || !current.contingentCardExpiry || !current.visaExpiry;

      if (statusFilter === 'EXPIRED' && !hasExpired) return false;
      if (statusFilter === 'CRITICAL' && !hasCritical) return false;
      if (statusFilter === 'UPCOMING' && !hasUpcoming) return false;
      if (statusFilter === 'MISSING' && !hasMissing) return false;

      // Text search
      if (!q) return true;
      return (
        (emp.name || '').toLowerCase().includes(q) ||
        (emp.uuds_no || '').toLowerCase().includes(q) ||
        (emp.contingent_no || '').toLowerCase().includes(q)
      );
    });
  }, [employees, editedDates, teamFilter, statusFilter, search]);

  // Apply a date to all currently filtered employees for a chosen column
  const handleApplyBulkDate = () => {
    if (!bulkDate) {
      notify('Please pick a date to apply', 'error');
      return;
    }
    const count = filteredEmployees.length;
    if (count === 0) {
      notify('No employees match the current filter', 'error');
      return;
    }
    const fieldLabel = {
      passportExpiry: 'Passport Expiry',
      airsidePassExpiry: 'Airside Pass Expiry',
      contingentCardExpiry: 'Contingent Card Expiry',
      visaExpiry: 'UAE Visa Expiry',
      joinDate: 'Join Date',
      dxbShiftDate: 'DXB Shift Date',
    }[bulkField];

    if (window.confirm(`Apply date "${bulkDate}" for "${fieldLabel}" to all ${count} filtered staff?`)) {
      setEditedDates((prev) => {
        const next = { ...prev };
        for (const emp of filteredEmployees) {
          next[emp.id] = {
            ...(next[emp.id] || {}),
            [bulkField]: bulkDate,
          };
        }
        return next;
      });
      notify(`Filled "${fieldLabel}" for ${count} staff rows. Click "Save All Changes" to save permanently.`);
    }
  };

  // Render Days remaining badge
  const renderDaysBadge = (days) => {
    if (days === null) {
      return <span className="text-[9px] text-slate-400 font-medium">—</span>;
    }
    if (days <= 0) {
      return (
        <span className="inline-flex items-center rounded px-1 py-0.2 text-[8.5px] font-black bg-rose-100 text-rose-800 border border-rose-300 leading-tight">
          EXPIRED ({Math.abs(days)}d)
        </span>
      );
    }
    if (days <= 30) {
      return (
        <span className="inline-flex items-center rounded px-1 py-0.2 text-[8.5px] font-black bg-rose-50 text-rose-700 border border-rose-200 leading-tight">
          Crit: {days}d left
        </span>
      );
    }
    if (days <= 60) {
      return (
        <span className="inline-flex items-center rounded px-1 py-0.2 text-[8.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 leading-tight">
          {days}d left
        </span>
      );
    }
    if (days <= 90) {
      return (
        <span className="inline-flex items-center rounded px-1 py-0.2 text-[8.5px] font-semibold bg-yellow-50 text-yellow-800 border border-yellow-200 leading-tight">
          {days}d left
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded px-1 py-0.2 text-[8.5px] font-medium text-emerald-700 leading-tight">
        OK ({days}d)
      </span>
    );
  };

  const teamMap = useMemo(() => {
    return Object.fromEntries(teams.map((t) => [t.id, t.name]));
  }, [teams]);

  return (
    <div className="space-y-4">
      {/* Top Banner: Title, Counters & Master Action Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Title & Icon */}
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-700 text-white shadow-md shadow-teal-500/20">
              <CalendarCheck2 className="h-6 w-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-slate-900">
                  Staff Documents &amp; Compliance Control
                </h1>
                <span className="rounded-full bg-teal-100 border border-teal-300 px-2 py-0.5 text-[10px] font-black text-teal-800 uppercase tracking-wide">
                  Direct In-Table Editing
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 font-medium">
                Manage Passport, Airside Pass, Contingent Card, UAE Visa, Join Date &amp; Shift Date directly in table rows (No Popups).
              </p>
            </div>
          </div>

          {/* Master Action Buttons */}
          <div className="flex items-center gap-2.5">
            {modifiedEmployeeIds.length > 0 && (
              <button
                type="button"
                onClick={handleDiscardAll}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Undo2 className="h-3.5 w-3.5" /> Discard
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveAllModified}
              disabled={saving || modifiedEmployeeIds.length === 0}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black tracking-wide text-white transition-all shadow-md active:scale-95 cursor-pointer ${
                modifiedEmployeeIds.length > 0
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/25 animate-pulse'
                  : 'bg-slate-300 cursor-not-allowed shadow-none'
              }`}
            >
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Saving Changes…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save All Changes (<span className="text-sky-200 font-bold">{modifiedEmployeeIds.length}</span>)
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Stats Pill Strip */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
          <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-700">
            <Users className="h-3.5 w-3.5 text-slate-500" />
            Total: {employees.length} Staff
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-sky-100 px-2.5 py-1 font-bold text-sky-800">
            Showing: {filteredEmployees.length} Rows
          </span>
          {modifiedEmployeeIds.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 border border-amber-300 px-2.5 py-1 font-black text-amber-900 animate-pulse">
              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
              {modifiedEmployeeIds.length} Unsaved Row(s)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 text-emerald-700 px-2.5 py-1 font-bold">
              <Check className="h-3.5 w-3.5" /> All Saved
            </span>
          )}
        </div>
      </div>

      {/* Filter Bar & Bulk Apply Drawer */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff name or UUDS ID..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none"
              />
            </div>

            {/* Team Filter */}
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 focus:border-sky-500 focus:outline-none"
            >
              <option value="all">All Teams ({employees.length})</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({employees.filter((e) => e.team_id === t.id).length})
                </option>
              ))}
            </select>

            {/* Compliance Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 focus:border-sky-500 focus:outline-none"
            >
              <option value="ALL">All Expiry Statuses</option>
              <option value="EXPIRED">⚠ Expired Only</option>
              <option value="CRITICAL">🔴 Critical (&le; 30 Days)</option>
              <option value="UPCOMING">🟡 Upcoming (&le; 90 Days)</option>
              <option value="MISSING">⚪ Missing / Blank Dates</option>
              <option value="UNSAVED">✨ Unsaved Modified Only</option>
            </select>
          </div>

          {/* Toggle Bulk Setter Button */}
          <button
            type="button"
            onClick={() => setShowBulkTool((s) => !s)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              showBulkTool
                ? 'border-sky-400 bg-sky-50 text-sky-800'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-sky-600" />
            Batch Fill Tool
            <ChevronDown className={`h-3 w-3 transition-transform ${showBulkTool ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Collapsible Bulk Setter Tool */}
        {showBulkTool && (
          <div className="rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50/80 to-blue-50/50 p-3 flex flex-wrap items-center gap-3 animate-fade-down">
            <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-sky-600" />
              Quick Fill Column for all {filteredEmployees.length} Filtered Rows:
            </span>
            <select
              value={bulkField}
              onChange={(e) => setBulkField(e.target.value)}
              className="rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-none"
            >
              <option value="passportExpiry">Passport Expiry</option>
              <option value="airsidePassExpiry">Airside Pass Expiry</option>
              <option value="contingentCardExpiry">Contingent Card Expiry</option>
              <option value="visaExpiry">UAE Visa Expiry</option>
              <option value="joinDate">Join Date</option>
              <option value="dxbShiftDate">DXB Shift Date</option>
            </select>
            <input
              type="date"
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
              className="rounded-lg border border-sky-300 bg-white px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleApplyBulkDate}
              className="rounded-lg bg-sky-600 hover:bg-sky-500 text-white px-3 py-1 text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
            >
              Fill to {filteredEmployees.length} Rows
            </button>
          </div>
        )}
      </div>

      {/* Spreadsheet Table: Direct In-Row Date Inputs */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-hidden max-h-[74vh] overflow-y-auto">
          <table className="w-full table-fixed border-collapse text-left text-xs">
            <thead className="sticky top-0 z-20 border-b border-slate-200 bg-slate-900 text-white shadow-sm">
              <tr>
                <th className="py-2 px-1 text-[11px] font-black uppercase tracking-wider text-slate-300 w-[3%] text-center">
                  #
                </th>
                <th className="py-2 px-2 text-[11px] font-black uppercase tracking-wider text-white w-[17%]">
                  Staff Name &amp; ID
                </th>
                <th className="py-2 px-1 text-[11px] font-black uppercase tracking-wider text-slate-300 w-[7%] text-center">
                  Team
                </th>
                <th className="py-2 px-1 text-[11px] font-black uppercase tracking-wider text-indigo-300 w-[8%] text-center">
                  Passport No
                </th>
                <th className="py-2 px-1 text-[11px] font-black uppercase tracking-wider text-indigo-300 w-[11%] text-center">
                  Passport Exp
                </th>
                <th className="py-2 px-1 text-[11px] font-black uppercase tracking-wider text-sky-300 w-[11%] text-center">
                  Airside Pass
                </th>
                <th className="py-2 px-1 text-[11px] font-black uppercase tracking-wider text-teal-300 w-[11%] text-center">
                  Contingent Card
                </th>
                <th className="py-2 px-1 text-[11px] font-black uppercase tracking-wider text-amber-300 w-[11%] text-center">
                  UAE Visa
                </th>
                <th className="py-2 px-1 text-[11px] font-black uppercase tracking-wider text-slate-300 w-[8%] text-center">
                  Join Date
                </th>
                <th className="py-2 px-1 text-[11px] font-black uppercase tracking-wider text-slate-300 w-[8%] text-center">
                  DXB Shift
                </th>
                <th className="py-2 px-1 text-[11px] font-black uppercase tracking-wider text-center text-slate-300 w-[5%]">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-sm font-semibold text-slate-400">
                    No employees matching the current search or filters.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp, idx) => {
                  const dates = editedDates[emp.id] || {
                    passportNo: '',
                    passportExpiry: '',
                    airsidePassExpiry: '',
                    contingentCardExpiry: '',
                    visaExpiry: '',
                    joinDate: '',
                    dxbShiftDate: '',
                  };
                  const modified = isRowModified(emp.id);
                  const isSavingThis = savingRowId === emp.id;

                  const passportDays = getDaysRemaining(dates.passportExpiry);
                  const airDays = getDaysRemaining(dates.airsidePassExpiry);
                  const cardDays = getDaysRemaining(dates.contingentCardExpiry);
                  const visaDays = getDaysRemaining(dates.visaExpiry);

                  return (
                    <tr
                      key={emp.id}
                      className={`transition-colors hover:bg-slate-50/80 ${
                        modified ? 'bg-amber-50/40 ring-1 ring-inset ring-amber-300/60' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                      }`}
                    >
                      {/* Row Index */}
                      <td className="py-1.5 px-1 text-center text-[10.5px] font-mono font-bold text-slate-400">
                        {idx + 1}
                      </td>

                      {/* Staff Name & UUDS No */}
                      <td className="py-1.5 px-2">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="font-bold text-slate-900 text-xs tracking-tight leading-tight truncate" title={emp.name}>
                            {emp.name}
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center rounded border border-sky-500/40 bg-slate-950 px-1.5 py-0.2 font-mono text-[10.5px] font-black tracking-wider text-sky-300">
                              {emp.uuds_no || 'NO-ID'}
                            </span>
                            {emp.contingent_no && (
                              <span className="inline-flex items-center rounded border border-slate-300 bg-slate-100 px-1 py-0.2 font-mono text-[9px] font-bold text-slate-700">
                                C: {emp.contingent_no}
                              </span>
                            )}
                            {modified && (
                              <span className="rounded bg-amber-500 px-1 py-0.2 text-[8.5px] font-black text-white uppercase tracking-wider">
                                Edited
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Team Name */}
                      <td className="py-1.5 px-1 text-center">
                        <span className="inline-block rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[9.5px] font-bold text-slate-700 truncate max-w-full">
                          {teamMap[emp.team_id] || emp.team_name || emp.team_id}
                        </span>
                      </td>

                      {/* Passport Number */}
                      <td className="py-1.5 px-1">
                        <input
                          type="text"
                          value={dates.passportNo}
                          onChange={(e) => handleDateChange(emp.id, 'passportNo', e.target.value.toUpperCase())}
                          placeholder="Pass No"
                          className={`w-full rounded border px-1 py-0.5 text-[11px] font-mono font-bold text-slate-800 uppercase transition focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                            dates.passportNo !== (emp.passport_no || '')
                              ? 'border-amber-400 bg-amber-50/80'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        />
                      </td>

                      {/* Passport Expiry */}
                      <td className="py-1.5 px-1">
                        <div className="flex flex-col gap-0.5">
                          <input
                            type="date"
                            value={dates.passportExpiry}
                            onChange={(e) => handleDateChange(emp.id, 'passportExpiry', e.target.value)}
                            className={`w-full rounded border px-1 py-0.5 text-[11px] font-mono font-bold text-slate-800 transition focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                              dates.passportExpiry !== (emp.passport_expiry || '')
                                ? 'border-amber-400 bg-amber-50/80'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          />
                          <div className="leading-tight">{renderDaysBadge(passportDays)}</div>
                        </div>
                      </td>

                      {/* Airside Pass Expiry */}
                      <td className="py-1.5 px-1">
                        <div className="flex flex-col gap-0.5">
                          <input
                            type="date"
                            value={dates.airsidePassExpiry}
                            onChange={(e) => handleDateChange(emp.id, 'airsidePassExpiry', e.target.value)}
                            className={`w-full rounded border px-1 py-0.5 text-[11px] font-mono font-bold text-slate-800 transition focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                              dates.airsidePassExpiry !== (emp.airside_pass_expiry || '')
                                ? 'border-amber-400 bg-amber-50/80'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          />
                          <div className="leading-tight">{renderDaysBadge(airDays)}</div>
                        </div>
                      </td>

                      {/* Contingent Card Expiry */}
                      <td className="py-1.5 px-1">
                        <div className="flex flex-col gap-0.5">
                          <input
                            type="date"
                            value={dates.contingentCardExpiry}
                            onChange={(e) => handleDateChange(emp.id, 'contingentCardExpiry', e.target.value)}
                            className={`w-full rounded border px-1 py-0.5 text-[11px] font-mono font-bold text-slate-800 transition focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                              dates.contingentCardExpiry !== (emp.contingent_card_expiry || emp.medical_expiry || '')
                                ? 'border-amber-400 bg-amber-50/80'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          />
                          <div className="leading-tight">{renderDaysBadge(cardDays)}</div>
                        </div>
                      </td>

                      {/* UAE Visa Expiry */}
                      <td className="py-1.5 px-1">
                        <div className="flex flex-col gap-0.5">
                          <input
                            type="date"
                            value={dates.visaExpiry}
                            onChange={(e) => handleDateChange(emp.id, 'visaExpiry', e.target.value)}
                            className={`w-full rounded border px-1 py-0.5 text-[11px] font-mono font-bold text-slate-800 transition focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                              dates.visaExpiry !== (emp.visa_expiry || '')
                                ? 'border-amber-400 bg-amber-50/80'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          />
                          <div className="leading-tight">{renderDaysBadge(visaDays)}</div>
                        </div>
                      </td>

                      {/* Join Date */}
                      <td className="py-1.5 px-1">
                        <input
                          type="date"
                          value={dates.joinDate}
                          onChange={(e) => handleDateChange(emp.id, 'joinDate', e.target.value)}
                          className={`w-full rounded border px-1 py-0.5 text-[11px] font-mono font-bold text-slate-800 transition focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                            dates.joinDate !== (emp.join_date || '')
                              ? 'border-amber-400 bg-amber-50/80'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        />
                      </td>

                      {/* DXB Shift Date */}
                      <td className="py-1.5 px-1">
                        <input
                          type="date"
                          value={dates.dxbShiftDate}
                          onChange={(e) => handleDateChange(emp.id, 'dxbShiftDate', e.target.value)}
                          className={`w-full rounded border px-1 py-0.5 text-[11px] font-mono font-bold text-slate-800 transition focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                            dates.dxbShiftDate !== (emp.dxb_shift_date || '')
                              ? 'border-amber-400 bg-amber-50/80'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        />
                      </td>

                      {/* Row Action (Save row / Discard row) */}
                      <td className="py-1.5 px-1 text-center">
                        {modified ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSaveSingleRow(emp.id)}
                              disabled={isSavingThis}
                              title="Save this row"
                              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white p-1.5 text-xs shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                            >
                              {isSavingThis ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResetRow(emp.id)}
                              disabled={isSavingThis}
                              title="Discard row changes"
                              className="rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 p-1.5 text-xs transition active:scale-95 cursor-pointer"
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400">
                            Saved
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
