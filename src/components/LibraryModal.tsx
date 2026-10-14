import React, { useState } from 'react';
import { X, Film, Play, Sparkles, Youtube, Radio, Link as LinkIcon, Check } from 'lucide-react';
import { DEMO_VIDEOS } from '../data/demoMedia';
import { DemoVideo } from '../types';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVideo: (url: string, title?: string) => void;
  currentUrl: string;
}

export function LibraryModal({ isOpen, onClose, onSelectVideo, currentUrl }: LibraryModalProps) {
  const [filter, setFilter] = useState<'all' | 'video' | 'hls' | 'youtube'>('all');
  const [customUrl, setCustomUrl] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredVideos = DEMO_VIDEOS.filter((v) => {
    if (filter === 'all') return true;
    return v.type === filter;
  });

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    });
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim()) return;
    onSelectVideo(customUrl.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-[#141622] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#191c2b]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-xl">
              🍿
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Movie & Stream Library
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Ready to Sync
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Choose any pre-tested movie or paste your own custom direct video link.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Custom URL Quick Paste */}
        <div className="p-4 bg-[#11131c] border-b border-white/5">
          <form onSubmit={handleCustomSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="Paste custom link (.mp4 / .webm / .m3u8 / YouTube)..."
                className="w-full bg-[#181a26] border border-white/10 focus:border-indigo-500 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 outline-none transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={!customUrl.trim()}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Load URL
            </button>
          </form>
        </div>

        {/* Categories Tab Bar */}
        <div className="px-5 pt-3 pb-2 flex items-center gap-2 border-b border-white/5 overflow-x-auto text-xs shrink-0">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === 'all' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            All Sources
          </button>
          <button
            onClick={() => setFilter('video')}
            className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
              filter === 'video' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Film className="w-3.5 h-3.5" /> Direct MP4 Films
          </button>
          <button
            onClick={() => setFilter('hls')}
            className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
              filter === 'hls' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Radio className="w-3.5 h-3.5" /> HLS Streams (.m3u8)
          </button>
          <button
            onClick={() => setFilter('youtube')}
            className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
              filter === 'youtube' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Youtube className="w-3.5 h-3.5" /> YouTube
          </button>
        </div>

        {/* Video Cards Grid */}
        <div className="p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredVideos.map((video, idx) => {
            const isCurrent = currentUrl === video.url;
            return (
              <div
                key={idx}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between group ${
                  isCurrent
                    ? 'bg-indigo-950/30 border-indigo-500/50 shadow-lg shadow-indigo-500/5'
                    : 'bg-[#181a27] border-white/10 hover:border-indigo-500/30 hover:bg-[#1d2030]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-slate-300">
                      {video.badge}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 font-semibold">{video.duration}</span>
                  </div>
                  <h4 className="font-bold text-sm text-white group-hover:text-indigo-300 transition-colors">
                    {video.title}
                  </h4>
                  <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                    {video.description}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-white/5">
                  <button
                    onClick={() => handleCopy(video.url)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-xs flex items-center gap-1"
                    title="Copy direct video URL"
                  >
                    {copiedUrl === video.url ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[11px] text-emerald-400 font-semibold">Copied</span>
                      </>
                    ) : (
                      <>
                        <LinkIcon className="w-3.5 h-3.5" />
                        <span className="text-[11px]">Copy Link</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      onSelectVideo(video.url, video.title);
                      onClose();
                    }}
                    disabled={isCurrent}
                    className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-all ${
                      isCurrent
                        ? 'bg-emerald-500/20 text-emerald-300 cursor-default'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow hover:scale-[1.02] active:scale-[0.98]'
                    }`}
                  >
                    {isCurrent ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Currently Playing
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-white" /> Load for Room
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
