import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  FileSpreadsheet,
  FileText,
  IdCard,
  MessageCircle,
  Moon,
  Plane,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch, SHIFT_STYLES } from '../api.js';

export default function CommandDashboard({
  overview,
  selectedDay,
  setSelectedDay,
  onNavigate,
  onSelectTeamRoster,
  onOpenEmergencyForIncident,
  onDataChanged,
  notify,
}) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [expiryModalMonth, setExpiryModalMonth] = useState(null); // null or { key: '2026-11', label: 'Nov 2026' }
  const [selectedStaffToEdit, setSelectedStaffToEdit] = useState(null); // emp object to update inline
  const [editForm, setEditForm] = useState({ airsidePassExpiry: '', contingentCardExpiry: '', visaExpiry: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!overview) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        Loading UUDS DXB Workshop operations data...
      </div>
    );
  }

  const {
    month,
    totals,
    teamSummaries,
    skillBreakdown,
    openIncidents,
    recentAudit,
    dayOfWeek,
    expirySummary = [],
    expiryAlerts = [],
    coverageAlerts = [],
  } = overview;
  const maxDays = month.days_in_month;

  const handleOpenEdit = (emp) => {
    setSelectedStaffToEdit(emp);
    setEditForm({
      airsidePassExpiry: emp.airsidePassExpiry || emp.airside_pass_expiry || '',
      contingentCardExpiry: emp.contingentCardExpiry || emp.contingent_card_expiry || '',
      visaExpiry: emp.visaExpiry || emp.visa_expiry || '',
    });
  };

  const handleSaveDates = async (e) => {
    e.preventDefault();
    if (!selectedStaffToEdit) return;
    setSaving(true);
    try {
      await apiFetch(`/api/employees/${selectedStaffToEdit.employeeId || selectedStaffToEdit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          airsidePassExpiry: editForm.airsidePassExpiry,
          contingentCardExpiry: editForm.contingentCardExpiry,
          medicalExpiry: editForm.contingentCardExpiry,
          visaExpiry: editForm.visaExpiry,
        }),
      });
      if (notify) notify(`Updated expiry dates for ${selectedStaffToEdit.name}`);
      setSelectedStaffToEdit(null);
      if (onDataChanged) onDataChanged();
    } catch (err) {
      if (notify) notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Filter alerts by modal month (or all next 3 months if key === 'ALL')
  const activeModalAlerts = expiryAlerts.filter((a) => {
    if (!expiryModalMonth) return false;
    if (expiryModalMonth.key === 'ALL') return true;
    return a.expiryDate && a.expiryDate.startsWith(expiryModalMonth.key);
  });

  // Format attached type date & clock: "FRIDAY, 13-Nov-2026 | 09:30:43"
  const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formattedDayName = DAYS_OF_WEEK[currentTime.getDay()];
  const formattedDate = `${String(currentTime.getDate()).padStart(2, '0')}-${MONTHS_SHORT[currentTime.getMonth()]}-${currentTime.getFullYear()}`;
  const formattedTime = currentTime.toTimeString().slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Consolidated Master Operational Bar: Title, Day Selector, Actions & Live Date/Clock */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left: Operational Title & Badge */}
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-slate-850 to-blue-950 text-sky-400 shadow-md shrink-0 border border-slate-800">
              <CalendarDays className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900">
                UUDS DXB Manpower Portal
              </h1>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                Centralized Manpower Scheduling, Team Deployment &amp; Tracking
              </p>
            </div>
          </div>

          {/* Right: Attached Type Live Date & Clock Pill (High Contrast & Clear) */}
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-4 py-2.5 shadow-md">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Calendar className="h-4 w-4 text-sky-400 shrink-0 stroke-[2.5]" />
              <span className="font-black tracking-wider text-sky-400 uppercase">
                {formattedDayName},
              </span>
              <span className="font-black tracking-wide text-white">
                {formattedDate}
              </span>
            </div>
            <span className="h-4 w-[1px] bg-slate-700" />
            <div className="flex items-center gap-1.5 font-mono font-black text-amber-300 text-xs sm:text-sm tracking-widest">
              <Clock className="h-4 w-4 text-amber-400 shrink-0 stroke-[2.5]" />
              <span className="font-black text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.35)]">
                {formattedTime}
              </span>
              <span className="rounded bg-amber-400/15 border border-amber-400/30 px-1 py-0.5 text-[9px] font-black text-amber-300 uppercase ml-0.5">
                GST
              </span>
            </div>
          </div>
        </div>

        {/* Single Unified Action Line: Day Stepper, Excel, PDF, WhatsApp, Emergency, Next Month, and Expiry Counter */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* Day Stepper */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                onClick={() => setSelectedDay((d) => Math.max(1, d - 1))}
                disabled={selectedDay <= 1}
                className="rounded-lg p-1.5 text-slate-600 hover:bg-white disabled:opacity-40"
                title="Previous Day"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(Number(e.target.value))}
                className="bg-transparent px-2 text-sm font-semibold text-slate-800 focus:outline-none"
              >
                {Array.from({ length: maxDays }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    Day {String(d).padStart(2, '0')}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setSelectedDay((d) => Math.min(maxDays, d + 1))}
                disabled={selectedDay >= maxDays}
                className="rounded-lg p-1.5 text-slate-600 hover:bg-white disabled:opacity-40"
                title="Next Day"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <a
              href={`/api/export/excel?month=${month.month}&teamId=all`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </a>
            <a
              href={`/api/export/pdf?month=${month.month}&teamId=all`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100"
            >
              <FileText className="h-3.5 w-3.5" /> PDF
            </a>
            <button
              onClick={() => {
                const lines = [
                  `*UUDS DXB WORKSHOP — DAILY BRIEFING*`,
                  `*Date:* ${month.label} — Day ${selectedDay} (${dayOfWeek})`,
                  `*Total On Duty:* ${totals.onDuty} / ${totals.totalStaff} (Day: ${totals.dayShift}, Night: ${totals.nightShift}, General/Trn: ${totals.generalTraining})`,
                  `*OFF:* ${totals.offDuty} | *Vacation/Leave:* ${totals.onLeave}`,
                  '',
                  ...teamSummaries.map((t) => `• *${t.name}:* ${t.onDuty}/${t.totalStaff} On Duty (D:${t.counts.D} N:${t.counts.N} M/T:${t.counts.M + t.counts.T} OFF:${t.counts.OFF})`),
                ];
                window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer');
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
            >
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </button>
            <button
              onClick={() => onNavigate('emergency')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700"
            >
              <Zap className="h-3.5 w-3.5" /> Emergency
            </button>
            <button
              onClick={() => onNavigate('builder')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              <CalendarDays className="h-3.5 w-3.5 text-sky-400" /> Next Month
            </button>
          </div>

          {/* Expiry Pill: In Same Row With WhatsApp, Adjusted Right */}
          <div
            onClick={() => setExpiryModalMonth({ key: 'ALL', label: 'Next 3 Months' })}
            title="Click to view expiring dates & update them"
            className="group flex cursor-pointer items-center gap-2.5 rounded-2xl border border-amber-300 bg-amber-50/90 px-3.5 py-1.5 shadow-xs transition hover:border-amber-400 hover:bg-amber-100/90"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500 text-white text-xs font-black group-hover:bg-amber-600 transition shadow-2xs">
                !
              </span>
              <div className="leading-tight">
                <span className="block text-[11px] font-extrabold uppercase tracking-wider text-amber-950">
                  3-Month Expiry
                </span>
                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-black">
                  <span className="text-teal-700 font-extrabold">Pass</span>
                  <span className="text-amber-400">·</span>
                  <span className="text-sky-700 font-extrabold">Card</span>
                  <span className="text-amber-400">·</span>
                  <span className="text-purple-700 font-extrabold">Visa</span>
                </div>
              </div>
            </div>

            <div className="h-7 w-px bg-amber-300 mx-1" />

            {/* Month-by-month chips */}
            <div className="flex items-center gap-2">
              {expirySummary.length > 0 ? (
                expirySummary.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpiryModalMonth(m);
                    }}
                    className="rounded-xl border border-amber-200/90 bg-white px-2.5 py-1 text-center shadow-xs transition hover:border-amber-400 hover:bg-amber-50 hover:scale-105"
                    title={`Click to view and update ${m.label} expiries`}
                  >
                    <div className="text-[11px] font-extrabold text-slate-900 leading-none">
                      {m.label}
                    </div>
                    <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[11px] font-extrabold">
                      <span className="inline-flex items-center rounded bg-teal-50 px-1 py-0.5 text-teal-700 font-black" title="Airside Pass Expiries">
                        P:{m.pass}
                      </span>
                      <span className="inline-flex items-center rounded bg-sky-50 px-1 py-0.5 text-sky-700 font-black" title="Contingent Card Expiries">
                        C:{m.card}
                      </span>
                      <span className="inline-flex items-center rounded bg-purple-50 px-1 py-0.5 text-purple-700 font-black" title="Visa Expiries">
                        V:{m.visa}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <span className="text-xs font-bold text-amber-800">All Current</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Top KPI Cards (All Color Filled) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {/* Total Workforce Card - Filled Sky/Blue */}
        <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-100/70 via-blue-50/50 to-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-sky-800">
            <span>TOTAL WORKFORCE</span>
            <Users className="h-4 w-4 text-sky-600 stroke-[2.5]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight text-sky-950">{totals.totalStaff}</span>
            <span className="text-xs font-semibold text-sky-700">across {teamSummaries.length} teams</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-sky-200/80">
            <div
              className="h-full rounded-full bg-sky-600 transition-all duration-500"
              style={{ width: `${Math.round((totals.onDuty / Math.max(1, totals.totalStaff)) * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] font-semibold text-sky-800/90">
            {Math.round((totals.onDuty / Math.max(1, totals.totalStaff)) * 100)}% deployed on Day {selectedDay}
          </p>
        </div>

        {/* On Duty Today Card - Filled Emerald */}
        <div className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-100/80 via-emerald-50/60 to-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-emerald-800">
            <span>ON DUTY TODAY</span>
            <Sun className="h-4 w-4 text-emerald-600 stroke-[2.5]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight text-emerald-950">{totals.onDuty}</span>
            {totals.overtimeToday > 0 && (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800 border border-sky-300">
                +{totals.overtimeToday} OT
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs font-bold">
            <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-white shadow-2xs">D: {totals.dayShift}</span>
            <span className="rounded-md bg-purple-600 px-2 py-0.5 text-white shadow-2xs">N: {totals.nightShift}</span>
            <span className="rounded-md bg-amber-400 px-2 py-0.5 text-slate-950 shadow-2xs">M/T: {totals.generalTraining}</span>
          </div>
        </div>

        {/* Night Operations Card - Filled Purple/Indigo */}
        <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-100/70 via-indigo-50/50 to-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-purple-800">
            <span>NIGHT OPERATIONS</span>
            <Moon className="h-4 w-4 text-purple-600 stroke-[2.5]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight text-purple-950">{totals.nightShift}</span>
            <span className="text-xs font-bold text-purple-700">19:30 – 07:30</span>
          </div>
          <p className="mt-3 text-[11px] font-semibold text-purple-800/90">
            On Wing A/B/C &amp; Paint Booth Night coverage
          </p>
        </div>

        {/* Off / Vacation / Leave Card - Filled Amber/Orange */}
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-100/70 via-orange-50/50 to-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-amber-800">
            <span>OFF / VACATION / LEAVE</span>
            <Clock className="h-4 w-4 text-amber-600 stroke-[2.5]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight text-amber-950">
              {totals.offDuty + totals.onLeave}
            </span>
            <span className="text-xs font-semibold text-amber-700">standby pool</span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="rounded-md bg-rose-100 border border-rose-200 px-2 py-0.5 font-bold text-rose-800">
              OFF: {totals.offDuty}
            </span>
            <span className="rounded-md bg-slate-200/90 border border-slate-300 px-2 py-0.5 font-bold text-slate-800">
              V/L: {totals.onLeave}
            </span>
          </div>
        </div>

        {/* Coverage Alerts Card - Filled Rose or Teal */}
        <div
          className={`rounded-2xl border p-4 shadow-sm transition-all ${
            totals.openIncidentsCount > 0
              ? 'border-rose-300 bg-gradient-to-br from-rose-100/80 via-rose-50/60 to-white'
              : 'border-teal-200 bg-gradient-to-br from-teal-100/70 via-emerald-50/50 to-white'
          }`}
        >
          <div className={`flex items-center justify-between text-xs font-extrabold uppercase tracking-wider ${
            totals.openIncidentsCount > 0 ? 'text-rose-800' : 'text-teal-800'
          }`}>
            <span>COVERAGE ALERTS</span>
            {totals.openIncidentsCount > 0 ? (
              <ShieldAlert className="h-4 w-4 text-rose-600 stroke-[2.5]" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-teal-600 stroke-[2.5]" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-3xl font-black tracking-tight ${
              totals.openIncidentsCount > 0 ? 'text-rose-950' : 'text-teal-950'
            }`}>
              {totals.openIncidentsCount}
            </span>
            <span className={`text-xs font-semibold ${
              totals.openIncidentsCount > 0 ? 'text-rose-700' : 'text-teal-700'
            }`}>
              {totals.openIncidentsCount > 0 ? 'open gaps' : 'all safe'}
            </span>
          </div>
          <p className={`mt-3 text-[11px] font-semibold ${
            totals.openIncidentsCount > 0 ? 'text-rose-800/90' : 'text-teal-800/90'
          }`}>
            {teamSummaries.filter((t) => t.belowTarget).length} team(s) below target on Day {selectedDay}
          </p>
        </div>
      </div>

      {/* Monthly Coverage Alerts */}
      {coverageAlerts.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between border-b border-rose-200 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-600 text-white shadow-sm">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-rose-950">
                  Monthly Minimum Coverage Alerts
                </h3>
                <p className="text-[10px] font-semibold text-rose-700">
                  {coverageAlerts.length} days below minimum operational staffing target
                </p>
              </div>
            </div>
          </div>
          <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1 text-xs">
            {coverageAlerts.slice(0, 10).map((c, idx) => (
              <div
                key={idx}
                onClick={() => onSelectTeamRoster(c.teamId)}
                className="flex cursor-pointer items-center justify-between rounded-xl border border-rose-200 bg-white px-3 py-2 transition hover:bg-rose-50 hover:shadow-xs"
              >
                <div>
                  <span className="font-bold text-slate-900">{c.teamName}</span>
                  <span className="ml-2 text-slate-500">Day {c.day}</span>
                </div>
                <span className="rounded-md bg-rose-100 px-2.5 py-0.5 font-bold text-rose-800">
                  {c.onDuty} / {c.minTarget} min
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 8-Team Command Cards */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600">
            Team Readiness — Day {selectedDay} ({dayOfWeek})
          </h3>
          <button
            onClick={() => onSelectTeamRoster('all')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900"
          >
            Open Master Grid (All {totals.totalStaff}) <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {teamSummaries.map((t) => (
            <div
              key={t.id}
              onClick={() => onSelectTeamRoster(t.id)}
              className={`group cursor-pointer rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                t.belowTarget ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      {t.category}
                    </span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black tracking-wider ${
                      t.status === 'PUBLISHED'
                        ? 'bg-sky-50 border border-sky-200 text-sky-800'
                        : 'bg-amber-50 border border-amber-200 text-amber-800'
                    }`}>
                      {t.status || 'PUBLISHED'} · {t.revision || 'R00'}
                    </span>
                  </div>
                  <h4 className="mt-1.5 text-base font-bold text-slate-900 group-hover:text-sky-700">
                    {t.name}
                  </h4>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-extrabold text-slate-900">{t.onDuty}</span>
                  <span className="text-xs font-medium text-slate-400"> / {t.totalStaff}</span>
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="font-medium text-slate-500">Min Target: {t.minDailyTarget}</span>
                  <span className={`font-bold ${t.belowTarget ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {t.coveragePct}% {t.belowTarget ? '· Low' : '· OK'}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all ${
                      t.belowTarget ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, t.coveragePct)}%` }}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                {t.counts.D > 0 && <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">D: {t.counts.D}</span>}
                {t.counts.N > 0 && <span className="rounded bg-purple-100 px-2 py-0.5 text-purple-800">N: {t.counts.N}</span>}
                {(t.counts.M > 0 || t.counts.T > 0) && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">M/T: {t.counts.M + t.counts.T}</span>
                )}
                <span className="rounded bg-rose-100 px-2 py-0.5 text-rose-800">OFF: {t.counts.OFF}</span>
                {t.onLeave > 0 && <span className="rounded bg-slate-200 px-2 py-0.5 text-slate-700">V/L: {t.onLeave}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 30-Day Coverage Heatmap */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">Monthly Staffing Coverage Heatmap</h3>
            <p className="text-xs text-slate-500">
              Click any day cell to inspect that day's breakdown. Amber cells indicate staffing below team minimum target.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-emerald-500" /> On Target
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-amber-400" /> Below Target
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-bold text-slate-500">
                <th className="sticky left-0 bg-white py-2 pr-3 text-left">TEAM</th>
                {teamSummaries[0]?.dailyTrend.map((d) => (
                  <th
                    key={d.day}
                    onClick={() => setSelectedDay(d.day)}
                    className={`cursor-pointer px-1 py-1.5 transition ${
                      d.day === selectedDay ? 'rounded-t-md bg-slate-900 text-white' : 'hover:bg-slate-100'
                    }`}
                  >
                    <div>{d.dow[0]}</div>
                    <div>{d.day}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamSummaries.map((team) => (
                <tr key={team.id} className="border-b border-slate-100">
                  <td
                    onClick={() => onSelectTeamRoster(team.id)}
                    className="sticky left-0 cursor-pointer whitespace-nowrap bg-white py-2 pr-3 text-left font-semibold text-slate-800 hover:text-sky-700"
                  >
                    {team.name}
                  </td>
                  {team.dailyTrend.map((d) => (
                    <td
                      key={d.day}
                      onClick={() => setSelectedDay(d.day)}
                      title={`${team.name} · Day ${d.day}: ${d.onDuty} on duty (Target: ${team.minDailyTarget})`}
                      className={`cursor-pointer p-0.5 ${d.day === selectedDay ? 'bg-slate-900/10' : ''}`}
                    >
                      <div
                        className={`mx-auto flex h-6 w-7 items-center justify-center rounded font-bold transition ${
                          d.belowTarget
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-emerald-500/90 text-white'
                        } ${d.day === selectedDay ? 'ring-2 ring-slate-900' : ''}`}
                      >
                        {d.onDuty}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Grid: Skill Matrix + Incidents & Recent Audit */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5">
          <div className="mb-3 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-slate-600" />
            <h3 className="text-base font-bold text-slate-900">Skill Readiness — Day {selectedDay}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500">
                  <th className="py-2">SKILL / ROLE</th>
                  <th className="py-2 text-center">ON DUTY</th>
                  <th className="py-2 text-center">D / N / M</th>
                  <th className="py-2 text-center">OFF / V</th>
                </tr>
              </thead>
              <tbody>
                {skillBreakdown.map((sk) => (
                  <tr key={sk.skill} className="border-b border-slate-100">
                    <td className="py-2 font-semibold text-slate-800">{sk.skill}</td>
                    <td className="py-2 text-center">
                      <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                        {sk.onDuty} / {sk.total}
                      </span>
                    </td>
                    <td className="py-2 text-center text-slate-600">
                      {sk.D} / {sk.N} / {sk.M}
                    </td>
                    <td className="py-2 text-center text-slate-500">
                      {sk.OFF} / {sk.leave}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-7">
          {/* Open Emergencies / Incidents */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <h3 className="text-base font-bold text-slate-900">Emergency & Absence Tracker</h3>
              </div>
              <button
                onClick={() => onNavigate('emergency')}
                className="text-xs font-semibold text-rose-600 hover:text-rose-800"
              >
                Manage All →
              </button>
            </div>
            {openIncidents.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-xs font-medium text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                No emergency absences or coverage gaps recorded for {month.label}.
              </div>
            ) : (
              <div className="space-y-2">
                {openIncidents.slice(0, 5).map((inc) => (
                  <div
                    key={inc.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            inc.resolution_status === 'OPEN'
                              ? 'bg-rose-600 text-white'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {inc.resolution_status}
                        </span>
                        <span className="font-bold text-slate-900">{inc.employee_name}</span>
                        <span className="text-slate-500">({inc.team_name})</span>
                      </div>
                      <p className="mt-0.5 text-slate-600">
                        Day {inc.start_day}
                        {inc.end_day !== inc.start_day ? `–${inc.end_day}` : ''} · {inc.incident_type} · {inc.reason || 'No reason noted'}
                        {inc.replacement_name ? ` · Covered by ${inc.replacement_name}` : ''}
                      </p>
                    </div>
                    {inc.resolution_status === 'OPEN' && (
                      <button
                        onClick={() => onOpenEmergencyForIncident(inc)}
                        className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800"
                      >
                        Assign Cover
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Audit Trail */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Recent Roster Changes & Audit Log</h3>
              <button
                onClick={() => onNavigate('records')}
                className="text-xs font-semibold text-sky-700 hover:text-sky-900"
              >
                Full History →
              </button>
            </div>
            <div className="space-y-2">
              {recentAudit.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 text-xs last:border-0">
                  <div>
                    <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                      {log.action_type}
                    </span>
                    <span className="font-semibold text-slate-900">{log.employee_name || log.team_name}</span>
                    {log.old_shift && log.new_shift && (
                      <span className="ml-1.5 text-slate-600">
                        ({log.old_shift} → <strong className="text-slate-900">{log.new_shift}</strong>)
                      </span>
                    )}
                    <p className="mt-0.5 text-slate-500">{log.reason}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-400">
                    {log.created_at?.slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Expiring Documents List & Date Updater - Fixed Full Height */}
      {expiryModalMonth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-6 backdrop-blur-xs">
          <div className="relative flex h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-900 px-6 py-4 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-slate-950">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight">
                    Expiring Documents &amp; Date Updater — {expiryModalMonth.label}
                  </h3>
                  <p className="text-xs text-slate-300">
                    Review Airside Pass, Contingent Card, and Visa expiry dates. Click any row or &quot;Update Dates&quot; to change.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Month switch tabs inside modal */}
                <div className="hidden sm:flex items-center rounded-xl bg-slate-800 p-1">
                  <button
                    onClick={() => setExpiryModalMonth({ key: 'ALL', label: 'Next 3 Months' })}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      expiryModalMonth.key === 'ALL' ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    All 3 Months
                  </button>
                  {expirySummary.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setExpiryModalMonth(m)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                        expiryModalMonth.key === m.key ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {m.label} ({m.total})
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setExpiryModalMonth(null);
                    setSelectedStaffToEdit(null);
                  }}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Stretches full available height with internal scroll */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {activeModalAlerts.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center py-20 text-center text-slate-500">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-2" />
                  <p className="text-base font-bold text-slate-700">No expiring documents in {expiryModalMonth.label}</p>
                  <p className="text-xs text-slate-400 mt-1">All active staff passes, cards, and visas for this period are current.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 px-1 font-semibold">
                    <span>Showing {activeModalAlerts.length} expiring record(s)</span>
                    <span>Click any staff to edit Pass, Card, or Visa dates directly</span>
                  </div>

                  <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                    {activeModalAlerts.map((emp, idx) => {
                      const isSelected = selectedStaffToEdit && (selectedStaffToEdit.employeeId || selectedStaffToEdit.id) === emp.employeeId;
                      return (
                        <div key={`${emp.employeeId}-${idx}`} className="transition">
                          <div
                            onClick={() => handleOpenEdit(emp)}
                            className={`flex flex-wrap items-center justify-between gap-3 p-3.5 cursor-pointer transition ${
                              isSelected ? 'bg-sky-50/80 border-l-4 border-l-sky-500' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${
                                  emp.documentType.toLowerCase().includes('visa')
                                    ? 'bg-purple-100 text-purple-800'
                                    : emp.documentType.toLowerCase().includes('pass')
                                    ? 'bg-teal-100 text-teal-800'
                                    : 'bg-sky-100 text-sky-800'
                                }`}
                              >
                                {emp.documentType.toLowerCase().includes('visa') ? 'V' : emp.documentType.toLowerCase().includes('pass') ? 'P' : 'C'}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-extrabold text-slate-900 text-sm truncate">{emp.name}</span>
                                  {emp.uudsNo && (
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600">
                                      {emp.uudsNo}
                                    </span>
                                  )}
                                  <span className="text-xs text-slate-400">· {emp.teamName}</span>
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                  <span>
                                    Expiring: <strong className="text-slate-800 font-bold">{emp.documentType}</strong> ({emp.expiryDate})
                                  </span>
                                  {emp.contingentNo && <span>Contingent: #{emp.contingentNo}</span>}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                                  emp.daysLeft <= 0
                                    ? 'bg-rose-600 text-white'
                                    : emp.daysLeft <= 30
                                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                    : emp.daysLeft <= 60
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                    : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                }`}
                              >
                                {emp.daysLeft <= 0 ? 'EXPIRED' : `${emp.daysLeft}d left`}
                              </span>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEdit(emp);
                                }}
                                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                                  isSelected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                              >
                                {isSelected ? 'Editing' : 'Update Dates'}
                              </button>
                            </div>
                          </div>

                          {/* Inline Edit Drawer */}
                          {isSelected && (
                            <form
                              onSubmit={handleSaveDates}
                              className="border-t border-sky-100 bg-sky-50/50 p-4"
                            >
                              <div className="mb-2 flex items-center justify-between">
                                <span className="text-xs font-extrabold uppercase tracking-wide text-sky-950">
                                  Update Dates for {selectedStaffToEdit.name}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  Saves directly to employee records &amp; updates all 3-month counts
                                </span>
                              </div>

                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div className="rounded-xl border border-teal-200 bg-white p-2.5 shadow-2xs">
                                  <label className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-teal-900">
                                    <Plane className="h-3.5 w-3.5 text-teal-600" /> Airside Pass Expiry
                                  </label>
                                  <input
                                    type="date"
                                    value={editForm.airsidePassExpiry}
                                    onChange={(e) => setEditForm((f) => ({ ...f, airsidePassExpiry: e.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:border-teal-500 focus:outline-none"
                                  />
                                </div>

                                <div className="rounded-xl border border-sky-200 bg-white p-2.5 shadow-2xs">
                                  <label className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-sky-900">
                                    <IdCard className="h-3.5 w-3.5 text-sky-600" /> Contingent Card Expiry
                                  </label>
                                  <input
                                    type="date"
                                    value={editForm.contingentCardExpiry}
                                    onChange={(e) => setEditForm((f) => ({ ...f, contingentCardExpiry: e.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:border-sky-500 focus:outline-none"
                                  />
                                </div>

                                <div className="rounded-xl border border-purple-200 bg-white p-2.5 shadow-2xs">
                                  <label className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-purple-900">
                                    <CreditCard className="h-3.5 w-3.5 text-purple-600" /> Visa Expiry
                                  </label>
                                  <input
                                    type="date"
                                    value={editForm.visaExpiry}
                                    onChange={(e) => setEditForm((f) => ({ ...f, visaExpiry: e.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:border-purple-500 focus:outline-none"
                                  />
                                </div>
                              </div>

                              <div className="mt-3 flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedStaffToEdit(null)}
                                  className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  disabled={saving}
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                                >
                                  <Save className="h-3.5 w-3.5 text-sky-400" />
                                  {saving ? 'Saving...' : 'Save & Update Expiry'}
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex shrink-0 items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-3.5">
              <span className="text-xs text-slate-500 font-medium">
                Tip: Changes update the live database and automatically refresh your 3-month counts on the dashboard.
              </span>
              <button
                type="button"
                onClick={() => {
                  setExpiryModalMonth(null);
                  setSelectedStaffToEdit(null);
                }}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
