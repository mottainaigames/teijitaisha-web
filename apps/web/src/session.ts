export const SESSION_KEY = "teijitaisha_session";

export interface StoredSession {
  code: string;
  playerId: string;
  sessionToken: string;
  playerName: string;
}

export function loadSession(): StoredSession | null {
  try {
    // 旧版の localStorage はタブ間共有のため使わない
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.code || !parsed.playerId || !parsed.sessionToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
