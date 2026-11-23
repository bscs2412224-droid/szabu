import { Router, Response } from "express";
import { prisma } from "../db.js";
import { messagingGuard, AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { getPublicKey } from "../services/pushService.js";

const router = Router();

const MAX_DEVICES_PER_USER = 10;

// Same people who may use messaging may register for message notifications
router.use(...messagingGuard);

/** GET /api/push/public-key : the app needs it to ask the browser for a push address */
router.get("/public-key", (_req: AuthenticatedRequest, res: Response): void => {
  const publicKey = getPublicKey();
  if (!publicKey) {
    res.status(503).json({ message: "Phone notifications are not set up on the server." });
    return;
  }
  res.status(200).json({ publicKey });
});

/** POST /api/push/subscribe  { subscription: { endpoint, keys: { p256dh, auth } } } : register this device */
router.post("/subscribe", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const sub = req.body?.subscription;
    const endpoint: unknown = sub?.endpoint;
    const p256dh: unknown = sub?.keys?.p256dh;
    const auth: unknown = sub?.keys?.auth;

    const valid =
      typeof endpoint === "string" &&
      endpoint.length <= 2048 &&
      typeof p256dh === "string" &&
      p256dh.length > 0 &&
      p256dh.length <= 200 &&
      typeof auth === "string" &&
      auth.length > 0 &&
      auth.length <= 100;
    if (!valid) {
      res.status(400).json({ message: "Invalid notification registration." });
      return;
    }

    // Browsers always hand out https addresses
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      res.status(400).json({ message: "Invalid notification registration." });
      return;
    }
    if (url.protocol !== "https:") {
      res.status(400).json({ message: "Invalid notification registration." });
      return;
    }

    const userAgent = String(req.headers["user-agent"] ?? "").slice(0, 300) || null;

    // A device belongs to whoever is signed in on it: re-registering moves it to the current user
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { user_id: req.user!.id, p256dh, auth, user_agent: userAgent },
      create: { user_id: req.user!.id, endpoint, p256dh, auth, user_agent: userAgent },
    });

    // Keep only the newest devices
    const all = await prisma.pushSubscription.findMany({
      where: { user_id: req.user!.id },
      orderBy: { created_at: "desc" },
      select: { subscription_id: true },
    });
    if (all.length > MAX_DEVICES_PER_USER) {
      await prisma.pushSubscription.deleteMany({
        where: { subscription_id: { in: all.slice(MAX_DEVICES_PER_USER).map((s) => s.subscription_id) } },
      });
    }

    res.status(201).json({ message: "Notifications turned on for this device." });
  } catch (error) {
    console.error("Push subscribe error:", error);
    res.status(500).json({ message: "Could not turn on notifications. Please try again." });
  }
});

/** POST /api/push/unsubscribe  { endpoint } : stop notifications on this device */
router.post("/unsubscribe", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
    if (endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint, user_id: req.user!.id } });
    }
    res.status(200).json({ message: "Notifications turned off for this device." });
  } catch (error) {
    console.error("Push unsubscribe error:", error);
    res.status(500).json({ message: "Could not turn off notifications. Please try again." });
  }
});

export default router;
