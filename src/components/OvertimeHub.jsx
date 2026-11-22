import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  ClockAlert,
  FileSpreadsheet,
  Printer,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileCheck,
  Plane,
  Trash2,
  Edit2,
  RotateCcw,
  Sparkles,
  Info,
  Calendar,
  UserCheck,
  PenTool,
  Download,
  Check,
} from 'lucide-react';
import { apiFetch } from '../api.js';

export default function OvertimeHub({
  activeMonth = '2026-11',
  teams = [],
  employees = [],
  currentUser,
  notify,
}) {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({
    totalRecords: 0,
    totalStaffCount: 0,
    totalExtraHours: 0,
    totalDeductedHours: 0,
    totalApprovedOtHours: 0,
    approvedCount: 0,
    pendingCount: 0,
  });
  const [loading, setLoading] = useState(false);

  // Filters
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'APPROVED', 'PENDING'

  // Modal / Drawer state for logging OT
  const [showLogModal, setShowLogModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    employeeId: '',
    day: 12,
    shiftCode: 'D',
    scheduledEndTime: '20:00',
    actualEndTime: '23:00',
    bufferHours: 2.0,
    aircraftReg: 'A6-EVA',
    locationBay: 'DXB Stand B12',
    reason: 'A380 Flight Departure Prep & Deep Cabin Rectification',
    workOrderNo: 'WO-DXB-202611',
    teamManagerStatus: 'APPROVED',
    teamManagerName: 'Shift Supervisor',
    remarks: '',
  });

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        month: activeMonth,
        teamId: selectedTeam,
        search: searchTerm,
      });
      const data = await apiFetch(`/api/overtime?${q.toString()}`);
      setRecords(data.records || []);
      setSummary(data.summary || {});
    } catch (err) {
      if (notify) notify(err.message || 'Failed to load overtime records', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [activeMonth, selectedTeam, searchTerm]);

  // Live OT calculation helper
  const calculateLiveOT = (schedEnd, actEnd, buf = 2.0) => {
    if (!schedEnd || !actEnd) return { extra: 0, buffer: buf, approved: 0 };
    const [sH, sM] = String(schedEnd).split(':').map(Number);
    const [aH, aM] = String(actEnd).split(':').map(Number);
    let sTotalMin = (sH || 0) * 60 + (sM || 0);
    let aTotalMin = (aH || 0) * 60 + (aM || 0);
    if (aTotalMin < sTotalMin) {
      aTotalMin += 24 * 60; // Overnight
    }
    const diffMin = Math.max(0, aTotalMin - sTotalMin);
    const extra = Math.round((diffMin / 60) * 10) / 10;
    const approved = Math.max(0, Math.round((extra - buf) * 10) / 10);
    return { extra, buffer: buf, approved };
  };

  const liveCalculation = useMemo(() => {
    return calculateLiveOT(formData.scheduledEndTime, formData.actualEndTime, Number(formData.bufferHours || 2.0));
  }, [formData.scheduledEndTime, formData.actualEndTime, formData.bufferHours]);

  const handleOpenNewModal = () => {
    setEditingRecord(null);
    const defaultEmp = employees[0]?.id || '';
    setFormData({
      employeeId: defaultEmp,
      day: 12,
      shiftCode: 'D',
      scheduledEndTime: '20:00',
      actualEndTime: '23:00',
      bufferHours: 2.0,
      aircraftReg: 'A6-EVA',
      locationBay: 'DXB Stand B12',
      reason: 'A380 Flight Departure Prep & Deep Cabin Rectification',
      workOrderNo: `WO-DXB-${Date.now().toString().slice(-6)}`,
      teamManagerStatus: 'APPROVED',
      teamManagerName: currentUser?.displayName || 'Shift Supervisor',
      remarks: 'Operational urgency approved under DXB airside regulations.',
    });
    setShowLogModal(true);
  };

  const handleEditRecord = (rec) => {
    setEditingRecord(rec);
    setFormData({
      employeeId: rec.employee_id,
      day: rec.day,
      shiftCode: rec.shift_code || 'D',
      scheduledEndTime: rec.scheduled_end_time || '20:00',
      actualEndTime: rec.actual_end_time || '23:00',
      bufferHours: rec.buffer_hours !== undefined ? rec.buffer_hours : 2.0,
      aircraftReg: rec.aircraft_reg || '',
      locationBay: rec.location_bay || '',
      reason: rec.reason || '',
      workOrderNo: rec.work_order_no || '',
      teamManagerStatus: rec.team_manager_status || 'APPROVED',
      teamManagerName: rec.team_manager_name || 'Shift Supervisor',
      remarks: rec.remarks || '',
    });
    setShowLogModal(true);
  };

  const handleSaveOvertime = async (e) => {
    e.preventDefault();
    if (!formData.employeeId) {
      if (notify) notify('Please select an employee', 'error');
      return;
    }
    if (!formData.actualEndTime) {
      if (notify) notify('Please provide actual finish time', 'error');
      return;
    }

    try {
      if (editingRecord) {
        await apiFetch(`/api/overtime/${editingRecord.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            scheduledEndTime: formData.scheduledEndTime,
            actualEndTime: formData.actualEndTime,
            bufferHours: Number(formData.bufferHours),
            reason: formData.reason,
            aircraftReg: formData.aircraftReg,
            workOrderNo: formData.workOrderNo,
            locationBay: formData.locationBay,
            teamManagerStatus: formData.teamManagerStatus,
            teamManagerName: formData.teamManagerName,
            remarks: formData.remarks,
          }),
        });
        if (notify) notify('Overtime record updated successfully', 'success');
      } else {
        await apiFetch('/api/overtime', {
          method: 'POST',
          body: JSON.stringify({
            month: activeMonth,
            day: Number(formData.day),
            employeeId: Number(formData.employeeId),
            shiftCode: formData.shiftCode,
            scheduledEndTime: formData.scheduledEndTime,
            actualEndTime: formData.actualEndTime,
            bufferHours: Number(formData.bufferHours),
            reason: formData.reason,
            aircraftReg: formData.aircraftReg,
            workOrderNo: formData.workOrderNo,
            locationBay: formData.locationBay,
            teamManagerStatus: formData.teamManagerStatus,
            teamManagerName: formData.teamManagerName,
            remarks: formData.remarks,
          }),
        });
        if (notify) notify('Overtime logged and approved successfully', 'success');
      }
      setShowLogModal(false);
      fetchRecords();
    } catch (err) {
      if (notify) notify(err.message || 'Failed to save overtime', 'error');
    }
  };

  const handleToggleApproval = async (rec) => {
    const newStatus = rec.team_manager_status === 'APPROVED' ? 'PENDING' : 'APPROVED';
    try {
      await apiFetch(`/api/overtime/${rec.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          teamManagerStatus: newStatus,
          teamManagerName: currentUser?.displayName || 'Shift Supervisor',
        }),
      });
      setRecords((prev) =>
        prev.map((r) =>
          r.id === rec.id
            ? { ...r, team_manager_status: newStatus, team_manager_name: currentUser?.displayName || 'Shift Supervisor' }
            : r
        )
      );
      if (notify) notify(`OT for ${rec.emp_name} marked as ${newStatus}`, 'success');
    } catch (err) {
      if (notify) notify(err.message || 'Failed to update approval status', 'error');
    }
  };

  const handleDeleteRecord = async (id, empName) => {
    if (!window.confirm(`Are you sure you want to delete this overtime entry for ${empName}?`)) return;
    try {
      await apiFetch(`/api/overtime/${id}`, { method: 'DELETE' });
      setRecords((prev) => prev.filter((r) => r.id !== id));
      if (notify) notify('Overtime record deleted', 'success');
      fetchRecords();
    } catch (err) {
      if (notify) notify(err.message || 'Failed to delete record', 'error');
    }
  };

  const handleDownloadExcel = () => {
    const url = `/api/export/overtime-excel?month=${activeMonth}&teamId=${selectedTeam}`;
    window.open(url, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  // Filter records by status locally if needed
  const displayedRecords = useMemo(() => {
    if (statusFilter === 'all') return records;
    return records.filter((r) => r.team_manager_status === statusFilter);
  }, [records, statusFilter]);

  return (
    <div className="space-y-6">
      {/* 1. Header & Controls (Screen only) */}
      <div className="print:hidden rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
                <ClockAlert className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl flex items-center gap-2">
                  Approved UUDS Overtime Form
                  <span className="rounded-md bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300 border border-amber-500/30">
                    DXB Airside Ops
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  Official Monthly Overtime Authorization Sheet · One Employee One Day Per Row · 2-Hour Deduction Rule
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleOpenNewModal}
              className="flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 text-xs font-bold shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Log Overtime Entry
            </button>
            <button
              onClick={handleDownloadExcel}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
              title="Download formatted Excel sheet"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel Export
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 text-xs font-bold transition-all cursor-pointer"
              title="Print official form"
            >
              <Printer className="h-4 w-4" />
              Print Form
            </button>
          </div>
        </div>

        {/* 2-Hour Rule Explanatory Banner */}
        <div className="mt-4 flex items-start gap-3 rounded-xl bg-amber-500/10 border border-amber-500/25 p-3.5 text-xs text-amber-200/90">
          <Info className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-amber-300 uppercase tracking-wider">Official 2-Hour Policy Rule: </span>
            If duty ends at <strong>8:00 PM (20:00)</strong> and employee works until <strong>11:00 PM (23:00)</strong>, total extra time is <strong>3 hours</strong>.
            The first 2 hours are standard non-payable extra duty. Thus, payable approved OT is strictly <strong>1.0 hour</strong> (Formula: <code className="bg-amber-950/60 px-1.5 py-0.5 rounded text-amber-300 font-mono">Approved OT = Max(0, Extra Hours - 2.0)</code>).
          </div>
        </div>

        {/* Filters Strip */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search name, UUDS ID, A/C..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
            >
              <option value="all">All Teams (Full Portal)</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
            >
              <option value="all">All Approval Statuses</option>
              <option value="APPROVED">Approved Only</option>
              <option value="PENDING">Pending Approval</option>
            </select>
          </div>

          <div className="flex items-center justify-end">
            <button
              onClick={() => {
                setSelectedTeam('all');
                setSearchTerm('');
                setStatusFilter('all');
              }}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards (Screen only) */}
      <div className="print:hidden grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 shadow">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total OT Entries</div>
          <div className="mt-1 text-2xl font-black text-white">{summary.totalRecords || 0}</div>
          <div className="text-[10px] text-slate-500">Day/Staff instances</div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 shadow">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Staff Count</div>
          <div className="mt-1 text-2xl font-black text-sky-400">{summary.totalStaffCount || 0}</div>
          <div className="text-[10px] text-slate-500">Distinct employees</div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 shadow">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Gross Extra Hrs</div>
          <div className="mt-1 text-2xl font-black text-amber-300">{(summary.totalExtraHours || 0).toFixed(1)} <span className="text-xs font-normal">h</span></div>
          <div className="text-[10px] text-slate-500">Before 2h deduction</div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 shadow">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-400">2h Deductions</div>
          <div className="mt-1 text-2xl font-black text-rose-400">-{(summary.totalDeductedHours || 0).toFixed(1)} <span className="text-xs font-normal">h</span></div>
          <div className="text-[10px] text-slate-500">First 2 hours non-OT</div>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 shadow">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">Approved Net OT</div>
          <div className="mt-1 text-2xl font-black text-emerald-400">{(summary.totalApprovedOtHours || 0).toFixed(1)} <span className="text-xs font-normal">h</span></div>
          <div className="text-[10px] text-emerald-300/70">Payable to staff</div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 shadow">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Manager Sign-off</div>
          <div className="mt-1 text-2xl font-black text-violet-400">{summary.approvedCount || 0} / {summary.totalRecords || 0}</div>
          <div className="text-[10px] text-slate-500">{summary.pendingCount || 0} pending review</div>
        </div>
      </div>

      {/* 3. Official Master Sheet Document Container (Printed & On-Screen) */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-2xl print:border-none print:shadow-none print:bg-white print:text-black">
        {/* Printable Official Header (Only shows in print) */}
        <div className="hidden print:block p-6 border-b-2 border-black mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-black uppercase">
                UUDS AERO SERVICES LLC — DUBAI INTERNATIONAL AIRPORT (DXB)
              </h1>
              <h2 className="text-sm font-semibold text-gray-700 uppercase">
                Official Monthly Approved Overtime Authorization Form — {activeMonth}
              </h2>
              <p className="text-[11px] text-gray-600 mt-1">
                <strong>POLICY:</strong> First 2 hours of extra duty are non-payable. Approved OT = Max(0, Extra Hours - 2.0). 1 Employee / 1 Day per row.
              </p>
            </div>
            <div className="text-right text-xs">
              <div className="font-bold">Total Staff: {summary.totalStaffCount || 0}</div>
              <div className="font-bold">Gross Extra: {(summary.totalExtraHours || 0).toFixed(1)} hrs</div>
              <div className="font-black text-sm text-black">Net Approved OT: {(summary.totalApprovedOtHours || 0).toFixed(1)} hrs</div>
            </div>
          </div>
        </div>

        {/* Table Title Bar (Screen Only) */}
        <div className="print:hidden flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"></span>
            <span className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              Monthly Tabular Sheet (One Employee, One Day in One Row)
            </span>
            <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-400">
              {displayedRecords.length} Rows Logged
            </span>
          </div>
          <div className="text-xs text-slate-400">
            Month: <strong className="text-white font-mono">{activeMonth}</strong>
          </div>
        </div>

        {/* Master Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse print:text-[10px]">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[10px] font-bold tracking-wider print:bg-gray-100 print:text-black print:border-black">
              <tr>
                <th className="py-3 px-3 w-10 text-center">#</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">UUDS ID</th>
                <th className="py-3 px-3">Contingent No</th>
                <th className="py-3 px-3 min-w-[150px]">Staff Name</th>
                <th className="py-3 px-3">Trade / Skill</th>
                <th className="py-3 px-3">Team</th>
                <th className="py-3 px-3 text-center">Shift</th>
                <th className="py-3 px-3 text-center">Duty End</th>
                <th className="py-3 px-3 text-center">Actual Finish</th>
                <th className="py-3 px-3 text-center">Extra Time</th>
                <th className="py-3 px-3 text-center text-rose-400 print:text-gray-800">1st 2h Non-OT</th>
                <th className="py-3 px-3 text-center text-emerald-400 print:text-black font-black">Approved OT</th>
                <th className="py-3 px-3 min-w-[200px]">Task / A/C Reg / Bay</th>
                <th className="py-3 px-3 min-w-[160px] text-center font-bold text-amber-300 print:text-black">
                  Team Manager Approval
                </th>
                <th className="py-3 px-3 text-center print:hidden w-16">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 print:divide-gray-300">
              {loading && records.length === 0 ? (
                <tr>
                  <td colSpan="16" className="py-12 text-center text-slate-500">
                    Loading overtime records...
                  </td>
                </tr>
              ) : displayedRecords.length === 0 ? (
                <tr>
                  <td colSpan="16" className="py-12 text-center text-slate-500">
                    No overtime records found for this selection. Click "+ Log Overtime Entry" to add one.
                  </td>
                </tr>
              ) : (
                displayedRecords.map((rec, idx) => {
                  const isApproved = rec.team_manager_status === 'APPROVED';
                  return (
                    <tr
                      key={rec.id}
                      className="hover:bg-slate-800/40 transition-colors print:hover:bg-transparent"
                    >
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500 print:text-black">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-medium whitespace-nowrap text-slate-300 print:text-black">
                        {rec.date_str || `${activeMonth}-${String(rec.day).padStart(2, '0')}`}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-black text-sm text-sky-400 print:text-black">
                        {rec.uuds_no || '-'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-400 print:text-black">
                        {rec.contingent_no || '-'}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white print:text-black">
                        {rec.emp_name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 print:text-black">
                        {rec.skill}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-400 print:text-black">
                        <span className="rounded bg-slate-800/80 px-2 py-0.5 text-[11px] font-semibold text-slate-300 print:bg-transparent print:border print:border-gray-400 print:text-black">
                          {rec.team_name}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold font-mono text-slate-300 print:text-black">
                        {rec.shift_code || 'D'}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-400 print:text-black">
                        {rec.scheduled_end_time || '20:00'}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-amber-300 print:text-black">
                        {rec.actual_end_time}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-200 print:text-black">
                        {Number(rec.total_extra_hours).toFixed(1)} h
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-rose-400 print:text-gray-700">
                        -{Number(rec.buffer_hours || 2.0).toFixed(1)} h
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-black text-sm text-emerald-400 print:text-black">
                        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20 print:border-none print:p-0">
                          +{Number(rec.approved_ot_hours).toFixed(1)} h
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 print:text-black">
                        <div className="font-semibold text-white print:text-black">
                          {rec.aircraft_reg ? (
                            <span className="text-amber-300 font-mono font-bold mr-1 print:text-black">
                              [{rec.aircraft_reg}]
                            </span>
                          ) : null}
                          {rec.reason || 'General Airside Overtime'}
                        </div>
                        {rec.location_bay ? (
                          <div className="text-[10px] text-slate-500 print:text-gray-600">
                            Bay/Stand: {rec.location_bay}
                          </div>
                        ) : null}
                      </td>
                      {/* TEAM MANAGER APPROVAL COLUMN AT LAST */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="inline-flex flex-col items-center">
                          <button
                            type="button"
                            onClick={() => handleToggleApproval(rec)}
                            title="Click to toggle Team Manager approval"
                            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition cursor-pointer print:border print:border-black ${
                              isApproved
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                            }`}
                          >
                            {isApproved ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                            )}
                            <span>{isApproved ? 'APPROVED' : 'PENDING'}</span>
                          </button>
                          <span className="text-[9px] text-slate-500 mt-0.5 print:text-gray-700">
                            {rec.team_manager_name || 'Supervisor'}
                          </span>
                        </div>
                      </td>
                      {/* Row Actions */}
                      <td className="py-2.5 px-3 text-center print:hidden">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEditRecord(rec)}
                            className="rounded p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition"
                            title="Edit Record"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRecord(rec.id, rec.emp_name)}
                            className="rounded p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition"
                            title="Delete Record"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Totals Footer Row */}
            <tfoot className="bg-slate-950 text-slate-200 border-t-2 border-slate-700 font-bold print:bg-gray-100 print:text-black print:border-black">
              <tr>
                <td colSpan="10" className="py-3 px-4 text-right uppercase tracking-wider text-xs">
                  Monthly Total Approved Overtime Summary:
                </td>
                <td className="py-3 px-3 text-center font-mono text-amber-300 text-sm print:text-black">
                  {(summary.totalExtraHours || 0).toFixed(1)} h
                </td>
                <td className="py-3 px-3 text-center font-mono text-rose-400 text-sm print:text-black">
                  -{(summary.totalDeductedHours || 0).toFixed(1)} h
                </td>
                <td className="py-3 px-3 text-center font-mono text-emerald-400 text-base font-black print:text-black">
                  +{(summary.totalApprovedOtHours || 0).toFixed(1)} h
                </td>
                <td colSpan="3" className="py-3 px-3 text-xs text-slate-400 print:text-gray-700">
                  {summary.totalRecords || 0} Staff Overtime Duty Days
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 4. Bottom Signature & Approval Section (On-screen & on bottom of each page) */}
        <div className="border-t border-slate-800 bg-slate-950/90 p-6 print:border-t-2 print:border-black print:bg-white print:p-4 print:break-inside-avoid">
          <div className="mb-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 print:text-black flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-amber-400 print:text-black" />
              UUDS DXB Airside Overtime Authorization & Manager Sign-Off
            </h3>
            <p className="text-[11px] text-slate-400 print:text-gray-600 mt-1">
              "We hereby certify that the overtime hours listed above were required for critical airline flight departures, A/C maintenance turnaround, and operational emergencies at Dubai International Airport (DXB). The standard 2-hour non-OT deduction policy has been strictly applied."
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-2">
            {/* Box 1: Team Manager / Supervisor */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 print:border-black print:bg-white print:text-black">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 print:text-gray-700">
                1. Team Manager / Supervisor Verification
              </div>
              <div className="mt-2 text-xs font-bold text-white print:text-black">
                Shift Duty Supervisor
              </div>
              <div className="text-[11px] text-slate-400 print:text-gray-600">
                Line Maintenance & Appearance
              </div>
              <div className="mt-4 border-b border-dashed border-slate-700 print:border-black pb-1">
                <span className="text-[10px] text-slate-500 print:text-gray-700">Signature:</span>
              </div>
              <div className="mt-2 text-[10px] text-slate-500 print:text-gray-700 flex justify-between">
                <span>Date: ____ / ____ / 2026</span>
                <span className="font-semibold text-emerald-400 print:text-black">[ VERIFIED ]</span>
              </div>
            </div>

            {/* Box 2: Workshop Manager Approval */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 p-4 print:border-black print:bg-white print:text-black">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300 print:text-gray-700 flex items-center justify-between">
                <span>2. Workshop Manager Approval</span>
                <PenTool className="h-3.5 w-3.5 text-amber-400 print:hidden" />
              </div>
              <div className="mt-2 text-xs font-bold text-white print:text-black">
                Mr. Khurram Munir
              </div>
              <div className="text-[11px] text-slate-400 print:text-gray-600">
                Workshop & Manpower Operations Manager
              </div>
              <div className="mt-4 border-b border-dashed border-amber-500/40 print:border-black pb-1">
                <span className="text-[10px] text-slate-500 print:text-gray-700">Signature:</span>
              </div>
              <div className="mt-2 text-[10px] text-slate-500 print:text-gray-700 flex justify-between">
                <span>Date: ____ / ____ / 2026</span>
                <span className="font-semibold text-amber-400 print:text-black">[ RECOMMENDED ]</span>
              </div>
            </div>

            {/* Box 3: Project Manager Final Authorization */}
            <div className="rounded-xl border border-sky-500/30 bg-sky-950/10 p-4 print:border-black print:bg-white print:text-black">
              <div className="text-[10px] font-bold uppercase tracking-wider text-sky-300 print:text-gray-700 flex items-center justify-between">
                <span>3. Project Manager Final Sign-Off</span>
                <UserCheck className="h-3.5 w-3.5 text-sky-400 print:hidden" />
              </div>
              <div className="mt-2 text-xs font-bold text-white print:text-black">
                Project Manager — DXB Operations
              </div>
              <div className="text-[11px] text-slate-400 print:text-gray-600">
                Dubai International Airport Program Command
              </div>
              <div className="mt-4 border-b border-dashed border-sky-500/40 print:border-black pb-1">
                <span className="text-[10px] text-slate-500 print:text-gray-700">Signature:</span>
              </div>
              <div className="mt-2 text-[10px] text-slate-500 print:text-gray-700 flex justify-between">
                <span>Date: ____ / ____ / 2026</span>
                <span className="font-semibold text-sky-400 print:text-black">[ FINAL APPROVAL ]</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Modal / Dialog for Logging & Editing Overtime */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingRecord ? 'Edit Overtime Entry' : 'Log New Overtime Duty'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Calculated with official 2-Hour Non-OT Deduction Rule
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLogModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveOvertime} className="mt-4 space-y-4 text-xs">
              {/* Employee Selection */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Employee (Name · UUDS ID · Contingent No)
                </label>
                <select
                  value={formData.employeeId}
                  onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                  disabled={!!editingRecord}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="">Select Employee...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} — {emp.uuds_no || 'NO UUDS'} (Cont: {emp.contingent_no || '-'}) · {emp.skill}
                    </option>
                  ))}
                </select>
              </div>

              {/* Day & Shift */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Day of Month (1 - 30/31)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.day}
                    onChange={(e) => setFormData({ ...formData, day: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Shift Code
                  </label>
                  <select
                    value={formData.shiftCode}
                    onChange={(e) => {
                      const sc = e.target.value;
                      const sEnd = sc === 'N' ? '08:00' : '20:00';
                      setFormData({ ...formData, shiftCode: sc, scheduledEndTime: sEnd });
                    }}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="D">D — Day Shift (08:00 to 20:00)</option>
                    <option value="N">N — Night Shift (20:00 to 08:00)</option>
                    <option value="M">M — Morning Shift (06:00 to 18:00)</option>
                    <option value="OFF">OFF — Day-Off Emergency OT</option>
                  </select>
                </div>
              </div>

              {/* Timing & Deduction Rule Inputs */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Duty End Time
                  </label>
                  <input
                    type="time"
                    value={formData.scheduledEndTime}
                    onChange={(e) => setFormData({ ...formData, scheduledEndTime: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:border-amber-500 focus:outline-none font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Actual Finish Time
                  </label>
                  <input
                    type="time"
                    value={formData.actualEndTime}
                    onChange={(e) => setFormData({ ...formData, actualEndTime: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-amber-300 focus:border-amber-500 focus:outline-none font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Buffer Rule (Hrs)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formData.bufferHours}
                    onChange={(e) => setFormData({ ...formData, bufferHours: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-rose-400 focus:border-amber-500 focus:outline-none font-mono"
                    required
                  />
                </div>
              </div>

              {/* Live Calculation Preview Card */}
              <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3.5">
                <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                  <span>Live Overtime Calculation Breakdown:</span>
                  <span className="text-[10px] text-amber-400/80 uppercase">Formula Enforced</span>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-900/80 p-2 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Total Extra Duty</div>
                    <div className="text-base font-bold text-white font-mono">{liveCalculation.extra.toFixed(1)} hrs</div>
                  </div>
                  <div className="rounded-lg bg-slate-900/80 p-2 border border-slate-800">
                    <div className="text-[10px] text-rose-400">First 2h Deduction</div>
                    <div className="text-base font-bold text-rose-400 font-mono">-{liveCalculation.buffer.toFixed(1)} hrs</div>
                  </div>
                  <div className="rounded-lg bg-emerald-950/50 p-2 border border-emerald-500/40">
                    <div className="text-[10px] text-emerald-400 font-bold">Approved Net OT</div>
                    <div className="text-lg font-black text-emerald-400 font-mono">+{liveCalculation.approved.toFixed(1)} hrs</div>
                  </div>
                </div>
              </div>

              {/* Aircraft & Bay Info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Aircraft Reg (e.g. A6-EVA)
                  </label>
                  <input
                    type="text"
                    placeholder="A6-EVA"
                    value={formData.aircraftReg}
                    onChange={(e) => setFormData({ ...formData, aircraftReg: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Location / Bay (e.g. Stand B12)
                  </label>
                  <input
                    type="text"
                    placeholder="Stand B12 / Hangar 2"
                    value={formData.locationBay}
                    onChange={(e) => setFormData({ ...formData, locationBay: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Reason / Work Details */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Reason & Work Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Urgent Departure Prep EK-203 Cabin Deep Rectification"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>

              {/* Team Manager Approval Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Team Manager Approval Status
                  </label>
                  <select
                    value={formData.teamManagerStatus}
                    onChange={(e) => setFormData({ ...formData, teamManagerStatus: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:border-amber-500 focus:outline-none font-bold"
                  >
                    <option value="APPROVED">APPROVED (Authorized)</option>
                    <option value="PENDING">PENDING (Under Review)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Manager / Supervisor Name
                  </label>
                  <input
                    type="text"
                    value={formData.teamManagerName}
                    onChange={(e) => setFormData({ ...formData, teamManagerName: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-500/20"
                >
                  <Check className="h-4 w-4" />
                  {editingRecord ? 'Update Record' : 'Save & Authorize Overtime'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
