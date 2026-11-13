import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  User,
} from 'lucide-react';
import { apiFetch } from '../api.js';

export default function LoginPage({ onSuccess }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ userId: userId.trim(), password, remember: true }),
      });
      onSuccess(res.user, res.token);
    } catch (err) {
      setError(err.message || 'Invalid User ID or Password. Please try again.');
      setShakeKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#070b19] px-4 py-8 text-white select-none">
      {/* Precision Blueprint / Grid Ambient Background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            'radial-gradient(rgba(56, 189, 248, 0.25) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Atmospheric Radial Glows */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(800px 500px at 15% 20%, rgba(14, 165, 233, 0.15), transparent 65%), radial-gradient(700px 500px at 85% 80%, rgba(99, 102, 241, 0.12), transparent 60%), linear-gradient(180deg, #070b19 0%, #090e23 60%, #0d1533 100%)',
        }}
      />

      {/* Floating Ambient Aura */}
      <div className="pointer-events-none absolute -left-20 top-12 h-80 w-80 rounded-full bg-sky-500/10 blur-[100px]" />
      <div className="pointer-events-none absolute -right-20 bottom-12 h-80 w-80 rounded-full bg-indigo-500/10 blur-[100px]" />

      {/* Main Luxury Glass Auth Card */}
      <div
        key={shakeKey}
        className={`relative z-10 w-full max-w-[440px] rounded-3xl border border-slate-700/60 bg-[#0d1428]/90 p-8 sm:p-10 shadow-[0_25px_70px_rgba(0,0,0,0.8),0_0_40px_rgba(14,165,233,0.15)] backdrop-blur-2xl transition-all duration-300 ${
          shakeKey > 0 ? 'animate-shake' : 'animate-fade-up'
        }`}
      >
        {/* Brand Header */}
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="relative mb-3 flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-700/80 bg-gradient-to-b from-slate-800 to-slate-900 p-3 shadow-xl ring-1 ring-sky-400/20">
            <img
              src="/uuds-logo.png"
              alt="UUDS Logo"
              className="h-full w-full object-contain filter drop-shadow-[0_2px_10px_rgba(56,189,248,0.35)]"
            />
          </div>

          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-0.5 text-[10px] font-black uppercase tracking-widest text-sky-400">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
            Dubai International Airport
          </div>

          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            UUDS DXB <span className="text-sky-400">Portal</span>
          </h1>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            Centralized Manpower Scheduling &amp; Tracking
          </p>
        </div>

        {/* Error Alert Tag */}
        {error && (
          <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/15 p-3 text-xs font-semibold text-rose-300 animate-fade-up">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Sign-In Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold tracking-wider uppercase text-slate-300">
              User ID / Username
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <User className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                placeholder="Enter User ID (e.g. admin)"
                className="w-full rounded-xl border border-slate-700/80 bg-[#080d1e]/90 py-2.5 pl-10 pr-4 text-xs font-semibold text-white placeholder-slate-500 transition focus:border-sky-400 focus:bg-[#0b1229] focus:outline-none focus:ring-2 focus:ring-sky-500/25"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-bold tracking-wider uppercase text-slate-300">
              Password
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Lock className="h-4 w-4" />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter Password"
                className="w-full rounded-xl border border-slate-700/80 bg-[#080d1e]/90 py-2.5 pl-10 pr-10 text-xs font-semibold text-white placeholder-slate-500 transition focus:border-sky-400 focus:bg-[#0b1229] focus:outline-none focus:ring-2 focus:ring-sky-500/25"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 transition hover:text-white cursor-pointer"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group relative mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 py-3 px-4 text-xs font-black tracking-wide text-white shadow-[0_4px_20px_rgba(14,165,233,0.35)] transition-all hover:from-sky-400 hover:via-blue-500 hover:to-indigo-500 hover:shadow-[0_6px_25px_rgba(14,165,233,0.5)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Authenticating…
              </span>
            ) : (
              <>
                <span>Sign in to Portal</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>
        </form>

        {/* Security Badge */}
        <div className="mt-6 flex items-center justify-center gap-2 border-t border-slate-800/80 pt-4 text-[11px] font-medium text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>Authorized Personnel Only · 256-bit Secure Session</span>
        </div>
      </div>

      {/* Pinned Clean Footer */}
      <footer className="relative z-10 mt-8 text-center text-xs font-medium text-slate-400">
        Designed and Developed by | <span className="font-bold text-slate-200">Khurram Munir Basra</span> |{' '}
        <span className="font-semibold text-sky-400">UUDS DXB Stores</span>
      </footer>
    </div>
  );
}
