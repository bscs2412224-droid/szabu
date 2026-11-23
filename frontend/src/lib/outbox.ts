import { sendMessage } from '../api/messages';
import type { ApiError } from './http';
import { API_BASE } from './config';
import { getOfflineOwner, outboxAll, outboxPut, outboxRemove, saveSyncAuth } from './offline';
import { savedToken } from './session';
import type { OutboxItem } from './offline';
import { getSocket } from './socket';

/**
 * Messages written while offline (SRS REQ-14.3). The message is saved on the device first, so it survives
 * closing the app, and is sent as soon as the connection is back. Each message carries a clientMsgId, so
 * sending it twice (for example after a flaky connection) never creates a duplicate on the server.
 */

export const OUTBOX_CHANGED = 'szabu:outbox-changed';
const notify = () => window.dispatchEvent(new Event(OUTBOX_CHANGED));

let flushing = false;

/**
 * Background Sync (Chrome and Android): ask the browser to wake the service worker when the connection is back,
 * even if the app is closed, so waiting messages are still sent (see public/push-handler.js).
 * Browsers without it (iPhone) simply send when the app is opened again.
 */
async function requestBackgroundSync(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sync = (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync;
    if (!sync) return;
    await saveSyncAuth(savedToken(), API_BASE);
    await sync.register('szabu-outbox');
  } catch {
    // optional
  }
}

/** Send every waiting message, oldest first. Stops at the first network problem and tries again later. */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    for (const item of await outboxAll()) {
      if (item.state === 'failed') continue; // waits for the user (tap to retry)
      try {
        await sendMessage(item.conversationId, item.body, item.clientMsgId);
        await outboxRemove(item.clientMsgId);
        notify();
      } catch (e) {
        const err = e as ApiError;
        const temporary = err.status === 0 || err.status >= 500 || err.status === 429;
        if (temporary) break; // still no connection: keep it queued, try again later
        // The server refused it (for example the person may not be messaged any more): show the reason
        await outboxPut({ ...item, state: 'failed', error: err.message });
        notify();
      }
    }
  } finally {
    flushing = false;
  }
}

/** Save a message for sending. It shows in the chat straight away and goes out as soon as possible. */
export async function queueMessage(item: Omit<OutboxItem, 'state' | 'owner'>): Promise<void> {
  await outboxPut({ ...item, state: 'queued', owner: getOfflineOwner() });
  notify();
  void requestBackgroundSync();
  void flushOutbox();
}

/** Tap to retry a message the server had refused (or that failed for another reason). */
export async function retryMessage(item: OutboxItem): Promise<void> {
  await outboxPut({ ...item, state: 'queued', error: undefined });
  notify();
  void flushOutbox();
}

/** Remove a waiting message the user no longer wants to send. */
export async function discardMessage(clientMsgId: string): Promise<void> {
  await outboxRemove(clientMsgId);
  notify();
}

export const waitingMessages = outboxAll;

/** Send waiting messages whenever the connection might be back: network up, app in front, live link restored. */
export function startOutboxSync(): () => void {
  const flush = () => void flushOutbox();
  const onVisible = () => {
    if (document.visibilityState === 'visible') flush();
  };
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', onVisible);
  const socket = getSocket();
  socket.on('connect', flush);
  flush(); // anything left from the last time the app was open
  return () => {
    window.removeEventListener('online', flush);
    document.removeEventListener('visibilitychange', onVisible);
    socket.off('connect', flush);
  };
}
