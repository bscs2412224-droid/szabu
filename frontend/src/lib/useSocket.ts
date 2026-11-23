import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getSocket } from './socket';

/** True while the live connection is up. When it is down the screens fall back to checking regularly. */
export function useSocketConnected(enabled = true): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (!enabled) return () => undefined;
      const s = getSocket();
      s.on('connect', notify);
      s.on('disconnect', notify);
      s.on('connect_error', notify);
      return () => {
        s.off('connect', notify);
        s.off('disconnect', notify);
        s.off('connect_error', notify);
      };
    },
    () => enabled && getSocket().connected,
  );
}

/** Run `handler` every time the server pushes `event`. */
export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void, enabled = true): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    const s = getSocket();
    const listener = (payload: T) => latest.current(payload);
    s.on(event, listener);
    return () => {
      s.off(event, listener);
    };
  }, [event, enabled]);
}
