import dotenv from "dotenv";
import { setVapidDetails, sendNotification } from "web-push";
import { prisma } from "../db.js";

dotenv.config();

/**
 * Phone notifications (Web Push), SRS UC-09.
 *  - REQ-9.2: a push shows only a title, never message text.
 *  - E1: if the push service fails, the push is retried up to 3 times.
 *  - Gone devices (the push service answers 404 or 410) are removed from the database.
 *
 * The server identifies itself to the phone vendors with a VAPID key pair (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).
 */

export interface PushPayload {
  title: string;
  /** Same tag = the phone replaces the older notification (one per conversation) */
  tag: string;
  /** Where the app opens when the notification is tapped */
  url: string;
  /** How many messages the user has not read yet: shown as the number on the app icon */
  unread?: number;
}

const MAX_RETRIES = 3;
// Wait before each retry (milliseconds). Can be shortened for tests: PUSH_RETRY_DELAYS_MS="50,50,50"
function retryDelays(): number[] {
  const fromEnv = (process.env.PUSH_RETRY_DELAYS_MS ?? "").split(",").map((s) => Number(s.trim()));
  if (fromEnv.length === MAX_RETRIES && fromEnv.every((n) => Number.isFinite(n) && n >= 0)) return fromEnv;
  return [2_000, 6_000, 15_000];
}

let configured = false;

/** True when the VAPID keys are present. Push is simply switched off otherwise. */
export function pushConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@szabist.edu.pk", publicKey, privateKey);
  configured = true;
  return true;
}

export function getPublicKey(): string | null {
  return pushConfigured() ? (process.env.VAPID_PUBLIC_KEY as string) : null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Sub = { subscription_id: string; endpoint: string; p256dh: string; auth: string };

/** Send to one device. Returns true when the push service accepted it. */
async function sendToDevice(sub: Sub, payload: PushPayload, notificationId: string): Promise<boolean> {
  const delays = retryDelays();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(delays[attempt - 1]);
      await prisma.notification.update({
        where: { notification_id: notificationId },
        data: { retry_count: { increment: 1 } },
      });
    }

    try {
      await sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 24, urgency: "normal" },
      );
      return true;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // The device unsubscribed or the app was removed: forget it, do not retry
        await prisma.pushSubscription.deleteMany({ where: { subscription_id: sub.subscription_id } });
        return false;
      }
      // other failures: try again (up to MAX_RETRIES retries)
    }
  }
  return false;
}

/**
 * Push a notification to every device of `userId` and record the outcome on the notification row.
 * No registered device: the notification stays PENDING (the user still sees it in the app).
 */
export async function pushToUser(userId: string, notificationId: string, payload: PushPayload): Promise<void> {
  if (!pushConfigured()) return;

  const subs = await prisma.pushSubscription.findMany({ where: { user_id: userId } });
  if (subs.length === 0) return;

  const results = await Promise.all(subs.map((s) => sendToDevice(s, payload, notificationId)));
  await prisma.notification.update({
    where: { notification_id: notificationId },
    data: { push_status: results.some(Boolean) ? "SENT" : "FAILED" },
  });
}

/** Fire and forget: the message request must not wait for the phone vendor. */
export function pushToUserInBackground(userId: string, notificationId: string, payload: PushPayload): void {
  void pushToUser(userId, notificationId, payload).catch((err) => console.error("Push error:", err));
}
