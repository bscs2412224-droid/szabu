import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { prisma } from "./db.js";
import { config, isAllowedOrigin } from "./config.js";
import { verifyJWT, JWTPayload } from "./utils/security.js";
import { isPlaced } from "./utils/userHelpers.js";

/**
 * Real-time delivery (Socket.IO).
 *
 * Every signed-in user joins a private room "user:<id>". The server pushes events to that room:
 *   message:new     { conversationId, message, participant }   a message was saved (to both people)
 *   message:status  { conversationId, messageIds, status }     a message I sent became DELIVERED or READ
 *
 * The socket uses the same session check as the REST API: a revoked session, a suspended account or an
 * account that is not placed in the hierarchy cannot connect.
 */

let io: Server | null = null;

const room = (userId: string) => `user:${userId}`;

export interface MessageStatusEvent {
  conversationId: string;
  messageIds: string[];
  status: "DELIVERED" | "READ";
}

export function initRealtime(server: HttpServer): void {
  io = new Server(server, {
    path: "/socket.io",
    cors: {
      origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || !token) return next(new Error("unauthorized"));

      const decoded = verifyJWT<JWTPayload>(token);
      if (decoded.scope !== "SESSION") return next(new Error("unauthorized"));

      const session = await prisma.session.findUnique({ where: { session_id: decoded.sid }, include: { user: true } });
      if (!session || session.user_id !== decoded.sub || session.revoked_at) return next(new Error("unauthorized"));
      if (Date.now() - session.last_active_at.getTime() > config.sessionInactivityMs) return next(new Error("unauthorized"));

      const user = session.user;
      if (user.status === "SUSPENDED" || !user.password_hash) return next(new Error("unauthorized"));
      if (user.role === "ADMIN" || !isPlaced(user)) return next(new Error("messaging not available"));

      socket.data.userId = user.user_id;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    void socket.join(room(userId));
    // The user just came online: everything waiting for them counts as delivered now
    void deliverPending(userId);
  });
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(room(userId)).emit(event, payload);
}

export async function isOnline(userId: string): Promise<boolean> {
  if (!io) return false;
  return (await io.in(room(userId)).fetchSockets()).length > 0;
}

/** Log out / password reset: close every open socket of this user. */
export function disconnectUser(userId: string): void {
  io?.in(room(userId)).disconnectSockets(true);
}

/** Mark messages waiting for `userId` as delivered and tell each sender. */
export async function deliverPending(userId: string): Promise<void> {
  const waiting = await prisma.messageStatus.findMany({
    where: { user_id: userId, delivered_at: null },
    select: { message_id: true, message: { select: { sender_id: true, conversation_id: true } } },
  });
  if (waiting.length === 0) return;

  await prisma.messageStatus.updateMany({
    where: { user_id: userId, delivered_at: null },
    data: { delivered_at: new Date() },
  });
  announceStatus(
    waiting.map((w) => ({
      messageId: w.message_id,
      senderId: w.message.sender_id,
      conversationId: w.message.conversation_id,
    })),
    "DELIVERED",
  );
}

/** Group by sender and conversation, then push one status event to each sender. */
export function announceStatus(
  items: { messageId: string; senderId: string; conversationId: string }[],
  status: MessageStatusEvent["status"],
): void {
  const groups = new Map<string, { senderId: string; conversationId: string; messageIds: string[] }>();
  for (const i of items) {
    const key = `${i.senderId}:${i.conversationId}`;
    const g = groups.get(key) ?? { senderId: i.senderId, conversationId: i.conversationId, messageIds: [] };
    g.messageIds.push(i.messageId);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    const event: MessageStatusEvent = { conversationId: g.conversationId, messageIds: g.messageIds, status };
    emitToUser(g.senderId, "message:status", event);
  }
}
