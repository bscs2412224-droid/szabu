import { authedFetch } from '../lib/http';
import type { ApiError } from '../lib/http';
import { cacheGet, cacheSet } from '../lib/offline';

export type { ApiError } from '../lib/http';

export interface Participant {
  id: string;
  name: string;
  role: string;
}

export interface Contact extends Participant {
  /** Program the person belongs to */
  group: string;
}

export interface ConversationSummary {
  id: string;
  participant: Participant | null;
  lastMessage: { body: string; sentAt: string; fromMe: boolean } | null;
  unreadCount: number;
  updatedAt: string;
}

export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ';

export interface ChatMessage {
  id: string;
  clientMsgId: string;
  senderId: string;
  senderName: string;
  fromMe: boolean;
  body: string;
  sentAt: string;
  /** Only for messages I sent */
  status: MessageStatus | null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await authedFetch(`/messages${path}`, init);
  } catch {
    throw { message: 'No connection. Please check your internet.', status: 0 } satisfies ApiError;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { message: data.message || 'Something went wrong.', status: res.status } satisfies ApiError;
  return data as T;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const getConversations = async () =>
  (await request<{ conversations: ConversationSummary[] }>('/conversations')).conversations;

export const getContacts = async () => (await request<{ contacts: Contact[] }>('/contacts')).contacts;

export const openConversation = (recipientId: string) =>
  request<{ id: string; participant: Participant }>('/conversations', post({ recipientId }));

export const getMessages = (conversationId: string, before?: string) =>
  request<{ messages: ChatMessage[]; hasMore: boolean }>(
    `/conversations/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
  );

export const markRead = (conversationId: string) =>
  request<{ markedRead: number }>(`/conversations/${conversationId}/read`, { method: 'POST' });

export const sendMessage = (conversationId: string, body: string, clientMsgId: string) =>
  request<{ id: string; sentAt: string; status: MessageStatus }>(
    `/conversations/${conversationId}/messages`,
    post({ body, clientMsgId }),
  );

// ---------- reading without a connection (SRS REQ-14.2) ----------

export interface Saved<T> {
  data: T;
  /** true = this is the copy saved earlier, because there is no connection right now */
  stale: boolean;
  savedAt?: string;
}

/** Ask the server; keep the answer on the device. With no connection, give back the last saved answer. */
async function withSavedCopy<T>(key: string, load: () => Promise<T>): Promise<Saved<T>> {
  try {
    const data = await load();
    void cacheSet(key, data);
    return { data, stale: false };
  } catch (e) {
    if ((e as ApiError).status === 0) {
      const saved = await cacheGet<T>(key);
      if (saved) return { data: saved.value, stale: true, savedAt: saved.savedAt };
    }
    throw e;
  }
}

export const getConversationsSaved = () => withSavedCopy('conversations', getConversations);
export const getContactsSaved = () => withSavedCopy('contacts', getContacts);
/** The newest page of a conversation (the part worth keeping for offline reading) */
export const getRecentMessagesSaved = (conversationId: string) =>
  withSavedCopy(`messages:${conversationId}`, () => getMessages(conversationId));
