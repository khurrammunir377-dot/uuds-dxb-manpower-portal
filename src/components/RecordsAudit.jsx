import React, { useEffect, useState } from 'react';
import {
  Archive,
  Clock,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  KeyRound,
  Search,
  Shield,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { apiFetch } from '../api.js';

export default function RecordsAudit({ month, teams, currentUser, notify }) {
  const [tab, setTab] = useState('audit'); // audit | ledger | revisions | admin
  const [logs, setLogs] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');

  // Admin: users & backups
  const [users, setUsers] = useState([]);
  const [backups, setBackups] = useState([]);
  const [userForm, setUserForm] = useState({
    userId: '',
    displayName: '',
    role: 'SUPERVISOR',
    teamId: teams[0]?.id || 'leather-team',
    password: '',
  });
  const [runningBackup, setRunningBackup] = useState(false);

  const isAdmin = currentUser?.role === 'ADMIN';

  const loadAdminData = async () => {
    if (!isAdmin) return;
    try {
      const [uRes, bRes] = await Promise.all([apiFetch('/api/users'), apiFetch('/api/backups')]);
      setUsers(uRes.users || []);
      setBackups(bRes.backups || []);
    } catch {
      // ignore if non-admin
    }
  };

  const loadData = async () => {
    try {
      const [auditRes, sumRes] = await Promise.all([
        apiFetch(`/api/records/audit?month=${month}&teamId=${teamFilter}&search=${encodeURIComponent(search)}`),
        apiFetch(`/api/records/summary?month=${month}`),
      ]);
      setLogs(auditRes.logs || []);
      setSummaryData(sumRes);
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  useEffect(() => {
    loadData();
    if (tab === 'admin') loadAdminData();
  }, [month, teamFilter, search, tab]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(userForm),
      });
      notify(`Created ${userForm.role} account (${userForm.userId.toUpperCase()})`);
      setUserForm({
        userId: '',
        displayName: '',
        role: 'SUPERVISOR',
        teamId: teams[0]?.id || 'leather-team',
        password: '',
      });
      loadAdminData();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleDeleteUser = async (uid) => {
    try {
      await apiFetch(`/api/users/${encodeURIComponent(uid)}`, { method: 'DELETE' });
      notify(`Deleted account ${uid}`);
      loadAdminData();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleRunBackup = async () => {
    setRunningBackup(true);
    try {
      const res = await apiFetch('/api/backups/run', { method: 'POST' });
      setBackups(res.backups || []);
      notify(`SQLite backup created: ${res.backup?.filename}`);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setRunningBackup(false);
    }
  };

  const filteredSummary = (summaryData?.summary || []).filter((r) => {
    if (teamFilter !== 'all' && r.teamId !== teamFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || (r.uudsNo || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Header + Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTab('audit')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              tab === 'audit' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <History className="h-3.5 w-3.5" /> Full Change & Audit Log (<span className={tab === 'audit' ? 'text-sky-300 font-bold' : 'text-blue-600 font-bold'}>{logs.length}</span>)
          </button>
          <button
            onClick={() => setTab('ledger')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              tab === 'ledger' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Clock className="h-3.5 w-3.5" /> Monthly Hours & Attendance Ledger
          </button>
          <button
            onClick={() => setTab('revisions')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              tab === 'revisions' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Archive className="h-3.5 w-3.5" /> Published Revisions (<span className={tab === 'revisions' ? 'text-sky-300 font-bold' : 'text-blue-600 font-bold'}>{summaryData?.revisions?.length || 0}</span>)
          </button>
          {isAdmin && (
            <button
              onClick={() => setTab('admin')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                tab === 'admin' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Shield className="h-3.5 w-3.5 text-sky-600" /> Access & Backups
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/export/payroll-excel?month=${month}&teamId=${teamFilter}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Payroll Excel
          </a>
          <a
            href={`/api/export/payroll-pdf?month=${month}&teamId=${teamFilter}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100"
          >
            <FileText className="h-3.5 w-3.5" /> Payroll PDF
          </a>
          <a
            href={`/api/export/csv?month=${month}&type=audit`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" /> Export Audit CSV
          </a>
        </div>
      </div>

      {/* Filters */}
      {tab !== 'revisions' && tab !== 'admin' && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee, replacement, or reason..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs"
            />
          </div>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold"
          >
            <option value="all">All Teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Tab 1: Audit Log */}
      {tab === 'audit' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[62vh] overflow-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-slate-900 text-white">
                <tr>
                  <th className="px-3 py-2.5">TIMESTAMP</th>
                  <th className="px-3 py-2.5">ACTION</th>
                  <th className="px-3 py-2.5">TEAM</th>
                  <th className="px-3 py-2.5">EMPLOYEE</th>
                  <th className="px-3 py-2.5">DAY</th>
                  <th className="px-3 py-2.5">CHANGE</th>
                  <th className="px-3 py-2.5">REPLACEMENT</th>
                  <th className="px-3 py-2.5">REASON / DETAILS</th>
                  <th className="px-3 py-2.5">BY</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-slate-500">
                      {l.created_at?.replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-800">
                        {l.action_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{l.team_name || '—'}</td>
                    <td className="px-3 py-2 font-bold text-slate-900">{l.employee_name || '—'}</td>
                    <td className="px-3 py-2 text-center font-semibold">{l.day || '—'}</td>
                    <td className="px-3 py-2 font-semibold">
                      {l.old_shift || l.new_shift ? `${l.old_shift || '—'} → ${l.new_shift || '—'}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-emerald-700 font-semibold">{l.replacement_employee_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{l.reason}</td>
                    <td className="px-3 py-2 text-slate-500">{l.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Monthly Hours & Attendance Ledger */}
      {tab === 'ledger' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[62vh] overflow-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-slate-900 text-white">
                <tr>
                  <th className="px-3 py-2.5">EMPLOYEE</th>
                  <th className="px-3 py-2.5">TEAM</th>
                  <th className="px-3 py-2.5">SKILL</th>
                  <th className="px-3 py-2.5 text-center">WORKED DAYS</th>
                  <th className="px-3 py-2.5 text-center">TOTAL HRS</th>
                  <th className="px-3 py-2.5 text-center">DAY (D)</th>
                  <th className="px-3 py-2.5 text-center">NIGHT (N)</th>
                  <th className="px-3 py-2.5 text-center">MID/TRN</th>
                  <th className="px-3 py-2.5 text-center">OFF</th>
                  <th className="px-3 py-2.5 text-center">VAC (V)</th>
                  <th className="px-3 py-2.5 text-center">LEAVE/SL</th>
                  <th className="px-3 py-2.5 text-center">OT DAYS</th>
                </tr>
              </thead>
              <tbody>
                {filteredSummary.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-bold text-slate-900">{r.name}</td>
                    <td className="px-3 py-2 text-slate-600">{r.teamName}</td>
                    <td className="px-3 py-2 text-[10px] font-semibold text-slate-600">{r.skill}</td>
                    <td className="px-3 py-2 text-center font-bold text-emerald-700">{r.workedDays}</td>
                    <td className="px-3 py-2 text-center font-mono font-bold text-slate-800">{r.hours}h</td>
                    <td className="px-3 py-2 text-center">{r.D}</td>
                    <td className="px-3 py-2 text-center">{r.N}</td>
                    <td className="px-3 py-2 text-center">{r.M + r.T}</td>
                    <td className="px-3 py-2 text-center text-rose-700">{r.OFF}</td>
                    <td className="px-3 py-2 text-center text-slate-600">{r.V}</td>
                    <td className="px-3 py-2 text-center text-orange-700">{r.L}</td>
                    <td className="px-3 py-2 text-center">
                      {r.OT > 0 ? (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 font-bold text-sky-800">{r.OT}</span>
                      ) : (
                        '0'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Revisions Archive */}
      {tab === 'revisions' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(summaryData?.revisions || []).map((rev) => (
            <div key={rev.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
                  <FileText className="h-4 w-4 text-emerald-600" />
                  {rev.team_name || rev.team_id}
                </span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800">
                  {rev.revision}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-600">{rev.notes}</p>
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                <span>By: {rev.published_by}</span>
                <span>{rev.published_at?.replace('T', ' ').slice(0, 16)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 4: Admin Access Control & Daily SQLite Backups */}
      {tab === 'admin' && isAdmin && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Supervisor & Admin Logins */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <KeyRound className="h-4 w-4 text-sky-600" />
              Team Supervisor & Manager Accounts
            </h3>
            <form onSubmit={handleCreateUser} className="grid grid-cols-2 gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <input
                required
                type="text"
                value={userForm.userId}
                onChange={(e) => setUserForm((f) => ({ ...f, userId: e.target.value }))}
                placeholder="User ID (e.g. SUP-LEATHER)"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono uppercase"
              />
              <input
                required
                type="text"
                value={userForm.displayName}
                onChange={(e) => setUserForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="Display Name"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
              />
              <select
                value={userForm.role}
                onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value }))}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold"
              >
                <option value="SUPERVISOR">SUPERVISOR (Team-Scoped)</option>
                <option value="ADMIN">ADMIN (Full Access)</option>
              </select>
              {userForm.role === 'SUPERVISOR' ? (
                <select
                  value={userForm.teamId}
                  onChange={(e) => setUserForm((f) => ({ ...f, teamId: e.target.value }))}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center px-2 text-[11px] text-slate-500">All 8 Teams</div>
              )}
              <input
                required
                type="password"
                minLength={4}
                value={userForm.password}
                onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Password (min 4 chars)"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
              >
                <UserPlus className="h-3.5 w-3.5" /> Create Login
              </button>
            </form>

            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.user_id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs">
                  <div>
                    <span className="font-mono font-bold text-slate-900">{u.user_id}</span>
                    <span className="ml-2 text-slate-700">{u.display_name}</span>
                    <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      u.role === 'ADMIN' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {u.role}{u.team_name ? ` · ${u.team_name}` : ''}
                    </span>
                  </div>
                  {u.user_id !== 'UUDS-DXB' && u.user_id !== currentUser?.userId && (
                    <button
                      onClick={() => handleDeleteUser(u.user_id)}
                      className="rounded-lg p-1 text-rose-600 hover:bg-rose-50"
                      title="Delete Account"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Automated Daily SQLite Backups */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Database className="h-4 w-4 text-emerald-600" />
                Automated Daily SQLite Backups (30-Day Retention)
              </h3>
              <button
                onClick={handleRunBackup}
                disabled={runningBackup}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Database className="h-3.5 w-3.5" /> {runningBackup ? 'Backing up...' : 'Run Backup Now'}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Snapshots are stored atomically in <code className="rounded bg-slate-100 px-1">data/backups/</code> on startup and every 24 hours.
            </p>
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {backups.map((b) => (
                <div key={b.filename} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                  <span className="font-mono font-semibold text-slate-800">{b.filename}</span>
                  <span className="text-slate-500">
                    {(b.sizeBytes / 1024).toFixed(0)} KB · {b.createdAt.slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
