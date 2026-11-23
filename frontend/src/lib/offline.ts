/**
 * Offline storage (IndexedDB), SRS REQ-14.2 and REQ-14.3.
 *
 *   cache  : the last good copy of the inbox, each conversation's recent messages and the contacts list,
 *            so they can be read without a connection.
 *   outbox : messages written while offline, sent when the connection is back (see outbox.ts).
 *
 * Everything is tagged with the user it belongs to, and all of it is erased on logout or when the login ends,
 * so nothing of one person is ever shown to the next person who uses the device.
 */

const DB_NAME = 'szabu-offline';
const DB_VERSION = 2;
const CACHE = 'cache';
const OUTBOX = 'outbox';
const AUTH = 'auth';

export interface OutboxItem {
  clientMsgId: string;
  conversationId: string;
  body: string;
  createdAt: string;
  owner: string;
  /** queued: waiting to be sent. failed: the server refused it (or it needs the user), shown with the reason */
  state: 'queued' | 'failed';
  error?: string;
}

let owner = '';
/** Set when the app opens for a signed-in user. Saved data of anyone else is ignored. */
export function setOfflineOwner(userId: string): void {
  owner = userId;
}

export const getOfflineOwner = (): string => owner;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: 'clientMsgId' });
      // the login the service worker uses to send waiting messages while the app is closed (Background Sync)
      if (!db.objectStoreNames.contains(AUTH)) db.createObjectStore(AUTH, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = work(tx.objectStore(store));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// ---------- cache ----------

interface CacheRecord<T> {
  key: string;
  owner: string;
  savedAt: string;
  value: T;
}

export async function cacheSet<T>(key: string, value: T): Promise<void> {
  if (!owner) return;
  try {
    const record: CacheRecord<T> = { key, owner, savedAt: new Date().toISOString(), value };
    await run(CACHE, 'readwrite', (s) => s.put(record));
  } catch {
    // saving for offline is a bonus; it must never break the screen
  }
}

export async function cacheGet<T>(key: string): Promise<{ value: T; savedAt: string } | null> {
  if (!owner) return null;
  try {
    const record = await run<CacheRecord<T> | undefined>(CACHE, 'readonly', (s) => s.get(key));
    return record && record.owner === owner ? { value: record.value, savedAt: record.savedAt } : null;
  } catch {
    return null;
  }
}

// ---------- the signed-in profile (so the app can open with no connection) ----------

const PROFILE_KEY = 'profile';

/** Keep the signed-in user's profile so the app can open offline. Removed on logout like everything else here. */
export async function saveProfile<T extends { id: string }>(user: T): Promise<void> {
  try {
    const record: CacheRecord<T> = { key: PROFILE_KEY, owner: user.id, savedAt: new Date().toISOString(), value: user };
    await run(CACHE, 'readwrite', (s) => s.put(record));
  } catch {
    // optional
  }
}

/** The saved profile, before we know who is signed in. The caller checks it against the login token. */
export async function loadProfile<T extends { id: string }>(): Promise<T | null> {
  try {
    const record = await run<CacheRecord<T> | undefined>(CACHE, 'readonly', (s) => s.get(PROFILE_KEY));
    return record?.value ?? null;
  } catch {
    return null;
  }
}

// ---------- outbox ----------

export async function outboxPut(item: OutboxItem): Promise<void> {
  await run(OUTBOX, 'readwrite', (s) => s.put(item));
}

export async function outboxRemove(clientMsgId: string): Promise<void> {
  await run(OUTBOX, 'readwrite', (s) => s.delete(clientMsgId));
}

/** Waiting messages of the signed-in user, oldest first */
export async function outboxAll(): Promise<OutboxItem[]> {
  try {
    const all = await run<OutboxItem[]>(OUTBOX, 'readonly', (s) => s.getAll());
    return all.filter((i) => i.owner === owner).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

// ---------- login copy for Background Sync ----------

/**
 * The service worker cannot read localStorage, so a copy of the login is kept here, only to send waiting messages
 * when the app is closed. It is erased with everything else on logout or when the login ends.
 */
export async function saveSyncAuth(token: string, apiBase: string): Promise<void> {
  if (!owner || !token) return;
  try {
    await run(AUTH, 'readwrite', (s) => s.put({ key: 'auth', token, owner, apiBase }));
  } catch {
    // optional
  }
}

// ---------- wipe ----------

/** Logout / session end: remove saved conversations, waiting messages and the app-icon badge from this device. */
export async function clearOfflineData(): Promise<void> {
  owner = '';
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([CACHE, OUTBOX, AUTH], 'readwrite');
      tx.objectStore(CACHE).clear();
      tx.objectStore(OUTBOX).clear();
      tx.objectStore(AUTH).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // nothing stored, nothing to remove
  }
  void navigator.clearAppBadge?.().catch(() => undefined);
  window.dispatchEvent(new Event('szabu:outbox-changed'));
}

/** Ask the browser not to delete the saved data when the phone runs low on space. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // optional
  }
}
