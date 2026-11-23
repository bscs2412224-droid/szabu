import { registerSW } from 'virtual:pwa-register';

/** Fired when a newer version of the app has been downloaded and is waiting. */
export const UPDATE_READY_EVENT = 'szabu:update-ready';

let reload: ((reloadPage?: boolean) => Promise<void>) | null = null;

/** Register the service worker (offline app shell, phone notifications) and watch for new versions. */
export function startPwa(): void {
  reload = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(new Event(UPDATE_READY_EVENT));
    },
    onRegisteredSW(_url, registration) {
      // look for a new version once an hour while the app stays open
      if (registration) setInterval(() => void registration.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });
}

/** Switch to the new version and reload. */
export async function applyUpdate(): Promise<void> {
  await reload?.(true);
}
