import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  ClockAlert,
  FileSpreadsheet,
  Printer,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  RotateCcw,
  Sparkles,
  Info,
  Calendar,
  PenTool,
  Check,
  Building2,
  Download,
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
  });
  const [loading, setLoading] = useState(false);

  // Filters
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal / Drawer state for logging OT
  const [showLogModal, setShowLogModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    employeeId: '',
    day: 12,
    shiftCode: 'D',
    scheduledEndTime: '19:30',
    actualEndTime: '22:30',
    bufferHours: 2.0,
    aircraftReg: 'A6-EVA',
    locationBay: 'DXB Stand B12',
    reason: 'A380 Flight Departure Prep & Deep Cabin Rectification',
    workOrderNo: 'WO-DXB-202611',
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

  // Formatted Month Title (e.g. NOVEMBER 2026)
  const formattedMonthTitle = useMemo(() => {
    const [y, m] = activeMonth.split('-');
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
  }, [activeMonth]);

  // Standard aviation date format: 11-Nov-2026
  const formatDisplayDate = (dateVal, day, monthStr) => {
    if (!dateVal && (!monthStr || !day)) return '-';
    let d;
    if (dateVal && typeof dateVal === 'string' && dateVal.includes('-')) {
      const parts = dateVal.split('-');
      if (parts.length === 3) {
        d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      } else {
        d = new Date(dateVal);
      }
    } else if (monthStr && day) {
      const [y, m] = monthStr.split('-').map(Number);
      d = new Date(y, m - 1, Number(day));
    }
    if (!d || isNaN(d.getTime())) return dateVal || '-';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dd = String(d.getDate()).padStart(2, '0');
    const mmm = months[d.getMonth()];
    const yyyy = d.getFullYear();
    return `${dd}-${mmm}-${yyyy}`;
  };

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

  // Auto-detect duty end time based on team and shift
  const getDefaultDutyEndTime = (empId, shift) => {
    const emp = employees.find((e) => e.id === Number(empId));
    const tId = emp?.team_id || '';
    if (tId === 'office' || tId === 'planner') {
      return '17:00'; // 8 to 5 office staff
    }
    if (tId === 'a-check') {
      return shift === 'N' ? '08:00' : '20:00'; // 8 to 8
    }
    // All other teams: 07:30 to 19:30
    return shift === 'N' ? '07:30' : '19:30';
  };

  const format4Digit = (timeStr, fallback = '0730') => {
    if (!timeStr) return fallback;
    const str = String(timeStr).trim();
    if (str.includes(':')) {
      const [h, m] = str.split(':');
      return String(h).padStart(2, '0') + String(m || '00').padStart(2, '0');
    }
    const digits = str.replace(/[^0-9]/g, '');
    if (digits.length === 4) return digits;
    if (digits.length === 3) return '0' + digits;
    return digits.padEnd(4, '0').slice(0, 4) || fallback;
  };

  const getWorkTimeDisplay = (rec) => {
    let start = rec.scheduled_start_time;
    if (!start) {
      const t = String(rec.team_name || rec.team_id || '').toLowerCase();
      const isNight = rec.shift_code === 'N';
      if (t.includes('office') || t.includes('planner')) {
        start = '0800';
      } else if (t.includes('a-check') || t.includes('acheck')) {
        start = isNight ? '2000' : '0800';
      } else {
        start = isNight ? '1930' : '0730';
      }
    } else {
      start = format4Digit(start, '0730');
    }
    const finish = format4Digit(rec.actual_end_time || rec.scheduled_end_time, '2300');
    return `${start} to ${finish}`;
  };

  const handleOpenNewModal = () => {
    setEditingRecord(null);
    const defaultEmp = employees[0]?.id || '';
    const defEnd = getDefaultDutyEndTime(defaultEmp, 'D');
    setFormData({
      employeeId: defaultEmp,
      day: 12,
      shiftCode: 'D',
      scheduledEndTime: defEnd,
      actualEndTime: defEnd === '17:00' ? '20:00' : (defEnd === '20:00' ? '23:00' : '22:30'),
      bufferHours: 2.0,
      aircraftReg: 'A6-EVA',
      locationBay: 'DXB Stand B12',
      reason: 'A380 Flight Departure Prep & Deep Cabin Rectification',
      workOrderNo: `WO-DXB-${Date.now().toString().slice(-6)}`,
      remarks: 'Operational urgency required under DXB airside regulations.',
    });
    setShowLogModal(true);
  };

  const handleEditRecord = (rec) => {
    setEditingRecord(rec);
    setFormData({
      employeeId: rec.employee_id,
      day: rec.day,
      shiftCode: rec.shift_code || 'D',
      scheduledEndTime: rec.scheduled_end_time || '19:30',
      actualEndTime: rec.actual_end_time || '22:30',
      bufferHours: rec.buffer_hours !== undefined ? rec.buffer_hours : 2.0,
      aircraftReg: rec.aircraft_reg || '',
      locationBay: rec.location_bay || '',
      reason: rec.reason || '',
      workOrderNo: rec.work_order_no || '',
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
            teamManagerStatus: 'PENDING',
            teamManagerName: '',
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
            teamManagerStatus: 'PENDING',
            teamManagerName: '',
            remarks: formData.remarks,
          }),
        });
        if (notify) notify('Overtime logged successfully', 'success');
      }
      setShowLogModal(false);
      fetchRecords();
    } catch (err) {
      if (notify) notify(err.message || 'Failed to save overtime', 'error');
    }
  };

  const handleDeleteRecord = async (id, empName) => {
    if (!window.confirm(`Delete overtime entry for ${empName}?`)) return;
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

  return (
    <div className="space-y-4 font-sans text-slate-800">
      {/* 1. Top Controls Bar (Screen only, matching portal's light/slate theme) */}
      <div className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-md shadow-amber-500/20">
              <ClockAlert className="h-6 w-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-slate-900">
                  Overtime Record
                </h1>
                <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-black text-amber-800 uppercase tracking-wide">
                  DXB Workshop · Airside
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 font-medium">
                Official Monthly Overtime Sheet · One Employee One Day Per Row · 2-Hour Deduction Rule
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleOpenNewModal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Log Overtime
            </button>
            <button
              onClick={handleDownloadExcel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-3 py-2 text-xs font-bold transition active:scale-95 cursor-pointer"
              title="Download formatted Excel (.xlsx)"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Excel Export
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 text-xs font-bold transition active:scale-95 cursor-pointer"
              title="Print official form"
            >
              <Printer className="h-4 w-4 text-slate-600" />
              Print Form
            </button>
          </div>
        </div>

        {/* Filters Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search staff name, UUDS ID, A/C Reg..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none"
              />
            </div>

            {/* Team Filter */}
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 focus:border-amber-500 focus:outline-none"
            >
              <option value="all">All Teams ({records.length} records)</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
              Total Staff: {summary.totalStaffCount || 0}
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-black text-amber-900">
              Payable OT: {(summary.totalApprovedOtHours || 0).toFixed(1)} h
            </span>
          </div>
        </div>
      </div>

      {/* 2. Official Form Master Document (Clean White Sheet, Screen & Print Layout) */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden print:border-none print:shadow-none print:p-0">
        {/* Form Official Header:
            - Top Left: UUDS Logo
            - Line 1: UUDS Aero DWC (DXB Workshop)
            - Line 2: MONTHLY OVERTIME RECORD FORM — NOVEMBER 2026
            - Line 3: DELETED
            - Top 3 rows: NO FILL COLOR (Pure clean white)
        */}
        <div className="p-4 sm:p-5 border-b border-slate-200 print:border-b-2 print:border-black print:pb-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img
                src="/uuds-logo.png"
                alt="UUDS Aero"
                className="h-10 sm:h-12 w-auto object-contain shrink-0"
              />
              <div>
                <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 uppercase">
                  UUDS Aero DWC (DXB Workshop)
                </h1>
                <h2 className="text-xs sm:text-sm font-bold text-slate-700 uppercase tracking-wide">
                  MONTHLY OVERTIME RECORD FORM — {formattedMonthTitle}
                </h2>
              </div>
            </div>

            <div className="text-right text-xs text-slate-500 font-mono print:text-black shrink-0">
              <div className="font-bold text-slate-700 print:text-black">Month: {activeMonth}</div>
              <div>Duty Staff: {summary.totalStaffCount || 0} | Total OT: {(summary.totalApprovedOtHours || 0).toFixed(1)} hrs</div>
            </div>
          </div>
        </div>

        {/* Master Overtime Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse print:text-[8.5px]">
            <thead className="bg-slate-900 text-white border-b border-slate-300 font-bold uppercase tracking-wider print:bg-white print:text-black print:border-b-2 print:border-black">
              <tr>
                <th className="py-2.5 px-2 text-center w-8">#</th>
                <th className="py-2.5 px-2 text-center w-24">Date</th>
                <th className="py-2.5 px-2 text-center w-20">UUDS ID</th>
                <th className="py-2.5 px-2 text-center min-w-[140px]">Staff Name</th>
                <th className="py-2.5 px-2 text-center min-w-[90px]">Trade / Skill</th>
                <th className="py-2.5 px-2 text-center min-w-[85px]">Team</th>
                <th className="py-2.5 px-2 text-center w-28 whitespace-nowrap">Work Time</th>
                <th className="py-2.5 px-2 text-center w-16">Extra Time</th>
                <th className="py-2.5 px-2 text-center w-20 text-emerald-300 print:text-black font-black">Approved OT</th>
                <th className="py-2.5 px-2 text-center min-w-[150px]">Work / A/C Reg / Bay</th>
                <th className="py-2.5 px-2 text-center min-w-[130px] font-bold text-amber-300 print:text-black">
                  Team Manager Signature
                </th>
                <th className="py-2.5 px-2 text-center no-print w-14">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-sans print:divide-gray-400">
              {loading && records.length === 0 ? (
                <tr>
                  <td colSpan="12" className="py-10 text-center text-slate-400">
                    Loading overtime records…
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan="12" className="py-10 text-center text-slate-400">
                    No overtime records found. Click "+ Log Overtime" to add entries.
                  </td>
                </tr>
              ) : (
                records.map((rec, idx) => (
                  <tr
                    key={rec.id}
                    className={`transition-colors hover:bg-slate-50/80 ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                    }`}
                  >
                    <td className="py-2 px-2 text-center font-mono font-bold text-slate-400 print:text-black">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-2 text-center font-bold whitespace-nowrap text-slate-800 print:text-black font-mono text-xs">
                      {formatDisplayDate(rec.date_str, rec.day, activeMonth)}
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-black text-xs text-sky-700 print:text-black">
                      {rec.uuds_no || '-'}
                    </td>
                    <td className="py-2 px-2 text-left font-bold text-slate-900 print:text-black whitespace-nowrap">
                      {rec.emp_name}
                    </td>
                    <td className="py-2 px-2 text-center text-slate-600 print:text-black whitespace-nowrap">
                      {rec.skill}
                    </td>
                    <td className="py-2 px-2 text-center text-slate-600 print:text-black whitespace-nowrap">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-700 print:bg-transparent print:border print:border-gray-400 print:p-0">
                        {rec.team_name}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-bold text-slate-800 print:text-black whitespace-nowrap">
                      {getWorkTimeDisplay(rec)}
                    </td>
                    <td className="py-2 px-2 text-center font-mono text-slate-700 print:text-black font-semibold">
                      {Number(rec.total_extra_hours).toFixed(1)} h
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-black text-emerald-700 print:text-black">
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 border border-emerald-200 print:border-none print:p-0">
                        +{Number(rec.approved_ot_hours).toFixed(1)} h
                      </span>
                    </td>
                    <td className="py-2 px-2 text-left text-slate-700 print:text-black">
                      <div className="font-semibold text-slate-900 print:text-black truncate max-w-[200px]">
                        {rec.aircraft_reg && (
                          <span className="text-amber-800 font-mono font-bold mr-1 print:text-black">
                            [{rec.aircraft_reg}]
                          </span>
                        )}
                        {rec.reason || 'Urgent Airside Turnaround'}
                      </div>
                      {rec.location_bay && (
                        <div className="text-[10px] text-slate-400 print:text-gray-600">
                          {rec.location_bay}
                        </div>
                      )}
                    </td>

                    {/* TEAM MANAGER COLUMN: COMPLETELY BLANK FOR PHYSICAL PAPER SIGNATURE */}
                    <td className="py-2 px-2 text-center min-w-[130px] border-l border-slate-200 print:border-black">
                      <div className="h-6 w-full flex items-end justify-center">
                        <div className="w-24 border-b border-dashed border-slate-300 print:border-black"></div>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-2 px-2 text-center no-print">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEditRecord(rec)}
                          className="rounded p-1 text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                          title="Edit"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRecord(rec.id, rec.emp_name)}
                          className="rounded p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Totals Summary Row */}
            <tfoot className="bg-slate-100 text-slate-900 border-t-2 border-slate-300 font-bold print:bg-white print:border-black">
              <tr>
                <td colSpan="7" className="py-2.5 px-3 text-right uppercase tracking-wider text-xs">
                  Monthly Total Overtime Summary:
                </td>
                <td className="py-2.5 px-2 text-center font-mono text-slate-900 text-xs">
                  {(summary.totalExtraHours || 0).toFixed(1)} h
                </td>
                <td className="py-2.5 px-2 text-center font-mono text-emerald-700 text-sm font-black print:text-black">
                  +{(summary.totalApprovedOtHours || 0).toFixed(1)} h
                </td>
                <td colSpan="3" className="py-2.5 px-3 text-xs text-slate-600 print:text-black">
                  {records.length} Duty Days Logged
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 3. Bottom Signature & Approval Section (Screen & Print Layout) */}
        <div className="border-t border-slate-200 bg-slate-50/60 p-4 sm:p-5 print:border-t-2 print:border-black print:bg-white print:p-3 print:break-inside-avoid">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 max-w-4xl mx-auto">
            {/* Box 1: Workshop Manager Approval (User name removed, blank line) */}
            <div className="rounded-xl border border-slate-300 bg-white p-3.5 shadow-2xs print:border-black print:shadow-none">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700 print:text-black flex items-center justify-between">
                <span>Workshop Manager Approval</span>
                <PenTool className="h-3.5 w-3.5 text-slate-400 no-print" />
              </div>
              <div className="mt-2 text-xs font-bold text-slate-900 print:text-black">
                Name: ______________________
              </div>
              <div className="mt-4 border-b border-dashed border-slate-400 print:border-black pb-1">
                <span className="text-[10px] text-slate-400 print:text-black">Signature:</span>
              </div>
              <div className="mt-2 text-[10px] text-slate-500 print:text-black flex justify-between">
                <span>Date: ____-___-2026</span>
                <span className="font-semibold text-amber-700 print:text-black">[ APPROVED ]</span>
              </div>
            </div>

            {/* Box 2: Project Manager Final Authorization (JOSEPH SHERONNE) */}
            <div className="rounded-xl border border-slate-300 bg-white p-3.5 shadow-2xs print:border-black print:shadow-none">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700 print:text-black flex items-center justify-between">
                <span>Project Manager Approval</span>
                <Building2 className="h-3.5 w-3.5 text-slate-400 no-print" />
              </div>
              <div className="mt-2 text-xs font-bold text-slate-900 print:text-black">
                Name: <span className="font-black text-slate-950 print:text-black">JOSEPH SHERONNE</span>
              </div>
              <div className="mt-4 border-b border-dashed border-slate-400 print:border-black pb-1">
                <span className="text-[10px] text-slate-400 print:text-black">Signature:</span>
              </div>
              <div className="mt-2 text-[10px] text-slate-500 print:text-black flex justify-between">
                <span>Date: ____-___-2026</span>
                <span className="font-semibold text-sky-800 print:text-black">[ FINAL SIGN-OFF ]</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Modal for Logging & Editing Overtime */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingRecord ? 'Edit Overtime Entry' : 'Log Overtime Record'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Calculated with 2-Hour Non-OT Deduction Rule
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLogModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveOvertime} className="mt-4 space-y-3.5 text-xs">
              {/* Employee Selection */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Employee (Name · UUDS ID · Contingent No)
                </label>
                <select
                  value={formData.employeeId}
                  onChange={(e) => {
                    const empId = e.target.value;
                    const defEnd = getDefaultDutyEndTime(empId, formData.shiftCode);
                    setFormData({
                      ...formData,
                      employeeId: empId,
                      scheduledEndTime: defEnd,
                      actualEndTime: defEnd === '17:00' ? '20:00' : (defEnd === '20:00' ? '23:00' : '22:30'),
                    });
                  }}
                  disabled={!!editingRecord}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 font-semibold focus:border-amber-500 focus:bg-white focus:outline-none"
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
                  <label className="block text-slate-700 font-bold mb-1">
                    Day of Month (1 - 30/31)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.day}
                    onChange={(e) => setFormData({ ...formData, day: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 font-bold focus:border-amber-500 focus:bg-white focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Shift Code
                  </label>
                  <select
                    value={formData.shiftCode}
                    onChange={(e) => {
                      const sc = e.target.value;
                      const defEnd = getDefaultDutyEndTime(formData.employeeId, sc);
                      setFormData({
                        ...formData,
                        shiftCode: sc,
                        scheduledEndTime: defEnd,
                        actualEndTime: defEnd === '17:00' ? '20:00' : (defEnd === '20:00' ? '23:00' : '22:30'),
                      });
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 font-semibold focus:border-amber-500 focus:bg-white focus:outline-none"
                  >
                    <option value="D">D — Day Shift (Standard 12h Duty)</option>
                    <option value="N">N — Night Shift (Standard 12h Duty)</option>
                    <option value="M">M — Morning / Office (08:00 to 17:00)</option>
                    <option value="OFF">OFF — Day Off Call-in OT</option>
                  </select>
                </div>
              </div>

              {/* Timings & Buffer */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Duty End Time
                  </label>
                  <input
                    type="time"
                    value={formData.scheduledEndTime}
                    onChange={(e) => setFormData({ ...formData, scheduledEndTime: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 font-mono font-bold focus:border-amber-500 focus:bg-white focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Actual Finish Time
                  </label>
                  <input
                    type="time"
                    value={formData.actualEndTime}
                    onChange={(e) => setFormData({ ...formData, actualEndTime: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-amber-800 font-mono font-bold focus:border-amber-500 focus:bg-white focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Buffer Rule (Hrs)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formData.bufferHours}
                    onChange={(e) => setFormData({ ...formData, bufferHours: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-rose-700 font-mono font-bold focus:border-amber-500 focus:bg-white focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Live Calculation Preview Card */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                <div className="text-[11px] font-bold text-amber-900">
                  Overtime Calculation Breakdown:
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white p-2 border border-slate-200">
                    <div className="text-[10px] text-slate-500">Total Extra Duty</div>
                    <div className="text-sm font-bold text-slate-900 font-mono">{liveCalculation.extra.toFixed(1)} h</div>
                  </div>
                  <div className="rounded-lg bg-white p-2 border border-slate-200">
                    <div className="text-[10px] text-rose-600">1st 2h Non-OT</div>
                    <div className="text-sm font-bold text-rose-600 font-mono">-{liveCalculation.buffer.toFixed(1)} h</div>
                  </div>
                  <div className="rounded-lg bg-emerald-100/70 p-2 border border-emerald-300">
                    <div className="text-[10px] text-emerald-800 font-bold">Approved Net OT</div>
                    <div className="text-base font-black text-emerald-800 font-mono">+{liveCalculation.approved.toFixed(1)} h</div>
                  </div>
                </div>
              </div>

              {/* Aircraft & Bay Info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Aircraft Reg (e.g. A6-EVA)
                  </label>
                  <input
                    type="text"
                    placeholder="A6-EVA"
                    value={formData.aircraftReg}
                    onChange={(e) => setFormData({ ...formData, aircraftReg: e.target.value.toUpperCase() })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 font-mono font-bold uppercase focus:border-amber-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Location / Bay (e.g. Stand B12)
                  </label>
                  <input
                    type="text"
                    placeholder="Stand B12 / Hangar 2"
                    value={formData.locationBay}
                    onChange={(e) => setFormData({ ...formData, locationBay: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 font-semibold focus:border-amber-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Reason / Work Details */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Reason &amp; Work Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Urgent Departure Prep EK-203 Cabin Rectification"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 font-semibold focus:border-amber-500 focus:bg-white focus:outline-none"
                  required
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-sm transition"
                >
                  <Check className="h-4 w-4" />
                  {editingRecord ? 'Update Record' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
