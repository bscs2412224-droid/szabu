import { API_BASE } from './config';
import { clearSession, savedToken } from './session';

export interface ApiError {
  message: string;
  status: number;
  code?: string;
}

/** Fired when the server says the login has ended. The app shows the login screen. */
export const SESSION_EXPIRED_EVENT = 'szabu:session-expired';

export function authHeaders(): Record<string, string> {
  const token = savedToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Forget this device's login and send the user back to the login screen with a short explanation. */
export function expireSession(message = 'Your session ended. Please log in again.'): void {
  clearSession();
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: message }));
}

/**
 * Call the API as the signed-in user. If the server answers 401 the login is no longer valid
 * (expired after 30 minutes of inactivity, logged out elsewhere, password changed): everything is cleared and the
 * app returns to the login screen instead of every screen showing its own error.
 */
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const hadLogin = !!savedToken();
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...authHeaders(), ...(init.headers as object) } });
  if (res.status === 401 && hadLogin) {
    const body = await res.clone().json().catch(() => ({}));
    expireSession(typeof body.message === 'string' && body.message ? body.message : undefined);
  }
  return res;
}
