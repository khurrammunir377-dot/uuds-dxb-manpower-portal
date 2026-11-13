import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  MessageCircle,
  Send,
  X,
} from 'lucide-react';

function buildDailyMessage({ roster, day }) {
  if (!roster) return '';
  const dayInfo = roster.days?.[day - 1];
  const label = roster.team ? roster.team.name : 'All Workshop Teams';
  const dow = dayInfo?.dow || '';
  const groups = { D: [], N: [], M: [], T: [], OFF: [], LEAVE: [] };

  for (const r of roster.rows) {
    const sh = r.shifts?.[day - 1]?.code || 'OFF';
    const line = `${r.name} (${r.skill}${r.uudsNo ? ` · ${r.uudsNo}` : ''})`;
    if (sh === 'D') groups.D.push(line);
    else if (sh === 'N') groups.N.push(line);
    else if (sh === 'M') groups.M.push(line);
    else if (sh === 'T') groups.T.push(line);
    else if (sh === 'OFF') groups.OFF.push(line);
    else groups.LEAVE.push(`${r.name} [${sh}]`);
  }

  const onDuty = groups.D.length + groups.N.length + groups.M.length + groups.T.length;
  const parts = [
    `*UUDS DXB WORKSHOP — DUTY ROSTER*`,
    `*Team:* ${label}`,
    `*Date:* ${roster.month.label} — Day ${day} (${dow})`,
    `*On Duty:* ${onDuty} / ${roster.rows.length} Staff`,
    '',
  ];

  if (groups.D.length) {
    parts.push(`*DAY SHIFT (${groups.D.length}):*`);
    groups.D.forEach((n, i) => parts.push(`${i + 1}. ${n}`));
    parts.push('');
  }
  if (groups.N.length) {
    parts.push(`*NIGHT SHIFT (${groups.N.length}):*`);
    groups.N.forEach((n, i) => parts.push(`${i + 1}. ${n}`));
    parts.push('');
  }
  if (groups.M.length || groups.T.length) {
    const mt = [...groups.M, ...groups.T];
    parts.push(`*GENERAL / TRAINING (${mt.length}):*`);
    mt.forEach((n, i) => parts.push(`${i + 1}. ${n}`));
    parts.push('');
  }
  if (groups.LEAVE.length) {
    parts.push(`*VACATION / LEAVE (${groups.LEAVE.length}):* ${groups.LEAVE.join(', ')}`);
  }
  parts.push(`*OFF DUTY:* ${groups.OFF.length} staff`);
  return parts.join('\n');
}

function buildMonthlySummaryMessage({ roster }) {
  if (!roster) return '';
  const label = roster.team ? roster.team.name : 'All Workshop Teams';
  const minDay = Math.min(...roster.dailyTotals.map((d) => d.onDuty));
  const maxDay = Math.max(...roster.dailyTotals.map((d) => d.onDuty));
  const rev = roster.revisions?.[0]?.revision || roster.month.revision || 'R00';

  const lines = [
    `*UUDS DXB WORKSHOP — MONTHLY ROSTER (${rev})*`,
    `*Team:* ${label}`,
    `*Month:* ${roster.month.label}`,
    `*Total Active Staff:* ${roster.rows.length}`,
    `*Daily Coverage Range:* ${minDay} – ${maxDay} staff on duty`,
    '',
    `Official PDF / Excel roster sheet is attached.`,
    `Please confirm receipt and report any urgent changes immediately.`,
  ];
  return lines.join('\n');
}

export default function WhatsAppModal({
  isOpen,
  onClose,
  roster,
  month,
  teamId,
  defaultDay = 10,
  notify,
}) {
  const [msgMode, setMsgMode] = useState('daily'); // daily | monthly
  const [day, setDay] = useState(defaultDay);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || !roster) return;
    if (roster.team?.supervisor_phone && !phone) {
      setPhone(roster.team.supervisor_phone);
    }
    if (msgMode === 'daily') {
      setMessage(buildDailyMessage({ roster, day }));
    } else {
      setMessage(buildMonthlySummaryMessage({ roster }));
    }
  }, [isOpen, roster, msgMode, day]);

  if (!isOpen) return null;

  const cleanPhone = phone.replace(/[^\d]/g, '');
  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    notify('WhatsApp message copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadAndOpenWhatsApp = (format) => {
    const url =
      format === 'pdf'
        ? `/api/export/pdf?month=${month}&teamId=${teamId}`
        : `/api/export/excel?month=${month}&teamId=${teamId}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    notify(`Downloaded ${format.toUpperCase()} & opened WhatsApp — drag/attach the file into your chat!`);
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between bg-emerald-600 px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <MessageCircle className="h-5 w-5" />
            <div>
              <h3 className="text-base font-bold">Send Roster to WhatsApp</h3>
              <p className="text-[11px] text-emerald-100">
                Share formatted shift briefings and attach the official PDF or Excel roster
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-emerald-100 hover:bg-emerald-700 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Mode + Day + Phone */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Message Type</label>
              <select
                value={msgMode}
                onChange={(e) => setMsgMode(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold"
              >
                <option value="daily">Daily Shift Briefing</option>
                <option value="monthly">Monthly Roster Notice</option>
              </select>
            </div>

            {msgMode === 'daily' && (
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Select Day</label>
                <select
                  value={day}
                  onChange={(e) => setDay(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold"
                >
                  {(roster?.days || []).map((d) => (
                    <option key={d.day} value={d.day}>
                      Day {d.day} ({d.dow})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={msgMode === 'monthly' ? 'sm:col-span-2' : ''}>
              <label className="mb-1 block text-xs font-bold text-slate-700">
                WhatsApp Number (Optional)
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+971 50 ... (leave blank for Group)"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
          </div>

          {/* Message Preview */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">Message Preview (Editable)</label>
              <button
                type="button"
                onClick={copyMessage}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied!' : 'Copy Text'}
              </button>
            </div>
            <textarea
              rows={9}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadAndOpenWhatsApp('pdf')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100"
              >
                <FileText className="h-3.5 w-3.5" />
                Download PDF &amp; Open WhatsApp
              </button>
              <button
                type="button"
                onClick={() => downloadAndOpenWhatsApp('excel')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Download Excel &amp; Open WhatsApp
              </button>
            </div>

            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
            >
              <Send className="h-3.5 w-3.5" /> Open WhatsApp <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
