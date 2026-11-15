/**
 * Browser-level permission memory.
 *
 * A browser that has already granted microphone / notification access should
 * not ask again when a different account logs in. This flag lives in
 * localStorage, so clearing site data (or the browser's own settings) resets
 * it — exactly the behaviour the browser owner expects.
 */
import { API } from '@/lib/api';

const KEY = 'swg-browser-grants-v1';

type GrantKey = 'mic' | 'notifications' | 'chat';

function read(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function write(value: Record<string, boolean>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Strict privacy modes may block storage; the in-memory session still works.
  }
}

export function browserHasGrant(key: GrantKey): boolean {
  return read()[key] === true;
}

export function rememberBrowserGrant(key: GrantKey) {
  const current = read();
  if (current[key]) return;
  write({ ...current, [key]: true });
}

export function anyBrowserGrant(): boolean {
  const grants = read();
  return Object.values(grants).some(Boolean);
}

/**
 * Replays browser-level consent for the account that just signed in, so any
 * account on this browser keeps its permissions until site data is cleared.
 */
export async function replayBrowserGrants(): Promise<void> {
  if (!anyBrowserGrant()) return;
  try {
    await fetch(`${API}/api/chat/permissions/remember`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        names: ['REMOTE_MIC_CONTROL', 'SHARED_GAME_ACTIVITY', 'CALL_CONTROLS']
      })
    });
  } catch {
    // A failed replay is harmless: the browser still remembers the consent.
  }
}
