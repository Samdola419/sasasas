import React, { useEffect, useState } from 'react';
import { LogOut, Mail, ShieldCheck, User as UserIcon } from 'lucide-react';
import { DISPLAY_NAME_MAX_LENGTH, sendPasswordReset, updateAccountDisplayName } from '../lib/auth';
import { applyPageSeo } from '../lib/seo';
import { useApp } from '../context/AppContext';

export function AccountPage() {
  const {
    user,
    profile,
    setProfile,
    openAuthModal,
    logout,
    myList,
    continueWatching,
    watchProgress,
    preferences,
    updatePreferences,
    navigate,
    flashNote,
  } = useApp();

  const [nameInput, setNameInput] = useState(profile?.displayName || '');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    applyPageSeo({
      title: 'Account & Cloud Sync — AMStream',
      description: 'Manage your AMStream profile, Firebase cloud watchlist sync, and default playback preferences.',
      path: '/account',
      robots: 'noindex, nofollow',
    });
  }, []);

  useEffect(() => {
    setNameInput(profile?.displayName || user?.displayName || '');
  }, [profile, user]);

  if (!user) {
    return (
      <div className="min-h-screen pt-24 pb-24 max-w-lg mx-auto px-4 flex items-center">
        <div className="w-full rounded-2xl bg-[#0F1118] border border-white/12 shadow-[0_24px_80px_rgba(0,0,0,0.65)] overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-[#E11D48] via-[#FB7185] to-[#E11D48]" />
          <div className="p-7 sm:p-8 text-center">
            <span className="w-12 h-12 mx-auto rounded-xl bg-[#E11D48]/18 border border-[#E11D48]/30 text-[#F43F5E] flex items-center justify-center mb-4">
              <UserIcon className="w-6 h-6" />
            </span>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white">
              Sync Your AMStream Account
            </h1>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              Your guest My List and Continue Watching are saved on this browser. Sign in or create an account to sync across devices and host Watch Rooms.
            </p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="h-11 px-5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-sm font-semibold text-white shadow-lg shadow-[#E11D48]/25 transition-colors cursor-pointer"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => openAuthModal('signup')}
                className="h-11 px-5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/12 text-sm font-semibold text-white transition-colors cursor-pointer"
              >
                Create Account
              </button>
            </div>

            <div className="mt-6 pt-5 border-t border-white/8 flex items-center justify-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-400/80 shrink-0" />
              <span>Instant Firestore cloud sync for Watchlist, History & Preferences</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const saveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    try {
      const updated = await updateAccountDisplayName(user, nameInput);
      setProfile((prev) => ({ ...(prev || updated), ...updated }));
      flashNote('Display name updated.');
    } catch (err: any) {
      flashNote(err?.message || 'Could not update display name.');
    } finally {
      setSavingName(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!user.email) return;
    try {
      await sendPasswordReset(user.email);
      flashNote(`Password reset link sent to ${user.email}`);
    } catch (err: any) {
      flashNote(err?.message || 'Could not send reset email.');
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-24 max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">Account & Cloud Sync</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage your profile, synced library, and playback defaults</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-rose-500/12 hover:bg-rose-500/20 border border-rose-500/30 text-sm font-medium text-rose-300 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>

      {/* Profile card */}
      <section className="rounded-2xl bg-[#12141C] border border-white/10 p-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-emerald-400 mb-4">
          <ShieldCheck className="w-4 h-4" />
          Firebase Cloud Sync Active
        </div>

        <form onSubmit={saveDisplayName} className="grid sm:grid-cols-2 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Display Name (max {DISPLAY_NAME_MAX_LENGTH} characters)
            </label>
            <input
              type="text"
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              required
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="w-full h-10 px-3.5 rounded-xl bg-black/40 border border-white/12 text-sm text-white focus:outline-none focus:border-[#E11D48]"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={savingName}
              className="h-10 px-5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-50 text-sm font-semibold text-white cursor-pointer"
            >
              {savingName ? 'Saving...' : 'Save Name'}
            </button>
          </div>
        </form>

        <div className="mt-5 pt-5 border-t border-white/8 flex flex-wrap items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2 text-slate-300">
            <Mail className="w-4 h-4 text-slate-400" />
            <span>{user.email}</span>
          </div>
          <button
            type="button"
            onClick={handlePasswordReset}
            className="text-xs text-[#F43F5E] hover:underline cursor-pointer"
          >
            Send password reset email
          </button>
        </div>
      </section>

      {/* Synced stats */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <a
          href="/list"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            navigate('/list');
          }}
          className="p-4 rounded-2xl bg-[#12141C] hover:bg-[#171A24] border border-white/10 text-left transition-colors block"
        >
          <div className="font-display text-2xl font-bold tabular-nums text-white">{myList.length}</div>
          <div className="text-xs text-slate-400 mt-0.5">My List Titles</div>
        </a>
        <a
          href="/continue"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            navigate('/continue');
          }}
          className="p-4 rounded-2xl bg-[#12141C] hover:bg-[#171A24] border border-white/10 text-left transition-colors block"
        >
          <div className="font-display text-2xl font-bold tabular-nums text-white">{continueWatching.length}</div>
          <div className="text-xs text-slate-400 mt-0.5">Continue Watching</div>
        </a>
        <div className="p-4 rounded-2xl bg-[#12141C] border border-white/10">
          <div className="font-display text-2xl font-bold tabular-nums text-white">{Object.keys(watchProgress).length}</div>
          <div className="text-xs text-slate-400 mt-0.5">Synced Timestamps</div>
        </div>
      </section>

      {/* Preferences */}
      <section className="rounded-2xl bg-[#12141C] border border-white/10 p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold text-white">Playback Preferences</h2>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-white">Default Anime Audio</div>
            <div className="text-xs text-slate-400">Automatically prefer SUB or English DUB when available</div>
          </div>
          <div className="flex gap-1 p-1 rounded-lg bg-black/40 border border-white/10">
            {(['sub', 'dub'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => updatePreferences({ lang })}
                className={`px-3 py-1 rounded text-xs font-semibold uppercase cursor-pointer ${
                  preferences.lang === lang ? 'bg-[#E11D48] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 pt-3 border-t border-white/8">
          <div>
            <div className="text-sm font-medium text-white">Auto-play Next Episode</div>
            <div className="text-xs text-slate-400">Automatically advance after episode completion</div>
          </div>
          <button
            type="button"
            onClick={() => updatePreferences({ autoNext: !preferences.autoNext })}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              preferences.autoNext ? 'bg-[#E11D48] text-white' : 'bg-white/8 text-slate-300'
            }`}
          >
            {preferences.autoNext ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </section>
    </div>
  );
}
export default AccountPage;
