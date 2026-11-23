import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Message, Messagebar, Messages, MessagesTitle, Navbar, NavbarBackLink, Page } from 'konsta/react';
import { Send } from 'lucide-react';
import { getMessages, getRecentMessagesSaved, markRead } from '../api/messages';
import type { ChatMessage } from '../api/messages';
import { OUTBOX_CHANGED, discardMessage, queueMessage, retryMessage, waitingMessages } from '../lib/outbox';
import type { OutboxItem } from '../lib/offline';
import { roleLabel } from '../lib/roles';
import { dayLabel, formatClock } from '../lib/time';
import { useOnline } from '../lib/useOnline';
import { useSocketConnected, useSocketEvent } from '../lib/useSocket';
import { OfflineBanner } from './OfflineBanner';
import type { OpenChat } from './MessagesTab';

const MAX_MESSAGE_LENGTH = 2000;
// New messages and status changes arrive live over the socket. The timer is only a safety net:
// slow while the live connection is up, faster while it is down.
const LIVE_POLL_MS = 30_000;
const FALLBACK_POLL_MS = 4000;

const STATUS_TEXT = { SENT: 'Sent', DELIVERED: 'Delivered', READ: 'Read' } as const;

const newClientId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const mergeById = (prev: ChatMessage[], incoming: ChatMessage[]) => {
  const byId = new Map(prev.map((m) => [m.id, m]));
  incoming.forEach((m) => byId.set(m.id, m));
  return [...byId.values()].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
};

interface ThreadViewProps {
  chat: OpenChat;
  onBack: () => void;
}

// One conversation: history (also readable offline), live updates, and a box to type and send.
// Messages written offline wait in the outbox on the device and are sent when the connection is back.
export const ThreadView: React.FC<ThreadViewProps> = ({ chat, onBack }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [waiting, setWaiting] = useState<OutboxItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null); // set while showing the copy saved earlier
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const incomingSeen = useRef(0);
  const online = useOnline();

  const tooLong = text.length > MAX_MESSAGE_LENGTH;
  const canSend = text.trim().length > 0 && !tooLong;

  /** Newest messages: from the server, or the saved copy when there is no connection. */
  const refresh = useCallback(
    async (first = false) => {
      try {
        const r = await getRecentMessagesSaved(chat.id);
        setMessages((prev) => mergeById(prev, r.data.messages));
        if (first) setHasMore(r.data.hasMore && !r.stale);
        setSavedAt(r.stale ? (r.savedAt ?? '') : null);
        setLoaded(true);
        setLoadError(null);

        if (!r.stale) {
          // Opening the chat (or receiving a new message while it is open) marks messages as Read
          const incoming = r.data.messages.filter((m) => !m.fromMe).length;
          if (first || incoming > incomingSeen.current) void markRead(chat.id).catch(() => undefined);
          incomingSeen.current = incoming;
        }
      } catch {
        setLoadError('Messages could not be loaded. Tap to retry.');
      }
    },
    [chat.id],
  );

  const loadWaiting = useCallback(async () => {
    setWaiting((await waitingMessages()).filter((i) => i.conversationId === chat.id));
  }, [chat.id]);

  const connected = useSocketConnected();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open: state is only set after the request returns
    void refresh(true);
    void loadWaiting();
  }, [refresh, loadWaiting]);

  // The outbox changed (a message was queued, sent, refused or removed)
  useEffect(() => {
    const onChange = () => {
      void loadWaiting();
      void refresh();
    };
    window.addEventListener(OUTBOX_CHANGED, onChange);
    return () => window.removeEventListener(OUTBOX_CHANGED, onChange);
  }, [loadWaiting, refresh]);

  // Back online: catch up
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacts to the connection coming back
    if (online) void refresh();
  }, [online, refresh]);

  // Live: a new message or a Sent / Delivered / Read change in THIS conversation
  useSocketEvent<{ conversationId: string }>('message:new', (p) => {
    if (p.conversationId === chat.id) void refresh();
  });
  useSocketEvent<{ conversationId: string }>('message:status', (p) => {
    if (p.conversationId === chat.id) void refresh();
  });
  useSocketEvent('connect', () => void refresh()); // catch up after the connection comes back

  useEffect(() => {
    const timer = setInterval(
      () => {
        if (document.visibilityState === 'visible') void refresh();
      },
      connected ? LIVE_POLL_MS : FALLBACK_POLL_MS,
    );
    return () => clearInterval(timer);
  }, [connected, refresh]);

  // Messages already on the server are not shown twice
  const shownWaiting = waiting.filter((w) => !messages.some((m) => m.clientMsgId === w.clientMsgId));

  // Show the newest message when the chat opens or something is added
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, shownWaiting.length, loaded]);

  const loadOlder = async () => {
    if (!messages.length || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const r = await getMessages(chat.id, messages[0].sentAt);
      setMessages((prev) => mergeById(prev, r.messages));
      setHasMore(r.hasMore);
    } catch {
      setLoadError('Older messages could not be loaded. Tap to retry.');
    } finally {
      setLoadingOlder(false);
    }
  };

  /** The message is saved on this device first, then sent. It is never lost, even if the app is closed. */
  const send = () => {
    if (!canSend) return;
    const item = {
      clientMsgId: newClientId(),
      conversationId: chat.id,
      body: text.trim(),
      createdAt: new Date().toISOString(),
    };
    setText('');
    void queueMessage(item);
  };

  // Group by day so the chat shows "Today", "Yesterday" or a date
  const rows: React.ReactNode[] = [];
  let lastDay = '';
  const dayHeader = (iso: string) => {
    const day = new Date(iso).toDateString();
    if (day !== lastDay) {
      lastDay = day;
      rows.push(
        <MessagesTitle key={`day-${day}`}>
          <b>{dayLabel(iso)}</b>
        </MessagesTitle>,
      );
    }
  };

  messages.forEach((m) => {
    dayHeader(m.sentAt);
    rows.push(
      <Message
        key={m.id}
        type={m.fromMe ? 'sent' : 'received'}
        name={m.fromMe ? undefined : m.senderName}
        text={m.body}
        textFooter={m.fromMe && m.status ? `${formatClock(m.sentAt)} · ${STATUS_TEXT[m.status]}` : formatClock(m.sentAt)}
      />,
    );
  });
  shownWaiting.forEach((w) => {
    dayHeader(w.createdAt);
    const failed = w.state === 'failed';
    rows.push(
      <Message
        key={w.clientMsgId}
        type="sent"
        text={w.body}
        textFooter={failed ? `Not sent: ${w.error ?? 'please try again'} · Tap to retry` : online ? 'Sending…' : 'Waiting for connection…'}
        onClick={failed ? () => void retryMessage(w) : undefined}
        footer={
          failed ? (
            <button type="button" className="text-xs text-red-600 underline" onClick={() => void discardMessage(w.clientMsgId)}>
              Delete this message
            </button>
          ) : undefined
        }
      />,
    );
  });

  return (
    <Page>
      <Navbar title={chat.name} subtitle={roleLabel(chat.role)} left={<NavbarBackLink text="Chats" onClick={onBack} />} />

      <OfflineBanner />
      {savedAt !== null && (
        <div className="mx-4 mt-2 rounded-lg bg-slate-100 text-slate-600 text-xs px-3 py-2" role="status">
          Showing messages saved on this device{savedAt ? ` (${formatClock(savedAt)})` : ''}. They update when you are back online.
        </div>
      )}

      <Messages className="pb-32">
        {hasMore && (
          <div className="flex justify-center pb-2">
            <Button small clear inline onClick={() => void loadOlder()} disabled={loadingOlder}>
              {loadingOlder ? 'Loading…' : 'Load earlier messages'}
            </Button>
          </div>
        )}

        {loadError && (
          <div className="text-center text-sm text-red-600 py-3" role="alert" onClick={() => void refresh(true)}>
            {loadError}
          </div>
        )}

        {loaded && messages.length === 0 && shownWaiting.length === 0 && !loadError && (
          <div className="text-center text-sm text-slate-500 py-6">No messages yet. Say hello!</div>
        )}

        {rows}
        <div ref={endRef} />
      </Messages>

      {tooLong && (
        <div className="absolute left-0 w-full bottom-14 text-center text-xs text-red-600 pb-1" role="alert">
          Please enter a message of up to {MAX_MESSAGE_LENGTH} characters.
        </div>
      )}

      <Messagebar
        placeholder={`Message ${chat.name}`}
        value={text}
        onInput={(e) => setText(e.target.value)}
        right={
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            aria-label="Send message"
            className="p-2 text-primary disabled:opacity-40"
          >
            <Send className="w-6 h-6" />
          </button>
        }
      />
    </Page>
  );
};
