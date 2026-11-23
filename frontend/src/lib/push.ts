import { authedFetch } from './http';

/**
 * Phone notifications (Web Push).
 *   unsupported : this browser or this way of running the app cannot do it (or the app is not installed)
 *   blocked     : the user said "no" in the browser; only the browser settings can change that
 *   off / on    : this device is registered or not
 */
export type PushState = 'unsupported' | 'blocked' | 'off' | 'on';

const browserCanPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// There is no service worker while developing (only in the built app), so push is unavailable there.
const registration = () => navigator.serviceWorker.getRegistration();

async function api(path: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await authedFetch(`/push${path}`, {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function getPushState(): Promise<PushState> {
  if (!browserCanPush()) return 'unsupported';
  const reg = await registration();
  if (!reg) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Ask permission (must come from a tap), register this device, and tell the server. */
export async function enablePush(): Promise<PushState> {
  if (!browserCanPush()) return 'unsupported';
  const reg = await registration();
  if (!reg) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'blocked';
  if (permission !== 'granted') return 'off';

  const key = await api('/public-key');
  if (!key.ok || typeof key.data.publicKey !== 'string') {
    throw new Error(String(key.data.message || 'Phone notifications are not available right now.'));
  }

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true, // every push shows a visible notification
      applicationServerKey: urlBase64ToUint8Array(key.data.publicKey),
    }));

  const saved = await api('/subscribe', { subscription: sub.toJSON() });
  if (!saved.ok) throw new Error(String(saved.data.message || 'Could not turn on notifications.'));
  return 'on';
}

/** Stop notifications on this device. */
export async function disablePush(): Promise<PushState> {
  const reg = browserCanPush() ? await registration() : undefined;
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api('/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe();
  }
  return Notification.permission === 'denied' ? 'blocked' : 'off';
}

/**
 * When the app opens: if this device is already registered, tell the server it belongs to the user who is
 * signed in now (a phone may have been used by someone else before).
 */
export async function syncPushOwner(): Promise<void> {
  if ((await getPushState()) !== 'on') return;
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await api('/subscribe', { subscription: sub.toJSON() }).catch(() => undefined);
}

/** Log out: this phone must stop receiving the previous user's notifications. Never blocks the log out. */
export async function dropPushOnLogout(): Promise<void> {
  try {
    if ((await getPushState()) === 'on') await disablePush();
  } catch {
    // best effort
  }
}
