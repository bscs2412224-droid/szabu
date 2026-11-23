import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Block, Button, List, ListItem, Preloader, Searchbar } from 'konsta/react';
import { Plus } from 'lucide-react';
import type { User } from '../api/auth';
import { getConversationsSaved } from '../api/messages';
import type { ConversationSummary } from '../api/messages';
import { initialsOf, roleLabel } from '../lib/roles';
import { inboxTime } from '../lib/time';
import { useSocketConnected, useSocketEvent } from '../lib/useSocket';
import { BlockedNotice } from './BlockedNotice';
import { OfflineBanner } from './OfflineBanner';

export interface OpenChat {
  id: string;
  name: string;
  role: string;
}

interface MessagesTabProps {
  user: User;
  onOpenChat: (chat: OpenChat) => void;
  onNewMessage: () => void;
}

// New messages arrive live over the socket. The timer is only a safety net:
// slow while the live connection is up, faster while it is down.
const LIVE_POLL_MS = 60_000;
const FALLBACK_POLL_MS = 8000;

// Inbox: conversations with the latest message and unread count (UC-10)
export const MessagesTab: React.FC<MessagesTabProps> = ({ user, onOpenChat, onNewMessage }) => {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState(false); // showing the copy saved earlier (no connection)
  const blocked = user.messagingBlocked || !user.isPlacedInHierarchy;

  const load = useCallback(async () => {
    try {
      const r = await getConversationsSaved();
      setConversations(r.data);
      setSaved(r.stale);
      setError(null);
    } catch {
      setError('Messages could not be loaded. Tap to retry.');
    }
  }, []);

  const connected = useSocketConnected(!blocked);

  useEffect(() => {
    if (blocked) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open: state is only set after the request returns
    void load();
  }, [blocked, load]);

  // Live updates from the server
  useSocketEvent('message:new', () => void load(), !blocked);
  useSocketEvent('message:status', () => void load(), !blocked);
  useSocketEvent('connect', () => void load(), !blocked);

  useEffect(() => {
    if (blocked) return;
    const timer = setInterval(
      () => {
        if (document.visibilityState === 'visible') void load();
      },
      connected ? LIVE_POLL_MS : FALLBACK_POLL_MS,
    );
    return () => clearInterval(timer);
  }, [blocked, connected, load]);

  if (blocked) return <BlockedNotice section="Messaging" />;

  const needle = query.trim().toLowerCase();
  const shown = (conversations ?? []).filter(
    (c) =>
      !needle ||
      c.participant?.name.toLowerCase().includes(needle) ||
      roleLabel(c.participant?.role ?? '').toLowerCase().includes(needle),
  );

  return (
    <>
      <OfflineBanner />
      {saved && (
        <div className="mx-4 mt-2 rounded-lg bg-slate-100 text-slate-600 text-xs px-3 py-2" role="status">
          Showing conversations saved on this device. They update when you are back online.
        </div>
      )}
      <Searchbar
        placeholder="Search conversations"
        value={query}
        onInput={(e) => setQuery(e.target.value)}
        onClear={() => setQuery('')}
        disableButton={false}
        clearButton
      />

      <Block className="!mt-2 !mb-2">
        <Button rounded tonal onClick={onNewMessage}>
          <Plus className="w-5 h-5 mr-1.5" />
          New message
        </Button>
      </Block>

      {error && (
        <Block strong inset className="border border-red-200 bg-red-50 text-red-700 text-sm" onClick={() => void load()}>
          {error}
        </Block>
      )}

      {!error && conversations === null && (
        <div className="flex justify-center py-8">
          <Preloader />
        </div>
      )}

      {conversations !== null && conversations.length === 0 && (
        <Block strong inset className="text-center text-sm text-slate-600">
          No conversations yet.
          <br />
          Tap &ldquo;New message&rdquo; to start one.
        </Block>
      )}

      {conversations !== null && conversations.length > 0 && shown.length === 0 && (
        <Block strong inset className="text-center text-sm text-slate-600">
          No conversations match &ldquo;{query}&rdquo;.
        </Block>
      )}

      {shown.length > 0 && (
        <List strong inset dividers>
          {shown.map((c) => {
            const who = c.participant;
            if (!who || !c.lastMessage) return null;
            return (
              <ListItem
                key={c.id}
                link
                chevronMaterial={false}
                onClick={() => onOpenChat({ id: c.id, name: who.name, role: who.role })}
                media={
                  <div className="w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
                    {initialsOf(who.name)}
                  </div>
                }
                title={who.name}
                subtitle={roleLabel(who.role)}
                text={c.lastMessage.fromMe ? `You: ${c.lastMessage.body}` : c.lastMessage.body}
                after={
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-xs text-slate-500">{inboxTime(c.lastMessage.sentAt)}</span>
                    {c.unreadCount > 0 && <Badge>{c.unreadCount}</Badge>}
                  </span>
                }
              />
            );
          })}
        </List>
      )}
      <div className="h-6" />
    </>
  );
};
