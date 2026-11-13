import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { SHIFT_STYLES, apiFetch } from '../api.js';

export default function ImportRoster({ teams, activeMonth, onImported, notify }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [month, setMonth] = useState(activeMonth || '2026-10');
  const [teamId, setTeamId] = useState(teams[0]?.id || 'team-a');
  const [revision, setRevision] = useState('R00');
  const [status, setStatus] = useState('PUBLISHED');
  const [sheetName, setSheetName] = useState('');
  const [autoCreateMissing, setAutoCreateMissing] = useState(true);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const [tplTeam, setTplTeam] = useState(teams[0]?.id || 'team-a');
  const [tplMonth, setTplMonth] = useState('2026-10');

  const runPreview = async (selectedFile, overrideSheet = '') => {
    if (!selectedFile) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      if (overrideSheet) fd.append('sheetName', overrideSheet);

      const res = await fetch('/api/import/preview', {
        method: 'POST',
        credentials: 'same-origin',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse file');

      setPreview(data);
      if (data.detectedMonth) setMonth(data.detectedMonth);
      if (data.detectedTeamId && teams.some((t) => t.id === data.detectedTeamId)) {
        setTeamId(data.detectedTeamId);
      }
      if (data.detectedRevision) setRevision(data.detectedRevision);
      setSheetName(data.activeSheet || '');
      notify(`Parsed ${data.rows.length} staff rows from ${data.fileName}`);
    } catch (err) {
      notify(err.message, 'error');
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    runPreview(f);
  };

  const handleSheetChange = (nextSheet) => {
    setSheetName(nextSheet);
    if (file) runPreview(file, nextSheet);
  };

  const handleCommit = async (e) => {
    e.preventDefault();
    if (!preview?.rows?.length) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/import/commit', {
        method: 'POST',
        body: JSON.stringify({
          month,
          teamId,
          revision,
          status,
          autoCreateMissing,
          notes,
          fileName: preview.fileName,
          rows: preview.rows,
        }),
      });
      notify(
        `Saved ${month} roster for ${teams.find((t) => t.id === teamId)?.name || teamId} (${res.importedStaff} staff)!`
      );
      onImported(month, teamId);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Upload Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-sky-600" />
              <h2 className="text-lg font-bold text-slate-900">
                Upload Month-Wise Excel or PDF Roster
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Import current, future, or <strong>old historical months</strong> (e.g., Sep 2026, Oct 2026, Dec 2026) from Excel (<code>.xlsx</code>, <code>.xls</code>, <code>.csv</code>) or PDF (<code>.pdf</code>) files into permanent workshop records.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <History className="h-4 w-4 text-slate-500" />
            <span className="font-semibold text-slate-700">Old &amp; New Months Supported</span>
          </div>
        </div>

        {/* File Dropzone + Excel Template Helper */}
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50/40 p-6 text-center transition hover:border-sky-500 hover:bg-sky-50 lg:col-span-7">
            <div className="flex items-center gap-2 text-sky-700">
              <FileSpreadsheet className="h-7 w-7" />
              <FileText className="h-7 w-7" />
            </div>
            <div className="mt-2 text-sm font-bold text-slate-900">
              {file ? file.name : 'Click to choose Excel (.xlsx / .xls / .csv) or PDF roster'}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Auto-detects team name, month, UUDS/Contingent IDs, skills, and Day 1–31 shifts
            </p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.pdf"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {/* Excel Template Downloader */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:col-span-5">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Need a Blank Excel Sheet?
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Download a ready-to-fill Excel template pre-filled with a team&apos;s staff list for any month.
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select
                value={tplTeam}
                onChange={(e) => setTplTeam(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <input
                type="month"
                value={tplMonth}
                onChange={(e) => setTplMonth(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold"
              />
            </div>
            <a
              href={`/api/import/template?month=${tplMonth}&teamId=${tplTeam}`}
              className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5 text-sky-400" /> Download Excel Template (.xlsx)
            </a>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-xs font-bold text-slate-600 shadow-sm">
          <RefreshCw className="h-4 w-4 animate-spin text-sky-600" />
          Parsing uploaded roster file...
        </div>
      )}

      {/* Preview & Confirm Form */}
      {preview && !loading && (
        <form onSubmit={handleCommit} className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Import Settings &amp; Verification ({preview.fileName})
                </h3>
                <p className="text-xs text-slate-500">
                  Matched <strong>{preview.matchedCount}</strong> existing staff ·{' '}
                  <strong>{preview.newCount}</strong> new staff · {preview.daysDetected} days detected
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {preview.matchedCount} Matched
                </span>
                {preview.newCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 font-bold text-amber-800">
                    <AlertCircle className="h-3.5 w-3.5" /> {preview.newCount} New Staff
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Target Month (Any Old/New)</label>
                <input
                  required
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Target Team</label>
                <select
                  required
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold"
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Revision Tag</label>
                <input
                  type="text"
                  value={revision}
                  onChange={(e) => setRevision(e.target.value.toUpperCase())}
                  placeholder="R00"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold uppercase"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Record Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold"
                >
                  <option value="PUBLISHED">PUBLISHED (Active / Historical)</option>
                  <option value="ARCHIVED">ARCHIVED (Old Record)</option>
                  <option value="DRAFT">DRAFT</option>
                </select>
              </div>

              {preview.sheetNames?.length > 1 ? (
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Excel Sheet</label>
                  <select
                    value={sheetName}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold"
                  >
                    {preview.sheetNames.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Import Note</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g., Historical Oct 2026 import"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  />
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={autoCreateMissing}
                  onChange={(e) => setAutoCreateMissing(e.target.checked)}
                />
                Automatically add unmatched / new staff rows to this team&apos;s directory
              </label>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                Save Imported Roster ({preview.rows.length} Staff)
              </button>
            </div>
          </div>

          {/* Parsed Grid Preview */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full border-collapse text-[11px]">
                <thead className="sticky top-0 z-10 bg-slate-900 text-white">
                  <tr>
                    <th className="border border-slate-700 px-2 py-2">NO</th>
                    <th className="border border-slate-700 px-2.5 py-2 text-left">NAME</th>
                    <th className="border border-slate-700 px-2 py-2 text-left">SKILL</th>
                    <th className="border border-slate-700 px-2 py-2 text-left">UUDS NO</th>
                    <th className="border border-slate-700 px-2 py-2">MATCH</th>
                    {Array.from({ length: preview.daysDetected }, (_, i) => i + 1).map((d) => (
                      <th key={d} className="min-w-[28px] border border-slate-700 px-1 py-1 text-center">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-2 py-1 text-center text-slate-500">{r.seqNo}</td>
                      <td className="whitespace-nowrap border border-slate-200 px-2.5 py-1 font-bold text-slate-900">
                        {r.name}
                      </td>
                      <td className="whitespace-nowrap border border-slate-200 px-2 py-1 text-[10px] text-slate-600">
                        {r.skill}
                      </td>
                      <td className="whitespace-nowrap border border-slate-200 px-2 py-1 font-mono text-[10px] text-slate-600">
                        {r.uudsNo || r.contingentNo || '—'}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                            r.matchStatus === 'MATCHED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {r.matchStatus === 'MATCHED' ? 'LINKED' : 'NEW'}
                        </span>
                      </td>
                      {Array.from({ length: preview.daysDetected }, (_, i) => r.shifts[i] || 'OFF').map((code, dIdx) => {
                        const st = SHIFT_STYLES[code] || SHIFT_STYLES.OFF;
                        return (
                          <td key={dIdx} className="border border-slate-200 p-0.5 text-center">
                            <div className={`rounded-sm py-0.5 text-[10px] font-bold ${st.bg} ${st.text}`}>
                              {code}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
