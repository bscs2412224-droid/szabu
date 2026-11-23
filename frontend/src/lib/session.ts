// The signed-in session lives in ONE place: the login token under a single name.
// (Older versions also kept a second copy of the token and a copy of the profile that nothing used.)
const TOKEN_KEY = 'szabu_token';
const LEGACY_KEYS = ['szabu_user', 'academia_sync_token', 'academia_sync_user'];

export const savedToken = (): string => localStorage.getItem(TOKEN_KEY) ?? '';

function removeLegacyKeys(): void {
  LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
}

export function saveSession(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  removeLegacyKeys();
}

// Sign-in screens keep this once a device is known so the email is pre-filled next time
const REMEMBERED_EMAIL_KEY = 'szabu_remembered_id';
export const rememberedEmail = (): string => localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? '';
export function rememberEmail(email: string | null): void {
  if (email) localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
  else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
}

/** Forget the login on this device (the remembered email is a separate, deliberate choice and stays). */
export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  removeLegacyKeys();
  sessionStorage.clear();
}

// Old copies from earlier versions are removed every time the app starts
removeLegacyKeys();
