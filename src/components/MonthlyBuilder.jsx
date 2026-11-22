import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarPlus,
  Check,
  CheckCircle2,
  Layers,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { SHIFT_STYLES, apiFetch } from '../api.js';

function nextMonthOf(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function MonthlyBuilder({
  months,
  teams,
  presets,
  activeMonth,
  onGenerated,
  notify,
}) {
  const [sourceMonth, setSourceMonth] = useState(activeMonth || '2026-11');
  const [targetMonth, setTargetMonth] = useState(nextMonthOf(activeMonth || '2026-11'));
  const [selectedTeamIds, setSelectedTeamIds] = useState([]); // [] = All 7 Teams
  const [teamPatternOverrides, setTeamPatternOverrides] = useState({});
  const [patternOverrides, setPatternOverrides] = useState({});
  const [vacationOverrides, setVacationOverrides] = useState([]);
  const [vacDraft, setVacDraft] = useState({ employeeId: '', startDay: 1, endDay: 7, code: 'V' });
  const [empSearch, setEmpSearch] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  const isAllTeams = selectedTeamIds.length === 0;

  const toggleTeam = (teamId) => {
    setPreview(null);
    if (teamId === 'all') {
      setSelectedTeamIds([]);
      return;
    }
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  const runPreview = async (
    customEmpOverrides = patternOverrides,
    customTeamOverrides = teamPatternOverrides,
    customVacs = vacationOverrides
  ) => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/months/generate', {
        method: 'POST',
        body: JSON.stringify({
          sourceMonth,
          targetMonth,
          teamIds: selectedTeamIds,
          commit: false,
          teamPatternOverrides: customTeamOverrides,
          patternOverrides: customEmpOverrides,
          vacationOverrides: customVacs,
        }),
      });
      setPreview(data);
      if (!vacDraft.employeeId && data.sampleEmployees?.[0]) {
        setVacDraft((v) => ({ ...v, employeeId: String(data.sampleEmployees[0].employeeId) }));
      }
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const commitMonth = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/months/generate', {
        method: 'POST',
        body: JSON.stringify({
          sourceMonth,
          targetMonth,
          teamIds: selectedTeamIds,
          commit: true,
          teamPatternOverrides,
          patternOverrides,
          vacationOverrides,
        }),
      });
      const scopeLabel =
        selectedTeamIds.length === 1
          ? teams.find((t) => t.id === selectedTeamIds[0])?.name || 'selected team'
          : selectedTeamIds.length === 0
            ? `all ${teams.length} teams`
            : `${selectedTeamIds.length} teams`;
      notify(`Generated ${targetMonth} roster for ${scopeLabel} (${res.totalEmployees} staff)!`);
      onGenerated(targetMonth, selectedTeamIds.length === 1 ? selectedTeamIds[0] : 'all');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEmpOverride = (empId, presetId) => {
    const preset = presets.find((p) => p.id === presetId);
    const next = { ...patternOverrides };
    if (!preset) delete next[empId];
    else next[empId] = preset.cycle;
    setPatternOverrides(next);
    runPreview(next, teamPatternOverrides, vacationOverrides);
  };

  const handleTeamOverride = (teamId, presetId) => {
    const preset = presets.find((p) => p.id === presetId);
    const next = { ...teamPatternOverrides };
    if (!preset) delete next[teamId];
    else next[teamId] = preset.cycle;
    setTeamPatternOverrides(next);
    runPreview(patternOverrides, next, vacationOverrides);
  };

  const addVacationBlock = () => {
    if (!vacDraft.employeeId) return;
    const emp = preview?.sampleEmployees?.find((e) => String(e.employeeId) === String(vacDraft.employeeId));
    const next = [
      ...vacationOverrides,
      {
        employeeId: Number(vacDraft.employeeId),
        employeeName: emp?.name || `Staff #${vacDraft.employeeId}`,
        startDay: Number(vacDraft.startDay),
        endDay: Number(vacDraft.endDay),
        code: vacDraft.code,
      },
    ];
    setVacationOverrides(next);
    runPreview(patternOverrides, teamPatternOverrides, next);
  };

  const removeVacationBlock = (idx) => {
    const next = vacationOverrides.filter((_, i) => i !== idx);
    setVacationOverrides(next);
    runPreview(patternOverrides, teamPatternOverrides, next);
  };

  const visibleEmployees = useMemo(() => {
    const list = preview?.sampleEmployees || [];
    const q = empSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.teamName.toLowerCase().includes(q) ||
        (e.uudsNo || '').toLowerCase().includes(q)
    );
  }, [preview, empSearch]);

  const activeTeamsList = isAllTeams
    ? teams
    : teams.filter((t) => selectedTeamIds.includes(t.id));

  return (
    <div className="space-y-6">
      {/* Builder Configuration Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-sky-600" />
              <h2 className="text-lg font-bold text-slate-900">Team-Wise & Full Monthly Roster Generator</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Generate one team at a time or all {teams.length} teams together. Continues each employee&apos;s exact rotation phase from the previous month without overwriting unselected teams.
            </p>
          </div>
        </div>

        {/* Team Selector Pills */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
              <Layers className="h-3.5 w-3.5 text-sky-600" />
              Step 1 — Choose Team Scope ({isAllTeams ? `All ${teams.length} Teams` : `${selectedTeamIds.length} Team(s) Selected`})
            </span>
            {!isAllTeams && (
              <button
                type="button"
                onClick={() => toggleTeam('all')}
                className="text-xs font-semibold text-sky-700 hover:underline"
              >
                Select All {teams.length} Teams
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => toggleTeam('all')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                isAllTeams
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              {isAllTeams && <Check className="h-3.5 w-3.5 text-sky-400" />}
              All {teams.length} Teams ({teams.reduce((s, t) => s + (t.staffCount || 0), 0)})
            </button>
            {teams.map((t) => {
              const selected = selectedTeamIds.includes(t.id);
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => toggleTeam(t.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                    selected
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {selected && <Check className="h-3.5 w-3.5" />}
                  {t.name} (<span className={selected ? 'text-sky-200 font-bold' : 'text-blue-600 font-bold'}>{t.staffCount}</span>)
                </button>
              );
            })}
          </div>
        </div>

        {/* Month Selection & Actions */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Carry Forward From</label>
            <select
              value={sourceMonth}
              onChange={(e) => {
                setSourceMonth(e.target.value);
                setPreview(null);
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800"
            >
              {months.map((m) => (
                <option key={m.month} value={m.month}>
                  {m.label} ({m.month})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Target Month to Build</label>
            <input
              type="month"
              value={targetMonth}
              onChange={(e) => {
                setTargetMonth(e.target.value);
                setPreview(null);
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-900"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => runPreview()}
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 text-sky-400" />}
              Preview {isAllTeams ? 'All Teams' : `${activeTeamsList.length} Team(s)`}
            </button>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={commitMonth}
              disabled={!preview || loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40"
            >
              <CalendarPlus className="h-4 w-4" />
              Save {targetMonth} ({preview ? preview.totalEmployees : 0} Staff)
            </button>
          </div>
        </div>
      </div>

      {/* Preview Results */}
      {preview && (
        <div className="space-y-6">
          {/* Team Coverage Forecast + Team-Level Pattern Override */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-base font-bold text-slate-900">
              {preview.targetLabel} ({preview.targetDays} Days) — Team Coverage Forecast
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {preview.teamCoverage.map((tc) => (
                <div
                  key={tc.teamId}
                  className={`rounded-xl border p-3.5 ${
                    tc.lowDays.length > 0 ? 'border-amber-300 bg-amber-50/70' : 'border-emerald-200 bg-emerald-50/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900">{tc.teamName}</span>
                    <span className="text-xs font-semibold text-slate-500">{tc.staffCount} staff</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span>Target Min: <strong>{tc.minDailyTarget}</strong></span>
                    <span>Avg: <strong>{tc.avgOnDuty}</strong> · Min: <strong>{tc.minOnDuty}</strong></span>
                  </div>
                  <div className="mt-2 text-[11px] font-semibold">
                    {tc.lowDays.length === 0 ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> All {preview.targetDays} days meet target
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5" /> Low on Days: {tc.lowDays.slice(0, 6).join(', ')}
                        {tc.lowDays.length > 6 ? '...' : ''}
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 border-t border-slate-200/70 pt-2">
                    <select
                      value={
                        presets.find((p) => JSON.stringify(p.cycle) === JSON.stringify(teamPatternOverrides[tc.teamId]))?.id || ''
                      }
                      onChange={(e) => handleTeamOverride(tc.teamId, e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                    >
                      <option value="">Team Cycle: Auto Carry-Forward</option>
                      {presets.map((p) => (
                        <option key={p.id} value={p.id}>
                          Apply to whole team: {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pre-book Planned Vacations / Training before generating */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">Pre-Book Planned Vacations / Training (Optional)</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Lock in known annual vacations (`V`), training (`T`), or off days before saving {preview.targetLabel}.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1">
                <label className="mb-1 block text-[11px] font-bold text-slate-600">Employee</label>
                <select
                  value={vacDraft.employeeId}
                  onChange={(e) => setVacDraft((v) => ({ ...v, employeeId: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold"
                >
                  {preview.sampleEmployees.map((emp) => (
                    <option key={emp.employeeId} value={emp.employeeId}>
                      {emp.name} ({emp.teamName})
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-24">
                <label className="mb-1 block text-[11px] font-bold text-slate-600">Start Day</label>
                <input
                  type="number"
                  min={1}
                  max={preview.targetDays}
                  value={vacDraft.startDay}
                  onChange={(e) => setVacDraft((v) => ({ ...v, startDay: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div className="w-24">
                <label className="mb-1 block text-[11px] font-bold text-slate-600">End Day</label>
                <input
                  type="number"
                  min={vacDraft.startDay}
                  max={preview.targetDays}
                  value={vacDraft.endDay}
                  onChange={(e) => setVacDraft((v) => ({ ...v, endDay: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div className="w-32">
                <label className="mb-1 block text-[11px] font-bold text-slate-600">Code</label>
                <select
                  value={vacDraft.code}
                  onChange={(e) => setVacDraft((v) => ({ ...v, code: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-bold"
                >
                  <option value="V">V — Vacation</option>
                  <option value="T">T — Training</option>
                  <option value="L">L — Leave</option>
                  <option value="OFF">OFF — Off Day</option>
                </select>
              </div>
              <button
                type="button"
                onClick={addVacationBlock}
                className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            {vacationOverrides.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {vacationOverrides.map((vo, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold"
                  >
                    {vo.employeeName}: Days {vo.startDay}–{vo.endDay} ({vo.code})
                    <button type="button" onClick={() => removeVacationBlock(idx)} className="text-rose-600 hover:text-rose-800">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Rotation Continuity Table */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Phase Continuity & Per-Staff Verification ({visibleEmployees.length} of {preview.totalEmployees} Staff)
                </h3>
                <p className="text-xs text-slate-500">
                  Shows last 4 days of {preview.sourceMonth} flowing into Days 1–7 of {preview.targetMonth}.
                </p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  placeholder="Filter staff or team..."
                  className="w-56 rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="max-h-[460px] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-slate-900 text-white">
                  <tr>
                    <th className="px-3 py-2">EMPLOYEE</th>
                    <th className="px-3 py-2">TEAM</th>
                    <th className="px-3 py-2">DETECTED PATTERN</th>
                    <th className="px-3 py-2">END OF {preview.sourceMonth}</th>
                    <th className="px-3 py-2">START OF {preview.targetMonth} (DAYS 1–7)</th>
                    <th className="px-3 py-2">OVERRIDE CYCLE</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEmployees.map((emp) => (
                    <tr key={emp.employeeId} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-bold text-slate-900">{emp.name}</td>
                      <td className="px-3 py-2 text-slate-600">{emp.teamName}</td>
                      <td className="px-3 py-2 font-medium text-sky-800">{emp.detectedLabel}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {emp.sourceTail.map((c, i) => (
                            <span
                              key={i}
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                SHIFT_STYLES[c]?.bg || 'bg-slate-200'
                              } ${SHIFT_STYLES[c]?.text || 'text-slate-800'}`}
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {emp.shifts.slice(0, 7).map((c, i) => (
                            <span
                              key={i}
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                SHIFT_STYLES[c]?.bg || 'bg-slate-200'
                              } ${SHIFT_STYLES[c]?.text || 'text-slate-800'}`}
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={
                            presets.find((p) => JSON.stringify(p.cycle) === JSON.stringify(patternOverrides[emp.employeeId]))?.id || ''
                          }
                          onChange={(e) => handleEmpOverride(emp.employeeId, e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"
                        >
                          <option value="">Auto Carry-Forward</option>
                          {presets.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
