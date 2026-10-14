import React, { useState } from 'react';
import { Play, LogIn, Sparkles, Film, ArrowRight, ShieldCheck, Zap, Users2 } from 'lucide-react';
import { DEMO_VIDEOS } from '../data/demoMedia';

interface LobbyProps {
  initialCode?: string;
  initialName: string;
  isConnecting: boolean;
  errorMessage: string | null;
  onCreateRoom: (name: string, initialMediaUrl?: string) => void;
  onJoinRoom: (name: string, code: string) => void;
}

export function Lobby({
  initialCode = '',
  initialName,
  isConnecting,
  errorMessage,
  onCreateRoom,
  onJoinRoom,
}: LobbyProps) {
  const [name, setName] = useState(initialName || '');
  const [code, setCode] = useState(initialCode || '');

  const handleCreate = (demoUrl?: string) => {
    const finalName = name.trim() || `Guest ${Math.floor(100 + Math.random() * 900)}`;
    onCreateRoom(finalName, demoUrl);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim() || `Guest ${Math.floor(100 + Math.random() * 900)}`;
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.length < 4) return;
    onJoinRoom(finalName, cleanCode);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 bg-radial-gradient">
      {/* Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-sky-600/15 rounded-full blur-[120px]" />
      </div>

      <div className="relative w-full max-w-lg z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-sky-500 text-3xl shadow-xl shadow-indigo-500/25 mb-4 transform hover:scale-105 transition-transform">
            🎬
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
            Watch Together
          </h1>
          <p className="mt-2 text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
            Watch movies, direct video links, and YouTube in perfect sync with your friends. Direct peer-to-peer playback with live chat.
          </p>
        </div>

        {/* Main Box */}
        <div className="space-y-4">
          {/* Card 1: Your Nickname */}
          <div className="bg-[#141622] border border-white/10 rounded-2xl p-5 shadow-xl">
            <label htmlFor="name-input" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Your Display Name
            </label>
            <div className="relative">
              <input
                id="name-input"
                type="text"
                maxLength={20}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex, Sam, Taylor..."
                className="w-full bg-[#1b1e2c] border border-white/10 focus:border-indigo-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all"
              />
            </div>
          </div>

          {/* Card 2: Create a Room */}
          <div className="bg-[#141622] border border-white/10 rounded-2xl p-5 shadow-xl">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Start a New Party</span>
              <span className="text-[11px] font-normal lowercase text-indigo-400">host controls playback</span>
            </h3>

            <button
              onClick={() => handleCreate()}
              disabled={isConnecting}
              className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-500 via-indigo-600 to-sky-500 hover:from-indigo-400 hover:to-sky-400 text-white shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>{isConnecting ? 'Creating Room...' : 'Create Instant Room'}</span>
            </button>

            {/* Quick Demo Previews */}
            <div className="mt-4 pt-3.5 border-t border-white/5">
              <span className="text-[11px] text-slate-400 block mb-2 font-medium">Or quick launch with a sample movie:</span>
              <div className="flex flex-wrap gap-1.5">
                {DEMO_VIDEOS.slice(0, 3).map((demo, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleCreate(demo.url)}
                    disabled={isConnecting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white transition-colors"
                  >
                    <Play className="w-3 h-3 fill-slate-300" />
                    <span>{demo.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Card 3: Join Existing Room */}
          <div className="bg-[#141622] border border-white/10 rounded-2xl p-5 shadow-xl">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Join Friends
            </h3>
            <form onSubmit={handleJoin} className="flex gap-2.5">
              <input
                type="text"
                maxLength={5}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="ROOM CODE"
                className="flex-1 bg-[#1b1e2c] border border-white/10 focus:border-indigo-500 rounded-xl px-4 py-3 text-sm font-mono font-bold text-center tracking-widest text-indigo-300 placeholder-slate-600 uppercase outline-none transition-all"
              />
              <button
                type="submit"
                disabled={isConnecting || code.trim().length < 4}
                className="px-6 py-3 rounded-xl font-bold text-sm bg-white/10 hover:bg-white/20 border border-white/10 text-white shadow-lg active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <LogIn className="w-4 h-4" />
                <span>Join</span>
              </button>
            </form>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs leading-relaxed text-center font-medium animate-in fade-in">
              {errorMessage}
            </div>
          )}

          {/* Feature Highlights */}
          <div className="grid grid-cols-3 gap-2.5 pt-2 text-center text-[11px] text-slate-400">
            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
              <span>Peer-to-Peer</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
              <Zap className="w-4 h-4 text-amber-400 mx-auto mb-1" />
              <span>Sub-Second Sync</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
              <Users2 className="w-4 h-4 text-sky-400 mx-auto mb-1" />
              <span>Interactive Chat</span>
            </div>
          </div>

          <p className="text-[12px] text-slate-500 text-center leading-relaxed px-4 pt-1">
            Playback is synced directly between devices. Everyone loads the movie from the link, so use direct video links (.mp4, .webm, .m3u8) or YouTube.
          </p>
        </div>
      </div>
    </div>
  );
}
