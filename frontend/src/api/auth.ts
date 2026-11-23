import { disconnectSocket } from '../lib/socket';
import { dropPushOnLogout } from '../lib/push';
import { API_BASE } from '../lib/config';
import { authedFetch, authHeaders } from '../lib/http';
import { clearSession } from '../lib/session';
import { clearOfflineData } from '../lib/offline';

export interface User {
  id: string;
  szabistId: string;
  email: string;
  fullName: string;
  role: string;
  userType: 'STUDENT' | 'FACULTY';
  isPlacedInHierarchy: boolean;
  messagingBlocked?: boolean;
}

/** Calls that need no login (sign-up, login, password reset). A server error body is thrown as is. */
async function publicPost(path: string, body: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data;
  return data;
}

export const signupRequestCode = (email: string) => publicPost('/auth/signup/request-code', { email });
export const signupVerifyCode = (email: string, code: string) => publicPost('/auth/signup/verify-code', { email, code });
export const signupComplete = (signupToken: string, password: string, confirmPassword: string) =>
  publicPost('/auth/signup/complete', { signupToken, password, confirmPassword });
export const login = (email: string, password: string) => publicPost('/auth/login', { email, password });
export const forgotPasswordRequestCode = (email: string) => publicPost('/auth/forgot-password/request-code', { email });
export const forgotPasswordVerifyCode = (email: string, code: string) =>
  publicPost('/auth/forgot-password/verify-code', { email, code });
export const forgotPasswordReset = (resetToken: string, newPassword: string, confirmPassword: string) =>
  publicPost('/auth/forgot-password/reset', { resetToken, newPassword, confirmPassword });

export async function logout() {
  await dropPushOnLogout(); // this phone stops getting notifications for the user who is leaving
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers: authHeaders() });
  } catch (err) {
    console.error('Logout error:', err);
  } finally {
    // REQ-2.7 / REQ-14.3: nothing of the user stays on the device (login, saved messages, unsent messages)
    clearSession();
    await clearOfflineData();
    disconnectSocket(); // close the live messaging connection
  }
}

export async function getMe() {
  let res: Response;
  try {
    res = await authedFetch('/auth/me');
  } catch {
    throw { message: 'No connection. Please check your internet.', status: 0 }; // offline: the app can still open
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { ...data, status: res.status };
  return data.user as User;
}
