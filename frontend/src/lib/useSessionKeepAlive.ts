import { useEffect } from 'react';
import { logout } from '../api/auth';
import { authedFetch, expireSession } from './http';

// SRS REQ-2.4: a session ends after 30 minutes of inactivity.
// The server enforces it from its own clock; the app enforces it too, so a phone left in a pocket for an hour
// is logged out as soon as it is picked up, and an active user is never logged out by accident.
const INACTIVITY_MS = 30 * 60 * 1000;
const PING_EVERY_MS = 5 * 60 * 1000; // tell the server "still here", at most this often, and only after real activity
const CHECK_EVERY_MS = 30 * 1000;

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;

export function useSessionKeepAlive(): void {
  useEffect(() => {
    let lastActivity = Date.now();
    let lastPing = Date.now();
    let ending = false;

    const touch = () => {
      lastActivity = Date.now();
    };

    const check = () => {
      if (ending) return;
      const now = Date.now();

      if (now - lastActivity > INACTIVITY_MS) {
        ending = true;
        void logout().then(() => expireSession('You were logged out after 30 minutes of inactivity.'));
        return;
      }
      // the user was active since the last ping: let the server know (any request counts as activity)
      if (lastActivity > lastPing && now - lastPing > PING_EVERY_MS) {
        lastPing = now;
        void authedFetch('/auth/me').catch(() => undefined);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') check(); // phones pause timers in the background
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, CHECK_EVERY_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);
}
