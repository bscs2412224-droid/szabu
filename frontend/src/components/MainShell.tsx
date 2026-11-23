import React, { useCallback, useEffect, useState } from 'react';
import { Page, Navbar, Link, Tabbar, TabbarLink, Dialog, DialogButton } from 'konsta/react';
import { Home, MessageSquare, LogOut, Users } from 'lucide-react';
import type { User } from '../api/auth';
import { logout } from '../api/auth';
import { getConversationsSaved } from '../api/messages';
import { useSocketEvent } from '../lib/useSocket';
import { useSessionKeepAlive } from '../lib/useSessionKeepAlive';
import { startOutboxSync } from '../lib/outbox';
import { requestPersistentStorage } from '../lib/offline';
import { syncPushOwner } from '../lib/push';
import { OfflineBanner } from './OfflineBanner';
import { HomeTab } from './HomeTab';
import { MessagesTab } from './MessagesTab';
import type { OpenChat } from './MessagesTab';
import { NewMessageView } from './NewMessageView';
import { ThreadView } from './ThreadView';
import { DirectoryTab } from './DirectoryTab';

type TabId = 'home' | 'messages' | 'directory';

const TITLES: Record<TabId, string> = {
  home: 'Home',
  messages: 'Messages',
  directory: 'Directory',
};

interface MainShellProps {
  user: User;
  onLogout: () => void;
}

// The signed-in app: header bar, content, and the bottom tab bar
export const MainShell: React.FC<MainShellProps> = ({ user, onLogout }) => {
  // The administrator does not use messaging; users not yet placed in the hierarchy are blocked from it
  const messagingOn = user.role !== 'ADMIN' && user.isPlacedInHierarchy && !user.messagingBlocked;

  // App-icon shortcuts (press and hold the icon): /?tab=messages opens Messages, /?compose=1 opens New message
  const launch = new URLSearchParams(window.location.search);
  const [tab, setTab] = useState<TabId>(() => (messagingOn && launch.get('tab') === 'messages' ? 'messages' : 'home'));
  const [chat, setChat] = useState<OpenChat | null>(null);
  const [composing, setComposing] = useState(() => messagingOn && launch.get('compose') === '1');
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [unread, setUnread] = useState(0);

  useSessionKeepAlive(); // 30 minutes of inactivity ends the session (REQ-2.4)

  useEffect(() => {
    if (launch.has('tab') || launch.has('compose')) window.history.replaceState({}, '', '/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!messagingOn) return;
    try {
      const all = (await getConversationsSaved()).data;
      setUnread(all.reduce((total, c) => total + c.unreadCount, 0));
    } catch {
      // the badge just stays as it was
    }
  }, [messagingOn]);

  // Update the badge at the start and whenever the user leaves a chat (they may have read messages)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open: state is only set after the request returns
    void refreshUnread();
  }, [refreshUnread, chat]);

  // ...and live, whenever a message arrives
  useSocketEvent('message:new', () => void refreshUnread(), messagingOn);

  // Tapping a phone notification opens that chat. The link is "/?chat=<id>" when the app was closed,
  // or a message from the service worker when the app was already open (UC-09).
  const openChatFromUrl = useCallback(
    async (url: string) => {
      const id = new URL(url, window.location.origin).searchParams.get('chat');
      if (!id || !messagingOn) return;
      try {
        const found = (await getConversationsSaved()).data.find((c) => c.id === id);
        if (found?.participant) {
          setTab('messages');
          setChat({ id, name: found.participant.name, role: found.participant.role });
        }
      } catch {
        // the inbox is still there
      }
    },
    [messagingOn],
  );

  useEffect(() => {
    if (!messagingOn) return;
    void syncPushOwner(); // this phone's notifications now belong to the user who is signed in

    if (new URLSearchParams(window.location.search).has('chat')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- runs once at start; state is only set after the request returns
      void openChatFromUrl(window.location.href).finally(() => window.history.replaceState({}, '', '/'));
    }

    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'open-chat') void openChatFromUrl(String(e.data.url));
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, [messagingOn, openChatFromUrl]);

  // Unread count on the app icon (the little number on the home-screen icon, where the phone supports it)
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    if (unread > 0) void navigator.setAppBadge(unread).catch(() => undefined);
    else void navigator.clearAppBadge().catch(() => undefined);
  }, [unread]);

  // Messages written offline are sent as soon as the connection is back; keep the saved data from being cleaned up
  useEffect(() => {
    if (!messagingOn) return;
    void requestPersistentStorage();
    return startOutboxSync();
  }, [messagingOn]);

  if (chat) {
    return <ThreadView chat={chat} onBack={() => setChat(null)} />;
  }
  if (composing) {
    return (
      <NewMessageView
        onBack={() => setComposing(false)}
        onOpenChat={(c) => {
          setComposing(false);
          setChat(c);
        }}
      />
    );
  }

  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  return (
    <Page>
      <Navbar
        title={TITLES[tab]}
        right={
          <Link onClick={() => setConfirmLogout(true)} aria-label="Log out">
            <LogOut className="w-5 h-5" />
          </Link>
        }
      />

      <OfflineBanner />

      {tab === 'home' && <HomeTab user={user} />}
      {tab === 'messages' && <MessagesTab user={user} onOpenChat={setChat} onNewMessage={() => setComposing(true)} />}
      {tab === 'directory' && <DirectoryTab user={user} onOpenChat={setChat} />}

      <Tabbar labels icons className="left-0 bottom-0 fixed">
        <TabbarLink active={tab === 'home'} onClick={() => setTab('home')} icon={<Home className="w-6 h-6" />} label="Home" />
        {user.role !== 'ADMIN' && (
          <TabbarLink
            active={tab === 'messages'}
            onClick={() => setTab('messages')}
            icon={
              <span className="relative inline-flex">
                <MessageSquare className="w-6 h-6" />
                {unread > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center"
                    aria-label={`${unread} unread messages`}
                  >
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </span>
            }
            label="Messages"
          />
        )}
        <TabbarLink
          active={tab === 'directory'}
          onClick={() => setTab('directory')}
          icon={<Users className="w-6 h-6" />}
          label="Directory"
        />
      </Tabbar>

      <Dialog
        opened={confirmLogout}
        onBackdropClick={() => setConfirmLogout(false)}
        title="Log out?"
        content="You will need to sign in again to use SzabU."
        buttons={
          <>
            <DialogButton onClick={() => setConfirmLogout(false)}>Cancel</DialogButton>
            <DialogButton strong onClick={handleLogout}>
              Log out
            </DialogButton>
          </>
        }
      />
    </Page>
  );
};
