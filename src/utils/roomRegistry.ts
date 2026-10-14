import { ActiveRoomInfo } from '../types';

const RECENT_KEY = 'wt-recent-rooms';

export interface RecentRoom {
  code: string;
  name?: string;
  movieTitle?: string;
  visitedAt: number;
}

// BroadcastChannel for instant inter-tab awareness
let channel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel('wt_active_rooms');
  }
} catch {}

export async function fetchActiveRooms(): Promise<ActiveRoomInfo[]> {
  try {
    const res = await fetch('/api/rooms', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data.rooms) ? data.rooms : [];
    }
  } catch (err) {
    console.debug('Failed to fetch rooms from API, fallback to local discovery:', err);
  }

  // Fallback: Return recently active rooms from localStorage
  return getRecentRooms().map((r) => ({
    code: r.code,
    hostName: r.name || 'Party',
    movieTitle: r.movieTitle || 'Movie Watch Room',
    viewerCount: 1,
    lastSeen: r.visitedAt,
    createdAt: r.visitedAt,
  }));
}

export async function registerActiveRoom(room: {
  code: string;
  hostName: string;
  movieTitle: string;
  viewerCount: number;
}): Promise<void> {
  // Broadcast to other tabs immediately
  if (channel) {
    try {
      channel.postMessage({ type: 'room_active', room });
    } catch {}
  }

  // Save to recent rooms
  addRecentRoom({
    code: room.code,
    name: room.hostName,
    movieTitle: room.movieTitle,
    visitedAt: Date.now(),
  });

  // Post to server
  try {
    await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(room),
    });
  } catch (err) {
    console.debug('Failed to register room to server:', err);
  }
}

export async function removeActiveRoom(code: string): Promise<void> {
  if (channel) {
    try {
      channel.postMessage({ type: 'room_closed', code });
    } catch {}
  }

  try {
    await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    });
  } catch {}
}

export function subscribeToRoomBroadcasts(onUpdate: () => void): () => void {
  if (!channel) return () => {};
  const handler = () => {
    onUpdate();
  };
  channel.addEventListener('message', handler);
  return () => {
    channel?.removeEventListener('message', handler);
  };
}

// Local storage recent rooms
export function getRecentRooms(): RecentRoom[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function addRecentRoom(room: RecentRoom): void {
  try {
    const list = getRecentRooms().filter((r) => r.code !== room.code);
    list.unshift(room);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {}
}

export function clearRecentRooms(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {}
}
