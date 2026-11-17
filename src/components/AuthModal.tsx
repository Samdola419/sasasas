import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  User as UserIcon,
  X,
} from 'lucide-react';
import {
  DISPLAY_NAME_MAX_LENGTH,
  loginWithEmail,
  loginWithGoogle,
  registerWithEmail,
  sendPasswordReset,
} from '../lib/auth';
import { useApp } from '../context/AppContext';
import { BrandLogo } from './BrandLogo';

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: 'bg-white/10' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-rose-500' };
  if (score === 2) return { score: 2, label: 'Fair', color: 'bg-amber-400' };
  if (score === 3) return { score: 3, label: 'Good', color: 'bg-sky-400' };
  return { score: 4, label: 'Strong', color: 'bg-emerald-400' };
}

export function AuthModal() {
  const { authModalOpen, authModalTab, closeAuthModal, triggerAuthSuccess, flashNote } = useApp();
  const [tab, setTab] = useState<'login' | 'signup' | 'reset'>(authModalTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTab(authModalTab);
    setError('');
    setInfo('');
    setShowPassword(false);
    setShowConfirm(false);
  }, [authModalTab, authModalOpen]);

  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  if (!authModalOpen) return null;

  const switchTab = (next: 'login' | 'signup' | 'reset') => {
    setTab(next);
    setError('');
    setInfo('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (tab === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter carefully.');
      return;
    }
    setBusy(true);
    try {
      if (tab === 'login') {
        await loginWithEmail(email, password);
        flashNote('Signed in. Syncing your library...');
        triggerAuthSuccess();
      } else if (tab === 'signup') {
        await registerWithEmail(email, password, confirmPassword, displayName);
        flashNote('Welcome to AMStream! Your library is now synced.');
        triggerAuthSuccess();
      } else {
        await sendPasswordReset(email);
        setInfo('Password reset link sent! Check your inbox and spam folder.');
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await loginWithGoogle();
      flashNote('Signed in with Google.');
      triggerAuthSuccess();
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeAuthModal();
      }}
    >
      <div className="relative w-full max-w-[430px] rounded-2xl bg-[#0F1118] border border-white/12 shadow-[0_24px_80px_rgba(0,0,0,0.75)] overflow-hidden">
        {/* Subtle top accent line */}
        <div className="h-1 w-full bg-gradient-to-r from-[#E11D48] via-[#FB7185] to-[#E11D48]" />

        <div className="p-6 sm:p-7">
          <button
            type="button"
            aria-label="Close sign in dialog"
            onClick={closeAuthModal}
            className="absolute top-5 right-5 w-8 h-8 rounded-lg bg-white/5 hover:bg-white/12 border border-white/8 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Original Brand Mark */}
          <div className="mb-4">
            <BrandLogo />
          </div>

          <h2 className="font-display text-2xl font-bold tracking-tight text-white">
            {tab === 'login' ? 'Welcome back' : tab === 'signup' ? 'Create your account' : 'Reset password'}
          </h2>
          <p className="mt-1 text-sm text-slate-400 leading-relaxed">
            {tab === 'login'
              ? 'Sync your watchlist, resume timestamps, and join live Watch Rooms.'
              : tab === 'signup'
              ? 'Save your anime, movies, and series progress seamlessly across devices.'
              : 'Enter your account email and we will send you a secure reset link.'}
          </p>

          {/* Segmented Mode Switcher */}
          {tab !== 'reset' && (
            <div className="mt-5 grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#090A0F] border border-white/10">
              <button
                type="button"
                onClick={() => switchTab('login')}
                className={`py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  tab === 'login'
                    ? 'bg-[#E11D48] text-white shadow-md shadow-[#E11D48]/25'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchTab('signup')}
                className={`py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  tab === 'signup'
                    ? 'bg-[#E11D48] text-white shadow-md shadow-[#E11D48]/25'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {tab === 'signup' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">Display Name</label>
                  <span className="text-[11px] font-mono tabular-nums text-slate-500">
                    {displayName.length}/{DISPLAY_NAME_MAX_LENGTH}
                  </span>
                </div>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    maxLength={DISPLAY_NAME_MAX_LENGTH}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="How friends see you in Watch Rooms"
                    className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-[#090A0F] border border-white/12 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#E11D48] focus:ring-2 focus:ring-[#E11D48]/20 transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-[#090A0F] border border-white/12 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#E11D48] focus:ring-2 focus:ring-[#E11D48]/20 transition-all"
                />
              </div>
            </div>

            {tab !== 'reset' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">Password</label>
                  {tab === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchTab('reset')}
                      className="text-xs font-medium text-[#F43F5E] hover:text-[#FB7185] transition-colors cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full h-11 pl-10 pr-10 rounded-xl bg-[#090A0F] border border-white/12 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#E11D48] focus:ring-2 focus:ring-[#E11D48]/20 transition-all"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {tab === 'signup' && password.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="grid grid-cols-4 gap-1">
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className={`h-1 rounded-full transition-colors ${
                            strength.score >= step ? strength.color : 'bg-white/10'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Strength: <span className="text-slate-200 font-medium">{strength.label}</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {tab === 'signup' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">Confirm Password</label>
                  {passwordsMatch && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" /> Matches
                    </span>
                  )}
                  {passwordsMismatch && (
                    <span className="text-[11px] font-medium text-rose-400">Does not match</span>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className={`w-full h-11 pl-10 pr-10 rounded-xl bg-[#090A0F] border text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-all ${
                      passwordsMismatch
                        ? 'border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/20'
                        : passwordsMatch
                        ? 'border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500/20'
                        : 'border-white/12 focus:border-[#E11D48] focus:ring-[#E11D48]/20'
                    }`}
                  />
                  <button
                    type="button"
                    aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 cursor-pointer"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/12 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-200 leading-relaxed">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {info && (
              <div className="p-3 rounded-xl bg-emerald-500/12 border border-emerald-500/30 flex items-start gap-2.5 text-xs text-emerald-200 leading-relaxed">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{info}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full h-11 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-50 text-white font-semibold text-sm shadow-lg shadow-[#E11D48]/25 transition-all cursor-pointer"
            >
              {busy
                ? 'Please wait...'
                : tab === 'login'
                ? 'Sign In'
                : tab === 'signup'
                ? 'Create Account'
                : 'Send Reset Link'}
            </button>
          </form>

          {tab !== 'reset' ? (
            <>
              <div className="my-5 flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">or continue with</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={handleGoogle}
                className="w-full h-11 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/12 text-sm font-medium text-white flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.9h5.5c-.2 1.2-1.5 3.6-5.5 3.6-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.9H12z"
                  />
                </svg>
                Continue with Google
              </button>

              <div className="mt-5 pt-4 border-t border-white/8 flex items-center justify-center gap-2 text-[11px] text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/80" />
                <span>Encrypted authentication & instant cloud library sync</span>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => switchTab('login')}
              className="mt-4 w-full text-center text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
            >
              Back to Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
