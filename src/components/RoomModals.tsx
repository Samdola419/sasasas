import React, { useState } from 'react';
import { ArrowRight, Lock, Radio, Users, X } from 'lucide-react';
import { extractRoomCodeInput, joinWatchRoom } from '../lib/rooms';
import { useApp } from '../context/AppContext';

export function JoinRoomModal() {
  const {
    joinRoomModalOpen,
    setJoinRoomModalOpen,
    user,
    profile,
    openAuthModal,
    navigate,
    flashNote,
  } = useApp();

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!joinRoomModalOpen) return null;

  const parsedCode = extractRoomCodeInput(input);

  const submitJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const code = parsedCode;
    if (code.length !== 8) {
      setError('Enter an 8-character Watch Room code or paste an invite link.');
      return;
    }

    if (!user) {
      setJoinRoomModalOpen(false);
      openAuthModal('login', () => {
        navigate(`/room/${code}`);
      });
      return;
    }

    setBusy(true);
    try {
      await joinWatchRoom(user.uid, profile?.displayName || user.displayName || 'AMStream Guest', code);
      setJoinRoomModalOpen(false);
      setInput('');
      flashNote(`Joined Watch Room ${code}`);
      navigate(`/room/${code}`);
    } catch (err: any) {
      setError(err?.message || 'Could not join Watch Room.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setJoinRoomModalOpen(false);
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-[#0F1118] border border-white/12 shadow-[0_24px_80px_rgba(0,0,0,0.75)] overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-[#E11D48] via-[#FB7185] to-[#E11D48]" />

        <div className="p-6 sm:p-7">
          <button
            type="button"
            aria-label="Close Watch Room modal"
            onClick={() => setJoinRoomModalOpen(false)}
            className="absolute top-5 right-5 w-8 h-8 rounded-lg bg-white/5 hover:bg-white/12 border border-white/8 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#E11D48]/18 border border-[#E11D48]/30 text-[#F43F5E] flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </span>
            <div>
              <h2 className="font-display text-xl font-bold text-white tracking-tight">Join Watch Room</h2>
              <p className="text-xs text-slate-400 mt-0.5">Synchronized theater for up to 4 viewers</p>
            </div>
          </div>

          <form onSubmit={submitJoin} className="mt-5 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">Room Code or Invite URL</label>
                {parsedCode.length === 8 && (
                  <span className="text-[11px] font-mono text-emerald-400">Code detected: {parsedCode}</span>
                )}
              </div>
              <input
                type="text"
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="K7M9P2XQ or https://.../room/K7M9P2XQ"
                className="w-full h-12 px-4 rounded-xl bg-[#090A0F] border border-white/12 text-base font-mono uppercase tracking-[0.2em] text-white placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-sm placeholder:text-slate-500 focus:outline-none focus:border-[#E11D48] focus:ring-2 focus:ring-[#E11D48]/20 transition-all"
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/12 border border-rose-500/30 text-xs text-rose-200 leading-relaxed">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setJoinRoomModalOpen(false)}
                className="h-10 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/8 text-sm text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-50 text-sm font-semibold text-white shadow-lg shadow-[#E11D48]/25 cursor-pointer"
              >
                <span>{busy ? 'Joining...' : 'Enter Room'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>

          <div className="mt-5 pt-4 border-t border-white/8 grid grid-cols-2 gap-3 text-[11px] text-slate-400">
            <div className="flex items-start gap-2">
              <Radio className="w-3.5 h-3.5 text-[#F43F5E] shrink-0 mt-0.5" />
              <span>Real-time signed host playback sync</span>
            </div>
            <div className="flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>Ad-free stream theater & live chat</span>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-500 leading-relaxed">
            Want to host instead? Start any Anime, Movie, or Series and click{' '}
            <span className="text-slate-300 font-medium">Watch Room</span> in the player bar.
          </p>
        </div>
      </div>
    </div>
  );
}

export function ToastViewport() {
  const { toasts } = useApp();
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="px-4 py-2.5 rounded-xl bg-[#161923]/95 backdrop-blur-md border border-white/12 text-sm text-white shadow-xl"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
