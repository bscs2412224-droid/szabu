/* Phone notifications (Web Push). Loaded by the service worker (see importScripts in vite.config.ts).
 *
 * REQ-9.2: a notification shows only a title, never message text, so no "body" is set here.
 */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = typeof data.title === 'string' && data.title ? data.title : 'SzabU';

  // The number on the app icon (where the phone supports it)
  if (typeof data.unread === 'number' && self.navigator && self.navigator.setAppBadge) {
    event.waitUntil(self.navigator.setAppBadge(data.unread).catch(() => undefined));
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-64.png',
      // the same tag replaces the older notification of that conversation instead of piling up
      tag: typeof data.tag === 'string' ? data.tag : 'szabu',
      data: { url: typeof data.url === 'string' ? data.url : '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // The app is already open: bring it to the front and tell it which chat to open
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({ type: 'open-chat', url });
          return;
        }
      }
      // Otherwise start the app on that chat
      await self.clients.openWindow(url);
    })(),
  );
});

/* Background Sync: send messages that were written offline, even when the app is closed.
 * The app saves a copy of the login and the waiting messages in IndexedDB (see src/lib/offline.ts and outbox.ts).
 * Every message carries a clientMsgId, so sending it here and again from the open app never creates a duplicate.
 */
function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('szabu-offline');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idb(db, store, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = work(tx.objectStore(store));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function sendWaitingMessages() {
  const db = await openOfflineDb();
  try {
    if (!db.objectStoreNames.contains('auth') || !db.objectStoreNames.contains('outbox')) return;
    const auth = await idb(db, 'auth', 'readonly', (s) => s.get('auth'));
    if (!auth || !auth.token) return;
    const all = await idb(db, 'outbox', 'readonly', (s) => s.getAll());
    const waiting = all
      .filter((m) => m.owner === auth.owner && m.state === 'queued')
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

    for (const m of waiting) {
      let res;
      try {
        res = await fetch(`${auth.apiBase}/messages/conversations/${m.conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
          body: JSON.stringify({ body: m.body, clientMsgId: m.clientMsgId }),
        });
      } catch {
        throw new Error('no connection'); // the browser tries again later
      }
      if (res.ok) {
        await idb(db, 'outbox', 'readwrite', (s) => s.delete(m.clientMsgId));
      } else if (res.status === 401) {
        return; // the login ended: the app handles it when it is opened
      } else if (res.status >= 500 || res.status === 429) {
        throw new Error('server busy'); // try again later
      } else {
        let reason = 'The message could not be sent.';
        try {
          const data = await res.json();
          if (data && typeof data.message === 'string') reason = data.message;
        } catch {
          // keep the default reason
        }
        await idb(db, 'outbox', 'readwrite', (s) => s.put({ ...m, state: 'failed', error: reason }));
      }
    }
  } finally {
    db.close();
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'szabu-outbox') event.waitUntil(sendWaitingMessages());
});
