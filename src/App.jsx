import React, { useCallback, useEffect, useState } from 'react';
import {
  CalendarPlus,
  ChevronRight,
  ClipboardList,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plane,
  Upload,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch, setAuthToken, setUnauthorizedHandler } from './api.js';
import LoginPage from './components/LoginPage.jsx';
import CommandDashboard from './components/CommandDashboard.jsx';
import MasterRosterGrid from './components/MasterRosterGrid.jsx';
import EmergencyHub from './components/EmergencyHub.jsx';
import MonthlyBuilder from './components/MonthlyBuilder.jsx';
import ImportRoster from './components/ImportRoster.jsx';
import StaffDirectory from './components/StaffDirectory.jsx';
import RecordsAudit from './components/RecordsAudit.jsx';

const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    subtitle: 'Daily Operations & Coverage',
    iconColor: 'text-cyan-400',
    iconHoverColor: 'text-cyan-300',
    badgeBg: 'bg-cyan-500/15 border-cyan-500/35 text-cyan-400 group-hover:bg-cyan-500/25 group-hover:border-cyan-400/60 shadow-cyan-500/20',
    activeGlow: 'from-cyan-950/70 via-slate-900 to-slate-900 border-cyan-500/50 text-cyan-200',
    accentBorder: 'bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.8)]',
    glowColor: 'rgba(6, 182, 212, 0.45)',
  },
  {
    id: 'roster',
    label: 'Master Roster',
    icon: ClipboardList,
    subtitle: 'Interactive Monthly Grid',
    iconColor: 'text-emerald-400',
    iconHoverColor: 'text-emerald-300',
    badgeBg: 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400 group-hover:bg-emerald-500/25 group-hover:border-emerald-400/60 shadow-emerald-500/20',
    activeGlow: 'from-emerald-950/70 via-slate-900 to-slate-900 border-emerald-500/50 text-emerald-200',
    accentBorder: 'bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.8)]',
    glowColor: 'rgba(16, 185, 129, 0.45)',
  },
  {
    id: 'emergency',
    label: 'Emergency & Cover',
    icon: Zap,
    subtitle: 'Absence, Swaps & Loans',
    iconColor: 'text-amber-400',
    iconHoverColor: 'text-amber-300',
    badgeBg: 'bg-amber-500/15 border-amber-500/35 text-amber-400 group-hover:bg-amber-500/25 group-hover:border-amber-400/60 shadow-amber-500/20',
    activeGlow: 'from-amber-950/70 via-slate-900 to-slate-900 border-amber-500/50 text-amber-200',
    accentBorder: 'bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.8)]',
    glowColor: 'rgba(245, 158, 11, 0.45)',
  },
  {
    id: 'builder',
    label: 'Make Monthly Roster',
    icon: CalendarPlus,
    subtitle: 'Team-Wise & Full Generator',
    iconColor: 'text-fuchsia-400',
    iconHoverColor: 'text-fuchsia-300',
    badgeBg: 'bg-fuchsia-500/15 border-fuchsia-500/35 text-fuchsia-400 group-hover:bg-fuchsia-500/25 group-hover:border-fuchsia-400/60 shadow-fuchsia-500/20',
    activeGlow: 'from-fuchsia-950/70 via-slate-900 to-slate-900 border-fuchsia-500/50 text-fuchsia-200',
    accentBorder: 'bg-fuchsia-400 shadow-[0_0_12px_rgba(217,70,239,0.8)]',
    glowColor: 'rgba(217, 70, 239, 0.45)',
  },
  {
    id: 'import',
    label: 'Upload Excel / PDF',
    icon: Upload,
    subtitle: 'Import Old & New Months',
    iconColor: 'text-blue-400',
    iconHoverColor: 'text-blue-300',
    badgeBg: 'bg-blue-500/15 border-blue-500/35 text-blue-400 group-hover:bg-blue-500/25 group-hover:border-blue-400/60 shadow-blue-500/20',
    activeGlow: 'from-blue-950/70 via-slate-900 to-slate-900 border-blue-500/50 text-blue-200',
    accentBorder: 'bg-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.8)]',
    glowColor: 'rgba(59, 130, 246, 0.45)',
  },
  {
    id: 'staff',
    label: 'Staff Directory',
    icon: Users,
    subtitle: 'Active Crew & IDs',
    iconColor: 'text-rose-400',
    iconHoverColor: 'text-rose-300',
    badgeBg: 'bg-rose-500/15 border-rose-500/35 text-rose-400 group-hover:bg-rose-500/25 group-hover:border-rose-400/60 shadow-rose-500/20',
    activeGlow: 'from-rose-950/70 via-slate-900 to-slate-900 border-rose-500/50 text-rose-200',
    accentBorder: 'bg-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.8)]',
    glowColor: 'rgba(244, 63, 94, 0.45)',
  },
  {
    id: 'records',
    label: 'Records & Audit',
    icon: History,
    subtitle: 'Full Logs, Hours & Revisions',
    iconColor: 'text-violet-400',
    iconHoverColor: 'text-violet-300',
    badgeBg: 'bg-violet-500/15 border-violet-500/35 text-violet-400 group-hover:bg-violet-500/25 group-hover:border-violet-400/60 shadow-violet-500/20',
    activeGlow: 'from-violet-950/70 via-slate-900 to-slate-900 border-violet-500/50 text-violet-200',
    accentBorder: 'bg-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.8)]',
    glowColor: 'rgba(139, 92, 246, 0.45)',
  },
];

const TEAM_ACCENT_COLORS = {
  acheck: { dot: 'bg-amber-400', glow: 'shadow-[0_0_8px_rgba(251,191,36,0.8)]', text: 'text-amber-400' },
  bcheck: { dot: 'bg-emerald-400', glow: 'shadow-[0_0_8px_rgba(52,211,153,0.8)]', text: 'text-emerald-400' },
  cabin: { dot: 'bg-sky-400', glow: 'shadow-[0_0_8px_rgba(56,189,248,0.8)]', text: 'text-sky-400' },
  lounge: { dot: 'bg-fuchsia-400', glow: 'shadow-[0_0_8px_rgba(232,121,249,0.8)]', text: 'text-fuchsia-400' },
  seat: { dot: 'bg-blue-400', glow: 'shadow-[0_0_8px_rgba(96,165,250,0.8)]', text: 'text-blue-400' },
  structure: { dot: 'bg-orange-400', glow: 'shadow-[0_0_8px_rgba(251,146,60,0.8)]', text: 'text-orange-400' },
  paint: { dot: 'bg-purple-400', glow: 'shadow-[0_0_8px_rgba(192,132,252,0.8)]', text: 'text-purple-400' },
  store: { dot: 'bg-teal-400', glow: 'shadow-[0_0_8px_rgba(45,212,191,0.8)]', text: 'text-teal-400' },
  'stores-team': { dot: 'bg-teal-400', glow: 'shadow-[0_0_8px_rgba(45,212,191,0.8)]', text: 'text-teal-400' },
  'leather-team': { dot: 'bg-blue-400', glow: 'shadow-[0_0_8px_rgba(96,165,250,0.8)]', text: 'text-blue-400' },
  'paint-booth': { dot: 'bg-purple-400', glow: 'shadow-[0_0_8px_rgba(192,132,252,0.8)]', text: 'text-purple-400' },
  'a-check': { dot: 'bg-amber-400', glow: 'shadow-[0_0_8px_rgba(251,191,36,0.8)]', text: 'text-amber-400' },
  'team-a': { dot: 'bg-emerald-400', glow: 'shadow-[0_0_8px_rgba(52,211,153,0.8)]', text: 'text-emerald-400' },
  'team-b': { dot: 'bg-sky-400', glow: 'shadow-[0_0_8px_rgba(56,189,248,0.8)]', text: 'text-sky-400' },
  'team-c': { dot: 'bg-fuchsia-400', glow: 'shadow-[0_0_8px_rgba(232,121,249,0.8)]', text: 'text-fuchsia-400' },
  'workshop-team': { dot: 'bg-orange-400', glow: 'shadow-[0_0_8px_rgba(251,146,60,0.8)]', text: 'text-orange-400' },
  office: { dot: 'bg-rose-400', glow: 'shadow-[0_0_8px_rgba(251,113,133,0.8)]', text: 'text-rose-400' },
  planner: { dot: 'bg-indigo-400', glow: 'shadow-[0_0_8px_rgba(129,140,248,0.8)]', text: 'text-indigo-400' },
};

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [pwModal, setPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  const getInitialDay = () => {
    const today = new Date().getDate();
    return today >= 1 && today <= 31 ? today : 1;
  };

  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [meta, setMeta] = useState({ months: [], teams: [], presets: [] });
  const [activeMonth, setActiveMonth] = useState('2026-11');
  const [selectedDay, setSelectedDay] = useState(getInitialDay);
  const [selectedTeamId, setSelectedTeamId] = useState('all');
  const [overview, setOverview] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [emergencyPrefill, setEmergencyPrefill] = useState(null);
  const [toast, setToast] = useState(null);

  const handleMonthChange = (newMonth) => {
    setActiveMonth(newMonth);
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (newMonth === currentMonthKey) {
      setSelectedDay(now.getDate());
    } else {
      setSelectedDay(1);
    }
  };

  const notify = useCallback((msg, type = 'success') => {
    setToast({ msg, type, id: Date.now() });
    setTimeout(() => setToast((cur) => (cur && cur.msg === msg ? null : cur)), 4000);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      sessionStorage.removeItem('uuds_session_active');
      setAuthToken('');
      setCurrentUser(null);
    });
    // Always start at Login Page on fresh site open (unless already logged in this tab session)
    const isActive = sessionStorage.getItem('uuds_session_active') === 'true';
    if (!isActive) {
      setAuthChecked(true);
      return;
    }
    apiFetch('/api/auth/me')
      .then((res) => setCurrentUser(res.user))
      .catch(() => {
        sessionStorage.removeItem('uuds_session_active');
        setAuthToken('');
        setCurrentUser(null);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  const handleLoginSuccess = (user, token) => {
    sessionStorage.setItem('uuds_session_active', 'true');
    if (token) setAuthToken(token);
    setCurrentUser(user);
  };

  const handleLogout = async () => {
    sessionStorage.removeItem('uuds_session_active');
    setAuthToken('');
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setCurrentUser(null);
    setOverview(null);
  };

  const loadAll = useCallback(async (monthOverride = activeMonth, dayOverride = selectedDay) => {
    try {
      const [mRes, oRes, eRes] = await Promise.all([
        apiFetch('/api/meta'),
        apiFetch(`/api/overview?month=${monthOverride}&day=${dayOverride}`),
        apiFetch('/api/employees'),
      ]);
      setMeta(mRes);
      setOverview(oRes);
      setEmployees(eRes.employees || []);
    } catch (err) {
      notify(err.message, 'error');
    }
  }, [activeMonth, selectedDay, notify]);

  useEffect(() => {
    if (currentUser) {
      loadAll(activeMonth, selectedDay);
    }
  }, [currentUser, activeMonth, selectedDay]);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      return notify('New passwords do not match', 'error');
    }
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: pwForm.currentPassword,
          newPassword: pwForm.newPassword,
        }),
      });
      notify('Password updated successfully!');
      setPwModal(false);
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060818] text-xs font-bold tracking-wider text-[#6ea1ff]">
        INITIALIZING UUDS DXB COMMAND...
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onSuccess={handleLoginSuccess} />;
  }

  const openGapsCount = overview?.totals?.openIncidentsCount || 0;
  const activeNav = NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0];
  const activeStaffCount = employees.filter((e) => e.status === 'ACTIVE').length;

  const goToTeamRoster = (teamId) => {
    setSelectedTeamId(teamId);
    setActiveTab('roster');
    setMobileMenuOpen(false);
  };

  const SidebarContent = ({ compact = false }) => (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      {/* Brand Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-4">
        <button
          type="button"
          onClick={() => setPwModal(true)}
          title="Click to Change Password"
          className="group flex items-center gap-3 overflow-hidden text-left focus:outline-none cursor-pointer"
        >
          <img
            src="/uuds-logo.png"
            alt="UUDS Logo"
            className="h-9 w-auto shrink-0 object-contain drop-shadow transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 active:scale-95"
          />
          {!compact && (
            <div className="min-w-0">
              <div className="truncate text-sm font-extrabold tracking-tight text-white group-hover:text-sky-300 transition-colors">
                UUDS DXB
              </div>
              <div className="truncate text-[10px] font-bold tracking-wider text-sky-400">
                MANPOWER PORTAL
              </div>
            </div>
          )}
        </button>
        <button
          onClick={() => setSidebarCollapsed((c) => !c)}
          className="hidden rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white lg:inline-flex cursor-pointer"
          title={compact ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {compact ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Active Month Selector in Sidebar */}
      {!compact && (
        <div className="border-b border-slate-800/80 px-4 py-3">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Active Roster Month
          </label>
          <select
            value={activeMonth}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-white focus:border-sky-500 focus:outline-none"
          >
            {meta.months.map((m) => (
              <option key={m.month} value={m.month} className="bg-slate-900 text-white">
                {m.label} ({m.revision})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Main Navigation */}
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        <div>
          {!compact && (
            <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Operations
            </div>
          )}
          <nav className="space-y-1.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  title={compact ? item.label : undefined}
                  className={`group relative flex w-full items-center justify-between rounded-xl ${
                    compact ? 'p-2 justify-center' : 'px-2.5 py-2'
                  } text-left text-xs font-bold transition-all duration-200 ${
                    active
                      ? `bg-gradient-to-r ${item.activeGlow} border shadow-lg shadow-black/60`
                      : 'text-slate-300 hover:bg-slate-900/90 hover:text-white border border-transparent'
                  }`}
                >
                  {/* Active glowing accent strip on left edge */}
                  {active && (
                    <span
                      className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full ${item.accentBorder}`}
                    />
                  )}

                  <span className={`flex items-center gap-2.5 overflow-hidden ${compact ? 'justify-center w-full' : ''}`}>
                    {/* Naughty Colored Icon Wrapper with Cheeky Wiggle on Hover */}
                    <span
                      className={`relative flex ${
                        compact ? 'h-9 w-9' : 'h-8 w-8'
                      } shrink-0 items-center justify-center rounded-lg border transition-all duration-300 ${
                        item.badgeBg
                      } ${
                        active
                          ? 'scale-105 shadow-md'
                          : 'group-hover:scale-115'
                      }`}
                      style={{
                        boxShadow: active ? `0 0 14px ${item.glowColor}` : undefined,
                      }}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 transition-transform duration-300 ${
                          item.iconColor
                        } group-hover-naughty-wiggle ${
                          active ? 'animate-naughty-bounce' : ''
                        }`}
                      />
                    </span>

                    {!compact && (
                      <div className="flex flex-col truncate text-left min-w-0">
                        <span
                          className={`truncate text-xs font-bold tracking-tight transition-colors ${
                            active
                              ? 'text-white font-extrabold drop-shadow-sm'
                              : 'text-slate-200 group-hover:text-white'
                          }`}
                        >
                          {item.label}
                        </span>
                        <span className="truncate text-[9.5px] font-medium text-slate-400 group-hover:text-slate-300">
                          {item.subtitle}
                        </span>
                      </div>
                    )}
                  </span>

                  {!compact && item.id === 'emergency' && openGapsCount > 0 && (
                    <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white animate-pulse shadow-rose-500/50 shadow-sm">
                      {openGapsCount}
                    </span>
                  )}
                  {compact && item.id === 'emergency' && openGapsCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-rose-600 border-2 border-slate-950 animate-pulse" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Quick Team Roster Dropdown */}
        {!compact && (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-1.5 transition-all">
            <button
              type="button"
              onClick={() => setTeamDropdownOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-bold text-slate-300 transition hover:bg-slate-800 hover:text-white cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-sky-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                  Quick Team Rosters
                </span>
              </span>
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-sky-400">
                  {meta.teams.length} Teams
                </span>
                <ChevronRight
                  className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                    teamDropdownOpen ? 'rotate-90 text-sky-400' : ''
                  }`}
                />
              </div>
            </button>

            {teamDropdownOpen && (
              <div className="mt-1.5 space-y-0.5 border-t border-slate-800/70 pt-1.5 pr-0.5">
                <button
                  onClick={() => goToTeamRoster('all')}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs transition cursor-pointer ${
                    activeTab === 'roster' && selectedTeamId === 'all'
                      ? 'bg-sky-500/20 font-bold text-sky-300 border border-sky-500/30'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]" />
                    <span className="font-semibold">All Teams (Master)</span>
                  </span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">
                    {activeStaffCount}
                  </span>
                </button>

                {meta.teams.map((t) => {
                  const isSelected = activeTab === 'roster' && selectedTeamId === t.id;
                  const accent = TEAM_ACCENT_COLORS[t.id] || { dot: 'bg-sky-400', glow: 'shadow-[0_0_8px_rgba(56,189,248,0.8)]', text: 'text-sky-400' };
                  return (
                    <button
                      key={t.id}
                      onClick={() => goToTeamRoster(t.id)}
                      className={`group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-all duration-150 cursor-pointer ${
                        isSelected
                          ? 'bg-slate-800/90 font-bold text-sky-300 border border-slate-700/60'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${accent.dot} ${accent.glow} group-hover-cheeky-pop transition-transform duration-200`}
                        />
                        <span className="truncate group-hover:text-slate-100 transition-colors">{t.name}</span>
                      </span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 group-hover:text-slate-300">
                        {t.staffCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* User Section Styled Like Training Portal */}
      <div className="border-t border-slate-800/80 p-3 shrink-0">
        {compact ? (
          <div className="flex flex-col items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-xs font-bold text-white shadow-md"
              title={currentUser?.displayName || currentUser?.userId}
            >
              {(currentUser?.userId || 'A')[0].toUpperCase()}
            </div>
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="group rounded-lg p-2 text-rose-400 hover:bg-rose-950/40 hover:text-rose-200 transition cursor-pointer"
            >
              <LogOut className="h-4 w-4 group-hover-door-peek transition-transform" />
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-2.5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-md shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate text-slate-100">
                    {currentUser?.displayName || currentUser?.userId || 'Administrator'}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
                    {currentUser?.role || 'Admin'} Access
                  </div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Sign Out"
                className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition-colors cursor-pointer shrink-0"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 text-slate-900">
      {/* Desktop Left Sidebar */}
      <aside
        className={`no-print sticky top-0 hidden h-screen shrink-0 border-r border-slate-800 transition-all duration-200 lg:block ${
          sidebarCollapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        <SidebarContent compact={sidebarCollapsed} />
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 h-full w-68 shadow-2xl">
            <SidebarContent compact={false} />
          </aside>
        </div>
      )}

      {/* Main Workspace Column */}
      <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
        {/* Mobile-only Header Bar */}
        <header className="no-print shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur-xs lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Open Navigation"
              >
                <Menu className="h-4 w-4" />
              </button>
              <span className="text-sm font-extrabold text-slate-900">{activeNav.label}</span>
            </div>

            <select
              value={activeMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800"
            >
              {meta.months.map((m) => (
                <option key={m.month} value={m.month}>
                  {m.label} ({m.revision})
                </option>
              ))}
            </select>
          </div>
        </header>

        {/* Main Content Area - Independently scrollable while footer stays pinned */}
        <main className="mx-auto w-full max-w-[1600px] flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
          {activeTab === 'dashboard' && (
            <CommandDashboard
              overview={overview}
              selectedDay={selectedDay}
              setSelectedDay={setSelectedDay}
              onNavigate={setActiveTab}
              onSelectTeamRoster={goToTeamRoster}
              onDataChanged={() => loadAll()}
              notify={notify}
              onOpenEmergencyForIncident={(inc) => {
                setEmergencyPrefill({
                  incidentId: inc.id,
                  employeeId: inc.employee_id,
                  day: inc.start_day,
                });
                setActiveTab('emergency');
              }}
            />
          )}

          {activeTab === 'roster' && (
            <MasterRosterGrid
              month={activeMonth}
              teams={meta.teams}
              selectedTeamId={selectedTeamId}
              setSelectedTeamId={setSelectedTeamId}
              onDataChanged={() => loadAll()}
              notify={notify}
              onStartSwapOrCover={(target) => {
                setEmergencyPrefill(target);
                setActiveTab('emergency');
              }}
            />
          )}

          {activeTab === 'emergency' && (
            <EmergencyHub
              month={activeMonth}
              teams={meta.teams}
              employees={employees}
              overview={overview}
              prefill={emergencyPrefill}
              onClearPrefill={() => setEmergencyPrefill(null)}
              onDataChanged={() => loadAll()}
              notify={notify}
            />
          )}

          {activeTab === 'builder' && (
            <MonthlyBuilder
              months={meta.months}
              teams={meta.teams}
              presets={meta.presets}
              activeMonth={activeMonth}
              onGenerated={(newMonth, targetTeamId = 'all') => {
                setActiveMonth(newMonth);
                setSelectedDay(1);
                setSelectedTeamId(targetTeamId);
                loadAll(newMonth, 1);
                setActiveTab('roster');
              }}
              notify={notify}
            />
          )}

          {activeTab === 'import' && (
            <ImportRoster
              teams={meta.teams}
              activeMonth={activeMonth}
              onImported={(importedMonth, importedTeamId) => {
                setActiveMonth(importedMonth);
                setSelectedDay(1);
                setSelectedTeamId(importedTeamId);
                loadAll(importedMonth, 1);
                setActiveTab('roster');
              }}
              notify={notify}
            />
          )}

          {activeTab === 'staff' && (
            <StaffDirectory
              teams={meta.teams}
              employees={employees}
              presets={meta.presets}
              activeMonth={activeMonth}
              onDataChanged={() => loadAll()}
              notify={notify}
            />
          )}

          {activeTab === 'records' && (
            <RecordsAudit
              month={activeMonth}
              teams={meta.teams}
              currentUser={currentUser}
              notify={notify}
            />
          )}
        </main>

        {/* Global Fixed Bottom Footer (Starts after sidebar, stays fixed at the bottom of the screen across all pages) */}
        <footer className="no-print w-full shrink-0 z-40 select-none border-t border-slate-200/90 bg-white/95 text-slate-700 py-1.5 px-3 sm:px-6 flex items-center justify-center text-center backdrop-blur-md shadow-[0_-2px_8px_rgba(0,0,0,0.03)]">
          <p className="text-[11px] sm:text-xs font-semibold tracking-wide truncate leading-tight">
            Designed and Developed by <span className="text-blue-600 font-bold">| Khurram Munir Basra |</span> UUDS DXB Stores
          </p>
        </footer>
      </div>

      {/* Change Password Modal */}
      {pwModal && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Change Manager Password</h3>
              <button onClick={() => setPwModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">User ID: <strong>{currentUser.userId}</strong></p>
            <form onSubmit={handleChangePassword} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Current Password</label>
                <input
                  type="password"
                  required
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">New Password</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Confirm New Password</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={pwForm.confirmPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setPwModal(false)} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600">
                  Cancel
                </button>
                <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800">
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`no-print fixed bottom-5 right-5 z-50 rounded-xl px-4 py-3 text-xs font-bold text-white shadow-xl transition ${
            toast.type === 'error' ? 'bg-rose-600' : 'bg-slate-900 ring-1 ring-emerald-500/50'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
