import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import confetti from 'canvas-confetti';
import {
  Film,
  Copy,
  Check,
  LogOut,
  Sparkles,
  RefreshCw,
  Share2,
  Users,
  Radio,
  ExternalLink,
  Crown,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Player } from './components/Player';
import { Sidebar } from './components/Sidebar';
import { Lobby } from './components/Lobby';
import { LibraryModal } from './components/LibraryModal';
import { InviteModal } from './components/InviteModal';
import {
  PeerUser,
  SyncMessage,
  ChatMessageItem,
  FloatingReaction,
  PlayerHandle,
} from './types';
import {
  playJoinSound,
  playMessageSound,
  playReactionSound,
  isSoundEnabled,
  setSoundEnabled,
} from './utils/sound';

const PREFIX = 'wtgr-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export default function App() {
  // Navigation / View State
  const [inRoom, setInRoom] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [myName, setMyName] = useState(() => {
    try {
      return localStorage.getItem('wt-name') || '';
    } catch {
      return '';
    }
  });

  // Media State
  const [currentUrl, setCurrentUrl] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [theaterMode, setTheaterMode] = useState(false);
  const [drift, setDrift] = useState(0);

  // Networking & Chat
  const [peers, setPeers] = useState<PeerUser[]>([]);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [toasts, setToasts] = useState<{ id: string; msg: string; kind?: 'info' | 'err' | 'success' }[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  // Modals
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // References
  const peerRef = useRef<Peer | null>(null);
  const hostConnRef = useRef<DataConnection | null>(null);
  const connsRef = useRef<Map<string, DataConnection>>(new Map());
  const namesRef = useRef<Map<string, string>>(new Map());
  const playerRef = useRef<PlayerHandle | null>(null);
  const tickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  // Shared desired playback truth: { playing: boolean, time: number, at: number }
  const desiredRef = useRef({ playing: false, time: 0, at: Date.now() });

  const getDesiredTime = () => {
    const { playing, time, at } = desiredRef.current;
    return playing ? time + (Date.now() - at) / 1000 : time;
  };

  const setDesired = (playing: boolean, time: number) => {
    desiredRef.current = { playing, time, at: Date.now() };
  };

  const showToast = useCallback((msg: string, kind: 'info' | 'err' | 'success' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, msg, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const enqueue = useCallback((task: () => Promise<void> | void) => {
    chainRef.current = chainRef.current.then(async () => {
      try {
        await task();
      } catch (err) {
        console.warn('Sync queue error:', err);
      }
    });
  }, []);

  // Send message to host or broadcast if host
  const send = useCallback((msg: SyncMessage) => {
    if (hostConnRef.current && hostConnRef.current.open) {
      hostConnRef.current.send(msg);
    } else if (connsRef.current.size > 0) {
      for (const [, c] of connsRef.current) {
        if (c.open) c.send(msg);
      }
    }
  }, []);

  const broadcast = useCallback((msg: SyncMessage, exceptId?: string) => {
    for (const [id, c] of connsRef.current) {
      if (id !== exceptId && c.open) {
        c.send(msg);
      }
    }
  }, []);

  const teardownPeer = useCallback(() => {
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch {}
      peerRef.current = null;
    }
    hostConnRef.current = null;
    connsRef.current.clear();
    namesRef.current.clear();
  }, []);

  // Apply state received from remote peer
  const applyState = useCallback((s: { playing: boolean; time: number }, seekThreshold = 1.0) => {
    setDesired(s.playing, s.time);
    const p = playerRef.current;
    if (!p) return;

    const cur = p.time();
    const driftAmt = Math.abs(cur - s.time);
    setDrift(driftAmt);

    if (driftAmt > seekThreshold) {
      p.seek(s.time);
    }

    if (s.playing) {
      p.play();
    } else {
      p.pause();
    }
  }, []);

  // Add system message
  const addSystemMessage = useCallback((text: string) => {
    const item: ChatMessageItem = {
      id: Math.random().toString(36).substring(2, 9),
      from: 'System',
      text,
      mine: false,
      timestamp: Date.now(),
      isSystem: true,
    };
    setMessages((prev) => [...prev, item]);
  }, []);

  // Trigger floating reaction burst
  const triggerReaction = useCallback((emoji: string, from: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    const x = Math.random() * 68 + 16; // 16% - 84%
    const rot = (Math.random() - 0.5) * 36;
    setReactions((prev) => [...prev, { id, emoji, from, x, rot }]);

    if (emoji === '🎉' || emoji === '🍿') {
      try {
        confetti({
          particleCount: 25,
          spread: 55,
          origin: { y: 0.75 },
          colors: ['#6366f1', '#38bdf8', '#f59e0b', '#ec4899'],
        });
      } catch {}
    }

    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2400);
  }, []);

  // Remote message dispatcher
  const handleRemoteMessage = useCallback(
    (m: SyncMessage) => {
      if (!m || typeof m !== 'object') return;

      switch (m.t) {
        case 'chat': {
          playMessageSound();
          const item: ChatMessageItem = {
            id: m.id || Math.random().toString(36).substring(2, 9),
            from: m.from || 'Guest',
            text: m.text,
            mine: false,
            timestamp: m.timestamp || Date.now(),
            videoTime: m.time,
          };
          setMessages((prev) => [...prev, item]);
          break;
        }

        case 'reaction': {
          playReactionSound();
          triggerReaction(m.emoji, m.from || 'Guest');
          break;
        }

        case 'sys': {
          addSystemMessage(m.text);
          break;
        }

        case 'peers': {
          setPeers(m.list || []);
          break;
        }

        case 'load': {
          addSystemMessage(`${m.from || 'Someone'} loaded a new video: ${m.title || 'Video'}`);
          enqueue(async () => {
            setCurrentUrl(m.url);
            setUrlInput(m.url);
            setDesired(false, 0);
          });
          break;
        }

        case 'state': {
          enqueue(async () => {
            if (m.url && m.url !== currentUrl) {
              setCurrentUrl(m.url);
              setUrlInput(m.url);
            }
            applyState({ playing: m.playing, time: m.time }, 0);
          });
          break;
        }

        case 'play': {
          enqueue(() => applyState({ playing: true, time: m.time }, 0.8));
          break;
        }

        case 'pause': {
          enqueue(() => applyState({ playing: false, time: m.time }, 0.8));
          break;
        }

        case 'seek': {
          enqueue(() => applyState({ playing: desiredRef.current.playing, time: m.time }, 0));
          break;
        }

        case 'tick': {
          enqueue(() => {
            const p = playerRef.current;
            if (!p || isHost) return;
            const curT = p.time();
            const driftDelta = Math.abs(curT - m.time);
            setDrift(driftDelta);

            if (driftDelta > 2.5 || m.playing !== desiredRef.current.playing || (m.playing && !p.playing())) {
              applyState(m, driftDelta > 2 ? 1.5 : 99);
            }
          });
          break;
        }
      }
    },
    [addSystemMessage, applyState, currentUrl, enqueue, isHost, triggerReaction]
  );

  // Host: accept guest connection
  const hostAccept = useCallback(
    (c: DataConnection) => {
      c.on('open', () => {
        connsRef.current.set(c.peer, c);
      });

      c.on('data', (data) => {
        const m = data as SyncMessage;
        if (!m || typeof m !== 'object') return;

        if (m.t === 'hello') {
          playJoinSound();
          const guestName = String(m.name || 'Guest').slice(0, 20);
          namesRef.current.set(c.peer, guestName);

          // Reply with current playback state
          const curTime = playerRef.current ? getDesiredTime() : 0;
          c.send({
            t: 'state',
            url: currentUrl,
            time: curTime,
            playing: desiredRef.current.playing,
          });

          // Announce to everyone
          const joinText = `${guestName} joined the room`;
          addSystemMessage(joinText);
          broadcast({ t: 'sys', text: joinText });

          // Broadcast updated peer list
          const list: PeerUser[] = [
            { name: myName, host: true },
            ...Array.from(connsRef.current.keys()).map((id) => ({
              id,
              name: namesRef.current.get(id) || 'Guest',
              host: false,
            })),
          ];
          setPeers(list);
          broadcast({ t: 'peers', list });
          return;
        }

        if (m.t === 'sync') {
          const curTime = playerRef.current ? getDesiredTime() : 0;
          c.send({
            t: 'state',
            url: currentUrl,
            time: curTime,
            playing: desiredRef.current.playing,
          });
          return;
        }

        // Apply locally and forward to all other peers
        handleRemoteMessage(m);
        broadcast(m, c.peer);
      });

      c.on('close', () => {
        const leftName = namesRef.current.get(c.peer) || 'A participant';
        connsRef.current.delete(c.peer);
        namesRef.current.delete(c.peer);

        const leftText = `${leftName} left the room`;
        addSystemMessage(leftText);
        broadcast({ t: 'sys', text: leftText });

        const list: PeerUser[] = [
          { name: myName, host: true },
          ...Array.from(connsRef.current.keys()).map((id) => ({
            id,
            name: namesRef.current.get(id) || 'Guest',
            host: false,
          })),
        ];
        setPeers(list);
        broadcast({ t: 'peers', list });
      });

      c.on('error', (err) => {
        console.warn('Connection error with peer:', err);
      });
    },
    [addSystemMessage, broadcast, currentUrl, handleRemoteMessage, myName]
  );

  // Host: Create a Room
  const handleCreateRoom = useCallback(
    (userName: string, initialMediaUrl?: string) => {
      setLobbyError(null);
      setIsConnecting(true);
      setMyName(userName);
      try {
        localStorage.setItem('wt-name', userName);
      } catch {}

      const code = generateRoomCode();
      const peerId = PREFIX + code;
      const peer = new Peer(peerId);
      peerRef.current = peer;

      peer.on('open', () => {
        setIsConnecting(false);
        setIsHost(true);
        setRoomCode(code);
        setInRoom(true);
        setPeers([{ name: userName, host: true }]);
        addSystemMessage(`Room created! Share room code ${code} with friends.`);
        showToast(`Room ${code} created!`, 'success');

        if (initialMediaUrl) {
          setCurrentUrl(initialMediaUrl);
          setUrlInput(initialMediaUrl);
        }

        try {
          window.history.replaceState(null, '', '#' + code);
        } catch {}

        // Periodic host sync heartbeat tick
        tickTimerRef.current = setInterval(() => {
          if (connsRef.current.size > 0) {
            const t = playerRef.current ? playerRef.current.time() : 0;
            broadcast({
              t: 'tick',
              time: t,
              playing: desiredRef.current.playing,
            });
          }
        }, 4000);
      });

      peer.on('connection', hostAccept);

      peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          // Collision on random room code; retry with new code
          teardownPeer();
          handleCreateRoom(userName, initialMediaUrl);
          return;
        }
        setIsConnecting(false);
        teardownPeer();
        setLobbyError(`Could not create room (${err.type}). Please check your internet connection.`);
      });
    },
    [addSystemMessage, broadcast, hostAccept, showToast, teardownPeer]
  );

  // Guest: Join a Room
  const handleJoinRoom = useCallback(
    (userName: string, code: string) => {
      setLobbyError(null);
      setIsConnecting(true);
      setMyName(userName);
      try {
        localStorage.setItem('wt-name', userName);
      } catch {}

      const cleanCode = code.trim().toUpperCase();
      const peer = new Peer();
      peerRef.current = peer;

      peer.on('open', () => {
        const conn = peer.connect(PREFIX + cleanCode, { reliable: true });
        hostConnRef.current = conn;

        const timeoutId = setTimeout(() => {
          if (!conn.open) {
            setIsConnecting(false);
            teardownPeer();
            setLobbyError('Could not reach room. Verify the 5-character code or ensure host is online.');
          }
        }, 12000);

        conn.on('open', () => {
          clearTimeout(timeoutId);
          setIsConnecting(false);
          setIsHost(false);
          setRoomCode(cleanCode);
          setInRoom(true);
          addSystemMessage(`Joined room ${cleanCode}`);
          showToast(`Joined room ${cleanCode}!`, 'success');

          conn.send({ t: 'hello', name: userName });

          try {
            window.history.replaceState(null, '', '#' + cleanCode);
          } catch {}
        });

        conn.on('data', (data) => {
          handleRemoteMessage(data as SyncMessage);
        });

        conn.on('close', () => {
          showToast('The host closed the room or disconnected.', 'err');
          handleLeaveRoom();
        });

        conn.on('error', (err) => {
          console.warn('Host connection error:', err);
        });
      });

      peer.on('error', (err) => {
        setIsConnecting(false);
        teardownPeer();
        if (err.type === 'peer-unavailable') {
          setLobbyError(`Room "${cleanCode}" not found. Please double check the code.`);
        } else {
          setLobbyError(`Failed to connect (${err.type}).`);
        }
      });
    },
    [addSystemMessage, handleRemoteMessage, showToast, teardownPeer]
  );

  const handleLeaveRoom = () => {
    teardownPeer();
    setInRoom(false);
    setIsHost(false);
    setRoomCode('');
    setCurrentUrl('');
    setUrlInput('');
    setPeers([]);
    setMessages([]);
    setReactions([]);
    setLobbyError(null);
    setDesired(false, 0);

    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch {}
  };

  // Local Play Event
  const handleLocalPlay = useCallback(
    (time: number) => {
      if (desiredRef.current.playing) return;
      setDesired(true, time);
      send({ t: 'play', time });
    },
    [send]
  );

  // Local Pause Event
  const handleLocalPause = useCallback(
    (time: number) => {
      if (!desiredRef.current.playing) return;
      setDesired(false, time);
      send({ t: 'pause', time });
    },
    [send]
  );

  // Local Seek Event
  const handleLocalSeek = useCallback(
    (time: number) => {
      if (Math.abs(time - getDesiredTime()) < 1.2) return;
      setDesired(desiredRef.current.playing, time);
      send({ t: 'seek', time });
    },
    [send]
  );

  // Load new video URL for the room
  const handleLoadUrl = useCallback(
    (url: string, title?: string) => {
      const clean = url.trim();
      if (!clean) return;
      if (!/^https?:\/\//i.test(clean)) {
        showToast('Please enter a valid URL starting with http:// or https://', 'err');
        return;
      }

      addSystemMessage(`You loaded: ${title || clean}`);
      enqueue(() => {
        setCurrentUrl(clean);
        setUrlInput(clean);
        setDesired(false, 0);
      });

      send({ t: 'load', url: clean, title, from: myName });
      showToast('Video loaded for everyone in the room!', 'success');
    },
    [addSystemMessage, enqueue, myName, send, showToast]
  );

  // Send Chat message
  const handleSendMessage = useCallback(
    (text: string, time?: number) => {
      const id = Math.random().toString(36).substring(2, 9);
      const timestamp = Date.now();
      const msgItem: ChatMessageItem = {
        id,
        from: myName,
        text,
        mine: true,
        timestamp,
        videoTime: time,
      };
      setMessages((prev) => [...prev, msgItem]);
      send({ t: 'chat', id, from: myName, text, time, timestamp });
    },
    [myName, send]
  );

  // Send emoji reaction
  const handleSendReaction = useCallback(
    (emoji: string) => {
      const id = Math.random().toString(36).substring(2, 9);
      triggerReaction(emoji, myName);
      send({ t: 'reaction', id, from: myName, emoji });
    },
    [myName, send, triggerReaction]
  );

  // Request resync
  const handleResync = useCallback(() => {
    send({ t: 'sync' });
    showToast('Syncing with host playback...', 'info');
  }, [send, showToast]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopiedCode(true);
      showToast(`Copied room code: ${roomCode}`, 'success');
      setTimeout(() => setCopiedCode(false), 2200);
    });
  };

  // Check URL hash for direct invite link on first mount (e.g. #ABCDE)
  useEffect(() => {
    const hash = window.location.hash.replace(/^#(room=)?/, '').trim().toUpperCase();
    if (hash && hash.length >= 4) {
      // Auto populate code
      setRoomCode(hash.slice(0, 5));
    }
  }, []);

  // Update current video time for chat timestamping
  useEffect(() => {
    const timer = setInterval(() => {
      if (playerRef.current) {
        try {
          setCurrentVideoTime(playerRef.current.time());
        } catch {}
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Before unload cleanup
  useEffect(() => {
    const handleBeforeUnload = () => {
      teardownPeer();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      teardownPeer();
    };
  }, [teardownPeer]);

  if (!inRoom) {
    return (
      <Lobby
        initialCode={roomCode}
        initialName={myName}
        isConnecting={isConnecting}
        errorMessage={lobbyError}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0b0c12] text-[#eceef5] overflow-hidden select-none">
      {/* Top Navbar */}
      <header className="h-14 border-b border-white/10 bg-[#12141d]/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-30">
        {/* Left: Brand & Room code */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center text-lg shadow-md shadow-indigo-500/20">
              🎬
            </div>
            <span className="font-extrabold text-sm text-white tracking-tight hidden sm:inline">
              Watch Together
            </span>
          </div>

          {/* Room Code Chip */}
          <div className="flex items-center gap-1.5 pl-2 sm:border-l sm:border-white/10">
            <button
              onClick={handleCopyCode}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1b1e2c] border border-white/10 hover:border-indigo-500/50 text-xs font-mono font-bold text-sky-300 transition-colors group"
              title="Click to copy room code"
            >
              <span className="text-[10px] text-slate-400 font-sans uppercase">Room</span>
              <span className="tracking-widest text-indigo-300 font-extrabold">{roomCode}</span>
              {copiedCode ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-white" />
              )}
            </button>

            <button
              onClick={() => setIsInviteOpen(true)}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors"
              title="Invite Friends"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center: Stream URL Input Bar */}
        <div className="hidden md:flex items-center gap-2 flex-1 max-w-xl mx-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLoadUrl(urlInput);
            }}
            className="flex-1 flex gap-2"
          >
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste movie link (.mp4 / .webm / .m3u8 / YouTube)…"
              className="w-full bg-[#181a26] border border-white/10 focus:border-indigo-500 rounded-xl px-3.5 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition-all"
            />
            <button
              type="submit"
              disabled={!urlInput.trim()}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-500 to-sky-500 hover:brightness-110 text-white shadow disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap"
            >
              Load
            </button>
          </form>

          <button
            onClick={() => setIsLibraryOpen(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-indigo-300 hover:text-white flex items-center gap-1.5 transition-colors whitespace-nowrap"
            title="Browse sample movies & streams"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Samples</span>
          </button>
        </div>

        {/* Right: Status & Actions */}
        <div className="flex items-center gap-2.5">
          {/* Member count pill */}
          <div className="px-2.5 py-1 rounded-full bg-[#181a26] border border-white/10 text-slate-300 text-xs font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{peers.length}</span>
            <span className="hidden sm:inline">watching</span>
          </div>

          {!isHost && (
            <button
              onClick={handleResync}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors"
              title="Resync with Host"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={handleLeaveRoom}
            className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Leave this watch room"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      {/* Mobile Stream URL Input Bar */}
      <div className="md:hidden p-2.5 bg-[#141621] border-b border-white/10 flex items-center gap-2 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLoadUrl(urlInput);
          }}
          className="flex-1 flex gap-2"
        >
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste video (.mp4 / .m3u8 / YouTube)..."
            className="w-full bg-[#1b1e2c] border border-white/10 focus:border-indigo-500 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white shadow"
          >
            Load
          </button>
        </form>
        <button
          onClick={() => setIsLibraryOpen(true)}
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-indigo-300"
          title="Sample Movies"
        >
          <Sparkles className="w-4 h-4" />
        </button>
      </div>

      {/* Main Grid Viewport */}
      <main className="flex-1 p-3 md:p-4 overflow-hidden min-h-0">
        <div
          className={`h-full grid gap-4 transition-all duration-300 ${
            theaterMode
              ? 'grid-cols-1'
              : 'grid-cols-1 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]'
          }`}
        >
          {/* Left Column: Player Stage */}
          <div className="flex flex-col gap-3 min-w-0 min-h-0 overflow-y-auto">
            <Player
              ref={playerRef}
              url={currentUrl}
              isHost={isHost}
              drift={drift}
              reactions={reactions}
              onLocalPlay={handleLocalPlay}
              onLocalPause={handleLocalPause}
              onLocalSeek={handleLocalSeek}
              onResync={handleResync}
              onOpenLibrary={() => setIsLibraryOpen(true)}
              theaterMode={theaterMode}
              onToggleTheater={() => setTheaterMode(!theaterMode)}
            />

            {/* Movie Info & Quick Actions Bar */}
            <div className="p-3.5 bg-[#141622] border border-white/10 rounded-2xl flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 shrink-0">
                  <Film className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-white truncate">
                    {currentUrl ? currentUrl.split('/').pop()?.split('?')[0] || 'Synced Stream' : 'Ready for video'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {isHost
                      ? 'You are the Host. Your play, pause and seek actions sync to everyone.'
                      : 'You are synced with the Host. Play/pause or seek and everyone follows.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsLibraryOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Choose Movie</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Chat & Room Sidebar */}
          {!theaterMode && (
            <div className="h-full min-h-0">
              <Sidebar
                peers={peers}
                messages={messages}
                currentVideoTime={currentVideoTime}
                onSendMessage={handleSendMessage}
                onSendReaction={handleSendReaction}
                onSeekTo={(t) => {
                  playerRef.current?.seek(t);
                  handleLocalSeek(t);
                }}
              />
            </div>
          )}
        </div>
      </main>

      {/* Floating Toast Alerts */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 max-w-md w-[92vw] pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl backdrop-blur-md border animate-in slide-in-from-bottom-2 duration-200 ${
              t.kind === 'err'
                ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
                : t.kind === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                : 'bg-[#1e2230]/95 border-white/10 text-white'
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>

      {/* Modals */}
      <LibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onSelectVideo={handleLoadUrl}
        currentUrl={currentUrl}
      />

      <InviteModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        roomCode={roomCode}
      />
    </div>
  );
}
