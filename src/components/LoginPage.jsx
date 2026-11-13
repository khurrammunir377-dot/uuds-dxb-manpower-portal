import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  User,
} from 'lucide-react';
import { apiFetch } from '../api.js';

export default function LoginPage({ onSuccess }) {
  const [userId, setUserId] = useState('admin');
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
        body: JSON.stringify({ userId, password, remember: true }),
      });
      onSuccess(res.user);
    } catch (err) {
      setError(err.message || 'Invalid User ID or Password');
      setShakeKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#060818] px-4 py-8 text-white select-none">
      {/* Deep Sapphire Atmospheric Background Glows matching Training Portal */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 600px at 20% 15%, rgba(180,137,255,0.18), transparent 60%), radial-gradient(900px 600px at 85% 85%, rgba(78,240,192,0.14), transparent 60%), linear-gradient(160deg, #060818 0%, #0b1126 50%, #131b3f 100%)',
        }}
      />

      {/* Floating Ambient Aura */}
      <div className="animate-float-slow pointer-events-none absolute -left-20 top-10 h-96 w-96 rounded-full bg-blue-500/15 blur-[100px]" />
      <div className="animate-float-reverse pointer-events-none absolute -right-20 bottom-10 h-96 w-96 rounded-full bg-purple-500/15 blur-[100px]" />

      {/* Centered Auth Card Matching UUDS Training Tracker */}
      <div
        key={shakeKey}
        className={`relative z-10 w-full max-w-[430px] rounded-3xl border border-[#768ef0]/25 bg-[#161c38]/90 p-8 sm:p-9 shadow-[0_20px_60px_rgba(2,10,32,0.7),0_0_30px_rgba(110,161,255,0.25)] backdrop-blur-xl transition-all duration-300 ${
          shakeKey > 0 ? 'animate-shake' : 'animate-fade-up'
        }`}
      >
        {/* Brand Header with 3D Tilt Floating Logo */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="group relative mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6ea1ff] to-[#b489ff] p-3 shadow-[0_0_24px_rgba(110,161,255,0.5)] transition-transform duration-300 hover:scale-105">
            <img
              src="/uuds-logo.png"
              alt="UUDS Logo"
              className="h-full w-full object-contain drop-shadow"
            />
          </div>
          <h1 className="bg-gradient-to-r from-white via-slate-100 to-[#bcd0ff] bg-clip-text text-2xl font-black tracking-tight text-transparent">
            UUDS DXB
          </h1>
          <p className="mt-1 text-xs font-semibold tracking-wider text-[#8a93b5] uppercase">
            Manpower Portal · Sign in
          </p>
        </div>

        {/* Error Alert Tag */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/15 px-3.5 py-2.5 text-xs font-semibold text-rose-300 animate-fade-up">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Sign-In Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold tracking-wider text-[#8a93b5] uppercase">
              User ID / Username
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#8a93b5]">
                <User className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                placeholder="e.g. admin or supervisor"
                className="w-full rounded-xl border border-[#768ef0]/25 bg-[#0b1126]/85 py-2.5 pl-10 pr-4 text-xs font-semibold text-white placeholder-slate-500 transition focus:border-[#6ea1ff] focus:bg-[#0e1635] focus:outline-none focus:ring-2 focus:ring-[#6ea1ff]/30"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-bold tracking-wider text-[#8a93b5] uppercase">
              Password
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#8a93b5]">
                <Lock className="h-4 w-4" />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter password"
                className="w-full rounded-xl border border-[#768ef0]/25 bg-[#0b1126]/85 py-2.5 pl-10 pr-10 text-xs font-semibold text-white placeholder-slate-500 transition focus:border-[#6ea1ff] focus:bg-[#0e1635] focus:outline-none focus:ring-2 focus:ring-[#6ea1ff]/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#8a93b5] transition hover:text-white"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group relative mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6ea1ff] to-[#4f7fff] py-2.5 px-4 text-xs font-bold text-white shadow-[0_4px_16px_rgba(110,161,255,0.4)] transition hover:from-[#7daaff] hover:to-[#5e8cff] hover:shadow-[0_6px_22px_rgba(110,161,255,0.6)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Signing in…
              </span>
            ) : (
              <>
                <span>Sign in</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>
        </form>

        {/* Helpful Default Hint */}
        <div className="mt-5 border-t border-[#768ef0]/15 pt-4 text-center text-[11px] text-[#8a93b5]">
          Default credentials: <code className="rounded bg-slate-900/80 px-1.5 py-0.5 font-mono text-[#6ea1ff]">admin</code> / <code className="rounded bg-slate-900/80 px-1.5 py-0.5 font-mono text-[#6ea1ff]">admin123</code>
        </div>
      </div>

      {/* Clean Training-Portal Styled Footer */}
      <footer className="relative z-10 mt-6 text-center text-[11px] text-[#8a93b5]/80">
        UUDS DXB Manpower Portal · Centralized Manpower Scheduling, Team Deployment &amp; Tracking
      </footer>
    </div>
  );
}
