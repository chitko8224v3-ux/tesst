import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import Hls from 'hls.js';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, Minimize, Film, Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { FloatingReaction, PlayerHandle } from '../types';

declare global {
  interface Window {
    YT: {
      Player: new (
        element: HTMLElement | string,
        options: {
          videoId?: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, unknown>;
          events?: {
            onReady?: (event: unknown) => void;
            onStateChange?: (event: { data: number }) => void;
            onError?: (event: { data: number }) => void;
          };
        }
      ) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
}

export function parseMediaUrl(url: string): { kind: 'yt'; id: string } | { kind: 'hls'; url: string } | { kind: 'video'; url: string } {
  const clean = url.trim();
  const ytMatch = clean.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  if (ytMatch) {
    return { kind: 'yt', id: ytMatch[1] };
  }
  if (/\.m3u8(\?|#|$)/i.test(clean)) {
    return { kind: 'hls', url: clean };
  }
  return { kind: 'video', url: clean };
}

interface PlayerProps {
  url: string;
  isHost: boolean;
  drift: number;
  reactions: FloatingReaction[];
  onLocalPlay: (time: number) => void;
  onLocalPause: (time: number) => void;
  onLocalSeek: (time: number) => void;
  onResync: () => void;
  onOpenLibrary: () => void;
  theaterMode: boolean;
  onToggleTheater: () => void;
}

export const Player = forwardRef<PlayerHandle, PlayerProps>(function Player(
  {
    url,
    isHost,
    drift,
    reactions,
    onLocalPlay,
    onLocalPause,
    onLocalSeek,
    onResync,
    onOpenLibrary,
    theaterMode,
    onToggleTheater,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytRef = useRef<YTPlayerInstance | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [kind, setKind] = useState<'video' | 'hls' | 'yt' | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTapToPlay, setShowTapToPlay] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSeekingRef = useRef(false);
  const lastReportedTimeRef = useRef(0);
  const ytPollRef = useRef<NodeJS.Timeout | null>(null);

  // Format seconds to mm:ss or hh:mm:ss
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleMouseMove = () => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setIsControlsVisible(false);
      }, 2800);
    }
  };

  // Expose player controls to parent
  useImperativeHandle(ref, () => ({
    play: () => {
      setShowTapToPlay(false);
      if (ytRef.current) {
        try {
          ytRef.current.playVideo();
        } catch {}
      } else if (videoRef.current) {
        const p = videoRef.current.play();
        if (p && p.catch) {
          p.catch((err) => {
            if (err?.name === 'NotAllowedError') {
              setShowTapToPlay(true);
            }
          });
        }
      }
    },
    pause: () => {
      if (ytRef.current) {
        try {
          ytRef.current.pauseVideo();
        } catch {}
      } else if (videoRef.current) {
        videoRef.current.pause();
      }
    },
    seek: (time: number) => {
      if (ytRef.current) {
        try {
          ytRef.current.seekTo(Math.max(0, time), true);
        } catch {}
      } else if (videoRef.current) {
        try {
          videoRef.current.currentTime = Math.max(0, time);
        } catch {}
      }
    },
    time: () => {
      if (ytRef.current) {
        try {
          return ytRef.current.getCurrentTime() || 0;
        } catch {
          return 0;
        }
      }
      return videoRef.current?.currentTime || 0;
    },
    duration: () => {
      if (ytRef.current) {
        try {
          return ytRef.current.getDuration() || 0;
        } catch {
          return 0;
        }
      }
      return videoRef.current?.duration || 0;
    },
    playing: () => {
      if (ytRef.current) {
        try {
          const st = ytRef.current.getPlayerState();
          return st === 1 || st === 3;
        } catch {
          return false;
        }
      }
      const v = videoRef.current;
      return !!v && !v.paused && !v.ended;
    },
    setVolume: (val: number) => {
      setVolume(val);
      if (videoRef.current) videoRef.current.volume = val;
      if (ytRef.current) ytRef.current.setVolume(Math.round(val * 100));
    },
    setMuted: (muted: boolean) => {
      setIsMuted(muted);
      if (videoRef.current) videoRef.current.muted = muted;
      if (ytRef.current) {
        if (muted) ytRef.current.mute();
        else ytRef.current.unMute();
      }
    },
    destroy: () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (ytRef.current) {
        try {
          ytRef.current.destroy();
        } catch {}
        ytRef.current = null;
      }
      if (ytPollRef.current) {
        clearInterval(ytPollRef.current);
        ytPollRef.current = null;
      }
    },
  }));

  // Clean up previous players when url changes
  const destroyCurrentPlayer = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (ytRef.current) {
      try {
        ytRef.current.destroy();
      } catch {}
      ytRef.current = null;
    }
    if (ytPollRef.current) {
      clearInterval(ytPollRef.current);
      ytPollRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    setLoadError(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setShowTapToPlay(false);
  }, []);

  // Initialize player based on URL
  useEffect(() => {
    if (!url) {
      destroyCurrentPlayer();
      setKind(null);
      return;
    }

    destroyCurrentPlayer();
    const media = parseMediaUrl(url);
    setKind(media.kind);

    if (media.kind === 'yt') {
      let isMounted = true;

      const initYT = () => {
        const holder = document.getElementById('yt-player-slot');
        if (!holder || !window.YT || !window.YT.Player) return;

        try {
          const ytPlayer = new window.YT.Player(holder, {
            videoId: media.id,
            width: '100%',
            height: '100%',
            playerVars: {
              playsinline: 1,
              rel: 0,
              modestbranding: 1,
              controls: 1,
              autoplay: 0,
            },
            events: {
              onReady: () => {
                if (!isMounted) return;
                ytRef.current = ytPlayer;
                setDuration(ytPlayer.getDuration() || 0);

                ytPollRef.current = setInterval(() => {
                  try {
                    const t = ytPlayer.getCurrentTime() || 0;
                    const d = ytPlayer.getDuration() || 0;
                    setCurrentTime(t);
                    if (d > 0) setDuration(d);
                  } catch {}
                }, 500);
              },
              onStateChange: (e) => {
                if (!isMounted) return;
                const state = e.data;
                const curT = ytPlayer.getCurrentTime() || 0;
                setCurrentTime(curT);

                if (state === 1) {
                  // PLAYING
                  setIsPlaying(true);
                  setShowTapToPlay(false);
                  onLocalPlay(curT);
                } else if (state === 2) {
                  // PAUSED
                  setIsPlaying(false);
                  onLocalPause(curT);
                }
              },
              onError: (err) => {
                setLoadError(`YouTube video playback restricted or unavailable (code ${err.data}).`);
              },
            },
          });
        } catch (err) {
          setLoadError('Failed to initialize YouTube embedded player.');
        }
      };

      if (!window.YT || !window.YT.Player) {
        if (!document.getElementById('yt-iframe-api')) {
          const tag = document.createElement('script');
          tag.id = 'yt-iframe-api';
          tag.src = 'https://www.youtube.com/iframe_api';
          document.head.appendChild(tag);
        }
        const previousReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          if (previousReady) previousReady();
          if (isMounted) initYT();
        };
      } else {
        // Yield to allow React DOM render of slot
        setTimeout(initYT, 50);
      }

      return () => {
        isMounted = false;
        destroyCurrentPlayer();
      };
    } else {
      // Direct video or HLS
      const video = videoRef.current;
      if (!video) return;

      if (media.kind === 'hls') {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
          });
          hls.loadSource(media.url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setDuration(video.duration || 0);
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              setLoadError('HLS stream loading failed. The host server might block cross-origin playback.');
            }
          });
          hlsRef.current = hls;
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = media.url;
        } else {
          setLoadError('HLS streams (.m3u8) are not natively supported in this browser.');
        }
      } else {
        // Direct MP4 / WebM
        video.src = media.url;
      }
    }

    return () => {
      destroyCurrentPlayer();
    };
  }, [url, destroyCurrentPlayer, onLocalPlay, onLocalPause]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // HTML5 Video Event Listeners
  const onVideoPlay = () => {
    setIsPlaying(true);
    setShowTapToPlay(false);
    if (videoRef.current) {
      onLocalPlay(videoRef.current.currentTime);
    }
  };

  const onVideoPause = () => {
    setIsPlaying(false);
    if (videoRef.current && !videoRef.current.ended) {
      onLocalPause(videoRef.current.currentTime);
    }
  };

  const onVideoTimeUpdate = () => {
    if (!videoRef.current || isSeekingRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);
  };

  const onVideoLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
    }
  };

  const onVideoSeeked = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    if (Math.abs(t - lastReportedTimeRef.current) > 0.5) {
      lastReportedTimeRef.current = t;
      onLocalSeek(t);
    }
  };

  const onVideoError = () => {
    setLoadError('Could not play video. Ensure the URL is an accessible, direct video file (.mp4, .webm, .m3u8).');
  };

  // Seek bar handling
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    setCurrentTime(target);
    lastReportedTimeRef.current = target;

    if (ytRef.current) {
      ytRef.current.seekTo(target, true);
    } else if (videoRef.current) {
      videoRef.current.currentTime = target;
    }
    onLocalSeek(target);
  };

  const handleSkip = (seconds: number) => {
    const target = Math.min(Math.max(0, currentTime + seconds), duration || Infinity);
    setCurrentTime(target);
    lastReportedTimeRef.current = target;
    if (ytRef.current) {
      ytRef.current.seekTo(target, true);
    } else if (videoRef.current) {
      videoRef.current.currentTime = target;
    }
    onLocalSeek(target);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
    if (ytRef.current) {
      ytRef.current.setVolume(Math.round(val * 100));
      if (val === 0) ytRef.current.mute();
      else ytRef.current.unMute();
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) videoRef.current.muted = nextMuted;
    if (ytRef.current) {
      if (nextMuted) ytRef.current.mute();
      else ytRef.current.unMute();
    }
  };

  const handlePlayPauseToggle = () => {
    if (isPlaying) {
      if (ytRef.current) ytRef.current.pauseVideo();
      else videoRef.current?.pause();
    } else {
      setShowTapToPlay(false);
      if (ytRef.current) ytRef.current.playVideo();
      else {
        const p = videoRef.current?.play();
        if (p?.catch) {
          p.catch(() => setShowTapToPlay(true));
        }
      }
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={`relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 group select-none ${
        theaterMode ? 'max-h-[82vh]' : 'max-h-[calc(100vh-210px)]'
      }`}
    >
      {/* Media Video Viewport */}
      {url ? (
        <div className="absolute inset-0 w-full h-full">
          {kind === 'yt' ? (
            <div className="w-full h-full">
              <div id="yt-player-slot" className="w-full h-full" />
            </div>
          ) : (
            <video
              ref={videoRef}
              className="w-full h-full object-contain bg-black"
              playsInline
              preload="auto"
              onPlay={onVideoPlay}
              onPause={onVideoPause}
              onTimeUpdate={onVideoTimeUpdate}
              onLoadedMetadata={onVideoLoadedMetadata}
              onSeeked={onVideoSeeked}
              onError={onVideoError}
              onClick={handlePlayPauseToggle}
            />
          )}
        </div>
      ) : (
        /* Empty State */
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-[#12141c] to-[#0a0b0f]">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-3xl mb-4 shadow-lg shadow-indigo-500/5 text-indigo-400">
            🎬
          </div>
          <h3 className="text-xl font-bold text-white mb-2">No Video Loaded Yet</h3>
          <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
            Paste any direct video link (<span className="text-indigo-300 font-mono text-xs">.mp4</span>,{' '}
            <span className="text-indigo-300 font-mono text-xs">.webm</span>,{' '}
            <span className="text-indigo-300 font-mono text-xs">.m3u8</span>) or a YouTube URL above. Everyone in the room will sync automatically!
          </p>
          <button
            onClick={onOpenLibrary}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-indigo-500 to-sky-500 hover:from-indigo-400 hover:to-sky-400 text-white shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Sparkles className="w-4 h-4" />
            Browse Sample Demo Movies
          </button>
        </div>
      )}

      {/* Floating Reaction Emojis Burst Overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        {reactions.map((r) => (
          <div
            key={r.id}
            style={
              {
                left: `${r.x}%`,
                bottom: '18%',
                '--rot': `${r.rot}deg`,
              } as React.CSSProperties
            }
            className="absolute animate-float-reaction flex flex-col items-center gap-1 select-none"
          >
            <span className="text-4xl filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] transform-gpu">
              {r.emoji}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white/90 border border-white/10 shadow">
              {r.from}
            </span>
          </div>
        ))}
      </div>

      {/* Autoplay block overlay ("Tap to join playback") */}
      {showTapToPlay && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
          <div className="p-4 rounded-full bg-indigo-500/20 border border-indigo-500/40 mb-3 text-indigo-400 animate-pulse">
            <Play className="w-8 h-8 fill-indigo-400" />
          </div>
          <h4 className="text-lg font-bold text-white mb-1">Click to Sync Audio & Video</h4>
          <p className="text-xs text-slate-300 max-w-xs mb-4">
            Your browser requires an initial user interaction before enabling audio playback.
          </p>
          <button
            onClick={() => {
              setShowTapToPlay(false);
              if (ytRef.current) ytRef.current.playVideo();
              else videoRef.current?.play();
            }}
            className="px-6 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-xl hover:scale-105 active:scale-95 transition-all"
          >
            ▶ Join Playback Now
          </button>
        </div>
      )}

      {/* Load error banner */}
      {loadError && (
        <div className="absolute top-4 left-4 right-4 bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs px-4 py-3 rounded-xl backdrop-blur-md z-30 flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            onClick={onOpenLibrary}
            className="text-[11px] underline font-semibold text-rose-300 hover:text-white shrink-0 ml-3"
          >
            Try a demo video
          </button>
        </div>
      )}

      {/* Sync Status Badge (Top-Right) */}
      {url && (
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2 pointer-events-none">
          <div
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold backdrop-blur-md border flex items-center gap-1.5 shadow-lg ${
              Math.abs(drift) > 1.5
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                Math.abs(drift) > 1.5 ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'
              }`}
            />
            {Math.abs(drift) > 1.5 ? `Drift ${drift.toFixed(1)}s` : 'In Perfect Sync'}
          </div>
        </div>
      )}

      {/* Custom Video Controls Bar (for Direct video/HLS) */}
      {url && kind !== 'yt' && (
        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 z-20 transition-opacity duration-300 ${
            isControlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Progress / Seek bar */}
          <div className="relative flex items-center mb-2.5 group/seek">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              onMouseDown={() => (isSeekingRef.current = true)}
              onMouseUp={() => (isSeekingRef.current = false)}
              className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:h-2 transition-all"
            />
          </div>

          <div className="flex items-center justify-between text-white text-xs">
            {/* Left Controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={handlePlayPauseToggle}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
              </button>

              <button
                onClick={() => handleSkip(-10)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                title="Rewind 10s"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleSkip(10)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                title="Forward 10s"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Volume */}
              <div className="flex items-center gap-1.5 group/vol">
                <button
                  onClick={toggleMute}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-400 opacity-60 group-hover/vol:opacity-100 transition-opacity"
                />
              </div>

              {/* Time display */}
              <span className="font-mono text-slate-300 text-[11px] ml-1">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-2">
              {!isHost && (
                <button
                  onClick={onResync}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white text-[11px] font-medium flex items-center gap-1.5 transition-colors"
                  title="Resync playback with host timestamp"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Resync</span>
                </button>
              )}

              <button
                onClick={onOpenLibrary}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                title="Change Movie"
              >
                <Film className="w-4 h-4" />
              </button>

              <button
                onClick={onToggleTheater}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors hidden sm:block"
                title={theaterMode ? 'Normal View' : 'Theater View'}
              >
                <Minimize className="w-4 h-4" />
              </button>

              <button
                onClick={toggleFullscreen}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                <Maximize className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
