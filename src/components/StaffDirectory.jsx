import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Edit3,
  Plus,
  Search,
  Settings,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../api.js';

export default function StaffDirectory({
  teams,
  employees,
  presets,
  activeMonth,
  onDataChanged,
  notify,
}) {
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [modal, setModal] = useState(null); // null | { mode: 'add' | 'edit', emp }
  const [teamSettingsModal, setTeamSettingsModal] = useState(false);
  const [teamSettingsForm, setTeamSettingsForm] = useState({
    teamId: teams[0]?.id || 'team-a',
    supervisorPhone: '',
    whatsappGroupLabel: '',
    minDailyTarget: 8,
  });
  const [form, setForm] = useState({
    name: '',
    teamId: 'team-a',
    uudsNo: '',
    contingentNo: '',
    skill: 'TECHNICIAN',
    status: 'ACTIVE',
    presetId: '2d-2off',
    airsidePassExpiry: '',
    visaExpiry: '',
    contingentCardExpiry: '',
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
      if (teamFilter !== 'all' && e.team_id !== teamFilter) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        (e.uuds_no || '').toLowerCase().includes(q) ||
        (e.contingent_no || '').toLowerCase().includes(q) ||
        (e.skill || '').toLowerCase().includes(q)
      );
    });
  }, [employees, search, teamFilter, statusFilter]);

  const dupCount = employees.filter((e) => e.duplicateUuds).length;

  const openAdd = () => {
    setForm({
      name: '',
      teamId: teams[0]?.id || 'team-a',
      uudsNo: '',
      contingentNo: '',
      skill: 'TECHNICIAN',
      status: 'ACTIVE',
      presetId: '2d-2off',
      airsidePassExpiry: '',
      visaExpiry: '',
      contingentCardExpiry: '',
      joinDate: '',
      dxbShiftDate: '',
      mobileNo: '',
    });
    setModal({ mode: 'add' });
  };

  const openEdit = (emp) => {
    setForm({
      name: emp.name,
      teamId: emp.team_id,
      uudsNo: emp.uuds_no || '',
      contingentNo: emp.contingent_no || '',
      skill: emp.skill || 'TECHNICIAN',
      status: emp.status || 'ACTIVE',
      presetId: '',
      airsidePassExpiry: emp.airside_pass_expiry || '',
      visaExpiry: emp.visa_expiry || '',
      contingentCardExpiry: emp.contingent_card_expiry || emp.medical_expiry || '',
      joinDate: emp.join_date || '',
      dxbShiftDate: emp.dxb_shift_date || '',
      mobileNo: emp.mobile_no || '',
    });
    setModal({ mode: 'edit', emp });
  };

  const openTeamSettings = (tid) => {
    const t = teams.find((tm) => tm.id === (tid || teams[0]?.id)) || teams[0];
    if (!t) return;
    setTeamSettingsForm({
      teamId: t.id,
      supervisorPhone: t.supervisor_phone || '',
      whatsappGroupLabel: t.whatsapp_group_label || '',
      minDailyTarget: t.min_daily_target ?? 8,
    });
    setTeamSettingsModal(true);
  };

  const saveTeamSettings = async (e) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/teams/${teamSettingsForm.teamId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(teamSettingsForm),
      });
      notify('Saved Team WhatsApp contact & minimum coverage target');
      setTeamSettingsModal(false);
      onDataChanged();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const preset = presets.find((p) => p.id === form.presetId);
    try {
      if (modal.mode === 'add') {
        await apiFetch('/api/employees', {
          method: 'POST',
          body: JSON.stringify({
            teamId: form.teamId,
            name: form.name,
            uudsNo: form.uudsNo,
            contingentNo: form.contingentNo,
            skill: form.skill,
            airsidePassExpiry: form.airsidePassExpiry,
            visaExpiry: form.visaExpiry,
            contingentCardExpiry: form.contingentCardExpiry,
            medicalExpiry: form.contingentCardExpiry,
            joinDate: form.joinDate,
            dxbShiftDate: form.dxbShiftDate,
            mobileNo: form.mobileNo,
            defaultCycle: preset?.cycle || ['D', 'D', 'OFF', 'OFF'],
            seedMonth: activeMonth,
          }),
        });
        notify(`Added ${form.name} to roster & seeded shifts for ${activeMonth}`);
      } else {
        await apiFetch(`/api/employees/${modal.emp.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            teamId: form.teamId,
            name: form.name,
            uudsNo: form.uudsNo,
            contingentNo: form.contingentNo,
            skill: form.skill,
            status: form.status,
            airsidePassExpiry: form.airsidePassExpiry,
            visaExpiry: form.visaExpiry,
            contingentCardExpiry: form.contingentCardExpiry,
            medicalExpiry: form.contingentCardExpiry,
            joinDate: form.joinDate,
            dxbShiftDate: form.dxbShiftDate,
            mobileNo: form.mobileNo,
            defaultCycle: preset?.cycle,
          }),
        });
        notify(`Updated ${form.name}`);
      }
      setModal(null);
      onDataChanged();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Users className="h-5 w-5 text-sky-600" />
            UUDS DXB Staff Directory ({filtered.length})
          </h2>
          <p className="text-xs text-slate-500">
            Add new joiners, transfer staff between teams, update UUDS/Contingent IDs, or deactivate leavers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => openTeamSettings(teamFilter !== 'all' ? teamFilter : teams[0]?.id)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <Settings className="h-4 w-4 text-emerald-600" /> Team WhatsApp & Targets
          </button>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
          >
            <UserPlus className="h-4 w-4 text-sky-400" /> Add New Staff
          </button>
        </div>
      </div>

      {dupCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            <strong>Data Quality Notice:</strong> {dupCount} staff records share a duplicate UUDS number from the imported PDFs (highlighted below). Click Edit to correct them anytime.
          </span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[220px]">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, UUDS No, Contingent No, Skill..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs focus:bg-white focus:outline-none"
            />
          </div>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold"
          >
            <option value="all">All {teams.length} Teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold"
          >
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive / Archived</option>
            <option value="ALL">All Statuses</option>
          </select>
        </div>
        <span className="hidden items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-600 md:inline-flex">
          💡 Double-click any row to edit
        </span>
      </div>

      {/* Table */}
      <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-[calc(100vh-275px)] min-h-[480px] overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-900 text-white shadow-sm">
              <tr>
                <th className="px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">NAME</th>
                <th className="px-3 py-2.5">TEAM</th>
                <th className="px-3 py-2.5">SKILL / ROLE</th>
                <th className="px-3 py-2.5">UUDS NO</th>
                <th className="px-3 py-2.5">CONTINGENT NO</th>
                <th className="px-3 py-2.5">JOIN DATE</th>
                <th className="px-3 py-2.5">DXB SHIFT DATE</th>
                <th className="px-3 py-2.5">MOBILE NO</th>
                <th className="px-3 py-2.5">DEFAULT ROTATION</th>
                <th className="px-3 py-2.5">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp, idx) => (
                <tr
                  key={emp.id}
                  onDoubleClick={() => openEdit(emp)}
                  className="group border-b border-slate-100 hover:bg-sky-50/70 cursor-pointer select-none transition"
                  title={`Double-click to edit ${emp.name}`}
                >
                  <td className="px-3 py-2 text-slate-400 group-hover:text-sky-600 font-medium">{idx + 1}</td>
                  <td className="px-3 py-2 font-bold text-slate-900 group-hover:text-sky-700">{emp.name}</td>
                  <td className="px-3 py-2 font-medium text-slate-700">{emp.team_name}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                      {emp.skill}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono">
                    <span className={emp.duplicateUuds ? 'rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-900' : ''}>
                      {emp.uuds_no || '—'}
                    </span>
                    {emp.duplicateUuds && (
                      <span className="ml-1 text-[10px] font-bold text-amber-700">DUP</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-600">{emp.contingent_no || '—'}</td>
                  <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{emp.join_date || '—'}</td>
                  <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{emp.dxb_shift_date || '—'}</td>
                  <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{emp.mobile_no || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{emp.defaultPattern?.label || 'Custom'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        emp.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {emp.notes === 'UN Paid Leave' ? 'Unpaid Leave' : emp.notes === 'Non Tec.' ? 'Non Tec.' : emp.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 border-t border-slate-300 bg-slate-100 text-xs font-bold text-slate-800 shadow-[0_-2px_6px_rgba(0,0,0,0.04)]">
              <tr>
                <td colSpan={2} className="px-3 py-2.5 font-extrabold text-slate-900">
                  TOTAL: {filtered.length} STAFF
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {teamFilter === 'all' ? `${teams.length} Teams` : teams.find((t) => t.id === teamFilter)?.name}
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {new Set(filtered.map((e) => e.skill)).size} Roles
                </td>
                <td className="px-3 py-2.5 font-mono text-slate-600">
                  {filtered.filter((e) => e.uuds_no).length} UUDS IDs
                </td>
                <td className="px-3 py-2.5 font-mono text-slate-600">
                  {filtered.filter((e) => e.contingent_no).length} Contingents
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {filtered.filter((e) => e.defaultPattern?.label).length} Patterns
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                    {filtered.filter((e) => e.status === 'ACTIVE').length} Active
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {modal.mode === 'add' ? 'Add New Staff Member' : `Edit ${modal.emp.name}`}
              </h3>
              <button onClick={() => setModal(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Full Name</label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold uppercase"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Team</label>
                  <select
                    value={form.teamId}
                    onChange={(e) => setForm((f) => ({ ...f, teamId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Skill / Role</label>
                  <input
                    type="text"
                    value={form.skill}
                    onChange={(e) => setForm((f) => ({ ...f, skill: e.target.value }))}
                    placeholder="TECHNICIAN, PAINTER..."
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold uppercase"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">UUDS Number</label>
                  <input
                    type="text"
                    value={form.uudsNo}
                    onChange={(e) => setForm((f) => ({ ...f, uudsNo: e.target.value }))}
                    placeholder="UUDS-..."
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Contingent No</label>
                  <input
                    type="text"
                    value={form.contingentNo}
                    onChange={(e) => setForm((f) => ({ ...f, contingentNo: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Default Rotation</label>
                  <select
                    value={form.presetId}
                    onChange={(e) => setForm((f) => ({ ...f, presetId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs"
                  >
                    {modal.mode === 'edit' && <option value="">Keep Existing</option>}
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                {modal.mode === 'edit' && (
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-700">Join Date</label>
                  <input
                    type="date"
                    value={form.joinDate}
                    onChange={(e) => setForm((f) => ({ ...f, joinDate: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-2 py-1.5 text-[11px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-700">DXB Shift Date</label>
                  <input
                    type="date"
                    value={form.dxbShiftDate}
                    onChange={(e) => setForm((f) => ({ ...f, dxbShiftDate: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-2 py-1.5 text-[11px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-700">Mobile Number</label>
                  <input
                    type="text"
                    placeholder="050-XXXXXXX"
                    value={form.mobileNo}
                    onChange={(e) => setForm((f) => ({ ...f, mobileNo: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-2 py-1.5 text-[11px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-700">Airside Pass Exp.</label>
                  <input
                    type="date"
                    value={form.airsidePassExpiry}
                    onChange={(e) => setForm((f) => ({ ...f, airsidePassExpiry: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-2 py-1.5 text-[11px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-700">Visa Expiry</label>
                  <input
                    type="date"
                    value={form.visaExpiry}
                    onChange={(e) => setForm((f) => ({ ...f, visaExpiry: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-2 py-1.5 text-[11px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-700">Contingent Card Expiry</label>
                  <input
                    type="date"
                    value={form.contingentCardExpiry}
                    onChange={(e) => setForm((f) => ({ ...f, contingentCardExpiry: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-2 py-1.5 text-[11px]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModal(null)} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600">
                  Cancel
                </button>
                <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white">
                  <Plus className="h-3.5 w-3.5" /> {modal.mode === 'add' ? 'Create Staff' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Team WhatsApp & Coverage Target Modal */}
      {teamSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Team WhatsApp & Coverage Target</h3>
              <button onClick={() => setTeamSettingsModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={saveTeamSettings} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Select Team</label>
                <select
                  value={teamSettingsForm.teamId}
                  onChange={(e) => {
                    const t = teams.find((tm) => tm.id === e.target.value);
                    setTeamSettingsForm({
                      teamId: e.target.value,
                      supervisorPhone: t?.supervisor_phone || '',
                      whatsappGroupLabel: t?.whatsapp_group_label || '',
                      minDailyTarget: t?.min_daily_target ?? 8,
                    });
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Supervisor WhatsApp Number (with country code)</label>
                <input
                  type="text"
                  value={teamSettingsForm.supervisorPhone}
                  onChange={(e) => setTeamSettingsForm((f) => ({ ...f, supervisorPhone: e.target.value }))}
                  placeholder="e.g. +971501234567"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">WhatsApp Group / Contact Label</label>
                <input
                  type="text"
                  value={teamSettingsForm.whatsappGroupLabel}
                  onChange={(e) => setTeamSettingsForm((f) => ({ ...f, whatsappGroupLabel: e.target.value }))}
                  placeholder="e.g. Leather Team Supervisor"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Minimum Daily On-Duty Target</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={teamSettingsForm.minDailyTarget}
                  onChange={(e) => setTeamSettingsForm((f) => ({ ...f, minDailyTarget: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setTeamSettingsModal(false)} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600">
                  Cancel
                </button>
                <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white">
                  Save Team Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
