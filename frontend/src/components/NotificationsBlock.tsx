import React, { useEffect, useState } from 'react';
import { Block, BlockTitle, List, ListItem, Toggle } from 'konsta/react';
import { Bell } from 'lucide-react';
import { disablePush, enablePush, getPushState } from '../lib/push';
import type { PushState } from '../lib/push';

// "Message notifications" switch: alerts the phone when someone writes, even if the app is closed (UC-09)
export const NotificationsBlock: React.FC = () => {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getPushState().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async () => {
    if (busy || !state) return;
    setBusy(true);
    setError(null);
    try {
      setState(state === 'on' ? await disablePush() : await enablePush());
    } catch (e) {
      setError((e as Error).message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (state === null) return null;

  if (state === 'unsupported') {
    return (
      <Block className="text-xs text-slate-500">
        Phone notifications are not available here. They work in the installed app (on iPhone, first add SzabU to
        your Home Screen).
      </Block>
    );
  }

  return (
    <>
      <BlockTitle>Notifications</BlockTitle>
      <List strong inset>
        <ListItem
          label
          media={<Bell className="w-6 h-6 text-primary" />}
          title="Message notifications"
          subtitle={
            state === 'blocked'
              ? 'Blocked in your browser settings. Allow notifications there to turn this on.'
              : 'Get an alert on your phone when someone writes to you, even when the app is closed.'
          }
          after={<Toggle checked={state === 'on'} disabled={state === 'blocked' || busy} onChange={() => void toggle()} />}
        />
      </List>
      {error && (
        <Block strong inset className="border border-red-200 bg-red-50 text-red-700 text-sm" role="alert">
          {error}
        </Block>
      )}
    </>
  );
};
