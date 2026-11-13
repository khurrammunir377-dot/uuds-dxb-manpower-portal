import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import { SHIFT_CODES, apiFetch } from '../api.js';

export default function EmergencyHub({
  month,
  teams,
  employees,
  overview,
  prefill,
  onClearPrefill,
  onDataChanged,
  notify,
}) {
  const [mode, setMode] = useState('emergency'); // emergency | swap | bulk
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [startDay, setStartDay] = useState(10);
  const [endDay, setEndDay] = useState(10);
  const [incidentType, setIncidentType] = useState('SL');
  const [reason, setReason] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [selectedRepId, setSelectedRepId] = useState('');
  const [markOT, setMarkOT] = useState(true);
  const [loadingCands, setLoadingCands] = useState(false);

  // Swap state (same-team only)
  const [swapTeamId, setSwapTeamId] = useState('');
  const [swapA, setSwapA] = useState('');
  const [swapB, setSwapB] = useState('');
  const [swapReason, setSwapReason] = useState('');
  const [swapTeamRoster, setSwapTeamRoster] = useState([]);

  // Bulk / Cross-team state
  const [bulkTeamFilter, setBulkTeamFilter] = useState('all');
  const [bulkEmpIds, setBulkEmpIds] = useState([]);
  const [bulkShift, setBulkShift] = useState('T');
  const [bulkDeployedTeam, setBulkDeployedTeam] = useState('');
  const [bulkReason, setBulkReason] = useState('');

  // Resolving an existing open incident
  const [resolvingIncident, setResolvingIncident] = useState(null);

  const activeEmployees = useMemo(() => employees.filter((e) => e.status === 'ACTIVE'), [employees]);

  const swapTeamMembers = useMemo(
    () => activeEmployees.filter((e) => e.team_id === swapTeamId),
    [activeEmployees, swapTeamId]
  );

  useEffect(() => {
    if (prefill) {
      if (prefill.employeeId) {
        setSelectedEmpId(String(prefill.employeeId));
        setSwapA(String(prefill.employeeId));
      }
      if (prefill.teamId) {
        setSwapTeamId(prefill.teamId);
      } else if (prefill.employeeId) {
        const found = activeEmployees.find((e) => String(e.id) === String(prefill.employeeId));
        if (found) setSwapTeamId(found.team_id);
      }
      if (prefill.day) {
        setStartDay(prefill.day);
        setEndDay(prefill.day);
      }
      if (prefill.incidentId) {
        setResolvingIncident(prefill);
      }
      setMode('emergency');
    } else if (!selectedEmpId && activeEmployees.length > 0) {
      setSelectedEmpId(String(activeEmployees[0].id));
      const initialTeam = teams[0]?.id || activeEmployees[0].team_id;
      setSwapTeamId(initialTeam);
    }
  }, [prefill, activeEmployees, teams]);

  useEffect(() => {
    if (!swapTeamId && teams[0]?.id) {
      setSwapTeamId(teams[0].id);
      return;
    }
    const members = activeEmployees.filter((e) => e.team_id === swapTeamId);
    if (members.length === 0) return;
    const hasA = members.some((m) => String(m.id) === String(swapA));
    const nextA = hasA ? String(swapA) : String(members[0].id);
    if (nextA !== String(swapA)) setSwapA(nextA);
    const hasValidB = members.some((m) => String(m.id) === String(swapB) && String(m.id) !== nextA);
    if (!hasValidB) {
      const other = members.find((m) => String(m.id) !== nextA);
      setSwapB(other ? String(other.id) : '');
    }
  }, [swapTeamId, activeEmployees, teams]);

  useEffect(() => {
    if (mode === 'swap' && swapTeamId) {
      apiFetch(`/api/roster?month=${month}&teamId=${swapTeamId}`)
        .then((res) => setSwapTeamRoster(res.rows || []))
        .catch(() => setSwapTeamRoster([]));
    }
  }, [mode, swapTeamId, month]);

  const selectedEmp = useMemo(
    () => activeEmployees.find((e) => String(e.id) === String(selectedEmpId)),
    [activeEmployees, selectedEmpId]
  );

  const fetchCandidates = async () => {
    if (!selectedEmp) return;
    setLoadingCands(true);
    try {
      const res = await apiFetch(
        `/api/emergency/replacements?month=${month}&day=${startDay}&teamId=${selectedEmp.team_id}&skill=${encodeURIComponent(
          selectedEmp.skill
        )}&excludeEmployeeId=${selectedEmp.id}`
      );
      setCandidates(res.candidates || []);
      setSelectedRepId(res.candidates?.[0]?.id ? String(res.candidates[0].id) : '');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setLoadingCands(false);
    }
  };

  useEffect(() => {
    if (selectedEmp && startDay) {
      fetchCandidates();
    }
  }, [month, startDay, selectedEmpId]);

  const handleReportEmergency = async (e) => {
    e.preventDefault();
    if (!selectedEmpId) return;
    try {
      if (resolvingIncident?.incidentId) {
        await apiFetch(`/api/emergency/incidents/${resolvingIncident.incidentId}/resolve`, {
          method: 'PATCH',
          body: JSON.stringify({
            replacementEmployeeId: selectedRepId ? Number(selectedRepId) : null,
            markOvertime: markOT,
            notes: reason || 'Assigned replacement cover',
          }),
        });
        notify('Open incident resolved & replacement scheduled!');
        setResolvingIncident(null);
        onClearPrefill?.();
      } else {
        const res = await apiFetch('/api/emergency/report', {
          method: 'POST',
          body: JSON.stringify({
            month,
            startDay: Number(startDay),
            endDay: Number(endDay),
            employeeId: Number(selectedEmpId),
            incidentType,
            reason: reason || `${incidentType} emergency adjustment`,
            expectedReturnDate,
            replacementEmployeeId: selectedRepId ? Number(selectedRepId) : null,
            markReplacementOvertime: markOT,
          }),
        });
        notify(
          res.status === 'RESOLVED'
            ? 'Emergency logged and replacement assigned!'
            : 'Emergency logged as Open Coverage Gap.'
        );
      }
      setReason('');
      setExpectedReturnDate('');
      onDataChanged();
      fetchCandidates();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleRevertIncident = async (incidentId) => {
    try {
      const res = await apiFetch(`/api/emergency/incidents/${incidentId}/revert`, {
        method: 'POST',
      });
      notify(`Reverted incident #${incidentId} (${res.restoredCount} shift entries restored)`);
      onDataChanged();
      fetchCandidates();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleSwap = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/roster/swap', {
        method: 'POST',
        body: JSON.stringify({
          month,
          startDay: Number(startDay),
          endDay: Number(endDay),
          employeeAId: Number(swapA),
          employeeBId: Number(swapB),
          reason: swapReason || 'Operational shift swap',
        }),
      });
      if (res.warnings?.length) {
        notify(`Shifts swapped (⚠ ${res.warnings[0]})`, 'error');
      } else {
        notify('Shifts swapped and logged in audit trail!');
      }
      setSwapReason('');
      onDataChanged();
      if (swapTeamId) {
        apiFetch(`/api/roster?month=${month}&teamId=${swapTeamId}`)
          .then((res) => setSwapTeamRoster(res.rows || []))
          .catch(() => {});
      }
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleBulk = async (e) => {
    e.preventDefault();
    if (bulkEmpIds.length === 0) return notify('Select at least one employee', 'error');
    try {
      await apiFetch('/api/roster/bulk', {
        method: 'POST',
        body: JSON.stringify({
          month,
          employeeIds: bulkEmpIds.map(Number),
          startDay: Number(startDay),
          endDay: Number(endDay),
          shiftCode: bulkShift,
          deployedTeamId: bulkDeployedTeam || null,
          reason: bulkReason || `Bulk update (${bulkShift})`,
        }),
      });
      notify(`Updated ${bulkEmpIds.length} staff for Days ${startDay}–${endDay}`);
      setBulkEmpIds([]);
      setBulkReason('');
      onDataChanged();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const incidents = overview?.openIncidents || [];
  const maxDays = overview?.month?.days_in_month || 30;
  const bulkPool = activeEmployees.filter((e) => bulkTeamFilter === 'all' || e.team_id === bulkTeamFilter);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left Workflow Panel */}
      <div className="space-y-4 lg:col-span-7">
        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <button
            onClick={() => setMode('emergency')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
              mode === 'emergency' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Zap className="h-4 w-4" /> Emergency / Auto-Cover
          </button>
          <button
            onClick={() => setMode('swap')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
              mode === 'swap' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ArrowLeftRight className="h-4 w-4" /> Shift Swap
          </button>
          <button
            onClick={() => setMode('bulk')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
              mode === 'bulk' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Users className="h-4 w-4" /> Cross-Team / Bulk
          </button>
        </div>

        {mode === 'emergency' && (
          <form onSubmit={handleReportEmergency} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {resolvingIncident ? `Resolve Incident #${resolvingIncident.incidentId}` : 'Report Emergency / Unplanned Absence'}
                </h3>
                <p className="text-xs text-slate-500">
                  Marks absence and ranks eligible OFF-duty replacements with rest-safety checks.
                </p>
              </div>
              {resolvingIncident && (
                <button
                  type="button"
                  onClick={() => {
                    setResolvingIncident(null);
                    onClearPrefill?.();
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-bold text-slate-700">Affected Employee</label>
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  disabled={Boolean(resolvingIncident)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold"
                >
                  {activeEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} — {e.team_name} ({e.skill})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Start Day</label>
                <input
                  type="number"
                  min={1}
                  max={maxDays}
                  value={startDay}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setStartDay(v);
                    if (endDay < v) setEndDay(v);
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">End Day</label>
                <input
                  type="number"
                  min={startDay}
                  max={maxDays}
                  value={endDay}
                  onChange={(e) => setEndDay(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Incident Type</label>
                <select
                  value={incidentType}
                  onChange={(e) => setIncidentType(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
                >
                  <option value="SL">SL — Sick Leave / Medical</option>
                  <option value="EM">EM — Family / Personal Emergency</option>
                  <option value="L">L — Unplanned Leave / No-Show</option>
                  <option value="V">V — Urgent Vacation Change</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Expected Return Date (Optional)</label>
                <input
                  type="date"
                  value={expectedReturnDate}
                  onChange={(e) => setExpectedReturnDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Reason / Notes</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Fever reported 06:00 AM"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
            </div>

            {/* Smart Ranked Replacements */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <UserCheck className="h-4 w-4 text-emerald-600" />
                  Smart Replacement Finder (Staff OFF on Day {startDay})
                </span>
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                  <input type="checkbox" checked={markOT} onChange={(e) => setMarkOT(e.target.checked)} />
                  Tag as Overtime (OT)
                </label>
              </div>

              {loadingCands ? (
                <p className="py-4 text-center text-xs text-slate-500">Scanning rest safety & availability...</p>
              ) : (
                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  <label className="flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="rep"
                        value=""
                        checked={selectedRepId === ''}
                        onChange={() => setSelectedRepId('')}
                      />
                      <span className="font-semibold text-slate-600">No replacement yet (Log as Open Gap)</span>
                    </div>
                  </label>
                  {candidates.map((c) => (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                        String(selectedRepId) === String(c.id)
                          ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="rep"
                          value={c.id}
                          checked={String(selectedRepId) === String(c.id)}
                          onChange={(e) => setSelectedRepId(e.target.value)}
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-900">{c.name}</span>
                            {c.sameTeam && (
                              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                                Same Team
                              </span>
                            )}
                            {c.sameSkill && (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                {c.skill}
                              </span>
                            )}
                            {!c.sameTeam && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                {c.teamName}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            Prev: {c.prevShift} → Next: {c.nextShift} · Worked {c.workedThisMonth}d this month
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {c.safeRest ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            <ShieldCheck className="h-3 w-3" /> Safe Rest
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            <AlertTriangle className="h-3 w-3" /> {c.safetyWarnings[0]}
                          </span>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700"
            >
              {selectedRepId ? 'Confirm Absence & Assign Replacement Cover' : 'Log Absence as Open Coverage Gap'}
            </button>
          </form>
        )}

        {mode === 'swap' && (() => {
          const rowA = swapTeamRoster.find((r) => String(r.id) === String(swapA));
          const rowB = swapTeamRoster.find((r) => String(r.id) === String(swapB));
          const codeA = rowA?.shifts?.[startDay - 1]?.code || '—';
          const codeB = rowB?.shifts?.[startDay - 1]?.code || '—';
          const teamName = teams.find((t) => t.id === swapTeamId)?.name || '';
          return (
            <form onSubmit={handleSwap} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900">1-Click Same-Team Shift Swap</h3>
                  <p className="text-xs text-slate-500">
                    Select a team to swap shifts between two members of that same team.
                  </p>
                </div>
                {teamName && (
                  <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-800">
                    Same Team: {teamName}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-bold text-slate-700">Team (Same Team Required)</label>
                  <select
                    value={swapTeamId}
                    onChange={(e) => setSwapTeamId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900"
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.staffCount} staff)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Employee A</label>
                  <select
                    value={swapA}
                    onChange={(e) => {
                      const nextA = e.target.value;
                      setSwapA(nextA);
                      if (nextA === swapB) {
                        const other = swapTeamMembers.find((m) => String(m.id) !== nextA);
                        if (other) setSwapB(String(other.id));
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold"
                  >
                    {swapTeamMembers.map((e) => {
                      const sh = swapTeamRoster.find((r) => r.id === e.id)?.shifts?.[startDay - 1]?.code;
                      return (
                        <option key={e.id} value={e.id}>
                          {e.name} ({e.skill}){sh ? ` — Day ${startDay}: ${sh}` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Employee B ({teamName} Only)
                  </label>
                  <select
                    value={swapB}
                    onChange={(e) => setSwapB(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold"
                  >
                    {swapTeamMembers
                      .filter((e) => String(e.id) !== String(swapA))
                      .map((e) => {
                        const sh = swapTeamRoster.find((r) => r.id === e.id)?.shifts?.[startDay - 1]?.code;
                        return (
                          <option key={e.id} value={e.id}>
                            {e.name} ({e.skill}){sh ? ` — Day ${startDay}: ${sh}` : ''}
                          </option>
                        );
                      })}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Start Day</label>
                  <input
                    type="number"
                    min={1}
                    max={maxDays}
                    value={startDay}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setStartDay(v);
                      if (endDay < v) setEndDay(v);
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">End Day</label>
                  <input
                    type="number"
                    min={startDay}
                    max={maxDays}
                    value={endDay}
                    onChange={(e) => setEndDay(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  />
                </div>

                {rowA && rowB && (
                  <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
                    <span>
                      <strong>{rowA.name}</strong>: Day {startDay} is <strong>{codeA}</strong> → becomes <strong>{codeB}</strong>
                    </span>
                    <ArrowLeftRight className="h-4 w-4 text-slate-400" />
                    <span>
                      <strong>{rowB.name}</strong>: Day {startDay} is <strong>{codeB}</strong> → becomes <strong>{codeA}</strong>
                    </span>
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-bold text-slate-700">Swap Reason</label>
                  <input
                    type="text"
                    value={swapReason}
                    onChange={(e) => setSwapReason(e.target.value)}
                    placeholder="e.g., Mutual shift swap approved by Supervisor"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  />
                </div>
              </div>
              <button type="submit" className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white hover:bg-slate-800">
                Execute & Log Same-Team Shift Swap
              </button>
            </form>
          );
        })()}

        {mode === 'bulk' && (
          <form onSubmit={handleBulk} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h3 className="text-base font-bold text-slate-900">Bulk Training / Vacation / Cross-Team Loan</h3>
              <p className="text-xs text-slate-500">Select multiple staff and apply shifts or deploy them to support another team.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Filter Team</label>
                <select
                  value={bulkTeamFilter}
                  onChange={(e) => setBulkTeamFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-semibold"
                >
                  <option value="all">All Teams</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Start Day</label>
                <input
                  type="number"
                  min={1}
                  max={maxDays}
                  value={startDay}
                  onChange={(e) => setStartDay(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">End Day</label>
                <input
                  type="number"
                  min={startDay}
                  max={maxDays}
                  value={endDay}
                  onChange={(e) => setEndDay(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Shift Code</label>
                <select
                  value={bulkShift}
                  onChange={(e) => setBulkShift(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
                >
                  {SHIFT_CODES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Deploy / Loan To Team (Optional)</label>
                <select
                  value={bulkDeployedTeam}
                  onChange={(e) => setBulkDeployedTeam(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
                >
                  <option value="">Keep Home Team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Reason</label>
                <input
                  type="text"
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  placeholder="e.g., Cabin Safety Training / AOG Support"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
              <div className="mb-1.5 flex items-center justify-between px-1 text-[11px] font-bold text-slate-600">
                <span>Selected: {bulkEmpIds.length} staff</span>
                <button
                  type="button"
                  onClick={() =>
                    setBulkEmpIds(bulkEmpIds.length === bulkPool.length ? [] : bulkPool.map((e) => e.id))
                  }
                  className="text-sky-700 hover:underline"
                >
                  {bulkEmpIds.length === bulkPool.length ? 'Unselect All' : 'Select All Visible'}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {bulkPool.map((e) => (
                  <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={bulkEmpIds.includes(e.id)}
                      onChange={(ev) =>
                        setBulkEmpIds((prev) =>
                          ev.target.checked ? [...prev, e.id] : prev.filter((x) => x !== e.id)
                        )
                      }
                    />
                    <span className="truncate font-semibold text-slate-800">{e.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <button type="submit" className="w-full rounded-xl bg-sky-600 py-2.5 text-xs font-bold text-white hover:bg-sky-700">
              Apply Bulk Adjustment ({bulkEmpIds.length} Staff)
            </button>
          </form>
        )}
      </div>

      {/* Right Column: Open Gaps & Incident History */}
      <div className="space-y-4 lg:col-span-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              <h3 className="text-base font-bold text-slate-900">Emergency & Gap Log</h3>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
              {incidents.filter((i) => i.resolution_status === 'OPEN').length} Open
            </span>
          </div>

          {incidents.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-xs font-medium text-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              No emergency incidents logged yet this month.
            </div>
          ) : (
            <div className="max-h-[540px] space-y-2.5 overflow-y-auto pr-1">
              {incidents.map((inc) => (
                <div
                  key={inc.id}
                  className={`rounded-xl border p-3 text-xs ${
                    inc.resolution_status === 'OPEN'
                      ? 'border-rose-300 bg-rose-50/70'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            inc.resolution_status === 'OPEN'
                              ? 'bg-rose-600 text-white'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {inc.resolution_status}
                        </span>
                        <span className="font-bold text-slate-900">{inc.employee_name}</span>
                      </div>
                      <p className="mt-1 text-slate-600">
                        {inc.team_name} · {inc.skill} · Day {inc.start_day}
                        {inc.end_day !== inc.start_day ? `–${inc.end_day}` : ''} ({inc.incident_type})
                      </p>
                      <p className="mt-0.5 text-slate-500">{inc.reason}</p>
                      {inc.expected_return_date && (
                        <p className="mt-0.5 font-semibold text-sky-700">
                          Expected Return: {inc.expected_return_date}
                        </p>
                      )}
                      {inc.replacement_name && (
                        <p className="mt-1 font-semibold text-emerald-800">
                          ✓ Covered by: {inc.replacement_name}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      {inc.resolution_status === 'OPEN' && (
                        <button
                          onClick={() => {
                            setResolvingIncident({
                              incidentId: inc.id,
                              employeeId: inc.employee_id,
                              day: inc.start_day,
                            });
                            setSelectedEmpId(String(inc.employee_id));
                            setStartDay(inc.start_day);
                            setEndDay(inc.end_day);
                            setMode('emergency');
                          }}
                          className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800"
                        >
                          Assign Cover
                        </button>
                      )}
                      {inc.resolution_status !== 'REVERTED' && inc.rollback_payload && (
                        <button
                          onClick={() => handleRevertIncident(inc.id)}
                          title="Restore original shifts & undo this incident"
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
                        >
                          <RotateCcw className="h-3 w-3" /> Revert
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
